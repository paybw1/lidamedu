// 법령 운영 허브 — 4법(특허/상표/디자인/민법) × {개정 워크스페이스, 법령 완성도} 진입.
// 사이드바의 patent 하드코딩(/admin/laws/patent/{revisions,completeness}) 을 대체.

import { ActivityIcon, ArrowRightIcon, FileTextIcon, GavelIcon, NetworkIcon } from "lucide-react";
import { Link, data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { getStaffRole } from "~/features/laws/queries.server";
import { BLANK_LAW_SLUGS } from "~/features/blanks/lib/blank-law-slugs";
import { LAW_SUBJECTS } from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-laws-hub";

export const meta: Route.MetaFunction = () => [
  { title: "법령 운영 | 리담변리사학원" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });
  return { role };
}

export default function AdminLawsHub({ loaderData }: Route.ComponentProps) {
  return (
    <AdminShell
      cluster="laws"
      role={loaderData.role}
      title="법령 운영"
      desc="과목을 선택해 개정 워크스페이스 / 법령 완성도 / 체계도로 진입하세요."
    >
      <div className="mb-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-foreground text-sm font-bold">콘텐츠 헬스 점수</p>
            <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
              4법+민소법 × 8지표 매트릭스. 가장 시급한 항목을 자동으로 추출합니다.
            </p>
          </div>
          <Link
            to="/admin/laws/health"
            viewTransition
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold"
          >
            <ActivityIcon className="size-3.5" /> 헬스 점수 보기
          </Link>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {BLANK_LAW_SLUGS.map((slug) => {
          const meta = LAW_SUBJECTS[slug];
          return (
            <div
              key={slug}
              className="border-border bg-card flex flex-col gap-3 rounded-xl border p-5 shadow-sm"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-lg font-bold tracking-tight">{meta.name}</h2>
                <span className="text-muted-foreground text-[11px] font-mono uppercase tracking-wider">
                  {meta.categoryLabel}
                </span>
              </div>
              <div className="grid gap-1.5">
                <HubLink
                  to={`/admin/laws/${slug}/revisions`}
                  icon={<GavelIcon className="size-3.5" />}
                  label="개정 워크스페이스"
                />
                <HubLink
                  to={`/admin/laws/${slug}/completeness`}
                  icon={<FileTextIcon className="size-3.5" />}
                  label="법령 완성도"
                />
                <HubLink
                  to={`/subjects/${slug}`}
                  icon={<NetworkIcon className="size-3.5" />}
                  label="조문·체계도 (학생 화면)"
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 rounded-xl border border-dashed border-border bg-muted/30 p-4">
        <p className="text-muted-foreground text-xs leading-relaxed">
          체계도 트리는 <Link to="/admin/systematic-tree" className="text-link underline">/admin/systematic-tree</Link> 에서
          JSON export / import 로 일괄 관리합니다.
        </p>
      </div>
    </AdminShell>
  );
}

function HubLink({
  to,
  icon,
  label,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      to={to}
      viewTransition
      className="border-border hover:border-primary hover:bg-primary/5 group flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-sm transition-colors"
    >
      <span className="inline-flex items-center gap-2">
        {icon}
        {label}
      </span>
      <ArrowRightIcon className="text-muted-foreground group-hover:text-link size-3.5 transition-colors" />
    </Link>
  );
}
