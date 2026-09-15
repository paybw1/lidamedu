// 레벨 체계(1~7) 준비도 감사 — 운영 DB 읽기 전용 점검.
//
// 사용:
//   node scripts/audit/audit-level-readiness.mjs discover   # schema.md + audit-config.json 초안
//   node scripts/audit/audit-level-readiness.mjs audit      # audit-output/<시각>/report.md + CSV
//
// ★접근 경로는 run-prod-sql.mjs 와 같다 — Supabase Management API + SUPABASE_ACCESS_TOKEN(.env).
//   새 의존성 없음(pg 미사용). 직접 pg 연결은 운영을 못 가리켜 이미 버린 경로다.
// ★모든 쿼리는 `begin read only; … rollback;` 으로 감싼다. 실측으로 확인:
//   그 안에서도 SELECT 결과가 그대로 돌아오고 transaction_read_only='on' 이다.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import "dotenv/config";

const REF = "mcgdoplovrjgklbxmozi"; // 운영
const OUT_ROOT = "audit-output";

// ── 실행기 ──────────────────────────────────────────────────────────────────

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error("SUPABASE_ACCESS_TOKEN 미설정 (.env)");
  process.exit(1);
}

/** 쓰기 문장이 섞여 들어오는 것을 막는 최소 가드. 트랜잭션이 최종 방어선이다. */
const FORBIDDEN = /\b(insert|update|delete|truncate|alter|drop|create|grant|revoke)\b/i;

