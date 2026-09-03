// feat-11-011 — 포인트 관리 (manager+). 요청서 '리담변리사학원 포인트정책' 반영.
//   탭 1 적립 정책 — 13종의 적립량·적립한도·사용여부를 운영자가 고친다.
//   탭 2 쿠폰 전환 — 포인트로 바꿀 수 있는 쿠폰을 등록한다.
//   탭 3 이용내역 — 적립·사용·회수 내역 + 수동 지급/회수.

import { useEffect } from "react";
import { CoinsIcon } from "lucide-react";
import { Form, Link, data, useFetcher } from "react-router";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { roleAtLeast } from "~/core/lib/roles";
import makeServerClient from "~/core/lib/supa-client.server";
import adminClient from "~/core/lib/supa-admin-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import {
  AdminSelect,
  Chip,
  IndexTable,
  MemberLink,
  TD,
  TR,
} from "~/features/admin/components/admin-ui";
import { adjustMemberPoints } from "~/features/admin/queries/member-crm.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { listPointPolicies } from "~/features/points/points.server";
import {
  listCouponsForOffer,
  listPointLedger,
  listPointOffers,
} from "~/features/points/queries.server";

import type { Route } from "./+types/admin-points";

export const meta: Route.MetaFunction = () => [
  { title: "포인트 관리 | 리담변리사학원" },
];

const TABS = [
  { id: "policies", label: "적립 정책" },
  { id: "offers", label: "쿠폰 전환" },
  { id: "ledger", label: "이용내역" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const LIMIT_LABEL: Record<string, string> = {
  once: "평생 1회",
  every: "매번",
  daily: "1일 N회",
};
const KIND_LABEL: Record<string, string> = {
  earn: "적립",
  spend: "사용",
  revoke: "회수",
  expire: "소멸",
  manual: "수동",
};
const KIND_TONE: Record<string, "emerald" | "violet" | "coral" | "neutral"> = {
  earn: "emerald",
  spend: "violet",
  revoke: "coral",
  expire: "neutral",
  manual: "neutral",
};

async function requireManager(request: Request) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("로그인이 필요합니다.", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!roleAtLeast(role, "manager")) {
    throw data("포인트 관리는 관리자 이상만 이용할 수 있습니다.", { status: 403 });
  }
  return { user, role };
}

export async function loader({ request }: Route.LoaderArgs) {
  const { role } = await requireManager(request);
  const url = new URL(request.url);
  const tab = (TABS.find((t) => t.id === url.searchParams.get("tab"))?.id ??
    "policies") as TabId;
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 60);
  const kind = url.searchParams.get("kind") ?? "";

  const [policies, offers, coupons, ledger] = await Promise.all([
    listPointPolicies(),
    tab === "offers" ? listPointOffers() : Promise.resolve([]),
    tab === "offers" ? listCouponsForOffer() : Promise.resolve([]),
    tab === "ledger" ? listPointLedger({ query: q, kind: kind || undefined }) : Promise.resolve([]),
  ]);
  return { role, tab, q, kind, policies, offers, coupons, ledger };
}

const policySchema = z.object({
  policyKey: z.string().min(1),
  awardValue: z.coerce.number().min(0).max(1_000_000),
  limitKind: z.enum(["once", "every", "daily"]),
  dailyCap: z.coerce.number().int().min(1).max(99).optional(),
  isActive: z.coerce.boolean(),
});
const offerSchema = z.object({
  couponId: z.string().uuid(),
  pointCost: z.coerce.number().int().min(1).max(10_000_000),
  stock: z.string().optional(),
});
const adjustSchema = z.object({
  memberNo: z.coerce.number().int().positive(),
  delta: z.coerce.number().int(),
  reason: z.string().trim().min(2, "사유를 입력하세요").max(200),
});

