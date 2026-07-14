// 증명서 발급 — /lecture/certificates. 수강 중/완료 강의의 수강증명서 발급(인쇄).
import { FileBadgeIcon, PrinterIcon } from "lucide-react";
import { Link, redirect } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";

import { MyPagePlaceholder } from "../components/mypage-placeholder";

import type { Route } from "./+types/lecture-certificates";

export function meta() {
  return [{ title: "증명서 발급 | 리담변리사학원" }];
}

type SeriesRel = { title: string } | { title: string }[] | null;
type CourseRel = {
  edition_label: string | null;
  series: SeriesRel;
} | { edition_label: string | null; series: SeriesRel }[] | null;

function courseName(course: CourseRel): string {
  const c = Array.isArray(course) ? course[0] : course;
  if (!c) return "강의";
  const s = Array.isArray(c.series) ? c.series[0] : c.series;
  return [s?.title, c.edition_label].filter(Boolean).join(" ") || "강의";
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");

  const { data: enrollments } = await client
    .from("enrollments")
    .select(
      "enrollment_id, starts_at, expires_at, status, course:courses!enrollments_course_id_fkey(edition_label, series:course_series!courses_series_id_fkey(title))",
    )
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .order("starts_at", { ascending: false });

  return {
    items: (enrollments ?? []).map((e) => ({
      id: e.enrollment_id,
      name: courseName(e.course as CourseRel),
      startsAt: e.starts_at,
      expiresAt: e.expires_at,
      status: e.status,
    })),
  };
}

export default function LectureCertificates({ loaderData }: Route.ComponentProps) {
  const { items } = loaderData;
  if (items.length === 0) {
    return (
      <MyPagePlaceholder
        title="증명서 발급"
        desc="발급 가능한 수강 내역이 없습니다. 강의 수강 시 이곳에서 수강증명서를 발급하실 수 있습니다. 영수증이 필요하시면 결제내역 조회를 이용해 주세요."
        icon={<FileBadgeIcon className="size-6" />}
      />
    );
  }
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 md:px-6 md:py-10">
      <header className="mb-6">
        <p className="text-muted-foreground inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
          <FileBadgeIcon className="size-3.5" /> 마이페이지
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">증명서 발급</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          수강 중이거나 수강한 강의의 수강증명서를 발급(인쇄)할 수 있습니다.
        </p>
      </header>

      <ul className="flex flex-col gap-3">
        {items.map((it) => (
          <li
            key={it.id}
            className="border-border bg-card flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border p-4 shadow-sm"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{it.name}</p>
              <p className="text-muted-foreground mt-0.5 text-xs tabular-nums">
                {it.startsAt?.slice(0, 10)} ~ {it.expiresAt?.slice(0, 10)}
              </p>
            </div>
            <Badge variant="outline" className="text-[11px]">
              {it.status === "active" ? "수강중" : it.status}
            </Badge>
            <Button asChild size="sm" variant="outline" className="rounded-full">
              <Link to={`/lecture/certificates/${it.id}/print`}>
                <PrinterIcon className="size-3.5" /> 수강증명서
              </Link>
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
