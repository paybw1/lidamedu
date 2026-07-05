// feat-6-010 반별 게시판 — 글 작성/수정. /cohort-boards/:boardId/new · /cohort-boards/:boardId/:postId/edit.
// 첨부파일은 글 작성 중에 선택해 두고, 등록 시 글 저장(deferRedirect 로 postId 회수) → 첨부 업로드
// (기존 /api/cohort-board/attachment 재사용) → 상세로 이동. (이전: 등록 후 상세에서만 첨부 가능했음.)
import { PaperclipIcon, SendIcon, XIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link, data, redirect, useNavigate } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { Textarea } from "~/core/components/ui/textarea";
import makeServerClient from "~/core/lib/supa-client.server";

import { CohortBoardShell } from "../components/cohort-board-shell";
import { canWriteBoard, getBoardMeta, getBoardPost } from "../queries.server";

import type { Route } from "./+types/cohort-board-post-new";

// 서버(api/attachment.tsx)와 동일 제약 — 클라 사전 검증용(실차단은 서버 RLS+검증).
const ATTACH_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,application/pdf";
const ATTACH_ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);
const ATTACH_MAX_SIZE = 10 * 1024 * 1024;

function formatSize(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`;
  return `${(n / (1024 * 1024)).toFixed(1)}MB`;
}

export const meta: Route.MetaFunction = ({ data: d }) => [
  {
    title: `${d?.mode === "edit" ? "글 수정" : "새 글 작성"} | 리담변리사학원`,
  },
];

export async function loader({ request, params }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const { boardId, postId } = params;
  if (!boardId) throw data("게시판을 찾을 수 없습니다", { status: 404 });
  const board = await getBoardMeta(client, boardId);
  if (!board) throw data("게시판을 찾을 수 없습니다", { status: 404 });

  if (postId) {
    const post = await getBoardPost(client, postId);
    if (!post || post.boardId !== boardId)
      throw data("글을 찾을 수 없습니다", { status: 404 });
    if (post.author?.profileId !== user.id)
      throw data("수정 권한이 없습니다", { status: 403 });
    return { mode: "edit" as const, board, post };
  }

  // 새 글 — RLS 와 동일 판정으로 작성 권한 사전 가드(실차단은 insert RLS).
  const canWrite = await canWriteBoard(client, boardId, user.id);
  if (!canWrite) throw data("작성 권한이 없습니다", { status: 403 });
  return { mode: "create" as const, board, post: null };
}

export default function CohortBoardPostNew({
  loaderData,
}: Route.ComponentProps) {
  const { mode, board, post } = loaderData;
  const isEdit = mode === "edit";
  const navigate = useNavigate();
  const [title, setTitle] = useState(post?.title ?? "");
  const [body, setBody] = useState(post?.bodyMd ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancelHref =
    isEdit && post
      ? `/cohort-boards/${board.boardId}/${post.postId}`
      : `/cohort-boards/${board.boardId}`;

  function addFiles(list: FileList | null) {
    if (!list) return;
    const accepted: File[] = [];
    const rejected: string[] = [];
    for (const f of Array.from(list)) {
      if (!ATTACH_ALLOWED.has(f.type)) rejected.push(`${f.name} (형식)`);
      else if (f.size > ATTACH_MAX_SIZE) rejected.push(`${f.name} (10MB 초과)`);
      else accepted.push(f);
    }
    setError(
      rejected.length
        ? `다음 파일은 첨부할 수 없어 제외했습니다: ${rejected.join(", ")}`
        : null,
    );
    setFiles((prev) => [...prev, ...accepted]);
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim() || busy) return;
    setBusy(true);
    setError(null);

    // 1) 글 저장 — deferRedirect 로 postId 를 JSON 으로 회수(첨부 업로드용).
    const postFd = new FormData();
    postFd.set("intent", isEdit ? "update" : "create");
    postFd.set("title", title.trim());
    postFd.set("bodyMd", body.trim());
    postFd.set("deferRedirect", "true");
    if (isEdit && post) postFd.set("postId", post.postId);
    else postFd.set("boardId", board.boardId);

    let saved: { ok?: boolean; postId?: string; boardId?: string };
    try {
      const res = await fetch("/api/cohort-board/post", {
        method: "POST",
        body: postFd,
      });
      saved = await res.json();
      if (!res.ok || !saved.ok || !saved.postId) {
        setError("글 저장에 실패했습니다. 입력 내용을 확인해 주세요.");
        setBusy(false);
        return;
      }
    } catch {
      setError("글 저장 중 오류가 발생했습니다.");
      setBusy(false);
      return;
    }

    const postId = saved.postId;
    const boardId = saved.boardId ?? board.boardId;

    // 2) 첨부 업로드 — 기존 첨부 API(postId 필요) 재사용. 실패분이 있어도 글은 이미 저장됨.
    const failed: string[] = [];
    for (const f of files) {
      const aFd = new FormData();
      aFd.set("intent", "upload");
      aFd.set("postId", postId);
      aFd.set("file", f);
      try {
        const ar = await fetch("/api/cohort-board/attachment", {
          method: "POST",
          body: aFd,
        });
        if (!ar.ok) failed.push(f.name);
      } catch {
        failed.push(f.name);
      }
    }

    // 3) 상세로 이동 — 실패한 첨부는 상세 화면에서 다시 추가할 수 있다.
    navigate(`/cohort-boards/${boardId}/${postId}`, {
      viewTransition: true,
      state: failed.length
        ? { attachWarning: `일부 첨부 파일 업로드에 실패했습니다: ${failed.join(", ")}` }
        : undefined,
    });
  }

  return (
    <CohortBoardShell
      title={isEdit ? "글 수정" : "새 글 작성"}
      desc={board.title}
      backLink={{ to: cancelHref, label: board.title }}
      width="narrow"
    >
      <div className="border-border bg-card rounded-2xl border p-5 shadow-sm md:p-6">
        <form onSubmit={handleSubmit}>
          <label className="block">
            <span className="text-muted-foreground mb-1.5 block font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
              제목
            </span>
            <Input
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="제목을 입력해 주세요"
              maxLength={200}
              required
            />
          </label>

          <label className="mt-4 block">
            <span className="text-muted-foreground mb-1.5 block font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
              내용
            </span>
            <Textarea
              name="bodyMd"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="내용을 입력해 주세요"
              rows={12}
              maxLength={20000}
              className="text-sm leading-relaxed"
              required
            />
          </label>

          {/* 첨부파일 — 작성 중 선택, 등록 시 함께 업로드 */}
          <div className="mt-4">
            <span className="text-muted-foreground mb-1.5 block font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
              첨부파일
            </span>
            {files.length > 0 ? (
              <ul className="mb-2 flex flex-col gap-1.5">
                {files.map((f, i) => (
                  <li
                    key={`${f.name}-${i}`}
                    className="border-border bg-muted/40 flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[13px]"
                  >
                    <PaperclipIcon className="text-muted-foreground size-3.5 shrink-0" />
                    <span className="truncate">{f.name}</span>
                    <span className="text-muted-foreground ml-auto shrink-0 text-[11px] tabular-nums">
                      {formatSize(f.size)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="text-muted-foreground hover:text-rose-600 shrink-0 dark:hover:text-rose-400"
                      aria-label={`${f.name} 첨부 제거`}
                    >
                      <XIcon className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <input
              type="file"
              accept={ATTACH_ACCEPT}
              multiple
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
              className="text-[13px]"
            />
            <p className="text-muted-foreground mt-1 text-[11px]">
              이미지(jpg·png·webp·gif)나 PDF를 개당 10MB 이하로 여러 개 첨부할 수 있습니다.
            </p>
          </div>

          {error ? (
            <p className="mt-3 text-[13px] font-medium text-rose-600 dark:text-rose-400">
              {error}
            </p>
          ) : null}

          <div className="mt-5 flex justify-end gap-2">
            <Button
              asChild
              variant="outline"
              size="sm"
              type="button"
              className="rounded-full"
            >
              <Link to={cancelHref} viewTransition>
                취소
              </Link>
            </Button>
            <Button
              type="submit"
              size="sm"
              className="rounded-full"
              disabled={busy || !title.trim() || !body.trim()}
            >
              {busy ? "처리 중…" : isEdit ? "수정 완료" : "등록"}{" "}
              <SendIcon className="size-3.5" />
            </Button>
          </div>
        </form>
      </div>
    </CohortBoardShell>
  );
}
