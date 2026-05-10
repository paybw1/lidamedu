// 운영자 GS 회차 목록 — 모든 status (draft 포함). + 새 회차 생성 진입점.

import { CalendarPlusIcon, ClipboardListIcon, PlusIcon } from "lucide-react";
import { Form, Link, data } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/core/components/ui/table";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  listAllGsRounds,
  type GsRoundStatus,
} from "~/features/gs/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-gs-list";

export const meta: Route.MetaFunction = () => [
  { title: "온라인 GS 관리 | Lidam Edu" },
];

const STATUS_LABEL: Record<GsRoundStatus, string> = {
  draft: "초안",
  published: "공개",
  closed: "종료",
};
const STATUS_TONE: Record<GsRoundStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  published: "bg-emerald-600 text-white",
  closed: "bg-slate-500 text-white",
};

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const subjectParam = url.searchParams.get("subject");
  const subject =
    subjectParam && LAW_SUBJECT_SLUGS.includes(subjectParam as never)
      ? (subjectParam as LawSubjectSlug)
      : undefined;
  const statusParam = url.searchParams.get("status");
  const status: GsRoundStatus | undefined =
    statusParam === "draft" ||
    statusParam === "published" ||
    statusParam === "closed"
      ? statusParam
      : undefined;

  const rounds = await listAllGsRounds(client, { subject, status });
  return { rounds, subject: subject ?? null, status: status ?? null };
}

export default function AdminGsList({ loaderData }: Route.ComponentProps) {
  const { rounds, subject, status } = loaderData;

  return (
    <div className="mx-auto w-full max-w-screen-xl px-5 py-6 md:px-10 md:py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
            <ClipboardListIcon className="size-3.5" /> 운영자 모드 · 온라인 GS
          </p>
          <h1 className="text-2xl font-bold tracking-tight">GS 회차 관리</h1>
          <p className="text-muted-foreground text-sm">
            정기 모의고사 회차를 만들고 문제를 등록합니다. 공개(published) 상태에서만
            학생에게 노출됩니다.
          </p>
        </div>
        <Button asChild>
          <Link to="/admin/gs/new" viewTransition>
            <PlusIcon className="size-4" /> 새 회차
          </Link>
        </Button>
      </header>

      <Card className="mb-4">
        <CardHeader className="pb-3">
          <Form method="get" className="flex flex-wrap items-center gap-2">
            <select
              name="subject"
              defaultValue={subject ?? ""}
              className="border-input bg-background h-8 rounded-md border px-2 text-xs"
            >
              <option value="">전체 과목</option>
              {LAW_SUBJECT_SLUGS.map((s) => (
                <option key={s} value={s}>
                  {LAW_SUBJECTS[s].name}
                </option>
              ))}
            </select>
            <select
              name="status"
              defaultValue={status ?? ""}
              className="border-input bg-background h-8 rounded-md border px-2 text-xs"
            >
              <option value="">전체 상태</option>
              <option value="draft">초안</option>
              <option value="published">공개</option>
              <option value="closed">종료</option>
            </select>
            <Button type="submit" size="sm" variant="outline" className="h-8">
              적용
            </Button>
          </Form>
        </CardHeader>
        <CardContent className="text-muted-foreground text-xs">
          전체 {rounds.length}건
        </CardContent>
      </Card>

      {rounds.length === 0 ? (
        <div className="bg-muted/40 rounded-md border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">
            등록된 GS 회차가 없습니다.
          </p>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">상태</TableHead>
                  <TableHead className="min-w-[260px]">제목</TableHead>
                  <TableHead className="w-[100px]">과목</TableHead>
                  <TableHead className="w-[200px]">기간</TableHead>
                  <TableHead className="w-[80px]">제한 시간</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rounds.map((r) => (
                  <TableRow key={r.roundId}>
                    <TableCell>
                      <Badge className={cn("text-[10px]", STATUS_TONE[r.status])}>
                        {STATUS_LABEL[r.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Link
                        to={`/admin/gs/${r.roundId}`}
                        viewTransition
                        className="hover:text-primary font-medium"
                      >
                        {r.title}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs">
                      {LAW_SUBJECTS[r.subject]?.name ?? r.subject}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">
                      {formatRange(r.startAt, r.endAt)}
                    </TableCell>
                    <TableCell className="tabular-nums">{r.durationMin}분</TableCell>
                    <TableCell>
                      <Link
                        to={`/admin/gs/${r.roundId}`}
                        className="text-primary text-xs hover:underline"
                      >
                        편집 →
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <div className="mt-8">
        <Card>
          <CardHeader>
            <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
              <CalendarPlusIcon className="size-3.5" /> 다음 단계
            </p>
          </CardHeader>
          <CardContent className="text-muted-foreground space-y-1 text-xs">
            <p>• 학생 응시·답안 작성 (Phase 2)</p>
            <p>• 운영자 채점 / 점수 + 피드백 입력 (Phase 3)</p>
            <p>• 학생 결과 화면 (모범답안 + 피드백 공개)</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function formatRange(start: string, end: string): string {
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };
  return `${fmt(start)} ~ ${fmt(end)}`;
}
