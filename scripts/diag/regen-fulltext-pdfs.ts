// 깨진 정방향(pdf-lib) 전문 PDF 234개를 새 폰트(Noto Serif KR)로 재생성.
// 역방향 업로드 실제 법원 PDF(official_text_unavailable=true)는 제외.
//   node --import tsx scripts/diag/regen-fulltext-pdfs.ts           # dry-run (대상 수)
//   node --import tsx scripts/diag/regen-fulltext-pdfs.ts --apply   # 재생성
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { renderAndStorePdf } from "../../app/features/cases/lib/precedent-import.server";
loadEnv();
const APPLY = process.argv.includes("--apply");
const supa = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const { data, error } = await supa.from("cases")
  .select("case_id, case_number, case_title, court, decided_at, official_text_md")
  .not("official_text_pdf_path", "is", null)
  .not("official_text_md", "is", null)
  .eq("official_text_unavailable", false)
  .is("deleted_at", null);
if (error) throw error;
console.log(`재생성 대상(정방향 pdf-lib): ${data!.length}건${APPLY ? " — APPLY" : " (dry-run)"}`);
if (!APPLY) process.exit(0);

let ok = 0, skipped = 0, err = 0;
const problems: string[] = [];
for (let i = 0; i < data!.length; i++) {
  const c = data![i];
  const r = await renderAndStorePdf(supa, c.case_id, c.official_text_md!, {
    caseNumber: c.case_number, caseTitle: c.case_title, court: c.court, decidedAt: c.decided_at,
  });
  if (r.status === "ok") ok++;
  else if (r.status === "skipped_unrenderable") { skipped++; problems.push(`${c.case_number}: 미커버 ${r.chars.slice(0,8).join("")}`); }
  else { err++; problems.push(`${c.case_number}: ERR ${r.msg}`); }
  if ((i + 1) % 25 === 0) console.log(`  ${i + 1}/${data!.length} (ok=${ok} skip=${skipped} err=${err})`);
}
console.log(`\nRESULT regenerated=${ok} unrenderable=${skipped} error=${err}`);
if (problems.length) console.log("문제 건:\n" + problems.join("\n"));
