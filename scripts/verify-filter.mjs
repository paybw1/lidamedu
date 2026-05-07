import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
const sb = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function hasTableMd(md) {
  if (!md) return false;
  if (/<table[\s>]/i.test(md)) return true;
  return /\n\s*\|[\s-:|]+\|\s*\n/.test('\n' + md + '\n');
}

const { data: law } = await sb.from('laws').select('law_id').eq('law_code', 'patent').maybeSingle();
const { data: probs } = await sb.from('problems')
  .select('problem_id, explanation_md')
  .eq('law_id', law.law_id)
  .is('deleted_at', null)
  .limit(50000);
const probIds = probs.map(p => p.problem_id);

const choices = [];
const boxes = [];
const CHUNK = 100;
for (let i = 0; i < probIds.length; i += CHUNK) {
  const ids = probIds.slice(i, i + CHUNK);
  const { data: c } = await sb.from('problem_choices').select('problem_id, explanation_md').in('problem_id', ids).limit(10000);
  if (c) choices.push(...c);
  const { data: b } = await sb.from('problem_box_items').select('problem_id, explanation_md').in('problem_id', ids).limit(10000);
  if (b) boxes.push(...b);
}

const hasTable = new Map();
for (const p of probs) hasTable.set(p.problem_id, hasTableMd(p.explanation_md));
for (const c of choices) {
  if (!hasTable.get(c.problem_id) && hasTableMd(c.explanation_md)) hasTable.set(c.problem_id, true);
}
for (const b of boxes) {
  if (!hasTable.get(b.problem_id) && hasTableMd(b.explanation_md)) hasTable.set(b.problem_id, true);
}
const total = [...hasTable.values()].filter(Boolean).length;
console.log('JS 측 hasTable=true 카운트:', total, '(기대: 45)');
console.log('총 problems:', probs.length, ', choices:', choices.length, ', boxes:', boxes.length);