export async function action({ request }: Route.ActionArgs) {
  const { user } = await requireManager(request);
  const fd = await request.formData();
  const intent = fd.get("intent");

  if (intent === "save_policy") {
    const p = policySchema.safeParse({
      policyKey: fd.get("policyKey"),
      awardValue: fd.get("awardValue"),
      limitKind: fd.get("limitKind"),
      dailyCap: fd.get("dailyCap") || undefined,
      isActive: fd.get("isActive") === "1",
    });
    if (!p.success) return data({ error: p.error.issues[0]?.message ?? "입력 오류" }, { status: 400 });
    const { error } = await adminClient
      .from("point_policies")
      .update({
        award_value: p.data.awardValue,
        limit_kind: p.data.limitKind,
        daily_cap: p.data.limitKind === "daily" ? (p.data.dailyCap ?? 1) : null,
        is_active: p.data.isActive,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      })
      .eq("policy_key", p.data.policyKey);
    if (error) return data({ error: error.message }, { status: 400 });
    return data({ ok: true as const, message: "정책을 저장했습니다." });
  }

  if (intent === "add_offer") {
    const p = offerSchema.safeParse({
      couponId: fd.get("couponId"),
      pointCost: fd.get("pointCost"),
      stock: fd.get("stock") ?? undefined,
    });
    if (!p.success) return data({ error: p.error.issues[0]?.message ?? "입력 오류" }, { status: 400 });
    const stockRaw = (p.data.stock ?? "").trim();
    const { error } = await adminClient.from("point_coupon_offers").insert({
      coupon_id: p.data.couponId,
      point_cost: p.data.pointCost,
      stock: stockRaw === "" ? null : Math.max(0, Number(stockRaw) || 0),
    });
    if (error) return data({ error: error.message }, { status: 400 });
    return data({ ok: true as const, message: "교환 쿠폰을 등록했습니다." });
  }

  if (intent === "toggle_offer" || intent === "remove_offer") {
    const offerId = String(fd.get("offerId") ?? "");
    if (!offerId) return data({ error: "대상이 없습니다." }, { status: 400 });
    const patch =
      intent === "remove_offer"
        ? { deleted_at: new Date().toISOString() }
        : { is_active: fd.get("next") === "1" };
    const { error } = await adminClient
      .from("point_coupon_offers")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("offer_id", offerId);
    if (error) return data({ error: error.message }, { status: 400 });
    return data({
      ok: true as const,
      message: intent === "remove_offer" ? "교환 목록에서 내렸습니다." : "변경했습니다.",
    });
  }

  if (intent === "adjust") {
    const p = adjustSchema.safeParse({
      memberNo: fd.get("memberNo"),
      delta: fd.get("delta"),
      reason: fd.get("reason"),
    });
    if (!p.success) return data({ error: p.error.issues[0]?.message ?? "입력 오류" }, { status: 400 });
    const { data: prof } = await adminClient
      .from("profiles")
      .select("profile_id, name")
      .eq("member_no", p.data.memberNo)
      .maybeSingle();
    if (!prof) return data({ error: `회원번호 ${p.data.memberNo} 를 찾을 수 없습니다.` }, { status: 400 });
    const res = await adjustMemberPoints({
      userId: prof.profile_id,
      delta: p.data.delta,
      reason: p.data.reason,
    });
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({
      ok: true as const,
      message: `${prof.name ?? "회원"} — ${p.data.delta > 0 ? "+" : ""}${p.data.delta.toLocaleString("ko-KR")}P (잔액 ${res.newBalance.toLocaleString("ko-KR")}P)`,
    });
  }

  return data({ error: "알 수 없는 요청입니다." }, { status: 400 });
}

