-- feat-2-035 — 하급심 판결문 **원본 파일 보관**.
--
-- 그동안 업로드 경로는 텍스트만 뽑아 body_text 에 넣고 원본 바이트를 버렸다
-- ("쓰는 쪽은 body_text 뿐"). 그래서 나중에 원본이 필요해졌을 때 되찾을 수 없었다
-- (원장 요청 2026-08-24 — 2026다202753 원심 2023나11436 원본 PDF).
--
-- ★files = [{ name, path, size, mime }] — name 은 업로드 당시 한글 파일명 그대로(다운로드 표시용),
--   path 는 Storage 키(ASCII 만). 한글을 Storage 키에 넣으면 서명 URL 단계에서 깨진다.
-- ★행당 파일 여러 개 — 심급이 여러 개면 파일도 여러 개다(1심+2심). body_text 는 합본 하나.
-- ★전문 붙여넣기로 본문을 갈아끼우면 files 를 비운다 — 본문과 어긋난 "원본"은 없느니만 못하다.

alter table public.case_lower_courts
  add column if not exists files jsonb not null default '[]'::jsonb;

comment on column public.case_lower_courts.files is
  '업로드 원본 파일 [{name,path,size,mime}] — name=한글 원본명, path=Storage 키. 전문 붙여넣기 시 비운다.';

-- 버킷은 private — 저작물 전문이라 서명 URL(운영자 게이트 통과분)로만 나간다.
-- 사용자 정책을 만들지 않는다: 접근은 adminClient(service_role) 한 경로뿐.
insert into storage.buckets (id, name, public, file_size_limit)
values ('case-lower-courts', 'case-lower-courts', false, 20971520)
on conflict (id) do nothing;
