---
name: creative-fatigue-monitor
description: "Theo dõi và cảnh báo mức độ mệt mỏi của Creative. Chạy hằng ngày."
metadata:
  openclaw:
     schedule: "0 10 * * *" # Sáng 10h hằng ngày
---

## Thuật toán phát hiện fatigue
- `ctr_7d` = trung bình CTR 7 ngày gần nhất
- `ctr_30d` = trung bình CTR 30 ngày
- `delta` = `(ctr_7d - ctr_30d) / ctr_30d * 100`

## Ngưỡng cảnh báo
- IF `delta < -20%` → **CẢNH BÁO: "Creative đang mệt dần"**
- IF `delta < -40%` → **KHẨN CẤP: "Phải thay creative ngay"**
- IF `frequency > 3.5` → **"User đã xem quá nhiều lần"**
- IF `frequency > 5.0` → **"OVEREXPOSED — dừng ngay"**

## Tin nhắn gửi Sếp
"[CREATIVE ALERT]
Ad: {ten}
CTR: {ctr_7d}% (giảm {delta}% so với trung bình 30d)
Frequency: {freq}
Khuyến nghị: Thay ảnh/video mới hoặc đổi góc tiếp thị"
