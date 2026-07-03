-- 팝업 공지 A안 — 이미지 팝업 + 유튜브 임베드.
-- image_url: 운영자가 업로드한 디자인 이미지(public 버킷 popup-notices).
-- youtube_url: 유튜브 영상 URL(표시 시 embed 로 변환).
ALTER TABLE public.popup_notices ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.popup_notices ADD COLUMN IF NOT EXISTS youtube_url text;

-- 공지 이미지 버킷 — 공개 읽기(공지는 공개 콘텐츠), 쓰기는 service_role(운영자 API)만.
insert into storage.buckets (id, name, public)
values ('popup-notices', 'popup-notices', true)
on conflict (id) do nothing;
