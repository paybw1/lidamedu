// 빈칸의 before_context / after_context 가 비어있는(empty 또는 null) 케이스를 대상으로
// body_json 안의 인라인 토큰을 walk 해서 정답 위치를 찾고, 그 토큰 내부 ±12자 컨텍스트로 재추출.
// exact-token-match (token.text === answer) 가 있으면 우선, 없으면 첫 substring 매칭 사용.
//
// 사용법:
//   node scripts/refresh-blank-contexts.mjs                          — dry-run (변경 요약만)
//   node scripts/refresh-blank-contexts.mjs --apply                  — 실제 UPDATE
//   --law=patent --version=v1                                        — 필터 (기본 patent v1)
//
// 다른 컬럼은 수정하지 않음. before/after 가 둘 다 비어있는 빈칸만 대상.

import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const argMap = new Map();
for (const arg of process.argv.slice(2)) {
  const m = arg.match(/^--([^=]+)(?:=(.+))?$/);
  if (m) argMap.set(m[1], m[2] ?? true);
}
const APPLY = argMap.has("apply");
const LAW_CODE = argMap.get("law") ?? "patent";
const VERSION = argMap.get("version") ?? "v1";

console.log(`mode=${APPLY ? "APPLY" : "DRY-RUN"}`);
console.log(`law=${LAW_CODE} version=${VERSION}`);
console.log("");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정");
  process.exit(1);
}
const supa = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// body_json 의 text/underline/subtitle 토큰들을 walk 하면서 answer 가 등장하는 위치 탐색.
// 우선순위: token.text.trim() === answer.trim() (exact) → 첫 substring 매칭.
function findAnswerInTokens(bodyJson, answer) {
  if (!bodyJson || typeof bodyJson !== "object") return null;
  if (!Array.isArray(bodyJson.blocks)) return null;
  const trimmedAnswer = answer.trim();
  let exactMatch = null;
  let firstMatch = null;
  const walk = (blocks) => {
    for (const block of blocks) {
      if (exactMatch) return;
      if (!block || typeof block !== "object") continue;
      const inline = Array.isArray(block.inline) ? block.inline : [];
      for (const t of inline) {
        if (exactMatch) return;
        if (!t || typeof t !== "object") continue;
        if (
          (t.type === "text" || t.type === "underline" || t.type === "subtitle") &&
          typeof t.text === "string"
        ) {
          const text = t.text;
          const pos = text.indexOf(answer);
          if (pos !== -1) {
            const match = { tokenText: text, position: pos };
            if (text.trim() === trimmedAnswer) {
              exactMatch = match;
              return;
            }
            if (!firstMatch) firstMatch = match;
          }
        }
      }
      if (Array.isArray(block.children)) walk(block.children);
      if (block.kind === "sub_article_group") {
        if (Array.isArray(block.preface)) walk(block.preface);
        if (Array.isArray(block.articles)) {
          for (const sub of block.articles) {
            if (exactMatch) return;
            if (!sub || typeof sub !== "object") continue;
            if (Array.isArray(sub.blocks)) walk(sub.blocks);
          }
        }
      }
    }
  };
  walk(bodyJson.blocks);
  return exactMatch ?? firstMatch;
}

function deriveContexts(tokenText, position, answerLen) {
  const before = tokenText.slice(Math.max(0, position - 12), position);
  const after = tokenText.slice(
    position + answerLen,
    Math.min(tokenText.length, position + answerLen + 12),
  );
  return { before, after };
}

async function main() {
  // 1. law_id
  const { data: law } = await supa
    .from("laws")
    .select("law_id")
    .eq("law_code", LAW_CODE)
    .single();
  if (!law) {
    console.error(`law_code='${LAW_CODE}' 없음`);
    process.exit(1);
  }

  // 2. 모든 set + body_json fetch
  const { data: arts } = await supa
    .from("articles")
    .select("article_id, article_number, current_revision_id")
    .eq("law_id", law.law_id)
    .is("deleted_at", null);

  const revIds = (arts ?? []).map((a) => a.current_revision_id).filter(Boolean);
  const { data: revs } = await supa
    .from("article_revisions")
    .select("revision_id, body_json")
    .in("revision_id", revIds);
  const revById = new Map((revs ?? []).map((r) => [r.revision_id, r.body_json]));
  const artById = new Map((arts ?? []).map((a) => [a.article_id, a]));

  const { data: sets } = await supa
    .from("article_blank_sets")
    .select("set_id, article_id, blanks")
    .eq("version", VERSION)
    .in("article_id", (arts ?? []).map((a) => a.article_id));

  console.log(`set ${sets?.length ?? 0}개 검사`);

  let totalChanged = 0;
  let totalSetsTouched = 0;
  let articlesNoBody = 0;
  let blanksUnresolved = 0;
  const samples = [];

  for (const set of sets ?? []) {
    const art = artById.get(set.article_id);
    if (!art) continue;
    const body = art.current_revision_id ? revById.get(art.current_revision_id) : null;
    if (!body) {
      articlesNoBody++;
      continue;
    }
    const blanks = Array.isArray(set.blanks) ? set.blanks : [];
    let changed = false;
    const newBlanks = blanks.map((b) => {
      if (!b || typeof b !== "object") return b;
      const answer = typeof b.answer === "string" ? b.answer : "";
      const before = typeof b.before_context === "string" ? b.before_context : "";
      const after = typeof b.after_context === "string" ? b.after_context : "";
      // 대상: answer 있고 둘 다 비어있는 경우만
      if (!answer.trim() || before !== "" || after !== "") return b;
      const found = findAnswerInTokens(body, answer);
      if (!found) {
        blanksUnresolved++;
        return b;
      }
      const { before: newBefore, after: newAfter } = deriveContexts(
        found.tokenText,
        found.position,
        answer.length,
      );
      if (newBefore === "" && newAfter === "") {
        // exact-token-match: contexts 비어있는 게 정답 (Tier 4 strict 가 처리)
        return b;
      }
      changed = true;
      totalChanged++;
      if (samples.length < 12) {
        samples.push({
          art: art.article_number,
          idx: b.idx,
          answer,
          newBefore,
          newAfter,
        });
      }
      return {
        ...b,
        before_context: newBefore,
        after_context: newAfter,
      };
    });
    if (changed) {
      totalSetsTouched++;
      if (APPLY) {
        const { error } = await supa
          .from("article_blank_sets")
          .update({ blanks: newBlanks })
          .eq("set_id", set.set_id);
        if (error) console.error(`! 제${art.article_number}조 UPDATE 실패: ${error.message}`);
      }
    }
  }

  console.log("");
  console.log("=== 결과 ===");
  console.log(`  컨텍스트 갱신된 빈칸: ${totalChanged}개`);
  console.log(`  영향 set: ${totalSetsTouched}개`);
  console.log(`  body_json 부재 article: ${articlesNoBody}개`);
  console.log(`  body_json 에서 답을 못 찾은 빈칸 (skip): ${blanksUnresolved}개`);
  if (!APPLY) console.log("  (--apply 없음 — 미적용)");
  if (samples.length > 0) {
    console.log("");
    console.log("샘플:");
    for (const s of samples) {
      console.log(`  제${s.art}조 #${s.idx} "${s.answer}" → before="${s.newBefore}" after="${s.newAfter}"`);
    }
  }
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
