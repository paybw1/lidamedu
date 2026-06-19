// 학생용 상담 코멘트 — /me/consult. 강사가 공유(share_with_student)한 1:1 상담 코멘트 열람. feat-7-025/028.
// 알림(student_note_shared) 클릭 시 이 화면으로 와서 세부 내용을 본다(?note=<id> 하이라이트).
import type { Route } from "./+types/student-consult";

import { MessageSquareTextIcon, PinIcon } from "lucide-react";
import { useEffect } from "react";
import { redirect } from "react-router";

import {
  Chip,
  EmptyState,
  PageHeader,
  StudentShell,
  Surface,
} from "~/core/components/student";
import makeServerClient from "~/core/lib/supa-client.server";
import { cn } from "~/core/lib/utils";
import { runAfterResponse } from "~/core/lib/wait-until.server";
import { MarkdownView } from "~/features/problems/components/markdown-view";
import {
  listNotesForStudent,
  markSharedNotesRead,
} from "~/features/student-notes/queries.server";

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
    <StudentShell width="narrow">
      <PageHeader
        area="manage"
        title="상담 코멘트"
        description="강사가 공유한 1:1 상담 코멘트입니다."
      />

      {notes.length === 0 ? (
        <EmptyState
          icon={<MessageSquareTextIcon className="size-6" />}
          title="아직 받은 상담 코멘트가 없습니다"
          description="강사가 1:1 상담 코멘트를 공유하면 여기에 표시됩니다."
        />
      ) : (
        <div className="space-y-3">
          {notes.map((n) => (
            <Surface
              key={n.noteId}
              id={`note-${n.noteId}`}
              tone="default"
              pad={4}
              className={cn(
                "scroll-mt-20",
                n.noteId === highlight &&
                  "border-primary ring-primary/30 ring-2",
              )}
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {n.isPinned ? (
                  <Chip tone="primary" icon={<PinIcon className="size-3" />}>
                    고정
                  </Chip>
                ) : null}
                <span className="text-[13px] font-bold">
                  {n.authorName ?? "강사"}
                </span>
                <span className="text-ink-faint ml-auto text-[11px] tabular-nums">
                  {formatDate(n.createdAt)}
                </span>
              </div>
              <MarkdownView
                text={n.bodyMd}
                trusted={false}
                className="text-foreground/85 text-sm break-words"
              />
            </Surface>
          ))}
        </div>
      )}
    </StudentShell>
  );
}
