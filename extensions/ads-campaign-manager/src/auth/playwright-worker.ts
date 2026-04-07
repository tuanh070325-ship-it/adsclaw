// extensions/ads-campaign-manager/src/meta-login.ts
// FIXED: No token extraction from HTML, use cookies directly to fetch pages via Graph API

import { chromium } from "playwright-extra";
// @ts-ignore
import stealthPlugin from "puppeteer-extra-plugin-stealth";
import * as otplibModule from "otplib";
import os from "node:os";
import path from "node:path";
import { decrypt } from "../core/crypto-utils.js";
import axios from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";
import logger from "../core/logger.js";
import type { AdsManagerPluginConfig } from "../core/types.js";
import { saveUserMetaAuth, getUserMetaAuth, incrementMetaSuccess, recordMetaFailure, saveUserFacebookPages } from "../core/db-state.js";
import { globalWorkerPool } from "../services/worker-pool.js";

chromium.use(stealthPlugin());


import { exchangeToLongLived, get2FACode, pickFingerprint, humanDelay, humanType, fetchPagesWithCookies, type MetaAuthPayload, type TokenResult } from "./auth-engine.js";
// ─── Playwright Login (modified: no token extraction, use cookies to get pages) ─
export async function performPlaywrightLogin(
  config: AdsManagerPluginConfig,
  payload: MetaAuthPayload,
  savedCookies?: any[]
): Promise<TokenResult> {
  const fp = pickFingerprint(payload.device_fingerprint);
  logger.info(`[BROWSER] Using fingerprint: ${fp.platform} | ${fp.viewport.width}x${fp.viewport.height}`);

  const launchOptions: any = {
    headless: true,
    args: [
      "--no-sandbox", "--disable-setuid-sandbox", "--disable-blink-features=AutomationControlled",
      "--disable-infobars", "--disable-dev-shm-usage", "--no-first-run", "--no-zygote",
      `--lang=${fp.locale}`,
    ],
  };
  if (payload.proxy_url) launchOptions.proxy = { server: payload.proxy_url };

  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({
    userAgent: fp.userAgent,
    viewport: fp.viewport,
    locale: fp.locale,
    timezoneId: fp.timezone,
    colorScheme: fp.colorScheme,
    deviceScaleFactor: fp.deviceScaleFactor,
    geolocation: { latitude: 10.762622 + (Math.random() * 0.02 - 0.01), longitude: 106.660172 + (Math.random() * 0.02 - 0.01) },
    permissions: ["geolocation"],
  });

  const page = await context.newPage();
  await page.addInitScript((platform: string) => {
    Object.defineProperty(navigator, "platform", { get: () => platform });
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    // @ts-ignore
    Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
  }, fp.platform);
  await page.mouse.move(Math.random() * fp.viewport.width * 0.8, Math.random() * fp.viewport.height * 0.8);

  try {
    // Try cookie login first
    if (savedCookies?.length) {
      await context.addCookies(savedCookies);
      await page.goto("https://www.facebook.com/adsmanager/manage/campaigns", { waitUntil: "load", timeout: 90000 });
      await humanDelay(3000, 5000);
      if (!page.url().includes("login") && !page.url().includes("checkpoint")) {
        // Get cookies from context
        const cookies = await context.cookies();
        // Fetch pages using cookies
        const { pages } = await fetchPagesWithCookies(cookies, payload.proxy_url);
        // If pages found, treat as success
        if (pages.length > 0) {
          // Generate a dummy token result (since we don't have a real token, but we have pages)
          const dummyToken = "cookie_auth_success";
          const expiresAt = Date.now() + 60 * 24 * 60 * 60 * 1000;
          await finalizeLogin(config, payload, dummyToken, fp, context, page, pages);
          return { token: dummyToken, expiresAt };
        }
      }
    }

    // Full login via m.facebook.com
    await page.goto("https://m.facebook.com/login", { waitUntil: "domcontentloaded", timeout: 45000 });
    await humanDelay(2500, 4500);
    await dismissConsentBanner(page);

    await page.waitForSelector('input[name="email"]', { timeout: 20000 });
    await humanType(page, 'input[name="email"]', payload.fb_email);
    await humanDelay(800, 1600);
    await humanType(page, 'input[name="pass"]', decrypt(payload.fb_password_enc));
    await humanDelay(1200, 2200);
    logger.info("[AUTH] Submitting login form with reliable method...");
    await submitLoginForm(page);
    await humanDelay(3500, 6000);

    // Checkpoint handling
    if (page.url().includes("checkpoint") || page.url().includes("two_step")) {
      logger.info("[AUTH] Security checkpoint detected. Analyzing screen...");
      const isCaptcha = await page.locator('iframe[src*="recaptcha"]').isVisible({ timeout: 5000 }).catch(() => false) ||
                        await page.locator('text="I\'m not a robot"').isVisible({ timeout: 1000 }).catch(() => false);
      if (isCaptcha) {
        const screenshotPath = path.join(os.tmpdir(), `meta-captcha-${Date.now()}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        throw new Error(`Facebook chặn đăng nhập bằng reCAPTCHA. Vui lòng đăng nhập thủ công 1 lần để xác minh IP. (Screenshot: ${screenshotPath})`);
      }
      const is2FA = await page.locator('input[name="approvals_code"], input#approvals_code').isVisible({ timeout: 3000 }).catch(() => false);
      if (is2FA) {
        logger.info("[AUTH] 2FA checkpoint confirmed.");
        if (!payload.fb_2fa_secret_enc) throw new Error("2FA required but no secret provided.");
        const code = await get2FACode(payload.fb_2fa_secret_enc);
        await page.locator('input[name="approvals_code"], input#approvals_code').fill(code);
        await humanDelay(800, 1500);
        await page.locator('button[type="submit"]').click();
        await humanDelay(2500, 4500);
        const trustSelector = 'button:has-text("Trust this device"), button:has-text("Lưu thiết bị"), button:has-text("Tin cậy"), [role="button"]:has-text("Trust")';
        const trustBtn = page.locator(trustSelector).first();
        if (await trustBtn.isVisible({ timeout: 8000 })) {
          await trustBtn.click();
          await humanDelay(2000, 4000);
        }
      } else {
        const screenshotPath = path.join(os.tmpdir(), `meta-unknown-checkpoint-${Date.now()}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        throw new Error(`Facebook yêu cầu xác minh bảo mật (Checkpoint). Kiểm tra tài khoản trên điện thoại/máy tính. (Screenshot: ${screenshotPath})`);
      }
    }

    // Navigate to Ads Manager to get cookies
    logger.info("[AUTH] Navigating to Ads Manager to capture cookies...");
    await page.goto("https://www.facebook.com/adsmanager/manage/campaigns", {
      waitUntil: "load",
      timeout: 90000,
    });
    await humanDelay(3000, 5000);

    // Get cookies from browser context
    const cookies = await context.cookies();
    // Fetch pages using cookies
    const { pages } = await fetchPagesWithCookies(cookies, payload.proxy_url);

    // Generate a dummy token (we don't have a real token, but we have pages)
    const dummyToken = "cookie_auth_success";
    const expiresAt = Date.now() + 60 * 24 * 60 * 60 * 1000;

    await finalizeLogin(config, payload, dummyToken, fp, context, page, pages);
    return { token: dummyToken, expiresAt };

  } catch (err: any) {
    const errorScreenshot = path.join(os.tmpdir(), `auth-error-${payload.business_id.substring(0, 16)}-${Date.now()}.png`);
    await page.screenshot({ path: errorScreenshot, fullPage: true }).catch(() => {});
    logger.error(`[AUTH] Screenshot saved: ${errorScreenshot}`);
    err.message += ` (Screenshot: ${errorScreenshot})`;
    throw err;
  } finally {
    await browser.close();
  }
}

// ── Helper functions (unchanged) ───────────────────────────────────────────
async function dismissConsentBanner(page: any) {
  const consentSelectors = [
    'button:has-text("Allow all cookies")', 'button:has-text("Accept All")',
    'button:has-text("Tiếp tục")', 'button:has-text("Cho phép tất cả cookie")',
    'button:has-text("Chấp nhận tất cả")', '[data-cookiebanner="accept_button"]'
  ];
  for (const sel of consentSelectors) {
    const btn = page.locator(sel).first();
    if (await btn.isVisible({ timeout: 5000 }).catch(() => false)) {
      logger.info(`[AUTH] Dismissed consent: ${sel}`);
      await btn.click();
      await humanDelay(1000, 2000);
      return;
    }
  }
}

async function submitLoginForm(page: any) {
  try {
    await page.locator('input[name="pass"]').press('Enter');
    await humanDelay(2000, 4000);
    return;
  } catch {}
  const loginBtn = page.locator('button[type="submit"], button[name="login"], [role="button"]:has-text("Đăng nhập"), [role="button"]:has-text("Log In")').first();
  if (await loginBtn.isVisible({ timeout: 15000 })) {
    await loginBtn.click({ position: { x: 30 + Math.random() * 40, y: 15 + Math.random() * 10 } });
  } else {
    await page.keyboard.press('Enter');
  }
}

async function finalizeLogin(
  config: AdsManagerPluginConfig,
  payload: MetaAuthPayload,
  token: string,
  fp: any,
  context: any,
  page: any,
  pages: any[]
) {
  const cookies = await context.cookies();
  // Perform hybrid token renew (but token may be dummy, so we just save)
  // We'll keep the token as is (dummy)
  await saveUserMetaAuth(config, payload.business_id, {
    email: payload.fb_email,
    passwordEnc: payload.fb_password_enc,
    otpSecretEnc: payload.fb_2fa_secret_enc,
    accessToken: token,
    expiresAt: Date.now() + 60 * 24 * 60 * 60 * 1000,
    cookies,
    deviceFingerprint: fp,
    proxyUrl: payload.proxy_url
  });
  if (pages.length > 0) {
    await saveUserFacebookPages(config, payload.business_id, payload.fb_email, pages);
    logger.info(`[AUTH] Saved ${pages.length} pages to DB.`);
  }
  logger.info(`[AUTH] Login SUCCESS - Using cookie-based session.`);
}

// ─── Tier 1.5: Fast Request-Based Token Extraction (unchanged) ─────────────
export async function performRequestBasedLogin(
  config: AdsManagerPluginConfig,
  payload: MetaAuthPayload,
  cookies: any[]
): Promise<TokenResult | null> {
  const fp = pickFingerprint(payload.device_fingerprint);
  const cookieString = cookies.map(c => `${c.name}=${c.value}`).join("; ");
  const headers: any = {
    "User-Agent": fp.userAgent,
    "Cookie": cookieString,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Upgrade-Insecure-Requests": "1"
  };
  const axiosOptions: any = { headers, timeout: 30000, validateStatus: () => true };
  if (payload.proxy_url) axiosOptions.httpsAgent = new HttpsProxyAgent(payload.proxy_url);
  try {
    const res = await axios.get("https://www.facebook.com/adsmanager/manage/campaigns", axiosOptions);
    const html = res.data;
    const eaagMatch = html.match(/EAAG[a-zA-Z0-9_-]{20,}/);
    if (eaagMatch) {
      return await exchangeToLongLived(config, eaagMatch[0], payload.business_id);
    }
    const eaabMatch = html.match(/EAAB[a-zA-Z0-9_-]{20,}/);
    if (eaabMatch) {
      return await exchangeToLongLived(config, eaabMatch[0], payload.business_id);
    }
  } catch (err: any) {
    logger.debug(`[TIER 1.5] Request failed: ${err.message}`);
  }
  return null;
}

