-- 강의 상품(course/tpass) 상세 페이지 본문 — 히어로 배너와 동일하게 이미지 또는 HTML.
-- 운영자가 /admin/pricing 상품 편집에서 입력, /lecture/catalog/:code 상세에서 렌더.
alter table subscription_plans
  add column if not exists detail_image_url text,
  add column if not exists detail_html text;
