// 통합 코멘트 패널 — 조문/판례/문제 공용.
// feat-8-023: 강사·수험생 모두 작성. 강사 코멘트는 전체 공개, 수험생 코멘트는 본인 전용 (RLS).
//   목록 각 행에 작성자 역할 배지("강사" / "나만 보기")를 표시한다.
import {
  EditIcon,
  EyeIcon,
  MessageSquarePlusIcon,
  PinIcon,
  PinOffIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import { useFetcher } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Textarea } from "~/core/components/ui/textarea";
import { cn } from "~/core/lib/utils";
import type {
  CommentTargetType,
  ContentComment,
} from "~/features/comments/queries.server";
import { MarkdownView } from "~/features/problems/components/markdown-view";

interface CommentsPanelProps {
  targetType: CommentTargetType;
  targetId: string;
  comments: ContentComment[];
  /** 현재 사용자 id — 자기 코멘트 수정/삭제 권한 및 작성 가능 여부 판정 */
  currentUserId: string | null;
  /** admin 인지 — 모든 코멘트 수정/삭제 가능 */
  isAdmin: boolean;
  /** 빈 상태 안내 텍스트 */
  emptyHint?: string;
}

export function CommentsPanel({
  targetType,
  targetId,
  comments,
  currentUserId,
  isAdmin,
  emptyHint = "아직 등록된 코멘트가 없습니다",
}: CommentsPanelProps) {
  const [creating, setCreating] = useState(false);
  const canWrite = currentUserId !== null;
  return (
    <div
      className="space-y-2"
      data-testid={`comments-${targetType}-${targetId}`}
    >
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          코멘트 ({comments.length})
        </p>
        {canWrite ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => setCreating((c) => !c)}
          >
            <MessageSquarePlusIcon className="size-3" />
            {creating ? "취소" : "코멘트 추가"}
          </Button>
        ) : null}
      </div>

      {creating && canWrite ? (
        <CommentForm
          targetType={targetType}
          targetId={targetId}
          mode="create"
          onDone={() => setCreating(false)}
        />
      ) : null}

      {comments.length === 0 && !creating ? (
        <p className="text-muted-foreground text-xs italic">{emptyHint}</p>
      ) : null}

      <ul className="space-y-2">
        {comments.map((c) => (
          <CommentRow
            key={c.commentId}
            comment={c}
            canEdit={
              isAdmin ||
              (currentUserId !== null && c.authorId === currentUserId)
            }
            isAdmin={isAdmin}
          />
        ))}
      </ul>
    </div>
  );
}

