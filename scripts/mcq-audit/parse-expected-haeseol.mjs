// 리담특허법 객관식(Ⅱ) 예상문제 제20판 **해설편** 파싱 → problems 매칭 dry-run.
//
// 배경(2026-09-12): 문제편(592문항)만 적재되고 해설편은 0건이었다. 그래서 DB 의
// 예상문제 해설 134건은 실제 해설이 아니라 **목차 조각·정답 지시문**이다
// (예: P-7497 해설 = 「발명2」 ← 목차 «•발명(2)3»).
//
// 매칭 키 = (단원명, 문항번호). DB 는 primary_node → display_label, 해설편은
// 「목적1」 같은 절 제목 뒤에 「01 ④」 정답줄이 이어진다.
//
//   node scripts/mcq-audit/parse-expected-haeseol.mjs            # dry-run(기본)
//   node scripts/mcq-audit/parse-expected-haeseol.mjs --json out.json
//
// ★적재는 하지 않는다. 매칭률·길이 분포·미매칭 표본만 찍는다.

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import "dotenv/config";

const EXTRACTED =
  "source/특허법/특허법객관식/예상/[완0306+내지+해설편] 리담특허법 객관식(Ⅱ) 예상문제 [제20판].extracted.json";
const SOURCE_DOC = "1b7a79f1-a6e2-49a7-ada1-815032c9da67"; // 문제편
const jsonOut = process.argv.includes("--json")
  ? process.argv[process.argv.indexOf("--json") + 1]
  : null;

const norm = (s) => String(s ?? "").replace(/\s+/g, "").trim();

// DB 단원명 → 해설편 절 이름. 기계적 변환이 안 되는 것만 손으로 적는다.
// ★전부 **문항 수 대조로 확인**했다(2026-09-12) — 이름만 보고 넣은 것은 없다.
const SECTION_ALIAS = {
  "[01]주체": "심사일반및심사의주체",   // 4 ↔ 4
  "[03]진행": "심사의진행",            // 6 ↔ 6
  "[04]소멸": "특허권의소멸및특허권자의의무", // 4 ↔ 4
  "[02]청구": "심판의청구",            // 2 ↔ 2
  조정위원회회부: "조정위윈회회부",      // 1 ↔ 1 (책 오타: 위원→위윈)
};

// DB 한 노드에 책의 두 절이 합쳐진 경우 — 번호가 이어진다.
//   「정정심판/특허의정정」 19문항 = 정정심판 #1~9 + 정정청구 #1~10(DB #10~19)
// ★발문으로 확인했다 — DB #10 부터 "특허무효심판절차 중의 특허의 정정"으로 넘어간다.
const MERGED_NODES = {
  "정정심판/특허의정정": [
    { book: "정정심판", from: 1, to: 9, offset: 0 },
    { book: "정정청구", from: 10, to: 19, offset: -9 },
  ],
};

// primary_node_id 가 없는 문항 — display_no 구간으로 절을 지정한다(카운트 대조 완료).
const NODELESS = [
  { from: 7703, to: 7703, book: "분할출원" },   // 문항11 — 책 분할출원 11문항
  { from: 8042, to: 8046, book: "조약일반" },   // 문항1~5 — 책 5문항
  { from: 8082, to: 8084, book: "실용신안법" }, // 문항1~3 — 책 3문항
];

/** DB 행 → 해설편 매칭 키(들). 합쳐진 노드는 번호를 옮긴다. */
function bookKeysFor(sectionLabel, no, displayNo) {
  const base = sectionKey(sectionLabel);
  const nodeless = NODELESS.find((r) => displayNo >= r.from && displayNo <= r.to);
  if (!base && nodeless) return [`${nodeless.book}#${no}`];
  const merged = MERGED_NODES[base];
  if (merged) {
    const seg = merged.find((m) => no >= m.from && no <= m.to);
    if (seg) return [`${seg.book}#${no + seg.offset}`];
  }
  const alias = SECTION_ALIAS[base];
  const keys = [`${base}#${no}`];
  if (alias) keys.unshift(`${alias}#${no}`);
  // 「[01]공지예외적용주장출원」처럼 접두어만 다른 것
  const stripped = base.replace(/^\[\d+\]/, "");
  if (stripped !== base) keys.push(`${stripped}#${no}`);
  return keys;
}
/** 절 제목 판정용 — 괄호 안 조문·쪽번호를 떼고 이름만 남긴다. */
const sectionKey = (s) =>
  norm(s)
    .replace(/^[•·]/, "")
    .replace(/\(.*?\)/g, "")
    .replace(/\d+$/, "");

