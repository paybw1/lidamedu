// 시리즈 생성/편집 + 시리즈 안 회차 목록.
// 패턴 P3 EDIT FORM. AdminShell cluster="gs" width=960.

import {
  BarChart3Icon,
  PlusIcon,
  SaveIcon,
  Trash2Icon,
} from "lucide-react";
import { Link, data, redirect, useFetcher } from "react-router";
import { z } from "zod";

import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Separator } from "~/core/components/ui/separator";
import { Textarea } from "~/core/components/ui/textarea";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { AdminSelect, Chip, Field } from "~/features/admin/components/admin-ui";
import {
  createGsSeries,
  deleteGsSeries,
  getGsSeries,
  listRoundsForSeries,
  updateGsSeries,
} from "~/features/gs/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
  SECOND_EXAM_LAW_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-gs-series-edit";

export const meta: Route.MetaFunction = ({ data: loaderData }) => [
  {
    title: loaderData?.series
      ? `${loaderData.series.title} | Lidam Patent Attorney Academy`
      : "새 시리즈 | Lidam Patent Attorney Academy",
  },
];

const seriesSchema = z.object({
  title: z.string().min(1).max(200),
  subject: z.enum(LAW_SUBJECT_SLUGS),
  descriptionMd: z.string().optional().nullable(),
  expectedRounds: z.coerce.number().int().min(1).max(50),
});

export async function loader({ params, request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const seriesId = params.seriesId;
  if (!seriesId || seriesId === "new") {
    return { series: null, rounds: [], role };
  }
  const series = await getGsSeries(client, seriesId);
  if (!series) throw data("Series not found", { status: 404 });
  const rounds = await listRoundsForSeries(client, seriesId);
  return { series, rounds, role };
}

export async function action({ params, request }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" } as const;
  const role = await getStaffRole(client, user.id);
  if (!role) return { ok: false, error: "Forbidden" } as const;

  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "");
  const seriesId = params.seriesId === "new" ? undefined : params.seriesId;

  if (intent === "save") {
    const parsed = seriesSchema.safeParse({
      title: fd.get("title"),
      subject: fd.get("subject"),
      descriptionMd: fd.get("descriptionMd") || null,
      expectedRounds: fd.get("expectedRounds"),
    });
    if (!parsed.success) return { ok: false, error: "Invalid input" } as const;
    if (!seriesId) {
      const created = await createGsSeries(client, user.id, {
        title: parsed.data.title,
        subject: parsed.data.subject as LawSubjectSlug,
        descriptionMd: parsed.data.descriptionMd ?? null,
        expectedRounds: parsed.data.expectedRounds,
      });
      return redirect(`/admin/gs/series/${created.seriesId}`);
    }
    await updateGsSeries(client, seriesId, {
      title: parsed.data.title,
      subject: parsed.data.subject as LawSubjectSlug,
      descriptionMd: parsed.data.descriptionMd ?? null,
      expectedRounds: parsed.data.expectedRounds,
    });
    return { ok: true };
  }

  if (intent === "delete") {
    if (!seriesId) return { ok: false, error: "No series" } as const;
    await deleteGsSeries(client, seriesId);
    return redirect("/admin/gs/series");
  }

  return { ok: false, error: "Unknown intent" } as const;
}

const ROUND_STATUS_LABEL: Record<string, string> = {
  draft: "초안",
  published: "공개",
  closed: "종료",
};

