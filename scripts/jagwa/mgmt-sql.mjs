// Run a .sql file against PRODUCTION (mcgdoplo) via the Supabase Management API.
// Targets the project by explicit ref (NOT the stale MCP/CLI). Usage:
//   node scripts/jagwa/mgmt-sql.mjs scripts/sql/xxxx.sql
//   node scripts/jagwa/mgmt-sql.mjs --query "select 1"
import "dotenv/config";
import fs from "node:fs";

const REF = "mcgdoplovrjgklbxmozi";
const tok = process.env.SUPABASE_ACCESS_TOKEN;
if (!tok) throw new Error("missing SUPABASE_ACCESS_TOKEN");
// safety: ensure .env really points at the prod ref
if (!String(process.env.SUPABASE_URL).includes(REF)) {
  throw new Error(`SAFETY: SUPABASE_URL does not reference ${REF} → refusing`);
}

const arg = process.argv[2];
let query;
if (arg === "--query") query = process.argv[3];
else if (arg) query = fs.readFileSync(arg, "utf8");
else throw new Error("usage: mgmt-sql.mjs <file.sql> | --query <sql>");

const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query }),
});
const text = await res.text();
console.log("HTTP", res.status);
console.log(text);
if (!res.ok) process.exit(1);
