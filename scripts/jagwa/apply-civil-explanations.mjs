// 민법 해설 초안(tmp/jagwa 산출물) → problems.explanation_md 반영 + 우선확인 플래그.
//   dry-run(기본): 파싱·정답 정렬 검증만. --apply: explanation_md UPDATE + 플래그 문항
//   mismatch_flagged_at 세팅(운영관리 목록 '재검토 필요' 표시로 검수 우선순위 노출).
// 소스:
//   초기 6개년(2010·2012·2013·2014·2016·2026) = civil-{y}-out/qNN.draft.json (+pilot 헤더 플래그 목록)
//   후기 9개년(2017~2025) = pilot-{y}-full.md 섹션 파싱(내부 메모 라인 제거, `검증:` ✗ = 플래그)
import "dotenv/config";
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const J = "tmp/jagwa";
const CIRCLED = ["①", "②", "③", "④", "⑤"];
// --years=2011,2015 형태로 대상 연도 제한 (미지정 시 전체)
const yearsArg = process.argv.find((a) => a.startsWith("--years="));
const ONLY = yearsArg ? new Set(yearsArg.slice(8).split(",").map(Number)) : null;
const pick = (ys) => (ONLY ? ys.filter((y) => ONLY.has(y)) : ys);
const EARLY_YEARS = pick([2010, 2011, 2012, 2013, 2014, 2015, 2016, 2026]);
const LATER_YEARS = pick([2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]);

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// ── DB: 민법 문제 + 정답 인덱스 ──────────────────────────────────────────
const { data: law } = await sb.from("laws").select("law_id").eq("law_code", "civil").single();
const problems = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb
    .from("problems")
    .select("problem_id, year, problem_number, problem_choices(choice_index, is_correct)")
    .eq("law_id", law.law_id)
    .is("deleted_at", null)
    .order("problem_id")
    .range(from, from + 999);
  if (error) throw error;
  problems.push(...(data ?? []));
  if ((data ?? []).length < 1000) break;
}
const byYearNo = new Map();
for (const p of problems) {
  byYearNo.set(`${p.year}#${p.problem_number}`, {
    problemId: p.problem_id,
    correct: new Set(
      p.problem_choices.filter((c) => c.is_correct).map((c) => CIRCLED[c.choice_index - 1]),
    ),
  });
}

const marksOf = (s) => new Set((s.match(/[①②③④⑤]/g) ?? []));
const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

// ── 초기 연도: draft.json → md 합성 ─────────────────────────────────────
function composeFromDraft(d) {
  const lines = [
    `**① 결론** ${d.conclusion}`,
    "",
    `**② 쟁점** ${d.issue}`,
    "",
    `**③ 근거** ${d.basis}`,
    "",
    "**④ 선지별 해설**",
    ...d.choices.map((c) => `- ${c.idx} ${c.verdict === "○" ? "○" : "✗"} ${c.why}`),
  ];
  if (Array.isArray(d.cases) && d.cases.length > 0) {
    lines.push("", `*관련 조문·판례: ${d.cases.join(" · ")}*`);
  }
  return lines.join("\n");
}

function headerFlags(pilotPath) {
  if (!existsSync(pilotPath)) return new Set();
  const head = readFileSync(pilotPath, "utf8").split("\n").slice(0, 6).join("\n");
  // 검증 플래그 + DB 전사 플래그(원본 데이터 이슈) 모두 검수 우선 확인 대상.
  const out = new Set();
  for (const m of head.matchAll(/(?:검증|DB 전사) 플래그 \d+건 \(([^)]*)\)/g)) {
    for (const s of m[1].split(",")) {
      const n = Number(s.replace(/[^\d]/g, ""));
      if (n > 0) out.add(n);
    }
  }
  return out;
}