// ── 1) 해설편 문단 로드 ────────────────────────────────────────────────
const raw = JSON.parse(fs.readFileSync(EXTRACTED, "utf8"));
// ★추출기는 표를 **한 항목**으로 담는다(kind:"table" · text=마크다운 전체 · cells=2차원).
//   text 만 문자열로 눌러 쓰면 절 제목 표와 본문 표를 구분할 수 없다(2026-09-12).
const paras = (Array.isArray(raw) ? raw : (raw.paragraphs ?? [])).map((p) =>
  typeof p === "string"
    ? { text: p, cells: null }
    : { text: p.text ?? "", cells: p.kind === "table" ? (p.cells ?? []) : null },
);

/**
 * ★★다음 교재를 적재할 때 같은 함정이 나온다 — 「`|` 로 시작하는 항목을 전부 건너뛰기」는 틀렸다.
 *
 * 이 해설편의 표는 96개인데 **세 갈래**이고, 셋의 처리가 전부 다르다.
 * 셋을 뭉뚱그려 버리면 본문 표 6개가 조용히 사라진다(건수가 적어 지표로는 안 잡힌다).
 *
 *   갈래      판정 기준                          개수   처리
 *   ────────────────────────────────────────────────────────────────────
 *   절 제목   행이 1개                            82    절 전환(DB 단원명과 82/82 일치)
 *   장 목차   여러 행 + 절반 이상이 쪽번호로 끝남    8    버린다
 *   본문 표   그 밖                                6    **해설에 포함**
 *
 * 본문 표 6개 = 권리능력·행위능력 / 포괄위임제도 / 산업상 이용가능성(의료업·비의료업) /
 *   직무발명 권리·의무 / 특허권·전용실시권·통상실시권 대비 / 증거조사·증거보전.
 *   이 중 4건(P-7574·P-7626·P-7529·P-7800)은 해설이 비어 있던 칸이라 표가 곧 해설이다.
 *
 * ★실제 사고(2026-09-12): `if (/^\|/.test(line)) continue;` 한 줄 때문에
 *   P-7513(행위능력#1)이 1,244자 → 201자로 쪼그라들었다. 표를 살려 866자로 복원.
 * ★쪽번호 판정에 「마지막 칸이 숫자」를 쓰는 이유 — 목차 표는 「항목 | 쪽」 꼴이고
 *   본문 표는 마지막 칸이 서술이다. 반씩 섞인 표는 없어 0.5 문턱으로 충분하다.
 */
const tableKind = (cells) => {
  if (!cells || cells.length === 0) return "none";
  if (cells.length <= 1) return "heading";
  const pageish = cells.filter((r) =>
    /^\d+$/.test(String(r[r.length - 1] ?? "").trim()),
  ).length;
  return pageish / cells.length >= 0.5 ? "toc" : "body";
};

// ── 2) DB 단원·문항 ────────────────────────────────────────────────────
const supa = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const { data: rows, error } = await supa
  .from("problems")
  .select(
    "problem_id, display_no, problem_number, explanation_md, primary_node_id, systematic_nodes!problems_primary_node_id_fkey(display_label)",
  )
  .eq("source_doc_id", SOURCE_DOC)
  .is("deleted_at", null);
if (error) throw error;

