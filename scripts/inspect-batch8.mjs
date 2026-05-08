import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const ids = [
  "eb55ee85-fc16-4012-9d47-3eef70afa418",
  "f2ceb436-5e32-42ff-8217-0c8e2bc2f987",
  "f91a7270-2a46-433f-a873-e5f90700b920",
];

for (const id of ids) {
  const { data } = await supa.from("problems").select("explanation_md").eq("problem_id", id).single();
  const matches = (data?.explanation_md ?? "").match(/!\[\]\([^)]+\)/g) ?? [];
  console.log(id, matches);
}
