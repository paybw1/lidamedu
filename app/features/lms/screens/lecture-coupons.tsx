// 쿠폰 관리(내 쿠폰함) — /lecture/coupons. 보유 쿠폰(user_coupons ↔ discounts) 조회.
// 쿠폰 발급/적용은 가입·첫구매 자동발급 및 결제 시 코드 입력으로 이뤄진다(안내).
import { TicketPercentIcon } from "lucide-react";
import { redirect } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";

import { MyPagePlaceholder } from "../components/mypage-placeholder";

import type { Route } from "./+types/lecture-coupons";

export function meta() {
  return [{ title: "쿠폰 관리 | 리담변리사학원" }];
}

function discountLabel(kind: string, value: number): string {
  return /percent|rate|율/.test(kind)
    ? `${value}% 할인`
    : `${value.toLocaleString("ko-KR")}원 할인`;
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");

  // user_coupons(feat-11-004)·discounts 는 adminClient 로 조회(본인 id 스코프 — RLS 유무 무관 안전).
  const { data: mine } = await adminClient
    .from("user_coupons")
    .select("user_coupon_id, discount_id, issued_at, expires_at, used_at")
    .eq("user_id", user.id)
    .order("issued_at", { ascending: false });

  const rows = mine ?? [];
  const discIds = [...new Set(rows.map((r) => r.discount_id))];
  const discMap = new Map<string, { name: string; kind: string; value: number; code: string | null }>();
  if (discIds.length) {
    const { data: discs } = await adminClient
      .from("discounts")
      .select("discount_id, name, kind, value, code")
      .in("discount_id", discIds);
    for (const d of discs ?? [])
      discMap.set(d.discount_id, {
        name: d.name,
        kind: d.kind,
        value: d.value,
        code: d.code,
      });
  }

  const today = new Date().toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();
  type Coupon = {
    id: string;
    name: string;
    benefit: string;
    code: string | null;
    expiresAt: string | null;
    status: "available" | "used" | "expired";
  };
  const coupons: Coupon[] = rows.map((r) => {
    const d = discMap.get(r.discount_id);
    const status: "available" | "used" | "expired" = r.used_at
      ? "used"
      : r.expires_at && r.expires_at.slice(0, 10) < today
        ? "expired"
        : "available";
    return {
      id: r.user_coupon_id,
      name: d?.name ?? "쿠폰",
      benefit: d ? discountLabel(d.kind, d.value) : "",
      code: d?.code ?? null,
      expiresAt: r.expires_at,
      status,
    };
  });

  // feat-13 — 강의 장바구니 쿠폰(coupons) 개별 발급분도 쿠폰함에 표시.
  const { data: grants } = await adminClient
    .from("coupon_grants")
    .select("grant_id, coupon_id, expires_at, revoked_at")
    .eq("user_id", user.id)
    .is("revoked_at", null);
  const grantRows = grants ?? [];
  if (grantRows.length) {
    const couponIds = [...new Set(grantRows.map((g) => g.coupon_id))];
    const [{ data: defs }, { data: reds }] = await Promise.all([
      adminClient
        .from("coupons")
        .select(
          "coupon_id, code, name, discount_type, discount_value, max_discount, valid_to, status, deleted_at",
        )
        .in("coupon_id", couponIds),
      adminClient
        .from("coupon_redemptions")
        .select("coupon_id")
        .eq("user_id", user.id)
        .in("coupon_id", couponIds),
    ]);
    const defMap = new Map((defs ?? []).map((d) => [d.coupon_id, d]));
    const usedSet = new Set((reds ?? []).map((r) => r.coupon_id));
    for (const g of grantRows) {
      const d = defMap.get(g.coupon_id);
      if (!d || d.deleted_at) continue;
      const grantExpired = g.expires_at != null && g.expires_at < nowIso;
      const periodExpired = d.valid_to < today;
      const status: Coupon["status"] = usedSet.has(g.coupon_id)
        ? "used"
        : d.status !== "active" || grantExpired || periodExpired
          ? "expired"
          : "available";
      const benefit =
        d.discount_type === "percent"
          ? `${d.discount_value}% 할인${
              d.max_discount
                ? ` (최대 ${d.max_discount.toLocaleString("ko-KR")}원)`
                : ""
            }`
          : `${d.discount_value.toLocaleString("ko-KR")}원 할인`;
      coupons.push({
        id: g.grant_id,
        name: d.name,
        benefit,
        code: d.code,
        expiresAt: d.valid_to,
        status,
      });
    }
  }

  // 사용 가능 → 만료/사용완료 순.
  const rank = { available: 0, used: 1, expired: 2 } as const;
  coupons.sort((a, b) => rank[a.status] - rank[b.status]);
  return { coupons };
}

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  available: { label: "사용 가능", variant: "default" },
  used: { label: "사용 완료", variant: "secondary" },
  expired: { label: "기간 만료", variant: "outline" },
};

export default function LectureCoupons({ loaderData }: Route.ComponentProps) {
  const { coupons } = loaderData;
  if (coupons.length === 0) {
    return (
      <MyPagePlaceholder
        title="쿠폰 관리"
        desc="보유한 쿠폰이 없습니다. 쿠폰은 가입·첫 구매 시 자동 발급되거나, 결제 화면에서 쿠폰 코드를 입력해 적용할 수 있습니다."
        icon={<TicketPercentIcon className="size-6" />}
      />
    );
  }
  const usable = coupons.filter((c) => c.status === "available").length;
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 md:px-6 md:py-10">
      <header className="mb-6">
        <p className="text-muted-foreground inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
          <TicketPercentIcon className="size-3.5" /> 마이페이지
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">쿠폰 관리</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          보유 쿠폰 {coupons.length}장 · 사용 가능 {usable}장
        </p>
      </header>

      <ul className="flex flex-col gap-3">
        {coupons.map((c) => {
          const badge = STATUS_BADGE[c.status];
          const dim = c.status !== "available";
          return (
            <li
              key={c.id}
              className={`border-border bg-card flex items-center gap-4 rounded-xl border p-4 shadow-sm ${
                dim ? "opacity-60" : ""
              }`}
            >
              <div className="text-primary flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <TicketPercentIcon className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">{c.name}</p>
                <p className="text-primary mt-0.5 text-sm font-semibold">
                  {c.benefit}
                </p>
                <p className="text-muted-foreground mt-0.5 text-xs tabular-nums">
                  {c.expiresAt
                    ? `~ ${c.expiresAt.slice(0, 10).replace(/-/g, ".")}까지`
                    : "유효기간 제한 없음"}
                  {c.code ? ` · ${c.code}` : ""}
                </p>
              </div>
              <Badge variant={badge.variant} className="shrink-0 text-[11px]">
                {badge.label}
              </Badge>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
