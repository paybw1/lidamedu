// 민법 680문항 선지·박스 배선 v2 — 발문 기준 polarity 교정 + 플랫폼 OX 규약 반영.
// dry-run 기본, --apply 로 반영.
//   S0: polarity 교정 (발문 극성 ↔ DB 불일치)
//   S1: ①~⑤ 불릿 → problem_choices (해설·type·related·ox_truth·ox_ineligible)
//   S2: ㄱㄴㄷ 불릿 + 기존 box_items(mc_box) 배선 / g1-mc_box 는 정답조합 파생 ox 만
//   S3: 조합형 mc_case — 보기 → box_items 신설(div·평문·픽스처) + body 정리
//   S4: 종합해설 = 정답 + 결론 + trailer 축약
//   S5: 2025#37·38 재검토 플래그 (발문·정답키·해설 판정 3자 불일치)
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const APPLY = process.argv.includes("--apply");
const c = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const DIR = "tmp/jagwa/civil-choice-wiring";
mkdirSync(DIR, { recursive: true });
const ADMIN = "e20ac99a-bfa6-4862-94dd-23c063189463";
const FLAG_TAGS = new Set(["2025#37", "2025#38"]);

/* ── 적재 ─────────────────────────────────────────────────── */
const { data: law } = await c.from("laws").select("law_id").eq("law_code", "civil").single();
const problems = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await c
    .from("problems")
    .select("problem_id, display_no, year, problem_number, format, polarity, body_md, explanation_md, mismatch_flagged_at")
    .eq("law_id", law.law_id)
    .is("deleted_at", null)
    .order("problem_id")
    .range(from, from + 999);
  if (error) throw error;
  problems.push(...data);
  if (data.length < 1000) break;
}
const pids = problems.map((p) => p.problem_id);
const choices = [];
const boxItems = [];
for (let i = 0; i < pids.length; i += 150) {
  const ids = pids.slice(i, i + 150);
  const { data: chs } = await c.from("problem_choices").select("choice_id, problem_id, choice_index, body_md, is_correct").in("problem_id", ids).limit(10000);
  choices.push(...chs);
  const { data: bis } = await c.from("problem_box_items").select("box_item_id, problem_id, position_index, marker, body_md").in("problem_id", ids).limit(10000);
  boxItems.push(...bis);
}
const choicesByP = new Map();
for (const ch of choices) { if (!choicesByP.has(ch.problem_id)) choicesByP.set(ch.problem_id, []); choicesByP.get(ch.problem_id).push(ch); }
const boxByP = new Map();
for (const bi of boxItems) { if (!boxByP.has(bi.problem_id)) boxByP.set(bi.problem_id, []); boxByP.get(bi.problem_id).push(bi); }
const artMap = new Map();
for (let from = 0; ; from += 1000) {
  const { data } = await c.from("articles").select("article_id, article_number").eq("law_id", law.law_id).eq("level", "article").range(from, from + 999);
  for (const a of data) artMap.set(a.article_number, a.article_id);
  if (data.length < 1000) break;
}
const caseMap = new Map();
for (let from = 0; ; from += 1000) {
  const { data } = await c.from("cases").select("case_id, case_number").range(from, from + 999);
  for (const x of data) caseMap.set(x.case_number.replace(/\s/g, ""), x.case_id);
  if (data.length < 1000) break;
}
console.log("문항", problems.length, "| 선지", choices.length, "| box_items", boxItems.length);

