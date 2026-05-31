/**
 * SRS v2 시드 스크립트 — 5 과목별 ~30개씩 srs_items 자동 생성.
 *
 * 입력: 기존 articles + article_revisions.body_text 에서 변환.
 *   front = "{과목명} {display_label}"
 *   back  = body_text (조문 본문, 최대 500자)
 *   source_type='article', source_id=article_id (idempotency)
 *
 * 멱등: 같은 (source_type, source_id) 가 이미 있으면 skip.
 *
 * 실행:
 *   npx dotenv -e .env -- npx tsx scripts/srs/seed-items.ts [--per-subject=30]
 */

import { createClient } from "@supabase/supabase-js";

import type { Database } from "../../database.types";
import { flattenBodyForCard } from "../../app/features/srs/lib/srs-flatten";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error(
    "SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다",
  );
}

const admin = createClient<Database>(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SUBJECTS: Array<{ slug: string; name: string }> = [
  { slug: "patent", name: "특허법" },
  { slug: "trademark", name: "상표법" },
  { slug: "design", name: "디자인보호법" },
  { slug: "civil", name: "민법" },
  { slug: "civil-procedure", name: "민사소송법" },
];

const perSubjectArg = process.argv.find((a) => a.startsWith("--per-subject="));
const PER_SUBJECT = perSubjectArg ? Number(perSubjectArg.split("=")[1]) : 30;

async function main() {
  console.log(
    `[srs-seed] 과목당 ${PER_SUBJECT}개씩 srs_items 시드 시작...`,
  );

  let total = 0;
  let skipped = 0;
  let inserted = 0;

  for (const subj of SUBJECTS) {
    // 1) law_id 확보.
    const { data: law } = await admin
      .from("laws")
      .select("law_id")
      .eq("law_code", subj.slug)
      .maybeSingle();
    if (!law) {
      console.log(`  [${subj.slug}] laws 미존재 — skip`);
      continue;
    }

    // 2) 후보 articles — current_revision_id 있고 level='article', importance desc.
    const { data: arts } = await admin
      .from("articles")
      .select(
        "article_id, article_number, display_label, importance, current_revision_id",
      )
      .eq("law_id", law.law_id)
      .eq("level", "article")
      .is("deleted_at", null)
      .not("current_revision_id", "is", null)
      .order("importance", { ascending: false, nullsFirst: false })
      .limit(PER_SUBJECT * 2);

    if (!arts || arts.length === 0) {
      console.log(`  [${subj.slug}] articles 없음 — skip`);
      continue;
    }

    // 3) 이미 시드된 source_id 들 — 멱등.
    const articleIds = arts.map((a) => a.article_id);
    const { data: existing } = await admin
      .from("srs_items")
      .select("source_id")
      .eq("source_type", "article")
      .in("source_id", articleIds);
    const existingSet = new Set(
      (existing ?? []).map((r) => r.source_id).filter(Boolean) as string[],
    );

    // 4) 신규 후보 + 본문 fetch.
    const candidates = arts.filter((a) => !existingSet.has(a.article_id));
    const pick = candidates.slice(0, PER_SUBJECT);
    const skipCount = arts.filter((a) => existingSet.has(a.article_id)).length;
    skipped += skipCount;

    if (pick.length === 0) {
      console.log(
        `  [${subj.slug}] 후보 ${arts.length}개 모두 이미 시드됨 — skip`,
      );
      continue;
    }

    // 5) 본문 일괄 조회.
    const revIds = pick
      .map((a) => a.current_revision_id)
      .filter((x): x is string => x !== null);
    const { data: revs } = await admin
      .from("article_revisions")
      .select("revision_id, body_text")
      .in("revision_id", revIds);
    const bodyMap = new Map<string, string>();
    for (const r of revs ?? []) {
      if (r.body_text) bodyMap.set(r.revision_id, r.body_text);
    }

    // 6) srs_items insert.
    const rows = pick.map((a) => {
      const raw =
        (a.current_revision_id ? bodyMap.get(a.current_revision_id) : null) ??
        null;
      const flat = raw ? flattenBodyForCard(raw) : null;
      const body = flat ?? raw ?? "(본문 미시드 — 학습 화면에서 확인)";
      return {
        subject: subj.slug,
        topic: a.display_label,
        type: "qa" as const,
        front: `${subj.name} ${a.display_label}`,
        back: body,
        law_ref: `${subj.slug}#${a.article_number ?? ""}`.replace(/#$/, ""),
        source: `seed:${new Date().toISOString().slice(0, 10)}`,
        source_type: "article" as const,
        source_id: a.article_id,
      };
    });

    const { error: insErr, count } = await admin
      .from("srs_items")
      .insert(rows, { count: "exact" });
    if (insErr) {
      console.error(`  [${subj.slug}] 실패:`, insErr.message);
      continue;
    }
    inserted += count ?? rows.length;
    total += rows.length;
    console.log(
      `  [${subj.slug}] ${rows.length}개 시드 (${skipCount}개 기존 skip)`,
    );
  }

  console.log(
    `\n[srs-seed] 완료. 신규 ${inserted} · skip ${skipped} · 시도 ${total}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
