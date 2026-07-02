// 문제 고유번호 칩 — "P-{displayNo}" 표시 + 클릭 시 복사.
// Q&A/커뮤니티에서 이 번호로 문제를 특정해 질문할 수 있게 하는 인용 앵커.
import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";

import { formatProblemCode } from "~/features/problems/lib/problem-code";

export function ProblemCodeChip({ displayNo }: { displayNo: number }) {
  const [copied, setCopied] = useState(false);
  const code = formatProblemCode(displayNo);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard 미지원 — 무시 */
        }
      }}
      className="border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold tabular-nums"
      title="문제번호 복사 — Q&A에서 이 번호로 문제를 특정할 수 있어요"
    >
      {code}
      {copied ? (
        <CheckIcon className="size-3" />
      ) : (
        <CopyIcon className="size-3 opacity-70" />
      )}
    </button>
  );
}
