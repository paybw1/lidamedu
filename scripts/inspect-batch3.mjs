import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ids = [
  "536a26fd-6ca9-411f-bef1-b03f77a520a5",
  "58ccc15d-4f98-4214-9d0a-849ce3bdcaf7",
  "5c743756-3268-4c1d-b3a0-28be313a1ca3",
  "70ff22b8-4755-4bdd-b1c3-1bd674af5fb7",
  "7fab9cdd-a1b2-48ab-bd92-76c55993b02a",
];
const { data } = await supa.from("problems").select("problem_id, explanation_md").in("problem_id", ids);
for (const r of data) {
  const m = (r.explanation_md ?? "").match(/!\[\]\([^)]+\.png\)/g);
  console.log(r.problem_id, m);
}
