/**
 * meta-profile-ops.ts — FIXED v2.0
 *
 * FIXES:
 * 1. headless: true — server environment không có display
 * 2. Thêm timeout tốt hơn, tránh crash khi không có browser UI
 * 3. Thêm "API-first" fallback cho profile posting (dùng personal token)
 * 4. Cải thiện error messages
 */

import { chromium } from "playwright-extra";
// @ts-ignore
import stealthPlugin from "puppeteer-extra-plugin-stealth";
import logger from "../core/logger.js";
import { getUserMetaAuth, getRecentPersonalPostsCount, getLastPersonalPostTime, recordPersonalPost } from "../core/db-state.js";
import type { AdsManagerPluginConfig } from "../core/types.js";
import os from "node:os";
import path from "node:path";

// @ts-ignore
chromium.use(stealthPlugin());

// ─── Attempt 1: Graph API personal feed (nếu token có quyền) ─────────────────

async function tryApiPersonalPost(
  userToken: string,
  message: string,
  apiVersion = "v19.0"
): Promise<{ success: boolean; postId?: string; error?: string }> {
  try {
    const url = `https://graph.facebook.com/${apiVersion}/me/feed`;
    const body = new URLSearchParams({ message, access_token: userToken });
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Bearer ${userToken}`,
        "User-Agent": "FBAN/FB4A;FBAV/440.0.0.0.0;FBLC/vi_VN;FBPN/com.facebook.katana;",
      },
      body: body.toString(),
    });
    const data = await res.json() as any;
    if (data?.id) {
      return { success: true, postId: data.id };
    }
    const errMsg = data?.error?.message || "API returned no post ID";
    const errCode = data?.error?.code || res.status;
    return { success: false, error: `[${errCode}] ${errMsg}` };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ─── Attempt 2: Playwright browser automation ─────────────────────────────────

export async function createProfilePost(
  config: AdsManagerPluginConfig,
  businessId: string,
  message: string,
  photoPath?: string
): Promise<{ success: boolean; url?: string; error?: string; method?: string }> {
  logger.info(`[PROFILE-OPS] Starting post for ${businessId}: "${message.slice(0, 50)}..."`);

  const auth = await getUserMetaAuth(config, businessId);
  const apiVersion = process.env.META_GRAPH_VERSION || "v19.0";

  // ── Attempt 1: API call (nhanh nhất, không cần browser) ───────────────────
  if (auth?.access_token) {
    logger.info(`[PROFILE-OPS] Trying API method first...`);
    const apiResult = await tryApiPersonalPost(auth.access_token, message, apiVersion);
    if (apiResult.success) {
      logger.info(`[PROFILE-OPS] ✅ API method succeeded: postId=${apiResult.postId}`);
      return {
        success: true,
        url: `https://www.facebook.com/${apiResult.postId}`,
        method: "graph_api",
      };
    }
    logger.warn(`[PROFILE-OPS] API method failed: ${apiResult.error}. Falling back to Playwright...`);
  }

  // ── Phase 1: Safety Check (Rate Limits) ───────────────────────────────────
  const postsToday = await getRecentPersonalPostsCount(config, businessId, 24);
  if (postsToday >= 3) {
    return { success: false, error: "🛡️ Dừng lại Sếp ơi! Hôm nay Sếp đã đăng 3 bài rồi. Đăng nhiều quá dễ bị Facebook sờ gáy (Rate Limit)." };
  }

  const lastPostTime = await getLastPersonalPostTime(config, businessId);
  if (lastPostTime) {
    const diffHours = (Date.now() - lastPostTime.getTime()) / (1000 * 60 * 60);
    if (diffHours < 2) {
      const remainMin = Math.round((2 - diffHours) * 60);
      return { success: false, error: `🛡️ Sếp mới mới đăng bài cách đây ít lâu. Hãy đợi thêm khoảng ${remainMin} phút nữa cho an toàn nhé.` };
    }
  }

  if (!auth || !auth.cookies) {
    return {
      success: false,
      error: [
        "Token không có quyền đăng lên Profile cá nhân và chưa có Cookie.",
        "",
        "Để đăng lên Profile cá nhân, Sếp cần 1 trong 2 cách:",
        "1. Đảm bảo Token có quyền `publish_actions` (thường bị Meta tắt cho apps mới)",
        "2. Sử dụng tài khoản Fanpage để đăng bài — dùng `/dang_bai` thay thế.",
        "",
        "Lưu ý: Đăng lên FANPAGE không cần Cookie.",
      ].join("\n"),
    };
  }

  let cookies: any[] = [];
  try {
    cookies = typeof auth.cookies === "string" ? JSON.parse(auth.cookies) : auth.cookies;
  } catch (e) {
    return { success: false, error: "Cookie không hợp lệ. Sếp kiểm tra lại thông tin đăng nhập nhé." };
  }

  const proxyUrl = auth.proxy_url;
  const fp = typeof auth.device_fingerprint === "string"
    ? JSON.parse(auth.device_fingerprint)
    : (auth.device_fingerprint || {
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        viewport: { width: 1920, height: 1080 },
        locale: "vi-VN",
        timezone: "Asia/Ho_Chi_Minh",
      });

  const launchOptions: any = {
    headless: false,  // ÉP BUỘC CHẾ ĐỘ CÓ CỬA SỔ THEO YÊU CẦU CỦA SẾP
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-infobars",
    ],
  };

  if (proxyUrl) {
    launchOptions.proxy = { server: proxyUrl };
  }

  const browser = await chromium.launch(launchOptions);

  try {
    const context = await browser.newContext({
      userAgent: fp.userAgent,
      viewport: { width: 1366, height: 768 }, // Chuẩn hóa viewport phổ biến
      locale: fp.locale || "vi-VN",
      timezoneId: fp.timezone || "Asia/Ho_Chi_Minh",
    });

    await context.addCookies(cookies);
    const page = await context.newPage();

    logger.info(`[PROFILE-OPS] Navigating to m.facebook.com...`);
    await page.goto("https://m.facebook.com/", {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });

    await page.waitForTimeout(Math.random() * 3000 + 2000);

    // GIẢ LẬP CON NGƯỜI: Cuộn trang tự nhiên trước khi bắt đầu
    logger.info(`[PROFILE-OPS] Natural scrolling...`);
    await page.evaluate(() => window.scrollBy(0, 400));
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.scrollBy(0, -200));
    await page.waitForTimeout(2000);

    // Kiểm tra đăng nhập
    const currentUrl = page.url();
    if (currentUrl.includes("login") || currentUrl.includes("checkpoint")) {
      const screenshotPath = path.join(os.tmpdir(), `profile_error_${Date.now()}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});
      throw new Error(
        `Cookie đã hết hạn hoặc IP bị block. Facebook yêu cầu đăng nhập lại.\n` +
        `Sếp vui lòng kiểm tra lại quyền truy cập hoặc dùng Token Fanpage nhé!`
      );
    }

    // Click vào ô "Bạn đang nghĩ gì?"
    const possibleTriggers = [
      'div[role="button"]:has-text("Bạn đang nghĩ gì")',
      'div[role="button"]:has-text("What\'s on your mind")',
      'div[placeholder*="nghĩ gì"]',
      '#u_0_0_mn',
    ];

    let clicked = false;
    for (const selector of possibleTriggers) {
      const el = page.locator(selector).first();
      if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
        await el.click();
        await page.waitForTimeout(2000);
        clicked = true;
        break;
      }
    }

    if (!clicked) {
      // Thử compose box trực tiếp
      await page.goto("https://m.facebook.com/composer/", {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await page.waitForTimeout(2000);
    }

    // Tìm editor và nhập nội dung
    const editorSelectors = [
      'div[contenteditable="true"][role="textbox"]',
      'textarea[name="xc_message"]',
      'div[data-testid="status-attachment-mentions-input"]',
      'div[role="textbox"]',
    ];

    let typed = false;
    for (const sel of editorSelectors) {
      const editor = page.locator(sel).first();
      if (await editor.isVisible({ timeout: 3000 }).catch(() => false)) {
        await editor.click();
        await page.waitForTimeout(Math.random() * 2000 + 1000);
        
        // GIẢ LẬP NGƯỜI THẬT: Gõ phím có độ trễ
        logger.info(`[PROFILE-OPS] Typing message with human speed...`);
        for (const char of message) {
          await page.keyboard.type(char, { delay: Math.random() * 120 + 80 });
        }
        
        await page.waitForTimeout(2000);
        typed = true;
        break;
      }
    }

    if (!typed) {
      throw new Error("Không tìm được ô soạn thảo bài viết. Facebook có thể đã thay đổi giao diện.");
    }

    // Bấm nút Đăng
    const postBtnSelectors = [
      'div[aria-label="Đăng"]',
      'div[aria-label="Post"]',
      'button[type="submit"]:has-text("Đăng")',
      'button:has-text("Post")',
    ];

    let posted = false;
    for (const btnSel of postBtnSelectors) {
      const btn = page.locator(btnSel).first();
      if (await btn.isEnabled({ timeout: 3000 }).catch(() => false)) {
        // GIẢ LẬP: Nghỉ một chút trước khi ấn đăng (Coi như đang check lại bài)
        const delay = Math.random() * 5000 + 3000;
        logger.info(`[PROFILE-OPS] Pausing for ${Math.round(delay/1000)}s before final click...`);
        await page.waitForTimeout(delay);
        
        await btn.click();
        await page.waitForTimeout(4000);
        posted = true;
        break;
      }
    }

    if (posted) {
      await recordPersonalPost(config, businessId, message);
    }

    if (!posted) {
      await page.keyboard.press("Control+Return");
      await page.waitForTimeout(3000);
    }

    logger.info("[PROFILE-OPS] ✅ Browser post completed");
    return { success: true, method: "playwright_browser" };

  } catch (err: any) {
    const screenshotPath = path.join(os.tmpdir(), `profile_error_${Date.now()}.png`);
    try {
      const pages = browser.contexts()?.[0]?.pages();
      if (pages && pages[0]) {
        await pages[0].screenshot({ path: screenshotPath, fullPage: false });
        logger.error(`[PROFILE-OPS] Screenshot: ${screenshotPath}`);
      }
    } catch {}

    return { success: false, error: err.message, method: "playwright_browser" };
  } finally {
    await browser.close().catch(() => {});
  }
}
