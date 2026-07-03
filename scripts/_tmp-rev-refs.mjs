import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: law } = await sb.from("laws").select("law_id").eq("law_code", "patent").single();
const KEEP = new Set(["총리령 제2115호", "법률 제21134호"]);
const { data: revs } = await sb.from("law_revisions").select("law_revision_id, revision_number").eq("law_id", law.law_id);
const targets = (revs ?? []).filter((r) => !KEEP.has(r.revision_number));
console.log("삭제 후보 law_revisions:", targets.length);
for (const t of targets) {
  const { data: ars } = await sb
    .from("article_revisions")
    .select("article_revision_id, article_id, articles!article_revisions_article_id_fkey(display_label, current_revision_id)")
    .eq("law_revision_id", t.law_revision_id);
  for (const ar of ars ?? []) {
    const isCurrent = ar.articles?.current_revision_id === ar.article_revision_id;
    console.log(t.revision_number, "→", ar.articles?.display_label ?? ar.article_id, isCurrent ? "★현재 시행 스냅샷" : "(비현재)");
  }
}
