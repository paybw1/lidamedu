// 공통 — 학생 백지 작성 단계 (autosave + submit).
// props 로 action URL + hidden fields 주입 → gs·cases 모두 동일 흐름.
// 모범 쟁점/원문은 이 컴포넌트가 만지지 않음(상위에서 phase 분기 후 렌더).

import { PencilLineIcon, SendIcon } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useFetcher, useRevalidator } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Textarea } from "~/core/components/ui/textarea";

interface WriteStageProps {
  /** 초안 (autosave 복원). 신규면 빈 문자열. */
  initialDraft: string;
  /** Action URL — autosave/submit 공용. */
  actionUrl: string;
  /** form intent 값 (도메인이 다르면 다르게). 기본 'autosave' / 'submit'. */
  autosaveIntent?: string;
  submitIntent?: string;
  /** form 에 hidden 으로 함께 전송할 키-값. 예: { gsQuestionId } 또는 { itemId }. */
  hiddenFields: Record<string, string>;
  /** textarea name. GS 는 studentIssuesMd 사용. */
  draftFieldName?: string;
  /** 안내 텍스트 (예: "한 줄에 한 쟁점"). */
  hint?: ReactNode;
  /** Textarea placeholder. */
  placeholder?: string;
}

export function WriteStage({
  initialDraft,
  actionUrl,
  autosaveIntent = "autosave",
  submitIntent = "submit",
  hiddenFields,
  draftFieldName = "studentIssuesMd",
  hint,
  placeholder,
}: WriteStageProps) {
  const [text, setText] = useState(initialDraft);
  const autoFetcher = useFetcher<{ ok?: true; error?: string }>();
  const submitFetcher = useFetcher<{ ok?: true; error?: string }>();
  const revalidator = useRevalidator();
  const lastSavedRef = useRef(text);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 제출 성공 → revalidate (phase 전환).
  useEffect(() => {
    if (
      submitFetcher.state === "idle" &&
      submitFetcher.data &&
      "ok" in submitFetcher.data &&
      submitFetcher.data.ok
    ) {
      revalidator.revalidate();
    }
  }, [submitFetcher.state, submitFetcher.data, revalidator]);

  // autosave debounce 700ms.
  useEffect(() => {
    if (text === lastSavedRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const fd = new FormData();
      fd.set("intent", autosaveIntent);
      for (const [k, v] of Object.entries(hiddenFields)) fd.set(k, v);
      fd.set(draftFieldName, text);
      autoFetcher.submit(fd, { method: "post", action: actionUrl });
      lastSavedRef.current = text;
    }, 700);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const lineCount = useMemo(
    () => text.split(/\r?\n/).filter((l) => l.trim().length > 0).length,
    [text],
  );

  const submit = () => {
    if (text.trim().length < 2) {
      alert("최소 한 줄은 작성해주세요.");
      return;
    }
    if (
      !confirm(
        "제출 후에는 모범 쟁점이 공개되고 자기채점 단계로 넘어갑니다. 제출하시겠습니까?",
      )
    )
      return;
    const fd = new FormData();
    fd.set("intent", submitIntent);
    for (const [k, v] of Object.entries(hiddenFields)) fd.set(k, v);
    fd.set(draftFieldName, text);
    submitFetcher.submit(fd, { method: "post", action: actionUrl });
  };

  return (
    <section className="space-y-3">
      <div className="border-primary/20 bg-primary/[0.04] flex items-start gap-2 rounded-2xl border p-3 text-xs leading-relaxed">
        <PencilLineIcon className="text-link mt-0.5 size-4 shrink-0" />
        <p className="text-foreground">
          {hint ?? (
            <>
              <strong>한 줄에 한 쟁점</strong>씩 적는 걸 권장합니다 (자유 형식도
              OK). 모범답안은 제출 전에 절대 보지 마세요.
            </>
          )}
        </p>
      </div>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="min-h-[200px] text-sm leading-relaxed"
        placeholder={placeholder}
        autoFocus
      />
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-muted-foreground text-xs">
          줄 수:{" "}
          <strong className="text-foreground tabular-nums">{lineCount}</strong>
        </span>
        <span className="text-muted-foreground text-[11px]">
          {autoFetcher.state !== "idle"
            ? "저장 중…"
            : text === lastSavedRef.current
              ? "자동 저장됨"
              : "변경 — 곧 저장"}
        </span>
        <Button
          type="button"
          onClick={submit}
          className="ml-auto rounded-full"
          disabled={submitFetcher.state !== "idle" || text.trim().length < 2}
        >
          <SendIcon className="size-4" /> 제출 → 모범 쟁점 보기
        </Button>
      </div>
    </section>
  );
}
