import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: law } = await sb.from("laws").select("law_id").eq("law_code", "patent").single();
const { data: revs, error } = await sb
  .from("law_revisions")
  .select("*")
  .eq("law_id", law.law_id)
  .order("created_at", { ascending: false });
if (error) throw error;
for (const r of revs ?? []) {
  const { count: artRevs } = await sb.from("article_revisions").select("*", { count: "exact", head: true }).eq("law_revision_id", r.revision_id ?? r.law_revision_id ?? r.id);
  console.log(JSON.stringify({ ...r, article_revisions: artRevs }, null, 0));
}
