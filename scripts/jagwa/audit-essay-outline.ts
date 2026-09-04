// feat-2-036 S1 — 목차 파서를 **모범답안 전수**에 돌려 글이 사라지지 않는지 본다.
//
// ★단위 테스트는 내가 만든 예시만 본다. 진짜 위험은 실제 답안의 낯선 모양에서
//   한 칸이 조용히 빠지는 것이다 — 그 칸은 연습에서 영영 안 나오고 아무도 모른다.
//   그래서 원문과 파싱 결과의 **글자를 대조**한다(제목 기호·구분선만 제외).
//
//   npx tsx scripts/jagwa/audit-essay-outline.ts
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

import { parseEssayOutline, walk } from "../../app/features/subjects/lib/essay-outline";

const sb = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  { auth: { persistSession: false } },
);

/** supabase-js 가 조인을 배열로 줄 때가 있어 양쪽을 다 받는다. */
function lawCodeOf(v: unknown): string {
  const one = Array.isArray(v) ? v[0] : v;
  const code = (one as { law_code?: unknown } | null)?.law_code;
  return typeof code === "string" ? code : "?";
}

/** 대조용 정규화 — 제목 기호·구분선·공백만 지운다. 글자는 건드리지 않는다. */
function normalize(s: string): string {
  return s
    .split(/\r?\n/)
    .filter((l) => !/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l))
    .map((l) => l.replace(/^#{1,6}\s+/, ""))
    .join("\n")
    .replace(/\s+/g, "");
}

const { data, error } = await sb
  .from("problems")
  .select("problem_id, year, problem_number, model_answer_md, laws(law_code)")
  .eq("format", "subjective")
  .not("model_answer_md", "is", null)
  .limit(1000);
if (error) throw new Error(error.message);

const rows = (data ?? []).filter((p) => (p.model_answer_md ?? "").trim());
let lost = 0;
let noBlock = 0;
let thin = 0;
const blockCounts: number[] = [];
const leafCounts: number[] = [];

for (const p of rows) {
  const md = p.model_answer_md as string;
  const parsed = parseEssayOutline(md);

  const pieces: string[] = [];
  if (parsed.docTitle) pieces.push(parsed.docTitle);
  if (parsed.preambleMd) pieces.push(parsed.preambleMd);
  for (const b of parsed.blocks) {
    walk(b.nodes, (n) => {
      pieces.push(n.title);
      if (n.bodyMd) pieces.push(n.bodyMd);
    });
  }
  const before = normalize(md);
  const after = normalize(pieces.join("\n"));
  if (before !== after) {
    lost += 1;
    const at = [...before].findIndex((c, i) => c !== after[i]);
    console.log(
      `★글자 어긋남 — ${p.year}년 ${p.problem_number}번 (${lawCodeOf(p.laws)}) ` +
        `원문 ${before.length}자 / 복원 ${after.length}자 · 첫 차이 ${at}번째`,
    );
    console.log(`   원문: …${before.slice(Math.max(0, at - 30), at + 40)}`);
    console.log(`   복원: …${after.slice(Math.max(0, at - 30), at + 40)}`);
  }

  if (!parsed.blocks.length) {
    noBlock += 1;
    console.log(`★블록 0 — ${p.year}년 ${p.problem_number}번`);
  }
  blockCounts.push(parsed.blocks.length);
  for (const b of parsed.blocks) {
    leafCounts.push(b.leaves.length);
    if (b.headingLines.length < 2 && b.leaves.length === 0) thin += 1;
  }
}

const q = (a: number[], r: number) =>
  a.slice().sort((x, y) => x - y)[Math.floor(a.length * r)] ?? 0;

console.log(`\n=== 모범답안 ${rows.length}건`);
console.log(`글자 어긋남 ${lost}건 · 블록 0 ${noBlock}건 · 연습 불가 블록 ${thin}건`);
console.log(
  `블록(##) : 중앙 ${q(blockCounts, 0.5)} · 90% ${q(blockCounts, 0.9)} · 최대 ${Math.max(...blockCounts)}`,
);
console.log(
  `블록당 칸: 중앙 ${q(leafCounts, 0.5)} · 90% ${q(leafCounts, 0.9)} · 최대 ${Math.max(...leafCounts)} · 0칸 ${leafCounts.filter((x) => x === 0).length}`,
);
process.exit(lost || noBlock ? 1 : 0);
