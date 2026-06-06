// feat-7-037 — 국가법령정보 OPEN API 판례 전문 fetch + PDF 렌더/적재 (서버 공용).
// 정방향(API→텍스트→PDF) cron 과 수동 트리거가 공유. 순수 API 부분(fetchOfficialText)은 DB 비의존.
//
// NB: scripts/precedents/import-law-precedents.ts 와 동일 매칭 규칙(case-number.ts) 사용.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "database.types";

import { caseNumbersEqual, normalizeCaseNumber } from "./case-number";
import { normalizeOfficialText } from "./normalize-official-text";
import { renderOfficialTextPdf } from "./render-official-text-pdf.server";

const BASE = "https://www.law.go.kr/DRF";
const STORAGE_BUCKET = "case-fulltext";

function buildUrl(
  endpoint: string,
  params: Record<string, string | number>,
): string {
  const oc = process.env.LAW_API_KEY;
  const u = new URL(`${BASE}/${endpoint}`);
  u.searchParams.set("OC", oc ?? "");
  u.searchParams.set("target", "prec");
  u.searchParams.set("type", "XML");
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  return u.toString();
}

function pickTag(xml: string, tag: string): string | null {
  const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(xml);
  if (!m) return null;
  return m[1].replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "").trim();
}

interface PrecListRow {
  serialId: string | null;
  caseNumber: string | null;
}
function pickAllPrec(xml: string): PrecListRow[] {
  const out: PrecListRow[] = [];
  const re = /<prec[^>]*>([\s\S]*?)<\/prec>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    out.push({
      serialId: pickTag(m[1], "판례일련번호"),
      caseNumber: pickTag(m[1], "사건번호"),
    });
  }
  return out;
}

function isErrorEnvelope(xml: string): boolean {
  return /<Response>\s*<result>/.test(xml) && /<msg>/.test(xml);
}

async function fetchText(url: string): Promise<string> {
  const r = await fetch(url, {
    headers: { "User-Agent": "lidami-precedent-recheck/1.0" },
  });
  if (r.status >= 500) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

export interface OfficialTextMeta {
  caseNumber: string | null;
  caseTitle: string | null;
  court: string | null;
  decidedAt: string | null;
}

export type FetchOfficialTextResult =
  | { status: "no_api_key" }
  | { status: "not_registered"; listCount: number }
  | { status: "ambiguous"; count: number }
  | { status: "api_error"; msg: string | null }
  | { status: "ok"; serialId: string; textMd: string; serviceCaseNumber: string | null };

/**
 * 사건번호로 OPEN API 검색 → 정확 매칭 1건 → 본문 조회 → 정규화 텍스트 반환.
 * serialId 가 주어지면 검색 단계 생략(캐시 경로).
 * DB 비의존 — 호출부에서 cases 업데이트.
 */
export async function fetchOfficialText(
  caseNumber: string,
  opts: { serialId?: string | null } = {},
): Promise<FetchOfficialTextResult> {
  if (!process.env.LAW_API_KEY) return { status: "no_api_key" };
  const token = normalizeCaseNumber(caseNumber);
  if (!token) return { status: "not_registered", listCount: 0 };

  let serialId = opts.serialId ?? null;

  if (!serialId) {
    const listBody = await fetchText(
      buildUrl("lawSearch.do", { query: token, display: 20, page: 1 }),
    );
    if (isErrorEnvelope(listBody))
      return { status: "api_error", msg: pickTag(listBody, "msg") };
    const all = pickAllPrec(listBody);
    const exact = all.filter((p) => caseNumbersEqual(p.caseNumber, token));
    if (exact.length === 0)
      return { status: "not_registered", listCount: all.length };
    if (exact.length > 1) return { status: "ambiguous", count: exact.length };
    serialId = exact[0].serialId;
    if (!serialId) return { status: "not_registered", listCount: all.length };
  }

  const svcBody = await fetchText(buildUrl("lawService.do", { ID: serialId }));
  if (isErrorEnvelope(svcBody))
    return { status: "api_error", msg: pickTag(svcBody, "msg") };

  const serviceCaseNumber = pickTag(svcBody, "사건번호");
  // 본문 응답 사건번호가 입력과 일치하는지 재확인(API 자체 일관성).
  if (!caseNumbersEqual(serviceCaseNumber, token))
    return { status: "not_registered", listCount: 0 };

  const content = pickTag(svcBody, "판례내용") ?? "";
  const textMd = normalizeOfficialText(content);
  if (!textMd) return { status: "not_registered", listCount: 0 };

  return { status: "ok", serialId, textMd, serviceCaseNumber };
}

export type PdfStoreResult =
  | { status: "ok"; path: string; pageCount: number; bytes: number }
  | { status: "skipped_unrenderable"; chars: string[] }
  | { status: "error"; msg: string };

/**
 * 전문 텍스트 → PDF 렌더 → Storage 업로드 → cases.official_text_pdf_path 갱신.
 * best-effort: 폰트 미커버/렌더 오류면 PDF skip(텍스트는 별도로 이미 저장됨).
 */
export async function renderAndStorePdf(
  client: SupabaseClient<Database>,
  caseId: string,
  fullText: string,
  meta: OfficialTextMeta,
): Promise<PdfStoreResult> {
  try {
    const r = await renderOfficialTextPdf({
      caseNumber: meta.caseNumber ?? "",
      caseTitle: meta.caseTitle,
      court: meta.court,
      decidedAt: meta.decidedAt,
      fullText,
    });
    if (r.unrenderable.length > 0)
      return {
        status: "skipped_unrenderable",
        chars: r.unrenderable.map((u) => u.char),
      };
    const path = `${caseId}.pdf`;
    const up = await client.storage
      .from(STORAGE_BUCKET)
      .upload(path, r.pdfBytes, { contentType: "application/pdf", upsert: true });
    if (up.error) return { status: "error", msg: up.error.message };
    const upd = await client
      .from("cases")
      .update({ official_text_pdf_path: path, updated_at: new Date().toISOString() })
      .eq("case_id", caseId);
    if (upd.error) return { status: "error", msg: upd.error.message };
    return { status: "ok", path, pageCount: r.pageCount, bytes: r.pdfBytes.length };
  } catch (e) {
    return { status: "error", msg: e instanceof Error ? e.message : String(e) };
  }
}

export { STORAGE_BUCKET as CASE_FULLTEXT_BUCKET };
