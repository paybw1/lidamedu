import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const ids = [
  "bce3a410-ad8b-498a-9cfc-aa8a66b522a6",
  "cb98f0a8-0861-4b48-a902-20f59e88d1e8",
  "cfb9321f-d5d7-49f6-a465-078709974e02",
  "d459cc97-ef3d-419e-9c91-b94f98320310",
];

for (const id of ids) {
  const { data } = await supa.from("problems").select("explanation_md").eq("problem_id", id).single();
  const matches = (data?.explanation_md ?? "").match(/!\[\]\([^)]+\)/g) ?? [];
  console.log(id, matches);
}
