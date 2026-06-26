// feat-6-010 반별 게시판 — 글 상세 + 댓글. 조회·쓰기 모두 RLS client(DB 강제).
import {
  FileIcon,
  MessageSquareIcon,
  PaperclipIcon,
  PencilIcon,
  PinIcon,
  SendIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, data, redirect, useFetcher, useLocation } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Textarea } from "~/core/components/ui/textarea";
import makeServerClient from "~/core/lib/supa-client.server";
import { Chip, relativeKo } from "~/features/community/components/community-ui";

import { CohortBoardShell } from "../components/cohort-board-shell";
import type { CohortBoardAttachment, CohortBoardComment } from "../labels";
import {
  canWriteBoard,
  getBoardMeta,
  getBoardPost,
  listBoardAttachments,
  listBoardComments,
  managesBoard,
} from "../queries.server";

import type { Route } from "./+types/cohort-board-post-detail";

export const meta: Route.MetaFunction = ({ data: d }) => [
  { title: `${d?.post.title ?? "글"} | 리담변리사학원` },
];

export async function loader({ request, params }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const { boardId, postId } = params;
  if (!boardId || !postId)
    throw data("글을 찾을 수 없습니다", { status: 404 });
  const post = await getBoardPost(client, postId);
  if (!post || post.boardId !== boardId)
    throw data("글을 찾을 수 없습니다", { status: 404 });

  const [board, comments, attachments, canWrite, canManage] = await Promise.all([
    getBoardMeta(client, boardId),
    listBoardComments(client, postId),
    listBoardAttachments(client, postId),
    canWriteBoard(client, boardId, user.id),
    managesBoard(client, boardId, user.id),
  ]);
  if (!board) throw data("게시판을 찾을 수 없습니다", { status: 404 });
  const isAuthor = post.author?.profileId === user.id;
  const canAttach = (isAuthor && canWrite) || canManage;
  return {
    board,
    post,
    comments,
    attachments,
    canWrite,
    canManage,
    canAttach,
    currentUserId: user.id,
  };
}

export default function CohortBoardPostDetail({
  loaderData,
}: Route.ComponentProps) {
  const {
    board,
    post,
    comments,
    attachments,
    canWrite,
    canManage,
    canAttach,
    currentUserId,
  } = loaderData;
  const isAuthor = post.author?.profileId === currentUserId;
  // 작성 화면에서 일부 첨부 업로드가 실패한 경우 전달되는 경고(글은 등록됨).
  const location = useLocation();
  const attachWarning =
    (location.state as { attachWarning?: string } | null)?.attachWarning ?? null;
  const [warnDismissed, setWarnDismissed] = useState(false);

  return (
    <CohortBoardShell
      title={board.title}
      backLink={{ to: `/cohort-boards/${board.boardId}`, label: board.title }}
      width="narrow"
    >
      {attachWarning && !warnDismissed ? (
        <div className="mb-3.5 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200">
          <span className="flex-1">
            {attachWarning} — 아래에서 다시 추가할 수 있습니다.
          </span>
          <button
            type="button"
            onClick={() => setWarnDismissed(true)}
            className="shrink-0 hover:opacity-70"
            aria-label="닫기"
          >
            <XIcon className="size-3.5" />
          </button>
        </div>
      ) : null}
      <article className="border-border bg-card mb-3.5 rounded-2xl border p-5 shadow-sm md:p-6">
        {post.isPinned ? (
          <div className="mb-3">
            <Chip tone="primary">고정</Chip>
          </div>
        ) : null}
        <h2 className="text-[22px] leading-snug font-extrabold tracking-tight">
          {post.title}
        </h2>
        <div className="mt-2.5 flex items-center gap-2">
          <span className="bg-primary text-primary-foreground inline-flex size-6 items-center justify-center rounded-full text-[11px] font-bold">
            {(post.author?.name ?? "?").slice(0, 1)}
          </span>
          <span className="text-[13px] font-bold">
            {post.author?.name ?? "알 수 없음"}
          </span>
          <span className="text-muted-foreground text-[11px] tabular-nums">
            {new Date(post.createdAt).toLocaleString("ko-KR")}
          </span>
        </div>
        <div className="text-foreground/85 mt-3.5 text-[15px] leading-[1.85] break-words whitespace-pre-line">
          {post.bodyMd}
        </div>

        {attachments.length > 0 ? (
          <AttachmentsList attachments={attachments} canEdit={canAttach} />
        ) : null}
        {canAttach ? <AttachmentUploadForm postId={post.postId} /> : null}
      </article>

      {isAuthor || canManage ? (
        <PostActions
          boardId={board.boardId}
          postId={post.postId}
          canEdit={isAuthor}
          canManage={canManage}
          isPinned={post.isPinned}
        />
      ) : null}

      <CommentSection
        postId={post.postId}
        comments={comments}
        currentUserId={currentUserId}
        canManage={canManage}
        canWrite={canWrite}
      />
    </CohortBoardShell>
  );
}

