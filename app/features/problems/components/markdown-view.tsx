// 운영자/학생 화면 공용 Markdown 렌더러.
// react-markdown + remark-gfm 으로 표·취소선·체크박스 등 GFM 확장 지원.
//
// 주의: @tailwindcss/typography 플러그인을 쓰지 않으므로 prose-* 변형은 무효.
// 표·코드·이미지 등 핵심 요소는 components 매핑으로 직접 클래스 주입한다.
import { Fragment, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

import { cn } from "~/core/lib/utils";

// 표 셀(td/th) 안 텍스트에서 " 1.", " 2.", " ①", " ㈀" 등 번호/원형 마커 앞에서
// 줄바꿈을 삽입한다 (첫 항목은 셀 머리에 있어 건드리지 않음 — 앞이 공백/파이프인 경우 제외).
// hwpx 추출 시 한 줄로 합쳐진 enumeration 을 가독성 있게 분리.
function splitByEnumMarkers(text: string): string[] {
  // 매 호출마다 새 RegExp — split 후 lastIndex stateful 이슈 회피.
  // 줄바꿈 대상: 숫자(1./2./...), 원형 숫자(①②...), 원형 한글(㈀㈎㉠ 등).
  // 제외: 로마숫자(ⅰ)/ⅱ)/Ⅰ./Ⅱ.) — 운영자 요청에 따라 줄바꿈 안 함.
  const regex = /(?<=[^\s|]) (?=\d+\.\s|[①-⑳]|[㈀-㈎]|[㉠-㉻])/g;
  return text.split(regex);
}

function injectLineBreaks(node: ReactNode, keyPrefix = ""): ReactNode {
  if (typeof node === "string") {
    const parts = splitByEnumMarkers(node);
    if (parts.length === 1) return node;
    return parts.map((p, i) =>
      i === 0 ? p : (
        <Fragment key={`${keyPrefix}${i}`}>
          <br />
          {p}
        </Fragment>
      ),
    );
  }
  if (Array.isArray(node)) {
    return node.map((c, i) => (
      <Fragment key={`a${i}`}>{injectLineBreaks(c, `a${i}-`)}</Fragment>
    ));
  }
  return node;
}

const components: Components = {
  table: (props) => (
    <div className="my-2 overflow-x-auto">
      <table
        // table-auto (기본) — 컬럼 너비를 내용 길이에 따라 자동 배분.
        // 라벨 셀(서/의의 등 짧음) 은 좁게, 내용 셀(긴 텍스트) 은 넓게 자연스럽게 분포.
        // break-words 로 긴 한자/단어도 셀 안에서 줄바꿈.
        className="w-full border-collapse text-left text-xs [&_td]:break-words [&_th]:break-words"
        {...props}
      />
    </div>
  ),
  thead: (props) => <thead className="bg-muted" {...props} />,
  th: ({ children, ...props }) => (
    <th className="border border-border px-2 py-1 font-semibold" {...props}>
      {injectLineBreaks(children)}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td className="border border-border px-2 py-1 align-top" {...props}>
      {injectLineBreaks(children)}
    </td>
  ),
  p: (props) => <p className="my-1 leading-relaxed" {...props} />,
  ul: (props) => <ul className="my-1 list-disc pl-5" {...props} />,
  ol: (props) => <ol className="my-1 list-decimal pl-5" {...props} />,
  li: (props) => <li className="my-0" {...props} />,
  h1: (props) => <h1 className="my-2 text-base font-bold" {...props} />,
  h2: (props) => <h2 className="my-2 text-sm font-bold" {...props} />,
  h3: (props) => <h3 className="my-1 text-xs font-bold" {...props} />,
  code: (props) => (
    <code
      className="bg-muted rounded px-1 py-0.5 font-mono text-[11px]"
      {...props}
    />
  ),
  pre: (props) => (
    <pre
      className="bg-muted my-2 overflow-x-auto rounded p-2 font-mono text-[11px]"
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
    <img
      className="my-2 inline-block max-w-full rounded border"
      {...props}
    />
  ),
  hr: (props) => <hr className="border-border my-3" {...props} />,
  a: (props) => (
    <a
      className="text-primary underline-offset-2 hover:underline"
      target="_blank"
      rel="noreferrer"
      {...props}
    />
  ),
  strong: (props) => <strong className="font-semibold" {...props} />,
  em: (props) => <em className="italic" {...props} />,
  mark: (props) => (
    <mark
      className="rounded-sm bg-amber-200/70 px-0.5 text-foreground"
      {...props}
    />
  ),
  u: (props) => (
    <u className="decoration-sky-500 decoration-2 underline-offset-2" {...props} />
  ),
};

export function MarkdownView({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "text-foreground max-w-none text-xs leading-relaxed",
        className,
      )}
    >
      <ReactMarkdown
        // remarkMath — $inline$ / $$display$$ LaTeX 파싱.
        // rehypeKatex — KaTeX HTML 렌더 (자연과학 수식).
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeRaw, rehypeKatex]}
        // raw HTML (예: rowspan/colspan 병합 표) 을 remark→rehype 변환 시 보존.
        // 이게 없으면 rehype-raw 가 처리할 HTML 자체가 hast 트리에서 사라진다.
        remarkRehypeOptions={{ allowDangerousHtml: true }}
        components={components}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
