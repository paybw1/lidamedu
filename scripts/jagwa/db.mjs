// Shared DB access for the 자과 적재 pipeline. Targets PRODUCTION (mcgdoplo) via .env.
// Hard guard: refuses to act unless the connection/URL references the prod project ref,
// so we never accidentally hit the stale nctokynz that MCP/build/CLI point at.
import "dotenv/config";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

export const PROD_REF = "mcgdoplovrjgklbxmozi";

function assertProd(s, what) {
  if (!s || !s.includes(PROD_REF)) {
    throw new Error(`SAFETY: ${what} does not reference production ref ${PROD_REF} → refusing`);
  }
}

export function pgClient() {
  const cs = process.env.DATABASE_URL;
  assertProd(cs, "DATABASE_URL");
  return new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
}

export function adminClient() {
  const url = process.env.SUPABASE_URL;
  assertProd(url, "SUPABASE_URL");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("missing SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
