// 특허 객관식 정답키·선지해설 전수 대조 (원본 해설편 ↔ 운영 DB).
//   node scripts/mcq-audit/audit.mjs
// 결과: scripts/mcq-audit/audit-result.json · 배경은 docs/audits/2026-08-15-patent-mcq-answer-audit.md
import { readFileSync, writeFileSync } from 'node:fs';
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { parseAnswers, norm, normUnit } from './parse-answers.mjs';

const BOOKS = [
  { slug: "gichul", titleLike: "기출", json: "source/_converted/answer.json" },
  { slug: "yesang", titleLike: "예상", json: "source/_converted/expected-answers.json" },
];

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
// ★PostgREST 기본 상한이 1000행이라 페이징 필수 (안 하면 조용히 잘린다).
const maps = [];
for (let from = 0; ; from += 500) {
  const { data, error } = await supa
    .from("publication_content_map")
    .select("content_id, toc_path, sort_key, publication_editions!inner(publications!inner(title))")
    .eq("content_type", "mcq")
    .order("content_id", { ascending: true })
    .order("edition_id", { ascending: true })
    .range(from, from + 499);
  if (error) throw error;
  maps.push(...(data ?? []));
  if (!data || data.length < 500) break;
}
console.log(`매핑 행 ${maps.length}`);

const pids = [...new Set(maps.map((m) => m.content_id))];
const choicesByPid = new Map();
for (let i = 0; i < pids.length; i += 150) {
  const { data } = await supa.from("problem_choices")
    .select("problem_id, choice_index, is_correct, explanation_md")
    .in("problem_id", pids.slice(i, i + 150));
  for (const c of data ?? []) {
    const arr = choicesByPid.get(c.problem_id) ?? [];
    arr.push(c); choicesByPid.set(c.problem_id, arr);
  }
}
const probByPid = new Map();
for (let i = 0; i < pids.length; i += 150) {
  const { data } = await supa.from("problems").select("problem_id, display_no, year, problem_number")
    .in("problem_id", pids.slice(i, i + 150));
  for (const p of data ?? []) probByPid.set(p.problem_id, p);
}

