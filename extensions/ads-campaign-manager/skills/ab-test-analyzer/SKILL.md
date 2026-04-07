---
name: ab-test-analyzer
description: Phân tích kết quả A/B Test bằng phương pháp thống kê (Statistical Significance, Z-Test, Chi-Square). Tự động Declare Winner thay vì đoán mò cảm tính. Triggers trên "kết quả ab test", "chọn bài win", "camp test xong chưa".
---

# A/B Test Analyzer Skill

> [!CAUTION]
> **DỮ LIỆU TOÁN HỌC - KHÔNG CẢM TÍNH**
> Dân ads nghiệp dư chọn Winner bằng cách "nhìn CPA rẻ hơn một chút". Hệ thống V2 bắt buộc dùng **P-Value < 0.05** (Độ tin cậy 95%) để ra quyết định. Không đủ Data = KHÔNG Declare Winner.

## 1. QUY TRÌNH PHÂN TÍCH A/B TEST (6 BƯỚC)

*   **B1. Minimum Sample Size (Tính cỡ mẫu):** 
    *   Trước khi chạy: Tính size tối thiểu `(16 × σ²) / δ²`.
    *   Mặc định: Confidence = 95%, Minimum Detectable Effect (MDE) = 20%.
    *   Hệ thống quy đổi ra: *"Cần ít nhất [X] conversions mỗi variant — tương đương [Y]đ ngân sách để test có hiệu lực."*
*   **B2. Fetch Test Data:** 
    *   Quét data trực tiếp từ `meta_account_data`. Tách metrics ra A vs B vs C.
*   **B3. Vi Rút Thống Kê (Statistical Test):**
    *   Chi-square test cho `Conversion Rate`.
    *   Z-test cho độ cách biệt `CPA`.
    *   Chỉ số quan trọng: `P-value`. Nếu `> 0.05`: Test chưa đủ ý nghĩa.
*   **B4. Isolation Check:**
    *   Verify rằng chỉ có 1 biến số duy nhất bị đổi giữa 2/3 variants (VD: cùng Audience, đổi Video).
    *   Thấy đổi 2 biến số? Dập ngay cảnh báo **[CONTAMINATED TEST]**.
*   **B5. Tuyên Bố Chiến Thắng (Winner Declaration):**
    *   Điều kiện chuẩn: P-value `< 0.05` + Đủ cỡ mẫu (Sample > X) + Cách biệt ROAS/CPA > 15%.
*   **B6. Thực Thi Hành Động:**
    *   Gửi Lệnh Proposal: Diệt các bản Loser (Pause). Dồn 100% budget cho Winner. Ghi Angle Chiến Thắng vào não bộ AI.

---

## 2. OUTPUT TEMPLATE (REPORT)

Khi Sếp gọi phân tích bài Test (kết thúc 3-5 ngày):

```markdown
👉 TÌNH TRẠNG (KẾT QUẢ A/B TEST KIỂM ĐỊNH THỐNG KÊ):
• Campaign: [Name Test]
• Biến Số Duy Nhất: [Content/Headline/Audience] (Passed Isolation Check ✅)

| Variant | Chi tiêu | Bỏ vỏ (Link Clicks) | Trứng (Convs) | CPA |
| :--- | :--- | :--- | :--- | :--- |
| Variant A (Control) | 2,000,000đ | 350 | 12 | 166,000đ |
| Variant B (Challenger)| 2,000,000đ | 500 | 25 | 80,000đ |

🔍 INSIGHT (KIỂM ĐỊNH P-VALUE):
• Confidence Level: 97% (P-value = 0.03 < 0.05). Đã vượt ngưỡng tin cậy.
• [VARIANT B] TỐI ƯU HƠN BẢN A ĐẾN [51%] VỀ MẶT CPA. Lượng data (37 convs) đủ để kết luận.

⚡ HÀNH ĐỘNG ĐỀ XUẤT:
► Đề xuất #1: [WINNER] Ngừng Variant A. Bơm +30% budget cho Variant B.
► Đề xuất #2: Ghi nhớ Angle "[Tên Gap]" làm chuẩn mực cho đợt creative tới.
```

## 3. KỊCH BẢN CHƯA ĐỦ CỠ MẪU (PREMATURE RESULT)

Nếu data quá thấp (P-value > 0.05):
```markdown
👉 TÌNH TRẠNG (TEST CHƯA HOÀN THÀNH):
• Variant B trông rẻ hơn (100k vs 120k CPA) nhưng **SỐ LIỆU CHƯA ĐỦ ĐỂ KẾT LUẬN**.
• P-value: 0.15 (Yêu cầu < 0.05). Độ cách biệt có thể do ăn may.

⚡ HÀNH ĐỘNG: 
• CHƯA DECLARE WINNER. Tiếp tục đốt thêm [X]đ vào môi trường test. Báo cáo lại sau 48h.
```
