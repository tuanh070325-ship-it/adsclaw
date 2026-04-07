import logger from "../core/logger.js";

/**
 * Simple Notifier service to send Telegram alerts.
 * Uses TELEGRAM_BOT_TOKEN and TELEGRAM_ALERT_CHAT_ID from environment.
 */
export async function sendTelegramAlert(message: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ALERT_CHAT_ID;

  if (!token || !chatId) {
    logger.warn("[NOTIFIER] Telegram alerting skipped: Missing TELEGRAM_BOT_TOKEN or TELEGRAM_ALERT_CHAT_ID in env.");
    return false;
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "Markdown",
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      logger.error(`[NOTIFIER] Failed to send Telegram message: ${err}`);
      return false;
    }

    return true;
  } catch (e: any) {
    logger.error(`[NOTIFIER] Error sending Telegram alert: ${e.message}`);
    return false;
  }
}
