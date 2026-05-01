// 비전문가용 시각 편집기. 조문 본문을 block 단위 카드로 나눠 표시하고,
// 각 카드 안에서 텍스트를 직접 수정한다. 강조 종류는 마커로 round-trip:
//   __X__ 밑줄 / [X] 강사 강조 / ((X)) 인라인 소제목
// 텍스트 영역 위 toggle 버튼으로 선택영역을 wrap. 키보드 단축키도 동일 효과.
//
// header_refs 와 sub_article_group 은 read-only 카드로 표시 (JSON 모드에서 편집).
//
// preview 가 함께 보이므로 비전문가도 결과를 즉시 확인하면서 작성 가능.

import {
  BoldIcon,
  HighlighterIcon,
  LockIcon,
  TagIcon,
} from "lucide-react";
import { type ChangeEvent, useCallback, useMemo, useRef } from "react";

import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { cn } from "~/core/lib/utils";
import { ArticleBodyView } from "~/features/laws/components/article-body";
import {
  type EditableArticleBody,
  type EditableBlock,
  editableToBody,
} from "~/features/laws/lib/article-body-marker";

interface BlockEditorProps {
  value: EditableArticleBody;
  onChange: (next: EditableArticleBody) => void;
  // 변경 미리보기에 ref/title 칩 클릭 라우팅이 필요하면 lawCode/titleMap 을 전달.
  // (편집 중 미리보기는 상호작용 차단을 위해 pointer-events:none 으로 덮어 처리)
  previewLawCode?: import("~/features/subjects/lib/subjects").LawSubjectSlug;
  previewTitleMap?: Map<string, string>;
}

