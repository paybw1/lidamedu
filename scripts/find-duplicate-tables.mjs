// 종합 해설의 표 블록을 정규화한 뒤 같은 본문이 여러 problem 에 들어 있는 경우를 찾는다.
// 마이그레이션이나 그 이전 ingestion 단계에서 표가 중복 부착됐을 가능성을 알아본다.
//
// 규칙:
// - explanation_md 에서 우리가 추가한 `**지문 X 관련**`/`**박스 X 관련**` 헤더 다음 본문을 표 블록으로 간주.
// - 표 본문은 공백/개행 정리 후 sha1 해시로 그룹화.
// - 같은 해시가 2개 이상 problem 에 등장하면 출력.

import { createClient } from "@supabase/supabase-js";
import "dotenv/config";
import { createHash } from "node:crypto";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("env 미설정");
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const SECTION_RE = /\*\*((?:지문|박스)[^*]+관련)\*\*\n+([\s\S]*?)(?=\n\*\*(?:지문|박스)[^*]+관련\*\*|$)/g;

function normalize(s) {
  return s.replace(/\s+/g, " ").trim();
}

(async () => {
  const { data: problems, error } = await sb
    .from("problems")
    .select(
      "problem_id, problem_number, year, exam_round_no, body_md, explanation_md, primary_article_id, articles!primary_article_id(article_number)",
    )
    .is("deleted_at", null)
    .like("explanation_md", "%관련**%");
  if (error) {
    console.error(error);
    process.exit(1);
  }
  console.log(`[problems] ${problems.length} 건`);

  // hash → entries
  const groups = new Map();
  for (const p of problems) {
    const expl = p.explanation_md ?? "";
    for (const m of expl.matchAll(SECTION_RE)) {
      const heading = m[1].trim();
      const body = m[2].trim();
      const norm = normalize(body);
      if (!norm) continue;
      const h = createHash("sha1").update(norm).digest("hex").slice(0, 12);
      const arr = groups.get(h) ?? [];
      arr.push({
        problemId: p.problem_id,
        year: p.year,
        round: p.exam_round_no,
        problemNumber: p.problem_number,
        articleNumber: p.articles?.article_number ?? null,
        bodyPreview: (p.body_md ?? "").replace(/\s+/g, " ").slice(0, 80),
        heading,
        bodyTruncated: body.slice(0, 100).replace(/\n/g, " "),
        bodyFull: body,
      });
      groups.set(h, arr);
    }
  }

  const dups = Array.from(groups.entries()).filter(([, arr]) => arr.length > 1);
  console.log(`[중복 표 그룹] ${dups.length} 건 (같은 표가 ≥2 problem 에 등장)`);
  console.log("=".repeat(80));
  for (const [h, arr] of dups) {
    console.log(`\n# 그룹 ${h} (${arr.length}회 출현)`);
    console.log(`  표 헤더: ${arr[0].bodyTruncated}`);
    for (const e of arr) {
      console.log(
        `   - ${e.year}-${e.round} #${e.problemNumber} 조문${e.articleNumber ?? "—"} · ${e.heading}`,
      );
      console.log(`     [${e.problemId}] 본문: ${e.bodyPreview}`);
    }
  }
})().catch((e) => {
  console.error("[fatal]", e?.message ?? e);
  process.exit(1);
});
