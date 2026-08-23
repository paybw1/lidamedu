// 판례 표의 라벨 줄바꿈 전수 점검.
//   node scripts/dohae/audit-case-labels.mjs
//
// 두 경로를 모두 본다:
//   ① 본문 마크다운/원시 HTML 표 (renderTableHtml → <wbr> 주입 대상)
//   ② book_sections 교재 섹션 표 (BookCell → withKoreanBreaks 대상)
// 확인 항목: (a) <wbr> 을 심어도 글자가 그대로인지 (b) 사전에 안 걸려 못 나뉘는 라벨
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { labelSegments } from "../../app/core/lib/korean-wrap.ts";

const LABELISH_MAX = 24;
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/** 마크다운 파이프 표 + 원시 HTML 표에서 칸 글자를 뽑는다. */
function cellsFromMarkdown(md) {
  const out = [];
  if (!md) return out;
  for (const line of String(md).split("\n")) {
    if (!/^\s*\|.*\|\s*$/.test(line)) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue; // 구분선
    out.push(...cells);
  }
  const re = new RegExp("<t[hd](?:>| [^>]*>)([^<]+)</t[hd]>", "g");
  let m;
  while ((m = re.exec(String(md))) !== null) out.push(m[1].trim());
  return out;
}

const cells = [];
let cases = 0;
for (let from = 0; ; from += 500) {
  const { data, error } = await sb
    .from("cases")
    .select("case_number, summary_body_md, summary_items, reasoning_md, comment_body_md, related_md, book_sections")
    .is("deleted_at", null)
    .range(from, from + 499);
  if (error) throw error;
  if (!data?.length) break;
  for (const c of data) {
    cases++;
    const mds = [c.summary_body_md, c.reasoning_md, c.comment_body_md, c.related_md];
    for (const it of Array.isArray(c.summary_items) ? c.summary_items : []) mds.push(it?.body);
    for (const md of mds) for (const t of cellsFromMarkdown(md)) cells.push({ t, src: "본문표", cn: c.case_number });
    // 교재 섹션 표
    const secs = Array.isArray(c.book_sections) ? c.book_sections : [];
    for (const s of secs)
      for (const b of s?.blocks ?? [])
        if (b?.type === "table")
          for (const row of b.rows ?? [])
            for (const cell of row ?? []) cells.push({ t: String(cell?.text ?? "").trim(), src: "교재표", cn: c.case_number });
  }
  if (data.length < 500) break;
}

let bad = 0;
const miss = new Map();
let labelish = 0;
for (const { t, src, cn } of cells) {
  if (!t || t.length > LABELISH_MAX) continue;
  labelish++;
  if (labelSegments(t).join("") !== t) {
    bad++;
    if (bad < 5) console.log(`글자 불일치 [${src} ${cn}] ${JSON.stringify(t)}`);
  }
  // 순한글 4자 이상인데 못 나뉘는 라벨
  if (!/^[가-힣]{4,}$/.test(t)) continue;
  if (labelSegments(t).length > 1) continue;
  if (!miss.has(t)) miss.set(t, { n: 0, src: new Set() });
  const m = miss.get(t);
  m.n++;
  m.src.add(`${src}`);
}
console.log(`\n판례 ${cases}건 · 표 칸 ${cells.length}개 · 라벨 후보(24자 이하) ${labelish}개`);
console.log(`글자 달라진 칸: ${bad}`);
const arr = [...miss.entries()].sort((a, b) => b[1].n - a[1].n);
console.log(`나뉘지 않는 라벨: ${arr.length}종\n`);
arr.slice(0, 40).forEach(([t, m]) => console.log(` ${String(m.n).padStart(3)}회 ${t} [${[...m.src].join(",")}]`));
