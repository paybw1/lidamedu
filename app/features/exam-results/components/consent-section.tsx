// feat-8-026b — 학습 데이터 활용 동의(선택) 카드. A(내 학습 분석)/B(비교·기여) 토글.
// 제출은 /api/consent 전용 action 으로(화면 위치 무관) → 대시보드 등에서 재사용.
import { CheckCircle2Icon, ClipboardCheckIcon } from "lucide-react";
import { useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";

export function ConsentSection({
  myAnalysisConsentedAt,
  poolConsentedAt,
}: {
  myAnalysisConsentedAt: string | null;
  poolConsentedAt: string | null;
}) {
  return (
    <Card className="mb-4">
      <CardHeader className="px-4 pb-2">
        <p className="text-sm font-semibold">
          <ClipboardCheckIcon className="mr-1 inline size-3.5" />
          학습 데이터 활용 동의 (선택)
        </p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          서비스 이용에 필요한 데이터 처리는 가입 시 동의로 별도 완료되어
          있습니다. 아래 두 항목은 선택이며, 끄셔도 이용에 제한이 없습니다.
        </p>
      </CardHeader>
      <CardContent className="space-y-2.5 px-4 pb-3">
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
      </CardContent>
    </Card>
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
          <span className="inline-flex items-center gap-1 text-emerald-700">
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
