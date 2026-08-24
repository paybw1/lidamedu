// feat-2-035 — 하급심 판결문(case_lower_courts) 쿼리.
// RLS 가 staff 전용이라 학생 호출은 자동으로 빈 결과가 된다 — 화면에서 역할을 다시 거르지 않는다.
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "~/../database.types";
import adminClient from "~/core/lib/supa-admin-client.server";

import { COURT_LABELS, type CaseCourt } from "./labels";
import {
  type LowerCourtFile,
  type LowerCourtStatus,
  needsManualWork,
  parseLowerCourtFiles,
} from "./lib/lower-court";
import {
  hasFactSection,
  resolveLowerCourtText,
} from "./lib/lower-court-fetch.server";

type Client = SupabaseClient<Database>;

/** 원본 파일 Storage 버킷(private). 업로드·다운로드·정리가 공유하는 SSOT. */
export const LOWER_COURT_BUCKET = "case-lower-courts";

/** LowerCourtFile[] → jsonb 컬럼 값. 필드를 하나씩 옮겨 스키마를 눈에 보이게 둔다. */
function filesToJson(files: LowerCourtFile[]): Json {
  return files.map((f) => ({
    name: f.name,
    path: f.path,
    size: f.size,
    mime: f.mime,
  }));
}

// 상태 라벨은 클라이언트 안전 모듈이 SSOT — 화면이 .server 를 참조하면 빌드가 깨진다.
export {
  LOWER_STATUSES,
  LOWER_STATUS_LABEL,
  needsManualWork,
  parseLowerCourtFiles,
  type LowerCourtFile,
  type LowerCourtStatus,
} from "./lib/lower-court";

export interface LowerCourtRow {
  caseId: string;
  status: LowerCourtStatus;
  sourceKind: "lower_auto" | "lower_self" | "lower_manual" | null;
  sourceRef: string | null;
  lowerCaseNumber: string | null;
  lowerCourt: string | null;
  charCount: number;
}

export interface LowerCourtListItem extends LowerCourtRow {
  caseNumber: string;
  caseTitle: string;
  decidedAt: string;
  subjectLaws: string[];
}

/** 판례 뷰어용 — 본문 포함 단건. staff 가 아니면 RLS 로 null. */
export async function getLowerCourtByCaseId(
  client: Client,
  caseId: string,
): Promise<
  (LowerCourtRow & { bodyText: string; files: LowerCourtFile[] }) | null
> {
  const { data, error } = await client
    .from("case_lower_courts")
    .select(
      "case_id, status, source_kind, source_ref, lower_case_number, lower_court, char_count, body_text, files",
    )
    .eq("case_id", caseId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    caseId: data.case_id,
    status: data.status as LowerCourtStatus,
    sourceKind: data.source_kind as LowerCourtRow["sourceKind"],
    sourceRef: data.source_ref,
    lowerCaseNumber: data.lower_case_number,
    lowerCourt: data.lower_court,
    charCount: data.char_count,
    bodyText: data.body_text,
    files: parseLowerCourtFiles(data.files),
  };
}

/**
 * 운영 목록 — 본문은 싣지 않는다(264건 × 평균 15KB = 응답이 수 MB).
 * 상태별 카운트는 필터와 무관하게 전체 기준으로 낸다(진척도를 읽기 위함).
 */
export async function listLowerCourtTargets(
  client: Client,
  opts: { status?: LowerCourtStatus | "manual" | null; q?: string } = {},
): Promise<{
  rows: LowerCourtListItem[];
  counts: Record<LowerCourtStatus, number> & { total: number };
}> {
  const { data, error } = await client
    .from("case_lower_courts")
    .select(
      `case_id, status, source_kind, source_ref, lower_case_number, lower_court, char_count,
       cases:case_id ( case_number, case_title, decided_at, subject_laws )`,
    )
    .is("deleted_at", null);
  if (error) throw error;

  // ★case_id 가 unique 라 PostgREST 는 cases 임베드를 객체로 내려준다(배열 아님).
  type EmbeddedCase = {
    case_number: string;
    case_title: string;
    decided_at: string;
    subject_laws: string[];
  };
  const all: LowerCourtListItem[] = (data ?? []).flatMap((r) => {
    const raw = r.cases as EmbeddedCase | EmbeddedCase[] | null;
    const kase = Array.isArray(raw) ? (raw[0] ?? null) : raw;
    if (!kase) return [];
    return [
      {
        caseId: r.case_id,
        status: r.status as LowerCourtStatus,
        sourceKind: r.source_kind as LowerCourtRow["sourceKind"],
        sourceRef: r.source_ref,
        lowerCaseNumber: r.lower_case_number,
        lowerCourt: r.lower_court,
        charCount: r.char_count,
        caseNumber: kase.case_number,
        caseTitle: kase.case_title,
        decidedAt: kase.decided_at,
        subjectLaws: kase.subject_laws,
      },
    ];
  });
  all.sort((a, b) => b.decidedAt.localeCompare(a.decidedAt));

  const counts = {
    total: all.length,
    loaded: 0,
    not_in_api: 0,
    summary_only: 0,
    no_ref: 0,
  };
  for (const r of all) counts[r.status] += 1;

  const q = (opts.q ?? "").trim();
  const rows = all
    .filter((r) => {
      if (!opts.status) return true;
      if (opts.status === "manual") return needsManualWork(r.status);
      return r.status === opts.status;
    })
    .filter(
      (r) =>
        !q ||
        r.caseNumber.includes(q) ||
        r.caseTitle.includes(q) ||
        (r.lowerCaseNumber ?? "").includes(q),
    );

  return { rows, counts };
}

