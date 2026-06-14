// feat-2-022 — OX 약점 진단 공용 표현 뷰. 학생 화면(/study/ox-diagnosis)과
// 강사 드릴다운(/admin/students/:id)이 같은 게이트·처방 톤을 쓰도록 추출.
// audience="self"(본인) | "staff"(이 학생) 로 문구만 분기. 집계 로직/게이트는 동일.
import { ArrowRightIcon, BrainIcon, InfoIcon, LayersIcon, LockIcon, TargetIcon } from "lucide-react";
import { Link } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/core/components/ui/table";
import { cn } from "~/core/lib/utils";
import {
  CHOICE_TYPE_COLOR,
  CHOICE_TYPE_LABEL,
  type ProblemChoiceType,
} from "~/features/problems/labels";
import type {
  OxChoiceTypeRow,
  OxCrossCell,
  OxDiagnosis,
} from "~/features/study/lib/ox-diagnosis.server";

type Audience = "self" | "staff";

// 매트릭스 열 — 조문/판례/이론(미분류는 종류 막대에만).
const MATRIX_TYPES: ProblemChoiceType[] = ["statute", "precedent", "theory"];
// 처방 노출 소프트 바(단정 아님, 가벼운 점검 권유). 도메인 하드룰 아님.
const PRESCRIBE_BAR_PCT = 70;
// 매트릭스 표시 단원 상한 — 초과 시 캡 + 안내(무음 절단 금지).
const MAX_MATRIX_NODES = 20;

export interface OxDiagnosisPasser {
  enabled: boolean;
  sampleSize: number;
  minSample: number;
}

export function OxDiagnosisView({
  diagnosis,
  passer,
  audience,
}: {
  diagnosis: OxDiagnosis;
  passer: OxDiagnosisPasser;
  audience: Audience;
}) {
  const hasData = diagnosis.totals.attempts > 0;
  return (
    <div className="space-y-5">
      {!hasData ? (
        <EmptyState audience={audience} />
      ) : (
        <>
          <OverviewRow diagnosis={diagnosis} />
          <ChoiceTypeSection
            rows={diagnosis.byChoiceType}
            minAttempts={diagnosis.minAttempts}
          />
          <Prescription
            rows={diagnosis.byChoiceType}
            overallPct={diagnosis.totals.accuracyPct}
            audience={audience}
          />
          <CrossMatrix diagnosis={diagnosis} />
        </>
      )}
      <PasserPlaceholder passer={passer} />
    </div>
  );
}

function EmptyState({ audience }: { audience: Audience }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <BrainIcon className="text-muted-foreground/50 size-8" />
        <p className="text-foreground font-semibold">
          {audience === "self"
            ? "아직 분석할 OX 데이터가 부족합니다"
            : "이 학생의 OX 데이터가 아직 부족합니다"}
        </p>
        <p className="text-muted-foreground max-w-md text-sm leading-relaxed">
          {audience === "self"
            ? "조문 · 단원 페이지의 OX 패널이나 OX 시험에서 지문을 풀면, 단원별 · 지식종류별(조문/판례/이론) 약점 진단이 여기에 쌓입니다."
            : "학생이 OX 지문을 풀면 단원별 · 지식종류별(조문/판례/이론) 약점 진단이 여기에 쌓입니다."}
        </p>
        {audience === "self" ? (
          <Button size="sm" asChild className="mt-1">
            <Link to="/dashboard" viewTransition>
              학습하러 가기 <ArrowRightIcon className="size-3.5" />
            </Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function OverviewRow({ diagnosis }: { diagnosis: OxDiagnosis }) {
  const { totals } = diagnosis;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <StatTile
        label="누적 OX 정답률"
        value={totals.accuracyPct !== null ? `${totals.accuracyPct}%` : "—"}
        sub={`${totals.correct}/${totals.attempts}개 (최신 기준)`}
      />
      <StatTile
        label="푼 지문 수"
        value={`${totals.distinctRefs}`}
        sub="서로 다른 지문"
      />
      <StatTile
        label="표본 기준"
        value={`N ≥ ${diagnosis.minAttempts}`}
        sub="미달 셀은 약점 단정 제외"
      />
    </div>
  );
}

function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="border-border bg-card rounded-xl border p-3 shadow-sm">
      <p className="text-muted-foreground text-[11px] font-medium">{label}</p>
      <p className="text-foreground mt-1 text-xl font-bold tabular-nums">
        {value}
      </p>
      <p className="text-muted-foreground text-[11px]">{sub}</p>
    </div>
  );
}