function CommentRow({
  comment,
  canEdit,
  isAdmin,
}: {
  comment: ContentComment;
  canEdit: boolean;
  isAdmin: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const submitting = fetcher.state !== "idle";

  return (
    <li
      className={cn(
        "bg-card rounded-md border px-3 py-2",
        comment.isPinned && "border-amber-300 bg-amber-50/40",
      )}
      data-testid={`comment-${comment.commentId}`}
    >
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px]">
          {comment.isPinned ? (
            <Badge
              variant="outline"
              className="border-amber-200 bg-amber-100 text-[10px] text-amber-800"
            >
              <PinIcon className="mr-1 size-3" />
              고정
            </Badge>
          ) : null}
          {comment.authorIsStaff ? (
            <Badge
              variant="outline"
              className="border-primary/30 bg-primary/10 text-link text-[10px]"
            >
              강사
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="text-muted-foreground text-[10px]"
            >
              나만 보기
            </Badge>
          )}
          <span className="font-semibold">
            {comment.authorName ?? "(작성자 없음)"}
          </span>
          <span className="text-muted-foreground tabular-nums">
            {comment.updatedAt.slice(0, 10)}
          </span>
        </div>
        {canEdit ? (
          <div className="flex items-center gap-1">
            {isAdmin ? (
              <fetcher.Form
                method="post"
                action="/api/comments/comment"
                className="inline"
              >
                <input type="hidden" name="intent" value="update" />
                <input
                  type="hidden"
                  name="commentId"
                  value={comment.commentId}
                />
                <input
                  type="hidden"
                  name="isPinned"
                  value={comment.isPinned ? "false" : "true"}
                />
                <Button
                  type="submit"
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5 text-[10px]"
                  disabled={submitting}
                  title={comment.isPinned ? "고정 해제" : "고정"}
                >
                  {comment.isPinned ? (
                    <PinOffIcon className="size-3" />
                  ) : (
                    <PinIcon className="size-3" />
                  )}
                </Button>
              </fetcher.Form>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-1.5 text-[10px]"
              onClick={() => setEditing((e) => !e)}
              disabled={submitting}
            >
              <EditIcon className="size-3" />
            </Button>
            <fetcher.Form
              method="post"
              action="/api/comments/comment"
              className="inline"
            >
              <input type="hidden" name="intent" value="delete" />
              <input type="hidden" name="commentId" value={comment.commentId} />
              <Button
                type="submit"
                size="sm"
                variant="ghost"
                className="h-6 px-1.5 text-[10px] text-rose-600 hover:text-rose-700"
                disabled={submitting}
                onClick={(e) => {
                  if (!confirm("이 코멘트를 삭제하시겠습니까?")) {
                    e.preventDefault();
                  }
                }}
              >
                <Trash2Icon className="size-3" />
              </Button>
            </fetcher.Form>
          </div>
        ) : null}
      </div>

      {editing ? (
        <CommentForm
          targetType={comment.targetType}
          targetId={comment.targetId}
          mode="update"
          commentId={comment.commentId}
          initialBodyMd={comment.bodyMd}
          onDone={() => setEditing(false)}
        />
      ) : (
        <MarkdownView text={comment.bodyMd} className="text-sm" />
      )}
    </li>
  );
}

interface CommentFormProps {
  targetType: CommentTargetType;
  targetId: string;
  mode: "create" | "update";
  commentId?: string;
  initialBodyMd?: string;
  onDone: () => void;
}

function CommentForm({
  targetType,
  targetId,
  mode,
  commentId,
  initialBodyMd,
  onDone,
}: CommentFormProps) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const submitting = fetcher.state !== "idle";
  const [body, setBody] = useState(initialBodyMd ?? "");
  const [previewing, setPreviewing] = useState(false);

  // 성공 시 onDone 호출
  if (fetcher.data?.ok && !submitting) {
    setTimeout(() => onDone(), 0);
  }

  return (
    <fetcher.Form
      method="post"
      action="/api/comments/comment"
      className="bg-muted/30 space-y-2 rounded-md border p-2"
    >
      <input type="hidden" name="intent" value={mode} />
      {mode === "create" ? (
        <>
          <input type="hidden" name="targetType" value={targetType} />
          <input type="hidden" name="targetId" value={targetId} />
        </>
      ) : (
        <input type="hidden" name="commentId" value={commentId} />
      )}

      <div className="flex items-center justify-end border-b pb-1.5">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={() => setPreviewing((p) => !p)}
          disabled={submitting}
          title="입력한 마크다운 결과 미리보기"
        >
          <EyeIcon className="mr-1 size-3" />
          {previewing ? "편집" : "미리보기"}
        </Button>
      </div>

      <Textarea
        name="bodyMd"
        rows={5}
        required
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="코멘트를 입력하세요. (Markdown 지원)"
        className={cn("font-mono text-sm", previewing && "hidden")}
      />
      {previewing ? (
        <div className="bg-card min-h-24 rounded-md border p-2">
          {body.trim() ? (
            <MarkdownView text={body} className="text-sm" />
          ) : (
            <p className="text-muted-foreground text-xs italic">
              미리보기할 내용이 없습니다
            </p>
          )}
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        {fetcher.data?.error ? (
          <p className="text-xs text-rose-600">{fetcher.data.error}</p>
        ) : (
          <span />
        )}
        <div className="flex gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onDone}
            disabled={submitting}
          >
            취소
          </Button>
          <Button type="submit" size="sm" disabled={submitting}>
            {mode === "create" ? "등록" : "저장"}
          </Button>
        </div>
      </div>
    </fetcher.Form>
  );
}
