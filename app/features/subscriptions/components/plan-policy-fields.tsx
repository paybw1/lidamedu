// 강의 수강 정책 편집 필드 (course/tpass 상품 전용) — plan_policies.
// admin-plans PlanForm 안에서 렌더. 입력 name 은 모두 policy_* (플랜 필드와 분리).
// 소비처: orders.server(수강기간·배수), playback.server(기기 슬롯), 학생 일시정지·연장.
import { type ReactNode, useState } from "react";

import { Input } from "~/core/components/ui/input";
import type { PlanPolicy } from "~/features/subscriptions/queries.server";

type CoursePlanRef = { planId: string; name: string };
// ★배수는 수강기간 방식이 아니다(원장 요청 2026-08-20).
//   수강기간 = 언제까지 볼 수 있는가(일수 또는 종료일) — DB 가 둘 중 하나를 반드시 요구한다.
//   배수     = 강의시간 대비 얼마나 볼 수 있는가 — 위와 무관한 별개 축.
//   종전에는 배수가 수강기간 방식의 세 번째 선택지라, 배수를 고르면 일수·종료일이 둘 다
//   비어 plan_policies_check 에 걸려 저장 자체가 실패했다(요청 ①의 원인).
type DurationMode = "days" | "fixed";

// 배수 프리셋 — 무제한은 값 없음(null)으로 저장한다.
const MULTIPLIER_PRESETS = ["1", "1.5", "2", "3"] as const;
const UNLIMITED = "unlimited";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-muted-foreground text-[11px] font-semibold">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="text-muted-foreground/70 text-[10px]">{hint}</span>
      ) : null}
    </label>
  );
}

function Check({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs">
      <input
        type="checkbox"
        name={name}
        value="1"
        defaultChecked={defaultChecked}
        className="size-3.5"
      />
      {label}
    </label>
  );
}

const numInput = "h-8 text-xs";

