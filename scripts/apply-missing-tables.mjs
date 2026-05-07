// 명확한 매핑 11건에 대해 source 표를 DB choice explanation 에 append.
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const sb = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);
const ans = JSON.parse(fs.readFileSync('source/_converted/answer.json', 'utf-8'));

// 명확한 매핑: { srcIdx, problemId, choiceIndex (or 'problem' for problem-level) }
const targets = [
  { srcIdx: 415, problemId: '91c03835-8081-42e9-babe-967c4e5dd988', choice: 2 },
  { srcIdx: 841, problemId: 'b6c0a6a1-da0f-4432-a13b-918195a36bdb', choice: 5 },
  { srcIdx: 1722, problemId: '96d7c9ec-9f44-4ce8-a1b4-424e53291aa4', choice: 2 },
  { srcIdx: 1755, problemId: 'c067b367-8b99-4e6e-8867-7731b517af8b', choice: 5 },
  { srcIdx: 1943, problemId: '863a0045-46d0-4a3d-b4c9-95bb3153a5c4', choice: 5 },
  { srcIdx: 2368, problemId: 'b2895eb5-3451-4b59-9f9a-34e422a29625', choice: 5 },
  { srcIdx: 2499, problemId: 'bdc24876-aa11-4173-8103-cd3abfe2a0db', choice: 4 },
  { srcIdx: 2530, problemId: '1ef5451b-223c-45e5-b0d1-6669fa4d333d', choice: 5 },
  { srcIdx: 2964, problemId: 'f8596b23-2485-406f-ab4f-1843595fba16', choice: 2 },
  { srcIdx: 3328, problemId: 'c48504ec-c293-4b1a-b8ed-6b29aa742c92', choice: 1 },
  { srcIdx: 3587, problemId: '696f52e3-9128-4384-87ef-76b00236ca55', choice: 4 },
];

for (const t of targets) {
  const tableMd = ans.paragraphs[t.srcIdx].text;
  const { data: rows } = await sb.from('problem_choices')
    .select('explanation_md, body_md')
    .eq('problem_id', t.problemId)
    .eq('choice_index', t.choice);
  if (!rows || rows.length === 0) {
    console.log(`✕ ${t.problemId} choice ${t.choice} 없음`);
    continue;
  }
  const cur = rows[0].explanation_md ?? '';
  // 이미 표가 있으면 skip
  if (cur.includes('| ---') || /<table[\s>]/i.test(cur)) {
    console.log(`- ${t.problemId} choice ${t.choice} 이미 표 있음 (skip)`);
    continue;
  }
  // append: 기존 텍스트 끝에 표 + 도입문 추가
  const intro = cur.trim().endsWith('다음과 같다.') || cur.trim().endsWith('다음과 같다')
    ? '\n'
    : '\n\n참고로 표로 정리하면 다음과 같다.\n';
  const newExpl = (cur.trim() + intro + tableMd).trim();
  const { error } = await sb.from('problem_choices')
    .update({ explanation_md: newExpl })
    .eq('problem_id', t.problemId)
    .eq('choice_index', t.choice);
  if (error) console.log(`✕ ${t.problemId} ch${t.choice}: ${error.message}`);
  else console.log(`✓ A${t.srcIdx} → ${t.problemId} ch${t.choice} (${newExpl.length}자)`);
}
