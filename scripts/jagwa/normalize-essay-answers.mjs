// 2차 주관식 답안 표기·넘버링 기계적 정규화 (dry-run 기본).
//
//   자동 변환
//     · 폐기 조어      : 소결→결론 / 논점의 정리→문제의 소재 / 사안의 해결→사안의 포섭
//                        치환가능성→치환의 가능성 / 치환용이성·치환자명성→치환의 용이성
//     · ##### 헤딩     : #### 로 강등
//     · 원문자 제목    : ① **제목** → ① **(제목)**
//     · 불릿 목록      : 줄머리 "- " 제거(문단화)
//     · 넘버링         : "### N." 아래 "#### (n)" 없이 줄머리 원문자가 오는 경우
//                        ① **(제목)** 항목을 "#### (n) 제목" 소제목으로 승격
//   수동 대상(보고만)
//     · 표(|), 평문 "N)" 시작 줄, 본문 §, '대판', 제목 형식이 아닌 원문자(승격 불가)
//
//   node scripts/jagwa/normalize-essay-answers.mjs            # 전체 dry-run
//   node scripts/jagwa/normalize-essay-answers.mjs --sample 3 # 변경 예시 3건 출력
//   node scripts/jagwa/normalize-essay-answers.mjs --apply
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes("--apply");
const sIdx = process.argv.indexOf("--sample");
const SAMPLE = sIdx >= 0 ? Number(process.argv[sIdx + 1] ?? 3) : 0;

const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";

