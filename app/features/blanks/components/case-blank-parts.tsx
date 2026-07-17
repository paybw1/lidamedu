// 판례 빈칸 편집/풀기 공용 — 본문을 표(파이프 마크다운)·이미지 인식해 렌더.
// renderRange(from, to, key) 가 그 원시 구간의 노드(텍스트 세그먼트 + 빈칸 chip/input)를
// 만들어 주면, 이 컴포넌트는 문단/표/이미지 구조만 책임진다. 오프셋은 전부 원시 텍스트 기준.
import { useMemo, type ReactNode } from "react";

import {
  endsWithInlineQuote,
  startsWithInlineQuote,
} from "~/features/cases/lib/case-markdown";

import { splitCaseTables } from "../lib/case-tables";

// 마크다운 이미지 — 원시 문법은 렌더에서 감추고 <img> 로 표시(빈칸 대상 아님).
const MD_IMG_RE = /!\[[^\]]*\]\((https?:\/\/[^)\s]+|\/[^)\s]+)(?:\s+"[^"]*")?\)/g;

function TextWithImages({
  text,
  start,
  keyPrefix,
  renderRange,
}: {
  text: string;
  start: number;
  keyPrefix: string;
  renderRange: (from: number, to: number, key: string) => ReactNode;
}) {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  MD_IMG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MD_IMG_RE.exec(text)) !== null) {
    const before = text.slice(cursor, m.index);
    const after = text.slice(m.index + m[0].length);
    // 따옴표 문맥(원문 Prose 의 인라인 임베드와 동일 규칙) — 글리프성 이미지를 텍스트
    // 흐름 안 인라인으로 넣고, 문법 주변 줄바꿈/공백은 렌더에서 삼킨다(" 줄바꿈 이미지
    // 줄바꿈 " 방지). 오프셋 체계는 원시 텍스트 기준 그대로.
    const inline = endsWithInlineQuote(before) && startsWithInlineQuote(after);
    const beforeEnd = inline
      ? m.index - (before.length - before.replace(/\s+$/, "").length)
      : m.index;
    if (beforeEnd > cursor)
      nodes.push(renderRange(start + cursor, start + beforeEnd, `${keyPrefix}.t${cursor}`));
    nodes.push(
      <img
        key={`${keyPrefix}.img${m.index}`}
        src={m[1]}
        alt=""
        loading="lazy"
        className={
          inline
            ? "mx-0.5 inline-block max-h-[1.8em] w-auto object-contain align-middle"
            : "border-border my-2 block max-h-[420px] max-w-full rounded border object-contain"
        }
      />,
    );
    cursor = m.index + m[0].length;
    if (inline) cursor += after.length - after.replace(/^\s+/, "").length;
  }
  if (cursor < text.length)
    nodes.push(renderRange(start + cursor, start + text.length, `${keyPrefix}.tail`));
  return <p className="whitespace-pre-wrap leading-[1.9]">{nodes}</p>;
}

export function CaseBlankParts({
  text,
  renderRange,
}: {
  text: string;
  renderRange: (from: number, to: number, key: string) => ReactNode;
}) {
  const parts = useMemo(() => splitCaseTables(text), [text]);

  if (parts.length === 1 && parts[0].type === "text") {
    return (
      <TextWithImages
        text={text}
        start={0}
        keyPrefix="all"
        renderRange={renderRange}
      />
    );
  }

  return (
    <div className="space-y-2">
      {parts.map((part, pi) => {
        if (part.type === "text") {
          return (
            <TextWithImages
              key={`p${pi}`}
              text={part.text}
              start={part.start}
              keyPrefix={`p${pi}`}
              renderRange={renderRange}
            />
          );
        }
        const headerRow =
          part.rows.length > 1 && part.rows[1].separator ? part.rows[0] : null;
        const bodyRows = part.rows.filter((r, ri) => !r.separator && (headerRow ? ri !== 0 : true));
        return (
          <div key={`tb${pi}`} className="overflow-x-auto">
            {/* table-fixed — 열폭 균등(1:1:…). 편집/풀기 화면은 내용량과 무관하게 예측 가능한 폭. */}
            <table className="w-full table-fixed border-collapse text-[14px] leading-[1.7]">
              {headerRow ? (
                <thead>
                  <tr>
                    {headerRow.cells.map((c, ci) => (
                      <th
                        key={ci}
                        className="border-border bg-muted/50 break-words border px-2 py-1 text-left align-top font-semibold"
                      >
                        {renderRange(c.start, c.start + c.text.length, `h${pi}.${ci}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
              ) : null}
              <tbody>
                {bodyRows.map((r, ri) => (
                  <tr key={ri}>
                    {r.cells.map((c, ci) => (
                      <td
                        key={ci}
                        className="border-border break-words border px-2 py-1 align-top"
                      >
                        {renderRange(c.start, c.start + c.text.length, `c${pi}.${ri}.${ci}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
