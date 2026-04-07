---
name: audience-builder
description: Chuyên gia xây dựng, tính điểm và quản lý phễu khách hàng. Đảm nhiệm việc tạo Lookalike, xử lý Interest Stacking và check Overlap để gỡ nút thắt CPA.
---

# Audience Builder Skill

> [!TIP]
> **THAO TÁC AUDIENCE QUYẾT ĐỊNH 50% THÀNH BẠI**
> Tệp khách hàng sai thì content có hấp dẫn đến mấy cũng vô nghĩa. Skill này làm chủ "trái tim" của hệ thống targeting.

## 1. QUY TRÌNH XÂY TỆP (7 BƯỚC THẦN THÁNH)

Hệ thống phải tuân thủ chuẩn Audience Builder 7 bước sau khi Sếp gõ `/audience` hoặc `xây tệp`:

*   **B1. Phân Tầng Phễu (Full-Funnel)**:
    *   **TOP (Cold):** Video Views 3s, Page Engagement, Fan cũ.
    *   **MID (Warm):** Website Visitor, AddToCart nhưng chưa mua.
    *   **BOTTOM (Hot/Retargeting):** Kẻ bỏ giỏ hàng (Cart Abandoners), Xem sản phẩm > 3 lần.
*   **B2. Custom Audience Builder**:
    *   Sử dụng lệnh Auto-Tạo tệp: Đẻ ra `Lookalike (LAL) 1%/2%/3%` từ nhóm Purchaser (khách đã mua).
    *   Tự động upload Customer List.
*   **B3. Kiểm tra kích thước (Size Checker)**:
    *   Gọi Meta API `GET /v19.0/{audience_id}?fields=approximate_count`.
    *   Cảnh báo Đỏ nếu `< 1000` người. 
    *   Cảnh báo Vàng (Cần mở rộng) nếu size `< 50,000` người.
*   **B4. Audience Overlap Detector (Tránh Tự Giết Nhau)**:
    *   Check `POST /v19.0/act_{id}/audienceoverlap`.
    *   Cắm cờ `[OVERLAP_HIGH]` nếu trùng lặp > 30% giữa các Ad Sets.
    *   Ép buộc hệ thống tự sinh Lệnh Đề Xuất (Proposal): `Exclude (Loại trừ đối tượng)` hoặc gộp tệp.
*   **B5. Interest Stacking Logic**:
    *   Bóc tách Top 5 Interests đang thắng từ `campaign-optimization`.
    *   Sinh tệp siêu việt (Super Lookalike + Interest Stack). Tự động cấm các Interests có `CPM` cao mà `CTR` lẹt đẹt.
*   **B6. Audience Performance Scoring**:
    *   Chấm điểm tệp từ 0-100 (Dựa trên ROAS và CPA thực tế).
    *   Logic dọn rác vô tình: Ad Set/Tệp nào có Score `< 40` suốt 7 ngày sẽ bị Auto-Archive.
*   **B7. Lookalike Strategy**:
    *   Luôn A/B test giữa LAL 1% vs 2% vs 3%. 
    *   Nếu ngân sách lớn: Kéo giãn lên 2-3%. Ngân sách nhỏ: Siết chặt 1% để tối ưu Lead/Purchase.

---

## 2. OUTPUT TEMPLATE

Khi Sếp gọi `/audience`, in ra bản đồ mỏ vàng:

```markdown
👉 TÌNH TRẠNG (BẢN ĐỒ AUDIENCE INVENTORY):
• 🥶 Tầng TOP (Cold): [LAL 1% Purchasers - 500k người] - Score: 85/100
• 😐 Tầng MID (Warm): [Website Visitors 30d - 45k người] - Score: 70/100 (⚠️ Size hơi nhỏ)
• 🔥 Tầng BOTTOM (Hot): [Cart Abandoners 7d - 2k người] - Score: 95/100

🔍 INSIGHT:
• Phát hiện [OVERLAP_HIGH] (45%) giữa `AdSet A` và `AdSet B`. Chúng đang tự tranh thầu!
• Interest `[A]` ngốn 300k, CPM 150k nhưng zero sale. Cần loại bỏ.

⚡ HÀNH ĐỘNG ĐỀ XUẤT:
► Đề xuất #1: Exclude tệp B ra khỏi tệp A. (Lệnh `/pheduyet [id-1]`)
► Đề xuất #2: Tạo thêm LAL 2% để bơm máu cho phễu Cold. (Lệnh `/pheduyet [id-2]`)
```
