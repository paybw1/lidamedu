// 각 누락 표를 DB 문제와 자동 매핑
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const sb = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);
const ans = JSON.parse(fs.readFileSync('source/_converted/answer.json', 'utf-8'));
const probSrc = JSON.parse(fs.readFileSync('source/_converted/problem.json', 'utf-8'));

function tableRows(text) { return text.split('\n').filter(l => l.trim().startsWith('|')); }
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
function findSectionInfo(arr, idx) {
  for (let j = idx - 1; j >= Math.max(0, idx - 200); j--) {
    const t = arr.paragraphs[j].text || '';
    if (t.startsWith('|') && t.includes('| --- |')) {
      const rows = tableRows(t);
      if (isSectionHeader(rows)) {
        const cells = rows[0].split('|').filter(s=>s.trim()).map(c=>c.trim());
        return { idx: j, label: cells.join(' / '), key: cells.slice(0, 2).join('|') };
      }
    }
  }
  return null;
}
function longestCellSnippet(tableText) {
  const rows = tableRows(tableText);
  let longest = '';
  for (const r of rows) {
    if (r.includes('| --- |')) continue;
    for (const c of r.split('|').map(s=>s.trim()).filter(s=>s)) {
      if (c.length > longest.length) longest = c;
    }
  }
  return longest;
}
// problem.json: section key -> list of {idx, year, problemN, stem, num}
// problem 라인 패턴: "NN'YY..." (NN=2자리, YY=2자리, 변형/단원/종합 옵션)
const probSectionMap = new Map();
{
  let curSec = null;
  for (let i = 0; i < probSrc.paragraphs.length; i++) {
    const t = probSrc.paragraphs[i].text || '';
    if (t.startsWith('|') && t.includes('| --- |')) {
      const rows = tableRows(t);
      if (isSectionHeader(rows)) {
        const cells = rows[0].split('|').filter(s=>s.trim()).map(c=>c.trim());
        curSec = cells.slice(0, 2).join('|');
        if (!probSectionMap.has(curSec)) probSectionMap.set(curSec, []);
      }
    } else if (curSec) {
      const m = t.match(/^(\d{2})['’](\d{2})(?:변형|단원|종합| )/);
      if (m) {
        probSectionMap.get(curSec).push({
          idx: i,
          num: parseInt(m[1], 10),
          year: 2000 + parseInt(m[2], 10) >= 2050 ? 1900 + parseInt(m[2], 10) : 2000 + parseInt(m[2], 10),
          stem: t.replace(/^.{0,15}/, '').slice(0, 100),
        });
      }
    }
  }
  // year 보정 — '95 같은 90년대는 1900년대.
  for (const list of probSectionMap.values()) {
    for (const p of list) {
      const yy = p.year - 2000;
      if (yy >= 70 && yy < 100) p.year = 1900 + yy + 100; // 70-99 → 1970-1999
      if (yy >= 50 && yy < 70) p.year = 1900 + yy + 100; // 1950-1970
    }
  }
}

// 각 누락 표를 처리
const dbProblems = (await sb.from('problems').select('problem_id, year, problem_number, body_md').is('deleted_at', null).limit(50000)).data;
const dbChoices = (await sb.from('problem_choices').select('problem_id, choice_index, body_md, explanation_md').limit(50000)).data;
const dbBoxes = (await sb.from('problem_box_items').select('problem_id, position_index, marker, explanation_md').limit(50000)).data;

function normalize(text) {
  if (!text) return '';
  return text.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}
const dbProblemBySnippet = (snippet) => {
  for (const c of dbChoices) if (normalize(c.explanation_md).includes(snippet)) return { kind: 'choice', ...c };
  for (const p of dbProblems) if (normalize(p.explanation_md).includes(snippet)) return { kind: 'problem', ...p };
  for (const b of dbBoxes) if (normalize(b.explanation_md).includes(snippet)) return { kind: 'box', ...b };
  return null;
};

const tables = [];
for (let i = 0; i < ans.paragraphs.length; i++) {
  const t = ans.paragraphs[i].text || '';
  if (!(t.startsWith('|') && t.includes('| --- |'))) continue;
  const rows = tableRows(t);
  if (isSectionHeader(rows)) continue;
  const am = findAnswerMarker(i);
  const sec = findSectionInfo(ans, i);
  const snippet = longestCellSnippet(t).slice(0, 40);
  if (!am || !sec) continue;
  // DB 매칭 시도 — 이미 있으면 skip
  if (dbProblemBySnippet(snippet)) continue;
  // problem.json 의 같은 섹션에서 N-th 문제 찾기
  const probList = probSectionMap.get(sec.key) || [];
  const probMatch = probList.find(p => p.num === am.num);
  // DB 문제 매핑 by year+body
  let dbProb = null;
  if (probMatch) {
    const stemKey = probMatch.stem.slice(0, 30);
    dbProb = dbProblems.find(p => p.year === probMatch.year && p.body_md.includes(stemKey));
    if (!dbProb) dbProb = dbProblems.find(p => p.body_md.includes(stemKey));
  }
  // 해설 ① ② ... 마커로 어느 choice 의 표인지 결정 — 가장 가까운 직전 ①-⑤ 마커
  let choiceIdx = null;
  const markers = { '①':1, '②':2, '③':3, '④':4, '⑤':5 };
  for (let j = i - 1; j > am.idx; j--) {
    const tj = ans.paragraphs[j].text || '';
    const m = tj.match(/^(?:해설)?\s*([①-⑤])/);
    if (m && markers[m[1]]) { choiceIdx = markers[m[1]]; break; }
    // 또는 "①②③④⑤" 같은 묶음 마커 중 가장 늦은 것 (ex. "①⑤ ...")
    const allMatches = tj.match(/[①-⑤]/g);
    if (allMatches) { choiceIdx = markers[allMatches[allMatches.length - 1]]; break; }
  }
  tables.push({
    srcIdx: i,
    section: sec.label,
    sectionKey: sec.key,
    answerN: am.num,
    answerCorrect: am.correct,
    snippet,
    dbProb,
    choiceIdx,
    full: t,
  });
}
console.log(`# 매핑 시도: ${tables.length}개`);
console.log(`# DB problem 매칭됨: ${tables.filter(t=>t.dbProb).length}개\n`);

for (const m of tables) {
  console.log(`[A${m.srcIdx}] ${m.section} #${m.answerN} 정답${m.answerCorrect}`);
  console.log(`  → DB: ${m.dbProb ? `${m.dbProb.year} #${m.dbProb.problem_number} (${m.dbProb.problem_id})` : '매칭 실패'}`);
  console.log(`  → choice: ${m.choiceIdx ?? '?'}`);
  console.log(`  → snippet: ${m.snippet}`);
  console.log();
}
