// errata Phase 4a — 교재별 추록·정오표 시트 데이터 조립 (서버 전용).
// 원천 = v_errata_sheet (published/withdrawn × 교재 매핑). PDF 는 서버에서만 조회한다.
import adminClient from "~/core/lib/supa-admin-client.server";

export type SheetScope = "applicable" | "future" | "unknown";

export interface SheetItem {
  revisionId: string;
  kind: string | null;
  severity: string | null;
  title: string | null;
  beforeText: string;
  afterText: string;
  reason: string | null;
  effectiveDate: string | null;
  publishedAt: string; // ISO
  pageNo: number | null;
  lineHint: string | null;
  tocPath: string | null;
  sortKey: number | null;
  scope: SheetScope;
  isWithdrawalNotice: boolean; // 철회 고지 행 (§2.5 — 본문 대신 별도 표시)
}

export interface ErrataSheetData {
  editionId: string;
  publicationTitle: string;
  editionLabel: string;
  targetExamYear: number | null;
  updatedAt: string; // 최종 갱신 (max published_at)
  recent: SheetItem[]; // 최근 갱신일 발행분 — 상단 요약
  applicable: SheetItem[]; // 본문 (페이지순)
  reference: SheetItem[]; // 참고 — 시험 미적용/판정불가
  withdrawals: SheetItem[]; // 철회 고지
  itemCount: number; // applicable + reference + withdrawals
}

function payloadText(payload: unknown, key: "before_text" | "after_text"): string {
  if (payload == null || typeof payload !== "object") return "";
  const v = (payload as Record<string, unknown>)[key];
  return typeof v === "string" ? v : "";
}

// 페이지순 정렬 (§3.2) — page_no nulls last → sort_key → published_at
function byPageOrder(a: SheetItem, b: SheetItem): number {
  if (a.pageNo != null && b.pageNo != null && a.pageNo !== b.pageNo) return a.pageNo - b.pageNo;
  if (a.pageNo != null && b.pageNo == null) return -1;
  if (a.pageNo == null && b.pageNo != null) return 1;
  if (a.sortKey != null && b.sortKey != null && a.sortKey !== b.sortKey) return a.sortKey - b.sortKey;
  return a.publishedAt < b.publishedAt ? -1 : 1;
}

export async function buildErrataSheetData(
  editionId: string,
): Promise<ErrataSheetData | null> {
  const { data: edition, error: edErr } = await adminClient
    .from("publication_editions")
    .select("edition_id, edition_label, target_exam_year, publications(title)")
    .eq("edition_id", editionId)
    .maybeSingle();
  if (edErr) throw edErr;
  if (!edition) return null;

  const { data: rows, error } = await adminClient
    .from("v_errata_sheet")
    .select("*")
    .eq("edition_id", editionId);
  if (error) throw error;

  // withdrawn 원본 행은 본문 제외(§2.5) — 철회 '고지' 행(published)만 남는다.
  const items: SheetItem[] = (rows ?? [])
    .filter((r) => r.notice_status === "published")
    .map((r) => ({
    revisionId: r.revision_id ?? "",
    kind: r.errata_kind,
    severity: r.errata_severity,
    title: r.errata_title,
    beforeText: payloadText(r.errata_payload, "before_text"),
    afterText: payloadText(r.errata_payload, "after_text"),
    reason: r.errata_reason,
    effectiveDate: r.effective_date,
    publishedAt: r.published_at ?? "",
    pageNo: r.page_no,
    lineHint: r.line_hint,
    tocPath: r.toc_path,
    sortKey: r.sort_key,
      scope: (r.exam_scope ?? "unknown") as SheetScope,
      isWithdrawalNotice: r.withdraws_revision_id != null,
    }));

  return assembleSheet(
    editionId,
    edition.publications?.title ?? "?",
    edition.edition_label,
    edition.target_exam_year,
    items,
  );
}

// 조립 로직 분리 — 샘플·테스트가 mock 아이템으로 동일 경로를 태울 수 있게.
export function assembleSheet(
  editionId: string,
  publicationTitle: string,
  editionLabel: string,
  targetExamYear: number | null,
  items: SheetItem[],
): ErrataSheetData {
  // withdrawn 원본 행은 본문에서 제외(§2.5) — 뷰가 notice_status 를 안 주므로
  // published 만 남긴 상태에서, 철회 고지 행(withdraws_revision_id 보유)만 분리한다.
  const withdrawals = items
    .filter((i) => i.isWithdrawalNotice)
    .sort((a, b) => (a.publishedAt < b.publishedAt ? -1 : 1));
  const live = items.filter((i) => !i.isWithdrawalNotice);

  const applicable = live.filter((i) => i.scope === "applicable").sort(byPageOrder);
  const reference = live.filter((i) => i.scope !== "applicable").sort(byPageOrder);

  const all = [...live, ...withdrawals];
  const updatedAt =
    all.length > 0 ? all.map((i) => i.publishedAt).sort().at(-1)! : "";
  const latestDay = updatedAt.slice(0, 10);
  const recent = all
    .filter((i) => i.publishedAt.slice(0, 10) === latestDay)
    .sort(byPageOrder);

  return {
    editionId,
    publicationTitle,
    editionLabel,
    targetExamYear,
    updatedAt,
    recent,
    applicable,
    reference,
    withdrawals,
    itemCount: live.length + withdrawals.length,
  };
}
