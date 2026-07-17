// 판례 빈칸 편집/풀기 공용 — 본문을 표(파이프 마크다운) 인식해 렌더.
// renderRange(from, to, key) 가 그 원시 구간의 노드(텍스트 세그먼트 + 빈칸 chip/input)를
// 만들어 주면, 이 컴포넌트는 문단/표 구조만 책임진다. 오프셋은 전부 원시 텍스트 기준.
import { useMemo, type ReactNode } from "react";

import { splitCaseTables } from "../lib/case-tables";

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
      <p className="whitespace-pre-wrap leading-[1.9]">
        {renderRange(0, text.length, "all")}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {parts.map((part, pi) => {
        if (part.type === "text") {
          return (
            <p key={`p${pi}`} className="whitespace-pre-wrap leading-[1.9]">
              {renderRange(part.start, part.start + part.text.length, `p${pi}`)}
            </p>
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
