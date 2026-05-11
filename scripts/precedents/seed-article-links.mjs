// 자동 매핑 시드: 판례 본문에서 "제N조" / "제N조의M" 패턴을 추출 → articles 와 매칭 → article_case_links.
// 특허법 도서 텍스트라서 patent law 조문만 매칭. 다른 법 (민법 등) 조문이 인용되어도 patent law 에
// 같은 article_number 가 없으면 자연스럽게 매칭 안 됨.
//
// relation_type = 'directly_interprets' — 책에서 그 case 를 그 조문의 해석 사례로 다룬다는 가정.
// 이미 (article_id, case_id, relation_type) 가 있으면 ON CONFLICT DO NOTHING.
//
// 한계:
//  - 본문 의 다른 case 인용부 ("대법원 2013. 2. 14. 선고 2012후3312 판결, ..., 제29조 ..." 같이) 안의
//    조문도 같이 매칭됨. 핵심 조문은 보통 case 의 첫 문장에 등장하지만 강한 신호로 separated 않음.
//  - false positive 일부 허용 — 운영자가 잘못된 매핑 삭제 가능.

import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

import { parseLawArg } from "./lib-args.mjs";

loadEnv();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 .env 에 필요합니다.");
  process.exit(1);
}
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// "제29조", "제29조의2", "제 29 조 의 2" 등 변형 허용.
const RE_ARTICLE_REF = /제\s*(\d{1,3})(?:\s*조\s*의\s*(\d{1,2}))?\s*조/g;
// 가지조가 별도 패턴으로 잡힐 경우: "제29조의2" 형태 별도.
const RE_BRANCH_ALT = /제\s*(\d{1,3})\s*조\s*의\s*(\d{1,2})/g;

function extractArticleNumbers(text) {
  const out = new Set();
  if (!text) return out;
  // (a) "제N조의M조" 같이 흔치 않은 패턴 / 본문에서 "제N조" 직접 사용 기준.
  for (const m of text.matchAll(RE_ARTICLE_REF)) {
    const base = m[1];
    const branch = m[2];
    out.add(branch ? `${base}의${branch}` : base);
  }
  // (b) "제29조의2" 가 위에 (a) 에 매칭 안 됐다면 별도 캐치.
  for (const m of text.matchAll(RE_BRANCH_ALT)) {
    out.add(`${m[1]}의${m[2]}`);
  }
  return out;
}

async function runForLaw(lawCode) {
  console.log(`\n=== ${lawCode} ===`);
  // 1) 해당 law articles map: article_number → article_id (level='article' 만).
  const { data: law } = await supabase
    .from("laws")
    .select("law_id")
    .eq("law_code", lawCode)
    .maybeSingle();
  if (!law) {
    console.log(`  law row 없음 — skip`);
    return;
  }
  const { data: articleRows } = await supabase
    .from("articles")
    .select("article_id, article_number")
    .eq("law_id", law.law_id)
    .eq("level", "article")
    .not("article_number", "is", null);
  const articleByNumber = new Map();
  for (const r of articleRows ?? []) {
    if (r.article_number) articleByNumber.set(r.article_number, r.article_id);
  }
  console.log(`  articles: ${articleByNumber.size}`);

  // 2) 해당 과목 cases 텍스트 모두 fetch.
  const { data: caseRows } = await supabase
    .from("cases")
    .select(
      "case_id, summary_title, summary_body_md, reasoning_md, comment_body_md, summary_items",
    )
    .contains("subject_laws", [lawCode])
    .is("deleted_at", null);
  console.log(`  cases: ${caseRows?.length ?? 0}`);
  if ((caseRows?.length ?? 0) === 0) return;

  // 3) 기존 link (case_id, article_id) 셋 — 중복 insert 방지. 페이지네이션.
  const existing = new Set();
  {
    let f = 0;
    const PAGE = 1000;
    for (;;) {
      const { data, error } = await supabase
        .from("article_case_links")
        .select("article_id, case_id, relation_type")
        .eq("relation_type", "directly_interprets")
        .range(f, f + PAGE - 1);
      if (error) { console.error("  existing 조회:", error.message); break; }
      if (!data || data.length === 0) break;
      for (const r of data) existing.add(`${r.case_id}:${r.article_id}`);
      if (data.length < PAGE) break;
      f += PAGE;
    }
  }
  console.log(`  existing directly_interprets links: ${existing.size}`);

  // 4) 추출 + 후보 link 생성.
  const inserts = [];
  let casesMatched = 0;
  for (const c of caseRows ?? []) {
    const textParts = [
      c.summary_title,
      c.summary_body_md,
      c.reasoning_md,
      c.comment_body_md,
    ];
    if (Array.isArray(c.summary_items)) {
      for (const it of c.summary_items) {
        if (it && typeof it === "object") {
          if (typeof it.title === "string") textParts.push(it.title);
          if (typeof it.body === "string") textParts.push(it.body);
        }
      }
    }
    const text = textParts.filter(Boolean).join("\n");
    const refs = extractArticleNumbers(text);
    if (refs.size === 0) continue;
    let matched = 0;
    for (const num of refs) {
      const aid = articleByNumber.get(num);
      if (!aid) continue;
      const key = `${c.case_id}:${aid}`;
      if (existing.has(key)) continue;
      inserts.push({
        article_id: aid,
        case_id: c.case_id,
        relation_type: "directly_interprets",
        note: "자동 추출 — 본문 조문 인용",
      });
      existing.add(key);
      matched++;
    }
    if (matched > 0) casesMatched++;
  }

  console.log(`  prepared inserts: ${inserts.length} (cases matched: ${casesMatched})`);

  // 5) batch insert.
  const BATCH = 200;
  let inserted = 0;
  for (let i = 0; i < inserts.length; i += BATCH) {
    const slice = inserts.slice(i, i + BATCH);
    const { error } = await supabase
      .from("article_case_links")
      .insert(slice);
    if (error) {
      console.error(`  batch ${i}~${i + slice.length} 실패: ${error.message}`);
      for (const row of slice) {
        const { error: e } = await supabase
          .from("article_case_links")
          .insert(row);
        if (!e) inserted++;
      }
    } else {
      inserted += slice.length;
    }
  }
  console.log(`  inserted: ${inserted}`);
}

async function main() {
  const laws = parseLawArg(process.argv);
  console.log(`targets: ${laws.join(", ")}`);
  for (const code of laws) await runForLaw(code);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
