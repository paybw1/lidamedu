/**
 * feat-2-023c — 암기카드 풀 확장(①). 특허·상표·디자인 조문/판례를 ★1↑로 생성/동기화.
 * dry-run 기본, --apply 로 실제 반영. importance 비정규화도 함께 동기화(updateExisting).
 *
 * 실행:
 *   dry-run: npx dotenv -e .env -- npx tsx scripts/srs/generate-cards.ts
 *   반영:    npx dotenv -e .env -- npx tsx scripts/srs/generate-cards.ts --apply
 */

import { createClient } from "@supabase/supabase-js";

import type { Database } from "../../database.types";
import {
  generateCards,
  previewCards,
  type CardGenParams,
} from "../../app/features/srs/card-gen.server";
import type { LawSubjectSlug } from "../../app/features/subjects/lib/subjects";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient<Database>(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const APPLY = process.argv.includes("--apply");

const TARGETS: CardGenParams[] = [
  { subject: "patent" as LawSubjectSlug, sourceType: "article", importanceMin: 1, limit: 500 },
  { subject: "trademark" as LawSubjectSlug, sourceType: "article", importanceMin: 1, limit: 500 },
  { subject: "design" as LawSubjectSlug, sourceType: "article", importanceMin: 1, limit: 500 },
  { subject: "patent" as LawSubjectSlug, sourceType: "case", importanceMin: 1, limit: 500 },
  { subject: "trademark" as LawSubjectSlug, sourceType: "case", importanceMin: 1, limit: 500 },
  { subject: "design" as LawSubjectSlug, sourceType: "case", importanceMin: 1, limit: 500 },
];

async function main() {
  // created_by = 원장(admin) 프로필.
  const { data: adminRow } = await admin
    .from("profiles")
    .select("profile_id")
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();
  const createdBy = adminRow?.profile_id;
  if (!createdBy) throw new Error("admin 프로필 없음");

  console.log(`[gen-cards] mode=${APPLY ? "APPLY" : "DRY-RUN"} createdBy=${createdBy.slice(0, 8)}`);
  let totalInsert = 0;
  let totalUpdate = 0;
  for (const t of TARGETS) {
    const p = await previewCards(admin, t);
    console.log(
      `  ${t.subject}/${t.sourceType} floor≥${t.importanceMin}: 후보 ${p.candidateCount} · 신규 ${p.wouldInsert} · 갱신 ${p.wouldUpdate} · maxBack ${p.maxBackLen} · 잘림 ${p.truncatedCount}`,
    );
    if (APPLY) {
      const r = await generateCards(admin, t, createdBy, {
        insertNew: true,
        updateExisting: true,
      });
      console.log(`      → inserted ${r.inserted} · updated ${r.updated} · skip ${r.skipExisting}`);
      totalInsert += r.inserted;
      totalUpdate += r.updated;
    }
  }
  if (APPLY) console.log(`[gen-cards] 완료 — 신규 ${totalInsert} · 갱신 ${totalUpdate}`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
