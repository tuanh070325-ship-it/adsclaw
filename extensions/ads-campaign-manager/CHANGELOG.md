# CHANGELOG: Ads Campaign Manager

## [2026.4.1-phase2] - 2026-04-06

### 🚀 Giai đoạn 2: Tự động hóa chủ động (Proactive Expert Mode)
Phiên bản này nâng ứng dụng từ một trợ lý bị động lên một chuyên gia quảng cáo chủ động hoàn toàn, tích hợp sâu với Telegram để bảo vệ tài khoản và tối ưu ngân sách 24/7.

#### 🛡️ An toàn & Bảo mật (Phase 1)
- **Token Guard**: Tự động kiểm tra thời hạn Meta Access Token mỗi sáng thứ 2. Cảnh báo khẩn cấp khi token còn < 7 ngày.
- **Playwright Safety Rules**:
    - Chống detection từ Facebook bằng cơ chế **Human Logic** (gõ phím trễ ngẫu nhiên, cuộn trang tự nhiên).
    - **Rate Limit**: Giới hạn 3 bài đăng/ngày và giãn cách 2 tiếng giữa mỗi bài bài trên Profile cá nhân.
- **Trusted Browser**: Ép buộc chạy trình duyệt có cửa sổ (`headless: false`) để tăng độ tin cậy.

#### 📈 Tự động hóa & Phân tích (Phase 2)
- **Budget Alert Cron**: Quét dữ liệu 3 tiếng/lần. Phát hiện và báo động ngay khi có **CPA Spike** (tăng đột biến 130%) hoặc **Budget Pacing** vượt 80% ngày.
- **Creative Fatigue Monitor**: So sánh CTR 7 ngày vs 30 ngày để phát hiện sự "mệt mỏi" của quảng cáo. Cảnh báo thay creative khi hiệu quả giảm >20%.
- **Weekly Auto-Report**: Tự động gửi báo cáo hiệu quả tổng thể vào 7:00 AM sáng Thứ 2 hàng tuần qua Telegram.
- **Historical Context**: Nâng cấp hệ thống đồng bộ để luôn có dữ liệu so sánh 7 ngày và 30 ngày trong snapshot.

#### 🧰 Công cụ mới cho Chuyên gia
- `ads_manager_proactive_audit`: Ra lệnh quét toàn bộ hệ thống để tìm lỗi tiềm ẩn.
- `ads_manager_generate_weekly_report`: Tạo nhanh báo cáo tuần tức thì.

### ⚙️ Kỹ thuật
- Tích hợp bảng `personal_post_history` vào MySQL để quản lý Rate Limit.
- Cấu hình Telegram là kênh thông báo mặc định.
- Nâng cấp Meta Batch API để tối ưu tốc độ đồng bộ dữ liệu lịch sử.

---
*Phiên bản này được thiết kế để Sếp có thể an tâm để bot tự động canh giữ tài khoản, chỉ báo động khi thực sự cần thiết.*
