-- 최신판례 승인대기 중 "예약 배치" (사용자 결정 2026-07-27 3차).
--   승인대기(primary_node_id=최신판례) 상태에서 운영자가 메인 조문(★)·sub-node 를 미리
--   지정해도 최신판례에 머물도록, 지정값은 pending_primary_node_id 에 예약해 두고
--   승인(approve_latest_case intent) 시에만 primary_node_id 로 반영한다.
--   트리거도 강제 배치 시 기존/명시 노드를 pending 으로 보존하게 갱신.
--   적용: node scripts/run-prod-sql.mjs scripts/sql/20260727_latest_case_pending_placement.sql

alter table public.cases
  add column if not exists pending_primary_node_id uuid
    references public.systematic_nodes(node_id) on delete set null;

comment on column public.cases.pending_primary_node_id is
  '최신판례 승인대기 중 예약된 체계도 노드 — 승인 시 primary_node_id 로 반영 후 null';

create or replace function public.force_latest_case_placement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- 강제 배치 시작 시점(선고일 기준). 최신판례 운영 정책 변경 시 이 값만 수정.
  force_from constant date := date '2026-01-01';
  target_subjects constant text[] := array['patent', 'trademark', 'design'];
  latest_node uuid;
  subj text;
begin
  if new.decided_at is null or new.decided_at < force_from then
    return new;
  end if;
  if new.subject_laws is null then
    return new;
  end if;
  foreach subj in array new.subject_laws loop
    if subj = any (target_subjects) then
      select node_id
        into latest_node
        from systematic_nodes
       where law_code = subj
         and case_only = true
         and parent_id is null
         and display_label like '%최신판례%'
       limit 1;
      if latest_node is not null then
        -- 강제 전 명시/기존 노드는 예약(pending)으로 보존 — 승인 시 그 위치로 복귀.
        if new.primary_node_id is not null and new.primary_node_id <> latest_node then
          new.pending_primary_node_id := new.primary_node_id;
        end if;
        new.primary_node_id := latest_node;
        return new;
      end if;
    end if;
  end loop;
  return new;
end;
$$;