function PostActions({
  boardId,
  postId,
  canEdit,
  canManage,
  isPinned,
}: {
  boardId: string;
  postId: string;
  canEdit: boolean;
  canManage: boolean;
  isPinned: boolean;
}) {
  const pinFetcher = useFetcher();
  const deleteFetcher = useFetcher();
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="border-border bg-card mb-3.5 flex flex-wrap items-center gap-2 rounded-2xl border p-3 shadow-sm">
      {canEdit ? (
        <Button asChild variant="outline" size="sm" className="rounded-full">
          <Link to={`/cohort-boards/${boardId}/${postId}/edit`} viewTransition>
            <PencilIcon className="size-3.5" /> 수정
          </Link>
        </Button>
      ) : null}

      {canManage ? (
        <pinFetcher.Form method="post" action="/api/cohort-board/post">
          <input type="hidden" name="intent" value="pin" />
          <input type="hidden" name="postId" value={postId} />
          <input type="hidden" name="pinned" value={isPinned ? "false" : "true"} />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            className="rounded-full"
            disabled={pinFetcher.state !== "idle"}
          >
            <PinIcon className="size-3.5" /> {isPinned ? "고정 해제" : "고정"}
          </Button>
        </pinFetcher.Form>
      ) : null}

      <div className="ml-auto">
        {confirmDelete ? (
          <deleteFetcher.Form
            method="post"
            action="/api/cohort-board/post"
            className="flex items-center gap-1.5"
          >
            <input type="hidden" name="intent" value="delete" />
            <input type="hidden" name="postId" value={postId} />
            <input type="hidden" name="boardId" value={boardId} />
            <span className="text-muted-foreground text-xs">삭제하시겠습니까?</span>
            <Button
              type="submit"
              variant="destructive"
              size="sm"
              className="rounded-full"
              disabled={deleteFetcher.state !== "idle"}
            >
              삭제
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-full"
              onClick={() => setConfirmDelete(false)}
            >
              취소
            </Button>
          </deleteFetcher.Form>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-full text-rose-600 dark:text-rose-400"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2Icon className="size-3.5" /> 삭제
          </Button>
        )}
      </div>
    </div>
  );
}

