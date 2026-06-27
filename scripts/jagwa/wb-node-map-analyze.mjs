// 워크북 section → systematic node(display_label) 매칭 가능성 분석(읽기 전용).
// EXACT(유일라벨) / AMBIG(중복라벨, chapter로 구분요) / NONE(별칭 필요) 분류.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: nodes } = await sb
  .from("systematic_nodes")
  .select("node_id, display_label, path")
  .eq("law_code", "patent");
const byLabel = {};
for (const n of nodes) (byLabel[n.display_label] ??= []).push(n);

const load = (f) => {
  try { return JSON.parse(readFileSync(`source/_converted/${f}`, "utf8")).problems ?? []; }
  catch { return []; }
};
const all = [...load("problems-merged.json"), ...load("expected-merged.json")];

// section 별 카운트 + 대표 chapterTitle
const sec = {};
for (const p of all) {
  const s = p.section || "(none)";
  (sec[s] ??= { n: 0, chapters: new Set() }).n++;
  sec[s].chapters.add(`${p.chapter}:${p.chapterTitle ?? ""}`);
}

const exact = [], ambig = [], none = [];
for (const [s, info] of Object.entries(sec)) {
  const m = byLabel[s] ?? [];
  if (m.length === 1) exact.push([s, info.n]);
  else if (m.length > 1) ambig.push([s, info.n, m.map((x) => x.path), [...info.chapters]]);
  else none.push([s, info.n, [...info.chapters]]);
}
console.log(`워크북 문제 ${all.length} · 구분 section ${Object.keys(sec).length}`);
console.log(`EXACT ${exact.length} / AMBIG ${ambig.length} / NONE ${none.length}`);
console.log(`EXACT 커버 문제수: ${exact.reduce((a, [, n]) => a + n, 0)}`);
console.log("\n--- AMBIG (중복 라벨 — chapter로 구분 필요) ---");
for (const a of ambig) console.log(JSON.stringify(a));
console.log("\n--- NONE (별칭 매핑 필요) ---");
for (const n of none) console.log(JSON.stringify(n));
