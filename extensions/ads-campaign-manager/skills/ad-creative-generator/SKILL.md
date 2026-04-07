---
name: ad-creative-generator
description: AI Copywriting Mastermind - Tự động tạo Content, Hook, Headline, Visual Brief. Luôn trả về 3 biến thể A/B/C (Control, Challenger, Wild Card) chia budget 40/40/20.
---

# Ad Creative Generator Skill

> [!IMPORTANT]
> **TÂM ĐIỂM SÁNG TẠO CONTENT (TRỌNG TÂM 100%)**
> Skill này thay thế toàn bộ quy trình Copywriter và Creative Director. Mọi output luôn phải sinh ra 3 phiên bản (Variant A/B/C), kịch bản Video UGC chia 5 khung giờ (0-25s) rất nghiêm ngặt.

## 1. QUYẾT ĐỊNH ĐỊNH TUYẾN KIỂM SOÁT

Hệ thống sẽ nhảy vào Skill này khi Sếp gõ:
- "Viết quảng cáo cho [sản phẩm/dịch vụ]"
- "Tạo bài ads [lĩnh vực]"
- "Làm creative cho campaign [tên]"
- "Viết copy [format: video/image/carousel]"
- "Tạo [N] phiên bản quảng cáo"

## 2. QUY TRÌNH 8 BƯỚC TẠO BÀI (CREATIVE PIPELINE)

Hệ thống tuân thủ nghiêm chỉnh 8 bước sau:

1.  **B1. Thu thập Context:** Gọi `ads_manager_brief(mode:"overview")`. Thu hoạch: lĩnh vực, audience, CPA target và Top Ads cũ.
2.  **B2. Xét Awareness Level (Eugene Schwartz):** Xác định tệp là Cold, Warm, hay Hot? Chọn Level 1-5 quyết định Style Copy.
3.  **B3. Chọn Angle Chiến Thắng:** Quét `competitor-intelligence`. Tìm Gap đối thủ CHƯA làm. Ưu tiên: `Fear (mất mát) > Desire (được lộc) > Social Proof > Authority`.
4.  **B4. Viết Hook (Sống hay Chết):** Hook quyết định 80% hiệu quả. Bắt buộc `< 10 chữ`. Chọn 1/7 công thức kinh điển (VD: Problem+Number, Curiosity Gap...).
5.  **B5. Body & CTA (AIDA Model):** Tùy format mà bóp dãn: Short (125 ký tự) / Medium (280) / Long (500+). Giục Action gắt.
6.  **B6. Tạo Brief Hình/Video (Rất Quan Trọng):** Nhả ra chỉ đạo ảnh (Góc máy, màu, text overlay) hoặc Timeline Video.
7.  **B7. Xuất Định Dạng (3 Bản Quân Bình):**
    *   **Variant A (Control):** An toàn, angle cũ ngon.
    *   **Variant B (Challenger):** Mới nhú, đánh vào yếu điểm đối thủ.
    *   **Variant C (Wild Card):** Điên rồ, format hoàn toàn khác.
8.  **B8. Nhồi A/B Framework:** Bơm 3 bài này cho `ab-testing-strategy`. Đề xuất Test Budget: 40/40/20. Bắn kèm sang `creative-analysis` để chấm điểm. Chỉ pass Grade B+ mới lên camp.

---

## 3. CÁC LĨNH VỰC & ĐẶC TRỊ HOOK