export function PlanPolicyFields({
  policy,
  coursePlans,
  currentPlanId,
}: {
  policy?: PlanPolicy;
  coursePlans: CoursePlanRef[];
  currentPlanId?: string;
}) {
  const initialMode: DurationMode = policy?.fixedEndDate ? "fixed" : "days";
  const [mode, setMode] = useState<DurationMode>(initialMode);
  // 배수 — 프리셋에 없는 기존 값(예: 2.5)은 "직접 입력"으로 살린다.
  const savedMul = policy?.multiplier ?? null;
  const initialMul =
    savedMul == null
      ? UNLIMITED
      : MULTIPLIER_PRESETS.includes(String(savedMul) as never)
        ? String(savedMul)
        : "custom";
  const [mulChoice, setMulChoice] = useState<string>(initialMul);
  const extSet = new Set(policy?.extensionPlanIds ?? []);
  // 연장 대상 후보 — 자기 자신 제외.
  const extCandidates = coursePlans.filter((c) => c.planId !== currentPlanId);

  return (
    <div className="border-border bg-muted/30 space-y-3 rounded-lg border border-dashed p-3">
      <p className="text-muted-foreground font-mono text-[11px] font-semibold tracking-[0.08em] uppercase">
        강의 수강 정책 (DRM)
      </p>

      {/* 수강기간 */}
      <div>
        <p className="text-muted-foreground mb-1.5 text-[11px] font-semibold">
          수강기간 방식
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {(
            [
              ["days", "고정 일수"],
              ["fixed", "고정 종료일"],
            ] as [DurationMode, string][]
          ).map(([val, label]) => (
            <label key={val} className="inline-flex items-center gap-1 text-xs">
              <input
                type="radio"
                name="policy_durationMode"
                value={val}
                checked={mode === val}
                onChange={() => setMode(val)}
                className="size-3.5"
              />
              {label}
            </label>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {mode === "days" ? (
            <Field label="수강기간 (일)" hint="지급일로부터">
              <Input
                name="policy_durationDays"
                type="number"
                min={0}
                max={3650}
                defaultValue={policy?.durationDays ?? 180}
                className={numInput}
              />
            </Field>
          ) : null}
          {mode === "fixed" ? (
            <Field label="종료일" hint="이 날짜까지 수강">
              <Input
                name="policy_fixedEndDate"
                type="date"
                defaultValue={policy?.fixedEndDate ?? ""}
                className={numInput}
              />
            </Field>
          ) : null}
        </div>
      </div>

      {/* 배수 — 수강기간과 독립된 축(원장 요청 2026-08-20). 어떤 수강기간 방식이든 함께 지정한다. */}
      <div>
        <p className="text-muted-foreground mb-1.5 text-[11px] font-semibold">
          배수 (강의시간 대비 누적 시청 허용량)
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {(
            [
              [UNLIMITED, "무제한"],
              ...MULTIPLIER_PRESETS.map((v) => [v, `${v}배수`]),
              ["custom", "직접 입력"],
            ] as [string, string][]
          ).map(([val, label]) => (
            <label key={val} className="inline-flex items-center gap-1 text-xs">
              <input
                type="radio"
                name="policy_multiplierChoice"
                value={val}
                checked={mulChoice === val}
                onChange={() => setMulChoice(val)}
                className="size-3.5"
              />
              {label}
            </label>
          ))}
        </div>
        {mulChoice === "custom" ? (
          <div className="mt-2 max-w-[12rem]">
            <Field label="배수 (N)" hint="1 이상. 총 시청가능 = 강의 재생시간 × N">
              <Input
                name="policy_multiplier"
                type="number"
                min={1}
                max={100}
                step="0.1"
                defaultValue={savedMul ?? 2}
                className={numInput}
              />
            </Field>
          </div>
        ) : null}
        <p className="text-muted-foreground/70 mt-1 text-[10px]">
          무제한 = 시청 시간 제한 없음(수강기간만 적용). 기존 수강권에는 소급되지
          않고 새 지급분부터 반영됩니다.
        </p>
      </div>

      {/* 기기 · 다운로드 */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {/* ★기기 수 입력란은 두지 않는다(요청서 §4.1) — 기기 허용은 콜러스 정책이
            단독으로 정한다. 두 곳에서 정하면 어느 쪽이 막았는지 알 수 없다. */}
        <div className="space-y-1.5">
          <Check
            name="policy_allowPc"
            label="PC 수강 허용"
            defaultChecked={policy?.allowPc ?? true}
          />
        </div>
        <div className="space-y-1.5">
          <Check
            name="policy_allowMobile"
            label="모바일 수강 허용"
            defaultChecked={policy?.allowMobile ?? true}
          />
        </div>
      </div>
      <Check
        name="policy_allowDownload"
        label="다운로드 허용"
        defaultChecked={policy?.allowDownload ?? false}
      />

      {/* 일시정지 */}
      <div>
        <Check
          name="policy_pauseAllowed"
          label="수강기간 일시정지 허용"
          defaultChecked={policy?.pauseAllowed ?? false}
        />
        <div className="mt-2 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Field label="최대 횟수">
            <Input
              name="policy_pauseMaxCount"
              type="number"
              min={0}
              max={50}
              defaultValue={policy?.pauseMaxCount ?? 2}
              className={numInput}
            />
          </Field>
          <Field label="1회 최소일">
            <Input
              name="policy_pauseMinDays"
              type="number"
              min={0}
              max={365}
              defaultValue={policy?.pauseMinDays ?? 7}
              className={numInput}
            />
          </Field>
          <Field label="1회 최대일">
            <Input
              name="policy_pauseMaxDays"
              type="number"
              min={0}
              max={3650}
              defaultValue={policy?.pauseMaxDays ?? 60}
              className={numInput}
            />
          </Field>
          <Field label="누적 최대일">
            <Input
              name="policy_pauseTotalDays"
              type="number"
              min={0}
              max={3650}
              defaultValue={policy?.pauseTotalDays ?? 90}
              className={numInput}
            />
          </Field>
        </div>
      </div>

      {/* 연장 — feat-11-010. 빈 값 = 운영 기본값(운영관리 › 수강연장 기본값)을 따른다. */}
      <div>
        <Field label="유료 수강기간 연장">
          <select
            name="policy_extensionAllowed"
            defaultValue={
              policy?.extensionAllowed === true
                ? "1"
                : policy?.extensionAllowed === false
                  ? "0"
                  : ""
            }
            className="border-input bg-background h-8 rounded-md border px-2 text-xs"
          >
            <option value="">기본값 따름</option>
            <option value="1">허용</option>
            <option value="0">불허</option>
          </select>
        </Field>
        <div className="mt-1.5 grid grid-cols-3 gap-2">
          <Field label="연장비용(원)">
            <Input
              name="policy_extensionPriceKrw"
              type="number"
              min={0}
              placeholder="기본값"
              defaultValue={policy?.extensionPriceKrw ?? ""}
              className={numInput}
            />
          </Field>
          <Field label="최대횟수(0=무제한)">
            <Input
              name="policy_extensionMaxCount"
              type="number"
              min={0}
              max={100}
              placeholder="기본값"
              defaultValue={policy?.extensionMaxCount ?? ""}
              className={numInput}
            />
          </Field>
          <Field label="연장일수(0=학습일수)">
            <Input
              name="policy_extensionDays"
              type="number"
              min={0}
              max={3650}
              placeholder="기본값"
              defaultValue={policy?.extensionDays ?? ""}
              className={numInput}
            />
          </Field>
        </div>
        <p className="text-muted-foreground mt-1 text-[11px]">
          비워 두면 운영 기본값을 따릅니다. 온라인 단과강의에만 적용됩니다.
        </p>
        {extCandidates.length > 0 ? (
          <div className="mt-1.5">
            <p className="text-muted-foreground mb-1 text-[11px] font-semibold">
              연장 시 재지급할 강의 상품 (선택)
            </p>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {extCandidates.map((c) => (
                <label
                  key={c.planId}
                  className="inline-flex items-center gap-1 text-[11px]"
                >
                  <input
                    type="checkbox"
                    name="policy_extensionPlanIds"
                    value={c.planId}
                    defaultChecked={extSet.has(c.planId)}
                    className="size-3.5"
                  />
                  <span className="text-muted-foreground">{c.name}</span>
                </label>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