function CommentSection({
  postId,
  comments,
  currentUserId,
  canManage,
  canWrite,
}: {
  postId: string;
  comments: CohortBoardComment[];
  currentUserId: string;
  canManage: boolean;
  canWrite: boolean;
}) {
  return (
    <section className="border-border bg-card rounded-2xl border p-5 shadow-sm md:p-6">
      <h3 className="flex items-center gap-1.5 text-sm font-bold tracking-tight">
        <MessageSquareIcon className="size-4" /> 댓글 {comments.length}
      </h3>

      {comments.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-3">
          {comments.map((comment) => (
            <CommentItem
              key={comment.commentId}
              comment={comment}
              canDelete={
                comment.author?.profileId === currentUserId || canManage
              }
            />
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground mt-4 text-[13px]">
          첫 댓글을 남겨보세요.
        </p>
      )}

      {canWrite ? (
        <CommentForm postId={postId} />
      ) : (
        <p className="text-muted-foreground border-border mt-4 border-t pt-4 text-[13px]">
          이 게시판은 강사만 작성할 수 있습니다.
        </p>
      )}
    </section>
  );
}

function CommentItem({
  comment,
  canDelete,
}: {
  comment: CohortBoardComment;
  canDelete: boolean;
}) {
  const fetcher = useFetcher();
  // 삭제 제출 중에는 낙관적으로 숨긴다 (성공 시 revalidate 로 사라짐).
  if (fetcher.state !== "idle") return null;

  return (
    <li className="border-border border-b pb-3 last:border-0 last:pb-0">
      <div className="flex items-center gap-2">
        <span className="bg-muted inline-flex size-6 items-center justify-center rounded-full text-[11px] font-bold">
          {(comment.author?.name ?? "?").slice(0, 1)}
        </span>
        <span className="text-[13px] font-bold">
          {comment.author?.name ?? "알 수 없음"}
        </span>
        <span className="text-muted-foreground text-[11px] tabular-nums">
          {relativeKo(comment.createdAt)}
        </span>
        {canDelete ? (
          <fetcher.Form
            method="post"
            action="/api/cohort-board/comment"
            className="ml-auto"
          >
            <input type="hidden" name="intent" value="delete" />
            <input type="hidden" name="commentId" value={comment.commentId} />
            <button
              type="submit"
              className="text-muted-foreground hover:text-rose-600 text-[11px] font-medium dark:hover:text-rose-400"
            >
              삭제
            </button>
          </fetcher.Form>
        ) : null}
      </div>
      <div className="text-foreground/85 mt-1.5 text-sm leading-relaxed break-words whitespace-pre-line">
        {comment.bodyMd}
      </div>
    </li>
  );
}

function CommentForm({ postId }: { postId: string }) {
  const fetcher = useFetcher();
  const [body, setBody] = useState("");
  const isSubmitting = fetcher.state !== "idle";

  useEffect(() => {
    const result = fetcher.data;
    if (
      result &&
      typeof result === "object" &&
      "ok" in result &&
      result.ok === true
    ) {
      setBody("");
    }
  }, [fetcher.data]);

  return (
    <fetcher.Form
      method="post"
      action="/api/cohort-board/comment"
      className="border-border mt-4 border-t pt-4"
    >
      <input type="hidden" name="intent" value="create" />
      <input type="hidden" name="postId" value={postId} />
      <Textarea
        name="bodyMd"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="댓글을 입력하세요"
        rows={3}
        maxLength={10000}
        className="text-sm leading-relaxed"
        required
      />
      <div className="mt-2 flex justify-end">
        <Button
          type="submit"
          size="sm"
          className="rounded-full"
          disabled={isSubmitting || !body.trim()}
        >
          댓글 등록 <SendIcon className="size-3.5" />
        </Button>
      </div>
    </fetcher.Form>
  );
}

function AttachmentsList({
  attachments,
  canEdit,
}: {
  attachments: CohortBoardAttachment[];
  canEdit: boolean;
}) {
  return (
    <div className="border-border mt-4 flex flex-col gap-2 border-t pt-4">
      {attachments.map((a) => (
        <AttachmentItem key={a.attachmentId} attachment={a} canEdit={canEdit} />
      ))}
    </div>
  );
}

function AttachmentItem({
  attachment: a,
  canEdit,
}: {
  attachment: CohortBoardAttachment;
  canEdit: boolean;
}) {
  const isImage = a.kind === "image";
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const deleteFetcher = useFetcher();

  useEffect(() => {
    if (!isImage) return;
    let active = true;
    fetch(`/api/cohort-board/attachment/signed-url?attachmentId=${a.attachmentId}`)
      .then((r) => r.json())
      .then((d: { url?: string }) => {
        if (active && d.url) setImgUrl(d.url);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [a.attachmentId, isImage]);

  const openSigned = async () => {
    const r = await fetch(
      `/api/cohort-board/attachment/signed-url?attachmentId=${a.attachmentId}`,
    );
    const d: { url?: string } = await r.json();
    if (d.url) window.open(d.url, "_blank", "noopener,noreferrer");
  };

  // 삭제 제출 중에는 낙관적으로 숨긴다 (성공 시 revalidate 로 사라짐).
  if (deleteFetcher.state !== "idle") return null;

  return (
    <div className="border-border bg-muted/30 flex items-start gap-2 rounded-lg border p-2">
      {isImage && imgUrl ? (
        <img
          src={imgUrl}
          alt={a.originalFilename}
          className="max-h-72 rounded-md object-contain"
          draggable={false}
        />
      ) : (
        <button
          type="button"
          onClick={openSigned}
          className="flex min-w-0 flex-1 items-center gap-2 text-left text-[13px]"
        >
          {a.kind === "pdf" ? (
            <FileIcon className="size-4 shrink-0 text-rose-500" />
          ) : (
            <PaperclipIcon className="size-4 shrink-0" />
          )}
          <span className="truncate underline-offset-2 hover:underline">
            {a.originalFilename}
          </span>
        </button>
      )}
      {canEdit ? (
        <deleteFetcher.Form
          method="post"
          action="/api/cohort-board/attachment"
          className="ml-auto shrink-0"
        >
          <input type="hidden" name="intent" value="delete" />
          <input type="hidden" name="attachmentId" value={a.attachmentId} />
          <button
            type="submit"
            className="text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400"
            aria-label="첨부 삭제"
          >
            <XIcon className="size-3.5" />
          </button>
        </deleteFetcher.Form>
      ) : null}
    </div>
  );
}

function AttachmentUploadForm({ postId }: { postId: string }) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const submitting = fetcher.state !== "idle";
  return (
    <fetcher.Form
      method="post"
      action="/api/cohort-board/attachment"
      encType="multipart/form-data"
      className="border-border mt-3 flex flex-wrap items-center gap-2 border-t pt-3"
    >
      <input type="hidden" name="intent" value="upload" />
      <input type="hidden" name="postId" value={postId} />
      <input
        type="file"
        name="file"
        accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
        required
        className="text-[13px]"
      />
      <Button
        type="submit"
        size="sm"
        variant="outline"
        className="rounded-full"
        disabled={submitting}
      >
        <PaperclipIcon className="size-3.5" /> {submitting ? "업로드 중…" : "첨부 추가"}
      </Button>
      {fetcher.data?.error ? (
        <p className="w-full text-xs text-rose-600">{fetcher.data.error}</p>
      ) : null}
    </fetcher.Form>
  );
}
