// feat-8-026b — 학습 데이터 활용 동의(선택) 카드. A(내 학습 분석)/B(비교·기여) 토글.
// 제출은 /api/consent 전용 action 으로(화면 위치 무관) → 대시보드 등에서 재사용.
// 둘 다 동의된 경우 기본 접힘(요약 한 줄) — 펼치면 항목별 철회 가능. 한쪽이라도
// 미동의면 펼친 상태로 보여 무엇이 꺼져 있는지 드러낸다. 접힘/펼침은 FE 인터랙션 상태.
import {
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "lucide-react";
import { useState } from "react";
import { useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";

export function ConsentSection({
  myAnalysisConsentedAt,
  poolConsentedAt,
}: {
  myAnalysisConsentedAt: string | null;
  poolConsentedAt: string | null;
}) {
  const bothConsented = !!myAnalysisConsentedAt && !!poolConsentedAt;
  // 둘 다 동의된 경우 기본 접힘. (초기값만 파생 — 펼친 뒤 철회로 상태가 바뀌어도
  //  사용자가 직접 접기 전까지 펼친 채 유지한다.)
  const [open, setOpen] = useState(!bothConsented);

  if (bothConsented && !open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hover:bg-muted/40 -mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left transition-colors"
      >
        <span className="inline-flex items-center gap-2">
          <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            학습 데이터 활용 동의
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
            <CheckCircle2Icon className="size-3.5" /> 모두 동의됨
          </span>
        </span>
        <span className="text-muted-foreground inline-flex shrink-0 items-center gap-1 text-xs">
          관리
          <ChevronDownIcon className="size-3.5" />
        </span>
      </button>
    );
  }

  return (
    <div className="space-y-2.5">
      <div>
        <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          학습 데이터 활용 동의
        </h3>
        <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
          서비스 이용에 필요한 데이터 처리는 가입 시 동의로 별도 완료되어
          있습니다. 아래 두 항목은 선택이며, 끄셔도 이용에 제한이 없습니다.
        </p>
      </div>
      <ConsentToggle
          intent="consentA"
          title="내 학습 분석 (A)"
          desc="내 학습 기록으로 학습 통계·정오문제 약점진단·복습·암기 기능을 제공합니다. 끄면 이 기능들이 꺼집니다 — 기존 학습 기록은 삭제되지 않으며 다시 켜면 그대로 복구됩니다."
          consentedAt={myAnalysisConsentedAt}
        />
        <ConsentToggle
          intent="consentB"
          title="합격자·동료 비교 + 표본 기여 (B)"
          desc="내 학습·시험 데이터를 익명·집계로 합격자 표본 풀에 기여하고, 그 대가로 합격자·동료 대비 비교를 열람합니다. 끄면 비교가 보이지 않고 풀 집계에서도 제외됩니다(대칭). 비교를 보려면 켜 주세요."
          consentedAt={poolConsentedAt}
        />
        {bothConsented ? (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs transition-colors"
          >
            <ChevronUpIcon className="size-3.5" />
            접기
          </button>
        ) : null}
    </div>
  );
}

function ConsentToggle({
  intent,
  title,
  desc,
  consentedAt,
}: {
  intent: "consentA" | "consentB";
  title: string;
  desc: string;
  consentedAt: string | null;
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const consented = !!consentedAt;
  return (
    <div className="bg-muted/30 rounded-md border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold">{title}</p>
          <p className="text-muted-foreground text-[11px] leading-relaxed">
            {desc}
          </p>
        </div>
        <fetcher.Form method="post" action="/api/consent" className="shrink-0">
          <input type="hidden" name="intent" value={intent} />
          <input type="hidden" name="consented" value={String(!consented)} />
          <Button
            type="submit"
            size="sm"
            variant={consented ? "outline" : "default"}
            disabled={fetcher.state !== "idle"}
          >
            {consented ? "철회" : "동의"}
          </Button>
        </fetcher.Form>
      </div>
      <p className="mt-2 text-[11px]">
        {consented ? (
          <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
            <CheckCircle2Icon className="size-3" />
            동의함{consentedAt ? ` · ${consentedAt.slice(0, 10)}` : ""}
          </span>
        ) : (
          <span className="text-muted-foreground">미동의 상태</span>
        )}
      </p>
    </div>
  );
}