// ───────────────────────── 수집(운영 화면에서 바로 적재) ─────────────────────────
//
// 그동안 판결문 확보는 로컬 배치(scripts/case-diagram/fetch-lower-court.mjs)뿐이라
// 운영자가 화면에서 미확보 건을 보고도 아무것도 못 했다(원장 요청 2026-08-20).
// 파싱·매칭 코어는 배치와 공유한다(lib/lower-court-fetch.server.ts).

type LowerInsert = Database["public"]["Tables"]["case_lower_courts"]["Insert"];

export interface CollectResult {
  caseId: string;
  caseNumber: string;
  status: LowerCourtStatus;
  ok: boolean;
  /** 화면에 그대로 띄우는 한 줄 — 실패 사유가 곧 다음 조치다. */
  message: string;
}

/**
 * ★본문을 갈아끼우는 모든 경로가 여기를 지난다 — 원본 파일 정리도 여기서 한 번만 한다.
 *   row.files 를 안 넘기면 "이전 원본은 이제 이 본문과 무관하다"는 뜻이라 Storage 에서 지운다.
 *   (남겨 두면 화면 본문과 다운로드 파일이 서로 다른 판결문이 된다.)
 */
async function upsertLower(client: Client, row: LowerInsert): Promise<void> {
  const keep = new Set(parseLowerCourtFiles(row.files).map((f) => f.path));
  const stale = (await getLowerCourtFilePaths(client, row.case_id)).filter(
    (path) => !keep.has(path),
  );
  const { error } = await client
    .from("case_lower_courts")
    .upsert({ ...row, files: row.files ?? [] }, { onConflict: "case_id" });
  if (error) throw error;
  // 행이 먼저다 — 지우기에 실패해도 Storage 에 고아 객체가 남을 뿐, 데이터는 어긋나지 않는다.
  if (stale.length) {
    await adminClient.storage.from(LOWER_COURT_BUCKET).remove(stale);
  }
}

/**
 * 한 건 수집 — 원심 표기 파싱 → 법령정보센터 조회 → 전문 적재.
 * 실패해도 행은 남긴다(상태·원심번호가 다음 수기 작업의 지시서).
 */
