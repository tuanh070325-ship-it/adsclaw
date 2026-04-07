---
name: attribution-analyzer
description: Bóc tách doanh thu ảo do Attribution Window gây ra (Ví dụ Meta gán công tự động cho người chỉ View Ads 7 ngày trước). Triggers trên "doanh thu ảo", "kiểm tra attribution", "so sánh doanh thu", "roas bơm".
---

# Attribution Analyzer Skill

> [!WARNING]
> **THẾ GIỚI CỦA SỰ THẬT (PHÁT HIỆN ROAS ẢO)**
> Meta thường tự chép công cho mình nếu khách hàng mở Meta, nhìn cái Ads rồi 7 ngày sau ra ngoài Web/Store tự mua. Kỹ năng này so sánh đa khung `Window` và ép ROAS về sát hiện thực trước khi quyết định tăng/giảm ngân sách.

## 1. PHÂN TÍCH THEO CỬA SỔ QUY ĐỔI (ATTRIBUTION WINDOW)

Hệ thống bắt buộc thực hiện 5 bước bóc tách doanh thu báo cáo:

*   **B1. Multi-Window Fetch:** Gọi `meta_account_data` với 4 tham số Attribution đồng thời:
    *   `1-day click`
    *   `7-day click` (Mặc định của Meta)
    *   `1-day view`
    *   `7-day view`
*   **B2. Phát hiện lạm phát (ROAS Inflation):**
    *   Tính `Inflation Rate` = `(7-day ROAS - 1-day ROAS) / 1-day ROAS`.
    *   Nếu Rate `> 40%`, lập tức cắm cờ `[ROAS_INFLATED]` (Doanh thu đang bị thổi phồng quá lố).
*   **B3. Cross-Channel Check (So Khớp Sự Thật):** 
    *   Đối chiếu Order ID/Total Orders từ Website/CRM so với Sale của Meta Manager báo cáo.
    *   Hiện cảnh báo **[DOUBLE_COUNT]** nếu đơn chênh.
*   **B4. Recommended Window (Chuẩn Mực Lĩnh Vực):**
    *   E-commerce (Giá rẻ): Lấy chuẩn `1-day click` vì chốt nhanh.
    *   B2B (Giá cao): Cho phép `7-day click` + `1-day view`.
    *   Retargeting: `1-day view+click`.
*   **B5. Adjust Reporting (Tự Điều Chỉnh Báo Cáo):**
    *   Tự sửa luôn metrics trong API gửi cho Boss, đính kèm nhãn `[HỆ THỐNG XÁC THỰC — Window: X-day]`. Đừng cho Boss nhìn báo cáo 7-day Click vô lý nữa!

---

## 2. OUTPUT TEMPLATE 

Khi Boss đòi check Attribution hoặc có tranh cãi vì sao AddToCart nhiều mà Sale ít:

```markdown
👉 TÌNH TRẠNG (XÁC THỰC ATTRIBUTION WINDOW):
• Campaign: [Tên Chiến Dịch]
• Ngành (Business Type): [E-commerce]

| Mô hình Tracking | Doanh Thu | Lượt Mua | Thực Tế So Với Cửa Sổ | ROAS |
| :--- | :--- | :--- | :--- | :--- |
| **Meta Mặc Định (7d click + 1d view)** | 100,000,000đ | 300 | Cửa sổ gốc | 4.0 |
| **Xác định khắt khe (1d click chỉ lấy nhấp chuột)** | 40,000,000đ | 120 | Gốc -60% | 1.6 |

🔍 INSIGHT:
• Phát hiện [ROAS_INFLATED]: Hệ số lạm phát đạt 150% (> 40%).
• Nghĩa là: Quá nửa doanh thu báo cáo từ Meta đến từ tệp người dùng TỰ NHỚ RA RỒI MUA, chứ không phải họ Click vào Ads xong Mua ngay.
• [CROSS_CHANNEL_CHECK]: Khớp với CRM nội bộ (Chỉ có 150 đơn hôm nay, trong khi Meta báo 300). 

⚡ HÀNH ĐỘNG ĐỀ XUẤT:
► Đề xuất #1: Giảm báo cáo ROAS gốc của [Campaign A] từ 4.0 thành 1.6 để sát doanh thu thực tế.
► Đề xuất #2: Bật ngay `ab-test-analyzer` cho tệp mới vì tệp hiện tại chỉ đang ăn "vét" traffic tự nhiên. Cấm tăng ngân sách.
```
