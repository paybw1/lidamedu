import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: law } = await sb.from("laws").select("law_id").eq("law_code", "patent").single();
const KEEP = new Set(["총리령 제2115호", "법률 제21134호"]);
const { data: revs } = await sb.from("law_revisions").select("law_revision_id, revision_number, created_at").eq("law_id", law.law_id);
const targets = (revs ?? []).filter((r) => !KEEP.has(r.revision_number));
for (const t of targets.sort((a, b) => a.created_at.localeCompare(b.created_at))) {
  const { data: ars } = await sb
    .from("article_revisions")
    .select("revision_id, article_id, effective_date, expired_date, change_kind")
    .eq("law_revision_id", t.law_revision_id);
  for (const ar of ars ?? []) {
    const { data: art } = await sb
      .from("articles")
      .select("display_label, current_revision_id")
      .eq("article_id", ar.article_id)
      .single();
    const isCurrent = art.current_revision_id === ar.revision_id;
    console.log(
      t.revision_number.slice(0, 30).padEnd(32),
      "→", (art.display_label ?? "").padEnd(10),
      "expired:", ar.expired_date ?? "없음",
      isCurrent ? "★현재 시행 스냅샷" : "(비현재)",
    );
  }
}
