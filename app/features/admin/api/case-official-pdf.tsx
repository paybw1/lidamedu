// feat-7-037 (역방향) — staff 전문 PDF 수동 업로드 → 텍스트 추출 → 적재 + 학습 활성화.
// API 로 못 받는 판례(특허법원·하급심 등)를 staff 가 직접 찾은 PDF 로 채운다.
//   intent=upload : multipart(caseId, file) → Storage 저장 + 텍스트 추출 + official_text_md 적재 + RAG 재인덱스
//   intent=clear_unavailable : 오판정된 unavailable 해제(재확인 대상 복귀)
//   intent=rerender : official_text_md 로 전문 PDF 재생성(폰트 교체·본문 수정 후) — 서버리스 렌더 검증 겸용

import { data } from "react-router";

import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  CASE_FULLTEXT_BUCKET,
  renderAndStorePdf,
} from "~/features/cases/lib/precedent-import.server";
import { extractPdfText } from "~/features/cases/lib/pdf-extract.server";
import { reindexCases } from "~/features/ai-qna/lib/source-chunker.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/case-official-pdf";

const MAX_BYTES = 20 * 1024 * 1024; // 20MB

export async function action({ request }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) return data({ error: "Forbidden" }, { status: 403 });

  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "upload");
  const caseId = String(fd.get("caseId") ?? "");
  if (!caseId) return data({ error: "caseId 누락" }, { status: 400 });

  const now = new Date().toISOString();

  if (intent === "clear_unavailable") {
    const { error } = await adminClient
      .from("cases")
      .update({ official_text_unavailable: false, updated_at: now })
      .eq("case_id", caseId);
    if (error) return data({ error: error.message }, { status: 500 });
    return data({ ok: true, intent });
  }

  if (intent === "rerender") {
    const { data: c, error: cErr } = await adminClient
      .from("cases")
      .select("case_number, case_title, court, decided_at, official_text_md")
      .eq("case_id", caseId)
      .is("deleted_at", null)
      .maybeSingle();
    if (cErr) return data({ error: cErr.message }, { status: 500 });
    if (!c?.official_text_md)
      return data(
        { error: "전문 텍스트(official_text_md)가 없어 재생성할 수 없습니다." },
        { status: 400 },
      );
    const r = await renderAndStorePdf(adminClient, caseId, c.official_text_md, {
      caseNumber: c.case_number,
      caseTitle: c.case_title,
      court: c.court,
      decidedAt: c.decided_at,
    });
    if (r.status === "ok")
      return data({ ok: true, intent, path: r.path, pageCount: r.pageCount });
    if (r.status === "skipped_unrenderable")
      return data(
        {
          error: `폰트 미커버 글자로 생성 skip: ${r.chars.slice(0, 10).join("")}`,
        },
        { status: 422 },
      );
    return data({ error: `렌더 실패: ${r.msg}` }, { status: 500 });
  }

  if (intent !== "upload") return data({ error: "Unknown intent" }, { status: 400 });

  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0)
    return data({ error: "PDF 파일이 없습니다." }, { status: 400 });
  if (file.size > MAX_BYTES)
    return data({ error: "파일이 20MB 를 초과합니다." }, { status: 400 });
  const isPdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) return data({ error: "PDF 만 업로드할 수 있습니다." }, { status: 400 });

  const bytes = new Uint8Array(await file.arrayBuffer());

  // 1) Storage 저장 (정방향과 동일 버킷·키 → 전문 뷰어가 그대로 동작).
  const path = `${caseId}.pdf`;
  const up = await adminClient.storage
    .from(CASE_FULLTEXT_BUCKET)
    .upload(path, bytes, { contentType: "application/pdf", upsert: true });
  if (up.error) return data({ error: `업로드 실패: ${up.error.message}` }, { status: 500 });

  // 2) 텍스트 추출 (스캔 PDF 면 빈 문자열).
  let text = "";
  let pageCount = 0;
  let extractError: string | null = null;
  try {
    const r = await extractPdfText(bytes);
    text = r.text;
    pageCount = r.pageCount;
  } catch (e) {
    extractError = e instanceof Error ? e.message : String(e);
  }
  const hasText = text.length >= 30; // 최소 길이 — 스캔/추출실패 구분

  // 3) cases 적재 — PDF 경로는 항상, 텍스트는 있을 때만. 수동 적재 완료 → 재확인 제외.
  const { error: upd } = await adminClient
    .from("cases")
    .update({
      official_text_pdf_path: path,
      ...(hasText ? { official_text_md: text } : {}),
      official_text_unavailable: true,
      official_text_checked_at: now,
      updated_at: now,
    })
    .eq("case_id", caseId);
  if (upd) return data({ error: upd.message }, { status: 500 });

  // 4) 학습 활성화 — 텍스트가 있으면 RAG 재인덱스.
  if (hasText) {
    try {
      await reindexCases([caseId]);
    } catch {
      // best-effort — 다음 embed cron 이 dirty 로 재처리.
    }
  }

  return data({
    ok: true,
    intent,
    pageCount,
    chars: text.length,
    indexed: hasText,
    warning: hasText
      ? null
      : extractError
        ? `텍스트 추출 오류: ${extractError}. PDF 는 저장됐으나 학습 텍스트는 비어 있습니다.`
        : "텍스트가 거의 없습니다(스캔 이미지 PDF 가능성). PDF 는 저장됐으나 학습 텍스트는 비었습니다. OCR 본문이 필요합니다.",
  });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
