import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const ids = [
  "80406e69-a347-42ea-a6ff-0403d8bd062d",
  "87663e24-b5c7-402b-8e20-2bbbc97a9b8f",
  "8ac029ea-ddf4-4823-83c6-4e31b77c5516",
  "8d4a2c5a-a865-4865-ab65-e42b1daf3dc7",
  "8dd8defa-dd55-4e03-ac44-aafcce186779",
];

for (const id of ids) {
  const { data } = await supa.from("problems").select("explanation_md").eq("problem_id", id).single();
  const matches = (data?.explanation_md ?? "").match(/!\[\]\([^)]+\)/g) ?? [];
  console.log(id, matches);
}