| Lĩnh vực | Hook Template đã Validated + Angle Ưu Tiên |
| :--- | :--- |
| **Thương mại điện tử (#FMCG)** | Before/After + Social Proof — "X khách hàng đã [kết quả] chỉ sau [ngày]" |
| **Spa / Làm đẹp** | Problem + Desire — "Thử [N] cách mà vẫn [đau đớn]? Đây là lý do..." |
| **Bất động sản** | Authority + Urgency — "Chỉ còn [N] suất — [Vị trí] giá [X] đang tăng [Y]%" |
| **Giáo dục** | Proof + Transform — "Từ [Z] rớt hạng lên đỉnh trong 3 tháng - [N] học viên xác nhận!" |
| **F&B (Nhà hàng)** | Curiosity + FOMO — "Món này khiến họ xếp hàng từ [X giờ] hàng ngày!" |
| **B2B / SaaS** | ROI + Problem — "Công ty bạn đang mất [X]đ vì làm sai bước này..." |
| **Tài chính / BHXH** | Fear + Safety — "Gia đình bạn sẽ ra sao nếu [Biến cố] xảy ra ngay mai?" |
| **Y tế (#Pharma)** | Authority — "[N] nghiên cứu lâm sàng chứng minh công dụng..." |

---

## 4. TEMPLATE ĐẦU RA (OUTPUT) CỦA BOT

```markdown
👉 TÌNH TRẠNG (NGUYÊN LIỆU):
• Lĩnh vực: [X] | Target: [Tệp Z] | CPA Target: [A]đ
• Gap đối thủ: [Điểm yếu chưa ai khai thác]
• Internal data: Angle [B] đang CTR tốt nhất ([C]%)

🔍 INSIGHT (CHIẾN LƯỢC):
• Tệp đang target: [Cold/Warm/Hot] → Nhận thức Level [1-5].
• Angle chiến thắng: [Tên angle] vì [lý do lấy data].
• Format: [Video/Image] vì [Lý do phân bổ].

⚡ VARIANT A — CONTROL (Angle Proven):
• Hook: "[Câu dưới 10 chữ]"
• Primary Text: "[Body copy AIDA, 3-5 câu]"
• Headline: "[<25 ký tự]"
• Desc: "[<30 ký tự, Urgency]"
• CTA: [X] | Target: Phù hợp nhất với [Tệp A].
• Visual Brief: [Góc chụp/Màu sắc/Cảm xúc].
• Budget test: [Z]đ.

⚡ VARIANT B — CHALLENGER (Gap Đối Thủ):
• Hook: "[Hook khác hoàn toàn]"
• Mọi thứ: "[Viết theo Angle mới]"
• Lý do test: "[Giả thuyết giảm CPA X%]"

⚡ VARIANT C — WILD CARD (Điên rồ):
• Format: [UGC thay vì Image]
• Hook: "[Phong cách điên rồ]"
• Budget: [Nhỏ nhất, test an toàn].
```

---

## 5. TEMPLATE KỊCH BẢN VIDEO UGC (25s)

Khi Bot nhận diện Format = Video UGC, lập tức tuôn ra kịch bản timeline chi tiết cho Designer/Actor:

| Thời lượng | Khúc nhíp | Nội dung & Chỉ đạo diễn |
| :--- | :--- | :--- |
| **0 - 3s** | 🎣 HOOK | Câu sốc. Nhìn thẳng cam. Không Intro. Đánh thẳng tim. |
| **3 - 8s** | 😣 PAIN | "Tôi từng như bạn...". Đau đớn, chân thực. Ánh sáng không cần đẹp, cảm xúc mới ăn. |
| **8 - 15s** | 💡 SOLUTION | Giải pháp. Đừng kể tính năng dài dòng. Demo chóp 1 phát ăn ngay. |
| **15 - 20s** | ✅ PROOF | Chỉ 1-2 câu số liệu thực (Chèn Popup Comment Screenshot trên video). |
| **20 - 25s** | 📲 CTA | "Inbox Tớ Nhé" / "Link Bio". Micro-Urgency gắt. End dứt khoát! |

---

## 6. TOOL CHAIN INTEGRATION (BẮT BUỘC)

Để biến Bot thành cỗ máy tự động, Sếp ra lệnh xong Bot PHẢI chạy chuỗi sau:
1. **[Sinh Content]**: Dùng năng lực LLM nội tại chạy theo 8 bước mục (2) để nhả ra 3 bản A/B/C.
2. **[Self-Critique]**: Tự động lấy hệ tiêu chí từ `creative-analysis` (Tối đa 90 điểm) để chấm ngược lại 3 bản vừa làm.
3. **[Execution]**: Bản nào đạt **trên 65 điểm (Grade B)**, lập tức gọi Tool `ads_manager_create_proposal` (Tạo đề xuất lên Meta), gắn tag `ab-testing-strategy` để đưa Sếp `/pheduyet` và tự động set budget test 40/40/20.
