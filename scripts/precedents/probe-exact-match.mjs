// §0 마무리 — 정확 일치된 본문(ID=171005, 2012후726) 호출해 특허 판례 본문 형태 확인.
// 동시에 §1 정규화 함수 미리 테스트.
//
// 사용: node scripts/precedents/probe-exact-match.mjs

import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv();
const OC = process.env.LAW_API_KEY;
if (!OC) { process.stderr.write("LAW_API_KEY 누락\n"); process.exit(2); }

const OUT = resolve(process.cwd(), "tmp/law-api-probe");
mkdirSync(OUT, { recursive: true });

// §1 미리보기 — 정규화 함수.
function normalizeCaseNumber(raw) {
  if (!raw) return null;
  return String(raw)
    .replace(/ /g, " ")
    .replace(/[\s　.]/g, "")               // 공백·점·전각공백 제거
    .replace(/^대법원/, "")
    .replace(/^서울고등?법원/, "")
    .replace(/^서울중앙지방?법원/, "")
    .replace(/^(특허법원|행정법원)/, "")
    .replace(/선고|판결|결정/g, "")
    .trim();
}

const TESTS = [
  "2012후726",
  "2012 후 726",
  "2012.후.726",
  "대법원 2013.2.28. 선고 2012후726 판결",
  "  2012후726  ",
];
process.stdout.write(`\n=== §1 정규화 미리보기 ===\n`);
for (const t of TESTS) {
  process.stdout.write(`  "${t}"  →  "${normalizeCaseNumber(t)}"\n`);
}

// 본문 호출 — 정확 일치 ID.
const TARGET_ID = "171005";
const TARGET_CASE = "2012후726";

const url = new URL("https://www.law.go.kr/DRF/lawService.do");
url.searchParams.set("OC", OC);
url.searchParams.set("target", "prec");
url.searchParams.set("type", "XML");
url.searchParams.set("ID", TARGET_ID);

process.stdout.write(`\n=== §0 정확 일치 본문 호출 ===\n`);
process.stdout.write(`  사건번호 ${TARGET_CASE} → 판례일련번호 ${TARGET_ID}\n`);

const t0 = Date.now();
const resp = await fetch(url.toString());
const text = await resp.text();
const ms = Date.now() - t0;
const path = resolve(OUT, "exact-match.xml");
writeFileSync(path, text, "utf-8");
process.stdout.write(`  ${resp.status} ${text.length}B ${ms}ms → ${path}\n`);

function pick(xml, tag) {
  const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(xml);
  return m ? m[1].replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "").trim() : null;
}

const fields = {
  판례정보일련번호: pick(text, "판례정보일련번호"),
  사건번호: pick(text, "사건번호"),
  사건명: pick(text, "사건명"),
  법원명: pick(text, "법원명"),
  선고일자: pick(text, "선고일자"),
  사건종류명: pick(text, "사건종류명"),
  판결유형: pick(text, "판결유형"),
  판시사항_길이: (pick(text, "판시사항") ?? "").length,
  판결요지_길이: (pick(text, "판결요지") ?? "").length,
  참조조문_길이: (pick(text, "참조조문") ?? "").length,
  참조판례_길이: (pick(text, "참조판례") ?? "").length,
  판례내용_길이: (pick(text, "판례내용") ?? "").length,
};

process.stdout.write(`\n=== 필드 매핑 ===\n`);
for (const [k, v] of Object.entries(fields)) {
  process.stdout.write(`  ${k}: ${typeof v === "number" ? v + "자" : v}\n`);
}

const got = fields.사건번호;
const match =
  normalizeCaseNumber(got) === normalizeCaseNumber(TARGET_CASE);
process.stdout.write(`\n=== §1 정확 매칭 시뮬레이션 ===\n`);
process.stdout.write(
  `  API 응답 사건번호 "${got}" → "${normalizeCaseNumber(got)}"\n  입력 "${TARGET_CASE}" → "${normalizeCaseNumber(TARGET_CASE)}"\n  match=${match ? "✓" : "✗"}\n`,
);

// 판시사항·판례내용 앞부분 살짝 보여주기 (HTML <br/> 가 들어 있는지 확인).
const issueHead = (pick(text, "판시사항") ?? "").slice(0, 300);
const contentHead = (pick(text, "판례내용") ?? "").slice(0, 300);
process.stdout.write(`\n=== 판시사항(앞 300자) ===\n${issueHead}\n`);
process.stdout.write(`\n=== 판례내용(앞 300자) ===\n${contentHead}\n`);
