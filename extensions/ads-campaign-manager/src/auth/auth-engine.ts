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


import { performPlaywrightLogin, performRequestBasedLogin } from "./playwright-worker.js";
export interface MetaAuthPayload {
  business_id: string;
  fb_email: string;
  fb_password_enc: string;
  fb_2fa_secret_enc?: string;
  proxy_url?: string;
  device_fingerprint?: any;
}

export interface TokenResult {
  token: string;
  expiresAt: number;
}

export function isMobileInternalToken(token: string): boolean {
  return token.startsWith("EAAG") || token.startsWith("EAAB") || token.startsWith("EAAW");
}

export function decodeFbHtmlToken(token: string): string {
  // Previously we replaced ZD, ZB, ZC, ZA but this fundamentally corrupts
  // naturally occurring base62 token fragments from Graph API Explorer.
  // We MUST return the token as-is to Graph API.
  return token;
}

export async function validateTokenBasic(token: string): Promise<{
  valid: boolean;
  userId?: string;
  userName?: string;
  error?: string;
  errorCode?: number;
}> {
  const version = process.env.META_GRAPH_VERSION || "v19.0";
  try {
    const url = `https://graph.facebook.com/${version}/me?fields=id,name&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const json: any = await res.json();
    if (json.id) {
      logger.info(`[TOKEN] Validation OK: id=${json.id} name=${json.name}`);
      return { valid: true, userId: json.id, userName: json.name };
    }
    const errMsg = json.error?.message || "Unknown error";
    const errCode = json.error?.code || 0;
    logger.warn(`[TOKEN] Validation FAILED: ${errMsg} (code=${errCode})`);
    return { valid: false, error: errMsg, errorCode: errCode };
  } catch (e: any) {
    logger.error(`[TOKEN] Validation network error: ${e.message}`);
    return { valid: false, error: e.message };
  }
}

// ─── Fingerprint Pool (unchanged) ───────────────────────────────────────────
const FINGERPRINT_POOL = [
  {
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    viewport: { width: 1920, height: 1080 },
    locale: "vi-VN",
    timezone: "Asia/Ho_Chi_Minh",
    platform: "Win32",
    colorScheme: "light" as const,
    deviceScaleFactor: 1,
  },
  {
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    viewport: { width: 1366, height: 768 },
    locale: "vi-VN",
    timezone: "Asia/Ho_Chi_Minh",
    platform: "Win32",
    colorScheme: "light" as const,
    deviceScaleFactor: 1,
  },
  {
    userAgent: "Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
    timezone: "Asia/Ho_Chi_Minh",
    platform: "Win32",
    colorScheme: "dark" as const,
    deviceScaleFactor: 1,
  },
  {
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    viewport: { width: 1512, height: 982 },
    locale: "vi-VN",
    timezone: "Asia/Ho_Chi_Minh",
    platform: "MacIntel",
    colorScheme: "light" as const,
    deviceScaleFactor: 2,
  },
  {
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
    viewport: { width: 1280, height: 800 },
    locale: "vi-VN",
    timezone: "Asia/Ho_Chi_Minh",
    platform: "MacIntel",
    colorScheme: "light" as const,
    deviceScaleFactor: 2,
  },
  {
    userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.105 Mobile Safari/537.36",
    viewport: { width: 390, height: 844 },
    locale: "vi-VN",
    timezone: "Asia/Ho_Chi_Minh",
    platform: "Linux armv8l",
    colorScheme: "light" as const,
    deviceScaleFactor: 3,
  },
];

export function pickFingerprint(existing?: any) {
  if (existing) return existing;
  return FINGERPRINT_POOL[Math.floor(Math.random() * FINGERPRINT_POOL.length)];
}

export function humanDelay(minMs = 800, maxMs = 2500): Promise<void> {
  const delay = Math.floor(Math.random() * (maxMs - minMs)) + minMs;
  return new Promise((r) => setTimeout(r, delay));
}

export async function humanType(page: any, selector: string, text: string): Promise<void> {
  await page.waitForSelector(selector, { state: "visible", timeout: 15000 });
  await page.click(selector);
  await humanDelay(300, 800);
  for (const char of text) {
    await page.keyboard.type(char, { delay: Math.floor(Math.random() * 130) + 40 });
  }
}

// ─── 2FA Code Retrieval (unchanged) ─────────────────────────────────────────
export async function get2FACode(secretEnc: string): Promise<string> {
  const secret = decrypt(secretEnc);
  try {
    const authenticator = (otplibModule as any).authenticator ?? (otplibModule as any).totp;
    if (authenticator) {
      const code = authenticator.generate(secret);
      logger.info("[2FA] Code generated via otplib (local).");
      return code;
    }
  } catch (e: any) {
    logger.warn(`[2FA] otplib failed: ${e.message}`);
  }
  try {
    const res = await fetch(`https://2faotp.live/${secret}`, { signal: AbortSignal.timeout(5000) });
    const json: any = await res.json();
    if (json.success && json.code) {
      logger.info("[2FA] Code from 2faotp.live fallback.");
      return json.code;
    }
  } catch (e: any) {
    logger.warn(`[2FA] 2faotp.live failed: ${e.message}`);
  }
  try {
    const res = await fetch(`https://www.authenticatorapi.com/Validate.aspx?SecretCode=${secret}&Pin=NONE`, { signal: AbortSignal.timeout(5000) });
    const text = await res.text();
    const match = text.match(/\d{6}/);
    if (match) {
      logger.info("[2FA] Code from authenticatorapi.com fallback.");
      return match[0];
    }
  } catch (e: any) {
    logger.warn(`[2FA] authenticatorapi.com failed: ${e.message}`);
  }
  throw new Error("[2FA] All methods failed. Cannot generate 2FA code.");
}

