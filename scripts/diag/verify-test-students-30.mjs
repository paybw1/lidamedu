// CSV 의 30개 profile_id 가 실제 .env DB 에 살아있고 role=student 인지 확인.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import "dotenv/config";

const supa = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const csv = readFileSync("test-students-30.csv", "utf8").split("\n").slice(1).filter(Boolean);
const ids = csv.map((l) => l.split(",")[3]);
const { data, error } = await supa
  .from("profiles")
  .select("profile_id, name, role")
  .in("profile_id", ids);
if (error) {
  console.error(error.message);
  process.exit(1);
}
const found = new Set(data.map((r) => r.profile_id));
const missing = ids.filter((id) => !found.has(id));
const nonStudent = (data ?? []).filter((r) => r.role !== "student");
console.log(`CSV ids       : ${ids.length}`);
console.log(`DB hits       : ${data.length}`);
console.log(`missing in DB : ${missing.length}`);
console.log(`non-student   : ${nonStudent.length}`);
if (missing.length) console.log("missing:", missing.slice(0, 5));
if (nonStudent.length) console.log("non-student:", nonStudent.slice(0, 5));
