// 운영자/학생 화면 공용 Markdown 렌더러.
// react-markdown + remark-gfm 으로 표·취소선·체크박스 등 GFM 확장 지원.
//
// 주의: @tailwindcss/typography 플러그인을 쓰지 않으므로 prose-* 변형은 무효.
// 표·코드·이미지 등 핵심 요소는 components 매핑으로 직접 클래스 주입한다.
import type { Components } from "react-markdown";

import { Fragment, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

import { labelSegments } from "~/core/lib/korean-wrap";
import { cn } from "~/core/lib/utils";

// GFM 취소선은 `~~이중틸드~~` 만 인정 — 단일 `~`(예: "9월~1월" 기간 표기)를 취소선으로
// 오인하지 않도록 singleTilde 비활성(한국어 본문에서 `~` 를 범위 구분에 흔히 사용).
const REMARK_GFM_OPTIONS = { singleTilde: false } as const;

// 표 셀(td/th) 안 텍스트에서 " 1.", " ①", " ▪", "  - " 등 번호/원형/불릿 마커 앞에서
// 줄바꿈을 삽입한다 (첫 항목은 셀 머리에 있어 건드리지 않음 — 앞이 공백/파이프인 경우 제외).
// hwpx 추출 시 한 줄로 합쳐진 enumeration/불릿을 가독성 있게 분리.
function splitByEnumMarkers(text: string): string[] {
  // 매 호출마다 새 RegExp — split 후 lastIndex stateful 이슈 회피.
  // 줄바꿈 대상: 숫자(1./2.), 원형 숫자(①②), 원형 한글(㈀㈎㉠), 불릿(▪•‣◦▸), 하위불릿(- ).
  // 제외: 로마숫자(ⅰ)/ⅱ)/Ⅰ./Ⅱ.) — 운영자 요청에 따라 줄바꿈 안 함.
  // \s+ — 하위불릿 "  - " 처럼 공백 2개로 구분된 항목도 처리.
  const regex = /(?<=[^\s|])\s+(?=\d+\.\s|[①-⑳]|[㈀-㈎]|[㉠-㉻]|[▪•‣◦▸]|-\s)/g;
  return text.split(regex);
}

/**
 * 한국어 복합어를 **뜻 단위**로 끊을 수 있게 <wbr> 을 심는다(규칙은 core/lib/korean-wrap).
 * ★CSS 는 낱말의 짜임을 모른다 — 「적법성심리」가 "적법성심 / 리" 로 잘리던 이유다
 *   (원장 보고 2026-08-23. 도해 표에서 먼저 고치고 학습과목 전체로 넓혔다).
 * ★<wbr> 은 textContent 에 아무것도 더하지 않아 하이라이트·검색 오프셋이 그대로다.
 */
function withWordBreaks(text: string, keyPrefix: string): ReactNode {
  const segs = labelSegments(text);
  if (segs.length <= 1) return text;
  return segs.map((s, i) => (
    <Fragment key={`${keyPrefix}w${i}`}>
      {i > 0 ? <wbr /> : null}
      {s}
    </Fragment>
  ));
}

/** 칸의 글만 이어 붙인다 — 라벨(짧은 칸)인지 판단하는 데 쓴다. */
function plainText(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(plainText).join("");
  return "";
}
/** 이보다 짧은 칸에만 낱말 단위 끊을 자리를 심는다 — 긴 본문 칸은 띄어쓰기로 충분하다. */
const LABELISH_MAX = 24;

function injectLineBreaks(
  node: ReactNode,
  keyPrefix = "",
  wordBreaks = false,
): ReactNode {
  if (typeof node === "string") {
    const parts = splitByEnumMarkers(node);
    const piece = (p: string, i: number) =>
      wordBreaks ? withWordBreaks(p, `${keyPrefix}${i}`) : p;
    if (parts.length === 1) return piece(node, 0);
    return parts.map((p, i) =>
      i === 0 ? (
        piece(p, 0)
      ) : (
        <Fragment key={`${keyPrefix}${i}`}>
          <br />
          {piece(p, i)}
        </Fragment>
      ),
    );
  }
  if (Array.isArray(node)) {
    return node.map((c, i) => (
      <Fragment key={`a${i}`}>
        {injectLineBreaks(c, `a${i}-`, wordBreaks)}
      </Fragment>
    ));
  }
  return node;
}

/** 표 칸 렌더 — 짧은 칸(라벨)에만 낱말 단위 끊을 자리를 심는다. */
function cellContent(children: ReactNode): ReactNode {
  return injectLineBreaks(
    children,
    "",
    plainText(children).length <= LABELISH_MAX,
  );
}

const components: Components = {
  table: (props) => (
    <div className="my-3 overflow-x-auto">
      <table
        // table-auto (기본) — 컬럼 너비를 내용 길이에 따라 자동 배분.
        // 라벨 셀(서/의의 등 짧음) 은 좁게, 내용 셀(긴 텍스트) 은 넓게 자연스럽게 분포.
        // break-words 로 긴 한자/단어도 셀 안에서 줄바꿈.
        // 글자 크기 3단(--study-fs) 따라감 — 표 형식 지문도 발문과 함께 커지도록(기본 1=무변화).
        // 얼룩무늬(even 행 배경) — 긴 비교표에서 행 추적 가독성. 셀 스타일은 th/td 매핑에서.
        className="[&_tbody_tr:nth-child(even)]:bg-muted/30 w-full border-collapse text-left text-[length:calc(13px*var(--study-fs))] [&_td]:break-words [&_td]:break-keep [&_th]:break-words [&_th]:break-keep"
        {...props}
      />
    </div>
  ),
  thead: (props) => <thead className="bg-muted" {...props} />,
  th: ({ children, ...props }) => (
    <th
      className="border-border border px-3 py-1.5 leading-relaxed font-semibold"
      {...props}
    >
      {cellContent(children)}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td
      className="border-border border px-3 py-1.5 align-top leading-relaxed"
      {...props}
    >
      {cellContent(children)}
    </td>
  ),
  p: (props) => <p className="my-1 leading-relaxed" {...props} />,
  // 사실관계 등 박스 처리 — 본문에 <div class="case-box">…</div> 로 감싸면 테두리 박스로 렌더.
  // 그 외 div 는 원래 className 그대로 통과.
  div: ({ className, ...props }) =>
    typeof className === "string" && className.includes("case-box") ? (
      <div
        className="border-border bg-muted/40 text-foreground my-3 rounded-lg border px-4 py-3 leading-relaxed"
        {...props}
      />
    ) : (
      <div className={className} {...props} />
    ),
  ul: (props) => <ul className="my-1 list-disc pl-5" {...props} />,
  ol: (props) => <ol className="my-1 list-decimal pl-5" {...props} />,
  li: (props) => <li className="my-0" {...props} />,
  // 머리글·코드도 글자 크기 3단(--study-fs)을 따라간다(기본 1=무변화).
  h1: (props) => (
    <h1
      className="my-2 text-[length:calc(16px*var(--study-fs))] font-bold"
      {...props}
    />
  ),
  h2: (props) => (
    <h2
      className="my-2 text-[length:calc(14px*var(--study-fs))] font-bold"
      {...props}
    />
  ),
  h3: (props) => (
    <h3
      className="my-1 text-[length:calc(12px*var(--study-fs))] font-bold"
      {...props}
    />
  ),
  // h4 미매핑 시 preflight 로 본문과 완전 동일(크기·굵기)해져 계층이 사라진다.
  h4: (props) => (
    <h4
      className="my-1 text-[length:calc(12px*var(--study-fs))] font-semibold"
      {...props}
    />
  ),
  code: (props) => (
    <code
      className="bg-muted rounded px-1 py-0.5 font-mono text-[length:calc(13px*var(--study-fs))]"
      {...props}
    />
  ),
  pre: (props) => (
    <pre
      className="bg-muted my-2 overflow-x-auto rounded p-2 font-mono text-[length:calc(13px*var(--study-fs))]"
      {...props}
    />
  ),
  blockquote: (props) => (
    <blockquote
      className="border-border text-muted-foreground my-2 border-l-2 pl-3"
      {...props}
    />
  ),
  img: (props) => (
    <img className="my-2 inline-block max-w-full rounded border" {...props} />
  ),
  hr: (props) => <hr className="border-border my-3" {...props} />,
  a: (props) => (
    <a
      className="text-link underline-offset-2 hover:underline"
      target="_blank"
      rel="noreferrer"
      {...props}
    />
  ),
  strong: (props) => <strong className="font-semibold" {...props} />,
  em: (props) => <em className="italic" {...props} />,
  mark: (props) => (
    <mark
      className="text-foreground rounded-sm bg-amber-200/70 px-0.5"
      {...props}
    />
  ),
  u: (props) => (
    <u
      className="decoration-sky-500 decoration-2 underline-offset-2"
      {...props}
    />
  ),
};

// 줄 머리 "1. "/"1) " 수동 번호를 마크다운 순서 목록으로 바꾸지 않게 이스케이프.
// 렌더는 친 그대로 "1." · "1)" — 목록 들여쓰기·후속 줄 말려들어감(item 연속행) 방지.
// 불릿("- ") 바로 뒤 숫자도 대상 — "- 2011. 8. 29. 출원"/"2) 2024. 7. 1. …" 이
// 중첩 순서목록(2011→8→29)으로 오해석돼 날짜가 깨지는 것 방지(첫 마커만 이스케이프).
function escapeOrderedListMarkers(text: string): string {
  return text.replace(/^(\s*(?:[-*+]\s+)?)(\d+)([.)])(?=\s)/gm, "$1$2\\$3");
}