/* ── 헬퍼 ─────────────────────────────────────────────────── */
const CIRC = "①②③④⑤";
const KI = "ㄱㄴㄷㄹㅁㅂ";
const BULLET_RE = /^[-*]\s*([①②③④⑤ㄱㄴㄷㄹㅁㅂ])\s*([○✗×OX◯])?\s*(.+)$/;
function parseBullets(md) {
  const out = [];
  for (const line of (md || "").split("\n")) {
    const m = line.trim().match(BULLET_RE);
    if (!m) continue;
    out.push({ marker: m[1], truth: m[2] == null ? null : "○◯O".includes(m[2]) ? "O" : "X", text: m[3].trim() });
  }
  return out;
}
function extractCivilArticles(text) {
  const arts = [];
  const re = /제(\d+)조(?:의(\d+))?/g;
  let m;
  while ((m = re.exec(text))) {
    const prefix = text.slice(Math.max(0, m.index - 14), m.index);
    const pm = prefix.match(/([가-힣]+법(?:률)?|시행령|규칙)\s*$/);
    if (pm && pm[1] !== "민법") continue;
    arts.push(m[2] ? `${m[1]}의${m[2]}` : m[1]);
  }
  return arts;
}
function extractCases(text) {
  const out = [];
  const re = /\b(\d{2,4}(?:다|므|그|마|스|카|두|누|도|후|허)\d{2,6})\b/g;
  let m;
  while ((m = re.exec(text))) out.push(m[1]);
  return [...new Set(out)];
}
function refsOf(text) {
  const arts = extractCivilArticles(text);
  const cases = extractCases(text);
  const artNo = arts.find((a) => artMap.has(a)) ?? arts[0] ?? null;
  const caseNo = cases[0] ?? null;
  return {
    choice_type: cases.length > 0 ? "precedent" : /제\d+조/.test(text) ? "statute" : "theory",
    related_article_number: artNo,
    related_article_id: artNo ? (artMap.get(artNo) ?? null) : null,
    related_case_number: caseNo,
    related_case_id: caseNo ? (caseMap.get(caseNo.replace(/\s/g, "")) ?? null) : null,
  };
}
const NEG_RE = /옳지\s*않은|옳지\s*못한|틀린|잘못된|잘못\s*짝|적절하지\s*않은|부적절한|타당하지\s*않은|일치하지\s*않는|부합하지\s*않는|해당하지\s*않는|볼 수 없는|받을 수 없는|아닌 것|없는 것/;
const POS_RE = /옳은|맞는|올바른|적절한|타당한|일치하는|부합하는|해당하는 것/;
function stemPolarity(body) {
  const qIdx = body.indexOf("?");
  const stem = qIdx >= 0 ? body.slice(0, qIdx + 1) : body.slice(0, 120);
  if (NEG_RE.test(stem)) return "negative";
  if (POS_RE.test(stem)) return "positive";
  return null;
}
const COMBO_RE = /^[ㄱ-ㅎ](?:[\s,.·]+[ㄱ-ㅎ])*$/;
const PROP_RE = /(?:다|음|함)[.)]?\s*$/;
function expectedTruth(pol, isCorrect) {
  if (pol === "positive") return isCorrect ? "O" : "X";
  if (pol === "negative") return isCorrect ? "X" : "O";
  return null;
}

/* ── 분류 & 유효 polarity ─────────────────────────────────── */
const CIRC_RE = /^[-*]\s*[①②③④⑤]/m;
const KI_RE = /^[-*]\s*[ㄱㄴㄷㄹㅁㅂ]/m;
const effPol = new Map(); // problem_id → 발문 기준 극성 (도출 실패 시 DB 값)
const polFixes = [];
for (const p of problems) {
  const sp = stemPolarity(p.body_md);
  effPol.set(p.problem_id, sp ?? p.polarity);
  if (sp && sp !== p.polarity) polFixes.push({ problem_id: p.problem_id, tag: `${p.year}#${p.problem_number}`, from: p.polarity, to: sp });
}
const g1 = problems.filter((p) => CIRC_RE.test(p.explanation_md));
const gKi = problems.filter((p) => !CIRC_RE.test(p.explanation_md) && KI_RE.test(p.explanation_md));
const g2 = gKi.filter((p) => (boxByP.get(p.problem_id) ?? []).length > 0);
const g3 = gKi.filter((p) => (boxByP.get(p.problem_id) ?? []).length === 0);
const g1WithBox = g1.filter((p) => (boxByP.get(p.problem_id) ?? []).length > 0);
console.log("S0 polarity 교정:", polFixes.length, "건 —", polFixes.map((f) => `${f.tag} ${f.from}→${f.to}`).join(", "));
console.log("g1(①~⑤):", g1.length, "| g2(mc_box+ㄱ불릿):", g2.length, "| g3(조합 mc_case):", g3.length, "| g1 중 box 보유:", g1WithBox.map((p) => `${p.year}#${p.problem_number}`).join(", "));

