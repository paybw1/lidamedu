// 커뮤니티 글 상세 + 댓글 — `/community/:board/:postId`. feat-6-002.
import {
  HeartIcon,
  MessageSquareIcon,
  PencilIcon,
  PinIcon,
  SendIcon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, data, redirect, useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Textarea } from "~/core/components/ui/textarea";
import { roleAtLeast } from "~/core/lib/roles";
import makeServerClient from "~/core/lib/supa-client.server";
import { CommunityShell } from "~/features/community/components/community-shell";
import { Chip, relativeKo } from "~/features/community/components/community-ui";

import {
  BOARD_LABEL,
  communityBoardSchema,
  type CommunityComment,
  type CommunityPostDetail,
} from "../labels";
import { runAfterResponse } from "~/core/lib/wait-until.server";

import { RichBody } from "../components/rich-body";
import { resolveRefsForBodies } from "../content-refs.server";
import { incrementPostView } from "../popular.server";
import { getPost, listAttachments, listComments } from "../queries.server";
import {
  type StudyMembership,
  getStudyMembership,
} from "../study-members.server";
import type { CommunityPostAttachment } from "../labels";

import type { Route } from "./+types/community-post-detail";

export const meta: Route.MetaFunction = ({ data: loaderData }) => [
  {
    title: `${loaderData ? loaderData.post.title : "커뮤니티"} | 리담변리사학원`,
  },
];

export async function loader({ request, params }: Route.LoaderArgs) {
  const boardParse = communityBoardSchema.safeParse(params.board);
  if (!boardParse.success || !params.postId) {
    throw data("글을 찾을 수 없습니다", { status: 404 });
  }
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    throw redirect("/login");
  }

  const post = await getPost(client, params.postId, user.id);
  if (!post || post.board !== boardParse.data) {
    throw data("글을 찾을 수 없습니다", { status: 404 });
  }

  const { data: profile } = await client
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .maybeSingle();
  const isStaff = profile?.role != null && profile.role !== "student";
  // 미노출(초안) 글은 staff 만 열람. 학생은 직접 URL 로도 접근 불가.
  if (!post.published && !isStaff) {
    throw data("글을 찾을 수 없습니다", { status: 404 });
  }

  const [comments, attachments] = await Promise.all([
    listComments(client, post.postId),
    listAttachments(client, post.postId),
  ]);

  // feat-6-005 — post + comments 본문에서 콘텐츠 marker 일괄 해석.
  const refMap = await resolveRefsForBodies(client, [
    post.bodyMd,
    ...comments.map((c) => c.bodyMd),
  ]);

  // feat-6-008 — study 보드 멤버십.
  const membership: StudyMembership | null =
    post.board === "study"
      ? await getStudyMembership(client, post.postId, user.id, post.maxMembers)
      : null;

  // feat-6-003 — 본인 글이 아니면 view_count 증가 (응답 후 best-effort).
  runAfterResponse(incrementPostView(client, post.postId));

  return {
    post,
    comments,
    attachments,
    refMap,
    membership,
    currentUserId: user.id,
    isManager: roleAtLeast(profile?.role, "manager"),
  };
}

