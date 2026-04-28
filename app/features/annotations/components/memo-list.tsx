import { Trash2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Textarea } from "~/core/components/ui/textarea";

import type {
  AnnotationTargetType,
  MemoRecord,
} from "../labels";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MemoList({
  targetType,
  targetId,
  initial,
}: {
  targetType: AnnotationTargetType;
  targetId: string;
  initial: MemoRecord[];
}) {
  const createFetcher = useFetcher();
  const deleteFetcher = useFetcher();
  const [draft, setDraft] = useState("");
  const draftRef = useRef<HTMLTextAreaElement>(null);

  // 액션 성공 후 입력창 비우기
  useEffect(() => {
    if (createFetcher.state === "idle" && createFetcher.data?.ok) {
      setDraft("");
      draftRef.current?.blur();
    }
  }, [createFetcher.state, createFetcher.data]);

  const isCreating = createFetcher.state !== "idle";

  // 낙관적 업데이트: 진행 중인 새 메모를 리스트 상단에 미리 표시
  const optimisticNew =
    createFetcher.formData && createFetcher.formData.get("intent") === "create"
      ? {
          memoId: "pending",
          bodyMd: String(createFetcher.formData.get("bodyMd") ?? ""),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      : null;

  // 삭제 진행 중인 memoId 는 리스트에서 숨기기
  const deletingId =
    deleteFetcher.formData && deleteFetcher.formData.get("intent") === "delete"
      ? String(deleteFetcher.formData.get("memoId"))
      : null;

  const memos = [
    ...(optimisticNew ? [optimisticNew] : []),
    ...initial.filter((m) => m.memoId !== deletingId),
  ];

  return (
    <div className="space-y-3">
      <createFetcher.Form
        method="post"
        action="/api/annotations/memo"
        onSubmit={(e) => {
          if (!draft.trim()) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="intent" value="create" />
        <input type="hidden" name="targetType" value={targetType} />
        <input type="hidden" name="targetId" value={targetId} />
        <Textarea
          ref={draftRef}
          name="bodyMd"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="이 항목에 대한 메모를 입력하세요"
          rows={3}
          className="text-sm"
        />
        <div className="mt-2 flex justify-end">
          <Button
            type="submit"
            size="sm"
            disabled={isCreating || !draft.trim()}
          >
            메모 추가
          </Button>
        </div>
      </createFetcher.Form>

      {memos.length === 0 ? (
        <p className="text-muted-foreground text-xs">아직 메모가 없습니다.</p>
      ) : (
        <ul className="space-y-2">
          {memos.map((m) => (
            <li
              key={m.memoId}
              className="bg-muted/40 group relative rounded-md border p-2.5"
            >
              <p className="text-sm whitespace-pre-line">{m.bodyMd}</p>
              <div className="mt-1.5 flex items-center justify-between">
                <span className="text-muted-foreground text-[11px] tabular-nums">
                  {formatDate(m.createdAt)}
                </span>
                {m.memoId === "pending" ? (
                  <span className="text-muted-foreground text-[11px]">
                    저장 중…
                  </span>
                ) : (
                  <deleteFetcher.Form
                    method="post"
                    action="/api/annotations/memo"
                  >
                    <input type="hidden" name="intent" value="delete" />
                    <input type="hidden" name="memoId" value={m.memoId} />
                    <button
                      type="submit"
                      aria-label="메모 삭제"
                      className="text-muted-foreground hover:text-destructive opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <Trash2Icon className="size-3.5" />
                    </button>
                  </deleteFetcher.Form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
