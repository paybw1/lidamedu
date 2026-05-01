import {
  AlertCircleIcon,
  Code2Icon,
  CheckCircle2Icon,
  Loader2Icon,
  WandSparklesIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useFetcher, useRevalidator } from "react-router";

import { Button } from "~/core/components/ui/button";
import { cn } from "~/core/lib/utils";
import { ArticleBlockEditor } from "~/features/laws/components/article-block-editor";
import { articleBodySchema } from "~/features/laws/lib/article-body";
import {
  type EditableArticleBody,
  bodyToEditable,
  editableToBody,
} from "~/features/laws/lib/article-body-marker";
import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

interface ActionResponse {
  ok: boolean;
  error?: string;
  revisionId?: string;
}

type EditMode = "easy" | "json";

export function ArticleEditor({
  articleId,
  initialBodyJson,
  initialDisplayLabel,
  initialImportance,
  lawCode,
  titleMap,
  onCancel,
}: {
  articleId: string;
  initialBodyJson: unknown;
  initialDisplayLabel: string;
  initialImportance: number;
  lawCode: LawSubjectSlug;
  titleMap?: Map<string, string>;
  onCancel: () => void;
}) {
  const initialJson = useMemo(
    () => JSON.stringify(initialBodyJson ?? { blocks: [] }, null, 2),
    [initialBodyJson],
  );

  // 시각편집기 모드의 시작 상태 — initial body 를 EditableArticleBody 로 변환.
  // 변환 실패하면 (구조가 깨진 body 면) JSON 모드로 강제 전환.
  const initialEasy = useMemo<EditableArticleBody | null>(() => {
    try {
      const parsed = articleBodySchema.safeParse(initialBodyJson ?? { blocks: [] });
      if (!parsed.success) return null;
      return bodyToEditable(parsed.data);
    } catch {
      return null;
    }
  }, [initialBodyJson]);

  const [mode, setMode] = useState<EditMode>(initialEasy ? "easy" : "json");
  const [easy, setEasy] = useState<EditableArticleBody | null>(initialEasy);
  const [jsonText, setJsonText] = useState(initialJson);

  const [displayLabel, setDisplayLabel] = useState(initialDisplayLabel);
  const [importance, setImportance] = useState<number>(initialImportance);
  const fetcher = useFetcher<ActionResponse>();
  const revalidator = useRevalidator();
  const submitting = fetcher.state !== "idle";

  // 현재 모드 기준으로 저장 직전에 jsonText 를 결정. 시각편집기 변경분은 editableToBody → JSON 직렬화.
  const computedJsonText = useMemo(() => {
    if (mode === "easy" && easy) {
      try {
        return JSON.stringify(editableToBody(easy), null, 2);
      } catch {
        return jsonText;
      }
    }
    return jsonText;
  }, [mode, easy, jsonText]);

  const dirty =
    computedJsonText !== initialJson ||
    displayLabel !== initialDisplayLabel ||
    importance !== initialImportance;

  // 저장할 body_json (computedJsonText) 를 schema 로 검증.
  const validation = useMemo(() => {
    try {
      const parsed = JSON.parse(computedJsonText);
      const result = articleBodySchema.safeParse(parsed);
      if (!result.success) {
        return {
          ok: false as const,
          error: result.error.issues[0]?.message ?? "구조 오류",
        };
      }
      return { ok: true as const };
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : "JSON 오류",
      };
    }
  }, [computedJsonText]);

  // 저장 성공 시 article-viewer loader 를 재실행해 새 본문을 즉시 반영.
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) {
      revalidator.revalidate();
      onCancel();
    }
  }, [fetcher.state, fetcher.data, revalidator, onCancel]);

  const handleSave = () => {
    if (!validation.ok) return;
    const trimmedLabel = displayLabel.trim();
    if (trimmedLabel.length === 0) return;
    const fd = new FormData();
    fd.set("articleId", articleId);
    fd.set("bodyJson", computedJsonText);
    if (trimmedLabel !== initialDisplayLabel) {
      fd.set("displayLabel", trimmedLabel);
    }
    if (importance !== initialImportance) {
      fd.set("importance", String(importance));
    }
    fetcher.submit(fd, {
      method: "post",
      action: "/api/laws/admin-edit-article",
    });
  };

  // JSON 모드에서 시각편집기로 전환 — 현재 jsonText 를 parse 해 EditableArticleBody 재생성.
  // 실패하면 모드 전환 안 됨 + 에러 표시.
  const switchToEasy = () => {
    try {
      const parsed = articleBodySchema.safeParse(JSON.parse(jsonText));
      if (!parsed.success) return;
      setEasy(bodyToEditable(parsed.data));
      setMode("easy");
    } catch {
      // ignore — 사용자에게는 validation.error 로 이미 표시됨
    }
  };

  // 시각편집기에서 JSON 모드로 전환 — 현재 editable 을 직렬화해 jsonText 에 반영.
  const switchToJson = () => {
    if (easy) {
      try {
        setJsonText(JSON.stringify(editableToBody(easy), null, 2));
      } catch {
        // ignore — 변환 실패해도 기존 jsonText 유지
      }
    }
    setMode("json");
  };

  const serverError =
    fetcher.state === "idle" && fetcher.data && !fetcher.data.ok
      ? fetcher.data.error
      : null;

  const labelEmpty = displayLabel.trim().length === 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50/60 px-3 py-2 text-xs text-amber-900 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-200">
        <div>
          <p className="font-semibold">편집 모드 — 새 개정으로 저장됩니다</p>
          <p className="mt-0.5 leading-relaxed">
            저장하면 기존 본문은 보존되고 새로운 article_revision 이 생성됩니다
            (불변 정책).
          </p>
        </div>
        <div className="inline-flex overflow-hidden rounded-md border border-amber-400/40 bg-white text-[11px] dark:bg-amber-950/40">
          <button
            type="button"
            onClick={switchToEasy}
            disabled={submitting || initialEasy === null}
            className={cn(
              "inline-flex items-center gap-1 px-2 py-1",
              mode === "easy"
                ? "bg-amber-500 text-white"
                : "hover:bg-amber-100 dark:hover:bg-amber-900/40",
              initialEasy === null && "cursor-not-allowed opacity-50",
            )}
            title={
              initialEasy === null
                ? "본문 구조가 깨져 있어 JSON 모드에서만 편집 가능"
                : "쉬운 편집 — 카드별 텍스트 수정 + 마커 토글"
            }
          >
            <WandSparklesIcon className="size-3" />
            쉬운 편집
          </button>
          <button
            type="button"
            onClick={switchToJson}
            disabled={submitting}
            className={cn(
              "inline-flex items-center gap-1 px-2 py-1",
              mode === "json"
                ? "bg-amber-500 text-white"
                : "hover:bg-amber-100 dark:hover:bg-amber-900/40",
            )}
            title="JSON 직접 편집 (고급)"
          >
            <Code2Icon className="size-3" />
            JSON
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <label
            htmlFor="article-display-label"
            className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase"
          >
            조문 제목
          </label>
          <input
            id="article-display-label"
            type="text"
            value={displayLabel}
            onChange={(e) => setDisplayLabel(e.target.value)}
            disabled={submitting}
            className={cn(
              "bg-background mt-1 w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40",
              labelEmpty && "border-rose-400",
            )}
            placeholder="예: 제29조 특허요건"
          />
        </div>
        <div>
          <span className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
            중요도
          </span>
          <div className="mt-1 inline-flex overflow-hidden rounded-md border">
            {[1, 2, 3].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setImportance(n)}
                disabled={submitting}
                className={cn(
                  "px-3 py-1.5 text-xs transition-colors",
                  n === importance
                    ? "bg-amber-500 text-white"
                    : "bg-background hover:bg-muted",
                )}
                title={`★${n}`}
              >
                {"★".repeat(n)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {mode === "easy" && easy ? (
        <ArticleBlockEditor
          value={easy}
          onChange={setEasy}
          previewLawCode={lawCode}
          previewTitleMap={titleMap}
        />
      ) : (
        <div>
          <label
            htmlFor="article-body-json"
            className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase"
          >
            본문 (body_json)
          </label>
          <textarea
            id="article-body-json"
            spellCheck={false}
            className="bg-muted/30 font-mono mt-1 w-full min-h-[480px] resize-y rounded-md border p-3 text-[12px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/40"
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            disabled={submitting}
          />
          <p className="text-muted-foreground mt-1 text-[10px] leading-relaxed">
            형식: <code>{`{ "blocks": [...] }`}</code> — clause / item / sub /
            para / title_marker / sub_article_group / header_refs.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-h-[1.5rem] flex-wrap items-center gap-1.5 text-xs">
          {validation.ok ? (
            <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2Icon className="size-3.5" /> 구조 검증 통과
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-400">
              <AlertCircleIcon className="size-3.5" />
              {validation.error}
            </span>
          )}
          {labelEmpty ? (
            <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-400">
              <AlertCircleIcon className="size-3.5" />
              제목을 입력하세요
            </span>
          ) : null}
          {serverError ? (
            <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-400">
              <AlertCircleIcon className="size-3.5" />
              저장 실패: {serverError}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={submitting}
          >
            취소
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={!dirty || !validation.ok || labelEmpty || submitting}
            className="gap-1"
          >
            {submitting ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : null}
            새 개정으로 저장
          </Button>
        </div>
      </div>
    </div>
  );
}
