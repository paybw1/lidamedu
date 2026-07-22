/**
 * 민법 조문 암기카드 생성 (★1↑, 기출빈도 중요도 부여 후).
 * dry-run: npx dotenv -e .env -- npx tsx scripts/srs/civil-cards.ts
 * 반영:    npx dotenv -e .env -- npx tsx scripts/srs/civil-cards.ts --apply
 */
import { createClient } from "@supabase/supabase-js";

import type { Database } from "../../database.types";
import {
  generateCards,
  previewCards,
  type CardGenParams,
} from "../../app/features/srs/card-gen.server";
import type { LawSubjectSlug } from "../../app/features/subjects/lib/subjects";

const admin = createClient<Database>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);
const APPLY = process.argv.includes("--apply");

const TARGET: CardGenParams = {
  subject: "civil" as LawSubjectSlug,
  sourceType: "article",
  importanceMin: 1,
  limit: 1000,
};

async function main() {
  const { data: adminRow } = await admin
    .from("profiles")
    .select("profile_id")
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();
  const createdBy = adminRow?.profile_id;
  if (!createdBy) throw new Error("admin 프로필 없음");

  console.log(`[civil-cards] mode=${APPLY ? "APPLY" : "DRY-RUN"}`);
  const p = await previewCards(admin, TARGET);
  console.log(
    `  후보 ${p.candidateCount} · 신규 ${p.wouldInsert} · 갱신 ${p.wouldUpdate} · maxBack ${p.maxBackLen} · 잘림 ${p.truncatedCount}`,
  );
  if (!APPLY) {
    console.log("  (dry-run — 반영하려면 --apply)");
    return;
  }
  const r = await generateCards(admin, TARGET, createdBy, {
    insertNew: true,
    updateExisting: true,
  });
  console.log(`[civil-cards] 완료 — 신규 ${r.inserted} · 갱신 ${r.updated} · skip ${r.skipExisting}`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
