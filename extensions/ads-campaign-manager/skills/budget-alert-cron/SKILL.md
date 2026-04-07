---
name: budget-alert-cron
description: "Cảnh báo ngân sách chủ động mỗi 3 tiếng. Phân tích chi tiêu, CPA, ROAS và CTR."
metadata:
  openclaw:
     schedule: "0 */3 * * *" # Mỗi 3 tiếng: 0h, 3h, 6h...
     always: true
---

## Nhiệm vụ tự động
Mỗi 3 tiếng, lấy dữ liệu từ `meta_account_data` và kiểm tra các ngưỡng cảnh báo quan trọng:

## Các ngưỡng cảnh báo
| Chỉ số | Ngưỡng cảnh báo | Ngưỡng khẩn cấp |
|---------------|---------------------|----------------------|
| Budget dùng | > 80% trong ngày | > 95% trong ngày |
| CPA hôm nay | > 130% vs 7d avg | > 200% |
| ROAS hôm nay | < 70% vs target | < 50% vs target |
| CTR | < 50% vs 7d avg | < 30% vs 7d avg |
| Spend | Đột biến > 50%/giờ | — |

## Format tin nhắn cảnh báo
"[BUDGET ALERT] {time}
Campaign: {ten}
Vấn đề: CPA đang {gia_tri} — cao hơn 150% mục tiêu
Khuyến nghị: Giảm budget 30% hoặc tạm dừng
Reply 'Duyệt' để thực hiện hoặc 'Bỏ qua' để tiếp tục"

## Quy tắc
Nếu không có vấn đề, không gửi tin nhắn. (Im lặng = tốt)
