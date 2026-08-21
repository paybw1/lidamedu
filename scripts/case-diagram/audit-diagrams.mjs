// feat-2-035 — 생성된 도식의 근거 감사. CLAUDE.md Non-negotiable 11 자동 검출분.
//
//   node scripts/case-diagram/audit-diagrams.mjs --year 2025
//   node scripts/case-diagram/audit-diagrams.mjs            # 전체(살아있는 draft/approved)
//
// 검사 항목
//   ① 인용 사건번호가 그 판례의 원문(대법원 전문 + 하급심 캐시)에 실재하는가
//   ② 단정형 서술("통설은 ~", "종전 판례는 ~") 사용
//   ③ 강학상 분류용어 사용
//   ④ 사실관계에 법원의 판단·결론 표현이 섞였는가(사실관계는 사실만)
//   ⑤ 구조 결손 — 쟁점/결론 공란, 법리 축 0개
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const YEAR = argv.includes("--year") ? argv[argv.indexOf("--year") + 1] : null;
const CACHE_DIR = path.resolve(process.cwd(), "source", "하급심 판결문", ".cache");

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

// ★조문 표기를 사건번호로 잘못 잡지 않도록 부호를 제외한다 —
//   "133조의2"(특허법 제133조의2)가 \d{2,4}[가-힣]{1,3}\d+ 에 걸려 오탐이 났다(2026-08-20).
//   조·항·호·목·항의·조의 는 사건번호 부호가 아니다.
const CASE_NO_RE = /\b\d{2,4}(?!조|항|호|목)[가-힣]{1,3}\d+\b/g;
// 판례 서술에서 흔한 단정형 — 교재 근거 없이 쓰면 안 되는 표현.
const ASSERTIONS = [
  /통설은[^.]{0,30}이다/,
  /종전\s*판례는/,
  /다수설/,
  /학계의?\s*일반적인?\s*견해/,
];
// audit-essay-answers.mjs 의 ACADEMIC_TERMS 와 같은 취지.
const ACADEMIC_TERMS = ["주합발명", "조합발명", "주지관용기술의 부가"];
// 사실관계에 있으면 안 되는 판단·결론 표현.
const VERDICT_IN_FACTS = [
  /법원은[^.]{0,40}판단하[였였]/,
  /파기\s*환송/,
  /상고를\s*기각/,
  /쟁점은/,
  /결론적으로/,
];

function loadCache(caseNumber) {
  const p = path.join(CACHE_DIR, `${caseNumber}.json`);
  if (!fs.existsSync(p)) return "";
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")).text ?? "";
  } catch {
    return "";
  }
}

function blockText(b) {
  return [
    b.issue,
    ...(b.statutes ?? []),
    ...Object.values(b.doctrine ?? {}),
    b.application,
    b.conclusion,
  ]
    .filter(Boolean)
    .join("\n");
}

