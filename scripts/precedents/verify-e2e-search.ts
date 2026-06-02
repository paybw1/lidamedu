// §4 E2E — 적재된 4건 공식전문이 hybrid-search 결과에 실제로 잡히는지 확인.
//
// 각 사건의 본문 키워드로 질문 → 결과 청크 중 우리 source_id + section="공식전문" 등장 여부.

import "dotenv/config";

import { createClient } from "@supabase/supabase-js";
import { hybridSearch } from "../../app/features/ai-qna/lib/hybrid-search.server";

const SUPA = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

// 사건번호별 — 공식전문에 등장하는 고유 표현으로 질문.
const QUERIES = [
  { caseNumber: "2012후726", q: "확대된 선출원과 발명의 동일성 광 정합 필터" },
  { caseNumber: "2025마6304", q: "특허침해금지가처분 집행관 집행대상 특정" },
  { caseNumber: "2023후11340", q: "특허권 권리범위 제한 해석 자가세정 정수기" },
  { caseNumber: "2024후10108", q: "발명 구성을 불명료하게 표현하는 용어 청구항 명확성" },
];

for (const { caseNumber, q } of QUERIES) {
  // case_id 조회.
  const { data: rows } = await SUPA
    .from("cases").select("case_id").eq("case_number", caseNumber).is("deleted_at", null);
  const ids = new Set((rows ?? []).map((r) => r.case_id));

  process.stdout.write(`\n━━━ ${caseNumber} ━━━\n`);
  process.stdout.write(`Q: "${q}"\n`);

  const res = await hybridSearch(SUPA as never, q, { topK: 8 });

  let officialHitIdx = -1;
  const top3 = res.hits.slice(0, 3);
  for (let i = 0; i < res.hits.length; i++) {
    const h = res.hits[i];
    const section = (h.headingPath ?? "").split("·").pop()?.trim() ?? "";
    if (ids.has(h.sourceId) && section === "공식전문") {
      officialHitIdx = i;
      break;
    }
  }
  const officialHit = officialHitIdx >= 0 ? res.hits[officialHitIdx] : null;

  process.stdout.write(`top3:\n`);
  for (const h of top3) {
    const section = (h.headingPath ?? "").split("·").pop()?.trim() ?? "?";
    const mark = ids.has(h.sourceId) ? "★" : "  ";
    process.stdout.write(
      `  ${mark} [${h.sourceType}] ${section.padEnd(8)} rrf=${h.rrfScore.toFixed(4)}  paths=${Object.keys(h.pathScores).join("/")}  src=${h.sourceId.slice(0, 8)}…\n`,
    );
  }
  if (officialHit) {
    process.stdout.write(`  ✓ 공식전문 청크 검색 결과 ${officialHitIdx + 1}위 등장  (rrf=${officialHit.rrfScore.toFixed(4)})\n`);
  } else {
    const anyMatch = res.hits.find((h) => ids.has(h.sourceId));
    if (anyMatch) {
      const section = (anyMatch.headingPath ?? "").split("·").pop()?.trim() ?? "?";
      process.stdout.write(`  △ 같은 case 다른 청크 (${section}) 가 ${res.hits.indexOf(anyMatch) + 1}위 — 공식전문 자체는 top8 밖\n`);
    } else {
      process.stdout.write(`  ✗ 해당 case 어떤 청크도 top8 미진입\n`);
    }
  }
}
