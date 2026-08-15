// 선지 해설에서 '이어지는 문단'이 적재 때 버려진 것을 교재 원문으로 채운다.
//   원인: 해설편 파서가 원문자(①~⑤)로 시작하는 첫 문단만 선지에 붙이고,
//         뒤따르는 문단(ⅰ)ⅱ)ⅲ), 표, 부연)을 버렸다.
//
// ★기존 DB 문구는 절대 덮어쓰지 않는다 — 운영자가 다듬어 놓은 것일 수 있으므로
//   '변경된 부분 우선'(사용자 지시 2026-08-15). 빠진 뒷문단만 이어 붙인다.
//
//   node scripts/mcq-audit/fill-truncated-explanations.mjs            # dry-run
//   node scripts/mcq-audit/fill-truncated-explanations.mjs --apply
import { writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { parseAnswers, norm, normUnit } from "./parse-answers.mjs";

const APPLY = process.argv.includes("--apply");
const VERBOSE = process.argv.includes("--verbose");

// 문제 단위 마무리 문장 — 특정 선지의 해설이 아니라 문항 전체에 대한 것이라 붙이지 않는다.
const PROBLEM_LEVEL_RE = /^(따라서|결국|그러므로|정답은|옳은 것은|틀린 것은)/;

// 해설 본문으로 볼 수 있는 문단만 붙인다. 파서가 놓친 편집상 조각(장 제목, 이미지
// 자리표시자, 목차 부스러기)이 해설에 섞여 들어가지 않도록 하는 마지막 방어선.
function isAppendable(para) {
  const t = para.trim();
  if (!t) return false;
  if (PROBLEM_LEVEL_RE.test(t)) return false;
  if (/^\[IMG:[^\]]*\]$/.test(t)) return false; // 이미지 자리표시자 단독
  if (/^제\s*\d+\s*장/.test(t)) return false; // 장 제목
  if (/^\d{2}\s/.test(t)) return false; // 항목 머리글 잔재
  if (t.startsWith("|")) return true; // 표 — 짧아도 본문
  return t.length >= 15;
}

const BOOKS = [
  { slug: "gichul", titleLike: "기출", json: "source/_converted/answer.json" },
  { slug: "yesang", titleLike: "예상", json: "source/_converted/expected-answers.json" },
];

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// 매핑 (PostgREST 1000행 상한 → 페이징)
const maps = [];
for (let from = 0; ; from += 500) {
  const { data, error } = await supa
    .from("publication_content_map")
    .select("content_id, toc_path, sort_key, publication_editions!inner(publications!inner(title))")
    .eq("content_type", "mcq")
    .order("content_id").order("edition_id")
    .range(from, from + 499);
  if (error) throw error;
  maps.push(...(data ?? []));
  if (!data || data.length < 500) break;
}

const pids = [...new Set(maps.map((m) => m.content_id))];
const choicesByPid = new Map();
for (let i = 0; i < pids.length; i += 150) {
  const { data, error } = await supa.from("problem_choices")
    .select("choice_id, problem_id, choice_index, explanation_md")
    .in("problem_id", pids.slice(i, i + 150));
  if (error) throw error;
  for (const c of data ?? []) {
    const arr = choicesByPid.get(c.problem_id) ?? [];
    arr.push(c);
    choicesByPid.set(c.problem_id, arr);
  }
}
const probByPid = new Map();
for (let i = 0; i < pids.length; i += 150) {
  const { data } = await supa.from("problems").select("problem_id, display_no, year, problem_number")
    .in("problem_id", pids.slice(i, i + 150));
  for (const p of data ?? []) probByPid.set(p.problem_id, p);
}

const plan = [];
const skipped = { noJoin: 0, alreadyHas: 0, problemLevel: 0 };