// ─── Token Exchange (upgraded for Multi-tenant) ─────────────────────────────
export async function exchangeToLongLived(config: AdsManagerPluginConfig, shortToken: string, businessId?: string): Promise<TokenResult> {
  // ĐÓNG LUẬT TRÁNH LỖI CACHE:
  // Tất cả token chạy qua cổng oauth để gia hạn thật thụ từ máy chủ Meta.
  const appId = config.meta.appId || process.env.META_APP_ID;
  const appSecret = config.meta.appSecret || process.env.META_APP_SECRET;
  const version = config.meta.graphVersion || process.env.META_GRAPH_VERSION || "v19.0";
  
  if (!appId || !appSecret) {
    logger.warn("[RENEW] META_APP_ID or META_APP_SECRET missing (DB & Env) – using token as-is.");
    return { token: shortToken, expiresAt: Date.now() + 2 * 60 * 60 * 1000 };
  }
  const url = `https://graph.facebook.com/${version}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortToken}`;
  logger.info("[RENEW] Exchanging token via Graph API.", { businessId, tokenPreview: shortToken.substring(0, 12) });
  const res = await fetch(url);
  const json: any = await res.json();
  if (json.access_token) {
    const expiresAt = Date.now() + ((json.expires_in ?? 5184000) * 1000);
    logger.info(`[RENEW SUCCESS] Token valid for ${json.expires_in}s (~${Math.round((json.expires_in ?? 0) / 86400)}d).`, { businessId });
    return { token: json.access_token, expiresAt };
  }
  if (json.error?.message?.includes("does not belong to application")) {
    logger.warn(`[RENEW IGNORED] App mismatch detected. Keeping original token.`, { businessId });
    return { token: shortToken, expiresAt: Date.now() + 3600000 };
  }
  logger.error(`[RENEW FAILED] ${json.error?.message}`, { businessId });
  return { token: shortToken, expiresAt: Date.now() + 2 * 60 * 60 * 1000 };
}

async function exchangeForLongLivedToken(config: AdsManagerPluginConfig, shortToken: string, appId: string, appSecret: string, proxyUrl?: string): Promise<string | null> {
  const version = config.meta.graphVersion || process.env.META_GRAPH_VERSION || "v19.0";
  const url = `https://graph.facebook.com/${version}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortToken}`;
  const axiosOptions: any = { timeout: 15000 };
  if (proxyUrl) axiosOptions.httpsAgent = new HttpsProxyAgent(proxyUrl);
  try {
    const res = await axios.get(url, axiosOptions);
    if (res.data?.access_token) return res.data.access_token;
  } catch (e: any) {
    logger.warn(`[RENEW] Graph API exchange failed: ${e.message}`);
  }
  return null;
}

