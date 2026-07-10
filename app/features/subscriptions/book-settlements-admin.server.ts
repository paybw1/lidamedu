// feat-8-029 P6 — 도서정산 배분규칙 (manager+). 강사 배분규칙과 동일한 세대교체 모델.
// 값 수정 대신 "새 규칙 + 기존 비활성" — 정산 지급 근거 보존. 정산 계산/지급은 추후.
// 호출부에서 권한(manager+) 검증 필수. admin client(service_role) — RLS 정책 없음.

import adminClient from "~/core/lib/supa-admin-client.server";

export type ShareKind = "percent" | "fixed";

export interface BookSettlementRule {
  ruleId: string;
  bookId: string | null; // null = 전체 기본
  bookTitle: string | null;
  payeeName: string;
  shareKind: ShareKind;
  shareValue: number;
  effectiveFrom: string;
  memo: string | null;
  isActive: boolean;
  createdAt: string;
}

export async function listBookSettlementRules(): Promise<BookSettlementRule[]> {
  const { data, error } = await adminClient
    .from("book_settlement_rules")
    .select(
      "rule_id, book_id, payee_name, share_kind, share_value, effective_from, memo, is_active, created_at, " +
        "book:books!book_settlement_rules_book_id_fkey(title)",
    )
    .order("is_active", { ascending: false })
    .order("effective_from", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  // 임베드 조인 — PostgREST 타입 추론이 GenericStringError 로 실패해 명시 캐스팅.
  const rows = (data ?? []) as unknown as Array<{
    rule_id: string;
    book_id: string | null;
    payee_name: string;
    share_kind: string;
    share_value: number;
    effective_from: string;
    memo: string | null;
    is_active: boolean;
    created_at: string;
    book: { title: string } | null;
  }>;
  return rows.map((r) => ({
    ruleId: r.rule_id,
    bookId: r.book_id,
    bookTitle: r.book?.title ?? null,
    payeeName: r.payee_name,
    shareKind: r.share_kind as ShareKind,
    shareValue: r.share_value,
    effectiveFrom: r.effective_from,
    memo: r.memo,
    isActive: r.is_active,
    createdAt: r.created_at,
  }));
}

export async function createBookSettlementRule(input: {
  bookId: string | null;
  payeeName: string;
  shareKind: ShareKind;
  shareValue: number;
  effectiveFrom: string;
  memo: string | null;
  createdBy: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const payee = input.payeeName.trim();
  if (!payee) return { ok: false, error: "정산 대상(저자/출판사)을 입력해 주세요." };
  if (input.shareKind === "percent" && (input.shareValue < 1 || input.shareValue > 100)) {
    return { ok: false, error: "정률은 1~100(%) 사이여야 합니다." };
  }
  if (input.shareValue < 0) return { ok: false, error: "배분 값이 올바르지 않습니다." };
  const { error } = await adminClient.from("book_settlement_rules").insert({
    book_id: input.bookId,
    payee_name: payee,
    share_kind: input.shareKind,
    share_value: input.shareValue,
    effective_from: input.effectiveFrom,
    memo: input.memo?.trim() || null,
    created_by: input.createdBy,
  });
  if (error) return { ok: false, error: "규칙 등록에 실패했습니다." };
  return { ok: true };
}

export async function toggleBookSettlementRule(
  ruleId: string,
  isActive: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await adminClient
    .from("book_settlement_rules")
    .update({ is_active: isActive })
    .eq("rule_id", ruleId);
  if (error) return { ok: false, error: "상태 변경에 실패했습니다." };
  return { ok: true };
}
