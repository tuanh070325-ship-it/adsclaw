---
name: competitor-intelligence
description: Full competitor analysis chain for Facebook pages. Triggers on ANY facebook.com URL or "phân tích đối thủ" request. Automatically resolves pageId + displayName, scrapes Ad Library via Apify, falls back to Serper organic data, saves to memory. Never stops mid-chain to ask questions.
---

# Competitor Intelligence Skill v2 — Elite Espionage

> [!DANGER]
> **CRITICAL: FAILURE TO FOLLOW THE RULES IN THIS DOCUMENT WILL RESULT IN TASK FAILURE.**

---

## ⛔ RULE ZERO — TUYỆT ĐỐI CẤM BROWSER

```
NGHIÊM CẤM trong competitor intelligence:
❌ "Cho phép dùng browser không?"
❌ "Em cần mở Chrome để lấy dữ liệu"
❌ "Chọn A (browser tự động) hay B (cung cấp link)?"
❌ Yêu cầu user cung cấp link/tên thay vì tự tìm

Tool đã có đủ:
✅ market_industry_discovery  → ScrapeCreators API (ngành hàng)
✅ resolve_facebook_page_id   → Graph API + Serper
✅ meta_ad_library            → High-Precision Scan (Graph + Apify)
✅ serper_search              → Google organic
✅ apify_facebook_ads         → Direct Apify actors (Safe MCP)
✅ apify_tiktok_ads           → TikTok Creative Center Analysis
```

KHÔNG CÓ LÝ DO GÌ để hỏi hay đề xuất browser.
```

---

## 1. INPUT ROUTING — Nhận Input, Route Ngay

| Input Type | Action đầu tiên | KHÔNG làm |
|---|---|---|
| URL facebook.com/... | `resolve_facebook_page_id(url)` | Hỏi confirm |
| Tên brand ("Nội thất ABC") | `serper_search("Nội thất ABC facebook page")` | Mở Chrome |
| "Tìm đối thủ ngành X" | `market_industry_discovery(keyword: X)` | Hỏi A/B/C |
| "Phân tích TikTok [Brand]" | `apify_tiktok_ads(query: [Brand])` | Hỏi link TikTok |

**AUTONOMY DEFAULTS (không hỏi):**
- Thị trường: VN
- Kênh: Facebook + Instagram + TikTok
- Thời gian: Active ads (hiện tại)
- Limit: 20 ads/page (MCP Safe Mode)

---

## 2. COMPLETE CHAIN

### Chain A — Specific Page Analysis (có URL hoặc tên cụ thể)

```
INPUT: URL hoặc tên brand

STEP 0 — MEMORY CHECK (0.1s)
  ads_manager_brief(mode: "competitors")
  → Đã phân tích hôm nay? Dùng cache, skip đến STEP 5.
  → Chưa có? Tiếp tục.

STEP 1 — RESOLVE (pageId + displayName)
  resolve_facebook_page_id(url)
  → { pageId, pageName, displayName, method }
  
  Nếu chỉ có tên brand (không có URL):
  serper_search("Tên Brand facebook page site:facebook.com")
  → Lấy URL từ kết quả → resolve_facebook_page_id

STEP 1.5 — CROSS-PLATFORM (parallel)
  apify_tiktok_ads(query: [displayName])
  serper_search("[displayName] website landing page")
  → Extract: funnel type, posting frequency, brand tone

STEP 2 — FETCH ADS (MCP chain, không browser)
  Thứ tự ưu tiên:
  1. meta_ad_library(brandName: displayName, competitorUrl: url)
     → Inside: High-Precision Scan → Apify fallback
  2. Nếu cần thám báo sâu (Approved):
     apify_facebook_ads(actorId: "apify/facebook-ads-scraper")

STEP 3 — ORGANIC FALLBACK (NO questions, run immediately)
  serper_search("[displayName] facebook ads quảng cáo 2025 2026")
  serper_search("[displayName] sponsored post facebook")
  serper_search("site:facebook.com/ads/library [displayName]")
  → Extract hooks/offers từ meta descriptions

STEP 4 — SAVE TO MEMORY
  ads_manager_save_competitor({
    name: displayName,
    angle: "dominant angle detected",
    note: "control ad hook + offer + CTA + source",
    sourceUrl: originalUrl,
    ads: [...] // nếu có
  })

STEP 5 — RESPOND (structured report)
```

### Chain B — Industry Discovery (không có URL cụ thể)

```
INPUT: "tìm đối thủ ngành X" / "5 thương hiệu mạnh [ngành]"

STEP 1 — INDUSTRY SCAN
  market_industry_discovery({
    keyword: "[ngành hàng]",
    country: "VN",
    platform: "FB",
    limit: 15
  })
  → Bảng Winning Ads sorted by days running

STEP 2 — TOP 5 EXTRACT
  Lấy 5 pageName unique có days running cao nhất
  → Đây là 5 đối thủ mạnh nhất (đang profitable)

