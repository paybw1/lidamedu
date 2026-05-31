/**
 * 일회성: inline text 토큰 안에 박힌 "강사 강조 라벨"·"본문/단서 제목"을
 * 별도 inline 토큰(annotation/subtitle)으로 분리.
 *
 * P1) text "제127조[간접침해]·…" → text "제127조" + annotation "간접침해" + text "·…"
 *     - 개정 키워드(개정/신설/삭제/본조/시행일/제목개정) 시작은 제외 (진짜 개정이력일 가능성)
 * P2) text "…(예외: 일 군의 발명 …)다만," → text "…" + subtitle "예외: 일 군의 발명 …" + text "다만,"
 *     - 라벨: 원칙 / 예외 / 단서 / 본문 + ":"
 * P3) 제45조 ② 의 비대칭 — 인접 text "대통령령[" 의 trailing `[` + annotation "시행령 제6조]"
 *     의 trailing `]` 정리해 짝 맞추기.
 *
 * 실행: npx dotenv -e .env -- npx tsx scripts/laws/fix-text-token-labels.ts [--dry-run]
 */
import { createClient } from "@supabase/supabase-js";

import type { Database, Json } from "../../database.types";
import type {
  ArticleBody,
  Block,
  Inline,
} from "../../app/features/laws/lib/article-body";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("env missing");

const dryRun = process.argv.includes("--dry-run");

