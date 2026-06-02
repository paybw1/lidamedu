// §2 — 국가법령정보 OPEN API 판례 전문 적재 파이프라인 (dry-run 우선).
//
// CLAUDE.md non-negotiable #8 준수:
//   다건 일괄 수정은 dry-run 검증 + 사용자 승인 후 apply.
//
// 흐름 (각 입력 사건번호):
//   1) 입력 정규화 → 토큰 (실패 시 input_unparseable)
//   2) 목록 조회 lawSearch.do?target=prec&query=<토큰>
//   3) 응답 prec[] 중 사건번호 정규화 정확 일치 prec 찾기
//        0건 → not_found_in_list
//        2+건 → ambiguous_list_matches
//        1건 → 다음 단계
//   4) 본문 조회 lawService.do?target=prec&ID=<판례일련번호>
//   5) cases 테이블에서 같은 토큰 row 매칭
//   6) verifyTripleMatch (입력·list·service·db 3중 일치)
//   7) 분류: upgrade(보강), newCandidate(신규), failed(매칭 실패)
//
// 매칭 정확성 안전망 (핵심):
//   - first-result-id 사용 금지 — 항상 사건번호 정확 일치로 선택
//   - 모든 단계 토큰이 동일해야 통과 — 하나라도 다르면 reject
//   - raw 응답은 tmp/law-api-raw/ 보존 — 사후 검증 가능
//
// 사용:
//   node scripts/precedents/import-law-precedents.mjs                      # dry-run
//   node scripts/precedents/import-law-precedents.mjs --input <path>       # 입력 파일 지정
//   node scripts/precedents/import-law-precedents.mjs --apply              # 보강 실제 반영 (신규 제외)
//   node scripts/precedents/import-law-precedents.mjs --apply --insert-new # 신규도 insert (주의)
//
// 멱등:
//   tmp/law-api-state.json 에 처리 완료 사건번호·시각 기록.
//   재실행 시 같은 사건번호는 skip(--force 로 우회).
//
// rate limit:
//   호출 간 LAW_API_INTERVAL_MS (기본 600ms). 5xx 시 지수 백오프 3회.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

import {
  caseNumbersEqual,
  extractAllCaseNumbers,
  normalizeCaseNumber,
  verifyTripleMatch,
} from "../../app/features/cases/lib/case-number";
import { normalizeOfficialText } from "../../app/features/cases/lib/normalize-official-text";
import { renderOfficialTextPdf } from "../../app/features/cases/lib/render-official-text-pdf.server";

loadEnv();

// ── env / args ──────────────────────────────────────────────────────────────
const OC = process.env.LAW_API_KEY;
const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const INTERVAL = Number(process.env.LAW_API_INTERVAL_MS ?? 600);
if (!OC) { process.stderr.write("LAW_API_KEY 누락\n"); process.exit(2); }
if (!SUPA_URL || !SUPA_KEY) { process.stderr.write("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 누락\n"); process.exit(2); }

const args = process.argv.slice(2);
function arg(name: string, fallback: string): string {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
}
const flag = (n: string): boolean => args.includes(n);
const INPUT_PATH = resolve(process.cwd(), arg("--input", "tmp/casenum-import-sample.txt"));
const APPLY = flag("--apply");
const INSERT_NEW = flag("--insert-new");
const FORCE = flag("--force");

const TMP = resolve(process.cwd(), "tmp");
const RAW_DIR = resolve(TMP, "law-api-raw");
const STATE_PATH = resolve(TMP, "law-api-state.json");
const REPORT_PATH = resolve(TMP, "law-api-import-report.json");
mkdirSync(RAW_DIR, { recursive: true });

// ── state (멱등) ────────────────────────────────────────────────────────────
interface ImportState {
  processed: Record<
    string,
    { status: "upgrade"; caseId: string; serialId: string; at: string }
  >;
}
function loadState(): ImportState {
  if (!existsSync(STATE_PATH)) return { processed: {} };
  try {
    return JSON.parse(readFileSync(STATE_PATH, "utf-8")) as ImportState;
  } catch {
    return { processed: {} };
  }
}
function saveState(state: ImportState): void {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf-8");
}
const state = loadState();

