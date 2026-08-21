// 참조 법령 조문 적재 — 국가법령정보센터 API (원장 지시 2026-08-21).
//
// 판례 도식의 법조문 인용 중 5과목(특허·상표·디자인·민법·민사소송법)이 아닌 법령을
// reference_laws / reference_articles 에 적재한다. 도식의 법조문 칩을 눌렀을 때
// 본문을 보여주기 위한 **읽기 전용 참조**다 — articles 와 달리 학습 대상이 아니다.
//
// ★법령 검색은 search=1 이 필수다. 없으면 유사어 검색이 되어 "상법" 이 엉뚱한 법률
//   목록으로 돌아온다(판례 API 와 같은 함정 — CLAUDE.md 참조).
// ★멱등 — 같은 법령을 다시 돌리면 조문을 지우고 현행으로 다시 채운다(법 개정 반영).
//
//   node scripts/laws/import-reference-laws.mjs                    # dry-run(전체)
//   node scripts/laws/import-reference-laws.mjs --apply
//   node scripts/laws/import-reference-laws.mjs --law 실용신안법 --apply
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const ONLY = argv.includes("--law") ? argv[argv.indexOf("--law") + 1] : null;
const OC = "test";

/**
 * 적재 대상 — 판례 도식이 실제로 인용한 국내 법률.
 * aliases 는 판결문이 쓰는 약칭. 도식 표기를 이 이름으로도 맞춘다.
 */
const TARGETS = [
  { name: "실용신안법", aliases: [] },
  { name: "독점규제 및 공정거래에 관한 법률", aliases: ["공정거래법", "독점규제법"] },
  { name: "부정경쟁방지 및 영업비밀보호에 관한 법률", aliases: ["부정경쟁방지법"] },
  { name: "약사법", aliases: [] },
  { name: "행정소송법", aliases: [] },
  { name: "행정심판법", aliases: [] },
  { name: "민사집행법", aliases: [] },
  { name: "채무자 회생 및 파산에 관한 법률", aliases: ["채무자회생법", "통합도산법"] },
  { name: "대한민국헌법", aliases: ["헌법"] },
  { name: "상법", aliases: [] },
  { name: "형사소송법", aliases: [] },
  { name: "식물신품종 보호법", aliases: ["식물신품종보호법"] },
  { name: "변리사법", aliases: [] },
  { name: "소송촉진 등에 관한 특례법", aliases: ["소송촉진법"] },
  { name: "식품위생법", aliases: [] },
];

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

async function findLaw(name) {
  // ★search=1 — 법령명 검색. 빼면 유사어 검색이라 정확 일치가 안 잡힌다.
  const url =
    `https://www.law.go.kr/DRF/lawSearch.do?OC=${OC}&target=law&type=JSON` +
    `&display=100&search=1&query=${encodeURIComponent(name)}`;
  const json = await (await fetch(url)).json();
  const list = asArray(json?.LawSearch?.law);
  const exact = list.filter((x) => x.법령명한글 === name);
  return exact.find((x) => x.현행연혁코드 === "현행") ?? exact[0] ?? null;
}

/** 조문단위 → 본문 텍스트. 조문내용이 제목만인 경우 항·호·목을 이어 붙인다. */
function flattenArticle(a) {
  const lines = [String(a.조문내용 ?? "").trim()];
  for (const hang of asArray(a.항)) {
    const h = String(hang.항내용 ?? "").trim();
    if (h) lines.push(h);
    for (const ho of asArray(hang.호)) {
      const t = String(ho.호내용 ?? "").trim();
      if (t) lines.push(`  ${t}`);
      for (const mok of asArray(ho.목)) {
        const m = String(mok.목내용 ?? "").trim();
        if (m) lines.push(`    ${m}`);
      }
    }
  }
  return lines.filter(Boolean).join("\n");
}

/** "0033001" 같은 조문키가 아니라 표기용 번호 — "33" 또는 "126의2". */
function articleNumberOf(a) {
  const main = String(a.조문번호 ?? "").trim();
  const branch = String(a.조문가지번호 ?? "").trim();
  return branch && branch !== "0" ? `${main}의${branch}` : main;
}

function toDate(yyyymmdd) {
  const s = String(yyyymmdd ?? "");
  return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}` : null;
}

async function importOne(target) {
  const hit = await findLaw(target.name);
  if (!hit) {
    console.log(`✗ ${target.name} — 법령 검색 실패`);
    return { ok: false };
  }
  const detail = await (
    await fetch(
      `https://www.law.go.kr/DRF/lawService.do?OC=${OC}&target=law&type=JSON&MST=${hit.법령일련번호}`,
    )
  ).json();
  const units = asArray(detail?.법령?.조문?.조문단위).filter((a) => a.조문여부 === "조문");
  if (units.length === 0) {
    console.log(`✗ ${target.name} — 조문 0건`);
    return { ok: false };
  }

  console.log(
    `✓ ${target.name.padEnd(30)} 조문 ${String(units.length).padStart(4)} · 시행 ${hit.시행일자}`,
  );
  if (!APPLY) return { ok: true, count: units.length };

  const { data: law, error: lawErr } = await sb
    .from("reference_laws")
    .upsert(
      {
        law_name: target.name,
        aliases: target.aliases,
        law_mst: String(hit.법령일련번호),
        enforced_at: toDate(hit.시행일자),
        source_fetched_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "law_name" },
    )
    .select("ref_law_id")
    .single();
  if (lawErr) throw new Error(`${target.name}: ${lawErr.message}`);

  // 멱등 — 개정으로 조문이 사라질 수도 있어 통째로 갈아 끼운다.
  const { error: delErr } = await sb
    .from("reference_articles")
    .delete()
    .eq("ref_law_id", law.ref_law_id);
  if (delErr) throw new Error(`${target.name} 삭제: ${delErr.message}`);

  const seen = new Set();
  const rows = [];
  units.forEach((a, i) => {
    const number = articleNumberOf(a);
    // 같은 번호가 두 번 오는 법령이 있다(조문 이동 흔적) — 첫 건만 남긴다.
    if (!number || seen.has(number)) return;
    seen.add(number);
    rows.push({
      ref_law_id: law.ref_law_id,
      article_number: number,
      title: String(a.조문제목 ?? "").trim() || null,
      content_md: flattenArticle(a),
      ord: i,
    });
  });
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await sb.from("reference_articles").insert(rows.slice(i, i + 200));
    if (error) throw new Error(`${target.name} 적재: ${error.message}`);
  }
  console.log(`   → ${rows.length}건 적재`);
  return { ok: true, count: rows.length };
}

const targets = ONLY ? TARGETS.filter((t) => t.name === ONLY || t.aliases.includes(ONLY)) : TARGETS;
if (targets.length === 0) {
  console.error(`대상 법령 없음: ${ONLY}`);
  process.exit(1);
}
let total = 0;
for (const t of targets) {
  const r = await importOne(t);
  total += r.count ?? 0;
}
console.log(`\n조문 합계 ${total}`);
if (!APPLY) console.log("--apply 를 붙이면 적재합니다.");
