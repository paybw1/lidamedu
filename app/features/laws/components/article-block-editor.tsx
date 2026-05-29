// 비전문가용 시각 편집기. 조문 본문을 block 단위 카드로 나눠 표시하고,
// 각 카드 안에서 텍스트를 직접 수정한다. 강조 종류는 마커로 round-trip:
//   __X__ 밑줄 / [X] 강사 강조 / ((X)) 인라인 소제목
//
// 구조 편집: 각 목록(본문/자식/머리말/조문)에 항·호·목·문단 추가, 카드별 ↑↓ 이동·삭제.
// "함께 공부할 조문"(sub_article_group) 도 출처·조문(번호/제목)·본문을 직접 편집.
// header_refs 만 read-only (JSON 모드).
//
// preview 가 함께 보이므로 비전문가도 결과를 즉시 확인하면서 작성 가능.

import {
  BoldIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  HighlighterIcon,
  LockIcon,
  PlusIcon,
  TagIcon,
  Trash2Icon,
} from "lucide-react";
import { type ChangeEvent, useCallback, useMemo, useRef } from "react";

import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { cn } from "~/core/lib/utils";
import { ArticleBodyView } from "~/features/laws/components/article-body";
import {
  type EditableArticleBody,
  type EditorBlock,
  type SubGroupArticleEditable,
  type SubGroupEditable,
  editableToBody,
} from "~/features/laws/lib/article-body-marker";

interface BlockEditorProps {
  value: EditableArticleBody;
  onChange: (next: EditableArticleBody) => void;
  previewLawCode?: import("~/features/subjects/lib/subjects").LawSubjectSlug;
  previewTitleMap?: Map<string, string>;
}

type AddableKind = "clause" | "item" | "sub" | "para";

// ── 라벨 생성 ─────────────────────────────────────────────────────────────
const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
const KO_LETTERS = "가나다라마바사아자차카타파하거너더러머버서어저처커터퍼허";

function clauseLabel(n: number): string {
  return n >= 1 && n <= CIRCLED.length ? CIRCLED[n - 1] : `(${n})`;
}
function subLetter(idx0: number): string {
  return idx0 < KO_LETTERS.length ? KO_LETTERS[idx0] : `(${idx0 + 1})`;
}

// 같은 목록(siblings) 기준으로 다음 번호를 매겨 새 블록 생성.
function makeBlock(kind: AddableKind, siblings: EditorBlock[]): EditorBlock {
  if (kind === "para") return { kind: "para", marker: "" };
  if (kind === "clause") {
    const n = siblings.filter((b) => b.kind === "clause").length + 1;
    return {
      kind: "clause",
      number: n,
      label: clauseLabel(n),
      subtitle: "",
      marker: "",
      children: [],
    };
  }
  if (kind === "item") {
    const n = siblings.filter((b) => b.kind === "item").length + 1;
    return {
      kind: "item",
      number: n,
      label: `${n}.`,
      subtitle: "",
      marker: "",
      children: [],
    };
  }
  const idx0 = siblings.filter((b) => b.kind === "sub").length;
  const letter = subLetter(idx0);
  return {
    kind: "sub",
    letter,
    label: `${letter}.`,
    subtitle: "",
    marker: "",
    children: [],
  };
}

// 불변 리스트 헬퍼.
function replaceAt<T>(list: T[], index: number, next: T): T[] {
  return list.map((x, i) => (i === index ? next : x));
}
function removeAt<T>(list: T[], index: number): T[] {
  return list.filter((_, i) => i !== index);
}
function moveItem<T>(list: T[], index: number, dir: -1 | 1): T[] {
  const j = index + dir;
  if (j < 0 || j >= list.length) return list;
  const next = list.slice();
  [next[index], next[j]] = [next[j], next[index]];
  return next;
}

