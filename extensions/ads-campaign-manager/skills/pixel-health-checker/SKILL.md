---
name: pixel-health-checker
description: Tự động kiểm tra toàn bộ trạng thái Pixel Meta, Conversions API (CAPI), và sự khớp giữa optimization event với conversion event thực tế. Đây là lớp bảo vệ đầu tiên trước khi cấp ngân sách.
---

# Pixel Health Checker Skill

> [!DANGER]
> **CRITICAL: LỚP BẢO VỆ NGÂN SÁCH ĐẦU TIÊN (ZERO-TRUST)**
> Hệ thống không bao giờ được phép thực hiện lệnh scale budget (tăng ngân sách) hoặc approve proposal phân bổ tài nguyên nếu Pixel Health Score < 60.

## 1. QUY TRÌNH KIỂM TRA PIXEL (7 BƯỚC)

Đây là các tiêu chuẩn bắt buộc phải quét tự động khi Boss ra lệnh `/pixel`:

*   **B1. Kiểm tra Pixel Active**:
    *   Gọi `GET /v19.0/{pixel_id}?fields=id,name,last_fired_time`
    *   Nếu `last_fired_time` > 24h: cắm cờ cảnh báo `[PIXEL INACTIVE]`. Trạng thái: Lỗi nghiêm trọng nhất.

*   **B2. Kiểm tra Event Coverage**:
    *   Gọi `GET /v19.0/{pixel_id}/stats?fields=event_name,count`
    *   Xác nhận sự có mặt của các core events: `Purchase`, `AddToCart`, `ViewContent`, `Lead`. Nếu event chủ lực bị rớt, phải báo cáo thiếu.

*   **B3. Kiểm tra Event Match Quality (EMQ)**:
    *   Gọi `GET /v19.0/{pixel_id}/matched_events`
    *   Nếu Score < 6/10: cắm cờ `[EMQ_LOW]`. Auto-đề xuất: "Cần bổ sung hash email/phone trong setup code".

*   **B4. Kiểm tra CAPI (Conversions API)**:
    *   Gọi `GET /v19.0/{dataset_id}/stats`
    *   Nếu dedup_rate (Tỷ lệ Deduplication) < 70%: cắm cờ `[CAPI_DEDUP_LOW]`.
    *   Nếu server_event = 0: cắm cờ `[CAPI_OFFLINE]`.

*   **B5. Kiểm tra Optimization Match**:
    *   So sánh `optimization_goal` của Campaign với Event đang bắn về.
    *   Nếu Campaign tối ưu `Purchase` nhưng Pixel rỗng không bắn `Purchase`: cắm cờ `[OPT_MISMATCH]`.

*   **B6. Thuật toán Health Report (Giới hạn 100 điểm)**:
    *   Active: Tối đa 30 điểm
    *   EMQ (Chất lượng matching): Tối đa 25 điểm
    *   CAPI (Server-side tracking): Tối đa 25 điểm
    *   OptMatch (Khớp mục tiêu): Tối đa 20 điểm
    *   **Thang điểm:** A(90+), B(75-89), C(60-74), D(40-59), F(<40).

*   **B7. Auto-Alert & Block Mechanism**:
    *   Nếu Pixel Health Score < 60 (D & F): Hệ thống tự động đẩy `CRITICAL ALERT` tới Sếp. Khóa cứng mọi đề xuất Scale Campaign.

---

## 2. OUTPUT TEMPLATE CHUẨN (C-SUITE STANDARD)

Luôn sử dụng the `👉 TÌNH TRẠNG - 🔍 CẤU TRÚC LỖI - ⚡ HƯỚNG DẪN FIX` format.
Dành cho lệnh `/pixel` hoặc `kiểm tra pixel`:

```markdown
👉 TÌNH TRẠNG (PIXEL HEALTH: [SCORE]/100 - Grade [A-F]):
• Trạng thái Pixel: [Active / Inactive (>24h không nhận Ping)].
• Event ghi nhận: [Purchase, AddToCart, ...].
• Tình trạng CAPI: [Online / Offline].

🔍 CẤU TRÚC LỖI (VẤN ĐỀ TRACKING):
• [Nếu EMQ <6]: Cảnh báo EMQ_LOW - Chất lượng Matching Event chỉ đạt [X]/10.
• [Nếu Dedup thấp]: Cảnh báo CAPI_DEDUP_LOW - Tỷ lệ loại trừ trùng lặp chỉ đạt [X]%. Chênh lệch data báo cáo cao.
• [Nếu Mismatch]: Cảnh báo OPT_MISMATCH - Campaign `[Name]` đang target `[Event A]` nhưng Pixel không đo được 1 cái nào!

⚡ HƯỚNG DẪN FIX (HÀNH ĐỘNG):
1. Fix EMQ: Sếp cần yêu cầu Dev bổ sung biến SHA256 (Email/Phone) lúc Post payload.
2. Fix Dedup: Thêm event_id khớp nhau giữa Browser và Server-side event.
► Cảnh báo: Lệnh chặn ngân sách đang Bật do Score < 60. Sếp fix ngay nhé!
```