// ─── NEW: Fetch pages using cookies (no token extraction) ───────────────────
export async function fetchPagesWithCookies(
  cookies: any[],
  proxyUrl?: string,
  pageId?: string
): Promise<{ pages: any[]; accessToken?: string }> {
  const version = process.env.META_GRAPH_VERSION || "v19.0";
  const cookieString = cookies.map(c => `${c.name}=${c.value}`).join("; ");
  const headers: any = {
    "Cookie": cookieString,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
  };
  const axiosOptions: any = { headers, timeout: 20000 };
  if (proxyUrl) axiosOptions.httpsAgent = new HttpsProxyAgent(proxyUrl);

  try {
    // Try /me/accounts with cookies
    const url = `https://graph.facebook.com/${version}/me/accounts?fields=id,name,category,access_token,perms&limit=100`;
    const resp = await axios.get(url, axiosOptions);
    if (resp.data?.data?.length) {
      logger.info(`[DISCOVERY] Found ${resp.data.data.length} pages via cookies`);
      // Also try to get a user token from the response (maybe not needed)
      return { pages: resp.data.data, accessToken: undefined };
    }
  } catch (e: any) {
    logger.debug(`[DISCOVERY] Cookie-based /me/accounts failed: ${e.message}`);
  }

  // Fallback: try to get user token from the cookies by calling /me
  try {
    const meUrl = `https://graph.facebook.com/${version}/me?fields=id,name`;
    const meResp = await axios.get(meUrl, axiosOptions);
    if (meResp.data?.id) {
      // If we got user info, we can try to get pages using the user token embedded in the cookies?
      // Actually, cookies may contain the access token in the 'act' cookie or similar.
      // For now, we just return empty.
      logger.info(`[DISCOVERY] Cookie-based /me succeeded: ${meResp.data.name}`);
    }
  } catch (e: any) {
    logger.debug(`[DISCOVERY] Cookie-based /me failed: ${e.message}`);
  }

  return { pages: [] };
}

// ─── Core: Safe Auto Login or Renew (unchanged except removing extractToken) ─
export async function safeAutoLoginOrRenew(
  config: AdsManagerPluginConfig,
  payload: MetaAuthPayload,
  onStatusUpdate?: (message: string) => void
): Promise<TokenResult> {
  return globalWorkerPool.addTask({
    id: `auth-${payload.business_id}`,
    type: "auth",
    priority: 10,
    execute: async () => {
      logger.info(`[AUTH] safeAutoLoginOrRenew for ${payload.business_id}`);
      try {
        const existing = await getUserMetaAuth(config, payload.business_id);
        if (existing) {
          if (!payload.proxy_url) payload.proxy_url = existing.proxy_url;
          if (!payload.device_fingerprint && existing.device_fingerprint) {
            payload.device_fingerprint = JSON.parse(existing.device_fingerprint);
          }
        }
        const tenDays = 10 * 24 * 60 * 60 * 1000;

        // Tier 1: Token healthy (>10d)
        if (existing?.access_token && existing.token_expires_at > Date.now() + tenDays) {
          logger.info("[AUTH] Tier 1: Token healthy, validating...", { businessId: payload.business_id });
          const renewed = await exchangeToLongLived(config, existing.access_token, payload.business_id);
          await saveUserMetaAuth(config, payload.business_id, {
            email: payload.fb_email,
            passwordEnc: payload.fb_password_enc,
            otpSecretEnc: payload.fb_2fa_secret_enc,
            accessToken: renewed.token,
            expiresAt: renewed.expiresAt,
            cookies: existing.cookies ? JSON.parse(existing.cookies) : undefined,
            deviceFingerprint: existing.device_fingerprint ? JSON.parse(existing.device_fingerprint) : undefined,
            proxyUrl: payload.proxy_url
          });
          await incrementMetaSuccess(config, payload.business_id);
          onStatusUpdate?.(`✅ Token còn hiệu lực đến ${new Date(renewed.expiresAt).toLocaleDateString("vi-VN")}`);
          return renewed;
        }

        // Tier 1.5: Fast request-based (using cookies)
        if (existing?.cookies) {
          try {
            logger.info("[AUTH] Tier 1.5: Attempting fast request-based token extraction.", { businessId: payload.business_id });
            const result = await performRequestBasedLogin(config, payload, JSON.parse(existing.cookies));
            if (result) {
              await incrementMetaSuccess(config, payload.business_id);
              onStatusUpdate?.(`✅ Trích xuất Token siêu tốc thành công (Tier 1.5).`);
              return result;
            }
          } catch (e: any) {
            logger.debug(`[AUTH] Tier 1.5 failed: ${e.message}`);
          }
        }

        // Tier 2: Silent cookie login (Playwright)
        if (existing?.cookies) {
          try {
            logger.info("[AUTH] Tier 2: Attempting silent cookie login.", { businessId: payload.business_id });
            const result = await performPlaywrightLogin(config, payload, JSON.parse(existing.cookies));
            await incrementMetaSuccess(config, payload.business_id);
            onStatusUpdate?.(`✅ Đăng nhập bằng Cookie thành công cho Business **${payload.business_id}** (Tier 2).`);
            return result;
          } catch (e: any) {
            logger.warn(`[AUTH] Tier 2 failed (${e.message}). Escalating to Tier 3.`);
          }
        }

        // Tier 3: Full login with email/password
        logger.info("[AUTH] Tier 3: Full Playwright login with randomized fingerprint.", { businessId: payload.business_id });
        const result = await performPlaywrightLogin(config, payload);
        await incrementMetaSuccess(config, payload.business_id);
        onStatusUpdate?.(`🚀 Đăng nhập toàn phần thành công cho Business **${payload.business_id}** (Tier 3 - Playwright).`);
        return result;

      } catch (err: any) {
        logger.error(`[CRITICAL] ${payload.business_id}: ${err.message}`, { stack: err.stack, phase: "safeAutoLoginOrRenew" });
        await recordMetaFailure(config, payload.business_id, err.message);
        onStatusUpdate?.(`❌ Lỗi đăng nhập Business **${payload.business_id}**: ${err.message}`);
        throw err;
      }
    }
  });
}