const out = { ok: 0, answerOnly: [], explOnly: [], both: [], allCorrect: 0, noMatch: [], anchorUnitDiff: [] };
for (const book of BOOKS) {
  const entries = parseAnswers(JSON.parse(readFileSync(book.json, "utf8")).paragraphs);
  const byKey = new Map();
  for (const e of entries) {
    if (!e.section) continue;
    const k = `${normUnit(e.section)}#${e.number}`;
    byKey.set(k, (byKey.get(k) ?? []).concat(e));
  }
  let matched = 0, anchored = 0;
  for (const m of maps) {
    if (!m.publication_editions?.publications?.title?.includes(book.titleLike)) continue;
    if (!m.toc_path || m.sort_key == null) continue;
    const cand = byKey.get(`${normUnit(m.toc_path)}#${Number(m.sort_key)}`);
    const cs = (choicesByPid.get(m.content_id) ?? []).sort((a, b) => a.choice_index - b.choice_index);
    const p = probByPid.get(m.content_id);
    // 선지별 해설 일치 개수 — 후보 고르기·검증에 함께 쓴다.
    const score = (x) => {
      let hit = 0;
      for (const c of cs ?? []) {
        const a = norm(x.perChoice[c.choice_index]);
        const b = norm(c.explanation_md);
        if (!a || !b) continue;
        if (a.slice(0, 30) === b.slice(0, 30) || b.startsWith(a.slice(0, 25)) || a.startsWith(b.slice(0, 25))) hit++;
      }
      return hit;
    };
    let e = cand?.length === 1 ? cand[0] : null;
    if (cand && cand.length > 1) {
      const ranked = cand.map((x) => ({ x, s: score(x) })).sort((u, v) => v.s - u.s);
      if (ranked[0].s > 0 && !(ranked[1] && ranked[0].s === ranked[1].s)) e = ranked[0].x;
    }
    if (!e && cs.length && p) {
      // 단원명/번호로 못 붙은 것 — 같은 책 전체에서 선지별 해설이 가장 잘 맞는 엔트리를 찾는다.
      // (DB 단원이 교재 두 단원을 합쳐놓은 구간 등. 3/5 이상 일치할 때만 인정.)
      const ranked = entries.map((x) => ({ x, s: score(x) })).sort((u, v) => v.s - u.s);
      if (ranked[0]?.s >= 3 && ranked[0].s > (ranked[1]?.s ?? 0)) {
        e = ranked[0].x;
        anchored++;
        // ★앵커링은 '해설이 통째로 남의 것'인 경우 그 남의 엔트리에 붙어 정상처럼 보인다.
        //   앵커된 단원이 DB 단원과 무관하면 오배정 의심으로 따로 남긴다.
        const a = normUnit(e.section ?? ""), b = normUnit(m.toc_path);
        if (!a.includes(b) && !b.includes(a)) {
          out.anchorUnitDiff.push({ book: book.slug, displayNo: p.display_no, dbUnit: m.toc_path,
                                    dbNo: Number(m.sort_key), srcSection: e.section, srcNo: e.number, score: ranked[0].s });
        }
      }
    }
    if (!e || !cs.length || !p) {
      out.noMatch.push({ book: book.slug, unit: m.toc_path, no: m.sort_key, cands: cand?.length ?? 0, displayNo: p?.display_no ?? null, year: p?.year ?? null, pno: p?.problem_number ?? null });
      continue;
    }
    matched++;
    const dbCorrect = cs.filter((c) => c.is_correct).map((c) => c.choice_index);
    if (dbCorrect.length === cs.length) { out.allCorrect++; continue; }
    const ansSame = dbCorrect.length === e.correct.length && e.correct.every((v) => dbCorrect.includes(v));
    let explHit = 0, explTot = 0;
    for (const c of cs) {
      const src = norm(e.perChoice[c.choice_index]);
      const db = norm(c.explanation_md);
      if (!src || !db) continue;
      explTot++;
      if (src.slice(0, 30) === db.slice(0, 30) || db.startsWith(src.slice(0, 25)) || src.startsWith(db.slice(0, 25))) explHit++;
    }
    const explSame = explTot === 0 ? null : explHit / explTot >= 0.6;
    const row = { book: book.slug, displayNo: p.display_no, year: p.year, no: p.problem_number,
                  unit: m.toc_path, srcNo: e.number, src: e.correct, db: dbCorrect, explHit, explTot };
    if (ansSame && explSame !== false) out.ok++;
    else if (!ansSame && explSame === true) out.answerOnly.push(row);
    else if (ansSame && explSame === false) out.explOnly.push(row);
    else out.both.push(row);
  }
  console.log(`${book.slug}: 원본 엔트리 ${entries.length} · DB 조인 ${matched} (해설앵커 ${anchored})`);
}
console.log(`\n일치 ${out.ok} · 전항정답(제외) ${out.allCorrect}`);
console.log(`★정답만 불일치(해설은 일치) ${out.answerOnly.length}  ← 진짜 정답 오류`);
console.log(`★해설만 불일치(정답 일치) ${out.explOnly.length}      ← 해설 오배정`);
console.log(`정답+해설 모두 불일치 ${out.both.length}                ← 조인 오류 의심`);
console.log(`미조인 ${out.noMatch.length}`);
for (const [label, arr] of [["정답 오류", out.answerOnly], ["해설 오배정", out.explOnly], ["둘 다", out.both]]) {
  if (!arr.length) continue;
  console.log(`\n[${label}]`);
  for (const r of arr) console.log(`  P-${r.displayNo} ${r.year ?? "-"}년 ${r.no}번 · ${r.book} ${r.unit} ${r.srcNo}번 — 원본 ${r.src.join(",")} vs DB ${r.db.join(",")} (해설 ${r.explHit}/${r.explTot})`);
}
writeFileSync("scripts/mcq-audit/audit-result.json", JSON.stringify(out, null, 1), "utf8");
if (out.anchorUnitDiff.length) {
  console.log(`\n[해설앵커 — DB 단원과 다른 단원에 붙음 ${out.anchorUnitDiff.length}건]`);
  for (const r of out.anchorUnitDiff)
    console.log(`  P-${r.displayNo} · DB ${r.dbUnit} ${r.dbNo}번 → 교재 ${r.srcSection} ${r.srcNo}번 (해설 ${r.score}/5)`);
}
