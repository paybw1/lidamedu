// reclassify-study-method 결과 JSON(updates)을 재분류 재실행 없이 반영.
// (reclassify 스크립트의 --apply 는 AI 분류부터 다시 돌므로, dry-run 결과 검토 후엔 이걸 사용.)
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const file = process.argv[2] ?? "tmp/reclassify-study-method-result.json";
const { updates } = JSON.parse(readFileSync(file, "utf8"));
console.log(`반영 대상 ${updates.length}건 (${file})`);

let applied = 0;
for (const u of updates) {
  const { error } = await sb
    .from("qna_threads")
    .update({ target_type: "article", target_id: u.article_id, updated_at: new Date().toISOString() })
    .eq("thread_id", u.thread_id)
    .eq("target_type", "study_method"); // 이미 다른 앵커로 바뀐 행 보호
  if (error) throw error;
  applied++;
  if (applied % 100 === 0) console.log(`  ${applied}/${updates.length}`);
}
console.log("반영 완료:", applied);
