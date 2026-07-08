// 공부방법(study_method) 폴백 아카이브 질문 재분류 (원장 지시 2026-07-08).
// ETL 때 조문/판례/문제 번호 추출에 실패해 공부방법으로 수렴한 실체 질문을
// AI(haiku)가 읽고 핵심 조문 하나로 앵커. 진짜 공부방법·수험전략 질문만 남긴다.
// dry-run 기본, --apply. 결과는 tmp/reclassify-study-method-result.json 에 보존.
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const APPLY = process.argv.includes("--apply");
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const AKEY = process.env.ANTHROPIC_API_KEY;
if (!AKEY) { console.error("ANTHROPIC_API_KEY 없음"); process.exit(1); }

const LAW_NAME = { patent: "특허법", trademark: "상표법", design: "디자인보호법" };

// 과목별 조문번호 → article_id 맵 (level=article)
const { data: laws } = await sb.from("laws").select("law_id, law_code").in("law_code", Object.keys(LAW_NAME));
const articleMap = {};
for (const l of laws) {
  const map = new Map();
  let from = 0;
  for (;;) {
    const { data, error } = await sb
      .from("articles")
      .select("article_id, article_number")
      .eq("law_id", l.law_id)
      .eq("level", "article")
      .range(from, from + 999);
    if (error) throw error;
    for (const a of data) map.set(a.article_number, a.article_id);
    if (!data || data.length < 1000) break;
    from += 1000;
  }
  articleMap[l.law_code] = map;
}
console.log("조문 맵:", Object.entries(articleMap).map(([k, m]) => `${k}=${m.size}`).join(" "));

const { data: threads, error } = await sb
  .from("qna_threads")
  .select("thread_id, display_no, subject, title, question_md, answer_md")
  .eq("archive_source", "cafe-archive")
  .eq("target_type", "study_method")
  .is("deleted_at", null);
if (error) throw error;
console.log("재분류 대상:", threads.length);

async function classify(t) {
  const lawName = LAW_NAME[t.subject] ?? t.subject;
  const prompt = `다음은 변리사 시험 ${lawName} 수험생 질문과 강사 답변이다. 이 문답이 다루는 핵심을 분류하라.

규칙:
- 특정 조문(${lawName} 조문 하나)에 관한 실체 질문이면 그 조문 번호만 출력. 형식: "33" 또는 "133의2" (숫자와 '의N'만, '제'·'조' 없이). 여러 조문이 걸치면 가장 핵심인 하나만.
- 공부 방법·수험 전략·교재/강의·시험 운영에 관한 질문이면: 공부방법
- ${lawName} 실체 질문이지만 어느 조문인지 특정하기 어려우면: 불명

[제목] ${t.title}
[질문] ${t.question_md.slice(0, 900)}
[답변] ${(t.answer_md ?? "").slice(0, 600)}

답은 분류 결과만 한 줄로 출력하라.`;
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": AKEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 16,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!resp.ok) throw new Error(`Anthropic ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const json = await resp.json();
  const text = (json.content?.[0]?.text ?? "").trim();
  if (/공부방법/.test(text)) return { kind: "study" };
  if (/불명/.test(text)) return { kind: "unknown" };
  const m = /^(\d{1,3})(?:의(\d{1,2}))?/.exec(text.replace(/^제/, ""));
  if (m) return { kind: "article", no: m[2] ? `${m[1]}의${m[2]}` : m[1] };
  return { kind: "unknown", raw: text };
}

const results = [];
let done = 0;
for (let i = 0; i < threads.length; i += 6) {
  const batch = threads.slice(i, i + 6);
  const labels = await Promise.all(
    batch.map((t) => classify(t).catch((e) => { console.error(`Q-${t.display_no}`, e.message); return null; })),
  );
  batch.forEach((t, j) => results.push({ t, label: labels[j] }));
  done += batch.length;
  if (done % 60 < 6) console.log(`  ${done}/${threads.length}`);
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
writeFileSync("tmp/reclassify-study-method-result.json", JSON.stringify({ updates, unresolved }, null, 1));
console.log("결과 저장: tmp/reclassify-study-method-result.json");
console.log(`조문 앵커 전환 대상 ${updates.length}건 / 공부방법 잔류 ${dist.study}건 / 미해결 ${dist.unknown + dist.noMatch}건`);

if (!APPLY) { console.log("--apply 로 반영"); process.exit(0); }
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
