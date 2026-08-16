-- 도해특허법 유닛 ↔ 체계도 노드 연결 (feat: dohae)
-- 종전엔 dohae_unit_articles(조문 ↔ 유닛) 뿐이라 조문 뷰어에서만 도해 칩이 떴다.
-- 사용자 결정 2026-08-16: 도해 진입은 **체계도 노드** 에서 — 대응표(93유닛) 확정본을 적재한다.
-- dohae_unit_articles 는 그대로 둔다(조문 참조 정보 자체는 콘텐츠, 되돌릴 때도 필요).
-- ★staff 전용 — 기존 도해 테이블과 동일하게 SELECT=is_staff, 쓰기 정책 없음(시드=service_role).

begin;

create table public.dohae_unit_nodes (
  unit_id uuid not null references public.dohae_units (unit_id) on delete cascade,
  node_id uuid not null references public.systematic_nodes (node_id) on delete cascade,
  primary key (unit_id, node_id)
);

comment on table public.dohae_unit_nodes is
  '도해 유닛 ↔ 체계도 노드. 체계도 노드 뷰어의 도해 칩 판정·팝업 목록. staff 전용.';

-- 노드 → 유닛 조회(노드 뷰어 진입 경로)가 주 사용 패턴.
create index dohae_unit_nodes_node_idx on public.dohae_unit_nodes (node_id);

alter table public.dohae_unit_nodes enable row level security;

create policy dohae_unit_nodes_staff_select on public.dohae_unit_nodes
  for select using (private.is_staff(auth.uid()));

commit;
