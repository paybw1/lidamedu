// feat-7-048 Stage B — 상담자가 학생의 월간 계획을 직접 쓰는 편집기.
//
// ★새 승인 경로를 만들지 않는다 — 편집은 in-flight 계획에만 하고, 승인은 기존
//   approve_study_plan RPC 로 넘긴다(RPC 가 submitted 만 받으므로 서버가 대신
//   제출한 뒤 호출). 승인본은 RLS 가 잠근다 — 고치려면 새 버전을 뜬다.
import { CheckIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { MinutesField } from "~/features/study-plans/components/minutes-field";
import {
  NodePicker,
  type NodeSuggestion,
} from "~/features/study-plans/components/node-picker";
import { SubjectSelect } from "~/features/study-plans/components/subject-select";
import {
  DAY_SCOPE_LABEL,
  PLAN_ACTIVITY_LABEL,
  PLAN_ACTIVITY_TYPES,
  type DayScope,
  type PlanActivityType,
} from "~/features/study-plans/labels";

const API = "/api/admin/study-plan";

export interface EditableItem {
  itemId: string;
  priority: number | null;
  title: string;
  nodeId: string | null;
  nodeLabel: string | null;
  activityType: PlanActivityType;
  dailyMinutes: number;
  dayScope: DayScope;
  startDate: string;
  endDate: string;
  subjectKind: string | null;
  subjectCode: string | null;
}

interface Res {
  ok?: true;
  error?: string;
}

/** 액션 성공 시 화면을 다시 불러오는 fetcher. */
function useActionFetcher(onDone: () => void) {
  const fetcher = useFetcher<Res>();
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && "ok" in fetcher.data && fetcher.data.ok) {
      onDone();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);
  return fetcher;
}

