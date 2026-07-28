import { useState } from "react";
import { data, redirect, useFetcher } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/core/components/ui/dialog";
import { Textarea } from "~/core/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/core/components/ui/table";
import makeServerClient from "~/core/lib/supa-client.server";
import { MemberLink } from "~/features/admin/components/admin-ui";
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
  const note = String(fd.get("note") ?? "").trim();
  if (
    !reportId ||
    !BUG_REPORT_STATUSES.includes(status as BugReportStatus)
  ) {
    return data({ ok: false }, { status: 400 });
  }
  // 완료로 "전환"될 때만 신고자에게 인박스 알림(이미 done 이었으면 재알림 없음).
  const prev = await getBugReport(reportId);
  const isDoneTransition = status === "done" && prev?.status !== "done";
  await updateBugReportStatus(
    reportId,
    status as BugReportStatus,
    isDoneTransition ? { note: note || null } : undefined,
  );
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
        note: note || undefined,
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
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const submitting = fetcher.state !== "idle";

  function setStatus(status: BugReportStatus, noteText?: string) {
    const fd = new FormData();
    fd.set("reportId", report.reportId);
    fd.set("status", status);
    if (noteText) fd.set("note", noteText);
    fetcher.submit(fd, { method: "post" });
  }

  function onStatusClick(s: BugReportStatus) {
    // 완료로 "전환"될 때만 신고자에게 알림이 나가므로, 이때만 쪽지 입력을 연다.
    if (s === "done" && report.status !== "done") {
      setNote("");
      setNoteOpen(true);
      return;
    }
    setStatus(s);
  }

  function confirmDone() {
    setNoteOpen(false);
    setStatus("done", note.trim() || undefined);
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
        {report.resolutionNote ? (
          <div className="border-border bg-muted/40 mt-2 rounded-md border px-2.5 py-1.5 text-xs">
            <p className="text-muted-foreground mb-0.5 font-semibold">
              답변
              {report.resolvedAt ? (
                <span className="ml-1.5 font-normal tabular-nums">
                  {new Date(report.resolvedAt).toLocaleString("ko-KR")}
                </span>
              ) : null}
            </p>
            <p className="whitespace-pre-wrap">{report.resolutionNote}</p>
          </div>
        ) : null}
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
      <TableCell className="text-xs">
        <MemberLink
          profileId={report.reporterId}
          name={report.reporterName}
        />
      </TableCell>
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
              onClick={() => onStatusClick(s)}
              disabled={submitting}
              className="h-7 px-2 text-xs"
            >
              {STATUS_LABEL[s]}
            </Button>
          ))}
        </div>
        <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>완료 처리 및 신고자 알림</DialogTitle>
              <DialogDescription>
                신고자에게 처리 완료 알림이 전송됩니다. 필요하면 함께 전할 쪽지를
                남겨 주세요(선택).
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground whitespace-pre-wrap">
              {report.message}
            </div>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              rows={4}
              placeholder="예) 말씀하신 화면 오류를 수정해 반영했습니다. 확인 부탁드립니다."
              className="resize-none"
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setNoteOpen(false)}
              >
                취소
              </Button>
              <Button type="button" onClick={confirmDone} disabled={submitting}>
                {note.trim() ? "쪽지와 함께 완료 알림" : "완료 알림 보내기"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </TableCell>
    </TableRow>
  );
}
