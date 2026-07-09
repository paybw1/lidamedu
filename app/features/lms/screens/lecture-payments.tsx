// 결제내역 조회 — /lecture/payments. 내 주문의 결제·환불 이력(RLS self-read).
import { ReceiptTextIcon } from "lucide-react";
import { redirect } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import makeServerClient from "~/core/lib/supa-client.server";

import { MyPagePlaceholder } from "../components/mypage-placeholder";

import type { Route } from "./+types/lecture-payments";

export function meta() {
  return [{ title: "결제내역 조회 | 리담변리사학원" }];
}

const STATUS: Record<string, { label: string; tone: "ok" | "muted" | "warn" | "bad" }> = {
  paid: { label: "결제완료", tone: "ok" },
  pending_payment: { label: "결제대기", tone: "warn" },
  pending_deposit: { label: "입금대기", tone: "warn" },
  partially_refunded: { label: "부분환불", tone: "muted" },
  refunded: { label: "환불완료", tone: "muted" },
  cancelled: { label: "취소", tone: "bad" },
  failed: { label: "실패", tone: "bad" },
  draft: { label: "임시", tone: "muted" },
};
const METHOD: Record<string, string> = {
  card: "카드",
  bank_transfer: "무통장 입금",
  toss: "토스",
  free: "무료",
};
const ITEM_TYPE: Record<string, string> = {
  plan: "수강권",
  course: "강의",
  book: "도서",
  bundle: "패키지",
  membership: "멤버십",
};

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");

  const { data: orders } = await client
    .from("orders")
    .select("order_id, status, total_krw, payment_method, created_at")
    .eq("user_id", user.id)
    .not("status", "in", "(draft)")
    .order("created_at", { ascending: false })
    .limit(100);
  const ids = (orders ?? []).map((o) => o.order_id);

  const itemsByOrder = new Map<string, string[]>();
  if (ids.length) {
    const { data: items } = await client
      .from("order_items")
      .select("order_id, item_type, quantity, subject_code")
      .in("order_id", ids);
    for (const it of items ?? []) {
      const arr = itemsByOrder.get(it.order_id) ?? [];
      arr.push(
        `${ITEM_TYPE[it.item_type] ?? it.item_type}${
          it.subject_code ? ` (${it.subject_code})` : ""
        }${it.quantity > 1 ? ` ×${it.quantity}` : ""}`,
      );
      itemsByOrder.set(it.order_id, arr);
    }
  }
  return {
    orders: (orders ?? []).map((o) => ({
      ...o,
      items: itemsByOrder.get(o.order_id) ?? [],
    })),
  };
}

const won = (n: number) => n.toLocaleString("ko-KR");

export default function LecturePayments({ loaderData }: Route.ComponentProps) {
  const { orders } = loaderData;
  if (orders.length === 0) {
    return (
      <MyPagePlaceholder
        title="결제내역 조회"
        desc="아직 결제내역이 없습니다. 수강신청·도서 구매 시 이곳에서 결제와 환불 이력을 확인하실 수 있습니다."
        icon={<ReceiptTextIcon className="size-6" />}
      />
    );
  }
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 md:px-6 md:py-10">
      <header className="mb-6">
        <p className="text-muted-foreground inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
          <ReceiptTextIcon className="size-3.5" /> 마이페이지
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">결제내역 조회</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          강의·도서 결제와 환불 이력입니다. 최근 순으로 표시됩니다.
        </p>
      </header>

      <ul className="flex flex-col gap-3">
        {orders.map((o) => {
          const st = STATUS[o.status] ?? { label: o.status, tone: "muted" as const };
          return (
            <li
              key={o.order_id}
              className="border-border bg-card flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border p-4 shadow-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {new Date(o.created_at).toLocaleDateString("ko-KR")}
                  </span>
                  <Badge
                    variant={st.tone === "ok" ? "default" : "secondary"}
                    className="text-[11px]"
                  >
                    {st.label}
                  </Badge>
                </div>
                <p className="mt-1 text-sm font-semibold">
                  {o.items.length ? o.items.join(", ") : "주문"}
                </p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {METHOD[o.payment_method ?? ""] ?? o.payment_method ?? "-"} · 주문번호{" "}
                  <span className="font-mono">{o.order_id.slice(0, 8)}</span>
                </p>
              </div>
              <div className="text-right">
                <span className="text-base font-bold tabular-nums">
                  {won(o.total_krw)}원
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