const db = rows.map((r) => ({
  problemId: r.problem_id,
  displayNo: r.display_no,
  no: r.problem_number,
  section: r.systematic_nodes?.display_label ?? null,
  keys: bookKeysFor(
    r.systematic_nodes?.display_label,
    r.problem_number,
    r.display_no,
  ),
  curLen: (r.explanation_md ?? "").length,
}));
// ── 2-1) DB 정답 ──────────────────────────────────────────────────────
// ★객관식 정답 소스는 problem_choices.is_correct (choice_index 1~5) **단일**이다.
//   problems 에는 객관식 정답 컬럼이 없다(model_answer_md 는 주관식용). 2026-09-13 스키마 확인.
const dbAnswer = new Map();
for (let i = 0; i < rows.length; i += 100) {
  const { data: cs, error: ce } = await supa
    .from("problem_choices")
    .select("problem_id, choice_index, is_correct")
    .in("problem_id", rows.slice(i, i + 100).map((r) => r.problem_id));
  if (ce) throw ce;
  for (const c of cs) {
    if (!dbAnswer.has(c.problem_id)) dbAnswer.set(c.problem_id, new Set());
    if (c.is_correct) dbAnswer.get(c.problem_id).add(c.choice_index);
  }
}

const dbBySection = new Map();
for (const d of db) {
  const k = sectionKey(d.section);
  if (!dbBySection.has(k)) dbBySection.set(k, []);
  dbBySection.get(k).push(d);
}
const knownSections = new Set([...dbBySection.keys()].filter(Boolean));
// 별칭·합본·노드없음 쪽 이름도 절 제목으로 인정해야 절이 넘어간다.
for (const v of Object.values(SECTION_ALIAS)) knownSections.add(v);
for (const segs of Object.values(MERGED_NODES))
  for (const m of segs) knownSections.add(m.book);
for (const r of NODELESS) knownSections.add(r.book);
for (const k of [...knownSections]) knownSections.add(k.replace(/^\[\d+\]/, ""));

// ── 3) 해설편 파싱 ─────────────────────────────────────────────────────
// 정답줄: 「01 ④」 「02 ③④」 — 줄 전체가 번호+동그라미 숫자.
const ANSWER = /^(\d{1,2})\s+([①②③④⑤]+)\s*$/;
const parsed = [];
let section = null;
let cur = null;
const flush = () => {
  if (!cur) return;
  const body = cur.lines
    .join("\n")
    .replace(/^해설\s*$/gm, "")      // 단독 「해설」 줄(레이아웃 잔재)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (body) parsed.push({ ...cur, body, lines: undefined });
  cur = null;
};

for (const item of paras) {
  const line = String(item.text ?? "").trim();
  if (!line) continue;
  const tkind = tableKind(item.cells);

  // 본문 표 — 해설의 일부다. 마크다운 표 그대로 싣는다(위 tableKind 주석 참조).
  if (tkind === "body") {
    if (cur) cur.lines.push(line);
    continue;
  }
  if (tkind === "toc") continue; // 장 목차 — 버린다

  // 절 제목 — ★해설편은 절 제목을 **표 행**으로 찍는다(「| 행위능력 |  | 3-5, 7의2 |」).
  //   가끔 맨줄(「복수당사자 대표11」)로도 나온다. 둘 다 받는다.
  //   ※표 행을 건너뛰기 전에 먼저 봐야 한다 — 이걸 놓쳐 절이 안 넘어갔다(2026-09-12).
  const cell = tkind === "heading" ? (item.cells[0]?.[0] ?? null) : null;
  const sk = sectionKey(cell ?? line);
  if (sk && knownSections.has(sk) && !ANSWER.test(line)) {
    flush();
    section = sk;
    continue;
  }
  const m = ANSWER.exec(line);
  if (m && section) {
    flush();
    cur = { section, no: Number(m[1]), answer: m[2], lines: [] };
    continue;
  }
  if (cur) {
    // 머리말·꼬리말 잡음 제거
    if (/LIDAM PATENT LAW|리담특허법 객관식|정답 및 해설/.test(line)) continue;
    cur.lines.push(line);
  }
}
flush();

