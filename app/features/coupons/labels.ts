// feat-13 쿠폰 관리 — 공용 타입·라벨 (client-safe).
import type { Database } from "database.types";

export type CouponRow = Database["public"]["Tables"]["coupons"]["Row"];

export type CouponScope =
  | "all"
  | "course_package"
  | "course"
  | "package"
  | "book"
  | "product";
export const SCOPE_LABEL: Record<CouponScope, string> = {
  all: "과정/패키지/도서/상품",
  course_package: "과정/패키지",
  course: "과정",
  package: "패키지",
  book: "도서",
  product: "상품",
};
export const SCOPE_OPTIONS: { value: CouponScope; label: string }[] = [
  { value: "all", label: "과정/패키지/도서/상품" },
  { value: "course_package", label: "과정/패키지" },
  { value: "course", label: "과정" },
  { value: "package", label: "패키지" },
  { value: "book", label: "도서" },
  { value: "product", label: "상품" },
];

export type DiscountType = "fixed" | "percent";
export const DISCOUNT_LABEL: Record<DiscountType, string> = {
  fixed: "정액",
  percent: "정률",
};

export type CouponStatus = "active" | "stopped";
export const STATUS_LABEL: Record<CouponStatus, string> = {
  active: "정상",
  stopped: "중지",
};

const won = (n: number) => n.toLocaleString("ko-KR");

// 할인혜택(최대금액) 표시 — 정액=금액, 정률=%(+최대금액).
export function formatDiscount(row: CouponRow): string {
  if (row.discount_type === "percent") {
    return `${row.discount_value}%${
      row.max_discount ? ` (최대 ${won(row.max_discount)}원)` : ""
    }`;
  }
  return `${won(row.discount_value)}원`;
}

export function formatValidPeriod(row: CouponRow): string {
  const f = (d: string) => d.replace(/-/g, ".");
  return `${f(row.valid_from)} ~ ${f(row.valid_to)}`;
}