export default function CommunityPostDetail({
  loaderData,
}: Route.ComponentProps) {
  const {
    post,
    comments,
    attachments,
    refMap,
    membership,
    currentUserId,
    isManager,
  } = loaderData;
  const isAuthor = post.author?.id === currentUserId;
  const canEditAttach = isAuthor || isManager;
  const isStudy = post.board === "study";

  return (
    <CommunityShell
      category={post.board}
      title={BOARD_LABEL[post.board]}
      backLink={{ to: `/community/${post.board}`, label: BOARD_LABEL[post.board] }}
      // 합격 수기(review)는 성적표 등 넓은 표가 많아 반별 게시판과 같은 폭(feed)으로.
      // 산문 위주 게시판(자유·스터디)은 독서 폭(narrow) 유지.
      width={post.board === "review" ? "feed" : "narrow"}
    >
      <article className="border-border bg-card mb-3.5 rounded-2xl border p-5 shadow-sm md:p-6">
        {post.isPinned || isStudy ? (
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {post.isPinned ? (
              <Chip tone="primary">
                <PinIcon className="size-2.5" /> 고정
              </Chip>
            ) : null}
            {isStudy ? (
              <Chip tone={post.closedAt ? "neutral" : "emerald"}>
                {post.closedAt ? "모집 마감" : "모집 중"}
              </Chip>
            ) : null}
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
        <RichBody
          body={post.bodyMd}
          refs={refMap}
          // 운영자·강사 작성 글(합격 수기 등)만 병합 표(HTML colspan) 렌더 허용.
          trusted={
            post.author?.role != null && post.author.role !== "student"
          }
          className="text-foreground/85 mt-3.5 text-[15px] leading-[1.85]"
        />

        {/* feat-6 v2.2 — 첨부 list */}
        {attachments.length > 0 ? (
          <AttachmentsList
            attachments={attachments}
            canEdit={canEditAttach}
          />
        ) : null}
        {canEditAttach ? (
          <AttachmentUploadForm postId={post.postId} />
        ) : null}

        {/* feat-6 v2.1 — 좋아요 버튼 */}
        <LikeToggle
          postId={post.postId}
          likeCount={post.likeCount}
          likedByMe={post.likedByMe}
        />
      </article>

      {isAuthor || isManager ? (
        <PostActions
          post={post}
          isAuthor={isAuthor}
          isManager={isManager}
          isStudy={isStudy}
        />
      ) : null}

      {/* feat-6-008 — study 보드 멤버 패널. */}
      {membership && post.board === "study" ? (
        <StudyMembersPanel
          postId={post.postId}
          membership={membership}
          isAuthor={isAuthor}
          closed={post.closedAt !== null}
        />
      ) : null}

      {/* feat-6-007 — 본인 글이 아닐 때만 신고 버튼 노출. */}
      {!isAuthor ? (
        <ReportButton targetType="post" targetId={post.postId} />
      ) : null}

      <CommentSection
        postId={post.postId}
        comments={comments}
        refMap={refMap}
        currentUserId={currentUserId}
        isManager={isManager}
      />
    </CommunityShell>
  );
}

function PostActions({
  post,
  isAuthor,
  isManager,
  isStudy,
}: {
  post: CommunityPostDetail;
  isAuthor: boolean;
  isManager: boolean;
  isStudy: boolean;
}) {
  const pinFetcher = useFetcher();
  const closeFetcher = useFetcher();
  const deleteFetcher = useFetcher();
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="border-border bg-card mb-3.5 flex flex-wrap items-center gap-2 rounded-2xl border p-3 shadow-sm">
      {/* 수정 — 작성자 본인 또는 운영자(manager+). 운영자는 합격 수기 등 타 작성자 글도 편집. */}
      {isAuthor || isManager ? (
        <Button asChild variant="outline" size="sm" className="rounded-full">
          <Link
            to={`/community/${post.board}/${post.postId}/edit`}
            viewTransition
          >
            <PencilIcon className="size-3.5" /> 수정
          </Link>
        </Button>
      ) : null}

      {isStudy ? (
        <closeFetcher.Form method="post" action="/api/community/post">
          <input type="hidden" name="intent" value="close" />
          <input type="hidden" name="postId" value={post.postId} />
          <input
            type="hidden"
            name="closed"
            value={post.closedAt ? "false" : "true"}
          />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            className="rounded-full"
            disabled={closeFetcher.state !== "idle"}
          >
            {post.closedAt ? "모집 재개" : "모집 마감"}
          </Button>
        </closeFetcher.Form>
      ) : null}

      {isManager ? (
        <pinFetcher.Form method="post" action="/api/community/post">
          <input type="hidden" name="intent" value="pin" />
          <input type="hidden" name="postId" value={post.postId} />
          <input
            type="hidden"
            name="pinned"
            value={post.isPinned ? "false" : "true"}
          />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            className="rounded-full"
            disabled={pinFetcher.state !== "idle"}
          >
            <PinIcon className="size-3.5" />
            {post.isPinned ? "고정 해제" : "고정"}
          </Button>
        </pinFetcher.Form>
      ) : null}

      <div className="ml-auto">
        {confirmDelete ? (
          <deleteFetcher.Form
            method="post"
            action="/api/community/post"
            className="flex items-center gap-1.5"
          >
            <input type="hidden" name="intent" value="delete" />
            <input type="hidden" name="postId" value={post.postId} />
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
  isManager,
  refMap,
}: {
  postId: string;
  comments: CommunityComment[];
  currentUserId: string;
  isManager: boolean;
  refMap: import("~/features/community/content-refs").ResolvedRefMap;
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
              refMap={refMap}
              canDelete={comment.author?.id === currentUserId || isManager}
            />
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground mt-4 text-[13px]">
          첫 댓글을 남겨보세요.
        </p>
      )}

      <CommentForm postId={postId} />
    </section>
  );
}

function CommentItem({
  comment,
  canDelete,
  refMap,
}: {
  comment: CommunityComment;
  canDelete: boolean;
  refMap: import("~/features/community/content-refs").ResolvedRefMap;
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
            action="/api/community/comment"
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
      <RichBody
        body={comment.bodyMd}
        refs={refMap}
        className="text-foreground/85 mt-1.5 text-sm leading-relaxed"
      />
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
      action="/api/community/comment"
      className="border-border mt-4 border-t pt-4"
    >
      <input type="hidden" name="intent" value="create" />
      <input type="hidden" name="postId" value={postId} />
      <Textarea
        name="bodyMd"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="댓글을 입력해 주세요"
        rows={3}
        maxLength={5000}
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

// feat-6 v2.2 — 첨부 list 표시. 이미지는 인라인 썸네일(클릭 시 signed URL), 그 외는 다운로드 chip.
function AttachmentsList({
  attachments,
  canEdit,
}: {
  attachments: ReadonlyArray<CommunityPostAttachment>;
  canEdit: boolean;
}) {
  return (
    <div className="border-border/60 mt-4 space-y-3 border-t pt-3">
      <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide">
        첨부 {attachments.length}건
      </p>
      <div className="flex flex-wrap gap-2">
        {attachments.map((a) => (
          <AttachmentItem key={a.attachmentId} a={a} canEdit={canEdit} />
        ))}
      </div>
    </div>
  );
}

function AttachmentItem({
  a,
  canEdit,
}: {
  a: CommunityPostAttachment;
  canEdit: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(false);
  const fetcher = useFetcher();

  // 이미지면 mount 시 signed URL 자동 fetch.
  useEffect(() => {
    if (a.kind !== "image") return;
    let cancelled = false;
    setLoadingUrl(true);
    fetch(`/community/attachment/signed-url?attachmentId=${a.attachmentId}`)
      .then((r) => r.json() as Promise<{ url?: string }>)
      .then((j) => {
        if (!cancelled && j.url) setUrl(j.url);
      })
      .finally(() => !cancelled && setLoadingUrl(false));
    return () => {
      cancelled = true;
    };
  }, [a.attachmentId, a.kind]);

  async function openSigned() {
    setLoadingUrl(true);
    try {
      const r = await fetch(
        `/community/attachment/signed-url?attachmentId=${a.attachmentId}`,
      );
      const j = (await r.json()) as { url?: string };
      if (j.url) window.open(j.url, "_blank", "noopener,noreferrer");
    } finally {
      setLoadingUrl(false);
    }
  }

  function doDelete() {
    if (!confirm(`첨부 파일 "${a.originalFilename}"을(를) 삭제하시겠습니까?`)) return;
    const fd = new FormData();
    fd.set("intent", "delete");
    fd.set("attachmentId", a.attachmentId);
    fetcher.submit(fd, {
      method: "post",
      action: "/api/community/attachment",
      encType: "multipart/form-data",
    });
  }

  if (a.kind === "image") {
    return (
      <div className="border-border relative inline-flex flex-col gap-1 overflow-hidden rounded-xl border bg-card">
        {url ? (
          <button
            type="button"
            onClick={openSigned}
            className="block"
            title={a.originalFilename}
          >
            <img
              src={url}
              alt={a.originalFilename}
              className="block max-h-48 max-w-xs object-contain"
            />
          </button>
        ) : (
          <div className="text-muted-foreground flex h-32 w-48 items-center justify-center text-xs">
            {loadingUrl ? "불러오는 중…" : "이미지"}
          </div>
        )}
        <p className="text-muted-foreground truncate px-2 py-1 text-[10px]">
          {a.originalFilename}
        </p>
        {canEdit ? (
          <button
            type="button"
            onClick={doDelete}
            disabled={fetcher.state !== "idle"}
            className="absolute top-1 right-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white"
            aria-label="삭제"
          >
            ×
          </button>
        ) : null}
      </div>
    );
  }

  // pdf / file — chip 형태.
  return (
    <div className="border-border bg-card inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs">
      <button
        type="button"
        onClick={openSigned}
        disabled={loadingUrl}
        className="text-foreground inline-flex items-center gap-1"
        title={a.originalFilename}
      >
        📎 {a.originalFilename}
      </button>
      {canEdit ? (
        <button
          type="button"
          onClick={doDelete}
          disabled={fetcher.state !== "idle"}
          className="text-rose-600 hover:text-rose-700"
          aria-label="삭제"
        >
          ×
        </button>
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
      action="/api/community/attachment"
      encType="multipart/form-data"
      className="border-border/60 mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-dashed bg-muted/20 p-2 text-xs"
    >
      <input type="hidden" name="intent" value="upload" />
      <input type="hidden" name="postId" value={postId} />
      <input
        type="file"
        name="file"
        accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
        required
        className="text-xs"
      />
      <Button
        type="submit"
        size="sm"
        disabled={submitting}
        className="h-7 rounded-full px-3 text-xs"
      >
        {submitting ? "업로드 중…" : "추가"}
      </Button>
      {fetcher.data && "error" in fetcher.data && fetcher.data.error ? (
        <span className="text-xs text-rose-600">{fetcher.data.error}</span>
      ) : null}
    </fetcher.Form>
  );
}

// feat-6 v2.1 — 좋아요 토글 버튼. 옵티미스틱 갱신 + fetcher submit.
function LikeToggle({
  postId,
  likeCount,
  likedByMe,
}: {
  postId: string;
  likeCount: number;
  likedByMe: boolean;
}) {
  const fetcher = useFetcher<{ ok?: boolean; liked?: boolean; error?: string }>();
  // 옵티미스틱 상태.
  const [count, setCount] = useState(likeCount);
  const [liked, setLiked] = useState(likedByMe);

  function handle() {
    const fd = new FormData();
    fd.set("intent", "toggle_like");
    fd.set("postId", postId);
    setLiked((v) => !v);
    setCount((c) => (liked ? c - 1 : c + 1));
    fetcher.submit(fd, { method: "post", action: "/api/community/post" });
  }

  // 서버 응답으로 정정.
  useEffect(() => {
    if (fetcher.data && fetcher.data.ok && typeof fetcher.data.liked === "boolean") {
      setLiked(fetcher.data.liked);
    }
  }, [fetcher.data]);

  return (
    <div className="mt-4 flex items-center gap-2">
      <button
        type="button"
        onClick={handle}
        disabled={fetcher.state !== "idle"}
        aria-pressed={liked}
        className={
          liked
            ? "inline-flex items-center gap-1.5 rounded-full border border-rose-500/40 bg-rose-500/[0.06] px-3 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300"
            : "border-border hover:border-primary/40 inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-semibold transition-colors"
        }
      >
        <HeartIcon className={liked ? "size-3.5 fill-current" : "size-3.5"} />
        좋아요 <span className="tabular-nums">{Math.max(0, count)}</span>
      </button>
    </div>
  );
}

// ─── feat-6-008 스터디 멤버 패널 ───

function StudyMembersPanel({
  postId,
  membership,
  isAuthor,
  closed,
}: {
  postId: string;
  membership: StudyMembership;
  isAuthor: boolean;
  closed: boolean;
}) {
  const fetcher = useFetcher<{ ok: boolean; error?: string }>();
  const busy = fetcher.state !== "idle";
  const optimisticJoined =
    fetcher.formData && fetcher.formData.get("postId") === postId
      ? fetcher.formData.get("intent") === "join"
      : membership.isMine;
  const errCode = fetcher.data?.error;

  return (
    <section className="border-border bg-card mt-3 rounded-2xl border p-4 shadow-sm md:p-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-foreground text-sm font-bold">
          스터디 멤버 · {membership.total}
          {membership.maxMembers !== null ? (
            <span className="text-muted-foreground font-mono text-[11px] font-medium">
              {" "}
              / {membership.maxMembers}
            </span>
          ) : null}
        </p>
        {!isAuthor ? (
          <fetcher.Form method="post" action="/api/community/study-join">
            <input type="hidden" name="postId" value={postId} />
            <input
              type="hidden"
              name="intent"
              value={optimisticJoined ? "leave" : "join"}
            />
            <Button
              type="submit"
              size="sm"
              variant={optimisticJoined ? "outline" : "default"}
              disabled={busy || (closed && !optimisticJoined) || (membership.isFull && !optimisticJoined)}
            >
              {optimisticJoined
                ? "참여 취소"
                : closed
                  ? "마감"
                  : membership.isFull
                    ? "정원 가득"
                    : "참여하기"}
            </Button>
          </fetcher.Form>
        ) : null}
      </div>
      {membership.members.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          아직 참여 멤버가 없습니다.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {membership.members.map((m) => (
            <li
              key={m.profileId}
              className="border-border bg-muted/40 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]"
            >
              <span className="bg-primary text-primary-foreground inline-flex size-4 items-center justify-center rounded-full text-[9px] font-bold">
                {m.name.slice(0, 1)}
              </span>
              <span className="text-foreground font-medium">{m.name}</span>
            </li>
          ))}
        </ul>
      )}
      {errCode === "full" ? (
        <p className="text-amber-600 dark:text-amber-400 mt-2 text-[11px]">
          정원이 가득 찼습니다.
        </p>
      ) : errCode === "closed" ? (
        <p className="text-rose-600 dark:text-rose-400 mt-2 text-[11px]">
          이미 마감된 스터디입니다.
        </p>
      ) : errCode ? (
        <p className="text-rose-600 dark:text-rose-400 mt-2 text-[11px]">
          ✗ 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.
        </p>
      ) : null}
    </section>
  );
}

// ─── feat-6-007 신고 버튼 ───

function ReportButton({
  targetType,
  targetId,
}: {
  targetType: "post" | "comment";
  targetId: string;
}) {
  const fetcher = useFetcher<{ ok: boolean; error?: string }>();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const busy = fetcher.state !== "idle";
  const success = fetcher.data?.ok === true;
  const dup = fetcher.data?.error === "already-reported";

  if (!open) {
    return (
      <div className="mt-2 text-right text-[11px]">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400"
        >
          신고하기
        </button>
      </div>
    );
  }
  return (
    <fetcher.Form
      method="post"
      action="/api/community/report"
      className="border-border bg-card mt-2 rounded-xl border p-3"
      onSubmit={() => {
        if (!reason.trim()) {
          setReason("");
        }
      }}
    >
      <input type="hidden" name="targetType" value={targetType} />
      <input type="hidden" name="targetId" value={targetId} />
      {success ? (
        <p className="text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
          ✓ 신고가 접수되었습니다. 운영진이 확인합니다.
        </p>
      ) : (
        <>
          <p className="text-foreground mb-2 text-xs font-bold">
            신고 사유 (1~500자)
          </p>
          <textarea
            name="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            maxLength={500}
            required
            placeholder="구체적인 사유를 입력해 주세요"
            className="bg-background border-input focus:border-primary w-full rounded-md border px-2 py-1.5 text-xs outline-none"
            disabled={busy}
          />
          <div className="mt-2 flex items-center justify-end gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              취소
            </Button>
            <Button
              type="submit"
              size="sm"
              variant="outline"
              disabled={busy || reason.trim().length === 0}
            >
              신고
            </Button>
          </div>
          {dup ? (
            <p className="text-amber-600 dark:text-amber-400 mt-1 text-[11px]">
              이미 신고한 항목입니다.
            </p>
          ) : null}
          {fetcher.data?.error && !dup ? (
            <p className="text-rose-600 dark:text-rose-400 mt-1 text-[11px]">
              ✗ 신고 접수에 실패했습니다. 잠시 후 다시 시도해 주세요.
            </p>
          ) : null}
        </>
      )}
    </fetcher.Form>
  );
}