// ── 3-1) 정답줄 번호 중복 복구 ─────────────────────────────────────────
const CIRCLED = { "①": 1, "②": 2, "③": 3, "④": 4, "⑤": 5 };
const ansSet = (a) => new Set([...String(a ?? "")].map((c) => CIRCLED[c]).filter(Boolean));
const setEq = (a, b) => a.size === b.size && [...a].every((v) => b.has(v));
const fmtAns = (x) => [...x].sort((p, q) => p - q).map((n) => "①②③④⑤"[n - 1]).join("") || "-";

const matchOn = (list) => {
  const byKey = new Map(list.map((p) => [`${p.section}#${p.no}`, p]));
  const hits = [], misses = [];
  for (const d of db) {
    const p = d.keys.map((k) => byKey.get(k)).find(Boolean);
    if (p) hits.push({ ...d, newLen: p.body.length, answer: p.answer, body: p.body, matchedKey: `${p.section}#${p.no}` });
    else misses.push(d);
  }
  return { hits, misses };
};

/**
 * ★★책이 정답줄 번호를 잘못 찍은 절을 **문서 순서**로 되살린다.
 *
 * 2026-09-13 실사고 — 벌칙 절은 「01 ③ / 02 ⑤ / 02 ②」, 정정청구는 「… 07 / 09 / 09」로
 * 찍혀 있다(제20판 오타). 번호를 키로 쓰면 뒤엣것이 앞엣것을 **조용히 덮어쓴다**.
 * 그 결과 P-7867 에 남의 해설(양벌규정)이 들어가고 P-7868·P-8012 는 빈 채로 남았다.
 * 길이·매칭률 어디에도 안 잡혔고, **정답 대조로만** 드러났다.
 *
 * ★순번 fallback 자체는 위험하다 — 정답과 해설을 세트로 오배정한 전례가 있다.
 *   그래서 이 복구는 **그 절의 정답이 DB 와 전부 일치할 때만** 받아들인다.
 *   하나라도 어긋나면 손대지 않고 경고만 남긴다. 스스로 검증되는 복구다.
 */
const keyCount = new Map();
for (const p of parsed) {
  const k = `${p.section}#${p.no}`;
  keyCount.set(k, (keyCount.get(k) ?? 0) + 1);
}
const dupSections = [...new Set([...keyCount].filter(([, n]) => n > 1).map(([k]) => k.slice(0, k.lastIndexOf("#"))))];
const repairLog = [];
for (const sec of dupSections) {
  const items = parsed.filter((p) => p.section === sec); // 문서 순서 유지
  const pos = new Map(items.map((p, i) => [p, i + 1]));
  const trial = parsed.map((p) => (p.section === sec ? { ...p, no: pos.get(p) } : p));
  const { hits: th } = matchOn(trial);
  const secHits = th.filter((h) => h.matchedKey.slice(0, h.matchedKey.lastIndexOf("#")) === sec);
  const bad = secHits.filter((h) => !setEq(ansSet(h.answer), dbAnswer.get(h.problemId) ?? new Set()));
  const ok = bad.length === 0 && secHits.length === items.length;
  repairLog.push({ sec, before: items.map((p) => p.no).join(","), after: items.map((p) => pos.get(p)).join(","), 매칭: secHits.length, 항목: items.length, 정답불일치: bad.length, 적용: ok });
  if (ok) for (const p of items) p.no = pos.get(p);
}

// ── 4) 매칭 ────────────────────────────────────────────────────────────
const { hits, misses } = matchOn(parsed);
const matched = hits.length;
const usedKeys = new Set(hits.map((h) => h.matchedKey));
const unusedParsed = parsed.filter(
  (p) => !usedKeys.has(`${p.section}#${p.no}`),
);

