// 한글 텍스트층이 깨진 해설 PDF 의 **판례번호를 제목으로 찾아 채운다**.
//
// 해설 제목은 그 판결의 판시사항을 거의 그대로 옮긴 것이라, 국가법령정보센터 판례
// 본문검색(target=prec, search=2)에 제목을 넣으면 그 판결이 나온다.
//
// ★그러나 검색은 **틀릴 수 있다**. 레퍼런스 표에 잘못된 사건번호가 박히면 그걸 믿고
//   인용하게 되므로, 아래 두 가지로 조인다.
//     ① 대법원 판결만 — 대법원판례해설이니 하급심은 답이 아니다.
//     ② 선고일이 **발간년도 창** 안에 들 것 — 해설은 그 반기에 선고된 판결을 다룬다.
//   그리고 **이미 답을 아는 행(PDF 에서 읽어낸 188행)으로 먼저 정확도를 재고**,
//   쓸 만할 때만 빈 행을 채운다(--apply).
//
// 사용:
//   npx tsx scripts/court-publications/fill-case-no-by-title.ts --backtest   # 정확도 측정
//   npx tsx scripts/court-publications/fill-case-no-by-title.ts              # 빈 행 예행
//   npx tsx scripts/court-publications/fill-case-no-by-title.ts --apply      # 반영
import AdmZip from "adm-zip";
import { copyFileSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";

import { matchKey } from "./parse-haeseol-index";
import { readSheet, writeSheet } from "./xlsx-io";

const DIR = "source/법원간행물/대법원판례해설";
const XLSX = path.join(DIR, "법원간행물(대법원판례해설_list).xlsx");
const APPLY = process.argv.includes("--apply");
const BACKTEST = process.argv.includes("--backtest");
/** 백테스트에서 **발간년도를 모르는 척** 해 본다 — 창 없는 경로의 정확도 측정용. */
const NO_WINDOW = process.argv.includes("--nowindow");
const LIMIT = Number(
  process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? "0",
);

// ★display=20 을 유지한다. 100 으로 늘려 봤더니 커버리지는 그대로인데(45%) 정답과
//   비슷한 문구의 다른 판결이 창을 통과해 정확도만 100%→92.6% 로 떨어졌다(실측).
const API = "https://www.law.go.kr/DRF/lawSearch.do";
/** 국가법령정보센터가 막지 않도록 사이를 둔다. */
const DELAY_MS = 350;
/** 서로 다른 질의 몇 벌에서 걸려야 인정하는가 — 정확도를 커버리지보다 앞세운다. */
const MIN_VOTES = 2;

interface Hit {
  caseNo: string;
  decidedAt: string; // "2021.12.30"
  court: string;
  caseName: string;
  serial: string; // 판례일련번호 — 본문 확인에 쓴다
}

const DETAIL = "https://www.law.go.kr/DRF/lawService.do";

/**
 * 판시사항·판결요지 원문. 질의 한 벌에서만 걸린 후보를 **버리지 않고 확인**하는 데 쓴다.
 * 해설 제목은 판시사항을 거의 그대로 옮긴 것이라, 제목 조각이 본문에 있으면 그 판결이다.
 */
async function headnoteOf(serial: string): Promise<string> {
  if (!serial) return "";
  const res = await fetch(
    `${DETAIL}?OC=test&target=prec&ID=${encodeURIComponent(serial)}&type=JSON`,
  );
  if (!res.ok) return "";
  try {
    const j = JSON.parse(await res.text()) as {
      PrecService?: Record<string, unknown>;
    };
    const p = j.PrecService ?? {};
    return [p["판시사항"], p["판결요지"], p["사건명"]]
      .filter((x): x is string => typeof x === "string")
      .join(" ");
  } catch {
    return "";
  }
}

async function search(query: string): Promise<Hit[]> {
  const url =
    `${API}?OC=test&target=prec&type=JSON&search=2&display=20` +
    `&query=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return []; // 검색 실패 시 HTML 오류쪽을 돌려준다
  }
  const list = (json as { PrecSearch?: { prec?: unknown } })?.PrecSearch?.prec;
  const arr = Array.isArray(list) ? list : list ? [list] : [];
  return arr.map((r) => {
    const o = r as Record<string, string>;
    return {
      caseNo: o["사건번호"] ?? "",
      decidedAt: o["선고일자"] ?? "",
      court: o["법원명"] ?? "",
      caseName: o["사건명"] ?? "",
      serial: o["판례일련번호"] ?? "",
    };
  });
}

/**
 * 발간년도("2011년 하") → 선고일이 드는 창.
 *
 * ★실측(판례번호를 아는 185행, 2026-08-27): 선고월 − 반기 시작월이 **전건 0~5개월**.
 *   즉 "2011년 하" = 2011-07 ~ 2011-12 선고. 넘치는 건이 하나도 없어 창을 반기에
 *   정확히 맞춘다 — 넓게 잡으면 엉뚱한 판결이 창을 통과해 잘못 채워진다.
 *   (총목록의 열 이름은 "발간년도"지만 값은 사실상 **선고 반기**다.)
 */
function window(issued: string): { from: Date; to: Date } | null {
  const m = /^(\d{4})년(?:\s*([상하]))?$/.exec(issued.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const half = m[2];
  if (half === "상") return { from: new Date(y, 0, 1), to: new Date(y, 5, 30) };
  if (half === "하")
    return { from: new Date(y, 6, 1), to: new Date(y, 11, 31) };
  // 반기 표기가 없는 옛 권호는 그 해 전체로 본다.
  return { from: new Date(y, 0, 1), to: new Date(y, 11, 31) };
}

/**
 * "2025.12.30"(API) · "2025. 12. 11."(해설 표제부) 둘 다 읽는다.
 * ★구분자 뒤 공백을 안 봐주면 표제부 날짜가 통째로 안 읽혀 **창 필터가 꺼진 채**
 *   돌아간다(백테스트에서 창 적중 39/185 로 드러남).
 */
function parseDate(s: string): Date | null {
  const m = /^(\d{4})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})/.exec(s.trim());
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/**
 * 검색어 여러 벌 — 제목 전체는 0건이 잦고, 짧게 자르면 여러 판결이 걸린다.
 * 길이를 달리해 여러 번 던지고 **교집합**으로 가른다(findCase).
 */
function queries(title: string): string[] {
  const clean = title
    .replace(/^[가-힣]\.\s*/, "") // "가. " 머리 제거
    .replace(/[‘’'“”"]/g, " ")
    .replace(/[()（）]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = clean.split(" ").filter(Boolean);
  const out = [clean];
  for (const n of [10, 7, 5, 3]) {
    if (words.length > n) out.push(words.slice(0, n).join(" "));
  }
  // 제목 뒷부분이 논점을 담는 경우도 있다("… 여부의 판단 기준").
  if (words.length > 6) out.push(words.slice(-6).join(" "));
  return [...new Set(out)].filter((q) => q.length >= 6);
}

interface Row {
  seq: string;
  title: string;
  caseNo: string;
  issued: string;
}

/**
 * 제목으로 찾은 후보. **확신이 없으면 null** — 레퍼런스 표에 틀린 사건번호가 박히면
 * 그걸 믿고 인용하게 되므로, 찍느니 비워 둔다.
 *
 * 질의를 여러 벌 던져 (대법원 + 발간반기 창)을 통과한 것만 모으고, 남은 사건번호가
 * 하나뿐일 때만 채택한다. 여럿이면 **가장 많은 질의에서 걸린 것**이 유일할 때만.
 */
async function findCase(row: Row): Promise<{ hit: Hit; why: string } | null> {
  const win = window(row.issued);
  const seen = new Map<string, { hit: Hit; votes: number }>();
  for (const q of queries(row.title)) {
    const hits = await search(q);
    await new Promise((r) => setTimeout(r, DELAY_MS));
    const ok = hits.filter((h) => {
      if (!h.court.includes("대법원")) return false;
      if (!win) return true; // 아래에서 걸러진다(발간반기 없는 행은 채우지 않는다)
      const d = parseDate(h.decidedAt);
      return d ? d >= win.from && d <= win.to : false;
    });
    for (const h of ok) {
      const cur = seen.get(h.caseNo);
      if (cur) cur.votes++;
      else seen.set(h.caseNo, { hit: h, votes: 1 });
    }
  }
  if (seen.size === 0) return null;

  /**
   * 판시사항 대조 — 해설 제목의 한 토막이 판결 본문에 **그대로** 있으면 그 판결이다.
   * 14자 이상 이어지는 일치는 법률 산문에서 우연히 나오지 않는다.
   */
  async function byHeadnote(): Promise<{ hit: Hit; why: string } | null> {
    const key = matchKey(row.title);
    if (key.length < 14) return null;
    const probe = key.slice(0, Math.min(24, key.length));
    const passed: Hit[] = [];
    for (const v of seen.values()) {
      const body = matchKey(await headnoteOf(v.hit.serial));
      await new Promise((r) => setTimeout(r, DELAY_MS));
      if (!body) continue;
      for (let n = probe.length; n >= 14; n -= 2) {
        if (body.includes(probe.slice(0, n))) {
          passed.push(v.hit);
          break;
        }
      }
    }
    return passed.length === 1
      ? { hit: passed[0], why: "판시사항 대조" }
      : null;
  }

  // ★발간반기를 모르는 행은 **채우지 않는다**.
  //   본문 대조만으로 가려 봤더니(--nowindow 백테스트, 표본 70) 커버리지 8.6% 에
  //   정확도 83.3% 였다 — 100행 중 9행을 채우면서 그중 하나가 틀린다. 그 값이면
  //   비워 두는 편이 낫다(레퍼런스 표에 틀린 사건번호가 박히면 그대로 인용된다).
  //   이 행들을 채우려면 발간반기부터 확보해야 한다(권호 대조 실패분 100행).
  if (!win) return null;

  // ★질의 **한 벌에서만** 걸린 것은 믿지 않는다. 짧게 자른 질의는 느슨하게 관련된
  //   판결까지 끌어오는데, 백테스트에서 틀린 3건이 전부 이 경우였다(2026-08-27).
  const ranked = [...seen.values()]
    .filter((v) => v.votes >= MIN_VOTES)
    .sort((a, b) => b.votes - a.votes);
  if (ranked.length === 0) return byHeadnote();
  if (ranked.length === 1)
    return { hit: ranked[0].hit, why: `단독(질의 ${ranked[0].votes}벌)` };
  if (ranked[0].votes > ranked[1].votes)
    return {
      hit: ranked[0].hit,
      why: `최다 ${ranked[0].votes}:${ranked[1].votes}`,
    };
  return null; // 동점이면 비워 둔다
}

async function main(): Promise<void> {
  const zip = new AdmZip(XLSX);
  const rows = readSheet(zip);
  const header = rows[0];
  const body = rows.slice(1);
  const COL = { seq: 0, title: 2, caseNo: 4, decided: 5, issued: 7, src: 8 };
  // ★검색으로 채운 행은 **표시해 둔다**. 해설 PDF 에서 직접 읽은 것과 섞이면
  //   어디까지 믿을 수 있는지 알 수 없다(백테스트 정확도 98.7% — 1%대 오류가 남는다).
  const SRC_PDF = "해설 PDF";
  const SRC_SEARCH = "제목검색(추정)";
  if (!header[COL.src]) header[COL.src] = "판례번호 출처";
  for (const r of body) {
    if (r[COL.caseNo]?.trim() && !r[COL.src]?.trim()) r[COL.src] = SRC_PDF;
  }

  const known = body.filter(
    (r) => r[COL.caseNo]?.trim() && r[COL.issued]?.trim(),
  );
  const blank = body.filter((r) => !r[COL.caseNo]?.trim());
  console.log(
    `엑셀 ${body.length}행 · 판례번호 있음 ${body.filter((r) => r[COL.caseNo]?.trim()).length} · 빈 행 ${blank.length}`,
  );

  if (BACKTEST) {
    // 발간년도 창 보정 — 아는 행의 선고일이 창 안에 드는지 먼저 본다.
    let inWin = 0;
    for (const r of known) {
      const w = window(r[COL.issued]);
      const d = parseDate(r[COL.decided] ?? "");
      if (w && d && d >= w.from && d <= w.to) inWin++;
    }
    console.log(
      `발간년도 창 적중: ${inWin} / ${known.length} (창이 좁으면 정답도 걸러진다)`,
    );

    const sample = LIMIT > 0 ? known.slice(0, LIMIT) : known;
    let hit = 0;
    let miss = 0;
    let none = 0;
    const wrong: string[] = [];
    for (const [i, r] of sample.entries()) {
      const found = await findCase({
        seq: r[COL.seq],
        title: r[COL.title],
        caseNo: r[COL.caseNo],
        issued: NO_WINDOW ? "" : r[COL.issued],
      });
      const truth = r[COL.caseNo].split(",")[0].trim();
      if (!found) none++;
      else if (found.hit.caseNo.replace(/\s/g, "") === truth.replace(/\s/g, ""))
        hit++;
      else {
        miss++;
        if (wrong.length < 10)
          wrong.push(
            `   ${r[COL.seq]} 정답 ${truth} ≠ 찾은 것 ${found.hit.caseNo} (${found.why}) — ${r[COL.title].slice(0, 40)}`,
          );
      }
      if ((i + 1) % 20 === 0)
        console.log(
          `  ${i + 1}/${sample.length} · 맞음 ${hit} 틀림 ${miss} 못찾음 ${none}`,
        );
    }
    console.log(
      `\n[백테스트] 맞음 ${hit} · 틀림 ${miss} · 못 찾음 ${none} / ${sample.length}`,
    );
    console.log(
      `찾아낸 것 중 정확도 ${hit + miss > 0 ? ((hit / (hit + miss)) * 100).toFixed(1) : "-"}% · 커버리지 ${(((hit + miss) / sample.length) * 100).toFixed(1)}%`,
    );
    if (wrong.length) console.log("\n[틀린 것]\n" + wrong.join("\n"));
    return;
  }

  const targets = LIMIT > 0 ? blank.slice(0, LIMIT) : blank;
  console.log(`빈 행 ${targets.length}개 검색 중…`);
  const filled: Array<{
    seq: string;
    caseNo: string;
    decided: string;
    why: string;
  }> = [];
  for (const [i, r] of targets.entries()) {
    const found = await findCase({
      seq: r[COL.seq],
      title: r[COL.title],
      caseNo: "",
      issued: r[COL.issued] ?? "",
    });
    if (found) {
      filled.push({
        seq: r[COL.seq],
        caseNo: found.hit.caseNo,
        decided: found.hit.decidedAt,
        why: found.why,
      });
      r[COL.caseNo] = found.hit.caseNo;
      r[COL.decided] = found.hit.decidedAt;
      r[COL.src] = SRC_SEARCH;
    }
    if ((i + 1) % 20 === 0)
      console.log(`  ${i + 1}/${targets.length} · 채움 ${filled.length}`);
  }
  console.log(`\n채운 행 ${filled.length} / ${targets.length}`);
  for (const f of filled.slice(0, 15))
    console.log(`   ${f.seq.padStart(3)} → ${f.caseNo} (${f.decided})`);

  if (!APPLY) {
    console.log("\n[예행] --apply 를 붙이면 엑셀에 반영합니다.");
    writeFileSync(
      "tmp/haeseol-title-search.json",
      JSON.stringify(filled, null, 1),
      "utf8",
    );
    return;
  }
  const bak = XLSX.replace(/\.xlsx$/, ".제목검색전.xlsx");
  if (!existsSync(bak)) copyFileSync(XLSX, bak);
  writeSheet(zip, [header, ...body]);
  zip.writeZip(XLSX);
  console.log(`반영 완료 · 직전 백업 ${bak}`);
}

await main();
