-- 학원시설 소개(/lecture/facilities) 사진 버킷 — 공개 읽기(anon), 업로드는 service_role.
insert into storage.buckets (id, name, public, file_size_limit)
values ('facility-photos', 'facility-photos', true, 5242880)
on conflict (id) do nothing;
