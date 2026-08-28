// 대법원 판례해설 목록의 해설을 판례 화면「관련 논문·기사」(case_references)에 등록한다.
//
// compare-haeseol-with-cases.mjs 가 만든 tmp/haeseol-<구분>-vs-cases.json 을 입력으로 쓴다.
//
// ★case_id 를 그대로 믿지 않는다 — insert 직전에 DB 에서 다시 읽어 사건번호를 대조한다
//   (뉴스기사 일괄 등록 때 에이전트가 준 case_id 1건이 어긋났던 전례).
// ★멱등 — 같은 판례에 같은 호수의 해설이 이미 있으면 건너뛴다.
//
// 사용:
//   node scripts/court-publications/insert-haeseol-references.mjs            # 예행
//   node scripts/court-publications/insert-haeseol-references.mjs --apply
import "dotenv/config";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const GUBUN = argv.includes("--gubun") ? argv[argv.indexOf("--gubun") + 1] : "특";
const IN = `tmp/haeseol-${GUBUN}-vs-cases.json`;
/** 콘텐츠 등록 주체 — 기존 참고문헌과 같은 원장 계정. */
const AUTHOR = "e20ac99a-bfa6-4862-94dd-23c063189463";

const volOf = (s) => Number(/([0-9]+)\s*호/.exec(s ?? "")?.[1] ?? NaN);
const TOK = /(\d{2,4})\s*([가-힣]{1,3})\s*(\d+)/;
function tokens(s) {
  if (!s) return [];
  const out = [];
  let year = null, kind = null;
  for (const p of s.split(/[,，·]/).map((x) => x.trim()).filter(Boolean)) {
    const m = TOK.exec(p);
    if (m) { year = m[1]; kind = m[2]; out.push(m[1] + m[2] + m[3]); }
    else if (/^\d+$/.test(p) && year) out.push(year + kind + p);
  }
  return out;
}

/**
 * 목록의 제목에는 편집 흔적이 섞여 있다 — 앞의 분류표시("지식재산권02"), 뒤의
 * 인용정보("… 2014. 8. 20. 선고 2013다41578 판결 공2014하, 1797"). 화면에 그대로
 * 두면 제목이 아니라 서지사항처럼 읽히므로 떼어낸다.
 */
const cleanTitle = (t) =>
  t
    .replace(/^\s*지식재산권\s*\d+\s*/, "")
    .replace(/\s+\d{4}\.\s*\d{1,2}\.\s*\d{1,2}\.\s*선고[\s\S]*$/, "")
    .replace(/\s+/g, " ")
    .trim();

const { present } = JSON.parse(fs.readFileSync(IN, "utf8"));
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const plan = [], skip = [], bad = [];
for (const p of present) {
  const { data: c, error } = await sb
    .from("cases")
    .select("case_id, case_number, deleted_at")
    .eq("case_id", p.hit.case_id)
    .maybeSingle();
  if (error) throw error;
  // ① 살아있는 판례인가 ② 사건번호가 목록과 겹치는가 — 둘 다 통과해야 등록한다.
  if (!c || c.deleted_at) { bad.push({ ...p, why: "삭제됐거나 없음" }); continue; }
  const mine = new Set(tokens(c.case_number));
  if (!tokens(p.caseNo).some((t) => mine.has(t))) {
    bad.push({ ...p, why: `사건번호 불일치 (DB ${c.case_number})` });
    continue;
  }
  const { data: refs, error: rErr } = await sb
    .from("case_references")
    .select("reference_id, title, source")
    .eq("case_id", c.case_id);
  if (rErr) throw rErr;
  const want = volOf(p.vol);
  const dup = refs.find((r) => {
    const text = (r.title ?? "") + (r.source ?? "");
    if (!/판례해설/.test(text)) return false;
    const got = volOf(text);
    return Number.isNaN(want) || Number.isNaN(got) || got === want;
  });
  if (dup) { skip.push({ ...p, dup: dup.title }); continue; }

  plan.push({
    case_id: c.case_id,
    kind: "paper",
    title: cleanTitle(p.title),
    authors: p.author || null,
    // 「제목 / 저자 · 출처」로 읽히도록 출처에 권호와 발간 시기를 함께 둔다.
    source: `대법원 판례해설 ${p.vol}${p.pub ? ` (${p.pub})` : ""}`,
    published_at: null,
    url: null,
    pdf_url: null,
    note: null,
    ord: 0,
    created_by: AUTHOR,
    _caseNo: c.case_number,
  });
}

console.log(`대상 ${present.length} → 등록 ${plan.length} · 이미 있음 ${skip.length} · 제외 ${bad.length}`);
for (const b of bad) console.log(`  [제외] ${b.caseNo} — ${b.why}`);
for (const s of skip) console.log(`  [보유] ${s.caseNo} — ${s.dup}`);
if (!APPLY) {
  for (const r of plan.slice(0, 5))
    console.log(`  예시: ${r._caseNo} | ${r.title} | ${r.authors} | ${r.source}`);
  console.log("예행 — 반영하려면 --apply");
  process.exit(0);
}

let done = 0;
for (const r of plan) {
  const { _caseNo, ...row } = r;
  const { error } = await sb.from("case_references").insert(row);
  if (error) { console.error(`실패 ${_caseNo}:`, error.message); continue; }
  done++;
}
console.log(`등록 완료 ${done}/${plan.length}`);