export async function collectLowerCourt(
  client: Client,
  caseId: string,
  forcedRef?: { caseNumber: string; court?: string | null } | null,
): Promise<CollectResult> {
  const { data: kase, error } = await client
    .from("cases")
    .select("case_id, case_number, court, decided_at, official_text_md")
    .eq("case_id", caseId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!kase) {
    return {
      caseId,
      caseNumber: "?",
      status: "no_ref",
      ok: false,
      message: "판례를 찾을 수 없습니다.",
    };
  }

  // ⓪ 판례 자체가 하급심이면 자기 원문이 곧 사실관계 소스 — 원심을 찾을 이유가 없다.
  const own = (kase.official_text_md ?? "").trim();
  if (!forcedRef && kase.court && kase.court !== "supreme" && own) {
    const ref = `${COURT_LABELS[kase.court as CaseCourt] ?? kase.court} ${kase.case_number}`;
    await upsertLower(client, {
      case_id: caseId,
      status: "loaded",
      source_kind: "lower_self",
      source_ref: ref,
      lower_case_number: kase.case_number,
      lower_court: COURT_LABELS[kase.court as CaseCourt] ?? kase.court,
      lower_decided_at: kase.decided_at,
      law_serial_id: null,
      body_text: own,
      char_count: own.length,
      fetched_at: new Date().toISOString(),
      deleted_at: null,
    });
    return {
      caseId,
      caseNumber: kase.case_number,
      status: "loaded",
      ok: true,
      message: `자체 원문 ${own.length.toLocaleString("ko-KR")}자 적재 (${ref})`,
    };
  }

  const outcome = await resolveLowerCourtText({
    supremeCaseNumber: kase.case_number,
    supremeDecidedAt: kase.decided_at,
    officialTextMd: kase.official_text_md,
    forcedRef,
  });

  if (outcome.status === "no_ref") {
    await upsertLower(client, {
      case_id: caseId,
      status: "no_ref",
      source_kind: null,
      source_ref: null,
      lower_case_number: null,
      lower_court: null,
      body_text: "",
      char_count: 0,
      deleted_at: null,
    });
    return {
      caseId,
      caseNumber: kase.case_number,
      status: "no_ref",
      ok: false,
      message: `원심을 특정하지 못했습니다 — ${outcome.reason}`,
    };
  }

  const ref = outcome.ref;
  const refLabel = `${ref.court || "?"} ${ref.caseNumber}`;
  if (outcome.status === "not_in_api") {
    await upsertLower(client, {
      case_id: caseId,
      status: "not_in_api",
      source_kind: null,
      source_ref: refLabel,
      lower_case_number: ref.caseNumber,
      lower_court: ref.court || null,
      lower_decided_at: ref.decidedAt,
      body_text: "",
      char_count: 0,
      deleted_at: null,
    });
    return {
      caseId,
      caseNumber: kase.case_number,
      status: "not_in_api",
      ok: false,
      message: `원심 ${refLabel} — ${outcome.reason}. 판결문을 직접 붙여넣으세요.`,
    };
  }

  // loaded / summary_only — 전문은 받았다. 요지만이면 사실관계 소스가 못 되므로 갈라 둔다.
  await upsertLower(client, {
    case_id: caseId,
    status: outcome.status,
    source_kind: "lower_auto",
    source_ref: `${outcome.hit.court || ref.court} ${ref.caseNumber}`,
    lower_case_number: ref.caseNumber,
    lower_court: outcome.hit.court || ref.court || null,
    lower_decided_at: outcome.hit.decidedAt || ref.decidedAt,
    law_serial_id: outcome.hit.serial,
    body_text: outcome.status === "loaded" ? outcome.text : "",
    char_count: outcome.status === "loaded" ? outcome.text.length : 0,
    fetched_at: new Date().toISOString(),
    deleted_at: null,
  });
  const via = outcome.viaSupreme ? " (대법원 전문에서 원심 표기 확인)" : "";
  return {
    caseId,
    caseNumber: kase.case_number,
    status: outcome.status,
    ok: outcome.status === "loaded",
    message:
      outcome.status === "loaded"
        ? `${refLabel} 전문 ${outcome.text.length.toLocaleString("ko-KR")}자 적재${via}`
        : `${refLabel} — 수록됐으나 판시사항·요지뿐이라 사실관계가 없습니다. 판결문을 직접 붙여넣으세요.`,
  };
}

/** 지금 보관 중인 원본 파일의 Storage 키 — 교체·삭제 전 청소용. */
export async function getLowerCourtFilePaths(
  client: Client,
  caseId: string,
): Promise<string[]> {
  const { data, error } = await client
    .from("case_lower_courts")
    .select("files")
    .eq("case_id", caseId)
    .maybeSingle();
  if (error) throw error;
  return parseLowerCourtFiles(data?.files).map((f) => f.path);
}

/**
 * 운영자가 판결문 전문을 직접 붙여넣어 적재. API 에 없는 건의 마지막 경로.
 * ★files 를 넘기지 않으면 **비운다** — 붙여넣기로 본문을 갈아끼웠는데 이전 업로드의
 *   원본이 남아 있으면, 화면의 본문과 다운로드되는 파일이 서로 다른 판결문이 된다.
 */
export async function saveLowerCourtText(
  client: Client,
  caseId: string,
  input: { bodyText: string; sourceRef: string; files?: LowerCourtFile[] },
): Promise<CollectResult> {
  const body = input.bodyText.replace(/\r\n?/g, "\n").trim();
  const { data: kase, error } = await client
    .from("cases")
    .select("case_number")
    .eq("case_id", caseId)
    .maybeSingle();
  if (error) throw error;

  const ref = input.sourceRef.trim();
  const m = /(\d{2,4}\s*[가-힣]{1,3}\s*\d+)/.exec(ref);
  await upsertLower(client, {
    case_id: caseId,
    status: "loaded",
    source_kind: "lower_manual",
    source_ref: ref || "수기 입력",
    lower_case_number: m ? m[1].replace(/\s+/g, "") : null,
    lower_court: ref ? ref.split(/\s+/)[0] : null,
    body_text: body,
    char_count: body.length,
    files: filesToJson(input.files ?? []),
    fetched_at: new Date().toISOString(),
    deleted_at: null,
  });
  // 사실관계 절이 안 보이면 알려 준다 — 요지만 붙여넣으면 도식 사실관계가 부실해진다.
  const warn = hasFactSection(body)
    ? ""
    : " ※사실관계 절(기초사실·심결의 경위 등)이 보이지 않습니다 — 요지만 붙여넣지 않았는지 확인하세요.";
  return {
    caseId,
    caseNumber: kase?.case_number ?? "?",
    status: "loaded",
    ok: true,
    message: `수기 전문 ${body.length.toLocaleString("ko-KR")}자 적재.${warn}`,
  };
}
