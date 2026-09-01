// feat-14-N1-c — 2차 훈련 **논점** 감사.
//
// 논점 185건이 검수 대기인데(2026-09-01) 한 줄씩 다 읽는 건 현실적이지 않다.
// 규칙으로 걸러 **경고 있는 것만 위로 올리고** 나머지는 빠르게 승인할 수 있게 한다.
//
// 검사 항목(감사 규칙은 scripts/lib/content-rules.mjs SSOT):
//   ① 실재하지 않는 사건번호      → FAIL  (DB·법령정보센터 둘 다 없음 = 지어낸 것)
//   ①' DB 미수록·외부 실재        → WARN  (인용은 맞지만 우리 DB 에 없어 링크 불가)
//   ② 근거 없는 단정형 서술      → FAIL
//   ③ 강학상 분류용어            → WARN
//   ④ 모범 결론 누락·과단문      → WARN
//   ⑤ 결론 방향 누락             → WARN
//
//   npx tsx scripts/case-training/audit-training-issues.mjs             # 출력만
//   npx tsx scripts/case-training/audit-training-issues.mjs --publish   # 검수 큐에 적재
//
// ★★①의 판정 기준은 도식 감사와 **다르다**. 도식은 "그 판결문 원문에 있는가" 를 보지만,
//   2차 훈련 논점은 **다른 선례를 법리 근거로 인용하는 게 정상**이다. 원문 대조로 보면
//   정상 인용이 전부 FAIL 로 잡힌다(첫 실행에서 15건 전부 오탐이었다 — 2012다42666·
//   2019다222782 처럼 DB 에 멀쩡히 있는 판례였다). 그래서 **DB 실재 여부**로 본다:
//   cases.case_number 와 case_lower_courts.lower_case_number 를 합친 집합에 없을 때만 FAIL.
//   (하급심 번호는 cases 에 없다 — [[case-lower-court-originals]])
// ★--publish 는 전수 실행에서만 — 부분 실행 결과로 적재하면 범위 밖 경고가 지워진다.
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

import { publishAuditFindings } from "../lib/audit-findings.mjs";
import { existsAtLawGoKr } from "../lib/law-precedent-lookup.mjs";
import {
  ACADEMIC_TERMS,
  ASSERTIONS,
  CASE_NO_RE,
  flatten,
} from "../lib/content-rules.mjs";

const argv = process.argv.slice(2);
const PUBLISH = argv.includes("--publish");
const ONE_ITEM = argv.includes("--item") ? argv[argv.indexOf("--item") + 1] : null;

/** 모범 결론이 이보다 짧으면 답으로 쓰기 어렵다 — 사람이 본다. */
const MIN_CONCLUSION = 40;

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

/** DB 에 실재하는 사건번호 집합 — 대법원 + 하급심(상고심에 딸린 원심 번호까지). */
async function loadKnownCaseNumbers() {
  const known = new Set();
  const PAGE = 1000;
  for (const [table, col] of [
    ["cases", "case_number"],
    ["case_lower_courts", "lower_case_number"],
  ]) {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await sb
        .from(table)
        .select(col)
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      for (const r of data ?? []) {
        // "2018나1220, 1237" 처럼 이어쓴 표기가 있어 쉼표로 쪼갠다.
        for (const part of String(r[col] ?? "").split(/[,·/]/)) {
          const t = flatten(part);
          if (t) known.add(t);
        }
      }
      if ((data ?? []).length < PAGE) break;
    }
  }
  return known;
}