async function runSql(sql, label) {
  if (FORBIDDEN.test(sql)) throw new Error(`쓰기 문장이 섞였습니다 — ${label}`);
  const wrapped = `begin read only;\n${sql}\nrollback;`;
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: wrapped }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${label} 실패 (HTTP ${res.status})\n${text}`);
  return JSON.parse(text);
}

/** `select … as result` 한 줄짜리 쿼리의 결과를 꺼낸다. */
async function one(sql, label) {
  const rows = await runSql(sql, label);
  return rows?.[0]?.result ?? null;
}

// ── 공통 CTE — 과목 축과 노드 해소 경로 ─────────────────────────────────────
//
// ★노드 해소는 **경로가 여럿**이고 우선순위가 있다. 경로별로 따로 계산해 두고
//   최종 노드는 우선순위로 정한다(요청 4번). 경로 간 불일치를 보려면 둘 다 필요하다.
//
// 사건번호 정규화 규칙(요청 1번 — 리포트에 명시):
//   ① 모든 공백 제거  ② `[0-9]{2,4}[가-힣]{1,3}[0-9]+` 첫 매치를 사건번호로 본다
//   → 「대법원 2001.11.30. 선고 2001후65」 → 「2001후65」
//   법원명 접두어·선고일·「선고」가 이 한 규칙으로 함께 떨어진다. 실측 추출 실패 0건.
//   FK(`related_case_id`) 백필은 이번 범위 밖이다.
const CASE_NORM = `substring(regexp_replace(%s, '\\s+', '', 'g') from '[0-9]{2,4}[가-힣]{1,3}[0-9]+')`;

const CTE = `
with prob as (
  select p.problem_id, p.format::text fmt, p.polarity::text polarity,
         p.review_status::text review_status,
         p.primary_node_id, p.primary_article_id,
         coalesce(l.law_code, case when p.subject_type::text = 'science' then 'science' end) subj
  from problems p left join laws l on l.law_id = p.law_id
  where p.deleted_at is null
),
ch as (
  select c.*, pr.subj, pr.fmt, pr.polarity
  from problem_choices c join prob pr using (problem_id)
),
cn as (
  select c.choice_id, c.problem_id, c.subj, 'direct'::text path, c.related_node_id node_id
    from ch c where c.related_node_id is not null
  union all
  select c.choice_id, c.problem_id, c.subj, 'article', a.node_id
    from ch c join article_systematic_links a on a.article_id = c.related_article_id
  union all
  select c.choice_id, c.problem_id, c.subj, 'case_text', s.node_id
    from ch c
    join cases cs
      on regexp_replace(cs.case_number, '\\s+', '', 'g')
       = ${CASE_NORM.replace("%s", "c.related_case_number")}
     and cs.deleted_at is null
    join case_systematic_links s on s.case_id = cs.case_id
),
pn as (
  select p.problem_id, p.subj, 'primary_node'::text path, p.primary_node_id node_id
    from prob p where p.primary_node_id is not null
  union all
  select p.problem_id, p.subj, 'primary_article', a.node_id
    from prob p join article_systematic_links a on a.article_id = p.primary_article_id
  union all
  select p.problem_id, p.subj, 'systematic_link', l.node_id
    from prob p join problem_systematic_links l on l.problem_id = p.problem_id
)
`;

/** 체계도가 없는 과목 — 노드 기반 점검(2·3·6)에서 제외하고 「체계도 없음」으로 표기(요청 2번). */
const NO_TREE_SUBJECTS = ["science", "civil-procedure"];
const noTreeSql = `('${NO_TREE_SUBJECTS.join("','")}')`;

// ── discover ────────────────────────────────────────────────────────────────

const DISCOVER_SQL = `
select jsonb_build_object(
  'tables', (select jsonb_object_agg(table_name, cols) from (
      select c.table_name,
             jsonb_agg(c.column_name || ' ' || c.data_type ||
                       case when c.is_nullable = 'NO' then ' NOT NULL' else '' end
                       order by c.ordinal_position) cols
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema and t.table_name = c.table_name
      where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
        and c.table_name in ('problems','problem_choices','problem_systematic_links',
                             'systematic_nodes','article_systematic_links','case_systematic_links',
                             'user_problem_attempts','cases','articles','laws','lesson_node_links')
      group by c.table_name) x),
  'enums', (select jsonb_object_agg(t, vals) from (
      select ty.typname t, jsonb_agg(e.enumlabel order by e.enumsortorder) vals
      from pg_type ty join pg_enum e on e.enumtypid = ty.oid
      join pg_namespace n on n.oid = ty.typnamespace
      where n.nspname = 'public'
        and ty.typname in ('problem_format','problem_polarity','problem_scope',
                           'problem_review_status','ox_truth','problem_choice_type')
      group by ty.typname) y),
  'defaults', (select jsonb_object_agg(column_name,
                 jsonb_build_object('default', column_default, 'nullable', is_nullable))
    from information_schema.columns
    where table_schema = 'public' and table_name = 'problem_choices'
      and column_name in ('ox_ineligible','ox_truth','related_node_id')),
  'softDelete', (select coalesce(jsonb_agg(table_name order by table_name), '[]'::jsonb)
    from information_schema.columns
    where table_schema = 'public' and column_name = 'deleted_at'
      and table_name in ('problems','problem_choices','systematic_nodes','cases','articles')),
  'difficultyCandidates', (select coalesce(jsonb_agg(table_name || '.' || column_name), '[]'::jsonb)
    from information_schema.columns
    where table_schema = 'public'
      and (column_name ilike '%difficult%' or column_name ilike '%tier%' or column_name ilike '%level%'))
) as result;
`;

async function discover() {
  const d = await one(DISCOVER_SQL, "discover");
  mkdirSync(OUT_ROOT, { recursive: true });

  const lines = ["# 레벨 준비도 감사 — 스키마 실측", ""];
  lines.push(`생성: ${new Date().toISOString()}  ·  프로젝트 ${REF}`, "");
  lines.push("## 테이블");
  for (const [t, cols] of Object.entries(d.tables ?? {}).sort()) {
    lines.push(`\n### ${t}`, "", "```", ...cols, "```");
  }
  lines.push("", "## enum");
  for (const [t, vals] of Object.entries(d.enums ?? {}).sort()) {
    lines.push(`- \`${t}\`: ${vals.join(", ")}`);
  }
  lines.push("", "## problem_choices 기본값");
  for (const [c, v] of Object.entries(d.defaults ?? {})) {
    lines.push(`- \`${c}\`: default=\`${v.default ?? "없음"}\` nullable=${v.nullable}`);
  }
  lines.push("", "## soft delete 컬럼이 있는 테이블");
  lines.push((d.softDelete ?? []).map((t) => `\`${t}\``).join(", ") || "(없음)");
  lines.push("", "## 난이도 후보 컬럼");
  lines.push((d.difficultyCandidates ?? []).map((t) => `\`${t}\``).join(", ") || "(없음)");
  writeFileSync(join(OUT_ROOT, "schema.md"), lines.join("\n"), "utf8");

  const config = {
    _주석: "역할별 매핑. 이 파일을 고치면 audit 이 그대로 따른다.",
    문제: { table: "problems", softDelete: "deleted_at", 승인: "review_status='approved'" },
    선지: { table: "problem_choices", softDelete: null, _주석: "앱에 삭제 경로가 없다" },
    노드: { table: "systematic_nodes", 권위: "parent_id + ord", _주석: "path 는 정렬에 신뢰하지 않는다" },
    문제_노드: ["problems.primary_node_id", "problems.primary_article_id→article_systematic_links", "problem_systematic_links"],
    선지_노드: ["problem_choices.related_node_id", "related_article_id→article_systematic_links", "related_case_number→cases→case_systematic_links"],
    선지_정오: "problem_choices.ox_truth",
    OX_적합: "ox_truth is not null AND ox_ineligible = false",
    발문유형: "problems.polarity",
    정답: "problem_choices.is_correct",
    풀이: "user_problem_attempts",
    체계도없는과목: NO_TREE_SUBJECTS,
    사건번호정규화: "공백제거 후 [0-9]{2,4}[가-힣]{1,3}[0-9]+ 첫 매치",
  };
  writeFileSync(join(OUT_ROOT, "audit-config.json"), JSON.stringify(config, null, 2), "utf8");
  console.log(`schema.md · audit-config.json → ${OUT_ROOT}/`);
}

// ── audit ───────────────────────────────────────────────────────────────────

