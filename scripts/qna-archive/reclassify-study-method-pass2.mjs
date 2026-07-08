// 공부방법 폴백 재분류 2차 패스 — 1차(haiku)에서 미해결/공부방법으로 남은 잔여분을
// 유효 조문번호 목록을 프롬프트에 포함해(환각 차단) sonnet 으로 재판정.
// dry-run 기본, --apply. 결과 tmp/reclassify-study-method-pass2-result.json (apply-reclassify-result.mjs 로 반영 가능).
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const APPLY = process.argv.includes("--apply");
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const AKEY = process.env.ANTHROPIC_API_KEY;
if (!AKEY) { console.error("ANTHROPIC_API_KEY 없음"); process.exit(1); }

const LAW_NAME = { patent: "특허법", trademark: "상표법", design: "디자인보호법" };

const { data: laws } = await sb.from("laws").select("law_id, law_code").in("law_code", Object.keys(LAW_NAME));
const articleMap = {};
const articleTitles = {};
for (const l of laws) {
  const map = new Map();
  const titles = [];
  let from = 0;
  for (;;) {
    const { data, error } = await sb
      .from("articles")
      .select("article_id, article_number, display_label")
      .eq("law_id", l.law_id)
      .eq("level", "article")
      .is("deleted_at", null)
      .order("path", { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    for (const a of data) {
      map.set(a.article_number, a.article_id);
      titles.push(`${a.article_number}(${(a.display_label ?? "").replace(/^제\d+조(의\d+)?\s*/, "").slice(0, 24)})`);
    }
    if (!data || data.length < 1000) break;
    from += 1000;
  }
  articleMap[l.law_code] = map;
  articleTitles[l.law_code] = titles.join(", ");
}
console.log("조문 맵:", Object.entries(articleMap).map(([k, m]) => `${k}=${m.size}`).join(" "));

const { data: threads, error } = await sb
  .from("qna_threads")
  .select("thread_id, display_no, subject, title, question_md, answer_md")
  .eq("archive_source", "cafe-archive")
  .eq("target_type", "study_method")
  .is("deleted_at", null);
if (error) throw error;
console.log("2차 재분류 대상:", threads.length);

async function classify(t) {
  const lawName = LAW_NAME[t.subject] ?? t.subject;
  const prompt = `다음은 변리사 시험 ${lawName} 수험생 질문과 강사 답변이다. 이 문답이 다루는 핵심 조문 하나를 특정하라.

현행 ${lawName} 조문 목록 (번호(제목)):
${articleTitles[t.subject] ?? ""}

규칙:
- 반드시 위 목록에 있는 번호만 답할 수 있다.
- 특정 조문 실체 질문이면 마지막 줄에 "결론: <번호>" (예: 결론: 33 / 결론: 133의2)
- 공부 방법·수험 전략·교재/강의/학원 운영에 관한 질문이면 "결론: 공부방법"
- 실체 질문이지만 위 목록의 어느 조문으로도 특정하기 어려우면 "결론: 불명"

[제목] ${t.title}
[질문] ${t.question_md.slice(0, 900)}
[답변] ${(t.answer_md ?? "").slice(0, 600)}

한두 문장으로 판단 근거를 쓰고, 마지막 줄에 결론을 출력하라.`;
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": AKEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!resp.ok) throw new Error(`Anthropic ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const json = await resp.json();
  const text = (json.content?.[0]?.text ?? "").trim();
  const m = /결론\s*:\s*(.+)\s*$/m.exec(text);
  const verdict = (m?.[1] ?? "").trim();
  if (/공부방법/.test(verdict)) return { kind: "study" };
  if (/불명/.test(verdict)) return { kind: "unknown" };
  const n = /^제?(\d{1,3})(?:조)?(?:의(\d{1,2}))?/.exec(verdict);
  if (n) return { kind: "article", no: n[2] ? `${n[1]}의${n[2]}` : n[1] };
  return { kind: "unknown", raw: verdict };
}

const results = [];
let done = 0;
for (let i = 0; i < threads.length; i += 5) {
  const batch = threads.slice(i, i + 5);
  const labels = await Promise.all(
    batch.map((t) => classify(t).catch((e) => { console.error(`Q-${t.display_no}`, e.message); return null; })),
  );
  batch.forEach((t, j) => results.push({ t, label: labels[j] }));
  done += batch.length;
  if (done % 50 < 5) console.log(`  ${done}/${threads.length}`);
}

const dist = { article: 0, study: 0, unknown: 0, noMatch: 0, failed: 0 };
const updates = [];
const unresolved = [];
for (const { t, label } of results) {
  if (label === null) { dist.failed++; continue; }
  if (label.kind === "article") {
    const id = articleMap[t.subject]?.get(label.no);
    if (id) {
      dist.article++;
      updates.push({ thread_id: t.thread_id, display_no: t.display_no, subject: t.subject, no: label.no, article_id: id, title: t.title });
    } else {
      dist.noMatch++;
      unresolved.push({ displayNo: t.display_no, subject: t.subject, no: label.no, title: t.title });
    }
  } else if (label.kind === "study") dist.study++;
  else { dist.unknown++; unresolved.push({ displayNo: t.display_no, subject: t.subject, no: null, title: t.title }); }
}
console.log("분류 분포:", JSON.stringify(dist));
writeFileSync("tmp/reclassify-study-method-pass2-result.json", JSON.stringify({ updates, unresolved }, null, 1));
console.log(`조문 앵커 전환 대상 ${updates.length}건 / 공부방법 잔류 ${dist.study}건 / 미해결 ${dist.unknown + dist.noMatch}건`);

if (!APPLY) { console.log("--apply(또는 apply-reclassify-result.mjs) 로 반영"); process.exit(0); }
let applied = 0;
for (const u of updates) {
  const { error: upErr } = await sb
    .from("qna_threads")
    .update({ target_type: "article", target_id: u.article_id, updated_at: new Date().toISOString() })
    .eq("thread_id", u.thread_id);
  if (upErr) throw upErr;
  applied++;
}
console.log("반영 완료:", applied);