const rep = { s1ok: 0, s1miss: [], s1truthNull: [], s2ok: 0, s2miss: [], s2truthMism: [], s3ok: 0, s3miss: [], s4ok: 0, s4skip: [], artUnres: new Set() };
const updChoices = [];
const updBoxItems = [];
const newBoxSets = [];
const updProblems = [];

/* ── S1: 선지 배선 ────────────────────────────────────────── */
for (const p of g1) {
  const pol = effPol.get(p.problem_id);
  const bullets = parseBullets(p.explanation_md).filter((b) => CIRC.includes(b.marker));
  const chs = (choicesByP.get(p.problem_id) ?? []).sort((a, b) => a.choice_index - b.choice_index);
  const tag = `${p.year}#${p.problem_number}`;
  let wired = 0;
  for (const ch of chs) {
    const b = bullets.find((x) => CIRC.indexOf(x.marker) + 1 === ch.choice_index);
    if (!b) { rep.s1miss.push(`${tag} 선지${ch.choice_index}`); continue; }
    const body = (ch.body_md || "").trim();
    const isCombo = COMBO_RE.test(body) || /^\d+개$/.test(body);
    const isProp = PROP_RE.test(body);
    const ineligible = p.format === "mc_case" || isCombo || !isProp;
    let ox = b.truth;
    if (FLAG_TAGS.has(tag)) ox = null;
    else if (isCombo || !isProp) ox = null;
    else if (ox) {
      const exp = expectedTruth(pol, ch.is_correct);
      if (exp && ox !== exp) { rep.s1truthNull.push(`${tag} 선지${ch.choice_index} 불릿=${ox} 기대=${exp}`); ox = null; }
    }
    for (const a of extractCivilArticles(b.text)) if (!artMap.has(a)) rep.artUnres.add(`${tag}:${a}`);
    updChoices.push({ choice_id: ch.choice_id, tag, explanation_md: b.text.replace(/^정답[.,(]?[^.]{0,12}[).]?\s*/, "").trim() || b.text, ...refsOf(b.text), ox_truth: ox, ox_ineligible: ineligible });
    wired++;
  }
  if (wired === chs.length && chs.length > 0) rep.s1ok++;
}