function accTone(pct: number): string {
  if (pct < 60) return "text-rose-600 dark:text-rose-400";
  if (pct < 80) return "text-amber-600 dark:text-amber-400";
  return "text-emerald-600 dark:text-emerald-400";
}

function ChoiceTypeSection({
  rows,
  minAttempts,
}: {
  rows: OxChoiceTypeRow[];
  minAttempts: number;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <h2 className="flex items-center gap-1.5 text-base font-bold tracking-tight">
          <LayersIcon className="size-4" /> 지식종류별 정답률
        </h2>
        <p className="text-muted-foreground text-xs">
          조문 · 판례 · 이론 지문 정답률. 표본 N{minAttempts}건 미만은 참고용입니다.
        </p>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-xs">집계된 지문이 없습니다.</p>
        ) : (
          rows.map((r) => <ChoiceTypeBar key={r.choiceType ?? "null"} row={r} />)
        )}
      </CardContent>
    </Card>
  );
}

function ChoiceTypeBar({ row }: { row: OxChoiceTypeRow }) {
  const label =
    row.choiceType !== null ? CHOICE_TYPE_LABEL[row.choiceType] : "미분류";
  const color =
    row.choiceType !== null
      ? CHOICE_TYPE_COLOR[row.choiceType]
      : "bg-muted text-muted-foreground";
  const pct = row.accuracyPct;
  return (
    <div className="flex items-center gap-3">
      <Badge variant="secondary" className={cn("w-14 justify-center", color)}>
        {label}
      </Badge>
      <div className="bg-muted relative h-2 flex-1 overflow-hidden rounded-full">
        {pct !== null && !row.belowThreshold ? (
          <div
            className={cn(
              "h-full rounded-full",
              pct < 60
                ? "bg-rose-500"
                : pct < 80
                  ? "bg-amber-500"
                  : "bg-emerald-500",
            )}
            style={{ width: `${pct}%` }}
          />
        ) : null}
      </div>
      <div className="w-32 text-right text-xs tabular-nums">
        {row.belowThreshold ? (
          <span className="text-muted-foreground">
            데이터 부족 ({row.attempts}건)
          </span>
        ) : (
          <span className={cn("font-semibold", pct !== null ? accTone(pct) : "")}>
            {pct}%{" "}
            <span className="text-muted-foreground">({row.attempts}건)</span>
          </span>
        )}
      </div>
    </div>
  );
}

// 신중한 처방 — 표본 충족 종류 중 가장 약하고 소프트 바 미만 1개만, 단정 없이 점검 권유.
function Prescription({
  rows,
  overallPct,
  audience,
}: {
  rows: OxChoiceTypeRow[];
  overallPct: number | null;
  audience: Audience;
}) {
  const eligible = rows.filter(
    (r) => !r.belowThreshold && r.choiceType !== null && r.accuracyPct !== null,
  );
  if (eligible.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="text-muted-foreground flex items-center gap-2 py-4 text-xs">
          <InfoIcon className="size-3.5 shrink-0" />
          종류별 표본(N≥5)이 더 쌓이면 학습 방향을 제안합니다. 지금은 특정 종류를
          약점으로 단정하지 않습니다.
        </CardContent>
      </Card>
    );
  }
  const weakest = eligible.reduce((a, b) =>
    (a.accuracyPct ?? 100) <= (b.accuracyPct ?? 100) ? a : b,
  );
  const weakPct = weakest.accuracyPct ?? 100;
  const show =
    weakPct < PRESCRIBE_BAR_PCT ||
    (overallPct !== null && weakPct < overallPct - 10);
  if (!show || weakest.choiceType === null) {
    return (
      <Card className="border-dashed border-emerald-500/40">
        <CardContent className="text-muted-foreground flex items-center gap-2 py-4 text-xs">
          <InfoIcon className="size-3.5 shrink-0 text-emerald-600" />
          지식종류별 정답률이 고른 편입니다. 특정 종류를 약점으로 단정하지
          않았습니다.
        </CardContent>
      </Card>
    );
  }
  const label = CHOICE_TYPE_LABEL[weakest.choiceType];
  return (
    <Card className="border-amber-500/40 bg-amber-500/[0.03]">
      <CardContent className="flex items-start gap-2.5 py-4">
        <TargetIcon className="mt-0.5 size-4 shrink-0 text-amber-600" />
        <p className="text-sm leading-relaxed">
          {audience === "self" ? (
            <>
              <strong className="font-semibold">{label}</strong> 지문 정답률이 낮은
              편입니다 ({weakest.accuracyPct}% · {weakest.attempts}건). {label} 관련
              학습을 한 번 점검해보세요.
            </>
          ) : (
            <>
              이 학생은 <strong className="font-semibold">{label}</strong> 지문
              정답률이 낮은 편입니다 ({weakest.accuracyPct}% · {weakest.attempts}건).
              {label} 학습 지도를 점검해보세요.
            </>
          )}
          <span className="text-muted-foreground block text-xs">
            ※ 표본이 적어 참고용입니다. 더 풀수록 정확해집니다.
          </span>
        </p>
      </CardContent>
    </Card>
  );
}

