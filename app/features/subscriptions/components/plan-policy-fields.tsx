// 강의 수강 정책 편집 필드 (course/tpass 상품 전용) — plan_policies.
// admin-plans PlanForm 안에서 렌더. 입력 name 은 모두 policy_* (플랜 필드와 분리).
// 소비처: orders.server(수강기간·배수), playback.server(기기 슬롯), 학생 일시정지·연장.
import { type ReactNode, useState } from "react";

import { Input } from "~/core/components/ui/input";
import type { PlanPolicy } from "~/features/subscriptions/queries.server";

type CoursePlanRef = { planId: string; name: string };
type DurationMode = "multiplier" | "days" | "fixed";

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
  const initialMode: DurationMode =
    policy?.multiplier != null
      ? "multiplier"
      : policy?.fixedEndDate
        ? "fixed"
        : "days";
  const [mode, setMode] = useState<DurationMode>(initialMode);
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
              ["multiplier", "배수 (강의시간 × N)"],
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
          {mode === "multiplier" ? (
            <Field label="배수 (N)" hint="총 시청가능 = 강의 재생시간 × N">
              <Input
                name="policy_multiplier"
                type="number"
                min={0}
                step="0.1"
                defaultValue={policy?.multiplier ?? 2}
                className={numInput}
              />
            </Field>
          ) : null}
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

      {/* 기기 · 다운로드 */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Check
            name="policy_allowPc"
            label="PC 수강 허용"
            defaultChecked={policy?.allowPc ?? true}
          />
          <Field label="PC 최대 기기 수">
            <Input
              name="policy_maxDevicesPc"
              type="number"
              min={0}
              max={20}
              defaultValue={policy?.maxDevicesPc ?? 1}
              className={numInput}
            />
          </Field>
        </div>
        <div className="space-y-1.5">
          <Check
            name="policy_allowMobile"
            label="모바일 수강 허용"
            defaultChecked={policy?.allowMobile ?? true}
          />
          <Field label="모바일 최대 기기 수">
            <Input
              name="policy_maxDevicesMobile"
              type="number"
              min={0}
              max={20}
              defaultValue={policy?.maxDevicesMobile ?? 1}
              className={numInput}
            />
          </Field>
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

      {/* 연장 */}
      <div>
        <Check
          name="policy_extensionAllowed"
          label="수강 연장 허용"
          defaultChecked={policy?.extensionAllowed ?? false}
        />
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
