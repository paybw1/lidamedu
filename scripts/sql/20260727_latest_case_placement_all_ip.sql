-- 최신판례 강제 배치 확대 — 특허 단독 → 특허·상표·디자인 3과목(사용자 결정 2026-07-27).
--   ① 디자인 체계도에 최상위 case_only '11 최신판례' 노드 신설(특허 b11/상표 b14 컨벤션).
--   ② force_latest_case_placement() 를 subject_laws 순회로 일반화 — 판례의 subject_laws
--      중 3과목에 해당하고 최신판례 노드가 있는 첫 과목의 노드로 강제.
--   트리거 자체(ins/upd)는 20260727_force_latest_case_placement.sql 그대로.
--   적용: node scripts/run-prod-sql.mjs scripts/sql/20260727_latest_case_placement_all_ip.sql

insert into systematic_nodes
  (node_id, law_code, parent_id, path, display_label, ord, case_only, case_display_label)
select gen_random_uuid(), 'design', null, 'design.b11', '11 최신판례', 11, true, '11 최신판례'
 where not exists (
   select 1
     from systematic_nodes
    where law_code = 'design'
      and case_only = true
      and parent_id is null
      and display_label like '%최신판례%'
 );

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
        new.primary_node_id := latest_node;
        return new;
      end if;
    end if;
  end loop;
  return new;
end;
$$;
