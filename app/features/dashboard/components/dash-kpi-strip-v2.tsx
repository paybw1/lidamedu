// 학생 대시보드 KPI 스트립 v2 — Notion·Linear 톤.
// `Surface` + `Stat` 프리미티브만 사용. inline style / T 객체 미사용.

import { Stat, Surface } from "~/core/components/student";

export interface DashKpiData {
  studyHours: number;
  problems: number;
  accuracy: number;
  deltaHours: number;
  deltaProblems: number;
  accuracyBase: number;
}

export function DashKpiStripV2({ data }: { data: DashKpiData }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
      <Surface tone="default" pad={4}>
        <Stat
          label="누적 풀이 시간"
          value={data.studyHours.toFixed(1)}
          unit="h"
          delta={data.deltaHours > 0 ? `+${data.deltaHours.toFixed(1)}h` : null}
          tone={data.deltaHours > 0 ? "positive" : "neutral"}
          hint={`지난 7일`}
        />
      </Surface>
      <Surface tone="default" pad={4}>
        <Stat
          label="푼 문항 수"
          value={Math.round(data.problems).toLocaleString("ko-KR")}
          delta={data.deltaProblems > 0 ? `+${data.deltaProblems}` : null}
          tone={data.deltaProblems > 0 ? "positive" : "neutral"}
          hint={`지난 7일 +${data.deltaProblems.toLocaleString("ko-KR")}`}
        />
      </Surface>
      <Surface tone="default" pad={4}>
        <Stat
          label="평균 정답률"
          value={data.accuracy.toFixed(1)}
          unit="%"
          hint={`기준 ${data.accuracyBase.toLocaleString("ko-KR")} 문항`}
        />
      </Surface>
    </div>
  );
}