for (const book of BOOKS) {
  const doc = JSON.parse(readFileSync(book.json, "utf8"));
  // 쪽 머리글·꼬리말(책 제목, 장 표기, "정답 및 해설" 등)은 문서 전체에 반복된다.
  // 개별 패턴을 쫓는 대신 '여러 번 반복되는 문단'을 통째로 제외한다.
  const freq = new Map();
  for (const p of doc.paragraphs) {
    const t = (p.text ?? "").trim();
    if (t) freq.set(t, (freq.get(t) ?? 0) + 1);
  }
  const isRunningHeader = (t) => (freq.get(t.trim()) ?? 0) > 3;
  const entries = parseAnswers(doc.paragraphs);
  const byKey = new Map();
  for (const e of entries) {
    if (!e.section) continue;
    const k = `${normUnit(e.section)}#${e.number}`;
    byKey.set(k, (byKey.get(k) ?? []).concat(e));
  }
  for (const m of maps) {
    if (!m.publication_editions?.publications?.title?.includes(book.titleLike)) continue;
    if (!m.toc_path || m.sort_key == null) continue;
    const cs = (choicesByPid.get(m.content_id) ?? []).sort((a, b) => a.choice_index - b.choice_index);
    const p = probByPid.get(m.content_id);
    if (!cs.length || !p) continue;

    const score = (e) => cs.filter((c) => {
      const a = norm(e.perChoice[c.choice_index]), b = norm(c.explanation_md);
      return a && b && (b.startsWith(a.slice(0, 25)) || a.startsWith(b.slice(0, 25)));
    }).length;

    const cand = byKey.get(`${normUnit(m.toc_path)}#${Number(m.sort_key)}`);
    let e = cand?.length === 1 ? cand[0] : null;
    if (cand && cand.length > 1) {
      const r = cand.map((x) => ({ x, s: score(x) })).sort((u, v) => v.s - u.s);
      if (r[0].s > 0 && !(r[1] && r[0].s === r[1].s)) e = r[0].x;
    }
    if (!e) {
      const r = entries.map((x) => ({ x, s: score(x) })).sort((u, v) => v.s - u.s);
      if (r[0]?.s >= 3 && r[0].s > (r[1]?.s ?? 0)) e = r[0].x;
    }
    if (!e) continue;

    for (const c of cs) {
      const cont = e.cont?.[c.choice_index] ?? [];
      if (cont.length === 0) continue;
      const db = c.explanation_md ?? "";
      if (!norm(db)) { skipped.noJoin++; continue; }

      // 문단 '중간'에서 잘린 경우 — DB 문구가 교재 문단의 앞부분과 정확히 일치하면
      // 그 문단 전체를 되살린다(그 구간엔 운영자 편집이 없다는 뜻이므로 잃을 게 없다).
      // 조금이라도 다르면 운영자가 손댄 것으로 보고 DB 문구를 그대로 둔다.
      const first = e.perChoice[c.choice_index] ?? "";
      const dbFlat = db.replace(/\s+/g, "");
      const firstFlat = first.replace(/\s+/g, "");
      const truncatedMidParagraph =
        dbFlat.length > 0 && firstFlat.startsWith(dbFlat) && firstFlat.length > dbFlat.length;
      const base = truncatedMidParagraph ? first : db;
      const baseNorm = norm(base);

      const missing = [];
      for (const para of cont) {
        if (!isAppendable(para) || isRunningHeader(para)) { skipped.problemLevel++; continue; }
        const key = norm(para).slice(0, 30);
        if (key && baseNorm.includes(key)) continue; // 이미 들어 있음
        missing.push(para);
      }
      if (missing.length === 0 && !truncatedMidParagraph) { skipped.alreadyHas++; continue; }
      plan.push({
        book: book.slug,
        displayNo: p.display_no,
        year: p.year,
        pno: p.problem_number,
        unit: m.toc_path,
        srcNo: e.number,
        choiceIndex: c.choice_index,
        choiceId: c.choice_id,
        before: db,
        base,
        append: missing.join("\n"),
        restoredHead: truncatedMidParagraph, // 문단 중간 잘림을 복원한 건
        headEdited: !truncatedMidParagraph && !norm(db).startsWith(norm(first).slice(0, 25)),
      });
    }
  }
}

// ★대상이 0 일 때는 백업을 쓰지 않는다 — 반영 뒤 검증차 다시 돌리면 빈 파일로
//   덮어써져 복원 원천이 사라진다(2026-08-15에 실제로 겪음. 원장 스냅샷으로 복구).
if (plan.length > 0) {
  writeFileSync(
    "scripts/mcq-audit/backups/backup-fill-explanations.json",
    JSON.stringify(plan.map((x) => ({ choiceId: x.choiceId, displayNo: x.displayNo, choiceIndex: x.choiceIndex, before: x.before })), null, 1),
    "utf8",
  );
  console.log("백업: scripts/mcq-audit/backups/backup-fill-explanations.json");
}

const edited = plan.filter((x) => x.headEdited);
const restored = plan.filter((x) => x.restoredHead);
console.log(`보정 대상 ${plan.length}개 선지 · 추가 분량 ${plan.reduce((a, x) => a + x.append.length, 0).toLocaleString()}자`);
console.log(`  건너뜀: 이미 반영됨 ${skipped.alreadyHas} · 본문 아님 ${skipped.problemLevel} · 해설 없음 ${skipped.noJoin}`);
console.log(`  문단 중간 잘림 복원 ${restored.length}개`);
console.log(`  ★앞부분이 교재와 다른 건(운영자 편집) ${edited.length}개 — 기존 문구는 그대로 두고 뒤에만 잇는다\n`);

for (const x of (VERBOSE ? plan : plan.slice(0, 12))) {
  const tag = x.headEdited ? "  [앞부분 편집됨]" : x.restoredHead ? "  [문단 중간 잘림 복원]" : "";
  console.log(`P-${x.displayNo} ${x.year ?? "-"}년 ${x.pno}번 선지${x.choiceIndex} · ${x.unit} ${x.srcNo}번${tag}`);
  console.log(`   현재(끝): …${x.before.replace(/\s+/g, " ").slice(-60)}`);
  if (x.restoredHead)
    console.log(`   문단복원 : …${x.base.replace(/\s+/g, " ").slice(x.before.replace(/\s+/g, " ").length).slice(0, 80)}`);
  console.log(`   덧붙임  : ${x.append.replace(/\s+/g, " ").slice(0, 110)}${x.append.length > 110 ? "…" : ""}`);
}
if (!VERBOSE && plan.length > 12) console.log(`… 외 ${plan.length - 12}개 (--verbose 로 전체)`);

if (!APPLY) {
  console.log("\ndry-run — 반영하려면 --apply");
  process.exit(0);
}
let n = 0;
for (const x of plan) {
  const next = x.append ? `${x.base.replace(/\s+$/, "")}\n${x.append}` : x.base;
  const { error } = await supa.from("problem_choices").update({ explanation_md: next }).eq("choice_id", x.choiceId);
  if (error) throw error;
  n++;
}
console.log(`\n✓ ${n}개 선지 해설 보정 완료`);