// ── http ────────────────────────────────────────────────────────────────────
const BASE = "https://www.law.go.kr/DRF";
function buildUrl(
  endpoint: string,
  params: Record<string, string | number | null>,
): string {
  const u = new URL(`${BASE}/${endpoint}`);
  u.searchParams.set("OC", OC!);
  u.searchParams.set("target", "prec");
  u.searchParams.set("type", "XML");
  for (const [k, v] of Object.entries(params))
    if (v != null) u.searchParams.set(k, String(v));
  return u.toString();
}
async function fetchWithBackoff(
  url: string,
  label: string,
): Promise<{ status: number; body: string; elapsedMs: number }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const t0 = Date.now();
    try {
      const r = await fetch(url, { headers: { "User-Agent": "lidami-case-import/0.1" } });
      const body = await r.text();
      if (r.status >= 500) throw new Error(`${label} ${r.status}`);
      return { status: r.status, body, elapsedMs: Date.now() - t0 };
    } catch (e) {
      if (attempt === 2) throw e;
      const wait = 1000 * Math.pow(2, attempt);
      process.stderr.write(`  ${label} 재시도 ${attempt + 1}/3 (${wait}ms)\n`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw new Error(`${label} 재시도 한도 초과`);
}
async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

// ── xml mini parser ─────────────────────────────────────────────────────────
function pickTag(xml: string, tag: string): string | null {
  const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(xml);
  if (!m) return null;
  return m[1].replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "").trim();
}
interface PrecRow {
  판례일련번호: string | null;
  사건번호: string | null;
  사건명: string | null;
  법원명: string | null;
  선고일자: string | null;
  사건종류명: string | null;
}
function pickAllPrec(xml: string): PrecRow[] {
  const out: PrecRow[] = [];
  const re = /<prec[^>]*>([\s\S]*?)<\/prec>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const block = m[1];
    out.push({
      판례일련번호: pickTag(block, "판례일련번호"),
      사건번호: pickTag(block, "사건번호"),
      사건명: pickTag(block, "사건명"),
      법원명: pickTag(block, "법원명"),
      선고일자: pickTag(block, "선고일자"),
      사건종류명: pickTag(block, "사건종류명"),
    });
  }
  return out;
}
function isErrorEnvelope(xml: string): boolean {
  return /<Response>\s*<result>/.test(xml) && /<msg>/.test(xml);
}

// ── supabase ────────────────────────────────────────────────────────────────
const supa = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });

async function loadCasesIndex() {
  const { data, error } = await supa
    .from("cases")
    .select("case_id, case_number, case_title, subject_laws, decided_at, court, official_text_md, law_api_serial_id")
    .is("deleted_at", null);
  if (error) throw error;
  type CaseRow = NonNullable<typeof data>[number];
  const byToken = new Map<string, CaseRow>();
  for (const r of data ?? []) {
    const t = normalizeCaseNumber(r.case_number);
    if (t) byToken.set(t, r);
  }
  return { rows: data ?? [], byToken };
}
type CasesIndex = Awaited<ReturnType<typeof loadCasesIndex>>;

