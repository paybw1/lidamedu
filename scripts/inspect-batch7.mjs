import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const ids = [
  "d48fa650-a6fa-46c2-978b-f4a0cd9cf4c7",
  "d934d68d-66c1-40bc-82ff-c32ce510a8d4",
  "d9a95c84-4217-4e9f-b20d-251adafe262f",
  "ea09c569-89ed-49f7-9879-7e2ed309a0c8",
];

for (const id of ids) {
  const { data } = await supa.from("problems").select("explanation_md").eq("problem_id", id).single();
  const matches = (data?.explanation_md ?? "").match(/!\[\]\([^)]+\)/g) ?? [];
  console.log(id, matches);
}
