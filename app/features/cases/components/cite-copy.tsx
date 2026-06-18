// 판례 학술 인용 한 줄 복사. 예:
//   "대법원 2019. 1. 17. 선고 2017후523 판결 【등록무효(특)】"
//   "특허법원 2002. 1. 17. 선고 2001허3453 판결 【거절사정(특)】"

import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "~/core/components/ui/button";
import { buildCitation, type CaseCourt } from "~/features/cases/labels";

export function CiteCopyButton({
  court,
  decidedAt,
  caseNumber,
  caseType,
  isEnBanc,
}: {
  court: CaseCourt;
  decidedAt: string;
  caseNumber: string;
  caseType: string | null;
  isEnBanc?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const citation = buildCitation({
    court,
    decidedAt,
    caseNumber,
    caseType,
    isEnBanc,
  });

  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(citation);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // 폴백 — 텍스트 선택용 prompt.
      window.prompt("아래 인용 텍스트를 복사하세요", citation);
    }
  };

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="h-7 text-xs"
      onClick={onClick}
      title={citation}
    >
      {copied ? (
        <>
          <CheckIcon className="size-3.5" /> 복사됨
        </>
      ) : (
        <>
          <CopyIcon className="size-3.5" /> 인용 복사
        </>
      )}
    </Button>
  );
}
