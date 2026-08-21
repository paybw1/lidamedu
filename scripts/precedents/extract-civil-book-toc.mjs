// 객관식 민법(4권) 목차 추출 — 민법 체계도 재편 검토용 (원장 지시 2026-08-21).
//
// source/1차 해설모음/객관식 민법/[내지] N. *.hwp 를 scripts/hwp-to-text.mjs 로 뽑은 뒤,
// 편(PART) · 장 · 절 · 관 계층과 구간별 문항 수를 뽑는다.
//
// ★장 제목은 자동번호 필드가 섞여 나오고, 그 필드 글리프가 번호마다 다르다
//   (1장=한글자모 U+11A4, 2장·5장=조지아 문자 U+10E0 계열 …). 글리프로 찾으면 놓친다.
//   그래서 앞머리 목차에서 장 이름을 먼저 읽고, 본문에서 그 이름으로 장 경계를 찾는다.
//
//   node scripts/hwp-to-text.mjs "source/1차 해설모음/객관식 민법" tmp/civil-toc
//   node scripts/precedents/extract-civil-book-toc.mjs [텍스트디렉터리]
import fs from "node:fs";
import path from "node:path";

const DIR = process.argv[2] ?? path.resolve(process.cwd(), "tmp/civil-toc");
const OUT = path.resolve(process.cwd(), "tmp/civil-book-toc.json");

const PARTS = [
  { file: "1. 민법총칙", part: 1, title: "민법총칙" },
  { file: "2. 물권법", part: 2, title: "물권법" },
  { file: "3. 채권총칙", part: 3, title: "채권총칙" },
  { file: "4. 채권각칙", part: 4, title: "채권각칙" },
];

// 필드·제어 잔재 제거 — 한글/영숫자/기본 구두점만 남긴다.
const KEEP = /[^가-힣ㄱ-ㅎㅏ-ㅣ0-9A-Za-z\s.,·ㆍ()\-]/g;
const clean = (s) => s.replace(KEEP, "").replace(/\s+/g, " ").trim();
// 공백 차이("권 리" vs "권리")를 무시하고 맞춘다.
const squash = (s) => clean(s).replace(/\s/g, "");

// 문항 개수는 정답 마커로 센다 — 발문 형태는 편차가 커서 신뢰할 수 없다.
const ANSWER_MARK = "|정답";

/** 앞머리 목차 — "제목<필드>페이지" 다음 줄에 "N장" 이 온다. */
function readFrontMatter(lines) {
  const out = [];
  for (let i = 0; i < Math.min(lines.length, 60); i++) {
    const m = /^(\d+)장$/.exec(clean(lines[i]));
    if (!m) continue;
    // 목차는 "제목<필드>페이지" / 빈 줄 / "N장" 순서라 바로 앞 비어있지 않은 줄을 본다.
    let prev = "";
    for (let j = i - 1; j >= 0 && !prev; j--) {
      // 페이지 번호와, 번호 앞에 낀 자모 한 글자(필드 잔재)를 떼어낸다.
      prev = clean(lines[j])
        .replace(/\d+$/, "")
        .replace(/[ㄱ-ㅎㅏ-ㅣ]+$/, "")
        .trim();
    }
    if (!prev) continue;
    out.push({ chapter: Number(m[1]), title: prev });
  }
  return out;
}

function parseVolume(text, meta) {
  const lines = text.split("\n");
  const front = readFrontMatter(lines);
  if (front.length === 0) throw new Error(`${meta.title}: 앞머리 목차를 찾지 못했습니다.`);

  // 본문에서 장 시작 줄 찾기 — "<필드>N<필드>제목" 이 제목만 남는다.
  const byTitle = new Map(front.map((c) => [squash(c.title), c]));
  const bodyStart = Math.max(...front.map(() => 0), 0);
  const chapterAt = new Map(); // 줄번호 → 장
  for (let i = bodyStart; i < lines.length; i++) {
    const s = squash(lines[i]);
    for (const [key, ch] of byTitle) {
      // 자동번호가 앞에 붙는다("1민법일반") — 숫자 접두는 떼고 맞춘다.
      if (s.replace(/^\d+/, "") !== key) continue;
      if ([...chapterAt.values()].some((c) => c.chapter === ch.chapter)) continue;
      chapterAt.set(i, ch);
      break;
    }
  }

  const chapters = [];
  let chapter = null;
  let section = null;
  let sub = null;
  let problems = 0;

  for (let i = 0; i < lines.length; i++) {
    const hit = chapterAt.get(i);
    if (hit) {
      chapter = { chapter: hit.chapter, title: hit.title, count: 0, sections: [] };
      chapters.push(chapter);
      section = null;
      sub = null;
      continue;
    }
    const line = clean(lines[i]);
    if (!line) continue;

    const mSec = /^(\d+)절\.\s*(.+)$/.exec(line);
    if (mSec && chapter) {
      section = { section: Number(mSec[1]), title: mSec[2], count: 0, subs: [] };
      chapter.sections.push(section);
      sub = null;
      continue;
    }
    const mSub = /^(\d+)관\.\s*(.+)$/.exec(line);
    if (mSub && section) {
      sub = { sub: Number(mSub[1]), title: mSub[2], count: 0 };
      section.subs.push(sub);
      continue;
    }

    if (lines[i].startsWith(ANSWER_MARK)) {
      problems += 1;
      if (sub) sub.count += 1;
      if (section) section.count += 1;
      if (chapter) chapter.count += 1;
    }
  }

  const missing = front.filter((c) => !chapters.some((x) => x.chapter === c.chapter));
  return { ...meta, problems, chapters, missingChapters: missing.map((c) => `${c.chapter}장 ${c.title}`) };
}

const volumes = [];
for (const meta of PARTS) {
  const file = fs
    .readdirSync(DIR)
    .find((f) => f.includes(meta.file) && f.endsWith(".txt"));
  if (!file) {
    console.error(`텍스트 없음: ${meta.file} — scripts/hwp-to-text.mjs 를 먼저 실행하세요.`);
    process.exit(1);
  }
  volumes.push(parseVolume(fs.readFileSync(path.join(DIR, file), "utf8"), meta));
}

fs.writeFileSync(OUT, JSON.stringify(volumes, null, 2), "utf8");

let total = 0;
let nodes = 0;
for (const v of volumes) {
  total += v.problems;
  console.log(`\n■ 제${v.part}편 ${v.title}  (문항 ${v.problems})`);
  if (v.missingChapters.length) console.log(`  ⚠ 본문에서 못 찾은 장: ${v.missingChapters.join(", ")}`);
  for (const c of v.chapters) {
    nodes += 1;
    console.log(`  제${c.chapter}장 ${c.title}  [${c.count}]`);
    for (const s of c.sections) {
      nodes += 1;
      console.log(`      제${s.section}절 ${s.title}  [${s.count}]`);
      for (const b of s.subs) {
        nodes += 1;
        console.log(`          제${b.sub}관 ${b.title}  [${b.count}]`);
      }
    }
  }
}
console.log(`\n총 문항 ${total} · 노드 ${nodes} · 저장 ${OUT}`);
