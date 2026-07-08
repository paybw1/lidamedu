// feat-11-002 — 강의 시리즈·에디션 관리. staff 전용.
// 에디션 발행(publish) 시 판매중 T-PASS 연결 제안 (★M1 승인 단서 3).

import { useEffect, useState } from "react";
import { ClapperboardIcon, PlusIcon, SendIcon } from "lucide-react";
import { Link, data, useFetcher } from "react-router";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import adminClient from "~/core/lib/supa-admin-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip, IndexTable, TD, TR } from "~/features/admin/components/admin-ui";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  listSeriesWithEditions,
  listTpassLinkSuggestions,
  type SeriesWithEditions,
  type TpassSuggestion,
} from "~/features/lms/queries.server";

import type { Route } from "./+types/admin-lms-courses";

export const meta: Route.MetaFunction = () => [
  { title: "강의 시리즈·에디션 | 리담변리사학원" },
];

const SUBJECT_OPTIONS = [
  { value: "patent", label: "특허법" },
  { value: "trademark", label: "상표법" },
  { value: "design", label: "디자인보호법" },
  { value: "civil", label: "민법" },
  { value: "civil-procedure", label: "민사소송법" },
  { value: "science", label: "자연과학" },
];

async function requireStaff(request: Request) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });
  return { client, user, role };
}

export async function loader({ request }: Route.LoaderArgs) {
  const { client, role } = await requireStaff(request);
  const [series, instructorsRes] = await Promise.all([
    listSeriesWithEditions(client),
    adminClient
      .from("profiles")
      .select("profile_id, name")
      .in("role", ["instructor", "admin"])
      .order("name"),
  ]);
  return {
    series,
    role,
    instructors: (instructorsRes.data ?? []).map((i) => ({
      profileId: i.profile_id,
      name: i.name ?? "(이름 없음)",
    })),
  };
}

const createSeriesSchema = z.object({
  intent: z.literal("create_series"),
  title: z.string().trim().min(1).max(120),
  subjectCode: z.string().min(1),
  instructorId: z.string().uuid().nullable(),
});
const createEditionSchema = z.object({
  intent: z.literal("create_edition"),
  seriesId: z.string().uuid(),
  editionLabel: z.string().trim().min(1).max(30),
  editionYear: z.coerce.number().int().min(2020).max(2100),
});
const publishSchema = z.object({
  intent: z.literal("publish"),
  courseId: z.string().uuid(),
});
const linkTpassSchema = z.object({
  intent: z.literal("link_tpass"),
  courseId: z.string().uuid(),
  planIds: z.array(z.string().uuid()),
});

export async function action({ request }: Route.ActionArgs) {
  const { client, user } = await requireStaff(request);
  const fd = await request.formData();
  const intent = fd.get("intent");

  if (intent === "create_series") {
    const parsed = createSeriesSchema.safeParse({
      intent,
      title: fd.get("title"),
      subjectCode: fd.get("subjectCode"),
      instructorId: fd.get("instructorId") || null,
    });
    if (!parsed.success) return data({ error: "입력을 확인해 주세요." }, { status: 400 });
    const { error } = await client.from("course_series").insert({
      title: parsed.data.title,
      subject_code: parsed.data.subjectCode,
      instructor_id: parsed.data.instructorId,
    });
    if (error) return data({ error: error.message }, { status: 400 });
    return data({ ok: true as const });
  }

  if (intent === "create_edition") {
    const parsed = createEditionSchema.safeParse({
      intent,
      seriesId: fd.get("seriesId"),
      editionLabel: fd.get("editionLabel"),
      editionYear: fd.get("editionYear"),
    });
    if (!parsed.success) return data({ error: "입력을 확인해 주세요." }, { status: 400 });
    const { error } = await client.from("courses").insert({
      series_id: parsed.data.seriesId,
      edition_label: parsed.data.editionLabel,
      edition_year: parsed.data.editionYear,
    });
    if (error) return data({ error: error.message }, { status: 400 });
    return data({ ok: true as const });
  }

  if (intent === "publish") {
    const parsed = publishSchema.safeParse({ intent, courseId: fd.get("courseId") });
    if (!parsed.success) return data({ error: "입력을 확인해 주세요." }, { status: 400 });
    // 발행 = published + 시리즈 current 이전 (구 current 는 유지하되 current 해제 — 수강권·이력 보존)
    const { data: course } = await client
      .from("courses")
      .select("series_id")
      .eq("course_id", parsed.data.courseId)
      .maybeSingle();
    if (!course) return data({ error: "에디션을 찾을 수 없습니다." }, { status: 404 });
    const { error: clearErr } = await client
      .from("courses")
      .update({ is_current: false })
      .eq("series_id", course.series_id)
      .eq("is_current", true);
    if (clearErr) return data({ error: clearErr.message }, { status: 400 });
    const { error } = await client
      .from("courses")
      .update({ status: "published", is_current: true })
      .eq("course_id", parsed.data.courseId);
    if (error) return data({ error: error.message }, { status: 400 });
    // ★단서 3 — 판매중 T-PASS 연결 제안을 발행 응답으로 반환(클라가 제안 패널 표시)
    const suggestions = await listTpassLinkSuggestions(parsed.data.courseId);
    return data({
      ok: true as const,
      published: parsed.data.courseId,
      tpassSuggestions: suggestions,
    });
  }

  if (intent === "link_tpass") {
    const parsed = linkTpassSchema.safeParse({
      intent,
      courseId: fd.get("courseId"),
      planIds: fd.getAll("planIds").map(String),
    });
    if (!parsed.success) return data({ error: "입력을 확인해 주세요." }, { status: 400 });
    if (parsed.data.planIds.length > 0) {
      const { error } = await client.from("plan_courses").upsert(
        parsed.data.planIds.map((pid) => ({
          plan_id: pid,
          course_id: parsed.data.courseId,
        })),
        { onConflict: "plan_id,course_id" },
      );
      if (error) return data({ error: error.message }, { status: 400 });
    }
    void user;
    return data({ ok: true as const, linked: parsed.data.planIds.length });
  }

  return data({ error: "Unknown intent" }, { status: 400 });
}

