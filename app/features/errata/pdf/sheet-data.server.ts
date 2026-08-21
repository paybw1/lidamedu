// errata Phase 4a — 교재별 추록·정오표 시트 데이터 조립 (서버 전용).
// 원천 = v_errata_sheet (published/withdrawn × 교재 매핑). PDF 는 서버에서만 조회한다.
import adminClient from "~/core/lib/supa-admin-client.server";
import { sortSystematicTreeOrder } from "~/features/laws/lib/systematic-order";

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
  /**
   * 체계도(수록) 순위 — mcq 만 채운다. 교재의 페이지 순서가 곧 체계도 순서라서,
   * page_no 가 없는 객관식은 이 값으로 페이지순을 대신한다(원장 지적 2026-08-21).
   * null 이면 정렬에서 건너뛴다 — 판례·조문 교재는 영향 없음.
   */
  orderRank?: number | null;
  /** 원장 콘텐츠 종류(mcq/statute/precedent) — 위치 표기 방식 분기용. */
  contentType?: string | null;
  /** 원장 콘텐츠 식별자 — 체계도 순위 산정(mcq)에 쓴다. */
  contentId?: string | null;
  /** 객관식 지문 번호(①②③…) — 지문 단위 정오일 때만. */
  choiceNo?: number | null;
  /** 보기 박스 항목의 마커(㉠㉡㉢) — 지문(선지)과 위치 표기가 다르다. */
  boxMarker?: string | null;
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

function payloadText(
  payload: unknown,
  key: "before_text" | "after_text",
): string {
  if (payload == null || typeof payload !== "object") return "";
  const v = (payload as Record<string, unknown>)[key];
  return typeof v === "string" ? v : "";
}

/** source_ref.choice_no → 지문 번호. 문자열/숫자 모두 허용, 범위 밖은 null. */
/** source_ref.marker → 보기 마커. 보기 박스 편집분에만 있다. */
function boxMarkerOf(sourceRef: unknown): string | null {
  if (sourceRef == null || typeof sourceRef !== "object") return null;
  const raw = (sourceRef as Record<string, unknown>).marker;
  return typeof raw === "string" && raw.trim() ? raw.trim().slice(0, 4) : null;
}

function choiceNoOf(sourceRef: unknown): number | null {
  if (sourceRef == null || typeof sourceRef !== "object") return null;
  const raw = (sourceRef as Record<string, unknown>).choice_no;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 20 ? n : null;
}

// 페이지순 정렬 (§3.2) — page_no nulls last → 체계도 순위 → sort_key → published_at
//
// ★객관식은 page_no 가 없다. sort_key 는 "단원 안에서 몇 번째 문제인가" 라서 단원이 다른
//   항목끼리 비교하면 뒤죽박죽이 된다(1번 문제가 앞 단원 8번보다 앞서는 식). 교재는 체계도
//   순서대로 인쇄되므로, 체계도 순위(orderRank)를 페이지 번호 대신 쓴다.
function byPageOrder(a: SheetItem, b: SheetItem): number {
  if (a.pageNo != null && b.pageNo != null && a.pageNo !== b.pageNo)
    return a.pageNo - b.pageNo;
  if (a.pageNo != null && b.pageNo == null) return -1;
  if (a.pageNo == null && b.pageNo != null) return 1;
  const ra = a.orderRank ?? null;
  const rb = b.orderRank ?? null;
  if (ra != null && rb != null && ra !== rb) return ra - rb;
  if (ra != null && rb == null) return -1;
  if (ra == null && rb != null) return 1;
  if (a.sortKey != null && b.sortKey != null && a.sortKey !== b.sortKey)
    return a.sortKey - b.sortKey;
  return a.publishedAt < b.publishedAt ? -1 : 1;
}

/**
 * mcq 항목에 체계도 순위를 매긴다 — 배치 노드(problems.primary_node_id)의 트리 순.
 * 노드가 없는 문제(미분류)는 null 로 남겨 뒤로 밀린다.
 */
async function attachMcqOrderRank(items: SheetItem[]): Promise<void> {
  const problemIds = [
    ...new Set(
      items
        .filter((i) => i.contentType === "mcq")
        .map((i) => i.contentId ?? "")
        .filter((id) => id.length > 0),
    ),
  ];
  if (problemIds.length === 0) return;

  const { data: problems, error } = await adminClient
    .from("problems")
    .select("problem_id, primary_node_id, laws(law_code)")
    .in("problem_id", problemIds);
  if (error) throw error;

  const nodeByProblem = new Map<string, string>();
  const lawCodes = new Set<string>();
  for (const p of problems ?? []) {
    if (!p.primary_node_id) continue;
    nodeByProblem.set(p.problem_id, p.primary_node_id);
    if (p.laws?.law_code) lawCodes.add(p.laws.law_code);
  }
  if (nodeByProblem.size === 0) return;

  const { data: nodesData, error: nodeErr } = await adminClient
    .from("systematic_nodes")
    .select("node_id, parent_id, ord, path")
    .in("law_code", [...lawCodes]);
  if (nodeErr) throw nodeErr;

  // ★path 문자열 정렬은 대분류 10개 초과 시 깨진다(b13 < b2) — 트리 순(parent+ord DFS).
  const ordered = sortSystematicTreeOrder(
    (nodesData ?? []).map((n) => ({
      nodeId: n.node_id,
      parentId: n.parent_id,
      ord: n.ord,
      path: typeof n.path === "string" ? n.path : String(n.path ?? ""),
    })),
  );
  const rankOf = new Map(ordered.map((n, i) => [n.nodeId, i]));

  for (const item of items) {
    if (item.contentType !== "mcq") continue;
    const nodeId = item.contentId ? nodeByProblem.get(item.contentId) : null;
    item.orderRank = nodeId ? (rankOf.get(nodeId) ?? null) : null;
  }
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
      contentType: r.content_type,
      contentId: r.content_id ?? "",
      choiceNo: choiceNoOf(r.source_ref),
      boxMarker: boxMarkerOf(r.source_ref),
      scope: (r.exam_scope ?? "unknown") as SheetScope,
      isWithdrawalNotice: r.withdraws_revision_id != null,
    }));

  // 정렬 전에 체계도 순위를 매긴다 — assembleSheet 는 순수 함수로 남긴다(테스트/샘플 재사용).
  await attachMcqOrderRank(items);

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

  const applicable = live
    .filter((i) => i.scope === "applicable")
    .sort(byPageOrder);
  const reference = live
    .filter((i) => i.scope !== "applicable")
    .sort(byPageOrder);

  const all = [...live, ...withdrawals];
  const updatedAt =
    all.length > 0
      ? all
          .map((i) => i.publishedAt)
          .sort()
          .at(-1)!
      : "";
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