// ── 후기 연도: pilot md 섹션 파싱 ───────────────────────────────────────
const INTERNAL_PREFIXES = [
  "*출처:", "*저작권", "*플래그:", "> **검증", "> **보강", "[경미한", "[중대", "`검증:",
];
function parsePilot(year) {
  const text = readFileSync(`${J}/pilot-${year}-full.md`, "utf8");
  const out = [];
  const re = /^## #(\d+) · 정답 ([^\n]+)\n/gm;
  const matches = [...text.matchAll(re)];
  for (let i = 0; i < matches.length; i++) {
    const no = Number(matches[i][1]);
    const answer = matches[i][2].trim();
    const start = matches[i].index + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const raw = text.slice(start, end);
    const verifyLine = raw.split("\n").find((l) => l.startsWith("`검증:")) ?? "";
    const flagged = verifyLine.includes("✗");
    const kept = raw
      .split("\n")
      .filter((l) => {
        const t = l.trimStart();
        if (t === "---") return false;
        return !INTERNAL_PREFIXES.some((p) => t.startsWith(p));
      })
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    out.push({ no, answer, md: kept, flagged });
  }
  return out;
}

// ── 엔트리 수집 ────────────────────────────────────────────────────────
const entries = []; // {year, no, answerMarks, md, flagged}
for (const y of EARLY_YEARS) {
  const dir = `${J}/civil-${y}-out`;
  const flags = headerFlags(`${J}/pilot-${y}-full.md`);
  for (const f of readdirSync(dir).filter((f) => /^q\d+\.draft\.json$/.test(f))) {
    const no = Number(f.slice(1, 3));
    const d = JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
    entries.push({
      year: y,
      no,
      answerMarks: marksOf(String(d.answer ?? "")),
      md: `**정답 ${d.answer}**\n\n${composeFromDraft(d)}`,
      flagged: flags.has(no),
    });
  }
}
for (const y of LATER_YEARS) {
  for (const e of parsePilot(y)) {
    entries.push({
      year: y,
      no: e.no,
      answerMarks: marksOf(e.answer),
      md: `**정답 ${e.answer}**\n\n${e.md}`,
      flagged: e.flagged,
    });
  }
}

// ── 검증: 초안 정답 vs DB 정답키(공단 전수검증 권위) ─────────────────────
let ok = 0;
const mismatches = [];
const missing = [];
for (const e of entries) {
  const db = byYearNo.get(`${e.year}#${e.no}`);
  if (!db) { missing.push(`${e.year}#${e.no}`); continue; }
  if (e.answerMarks.size > 0 && sameSet(e.answerMarks, db.correct)) ok++;
  else mismatches.push(`${e.year}#${e.no} 초안=${[...e.answerMarks].join("")} DB=${[...db.correct].join("")}`);
}
const flaggedCount = entries.filter((e) => e.flagged).length;
console.log(`엔트리 ${entries.length} · 정답일치 ${ok} · 불일치 ${mismatches.length} · DB미존재 ${missing.length} · 플래그 ${flaggedCount}`);
if (mismatches.length) console.log("불일치:", mismatches.join(" / "));
if (missing.length) console.log("미존재:", missing.join(" / "));

if (!APPLY) {
  const sample = entries.find((e) => e.year === 2020 && e.no === 1) ?? entries[0];
  console.log(`--- 샘플(${sample.year} #${sample.no}) 앞 600자 ---\n` + sample.md.slice(0, 600));
  process.exit(0);
}

// ── 적용 (정답 일치 엔트리만) ───────────────────────────────────────────
const nowIso = new Date().toISOString();
let applied = 0, flaggedApplied = 0, failed = 0;
const backup = [];
for (const e of entries) {
  const db = byYearNo.get(`${e.year}#${e.no}`);
  if (!db) continue;
  if (!(e.answerMarks.size > 0 && sameSet(e.answerMarks, db.correct))) continue;
  const patch = { explanation_md: e.md };
  if (e.flagged) patch.mismatch_flagged_at = nowIso;
  const { error } = await sb.from("problems").update(patch).eq("problem_id", db.problemId);
  if (error) { console.log(`FAIL ${e.year}#${e.no}: ${error.message}`); failed++; continue; }
  backup.push({ year: e.year, no: e.no, problemId: db.problemId, flagged: e.flagged, md: e.md });
  applied++;
  if (e.flagged) flaggedApplied++;
}
const backupPath = ONLY
  ? `tmp/jagwa/applied-explanations-backup-${[...ONLY].sort().join("-")}.json`
  : "tmp/jagwa/applied-explanations-backup.json";
writeFileSync(backupPath, JSON.stringify(backup, null, 1));
console.log(`적용 ${applied} (플래그 ${flaggedApplied}) · 실패 ${failed} · 백업 ${backupPath}`);