/* ── S2: box_items 배선 (g2 = ㄱ불릿, g1WithBox = 파생 ox 만) ─ */
for (const p of g2) {
  const pol = effPol.get(p.problem_id);
  const bullets = parseBullets(p.explanation_md).filter((b) => KI.includes(b.marker));
  const items = (boxByP.get(p.problem_id) ?? []).sort((a, b) => a.position_index - b.position_index);
  const chs = choicesByP.get(p.problem_id) ?? [];
  const correctBody = chs.find((x) => x.is_correct)?.body_md ?? "";
  const tag = `${p.year}#${p.problem_number}`;
  let wired = 0;
  for (const it of items) {
    const marker = (it.marker || "").replace(/[.\s]/g, "");
    const b = bullets.find((x) => x.marker === marker);
    if (!b) { rep.s2miss.push(`${tag} [${it.marker}]`); continue; }
    // 항목이 서술문(명제)이 아니면 — 발문 조건 충족 여부를 고르는 유형 — OX 부적격.
    const isProp = PROP_RE.test((it.body_md || "").trim());
    let ox = isProp ? b.truth : null;
    const derived = pol && correctBody ? (correctBody.includes(marker) ? (pol === "positive" ? "O" : "X") : (pol === "positive" ? "X" : "O")) : null;
    if (ox && derived && ox !== derived) { rep.s2truthMism.push(`${tag} [${marker}] 불릿=${ox} 파생=${derived}`); ox = null; }
    updBoxItems.push({ box_item_id: it.box_item_id, tag, explanation_md: b.text, ...refsOf(b.text), ox_truth: ox, ox_ineligible: !isProp });
    wired++;
  }
  if (wired === items.length && items.length > 0) rep.s2ok++;
  for (const ch of chs) updChoices.push({ choice_id: ch.choice_id, tag, onlyInelig: true });
}
// g1 중 box 보유 (조합 판정 불릿) — 정답조합 파생 ox 만 기입
for (const p of g1WithBox) {
  const pol = effPol.get(p.problem_id);
  const chs = choicesByP.get(p.problem_id) ?? [];
  const correctBody = chs.find((x) => x.is_correct)?.body_md ?? "";
  const tag = `${p.year}#${p.problem_number}`;
  if (!pol || !correctBody || p.format !== "mc_box") continue;
  // 복수정답 문항은 정답조합이 유일하지 않아 파생 불가 → 스킵.
  if (chs.filter((x) => x.is_correct).length !== 1) continue;
  for (const it of boxByP.get(p.problem_id) ?? []) {
    const marker = (it.marker || "").replace(/[.\s]/g, "");
    if (!PROP_RE.test((it.body_md || "").trim())) { updBoxItems.push({ box_item_id: it.box_item_id, tag, oxOnly: true, ox_truth: null, ineligToo: true }); continue; }
    const inAns = correctBody.includes(marker);
    const ox = pol === "positive" ? (inAns ? "O" : "X") : (inAns ? "X" : "O");
    updBoxItems.push({ box_item_id: it.box_item_id, tag, oxOnly: true, ox_truth: ox });
  }
}

/* ── S3: 조합형 mc_case — 보기 → box_items ────────────────── */
const FIXTURE_2021_31 = [
  "甲은 乙에 대해 1,000만 원의 채무를 부담하고 있는데, 丙이 자신의 채무로 오해하여 乙에게 1,000만 원을 지급한 경우, 제3자 변제에 해당하지 않는다.",
  "甲이 그의 乙에 대한 공사대금채무의 담보로 乙의 유치권이 성립한 그 소유의 건물을 丙에게 매도하면서 소유권이전등기시까지 임대한 경우, 丙은 甲의 의사에 반하여 공사대금채무를 乙에게 변제할 수 없다.",
  "예금주 甲의 대리인이라고 주장하는 乙이 甲의 통장과 인감을 소지하고 丙은행에 예금반환청구를 한 경우, 대리인을 사칭한 乙은 채권의 사실상 귀속자와 같은 외형을 갖추고 있지 아니하여 채권의 준점유자로 볼 수 없다.",
  "지시채권 증서 소지인 甲에 대한 乙의 변제는 乙이 甲의 권리 없음을 알았거나 중과실이 있는 경우를 제외하고 유효하다.",
];
for (const p of g3) {
  const tag = `${p.year}#${p.problem_number}`;
  const bullets = parseBullets(p.explanation_md).filter((b) => KI.includes(b.marker));
  let parts = null;
  let newBody = null;
  const divM = p.body_md.match(/<div class="case-box">\n?([\s\S]*?)\n?<\/div>/);
  if (divM && /^ㄱ\./.test(divM[1].trim())) {
    parts = divM[1].trim().split(/<br>\s*(?=[ㄱㄴㄷㄹㅁㅂ]\.)/).map((s) => s.trim()).filter(Boolean);
    newBody = p.body_md.replace(/\n*<div class="case-box">\n?[\s\S]*?\n?<\/div>/, "").trim();
  } else if (/\nㄱ\.\s/.test(p.body_md)) {
    const idx = p.body_md.search(/\nㄱ\.\s/);
    newBody = p.body_md.slice(0, idx).trim();
    parts = p.body_md.slice(idx).trim().split(/\n(?=[ㄱㄴㄷㄹㅁㅂ]\.)/).map((s) => s.trim()).filter(Boolean);
  } else if (tag === "2021#31") {
    newBody = p.body_md.split("\n")[0].trim();
    parts = FIXTURE_2021_31.map((t, i) => `${KI[i]}. ${t}`);
  }
  if (!parts) { rep.s3miss.push(`${tag} 보기 형태 미해석`); continue; }
  const rows = [];
  let ok = true;
  for (let i = 0; i < parts.length; i++) {
    const mm = parts[i].match(/^([ㄱㄴㄷㄹㅁㅂ])\.\s*([\s\S]+)$/);
    if (!mm) { rep.s3miss.push(`${tag} 항목 파싱 실패: ${parts[i].slice(0, 25)}`); ok = false; break; }
    const b = bullets.find((x) => x.marker === mm[1]);
    if (!b) { rep.s3miss.push(`${tag} [${mm[1]}] 불릿 없음`); ok = false; break; }
    rows.push({ problem_id: p.problem_id, position_index: i, marker: mm[1], body_md: mm[2].replace(/<br>/g, "\n").trim(), explanation_md: b.text, ...refsOf(b.text), ox_truth: b.truth, ox_ineligible: true });
  }
  if (!ok) continue;
  newBoxSets.push({ tag, problem_id: p.problem_id, rows, newBody, oldBody: p.body_md });
  for (const ch of choicesByP.get(p.problem_id) ?? []) updChoices.push({ choice_id: ch.choice_id, tag, onlyInelig: true });
  rep.s3ok++;
}

