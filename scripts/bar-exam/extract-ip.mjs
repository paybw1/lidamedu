// 변호사시험 선택과목 «지적재산권법» 기출 추출 — 법무부 원문 문제지 → 회차별 텍스트.
//
// 입력은 법무부가 공개한 **선택과목 문제지**다(7과목이 한 파일에 들어 있다).
//   1~12회  : 「1-12회 선택과목.zip」        moj.go.kr /bbs/moj/150/451625/download.do
//   13회    : 「제13회 … 선택과목.hwp」       … /462929/download.do (zip)
//   14회    : 「선택과목(사례형)-최종본.hwp」  … /476684/download.do
//   15회    : 「제15회 … 선택과목 사례형.hwp」 … /489458/download.do
//   ※ 공공누리 1유형(출처표시).
//
// ★HWP 텍스트에는 제어문자 잔재가 섞인다(ॆĀ · ʨĀ · לĀ …). 한글/한자/ASCII 밖의
//   U+0100–U+0FFF 를 걷어낸다 — 이 구간엔 본문에 쓰이는 글자가 없다.
//
//   node scripts/bar-exam/extract-ip.mjs <txt디렉터리> <출력디렉터리>
import fs from "node:fs";
import path from "node:path";

const SUBJECTS = [
  "국제법",
  "국제거래법",
  "노동법",
  "조세법",
  "지적재산권법",
  "경제법",
  "환경법",
];

/**
 * 제어문자 잔재 제거 + 공백 정리 + 러닝 헤더 제거.
 *
 * ★HWP 인라인 제어코드는 **두 글자 쌍**이다 — 임의의 한 글자 + U+0100(Ā).
 *   U+0100 만 지우면 짝인 앞 글자가 본문에 남아 번호를 망친다
 *   ("1." + 0x32 + Ā → "1.2기술 A의…", 실제로 9회에서 이렇게 깨졌다).
 *   전 회차를 훑어 U+0100 앞에 한글이 오는 경우가 0건임을 확인하고 쌍째로 지운다.
 */
export function clean(s) {
  const lines = s
    .replace(/[\s\S]Ā/g, "")
    .replace(/[Ā-࿿]/g, "")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((l) => l.trim());

  // 머리(연도 줄 + 과목명) 뒤에 반복되는 러닝 헤더("지적재산권법" · "11쪽")를 걷어낸다.
  let seenTitle = false;
  const kept = lines.filter((l) => {
    if (/^\d*\s*쪽$/.test(l)) return false;
    if (l === "지적재산권법") {
      if (seenTitle) return false;
      seenTitle = true;
    }
    return true;
  });
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * 「2012년도 시행 제1회 변호사시험 / 지적재산권법 / 〈제 1 문〉」 로 시작하는 구간을 찾는다.
 * ★목차에도 과목명이 나오므로 '〈제 1 문〉이 뒤따르는' 것만 본문 시작으로 인정한다.
 */
function findStart(text) {
  const re = /(\d{4})년도\s*(?:시행\s*)?제\s*(\d+)\s*회\s*변호사시험\s*지적재산권법/g;
  for (let m; (m = re.exec(text)); ) {
    const after = text.slice(m.index, m.index + 1200);
    // ★표기가 회차마다 다르다 — 〈제 1 문〉(대부분) / 〈제1문의 1〉(8·9회).
    if (/〈\s*제\s*1\s*문/.test(after)) {
      return { at: m.index, year: Number(m[1]), round: Number(m[2]) };
    }
  }
  return null;
}

/** 다음 과목 표제 또는 '확인: 법무부 법조인력과장' 에서 끊는다. */
function findEnd(text, from) {
  const tail = text.slice(from);
  const marks = [];
  const confirm = tail.search(/확\s*인\s*[:：]\s*법무부/);
  if (confirm > 0) marks.push(confirm);
  for (const s of SUBJECTS) {
    if (s === "지적재산권법") continue;
    const re = new RegExp(`\\d{4}년도\\s*(?:시행\\s*)?제\\s*\\d+\\s*회\\s*변호사시험\\s*${s}`);
    const i = tail.search(re);
    if (i > 0) marks.push(i);
  }
  return marks.length ? from + Math.min(...marks) : text.length;
}

const [, , inDir, outDir] = process.argv;
if (!inDir || !outDir) {
  console.error("사용: node scripts/bar-exam/extract-ip.mjs <txt디렉터리> <출력디렉터리>");
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

const report = [];
let failed = 0;
for (const f of fs.readdirSync(inDir).filter((f) => f.endsWith(".txt")).sort()) {
  const raw = fs.readFileSync(path.join(inDir, f), "utf8");
  const start = findStart(raw);
  if (!start) {
    console.log(`  FAIL ${f} — 지적재산권법 본문 시작을 찾지 못함`);
    failed += 1;
    continue;
  }
  const end = findEnd(raw, start.at + 50);
  const body = clean(raw.slice(start.at, end));

  // ── 온전성 게이트 — 조용히 반쪽만 담기지 않게 ──────────────────────────
  const q1 = /〈\s*제\s*1\s*문/.test(body);
  const q2 = /〈\s*제\s*2\s*문/.test(body);
  const points = [...body.matchAll(/\((\d+)\s*점\)/g)].map((m) => Number(m[1]));
  const sum = points.reduce((a, b) => a + b, 0);
  const ok = q1 && body.length > 800 && body.length < 20000;
  if (!ok) failed += 1;

  const name = `${String(start.round).padStart(2, "0")}.txt`;
  fs.writeFileSync(path.join(outDir, name), body, "utf8");
  report.push({
    round: start.round,
    year: start.year,
    chars: body.length,
    q1,
    q2,
    subQ: points.length,
    sum,
    ok,
  });
  console.log(
    `  ${ok ? "OK  " : "FAIL"} 제${String(start.round).padStart(2)}회 ${start.year} · ` +
      `${String(body.length).padStart(5)}자 · 제1문 ${q1 ? "O" : "X"} 제2문 ${q2 ? "O" : "X"} · ` +
      `설문 ${String(points.length).padStart(2)}개 · 배점합 ${sum}`,
  );
}
fs.writeFileSync(
  path.join(outDir, "_report.json"),
  JSON.stringify(report, null, 2),
  "utf8",
);
console.log(`\n회차 ${report.length}개 · 실패 ${failed}`);
process.exit(failed > 0 ? 1 : 0);