const admin = createClient<Database>(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// P1 — text 안 [한글 라벨] 매칭. 개정 키워드 시작은 제외(진짜 amendment_note 토큰화 안 된 잔여 가능성).
const ANNOTATION_RE = /\[([가-힣A-Za-z0-9 :,·\.\-]{1,40})\]/g;
const AMENDMENT_KEYWORDS_RE = /^(개정|신설|삭제|본조신설|본조|시행일|제목개정|전문개정|종전|제\d+조의?\d*에서 이동|제\d+조의?\d*은 제\d+조의?\d*으로 이동|심판관의 제척사유)/;

// P2 — text 안 (원칙|예외|단서|본문 …) 매칭.
const SUBTITLE_RE = /\((원칙|예외|단서|본문)\s*[:：][^()]*\)/g;

interface SplitResult {
  tokens: Inline[];
  reports: string[];
}

function splitTextToken(text: string, blockLabel: string): SplitResult {
  // 1) 한 번에 두 패턴 매칭 위치 수집.
  interface Match {
    start: number;
    end: number;
    kind: "annotation" | "subtitle";
    inner: string;
  }
  const matches: Match[] = [];

  for (const m of text.matchAll(ANNOTATION_RE)) {
    const inner = m[1];
    if (AMENDMENT_KEYWORDS_RE.test(inner)) continue;
    matches.push({
      start: m.index!,
      end: m.index! + m[0].length,
      kind: "annotation",
      inner,
    });
  }
  for (const m of text.matchAll(SUBTITLE_RE)) {
    matches.push({
      start: m.index!,
      end: m.index! + m[0].length,
      kind: "subtitle",
      inner: m[0].slice(1, -1), // 양쪽 ()  제거
    });
  }
  if (matches.length === 0) return { tokens: [{ type: "text", text }], reports: [] };

  matches.sort((a, b) => a.start - b.start);

  // 2) 비겹침 보장 — 겹치면 앞 매칭 우선.
  const accepted: Match[] = [];
  let cursor = 0;
  for (const m of matches) {
    if (m.start < cursor) continue;
    accepted.push(m);
    cursor = m.end;
  }

  // 3) 토큰 분할.
  const out: Inline[] = [];
  const reports: string[] = [];
  let pos = 0;
  for (const m of accepted) {
    if (m.start > pos) {
      out.push({ type: "text", text: text.slice(pos, m.start) });
    }
    if (m.kind === "annotation") {
      out.push({ type: "annotation", text: m.inner });
      reports.push(`  ${blockLabel} annotation: "${m.inner}"`);
    } else {
      out.push({ type: "subtitle", text: m.inner });
      reports.push(`  ${blockLabel} subtitle: "${m.inner}"`);
    }
    pos = m.end;
  }
  if (pos < text.length) {
    out.push({ type: "text", text: text.slice(pos) });
  }

  // 4) 빈 text 제거.
  const filtered = out.filter(
    (t) => !(t.type === "text" && (t as { text: string }).text === ""),
  );
  return { tokens: filtered, reports };
}

function processInlineArray(
  arr: Inline[],
  blockLabel: string,
  reports: string[],
): { changed: boolean; newArr: Inline[] } {
  // 1) 인접 text 토큰을 합쳐 run 으로 묶음 — `(`와 `)`가 다른 토큰에 분리돼 있어도
  //    한 run 안에서 패턴 매칭 가능하도록.
  type Run = { kind: "text"; merged: string; original: Inline[] } | { kind: "other"; token: Inline };
  const runs: Run[] = [];
  for (const t of arr) {
    if (t.type === "text") {
      const last = runs[runs.length - 1];
      if (last && last.kind === "text") {
        last.merged += t.text;
        last.original.push(t);
      } else {
        runs.push({ kind: "text", merged: t.text, original: [t] });
      }
    } else {
      runs.push({ kind: "other", token: t });
    }
  }
  // 2) 각 text run 에 splitTextToken 적용.
  let changed = false;
  const out: Inline[] = [];
  for (const r of runs) {
    if (r.kind === "other") {
      out.push(r.token);
      continue;
    }
    const sr = splitTextToken(r.merged, blockLabel);
    const same =
      sr.tokens.length === 1 &&
      sr.tokens[0].type === "text" &&
      (sr.tokens[0] as { text: string }).text === r.merged;
    if (!same) {
      changed = true;
      reports.push(...sr.reports);
    }
    out.push(...sr.tokens);
  }
  return { changed, newArr: out };
}

function processBlocks(
  blocks: Block[],
  parentLabel: string,
  reports: string[],
): boolean {
  let anyChanged = false;
  for (const b of blocks) {
    const lbl = (() => {
      if (b.kind === "clause") return `${parentLabel}${b.label}`.trim();
      if (b.kind === "item") return `${parentLabel}${b.label}`.trim();
      if (b.kind === "sub") return `${parentLabel}${b.label}`.trim();
      return parentLabel;
    })();
    if (b.kind === "header_refs") {
      const r = processInlineArray(b.refs, lbl, reports);
      if (r.changed) {
        b.refs = r.newArr;
        anyChanged = true;
      }
    } else if (
      b.kind === "clause" ||
      b.kind === "item" ||
      b.kind === "sub" ||
      b.kind === "para"
    ) {
      const r = processInlineArray(b.inline, lbl, reports);
      if (r.changed) {
        b.inline = r.newArr;
        anyChanged = true;
      }
      if (b.kind !== "para") {
        if (processBlocks(b.children, lbl, reports)) anyChanged = true;
      }
    } else if (b.kind === "sub_article_group") {
      if (b.preface && processBlocks(b.preface, lbl, reports)) anyChanged = true;
      for (const sa of b.articles) {
        if (processBlocks(sa.blocks, lbl, reports)) anyChanged = true;
      }
    }
  }
  return anyChanged;
}

// P4 — annotation 으로 잘못 분류된 개정이력을 amendment_note 로 역분류.
// text 가 "제목개정/전문개정/본조신설/개정/신설/삭제/시행일/종전" 시작이면 매칭.
// + 일관성 위해 text 가 wrap 안 돼 있으면 [text] 로 wrap.
const ANNOTATION_TO_AMENDMENT_RE =
  /^(제목개정|전문개정|본조신설|개정|신설|삭제|시행일|종전|제\d+조의?\d*에서 이동)/;

function fixMisclassifiedAnnotations(
  body: ArticleBody,
  reports: string[],
): boolean {
  let changed = false;
  function visitInline(arr: Inline[]) {
    for (const t of arr) {
      if (t.type !== "annotation") continue;
      if (!ANNOTATION_TO_AMENDMENT_RE.test(t.text)) continue;
      const wrapped =
        (t.text.startsWith("[") && t.text.endsWith("]")) ||
        (t.text.startsWith("<") && t.text.endsWith(">"));
      const newText = wrapped ? t.text : `[${t.text}]`;
      (t as unknown as { type: string }).type = "amendment_note";
      (t as { text: string }).text = newText;
      reports.push(`  annotation→amendment_note: "${newText}"`);
      changed = true;
    }
  }
  function visit(blocks: Block[]) {
    for (const b of blocks) {
      if (b.kind === "header_refs") {
        visitInline(b.refs);
      } else if (
        b.kind === "clause" ||
        b.kind === "item" ||
        b.kind === "sub" ||
        b.kind === "para"
      ) {
        visitInline(b.inline);
        if (b.kind !== "para") visit(b.children);
      } else if (b.kind === "sub_article_group") {
        if (b.preface) visit(b.preface);
        for (const sa of b.articles) visit(sa.blocks);
      }
    }
  }
  visit(body.blocks);
  return changed;
}

// P3 — 비대칭 정정 (제45조 ② 의 "대통령령[" + "시행령 제6조]").
function fixAsymmetricBrackets(body: ArticleBody, reports: string[]): boolean {
  let changed = false;
  function visit(blocks: Block[]) {
    for (const b of blocks) {
      if (
        b.kind === "clause" ||
        b.kind === "item" ||
        b.kind === "sub" ||
        b.kind === "para"
      ) {
        const arr = b.inline;
        for (let i = 0; i < arr.length - 1; i++) {
          const cur = arr[i];
          const nxt = arr[i + 1];
          if (
            cur.type === "text" &&
            cur.text.endsWith("[") &&
            nxt.type === "annotation" &&
            nxt.text.endsWith("]")
          ) {
            (cur as { text: string }).text = cur.text.slice(0, -1);
            (nxt as { text: string }).text = nxt.text.slice(0, -1);
            reports.push(
              `  asymmetric fix: trailing "[" + annotation ending "]" → cleaned ("${nxt.text}")`,
            );
            changed = true;
          }
        }
        if (b.kind !== "para") visit(b.children);
      } else if (b.kind === "sub_article_group") {
        if (b.preface) visit(b.preface);
        for (const sa of b.articles) visit(sa.blocks);
      }
    }
  }
  visit(body.blocks);
  return changed;
}

async function processArticle(articleId: string): Promise<{
  ok: boolean;
  changed: boolean;
  detail: string;
  reports: string[];
}> {
  const { data: art, error: artErr } = await admin
    .from("articles")
    .select("article_id, law_id, current_revision_id, display_label")
    .eq("article_id", articleId)
    .is("deleted_at", null)
    .maybeSingle();
  if (artErr) return { ok: false, changed: false, detail: artErr.message, reports: [] };
  if (!art?.current_revision_id) {
    return { ok: false, changed: false, detail: "no current_revision_id", reports: [] };
  }

  const { data: rev, error: revErr } = await admin
    .from("article_revisions")
    .select("body_json")
    .eq("revision_id", art.current_revision_id)
    .maybeSingle();
  if (revErr) return { ok: false, changed: false, detail: revErr.message, reports: [] };
  if (!rev?.body_json) {
    return { ok: false, changed: false, detail: "no body_json", reports: [] };
  }

  const body = JSON.parse(JSON.stringify(rev.body_json)) as ArticleBody;
  const reports: string[] = [];
  // 순서: P4(annotation→amendment_note 역분류) → P1/P2(text 토큰 split) → P3(비대칭 정정)
  const misclassChanged = fixMisclassifiedAnnotations(body, reports);
  const splitChanged = processBlocks(body.blocks, "", reports);
  const asymChanged = fixAsymmetricBrackets(body, reports);
  const changed = misclassChanged || splitChanged || asymChanged;

  if (!changed) {
    return {
      ok: true,
      changed: false,
      detail: `${art.display_label} — no matches`,
      reports,
    };
  }
  if (dryRun) {
    return {
      ok: true,
      changed: true,
      detail: `${art.display_label} — ${reports.length} edits (dry-run)`,
      reports,
    };
  }

  // saveArticleQuickEdit 패턴.
  const today = new Date().toISOString().slice(0, 10);
  const stamp = Date.now();
  const { data: lawRev, error: lawRevErr } = await admin
    .from("law_revisions")
    .insert({
      law_id: art.law_id,
      revision_number: `fix-text-tokens-${stamp}`,
      promulgated_at: today,
      effective_date: today,
    })
    .select("law_revision_id")
    .single();
  if (lawRevErr) {
    return { ok: false, changed: false, detail: `law_revisions: ${lawRevErr.message}`, reports };
  }
  const { data: artRev, error: artRevErr } = await admin
    .from("article_revisions")
    .insert({
      article_id: art.article_id,
      law_revision_id: lawRev.law_revision_id,
      body_json: body as unknown as Json,
      change_kind: "amended",
      effective_date: today,
    })
    .select("revision_id")
    .single();
  if (artRevErr) {
    return { ok: false, changed: false, detail: `article_revisions: ${artRevErr.message}`, reports };
  }
  const { error: updErr } = await admin
    .from("articles")
    .update({ current_revision_id: artRev.revision_id })
    .eq("article_id", art.article_id);
  if (updErr) {
    return { ok: false, changed: false, detail: `articles: ${updErr.message}`, reports };
  }
  return {
    ok: true,
    changed: true,
    detail: `${art.display_label} — ${reports.length} edits, new_rev=${artRev.revision_id}`,
    reports,
  };
}

async function main() {
  // 모든 article 검사 (영향 범위 사전 진단).
  const { data: arts } = await admin
    .from("articles")
    .select("article_id, display_label")
    .is("deleted_at", null)
    .not("current_revision_id", "is", null);
  if (!arts) throw new Error("no articles");
  console.log(`[fix-text] dry=${dryRun} candidates=${arts.length}`);
  let changedCount = 0;
  let unchangedCount = 0;
  let failed = 0;
  for (const a of arts) {
    const r = await processArticle(a.article_id);
    if (!r.ok) {
      console.log(`  [FAIL] ${a.display_label}: ${r.detail}`);
      failed += 1;
      continue;
    }
    if (r.changed) {
      changedCount += 1;
      console.log(`  [CHG] ${r.detail}`);
      for (const line of r.reports) console.log(line);
    } else {
      unchangedCount += 1;
    }
  }
  console.log(
    `[fix-text] done. changed=${changedCount} unchanged=${unchangedCount} failed=${failed}`,
  );
}

await main().catch((err) => {
  console.error(err);
  process.exit(1);
});
