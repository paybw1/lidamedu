import { ChevronRightIcon, ScrollIcon } from "lucide-react";
import {
  createContext,
  Fragment,
  type ReactNode,
  useContext,
  useState,
} from "react";
import { Link } from "react-router";

import { cn } from "~/core/lib/utils";
import { useBlanksRender } from "~/features/blanks/components/blanks-context";
import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

import type {
  ArticleBody,
  Block,
  Inline,
  SubArticleEntry,
} from "../lib/article-body";

interface ArticleBodyContext {
  titleMap: Map<string, string>;
  subtitlesOnly: boolean;
  lawCode: LawSubjectSlug | null;
  insideSubArticle: boolean;
  // 관련조문 영역에서는 chip 색을 다르게 (소제목과 구분)
  refTone: "primary" | "indigo";
}

const Ctx = createContext<ArticleBodyContext>({
  titleMap: new Map(),
  subtitlesOnly: false,
  lawCode: null,
  insideSubArticle: false,
  refTone: "primary",
});

export function ArticleBodyView({
  body,
  titleMap,
  subtitlesOnly = false,
  lawCode = null,
}: {
  body: ArticleBody;
  titleMap?: Map<string, string>;
  subtitlesOnly?: boolean;
  lawCode?: LawSubjectSlug | null;
}) {
  if (body.blocks.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">본문이 비어 있습니다.</p>
    );
  }
  return (
    <Ctx.Provider
      value={{
        titleMap: titleMap ?? new Map(),
        subtitlesOnly,
        lawCode,
        insideSubArticle: false,
        refTone: "primary",
      }}
    >
      <div className="space-y-3 text-[15px] leading-relaxed">
        {body.blocks.map((b, i) => (
          <BlockView key={i} block={b} depth={0} />
        ))}
      </div>
    </Ctx.Provider>
  );
}

function BlockView({ block, depth }: { block: Block; depth: number }) {
  switch (block.kind) {
    case "para": {
      const { main, tail } = splitTrailingRefs(block.inline);
      return (
        <>
          {main.length > 0 ? (
            <p>
              <InlineRun inline={main} />
            </p>
          ) : null}
          {tail.length > 0 ? (
            <div className="pl-6">
              <RefsCollapsible refs={tail} />
            </div>
          ) : null}
        </>
      );
    }
    case "title_marker":
      return (
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          {block.text}
        </p>
      );
    case "clause":
      return (
        <LabeledBlock
          label={block.label}
          subtitle={block.subtitle ?? null}
          inline={block.inline}
          children={block.children}
          depth={depth}
          id={`clause-${block.number}`}
          labelClass="text-primary mr-1.5 font-semibold"
        />
      );
    case "item":
      return (
        <LabeledBlock
          label={block.label}
          subtitle={block.subtitle ?? null}
          inline={block.inline}
          children={block.children}
          depth={depth}
          id={`item-${block.number}`}
          labelClass="text-muted-foreground mr-1.5 font-medium tabular-nums"
        />
      );
    case "sub":
      return (
        <LabeledBlock
          label={block.label}
          subtitle={block.subtitle ?? null}
          inline={block.inline}
          children={block.children}
          depth={depth}
          id={`sub-${block.letter}`}
          labelClass="text-muted-foreground mr-1.5"
        />
      );
    case "sub_article_group":
      return <SubArticleGroup block={block} />;
    case "header_refs":
      return <HeaderRefs block={block} />;
  }
}

function HeaderRefs({
  block,
}: {
  block: Extract<Block, { kind: "header_refs" }>;
}) {
  return <RefsCollapsible refs={block.refs} />;
}