async function main() {
  const known = await loadKnownCaseNumbers();
  console.log(`DB 사건번호 ${known.size}종 로드`);
  let q = sb
    .from("case_training_issues")
    .select(
      `issue_id, item_id, label, description_md, model_conclusion_md,
       model_conclusion_direction, review_status,
       case_training_items:item_id (
         item_id, facts_summary_md, problem_id,
         cases:case_id ( case_number, official_text_md ),
         problems:problem_id ( body_md, explanation_md, model_answer_md )
       )`,
    )
    .eq("review_status", "draft")
    .is("deleted_at", null);
  if (ONE_ITEM) q = q.eq("item_id", ONE_ITEM);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = data ?? [];

  let fail = 0;
  let warn = 0;
  const findings = [];

  for (const r of rows) {
    const item = r.case_training_items ?? {};
    const kase = item.cases ?? null;
    const prob = item.problems ?? null;
    // 대조 원문 = 소속 항목이 딛고 선 자료 전부(판례 전문 / 기출 발문·해설·모범답안).
    const source = flatten(
      [
        item.facts_summary_md,
        kase?.official_text_md,
        prob?.body_md,
        prob?.explanation_md,
        prob?.model_answer_md,
      ]
        .filter(Boolean)
        .join("\n"),
    );
    const own = kase?.case_number ?? "";
    const text = [r.label, r.description_md, r.model_conclusion_md]
      .filter(Boolean)
      .join("\n");
    const msgs = [];

    // ① 사건번호 실재 — **DB 에 있는가**(원문 대조 아님, 위 ★★ 참조).
    //   소속 항목의 자료에 있으면 그것으로도 확인된 것으로 본다.
    for (const no of new Set(text.match(CASE_NO_RE) ?? [])) {
      if (no === own) continue;
      const flat = flatten(no);
      if (known.has(flat) || source.includes(flat)) continue;
      // ★DB 에 없으면 **법령정보센터까지 조회**해 갈라 본다(2026-09-01 원장 지적).
      //   실제로 6건 중 3건이 어디에도 없는 **지어낸 사건번호**였다
      //   (2005후3352 · 2009후3919 · 2015다257538). 사람이 매번 찾게 두면 놓친다.
      const live = await existsAtLawGoKr(no);
      msgs.push(
        live === false
          ? ["FAIL", `실재하지 않는 사건번호 — 지어낸 것으로 의심: ${no}`]
          : live === true
            ? ["WARN", `DB 미수록(법령정보센터에는 있음) — 적재 검토: ${no}`]
            : ["WARN", `사건번호 확인 실패(조회 오류) — 사람이 확인: ${no}`],
      );
    }
    // ② 단정형
    for (const re of ASSERTIONS) {
      const m = text.match(re);
      if (m) msgs.push(["FAIL", `근거 없는 단정형: "${m[0]}"`]);
    }
    // ③ 강학상 용어
    for (const t of ACADEMIC_TERMS) {
      if (text.includes(t)) msgs.push(["WARN", `강학상 분류용어: ${t}`]);
    }
    // ④ 모범 결론
    const concl = (r.model_conclusion_md ?? "").trim();
    if (!concl) msgs.push(["WARN", "모범 결론 없음"]);
    else if (concl.length < MIN_CONCLUSION)
      msgs.push(["WARN", `모범 결론이 짧음(${concl.length}자)`]);
    // ⑤ 결론 방향
    if (!r.model_conclusion_direction) msgs.push(["WARN", "결론 방향 미지정"]);

    const f = msgs.filter((m) => m[0] === "FAIL").length;
    const w = msgs.length - f;
    fail += f;
    warn += w;
    if (msgs.length > 0) {
      console.log(
        `[${f ? "FAIL" : "WARN"}] ${(own || item.item_id || "?").padEnd(14)} ${String(r.label).slice(0, 40)}`,
      );
      for (const [lv, m] of msgs) console.log(`        ${lv} ${m}`);
    }
    for (const [lv, m] of msgs) {
      findings.push({
        entityType: "case_training_issue",
        entityId: r.issue_id,
        ruleKey: String(m).replace(/: .*$/, "").replace(/\(.*$/, "").trim().slice(0, 60),
        severity: lv === "FAIL" ? "fail" : "warn",
        message: String(m),
      });
    }
  }

  const clean = rows.length - new Set(findings.map((f) => f.entityId)).size;
  console.log(
    `\n대상 ${rows.length}건 · FAIL ${fail} · WARN ${warn} · 무경고 ${clean}건`,
  );

  if (PUBLISH) {
    if (ONE_ITEM) {
      console.log("[적재 생략] --publish 는 전수 실행에서만 — 범위 밖 결과가 지워집니다.");
    } else {
      const res = await publishAuditFindings(sb, {
        source: "audit-training-issues",
        findings,
      });
      console.log(`검수 큐에 적재: ${res.inserted}건`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
