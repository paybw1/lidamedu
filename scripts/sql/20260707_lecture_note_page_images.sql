-- 강의노트 유출방지 ①: 페이지 이미지 방식 전환.
-- 통합본 밖(확장법 등) 조각 PDF 는 개별 페이지 이미지로 렌더해 서빙 — 페이지 수 저장.
-- 렌더 배치(scripts/lecture-notes/render-page-images.mjs)가 채운다.
alter table public.lecture_resources
  add column if not exists page_count int;

comment on column public.lecture_resources.page_count is
  '페이지 이미지 렌더 수(lecture-note-pages 버킷 res/<resource_id>/<n>.webp). null=미렌더(통합본 매핑 조각은 불필요)';
