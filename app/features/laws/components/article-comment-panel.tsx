// 조문 코멘트/평석 패널 — staff 작성 / 학생 read-only.
// UX:
// - 작성 중 localStorage 자동 저장 (네비/새로고침 손실 방지)
// - 미리보기 토글 (마크다운 결과 확인)
// - 템플릿 prefill (시작 부담 감소)

import { EyeIcon, FileTextIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Textarea } from "~/core/components/ui/textarea";
import { cn } from "~/core/lib/utils";
import { MarkdownView } from "~/features/problems/components/markdown-view";
import type { ArticleComment } from "~/features/laws/queries.server";

const DRAFT_PREFIX = "lidam-edu:article-comment-draft:";

const TEMPLATES: Array<{ key: string; label: string; body: string }> = [
  {
    key: "structure",
    label: "쟁점 정리",
    body: "## 쟁점\n- \n\n## 결론\n- \n\n## 관련 조문/판례\n- ",
  },
  {
    key: "exam",
    label: "기출 빈출 포인트",
    body: "## 빈출 포인트\n- \n\n## 자주 묻는 함정\n- \n\n## 정답 작성 전략\n- ",
  },
  {
    key: "case",
    label: "판례 동향",
    body: "## 최근 판례 동향\n- \n\n## 학설 vs 판례\n- \n\n## 시험 출제 가능성\n- ",
  },
];

export function ArticleCommentPanel({
  articleId,
  initial,
  canEdit,
}: {
  articleId: string;
  initial: ArticleComment | null;
  canEdit: boolean;
}) {
  const fetcher = useFetcher();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initial?.bodyMd ?? "");
  const [showPreview, setShowPreview] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // editing 모드 진입 시 localStorage draft 복원 (있으면).
  useEffect(() => {
    if (!editing) return;
    textRef.current?.focus();
    const stored = localStorage.getItem(DRAFT_PREFIX + articleId);
    if (stored && stored !== draft) {
      const baseline = initial?.bodyMd ?? "";
      if (stored !== baseline) {
        setDraft(stored);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, articleId]);

  // draft 변경 시 localStorage 에 1초 debounce 자동 저장.
  useEffect(() => {
    if (!editing) return;
    const t = setTimeout(() => {
      localStorage.setItem(DRAFT_PREFIX + articleId, draft);
    }, 1000);
    return () => clearTimeout(t);
  }, [editing, draft, articleId]);

  // 액션 성공 → 편집 모드 종료 + draft 정리.
  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data &&
      typeof fetcher.data === "object" &&
      "ok" in fetcher.data &&
      fetcher.data.ok
    ) {
      setEditing(false);
      localStorage.removeItem(DRAFT_PREFIX + articleId);
    }
  }, [fetcher.state, fetcher.data, articleId]);

  const submitting = fetcher.state !== "idle";

  const handleSave = () => {
    const fd = new FormData();
    fd.set("intent", "save");
    fd.set("articleId", articleId);
    fd.set("bodyMd", draft);
    fetcher.submit(fd, {
      method: "post",
      action: "/api/laws/article-comment",
    });
  };

  const handleDelete = () => {
    if (!confirm("이 코멘트를 삭제하시겠습니까?")) return;
    const fd = new FormData();
    fd.set("intent", "delete");
    fd.set("articleId", articleId);
    fetcher.submit(fd, {
      method: "post",
      action: "/api/laws/article-comment",
    });
  };

  if (editing) {
    return (
      <div className="space-y-2" data-testid="article-comment-panel">
        {draft.trim().length === 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-muted-foreground text-[10.5px]">템플릿:</span>
            {TEMPLATES.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setDraft(t.body)}
                className="border-input hover:bg-accent rounded-md border px-2 py-0.5 text-[10.5px]"
              >
                {t.label}
              </button>
            ))}
          </div>
        ) : null}
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            className={cn(
              "border-input hover:bg-accent inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10.5px]",
              showPreview && "bg-muted",
            )}
          >
            {showPreview ? (
              <PencilIcon className="size-3" />
            ) : (
              <EyeIcon className="size-3" />
            )}
            {showPreview ? "편집" : "미리보기"}
          </button>
        </div>
        {showPreview ? (
          <div className="bg-muted/30 max-h-[60vh] min-h-[10rem] overflow-auto rounded-md border p-3">
            {draft.trim() ? (
              <MarkdownView text={draft} />
            ) : (
              <p className="text-muted-foreground text-xs">미리보기 — 내용 없음</p>
            )}
          </div>
        ) : (
          <Textarea
            ref={textRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="평석 / 학습 코멘트 (마크다운 지원). 작성 중 자동 임시 저장됨."
            rows={12}
            maxLength={10000}
            className="text-sm"
          />
        )}
        <div className="flex items-center justify-between gap-2">
          <p className="text-muted-foreground text-[10.5px]">
            <FileTextIcon className="mr-1 inline size-3" />
            {draft.length} / 10000자 · 작성 중 자동 임시 저장
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setDraft(initial?.bodyMd ?? "");
                localStorage.removeItem(DRAFT_PREFIX + articleId);
                setEditing(false);
                setShowPreview(false);
              }}
            >
              취소
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={submitting || draft.trim().length === 0}
              data-testid="article-comment-save"
            >
              {submitting ? "저장 중…" : "저장"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!initial) {
    // 작성 안 됐지만 localStorage 에 draft 가 있으면 복원 유도.
    const stored =
      typeof window !== "undefined"
        ? localStorage.getItem(DRAFT_PREFIX + articleId)
        : null;
    return (
      <div className="space-y-2" data-testid="article-comment-panel">
        <p className="text-muted-foreground text-xs leading-relaxed">
          이 조문에 대한 코멘트가 아직 없습니다.
        </p>
        {canEdit ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => {
                setDraft("");
                setEditing(true);
              }}
              data-testid="article-comment-add"
            >
              코멘트 작성
            </Button>
            {stored ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setDraft(stored);
                  setEditing(true);
                }}
                title="저장 안 된 임시본"
              >
                임시 저장본 ({stored.length}자) 이어쓰기
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="article-comment-panel">
      <MarkdownView text={initial.bodyMd} />
      <div className="text-muted-foreground flex items-center justify-between gap-2 text-[11px]">
        <span>최근 갱신 {initial.updatedAt.slice(0, 10)}</span>
        {canEdit ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setDraft(initial.bodyMd);
                setEditing(true);
              }}
              className="text-primary hover:underline"
            >
              수정
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={submitting}
              className="hover:text-destructive"
              aria-label="코멘트 삭제"
            >
              <Trash2Icon className="size-3.5" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