const csvCell = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
function writeCsv(dir, name, rows) {
  const list = rows ?? [];
  if (list.length === 0) {
    writeFileSync(join(dir, name), "(해당 없음)\n", "utf8");
    return 0;
  }
  const cols = Object.keys(list[0]);
  const body = [cols.join(","), ...list.map((r) => cols.map((c) => csvCell(r[c])).join(","))];
  writeFileSync(join(dir, name), "﻿" + body.join("\n") + "\n", "utf8");
  return list.length;
}
const table = (header, rows) =>
  [`| ${header.join(" | ")} |`, `|${header.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");
const num = (n) => (n == null ? "—" : Number(n).toLocaleString("ko-KR"));
const pct = (a, b) => (b ? `${Math.round((a / b) * 1000) / 10}%` : "—");

const Q = {
  // 1. 과목별 기본 + OX 3분류(요청 3번)
  subjects: `${CTE}
select jsonb_agg(row_to_json(t) order by t.subj) as result from (
  select p.subj,
         count(distinct p.problem_id) problems,
         count(distinct p.problem_id) filter (where p.fmt like 'mc%') mc_problems,
         (select count(*) from ch c where c.subj = p.subj) choices,
         count(distinct p.problem_id) filter (where exists (select 1 from pn where pn.problem_id = p.problem_id)) prob_tagged,
         (select count(distinct c.choice_id) from ch c
           where c.subj = p.subj and exists (select 1 from cn where cn.choice_id = c.choice_id)) choice_tagged,
         (select count(*) from ch c where c.subj = p.subj and c.ox_truth is not null and not c.ox_ineligible) ox_fit,
         (select count(*) from ch c where c.subj = p.subj and c.ox_ineligible) ox_unfit,
         (select count(*) from ch c where c.subj = p.subj and c.ox_truth is null and not c.ox_ineligible) ox_unreviewed
  from prob p group by p.subj) t;`,

  // 2. 태깅 커버리지
  coverage: `${CTE}
select jsonb_build_object(
  'partiallyTagged', (
    select count(*) from (
      select c.problem_id from ch c
      where c.subj not in ${noTreeSql}
      group by c.problem_id
      having count(*) filter (where exists (select 1 from cn where cn.choice_id = c.choice_id)) > 0
         and count(*) filter (where not exists (select 1 from cn where cn.choice_id = c.choice_id)) > 0) x),
  'choiceNodeCountDist', (
    select jsonb_object_agg(bucket, n) from (
      select case when k = 1 then '1' when k = 2 then '2' else '3+' end bucket, count(*) n
      from (select cn.choice_id, count(distinct cn.node_id) k from cn group by 1) y
      group by 1) z),
  'deadNodeRefs', (
    select jsonb_build_object(
      'choice_direct', (select count(*) from ch c where c.related_node_id is not null
         and not exists (select 1 from systematic_nodes n where n.node_id = c.related_node_id)),
      'problem_primary', (select count(*) from prob p where p.primary_node_id is not null
         and not exists (select 1 from systematic_nodes n where n.node_id = p.primary_node_id)))),
  'pathContribution', jsonb_build_object(
    'choice', (select jsonb_object_agg(path, n) from (select path, count(distinct choice_id) n from cn group by 1) a),
    'problem', (select jsonb_object_agg(path, n) from (select path, count(distinct problem_id) n from pn group by 1) b)),
  'pathAgreement', jsonb_build_object(
    'choice_multi_path', (select count(*) from (
        select choice_id from cn group by 1 having count(distinct path) > 1) c1),
    'choice_multi_path_disagree', (select count(*) from (
        select choice_id from cn group by 1
        having count(distinct path) > 1
           and count(distinct node_id) > 1) c2),
    'problem_multi_path', (select count(*) from (
        select problem_id from pn group by 1 having count(distinct path) > 1) p1),
    'problem_multi_path_disagree', (select count(*) from (
        select problem_id from pn group by 1
        having count(distinct path) > 1 and count(distinct node_id) > 1) p2))
) as result;`,

  // 3. 문제 노드집합 vs 선지 노드합집합
  setCompare: `${CTE},
ps as (select problem_id, array_agg(distinct node_id::text order by node_id::text) s from pn group by 1),
cs2 as (select problem_id, array_agg(distinct node_id::text order by node_id::text) s from cn group by 1),
cmp as (
  select p.problem_id, p.subj,
         coalesce(ps.s, '{}') pnodes, coalesce(cs2.s, '{}') cnodes,
         case
           when ps.s is null and cs2.s is null then 'both_missing'
           when ps.s is null then 'problem_missing'
           when cs2.s is null then 'choice_missing'
           when ps.s @> cs2.s and cs2.s @> ps.s then 'equal'
           when cs2.s @> ps.s then 'problem_subset'
           when ps.s @> cs2.s then 'choice_subset'
           when ps.s && cs2.s then 'overlap'
           else 'disjoint' end verdict
  from prob p left join ps on ps.problem_id = p.problem_id
              left join cs2 on cs2.problem_id = p.problem_id
  where p.subj not in ${noTreeSql} and p.fmt like 'mc%')
select jsonb_build_object(
  'bySubject', (select jsonb_agg(row_to_json(t) order by t.subj, t.verdict)
    from (select subj, verdict, count(*) n from cmp group by 1, 2) t),
  'mismatches', (select coalesce(jsonb_agg(row_to_json(m)), '[]'::jsonb) from (
    select problem_id, subj, verdict,
           array_length(pnodes, 1) problem_nodes, array_length(cnodes, 1) choice_nodes
    from cmp where verdict in ('disjoint','overlap','problem_missing') limit 5000) m)
) as result;`,

  // 4. OX 자동 검증
  oxCheck: `${CTE},
ans as (
  select c.problem_id, c.fmt, c.polarity, c.subj,
         count(*) filter (where c.is_correct) correct_n,
         count(*) filter (where c.ox_truth = 'O') o_n,
         count(*) filter (where c.ox_truth = 'X') x_n,
         count(*) filter (where c.ox_truth is not null) truth_n,
         count(*) total_n,
         count(*) filter (where c.is_correct and c.ox_truth = 'O') correct_o,
         count(*) filter (where c.is_correct and c.ox_truth = 'X') correct_x
  from ch c group by 1,2,3,4)
select jsonb_build_object(
  'truthDist', (select jsonb_object_agg(coalesce(t,'(null)'), n) from (
      select ox_truth::text t, count(*) n from ch group by 1) d),
  'fitNoTruth', (select count(*) from ch where not ox_ineligible and ox_truth is null),
  'unfitWithTruth', (select count(*) from ch where ox_ineligible and ox_truth is not null),
  'scope', (select jsonb_build_object(
      'eligible_problems', count(*) filter (where a.fmt = 'mc_short' and a.correct_n = 1 and a.truth_n > 0),
      'excluded_multi_answer', count(*) filter (where a.correct_n <> 1),
      'excluded_box', count(*) filter (where a.fmt = 'mc_box'),
      'excluded_no_polarity', count(*) filter (where a.polarity is null and a.fmt = 'mc_short'))
    from ans a),
  'errors', (select coalesce(jsonb_agg(row_to_json(e)), '[]'::jsonb) from (
    select a.problem_id, a.subj, a.polarity, a.correct_n, a.o_n, a.x_n, a.truth_n, a.total_n,
      case
        when a.polarity = 'positive' and a.correct_o <> 1 then '옳은 것 발문인데 정답 선지의 정오값이 O 가 아님'
        when a.polarity = 'positive' and a.o_n <> 1 and a.truth_n = a.total_n then '옳은 것 발문인데 O 가 정답 선지 하나가 아님'
        when a.polarity = 'negative' and a.correct_x <> 1 then '옳지 않은 것 발문인데 정답 선지의 정오값이 X 가 아님'
        when a.polarity = 'negative' and a.x_n <> 1 and a.truth_n = a.total_n then '옳지 않은 것 발문인데 X 가 정답 선지 하나가 아님'
      end reason
    from ans a
    where a.fmt = 'mc_short' and a.correct_n = 1 and a.truth_n > 0 and a.polarity is not null
      and (
        (a.polarity = 'positive' and (a.correct_o <> 1 or (a.o_n <> 1 and a.truth_n = a.total_n)))
     or (a.polarity = 'negative' and (a.correct_x <> 1 or (a.x_n <> 1 and a.truth_n = a.total_n))))
    limit 5000) e),
  'undecidable', (select coalesce(jsonb_agg(row_to_json(u)), '[]'::jsonb) from (
    select a.problem_id, a.subj, a.fmt, a.correct_n,
           case when a.polarity is null then '발문 유형(polarity) 미설정'
                when a.correct_n <> 1 then '복수정답 또는 정답 없음'
                when a.fmt = 'mc_box' then '박스형(조합형·개수형 혼재)'
                else '기타' end reason
    from ans a
    where a.truth_n > 0 and (a.polarity is null or a.correct_n <> 1 or a.fmt = 'mc_box')
    limit 5000) u)
) as result;`,

  // 5. 난이도
  difficulty: `
select jsonb_build_object(
  'onProblems', (select coalesce(jsonb_agg(column_name), '[]'::jsonb)
    from information_schema.columns
    where table_schema='public' and table_name='problems'
      and (column_name ilike '%difficult%' or column_name ilike '%tier%' or column_name ilike '%level%')),
  'elsewhere', (select coalesce(jsonb_agg(table_name || '.' || column_name order by table_name), '[]'::jsonb)
    from information_schema.columns
    where table_schema='public'
      and (column_name ilike '%difficult%' or column_name ilike '%tier%')),
  'importanceFill', (select jsonb_build_object(
      'set', count(*) filter (where importance is not null), 'null', count(*) filter (where importance is null))
    from problems where deleted_at is null)
) as result;`,

  // 6. 말단 노드별
  leaves: `${CTE},
leaf as (
  select n.node_id, n.law_code, n.display_label, n.case_only, n.article_only
  from systematic_nodes n
  where n.law_code not in ${noTreeSql}
    and not exists (select 1 from systematic_nodes k where k.parent_id = n.node_id))
select jsonb_build_object(
  'rows', (select coalesce(jsonb_agg(row_to_json(r)), '[]'::jsonb) from (
    select l.law_code, l.display_label,
           case when l.case_only then '판례전용' when l.article_only then '조문전용' else '공통' end node_kind,
           (select count(distinct pn.problem_id) from pn where pn.node_id = l.node_id) problems,
           (select count(distinct cn.choice_id) from cn where cn.node_id = l.node_id) choices,
           (select count(distinct cn.choice_id) from cn join ch c on c.choice_id = cn.choice_id
             where cn.node_id = l.node_id and c.ox_truth is not null and not c.ox_ineligible) ox_choices,
           (select count(*) from user_problem_attempts a
             where a.problem_id in (select pn.problem_id from pn where pn.node_id = l.node_id)) attempts,
           (select count(distinct a.user_id) from user_problem_attempts a
             where a.problem_id in (select pn.problem_id from pn where pn.node_id = l.node_id)) students
    from leaf l) r),
  'thin', (select jsonb_agg(row_to_json(s) order by s.law_code, s.node_kind) from (
    select l.law_code,
           case when l.case_only then '판례전용' when l.article_only then '조문전용' else '공통' end node_kind,
           count(*) leaves,
           count(*) filter (where (select count(*) from cn where cn.node_id = l.node_id) = 0) zero_choice,
           count(*) filter (where (select count(*) from cn where cn.node_id = l.node_id) < 10) lt10_choice,
           count(*) filter (where (select count(distinct cn.choice_id) from cn join ch c on c.choice_id = cn.choice_id
             where cn.node_id = l.node_id and c.ox_truth is not null and not c.ox_ineligible) < 10) lt10_ox
    from leaf l group by 1, 2) s)
) as result;`,

  // 7. 풀이 기록 — mode 별 분리
  attempts: `
select jsonb_build_object(
  'byMode', (select jsonb_agg(row_to_json(t) order by t.mode, t.kind) from (
    select a.mode, case when a.ox_answer is null then 'mcq' else 'ox' end kind,
           count(*) n,
           count(*) filter (where a.selected_choice_id is not null) with_choice
    from user_problem_attempts a group by 1, 2) t),
  'mcqMismatch', (select count(*) from user_problem_attempts a
    join problem_choices c on c.choice_id = a.selected_choice_id
    where a.ox_answer is null and a.is_correct <> c.is_correct),
  'oxMismatch', (select count(*) from user_problem_attempts a
    join problem_choices c on c.choice_id = a.selected_choice_id
    where a.ox_answer is not null and c.ox_truth is not null
      and a.is_correct <> (a.ox_answer::text = c.ox_truth::text)),
  'oxNoTruth', (select count(*) from user_problem_attempts a
    join problem_choices c on c.choice_id = a.selected_choice_id
    where a.ox_answer is not null and c.ox_truth is null),
  'oxMismatchExplainedByErrata', (select count(*) from user_problem_attempts a
    join problem_choices c on c.choice_id = a.selected_choice_id
    where a.ox_answer is not null and c.ox_truth is not null
      and a.is_correct <> (a.ox_answer::text = c.ox_truth::text)
      and exists (select 1 from content_revisions g
        where g.content_type::text = 'mcq' and g.content_id = a.problem_id::text
          and g.changed_fields::text ilike '%ox_truth%' and g.created_at > a.attempted_at)),
  'mismatchRows', (select coalesce(jsonb_agg(row_to_json(m)), '[]'::jsonb) from (
    select a.attempt_id, a.problem_id, a.selected_choice_id, a.mode,
           case when a.ox_answer is null then 'mcq' else 'ox' end kind,
           a.is_correct recorded, a.ox_answer::text ox_answer, c.ox_truth::text ox_truth,
           c.is_correct choice_is_correct, a.attempted_at,
           (select count(*) from content_revisions g
             where g.content_type::text = 'mcq' and g.content_id = a.problem_id::text
               and g.changed_fields::text ilike '%ox_truth%'
               and g.created_at > a.attempted_at) truth_changed_after
    from user_problem_attempts a
    join problem_choices c on c.choice_id = a.selected_choice_id
    where (a.ox_answer is null and a.is_correct <> c.is_correct)
       or (a.ox_answer is not null and c.ox_truth is not null
           and a.is_correct <> (a.ox_answer::text = c.ox_truth::text))
    limit 2000) m),
  'perProblem', (select jsonb_build_object(
      'ge1', count(*) filter (where n >= 1), 'ge10', count(*) filter (where n >= 10),
      'ge30', count(*) filter (where n >= 30), 'ge100', count(*) filter (where n >= 100))
    from (select problem_id, count(*) n from user_problem_attempts group by 1) p),
  'students', (select count(distinct user_id) from user_problem_attempts)
) as result;`,

  // 사건번호 정규화 결과(요청 1번)
  caseNorm: `${CTE},
cc as (select c.choice_id, c.subj, c.related_case_number raw,
              ${CASE_NORM.replace("%s", "c.related_case_number")} norm
       from ch c where c.related_case_number is not null)
select jsonb_build_object(
  'total', (select count(*) from cc),
  'rawMatch', (select count(*) from cc where exists (
      select 1 from cases s where s.case_number = cc.raw and s.deleted_at is null)),
  'normMatch', (select count(*) from cc where exists (
      select 1 from cases s where regexp_replace(s.case_number,'\\s+','','g') = cc.norm and s.deleted_at is null)),
  'reachesNode', (select count(*) from cc where exists (
      select 1 from cases s join case_systematic_links l on l.case_id = s.case_id
      where regexp_replace(s.case_number,'\\s+','','g') = cc.norm and s.deleted_at is null)),
  'noMatchRows', (select coalesce(jsonb_agg(row_to_json(a)), '[]'::jsonb) from (
    select distinct cc.subj, cc.raw, cc.norm from cc
    where not exists (select 1 from cases s
      where regexp_replace(s.case_number,'\\s+','','g') = cc.norm and s.deleted_at is null)
    limit 5000) a),
  'noNodeRows', (select coalesce(jsonb_agg(row_to_json(b)), '[]'::jsonb) from (
    select distinct cc.subj, cc.raw, cc.norm from cc
    where exists (select 1 from cases s
            where regexp_replace(s.case_number,'\\s+','','g') = cc.norm and s.deleted_at is null)
      and not exists (select 1 from cases s join case_systematic_links l on l.case_id = s.case_id
            where regexp_replace(s.case_number,'\\s+','','g') = cc.norm and s.deleted_at is null)
    limit 5000) b)
) as result;`,

  lessonNodeLinks: `select jsonb_build_object('n', (select count(*) from lesson_node_links)) as result;`,
};

async function audit() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dir = join(OUT_ROOT, stamp);
  mkdirSync(dir, { recursive: true });
  console.log(`감사 시작 → ${dir}`);

  const r = {};
  for (const [k, sql] of Object.entries(Q)) {
    process.stdout.write(`  ${k} … `);
    r[k] = await one(sql, k);
    console.log("ok");
  }

  // CSV
  const csv = {};
  csv.mismatch = writeCsv(dir, "node-set-mismatch.csv", r.setCompare?.mismatches);
  csv.oxErrors = writeCsv(dir, "ox-verify-errors.csv", r.oxCheck?.errors);
  csv.oxUndecidable = writeCsv(dir, "ox-undecidable.csv", r.oxCheck?.undecidable);
  csv.leaves = writeCsv(dir, "leaf-nodes.csv", r.leaves?.rows);
  csv.attemptMismatch = writeCsv(dir, "attempt-mismatch.csv", r.attempts?.mismatchRows);
  csv.caseNoMatch = writeCsv(dir, "case-number-unmatched.csv", r.caseNorm?.noMatchRows);
  csv.caseNoNode = writeCsv(dir, "case-matched-but-no-node.csv", r.caseNorm?.noNodeRows);

  writeFileSync(join(dir, "raw.json"), JSON.stringify(r, null, 2), "utf8");
  writeFileSync(join(dir, "report.md"), buildReport(r, csv, stamp), "utf8");
  console.log(`\n완료 — ${join(dir, "report.md")}`);
}

function buildReport(r, csv, stamp) {
  const S = r.subjects ?? [];
  const totalChoices = S.reduce((a, s) => a + Number(s.choices), 0);
  const totalOxFit = S.reduce((a, s) => a + Number(s.ox_fit), 0);
  const unfitWithTruth = Number(r.oxCheck?.unfitWithTruth ?? 0);
  const dead = r.coverage?.deadNodeRefs ?? {};
  const disagreeC = Number(r.coverage?.pathAgreement?.choice_multi_path_disagree ?? 0);
  const noDifficulty = (r.difficulty?.onProblems ?? []).length === 0;

  const L = [];
  L.push("# 레벨 체계(1~7) 준비도 감사", "");
  L.push(`실행 ${stamp} · 프로젝트 \`${REF}\` · **읽기 전용 트랜잭션**`, "");

  // 요약
  L.push("## 요약", "");
  const flags = [];
  if (noDifficulty) flags.push("🔴 **난이도 태깅이 없다** — `problems` 에 난이도 컬럼 자체가 없어 레벨 정의의 핵심 축이 비어 있다.");
  flags.push("🔴 **판례 노드 약점이 나오지 않는다** — 코호트 약점 집계가 `case_only` 노드를 건너뛴다(8번 참조).");
  flags.push("🔴 **약점 귀속이 문제 단위다** — 선지 노드는 약점 계산에 들어가지 않는다. 「선지 단위 약점」은 새 집계 경로가 필요하다.");
  if (unfitWithTruth > 0)
    flags.push(`🟡 **부적합 표시인데 정오값이 남은 선지 ${num(unfitWithTruth)}건** — 스크립트 일괄갱신 잔재로 보인다. 동작은 안전하나 데이터가 어긋나 있다.`);
  if (disagreeC > 0) flags.push(`🟡 **경로가 서로 다른 노드를 가리키는 선지 ${num(disagreeC)}건** (4번 참조).`);
  if ((dead.choice_direct ?? 0) + (dead.problem_primary ?? 0) > 0)
    flags.push(`🟡 **없는 노드를 가리키는 태그** 선지 ${num(dead.choice_direct)} · 문제 ${num(dead.problem_primary)}건.`);
  flags.push(`🟡 **체계도 없는 과목** — ${NO_TREE_SUBJECTS.join(", ")} 은 노드 기반 점검(2·3·6)에서 제외했다.`);
  flags.push(`🟢 OX 적합 선지 ${num(totalOxFit)} / 전체 선지 ${num(totalChoices)} (${pct(totalOxFit, totalChoices)}).`);
  flags.push(`🟢 사건번호 정규화로 노드 도달이 ${num(r.caseNorm?.reachesNode)}건까지 올라간다(정규화 전 대비 개선, 9번 참조).`);
  L.push(...flags.map((f) => `- ${f}`), "");

  // 1
  L.push("## 1. 과목별 기본", "");
  L.push(table(
    ["과목", "문제", "객관식", "선지", "문제 태깅", "선지 태깅", "OX 적합", "OX 부적합", "OX 미검토"],
    S.map((s) => [
      s.subj, num(s.problems), num(s.mc_problems), num(s.choices),
      `${num(s.prob_tagged)} (${pct(s.prob_tagged, s.problems)})`,
      `${num(s.choice_tagged)} (${pct(s.choice_tagged, s.choices)})`,
      num(s.ox_fit), num(s.ox_unfit), num(s.ox_unreviewed),
    ]),
  ), "");
  L.push("OX 3분류 기준 — 적합 = `ox_truth` 있음 AND `ox_ineligible=false` / 부적합 = `ox_ineligible=true` / 미검토 = `ox_ineligible=false` AND `ox_truth` 없음. `ox_ineligible` 의 DB 기본값은 `false` 라 **미검토와 적합이 기본값으로는 구분되지 않는다** — `ox_truth` 가 실질 판정자다.", "");

  // 2
  L.push("## 2. 태깅 커버리지", "");
  L.push(table(["항목", "값"], [
    ["선지 일부만 태깅된 문제", num(r.coverage?.partiallyTagged)],
    ["없는 노드를 가리키는 선지 태그", num(dead.choice_direct)],
    ["없는 노드를 가리키는 문제 핀", num(dead.problem_primary)],
  ]), "");
  L.push("### 선지당 해소된 노드 수 (조문→노드 1:N 확산)", "");
  const dist = r.coverage?.choiceNodeCountDist ?? {};
  L.push(table(["노드 수", "선지"], Object.entries(dist).map(([k, v]) => [k, num(v)])), "");

  // 경로
  L.push("## 3. 노드 해소 경로별 기여도", "");
  const pc = r.coverage?.pathContribution ?? {};
  L.push("**선지**", "");
  L.push(table(["경로", "선지 수"], Object.entries(pc.choice ?? {}).map(([k, v]) => [k, num(v)])), "");
  L.push("**문제**", "");
  L.push(table(["경로", "문제 수"], Object.entries(pc.problem ?? {}).map(([k, v]) => [k, num(v)])), "");
  const pa = r.coverage?.pathAgreement ?? {};
  L.push("", "### 경로 간 일치", "");
  L.push(table(["대상", "복수 경로로 닿음", "경로가 서로 다른 노드"], [
    ["선지", num(pa.choice_multi_path), num(pa.choice_multi_path_disagree)],
    ["문제", num(pa.problem_multi_path), num(pa.problem_multi_path_disagree)],
  ]), "");
  L.push("★`systematic_link` 경로(`problem_systematic_links`)는 **2차 주관식 전용 복수배치**이고 객관식 약점 집계는 이 테이블을 읽지 않는다. 기여도 표에 함께 싣되 별개 축으로 볼 것.", "");

  // 4
  L.push("## 4. 문제 노드집합 vs 선지 노드합집합", "");
  L.push(table(["과목", "판정", "문제 수"],
    (r.setCompare?.bySubject ?? []).map((t) => [t.subj, t.verdict, num(t.n)])), "");
  L.push(`불일치 목록 → \`node-set-mismatch.csv\` (${num(csv.mismatch)}행)`, "");

  // 5
  L.push("## 5. OX 검증", "");
  L.push(table(["항목", "값"], [
    ["정오값 분포", JSON.stringify(r.oxCheck?.truthDist ?? {})],
    ["적합 표시인데 정오값 없음(미검토)", num(r.oxCheck?.fitNoTruth)],
    ["★부적합 표시인데 정오값 남음", num(unfitWithTruth)],
  ]), "");
  const sc = r.oxCheck?.scope ?? {};
  L.push("", "### 자동 검증 범위", "");
  L.push(table(["항목", "문제 수"], [
    ["검증 대상(단답형·단일정답·정오값 있음)", num(sc.eligible_problems)],
    ["제외 — 복수정답 또는 정답 없음", num(sc.excluded_multi_answer)],
    ["제외 — 박스형(조합형·개수형 혼재)", num(sc.excluded_box)],
    ["제외 — 발문 유형 미설정", num(sc.excluded_no_polarity)],
  ]), "");
  L.push(`오류 목록 → \`ox-verify-errors.csv\` (${num(csv.oxErrors)}행) · 판별 불가 → \`ox-undecidable.csv\` (${num(csv.oxUndecidable)}행)`, "");
  L.push("", "검증 규칙 — `polarity='positive'` 이면 **정답 선지의 정오값이 O** 여야 하고, 전 선지에 정오값이 있을 때는 O 가 정답 선지 하나뿐이어야 한다. `negative` 는 X 로 같은 검사. **복수정답 판별은 문제당 `is_correct=true` 개수**로 한다.", "");

  // 6
  L.push("## 6. 난이도", "");
  L.push(noDifficulty
    ? "🔴 `problems` 에 난이도 컬럼이 **없다.** 레벨을 난이도 중심으로 정의하려면 컬럼 신설 + 전수 태깅이 선행돼야 한다."
    : `발견: ${(r.difficulty?.onProblems ?? []).join(", ")}`, "");
  L.push(`다른 테이블의 난이도/등급 후보: ${(r.difficulty?.elsewhere ?? []).join(", ") || "(없음)"}`, "");
  const imp = r.difficulty?.importanceFill ?? {};
  L.push(`참고 — \`problems.importance\`: 값 있음 ${num(imp.set)} / 없음 ${num(imp.null)}`, "");

  // 7
  L.push("## 7. 말단 노드 두께", "");
  L.push(`말단 노드 전수 → \`leaf-nodes.csv\` (${num(csv.leaves)}행)`, "");
  L.push("", table(["과목", "노드유형", "말단", "선지 0개", "선지 10개 미만", "OX 10개 미만"],
    (r.leaves?.thin ?? []).map((s) => [s.law_code, s.node_kind, num(s.leaves), num(s.zero_choice), num(s.lt10_choice), num(s.lt10_ox)])), "");
  L.push("", "★「조문 노드 / 판례 노드」를 나누는 **타입 컬럼이 없다.** `case_only`/`article_only` 는 화면별 가시성 플래그라 여기서는 그것으로 **근사**했다(`공통` = 둘 다 false). 말단 판정은 공용 함수가 없어 `parent_id` 미참조로 정의했다.", "");

  // 8
  L.push("## 8. 풀이 기록", "");
  L.push(table(["mode", "종류", "건수", "선지 저장됨"],
    (r.attempts?.byMode ?? []).map((t) => [t.mode, t.kind, num(t.n), `${num(t.with_choice)} (${pct(t.with_choice, t.n)})`])), "");
  L.push("", table(["항목", "값"], [
    ["객관식 — 기록된 정오 ≠ (선택 선지가 정답)", num(r.attempts?.mcqMismatch)],
    ["OX — 기록된 정오 ≠ (응답 = 정오값)", num(r.attempts?.oxMismatch)],
    ["OX — 선지에 정오값이 없음", num(r.attempts?.oxNoTruth)],
    ["★OX 불일치 중 풀이 이후 정오값이 바뀐 건(추록·정오표)", num(r.attempts?.oxMismatchExplainedByErrata)],
    ["학생 수", num(r.attempts?.students)],
  ]), "");
  const pp = r.attempts?.perProblem ?? {};
  L.push("", table(["풀이 수", "문제 수"], [
    ["1회 이상", num(pp.ge1)], ["10회 이상", num(pp.ge10)],
    ["30회 이상", num(pp.ge30)], ["100회 이상", num(pp.ge100)],
  ]), "");
  L.push(
    "불일치 목록 → `attempt-mismatch.csv` (" + num(csv.attemptMismatch) + "행). " +
    "★`truth_changed_after` 열은 **그 풀이 이후** 그 문제의 `ox_truth` 를 건드린 " +
    "`content_revisions`(추록·정오표 원장) 수다 — 정오값이 나중에 바뀌어 과거 풀이가 " +
    "어긋난 것인지 판별하는 단서다. `content_edit_logs` 는 0행이라 쓰지 않았다.", "");
  L.push("", "★**OX 와 객관식을 섞어 세면 안 된다.** OX 풀이는 「선지가 정답인가」가 아니라 「O/X 응답이 맞았는가」라 정의가 다르다. 합쳐 세면 불일치가 수천 건으로 부풀어 오보가 된다.", "");

  // 9
  L.push("## 9. 판례 사건번호 정규화", "");
  L.push("**규칙** — ① 모든 공백 제거 ② `[0-9]{2,4}[가-힣]{1,3}[0-9]+` 첫 매치를 사건번호로 본다. 법원명 접두어·선고일·「선고」가 이 한 규칙으로 함께 떨어진다(예: 「대법원 2001.11.30. 선고 2001후65」 → `2001후65`). FK 백필은 이번 범위 밖이다.", "");
  L.push(table(["단계", "건수"], [
    ["사건번호 텍스트 있는 선지", num(r.caseNorm?.total)],
    ["정규화 전 원문 그대로 매칭", num(r.caseNorm?.rawMatch)],
    ["정규화 후 매칭", num(r.caseNorm?.normMatch)],
    ["노드까지 도달", num(r.caseNorm?.reachesNode)],
  ]), "");
  L.push(`매칭 실패 → \`case-number-unmatched.csv\` (${num(csv.caseNoMatch)}행) · cases 에는 있으나 노드 미연결 → \`case-matched-but-no-node.csv\` (${num(csv.caseNoNode)}행)`, "");

  // 10
  L.push("## 10. 취약점 집계 코드 (P4)", "");
  L.push("코드 조사 결과다(DB 가 아니라 소스 기준).", "");
  L.push(table(["항목", "확인"], [
    ["귀속 규칙 SSOT", "`app/features/subjects/lib/problem-node-attribution.server.ts:22-32`"],
    ["오답 귀속 기준", "★**문제 단위** — `primary_node_id` 있으면 그 노드 1개, 없으면 `primary_article_id` → 조문링크 파생 전부"],
    ["선지 반영 여부", "★**안 함** — `selected_choice_id`·`related_node_id` 가 인자에 없다"],
    ["`problem_systematic_links` 사용", "★**안 씀** — 2차 주관식 전용 배치"],
    ["개인 약점", "`subjects/lib/weak-nodes.server.ts:64-152` (조회 시 계산, 저장 없음)"],
    ["코호트 약점", "`admin/queries/cohort-weakness.server.ts:120-165` · `:136` 에서 **`case_only` 노드 건너뜀**"],
    ["mode·OX 분리", "★**안 함** — `weak-nodes.server.ts:44-51` 이 `mode`·`ox_answer` 를 거르지 않아 OX 와 객관식이 한 통에 합산된다"],
    ["최소 표본", "`MIN_ATTEMPTS_FOR_RANKING = 5`"],
    ["`lesson_node_links` 행 수", num(r.lessonNodeLinks?.n) + " (약점 집계와 무관 — 학습계획 전용)"],
  ]), "");

  L.push("", "---", "", "생성물: `report.md` · `raw.json` · CSV 7종");
  return L.join("\n");
}

// ── main ────────────────────────────────────────────────────────────────────

const cmd = process.argv[2];
try {
  if (cmd === "discover") await discover();
  else if (cmd === "audit") await audit();
  else {
    console.error("사용: node scripts/audit/audit-level-readiness.mjs <discover|audit>");
    process.exit(1);
  }
} catch (e) {
  console.error(`\n실패: ${e.message}`);
  process.exit(1);
}
