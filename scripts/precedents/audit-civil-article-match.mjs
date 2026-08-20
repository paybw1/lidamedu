// 민법 문항 ↔ 조문 매칭 점검 (원장 지시 2026-08-21).
//
// 근거: 민법 객관식은 발문·선지·해설이 조문 번호를 직접 인용하는 경우가 많다.
//       지정된 조문이 그 인용 목록에 없으면 매칭을 의심한다.
//       (명의신탁 문항이 제4조 성년, 양도담보가 제12조 한정후견개시에 붙어 있었다)
//
// 판정
//   ok        — 지정 조문이 본문에서 인용된 조문 중 하나
//   suspect   — 인용된 조문이 있는데 지정 조문은 그중에 없음  ← 점검 대상
//   no_cite   — 본문에 조문 인용이 없음(판례형 문제 등). 판단 보류
//   unset     — 조문 미지정
//
//   node scripts/precedents/audit-civil-article-match.mjs                 # 리포트
//   node scripts/precedents/audit-civil-article-match.mjs --apply         # suspect 를 최다 인용 조문으로 재지정
//   node scripts/precedents/audit-civil-article-match.mjs --min-cites 2   # 인용 N회 이상만 재지정(기본 2)
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const MIN_CITES = argv.includes("--min-cites")
  ? Number(argv[argv.indexOf("--min-cites") + 1])
  : 2;
const OUT = path.resolve(process.cwd(), "tmp/civil-article-audit.json");
const CIVIL_LAW_ID = "74dc73af-f25d-40ff-aead-fb039471982c";

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

// "민법 제565조", "제186조 제1항", "제103조의2" — 조 번호만 뽑는다(항·호는 무시).
// ★앞에 붙은 법률명을 함께 본다 — 민법 문제는 부동산실명법·가등기담보법·주택임대차보호법
//   조문도 인용한다. 번호만 보고 매칭하면 "부동산 실명법 제4조" 가 "민법 제4조(성년)" 이
//   되어 버린다. 기존 오매칭(명의신탁→제4조 성년, 양도담보→제12조 한정후견)이 이 패턴이다.
// ★법률명에 공백이 있다("가등기담보 등에 관한 법률 제12조") — 공백 포함해 되짚는다.
const ART_RE =
  /([가-힣][가-힣\s]{0,18}?(?:법률|법))?\s*제\s*(\d{1,4})\s*조(?:의\s*(\d+))?/g;