function RefsCollapsible({
  refs,
  className,
}: {
  refs: Inline[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const refCount = refs.filter((r) => r.type === "ref_article").length;
  if (refCount === 0) return null;
  return (
    <aside
      className={cn(
        "overflow-hidden rounded-md border-l-4 border-indigo-500/60 bg-indigo-50/40 dark:border-indigo-400/60 dark:bg-indigo-900/20",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="hover:bg-indigo-500/10 flex w-full items-center gap-1.5 px-3 py-1.5 text-left transition-colors"
      >
        <ChevronRightIcon
          className={cn(
            "size-3.5 shrink-0 text-indigo-700 transition-transform dark:text-indigo-300",
            open && "rotate-90",
          )}
        />
        <span className="flex-1 text-[11px] font-semibold tracking-wide text-indigo-900 uppercase dark:text-indigo-200">
          관련 조문
        </span>
        <span className="text-[11px] tabular-nums text-indigo-700/80 dark:text-indigo-300/80">
          {refCount}건
        </span>
      </button>
      {open ? (
        <Ctx.Provider value={{ ...useContext(Ctx), refTone: "indigo" }}>
          <div className="flex flex-wrap items-center gap-1.5 border-t border-indigo-500/20 px-3 py-2 dark:border-indigo-400/20">
            <InlineRun inline={refs} />
          </div>
        </Ctx.Provider>
      ) : null}
    </aside>
  );
}

// inline 마지막에 연속 위치한 ref_article (사이의 콤마/슬래시/공백 separator 텍스트 포함) 을
// 본문에서 분리해 RefsCollapsible 로 토글 표시할 수 있게 한다.
// amendment_note 가 trailing 에 끼어 있어도 ref 추출을 막지 않고, amendment_note 는 main 에 보존한다.
function splitTrailingRefs(inline: Inline[]): {
  main: Inline[];
  tail: Inline[];
} {
  const work = [...inline];
  const tail: Inline[] = [];
  const heldAmendments: Inline[] = [];
  while (work.length > 0) {
    const last = work[work.length - 1];
    if (last.type === "ref_article") {
      tail.unshift(work.pop()!);
      continue;
    }
    if (last.type === "text" && /^[\s,/.·]*$/.test(last.text)) {
      tail.unshift(work.pop()!);
      continue;
    }
    if (last.type === "amendment_note") {
      heldAmendments.unshift(work.pop()!);
      continue;
    }
    break;
  }
  if (!tail.some((t) => t.type === "ref_article")) {
    return { main: inline, tail: [] };
  }
  return { main: [...work, ...heldAmendments], tail };
}

function LabeledBlock({
  label,
  subtitle,
  inline,
  children,
  depth,
  id,
  labelClass,
}: {
  label: string;
  subtitle: string | null;
  inline: Inline[];
  children: Block[];
  depth: number;
  id: string;
  labelClass: string;
}) {
  const { subtitlesOnly } = useContext(Ctx);
  // 소제목만 보기 모드일 때도 본문 중간의 inline subtitle 토큰은 보이도록 필터
  const baseInline = subtitlesOnly
    ? inline.filter((t) => t.type === "subtitle")
    : inline;
  // 끝에 붙은 관련조문 ref tail 분리 — 토글 박스로 표시
  const { main: visibleInline, tail: tailRefs } = subtitlesOnly
    ? { main: baseInline, tail: [] as Inline[] }
    : splitTrailingRefs(baseInline);
  return (
    <div style={{ paddingLeft: `${depth * 16}px` }} id={id}>
      <p>
        <span className={labelClass}>{label}</span>
        {subtitle ? (
          <span className="bg-primary/10 text-primary mr-1.5 rounded px-1.5 py-0.5 text-xs font-semibold">
            ({subtitle})
          </span>
        ) : null}
        {visibleInline.length > 0 ? <InlineRun inline={visibleInline} /> : null}
      </p>
      {tailRefs.length > 0 ? (
        <div className="pl-6">
          <RefsCollapsible refs={tailRefs} />
        </div>
      ) : null}
      {children.length > 0 ? (
        <div className="mt-2 space-y-2 pl-4">
          {children.map((c, i) => (
            <BlockView key={i} block={c} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SubArticleGroup({
  block,
}: {
  block: Extract<Block, { kind: "sub_article_group" }>;
}) {
  const [open, setOpen] = useState(false);
  const articleCount = block.articles.length;
  const ctx = useContext(Ctx);

  return (
    <aside className="bg-muted/40 my-2 overflow-hidden rounded-md border-l-4 border-emerald-500/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="hover:bg-muted/60 flex w-full items-center gap-1.5 p-3 text-left transition-colors"
      >
        <ChevronRightIcon
          className={cn(
            "size-3.5 shrink-0 text-emerald-700 transition-transform dark:text-emerald-400",
            open && "rotate-90",
          )}
        />
        <ScrollIcon className="size-3.5 shrink-0 text-emerald-700 dark:text-emerald-400" />
        <p className="flex-1 text-xs font-semibold tracking-wide text-emerald-900 dark:text-emerald-200">
          함께 공부할 조문 — {block.source}
        </p>
        <span className="text-emerald-700/80 text-[11px] tabular-nums dark:text-emerald-300/80">
          {articleCount}개
        </span>
      </button>
      {open ? (
        <div className="space-y-3 px-3 pb-3">
          {block.preface && block.preface.length > 0 ? (
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-200/60 px-3 py-2 text-[13px] leading-relaxed dark:border-amber-700/40">
              <p className="text-muted-foreground mb-1 text-[10px] font-semibold tracking-wide uppercase">
                코멘트
              </p>
              {/* 코멘트(구특허법/구시행령 박스 등 강사 산문)에서는 자동 링크 비활성 */}
              <Ctx.Provider value={{ ...ctx, insideSubArticle: true }}>
                {block.preface.map((b, i) => (
                  <BlockView key={i} block={b} depth={0} />
                ))}
              </Ctx.Provider>
            </div>
          ) : null}
          {block.articles.map((sa, i) => (
            <SubArticleView key={i} entry={sa} />
          ))}
        </div>
      ) : null}
    </aside>
  );
}

function SubArticleView({ entry }: { entry: SubArticleEntry }) {
  const ctx = useContext(Ctx);
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-semibold">
        제{entry.number}조{entry.branch ? `의${entry.branch}` : ""} (
        {entry.title})
      </p>
      {!ctx.subtitlesOnly ? (
        <Ctx.Provider value={{ ...ctx, insideSubArticle: true }}>
          <div className="space-y-1.5 text-[14px] leading-relaxed">
            {entry.blocks.map((b, i) => (
              <BlockView key={i} block={b} depth={0} />
            ))}
          </div>
        </Ctx.Provider>
      ) : null}
    </div>
  );
}

// 외부법 컨텍스트 검사용 — 마지막 문장 종결(.|。|;) 이후의 부분만 유지 (외부법 컨텍스트가 다음 문장으로 이어지지 않게).
// 문장 종결이 없으면 최대 200자 유지.
function tailText(s: string): string {
  const lastEnd = Math.max(
    s.lastIndexOf("."),
    s.lastIndexOf("。"),
    s.lastIndexOf(";"),
  );
  if (lastEnd >= 0) return s.slice(lastEnd + 1);
  return s.length <= 200 ? s : s.slice(s.length - 200);
}

function InlineRun({ inline }: { inline: Inline[] }) {
  // 각 node 의 직후 text/underline 토큰들 prefix (최대 100자) — 라벨 lookahead 용
  const nextPrefixes = inline.map((_, i) => {
    let s = "";
    for (let j = i + 1; j < inline.length && s.length < 100; j++) {
      const t = inline[j];
      if (t.type === "text" || t.type === "underline") s += t.text;
      else break;
    }
    return s.slice(0, 100);
  });

  // 직전 텍스트성 토큰의 끝부분 (text/underline 만 누적)
  let prevSuffix = "";
  return (
    <>
      {inline.map((node, i) => {
        const carry = prevSuffix;
        if (node.type === "text" || node.type === "underline") {
          prevSuffix = tailText(prevSuffix + node.text);
        } else {
          // 비-텍스트 토큰은 reset (단독 chip 들 사이 prefix 영향 차단)
          prevSuffix = "";
        }
        return (
          <InlineNode
            key={i}
            node={node}
            prevSuffix={carry}
            nextPrefix={nextPrefixes[i]}
          />
        );
      })}
    </>
  );
}

// 한국어 본문 ref 패턴: 가지조는 "제N조의M" (의가 조 뒤). 항/호/목은 그 뒤에 옴.
//   "제55조제1항", "제132조의7", "제29조의2제2항", "제29조제1항제2호 가목"
//   "제187조 단서" → 단서/본문/전단/후단 suffix 도 link 에 포함 (네비게이션 타깃은 동일)
const KOREAN_REF_RE =
  /제(\d+)조(?:의(\d+))?(?:\s*제(\d+)항)?(?:\s*제(\d+)호)?(?:\s*([가-하])목)?(?:\s*(전단|후단|단서|본문))?/g;
// 가까운 직전 ref 의 article 컨텍스트를 이어받는 단독 항/호/목 ref:
//   "제138조제1항 또는 제3항" → 두번째 "제3항" 은 제138조 의 ③
//   "제42조제1항제2호 또는 제3호" → 두번째 "제3호" 는 제42조 ① 의 호 (article+clause 이어받음)
//   "제186조제1항에 따른 소 또는 같은 조 제8항" → 같은 조 ⇒ 제186조 의 ⑧
//   "제84조제1항제2호·제6호" → "제6호" 는 제84조 ① 의 ⑥호 (article+clause 이어받음)
// 연결자 (또는|및|·|ㆍ|,|같은 조) 뒤에 등장한 단독 ref 매칭.
// 두 모드:
//   (a) 제K항[제M호][가목] — article 만 prev 에서 이어받음. m[1]=clause, m[2]=item, m[3]=sub
//   (b) 제K호[가목]       — article + clause 둘 다 prev 에서 이어받음. m[4]=item, m[5]=sub
const STANDALONE_REF_RE =
  /(?:또는|및|·|ㆍ|,|같은\s*조)\s*(?:제(\d+)항(?:\s*제(\d+)호)?(?:\s*([가-하])목)?|제(\d+)호(?:\s*([가-하])목)?)/g;
// amendment 메타 (텍스트로 합쳐 들어온 경우): <개정 ...>, [전문개정 ...], [제목개정 ...], [본조신설 ...] 등
// 한글 단어 + (개정|신설|일자) + 연도 형태 또는 단독 <YYYY.M.D.> 도 포함
const INLINE_AMENDMENT_RE =
  /<\s*(?:[가-힣]*(?:개정|신설|삭제|시행|타법개정))[^>]*>|<\s*\d{4}\.\s*\d+\.\s*\d+\.?\s*>|\[[가-힣]*(?:개정|신설|일자|타법개정)\s+\d{4}[^\]]*\]/g;
// 강사 보강 라벨 lookahead 용 — ref 직후 [라벨] 가 붙은 경우를 식별 (Bold span 으로 별도 토큰화 됨)
// 한글 가운뎃점 두 종류 모두 허용: · (U+00B7), ㆍ (U+318D); 괄호 (), 슬래시도 라벨 본문에 등장
const ANNOTATION_LOOKAHEAD_RE = /^\s*\[[가-힣A-Za-z0-9·ㆍ、,()\/\s]+\]/;

type TextPart =
  | { type: "text"; text: string }
  | {
      type: "kref";
      raw: string;
      article: number;
      branch?: number;
      clause?: number;
      item?: number;
      subItem?: string;
    }
  | { type: "annotation"; text: string }
  | { type: "amendment"; text: string };

interface RawMatch {
  start: number;
  end: number;
  part: TextPart;
}

function splitInlineParts(
  text: string,
  prevSuffix = "",
  nextPrefix = "",
): TextPart[] {
  const matches: RawMatch[] = [];
  // amendment 우선 (전문개정/개정/신설 등)
  for (const m of text.matchAll(INLINE_AMENDMENT_RE)) {
    if (m.index === undefined) continue;
    matches.push({
      start: m.index,
      end: m.index + m[0].length,
      part: { type: "amendment", text: m[0] },
    });
  }
  for (const m of text.matchAll(KOREAN_REF_RE)) {
    if (m.index === undefined) continue;
    // ref 직전 컨텍스트 = (이전 토큰 suffix) + (현재 토큰 매칭 시작점 이전)
    const before = prevSuffix + text.slice(0, m.index);
    // ref 직후에 강사 보강 라벨([…])이 붙어있으면 본법 ref 로 강제 (외부법 컨텍스트 override)
    // — 같은 토큰 내 + 다음 토큰들의 prefix 까지 결합해서 검사 (라벨이 별도 Bold span 으로 쪼개지는 케이스 보정)
    const after = text.slice(m.index + m[0].length) + nextPrefix;
    const hasAnnotationAfter = ANNOTATION_LOOKAHEAD_RE.test(after);
    // 외부법 컨텍스트: 직전 문장 안에 「외부법」 또는 외부법명이 등장하면 후속 ref 들도 외부법으로 간주
    // (단, "본법/이 법/특허법" 으로 컨텍스트가 재설정되면 다시 link 활성)
    const lastSentenceEnd = Math.max(
      before.lastIndexOf("."),
      before.lastIndexOf("。"),
      before.lastIndexOf(";"),
    );
    const recent = lastSentenceEnd >= 0 ? before.slice(lastSentenceEnd + 1) : before;
    const foreignAt = Math.max(
      recent.lastIndexOf("」"),
      recent.search(/같은\s*법/),
      recent.search(
        /(?:헌법|민법|상법|민사소송법|민사집행법|형법|형사소송법|행정소송법|특허협력조약|발명진흥법|디자인보호법|상표법|실용신안법)/,
      ),
    );
    const localResetMatch = recent.match(
      /본법|이\s*법(?:에|의|에서|을|이|와|과|상|에서는)?|특허법(?:에|의|에서|을|이|와|과|상|에서는)?/,
    );
    const localAt = localResetMatch?.index ?? -1;
    if (
      !hasAnnotationAfter &&
      foreignAt >= 0 &&
      (localAt < 0 || localAt < foreignAt)
    )
      continue;
    matches.push({
      start: m.index,
      end: m.index + m[0].length,
      part: {
        type: "kref",
        raw: m[0],
        article: Number(m[1]),
        branch: m[2] ? Number(m[2]) : undefined,
        clause: m[3] ? Number(m[3]) : undefined,
        item: m[4] ? Number(m[4]) : undefined,
        subItem: m[5] ?? undefined,
      },
    });
  }
  // 단독 항/호/목 ref — 직전 full ref 의 article(+clause) 컨텍스트를 이어받음
  for (const m of text.matchAll(STANDALONE_REF_RE)) {
    if (m.index === undefined) continue;
    // 시작 위치는 첫 "제" 또는 한글 가지 위치 (연결자 + 공백 다음)
    const clauseStart = m.index + m[0].indexOf("제");
    // 이미 full ref (KOREAN_REF_RE) 매칭에 포함된 위치면 skip
    const overlapsFullRef = matches.some(
      (mt) =>
        mt.part.type === "kref" &&
        clauseStart >= mt.start &&
        clauseStart < mt.end,
    );
    if (overlapsFullRef) continue;
    // 직전 (위치상 가장 가까운) full ref 의 article/branch/clause 컨텍스트
    const prevFull = [...matches]
      .filter((mt) => mt.part.type === "kref" && mt.end <= clauseStart)
      .sort((a, b) => b.end - a.end)[0];
    if (!prevFull || prevFull.part.type !== "kref") continue;
    const ctx = prevFull.part;
    // 모드 (a): 제K항... — article 만 이어받음
    // 모드 (b): 제K호... — article + clause 이어받음
    const isClauseMode = m[1] !== undefined;
    const isItemMode = m[4] !== undefined;
    if (!isClauseMode && !isItemMode) continue;
    matches.push({
      start: clauseStart,
      end: m.index + m[0].length,
      part: {
        type: "kref",
        raw: m[0].slice(m[0].indexOf("제")),
        article: ctx.article,
        branch: ctx.branch,
        clause: isClauseMode ? Number(m[1]) : ctx.clause,
        item: isClauseMode
          ? m[2]
            ? Number(m[2])
            : undefined
          : Number(m[4]),
        subItem: isClauseMode ? m[3] : m[5],
      },
    });
  }
  // (annotation [라벨] 은 파서에서 inline annotation 토큰으로 분리됨 — 여기서 별도 매칭 안 함)
  matches.sort((a, b) => a.start - b.start);

  // 겹침 제거 (먼저 시작한 매칭 우선)
  const filtered: RawMatch[] = [];
  for (const m of matches) {
    if (filtered.length > 0 && filtered[filtered.length - 1].end > m.start)
      continue;
    filtered.push(m);
  }

  const out: TextPart[] = [];
  let cursor = 0;
  for (const m of filtered) {
    if (m.start > cursor) {
      out.push({ type: "text", text: text.slice(cursor, m.start) });
    }
    out.push(m.part);
    cursor = m.end;
  }
  if (cursor < text.length) {
    out.push({ type: "text", text: text.slice(cursor) });
  }
  return out;
}

function KoreanRefLink({
  raw,
  article,
  branch,
  clause,
  item,
  subItem,
}: {
  raw: string;
  article: number;
  branch?: number;
  clause?: number;
  item?: number;
  subItem?: string;
}) {
  const { titleMap, lawCode, insideSubArticle } = useContext(Ctx);
  if (!lawCode || insideSubArticle) return <Fragment>{raw}</Fragment>;
  const articleKey = `${article}${branch ? `의${branch}` : ""}`;
  const targetTitle = titleMap.get(articleKey);
  const hash = subItem
    ? `#sub-${subItem}`
    : item !== undefined
      ? `#item-${item}`
      : clause !== undefined
        ? `#clause-${clause}`
        : "";
  return (
    <Link
      to={`/subjects/${lawCode}/articles/${articleKey}${hash}`}
      viewTransition
      title={targetTitle ?? undefined}
      className="text-primary underline decoration-dotted underline-offset-2 hover:bg-primary/10 hover:decoration-solid"
    >
      {raw}
    </Link>
  );
}

function InlineNode({
  node,
  prevSuffix = "",
  nextPrefix = "",
}: {
  node: Inline;
  prevSuffix?: string;
  nextPrefix?: string;
}) {
  const { titleMap, insideSubArticle } = useContext(Ctx);
  const blanksRender = useBlanksRender();
  // text 안의 빈칸 자리를 input 으로 치환할 수 있으면 ReactNode 반환, 아니면 plain string fallback.
  const renderTextWithBlanks = (txt: string): ReactNode => {
    if (!blanksRender) return txt;
    const replaced = blanksRender.resolveText(txt);
    return replaced ?? txt;
  };
  switch (node.type) {
    case "text": {
      const parts = splitInlineParts(node.text, prevSuffix, nextPrefix);
      if (parts.length === 1 && parts[0].type === "text") {
        return <Fragment>{renderTextWithBlanks(node.text)}</Fragment>;
      }
      return (
        <>
          {parts.map((p, i) => {
            if (p.type === "text")
              return (
                <Fragment key={i}>{renderTextWithBlanks(p.text)}</Fragment>
              );
            if (p.type === "kref") {
              return (
                <KoreanRefLink
                  key={i}
                  raw={p.raw}
                  article={p.article}
                  branch={p.branch}
                  clause={p.clause}
                  item={p.item}
                  subItem={p.subItem}
                />
              );
            }
            if (p.type === "amendment") {
              return (
                <span
                  key={i}
                  className="text-muted-foreground/70 ml-1 align-baseline text-[10px] italic"
                >
                  {p.text}
                </span>
              );
            }
            // annotation — 강사 보강 라벨 (inline + box-decoration-clone 으로 단어 단위 wrap 허용)
            return (
              <span
                key={i}
                title="강사 보강 라벨"
                className="rounded bg-amber-100 px-1 text-[12px] font-medium text-amber-900 [box-decoration-break:clone] [-webkit-box-decoration-break:clone] dark:bg-amber-900/40 dark:text-amber-200"
              >
                {p.text}
              </span>
            );
          })}
        </>
      );
    }
    case "underline":
      return (
        <span className="underline decoration-amber-600 decoration-2 underline-offset-2 dark:decoration-amber-400">
          {node.text}
        </span>
      );
    case "subtitle":
      return (
        <span className="bg-primary/10 text-primary mx-0.5 rounded px-1.5 py-0.5 text-xs font-semibold">
          ({node.text})
        </span>
      );
    case "annotation":
      return (
        <span
          title="강사 보강 라벨"
          className="rounded bg-amber-100 px-1 text-[12px] font-medium text-amber-900 [box-decoration-break:clone] [-webkit-box-decoration-break:clone] dark:bg-amber-900/40 dark:text-amber-200"
        >
          [{node.text}]
        </span>
      );
    case "ref_article": {
      const t = node.target;
      const hash = articleAnchor(t);
      const articleKey = `${t.article}${t.branch ? `의${t.branch}` : ""}`;
      const targetTitle = titleMap.get(articleKey);
      const ctx = useContext(Ctx);
      if (insideSubArticle) {
        return (
          <span className="text-muted-foreground mx-0.5 rounded bg-muted/50 px-1 text-[12px]">
            {node.raw}
          </span>
        );
      }
      const toneCls =
        ctx.refTone === "indigo"
          ? "bg-indigo-100 text-indigo-700 hover:bg-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-200 dark:hover:bg-indigo-900/60"
          : "bg-primary/10 text-primary hover:bg-primary/20";
      return (
        <Link
          to={`/subjects/${t.law_code}/articles/${articleKey}${hash}`}
          viewTransition
          title={targetTitle ?? undefined}
          className={cn(
            "mx-0.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] font-medium",
            toneCls,
          )}
        >
          <span>{node.raw}</span>
          {targetTitle ? (
            <span className="text-muted-foreground hidden font-normal sm:inline">
              [{targetTitle}]
            </span>
          ) : null}
        </Link>
      );
    }
    case "ref_law":
      return (
        <Link
          to={`/subjects/${node.lawCode}`}
          viewTransition
          className="text-primary underline-offset-2 hover:underline"
        >
          {node.raw}
        </Link>
      );
    case "amendment_note":
      return (
        <span className="text-muted-foreground/70 ml-1 align-baseline text-[10px] italic">
          {node.text}
        </span>
      );
    case "footnote":
      return <sup className="text-primary ml-0.5 text-[10px]">{node.n}</sup>;
  }
}

function articleAnchor(t: {
  clause?: number;
  item?: number;
  item_branch?: number;
  sub_item?: string;
}): string {
  if (t.sub_item) return `#sub-${t.sub_item}`;
  if (t.item !== undefined) {
    return t.item_branch !== undefined
      ? `#item-${t.item}_${t.item_branch}`
      : `#item-${t.item}`;
  }
  if (t.clause !== undefined) return `#clause-${t.clause}`;
  return "";
}