export function MarkdownView({
  text,
  className,
  trusted = true,
  breaks = false,
  literalNumbering = false,
}: {
  text: string;
  className?: string;
  // trusted=false → 원시 HTML 파싱(rehype-raw)·allowDangerousHtml 비활성 = 저장형 XSS 차단.
  // 사용자(강사 등)가 작성해 타인(학생)에게 보이는 콘텐츠(상담 코멘트 등)는 반드시 false.
  // 신뢰 콘텐츠(운영자 해설·HWPX 적재 등 rowspan/colspan 표 포함)만 기본 true 유지.
  trusted?: boolean;
  // breaks=true → 단일 줄바꿈(\n)을 <br> 로 렌더(remark-breaks). 사용자가 직접 줄바꿈으로
  // 문단을 나누는 콘텐츠(커뮤니티 글·합격 수기)에만 사용. HWPX 적재 본문은 우발적 \n 이 많아
  // 기본 false(문단은 \n\n 로만).
  breaks?: boolean;
  // literalNumbering=true → "1. " 손 번호를 목록으로 만들지 않고 친 그대로 표시.
  // 마크다운을 모르는 사용자 산문(Q&A 질문·강사 답변 등) — 의도치 않은 들여쓰기 방지.
  literalNumbering?: boolean;
}) {
  return (
    <div
      className={cn(
        "text-foreground max-w-none text-sm leading-relaxed",
        className,
      )}
    >
      <ReactMarkdown
        // remarkMath — $inline$ / $$display$$ LaTeX 파싱.
        // rehypeKatex — KaTeX HTML 렌더 (자연과학 수식). XSS 무관.
        remarkPlugins={
          breaks
            ? [[remarkGfm, REMARK_GFM_OPTIONS], remarkMath, remarkBreaks]
            : [[remarkGfm, REMARK_GFM_OPTIONS], remarkMath]
        }
        // rehypeRaw — raw HTML(rowspan/colspan 병합 표) 보존. 신뢰 콘텐츠에서만.
        // trusted=false 면 제외 → react-markdown 기본 동작(원시 HTML 미렌더)으로 XSS 안전.
        rehypePlugins={trusted ? [rehypeRaw, rehypeKatex] : [rehypeKatex]}
        remarkRehypeOptions={{ allowDangerousHtml: trusted }}
        components={components}
      >
        {literalNumbering ? escapeOrderedListMarkers(text) : text}
      </ReactMarkdown>
    </div>
  );
}
