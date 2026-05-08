import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const ids = [
  "a27850a5-0b47-4400-b74a-cb0da61185df",
  "a7c348d0-aeba-49ac-98a9-524e43a5c0e7",
  "a93e7ce3-eaae-487d-8850-dbcace3870bb",
  "beee563d-ba1c-4ba7-8e4d-9ecdd8f58d0d",
];

for (const id of ids) {
  const { data } = await supa.from("problems").select("explanation_md").eq("problem_id", id).single();
  const matches = (data?.explanation_md ?? "").match(/!\[\]\([^)]+\)/g) ?? [];
  console.log(id, matches);
}
