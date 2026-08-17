-- 도해 유닛 편집 — staff 쓰기 권한 + 원장(content_revisions) 기록 (원장 지시 2026-08-17)
--
-- 배경: dohae_units 는 SELECT 정책만 있어 시드(service_role) 외에는 쓸 수 없었다.
-- 편집 화면을 붙이기 위해 staff UPDATE 를 열고, 무엇을 고쳤는지 원장에 남긴다.
--
-- ★INSERT/DELETE 는 열지 않는다 — 유닛 추가·삭제는 원본 재파싱(seed-dohae)의 몫이고,
--   화면에서 지울 수 있으면 재시드와 충돌한다.
-- ★편집분은 재시드(book_code 전량 삭제 후 재삽입)로 사라진다 — 원장이 유일한 복구 원천이다
--   (원장 판단 2026-08-17: 날아가도 무방, 대신 무엇을 고쳤는지는 남길 것).

begin;

-- 1) 원장이 받는 content_type 에 'dohae' 추가
alter table public.content_revisions
  drop constraint content_revisions_content_type_check;
alter table public.content_revisions
  add constraint content_revisions_content_type_check
  check (content_type = any (array['statute','precedent','mcq','essay','theory','dohae']));

-- 2) staff UPDATE 정책 — 읽기와 같은 게이트.
create policy dohae_units_staff_update on public.dohae_units
  for update using (private.is_staff(auth.uid()))
  with check (private.is_staff(auth.uid()));

-- 3) 변경 이력 — 판례(cases)와 같은 범용 트리거 재사용.
--    인자: content_type, PK 컬럼, node 컬럼(없음), 과목 컬럼(없음), 무시할 컬럼
--    updated_at 만 바뀐 UPDATE 는 트리거가 알아서 기록하지 않는다.
create trigger log_revision_dohae_units
  after insert or update or delete on public.dohae_units
  for each row execute function fn_log_content_revision(
    'dohae', 'unit_id', '', '', 'updated_at'
  );

commit;

-- 확인
select
  (select json_agg(json_build_object('policy', policyname, 'cmd', cmd))
     from pg_policies where schemaname='public' and tablename='dohae_units')   as policies,
  (select json_agg(tgname) from pg_trigger
    where tgrelid = 'public.dohae_units'::regclass and not tgisinternal)       as triggers,
  (select pg_get_constraintdef(oid) from pg_constraint
    where conrelid = 'public.content_revisions'::regclass
      and conname = 'content_revisions_content_type_check')                    as content_type_check;