// ── input ──────────────────────────────────────────────────────────────────
function readInput() {
  if (!existsSync(INPUT_PATH)) {
    process.stderr.write(`입력 파일 없음: ${INPUT_PATH}\n`);
    process.exit(3);
  }
  const lines = readFileSync(INPUT_PATH, "utf-8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  return lines;
}

// ── per-input ──────────────────────────────────────────────────────────────
async function processOne(input: string, idx: number, n: number, dbIndex: CasesIndex) {
  const ts0 = Date.now();
  const inputToken = normalizeCaseNumber(input);
  const log = (s: string) => process.stdout.write(`[${String(idx + 1).padStart(2)}/${n}] ${s}\n`);

  if (!inputToken) {
    log(`✗ "${input}"  → input_unparseable`);
    return { input, inputToken: null, status: "failed", reason: "input_unparseable" };
  }

  if (!FORCE && state.processed?.[inputToken]?.status === "upgrade") {
    log(`⤵ "${input}" (${inputToken})  → already_processed (use --force to reprocess)`);
    return { input, inputToken, status: "skipped", reason: "already_processed" };
  }

  // 1) 목록 조회 (LAW_API_KEY 의 일 한도 보호 — 캐시된 row 의 serial 이 있으면 우회).
  const cachedDb = dbIndex.byToken.get(inputToken);
  let serialId = cachedDb?.law_api_serial_id ?? null;
  let listPrec = null;
  let listBody = null;

  if (!serialId) {
    const listUrl = buildUrl("lawSearch.do", { query: inputToken, display: 20, page: 1 });
    const list = await fetchWithBackoff(listUrl, "list");
    listBody = list.body;
    if (isErrorEnvelope(listBody)) {
      log(`✗ "${input}"  → list_api_error: ${pickTag(listBody, "msg")}`);
      return { input, inputToken, status: "failed", reason: "list_api_error", apiMsg: pickTag(listBody, "msg") };
    }
    const allPrec = pickAllPrec(listBody);
    const exactMatches = allPrec.filter((p) => caseNumbersEqual(p.사건번호, inputToken));

    if (exactMatches.length === 0) {
      log(`✗ "${input}" (${inputToken})  → not_found_in_list (listCount=${allPrec.length})`);
      return { input, inputToken, status: "failed", reason: "not_found_in_list", listCount: allPrec.length };
    }
    if (exactMatches.length > 1) {
      log(`✗ "${input}" (${inputToken})  → ambiguous_list_matches (n=${exactMatches.length})`);
      return { input, inputToken, status: "failed", reason: "ambiguous_list_matches", matchCount: exactMatches.length };
    }
    listPrec = exactMatches[0];
    serialId = listPrec.판례일련번호;

    // raw 보존.
    writeFileSync(resolve(RAW_DIR, `${serialId}.list.xml`), listBody, "utf-8");
    await sleep(INTERVAL);
  }

  // 2) 본문 조회.
  const svcUrl = buildUrl("lawService.do", { ID: serialId });
  const svc = await fetchWithBackoff(svcUrl, "service");
  if (isErrorEnvelope(svc.body)) {
    log(`✗ "${input}" (${inputToken})  → service_api_error: ${pickTag(svc.body, "msg")}`);
    return { input, inputToken, status: "failed", reason: "service_api_error", apiMsg: pickTag(svc.body, "msg") };
  }
  writeFileSync(resolve(RAW_DIR, `${serialId}.service.xml`), svc.body, "utf-8");
  await sleep(INTERVAL);

  const svcRaw = svc.body;
  const svcParsed = {
    사건번호: pickTag(svcRaw, "사건번호"),
    사건명: pickTag(svcRaw, "사건명"),
    법원명: pickTag(svcRaw, "법원명"),
    선고일자: pickTag(svcRaw, "선고일자"),
    판례내용: pickTag(svcRaw, "판례내용") ?? "",
  };

  // 3) cases 매칭 + 3중 안전망.
  const dbRow = dbIndex.byToken.get(inputToken);
  const verify = verifyTripleMatch({
    inputRaw: input,
    listSeenRaw: listPrec?.사건번호 ?? svcParsed.사건번호, // 캐시 경로면 list 생략 → service 로 갈음
    serviceSeenRaw: svcParsed.사건번호,
    dbSeenRaw: dbRow?.case_number ?? null,
  });

  const officialNormalized = normalizeOfficialText(svcParsed.판례내용);
  const previewHead = officialNormalized.slice(0, 200);

  if (verify.reason) {
    if (!dbRow) {
      // db_row_missing — 신규 후보.
      log(`+ "${input}" (${inputToken})  → newCandidate (${svcParsed.법원명}/${svcParsed.선고일자}/${svcParsed.사건명?.slice(0,20)}…)`);
      return {
        input, inputToken, status: "newCandidate",
        serialId, listSeen: listPrec?.사건번호 ?? svcParsed.사건번호, serviceSeen: svcParsed.사건번호,
        meta: { 사건명: svcParsed.사건명, 법원명: svcParsed.법원명, 선고일자: svcParsed.선고일자 },
        textLen: officialNormalized.length, previewHead,
        verify,
      };
    }
    // 진짜 mismatch.
    log(`✗ "${input}" (${inputToken})  → ${verify.reason}`);
    return { input, inputToken, status: "failed", reason: verify.reason, verify };
  }

  // 통과 — 보강 후보. verifyTripleMatch 가 reason null 인 경우 dbRow 는 정의됨 (위 dbSeenRaw 입력 조건).
  if (!dbRow) {
    log(`✗ "${input}" (${inputToken})  → internal_state_error (dbRow null after triple-match pass)`);
    return { input, inputToken, status: "failed" as const, reason: "internal_state_error" };
  }
  const action = dbRow.official_text_md ? "보강(덮어쓰기)" : "보강(신규 채움)";
  log(`✓ "${input}" (${inputToken})  → upgrade ${action} ${officialNormalized.length}자 → cases ${dbRow.case_id.slice(0, 8)}…`);
  return {
    input, inputToken, status: "upgrade" as const,
    caseId: dbRow.case_id, caseTitle: dbRow.case_title,
    serialId,
    existingHasOfficialText: !!dbRow.official_text_md,
    textLen: officialNormalized.length, previewHead,
    apply: {
      official_text_md: officialNormalized,
      law_api_serial_id: serialId,
      pdfMeta: {
        caseNumber: inputToken,
        caseTitle: dbRow.case_title,
        court: dbRow.court,
        decidedAt: dbRow.decided_at,
      },
    },
    elapsedMs: Date.now() - ts0,
  };
}

// ── pdf upload ─────────────────────────────────────────────────────────────
interface PdfApplyOutcome {
  status: "ok" | "skipped_unrenderable" | "error";
  path?: string;
  unrenderable?: ReadonlyArray<{ char: string; codePoint: number; offset: number }>;
  errorMsg?: string;
  pageCount?: number;
  bytes?: number;
}

async function generateAndUploadPdf(
  caseId: string,
  fullText: string,
  meta: {
    caseNumber: string;
    caseTitle: string | null;
    court: string | null;
    decidedAt: string | null;
  },
): Promise<PdfApplyOutcome> {
  try {
    const r = await renderOfficialTextPdf({
      caseNumber: meta.caseNumber,
      caseTitle: meta.caseTitle,
      court: meta.court,
      decidedAt: meta.decidedAt,
      fullText,
    });
    if (r.unrenderable.length > 0) {
      return { status: "skipped_unrenderable", unrenderable: r.unrenderable };
    }
    const path = `${caseId}.pdf`; // case_id 기반 — Storage 키는 ASCII 만. 덮어쓰기 멱등.
    const { error } = await supa.storage
      .from("case-fulltext")
      .upload(path, r.pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });
    if (error) return { status: "error", errorMsg: error.message };

    const { error: upErr } = await supa
      .from("cases")
      .update({
        official_text_pdf_path: path,
        updated_at: new Date().toISOString(),
      })
      .eq("case_id", caseId);
    if (upErr) return { status: "error", errorMsg: upErr.message };

    return { status: "ok", path, pageCount: r.pageCount, bytes: r.pdfBytes.length };
  } catch (e) {
    return { status: "error", errorMsg: e instanceof Error ? e.message : String(e) };
  }
}

