// 체계도 조문 배치 손보기 — 지우거나 하위 항목으로 옮긴다.
//
// 원본 체계도는 부모 항목에 `(法 33)` 을 적지만, 실제 자리는 그 아래 세부 항목인
// 경우가 있다. 그런 결정을 DB 에만 반영하면 apply-article-refs 를 다시 돌릴 때
// 되살아나므로, **이 도구는 DB 와 예외 목록(article-ref-overrides.json)을 함께 고친다.**
//
// 노드는 화면에 보이는 이름으로 지정한다(경로 문자열을 몰라도 된다).
//
//   node scripts/systematic/edit-article-placement.mjs trademark \
//     remove "등록요건 > 상표등록을 받을 수 있는 상표 > 상표등록의 요건" 33
//
//   node scripts/systematic/edit-article-placement.mjs trademark \
//     move "총칙 > 목적" 1 "총칙 > 목적 > 상표법의 목적"
//
// 기본은 dry-run. 적용하려면 --apply.
import "dotenv/config";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const OVERRIDES_FILE = "scripts/systematic/article-ref-overrides.json";
const LAW_UUID = {
  trademark: "c5f67968-7b8a-45ea-86d8-c748040afb99",
  design: "afede9be-f47c-48a7-9219-dd09d1122210",
  patent: "c19c719c-3631-475c-8353-f5a2b7514714",
  civil: "74dc73af-f25d-40ff-aead-fb039471982c",
};

const argv = process.argv.slice(2).filter((a) => a !== "--apply");
const APPLY = process.argv.includes("--apply");
const reasonIdx = argv.indexOf("--reason");
const reason = reasonIdx >= 0 ? argv[reasonIdx + 1] : null;
const args = reasonIdx >= 0 ? argv.slice(0, reasonIdx) : argv;
const [lawCode, mode, fromChain, articleNum, toChain] = args;

if (!lawCode || !mode || !fromChain || !articleNum || (mode === "move" && !toChain)) {
  console.error(`사용:
  node scripts/systematic/edit-article-placement.mjs <law> remove "가 > 나 > 다" <조번호> [--apply]
  node scripts/systematic/edit-article-placement.mjs <law> move "가 > 나" <조번호> "가 > 나 > 다" [--apply]`);
  process.exit(1);
}
if (!["remove", "move"].includes(mode)) {
  console.error(`mode 는 remove | move`);
  process.exit(1);
}

const { data: nodes, error } = await sb
  .from("systematic_nodes")
  .select("node_id, display_label, parent_id, path")
  .eq("law_code", lawCode)
  .limit(3000);
if (error) throw new Error(error.message);
const byId = new Map(nodes.map((n) => [n.node_id, n]));

/** 노드의 조상 라벨 사슬(위→아래). 앞의 `01 ` 같은 번호는 비교에서 뺀다. */
function chainOf(n) {
  const out = [];
  let cur = n;
  while (cur) {
    out.unshift(cur.display_label.replace(/^\s*\d{2}\s+/, "").trim());
    cur = cur.parent_id ? byId.get(cur.parent_id) : null;
  }
  return out;
}
const key = (s) => s.replace(/\s+/g, "").trim();

/** "가 > 나 > 다" → 노드. 마지막 이름이 같고 앞 이름들이 조상에 순서대로 들어 있으면 일치. */
function resolve(chainText) {
  const want = chainText.split(">").map((s) => key(s));
  const last = want[want.length - 1];
  const cands = nodes.filter((n) => key(n.display_label.replace(/^\s*\d{2}\s+/, "")) === last);
  const hits = cands.filter((n) => {
    const have = chainOf(n).map(key);
    let i = 0;
    for (const w of want) {
      i = have.indexOf(w, i);
      if (i < 0) return false;
      i += 1;
    }
    return true;
  });
  if (!hits.length) throw new Error(`노드를 못 찾음: ${chainText}`);
  if (hits.length > 1) {
    throw new Error(
      `이름이 겹쳐 하나로 좁혀지지 않음: ${chainText}\n` +
        hits.map((h) => `   ${chainOf(h).join(" / ")}  (${h.path})`).join("\n"),
    );
  }
  return hits[0];
}

const from = resolve(fromChain);
const to = mode === "move" ? resolve(toChain) : null;

const lawId = LAW_UUID[lawCode];
if (!lawId) throw new Error(`law uuid 미등록: ${lawCode}`);
const { data: art, error: artErr } = await sb
  .from("articles")
  .select("article_id, display_label")
  .eq("law_id", lawId)
  .eq("level", "article")
  .eq("article_number", String(articleNum))
  .is("deleted_at", null)
  .maybeSingle();
if (artErr) throw new Error(artErr.message);
if (!art) throw new Error(`조문 없음: ${lawCode} 제${articleNum}조`);

const { data: existing } = await sb
  .from("article_systematic_links")
  .select("node_id")
  .eq("node_id", from.node_id)
  .eq("article_id", art.article_id);

console.log(`\n${art.display_label}`);
console.log(`  대상 노드: ${chainOf(from).join(" / ")}  (${from.path})`);
console.log(`  현재 배치: ${existing?.length ? "있음" : "★없음 — 이미 지워졌거나 원래 없었다"}`);
if (to) console.log(`  옮길 곳  : ${chainOf(to).join(" / ")}  (${to.path})`);

if (!APPLY) {
  console.log(`\ndry-run — 적용하려면 --apply`);
  process.exit(0);
}

if (to) {
  const { error: e } = await sb
    .from("article_systematic_links")
    .upsert({ node_id: to.node_id, article_id: art.article_id }, { ignoreDuplicates: true });
  if (e) throw new Error(`옮길 곳 배치 실패: ${e.message}`);
}
const { error: delErr } = await sb
  .from("article_systematic_links")
  .delete()
  .eq("node_id", from.node_id)
  .eq("article_id", art.article_id);
if (delErr) throw new Error(`기존 배치 삭제 실패: ${delErr.message}`);

// ★예외 목록에 남긴다. 이게 없으면 apply-article-refs 재실행 때 되살아난다.
const doc = JSON.parse(fs.readFileSync(OVERRIDES_FILE, "utf8"));
const same = doc.overrides.find((o) => o.path === String(from.path));
const entry = same ?? {
  path: String(from.path),
  label: chainOf(from).join(" / "),
  articles: [],
  moveTo: to ? String(to.path) : null,
  reason: reason ?? "운영자 지시로 조정",
};
if (!entry.articles.includes(String(articleNum))) entry.articles.push(String(articleNum));
entry.moveTo = to ? String(to.path) : entry.moveTo ?? null;
if (reason) entry.reason = reason;
if (!same) doc.overrides.push(entry);
fs.writeFileSync(OVERRIDES_FILE, JSON.stringify(doc, null, 2) + "\n");

console.log(`\n적용 완료 — DB 반영 + ${OVERRIDES_FILE} 기록`);
