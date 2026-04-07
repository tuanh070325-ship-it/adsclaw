# Cẩm Nang Lệnh Chỉ Huy (Commands) - Elite Version V2

Hệ thống Ads Campaign Manager V2 hoạt động như một System Performance Director. Sếp có thể chat ra lệnh bằng ngôn ngữ tự nhiên, hoặc sử dụng các Slash Commands dưới đây để kích hoạt tức thì các Module V2.

---

## 🧭 Nhóm Lệnh Điều Hành Lõi (Core Executive)
- `/baocao` : Fetch data 24h qua, xem CPA, ROAS, Spend. Tự động tìm Campaign tốt/xấu.
- `/tongquan` : Cung cấp góc nhìn toàn cảnh V2 Health Score của toàn bộ tài khoản.
- `/ngansach` : Audit số tiền đã tiêu, Pacing rate, phát hiện Overspending.
- `/de_xuat` : Danh sách các đề xuất Tăng/giảm NS AI đang chờ Sếp `/pheduyet`.
- `/pheduyet [id]` : Chạy giao thức CEP (Xác Nhận - Thực Thi - Kiểm Tại) đẩy data mượt lên server Meta.
- `/tuchoi [id]` : Bác bỏ đề xuất tối ưu của AI.

## 🧠 Nhóm Lệnh Phán Xử Và Toán Học (V2 Analytics & Validation)
- `/pixel` : Kích hoạt `pixel-health-checker`. Bơm API dò rò rỉ Pixel và CAPI.
- `/roas_ao` (hoặc "Kiểm tra attribution"): Kéo `attribution-analyzer`. So 4 cửa sổ quy đổi, quét sạch doanh thu ảo.
- `/ab_test` : Khởi động cỗ máy `ab-test-analyzer`. Tính toán Z-Test và Chi-Square để Declare Winner.
- `/alert config` : Xem lại hoặc điều chỉnh các mốc "bức tử" báo động đỏ từ hệ thống tự động gác đêm.

## 🎨 Nhóm Lệnh Sản Xuất Tiền Phương (V2 Creative & Audience)
- `/audience` : Soi tỷ lệ đè tệp vòng lặp và đo Size từng ngách của Account (`audience-builder`).
- `/retarget` : Soi tỷ lệ chia NS (VD: 50% COLD, 30% WARM, 20% HOT) qua `retargeting-funnel`. Chặn quảng cáo rác nã khách hàng cũ.
- `"Tạo bài quảng cáo cho [Sản phẩm]"` : Lệnh nòng cốt. Kích hoạt cỗ máy sinh Content 3 Variant (Control/Challenger/Wild Card) và nhét thẳng vào A/B Test.
- `"Phân tích đối thủ [Tên]"` / `/doithu` : Triệu hồi `competitor-intelligence` cào quét FB Ads Library và TikTok Creative Center để săn lùng Gap thị trường.
