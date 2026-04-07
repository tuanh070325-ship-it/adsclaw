---
name: alert-notification
description: Hệ thống cảnh báo tự động 24/7, gửi alert qua Zalo OA / Telegram khi bất kỳ KPI nào vượt ngưỡng nguy hiểm mà không cần boss phải check tay.
---

# Alert Notification Skill

> [!CAUTION]
> **HỆ THỐNG PHẢN ỨNG NHANH 24/7**
> Không bao giờ để chiến dịch chệch hướng quá 4 giờ. Tự động notify và đề xuất xử lý ngay khi KPI vượt ngưỡng.

## 1. QUY TRÌNH POLING & ALERT (7 BƯỚC)

Đây là quy trình bắt buộc hệ thống sẽ tuân theo dưới nền:

*   **B1. Định nghĩa Threshold (Cấu hình)**:
    *   Hệ thống kiểm tra các ngưỡng an toàn:
        - `CPA_MAX` (Giá chuyển đổi tối đa)
        - `ROAS_MIN` (ROAS tối thiểu)
        - `SPEND_RATE_MAX` (Tốc độ đốt tiền)
        - `CTR_MIN` (Tỷ lệ click tối thiểu)
        - `FREQUENCY_MAX` (Tần suất hiển thị tối đa).
    *   Sếp có thể tùy biến Threshold cho từng campaign (lệnh `/alert config`).

*   **B2. Polling Engine**:
    *   Cron job hoạt động mỗi 30 phút dưới background. Gọi `meta_account_data()` từ API gốc.
    *   Thuật toán liên tục so sánh metrics với ngưỡng an toàn. Nếu vi phạm, đưa vào hàng đợi `Alert Queue`.

*   **B3. Đánh giá Alert Severity**:
    *   🔵 `INFO`: Chỉ số đang tiếp cận ngưỡng báo động (80% ranh giới). Thông báo nhẹ nhàng.
    *   🟡 `WARNING`: Lần đầu tiên vượt ngưỡng giới hạn. Nguy cơ bắt đầu hụt vốn.
    *   🔴 `CRITICAL`: Vượt mốc nguy hiểm cực đại (> 150% ngưỡng cho phép). Bắt buộc can thiệp.

*   **B4. Format Nội dung Alert**:
    *   Tất cả cảnh báo phải sử dụng format chuẩn C-Suite:
    *   `Campaign [Name] | Metric: CPA=[X]đ (Ngưỡng: [Y]đ) | Hành động đề xuất: [Z] | Link: /pheduyet [proposalId]`

*   **B5. Delivery Channel**:
    *   Kênh chính: Bắn REST API gửi tín hiệu về **Telegram** (Sử dụng `TELEGRAM_BOT_TOKEN` + `CHAT_ID`).
    *   Kênh phụ: Nếu cấu hình Zalo, POST tới Zalo OA API bằng `OA_ACCESS_TOKEN`.
    *   Fallback: Ghi lại Log local nếu cả 2 kênh đều rớt mạng.

*   **B6. Alert Cooldown (Tránh Spam)**:
    *   Mỗi cảnh báo `WARNING` sẽ bị khóa cooldown 2 tiếng cho Campaign đó.
    *   Tuy nhiên, `CRITICAL` thì Không bao giờ cooldown (spam cho đến khi Sếp xử lý).
    *   Sếp có thể gõ lệnh `/im_lang [campaign]` để đặt báo thức ngủ yên (Snooze) trong 4 tiếng.

*   **B7. Auto-Proposal Link (Thực thi tức thì)**:
    *   Mỗi khi tung ra cảnh báo, hệ thống phải tự động móc nối sang `campaign-optimization` SKILL.
    *   Tự động sinh ra 1 link lệnh `/pheduyet [proposalId]` (Pause hoặc Giảm NS) để Sếp chỉ cần chạm/nhắn "yes" là chốt giao dịch cứu tiền.

---

## 2. CHUẨN ĐẦU RA (OUTPUT) XUẤT PHÁT TỰ ĐỘNG:

### 🔴 CRITICAL ALERT TEMPLATE:
```markdown
⚠️ [CRITICAL ALERT] BÁO ĐỘNG NGÂN SÁCH!
• Campaign: `[Campaign Name]`
• Vi phạm: [CPA tăng 150%] - Hiện tại là [X]đ (Ngưỡng an toàn: [Y]đ).
• Rủi ro: Đang đốt tiền quá nhanh so với số lượng chuyển đổi!

⚡ HÀNH ĐỘNG KHẨN CẤP:
• Em đã tạo sẵn Lệnh TẠM DỪNG (Hoặc cắt 30% Budget) để cắt lỗ ngay.
► Sếp gõ `/pheduyet [proposal-xyz-123]` hoặc trả lời `yes` để em thực thi ngay lập tức! (Lệnh này chưa tự bấm do đang bọc trong CEP).
```

### 🟡 WARNING TEMPLATE:
```markdown
🔔 [WARNING] DẤU HIỆU FATIGUE & SPEND RATE CAO
• Campaign: `[Campaign Name]`
• Vi phạm: [CTR rớt 30% trong 2h / Spend rate > 115%].
• Cảnh báo: CPA vẫn ổn nhưng dòng click đang cạn kiệt. Dấu hiệu kháng nội dung (Creative Fatigue).

⚡ ĐỀ XUẤT:
► Sếp gõ `/baocao` để xem Funnel, hoặc ra lệnh `Tạo bài quảng cáo` để em thay thế thiết kế mới nhé.
```
