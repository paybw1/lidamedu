// feat-2-030 S3c — 민법(civil) 빈칸 세트 없는 조문에 "자동 명사 빈칸" 세트 일괄 생성.
//   조사 기반 명사 추출(deriveNounBlanks) → article_blank_sets 로 materialize → 상/중/하 tier 동작.
//   멱등: 이미 세트 있는 조문 skip. 시범 실행: `--limit 8`. 전체: 인자 없이.
//   실행: npx tsx scripts/gen-civil-noun-sets.ts [--limit N] [--commit]
//     --commit 없으면 dry(생성 대상만 집계·미기록).

import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

import { deriveNounBlanks } from "~/features/blanks/lib/noun-blanks";
import { parseArticleBody } from "~/features/laws/lib/article-body";

const OWNER_ID = "e20ac99a-bfa6-4862-94dd-23c063189463"; // admin 임병웅(system 소유)
const args = process.argv.slice(2);
const commit = args.includes("--commit");
const limitArg = args.find((a) => a.startsWith("--limit"));
const limit = limitArg ? Number(args[args.indexOf(limitArg) + 1]) : Infinity;

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const c = createClient(url, key, { auth: { persistSession: false } });

const host = new URL(url).host;
if (!host.includes("mcgdoplo")) throw new Error("ABORT: not prod(mcgdoplo)");

const { data: law } = await c
  .from("laws")
  .select("law_id")
  .eq("law_code", "civil")
  .maybeSingle();
if (!law) throw new Error("no civil law");

// 1) 민법 조문(level=article, 리비전 있음) 전량 페이지네이션.
type Art = { article_id: string; current_revision_id: string; display_label: string };
const arts: Art[] = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await c
    .from("articles")
    .select("article_id, current_revision_id, display_label")
    .eq("law_id", law.law_id)
    .eq("level", "article")
    .not("current_revision_id", "is", null)
    .order("path")
    .range(from, from + 999);
  if (error) throw error;
  const rows = (data ?? []) as Art[];
  arts.push(...rows);
  if (rows.length < 1000) break;
}
console.log("민법 조문(리비전 有):", arts.length);

// 2) 이미 세트 있는 조문 id 집합(150 배치).
const hasSet = new Set<string>();
const allIds = arts.map((a) => a.article_id);
for (let i = 0; i < allIds.length; i += 150) {
  const chunk = allIds.slice(i, i + 150);
  const { data } = await c
    .from("article_blank_sets")
    .select("article_id")
    .in("article_id", chunk);
  for (const r of data ?? []) hasSet.add(r.article_id);
}
console.log("이미 세트 있는 조문:", hasSet.size);

// 3) 세트 없는 조문만, limit 적용.
const targets = arts.filter((a) => !hasSet.has(a.article_id)).slice(0, limit);
console.log("생성 대상(세트 없음):", targets.length, commit ? "[COMMIT]" : "[DRY]");

// 4) body_json 배치 조회.
const revToBody = new Map<string, unknown>();
const revIds = targets.map((a) => a.current_revision_id);
for (let i = 0; i < revIds.length; i += 150) {
  const chunk = revIds.slice(i, i + 150);
  const { data } = await c
    .from("article_revisions")
    .select("revision_id, body_json")
    .in("revision_id", chunk);
  for (const r of data ?? []) revToBody.set(r.revision_id, r.body_json);
}

// 5) 각 조문 명사 빈칸 생성 → insert row.
type Row = {
  article_id: string;
  owner_id: string;
  version: string;
  body_text: string;
  display_name: string;
  importance: number;
  blanks: unknown;
};
const rows: Row[] = [];
let empty = 0;
const samples: string[] = [];
for (const a of targets) {
  const body = parseArticleBody(revToBody.get(a.current_revision_id));
  if (!body) {
    empty++;
    continue;
  }
  const blanks = deriveNounBlanks(body);
  if (blanks.length === 0) {
    empty++;
    continue;
  }
  rows.push({
    article_id: a.article_id,
    owner_id: OWNER_ID,
    version: "자동생성",
    body_text: "",
    display_name: "자동 명사 빈칸",
    importance: 0,
    blanks: blanks as unknown,
  });
  if (samples.length < 8)
    samples.push(
      `${a.display_label}: ${blanks.map((b) => b.answer).join("·")}`,
    );
}
console.log("생성 예정:", rows.length, "· 명사 0(skip):", empty);
console.log("샘플:\n" + samples.join("\n"));

// 6) COMMIT — 100개씩 insert.
if (commit && rows.length > 0) {
  let done = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const { error } = await c.from("article_blank_sets").insert(chunk as never);
    if (error) throw error;
    done += chunk.length;
    console.log(`  inserted ${done}/${rows.length}`);
  }
  console.log("완료:", done, "세트 생성");
} else if (!commit) {
  console.log("(DRY — --commit 붙이면 실제 생성)");
}
