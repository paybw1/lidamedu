// 포인트 관리 — /lecture/points. 잔액 · 쿠폰 교환 · 적립/사용 내역.
// feat-11-011 — 포인트의 사용처는 결제 차감이 아니라 **쿠폰 교환**이다(요청서).
import { useEffect } from "react";
import { CoinsIcon, TicketIcon } from "lucide-react";
import { data, redirect, useFetcher } from "react-router";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import adminClient from "~/core/lib/supa-admin-client.server";

import type { Route } from "./+types/lecture-points";

export function meta() {
  return [{ title: "포인트 관리 | 리담변리사학원" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");

  const { data: txns } = await client
    .from("point_transactions")
    .select("txn_id, delta, reason, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = txns ?? [];
  const balance = rows.reduce((s, t) => s + t.delta, 0);

  // 교환 가능한 쿠폰 — coupons 는 staff 전용 RLS 라 요청 클라이언트로 못 읽는다.
  // 목록 표시만 adminClient 로 하고, 실제 교환은 RPC 가 서버에서 다시 검증한다.
  const { data: offerRows } = await adminClient
    .from("point_coupon_offers")
    // eslint-disable-next-line prettier/prettier
    .select("offer_id, coupon_id, point_cost, stock, coupon:coupons!point_coupon_offers_coupon_id_fkey(name, status, discount_type, discount_value, max_discount, usable_days)")
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("sort_order")
    .order("point_cost");

  const couponIds = (offerRows ?? []).map((o) => o.coupon_id);
  const mine = new Set<string>();
  const grantedCount = new Map<string, number>();
  if (couponIds.length) {
    const { data: grants } = await adminClient
      .from("coupon_grants")
      .select("coupon_id, user_id")
      .in("coupon_id", couponIds)
      .is("revoked_at", null);
    for (const g of grants ?? []) {
      grantedCount.set(g.coupon_id, (grantedCount.get(g.coupon_id) ?? 0) + 1);
      if (g.user_id === user.id) mine.add(g.coupon_id);
    }
  }

  const offers = (offerRows ?? [])
    .map((o) => {
      const c = o.coupon as {
        name: string;
        status: string;
        discount_type: string;
        discount_value: number;
        max_discount: number | null;
        usable_days: number | null;
      } | null;
      const used = grantedCount.get(o.coupon_id) ?? 0;
      return {
        offerId: o.offer_id,
        name: c?.name ?? "",
        active: c?.status === "active",
        benefit:
          c?.discount_type === "percent"
            ? `${c.discount_value}% 할인${c.max_discount ? ` (최대 ${c.max_discount.toLocaleString("ko-KR")}원)` : ""}`
            : `${(c?.discount_value ?? 0).toLocaleString("ko-KR")}원 할인`,
        usableDays: c?.usable_days ?? null,
        pointCost: o.point_cost,
        soldOut: o.stock != null && used >= o.stock,
        owned: mine.has(o.coupon_id),
      };
    })
    .filter((o) => o.active);

  return { balance, txns: rows, offers };
}

const exchangeSchema = z.object({ offerId: z.string().uuid() });

export async function action({ request }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "로그인이 필요합니다." }, { status: 401 });

  const fd = await request.formData();
  const p = exchangeSchema.safeParse({ offerId: fd.get("offerId") });
  if (!p.success) return data({ error: "잘못된 요청입니다." }, { status: 400 });

  // ★포인트 차감과 쿠폰 발급은 한 트랜잭션이어야 한다 — DB 함수가 담당한다.
  //   요청 클라이언트로 부른다(함수 안에서 auth.uid() 로 본인을 판정한다).
  const { data: res, error } = await client.rpc("exchange_points_for_coupon", {
    p_offer_id: p.data.offerId,
  });
  if (error) return data({ error: error.message }, { status: 400 });
  const out = res as { ok: boolean; error?: string; coupon?: string; spent?: number };
  if (!out?.ok) return data({ error: out?.error ?? "교환하지 못했습니다." }, { status: 400 });
  return data({
    ok: true as const,
    message: `${out.coupon} 쿠폰으로 교환했습니다. (−${(out.spent ?? 0).toLocaleString("ko-KR")}P)`,
  });
}

const won = (n: number) => n.toLocaleString("ko-KR");

function CouponExchange({
  offers,
  balance,
}: {
  offers: Route.ComponentProps["loaderData"]["offers"];
  balance: number;
}) {
  const fetcher = useFetcher<{ error?: string; message?: string }>();
  const busy = fetcher.state !== "idle";
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.error) toast.error(fetcher.data.error);
    else toast.success(fetcher.data.message ?? "교환했습니다.");
  }, [fetcher.state, fetcher.data]);

  if (offers.length === 0) return null;
  return (
    <section className="mb-8">
      <h2 className="mb-1 flex items-center gap-1.5 text-base font-bold">
        <TicketIcon className="size-4" /> 쿠폰으로 교환
      </h2>
      <p className="text-muted-foreground mb-3 text-xs">
        보유 포인트로 할인 쿠폰을 받을 수 있습니다. 쿠폰은 한 종류당 한 번만 교환됩니다.
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {offers.map((o) => {
          const short = balance < o.pointCost;
          const disabled = busy || o.owned || o.soldOut || short;
          return (
            <li
              key={o.offerId}
              className="border-border bg-card flex items-center gap-3 rounded-xl border p-4"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{o.name}</p>
                <p className="text-muted-foreground text-xs">
                  {o.benefit}
                  {o.usableDays ? ` · 교환 후 ${o.usableDays}일` : ""}
                </p>
                <p className="mt-1 text-xs font-bold tabular-nums">
                  {o.pointCost.toLocaleString("ko-KR")} P
                </p>
              </div>
              <fetcher.Form method="post">
                <input type="hidden" name="offerId" value={o.offerId} />
                <Button type="submit" size="sm" disabled={disabled}>
                  {o.owned
                    ? "교환함"
                    : o.soldOut
                      ? "소진"
                      : short
                        ? "포인트 부족"
                        : "교환"}
                </Button>
              </fetcher.Form>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function LecturePoints({ loaderData }: Route.ComponentProps) {
  const { balance, txns, offers } = loaderData;
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 md:px-6 md:py-10">
      <header className="mb-5">
        <p className="text-muted-foreground inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
          <CoinsIcon className="size-3.5" /> 마이페이지
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">포인트 관리</h1>
      </header>

      {/* 잔액 카드 */}
      <div className="from-primary/90 to-primary text-primary-foreground mb-6 rounded-2xl bg-gradient-to-br p-6 shadow-sm">
        <p className="text-primary-foreground/80 text-xs font-semibold tracking-wide uppercase">
          보유 포인트
        </p>
        <p className="mt-1 text-3xl font-extrabold tabular-nums">
          {won(balance)} <span className="text-lg font-bold">P</span>
        </p>
      </div>

      <CouponExchange offers={offers} balance={balance} />

      <h2 className="mb-2 text-base font-bold">적립·사용 내역</h2>
      {txns.length === 0 ? (
        <div className="border-border text-muted-foreground rounded-xl border border-dashed py-12 text-center text-sm">
          적립·사용 내역이 없습니다.
          <br />
          강의 수강·이벤트 참여 시 포인트가 적립됩니다.
        </div>
      ) : (
        <ul className="divide-border border-border bg-card divide-y rounded-xl border">
          {txns.map((t) => (
            <li key={t.txn_id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t.reason ?? "포인트"}</p>
                <p className="text-muted-foreground text-xs tabular-nums">
                  {new Date(t.created_at).toLocaleDateString("ko-KR")}
                </p>
              </div>
              <span
                className={`text-sm font-bold tabular-nums ${
                  t.delta >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {t.delta >= 0 ? "+" : ""}
                {won(t.delta)} P
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
