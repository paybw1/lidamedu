/**
 * 민법 조문 기출 빈도 기반 중요도(importance) 부여.
 * 결합점수 = primary_article_id 횟수(문제 주조문) + 승인된 정오문제 선지 조문매칭 횟수.
 *   score>=12 → 3 (최빈출) / 6-11 → 2 (빈출) / 2-5 → 1 (기출) / <=1 → 0 (미수록)
 *
 * dry-run: npx dotenv -e .env -- node scripts/srs/civil-importance.mjs
 * 반영:    npx dotenv -e .env -- node scripts/srs/civil-importance.mjs --apply
 */
import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const APPLY = process.argv.includes("--apply");

function tierFor(score) {
  if (score >= 12) return 3;
  if (score >= 6) return 2;
  if (score >= 2) return 1;
  return 0;
}

async function fetchAll(build) {
  let all = [];
  let from = 0;
  for (;;) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw error;
    all = all.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return all;
}

async function main() {
  const { data: laws } = await admin.from("laws").select("law_id, law_code");
  const lawId = laws.find((l) => l.law_code === "civil").law_id;

  const arts = await fetchAll(() =>
    admin
      .from("articles")
      .select("article_id, article_number, importance")
      .eq("law_id", lawId)
      .order("article_id"),
  );
  const byId = new Map(arts.map((a) => [a.article_id, a]));
  const byNum = new Map(arts.map((a) => [String(a.article_number), a]));

  const probs = await fetchAll(() =>
    admin
      .from("problems")
      .select("primary_article_id")
      .eq("law_id", lawId)
      .is("deleted_at", null)
      .order("problem_id"),
  );
  const score = new Map();
  const add = (id, n) => id && score.set(id, (score.get(id) || 0) + n);
  for (const p of probs) add(p.primary_article_id, 1);

  const sug = await fetchAll(() =>
    admin
      .from("ox_article_suggestions")
      .select("suggested_article_number, status")
      .eq("law_code", "civil")
      .eq("status", "approved")
      .order("suggestion_id"),
  );
  for (const s of sug) {
    if (s.suggested_article_number == null) continue;
    const a = byNum.get(String(s.suggested_article_number));
    if (a) add(a.article_id, 1);
  }

  // 등급 산정 (전 조문: 점수 없으면 0)
  const plan = [];
  const tierDist = { 0: 0, 1: 0, 2: 0, 3: 0 };
  const changeDist = { 0: 0, 1: 0, 2: 0, 3: 0 };
  for (const a of arts) {
    const s = score.get(a.article_id) || 0;
    const tier = tierFor(s);
    tierDist[tier]++;
    if ((a.importance ?? 0) !== tier) {
      plan.push({ id: a.article_id, tier, cur: a.importance ?? 0, num: a.article_number, s });
      changeDist[tier]++;
    }
  }

  console.log(`[civil-importance] mode=${APPLY ? "APPLY" : "DRY-RUN"}`);
  console.log(`  대상 조문 ${arts.length} · 인용 조문 ${score.size}`);
  console.log(
    `  등급분포  ★3=${tierDist[3]} ★2=${tierDist[2]} ★1=${tierDist[1]} ★0=${tierDist[0]}`,
  );
  console.log(
    `  변경필요  ${plan.length}건 (→★3 ${changeDist[3]} ★2 ${changeDist[2]} ★1 ${changeDist[1]} ★0 ${changeDist[0]})`,
  );
  const top = plan
    .filter((p) => p.tier === 3)
    .sort((a, b) => b.s - a.s)
    .slice(0, 8);
  console.log("  ★3 예시:", top.map((t) => `제${t.num}조(${t.s})`).join(" "));

  if (!APPLY) {
    console.log("  (dry-run — 반영하려면 --apply)");
    return;
  }

  let done = 0;
  for (const p of plan) {
    const { error } = await admin
      .from("articles")
      .update({ importance: p.tier })
      .eq("article_id", p.id);
    if (error) throw error;
    done++;
    if (done % 100 === 0) console.log(`  ...${done}/${plan.length}`);
  }
  console.log(`[civil-importance] 완료 — ${done}건 갱신`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
