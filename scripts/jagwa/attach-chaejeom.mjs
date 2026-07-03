// 채점평(특허법 2차) 부착 — 추출 JSON(cNNf.json)을 problems.explanation_md 로.
//   A형 → 그 시험의 문제 1·2(A군) / B형 → 문제 3·4(B군). year = 회차 + 1963.
//   형식이 파일마다 제각각(문제별/블롭)이라 폼 단위 전체 채점평을 해당 문제들에 공통 부착.
// 사용: node scripts/jagwa/attach-chaejeom.mjs <json_dir> [--apply]
import "dotenv/config";
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !url.includes("mcgdoplo")) throw new Error(`SAFETY: ${url} not prod`);
const sb = createClient(url, key);

const dir = process.argv[2];
const apply = process.argv.includes("--apply");
if (!dir) throw new Error("usage: attach-chaejeom.mjs <json_dir> [--apply]");

const SEP = /^[\s|:\-]+$/;
function toMarkdown(jsonPath, form) {
  const j = JSON.parse(readFileSync(jsonPath, "utf8"));
  const raw = (j.paragraphs || j)
    .map((p) => (p.text || "").replace(/\|\s*-{2,}\s*\|/g, " ").replace(/\|/g, " ").trim())
    .filter((t) => t && !SEP.test(t));
  // 연속 중복(박스로 두 번 나오는 헤더 등) 제거
  const lines = [];
  for (const t of raw) if (t !== lines[lines.length - 1]) lines.push(t);
  const body = lines.join("\n\n");
  return `## 채점평 (특허법${form})\n\n${body}`;
}

let updated = 0;
const { data: law } = await sb.from("laws").select("law_id").eq("law_code", "patent").maybeSingle();
const lawId = law.law_id;

for (let round = 47; round <= 54; round++) {
  const year = round + 1963;
  for (const form of ["A", "B"]) {
    const jsonPath = `${dir}/c${round}${form}.json`;
    if (!existsSync(jsonPath)) {
      console.log(`(없음) ${round}회 ${form}`);
      continue;
    }
    const md = toMarkdown(jsonPath, form);
    const nums = form === "A" ? [1, 2] : [3, 4];
    // 대상 문제 조회
    const { data: probs } = await sb
      .from("problems")
      .select("problem_id, problem_number, display_no")
      .eq("law_id", lawId)
      .eq("exam_round", "second")
      .eq("year", year)
      .in("problem_number", nums)
      .is("deleted_at", null);
    const targets = probs ?? [];
    console.log(
      `${round}회(${year}) ${form}: 문제 ${targets.map((p) => "#" + p.problem_number).join(",")} ← ${md.length}자`,
    );
    if (apply) {
      for (const p of targets) {
        const { error } = await sb
          .from("problems")
          .update({ explanation_md: md })
          .eq("problem_id", p.problem_id);
        if (error) throw error;
        updated++;
      }
    }
  }
}
console.log(`\n${apply ? "적용" : "dry-run"}: ${apply ? updated + "건 업데이트" : "미적용"}`);
