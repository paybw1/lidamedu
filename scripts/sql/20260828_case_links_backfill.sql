-- feat-3-214 A단계 백필 ① — 기존 단일 배치를 대표 링크로 옮긴다.
-- 트리거가 아니라 직접 insert 한다(트리거는 앞으로의 변경만 따라간다).
insert into public.case_systematic_links (case_id, node_id, is_primary, seq, source_seq)
select c.case_id, c.primary_node_id, true, 1, c.source_seq
from public.cases c
where c.primary_node_id is not null
on conflict (case_id, node_id) do update set is_primary = true;
