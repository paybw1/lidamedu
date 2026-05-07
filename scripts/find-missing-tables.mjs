// 정밀화: HTML 표도 매칭, 모든 행에서 가장 긴 셀 텍스트로 fingerprint.
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const sb = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);
const ans = JSON.parse(fs.readFileSync('source/_converted/answer.json', 'utf-8'));

function tableRows(text) {
  return text.split('\n').filter(l => l.trim().startsWith('|'));
}
function isSectionHeader(rows) {
  if (rows[0].trim().startsWith('| •')) return true;
  if (rows.length <= 2) return true;
  const lastCell = rows[0].split('|').filter(s=>s.trim()).pop()?.trim() || '';
  if (/^[\d①-⑩,\s\-의]+$/.test(lastCell) && lastCell.length < 30) return true;
  if (rows[0].trim().startsWith('|  |') && rows[0].includes('년')) return true;
  return false;
}
function findAnswerMarker(idx) {
  for (let j = idx - 1; j >= Math.max(0, idx - 30); j--) {
    const t = ans.paragraphs[j].text || '';
    const m = t.match(/^(\d{2})\s+([①-⑤])/);
    if (m) return { idx: j, num: parseInt(m[1], 10), correct: m[2] };
  }
  return null;
}
function findSectionHeader(idx) {
  for (let j = idx - 1; j >= Math.max(0, idx - 200); j--) {
    const t = ans.paragraphs[j].text || '';
    if (t.startsWith('|') && t.includes('| --- |')) {
      const rows = tableRows(t);
      if (isSectionHeader(rows)) {
        const cells = rows[0].split('|').filter(s=>s.trim());
        return cells.map(c=>c.trim()).join(' / ');
      }
    }
  }
  return '?';
}
function longestCellSnippet(tableText) {
  const rows = tableRows(tableText);
  let longest = '';
  for (const r of rows) {
    if (r.includes('| --- |')) continue;
    const cells = r.split('|').map(s=>s.trim()).filter(s=>s);
    for (const c of cells) {
      if (c.length > longest.length) longest = c;
    }
  }
  return longest;
}

// 소스 표 수집
const tables = [];
for (let i = 0; i < ans.paragraphs.length; i++) {
  const t = ans.paragraphs[i].text || '';
  if (!(t.startsWith('|') && t.includes('| --- |'))) continue;
  const rows = tableRows(t);
  if (isSectionHeader(rows)) continue;
  const am = findAnswerMarker(i);
  const sec = findSectionHeader(i);
  let beforeTexts = [];
  for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
    const bt = ans.paragraphs[j].text || '';
    if (bt && !bt.startsWith('|') && bt !== '해설') beforeTexts.unshift(bt.slice(0, 80));
  }
  tables.push({
    idx: i,
    header: rows[0].trim(),
    rowCount: rows.length,
    section: sec,
    problemNum: am?.num,
    correct: am?.correct,
    ctx: beforeTexts.slice(-2).join(' / '),
    snippet: longestCellSnippet(t).slice(0, 40),
    full: t,
  });
}

const { data: problems } = await sb.from('problems').select('problem_id, year, problem_number, body_md, explanation_md').is('deleted_at', null).limit(50000);
const { data: choices } = await sb.from('problem_choices').select('problem_id, choice_index, explanation_md').limit(50000);
const { data: boxes } = await sb.from('problem_box_items').select('problem_id, position_index, marker, explanation_md').limit(50000);

// HTML 태그 제거 + whitespace 정규화 후 substring 매칭
function normalize(text) {
  if (!text) return '';
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const dbHaystacks = [
  ...problems.map(p => ({ kind: 'problem', id: p.problem_id, year: p.year, num: p.problem_number, text: normalize(p.explanation_md) })),
  ...choices.map(c => ({ kind: 'choice', id: c.problem_id, ci: c.choice_index, text: normalize(c.explanation_md) })),
  ...boxes.map(b => ({ kind: 'box', id: b.problem_id, marker: b.marker, text: normalize(b.explanation_md) })),
];

function findInDb(srcTable) {
  const needle = srcTable.snippet.replace(/\s+/g, ' ').trim();
  if (needle.length < 10) return null;
  for (const h of dbHaystacks) {
    if (h.text.includes(needle)) return h;
  }
  return null;
}

const missing = [];
for (const t of tables) {
  const found = findInDb(t);
  if (!found) missing.push(t);
}

console.log(`# 총 해설 표: ${tables.length}개`);
console.log(`# DB 에 누락: ${missing.length}개\n`);

for (const m of missing) {
  console.log(`[A${m.idx}] ${m.section} | 문제 #${m.problemNum ?? '?'} 정답 ${m.correct ?? '?'} | rows=${m.rowCount}`);
  console.log(`  snippet: ${m.snippet.slice(0,60)}`);
  console.log(`  ctx: ${m.ctx.slice(0, 150)}`);
  console.log();
}