export function ArticleBlockEditor({
  value,
  onChange,
  previewLawCode,
  previewTitleMap,
}: BlockEditorProps) {
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
        <BlockList
          blocks={value.blocks}
          onChange={(blocks) => onChange({ blocks })}
        />
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

// 블록 목록 — 추가/삭제/이동을 담당. 카드 안 children/preface/조문본문에 재귀 사용.
function BlockList({
  blocks,
  onChange,
}: {
  blocks: EditorBlock[];
  onChange: (next: EditorBlock[]) => void;
}) {
  return (
    <div className="space-y-2">
      {blocks.map((b, i) => (
        <BlockCard
          key={i}
          block={b}
          onChange={(nb) => onChange(replaceAt(blocks, i, nb))}
          controls={
            <CardControls
              canUp={i > 0}
              canDown={i < blocks.length - 1}
              onUp={() => onChange(moveItem(blocks, i, -1))}
              onDown={() => onChange(moveItem(blocks, i, 1))}
              onDelete={() => onChange(removeAt(blocks, i))}
            />
          }
        />
      ))}
      <AddRow onAdd={(kind) => onChange([...blocks, makeBlock(kind, blocks)])} />
    </div>
  );
}

function BlockCard({
  block,
  onChange,
  controls,
}: {
  block: EditorBlock;
  onChange: (next: EditorBlock) => void;
  controls?: React.ReactNode;
}) {
  if (block.kind === "frozen") {
    return <FrozenCard block={block.block} controls={controls} />;
  }
  if (block.kind === "sub_group") {
    return (
      <SubGroupCard block={block} onChange={onChange} controls={controls} />
    );
  }
  if (block.kind === "title_marker") {
    return (
      <Card className="py-3">
        <CardHeader className="pb-2">
          <Header label="편/장 표지" controls={controls} />
        </CardHeader>
        <CardContent className="space-y-2">
          <textarea
            value={block.text}
            onChange={(e) => onChange({ ...block, text: e.target.value })}
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
          <Header label="문단" controls={controls} />
        </CardHeader>
        <CardContent className="space-y-2">
          <MarkerTextarea
            value={block.marker}
            onChange={(v) => onChange({ ...block, marker: v })}
          />
        </CardContent>
      </Card>
    );
  }
  // clause / item / sub
  const kindLabel =
    block.kind === "clause" ? "항" : block.kind === "item" ? "호" : "목";
  return (
    <Card className="py-3">
      <CardHeader className="pb-2">
        <Header label={kindLabel} controls={controls} />
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex gap-2">
          <div className="w-24 shrink-0">
            <label className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
              번호 표기
            </label>
            <input
              type="text"
              value={block.label}
              onChange={(e) => onChange({ ...block, label: e.target.value })}
              placeholder={block.kind === "clause" ? "①" : "1."}
              className="bg-background mt-1 w-full rounded-md border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div className="min-w-0 flex-1">
            <label className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
              소제목 (선택)
            </label>
            <input
              type="text"
              value={block.subtitle}
              onChange={(e) => onChange({ ...block, subtitle: e.target.value })}
              placeholder="예: 특허요건"
              className="bg-background mt-1 w-full rounded-md border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        </div>
        <MarkerTextarea
          value={block.marker}
          onChange={(v) => onChange({ ...block, marker: v })}
        />
        <div className="ml-3 mt-1 border-l-2 pl-3">
          <p className="text-muted-foreground mb-1 text-[10px] font-semibold tracking-wide uppercase">
            하위 ({block.children.length})
          </p>
          <BlockList
            blocks={block.children}
            onChange={(children) => onChange({ ...block, children })}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// "함께 공부할 조문" — 출처 + (선택)머리말 + 각 조문(번호/제목 + 본문) 편집.
function SubGroupCard({
  block,
  onChange,
  controls,
}: {
  block: SubGroupEditable;
  onChange: (next: EditorBlock) => void;
  controls?: React.ReactNode;
}) {
  const updateArticle = (
    ai: number,
    next: SubGroupArticleEditable,
  ) => onChange({ ...block, articles: replaceAt(block.articles, ai, next) });

  const addArticle = () => {
    const lastNum = block.articles.at(-1)?.number ?? 1;
    onChange({
      ...block,
      articles: [
        ...block.articles,
        { number: lastNum, branch: null, title: "", blocks: [] },
      ],
    });
  };

  return (
    <Card className="border-amber-300/60 bg-amber-50/30 py-3 dark:border-amber-700/40 dark:bg-amber-950/15">
      <CardHeader className="pb-2">
        <Header label="함께 공부할 조문" controls={controls} tone="amber" />
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <label className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
            출처
          </label>
          <input
            type="text"
            value={block.source}
            onChange={(e) => onChange({ ...block, source: e.target.value })}
            placeholder="예: 시행규칙 제38조, 제40조-제40조의3"
            className="bg-background mt-1 w-full rounded-md border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        {block.preface.length > 0 ? (
          <div>
            <p className="text-muted-foreground mb-1 text-[10px] font-semibold tracking-wide uppercase">
              머리말
            </p>
            <BlockList
              blocks={block.preface}
              onChange={(preface) => onChange({ ...block, preface })}
            />
          </div>
        ) : null}

        <div className="space-y-3">
          {block.articles.map((a, ai) => (
            <div
              key={ai}
              className="rounded-md border border-amber-200/70 bg-background/60 p-2.5 dark:border-amber-800/40"
            >
              <div className="mb-2 flex items-end gap-2">
                <div className="w-16 shrink-0">
                  <label className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
                    조
                  </label>
                  <input
                    type="number"
                    value={a.number}
                    min={1}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      if (Number.isFinite(n) && n > 0)
                        updateArticle(ai, { ...a, number: n });
                    }}
                    className="bg-background mt-1 w-full rounded-md border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
                <div className="w-16 shrink-0">
                  <label className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
                    의(가지)
                  </label>
                  <input
                    type="number"
                    value={a.branch ?? ""}
                    min={1}
                    placeholder="—"
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      const n = v === "" ? null : parseInt(v, 10);
                      updateArticle(ai, {
                        ...a,
                        branch: n != null && Number.isFinite(n) && n > 0 ? n : null,
                      });
                    }}
                    className="bg-background mt-1 w-full rounded-md border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <label className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
                    조문 제목
                  </label>
                  <input
                    type="text"
                    value={a.title}
                    onChange={(e) =>
                      updateArticle(ai, { ...a, title: e.target.value })
                    }
                    className="bg-background mt-1 w-full rounded-md border px-2 py-1 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
                <CardControls
                  canUp={ai > 0}
                  canDown={ai < block.articles.length - 1}
                  onUp={() =>
                    onChange({
                      ...block,
                      articles: moveItem(block.articles, ai, -1),
                    })
                  }
                  onDown={() =>
                    onChange({
                      ...block,
                      articles: moveItem(block.articles, ai, 1),
                    })
                  }
                  onDelete={() =>
                    onChange({
                      ...block,
                      articles: removeAt(block.articles, ai),
                    })
                  }
                  deleteLabel="조문 삭제"
                />
              </div>
              <BlockList
                blocks={a.blocks}
                onChange={(b) => updateArticle(ai, { ...a, blocks: b })}
              />
            </div>
          ))}
          <button
            type="button"
            onClick={addArticle}
            className="inline-flex h-7 items-center gap-1 rounded border border-dashed border-amber-400/70 px-2 text-[11px] text-amber-800 transition-colors hover:bg-amber-100/60 dark:text-amber-200 dark:hover:bg-amber-900/30"
          >
            <PlusIcon className="size-3" /> 조문 추가
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

