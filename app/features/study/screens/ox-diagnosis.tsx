// feat-2-022 — OX 지문 약점 진단 (학생 화면, /study/ox-diagnosis)
// 단원(node) × 지식종류(choice_type) 교차 매트릭스 + 종류별 정답률 + 신중한 처방.
// 표현은 공용 <OxDiagnosisView audience="self"> 사용(강사 드릴다운과 동일 게이트·톤).
import { Link, data } from "react-router";

import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import { OxDiagnosisView } from "~/features/study/components/ox-diagnosis-view";
import { computeOxDiagnosis } from "~/features/study/lib/ox-diagnosis.server";

import type { Route } from "./+types/ox-diagnosis";

export const meta: Route.MetaFunction = () => [
  { title: "OX 약점 진단 | Lidam Patent Attorney Academy" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const diagnosis = await computeOxDiagnosis(client, user.id);

  // 합격자 비교 게이트 — 1년차 실 합격자 0명 → OFF. 지금은 구조만 자리(화면엔 안내만).
  // 게이트 ON(동의 합격자 ≥10) 되면 같은 윈도우로 computeOxDiagnosis 를 코호트 호출하는 래퍼로 확장.
  const { isPasserBenchmarkEnabled } = await import(
    "~/features/exam-results/passer-benchmark-gate.server"
  );
  const gate = await isPasserBenchmarkEnabled();

  return {
    diagnosis,
    passer: {
      enabled: gate.enabled,
      sampleSize: gate.realSampleSize,
      minSample: gate.minSample,
    },
  };
}

export default function OxDiagnosisScreen({ loaderData }: Route.ComponentProps) {
  const { diagnosis, passer } = loaderData;

  return (
    <div className="mx-auto w-full max-w-screen-lg px-5 py-6 md:px-10 md:py-8">
      <header className="mb-6 space-y-2">
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          학습관리
        </p>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">OX 약점 진단</h1>
            <p className="text-muted-foreground text-sm">
              OX 지문을 단원 × 지식종류(조문 · 판례 · 이론)로 교차 분석합니다.
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/study/stats" viewTransition>
              학습 통계
            </Link>
          </Button>
        </div>
      </header>

      <OxDiagnosisView diagnosis={diagnosis} passer={passer} audience="self" />
    </div>
  );
}
