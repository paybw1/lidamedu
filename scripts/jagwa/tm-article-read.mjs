// 상표법 현행 조문 원문 읽기 — DB articles(law_code=trademark) 읽기 전용 (feat-2-039).
// 괄호 안 약호 (§34①(13)) 를 쓰기 전에 그 항·호가 실제로 그 내용인지 눈으로 대조하는 용도.
// articles 는 조 단위 1행이고 body_text 가 {blocks:[clause/item/sub/para]} JSON 이라 여기서 렌더링한다.
//
//   node scripts/jagwa/tm-article-read.mjs --article 34            # 제34조 전체(항·호·목)
//   node scripts/jagwa/tm-article-read.mjs --article 34 --clause 1 # 제34조 제1항과 그 호·목만
//   node scripts/jagwa/tm-article-read.mjs --find 사용에 의하여      # 조문 본문 키워드 → 조·항·호 위치
//   node scripts/jagwa/tm-article-read.mjs --law patent --article 29  # 타법(특허 등)
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const supa = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);
const argv = process.argv.slice(2);
const opt = (k) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : null;
};
const lawCode = opt("--law") ?? "trademark";
const { data: law, error: le } = await supa
  .from("laws")
  .select("law_id")
  .eq("law_code", lawCode)
  .single();
if (le) throw new Error(le.message);

const COLS = "article_id, article_number, level, display_label, path, current_revision_id";

async function fetchRows(filter) {
  const out = [];
  for (let from = 0; ; from += 500) {
    let q = supa
      .from("articles")
      .select(COLS)
      .eq("law_id", law.law_id)
      .eq("level", "article")
      .is("deleted_at", null)
      .order("path")
      .range(from, from + 499);
    q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    out.push(...data);
    if (data.length < 500) break;
  }
  return out;
}
async function bodies(rows) {
  const ids = rows.map((r) => r.current_revision_id).filter(Boolean);
  const map = new Map();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supa
      .from("article_revisions")
      .select("revision_id, body_text, effective_date")
      .in("revision_id", ids.slice(i, i + 200));
    if (error) throw new Error(error.message);
    for (const r of data) map.set(r.revision_id, r);
  }
  return map;
}

const inlineText = (inl) =>
  (inl ?? [])
    .filter((x) => x.type !== "amendment_note")
    .map((x) => x.text ?? "")
    .join("")
    .replace(/\s+/g, " ")
    .trim();
const IND = { clause: "  ", item: "    ", sub: "      ", para: "    " };

// blocks 트리를 줄 목록으로. clauseFilter 가 있으면 그 항만.
function render(blocks, clauseFilter, lines, depthKind = "clause") {
  for (const b of blocks ?? []) {
    if (b.kind === "sub_article_group") {
      lines.push(`  [구법 참고 블록: ${b.source ?? ""} — 생략]`);
      continue;
    }
    if (b.kind === "clause" && clauseFilter && String(b.number) !== String(clauseFilter))
      continue;
    const ind = IND[b.kind] ?? IND[depthKind] ?? "  ";
    const sub = b.subtitle ? `  〔${b.subtitle}〕` : "";
    lines.push(`${ind}${b.label ?? ""} ${inlineText(b.inline)}${sub}`.trimEnd());
    if (b.children?.length) render(b.children, null, lines, b.kind);
  }
}
function articleLines(row, rev) {
  const lines = [
    `[${lawCode}] ${row.display_label}${rev?.effective_date ? " (시행 " + rev.effective_date + ")" : ""}`,
  ];
  let parsed = null;
  try {
    parsed = typeof rev?.body_text === "string" ? JSON.parse(rev.body_text) : rev?.body_text;
  } catch {
    parsed = null;
  }
  if (parsed?.blocks) render(parsed.blocks, opt("--clause"), lines);
  else lines.push("  " + String(rev?.body_text ?? "(본문 없음)").slice(0, 3000));
  return lines;
}

const find = opt("--find");
if (find) {
  const rows = await fetchRows((q) => q);
  const map = await bodies(rows);
  for (const r of rows) {
    const lines = articleLines(r, map.get(r.current_revision_id));
    const hits = lines.slice(1).filter((l) => l.includes(find));
    if (!hits.length) continue;
    console.log(lines[0]);
    for (const h of hits) console.log("  " + h.trim().slice(0, 160));
  }
  process.exit(0);
}

const art = opt("--article");
if (!art) {
  console.error("사용: --article N [--clause N] | --find <키워드> [--law code]");
  process.exit(1);
}
const rows = await fetchRows((q) => q.eq("article_number", String(art)));
if (!rows.length) {
  console.log(`(없음) ${lawCode} 제${art}조 — articles 에 없음`);
  process.exit(0);
}
const map = await bodies(rows);
for (const r of rows) console.log(articleLines(r, map.get(r.current_revision_id)).join("\n"));
