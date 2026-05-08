import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ids = [
  "199b3d05-8ffd-49ee-abea-8bf6335455be",
  "39a58892-4458-4b10-93a8-e86735d33ee4",
  "3678f9bf-4fe6-4271-83e0-1b23dea141a5",
  "44b0475f-60ac-4a4e-90ec-ffe4b33dd809",
  "460d8e97-9825-40b1-a6f3-0838ce4cda90",
];
const { data, error } = await supa.from("problems").select("problem_id, explanation_md").in("problem_id", ids);
if (error) { console.error(error); process.exit(1); }
for (const r of data) {
  const m = (r.explanation_md ?? "").match(/!\[\]\([^)]+\.png\)/g);
  console.log(r.problem_id, m);
}
