// §3 — official_text_md 적재된 cases 를 content_chunks 에 dirty 마킹.
//
// 기본: tmp/law-api-state.json 에 처리된 사건번호 전체.
// 또는 --case-numbers "2012후726,2023후11340" 로 명시.
//
// 호출: reindexCases() — chunkCase 로 (요지, 이유, 평석, 공식전문) 4섹션 생성, upsertChunks.
// content_hash 동일 청크는 unchanged 처리 (재임베딩 skip). 공식전문은 신규라 dirty.
//
// dirty 마킹 후 임베딩은 별도 cron (`/cron/embed-chunks?secret=...`) 또는 cron 라우트 호출이 처리.

import "dotenv/config";

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

import { reindexCases } from "../../app/features/ai-qna/lib/source-chunker.server";
const SUPA = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const args = process.argv.slice(2);
function arg(name: string, fallback: string | null = null): string | null {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
}

async function pickCaseIds(): Promise<string[]> {
  const list = arg("--case-numbers");
  if (list) {
    const numbers = list.split(",").map((s) => s.trim()).filter(Boolean);
    const { data, error } = await SUPA
      .from("cases")
      .select("case_id, case_number, official_text_md")
      .in("case_number", numbers)
      .is("deleted_at", null);
    if (error) throw error;
    return (data ?? []).filter((r) => r.official_text_md).map((r) => r.case_id);
  }
  const statePath = resolve(process.cwd(), "tmp/law-api-state.json");
  if (!existsSync(statePath)) {
    process.stderr.write("tmp/law-api-state.json 없음 — --case-numbers 직접 지정\n");
    process.exit(1);
  }
  const state = JSON.parse(readFileSync(statePath, "utf-8")) as {
    processed?: Record<string, { caseId?: string }>;
  };
  const ids = Object.values(state.processed ?? {})
    .map((s) => s?.caseId)
    .filter((v): v is string => typeof v === "string");
  return [...new Set(ids)];
}

async function preCount(caseIds: string[]): Promise<number> {
  const { count } = await SUPA
    .from("content_chunks")
    .select("chunk_id", { count: "exact", head: true })
    .eq("source_type", "case")
    .in("source_id", caseIds);
  return count ?? 0;
}

async function dirtyCount(caseIds: string[]): Promise<number> {
  const { count } = await SUPA
    .from("content_chunks")
    .select("chunk_id", { count: "exact", head: true })
    .eq("source_type", "case")
    .in("source_id", caseIds)
    .is("embedded_at", null);
  return count ?? 0;
}

const caseIds = await pickCaseIds();
process.stdout.write(`\n=== §3 reindex (${caseIds.length} cases) ===\n`);
process.stdout.write(`  source: ${arg("--case-numbers") ? "--case-numbers" : "tmp/law-api-state.json"}\n`);

const before = await preCount(caseIds);
const beforeDirty = await dirtyCount(caseIds);
process.stdout.write(`  before:  total chunks=${before}, dirty=${beforeDirty}\n`);

await reindexCases(caseIds);

const after = await preCount(caseIds);
const afterDirty = await dirtyCount(caseIds);
process.stdout.write(`  after:   total chunks=${after}, dirty=${afterDirty}\n`);
process.stdout.write(`  delta:   total +${after - before}, dirty +${afterDirty - beforeDirty}\n`);

// 청크 분포 — 어떤 섹션이 추가됐는지 식별.
const { data: chunks } = await SUPA
  .from("content_chunks")
  .select("source_id, chunk_index, heading_path, token_count, embedded_at")
  .eq("source_type", "case")
  .in("source_id", caseIds)
  .order("source_id", { ascending: true })
  .order("chunk_index", { ascending: true });
process.stdout.write(`\n=== 청크 분포 ===\n`);
for (const c of chunks ?? []) {
  const last = (c.heading_path ?? "").split("·").pop()?.trim() ?? "?";
  const sid = c.source_id.slice(0, 8);
  const dirty = c.embedded_at ? "" : "  (dirty)";
  process.stdout.write(`  ${sid}…  idx=${c.chunk_index}  ${last.padEnd(8)}  ~${c.token_count} tok${dirty}\n`);
}

process.stdout.write(`\n다음: cron 호출로 임베딩 실행 (CRON_SECRET 환경변수 + Vercel 호출).\n`);