function fmtDuration(sec: number): string {
  if (sec <= 0) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "초안",
  published: "발행",
  archived: "보관",
};

export default function AdminLmsCourses({ loaderData }: Route.ComponentProps) {
  const { series, role, instructors } = loaderData;
  return (
    <AdminShell
      cluster="lms"
      role={role}
      title="강의 시리즈·에디션"
      desc="강의 영상의 시리즈(정체성)와 연도판 에디션을 관리합니다. 전면 개편은 새 에디션으로, 소규모 수정은 에디션 상세에서 영상 교체로 처리합니다."
    >
      <CreateSeriesForm instructors={instructors} />
      <div className="mt-4 space-y-4">
        {series.length === 0 ? (
          <div className="border-border bg-card text-muted-foreground flex flex-col items-center gap-2 rounded-xl border py-16 text-center shadow-sm">
            <ClapperboardIcon className="size-8 opacity-30" />
            <p className="text-sm font-medium">등록된 시리즈가 없습니다.</p>
          </div>
        ) : (
          series.map((s) => <SeriesCard key={s.seriesId} series={s} />)
        )}
      </div>
    </AdminShell>
  );
}

function CreateSeriesForm({
  instructors,
}: {
  instructors: Array<{ profileId: string; name: string }>;
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) toast.success("시리즈를 등록했습니다.");
    else if (fetcher.state === "idle" && fetcher.data?.error) toast.error(fetcher.data.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);
  return (
    <fetcher.Form
      method="post"
      className="border-border bg-card flex flex-wrap items-end gap-2.5 rounded-xl border p-3 shadow-sm"
    >
      <input type="hidden" name="intent" value="create_series" />
      <label className="flex min-w-[220px] flex-1 flex-col gap-1.5">
        <span className="text-muted-foreground text-[11px] font-semibold">시리즈명</span>
        <input
          name="title"
          required
          maxLength={120}
          placeholder="예: 특허법 기본강의"
          className="border-input bg-background h-9 rounded-lg border px-3 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-muted-foreground text-[11px] font-semibold">과목</span>
        <select name="subjectCode" className="border-input bg-background h-9 rounded-lg border px-2 text-sm">
          {SUBJECT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-muted-foreground text-[11px] font-semibold">대표 강사</span>
        <select name="instructorId" className="border-input bg-background h-9 rounded-lg border px-2 text-sm">
          <option value="">(미지정)</option>
          {instructors.map((i) => (
            <option key={i.profileId} value={i.profileId}>{i.name}</option>
          ))}
        </select>
      </label>
      <Button type="submit" size="sm" className="h-9" disabled={fetcher.state !== "idle"}>
        <PlusIcon className="size-3.5" /> 시리즈 추가
      </Button>
    </fetcher.Form>
  );
}

function SeriesCard({ series }: { series: SeriesWithEditions }) {
  const subjectLabel =
    SUBJECT_OPTIONS.find((o) => o.value === series.subjectCode)?.label ??
    series.subjectCode;
  return (
    <section className="border-border bg-card rounded-xl border p-4 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="text-[15px] font-bold">{series.title}</h3>
        <Chip tone="neutral">{subjectLabel}</Chip>
        {series.instructorName ? <Chip tone="outline">{series.instructorName}</Chip> : null}
        <div className="ml-auto">
          <CreateEditionForm seriesId={series.seriesId} />
        </div>
      </div>
      {series.editions.length === 0 ? (
        <p className="text-muted-foreground text-[12px]">에디션이 없습니다. 연도판을 추가하세요.</p>
      ) : (
        <IndexTable
          minWidth={560}
          headers={[
            { label: "에디션" },
            { label: "상태", width: "6rem" },
            { label: "회차", align: "right", width: "5rem" },
            { label: "총 재생시간", align: "right", width: "8rem" },
            { label: "", width: "12rem" },
          ]}
        >
          {series.editions.map((e) => (
            <EditionRow key={e.courseId} edition={e} />
          ))}
        </IndexTable>
      )}
    </section>
  );
}

function CreateEditionForm({ seriesId }: { seriesId: string }) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const year = 2026;
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.error) toast.error(fetcher.data.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);
  return (
    <fetcher.Form method="post" className="flex items-center gap-1.5">
      <input type="hidden" name="intent" value="create_edition" />
      <input type="hidden" name="seriesId" value={seriesId} />
      <input
        name="editionLabel"
        required
        placeholder={`${year}판`}
        className="border-input bg-background h-8 w-24 rounded-lg border px-2 text-[12px]"
      />
      <input
        name="editionYear"
        type="number"
        required
        defaultValue={year}
        min={2020}
        max={2100}
        className="border-input bg-background h-8 w-20 rounded-lg border px-2 text-[12px] tabular-nums"
      />
      <Button type="submit" size="sm" variant="outline" className="h-8 text-[12px]" disabled={fetcher.state !== "idle"}>
        <PlusIcon className="size-3" /> 에디션
      </Button>
    </fetcher.Form>
  );
}

