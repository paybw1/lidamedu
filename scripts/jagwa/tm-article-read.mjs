// 상표법 현행 조문 원문 읽기 — DB articles(law_code=trademark) 읽기 전용 (feat-2-039).
// 괄호 안 약호 (§34①(13)) 를 쓰기 전에 그 항·호가 실제로 그 내용인지 눈으로 대조하는 용도.
//
//   node scripts/jagwa/tm-article-read.mjs --article 34            # 제34조 전체(조·항·호·목 트리)
//   node scripts/jagwa/tm-article-read.mjs --article 34 --clause 1 # 제34조 제1항과 그 아래만
//   node scripts/jagwa/tm-article-read.mjs --find 사용에 의한        # 조문 본문 키워드 → 조 번호·표제
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
  .select("law_id, name")
  .eq("law_code", lawCode)
  .single();
if (le) throw new Error(le.message);

const COLS =
  "article_id, article_number, level, display_label, path, clause_number, item_number, sub_item_number, sort_order, current_revision_id";

async function fetchRows(filter) {
  const out = [];
  for (let from = 0; ; from += 500) {
    let q = supa
      .from("articles")
      .select(COLS)
      .eq("law_id", law.law_id)
      .is("deleted_at", null)
      .order("sort_order")
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

const find = opt("--find");
if (find) {
  const rows = await fetchRows((q) => q);
  const map = await bodies(rows);
  for (const r of rows) {
    const b = map.get(r.current_revision_id)?.body_text ?? "";
    if (!b.includes(find)) continue;
    const i = b.indexOf(find);
    console.log(
      `${r.display_label ?? r.path} | ${b.slice(Math.max(0, i - 40), i + 80).replace(/\s+/g, " ")}`,
    );
  }
  process.exit(0);
}

const art = opt("--article");
if (!art) {
  console.error("사용: --article N [--clause N] | --find <키워드> [--law code]");
  process.exit(1);
}
const clause = opt("--clause");
const rows = await fetchRows((q) => q.eq("article_number", String(art)));
if (!rows.length) {
  console.log(`(없음) ${law.name} 제${art}조 — articles 에 없음`);
  process.exit(0);
}
const map = await bodies(rows);
for (const r of rows) {
  if (clause && r.level !== "article" && String(r.clause_number) !== String(clause))
    continue;
  const rev = map.get(r.current_revision_id);
  const indent = { article: "", clause: "  ", item: "    ", sub_item: "      " }[r.level] ?? "";
  console.log(
    `${indent}[${r.level}] ${r.display_label ?? r.path}${rev?.effective_date ? " (시행 " + rev.effective_date + ")" : ""}\n${indent}${(rev?.body_text ?? "(본문 없음)").replace(/\n/g, "\n" + indent)}\n`,
  );
}
