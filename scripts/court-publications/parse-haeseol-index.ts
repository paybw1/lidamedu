// 대법원판례해설 총목록(category_146.pdf) → 지식재산권 편 목록.
//
// 총목록은 표다. 좌표 복원 텍스트에서 한 행은 이렇게 흩어진다:
//   특허권침해로 인한 특허법위반 사건에서의 공소사실 특정      ← 논제 1행
//   이 헌 2016년 상 326                                        ← 저자·발간년도·면수
//   여부에 관한 판단 기준                                      ← 논제 2행
// 논제가 앵커 줄 **앞뒤로** 갈라지므로 제목만 보고는 행 경계를 못 가른다.
// ★그래서 제목이 아니라 **(저자 + 시작면수)** 를 키로 쓴다 — 앵커 한 줄에 다 들어 있어
//   모호함이 없고, 개별 해설 PDF 도 첫머리에 시작 면수를 찍고 있다.
//
// 권호는 그룹 중앙에 홀로 놓인다("146호"). 같은 발간년도가 이어지는 구간마다 하나씩
// 들어 있으므로, 구간 안에서 찾는다.

import { readFileSync } from "node:fs";

import { extractPdfText } from "../../app/features/cases/lib/pdf-extract.server";

export interface IndexEntry {
  volume: string; // "146호"
  issued: string; // "2025년 하"
  author: string; // "이헌" (공백 제거)
  page: number; // 시작 면수
  titleHint: string; // 앵커 줄에 함께 있던 논제 조각(검증용, 비어 있을 수 있음)
  /**
   * 이 앵커가 놓인 줄 번호(구간 안에서). 제목으로 찾을 때 **가장 가까운 앵커**를
   * 고르는 데 쓴다 — 논제가 앵커 위아래로 갈라지므로 행 경계를 복원하는 대신
   * 거리로 판정한다.
   */
  at: number;
}

const PDF = "source/법원간행물/대법원판례해설/category_146.pdf";

/**
 * 제목 대조용 정규화 — **한글·영숫자만 남긴다**.
 * ★따옴표(' vs ‘)·가운뎃점(· vs ㆍ)·괄호가 총목록과 파일명에서 서로 다르게 찍힌다.
 *   공백만 지우면 그 차이 때문에 멀쩡한 제목이 안 맞는다(실측).
 */
export function matchKey(s: string): string {
  return s.replace(/[^가-힣0-9A-Za-z]/g, "");
}

/** "이 헌" · "李 憲" → "이헌". 표에서 자간을 벌려 찍어 공백이 섞인다. */
export function squash(s: string): string {
  return s.replace(/\s+/g, "");
}

// 앵커 꼬리: 발간년도 + 면수. 저자·논제는 그 앞을 잘라 따로 읽는다.
// ★한 정규식으로 저자까지 잡으려 하면 논제 끝말을 함께 삼킨다("기간오수빈") — 실측.
const TAIL = /^(.*?)\s+(\d{4}(?:-\d{4})?년(?:\s*[상하])?)\s+(\d{1,4})$/;

/**
 * 앵커 앞부분 → [논제조각, 저자].
 * 저자는 2~4자 한글인데 표에서 자간을 벌려 "이 헌" 처럼 한 글자씩 떨어져 찍히기도 한다.
 * 그래서 **끝이 한 글자 토막들이면 그 묶음이 저자**이고, 아니면 마지막 낱말이 저자다.
 */
function splitAuthor(head: string): [string, string] {
  const parts = head.trim().split(/\s+/);
  if (parts.length === 0) return ["", ""];
  let take = 1;
  if (parts[parts.length - 1].length === 1) {
    while (take < parts.length && parts[parts.length - 1 - take].length === 1) take++;
  }
  const author = parts.slice(parts.length - take).join("");
  if (!/^[가-힣]{2,4}$/.test(author)) return [head.trim(), ""];
  return [parts.slice(0, parts.length - take).join(" "), author];
}

// 쪽 머리("지식재산권 ▯ 305" · "306 ▯ 대법원판례해설 총목록(분야별)")
const SECTION_HEAD = /^([가-힣][가-힣\s]{0,10}?)\s+\S\s+\d+$/;
const VOLUME_ONLY = /^(\d{1,3}호)(?=$|\s)\s*/;