async function main() {
  let q = sb
    .from("case_diagrams")
    .select(
      "diagram_id, case_id, facts_md, facts_source_kind, blocks, review_status, cases:case_id ( case_number, decided_at, official_text_md )",
    )
    .is("deleted_at", null);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  // ★하급심 전문은 로컬 캐시가 유일한 소스가 아니다 — 운영 화면에서 적재한 건은
  //   DB 에만 있다. 초안 생성기(draft-diagrams)는 DB 를 2차 소스로 읽는데 감사가
  //   안 읽으면, 그 판결문에서 그대로 옮긴 심판 사건번호(1999당2208 등)가 전부
  //   "원문에 없는 인용" 으로 잡힌다(2026-08-22 실측 90건 전건 오탐).
  const lowerById = new Map();
  {
    const ids = (data ?? []).map((r) => r.case_id).filter(Boolean);
    for (let i = 0; i < ids.length; i += 150) {
      const { data: lower, error: lowErr } = await sb
        .from("case_lower_courts")
        .select("case_id, body_text")
        .in("case_id", ids.slice(i, i + 150))
        .eq("status", "loaded")
        .is("deleted_at", null);
      if (lowErr) throw new Error(lowErr.message);
      for (const l of lower ?? []) lowerById.set(l.case_id, l.body_text ?? "");
    }
  }

  const rows = (data ?? []).filter((r) =>
    YEAR ? String(r.cases?.decided_at ?? "").startsWith(YEAR) : true,
  );
  rows.sort((a, b) =>
    String(a.cases?.decided_at).localeCompare(String(b.cases?.decided_at)),
  );

  let fail = 0;
  let warn = 0;
  for (const r of rows) {
    const cn = r.cases?.case_number ?? "?";
    const source = [
      r.cases?.official_text_md ?? "",
      loadCache(cn),
      lowerById.get(r.case_id) ?? "",
    ].join("\n");
    const msgs = [];
    const blocks = Array.isArray(r.blocks) ? r.blocks : [];

    // ⑤ 구조
    if (blocks.length === 0) msgs.push(["FAIL", "쟁점 0개"]);
    blocks.forEach((b, i) => {
      if (!b?.issue?.trim()) msgs.push(["FAIL", `쟁점 ${i + 1} 제목 공란`]);
      if (!b?.conclusion?.trim()) msgs.push(["FAIL", `쟁점 ${i + 1} 결론 공란`]);
      const axes = Object.values(b?.doctrine ?? {}).filter((v) =>
        String(v ?? "").trim(),
      ).length;
      if (axes === 0) msgs.push(["WARN", `쟁점 ${i + 1} 법리 축 0개`]);
      if (axes === 4)
        msgs.push([
          "WARN",
          `쟁점 ${i + 1} 법리 축 4개 전부 — 지어낸 축이 없는지 확인`,
        ]);
    });

    const allText = [r.facts_md, ...blocks.map(blockText)].join("\n");

    // ① 사건번호 실재
    // ★원문 대조 전에 공백을 지운다 — 판결문 전문은 줄바꿈이 공백으로 들어와
    //   "특허법원 2019허  8033호" 처럼 사건번호 가운데가 벌어져 있는 경우가 흔하다.
    //   정확일치로 보면 실재하는 인용을 없는 것으로 잡는다(오탐).
    const flat = source.replace(/\s+/g, "");
    const cited = [...new Set((allText.match(CASE_NO_RE) ?? []))];
    for (const no of cited) {
      if (no === cn) continue;
      if (!flat.includes(no.replace(/\s+/g, ""))) {
        msgs.push(["FAIL", `원문에 없는 사건번호 인용: ${no}`]);
      }
    }

    // ② 단정형
    for (const re of ASSERTIONS) {
      const m = allText.match(re);
      if (m) msgs.push(["FAIL", `근거 없는 단정형: "${m[0]}"`]);
    }

    // ③ 강학상 용어
    for (const t of ACADEMIC_TERMS) {
      if (allText.includes(t)) msgs.push(["WARN", `강학상 분류용어: ${t}`]);
    }

    // ④ 사실관계에 판단·결론
    for (const re of VERDICT_IN_FACTS) {
      const m = (r.facts_md ?? "").match(re);
      if (m) msgs.push(["WARN", `사실관계에 판단·결론 표현: "${m[0]}"`]);
    }

    const f = msgs.filter((m) => m[0] === "FAIL").length;
    const w = msgs.filter((m) => m[0] === "WARN").length;
    fail += f;
    warn += w;
    const badge = f ? "FAIL" : w ? "WARN" : " OK ";
    console.log(
      `[${badge}] ${cn.padEnd(13)} ${r.cases?.decided_at}  쟁점 ${blocks.length} · 사실관계 ${(r.facts_md ?? "").length}자 · ${r.review_status}`,
    );
    for (const [lv, m] of msgs) console.log(`        ${lv} ${m}`);
  }

  console.log(`\n대상 ${rows.length}건 · FAIL ${fail} · WARN ${warn}`);
  if (fail) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
