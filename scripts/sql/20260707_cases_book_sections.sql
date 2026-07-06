-- 판례집 구조화 본문 (feat-3-213) — 교재 섹션 구조 그대로 렌더하기 위한 jsonb.
--   { kind: "tm-book", sections: [{ key, label, blocks: [{type:"p",text} |
--     {type:"table", rows:[[{text, images:[{url,alt}]}]]}] }] }
--   null 이면 기존 필드(summary_items/reasoning_md/comment_body_md) 렌더 (특허 등).
--   검색은 여전히 기존 필드 대상 — 백필 시 기존 필드도 병행 유지.
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS book_sections jsonb;
