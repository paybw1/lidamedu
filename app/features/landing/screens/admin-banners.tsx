// feat-12 히어로 배너 운영자 목록 — /admin/landing-banners. 추가/삭제로 배너 개수 조절.
import { useEffect } from "react";

import { PlusIcon } from "lucide-react";
import { Link, data, redirect, useFetcher } from "react-router";
import { toast } from "sonner";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import {
  LANDING_TIER_GAP2_COLOR_KEY,
  LANDING_TIER_GAP2_PX_KEY,
  LANDING_TIER_GAP_COLOR_KEY,
  LANDING_TIER_GAP_PX_KEY,
  LANDING_TIER_GAP_TOP_COLOR_KEY,
  LANDING_TIER_GAP_TOP_PX_KEY,
  getLandingTierGap,
  setAppSetting,
  type TierGapOne,
} from "~/core/lib/app-settings.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { getStaffRole } from "~/features/laws/queries.server";

import { AdminRowControls } from "../components/admin-row-controls";
import {
  BANNER_ACCENT_LABEL,
  BANNER_KIND_LABEL,
  type BannerAccent,
  type BannerKind,
} from "../labels";
import { listBanners } from "../queries.server";

import type { Route } from "./+types/admin-banners";

export function meta() {
  return [{ title: "히어로 배너 관리 | 운영관리" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const role = await getStaffRole(client, user.id);
  if (!role) throw redirect("/dashboard");
  const banners = await listBanners(client, { includeUnpublished: true });
  const tierGap = await getLandingTierGap(client);
  return { role, banners, tierGap };
}

export async function action({ request }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "로그인이 필요합니다." }, { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) return data({ error: "권한이 없습니다." }, { status: 403 });

  const fd = await request.formData();
  if (fd.get("intent") !== "set_tier_gap")
    return data({ error: "알 수 없는 요청" }, { status: 400 });

  // 경계별(1↔2단 suffix "12", 2↔3단 "23") px·색 파싱. 색 비움=""(투명, null 저장 회피).
  const parseGap = (suffix: string) => {
    const px = Math.trunc(Number(fd.get(`px${suffix}`) ?? NaN));
    const colorRaw = String(fd.get(`color${suffix}`) ?? "").trim();
    const useColor = fd.get(`useColor${suffix}`) === "1";
    const color =
      useColor && /^#[0-9a-fA-F]{6}$/.test(colorRaw) ? colorRaw : "";
    return { px, color };
  };
  const gTop = parseGap("Top");
  const g12 = parseGap("12");
  const g23 = parseGap("23");
  for (const g of [gTop, g12, g23]) {
    if (!Number.isFinite(g.px) || g.px < 0 || g.px > 400)
      return data({ error: "간격은 0~400px 사이여야 합니다." }, { status: 400 });
  }

  const writes = await Promise.all([
    setAppSetting(client, LANDING_TIER_GAP_TOP_PX_KEY, gTop.px, user.id),
    setAppSetting(client, LANDING_TIER_GAP_TOP_COLOR_KEY, gTop.color, user.id),
    setAppSetting(client, LANDING_TIER_GAP_PX_KEY, g12.px, user.id),
    setAppSetting(client, LANDING_TIER_GAP_COLOR_KEY, g12.color, user.id),
    setAppSetting(client, LANDING_TIER_GAP2_PX_KEY, g23.px, user.id),
    setAppSetting(client, LANDING_TIER_GAP2_COLOR_KEY, g23.color, user.id),
  ]);
  const failed = writes.find((w) => !w.ok);
  if (failed && !failed.ok)
    return data({ error: failed.error }, { status: 400 });
  return data({ ok: true as const });
}

export default function AdminBanners({ loaderData }: Route.ComponentProps) {
  const { role, banners, tierGap } = loaderData;
  return (
    <AdminShell
      cluster="landing"
      role={role}
      title="히어로 배너 관리"
      desc="랜딩 상단에서 자동 순환하는 배너를 추가·삭제·정렬합니다. 공개된 배너만 순서(↑/↓)대로 노출됩니다."
      headerRight={
        <Button asChild size="sm">
          <Link to="/admin/landing-banners/new">
            <PlusIcon className="size-4" /> 배너 추가
          </Link>
        </Button>
      }
    >
      <div className="p-5 md:p-8">
        <TierGapPanel tierGap={tierGap} />
        {banners.length === 0 ? (
          <div className="text-muted-foreground rounded-xl border border-dashed py-16 text-center text-sm">
            등록된 배너가 없습니다. 배너를 추가하면 랜딩 히어로에 노출됩니다.
          </div>
        ) : (
          <ul className="divide-border bg-card divide-y rounded-xl border">
            {banners.map((b, i) => (
              <li key={b.banner_id} className="flex items-center gap-3 px-3 py-3">
                <AdminRowControls
                  entity="banner"
                  id={b.banner_id}
                  isFirst={i === 0}
                  isLast={i === banners.length - 1}
                />
                <Link
                  to={`/admin/landing-banners/${b.banner_id}/edit`}
                  className="hover:bg-muted/40 flex flex-1 items-center gap-3 rounded-lg px-2 py-1"
                >
                  <span className="text-muted-foreground w-6 shrink-0 text-center text-xs tabular-nums">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-sm font-semibold">{b.headline}</span>
                    <span className="text-muted-foreground ml-2 text-xs">
                      {BANNER_KIND_LABEL[b.kind as BannerKind]} ·{" "}
                      {BANNER_ACCENT_LABEL[b.accent as BannerAccent]}
                    </span>
                  </span>
                  {b.published ? (
                    <Badge className="shrink-0 text-[11px]">공개</Badge>
                  ) : (
                    <Badge variant="secondary" className="shrink-0 text-[11px]">
                      비공개
                    </Badge>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminShell>
  );
}

// 경계 1개 편집 행 — px + 간격 색(체크 시 적용). suffix 로 필드명 구분(12/23).
function GapRow({
  label,
  suffix,
  gap,
}: {
  label: string;
  suffix: string;
  gap: TierGapOne;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <span className="w-20 text-sm font-medium">{label}</span>
      <label className="inline-flex items-center gap-1.5 text-sm">
        간격
        <input
          type="number"
          name={`px${suffix}`}
          min={0}
          max={400}
          defaultValue={gap.px}
          className="border-input bg-background h-8 w-20 rounded-md border px-2 text-sm tabular-nums"
        />
        px
      </label>
      <label className="inline-flex items-center gap-1.5 text-sm">
        <input
          type="checkbox"
          name={`useColor${suffix}`}
          value="1"
          defaultChecked={gap.color !== null}
          className="size-3.5"
        />
        간격 색
        <input
          type="color"
          name={`color${suffix}`}
          defaultValue={gap.color ?? "#0e1d38"}
          className="border-input h-8 w-12 cursor-pointer rounded-md border bg-transparent p-0.5"
        />
      </label>
    </div>
  );
}

// 단(tier) 사이 간격(px)·색 설정 — 경계별(1↔2단 / 2↔3단) 독립.
function TierGapPanel({
  tierGap,
}: {
  tierGap: { gapTop: TierGapOne; gap12: TierGapOne; gap23: TierGapOne };
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.error) toast.error(fetcher.data.error);
    else if (fetcher.data.ok) toast.success("간격 설정을 저장했습니다.");
  }, [fetcher.state, fetcher.data]);
  return (
    <fetcher.Form
      method="post"
      className="border-border bg-card mb-4 rounded-xl border p-4"
    >
      <input type="hidden" name="intent" value="set_tier_gap" />
      <div className="mb-3 flex items-center gap-2">
        <div>
          <p className="text-sm font-semibold">단 사이 간격</p>
          <p className="text-muted-foreground text-xs">
            히어로 단 사이 여백(px)과 그 배경색을 경계별로 조정합니다.
          </p>
        </div>
        <Button
          type="submit"
          size="sm"
          className="ml-auto"
          disabled={fetcher.state !== "idle"}
        >
          저장
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        <GapRow label="히어로 위" suffix="Top" gap={tierGap.gapTop} />
        <GapRow label="1 ↔ 2단" suffix="12" gap={tierGap.gap12} />
        <GapRow label="2 ↔ 3단" suffix="23" gap={tierGap.gap23} />
      </div>
    </fetcher.Form>
  );
}