function normalize(md) {
  const notes = [];
  let t = md;

  // 1) 폐기 조어
  const terms = [
    [/소결/g, "결론"],
    [/논점의 정리/g, "문제의 소재"],
    [/치환가능성/g, "치환의 가능성"],
    [/치환자명성/g, "치환의 용이성"],
    [/치환용이성/g, "치환의 용이성"],
  ];
  for (const [re, to] of terms) if (re.test(t)) t = t.replace(re, to);

  // 2) ##### → ####
  t = t.replace(/^#####\s/gm, "#### ");

  // 3) 소설문 표기 제거  "### 2. 소설문 1) 제목" → "### 2. 제목"
  t = t.replace(/^(#{2,4}\s*\d+\.)\s*소설문\s*\d+\)\s*[—-]?\s*/gm, "$1 ");
  t = t.replace(/소설문\s*(\d+)\)/g, "설문 $1)");

  // 4) 불릿 → 원문자 (연속된 블록마다 ① 부터 다시 매김. 20개를 넘으면 손대지 않는다)
  {
    const src = t.split("\n");
    const dst = [];
    for (let k = 0; k < src.length; ) {
      if (!/^\s*-\s+/.test(src[k])) { dst.push(src[k]); k++; continue; }
      let end = k;
      while (end < src.length && /^\s*-\s+/.test(src[end])) end++;
      const block = src.slice(k, end);
      if (block.length > CIRCLED.length) {
        notes.push(`불릿 ${block.length}개 — 원문자 초과, 수동`);
        dst.push(...block);
      } else {
        block.forEach((l, n) => dst.push(l.replace(/^\s*-\s+/, `${CIRCLED[n]} `)));
      }
      k = end;
    }
    t = dst.join("\n");
  }

  // 5) 원문자 제목 보정 — 불릿에서 만들어진 줄까지 포함해야 하므로 불릿 변환 뒤에 둔다.
  //    짧은 명사구는 ① **(제목)** 로, 문장 전체가 굵게 처리된 것은 굵기를 풀어 평문으로 되돌린다.
  t = t.replace(/\*{4}([^*\n]+?)\*{4}/g, "**$1**"); // **** 중복 강조 정리
  t = t.replace(/^([①-⑳])\s\*\*(?!\()([^*\n]+?)\*\*/gm, (_all, mark, title) => {
    const isSentence = title.length > 40 || /[.。]$/.test(title.trim());
    return isSentence ? `${mark} ${title}` : `${mark} **(${title})**`;
  });

  // 6) 넘버링 승격
  const lines = t.split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    out.push(line);
    if (!/^###\s/.test(line)) { i++; continue; }
    // 이 ### 섹션의 범위
    let j = i + 1;
    while (j < lines.length && !/^#{2,3}\s/.test(lines[j])) j++;
    const body = lines.slice(i + 1, j);
    const hasSub = body.some((l) => /^####\s*\(/.test(l));
    const circledTitled = body.filter((l) => /^[①-⑳]\s\*\*\(.+\)\*\*/.test(l));
    const circledPlain = body.filter((l) => /^[①-⑳]\s/.test(l) && !/^[①-⑳]\s\*\*\(/.test(l));
    if (!hasSub && circledTitled.length && !circledPlain.length) {
      let n = 0;
      for (const l of body) {
        const m = l.match(/^([①-⑳])\s\*\*\((.+)\)\*\*\s*[:：—-]?\s*(.*)$/);
        if (m) {
          n++;
          out.push(`#### (${n}) ${m[2]}`);
          if (m[3].trim()) out.push("", m[3].trim());
        } else out.push(l);
      }
    } else {
      if (!hasSub && circledPlain.length) notes.push(`승격 불가(제목 형식 아님): ${line.replace(/^#+\s*/, "").slice(0, 24)}`);
      out.push(...body);
    }
    i = j;
  }
  t = out.join("\n").replace(/\n{3,}/g, "\n\n");

  // 수동 대상 점검
  if (/^\|/m.test(t)) notes.push("표(|) — 수동");
  if (/^\s*\d+\)\s/m.test(t)) notes.push("평문 N) 시작 줄 — 수동");
  if (/대판/.test(t)) notes.push("'대판' — 수동");
  for (const line of t.split("\n")) {
    let d = 0;
    for (let k = 0; k < line.length; k++) {
      const c = line[k];
      if (c === "(") d++;
      else if (c === ")") d = Math.max(0, d - 1);
      else if (c === "§" && d === 0) { notes.push("본문 § — 수동"); break; }
    }
  }
  return { text: t, notes: [...new Set(notes)] };
}

const { data: problems, error } = await supa
  .from("problems")
  .select("problem_id, year, problem_number, total_points, model_answer_md")
  .eq("format", "subjective")
  .order("year")
  .order("problem_number");
if (error) throw new Error(error.message);

const backup = [];
const changes = [];
const manual = [];
for (const p of problems) {
  const md = p.model_answer_md;
  if (!md) continue;
  const { text, notes } = normalize(md);
  if (notes.length) manual.push({ p, notes });
  if (text === md) continue;
  backup.push({ problem_id: p.problem_id, model_answer_md: md });
  changes.push({ p, text });
}

console.log(`자동 변환 대상 ${changes.length}문항 / 수동 확인 필요 ${manual.length}문항\n`);
let over = 0;
for (const { p, text } of changes) {
  const per = text.length / p.total_points;
  if (per > 200) over++;
}
console.log(`변환 후 배점당 200자 초과: ${over}문항 (분량 축약은 별도 작업)`);

console.log("\n── 수동 확인 항목 ──");
const tally = {};
for (const m of manual) for (const n of m.notes) tally[n.split(":")[0]] = (tally[n.split(":")[0]] || 0) + 1;
for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}문항`);

if (SAMPLE) {
  console.log("\n── 변경 예시 ──");
  for (const { p, text } of changes.slice(0, SAMPLE)) {
    const a = p.model_answer_md.split("\n");
    const b = text.split("\n");
    console.log(`\n■ ${p.year}-${p.problem_number} ${p.problem_id.slice(0, 8)} (${p.model_answer_md.length}→${text.length}자)`);
    let shown = 0;
    for (let k = 0, l = 0; k < a.length && shown < 8; k++, l++) {
      if (a[k] === b[l]) continue;
      console.log(`   전: ${a[k]}`);
      console.log(`   후: ${b[l]}`);
      shown++;
      while (l + 1 < b.length && b[l + 1] === "") l++;
    }
  }
}

writeFileSync("C:/project/lidamedu/tmp/backup-normalize-essay.json", JSON.stringify(backup, null, 1));
if (!APPLY) console.log("\n[dry-run] --apply 로 반영");
else {
  for (const { p, text } of changes) {
    const { error: e } = await supa.from("problems").update({ model_answer_md: text }).eq("problem_id", p.problem_id);
    if (e) throw new Error(`${p.problem_id}: ${e.message}`);
  }
  console.log("\n반영 완료");
}
