// 민법 객관식 문제에서 인용된 판례 사건번호를 뽑아 DB 수록 여부와 대조한다.
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const CIVIL = "74dc73af-f25d-40ff-aead-fb039471982c";

const probs = [];
for (let from = 0; ; from += 500) {
  const { data, error } = await sb
    .from("problems")
    .select("problem_id, format, origin, year, problem_number, display_no, body_md, explanation_md, main_case_number")
    .eq("law_id", CIVIL).is("deleted_at", null)
    .order("problem_id").range(from, from + 499);
  if (error) throw error;
  probs.push(...data);
  if (data.length < 500) break;
}
const byFormat = {};
for (const p of probs) byFormat[p.format] = (byFormat[p.format] ?? 0) + 1;
console.log(`민법 문제 ${probs.length}건 · 유형 ${JSON.stringify(byFormat)}`);

const mcq = probs.filter((p) => String(p.format).startsWith("mc_"));
console.log(`객관식으로 볼 것: ${mcq.length} (format 값: ${[...new Set(mcq.map(p=>p.format))].join(",")})`);

// 선지도 본다.
const ids = mcq.map((p) => p.problem_id);
const choices = [];
for (let i = 0; i < ids.length; i += 150) {
  const { data, error } = await sb.from("problem_choices").select("problem_id, body_md, explanation_md, related_case_number").in("problem_id", ids.slice(i, i + 150));
  if (error) throw error;
  choices.push(...data);
}
const choiceByProblem = new Map();
for (const c of choices) {
  if (!choiceByProblem.has(c.problem_id)) choiceByProblem.set(c.problem_id, []);
  choiceByProblem
    .get(c.problem_id)
    .push(
      [c.body_md ?? "", c.explanation_md ?? "", c.related_case_number ?? ""].join(
        " / ",
      ),
    );
}

// 사건번호: 2011다12345 / 91다카1234 / 2005므1234 등. 부호는 대법원 민사·가사·형사 폭넓게.
const CASE_RE = /(\d{2,4})\s*(다카|다|므|스|마|그|재다|누|두|도|후|허|나|가합|가단)\s*(\d{1,6})/g;
const hits = new Map(); // 정규화 사건번호 → {count, problems:Set}
for (const p of mcq) {
  const text = [p.body_md ?? "", p.explanation_md ?? "", p.main_case_number ?? "", ...(choiceByProblem.get(p.problem_id) ?? [])].join("\n");
  for (const m of text.matchAll(CASE_RE)) {
    let y = m[1];
    if (y.length === 2) y = (Number(y) > 30 ? "19" : "20") + y;   // 91다카 → 1991
    const no = `${y}${m[2]}${m[3]}`;
    if (!hits.has(no)) hits.set(no, { raw: `${m[1]}${m[2]}${m[3]}`, problems: new Set() });
    hits.get(no).problems.add(p.display_no ?? p.problem_id.slice(0, 8));
  }
}
console.log(`\n인용된 사건번호(중복 제거): ${hits.size}개`);

// DB 수록 여부 — cases.case_number 는 원문 표기(2자리 연도 포함)일 수 있어 둘 다로 조회.
const wanted = [...new Set([...hits.keys(), ...[...hits.values()].map((v) => v.raw)])];
const found = new Set();
for (let i = 0; i < wanted.length; i += 100) {
  const { data, error } = await sb.from("cases").select("case_number, subject_laws").in("case_number", wanted.slice(i, i + 100)).is("deleted_at", null);
  if (error) throw error;
  for (const c of data) found.add(c.case_number);
}
const rows = [...hits.entries()].map(([no, v]) => ({
  no, raw: v.raw, inDb: found.has(no) || found.has(v.raw), n: v.problems.size,
  problems: [...v.problems].slice(0, 6),
}));
rows.sort((a, b) => b.n - a.n || a.no.localeCompare(b.no));
const missing = rows.filter((r) => !r.inDb);
console.log(`  DB 수록 ${rows.length - missing.length} · 미수록 ${missing.length}`);
console.log(JSON.stringify(rows, null, 0).slice(0, 200));
import fs from "node:fs";
fs.writeFileSync("tmp/civil-case-list.json", JSON.stringify(rows, null, 2), "utf8");
console.log("\n→ tmp/civil-case-list.json");
