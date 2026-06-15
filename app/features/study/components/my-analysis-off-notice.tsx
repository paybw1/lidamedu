import { BrainIcon } from "lucide-react";
import { Link } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Card, CardContent } from "~/core/components/ui/card";

// feat-8-026b — A(내 데이터로 내 분석) 동의 미동의/철회 시 학습통계·OX진단·복습·암기
// 화면 본문 대신 표시한다. 데이터는 삭제하지 않으며(soft) 재동의 시 그대로 복구된다.
// 문구는 placeholder — 5단계(동의 UI/문구 확정)에서 다듬는다.
export function MyAnalysisOffNotice({ feature }: { feature: string }) {
  return (
    <div className="mx-auto w-full max-w-screen-md px-5 py-12 md:px-10">
      <Card>
        <CardContent className="flex flex-col items-center gap-4 px-6 py-14 text-center">
          <span className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
            <BrainIcon className="size-6" />
          </span>
          <div className="space-y-1.5">
            <h1 className="text-lg font-bold tracking-tight">
              {feature} 기능이 꺼져 있습니다
            </h1>
            <p className="text-muted-foreground mx-auto max-w-prose text-sm leading-relaxed">
              {/* placeholder 문구 — 5단계에서 확정 */}
              이 기능은 “내 학습 데이터로 내 분석”(선택 동의 A)이 필요합니다. 동의를
              하지 않았거나 철회하셔서 표시하지 않습니다.{" "}
              <strong>기존 학습 기록은 삭제되지 않으며</strong>, 다시 동의하면 그대로
              복구됩니다. (동의 설정 화면은 곧 제공됩니다.)
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/dashboard" viewTransition>
              대시보드로
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