async function pageAll(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

/** 민법 조문 인용만 센다. 다른 법률명이 붙은 인용은 foreign 으로 분리. */
function citedArticles(text) {
  const counts = new Map();
  const foreign = new Map();
  for (const m of String(text ?? "").matchAll(ART_RE)) {
    const law = m[1] ?? null;
    // "제103조의2" 는 별개 조문 — 번호에 붙여 구분한다.
    const key = m[3] ? `${m[2]}의${m[3]}` : m[2];
    // 끝이 "민법"이면 민법 인용(예: "민법", "구 민법"). 그 밖의 법률은 foreign.
    const isCivil = !law || /(^|\s)민법$/.test(law.trim());
    const bag = isCivil ? counts : foreign;
    bag.set(key, (bag.get(key) ?? 0) + 1);
  }
  return { counts, foreign };
}

async function main() {
  const probs = await pageAll(() =>
    sb
      .from("problems")
      .select("problem_id, display_no, year, problem_number, primary_article_id, body_md, explanation_md")
      .eq("law_id", CIVIL_LAW_ID)
      .is("deleted_at", null)
      .order("problem_id"),
  );
  const ids = probs.map((p) => p.problem_id);
  const choices = [];
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await sb
      .from("problem_choices")
      .select("problem_id, body_md, explanation_md")
      .in("problem_id", ids.slice(i, i + 150));
    if (error) throw new Error(error.message);
    choices.push(...(data ?? []));
  }
  const extra = new Map();
  for (const c of choices) {
    extra.set(
      c.problem_id,
      `${extra.get(c.problem_id) ?? ""}\n${c.body_md ?? ""}\n${c.explanation_md ?? ""}`,
    );
  }

  const arts = await pageAll(() =>
    sb
      .from("articles")
      .select("article_id, article_number, display_label, level")
      .eq("law_id", CIVIL_LAW_ID)
      .is("deleted_at", null)
      .order("article_id"),
  );
  const byId = new Map(arts.map((a) => [a.article_id, a]));
  const byNumber = new Map();
  for (const a of arts) {
    if (a.level !== "article") continue;
    if (!byNumber.has(a.article_number)) byNumber.set(a.article_number, a);
  }

  const rows = [];
  const counts = { ok: 0, suspect: 0, cross_law: 0, no_cite: 0, unset: 0 };
  for (const p of probs) {
    const text = [p.body_md ?? "", p.explanation_md ?? "", extra.get(p.problem_id) ?? ""].join("\n");
    const { counts: cites, foreign } = citedArticles(text);
    const cur = p.primary_article_id ? byId.get(p.primary_article_id) : null;
    const curNo = cur?.article_number ?? null;
    let verdict;
    if (!curNo) verdict = cites.size ? "unset" : "unset";
    else if (cites.has(curNo)) verdict = "ok";
    // ★지정 조문이 민법 인용에는 없고 다른 법률 인용에만 있으면 교차법률 오매칭.
    else if (foreign.has(curNo)) verdict = "cross_law";
    else if (!cites.size) verdict = "no_cite";
    else verdict = "suspect";
    counts[verdict] += 1;
    if (verdict === "ok" || verdict === "no_cite") continue;
    const ranked = [...cites.entries()].sort((a, b) => b[1] - a[1]);
    const top = ranked.find(([no]) => byNumber.has(no));
    rows.push({
      problemId: p.problem_id,
      displayNo: p.display_no,
      year: p.year,
      problemNumber: p.problem_number,
      verdict,
      current: curNo ? `제${curNo}조 ${cur.display_label ?? ""}` : null,
      currentNo: curNo,
      suggestNo: top?.[0] ?? null,
      suggestLabel: top ? `제${top[0]}조 ${byNumber.get(top[0]).display_label ?? ""}` : null,
      suggestCites: top?.[1] ?? 0,
      cites: ranked.slice(0, 6).map(([no, n]) => `제${no}조×${n}`),
      body: String(p.body_md ?? "").replace(/\s+/g, " ").slice(0, 90),
    });
  }

  fs.writeFileSync(OUT, JSON.stringify({ counts, rows }, null, 2), "utf8");
  console.log(
    `민법 문항 ${probs.length}건 — 일치 ${counts.ok} · 교차법률 오매칭 ${counts.cross_law} · 의심 ${counts.suspect} · 인용없음 ${counts.no_cite} · 미지정 ${counts.unset}`,
  );
  const fixable = rows.filter((r) => r.suggestNo && r.suggestCites >= MIN_CITES);
  console.log(`재지정 가능(인용 ${MIN_CITES}회 이상): ${fixable.length}건 · 리포트 ${OUT}`);
  for (const r of fixable.slice(0, 12)) {
    console.log(`  P-${r.displayNo} ${r.current ?? "(미지정)"} → ${r.suggestLabel} [${r.cites.join(" ")}]`);
  }
  if (!APPLY) {
    console.log("\n--apply 를 붙이면 재지정합니다.");
    return;
  }

  const { data: win, error: winErr } = await sb.rpc("fn_open_suppress_window", {
    p_minutes: 30,
    p_reason: "민법 문항 조문 매칭 정정",
    p_scope: ["mcq"],
  });
  if (winErr) throw new Error(winErr.message);
  let done = 0;
  try {
    for (const r of fixable) {
      const target = byNumber.get(r.suggestNo);
      const { error } = await sb
        .from("problems")
        .update({ primary_article_id: target.article_id, primary_node_id: null })
        .eq("problem_id", r.problemId);
      if (error) throw new Error(`P-${r.displayNo}: ${error.message}`);
      done += 1;
      if (done % 50 === 0) console.log(`  ${done}/${fixable.length}`);
    }
  } finally {
    await sb.rpc("fn_close_suppress_window", { p_window_id: win });
  }
  console.log(`\n재지정 ${done}건 완료.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
