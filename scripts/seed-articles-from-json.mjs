// 범용 조문 시드 — parsed-articles JSON(parsed-articles-v2 스키마) → 한 법령의
// articles / article_revisions 적재. law_code 파라미터로 어느 과목이든 사용.
//
// 사용:
//   node scripts/seed-articles-from-json.mjs \
//     --law=trademark --json=source/_converted/parsed-articles-trademark.json \
//     --display=상표법 --short=상표 --ord=20 \
//     --revnum="리담 상표법 조문정리 (제1판)" --reason="리담 상표법 조문정리 제1판 시드"
//
// 동작:
//   1. 해당 law_code 의 problems / articles / law_revisions 삭제 (laws row 는 유지/업서트)
//   2. laws row 없으면 insert, 있으면 display/short/ord 업데이트
//   3. base law_revision 1건 생성 (effective_date 기본 NULL → 본문 표시되되 시각 편집 가능)
//   4. chapters → articles → article_revisions, current_revision_id 갱신
//
// 주의: SUPABASE_SERVICE_ROLE_KEY 필요.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ── args ──
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = /^--([^=]+)=(.*)$/.exec(a);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
  }),
);
const LAW = args.law;
const JSON_PATH = args.json && resolve(ROOT, args.json);
if (!LAW || !JSON_PATH) {
  console.error("필수: --law=<code> --json=<path>");
  process.exit(1);
}
const DISPLAY = args.display ?? LAW;
const SHORT = args.short ?? DISPLAY;
const ORD = args.ord ? Number(args.ord) : 50;
const REVNUM = args.revnum ?? `${DISPLAY} 조문 시드`;
const REASON = args.reason ?? null;
const EFFECTIVE = args.effective ?? null; // 기본 NULL = 시각 편집 가능
// 기출 등 problems 가 이미 적재된 법령의 조문만 재시드할 때 — problems wipe 를 건너뛴다.
const KEEP_PROBLEMS = args.keepProblems === true || args.keepProblems === "true";
const PROMULGATED = args.promulgated ?? null;
// 강사 메모(content_comments) 작성자 — 기본 admin 임병웅.
const NOTES_AUTHOR = args.notesAuthor ?? "8dbc9c0e-a32d-456e-bf53-bf89160669e0";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정");
  process.exit(1);
}
const supa = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const data = JSON.parse(readFileSync(JSON_PATH, "utf8"));
console.log(
  `law=${LAW} source=${args.json}\n  chapters=${data.stats?.chapters} articles=${data.stats?.articles} withBody=${data.stats?.articlesWithBody}`,
);

const pad = (n, w) => String(n).padStart(w, "0");
const chapterPath = (ch) =>
  `${LAW}.ch${pad(ch.number, 2)}${ch.branch ? `_${pad(ch.branch, 2)}` : ""}`;
const articlePath = (chPath, a) =>
  `${chPath}.a${a.number}${a.branch ? `_${pad(a.branch, 2)}` : ""}`;
const articleNumberText = (a) => (a.branch ? `${a.number}의${a.branch}` : String(a.number));
const articleDisplayLabel = (a) => {
  const b = a.branch ? `의${a.branch}` : "";
  return a.deleted ? `제${a.number}조${b} (삭제)` : `제${a.number}조${b} ${a.title}`;
};

async function delAll(table, eqs) {
  let q = supa.from(table).delete();
  for (const [k, v] of Object.entries(eqs)) q = q.eq(k, v);
  const { error, count } = await q.select("*", { count: "exact", head: true });
  if (error) throw new Error(`delete ${table}: ${error.message}`);
  console.log(`  - ${table}: ${count ?? "?"} row`);
}

async function getOrCreateLaw() {
  const { data: existing } = await supa
    .from("laws")
    .select("law_id")
    .eq("law_code", LAW)
    .maybeSingle();
  if (existing) {
    // 기존 콘텐츠 wipe
    console.log(`→ wipe (law ${LAW} 존재)`);
    // content_comments 는 polymorphic(FK 없음) — articles wipe 전 해당 조문 코멘트 정리.
    const { data: oldArts } = await supa
      .from("articles")
      .select("article_id")
      .eq("law_id", existing.law_id)
      .eq("level", "article");
    const oldIds = (oldArts ?? []).map((a) => a.article_id);
    if (oldIds.length > 0) {
      const { error: cErr } = await supa
        .from("content_comments")
        .delete()
        .eq("target_type", "article")
        .eq("author_id", NOTES_AUTHOR)
        .in("target_id", oldIds);
      if (cErr) console.warn(`  content_comments cleanup: ${cErr.message}`);
      else console.log(`  - content_comments(시드분): cleaned`);
    }
    if (KEEP_PROBLEMS) console.log("  - problems: 유지 (--keepProblems)");
    else await delAll("problems", { law_id: existing.law_id });
    await delAll("articles", { law_id: existing.law_id });
    await delAll("law_revisions", { law_id: existing.law_id });
    await supa
      .from("laws")
      .update({ display_label: DISPLAY, short_label: SHORT, ord: ORD })
      .eq("law_id", existing.law_id);
    return existing.law_id;
  }
  const { data: law, error } = await supa
    .from("laws")
    .insert({ law_code: LAW, display_label: DISPLAY, short_label: SHORT, ord: ORD })
    .select("law_id")
    .single();
  if (error) throw new Error(`law insert: ${error.message}`);
  return law.law_id;
}

