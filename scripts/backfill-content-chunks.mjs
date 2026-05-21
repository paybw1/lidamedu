// feat-9-001 — content_chunks 전체 백필.
//
// 사용:
//   node scripts/backfill-content-chunks.mjs            # dry-run (보고만)
//   node scripts/backfill-content-chunks.mjs --apply    # upsert 실행
//   node scripts/backfill-content-chunks.mjs --apply --source article  # 단일 종류만
//   node scripts/backfill-content-chunks.mjs --apply --limit 50        # 처음 50개만 (테스트)
//
// 임베딩은 채우지 않는다 (embedded_at=null). 이후 /api/cron/embed-chunks 가 Voyage 호출.
//
// ⚠️ chunker 로직은 app/features/ai-qna/lib/chunker.ts 와 **반드시 동일**.
//     해당 파일이 바뀌면 이 스크립트도 동기화. content_hash 알고리즘이 다르면
//     모든 청크가 매번 dirty 가 되어 임베딩 비용이 폭증한다.

import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import "dotenv/config";

// ---- 옵션 ----
const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const sourceIdx = args.indexOf("--source");
const SOURCE = sourceIdx >= 0 ? args[sourceIdx + 1] : "all"; // all|article|case|problem
const limitIdx = args.indexOf("--limit");
const LIMIT_PER_SOURCE =
  limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : null;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("[backfill-chunks] env (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY) 미설정");
  process.exit(1);
}
const supa = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// ---- chunker 로직 (chunker.ts 와 동일 알고리즘) ----

