import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { getLinkedAdAccounts, setActiveAdAccount } from "../core/db-state.js";

export function createBMTools(params: { api: OpenClawPluginApi; pluginConfig: any }): AnyAgentTool[] {
  
  // ─ Tool 1: ads_manager_list_bm ──────────────────────────────────────────
  const listBMTool: AnyAgentTool = {
    name: "ads_manager_list_bm",
    label: "List Linked Ad Accounts (BM Hub)",
    description: "Liệt kê danh sách tất cả các tài khoản quảng cáo (BM) đang được quản lý bởi hệ thống dưới dạng bảng Markdown.",
    parameters: Type.Object({}),
    execute: async (_id, _raw: any) => {
      const accounts = await getLinkedAdAccounts(params.pluginConfig);
      
      if (accounts.length === 0) {
        return { 
          content: [{ type: "text", text: "Chưa có tài khoản BM nào được liên kết. Sếp hãy dùng lệnh 'Thêm tài khoản BM <id>' nhé." }],
          details: { count: 0 }
        };
      }

      let text = "### 🏢 DANH SÁCH TÀI KHOẢN BM QUẢN LÝ\n\n";
      text += "| Account ID | Tên Tài Khoản | Tiền Tệ | Trạng Thái | Đồng Bộ Cuối |\n";
      text += "|------------|---------------|---------|------------|-------------|\n";
      
      for (const acc of accounts) {
        const statusIcon = acc.is_active ? "🟢 **Active**" : "⚪ Offline";
        const synced = acc.last_sync_at ? new Date(acc.last_sync_at).toLocaleString('vi-VN') : "N/A";
        text += `| \`${acc.id}\` | ${acc.account_name} | ${acc.currency} | ${statusIcon} | ${synced} |\n`;
      }

      text += "\n> Để chuyển đổi tài khoản, Sếp hãy dùng lệnh: `Chuyển tài khoản <ID>`";
      
      return { content: [{ type: "text" as const, text }], details: { count: accounts.length } };
    },
  };

  // ─ Tool 2: ads_manager_switch_account ──────────────────────────────────
  const switchAccountTool: AnyAgentTool = {
    name: "ads_manager_switch_account",
    label: "Switch Active Ad Account",
    description: "Chuyển đổi tài khoản quảng cáo (BM) đang hoạt động chính để bot thực hiện phân tích và báo cáo.",
    parameters: Type.Object({
      accountId: Type.String({ description: "ID của tài khoản ads muốn chuyển sang" })
    }),
    execute: async (_id, raw: any) => {
      await setActiveAdAccount(params.pluginConfig, raw.accountId);
      
      let text = `✅ Đã chuyển đổi thành công sang tài khoản Active: \`${raw.accountId}\`.\n`;
      text += `Dữ liệu sẽ được tự động đồng bộ lại trong ít phút. Sếp có muốn tôi quét nhanh (Sync Now) tài khoản mới này không?`;
      
      return { content: [{ type: "text" as const, text }], details: { success: true, accountId: raw.accountId } };
    },
  };

  return [listBMTool, switchAccountTool];
}