export function StaffPlanEditor({
  cohortId,
  userId,
  planId,
  status,
  items,
  weakNodes,
  periodStart,
  periodEnd,
  onDone,
}: {
  cohortId: string;
  userId: string;
  planId: string | null;
  status: string | null;
  items: EditableItem[];
  weakNodes: NodeSuggestion[];
  periodStart: string;
  periodEnd: string;
  onDone: () => void;
}) {
  const fetcher = useActionFetcher(onDone);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const busy = fetcher.state !== "idle";
  const error = fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;

  const ensurePlan = () => {
    const fd = new FormData();
    fd.set("intent", "ensure_editable_plan");
    fd.set("cohortId", cohortId);
    fd.set("userId", userId);
    fetcher.submit(fd, { method: "post", action: API });
  };

  // 계획이 없거나 승인본뿐이면 — 편집 대상을 먼저 확보한다.
  if (!planId || status === "approved") {
    return (
      <div className="border-t px-4 py-3">
        {error ? <p className="mb-2 text-xs text-rose-600">{error}</p> : null}
        <Button size="sm" variant="outline" disabled={busy} onClick={ensurePlan}>
          <PencilIcon className="size-3.5" />
          {status === "approved" ? "새 버전으로 수정" : "계획 직접 작성"}
        </Button>
        <p className="text-muted-foreground mt-1.5 text-[11px]">
          {status === "approved"
            ? "승인본은 잠겨 있습니다 — 수정하면 다음 버전 초안이 만들어집니다."
            : "상담 중에 계획을 대신 작성하고 바로 승인할 수 있습니다."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 border-t px-4 py-3">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
          계획 직접 편집
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[11px]"
          disabled={busy}
          onClick={() => {
            setAdding((v) => !v);
            setEditingId(null);
          }}
        >
          <PlusIcon className="size-3" /> 항목 추가
        </Button>
      </div>

      {adding ? (
        <ItemForm
          planId={planId}
          cohortId={cohortId}
          weakNodes={weakNodes}
          periodStart={periodStart}
          periodEnd={periodEnd}
          onDone={() => {
            setAdding(false);
            onDone();
          }}
          onCancel={() => setAdding(false)}
        />
      ) : null}

      {items.length > 0 ? (
        <ul className="divide-border divide-y rounded-lg border">
          {items.map((it) =>
            editingId === it.itemId ? (
              <li key={it.itemId} className="p-2">
                <ItemForm
                  planId={planId}
                  cohortId={cohortId}
                  item={it}
                  weakNodes={weakNodes}
                  periodStart={periodStart}
                  periodEnd={periodEnd}
                  onDone={() => {
                    setEditingId(null);
                    onDone();
                  }}
                  onCancel={() => setEditingId(null)}
                />
              </li>
            ) : (
              <li key={it.itemId} className="flex items-center gap-2 px-2 py-1.5 text-[11px]">
                {/* ★제목만 보여 주면 항목마다 「수정」을 열어 봐야 기간을 알 수 있다
                    (신고 8b192567). 아래 검토 패널과 같은 형식으로 활동·요일범위·
                    하루 분량·기간을 함께 적는다. */}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{it.title}</span>
                  <span className="text-muted-foreground block truncate text-[10px] tabular-nums">
                    {PLAN_ACTIVITY_LABEL[it.activityType]} · {DAY_SCOPE_LABEL[it.dayScope]} 하루{" "}
                    {it.dailyMinutes}분 · {it.startDate.slice(5)}~{it.endDate.slice(5)}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5 text-[11px]"
                  onClick={() => {
                    setEditingId(it.itemId);
                    setAdding(false);
                  }}
                >
                  수정
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5 text-[11px] text-rose-600"
                  disabled={busy}
                  onClick={() => {
                    if (!confirm("이 항목을 삭제할까요?")) return;
                    const fd = new FormData();
                    fd.set("intent", "delete_plan_item");
                    fd.set("cohortId", cohortId);
                    fd.set("planId", planId);
                    fd.set("itemId", it.itemId);
                    fetcher.submit(fd, { method: "post", action: API });
                  }}
                >
                  <Trash2Icon className="size-3" />
                </Button>
              </li>
            ),
          )}
        </ul>
      ) : (
        <p className="text-muted-foreground py-3 text-center text-[11px]">
          항목을 추가하세요.
        </p>
      )}

      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
      <div className="flex justify-end">
        <Button
          size="sm"
          disabled={busy || items.length === 0}
          onClick={() => {
            if (!confirm("저장한 계획을 승인할까요? 승인 후 항목은 잠기고, 학생에게 알림이 갑니다.")) {
              return;
            }
            const fd = new FormData();
            fd.set("intent", "save_and_approve");
            fd.set("cohortId", cohortId);
            fd.set("planId", planId);
            fetcher.submit(fd, { method: "post", action: API });
          }}
        >
          <CheckIcon className="size-3.5" /> 저장하고 승인
        </Button>
      </div>
    </div>
  );
}

function ItemForm({
  planId,
  cohortId,
  item,
  weakNodes,
  periodStart,
  periodEnd,
  onDone,
  onCancel,
}: {
  planId: string;
  cohortId: string;
  item?: EditableItem;
  weakNodes: NodeSuggestion[];
  periodStart: string;
  periodEnd: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const fetcher = useActionFetcher(onDone);
  const [node, setNode] = useState<{ id: string | null; label: string | null }>({
    id: item?.nodeId ?? null,
    label: item?.nodeLabel ?? null,
  });
  const error = fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;

  return (
    <fetcher.Form
      method="post"
      action={API}
      className="bg-muted/40 space-y-2 rounded-lg p-2"
    >
      <input type="hidden" name="intent" value="upsert_plan_item" />
      <input type="hidden" name="cohortId" value={cohortId} />
      <input type="hidden" name="planId" value={planId} />
      {item ? <input type="hidden" name="itemId" value={item.itemId} /> : null}
      <input type="hidden" name="nodeId" value={node.id ?? ""} />

      <div className="grid grid-cols-[3rem_1fr] gap-2">
        <div>
          <label className="text-muted-foreground text-[11px]">순위</label>
          <Input
            name="priority"
            type="number"
            min={1}
            max={99}
            defaultValue={item?.priority ?? ""}
            className="mt-0.5 h-8 px-1.5 text-center text-xs tabular-nums"
          />
        </div>
        <div>
          <label className="text-muted-foreground text-[11px]">항목 *</label>
          <Input
            name="title"
            required
            maxLength={200}
            defaultValue={item?.title ?? ""}
            placeholder="예: 특허법 진보성 회독 2회"
            className="mt-0.5 h-8 text-xs"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div>
          <label className="text-muted-foreground text-[11px]">활동</label>
          <select
            name="activityType"
            defaultValue={item?.activityType ?? "review"}
            className="border-input bg-background mt-0.5 h-8 w-full rounded-md border px-1.5 text-xs"
          >
            {PLAN_ACTIVITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {PLAN_ACTIVITY_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        <MinutesField
          label="하루 목표"
          name="dailyMinutes"
          defaultMinutes={item?.dailyMinutes ?? 60}
          required
        />
        <div>
          <label className="text-muted-foreground text-[11px]">요일</label>
          <select
            name="dayScope"
            defaultValue={item?.dayScope ?? "all"}
            className="border-input bg-background mt-0.5 h-8 w-full rounded-md border px-1.5 text-xs"
          >
            {(Object.keys(DAY_SCOPE_LABEL) as DayScope[]).map((s) => (
              <option key={s} value={s}>
                {DAY_SCOPE_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-1">
          <div>
            <label className="text-muted-foreground text-[11px]">시작</label>
            <Input
              name="startDate"
              type="date"
              required
              min={periodStart}
              max={periodEnd}
              defaultValue={item?.startDate ?? periodStart}
              className="mt-0.5 h-8 px-1 text-[11px]"
            />
          </div>
          <div>
            <label className="text-muted-foreground text-[11px]">종료</label>
            <Input
              name="endDate"
              type="date"
              required
              min={periodStart}
              max={periodEnd}
              defaultValue={item?.endDate ?? periodEnd}
              className="mt-0.5 h-8 px-1 text-[11px]"
            />
          </div>
        </div>
      </div>

      {/* 자연과학·기타는 단원에서 파생할 근거가 없어 직접 고른다(feat-7-048 D5) */}
      <SubjectSelect
        defaultKind={item?.subjectKind}
        defaultCode={item?.subjectCode}
        hint="(자연과학·기타는 직접)"
      />

      {/* 노드 미연결 허용(E1) — 약점 회피 신호는 노드가 있어야 잡힌다 */}
      <NodePicker
        weakNodes={weakNodes}
        recentNodes={[]}
        value={node.id}
        valueLabel={node.label}
        onChange={(id, label) => setNode({ id, label })}
      />

      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
      <div className="flex justify-end gap-1.5">
        <Button size="sm" variant="ghost" type="button" onClick={onCancel}>
          취소
        </Button>
        <Button size="sm" type="submit" disabled={fetcher.state !== "idle"}>
          저장
        </Button>
      </div>
    </fetcher.Form>
  );
}