function EditionRow({
  edition,
}: {
  edition: SeriesWithEditions["editions"][number];
}) {
  const fetcher = useFetcher<{
    ok?: boolean;
    error?: string;
    published?: string;
    tpassSuggestions?: TpassSuggestion[];
    linked?: number;
  }>();
  const [suggestions, setSuggestions] = useState<TpassSuggestion[] | null>(null);
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.error) toast.error(fetcher.data.error);
    else if (fetcher.data.published) {
      toast.success("에디션을 발행했습니다. (신판 기본 노출)");
      const unlinked = (fetcher.data.tpassSuggestions ?? []).filter((s) => !s.alreadyLinked);
      // ★단서 3 — 판매중 T-PASS 가 있으면 연결 제안 패널 강제 표시
      setSuggestions(unlinked.length > 0 ? fetcher.data.tpassSuggestions! : null);
      if (unlinked.length === 0 && (fetcher.data.tpassSuggestions ?? []).length === 0) {
        toast.info("연결 제안할 판매중 T-PASS 상품이 없습니다.");
      }
    } else if (typeof fetcher.data.linked === "number") {
      toast.success(`T-PASS ${fetcher.data.linked}개 상품에 연결했습니다.`);
      setSuggestions(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  return (
    <>
      <TR>
        <TD>
          <Link
            to={`/admin/lms/courses/${edition.courseId}`}
            className="text-link font-semibold hover:underline"
          >
            {edition.editionLabel}
          </Link>
          {edition.isCurrent ? <Chip tone="blue" className="ml-1.5">기본 노출</Chip> : null}
        </TD>
        <TD>
          <Chip tone={edition.status === "published" ? "emerald" : edition.status === "draft" ? "amber" : "neutral"}>
            {STATUS_LABEL[edition.status]}
          </Chip>
        </TD>
        <TD align="right" mono>{edition.lessonCount}</TD>
        <TD align="right" mono soft>{fmtDuration(edition.totalDurationSeconds)}</TD>
        <TD align="right">
          {edition.status !== "published" ? (
            <fetcher.Form method="post" className="inline">
              <input type="hidden" name="intent" value="publish" />
              <input type="hidden" name="courseId" value={edition.courseId} />
              <Button type="submit" size="sm" variant="outline" className="h-7 text-[12px]" disabled={fetcher.state !== "idle"}>
                <SendIcon className="size-3" /> 발행
              </Button>
            </fetcher.Form>
          ) : null}
        </TD>
      </TR>
      {suggestions ? (
        <TR>
          <TD colSpan={5}>
            <fetcher.Form
              method="post"
              className="border-primary/30 bg-primary/5 my-1 rounded-lg border p-3"
            >
              <input type="hidden" name="intent" value="link_tpass" />
              <input type="hidden" name="courseId" value={edition.courseId} />
              <p className="mb-2 text-[12px] font-semibold">
                판매중 T-PASS 상품에 이 에디션을 연결하세요. 연결하지 않으면 T-PASS 수강생에게 신판이 노출되지 않습니다.
              </p>
              <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1">
                {suggestions.map((s) => (
                  <label key={s.planId} className="flex items-center gap-1.5 text-[12px]">
                    <input
                      type="checkbox"
                      name="planIds"
                      value={s.planId}
                      defaultChecked={!s.alreadyLinked}
                      disabled={s.alreadyLinked}
                      className="accent-primary size-3.5"
                    />
                    {s.name}
                    {s.alreadyLinked ? <span className="text-muted-foreground">(연결됨)</span> : null}
                  </label>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Button type="submit" size="sm" className="h-7 text-[12px]" disabled={fetcher.state !== "idle"}>
                  선택 연결
                </Button>
                <button
                  type="button"
                  onClick={() => setSuggestions(null)}
                  className="text-muted-foreground text-[12px] hover:underline"
                >
                  나중에
                </button>
              </div>
            </fetcher.Form>
          </TD>
        </TR>
      ) : null}
    </>
  );
}