async function insertRevision(lawId) {
  const { data: rev, error } = await supa
    .from("law_revisions")
    .insert({
      law_id: lawId,
      revision_number: REVNUM,
      promulgated_at: PROMULGATED,
      effective_date: EFFECTIVE,
      reason_md: REASON,
    })
    .select("law_revision_id")
    .single();
  if (error) throw new Error(`law_revisions: ${error.message}`);
  return rev.law_revision_id;
}

async function seedChaptersAndArticles(lawId, lawRevId) {
  console.log("→ chapters + articles");
  let chCount = 0,
    aCount = 0,
    rCount = 0,
    noteCount = 0;
  for (const ch of data.chapters) {
    const chPath = chapterPath(ch);
    const { data: chRow, error: chErr } = await supa
      .from("articles")
      .insert({
        law_id: lawId,
        parent_id: null,
        level: "chapter",
        path: chPath,
        article_number: null,
        display_label: ch.label,
        importance: 1,
      })
      .select("article_id")
      .single();
    if (chErr) throw new Error(`chapter ${ch.label}: ${chErr.message}`);
    chCount++;

    const inserts = ch.articles.map((a) => ({
      law_id: lawId,
      parent_id: chRow.article_id,
      level: "article",
      path: articlePath(chPath, a),
      article_number: articleNumberText(a),
      display_label: articleDisplayLabel(a),
      importance: a.deleted ? 0 : Math.max(0, Math.min(3, a.importance ?? 1)),
    }));
    const { data: inserted, error: aErr } = await supa
      .from("articles")
      .insert(inserts)
      .select("article_id, path");
    if (aErr) throw new Error(`articles in ${ch.label}: ${aErr.message}`);
    aCount += inserted.length;

    const revInserts = [];
    for (let i = 0; i < ch.articles.length; i++) {
      const src = ch.articles[i];
      const row = inserted[i];
      if (!src.blocks || src.blocks.length === 0) continue;
      revInserts.push({
        article_id: row.article_id,
        law_revision_id: lawRevId,
        body_json: { blocks: src.blocks },
        effective_date: EFFECTIVE,
        change_kind: "created",
      });
    }
    if (revInserts.length > 0) {
      const { data: revs, error: rErr } = await supa
        .from("article_revisions")
        .insert(revInserts)
        .select("revision_id, article_id");
      if (rErr) throw new Error(`revisions in ${ch.label}: ${rErr.message}`);
      rCount += revs.length;
      for (const r of revs) {
        const { error: uErr } = await supa
          .from("articles")
          .update({ current_revision_id: r.revision_id })
          .eq("article_id", r.article_id);
        if (uErr) throw new Error(`current_revision_id: ${uErr.message}`);
      }
    }

    // 강사 메모(notes) → content_comments
    const noteInserts = [];
    for (let i = 0; i < ch.articles.length; i++) {
      for (const note of ch.articles[i].notes ?? []) {
        if (note && note.trim())
          noteInserts.push({
            target_type: "article",
            target_id: inserted[i].article_id,
            body_md: note.trim(),
            author_id: NOTES_AUTHOR,
          });
      }
    }
    if (noteInserts.length > 0) {
      const { error: nErr } = await supa.from("content_comments").insert(noteInserts);
      if (nErr) throw new Error(`content_comments in ${ch.label}: ${nErr.message}`);
      noteCount += noteInserts.length;
    }

    console.log(`  ✓ ${ch.label} → ${inserted.length}조 / ${revInserts.length} rev`);
  }
  console.log(`  total: ${chCount} chapters / ${aCount} articles / ${rCount} revisions / ${noteCount} notes`);
}

async function main() {
  const lawId = await getOrCreateLaw();
  const lawRevId = await insertRevision(lawId);
  console.log(`  law=${lawId} revision=${lawRevId} (effective=${EFFECTIVE ?? "NULL→편집가능"})`);
  await seedChaptersAndArticles(lawId, lawRevId);
  console.log("완료.");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
