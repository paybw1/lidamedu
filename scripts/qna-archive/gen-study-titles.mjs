// feat-9-010 추가분(2026-07-09) — 공부방법 Q&A 제목 재생성.
// 원본 제목이 "임병웅 변리사님께 질문드립니다"(66회) 같은 인사말이라 검색·목록에서 무의미.
// 질문·답변 내용을 읽고 요지를 담은 명사구 제목으로 재작성해 source/_converted/qna-archive.json 에 in-place 반영.
// 멱등: sha1(질문+답변) 캐시(tmp/study-title-cache.json) — 재실행 시 AI 재호출 없이 재사용.
// 실행 순서: parse-qna-archive → (이 스크립트) → enrich-qna-archive → seed-qna-threads.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import dotenv from "dotenv";
dotenv.config();

const APPLY = process.argv.includes("--apply");
const ROOT = resolve(import.meta.dirname, "../..");
const JSON_PATH = resolve(ROOT, "source/_converted/qna-archive.json");
const CACHE_PATH = resolve(ROOT, "tmp/study-title-cache.json");
const AKEY = process.env.ANTHROPIC_API_KEY;
if (!AKEY) { console.error("ANTHROPIC_API_KEY 없음"); process.exit(1); }

const SOURCE_FILE = "판례 공부법.xlsx";
const sha1 = (s) => createHash("sha1").update(s).digest("hex");

const doc = JSON.parse(readFileSync(JSON_PATH, "utf8"));
const targets = doc.entries.filter(
  (e) => e.sourceFile === SOURCE_FILE && e.category === "공부방법" && e.answer,
);
console.log(`공부방법 제목 재생성 대상 ${targets.length}건`);

const cache = existsSync(CACHE_PATH) ? JSON.parse(readFileSync(CACHE_PATH, "utf8")) : {};

async function genTitle(e) {
  const prompt = `다음은 변리사 시험 수험생이 강사에게 보낸 공부방법·수험전략 상담 문답이다. 이 문답의 핵심 주제를 담은 간결한 한국어 제목을 지어라.

규칙:
- 명사구 형태, 25자 이내. 인사말·호칭("임병웅 변리사님께" 등)·"질문드립니다" 같은 상투구는 절대 포함하지 말 것.
- 무엇에 관한 상담인지 한눈에 드러나게(예: "1·2차 병행 학습 로드맵", "특허법 단권화 교재 선택", "객관식 풀이 시간 단축법", "판례집 회독 방법").
- 제목만 한 줄로 출력. 따옴표·마침표 없이.

[원제목] ${e.title ?? ""}
[질문] ${(e.question ?? "").slice(0, 1100)}
[답변] ${(e.answer ?? "").slice(0, 500)}`;
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": AKEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 60,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!resp.ok) throw new Error(`Anthropic ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const json = await resp.json();
  let t = (json.content?.[0]?.text ?? "").trim();
  // 방어: 따옴표·마침표·개행 정리, 40자 클램프.
  t = t.replace(/^["'`]|["'`.]+$/g, "").replace(/\s*\n[\s\S]*$/, "").trim();
  return t.slice(0, 40);
}

let hit = 0, gen = 0, failed = 0;
const samples = [];
for (let i = 0; i < targets.length; i += 6) {
  const batch = targets.slice(i, i + 6);
  await Promise.all(
    batch.map(async (e) => {
      const key = sha1(`${e.question}|${e.answer}`);
      if (cache[key]) { hit++; return; }
      try {
        const title = await genTitle(e);
        if (title) { cache[key] = title; gen++; if (samples.length < 12) samples.push([e.title, title]); }
        else failed++;
      } catch (err) { console.error("  실패:", err.message); failed++; }
    }),
  );
  if ((i + 6) % 60 < 6) console.log(`  ${Math.min(i + 6, targets.length)}/${targets.length}`);
}
console.log(`생성 ${gen} / 캐시 ${hit} / 실패 ${failed}`);

// 캐시 저장(항상) + 샘플 출력.
writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 1));
console.log("\n재생성 샘플(원제목 → 새제목):");
for (const [o, n] of samples) console.log(`  「${(o ?? "").slice(0, 30)}」 → 「${n}」`);

if (!APPLY) {
  console.log("\n[dry-run] JSON 미반영. --apply 로 qna-archive.json 에 제목 반영.");
  process.exit(0);
}

// qna-archive.json 에 in-place 반영.
let applied = 0;
for (const e of doc.entries) {
  if (e.sourceFile !== SOURCE_FILE || e.category !== "공부방법" || !e.answer) continue;
  const key = sha1(`${e.question}|${e.answer}`);
  if (cache[key]) { e.title = cache[key]; applied++; }
}
writeFileSync(JSON_PATH, JSON.stringify(doc, null, 1));
console.log(`\n제목 반영 ${applied}건 → ${JSON_PATH}`);
