// 상표법 2차도서(제3자 출판물 4권) 텍스트 찾기 — 기출 답안 '참고'용 (feat-2-039, 읽기 전용).
// 입력 = tmp/tm-2cha/*.txt (pdftotext 산출, \f 가 페이지 경계). 문장을 옮기지 말고 논점·목차 대조에만 쓸 것.
//
//   node scripts/jagwa/tm-2cha-find.mjs --round 53              # 각 책에서 '53회' 마커가 있는 페이지 목록
//   node scripts/jagwa/tm-2cha-find.mjs --find "헬로키티"        # 키워드 페이지 목록(책별)
//   node scripts/jagwa/tm-2cha-find.mjs --book 데생 --pages 120-126   # 페이지 본문 출력
import { readFileSync, readdirSync } from "node:fs";

const DIR = "tmp/tm-2cha";
const books = readdirSync(DIR)
  .filter((f) => f.endsWith(".txt"))
  .map((f) => ({
    name: f.replace(/\.txt$/, ""),
    pages: readFileSync(`${DIR}/${f}`, "utf8").split("\f"),
  }));
const argv = process.argv.slice(2);
const opt = (k) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : null;
};
const norm = (s) => s.replace(/\s+/g, "");

const round = opt("--round");
if (round) {
  const re = new RegExp(
    `(제\\s*${round}\\s*회|${round}\\s*회\\s*(문제|변리사|기출|2차))`,
  );
  for (const b of books) {
    const hits = [];
    b.pages.forEach((p, i) => {
      if (re.test(p)) hits.push(i + 1);
    });
    console.log(`${b.name}: ${hits.length ? hits.join(", ") : "(없음)"}`);
  }
  process.exit(0);
}

const find = opt("--find");
if (find) {
  const kws = find
    .split(",")
    .map((s) => norm(s))
    .filter(Boolean);
  for (const b of books) {
    const hits = [];
    b.pages.forEach((p, i) => {
      const n = norm(p);
      if (kws.every((k) => n.includes(k))) hits.push(i + 1);
    });
    console.log(`${b.name}: ${hits.length ? hits.join(", ") : "(없음)"}`);
  }
  process.exit(0);
}

const book = opt("--book");
const pages = opt("--pages");
if (book && pages) {
  const b = books.find((x) => x.name.includes(book));
  if (!b) {
    console.error(
      `책 없음: ${book} — 후보 ${books.map((x) => x.name).join(" | ")}`,
    );
    process.exit(1);
  }
  const [a, z] = pages.split("-").map(Number);
  for (let i = a; i <= (z ?? a); i++) {
    console.log(
      `\n===== ${b.name} p.${i} =====\n${(b.pages[i - 1] ?? "").trim()}`,
    );
  }
  process.exit(0);
}
console.error(
  "사용: --round <N> | --find <kw[,kw]> | --book <이름> --pages <a-b>",
);
process.exit(1);
