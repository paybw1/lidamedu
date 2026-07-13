-- 히어로 배너 확장: HTML/이미지 배너 + 다단(tier) 배치
-- tier: 1=메인 히어로 캐러셀, 2/3=아래쪽 추가 단
alter table public.landing_banners
  add column if not exists tier smallint not null default 1,
  add column if not exists image_url text,
  add column if not exists body_html text;

-- 배너 이미지 공개 버킷(공개 read; 업로드는 service_role adminClient 경유).
insert into storage.buckets (id, name, public)
values ('landing-banners', 'landing-banners', true)
on conflict (id) do nothing;
