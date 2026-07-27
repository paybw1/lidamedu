-- 2026년 이후 선고 특허 판례 → 체계도 '최신판례' 노드 강제 배치.
--   INSERT 시(그리고 decided_at 이 대상 구간으로 "변경"된 UPDATE 시) primary_node_id 를
--   특허 체계도 최상위 case_only '최신판례' 노드로 강제 세팅한다.
--   운영자 승인 = set_primary_placement 로 primary_node_id 를 직접 변경하는 UPDATE —
--   UPDATE 트리거의 WHEN 조건(primary_node_id 불변일 때만)에 걸리지 않으므로
--   승인 후 관련조문 메인 위치로 이동이 가능하고, 이후 일반 메타 저장으로 되돌아가지 않는다.
--   적용: node scripts/run-prod-sql.mjs scripts/sql/20260727_force_latest_case_placement.sql

create or replace function public.force_latest_case_placement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- 강제 배치 시작 시점(선고일 기준). 최신판례 운영 정책 변경 시 이 값만 수정.
  force_from constant date := date '2026-01-01';
  latest_node uuid;
begin
  if new.decided_at is null or new.decided_at < force_from then
    return new;
  end if;
  if new.subject_laws is null or not (new.subject_laws @> array['patent']) then
    return new;
  end if;
  select node_id
    into latest_node
    from systematic_nodes
   where law_code = 'patent'
     and case_only = true
     and parent_id is null
     and display_label like '%최신판례%'
   limit 1;
  if latest_node is null then
    return new;
  end if;
  new.primary_node_id := latest_node;
  return new;
end;
$$;

drop trigger if exists trg_force_latest_case_placement_ins on public.cases;
create trigger trg_force_latest_case_placement_ins
  before insert on public.cases
  for each row
  execute function public.force_latest_case_placement();

drop trigger if exists trg_force_latest_case_placement_upd on public.cases;
create trigger trg_force_latest_case_placement_upd
  before update of decided_at on public.cases
  for each row
  when (old.decided_at is distinct from new.decided_at
        and old.primary_node_id is not distinct from new.primary_node_id)
  execute function public.force_latest_case_placement();