function CrossMatrix({ diagnosis }: { diagnosis: OxDiagnosis }) {
  const cellByKey = new Map<string, OxCrossCell>();
  for (const c of diagnosis.cross) {
    cellByKey.set(`${c.nodeId ?? "null"}¦${c.choiceType ?? "null"}`, c);
  }
  // byNode 는 weaknessScore 내림차순 → 약점 단원 먼저.
  const shown = diagnosis.byNode.slice(0, MAX_MATRIX_NODES);
  const overflow = diagnosis.byNode.length - shown.length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <h2 className="text-base font-bold tracking-tight">
          단원 × 지식종류 매트릭스
        </h2>
        <p className="text-muted-foreground text-xs">
          단원별 약한 지식종류. 셀 = 정답률 (시도수). 표본 N{diagnosis.minAttempts}건
          미만은 회색(단정 제외).
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[10rem]">단원</TableHead>
                {MATRIX_TYPES.map((t) => (
                  <TableHead key={t} className="text-center">
                    {CHOICE_TYPE_LABEL[t]}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((node) => (
                <TableRow key={node.nodeId ?? "null"}>
                  <TableCell className="font-medium">{node.label}</TableCell>
                  {MATRIX_TYPES.map((t) => (
                    <TableCell key={t} className="text-center">
                      <MatrixCell
                        cell={cellByKey.get(`${node.nodeId ?? "null"}¦${t}`)}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {overflow > 0 ? (
          <p className="text-muted-foreground mt-2 text-[11px]">
            + 단원 {overflow}개 더 있음 (약점 상위 {MAX_MATRIX_NODES}개만 표시)
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function MatrixCell({ cell }: { cell: OxCrossCell | undefined }) {
  if (!cell || cell.attempts === 0) {
    return <span className="text-muted-foreground/40">—</span>;
  }
  if (cell.belowThreshold) {
    return (
      <span className="text-muted-foreground text-xs opacity-60">
        ({cell.attempts})
      </span>
    );
  }
  const pct = cell.accuracyPct ?? 0;
  return (
    <span className="text-xs tabular-nums">
      <span className={cn("font-bold", accTone(pct))}>{pct}%</span>{" "}
      <span className="text-muted-foreground">({cell.attempts})</span>
    </span>
  );
}

// 합격자 비교 — 게이트 OFF(1년차 합격자<minSample) 시 구조만 자리. ON 되면 비교 카드로 확장.
function PasserPlaceholder({ passer }: { passer: OxDiagnosisPasser }) {
  if (passer.enabled) return null; // ON 이후 비교 카드 자리 (향후 컨설팅 단계)
  return (
    <Card className="border-dashed">
      <CardContent className="text-muted-foreground flex items-center gap-2 py-5 text-xs">
        <LockIcon className="size-3.5 shrink-0" />
        합격자 평균과의 지식종류별 비교는 분석에 동의한 합격자가 {passer.minSample}명
        이상 모이면 제공됩니다 (현재 {passer.sampleSize}명).
      </CardContent>
    </Card>
  );
}