export async function parseHaeseolIndex(
  section = "지식재산권",
): Promise<{ entries: IndexEntry[]; lines: string[] }> {
  const raw = await extractPdfText(new Uint8Array(readFileSync(PDF)));
  const text = typeof raw === "string" ? raw : (raw as { text: string }).text;
  const lines = text.split("\n").map((l) => l.trim());

  // ① 대상 분야 구간만 남긴다 — 쪽 머리가 분야를 계속 알려 준다.
  let current = "";
  const rows: Array<{ i: number; line: string }> = [];
  for (const [i, line] of lines.entries()) {
    const head = SECTION_HEAD.exec(line);
    if (head) {
      const name = squash(head[1]);
      // "대법원판례해설 총목록(분야별)" 로 시작하는 짝수쪽 머리는 분야를 안 담는다.
      if (name && !name.startsWith("대법원판례해설")) current = name;
      continue;
    }
    if (current === squash(section)) rows.push({ i, line });
  }

  // ② 앵커와 권호 줄 수집
  type Anchor = { at: number; e: IndexEntry };
  const anchors: Anchor[] = [];
  const volumes: Array<{ at: number; v: string }> = [];
  for (const [k, { line: raw }] of rows.entries()) {
    // ★권호가 홀로 있는 줄이 대부분이지만 옆 칸 글자와 한 줄로 붙어 나오기도 한다
    //   ("130호 이한상 2021년 하 377" · "136호 하는지 여부 이한상"). 앞머리를 떼어
    //   권호로 기록하고, **남은 부분은 계속 해석한다** — 안 그러면 그 행을 통째로 잃는다.
    const vol = VOLUME_ONLY.exec(raw);
    const line = vol ? raw.slice(vol[0].length).trim() : raw;
    if (vol) volumes.push({ at: k, v: vol[1] });
    if (!line) continue;
    const m = TAIL.exec(line);
    if (!m) continue; // "권호 논 제 저 자 발간년도 면수" 머리줄은 숫자로 안 끝난다
    const [titleHint, author] = splitAuthor(m[1]);
    if (!author) continue;
    anchors.push({
      at: k,
      e: {
        volume: "",
        issued: m[2].replace(/\s+/g, " ").trim(),
        author,
        page: Number(m[3]),
        titleHint,
        at: k,
      },
    });
  }

  // ③ 권호 채우기.
  // ★덩이 경계는 **발간년도가 바뀌거나 면수가 되돌아가는 자리**다 — 한 권 안에서는
  //   면수가 계속 늘어난다. 최근접 권호로 붙이면 경계 행이 옆 권으로 새어 나가고,
  //   발간년도만 보면 한 발간년도가 두 권에 실린 경우를 못 가른다(실측).
  //   권호는 제 덩이의 세로 가운데에 찍히므로, 덩이 구간 안의 권호 줄이 정답이다.
  const groups: Array<{ from: number; to: number }> = [];
  for (const [k, a] of anchors.entries()) {
    const prev = anchors[k - 1];
    const isNew =
      !prev || prev.e.issued !== a.e.issued || prev.e.page > a.e.page;
    if (isNew) groups.push({ from: k, to: k });
    else groups[groups.length - 1].to = k;
  }
  // ★권호 줄은 **한 번씩만** 쓴다. 그냥 구간 안을 찾으면 앞 덩이가 뒤 덩이 것까지 집어
  //   가고(한 구간에 권호 두 개가 들어올 때), 뒤 덩이는 앞 권호를 물려받아 한 발간년도가
  //   두 권에 걸친 것처럼 보인다(142호가 2024년 상·하 둘 다 갖던 문제).
  let p = 0;
  for (const g of groups) {
    const lo = anchors[g.from].at;
    const hi = anchors[g.to].at;
    while (p < volumes.length && volumes[p].at < lo - 3) p++; // 지나간 권호는 버린다
    let vol = "";
    if (p < volumes.length && volumes[p].at <= hi + 3) {
      vol = volumes[p].v;
      // 쪽마다 다시 찍힌 같은 권호는 함께 소비한다.
      while (p < volumes.length && volumes[p].v === vol) p++;
    } else {
      // 쪽이 갈려 권호가 안 찍힌 덩이 — 바로 앞 덩이의 권호를 잇는다.
      vol = anchors[g.from - 1]?.e.volume ?? "";
    }
    for (let k = g.from; k <= g.to; k++) anchors[k].e.volume = vol;
  }

  return { entries: anchors.map((a) => a.e), lines: rows.map((r) => r.line) };
}

if (process.argv[1]?.includes("parse-haeseol-index")) {
  const { entries: list } = await parseHaeseolIndex();
  console.log(`지식재산권 편 ${list.length}건`);
  const noVol = list.filter((e) => !e.volume);
  console.log(`권호 못 채운 항목 ${noVol.length}건`);
  const byVol = new Map<string, Set<string>>();
  for (const e of list) {
    if (!byVol.has(e.volume)) byVol.set(e.volume, new Set());
    byVol.get(e.volume)!.add(e.issued);
  }
  console.log("\n권호 → 발간년도 (1:1 이어야 한다)");
  for (const [v, s] of byVol)
    console.log(`  ${v.padStart(5)} → ${[...s].join(", ")}${s.size > 1 ? "  ★여러 개!" : ""}`);
  console.log("\n표본 5건");
  for (const e of list.slice(0, 5))
    console.log(`  ${e.volume} · ${e.issued} · ${e.author} · ${e.page}면 · ${e.titleHint.slice(0, 40)}`);
}
