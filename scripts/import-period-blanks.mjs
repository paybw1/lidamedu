// 사용자가 검토 후 수정한 CSV (scripts/output/period-blanks-review.csv) 를 읽어
// app/features/blanks/lib/period-blanks-overrides.json 에 override 로 반영.
//
// CSV 의 "빈칸1"~"빈칸4" 컬럼 값을 그대로 override 로 채택 (CSV 가 source of truth).
//   - 4개 셀 모두 비어있는 row → 그 블록은 "빈칸 없음" (자동 매칭도 무시).
//   - 한 셀이라도 값이 있으면 → 그 값들을 순서대로 빈칸으로 사용.
//   - "의도" 컬럼은 보조 입력 — 비어있지 않으면 빈칸1~4 보다 우선 (| 로 구분).
//
// 사용:
//   1) node scripts/export-period-blanks.mjs    — CSV 생성
//   2) Excel/스프레드시트에서 수정 (빈칸1~4 직접 편집 또는 의도 컬럼 사용)
//   3) node scripts/import-period-blanks.mjs    — overrides.json 갱신

import { promises as fs } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const CSV_PATH = resolve(ROOT, "scripts/output/period-blanks-review.csv");
const OVERRIDES_PATH = resolve(
  ROOT,
  "app/features/blanks/lib/period-blanks-overrides.json",
);

const LAW_LABEL_TO_CODE = {
  특허법: "patent",
  상표법: "trademark",
  디자인보호법: "design",
  민법: "civil",
  민사소송법: "civil-procedure",
};

// 매우 간단한 CSV 파서 — RFC 4180 기본 (따옴표 escape, 줄바꿈 in field 지원).
function parseCsv(text) {
  // BOM 제거.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [];
  let field = "";
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuote) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuote = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuote = true;
      } else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field);
        field = "";
        rows.push(row);
        row = [];
      } else {
        field += c;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

async function main() {
  const csvText = await fs.readFile(CSV_PATH, "utf8");
  const rows = parseCsv(csvText);
  if (rows.length === 0) {
    console.error("CSV 가 비어있습니다.");
    process.exit(1);
  }
  const header = rows[0];
  const idx = (name) => header.findIndex((h) => h.trim() === name);
  const lawIdx = idx("법");
  const articleIdx = idx("조문");
  const sourceIdx = idx("출처");
  const blockIdx = idx("블록");
  const intendedIdx = idx("의도(수정 시 입력 — | 로 구분)");
  const blank1Idx = idx("빈칸1");
  const blank2Idx = idx("빈칸2");
  const blank3Idx = idx("빈칸3");
  const blank4Idx = idx("빈칸4");
  if (
    lawIdx < 0 || articleIdx < 0 || sourceIdx < 0 || blockIdx < 0 ||
    blank1Idx < 0 || blank2Idx < 0 || blank3Idx < 0 || blank4Idx < 0
  ) {
    console.error(`필수 컬럼 누락. header: ${JSON.stringify(header)}`);
    process.exit(1);
  }

  // 기존 overrides 보존 — CSV 에 안 나온 키는 그대로 둠 (수동 추가/유지 가능).
  let existing = {};
  try {
    const raw = await fs.readFile(OVERRIDES_PATH, "utf8");
    existing = JSON.parse(raw);
  } catch {}

  const overrides = { ...existing };
  let total = 0;
  let cleared = 0;
  let kept = 0;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const lawLabel = (row[lawIdx] ?? "").trim();
    if (!lawLabel) continue;
    const lawCode = LAW_LABEL_TO_CODE[lawLabel];
    if (!lawCode) {
      console.warn(`알 수 없는 법: "${lawLabel}" (row ${r + 1}) — skip`);
      continue;
    }
    const articleLabel = (row[articleIdx] ?? "").trim();
    const source = (row[sourceIdx] ?? "").trim();
    const blockPath = (row[blockIdx] ?? "").trim();
    const key = `${articleLabel}|${source}|${blockPath}`;

    // 의도 컬럼이 있으면 우선 사용 (- = 빈칸 없음, | 로 구분).
    let answers;
    const intended = intendedIdx >= 0 ? (row[intendedIdx] ?? "").trim() : "";
    if (intended) {
      if (intended === "-") {
        answers = [];
      } else {
        answers = intended.split("|").map((s) => s.trim()).filter(Boolean);
      }
    } else {
      // 빈칸1~4 cell 직접 편집 모드 — 비어있지 않은 cell 들을 순서대로.
      answers = [
        (row[blank1Idx] ?? "").trim(),
        (row[blank2Idx] ?? "").trim(),
        (row[blank3Idx] ?? "").trim(),
        (row[blank4Idx] ?? "").trim(),
      ].filter(Boolean);
    }

    overrides[lawCode] = overrides[lawCode] ?? {};
    overrides[lawCode][key] = answers;
    total++;
    if (answers.length === 0) cleared++;
    else kept++;
  }

  await fs.writeFile(
    OVERRIDES_PATH,
    JSON.stringify(overrides, null, 2) + "\n",
    "utf8",
  );
  console.log(
    `✓ ${total} overrides → ${OVERRIDES_PATH}\n` +
      `  ${kept} 행: 빈칸 유지/수정\n` +
      `  ${cleared} 행: 빈칸 없음 (모두 비어있음)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
