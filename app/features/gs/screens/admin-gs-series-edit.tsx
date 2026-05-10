// 시리즈 생성/편집 + 시리즈 안 회차 목록.

import {
  ArrowLeftIcon,
  BarChart3Icon,
  PlusIcon,
  SaveIcon,
  Trash2Icon,
} from "lucide-react";
import { Form, Link, data, redirect, useFetcher } from "react-router";
import { z } from "zod";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Separator } from "~/core/components/ui/separator";
import { Textarea } from "~/core/components/ui/textarea";
import makeServerClient from "~/core/lib/supa-client.server";
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
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-gs-series-edit";

export const meta: Route.MetaFunction = ({ data: loaderData }) => [
  {
    title: loaderData?.series
      ? `${loaderData.series.title} | Lidam Edu`
      : "새 시리즈 | Lidam Edu",
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
    return { series: null, rounds: [] };
  }
  const series = await getGsSeries(client, seriesId);
  if (!series) throw data("Series not found", { status: 404 });
  const rounds = await listRoundsForSeries(client, seriesId);
  return { series, rounds };
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

export default function AdminGsSeriesEdit({
  loaderData,
}: Route.ComponentProps) {
  const { series, rounds } = loaderData;
  const isNew = series === null;
  const saveFetcher = useFetcher<typeof action>();
  const deleteFetcher = useFetcher<typeof action>();

  return (
    <div className="mx-auto w-full max-w-screen-lg px-5 py-6 md:px-10 md:py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            to="/admin/gs/series"
            className="text-muted-foreground inline-flex items-center gap-1 text-xs hover:underline"
          >
            <ArrowLeftIcon className="size-3" /> 시리즈 목록
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">
            {isNew ? "새 시리즈" : series?.title}
          </h1>
        </div>
        {!isNew && series ? (
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
                className="text-destructive"
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
        ) : null}
      </header>

      <Card className="mb-6">
        <CardHeader>
          <h2 className="text-sm font-semibold tracking-tight">시리즈 정보</h2>
        </CardHeader>
        <CardContent>
          <saveFetcher.Form method="post" className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="intent" value="save" />
            <label className="space-y-1 sm:col-span-2">
              <span className="text-muted-foreground text-xs font-medium">제목</span>
              <input
                type="text"
                name="title"
                required
                defaultValue={series?.title ?? ""}
                placeholder="예: 2026 봄 GS 시리즈 (특허법)"
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              />
            </label>
            <label className="space-y-1">
              <span className="text-muted-foreground text-xs font-medium">과목</span>
              <select
                name="subject"
                defaultValue={series?.subject ?? "patent"}
                className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
              >
                {LAW_SUBJECT_SLUGS.map((s) => (
                  <option key={s} value={s}>
                    {LAW_SUBJECTS[s].name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-muted-foreground text-xs font-medium">
                예정 회차 수
              </span>
              <input
                type="number"
                name="expectedRounds"
                min={1}
                max={50}
                defaultValue={series?.expectedRounds ?? 8}
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm tabular-nums"
              />
            </label>
            <label className="space-y-1 sm:col-span-2">
              <span className="text-muted-foreground text-xs font-medium">설명</span>
              <Textarea
                name="descriptionMd"
                rows={3}
                defaultValue={series?.descriptionMd ?? ""}
                placeholder="시리즈 안내·일정 등."
              />
            </label>
            <div className="sm:col-span-2 flex items-center justify-end gap-2">
              {saveFetcher.data && "ok" in saveFetcher.data && saveFetcher.data.ok ? (
                <span className="text-muted-foreground text-xs">저장됨</span>
              ) : null}
              <Button
                type="submit"
                disabled={saveFetcher.state !== "idle"}
                className="h-9"
              >
                <SaveIcon className="size-4" />
                {isNew ? "시리즈 생성" : "시리즈 저장"}
              </Button>
            </div>
          </saveFetcher.Form>
        </CardContent>
      </Card>

      {!isNew && series ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold tracking-tight">
                포함된 회차 ({rounds.length} / {series.expectedRounds}회)
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
                      className="hover:bg-accent flex flex-wrap items-center gap-3 px-4 py-3 transition-colors"
                    >
                      <Badge variant="outline" className="text-[11px]">
                        {r.roundNumber ? `${r.roundNumber}회` : "—"}
                      </Badge>
                      <span className="font-medium">{r.title}</span>
                      <Badge
                        variant="secondary"
                        className="ml-auto text-[10px]"
                      >
                        {r.status === "draft"
                          ? "초안"
                          : r.status === "published"
                            ? "공개"
                            : "종료"}
                      </Badge>
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
    </div>
  );
}
