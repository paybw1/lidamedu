// 「법원간행물(대법원판례해설_list).xlsx」에 판례번호·권호·발간년도를 채운다.
//
// 세 곳에서 모은다.
//   · 판례번호 — 각 해설 PDF 첫머리의 "(2016. 5. 26. 선고 2015도17674 판결: 공2016하, 905)"
//   · 권호·발간년도 — 총목록(category_146.pdf) 지식재산권 편
//   · 논문제목·저자 — 이미 엑셀에 있다(파일명과 같다)
//
// ★총목록과 해설 PDF 를 잇는 열쇠는 제목이 아니라 **(저자 + 시작면수)** 다.
//   총목록의 제목은 표에서 여러 줄로 갈라져 행 경계가 모호한데, 저자와 시작면수는
//   앵커 한 줄에 함께 있고 해설 PDF 도 첫머리에 시작면수를 찍는다.
//
// 사용:
//   npx tsx scripts/court-publications/update-haeseol-xlsx.ts          # 예행(리포트만)
//   npx tsx scripts/court-publications/update-haeseol-xlsx.ts --apply  # 엑셀 갱신(원본 백업)
import AdmZip from "adm-zip";
import { copyFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { extractPdfHeadText } from "../../app/features/cases/lib/pdf-extract.server";
import {
  type IndexEntry as IndexEntryRef,
  matchKey,
  parseHaeseolIndex,
} from "./parse-haeseol-index";

const DIR = "source/법원간행물/대법원판례해설";
const XLSX = path.join(DIR, "법원간행물(대법원판례해설_list).xlsx");
const APPLY = process.argv.includes("--apply");

// ── 해설 PDF 한 편에서 뽑는 것 ─────────────────────────────────────────────

/**
 * 첫머리 표제부: "(2016. 5. 26. 선고 2015도17674 판결: 공2016하, 905)".
 * 결정문은 "…자 2015마1234 결정", 병합 사건은 "2013후2873, 2880 판결" 처럼 붙는다.
 */
const HEADNOTE =
  /\((\d{4}\.\s*\d{1,2}\.\s*\d{1,2}\.)\s*(?:자|선고)\s*([^)]*?)\s*(전원합의체\s*)?(판결|결정)/;
/** 사건번호 토막 — "2015도17674" · "2013후2873" · "2015마1234". */
const CASE_NO = /\d{2,4}[가-힣]{1,3}\d+(?:\s*,\s*\d+)*/g;

export interface Paper {
  seq: number; // 파일명 앞 번호(엑셀 번호와 같다)
  file: string;
  title: string; // 파일명에서 읽은 논문 제목
  author: string; // 파일명 괄호 안(한자일 수 있다)
  caseNos: string; // "2015도17674" · 여러 건이면 ", " 로
  decidedAt: string; // "2016. 5. 26."
  startPage: number | null; // 총목록과 잇는 열쇠
}

const FILE_NAME = /^(\d+)\.(.+)\((.+)\)\.pdf$/;

async function readPaper(file: string): Promise<Paper | null> {
  const m = FILE_NAME.exec(file);
  if (!m) return null;
  // 표제부는 첫 쪽에 있다 — 전 쪽을 읽으면 시간도 WASM 힙도 낭비다.
  const head = (
    await extractPdfHeadText(new Uint8Array(readFileSync(path.join(DIR, file))))
  ).slice(0, 1500);

  const hn = HEADNOTE.exec(head);
  const caseNos = hn ? (hn[2].match(CASE_NO) ?? []).join(", ") : "";

  // 시작면 — 첫머리 몇 줄 안의 홀로 선 3~4자리 수. 제목·저자 줄 사이에 끼어 있다.
  const startPage = (() => {
    for (const line of head.split("\n").slice(0, 12)) {
      const t = line.trim();
      if (/^\d{1,4}$/.test(t)) {
        const n = Number(t);
        if (n >= 2) return n; // 1~2 는 해설 안 번호(각주·순번)라 걸러진다
      }
    }
    return null;
  })();

  return {
    seq: Number(m[1]),
    file,
    title: m[2].trim(),
    author: m[3].trim(),
    caseNos,
    decidedAt: hn ? hn[1].replace(/\s+/g, " ") : "",
    startPage,
  };
}

// ── 엑셀 읽기/쓰기 (adm-zip — 새 의존성 없이 sheet1.xml 만 갈아 끼운다) ──────

// ★텍스트 노드에서는 & < > 만 이스케이프한다. 따옴표까지 바꾸면 원문에 없던
//   "&apos;" 가 제목에 박힌 것처럼 보인다(속성값이 아니라 필요도 없다).
const XML_ESC: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
};
const esc = (s: string) => s.replace(/[&<>]/g, (c) => XML_ESC[c]);

