// admin 화면에서 운영자가 answer 만 입력한 빈칸의 before_context / after_context 를 body_json 에서 자동 채움.
// answer 가 본문에 단일 등장이면 그 위치 기준으로 ±12 글자를 컨텍스트로 저장.

import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("env 없음");
  process.exit(1);
}
const supa = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

function flattenBody(body) {
  if (!body || !Array.isArray(body.blocks)) return "";
  const out = [];
  const walk = (blocks) => {
    for (const b of blocks) {
      if (!b) continue;
      const inline = Array.isArray(b.inline) ? b.inline : [];
      for (const t of inline) {
        if (!t) continue;
        if (typeof t.text === "string") out.push(t.text);
        else if (typeof t.raw === "string") out.push(t.raw);
      }
      if (Array.isArray(b.children)) walk(b.children);
    }
  };
  walk(body.blocks);
  return out.join(" ");
}

function findUnique(text, needle) {
  const first = text.indexOf(needle);
  if (first === -1) return -1;
  const second = text.indexOf(needle, first + needle.length);
  if (second !== -1) return -1;
  return first;
}

async function main() {
  const { data: sets, error } = await supa
    .from("article_blank_sets")
    .select("set_id, blanks, articles(current_revision_id)");
  if (error) throw error;

  const revIds = [
    ...new Set(
      (sets ?? [])
        .map((s) => s.articles?.current_revision_id)
        .filter(Boolean),
    ),
  ];
  const { data: revs } = await supa
    .from("article_revisions")
    .select("revision_id, body_json")
    .in("revision_id", revIds);
  const revById = new Map((revs ?? []).map((r) => [r.revision_id, r.body_json]));

  let updatedSets = 0;
  let backfilled = 0;
  for (const s of sets ?? []) {
    if (!Array.isArray(s.blanks)) continue;
    const revId = s.articles?.current_revision_id;
    if (!revId) continue;
    const body = revById.get(revId);
    if (!body) continue;
    const flat = flattenBody(body);
    if (!flat) continue;

    let changed = false;
    const next = s.blanks.map((b) => {
      const ans = (b.answer ?? "").trim();
      if (!ans) return b;
      const hasBefore = (b.before_context ?? "").length > 0;
      const hasAfter = (b.after_context ?? "").length > 0;
      if (hasBefore || hasAfter) return b;
      const pos = findUnique(flat, ans);
      if (pos === -1) return b;
      const before = flat.slice(Math.max(0, pos - 12), pos);
      const after = flat.slice(
        pos + ans.length,
        Math.min(flat.length, pos + ans.length + 12),
      );
      changed = true;
      backfilled++;
      return { ...b, before_context: before, after_context: after };
    });
    if (!changed) continue;

    const { error: upErr } = await supa
      .from("article_blank_sets")
      .update({ blanks: next })
      .eq("set_id", s.set_id);
    if (upErr) {
      console.error(`update ${s.set_id}: ${upErr.message}`);
      continue;
    }
    updatedSets++;
  }

  console.log("");
  console.log(`backfilled blanks: ${backfilled}`);
  console.log(`updated sets: ${updatedSets}`);
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
