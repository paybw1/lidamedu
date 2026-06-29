// feat-4-A-343 — 조문에 붙은 정오(OX) 표시 중복 감사 (읽기 전용, 운영 mcgdoplo).
//
// 조문 OX 패널(getOxQuestionsForArticle)에 노출되는 지문 = problem_choices/problem_box_items 중
//   related_article_id 있음 + ox_ineligible=false + ox_truth 채움 + 부모 problem 미삭제.
// "표시 중복" = 같은 조문에 같은(공백제거) 본문이 2개 이상 = 서로 다른 정당한 문제가 동일 지문을 물어
//   한 조문 패널에 같은 문장이 여러 번 뜨는 것. (problem row 자체 중복과 구분 — 그건 0건으로 확인.)
//
// 사용:  node scripts/jagwa/ox-dup-audit.mjs
import "dotenv/config";

const REF = "mcgdoplovrjgklbxmozi";
const tok = process.env.SUPABASE_ACCESS_TOKEN;
if (!tok) throw new Error("missing SUPABASE_ACCESS_TOKEN");
if (!String(process.env.SUPABASE_URL).includes(REF)) {
  throw new Error(`SAFETY: SUPABASE_URL does not reference ${REF} → refusing`);
}
async function mgmt(sql) {
  const r = await fetch(
    `https://api.supabase.com/v1/projects/${REF}/database/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql }),
    },
  );
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

const HEADLINE = `
with ox as (
  select c.related_article_id aid, regexp_replace(c.body_md,'\\s+','','g') sig, c.ox_truth truth
  from problem_choices c join problems p on p.problem_id=c.problem_id
  where c.related_article_id is not null and c.ox_ineligible=false and c.ox_truth is not null and p.deleted_at is null
  union all
  select b.related_article_id, regexp_replace(b.body_md,'\\s+','','g'), b.ox_truth
  from problem_box_items b join problems p on p.problem_id=b.problem_id
  where b.related_article_id is not null and b.ox_ineligible=false and b.ox_truth is not null and p.deleted_at is null
),
grp as (select aid, sig, count(*) c, count(distinct truth) truths from ox group by aid, sig),
psig as (
  select p.law_id,
    coalesce((select string_agg(regexp_replace(c.body_md,'\\s+','','g'),'' order by c.choice_index) from problem_choices c where c.problem_id=p.problem_id),'')
    || coalesce((select string_agg(regexp_replace(b.body_md,'\\s+','','g'),'' order by b.position_index) from problem_box_items b where b.problem_id=p.problem_id),'') raw,
    md5(coalesce((select string_agg(regexp_replace(c.body_md,'\\s+','','g'),'|' order by c.choice_index) from problem_choices c where c.problem_id=p.problem_id),'')
      || '##' || coalesce((select string_agg(regexp_replace(b.body_md,'\\s+','','g'),'|' order by b.position_index) from problem_box_items b where b.problem_id=p.problem_id),'')) h
  from problems p where p.deleted_at is null
),
pgrp as (select law_id, h, count(*) c from psig where length(raw) > 20 group by law_id, h)
select
  (select count(*) from ox) total_ox_refs,
  (select count(*) from grp) distinct_statements,
  (select count(*) from grp where c>=2) dup_groups,
  (select coalesce(sum(c-1),0) from grp where c>=2) excess_refs,
  (select count(*) from grp where truths>=2) contradiction_groups,
  (select count(*) from pgrp where c>=2) dup_problem_groups,
  (select coalesce(sum(c-1),0) from pgrp where c>=2) excess_problems;`;

const LIST = `
with ox as (
  select c.related_article_id aid, regexp_replace(c.body_md,'\\s+','','g') sig, c.ox_truth truth, c.body_md, c.problem_id
  from problem_choices c join problems p on p.problem_id=c.problem_id
  where c.related_article_id is not null and c.ox_ineligible=false and c.ox_truth is not null and p.deleted_at is null
  union all
  select b.related_article_id, regexp_replace(b.body_md,'\\s+','','g'), b.ox_truth, b.body_md, b.problem_id
  from problem_box_items b join problems p on p.problem_id=b.problem_id
  where b.related_article_id is not null and b.ox_ineligible=false and b.ox_truth is not null and p.deleted_at is null
),
grp as (select aid, sig, count(*) c, count(distinct truth) truths, count(distinct problem_id) probs, min(body_md) sample
        from ox group by aid, sig having count(*)>=2)
select g.c refs, g.probs distinct_problems, g.truths distinct_truths, l.law_code, a.article_number, left(g.sample,55) sample
from grp g join articles a on a.article_id=g.aid join laws l on l.law_id=a.law_id
order by g.truths desc, l.law_code, g.c desc;`;

const [h] = await mgmt(HEADLINE);
console.log("== 조문 OX 표시 중복 감사 (운영 mcgdoplo) ==");
console.log(`패널 OX 지문(refs)      : ${h.total_ox_refs}`);
console.log(`고유 (조문·지문)        : ${h.distinct_statements}`);
console.log(`표시 중복 그룹(refs≥2)  : ${h.dup_groups}  (초과 ${h.excess_refs}개 = dedup 대상)`);
console.log(`  └ 정답 O/X 모순 그룹  : ${h.contradiction_groups}  (먼저 데이터 교정 필요)`);
console.log(`내용 동일 중복 문제그룹 : ${h.dup_problem_groups}  (초과 ${h.excess_problems}개 — 0이면 problem 삭제 불필요)`);

const list = await mgmt(LIST);
console.log(`\n-- 표시 중복 그룹 ${list.length}건 (모순 우선 정렬) --`);
for (const r of list) {
  const flag = Number(r.distinct_truths) >= 2 ? " ⚠모순" : "";
  console.log(
    `[${r.law_code} 제${r.article_number}조] refs=${r.refs} 문제=${r.distinct_problems} O/X종류=${r.distinct_truths}${flag}  ${r.sample}`,
  );
}
