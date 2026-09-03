// OCR 결과를 운영 DB 에 적재 — 대법원 전문(cases.official_text_md) / 하급심(case_lower_courts.body_text).
//
// ★OCR 텍스트는 국가법령정보센터 원문이 아니다. 머리말로 유래를 밝혀 두지 않으면
//   나중에 누구도 구분하지 못한다(숫자 오독 가능성을 아는 채로 읽어야 한다).
// ★`official_text_unavailable` 은 **true 로 둔다** — "법령정보센터에 전문이 없다"는
//   뜻 그대로 여전히 참이고, 재확인 크론이 이 행을 건너뛰어야 OCR 본문이 안 덮인다.
//
//   node scripts/case-diagram/apply-ocr-text.mjs            # dry-run
//   node scripts/case-diagram/apply-ocr-text.mjs --apply
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const TODAY = "2026-09-03";
const BACKUP_DIR = path.resolve(process.cwd(), "tmp", "ocr");

/** 적재 대상. verify = 본문에 반드시 있어야 하는 식별 문자열(OCR 오독·파일 뒤바뀜 방어). */
const TARGETS = [
  {
    kind: "case",
    caseNumber: "2013후1887",
    file: "tmp/ocr/2013후1887_대법원.md",
    pdf: "2013후1887 대법원 판결서 PDF",
    pages: 4,
    verify: ["2013후1887", "2012허10808", "2016. 1. 28."],
  },
  {
    kind: "case",
    caseNumber: "2011후4011",
    file: "tmp/ocr/2011후4011_대법원.md",
    pdf: "2011후4011 대법원 판결서 PDF",
    pages: 5,
    verify: ["2011후4011", "2011허3063", "2012. 4. 26."],
  },
  {
    kind: "lower",
    caseNumber: "2013다14361",
    lowerCaseNumber: "2012나38362",
    file: "tmp/ocr/2013다14361_원심.md",
    pdf: "서울고등법원 2012나38362 판결서 PDF",
    pages: 20,
    verify: ["2012나38362", "2011가합4396", "2013. 1. 16."],
  },
];

function header(t) {
  return [
    `> **[OCR 변환본]** 이 본문은 ${t.pdf}(본문이 이미지인 스캔본, ${t.pages}쪽)를`,
    `> 광학문자인식으로 옮긴 것입니다. 국가법령정보센터 텍스트 판본이 아니며,`,
    `> 숫자·고유명사에 오독이 있을 수 있으니 인용 전 원본 PDF 와 대조하세요.`,
    `> 변환일 ${TODAY}.`,
    "",
    "",
  ].join("\n");
}

let failed = 0;
const plan = [];

for (const t of TARGETS) {
  const raw = fs.readFileSync(t.file, "utf8").trim();
  const missing = t.verify.filter((v) => !raw.includes(v));
  if (missing.length) {
    console.log(`[중단] ${t.caseNumber} — 본문에서 식별 문자열을 못 찾음: ${missing.join(", ")}`);
    failed += 1;
    continue;
  }

  const { data: kase, error } = await sb
    .from("cases")
    .select("case_id, case_number, official_text_md")
    .eq("case_number", t.caseNumber)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!kase) {
    console.log(`[중단] ${t.caseNumber} — cases 에 없음`);
    failed += 1;
    continue;
  }

  const body = header(t) + raw;

  if (t.kind === "case") {
    plan.push({
      label: `${t.caseNumber} 대법원 전문`,
      before: (kase.official_text_md ?? "").length,
      after: body.length,
      run: async () => {
        const { error: e } = await sb
          .from("cases")
          .update({ official_text_md: body, updated_at: new Date().toISOString() })
          .eq("case_id", kase.case_id);
        if (e) throw new Error(e.message);
      },
      backup: { table: "cases", key: kase.case_id, official_text_md: kase.official_text_md },
    });
  } else {
    const { data: lower, error: le } = await sb
      .from("case_lower_courts")
      .select("lower_id, lower_case_number, body_text, char_count")
      .eq("case_id", kase.case_id)
      .eq("lower_case_number", t.lowerCaseNumber)
      .is("deleted_at", null)
      .maybeSingle();
    if (le) throw new Error(le.message);
    if (!lower) {
      console.log(`[중단] ${t.caseNumber} — 하급심 ${t.lowerCaseNumber} 행 없음`);
      failed += 1;
      continue;
    }
    plan.push({
      label: `${t.caseNumber} 원심 ${t.lowerCaseNumber}`,
      before: (lower.body_text ?? "").length,
      after: body.length,
      run: async () => {
        const { error: e } = await sb
          .from("case_lower_courts")
          .update({
            body_text: body,
            char_count: body.length,
            updated_at: new Date().toISOString(),
          })
          .eq("lower_id", lower.lower_id);
        if (e) throw new Error(e.message);
      },
      backup: {
        table: "case_lower_courts",
        key: lower.lower_id,
        body_text: lower.body_text,
        char_count: lower.char_count,
      },
    });
  }
}

for (const p of plan) {
  console.log(`  ${p.label.padEnd(28)} ${String(p.before).padStart(6)}자 → ${String(p.after).padStart(6)}자`);
}
if (failed) {
  console.log(`\n검증 실패 ${failed}건 — 아무것도 적용하지 않습니다.`);
  process.exit(1);
}
if (!APPLY) {
  console.log(`\ndry-run — ${plan.length}건. 적용하려면 --apply`);
  process.exit(0);
}

fs.mkdirSync(BACKUP_DIR, { recursive: true });
const backupPath = path.join(BACKUP_DIR, `backup-before-ocr-${TODAY}.json`);
fs.writeFileSync(backupPath, JSON.stringify(plan.map((p) => p.backup), null, 2), "utf8");
console.log(`\n백업: ${backupPath}`);

for (const p of plan) {
  await p.run();
  console.log(`  적용 ${p.label}`);
}
console.log(`\n적용 완료 — ${plan.length}건`);
