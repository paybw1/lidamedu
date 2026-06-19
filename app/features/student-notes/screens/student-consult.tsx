// 학생용 상담 코멘트 — /me/consult. 강사가 공유(share_with_student)한 1:1 상담 코멘트 열람. feat-7-025/028.
// 알림(student_note_shared) 클릭 시 이 화면으로 와서 세부 내용을 본다(?note=<id> 하이라이트).
import { useEffect } from "react";
import { MessageSquareTextIcon, PinIcon } from "lucide-react";
import { redirect } from "react-router";

import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { runAfterResponse } from "~/core/lib/wait-until.server";
import {
  listNotesForStudent,
  markSharedNotesRead,
} from "~/features/student-notes/queries.server";
import { MarkdownView } from "~/features/problems/components/markdown-view";

import type { Route } from "./+types/student-consult";

export const meta: Route.MetaFunction = () => [
  { title: "상담 코멘트 | Lidam Patent Attorney Academy" },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  // studentId 는 세션 사용자 본인으로 고정 — 본인에게 공유된 코멘트만 조회(권한 안전).
  const notes = await listNotesForStudent(user.id, { onlyShared: true });
  // feat-7-025 B-1 — 본인 공유 코멘트 열람 → read_at 기록(응답 후 best-effort). 강사가 전달 여부를 안다.
  runAfterResponse(markSharedNotesRead(user.id));
  const url = new URL(request.url);
  return { notes, highlight: url.searchParams.get("note") };
}

export default function StudentConsult({ loaderData }: Route.ComponentProps) {
  const { notes, highlight } = loaderData;

  useEffect(() => {
    if (!highlight) return;
    document
      .getElementById(`note-${highlight}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlight]);

  return (
    <div className="mx-auto w-full max-w-screen-md px-5 py-6 md:px-10 md:py-8">
      <header className="mb-6 space-y-2">
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
          <MessageSquareTextIcon className="size-3.5" /> 학습관리
        </p>
        <h1 className="text-2xl font-bold tracking-tight">상담 코멘트</h1>
        <p className="text-muted-foreground text-sm">
          강사가 공유한 1:1 상담 코멘트입니다.
        </p>
      </header>

      {notes.length === 0 ? (
        <div className="bg-muted/40 rounded-md border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">
            아직 받은 상담 코멘트가 없습니다.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {notes.map((n) => (
            <li
              key={n.noteId}
              id={`note-${n.noteId}`}
              className={cn(
                "rounded-xl border p-4 shadow-sm transition-colors",
                n.noteId === highlight
                  ? "border-primary ring-primary/30 ring-2"
                  : "border-border bg-card",
              )}
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {n.isPinned ? (
                  <span className="bg-primary/10 text-primary inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold">
                    <PinIcon className="size-3" /> 고정
                  </span>
                ) : null}
                <span className="text-[13px] font-bold">
                  {n.authorName ?? "강사"}
                </span>
                <span className="text-muted-foreground ml-auto text-[11px] tabular-nums">
                  {formatDate(n.createdAt)}
                </span>
              </div>
              <MarkdownView
                text={n.bodyMd}
                trusted={false}
                className="text-foreground/85 text-sm break-words"
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
