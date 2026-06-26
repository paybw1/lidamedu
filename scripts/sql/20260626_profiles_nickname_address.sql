-- 이메일/소셜 회원가입 수집 항목 확장: 닉네임·주소 (선택 항목, nullable)
-- profiles 의 기존 self-RLS 가 그대로 적용되어 본인만 read/write.
alter table public.profiles
  add column if not exists nickname text,
  add column if not exists address text;