const ADD_LABELS: Record<AddableKind, string> = {
  clause: "항",
  item: "호",
  sub: "목",
  para: "문단",
};

function AddRow({ onAdd }: { onAdd: (kind: AddableKind) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1 pt-0.5">
      {(["clause", "item", "sub", "para"] as AddableKind[]).map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onAdd(k)}
          className="inline-flex h-6 items-center gap-1 rounded border border-dashed px-2 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <PlusIcon className="size-3" /> {ADD_LABELS[k]}
        </button>
      ))}
    </div>
  );
}

function CardControls({
  canUp,
  canDown,
  onUp,
  onDown,
  onDelete,
  deleteLabel = "이 블록 삭제",
}: {
  canUp: boolean;
  canDown: boolean;
  onUp: () => void;
  onDown: () => void;
  onDelete: () => void;
  deleteLabel?: string;
}) {
  const btn =
    "inline-flex size-6 items-center justify-center rounded border transition-colors disabled:opacity-30 disabled:pointer-events-none hover:bg-muted";
  return (
    <div className="flex items-center gap-0.5">
      <button type="button" className={btn} onClick={onUp} disabled={!canUp} title="위로" aria-label="위로">
        <ChevronUpIcon className="size-3" />
      </button>
      <button type="button" className={btn} onClick={onDown} disabled={!canDown} title="아래로" aria-label="아래로">
        <ChevronDownIcon className="size-3" />
      </button>
      <button
        type="button"
        className={cn(btn, "text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/20")}
        onClick={() => {
          if (confirm(`${deleteLabel}?`)) onDelete();
        }}
        title={deleteLabel}
        aria-label={deleteLabel}
      >
        <Trash2Icon className="size-3" />
      </button>
    </div>
  );
}

function Header({
  label,
  controls,
  tone,
}: {
  label: string;
  controls?: React.ReactNode;
  tone?: "amber";
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <p
        className={cn(
          "text-[11px] font-semibold tracking-wide uppercase",
          tone === "amber"
            ? "text-amber-900 dark:text-amber-200"
            : "text-muted-foreground",
        )}
      >
        {label}
      </p>
      {controls}
    </div>
  );
}

function FrozenCard({
  block,
  controls,
}: {
  block: import("~/features/laws/lib/article-body").Block;
  controls?: React.ReactNode;
}) {
  const kindLabel =
    block.kind === "header_refs" ? "관련조문 헤더" : block.kind;
  return (
    <Card className="border-amber-300/60 bg-amber-50/40 py-3 dark:border-amber-700/40 dark:bg-amber-950/20">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <p className="inline-flex items-center gap-1 text-[11px] font-semibold tracking-wide uppercase text-amber-900 dark:text-amber-200">
            <LockIcon className="size-3" /> {kindLabel} (read-only)
          </p>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground/70 font-mono text-[10px]">
              JSON 모드에서 편집
            </span>
            {controls}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-[11px] leading-relaxed">
          이 블록은 시각 편집기에서 내용을 직접 수정할 수 없습니다 (위치 이동·삭제는
          가능). 내용 수정은 "JSON 모드" 버튼으로 전환해 진행하세요.
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