/* ── S4: 종합해설 축약 ────────────────────────────────────── */
for (const p of problems) {
  const md = p.explanation_md ?? "";
  const tag = `${p.year}#${p.problem_number}`;
  const ans = md.match(/^\*\*정답[^\n]*\*\*/);
  const concl = md.match(/\*\*①\s*결론\*\*\s*([\s\S]*?)(?=\n\*\*[②③④]|\s*$)/);
  const trailer = md.match(/^\*(?:판례·조문|관련 조문·판례|관련 판례|관련 조문|조문·판례)\s*:[^\n]*\*\s*$/m);
  if (!ans || !concl) { rep.s4skip.push(tag); continue; }
  const conclText = concl[1].trim().replace(/^정답\s*[①②③④⑤][^—.]*[—.]\s*/, "");
  let next = ans[0] + "\n\n" + conclText;
  if (trailer) next += "\n\n" + trailer[0].trim();
  updProblems.push({ problem_id: p.problem_id, tag, next });
  rep.s4ok++;
}

/* ── 리포트 ───────────────────────────────────────────────── */
console.log("\n=== 리포트 ===");
console.log("S1 완전:", rep.s1ok, "/", g1.length, "| 누락:", rep.s1miss.length, "| ox null 처리(판정 상충):", rep.s1truthNull.length);
for (const s of rep.s1truthNull) console.log("  ox-null:", s);
console.log("S2 완전:", rep.s2ok, "/", g2.length, "| 누락:", rep.s2miss.length, "| 불릿≠파생:", rep.s2truthMism.length, rep.s2truthMism.join(" | "));
console.log("S3 성공:", rep.s3ok, "/", g3.length, "| 실패:", rep.s3miss.length, rep.s3miss.join(" | "));
console.log("S4 축약:", rep.s4ok, "| 스킵:", rep.s4skip.join(", ") || "(없음)");
console.log("미해석 조문:", [...rep.artUnres].slice(0, 15).join(", ") || "(없음)");
const wireCnt = updChoices.filter((u) => !u.onlyInelig).length;
console.log("선지 배선:", wireCnt, "| ineligible만:", updChoices.length - wireCnt, "| box 배선:", updBoxItems.filter((u) => !u.oxOnly).length, "| box ox만:", updBoxItems.filter((u) => u.oxOnly).length, "| box 신설 문항:", newBoxSets.length, "(", newBoxSets.reduce((a, s) => a + s.rows.length, 0), "행 ) | 종합 축약:", updProblems.length, "| polarity fix:", polFixes.length);
// 통계: ox_truth 부여 선지 수
const oxCnt = updChoices.filter((u) => !u.onlyInelig && u.ox_truth).length;
const artCnt = updChoices.filter((u) => !u.onlyInelig && u.related_article_id).length;
const caseCnt = updChoices.filter((u) => !u.onlyInelig && u.related_case_number).length;
console.log("선지 ox_truth:", oxCnt, "| 조문 연결:", artCnt, "| 판례 표기:", caseCnt);
writeFileSync(DIR + "/plan2.json", JSON.stringify({ polFixes, updChoices, updBoxItems, newBoxSets, updProblems }, null, 0));

