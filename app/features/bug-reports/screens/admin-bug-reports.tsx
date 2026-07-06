import { data, redirect, useFetcher } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/core/components/ui/table";
import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";

import {
  BUG_REPORT_STATUSES,
  type BugReportRow,
  type BugReportStatus,
} from "../labels";
import { runAfterResponse } from "~/core/lib/wait-until.server";
import { notifyReporterBugResolved } from "../notify.server";
import {
  getBugReport,
  listAllBugReports,
  updateBugReportStatus,
} from "../queries.server";

import type { Route } from "./+types/admin-bug-reports";

const STATUS_LABEL: Record<BugReportStatus, string> = {
  open: "접수",
  in_progress: "처리중",
  done: "완료",
};

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const role = await getStaffRole(client, user.id);
  if (!role) throw redirect("/dashboard");
  const reports = await listAllBugReports();
  return { reports };
}

export async function action({ request }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ ok: false }, { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) return data({ ok: false }, { status: 403 });
  const fd = await request.formData();
  const reportId = String(fd.get("reportId") ?? "");
  const status = String(fd.get("status") ?? "");
  if (
    !reportId ||
    !BUG_REPORT_STATUSES.includes(status as BugReportStatus)
  ) {
    return data({ ok: false }, { status: 400 });
  }
  // 완료로 "전환"될 때만 신고자에게 인박스 알림(이미 done 이었으면 재알림 없음).
  const prev = await getBugReport(reportId);
  await updateBugReportStatus(reportId, status as BugReportStatus);
  if (
    status === "done" &&
    prev &&
    prev.status !== "done" &&
    prev.reporterId
  ) {
    runAfterResponse(
      notifyReporterBugResolved({
        reportId,
        reporterId: prev.reporterId,
        url: prev.url,
        message: prev.message,
      }),
    );
  }
  return data({ ok: true });
}

export default function AdminBugReports({ loaderData }: Route.ComponentProps) {
  const { reports } = loaderData;
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">오류 신고</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        가배포 테스터가 제출한 오류 신고 ({reports.length}건)
      </p>
      {reports.length === 0 ? (
        <p className="text-muted-foreground mt-6 rounded-md border border-dashed px-4 py-8 text-center text-sm">
          아직 접수된 신고가 없습니다.
        </p>
      ) : (
        <Table className="mt-4">
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">상태</TableHead>
              <TableHead>내용</TableHead>
              <TableHead>페이지</TableHead>
              <TableHead className="w-24">신고자</TableHead>
              <TableHead className="w-36">시각</TableHead>
              <TableHead className="w-44">처리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reports.map((r) => (
              <BugRow key={r.reportId} report={r} />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function BugRow({ report }: { report: BugReportRow }) {
  const fetcher = useFetcher();
  function setStatus(status: BugReportStatus) {
    const fd = new FormData();
    fd.set("reportId", report.reportId);
    fd.set("status", status);
    fetcher.submit(fd, { method: "post" });
  }
  return (
    <TableRow>
      <TableCell>
        <Badge variant={report.status === "done" ? "secondary" : "default"}>
          {STATUS_LABEL[report.status]}
        </Badge>
      </TableCell>
      <TableCell className="max-w-md text-sm whitespace-pre-wrap">
        {report.message}
      </TableCell>
      <TableCell className="max-w-[12rem] truncate text-xs">
        <a
          href={report.url}
          className="underline"
          target="_blank"
          rel="noreferrer"
        >
          {report.url}
        </a>
      </TableCell>
      <TableCell className="text-xs">{report.reporterName ?? "—"}</TableCell>
      <TableCell className="text-xs tabular-nums">
        {new Date(report.createdAt).toLocaleString("ko-KR")}
      </TableCell>
      <TableCell>
        <div className="flex gap-1">
          {BUG_REPORT_STATUSES.map((s) => (
            <Button
              key={s}
              type="button"
              size="sm"
              variant={report.status === s ? "default" : "outline"}
              onClick={() => setStatus(s)}
              className="h-7 px-2 text-xs"
            >
              {STATUS_LABEL[s]}
            </Button>
          ))}
        </div>
      </TableCell>
    </TableRow>
  );
}
