// feat-2-022 — OX 약점 진단 공용 표현 뷰. 학생 화면(/study/ox-diagnosis)과
// 강사 드릴다운(/admin/students/:id)이 같은 게이트·처방 톤을 쓰도록 추출.
// audience="self"(본인) | "staff"(이 학생) 로 문구만 분기. 집계 로직/게이트는 동일.
import {
  ArrowRightIcon,
  BrainIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  InfoIcon,
  LayersIcon,
  LockIcon,
  TargetIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
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
  OxCell,
  OxChoiceTypeRow,
  OxCrossCell,
  OxDiagnosis,
  OxTreeRow,
} from "~/features/study/lib/ox-diagnosis.server";
import {
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
} from "~/features/subjects/lib/subjects";

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
          <CrossMatrix diagnosis={diagnosis} audience={audience} />
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
            ? "아직 분석할 정오문제 데이터가 부족합니다"
            : "이 학생의 정오문제 데이터가 아직 부족합니다"}
        </p>
        <p className="text-muted-foreground max-w-md text-sm leading-relaxed">
          {audience === "self"
            ? "조문 · 단원 페이지의 정오문제 패널이나 정오문제 시험에서 지문을 풀면, 단원별 · 지식종류별(조문/판례/이론) 약점 진단이 여기에 쌓입니다."
            : "학생이 정오문제 지문을 풀면 단원별 · 지식종류별(조문/판례/이론) 약점 진단이 여기에 쌓입니다."}
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
        label="누적 정오문제 정답률"
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
          조문 · 판례 · 이론 지문 정답률. 표본 N{minAttempts}건 미만은
          참고용입니다.
        </p>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            집계된 지문이 없습니다.
          </p>
        ) : (
          rows.map((r) => (
            <ChoiceTypeBar key={r.choiceType ?? "null"} row={r} />
          ))
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
          <span
            className={cn("font-semibold", pct !== null ? accTone(pct) : "")}
          >
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
          종류별 표본(N≥5)이 더 쌓이면 학습 방향을 제안합니다. 지금은 특정
          종류를 약점으로 단정하지 않습니다.
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
              <strong className="font-semibold">{label}</strong> 지문 정답률이
              낮은 편입니다 ({weakest.accuracyPct}% · {weakest.attempts}건).{" "}
              {label} 관련 학습을 한 번 점검해보세요.
            </>
          ) : (
            <>
              이 학생은 <strong className="font-semibold">{label}</strong> 지문
              정답률이 낮은 편입니다 ({weakest.accuracyPct}% ·{" "}
              {weakest.attempts}건).
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

// 매트릭스 기준 — 체계도(학습 단위) / 조문(법전 편·장·절, 전 과목 동일 기준).
type MatrixBasis = "systematic" | "article";

function CrossMatrix({
  diagnosis,
  audience,
}: {
  diagnosis: OxDiagnosis;
  audience: Audience;
}) {
  // 기본 = 체계도(학습 단위). 체계도 트리가 비면(민법만 푼 경우 등) 조문 기준으로 시작.
  const [basis, setBasis] = useState<MatrixBasis>(() =>
    diagnosis.tree.length > 0 ? "systematic" : "article",
  );
  const rows = basis === "systematic" ? diagnosis.tree : diagnosis.articleTree;
  const canToggle =
    diagnosis.tree.length > 0 && diagnosis.articleTree.length > 0;
  // 트리 정보가 전혀 없으면(합성 입력 등) 평면 폴백.
  if (diagnosis.tree.length === 0 && diagnosis.articleTree.length === 0) {
    return <FlatMatrix diagnosis={diagnosis} audience={audience} />;
  }
  return (
    <TreeMatrix
      rows={rows}
      minAttempts={diagnosis.minAttempts}
      audience={audience}
      basis={basis}
      onBasisChange={canToggle ? setBasis : undefined}
    />
  );
}

// 과목 섹션 표시 순서 — 민법 → 특허법 → 디자인보호법 → 상표법 → (그 외 정식 순서).
const MATRIX_SUBJECT_ORDER: string[] = [
  "civil",
  "patent",
  "design",
  "trademark",
  ...LAW_SUBJECT_SLUGS.filter(
    (s) => !["civil", "patent", "design", "trademark"].includes(s),
  ),
];

// 체계도 정렬 매트릭스 — 과목별 섹션으로 구분, 상위 단원 행 = 하위 전체 합산(rollup).
// 접기/펼치기 드릴다운. 표본 게이트의 실익: 하위 셀이 N 미달이어도 상위 합산 셀에서 진단 가능.
function TreeMatrix({
  rows,
  minAttempts,
  audience,
  basis,
  onBasisChange,
}: {
  rows: OxTreeRow[];
  minAttempts: number;
  audience: Audience;
  basis: MatrixBasis;
  /** 미전달 = 토글 숨김(한쪽 기준만 데이터 존재). */
  onBasisChange?: (b: MatrixBasis) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const parentOf = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const r of rows) if (r.nodeId) m.set(r.nodeId, r.parentId);
    return m;
  }, [rows]);
  // 과목별 그룹 — 루트의 lawCode 로 서브트리 블록(전위 순회 연속)을 나눈다.
  // OX 대상 4과목(민·특·디·상)은 데이터가 없어도 섹션을 항상 노출(빈 상태 안내) —
  // "다른 과목은 어디 갔지?" 혼란 방지. 기타(lawCode null)는 말미 "기타" 섹션.
  const groups = useMemo(() => {
    const byLaw = new Map<string, OxTreeRow[]>();
    for (const key of MATRIX_SUBJECT_ORDER.slice(0, 4)) byLaw.set(key, []);
    for (const row of rows) {
      const key = row.lawCode ?? "_etc";
      const list = byLaw.get(key) ?? [];
      list.push(row);
      byLaw.set(key, list);
    }
    const orderOf = (key: string) => {
      if (key === "_etc") return 999;
      const idx = MATRIX_SUBJECT_ORDER.indexOf(key);
      return idx === -1 ? 900 : idx;
    };
    return [...byLaw.entries()]
      .filter(([key, groupRows]) => groupRows.length > 0 || key !== "_etc")
      .sort((a, b) => orderOf(a[0]) - orderOf(b[0]))
      .map(([key, groupRows]) => ({
        key,
        name:
          key === "_etc"
            ? "기타"
            : (LAW_SUBJECTS[key as keyof typeof LAW_SUBJECTS]?.name ?? key),
        rows: groupRows,
      }));
  }, [rows]);
  const isVisible = (row: OxTreeRow): boolean => {
    let cur = row.parentId;
    for (let guard = 0; cur && guard < 20; guard++) {
      if (!expanded.has(cur)) return false;
      cur = parentOf.get(cur) ?? null;
    }
    return true;
  };
  const toggle = (nodeId: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold tracking-tight">
            단원 × 지식종류 매트릭스
          </h2>
          {onBasisChange ? (
            <div
              className="border-border inline-flex overflow-hidden rounded-lg border text-xs"
              role="group"
              aria-label="매트릭스 기준"
            >
              {(
                [
                  ["systematic", "체계도 기준"],
                  ["article", "조문 기준"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onBasisChange(value)}
                  aria-pressed={basis === value}
                  className={cn(
                    "px-2.5 py-1 font-semibold transition-colors",
                    basis === value
                      ? "bg-primary text-primary-foreground"
                      : "bg-card text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <p className="text-muted-foreground text-xs">
          {basis === "systematic"
            ? "과목별 · 체계도 순서. 상위 단원 행은 하위 단원 전체의 합산입니다"
            : "과목별 · 법전 편 → 장 → 절 순서. 상위 행은 하위 전체의 합산입니다"}{" "}
          — ▸ 를 눌러 펼치면 세부 단원별로 드릴다운됩니다. 셀 = 정답률 (시도수),
          표본 N{minAttempts}건 미만은 회색(단정 제외). 단원명을 누르면 해당
          단원 학습으로 이동합니다.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {groups.map((group) => (
          <div key={group.key}>
            <h3 className="text-foreground mb-1.5 flex items-center gap-1.5 text-sm font-bold">
              <LayersIcon className="text-muted-foreground size-3.5" />
              {group.name}
            </h3>
            {group.rows.length === 0 ? (
              <p className="border-border text-muted-foreground rounded-lg border border-dashed px-3 py-2.5 text-xs">
                {audience === "self"
                  ? "아직 이 과목의 정오문제 풀이 기록이 없습니다. 조문·단원 페이지의 정오문제 패널에서 지문을 풀면 여기에 쌓입니다."
                  : "이 과목의 정오문제 풀이 기록이 아직 없습니다."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[12rem]">단원</TableHead>
                      {MATRIX_TYPES.map((t) => (
                        <TableHead key={t} className="text-center">
                          {CHOICE_TYPE_LABEL[t]}
                        </TableHead>
                      ))}
                      <TableHead className="text-center">전체</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.rows.filter(isVisible).map((row) => (
                      <TableRow
                        key={row.nodeId ?? "null"}
                        className={cn(row.depth === 0 && "bg-muted/30")}
                      >
                        <TableCell className="font-medium">
                          <div
                            className="flex items-start gap-1"
                            style={{ paddingLeft: `${row.depth * 16}px` }}
                          >
                            {row.hasChildren && row.nodeId ? (
                              <button
                                type="button"
                                onClick={() => toggle(row.nodeId!)}
                                aria-expanded={expanded.has(row.nodeId)}
                                aria-label={
                                  expanded.has(row.nodeId)
                                    ? "하위 단원 접기"
                                    : "하위 단원 펼치기"
                                }
                                className="text-muted-foreground hover:text-foreground mt-0.5 shrink-0"
                              >
                                {expanded.has(row.nodeId) ? (
                                  <ChevronDownIcon className="size-3.5" />
                                ) : (
                                  <ChevronRightIcon className="size-3.5" />
                                )}
                              </button>
                            ) : (
                              <span className="w-3.5 shrink-0" />
                            )}
                            <div className="min-w-0 space-y-0.5">
                              {row.lawCode && row.nodeId ? (
                                <Link
                                  to={
                                    basis === "systematic"
                                      ? `/subjects/${row.lawCode}/systematic/${row.nodeId}`
                                      : `/subjects/${row.lawCode}/chapters/${row.nodeId}`
                                  }
                                  className="text-link hover:underline"
                                  viewTransition
                                >
                                  {row.label}
                                </Link>
                              ) : (
                                row.label
                              )}
                              {/* 다시 풀기 러너는 체계도 노드 전용(exact-node) — 조문 기준 행엔 미노출. */}
                              {audience === "self" &&
                              basis === "systematic" &&
                              !row.hasChildren &&
                              row.nodeId &&
                              row.lawCode ? (
                                <Link
                                  to={`/study/srs/ox?node=${row.nodeId}&subject=${row.lawCode}`}
                                  className="text-muted-foreground hover:text-link block text-[11px]"
                                  viewTransition
                                >
                                  ↻ 이 단원 다시 풀기
                                </Link>
                              ) : null}
                            </div>
                          </div>
                        </TableCell>
                        {MATRIX_TYPES.map((t) => (
                          <TableCell key={t} className="text-center">
                            <MatrixCell cell={row.cells[t]} />
                          </TableCell>
                        ))}
                        <TableCell className="text-center">
                          <MatrixCell cell={row.total} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// 평면 폴백 — tree 미제공(합성 입력 등) 시 기존 약점순 상위 N 표.
function FlatMatrix({
  diagnosis,
  audience,
}: {
  diagnosis: OxDiagnosis;
  audience: Audience;
}) {
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
          단원별 약한 지식종류. 셀 = 정답률 (시도수). 표본 N
          {diagnosis.minAttempts}건 미만은 회색(단정 제외). 단원명을 누르면 해당
          단원 학습으로 이동합니다.
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
                  <TableCell className="font-medium">
                    {node.lawCode && node.nodeId ? (
                      <div className="space-y-0.5">
                        <Link
                          to={`/subjects/${node.lawCode}/systematic/${node.nodeId}`}
                          className="text-link hover:underline"
                          viewTransition
                        >
                          {node.label}
                        </Link>
                        {audience === "self" ? (
                          <Link
                            to={`/study/srs/ox?node=${node.nodeId}&subject=${node.lawCode}`}
                            className="text-muted-foreground hover:text-link block text-[11px]"
                            viewTransition
                          >
                            ↻ 이 단원 다시 풀기
                          </Link>
                        ) : null}
                      </div>
                    ) : (
                      node.label
                    )}
                  </TableCell>
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

function MatrixCell({ cell }: { cell: OxCell | undefined }) {
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
        합격자 평균과의 지식종류별 비교는 분석에 동의한 합격자가{" "}
        {passer.minSample}명 이상 모이면 제공됩니다 (현재 {passer.sampleSize}
        명).
      </CardContent>
    </Card>
  );
}