if (!APPLY) { console.log("\n(dry-run — --apply 로 반영)"); process.exit(0); }

/* ── 적용 ─────────────────────────────────────────────────── */
let err = 0;
for (const f of polFixes) {
  const { error } = await c.from("problems").update({ polarity: f.to }).eq("problem_id", f.problem_id);
  if (error) { console.log("pol ERR", f.tag, error.message); err++; }
}
for (const u of updChoices) {
  const patch = u.onlyInelig
    ? { ox_ineligible: true }
    : { explanation_md: u.explanation_md, choice_type: u.choice_type, related_article_number: u.related_article_number, related_article_id: u.related_article_id, related_case_number: u.related_case_number, related_case_id: u.related_case_id, ox_truth: u.ox_truth, ox_ineligible: u.ox_ineligible };
  const { error } = await c.from("problem_choices").update(patch).eq("choice_id", u.choice_id);
  if (error) { console.log("ch ERR", u.tag, error.message); err++; }
}
for (const u of updBoxItems) {
  const patch = u.oxOnly
    ? (u.ineligToo ? { ox_truth: null, ox_ineligible: true } : { ox_truth: u.ox_truth })
    : { explanation_md: u.explanation_md, choice_type: u.choice_type, related_article_number: u.related_article_number, related_article_id: u.related_article_id, related_case_number: u.related_case_number, related_case_id: u.related_case_id, ox_truth: u.ox_truth, ox_ineligible: u.ox_ineligible };
  const { error } = await c.from("problem_box_items").update(patch).eq("box_item_id", u.box_item_id);
  if (error) { console.log("box ERR", u.tag, error.message); err++; }
}
for (const nb of newBoxSets) {
  const { error: e1 } = await c.from("problem_box_items").insert(nb.rows);
  if (e1) { console.log("newbox ERR", nb.tag, e1.message); err++; continue; }
  const { error: e2 } = await c.from("problems").update({ body_md: nb.newBody }).eq("problem_id", nb.problem_id);
  if (e2) { console.log("body ERR", nb.tag, e2.message); err++; }
}
for (const u of updProblems) {
  const { error } = await c.from("problems").update({ explanation_md: u.next }).eq("problem_id", u.problem_id);
  if (error) { console.log("exp ERR", u.tag, error.message); err++; }
}
// S5: 재검토 플래그
for (const p of problems) {
  const tag = `${p.year}#${p.problem_number}`;
  if (!FLAG_TAGS.has(tag) || p.mismatch_flagged_at) continue;
  const { error } = await c.from("problems").update({ mismatch_flagged_at: new Date().toISOString(), mismatch_flagged_by: ADMIN }).eq("problem_id", p.problem_id);
  if (error) { console.log("flag ERR", tag, error.message); err++; }
  else console.log("재검토 플래그:", tag);
}
console.log("\n적용 완료 — 오류:", err);