const P = (n: number) => `${n.toLocaleString("ko-KR")}P`;
const fmtDate = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 9 * 3600_000);
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)}`;
};

export default function AdminPoints({ loaderData }: Route.ComponentProps) {
  const { role, tab, q, kind, policies, offers, coupons, ledger } = loaderData;
  const activeCount = policies.filter((p) => p.isActive).length;

  return (
    <AdminShell
      cluster="products"
      role={role}
      title="포인트 관리"
      desc="적립 정책과 포인트로 바꿀 수 있는 쿠폰을 관리합니다. 적립량·적립한도·사용여부는 여기서 바꾸면 즉시 반영됩니다."
      headerRight={
        <span className="text-muted-foreground text-xs font-semibold">
          <CoinsIcon className="mr-1 inline size-3.5" />
          활성 정책 {activeCount} / {policies.length}
        </span>
      }
    >
      <div className="border-border mb-4 flex gap-1 border-b">
        {TABS.map((t) => (
          <Link
            key={t.id}
            to={`?tab=${t.id}`}
            className={
              "rounded-t-lg px-4 py-2 text-sm font-semibold " +
              (tab === t.id
                ? "border-primary text-foreground border-b-2"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "policies" ? <PoliciesTab policies={policies} /> : null}
      {tab === "offers" ? <OffersTab offers={offers} coupons={coupons} /> : null}
      {tab === "ledger" ? <LedgerTab rows={ledger} q={q} kind={kind} /> : null}
    </AdminShell>
  );
}

/* ── 탭 1 · 적립 정책 ──────────────────────────────────────────────────────── */
function PoliciesTab({ policies }: { policies: Route.ComponentProps["loaderData"]["policies"] }) {
  return (
    <>
      <p className="text-muted-foreground mb-3 text-xs leading-relaxed">
        <strong className="text-foreground">연결 대기</strong> 로 표시된 정책은 적립 시점이 아직
        코드에 연결되지 않았습니다. 사용여부를 켜도 적립되지 않으니, 필요하시면 알려주세요.
      </p>
      <IndexTable
        minWidth={900}
        headers={[
          { label: "정책", width: "9rem" },
          { label: "적립 기준" },
          { label: "적립량", width: "9rem" },
          { label: "적립한도", width: "11rem" },
          { label: "사용여부", align: "center", width: "7rem" },
          { label: "", align: "center", width: "5rem" },
        ]}
      >
        {policies.map((p) => (
          <PolicyRow key={p.policyKey} policy={p} />
        ))}
      </IndexTable>
    </>
  );
}

function PolicyRow({
  policy,
}: {
  policy: Route.ComponentProps["loaderData"]["policies"][number];
}) {
  const fetcher = useFetcher<{ error?: string; message?: string }>();
  const busy = fetcher.state !== "idle";
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.error) toast.error(fetcher.data.error);
    else toast.success(fetcher.data.message ?? "저장했습니다.");
  }, [fetcher.state, fetcher.data]);

  return (
    <TR>
      <TD>
        <span className="font-semibold">{policy.label}</span>
        {!policy.hookReady ? (
          <span className="text-muted-foreground mt-0.5 block text-[10px]">연결 대기</span>
        ) : null}
      </TD>
      <TD soft className="text-xs">
        {policy.criteria}
      </TD>
      <fetcher.Form method="post" className="contents">
        <input type="hidden" name="intent" value="save_policy" />
        <input type="hidden" name="policyKey" value={policy.policyKey} />
        <TD>
          <div className="flex items-center gap-1">
            <Input
              name="awardValue"
              defaultValue={policy.awardValue}
              type="number"
              step={policy.awardType === "percent" ? "0.1" : "1"}
              min="0"
              className="h-8 w-24 text-xs tabular-nums"
            />
            <span className="text-muted-foreground text-xs">
              {policy.awardType === "percent" ? "%" : "P"}
            </span>
          </div>
        </TD>
        <TD>
          <div className="flex items-center gap-1">
            <AdminSelect name="limitKind" defaultValue={policy.limitKind} className="h-8 text-xs">
              <option value="once">평생 1회</option>
              <option value="every">매번</option>
              <option value="daily">1일 N회</option>
            </AdminSelect>
            <Input
              name="dailyCap"
              defaultValue={policy.dailyCap ?? 1}
              type="number"
              min="1"
              max="99"
              className="h-8 w-14 text-xs tabular-nums"
              title="1일 N회 일 때의 N"
            />
          </div>
        </TD>
        <TD align="center">
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs">
            <input type="hidden" name="isActive" value="0" />
            <input
              type="checkbox"
              name="isActive"
              value="1"
              defaultChecked={policy.isActive}
              className="size-4"
            />
            {policy.isActive ? "정상" : "중지"}
          </label>
        </TD>
        <TD align="center">
          <Button type="submit" size="sm" variant="outline" disabled={busy} className="h-7 px-3 text-xs">
            {busy ? "…" : "저장"}
          </Button>
        </TD>
      </fetcher.Form>
    </TR>
  );
}

/* ── 탭 2 · 쿠폰 전환 ──────────────────────────────────────────────────────── */
function OffersTab({
  offers,
  coupons,
}: {
  offers: Route.ComponentProps["loaderData"]["offers"];
  coupons: Route.ComponentProps["loaderData"]["coupons"];
}) {
  const fetcher = useFetcher<{ error?: string; message?: string }>();
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.error) toast.error(fetcher.data.error);
    else toast.success(fetcher.data.message ?? "처리했습니다.");
  }, [fetcher.state, fetcher.data]);

  return (
    <>
      <div className="border-border bg-card mb-4 rounded-xl border p-4">
        <h2 className="mb-1 text-sm font-bold">교환 쿠폰 등록</h2>
        <p className="text-muted-foreground mb-3 text-xs leading-relaxed">
          쿠폰 관리에 등록된 <strong>사용 중</strong> 쿠폰만 고를 수 있습니다. 한 쿠폰은 회원당
          한 번만 교환됩니다(쿠폰 발급이 1인 1매 구조입니다).
        </p>
        {coupons.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            등록할 수 있는 쿠폰이 없습니다.{" "}
            <Link to="/admin/coupons" className="text-link underline">
              쿠폰 관리
            </Link>
            에서 먼저 쿠폰을 만들어 주세요.
          </p>
        ) : (
          <fetcher.Form method="post" className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="intent" value="add_offer" />
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground text-[11px] font-semibold">쿠폰</span>
              <AdminSelect name="couponId" className="h-9 min-w-64 text-sm">
                {coupons.map((c) => (
                  <option key={c.couponId} value={c.couponId}>
                    {c.label}
                  </option>
                ))}
              </AdminSelect>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground text-[11px] font-semibold">필요 포인트</span>
              <Input name="pointCost" type="number" min="1" defaultValue={1000} className="h-9 w-32 tabular-nums" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground text-[11px] font-semibold">
                수량 (비우면 무제한)
              </span>
              <Input name="stock" type="number" min="0" placeholder="무제한" className="h-9 w-32 tabular-nums" />
            </label>
            <Button type="submit" size="sm" className="h-9">
              등록
            </Button>
          </fetcher.Form>
        )}
      </div>

      {offers.length === 0 ? (
        <div className="border-border text-muted-foreground rounded-xl border border-dashed py-12 text-center text-sm">
          교환 가능한 쿠폰이 없습니다. 위에서 등록하면 회원의 포인트 화면에 나타납니다.
        </div>
      ) : (
        <IndexTable
          minWidth={860}
          headers={[
            { label: "쿠폰" },
            { label: "할인", width: "10rem" },
            { label: "필요 포인트", align: "right", width: "8rem" },
            { label: "교환/수량", align: "right", width: "8rem" },
            { label: "노출", align: "center", width: "6rem" },
            { label: "", align: "center", width: "5rem" },
          ]}
        >
          {offers.map((o) => (
            <TR key={o.offerId}>
              <TD>
                <span className="font-semibold">{o.couponName}</span>
                {o.couponStatus !== "active" ? (
                  <Chip tone="coral" className="ml-2">
                    쿠폰 중지됨
                  </Chip>
                ) : null}
                {o.usableDays ? (
                  <span className="text-muted-foreground mt-0.5 block text-[10px]">
                    교환 후 {o.usableDays}일간 사용
                  </span>
                ) : null}
              </TD>
              <TD soft>{o.discountLabel}</TD>
              <TD align="right" mono>
                {P(o.pointCost)}
              </TD>
              <TD align="right" mono soft>
                {o.granted} / {o.stock ?? "무제한"}
              </TD>
              <TD align="center">
                <fetcher.Form method="post">
                  <input type="hidden" name="intent" value="toggle_offer" />
                  <input type="hidden" name="offerId" value={o.offerId} />
                  <input type="hidden" name="next" value={o.isActive ? "0" : "1"} />
                  <button type="submit" className="cursor-pointer">
                    <Chip tone={o.isActive ? "emerald" : "neutral"}>
                      {o.isActive ? "노출" : "숨김"}
                    </Chip>
                  </button>
                </fetcher.Form>
              </TD>
              <TD align="center">
                <fetcher.Form method="post">
                  <input type="hidden" name="intent" value="remove_offer" />
                  <input type="hidden" name="offerId" value={o.offerId} />
                  <Button
                    type="submit"
                    size="sm"
                    variant="outline"
                    className="h-7 px-3 text-xs text-rose-600 dark:text-rose-400"
                  >
                    내리기
                  </Button>
                </fetcher.Form>
              </TD>
            </TR>
          ))}
        </IndexTable>
      )}
    </>
  );
}

/* ── 탭 3 · 이용내역 ───────────────────────────────────────────────────────── */
function LedgerTab({
  rows,
  q,
  kind,
}: {
  rows: Route.ComponentProps["loaderData"]["ledger"];
  q: string;
  kind: string;
}) {
  const fetcher = useFetcher<{ error?: string; message?: string }>();
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.error) toast.error(fetcher.data.error);
    else toast.success(fetcher.data.message ?? "처리했습니다.");
  }, [fetcher.state, fetcher.data]);

  return (
    <>
      <div className="border-border bg-card mb-4 rounded-xl border p-4">
        <h2 className="mb-1 text-sm font-bold">수동 지급 · 회수</h2>
        <p className="text-muted-foreground mb-3 text-xs">
          회수는 음수로 입력합니다(예: −500). 사유는 내역에 그대로 남습니다.
        </p>
        <fetcher.Form method="post" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="intent" value="adjust" />
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground text-[11px] font-semibold">회원번호</span>
            <Input name="memberNo" type="number" min="1" required className="h-9 w-28 tabular-nums" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground text-[11px] font-semibold">증감 포인트</span>
            <Input name="delta" type="number" required placeholder="1000 / -500" className="h-9 w-32 tabular-nums" />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-muted-foreground text-[11px] font-semibold">사유 (필수)</span>
            <Input name="reason" required minLength={2} maxLength={200} className="h-9 min-w-56" />
          </label>
          <Button type="submit" size="sm" className="h-9">
            반영
          </Button>
        </fetcher.Form>
      </div>

      <Form method="get" className="mb-3 flex flex-wrap items-center gap-2">
        <input type="hidden" name="tab" value="ledger" />
        <Input name="q" defaultValue={q} placeholder="이름 / 회원번호 / 사유" className="h-9 w-72" />
        <AdminSelect name="kind" defaultValue={kind} className="h-9">
          <option value="">전체 유형</option>
          {Object.entries(KIND_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </AdminSelect>
        <Button type="submit" size="sm" variant="outline" className="h-9">
          조회
        </Button>
      </Form>

      {rows.length === 0 ? (
        <div className="border-border text-muted-foreground rounded-xl border border-dashed py-12 text-center text-sm">
          내역이 없습니다.
        </div>
      ) : (
        <IndexTable
          minWidth={960}
          headers={[
            { label: "일시", width: "10rem" },
            { label: "회원" },
            { label: "유형", align: "center", width: "5rem" },
            { label: "정책", width: "8rem" },
            { label: "사유" },
            { label: "주문", width: "6rem" },
            { label: "증감", align: "right", width: "7rem" },
            { label: "잔액", align: "right", width: "7rem" },
          ]}
          footer={
            <div className="border-border/60 text-muted-foreground border-t px-3 py-2 text-[11px] font-medium tabular-nums">
              총 {rows.length}건
            </div>
          }
        >
          {rows.map((r) => (
            <TR key={r.txnId}>
              <TD mono soft>
                {fmtDate(r.createdAt)}
              </TD>
              <TD>
                <MemberLink profileId={r.userId} name={r.userName} />
                {r.memberNo ? (
                  <span className="text-muted-foreground ml-1 text-[10px]">#{r.memberNo}</span>
                ) : null}
              </TD>
              <TD align="center">
                <Chip tone={KIND_TONE[r.kind] ?? "neutral"}>{KIND_LABEL[r.kind] ?? r.kind}</Chip>
              </TD>
              <TD soft className="text-xs">
                {r.policyLabel ?? "—"}
              </TD>
              <TD soft className="max-w-[18rem] truncate text-xs">
                {r.reason ?? "—"}
                {r.actorName ? (
                  <span className="text-muted-foreground/70"> · {r.actorName}</span>
                ) : null}
              </TD>
              <TD mono soft className="text-xs">
                {r.orderNo ?? "—"}
              </TD>
              <TD align="right" mono>
                <span
                  className={
                    r.delta >= 0
                      ? "text-emerald-700 dark:text-emerald-300"
                      : "text-rose-600 dark:text-rose-400"
                  }
                >
                  {r.delta > 0 ? "+" : ""}
                  {r.delta.toLocaleString("ko-KR")}
                </span>
              </TD>
              <TD align="right" mono soft>
                {r.balanceAfter?.toLocaleString("ko-KR") ?? "—"}
              </TD>
            </TR>
          ))}
        </IndexTable>
      )}
    </>
  );
}
