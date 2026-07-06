// 특허 예상문제(origin=expected) 해설/발문 이미지 전수 덤프 + 구 이미지 다운로드.
// 산출: tmp/jagwa/patent-expected-images-db.json, tmp/jagwa/expected-old-imgs/<n>_<yearno>.<ext>
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const OUT_DIR = "tmp/jagwa/expected-old-imgs";
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const { data: law } = await sb.from("laws").select("law_id").eq("law_code", "patent").single();
const problems = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb
    .from("problems")
    .select("problem_id, origin, year, problem_number, primary_node_id, body_md, explanation_md, problem_choices(choice_index, explanation_md), problem_box_items(marker, explanation_md)")
    .eq("law_id", law.law_id)
    .eq("origin", "expected")
    .is("deleted_at", null)
    .order("problem_id")
    .range(from, from + 999);
  if (error) throw error;
  problems.push(...(data ?? []));
  if ((data ?? []).length < 1000) break;
}

const IMG = /!\[[^\]]*\]\(([^)]+)\)/g;
const rows = [];
for (const p of problems) {
  const locs = [];
  for (const m of (p.explanation_md ?? "").matchAll(IMG)) locs.push({ loc: "expl", url: m[1] });
  for (const m of (p.body_md ?? "").matchAll(IMG)) locs.push({ loc: "body", url: m[1] });
  for (const c of p.problem_choices ?? [])
    for (const m of (c.explanation_md ?? "").matchAll(IMG)) locs.push({ loc: `choice_expl:${c.choice_index}`, url: m[1] });
  for (const b of p.problem_box_items ?? [])
    for (const m of (b.explanation_md ?? "").matchAll(IMG)) locs.push({ loc: `box_expl:${b.marker ?? ""}`, url: m[1] });
  if (locs.length)
    rows.push({
      problemId: p.problem_id,
      no: p.problem_number,
      nodeId: p.primary_node_id,
      imgs: locs,
      bodyHead: (p.body_md ?? "").replace(/\s+/g, " ").slice(0, 160),
    });
}
rows.sort((a, b) => (a.no ?? 0) - (b.no ?? 0));
writeFileSync("tmp/jagwa/patent-expected-images-db.json", JSON.stringify(rows, null, 1));
const total = rows.reduce((s, r) => s + r.imgs.length, 0);
console.log(`문항 ${rows.length} · 이미지 record ${total}`);

// 구 이미지 다운로드 (URL 중복 제거)
const seen = new Map();
let i = 0;
for (const r of rows) {
  for (const g of r.imgs) {
    if (seen.has(g.url)) { g.local = seen.get(g.url); continue; }
    const ext = (g.url.match(/\.(png|jpe?g|gif|webp)(\?|$)/i)?.[1] ?? "png").toLowerCase();
    const name = `${String(i).padStart(3, "0")}_p${r.no}_${g.loc.replace(/[^a-z0-9]/gi, "-")}.${ext}`;
    const res = await fetch(g.url);
    if (!res.ok) { console.log(`DL FAIL ${r.no} ${g.url} — ${res.status}`); g.local = null; seen.set(g.url, null); continue; }
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(`${OUT_DIR}/${name}`, buf);
    g.local = name;
    seen.set(g.url, name);
    i++;
  }
}
writeFileSync("tmp/jagwa/patent-expected-images-db.json", JSON.stringify(rows, null, 1));
console.log(`다운로드 ${i}개 (고유 URL) → ${OUT_DIR}`);