export function ArticleBlockEditor({
  value,
  onChange,
  previewLawCode,
  previewTitleMap,
}: BlockEditorProps) {
  const updateBlock = useCallback(
    (
      indexPath: number[],
      patch: Partial<Omit<EditableBlock, "kind" | "children">>,
    ) => {
      const next: EditableArticleBody = {
        blocks: value.blocks.map((b, i) =>
          i === indexPath[0]
            ? applyPatch(b, indexPath.slice(1), patch)
            : b,
        ),
      };
      onChange(next);
    },
    [value, onChange],
  );

  const previewBody = useMemo(() => {
    try {
      return editableToBody(value);
    } catch {
      return null;
    }
  }, [value]);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-2">
        <div className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
          편집
        </div>
        <div className="space-y-2">
          {value.blocks.map((b, i) => (
            <BlockCard
              key={i}
              block={b}
              indexPath={[i]}
              updateBlock={updateBlock}
            />
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <div className="text-muted-foreground sticky top-0 z-10 bg-background/95 py-1 text-[11px] font-semibold tracking-wide uppercase backdrop-blur">
          미리보기
        </div>
        <div className="bg-muted/30 rounded-md border p-3">
          {previewBody ? (
            <ArticleBodyView
              body={previewBody}
              titleMap={previewTitleMap ?? new Map()}
              subtitlesOnly={false}
              lawCode={previewLawCode ?? null}
            />
          ) : (
            <p className="text-muted-foreground text-sm">미리보기 생성 실패</p>
          )}
        </div>
      </div>
    </div>
  );
}

// indexPath 를 따라 children 재귀 진입해 patch 적용.
function applyPatch(
  block: EditableArticleBody["blocks"][number],
  rest: number[],
  patch: Partial<Omit<EditableBlock, "kind" | "children">>,
): EditableArticleBody["blocks"][number] {
  if (rest.length === 0) {
    if (block.kind === "frozen") return block;
    return { ...block, ...patch } as EditableBlock;
  }
  if (block.kind !== "clause" && block.kind !== "item" && block.kind !== "sub") {
    return block;
  }
  const [head, ...tail] = rest;
  return {
    ...block,
    children: block.children.map((c, i) =>
      i === head ? (applyPatch(c, tail, patch) as EditableBlock) : c,
    ),
  } as EditableBlock;
}

function BlockCard({
  block,
  indexPath,
  updateBlock,
}: {
  block: EditableArticleBody["blocks"][number];
  indexPath: number[];
  updateBlock: (
    indexPath: number[],
    patch: Partial<Omit<EditableBlock, "kind" | "children">>,
  ) => void;
}) {
  if (block.kind === "frozen") {
    return <FrozenCard block={block.block} />;
  }
  if (block.kind === "title_marker") {
    return (
      <Card className="py-3">
        <CardHeader className="pb-2">
          <Header label="편/장 표지" indexPath={indexPath} />
        </CardHeader>
        <CardContent className="space-y-2">
          <textarea
            value={block.text}
            onChange={(e) =>
              updateBlock(indexPath, { text: e.target.value })
            }
            rows={1}
            className="bg-background w-full resize-y rounded-md border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </CardContent>
      </Card>
    );
  }
  if (block.kind === "para") {
    return (
      <Card className="py-3">
        <CardHeader className="pb-2">
          <Header label="문단" indexPath={indexPath} />
        </CardHeader>
        <CardContent className="space-y-2">
          <MarkerTextarea
            value={block.marker}
            onChange={(v) => updateBlock(indexPath, { marker: v })}
          />
        </CardContent>
      </Card>
    );
  }
  // clause / item / sub
  const numericLabel =
    block.kind === "sub" ? `${block.letter}목` : block.label;
  const kindLabel =
    block.kind === "clause" ? "항" : block.kind === "item" ? "호" : "목";
  return (
    <Card className="py-3">
      <CardHeader className="pb-2">
        <Header label={`${kindLabel} · ${numericLabel}`} indexPath={indexPath} />
      </CardHeader>
      <CardContent className="space-y-2">
        <div>
          <label className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
            소제목 (선택)
          </label>
          <input
            type="text"
            value={block.subtitle}
            onChange={(e) =>
              updateBlock(indexPath, { subtitle: e.target.value })
            }
            placeholder="예: 특허요건"
            className="bg-background mt-1 w-full rounded-md border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <MarkerTextarea
          value={block.marker}
          onChange={(v) => updateBlock(indexPath, { marker: v })}
        />
        {block.children.length > 0 ? (
          <div className="ml-3 mt-2 border-l-2 pl-3">
            <p className="text-muted-foreground mb-2 text-[10px] font-semibold tracking-wide uppercase">
              자식 ({block.children.length})
            </p>
            <div className="space-y-2">
              {block.children.map((c, i) => (
                <BlockCard
                  key={i}
                  block={c}
                  indexPath={[...indexPath, i]}
                  updateBlock={updateBlock}
                />
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Header({
  label,
  indexPath,
}: {
  label: string;
  indexPath: number[];
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
        {label}
      </p>
      <span className="text-muted-foreground/70 font-mono text-[10px]">
        #{indexPath.join(".")}
      </span>
    </div>
  );
}

function FrozenCard({
  block,
}: {
  block: import("~/features/laws/lib/article-body").Block;
}) {
  const kindLabel =
    block.kind === "header_refs"
      ? "관련조문 헤더"
      : block.kind === "sub_article_group"
        ? "함께 공부할 조문"
        : block.kind;
  return (
    <Card className="border-amber-300/60 bg-amber-50/40 py-3 dark:border-amber-700/40 dark:bg-amber-950/20">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <p className="inline-flex items-center gap-1 text-[11px] font-semibold tracking-wide uppercase text-amber-900 dark:text-amber-200">
            <LockIcon className="size-3" /> {kindLabel} (read-only)
          </p>
          <span className="text-muted-foreground/70 font-mono text-[10px]">
            JSON 모드에서 편집
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-[11px] leading-relaxed">
          이 블록은 시각 편집기에서 직접 수정할 수 없습니다. 우상단의 "JSON
          모드" 버튼으로 전환해 수정하세요. 시각 편집기에서 저장하면 이 블록은
          원본 그대로 보존됩니다.
        </p>
      </CardContent>
    </Card>
  );
}

function MarkerTextarea({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const wrap = useCallback(
    (open: string, close: string) => {
      const el = ref.current;
      if (!el) return;
      const start = el.selectionStart ?? 0;
      const end = el.selectionEnd ?? start;
      const before = value.slice(0, start);
      const sel = value.slice(start, end);
      const after = value.slice(end);
      const inner = sel.length > 0 ? sel : "내용";
      const next = `${before}${open}${inner}${close}${after}`;
      onChange(next);
      // 선택 영역을 안쪽 텍스트에 맞춰 복원
      requestAnimationFrame(() => {
        if (!ref.current) return;
        const cursorStart = before.length + open.length;
        const cursorEnd = cursorStart + inner.length;
        ref.current.focus();
        ref.current.setSelectionRange(cursorStart, cursorEnd);
      });
    },
    [value, onChange],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "u" || e.key === "U") {
        e.preventDefault();
        wrap("__", "__");
      } else if (e.key === "b" || e.key === "B") {
        e.preventDefault();
        wrap("[", "]");
      } else if (e.key === "i" || e.key === "I") {
        e.preventDefault();
        wrap("((", "))");
      }
    },
    [wrap],
  );

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1">
        <ToolbarButton
          onClick={() => wrap("__", "__")}
          icon={<BoldIcon className="size-3" />}
          label="밑줄"
          shortcut="⌘U"
          tone="amber"
        />
        <ToolbarButton
          onClick={() => wrap("[", "]")}
          icon={<HighlighterIcon className="size-3" />}
          label="강조 라벨"
          shortcut="⌘B"
          tone="emerald"
        />
        <ToolbarButton
          onClick={() => wrap("((", "))")}
          icon={<TagIcon className="size-3" />}
          label="인라인 소제목"
          shortcut="⌘I"
          tone="primary"
        />
        <span className="text-muted-foreground/70 ml-2 text-[10px]">
          텍스트 선택 후 클릭 — 마커: <code>__밑줄__</code>{" "}
          <code>[강조]</code> <code>((소제목))</code>
        </span>
      </div>
      <textarea
        ref={ref}
        value={value}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        rows={Math.min(8, Math.max(2, Math.ceil(value.length / 60)))}
        spellCheck={false}
        className="bg-background w-full resize-y rounded-md border px-2 py-1.5 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
    </div>
  );
}

function ToolbarButton({
  onClick,
  icon,
  label,
  shortcut,
  tone,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  shortcut: string;
  tone: "amber" | "emerald" | "primary";
}) {
  const toneCls =
    tone === "amber"
      ? "hover:bg-amber-100 dark:hover:bg-amber-900/40"
      : tone === "emerald"
        ? "hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
        : "hover:bg-primary/10";
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${label} (${shortcut})`}
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded border px-1.5 text-[11px] transition-colors",
        toneCls,
      )}
    >
      {icon}
      <span>{label}</span>
      <span className="text-muted-foreground ml-0.5 text-[9px]">{shortcut}</span>
    </button>
  );
}