/** XML 실체참조 되돌리기 — &amp; 를 마지막에 풀어야 이중 복원이 안 생긴다. */
const unesc = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

function colName(i: number): string {
  let s = "";
  for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) {
    s = String.fromCharCode(65 + (n % 26)) + s;
  }
  return s;
}

function readSheet(zip: AdmZip): string[][] {
  const ssXml = zip.readAsText("xl/sharedStrings.xml");
  const shared = [...ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    unesc(
      [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(""),
    ),
  );
  const sheet = zip.readAsText("xl/worksheets/sheet1.xml");
  const out: string[][] = [];
  for (const r of sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const c of r[1].matchAll(
      /<c r="([A-Z]+)\d+"([^>]*)>(?:<v>([^<]*)<\/v>|<is>([\s\S]*?)<\/is>)?<\/c>|<c r="([A-Z]+)\d+"[^>]*\/>/g,
    )) {
      const ref = c[1] ?? c[5];
      let idx = 0;
      for (const ch of ref) idx = idx * 26 + (ch.charCodeAt(0) - 64);
      idx -= 1;
      let val = "";
      if (c[3] !== undefined) {
        val = /t="s"/.test(c[2] ?? "") ? (shared[Number(c[3])] ?? "") : c[3];
      } else if (c[4] !== undefined) {
        // 인라인 문자열(이 스크립트가 쓴 결과) — 다시 돌려도 값이 그대로여야 한다.
        val = unesc(
          [...c[4].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
            .map((x) => x[1])
            .join(""),
        );
      }
      row[idx] = val;
    }
    out.push([...row].map((v) => v ?? ""));
  }
  return out;
}

function writeSheet(zip: AdmZip, rows: string[][]): void {
  const body = rows
    .map((row, r) => {
      const cells = row
        .map((v, c) =>
          v === "" || v == null
            ? ""
            : /^\d+$/.test(v)
              ? `<c r="${colName(c)}${r + 1}"><v>${v}</v></c>`
              : `<c r="${colName(c)}${r + 1}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`,
        )
        .join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");
  const width = Math.max(...rows.map((r) => r.length));
  const xml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<dimension ref="A1:${colName(width - 1)}${rows.length}"/>` +
    '<sheetViews><sheetView workbookViewId="0"/></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="16.5"/>' +
    "<cols>" +
    '<col min="1" max="1" width="7" customWidth="1"/>' +
    '<col min="2" max="2" width="12" customWidth="1"/>' +
    '<col min="3" max="3" width="70" customWidth="1"/>' +
    '<col min="4" max="4" width="12" customWidth="1"/>' +
    '<col min="5" max="5" width="22" customWidth="1"/>' +
    '<col min="6" max="6" width="10" customWidth="1"/>' +
    '<col min="7" max="7" width="14" customWidth="1"/>' +
    '<col min="8" max="8" width="9" customWidth="1"/>' +
    "</cols>" +
    `<sheetData>${body}</sheetData>` +
    "</worksheet>";
  zip.updateFile("xl/worksheets/sheet1.xml", Buffer.from(xml, "utf8"));
  // 인라인 문자열만 쓰므로 공유문자열은 비운다(남겨 두면 Excel 이 불일치로 경고).
  zip.updateFile(
    "xl/sharedStrings.xml",
    Buffer.from(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="0" uniqueCount="0"/>',
      "utf8",
    ),
  );
}

// ── 본체 ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const files = readdirSync(DIR).filter(
    (f) => f.toLowerCase().endsWith(".pdf") && FILE_NAME.test(f),
  );
  console.log(`해설 PDF ${files.length}편 읽는 중…`);
  const papers: Paper[] = [];
  for (const [i, f] of files.entries()) {
    const p = await readPaper(f);
    if (p) papers.push(p);
    if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${files.length}`);
  }
  papers.sort((a, b) => a.seq - b.seq);

  const noCase = papers.filter((p) => !p.caseNos);
  const noPage = papers.filter((p) => p.startPage == null);
  console.log(
    `\n판례번호 못 찾음 ${noCase.length}편 · 시작면 못 찾음 ${noPage.length}편`,
  );
  for (const p of noCase.slice(0, 8)) console.log(`   [판례번호] ${p.file}`);
  for (const p of noPage.slice(0, 8)) console.log(`   [시작면] ${p.file}`);

  // 총목록과 잇기.
  //   ① 시작면이 읽혔으면 그게 가장 확실한 열쇠(앵커 한 줄에 다 들어 있다).
  //   ② 못 읽었으면 **제목**으로 찾는다 — 오래된 해설은 한글 텍스트층이 깨져 있어
  //      시작면조차 안 나오지만, 파일명 제목은 총목록에서 온 것이라 글자가 그대로다.
  //   ★제목이 여러 줄로 갈라지므로 "그 조각이 있는 줄"을 찾고, 거기서 **가장 가까운
  //     앵커**를 그 행으로 본다(행 경계 복원 없이).
  const { entries: index, lines } = await parseHaeseolIndex();
  const keyed = lines.map(matchKey);
  const byPage = new Map<number, typeof index>();
  for (const e of index) {
    if (!byPage.has(e.page)) byPage.set(e.page, []);
    byPage.get(e.page)!.push(e);
  }

  /**
   * 제목으로 총목록 행 찾기.
   * ★"제목 조각이 든 줄"만 보면 못 가른다 — 위아래 행의 창(窓)이 겹쳐 여러 앵커가
   *   똑같이 걸린다(실측: 한 제목에 앵커 3개). 그래서 **앵커마다 점수를 매긴다**.
   *     · 앵커 줄에 함께 찍힌 논제 조각(titleHint)이 제목의 머리와 맞으면 큰 가산점
   *     · 앵커 앞뒤 2줄을 이어 붙인 창에 제목의 앞 N자가 들어 있으면 그 N
   *   최고점이 하나로 갈릴 때만 채택한다.
   */
  const MIN_SCORE = 8;
  function findByTitle(title: string, pool: IndexEntryRef[]) {
    const key = matchKey(title);
    if (key.length < MIN_SCORE) return undefined;
    let best: IndexEntryRef | undefined;
    let bestScore = 0;
    let tied = false;
    for (const e of pool) {
      const from = Math.max(0, e.at - 2);
      const to = Math.min(keyed.length - 1, e.at + 2);
      const ctx = keyed.slice(from, to + 1).join("");
      let score = 0;
      for (let n = Math.min(key.length, 60); n >= MIN_SCORE; n -= 2) {
        if (ctx.includes(key.slice(0, n))) {
          score = n;
          break;
        }
      }
      // ★총목록 제목이 파일명보다 **짧은** 경우가 있다("직무발명 보상금 산정 방법" vs
      //   "…- 사용자가 얻을 이익과 발명 완성 이후의 사정을 중심으로"). 앞부분 일치 길이만
      //   보면 0점이 되어 통째로 놓친다 — 앵커가 든 논제 조각이 제목 안에 있으면 그것으로 센다.
      const hint = matchKey(e.titleHint);
      if (hint.length >= 8 && key.startsWith(hint)) {
        score = Math.max(score, hint.length) + 100;
      } else if (hint.length >= 10 && key.includes(hint)) {
        score = Math.max(score, hint.length) + 60;
      }
      if (score === 0) continue;
      if (score > bestScore) {
        bestScore = score;
        best = e;
        tied = false;
      } else if (score === bestScore) tied = true;
    }
    return tied ? undefined : best;
  }

  let matched = 0;
  const unmatched: Paper[] = [];
  const vol = new Map<
    number,
    { volume: string; issued: string; page: number }
  >();
  for (const p of papers) {
    // 같은 면수가 여러 권에 걸치면 제목으로 가른다. 면수를 못 읽었으면 전체에서 찾는다.
    const samePage = p.startPage == null ? [] : (byPage.get(p.startPage) ?? []);
    let pick: IndexEntryRef | undefined =
      samePage.length === 1
        ? samePage[0]
        : samePage.length > 1
          ? findByTitle(p.title, samePage)
          : undefined;
    if (!pick) pick = findByTitle(p.title, index);
    if (pick) {
      matched++;
      vol.set(p.seq, {
        volume: pick.volume,
        issued: pick.issued,
        page: pick.page,
      });
    } else unmatched.push(p);
  }
  console.log(
    `
총목록 대조: 맞춘 것 ${matched}편 / ${papers.length}편 · 못 맞춘 것 ${unmatched.length}편`,
  );
  for (const p of unmatched.slice(0, 15))
    console.log(
      `   ${String(p.seq).padStart(3)} ${p.startPage ?? "-"}면  ${p.title.slice(0, 50)}`,
    );

  // ── 엑셀 갱신 ────────────────────────────────────────────────────────────
  const zip = new AdmZip(XLSX);
  const rows = readSheet(zip);
  console.log(`\n엑셀 ${rows.length - 1}행`);

  const bySeq = new Map(papers.map((p) => [p.seq, p]));
  const header = [
    "번호",
    "발행연도",
    "논문 제목",
    "저자",
    "판례번호",
    "선고일",
    "권호",
    "발간년도",
  ];
  const next: string[][] = [header];
  let filled = 0;
  const missing: string[] = [];
  for (const row of rows.slice(1)) {
    const seq = Number(row[0]);
    const p = bySeq.get(seq);
    const v = vol.get(seq);
    if (p?.caseNos) filled++;
    else missing.push(`${seq} ${row[2]?.slice(0, 40)}`);
    next.push([
      row[0] ?? "",
      row[1] ?? "",
      row[2] ?? "",
      row[3] ?? "",
      p?.caseNos ?? "",
      p?.decidedAt ?? "",
      v?.volume ?? "",
      v?.issued ?? "",
    ]);
  }
  console.log(`판례번호 채운 행 ${filled} / ${next.length - 1}`);
  if (missing.length)
    console.log(
      `빈 행 ${missing.length}개:\n   ` + missing.slice(0, 10).join("\n   "),
    );

  if (!APPLY) {
    console.log(
      "\n[예행] --apply 를 붙이면 엑셀을 갱신합니다(원본은 .bak 으로 남깁니다).",
    );
    console.log("\n표본 5행");
    for (const r of next.slice(1, 6))
      console.log("   " + r.join(" | ").slice(0, 160));
    return;
  }

  const bak = XLSX.replace(/\.xlsx$/, ".원본.xlsx");
  if (!existsSync(bak)) copyFileSync(XLSX, bak);
  writeSheet(zip, next);
  zip.writeZip(XLSX);
  console.log(`\n갱신 완료 · 원본 백업 ${bak}`);
}

await main();