function normalizeBody(s) {
  return s
    .replace(/<\/?u>/g, "") // case 본문 underline 마커는 임베딩 노이즈로 제거
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sha256Hex(s) {
  return crypto.createHash("sha256").update(s, "utf-8").digest("hex");
}

function estimateTokens(text) {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  let count = 0;
  for (const ch of trimmed) {
    if (ch >= "가" && ch <= "힯") count += 1.4;
    else if (/\s/.test(ch)) count += 0.0;
    else count += 0.4;
  }
  count += trimmed.split(/\s+/).length * 0.2;
  return Math.max(1, Math.round(count));
}

function makeChunk(sourceType, sourceId, chunkIndex, lawCode, headingPath, rawBody) {
  const body = normalizeBody(rawBody);
  return {
    source_type: sourceType,
    source_id: sourceId,
    chunk_index: chunkIndex,
    law_code: lawCode,
    heading_path: headingPath,
    body_text: body,
    token_count: estimateTokens(body),
    content_hash: sha256Hex(body),
    embedded_at: null,
  };
}

function chunkArticle(a) {
  if (!a.bodyText || !a.bodyText.trim()) return [];
  return [
    makeChunk(
      "article",
      a.articleId,
      0,
      a.lawCode,
      a.displayLabel,
      `${a.displayLabel}\n\n${a.bodyText}`,
    ),
  ];
}

function chunkCase(c) {
  const out = [];
  const sections = [
    { label: "요지", body: c.summaryBodyMd },
    { label: "이유", body: c.reasoningMd },
    { label: "평석", body: c.commentBodyMd },
  ];
  for (const sec of sections) {
    if (!sec.body || !sec.body.trim()) continue;
    const heading = c.summaryTitle
      ? `${c.headingPath} · ${c.summaryTitle} · ${sec.label}`
      : `${c.headingPath} · ${sec.label}`;
    out.push(
      makeChunk("case", c.caseId, out.length, c.lawCode, heading, `${heading}\n\n${sec.body}`),
    );
  }
  return out;
}

function chunkProblem(p) {
  const parts = [p.headingPath, "", p.bodyMd];
  if (p.choices.length > 0) {
    parts.push("", "[보기]");
    for (const c of p.choices) {
      const ox = c.oxTruth ? ` (${c.oxTruth})` : "";
      parts.push(`${c.label}. ${c.bodyMd}${ox}`);
    }
  }
  if (p.boxItems.length > 0) {
    parts.push("", "[항목]");
    for (const b of p.boxItems) {
      const ox = b.oxTruth ? ` (${b.oxTruth})` : "";
      parts.push(`${b.label}. ${b.bodyMd}${ox}`);
    }
  }
  if (p.explanationMd) parts.push("", "[해설]", p.explanationMd);
  if (p.modelAnswerMd) parts.push("", "[모범답안]", p.modelAnswerMd);
  if (p.gradingRubricMd) parts.push("", "[채점기준]", p.gradingRubricMd);
  const body = parts.join("\n");
  if (!body.trim()) return [];
  return [
    makeChunk("problem", p.problemId, 0, p.lawCode, p.headingPath, body),
  ];
}

// ---- upsert with hash skip ----

async function upsertChunksWithSkip(chunks) {
  if (chunks.length === 0)
    return { inserted: 0, updatedDirty: 0, unchanged: 0 };

  const sourceIds = [...new Set(chunks.map((c) => c.source_id))];
  // 큰 IN 절은 1000 한도. sourceIds 가 그 이상이면 분할.
  const existingKey = new Map();
  for (let i = 0; i < sourceIds.length; i += 800) {
    const slice = sourceIds.slice(i, i + 800);
    const { data: existing, error } = await supa
      .from("content_chunks")
      .select("source_type, source_id, chunk_index, content_hash")
      .in("source_id", slice);
    if (error) throw error;
    for (const r of existing ?? []) {
      existingKey.set(`${r.source_type}|${r.source_id}|${r.chunk_index}`, r.content_hash);
    }
  }

  const rows = [];
  let inserted = 0;
  let updatedDirty = 0;
  let unchanged = 0;
  for (const c of chunks) {
    const key = `${c.source_type}|${c.source_id}|${c.chunk_index}`;
    const prev = existingKey.get(key);
    if (prev === c.content_hash) {
      unchanged++;
      continue;
    }
    if (prev === undefined) inserted++;
    else updatedDirty++;
    rows.push(c);
  }

  if (rows.length === 0)
    return { inserted, updatedDirty, unchanged };

  if (!APPLY) {
    return { inserted, updatedDirty, unchanged, dryRun: true };
  }

  // 1000 단위로 upsert.
  for (let i = 0; i < rows.length; i += 500) {
    const slice = rows.slice(i, i + 500);
    const { error } = await supa
      .from("content_chunks")
      .upsert(slice, { onConflict: "source_type,source_id,chunk_index" });
    if (error) throw error;
  }
  return { inserted, updatedDirty, unchanged };
}

// ---- articles ----

async function backfillArticles() {
  console.log("\n[articles] 시작");
  // articles + 현행 revision 본문 + law_code.
  let from = 0;
  const PAGE = 500;
  let total = 0;
  let agg = { inserted: 0, updatedDirty: 0, unchanged: 0 };
  for (;;) {
    if (LIMIT_PER_SOURCE !== null && total >= LIMIT_PER_SOURCE) break;
    const upper = Math.min(
      from + PAGE - 1,
      LIMIT_PER_SOURCE !== null ? LIMIT_PER_SOURCE - 1 : Infinity,
    );
    const { data: arts, error } = await supa
      .from("articles")
      .select("article_id, display_label, current_revision_id, laws(law_code)")
      .is("deleted_at", null)
      .order("article_id", { ascending: true })
      .range(from, upper);
    if (error) throw error;
    if (!arts || arts.length === 0) break;

    const revIds = arts
      .map((a) => a.current_revision_id)
      .filter((id) => id != null);
    const { data: revisions } = await supa
      .from("article_revisions")
      .select("revision_id, body_text")
      .in("revision_id", revIds);
    const revMap = new Map((revisions ?? []).map((r) => [r.revision_id, r.body_text ?? ""]));

    const chunks = [];
    for (const a of arts) {
      if (!a.current_revision_id) continue;
      const bodyText = revMap.get(a.current_revision_id);
      if (!bodyText) continue;
      chunks.push(
        ...chunkArticle({
          articleId: a.article_id,
          lawCode: a.laws?.law_code ?? "",
          displayLabel: a.display_label ?? `article ${a.article_id.slice(0, 8)}`,
          bodyText,
        }),
      );
    }
    const r = await upsertChunksWithSkip(chunks);
    agg.inserted += r.inserted;
    agg.updatedDirty += r.updatedDirty;
    agg.unchanged += r.unchanged;
    total += arts.length;
    console.log(
      `  range ${from}~${from + arts.length - 1}: chunks=${chunks.length} +${r.inserted}/~${r.updatedDirty}/=${r.unchanged}`,
    );
    if (arts.length < PAGE) break;
    from += PAGE;
  }
  console.log(
    `[articles] 끝 — sources=${total} ins=${agg.inserted} dirty=${agg.updatedDirty} unchanged=${agg.unchanged}`,
  );
  return agg;
}

// ---- cases ----

async function backfillCases() {
  console.log("\n[cases] 시작");
  let from = 0;
  const PAGE = 300;
  let total = 0;
  let agg = { inserted: 0, updatedDirty: 0, unchanged: 0 };
  for (;;) {
    if (LIMIT_PER_SOURCE !== null && total >= LIMIT_PER_SOURCE) break;
    const upper = Math.min(
      from + PAGE - 1,
      LIMIT_PER_SOURCE !== null ? LIMIT_PER_SOURCE - 1 : Infinity,
    );
    const { data: rows, error } = await supa
      .from("cases")
      .select(
        "case_id, subject_laws, court, decided_at, case_number, summary_title, summary_body_md, reasoning_md, comment_body_md",
      )
      .is("deleted_at", null)
      .order("case_id", { ascending: true })
      .range(from, upper);
    if (error) throw error;
    if (!rows || rows.length === 0) break;

    const chunks = [];
    for (const c of rows) {
      const headingPath = [c.court, c.decided_at, c.case_number]
        .filter((x) => x && String(x).length > 0)
        .join(" ");
      chunks.push(
        ...chunkCase({
          caseId: c.case_id,
          headingPath,
          lawCode: c.subject_laws?.[0] ?? null,
          summaryTitle: c.summary_title,
          summaryBodyMd: c.summary_body_md,
          reasoningMd: c.reasoning_md,
          commentBodyMd: c.comment_body_md,
        }),
      );
    }
    const r = await upsertChunksWithSkip(chunks);
    agg.inserted += r.inserted;
    agg.updatedDirty += r.updatedDirty;
    agg.unchanged += r.unchanged;
    total += rows.length;
    console.log(
      `  range ${from}~${from + rows.length - 1}: chunks=${chunks.length} +${r.inserted}/~${r.updatedDirty}/=${r.unchanged}`,
    );
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  console.log(
    `[cases] 끝 — sources=${total} ins=${agg.inserted} dirty=${agg.updatedDirty} unchanged=${agg.unchanged}`,
  );
  return agg;
}

// ---- problems ----

async function backfillProblems() {
  console.log("\n[problems] 시작");
  let from = 0;
  const PAGE = 200;
  let total = 0;
  let agg = { inserted: 0, updatedDirty: 0, unchanged: 0 };
  for (;;) {
    if (LIMIT_PER_SOURCE !== null && total >= LIMIT_PER_SOURCE) break;
    const upper = Math.min(
      from + PAGE - 1,
      LIMIT_PER_SOURCE !== null ? LIMIT_PER_SOURCE - 1 : Infinity,
    );
    const { data: rows, error } = await supa
      .from("problems")
      .select(
        "problem_id, year, problem_number, body_md, explanation_md, model_answer_md, grading_rubric_md, laws(law_code)",
      )
      .is("deleted_at", null)
      .order("problem_id", { ascending: true })
      .range(from, upper);
    if (error) throw error;
    if (!rows || rows.length === 0) break;

    const ids = rows.map((p) => p.problem_id);
    const [{ data: choices }, { data: boxes }] = await Promise.all([
      supa
        .from("problem_choices")
        .select("problem_id, choice_index, body_md, ox_truth")
        .in("problem_id", ids)
        .order("choice_index", { ascending: true }),
      supa
        .from("problem_box_items")
        .select("problem_id, position_index, marker, body_md, ox_truth")
        .in("problem_id", ids)
        .order("position_index", { ascending: true }),
    ]);
    const choicesByPid = new Map();
    for (const c of choices ?? []) {
      if (!choicesByPid.has(c.problem_id)) choicesByPid.set(c.problem_id, []);
      choicesByPid.get(c.problem_id).push({
        label: `${(c.choice_index ?? 0) + 1}`,
        bodyMd: c.body_md ?? "",
        oxTruth: c.ox_truth ?? null,
      });
    }
    const boxesByPid = new Map();
    for (const b of boxes ?? []) {
      if (!boxesByPid.has(b.problem_id)) boxesByPid.set(b.problem_id, []);
      boxesByPid.get(b.problem_id).push({
        label: b.marker ?? `${(b.position_index ?? 0) + 1}`,
        bodyMd: b.body_md ?? "",
        oxTruth: b.ox_truth ?? null,
      });
    }

    const chunks = [];
    for (const p of rows) {
      const heading =
        p.year && p.problem_number
          ? `${p.year}년 ${p.problem_number}번`
          : `문제 ${p.problem_id.slice(0, 8)}`;
      chunks.push(
        ...chunkProblem({
          problemId: p.problem_id,
          headingPath: heading,
          lawCode: p.laws?.law_code ?? null,
          bodyMd: p.body_md ?? "",
          explanationMd: p.explanation_md,
          choices: choicesByPid.get(p.problem_id) ?? [],
          boxItems: boxesByPid.get(p.problem_id) ?? [],
          modelAnswerMd: p.model_answer_md,
          gradingRubricMd: p.grading_rubric_md,
        }),
      );
    }
    const r = await upsertChunksWithSkip(chunks);
    agg.inserted += r.inserted;
    agg.updatedDirty += r.updatedDirty;
    agg.unchanged += r.unchanged;
    total += rows.length;
    console.log(
      `  range ${from}~${from + rows.length - 1}: chunks=${chunks.length} +${r.inserted}/~${r.updatedDirty}/=${r.unchanged}`,
    );
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  console.log(
    `[problems] 끝 — sources=${total} ins=${agg.inserted} dirty=${agg.updatedDirty} unchanged=${agg.unchanged}`,
  );
  return agg;
}

// ---- entry ----

(async () => {
  console.log("==== content_chunks 백필 ====");
  console.log(`mode: ${APPLY ? "APPLY" : "dry-run"}, source: ${SOURCE}, limit: ${LIMIT_PER_SOURCE ?? "all"}`);

  const sources = SOURCE === "all" ? ["article", "case", "problem"] : [SOURCE];
  const grand = { inserted: 0, updatedDirty: 0, unchanged: 0 };
  for (const s of sources) {
    let r;
    if (s === "article") r = await backfillArticles();
    else if (s === "case") r = await backfillCases();
    else if (s === "problem") r = await backfillProblems();
    else throw new Error(`unknown source: ${s}`);
    grand.inserted += r.inserted;
    grand.updatedDirty += r.updatedDirty;
    grand.unchanged += r.unchanged;
  }

  console.log("\n==== TOTAL ====");
  console.log(
    `inserted=${grand.inserted}  updated(dirty)=${grand.updatedDirty}  unchanged=${grand.unchanged}`,
  );
  if (!APPLY) {
    console.log("(dry-run — 실제 적용하려면 --apply 추가)");
  } else {
    console.log("적용 완료. /api/cron/embed-chunks 호출하면 임베딩 시작 (VOYAGE_API_KEY 필요).");
  }
})().catch((e) => {
  console.error("[backfill-chunks] 실패:", e);
  process.exit(1);
});
