// 전문(official_text) 미적재 판례가 지금 open.law.go.kr 에서 받아올 수 있는지 확인 (읽기 전용).
//   node --import tsx scripts/diag/check-missing-case-fulltext.ts            # 집계만 (API 호출 X)
//   node --import tsx scripts/diag/check-missing-case-fulltext.ts --check 30 # 최근 30건 API 조회
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { caseNumbersEqual, normalizeCaseNumber } from "../../app/features/cases/lib/case-number";
loadEnv();

const OC = process.env.LAW_API_KEY;
const supa = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const checkIdx = process.argv.indexOf("--check");
const CHECK = checkIdx >= 0 ? parseInt(process.argv[checkIdx + 1] ?? "0", 10) : 0;
const INTERVAL = 500;

// 전문 미적재(official_text_md null) + PDF 없음, 삭제 안 됨.
const { data: rows, error } = await supa
  .from("cases")
  .select("case_id, case_number, case_title, court, decided_at, subject_laws")
  .is("official_text_md", null)
  .is("deleted_at", null)
  .order("decided_at", { ascending: false });
if (error) throw error;

console.log(`전문 미적재 판례: ${rows!.length}건`);
const byYear: Record<string, number> = {};
for (const r of rows!) {
  const y = (r.decided_at ?? "????").slice(0, 4);
  byYear[y] = (byYear[y] ?? 0) + 1;
}
console.log("선고연도별:", Object.fromEntries(Object.entries(byYear).sort().reverse()));
console.log("\n가장 최근 미적재 10건:");
for (const r of rows!.slice(0, 10)) console.log(`  ${r.decided_at}  ${r.case_number}  ${(r.case_title ?? "").slice(0, 30)}`);

if (!CHECK) {
  console.log(`\n(API 조회하려면 --check N)`);
  process.exit(0);
}
if (!OC) { console.error("LAW_API_KEY 없음"); process.exit(2); }

function pickAllPrec(xml: string) {
  const out: { sn: string | null; cn: string | null; name: string | null; date: string | null }[] = [];
  const re = /<prec[^>]*>([\s\S]*?)<\/prec>/gi;
  const pick = (b: string, t: string) => {
    const m = new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, "i").exec(b);
    return m ? m[1].replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "").trim() : null;
  };
  let m;
  while ((m = re.exec(xml)) !== null) {
    const b = m[1];
    out.push({ sn: pick(b, "판례일련번호"), cn: pick(b, "사건번호"), name: pick(b, "사건명"), date: pick(b, "선고일자") });
  }
  return out;
}

const target = rows!.slice(0, CHECK);
console.log(`\n=== 최근 ${target.length}건 open.law.go.kr 조회 ===`);
let avail = 0, notfound = 0, ambiguous = 0, err = 0;
const recoverable: string[] = [];
for (let i = 0; i < target.length; i++) {
  const r = target[i];
  const token = normalizeCaseNumber(r.case_number);
  if (!token) { console.log(`  [${i + 1}] ✗ ${r.case_number} → 파싱불가`); err++; continue; }
  const u = new URL("https://www.law.go.kr/DRF/lawSearch.do");
  u.searchParams.set("OC", OC); u.searchParams.set("target", "prec");
  u.searchParams.set("type", "XML"); u.searchParams.set("query", token);
  u.searchParams.set("display", "20"); u.searchParams.set("page", "1");
  try {
    const resp = await fetch(u.toString(), { headers: { "User-Agent": "lidami-probe/0.1" } });
    const body = await resp.text();
    const matches = pickAllPrec(body).filter((p) => caseNumbersEqual(p.cn, token));
    if (matches.length === 1) {
      avail++; recoverable.push(r.case_number!);
      console.log(`  [${i + 1}] ✅ ${r.case_number} → 등록됨 (일련번호 ${matches[0].sn}, ${matches[0].date})`);
    } else if (matches.length > 1) {
      ambiguous++; console.log(`  [${i + 1}] ⚠️ ${r.case_number} → 중복매칭 ${matches.length}건`);
    } else {
      notfound++; console.log(`  [${i + 1}] ✗ ${r.case_number} → 아직 미등록`);
    }
  } catch (e) {
    err++; console.log(`  [${i + 1}] ✗ ${r.case_number} → 오류 ${(e as Error).message.slice(0, 50)}`);
  }
  if (i < target.length - 1) await new Promise((res) => setTimeout(res, INTERVAL));
}
console.log(`\n=== 결과 === 받아올 수 있음 ${avail} / 아직 미등록 ${notfound} / 중복 ${ambiguous} / 오류 ${err}`);
if (recoverable.length) {
  console.log(`\n지금 적재 가능한 사건번호 (${recoverable.length}건):`);
  console.log(recoverable.join("\n"));
}
