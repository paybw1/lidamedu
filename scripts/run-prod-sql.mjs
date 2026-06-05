// 운영 DB(mcgdoplo)에 SQL 실행 — Supabase Management API.
// MCP·직접 pg 연결이 운영을 못 가리키므로(메모: db-production-target) 운영 DDL/쿼리는 이 경로로.
// SUPABASE_ACCESS_TOKEN(.env) 필요.
//
//   node scripts/run-prod-sql.mjs scripts/sql/some.sql

import { readFileSync } from "node:fs";
import "dotenv/config";

const REF = "mcgdoplovrjgklbxmozi"; // 운영
const tok = process.env.SUPABASE_ACCESS_TOKEN;
if (!tok) {
  console.error("SUPABASE_ACCESS_TOKEN 미설정 (.env)");
  process.exit(1);
}
const file = process.argv[2];
if (!file) {
  console.error("사용: node scripts/run-prod-sql.mjs <file.sql>");
  process.exit(1);
}
const sql = readFileSync(file, "utf8");
const res = await fetch(
  `https://api.supabase.com/v1/projects/${REF}/database/query`,
  {
    method: "POST",
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  },
);
const text = await res.text();
console.log(`proj=${REF}  HTTP ${res.status}`);
console.log(text);
if (!res.ok) process.exit(1);
