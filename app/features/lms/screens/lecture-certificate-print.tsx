// 수강증명서(인쇄용) — /lecture/certificates/:enrollmentId/print. 독립 페이지(크롬 없음).
import { PrinterIcon } from "lucide-react";
import { data, redirect } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";

import type { Route } from "./+types/lecture-certificate-print";

export function meta() {
  return [{ title: "수강증명서 | 리담변리사학원" }];
}

type SeriesRel = { title: string } | { title: string }[] | null;
type CourseRel =
  | { edition_label: string | null; series: SeriesRel }
  | { edition_label: string | null; series: SeriesRel }[]
  | null;
function courseName(course: CourseRel): string {
  const c = Array.isArray(course) ? course[0] : course;
  if (!c) return "강의";
  const s = Array.isArray(c.series) ? c.series[0] : c.series;
  return [s?.title, c.edition_label].filter(Boolean).join(" ") || "강의";
}
const ymd = (iso: string | null) =>
  iso ? iso.slice(0, 10).replace(/-/g, ". ") + "." : "-";

export async function loader({ request, params }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");

  const { data: e } = await client
    .from("enrollments")
    .select(
      "enrollment_id, starts_at, expires_at, course:courses!enrollments_course_id_fkey(edition_label, series:course_series!courses_series_id_fkey(title))",
    )
    .eq("enrollment_id", params.enrollmentId ?? "")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!e) throw data("증명서를 찾을 수 없습니다", { status: 404 });

  const { data: prof } = await client
    .from("profiles")
    .select("name")
    .eq("profile_id", user.id)
    .maybeSingle();

  const now = new Date();
  const issuedAt = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`;
  const serial = `LIDAM-${(params.enrollmentId ?? "").slice(0, 8).toUpperCase()}`;
  return {
    name: prof?.name ?? "수강생",
    course: courseName(e.course as CourseRel),
    startsAt: e.starts_at,
    expiresAt: e.expires_at,
    issuedAt,
    serial,
  };
}

export default function LectureCertificatePrint({ loaderData }: Route.ComponentProps) {
  const { name, course, startsAt, expiresAt, issuedAt, serial } = loaderData;
  return (
    <div className="min-h-screen bg-neutral-100 px-4 py-8 dark:bg-neutral-900 print:bg-white print:p-0">
      {/* 인쇄 버튼 (인쇄 시 숨김) */}
      <div className="mx-auto mb-4 flex max-w-[720px] justify-end print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="bg-primary text-primary-foreground inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold shadow-sm"
        >
          <PrinterIcon className="size-4" /> 인쇄 / PDF 저장
        </button>
      </div>

      {/* 증명서 본문 */}
      <div
        className="mx-auto max-w-[720px] bg-white px-14 py-16 text-neutral-900 shadow-lg print:max-w-none print:px-16 print:py-20 print:shadow-none"
        style={{ fontFamily: '"Pretendard Variable",Pretendard,serif' }}
      >
        <div className="border-prestige-navy border-b-2 pb-4 text-center">
          <p className="text-gilt text-[13px] font-bold tracking-[0.4em]">
            리담변리사학원
          </p>
          <h1 className="text-prestige-navy mt-3 text-[34px] font-black tracking-[0.3em]">
            수강증명서
          </h1>
        </div>

        <table className="mt-10 w-full border-collapse text-[15px]">
          <tbody>
            {[
              ["성명", name],
              ["수강 강의", course],
              ["수강 기간", `${ymd(startsAt)} ~ ${ymd(expiresAt)}`],
              ["증명서 번호", serial],
            ].map(([k, v]) => (
              <tr key={k} className="border-b border-neutral-200">
                <th className="w-32 bg-neutral-50 px-4 py-3 text-left text-[13px] font-bold text-neutral-500">
                  {k}
                </th>
                <td className="px-4 py-3 font-semibold">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="mt-12 text-center text-[15px] leading-loose text-neutral-700">
          위 사람은 본 학원에서 위 강의를 수강하였음을 증명합니다.
        </p>

        <div className="mt-16 text-center">
          <p className="text-[16px] font-bold tracking-widest text-neutral-800">
            {issuedAt}
          </p>
          <p className="text-prestige-navy mt-6 text-[19px] font-black tracking-[0.3em]">
            리담변리사학원 원장 <span className="relative">임 병 웅</span>
            <span className="ml-1 inline-block size-11 translate-y-2 rounded-full border-2 border-[#c0392b]/70" />
          </p>
        </div>
      </div>
    </div>
  );
}
