---
name: token-guard
description: "Kiểm tra và cảnh báo token sắp hết hạn. Chạy định kỳ sáng thứ 2 hàng tuần."
metadata:
  openclaw:
    schedule: "0 9 * * 1" # Mỗi thứ 2 lúc 9am
    requires:
      env: [META_ACCESS_TOKEN, META_AD_ACCOUNT_ID]
---

## Nhiệm vụ
Mỗi thứ 2 sáng, gọi Graph API kiểm tra thời hạn token. 

## Cách kiểm tra
Gọi: `GET https://graph.facebook.com/debug_token?input_token={META_ACCESS_TOKEN}&access_token={APP_ID}|{APP_SECRET}`
Lấy trường: `data.expires_at` (Unix timestamp)

Tính số ngày còn lại = `(expires_at - now) / 86400`

## Quy tắc cảnh báo
- Còn < 14 ngày: gửi cảnh báo qua Telegram
- Còn < 7 ngày: gửi cảnh báo KHẨN CẤP mỗi ngày
- Đã hết hạn: gửi lỗi CRITICAL, dừng mọi hoạt động ads

## Nội dung tin nhắn
"[TOKEN GUARD] Meta token còn {N} ngày. Truy cập: business.facebook.com/settings > System Users > Tạo token mới > Cập nhật META_ACCESS_TOKEN"
