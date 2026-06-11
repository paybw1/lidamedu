// Print env var NAMES relevant to Supabase + the URL host only (no secret values).
import "dotenv/config";
const keys = Object.keys(process.env).filter((k) =>
  /SUPABASE|SERVICE_ROLE|ANON|DATABASE_URL|POSTGRES|DIRECT_URL|PG/i.test(k),
);
console.log("matching env var names:");
for (const k of keys) {
  const v = process.env[k] || "";
  let info = `len=${v.length}`;
  // show only host for URLs / connection strings
  const m = v.match(/@([^/:]+)|https?:\/\/([^/]+)/);
  if (m) info += ` host=${m[1] || m[2]}`;
  console.log(`  ${k}: ${info}`);
}
