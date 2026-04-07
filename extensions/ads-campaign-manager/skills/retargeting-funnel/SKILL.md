---
name: retargeting-funnel
description: Xây dựng và quản lý toàn bộ phễu quảng cáo 3 lớp Cold/Warm/Hot, tối ưu Budget Allocation (startup, growth, scale) và cấm đè tệp bằng Exclusion Logic chuyên nghiệp.
---

# Retargeting Funnel Skill

> [!TIP]
> **ĐIỀU KHOẢN PHÂN TẦNG VÀ LOẠI TRỪ (EXCLUSIONS)**
> Skill này quyết định ngân sách chạy trên các mảng 3 lớp Phễu. Không làm cái này thì Cold với Hot tranh thầu tự cắn nhau, ROAS thấp tè.

## 1. QUY TRÌNH QUẢN LÝ PHỄU 5 BƯỚC

Hệ thống tiến hành càn quét mỗi tuần:

*   **B1. Audit (Giải Cứu) Funnel Tích Tắc:** 
    *   Phân loại toàn bộ list Chiến Dịch vào 3 rổ: 
        *   COLD (Prospecting LAL/Interest/No Target)
        *   WARM (Engagement retarget)
        *   HOT (Website V/Cart Abandoners).
*   **B2. Budget Allocation (Sang Băng Tiền):**
    *   **Startup:** Cold 70% | Warm 20% | Hot 10%.
    *   **Growth:** Cold 50% | Warm 30% | Hot 20%.
    *   **Scale:** Cold 40% | Warm 30% | Hot 30%.
    *   Dựa trên Account Size mà tự động Scale/Cut. 
*   **B3. Message Matching:** 
    *   Cảnh báo nếu Bot lấy Copy của COLD đem nã vào tệp HOT, đánh dấu cờ **[MESSAGE MISMATCH]**.
    *   Lý do: WARM cần Testimonial/Demo. HOT cần Offer/Urgency/FOMO. Đánh lộn là hỏng ROAS.
*   **B4. Exclusion Logic (Tự Động Băm Tệp Chống Đè):**
    *   Hot bắt buộc phải bị Exclude (loại trừ) ra khỏi các Ad Set Cold và Warm.
    *   Warm phải Exclude đối tượng Purchaser.
    *   Cold phải Exclude tất cả Customer. (Tránh Burn rate / đốt tiền phí vào thằng mua rồi).
*   **B5. Lên Điểm Funnel (Funnel Health Score):**
    *   Tính tỷ lệ `Warm:Cold Conversion Rate`. 
    *   Nguyên tắc thép: Retargeting LƯỢNG LUÔN phải có ROAS CAO HƠN Prospecting (Cold). Nếu rớt xuống thấp hơn: Bấm còi báo động khẩn cấp **[FUNNEL_BROKEN]** (Phễu này đã rách toạc).

---

## 2. OUTPUT TEMPLATE 

Khi Boss gọi: "Kiểm tra phễu", "retargeting xem chạy thế nào", "tình hình cold warm hot":

```markdown
👉 TÌNH TRẠNG (FUNNEL HEALTH INVENTORY):
• Quy mô phễu: Growth (Growth Mode)
• Tỷ lệ phân bổ ngân sách: Cold 65% / Warm 25% / Hot 10%

| Tầng Phễu | Target Audience | ROAS | Tình trạng khớp Thông điệp |
| :--- | :--- | :--- | :--- |
| **COLD (Phễu lạnh)** | 1.8M (Interest) | 2.1 | OK |
| **WARM (Phễu ấm)** | 200K (Page Engagers) | 3.5 | [MISMATCH] Thiếu Demo |
| **HOT (Phễu nóng)** | 12K (Add To Cart 14D) | 1.8 | [FUNNEL_BROKEN] |

🔍 INSIGHT:
• Phát hiện [MESSAGE_MISMATCH] tại rổ WARM: Ad Set dùng sai content của COLD.
• Báo Động [FUNNEL_BROKEN]: Tệp HOT của Chiến Dịch A đang có ROAS (1.8) thấp hơn cả COLD (2.1). Hot Traffic đang bị Burn vì xem lại liên tục quá tần suất (Frequency > 4).
• [EXCLUSION_MISSING]: Tệp COLD vẫn đang nã Ads vào tệp Custom Purchaser. Mất ngay 500k oan uổng.

⚡ HÀNH ĐỘNG ĐỀ XUẤT:
► Đề xuất #1: Exclude toàn bộ Purchaser khỏi COLD.
► Đề xuất #2: Tạo riêng 1 nội dung FOMO (Urgency) mới qua `ad-creative-generator` thả vào HOT, đánh thức Cart Abandoners.
► Đề xuất #3: Cân tiền từ COLD sang WARM để kéo Budget tỷ lệ chuẩn 50/30/20.
```
