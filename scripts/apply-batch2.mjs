// 매핑 실패한 13건 — 수동 매핑 (섹션 + N 으로부터 분석)
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const sb = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);
const ans = JSON.parse(fs.readFileSync('source/_converted/answer.json', 'utf-8'));

// 수동 매핑: srcIdx → 어느 DB 문제의 어느 위치
// section + N + answer correct 으로 답안서/문제집 대조 후 식별.
// 일부는 false positive (이미 HTML 표로 있는 케이스) 라 SKIP.
const targets = [
  // false positive — 이미 HTML로 있음
  { srcIdx: 1154, problemId: 'bce3a410-ad8b-498a-9cfc-aa8a66b522a6', kind: 'skip-html' },
  // A781 선출원주의 #11 → 2015 #11 5378bc8d
  { srcIdx: 781, problemId: '5378bc8d-ea39-46ca-b672-e086dc5a6e0e', choice: 5 },
  // A1024 명세서 #8 → 2007 #8 8b0d15a9
  { srcIdx: 1024, problemId: '8b0d15a9-9ed6-426a-8a79-439a37c41e91', choice: 3 },
  // A1082 명세서 #16 → 2016 #16 a07b4319
  { srcIdx: 1082, problemId: 'a07b4319-e0de-495c-9d9b-510309cac7a7', choice: 5 },
  // A1371 분할출원 #2 → 2010 #2 ff9e15cb (분할/변경 박스형)
  { srcIdx: 1371, problemId: 'ff9e15cb-4dcd-45c9-a14a-bbff0bb05c19', kind: 'problem' },
  // A2048 보호범위 #3 → 2008 #3 a6f53186
  { srcIdx: 2048, problemId: 'a6f53186-0eaa-42af-883d-b64d0ad046be', choice: 1 },
  // A2275 침해조치 #13 → 2015 #13 bde12f21
  { srcIdx: 2275, problemId: 'bde12f21-1aa5-48f9-bdff-84bec3e83b20', choice: 2 },
  // A2309 침해조치 #18 → 2019 #18 a68592f3
  { srcIdx: 2309, problemId: 'a68592f3-767b-47ca-a912-bbd0ae819ec3', choice: 5 },
  // A2449 특허권 이전 #7 → 2020 #7 d0de7a8b
  { srcIdx: 2449, problemId: 'd0de7a8b-1e5f-40d1-ab97-c1130ca8a99a', choice: 2 },
  // A2614 실시권 일반 #5 → 2014 #5 eb70e50f
  { srcIdx: 2614, problemId: 'eb70e50f-3996-489e-8972-828ae13d547d', choice: 1 },
  // A3165 특허취소신청 #1 → 2018 #1 f6aa22ff
  { srcIdx: 3165, problemId: 'f6aa22ff-c3d9-49d7-8f28-32d3b3472430', choice: 5 },
  // A3258 특허소송 #1 → 2018 #12 c48504ec — 같은 문제이지만 다른 표 (각하결정)
  { srcIdx: 3258, problemId: 'c48504ec-c293-4b1a-b8ed-6b29aa742c92', choice: 4 },
  // A3546 국제출원 #3 → 2004 #3 f645412a
  { srcIdx: 3546, problemId: 'f645412a-25fb-46bb-be19-09d958a119b0', choice: 4 },
];

for (const t of targets) {
  if (t.kind === 'skip-html') {
    console.log(`- A${t.srcIdx}: 이미 HTML 표로 있음 (skip)`);
    continue;
  }
  const tableMd = ans.paragraphs[t.srcIdx].text;
  const tableName = (t.kind === 'problem') ? 'problems' : 'problem_choices';
  const filterCol = (t.kind === 'problem') ? null : 'choice_index';
  let q = sb.from(tableName).select('explanation_md, body_md').eq('problem_id', t.problemId);
  if (filterCol) q = q.eq(filterCol, t.choice);
  const { data: rows } = await q;
  if (!rows || rows.length === 0) {
    console.log(`✕ A${t.srcIdx}: 대상 없음`);
    continue;
  }
  const cur = rows[0].explanation_md ?? '';
  if (cur.includes('| ---') || /<table[\s>]/i.test(cur)) {
    console.log(`- A${t.srcIdx}: 이미 표 있음 (skip)`);
    continue;
  }
  const intro = cur.trim().endsWith('다음과 같다.') || cur.trim().endsWith('다음과 같다')
    ? '\n'
    : '\n\n참고로 표로 정리하면 다음과 같다.\n';
  const newExpl = (cur.trim() + intro + tableMd).trim();
  let upd = sb.from(tableName).update({ explanation_md: newExpl }).eq('problem_id', t.problemId);
  if (filterCol) upd = upd.eq(filterCol, t.choice);
  const { error } = await upd;
  if (error) console.log(`✕ A${t.srcIdx}: ${error.message}`);
  else console.log(`✓ A${t.srcIdx} → ${t.problemId} ${t.kind ?? `ch${t.choice}`} (${newExpl.length}자)`);
}