// ── 5) 보고 ────────────────────────────────────────────────────────────
const pct = (a, b) => ((100 * a) / Math.max(b, 1)).toFixed(1);
console.log(`해설편 파싱 ${parsed.length}건 · DB 문항 ${db.length}건`);
console.log(`매칭 ${matched} (${pct(matched, db.length)}%) · DB 미매칭 ${misses.length} · 해설편 잉여 ${unusedParsed.length}\n`);

if (repairLog.length) {
  console.log("[정답줄 번호 중복 — 문서 순서로 복구]");
  for (const r of repairLog)
    console.log(`  ${r.적용 ? "적용" : "★보류"} [${r.sec}] ${r.before} → ${r.after}  (매칭 ${r.매칭}/${r.항목} · 정답불일치 ${r.정답불일치})`);
  console.log("");
}

// 정답 전수 대조 — 오배정은 길이·매칭률에 안 잡히고 여기서만 드러난다.
const ansBad = [];
for (const h of hits) {
  const dbA = dbAnswer.get(h.problemId) ?? new Set();
  if (dbA.size === 0) continue;                       // 선지 미적재
  if (dbA.size === (h.choiceTotal ?? 5)) continue;    // 전항 정답 = 출제오류 처리분
  if (!setEq(ansSet(h.answer), dbA)) ansBad.push({ h, dbA });
}
console.log(`[정답 대조] 일치 ${hits.length - ansBad.length}/${hits.length} · 불일치 ${ansBad.length}`);
for (const { h, dbA } of ansBad)
  console.log(`  ★P-${h.displayNo} ${h.section}#${h.no} (${h.matchedKey})  책 ${fmtAns(ansSet(h.answer))} vs DB ${fmtAns(dbA)}`);
console.log("");

const lens = hits.map((h) => h.newLen).sort((a, b) => a - b);
if (lens.length) {
  console.log(
    `[새 해설 길이] min ${lens[0]} · p50 ${lens[Math.floor(lens.length / 2)]} · p90 ${lens[Math.floor(lens.length * 0.9)]} · max ${lens.at(-1)}`,
  );
  console.log(`   100자 미만 ${lens.filter((x) => x < 100).length}건`);
}
const improved = hits.filter((h) => h.newLen > h.curLen);
const worse = hits.filter((h) => h.newLen < h.curLen && h.curLen > 0);
console.log(`[변화] 늘어남 ${improved.length} · 줄어듦 ${worse.length} · 현재 빈 칸 채움 ${hits.filter((h) => h.curLen === 0).length}`);

console.log("\n[표본 — 현재 초단문이던 것]");
for (const h of hits.filter((x) => x.curLen > 0 && x.curLen < 20).slice(0, 5)) {
  console.log(`  P-${h.displayNo} ${h.section}#${h.no}  ${h.curLen}자 → ${h.newLen}자  정답 ${h.answer}`);
  console.log(`     ${h.body.replace(/\s+/g, " ").slice(0, 95)}…`);
}
if (worse.length) {
  console.log("\n[★주의 — 기존보다 짧아지는 건]");
  for (const h of worse.slice(0, 8))
    console.log(`  P-${h.displayNo} ${h.section}#${h.no}  ${h.curLen}자 → ${h.newLen}자`);
}
if (misses.length) {
  console.log("\n[DB 미매칭 표본]");
  const bySec = {};
  for (const m of misses) bySec[sectionKey(m.section)] = (bySec[sectionKey(m.section)] ?? 0) + 1;
  for (const [k, v] of Object.entries(bySec).sort((a, b) => b[1] - a[1]).slice(0, 10))
    console.log(`  ${String(v).padStart(3)}건  ${k || "(단원없음)"}`);
}
if (unusedParsed.length) {
  console.log("\n[해설편에만 있는 것 표본]");
  for (const p of unusedParsed.slice(0, 8))
    console.log(`  ${p.section}#${p.no} (${p.body.length}자)`);
}

if (jsonOut) {
  fs.writeFileSync(jsonOut, JSON.stringify(hits, null, 2), "utf8");
  console.log(`\n→ ${jsonOut} (${hits.length}건)`);
}