STEP 3 — DEEP DIVE (pick top 2-3 để phân tích sâu)
  Với mỗi brand trong top 3:
  resolve_facebook_page_id("https://facebook.com/[slug]")
  → meta_ad_library(pageId)
  
STEP 4 — SAVE ALL
  ads_manager_save_competitor(...) cho từng brand

STEP 5 — RESPOND với Industry Report
```

---

## 3. ANTI-HALLUCINATION RULES

- **Rule 1 — ZERO INVENTION**: Nếu tool trả về 0 ads → báo `[DỮ LIỆU TRỐNG]`, không bịa số liệu.
- **Rule 2 — TIMESTAMP**: Mọi ad phải ghi `observed_at` (thời điểm lấy data).
- **Rule 3 — EXPLICIT MATH**: Ước tính chi tiêu PHẢI dùng công thức từ `ad-math.ts`:
  ```
  Estimated spend = daysLive × (video: 500,000đ | image: 200,000đ)
  Gán nhãn: [ƯỚC TÍNH - KHÔNG CHÍNH XÁC]
  ```
- **Rule 4 — ANOMALY FLAG**: Ad chạy >1000 ngày → `[DATA ANOMALY - cần kiểm tra]`
- **Rule 5 — STRATEGIC INFERENCE**: Nếu 0-2 ads từ tool, KHÔNG dừng. Dùng kiến thức ngành để đề xuất strategy dựa trên benchmark.

---

## 4. AD ANALYSIS FRAMEWORK

```
Control Ad = bài đang chạy lâu nhất (profitable)

Với mỗi ad phân tích:
  Hook       : Dòng đầu <10 từ (scroll-stopper)
  Offer      : Cam kết (kết quả / giá / bảo hành / deadline)
  CTA        : Messenger / Website / Form / Call
  Format     : Image / Video / Carousel
  Days live  : Số ngày active (dài = winner)
  Platforms  : FB / IG / Messenger
  Angle type : Fear / Aspiration / Social Proof / Authority / Urgency / Curiosity
  Est. Spend : [ƯỚC TÍNH] = daysLive × daily_benchmark

Pattern recognition:
  Most common angle    → dominant strategy
  Most common CTA      → funnel type
  Image:Video ratio    → creative preference
  Avg days running     → testing velocity
  Refresh cycle        → creative fatigue schedule
```

---

## 5. RESPONSE TEMPLATE

```markdown
# 📊 BÁO CÁO ĐỐI THỦ: [Display Name]
> **Trạng thái:** [N] Ads | **Nguồn:** [ScrapeCreators/Apify/Graph] | **🕒 [HH:mm DD/MM/YYYY]**

## 👉 TÌNH TRẠNG QUẢNG CÁO
[Bảng ads — link trực tiếp Ad Library]

### 🏆 CONTROL AD ([N] ngày)
- **Hook:** "[...]"
- **Creative:** [format] — [mô tả ngắn]
- **[ƯỚC TÍNH CHI TIÊU]:** [X]đ ([days] × [benchmark]/ngày)

---
## 🔎 PHÂN TÍCH CHIÊU THỨC

### 1. Chiến lược Vĩ mô
[Tập trung brand? Lead gen? Retarget funnel?]

### 2. Content Pillars
- Trụ cột 1: [VD: UGC feedback - 40%]
- Trụ cột 2: [VD: Giá/Ưu đãi - 35%]
- Trụ cột 3: [VD: Kiến thức - 25%]

### 3. Điểm yếu khai thác
[Đây là góc mà đối thủ đang bỏ ngỏ]

---
## ⚡ ĐỀ XUẤT CHO SẾP
1. **[ATTACK]:** [Cách đánh vào điểm yếu]
2. **[TEST]:** "[Hook/Angle mới dựa trên data]"
3. **[SCALE]:** [Nếu họ đang dùng X hiệu quả → mình thử Y biến thể]
```

---

## 6. WHY displayName > slug

```
slug: "nodocogothucong"
  → Apify searchQueries=["nodocogothucong"] → 0 results

displayName: "Nội Đồ Cổ Gỗ Thủ Công"
  → Apify searchQueries=["Nội Đồ Cổ Gỗ Thủ Công"] → ✅ finds ads

ALWAYS: resolve pageId + findPageDisplayName() trước khi gọi Apify
```

---

## 7. TIKTOK CROSS-PLATFORM

```
apify_tiktok_ads(query: [displayName])
→ So sánh: TikTok ưu tiên Sound-on, UGC thật, hook 3 giây đầu
→ Facebook ưu tiên Text hook mạnh, social proof, CTA rõ
→ Báo cáo sự khác biệt → Gợi ý test angle cross-platform
```

---

## FORBIDDEN OUTPUTS
❌ "Tôi không resolve được page ID" (và dừng lại)
❌ "Apify trả về 0" (và hỏi boss)
❌ "Bạn có muốn dùng browser không?"
❌ "Chọn phương án A/B..."
❌ "Cho phép tôi dùng browser automation..."
✅ Chạy bước tiếp theo trong chain tự động
✅ Nếu tool fail → dùng fallback ngay, không thông báo đến boss trừ khi tất cả fail