// ── apply ──────────────────────────────────────────────────────────────────
async function applyUpgrade(item: {
  caseId: string;
  apply: { official_text_md: string; law_api_serial_id: string };
}): Promise<void> {
  const { error } = await supa
    .from("cases")
    .update({
      official_text_md: item.apply.official_text_md,
      law_api_serial_id: item.apply.law_api_serial_id,
      updated_at: new Date().toISOString(),
    })
    .eq("case_id", item.caseId);
  if (error) throw error;
}

// ── main ──────────────────────────────────────────────────────────────────
async function main() {
  process.stdout.write(`\n=== §2 국가법령정보 판례 전문 import ===\n`);
  process.stdout.write(`  모드:    ${APPLY ? "APPLY" : "dry-run"}${INSERT_NEW ? " +insert-new" : ""}${FORCE ? " +force" : ""}\n`);
  process.stdout.write(`  입력:    ${INPUT_PATH}\n`);
  process.stdout.write(`  raw:     ${RAW_DIR}\n`);
  process.stdout.write(`  state:   ${STATE_PATH}\n`);
  process.stdout.write(`  간격:    ${INTERVAL}ms\n\n`);

  const inputs = readInput();
  process.stdout.write(`입력 ${inputs.length}건 로드. cases 색인 빌드 중…\n`);
  const dbIndex = await loadCasesIndex();
  process.stdout.write(`cases 색인 ${dbIndex.rows.length}건 (정규화 매칭 가능 ${dbIndex.byToken.size}건).\n\n`);

  const items = [];
  for (let i = 0; i < inputs.length; i++) {
    try {
      const item = await processOne(inputs[i], i, inputs.length, dbIndex);
      items.push(item);
    } catch (e) {
      process.stdout.write(`[${i + 1}/${inputs.length}] ✗ "${inputs[i]}" → fatal ${e instanceof Error ? e.message : String(e)}\n`);
      items.push({
        input: inputs[i],
        inputToken: null,
        status: "failed" as const,
        reason: "fatal_exception",
        apiMsg: e instanceof Error ? e.message : String(e),
      });
    }
  }

  type UpgradeItem = {
    status: "upgrade";
    input: string;
    inputToken: string;
    caseId: string;
    caseTitle: string | null;
    serialId: string;
    existingHasOfficialText: boolean;
    textLen: number;
    previewHead: string;
    apply: {
      official_text_md: string;
      law_api_serial_id: string;
      pdfMeta: {
        caseNumber: string;
        caseTitle: string | null;
        court: string | null;
        decidedAt: string | null;
      };
    };
    elapsedMs: number;
  };
  type NewCandidateItem = {
    status: "newCandidate";
    input: string;
    inputToken: string;
    serialId: string;
    meta?: { 사건명?: string | null; 법원명?: string | null; 선고일자?: string | null };
    textLen: number;
    previewHead: string;
  };
  type FailedItem = {
    status: "failed";
    input: string;
    inputToken: string | null;
    reason: string;
    apiMsg?: string | null;
    listCount?: number;
    matchCount?: number;
  };
  const upgrade = items.filter(
    (x): x is UpgradeItem => x.status === "upgrade",
  );
  const newCandidate = items.filter(
    (x) => x.status === "newCandidate",
  ) as NewCandidateItem[];
  const failed = items.filter((x) => x.status === "failed") as FailedItem[];
  const skipped = items.filter((x) => x.status === "skipped");

  process.stdout.write(`\n=== 요약 ===\n`);
  process.stdout.write(`  upgrade(보강 가능):   ${upgrade.length}\n`);
  process.stdout.write(`  newCandidate(신규):    ${newCandidate.length} (apply 시 ${INSERT_NEW ? "insert" : "보고만"})\n`);
  process.stdout.write(`  failed(매칭 실패):    ${failed.length}\n`);
  process.stdout.write(`  skipped(이미 처리):    ${skipped.length}\n`);
  process.stdout.write(`  총:                  ${items.length}\n`);

  if (upgrade.length > 0) {
    process.stdout.write(`\n=== upgrade 미리보기 ===\n`);
    for (const u of upgrade) {
      process.stdout.write(`  ${u.inputToken}  →  ${u.caseTitle?.slice(0, 40) ?? ""}…\n`);
      process.stdout.write(`    전문 ${u.textLen}자.  앞 200자: ${u.previewHead.replace(/\n/g, " ↵ ").slice(0, 200)}\n\n`);
    }
  }
  if (newCandidate.length > 0) {
    process.stdout.write(`\n=== newCandidate (cases 미존재) ===\n`);
    for (const n of newCandidate) {
      process.stdout.write(`  ${n.inputToken}  ${n.meta?.법원명 ?? "?"} ${n.meta?.선고일자 ?? "?"} ${n.meta?.사건명?.slice(0, 40) ?? ""}\n`);
    }
  }
  if (failed.length > 0) {
    process.stdout.write(`\n=== failed (매칭 실패) ===\n`);
    for (const f of failed) {
      process.stdout.write(`  "${f.input}" (${f.inputToken ?? "?"})  reason=${f.reason}${f.apiMsg ? ` apiMsg=${f.apiMsg}` : ""}${f.matchCount ? ` matches=${f.matchCount}` : ""}${f.listCount != null ? ` listCount=${f.listCount}` : ""}\n`);
    }
  }

  writeFileSync(REPORT_PATH, JSON.stringify({ at: new Date().toISOString(), mode: APPLY ? "apply" : "dry-run", upgrade, newCandidate, failed, skipped }, null, 2), "utf-8");
  process.stdout.write(`\nreport: ${REPORT_PATH}\n`);

  // ── apply ────
  if (!APPLY) {
    process.stdout.write(`\n[dry-run] 실 반영 안 함. --apply 로 재실행하면 upgrade ${upgrade.length}건 반영.\n`);
    return;
  }

  process.stdout.write(`\n=== APPLY (upgrade ${upgrade.length}건) ===\n`);
  let ok = 0, ng = 0;
  let pdfOk = 0, pdfSkip = 0, pdfErr = 0;
  const pdfSkipList: Array<{ caseNumber: string; sampleChars: string[]; total: number }> = [];
  for (const u of upgrade) {
    try {
      await applyUpgrade(u);
      state.processed = state.processed ?? {};
      state.processed[u.inputToken] = { status: "upgrade", caseId: u.caseId, serialId: u.serialId, at: new Date().toISOString() };
      ok++;
      process.stdout.write(`  ✓ ${u.inputToken} → ${u.caseId.slice(0, 8)}…\n`);

      // PDF 생성·업로드 — 텍스트 적재 직후 함께.
      const pdfRes = await generateAndUploadPdf(
        u.caseId,
        u.apply.official_text_md,
        u.apply.pdfMeta,
      );
      if (pdfRes.status === "ok") {
        pdfOk++;
        process.stdout.write(`     PDF ✓  ${pdfRes.pageCount}p, ${pdfRes.bytes}B  → case-fulltext/${pdfRes.path}\n`);
      } else if (pdfRes.status === "skipped_unrenderable") {
        pdfSkip++;
        const uniq = new Set(pdfRes.unrenderable?.map((u) => u.char) ?? []);
        const sample = [...uniq].slice(0, 8);
        pdfSkipList.push({ caseNumber: u.inputToken, sampleChars: sample, total: pdfRes.unrenderable?.length ?? 0 });
        process.stdout.write(`     PDF ⚠ skip — 미커버 ${pdfRes.unrenderable?.length}자 (예: ${sample.join(" ")})\n`);
      } else {
        pdfErr++;
        process.stdout.write(`     PDF ✗  ${pdfRes.errorMsg}\n`);
      }
    } catch (e) {
      ng++;
      process.stdout.write(`  ✗ ${u.inputToken} → ${e instanceof Error ? e.message : String(e)}\n`);
    }
  }
  saveState(state);
  process.stdout.write(`\nupgrade 결과: ${ok} 성공 / ${ng} 실패\n`);
  process.stdout.write(`PDF 결과: ${pdfOk} ok / ${pdfSkip} skip(미커버) / ${pdfErr} err\n`);
  if (pdfSkipList.length > 0) {
    process.stdout.write(`\n⚠ PDF 미커버로 skip된 판례 — Noto Serif CJK KR 등 대체 폰트 검토 필요:\n`);
    for (const s of pdfSkipList) {
      process.stdout.write(`   ${s.caseNumber}  미커버 ${s.total}자 — ${s.sampleChars.join(" ")}\n`);
    }
  }

  if (INSERT_NEW && newCandidate.length > 0) {
    process.stdout.write(`\n[insert-new] 신규 ${newCandidate.length}건 insert 는 별도 검토 필요 — 이번 turn 에서는 보고만. 사용자 확인 후 별도 스크립트로 진행.\n`);
  }
}

main().catch((e) => {
  process.stderr.write(`FATAL: ${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
  process.exit(1);
});
