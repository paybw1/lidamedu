// feat-6-011 고객센터 문의 — 분류/상태 라벨 SSOT (client-safe, *.server 아님).
import type { Database } from "database.types";

export type CsCategory = Database["public"]["Enums"]["cs_inquiry_category"];
export type CsStatus = Database["public"]["Enums"]["cs_inquiry_status"];

export const CS_CATEGORY_LABEL: Record<CsCategory, string> = {
  payment: "결제·환불",
  course: "수강·강의",
  book: "교재·배송",
  account: "계정·로그인",
  site: "사이트 이용",
  etc: "기타",
};

export const CS_CATEGORY_ORDER: CsCategory[] = [
  "payment",
  "course",
  "book",
  "account",
  "site",
  "etc",
];

export const CS_STATUS_LABEL: Record<CsStatus, string> = {
  open: "답변 대기",
  answered: "답변 완료",
  closed: "종료",
};

export function isCsCategory(v: string): v is CsCategory {
  return v in CS_CATEGORY_LABEL;
}