export default function AdminGsSeriesEdit({
  loaderData,
}: Route.ComponentProps) {
  const { series, rounds, role } = loaderData;
  const isNew = series === null;
  const saveFetcher = useFetcher<typeof action>();
  const deleteFetcher = useFetcher<typeof action>();

  return (
    <AdminShell
      cluster="gs"
      role={role}
      width={960}
      title={isNew ? "새 시리즈" : (series?.title ?? "시리즈 편집")}
      desc={
        isNew
          ? "시리즈 기본 정보를 입력하세요. 저장 후 회차를 연결할 수 있습니다."
          : "시리즈 정보와 포함된 회차를 관리합니다."
      }
      headerRight={
        !isNew && series ? (
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to={`/admin/gs/series/${series.seriesId}/stats`}>
                <BarChart3Icon className="size-3.5" /> 통계 보기
              </Link>
            </Button>
            <deleteFetcher.Form method="post">
              <input type="hidden" name="intent" value="delete" />
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className="text-rose-600 dark:text-rose-400"
                onClick={(e) => {
                  if (
                    !confirm(
                      "이 시리즈를 삭제합니다. 회차들은 series 연결이 해제되지만 보존됩니다. 진행할까요?",
                    )
                  )
                    e.preventDefault();
                }}
              >
                <Trash2Icon className="size-3.5" /> 시리즈 삭제
              </Button>
            </deleteFetcher.Form>
          </div>
        ) : null
      }
    >
      {/* 시리즈 정보 폼 */}
      <Card className="mb-6">
        <CardHeader>
          <h2 className="text-sm font-semibold tracking-tight">시리즈 정보</h2>
        </CardHeader>
        <CardContent>
          <saveFetcher.Form method="post" className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="intent" value="save" />

            <Field label="제목" required className="sm:col-span-2">
              <input
                type="text"
                name="title"
                required
                defaultValue={series?.title ?? ""}
                placeholder="예: 2026 봄 GS 시리즈 (특허법)"
                className="border-input bg-background focus:border-primary h-9 w-full rounded-md border px-3 text-[13px] outline-none"
              />
            </Field>

            <Field label="과목" required>
              <AdminSelect
                name="subject"
                defaultValue={series?.subject ?? "patent"}
                className="w-full"
              >
                <optgroup label="2차 · 주관식">
                  {SECOND_EXAM_LAW_SLUGS.map((s) => (
                    <option key={s} value={s}>
                      {LAW_SUBJECTS[s].name}
                    </option>
                  ))}
                </optgroup>
              </AdminSelect>
            </Field>

            <Field label="예정 회차 수" required>
              <input
                type="number"
                name="expectedRounds"
                min={1}
                max={50}
                defaultValue={series?.expectedRounds ?? 8}
                className="border-input bg-background focus:border-primary h-9 w-full rounded-md border px-3 text-[13px] tabular-nums outline-none"
              />
            </Field>

            <Field label="설명" className="sm:col-span-2">
              <Textarea
                name="descriptionMd"
                rows={3}
                defaultValue={series?.descriptionMd ?? ""}
                placeholder="시리즈 안내·일정 등."
              />
            </Field>

            <div className="sm:col-span-2 flex items-center justify-end gap-2">
              {saveFetcher.data &&
              "ok" in saveFetcher.data &&
              saveFetcher.data.ok ? (
                <span className="text-muted-foreground text-xs">저장됨</span>
              ) : null}
              {saveFetcher.data &&
              "error" in saveFetcher.data &&
              saveFetcher.data.error ? (
                <span className="text-rose-600 text-xs">
                  {saveFetcher.data.error}
                </span>
              ) : null}
              <Button
                type="submit"
                disabled={saveFetcher.state !== "idle"}
              >
                <SaveIcon className="size-4" />
                {isNew ? "시리즈 생성" : "시리즈 저장"}
              </Button>
            </div>
          </saveFetcher.Form>
        </CardContent>
      </Card>

      {/* 포함된 회차 */}
      {!isNew && series ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold tracking-tight">
                포함된 회차{" "}
                <span className="text-muted-foreground font-normal">
                  ({rounds.length} / {series.expectedRounds}회)
                </span>
              </h2>
              <Button asChild size="sm" variant="outline">
                <Link to="/admin/gs/new" viewTransition>
                  <PlusIcon className="size-3.5" /> 새 회차
                </Link>
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              새 회차를 만든 뒤 회차 편집 화면에서 이 시리즈를 선택하면 포함됩니다.
            </p>
          </CardHeader>
          <Separator />
          <CardContent className="p-0">
            {rounds.length === 0 ? (
              <p className="text-muted-foreground p-6 text-center text-sm">
                아직 이 시리즈에 등록된 회차가 없습니다.
              </p>
            ) : (
              <ul className="divide-y">
                {rounds.map((r) => (
                  <li key={r.roundId}>
                    <Link
                      to={`/admin/gs/${r.roundId}`}
                      className="hover:bg-muted/40 flex flex-wrap items-center gap-3 px-4 py-3 transition-colors"
                    >
                      <Chip tone="outline">
                        {r.roundNumber ? `${r.roundNumber}회` : "—"}
                      </Chip>
                      <span className="flex-1 font-medium">{r.title}</span>
                      <Chip
                        tone={
                          r.status === "published"
                            ? "emerald"
                            : r.status === "draft"
                              ? "amber"
                              : "neutral"
                        }
                      >
                        {ROUND_STATUS_LABEL[r.status] ?? r.status}
                      </Chip>
                      <span className="text-muted-foreground text-[11px] tabular-nums">
                        {new Date(r.startAt).toLocaleDateString("ko-KR")}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}
    </AdminShell>
  );
}
