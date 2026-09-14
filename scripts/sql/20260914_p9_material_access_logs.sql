-- feat-11-013 P9 — 강의자료 이용이력 (260914 요청서 §11-4).
--
-- ★가장 급한 한 건이다. 요청서 11-4 는 환불 판정에 네 가지 이용이력을 쓴다 —
--   유료 영상 재생 / 자료 열람 / 자료 다운로드 / 자료 출력.
--   영상은 watch_events 로 이미 남지만, **자료는 아무것도 남지 않는다**:
--   material-download.tsx 는 권한을 판정한 뒤 signed URL 로 보낼 뿐 기록을 하지 않는다.
-- ★★그리고 이건 **소급이 불가능하다.** 지금 로깅을 넣어도 그 이전 이용은 영원히 알 수 없다.
--   그래서 다른 Phase 보다 먼저 넣는다(원장 승인 2026-09-14).
--
-- ★회차 단위 판정을 위해 lesson_id 를 함께 박아 둔다. 요청서 11-4:
--   「같은 회차에서 자료를 여러 번 이용해도 이용 회차는 1회차」 →  DISTINCT lesson_id 로 센다.
--   자료가 회차에 연결되지 않은 공통자료면 lesson_id 가 NULL 이고, 그때는 요청서대로
--   「최소 1회차 이용」으로 계산한다(계산기 쪽 규칙).

create table if not exists public.material_access_logs (
  log_id bigserial primary key,
  material_id uuid not null
    references public.lesson_materials (material_id) on delete cascade,
  -- ★스냅샷이다. 자료가 나중에 다른 회차로 옮겨져도 「그때 어느 회차로 이용했는지」는 불변.
  lesson_id uuid references public.course_lessons (lesson_id) on delete set null,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- 어느 수강권으로 이용했는지 — 주문항목까지 거슬러 올라가는 고리.
  enrollment_id uuid references public.enrollments (enrollment_id) on delete set null,
  -- view=열람 / download=다운로드 / print=출력
  action text not null check (action in ('view', 'download', 'print')),
  accessed_at timestamptz not null default now()
);

comment on table public.material_access_logs is
  '유료 강의자료 이용이력 — 환불 계산의 이용 회차(t) 근거(feat-11-013, 요청서 §11-4). append-only.';

-- 환불 계산은 「이 수강권으로 이용한 고유 회차 수」를 묻는다.
create index if not exists material_access_logs_enrollment_idx
  on public.material_access_logs (enrollment_id, lesson_id);
-- 관리자 화면: 이 학생이 언제 무엇을 이용했는지.
create index if not exists material_access_logs_user_idx
  on public.material_access_logs (user_id, accessed_at desc);

alter table public.material_access_logs enable row level security;

-- 본인 이력 + staff 전체 열람. watch_events·book_downloads 와 같은 짜임.
drop policy if exists material_access_logs_select_own_or_staff on public.material_access_logs;
create policy material_access_logs_select_own_or_staff
  on public.material_access_logs for select
  using (
    user_id = (select auth.uid())
    or private.is_staff((select auth.uid()))
  );

-- ★INSERT 정책을 두지 않는다 — 기록은 서버(adminClient)만 남긴다.
--   학생 클라이언트가 직접 쓸 수 있으면 이용이력을 위조해 환불액을 늘릴 수 있다.
--   ★append-only 규약: UPDATE/DELETE 경로를 만들지 않는다(watch_events 와 같은 규약).
