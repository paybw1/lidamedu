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
import { readSheet, writeSheet } from "./xlsx-io";

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