// ─── fetchUserPages (Graph API fallback) – unchanged but kept for compatibility ─
export async function fetchUserPages(rawToken: string, proxyUrl?: string): Promise<any[]> {
  const token = decodeFbHtmlToken(rawToken);
  const version = process.env.META_GRAPH_VERSION || "v19.0";
  const isIOS = token.startsWith("EAAB");
  const isAndroid = token.startsWith("EAAG");
  const headers: any = { "Accept": "*/*", "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8" };
  if (isIOS) {
    headers["User-Agent"] = "FBAN/FBIOS;FBAV/440.0.0.0.0;FBBV/531000000;FBLC/vi_VN;FBMF/iPhone;FBBD/apple;FBPN/com.facebook.Messenger;FBDV/iPhone13,2;FBSV/15.0;FBOP/1;FBCA/arm64-v8a:";
    headers["X-FB-App-Id"] = "124024574287";
  } else if (isAndroid) {
    headers["User-Agent"] = "FBAN/FB4A;FBAV/440.0.0.0.0;FBBV/531000000;FBLC/vi_VN;FBMF/Google;FBBD/google;FBPN/com.facebook.katana;FBDV/Pixel 5;FBSV/13;FBOP/1;FBCA/arm64-v8a:";
    headers["X-FB-App-Id"] = "350685531728";
  } else {
    headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
  }
  const options: any = { timeout: 20000, headers };
  if (proxyUrl) options.httpsAgent = new HttpsProxyAgent(proxyUrl);

  try {
    const url = `https://graph.facebook.com/${version}/me?fields=accounts{name,category,access_token,perms,tasks}&access_token=${token}`;
    const resp = await axios.get(url, options);
    if (resp.data?.accounts?.data?.length > 0) return resp.data.accounts.data;
  } catch (e: any) { logger.debug(`fetchUserPages Layer 1 failed: ${e.message}`); }
  try {
    const url = `https://graph.facebook.com/${version}/me/accounts?fields=name,category,access_token&access_token=${token}`;
    const resp = await axios.get(url, options);
    if (resp.data?.data?.length > 0) return resp.data.data;
  } catch (e: any) { logger.debug(`fetchUserPages Layer 2 failed: ${e.message}`); }
  try {
    const url = `https://graph.facebook.com/${version}/me/accounts?fields=id,name&access_token=${token}`;
    const resp = await axios.get(url, options);
    if (resp.data?.data?.length > 0) return resp.data.data;
  } catch (e: any) { logger.debug(`fetchUserPages Layer 3 failed: ${e.message}`); }
  try {
    const url = `https://graph.facebook.com/${version}/me/accounts?fields=id,name,access_token&access_token=${token}`;
    const plainOptions: any = { timeout: 20000 };
    if (proxyUrl) plainOptions.httpsAgent = new HttpsProxyAgent(proxyUrl);
    const resp = await axios.get(url, plainOptions);
    if (resp.data?.data?.length > 0) return resp.data.data;
  } catch (e: any) { logger.debug(`fetchUserPages Layer 4 failed: ${e.message}`); }
  return [];
}
