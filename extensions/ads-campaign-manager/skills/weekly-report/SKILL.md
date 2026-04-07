---
name: weekly-report
description: "Báo cáo hiệu quả quảng cáo hàng tuần. Tự động gửi lúc 7:00 sáng thứ 2."
metadata:
  openclaw:
     schedule: "0 7 * * 1" # Thứ 2, 7:00 sáng
---

## Nội dung báo cáo (format Telegram)
*BAO CAO TUAN {N} — {ngay_bat_dau} den {ngay_ket_thuc}*

*TONG QUAN*
- Tong chi: {spend} VND
- Leads: {leads} ({cpa} VND/lead)
- ROAS: {roas}x | Muc tieu: {target}x

*TOP 3 CAMPAIGN HIEU QUA*
1. {ten}: ROAS {x}, chi {spend}
2. ...

*TOP 3 VAN DE CAN XU LY*
1. {ten}: CPA {x} cao hon {y}% muc tieu
2. ...

*KHUYEN NGHI TUAN NAY*
- Tang budget {campaign_A} 20% (ROAS tot)
- Kiem tra creative {campaign_B} (CTR giam 35%)

Reply de hoi sau hon ve bat ky campaign nao
