// 특허 제29조 아카이브 질문의 주제 재분류 (AI) — 키워드 분류 오배정 정정 (원장 지시 2026-07-08).
// 산업상 이용가능성/신규성/진보성/확대된 선출원/일반(어느 것도 아님) 5택.
// 일반 → node_id NULL(조문 패널만). dry-run 기본, --apply.
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const APPLY = process.argv.includes("--apply");
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const AKEY = process.env.ANTHROPIC_API_KEY;
if (!AKEY) { console.error("ANTHROPIC_API_KEY 없음"); process.exit(1); }

const A29 = "79650d86-5300-4f6e-8ca9-6afdd9a9ba9c"; // 특허법 제29조 — 아래에서 검증
// 제29조 article_id 확정
const { data: art } = await sb
  .from("articles")
  .select("article_id")
  .eq("law_id", "c19c719c-3631-475c-8353-f5a2b7514714")
  .eq("article_number", "29")
  .eq("level", "article")
  .single();
const articleId = art.article_id;

const { data: nodes } = await sb
  .from("systematic_nodes")
  .select("node_id, display_label")
  .eq("law_code", "patent");
const NODE = {};
for (const n of nodes) {
  if (n.display_label === "산업상 이용가능성") NODE["산업상 이용가능성"] = n.node_id;
  if (n.display_label === "신규성") NODE["신규성"] = n.node_id;
  if (n.display_label === "진보성") NODE["진보성"] = n.node_id;
  if (n.display_label === "확대된 선출원") NODE["확대된 선출원"] = n.node_id;
}
if (Object.keys(NODE).length !== 4) throw new Error("주제 노드 4개 확인 실패");

const { data: threads } = await sb
  .from("qna_threads")
  .select("thread_id, title, question_md, answer_md, node_id")
  .eq("archive_source", "cafe-archive")
  .eq("target_type", "article")
  .eq("target_id", articleId)
  .is("deleted_at", null);
console.log("제29조 아카이브 질문:", threads.length);

async function classify(t) {
  const prompt = `다음은 특허법 제29조(특허요건)에 대한 수험생 질문과 강사 답변이다. 이 문답의 "핵심 주제"를 다음 다섯 가지 중 정확히 하나로 분류하라:

1. 산업상 이용가능성 (제29조 제1항 본문 — 의료행위, 산업상 이용 요건)
2. 신규성 (제29조 제1항 각호 — 공지·공연실시·간행물 게재, 동일성 판단)
3. 진보성 (제29조 제2항 — 용이 발명, 사후적 고찰, 결합발명)
4. 확대된 선출원 (제29조 제3항·제4항 — 타출원 명세서 기재, 발명자 동일 예외)
5. 일반 (제29조 전반 또는 위 어느 하나로 특정하기 어려움)

[제목] ${t.title}
[질문] ${t.question_md.slice(0, 800)}
[답변] ${(t.answer_md ?? "").slice(0, 500)}

답은 분류명만 정확히 출력하라 (예: 진보성).`;
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
  for (const k of ["산업상 이용가능성", "확대된 선출원", "진보성", "신규성"]) if (text.includes(k)) return k;
  return "일반";
}

const results = [];
let done = 0;
// 6개 동시
for (let i = 0; i < threads.length; i += 6) {
  const batch = threads.slice(i, i + 6);
  const labels = await Promise.all(batch.map((t) => classify(t).catch((e) => { console.error(t.thread_id.slice(0, 8), e.message); return null; })));
  batch.forEach((t, j) => results.push({ t, label: labels[j] }));
  done += batch.length;
  if (done % 30 < 6) console.log(`  ${done}/${threads.length}`);
}

const dist = {};
const updates = [];
for (const { t, label } of results) {
  if (label === null) continue;
  dist[label] = (dist[label] || 0) + 1;
  const target = label === "일반" ? null : NODE[label];
  if ((t.node_id ?? null) !== (target ?? null)) updates.push({ thread_id: t.thread_id, node_id: target });
}
console.log("분류 분포:", JSON.stringify(dist));
console.log("변경 대상:", updates.length);

if (!APPLY) { console.log("--apply 로 반영"); process.exit(0); }
for (const u of updates) {
  const { error } = await sb.from("qna_threads").update({ node_id: u.node_id }).eq("thread_id", u.thread_id);
  if (error) throw error;
}
console.log("반영 완료:", updates.length);
