-- errata — 보기 박스 항목(㉠㉡㉢㉣) 편집이 개정 원장에 안 남던 문제 (원장 지적 2026-08-20).
--
-- 증상: 보기에서 문구를 지우고 추록을 발행하려 하면 "변경 전/후"가 비어 있다.
-- 원인: problems·problem_choices 에는 log_revision_* 트리거가 있는데
--       problem_box_items 에는 없어 content_revisions 행이 아예 생기지 않았다.
--       (문항 본체 updated_at 만 갱신 → 노이즈 컬럼이라 그것도 기록되지 않음)
--
-- 조치: fn_log_revision_problem 에 보기 박스 분기를 추가하고 같은 트리거를 단다.
--       source_ref 는 선지와 같은 모양으로 유지하되 table/id/marker 로 구분한다
--       — 발행 모달·정오표가 "지문 ④" 처럼 위치를 짚는 데 쓴다.
-- ★기존 두 트리거의 동작은 바꾸지 않는다(분기 추가만).

create or replace function public.fn_log_revision_problem()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_target   text := tg_argv[0];
  v_ignore   text[] := coalesce(string_to_array(tg_argv[1], ','), '{}');
  v_before   jsonb := case when tg_op='INSERT' then null else to_jsonb(old) end;
  v_after    jsonb := case when tg_op='DELETE' then null else to_jsonb(new) end;
  v_row      jsonb := coalesce(v_after, v_before);
  v_changed  text[];
  v_problem_id text;
  v_format   text;
  v_law_id   uuid;
  v_science  text;
  v_node     text;
  v_ctype    text;
  v_src      jsonb;
begin
  if v_target = 'problems' then
    v_problem_id := v_row ->> 'problem_id';
    v_format     := v_row ->> 'format';
    v_law_id     := nullif(v_row ->> 'law_id','')::uuid;
    v_science    := v_row ->> 'science_subject';
    v_node       := v_row ->> 'primary_node_id';
    v_src        := jsonb_build_object('table','problems','format', v_format);
  elsif v_target = 'problem_box_items' then
    -- 보기 박스(㉠㉡㉢㉣) — 선지와 같은 취급. 위치 표기는 marker 를 쓴다.
    v_problem_id := v_row ->> 'problem_id';
    select p.format, p.law_id, p.science_subject, p.primary_node_id
      into v_format, v_law_id, v_science, v_node
      from problems p where p.problem_id = v_problem_id::uuid;
    v_src := jsonb_build_object(
               'table','problem_box_items',
               'id', v_row ->> 'box_item_id',
               'marker', v_row ->> 'marker',
               'box_no', v_row ->> 'position_index',
               'format', v_format);
  else
    v_problem_id := v_row ->> 'problem_id';
    select p.format, p.law_id, p.science_subject, p.primary_node_id
      into v_format, v_law_id, v_science, v_node
      from problems p where p.problem_id = v_problem_id::uuid;
    v_src := jsonb_build_object(
               'table','problem_choices',
               'id', v_row ->> 'choice_id',
               'choice_no', v_row ->> 'choice_index',
               'format', v_format);
  end if;

  v_ctype := fn_problem_content_type(v_format);
  if fn_revision_suppressed(v_ctype) then return null; end if;

  select coalesce(array_agg(k order by k), '{}') into v_changed
    from (select jsonb_object_keys(coalesce(v_before,'{}'::jsonb) || coalesce(v_after,'{}'::jsonb)) as k) t
   where (coalesce(v_before,'{}'::jsonb) -> k) is distinct from (coalesce(v_after,'{}'::jsonb) -> k)
     and k <> all(v_ignore);

  if tg_op = 'UPDATE' and cardinality(v_changed) = 0 then return null; end if;

  insert into content_revisions (
    content_type, content_id, source_ref, subject_ref, node_id,
    op, before_snapshot, after_snapshot, changed_fields,
    apply_status, applied_at,
    created_by, created_by_label, app_name
  ) values (
    v_ctype,
    v_problem_id,
    v_src,
    -- [편차 D4] 자과 문제는 law_id 가 null — science_subject 를 함께 보존해야 원본 참조가 성립.
    jsonb_build_object('law_id', v_law_id, 'science_subject', v_science),
    v_node,
    tg_op, v_before, v_after, v_changed,
    'applied', now(),
    auth.uid(),
    case when auth.uid() is null then 'system' end,
    current_setting('application_name', true)
  );
  return null;
end $function$;

-- updated_at 은 노이즈 — 그것만 바뀐 UPDATE 는 기록하지 않는다(문항 본체와 같은 정책).
drop trigger if exists log_revision_problem_box_items on public.problem_box_items;
create trigger log_revision_problem_box_items
after insert or delete or update on public.problem_box_items
for each row execute function fn_log_revision_problem('problem_box_items', 'updated_at');
