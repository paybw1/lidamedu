// feat-7-020 — 커리큘럼 편집 (메타 + 주차 + 항목).
// 1차 release: kind 별 reference 는 UUID 직접 입력. 검색 UI 는 후속.

import {
  BookCheckIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Link,
  data,
  useFetcher,
  useNavigate,
  useRevalidator,
} from "react-router";

import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import { Separator } from "~/core/components/ui/separator";
import makeServerClient from "~/core/lib/supa-client.server";
import { ContentPicker } from "~/features/admin/components/content-picker";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip, Field, StatusChip } from "~/features/admin/components/admin-ui";
import { getCurriculumWithWeeks } from "~/features/curricula/queries.server";
import {
  CURRICULUM_ITEM_KINDS,
  CURRICULUM_ITEM_KIND_LABEL,
  type CurriculumDetail,
  type CurriculumItem,
  type CurriculumItemKind,
  type CurriculumWeek,
} from "~/features/curricula/labels";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-curriculum-edit";

export const meta: Route.MetaFunction = ({ data: d }) => {
  if (!d || !d.curriculum)
    return [{ title: "커리큘럼 | Lidam Patent Attorney Academy" }];
  return [{ title: `${d.curriculum.name} | Lidam Patent Attorney Academy` }];
};

export async function loader({ params, request }: Route.LoaderArgs) {
  if (!params.curriculumId) throw data("Missing curriculumId", { status: 404 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const curriculum = await getCurriculumWithWeeks(params.curriculumId);
  if (!curriculum) throw data("Not found", { status: 404 });
  return { curriculum, role };
}

// 안정적(불변) reload 콜백. 매 렌더 새 함수를 반환하면, 제출 성공 후 fetcher.data 가
// {ok:true} 로 남은 상태에서 자식 effect 의 deps(reload 식별자)가 매 렌더 바뀌어
// revalidate(navigate) 가 무한 호출된다(항목 연속 추가 시 무한로딩). useRevalidator 를
// ref 로 잡고 useCallback([]) 으로 고정해 루프를 차단한다. (cf. fix 5fab10c GS 동일 패턴)
function useReload() {
  const revalidator = useRevalidator();
  const ref = useRef(revalidator);
  ref.current = revalidator;
  return useCallback(() => ref.current.revalidate(), []);
}

export default function AdminCurriculumEdit({ loaderData }: Route.ComponentProps) {
  const { curriculum, role } = loaderData;
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const reload = useReload();
  const navigate = useNavigate();

  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data &&
      "ok" in fetcher.data &&
      fetcher.data.ok
    ) {
      reload();
    }
  }, [fetcher.state, fetcher.data, reload]);

  return (
    <AdminShell
      cluster="cohorts"
      role={role}
      width={960}
      title={curriculum.name}
      desc={`${curriculum.durationWeeks}주 · 주차 ${curriculum.weekCount} · 항목 ${curriculum.itemCount}`}
      headerRight={
        <div className="flex gap-2">
          <fetcher.Form method="post" action="/api/admin/curriculum">
            <input type="hidden" name="intent" value="update" />
            <input type="hidden" name="curriculumId" value={curriculum.curriculumId} />
            <input type="hidden" name="isPublished" value={curriculum.isPublished ? "0" : "1"} />
            <Button
              type="submit"
              size="sm"
              variant={curriculum.isPublished ? "outline" : "default"}
              disabled={fetcher.state !== "idle"}
            >
              {curriculum.isPublished ? "발행 취소" : "발행"}
            </Button>
          </fetcher.Form>
          <fetcher.Form method="post" action="/api/admin/curriculum">
            <input type="hidden" name="intent" value="delete" />
            <input type="hidden" name="curriculumId" value={curriculum.curriculumId} />
            <Button
              type="submit"
              size="sm"
              variant="outline"
              className="border-rose-300 text-rose-600 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-950/20"
              disabled={fetcher.state !== "idle"}
              onClick={(e) => {
                if (!confirm(`"${curriculum.name}" 을(를) 삭제(soft)합니까?`)) {
                  e.preventDefault();
                  return;
                }
                setTimeout(() => navigate("/admin/curricula"), 300);
              }}
            >
              <Trash2Icon className="size-3.5" /> 삭제
            </Button>
          </fetcher.Form>
        </div>
      }
    >
      <Link
        to="/admin/curricula"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-xs"
      >
        ← 커리큘럼 목록
      </Link>

      {/* 상태 칩 + 적용 반 */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusChip
          status={curriculum.isPublished ? "published" : "draft"}
          label={curriculum.isPublished ? "발행" : "초안"}
        />
        {curriculum.cohortCount > 0 ? (
          <Chip tone="neutral">적용 반 {curriculum.cohortCount}</Chip>
        ) : null}
        {curriculum.description ? (
          <p className="text-muted-foreground w-full text-xs whitespace-pre-line">
            {curriculum.description}
          </p>
        ) : null}
      </div>

      <CurriculumMetaForm curriculum={curriculum} />

      <Separator className="my-6" />

      <section className="space-y-4">
        <h2 className="inline-flex items-center gap-2 text-base font-semibold">
          <BookCheckIcon className="size-4" />
          주차 ({curriculum.weeks.length} / {curriculum.durationWeeks})
        </h2>
        {curriculum.weeks.map((w) => (
          <WeekCard
            key={w.weekId}
            curriculumId={curriculum.curriculumId}
            week={w}
          />
        ))}
        <NewWeekForm
          curriculumId={curriculum.curriculumId}
          nextWeekNumber={
            curriculum.weeks.length === 0
              ? 1
              : Math.max(...curriculum.weeks.map((w) => w.weekNumber)) + 1
          }
        />
      </section>
    </AdminShell>
  );
}

// ─── 메타 편집 폼 ───

function CurriculumMetaForm({ curriculum }: { curriculum: CurriculumDetail }) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const reload = useReload();
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data &&
      "ok" in fetcher.data &&
      fetcher.data.ok
    ) {
      setEditing(false);
      reload();
    }
  }, [fetcher.state, fetcher.data, reload]);

  if (!editing) {
    return (
      <div className="mb-4">
        <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
          <PencilIcon className="size-3.5" /> 메타 편집
        </Button>
      </div>
    );
  }

  return (
    <fetcher.Form
      method="post"
      action="/api/admin/curriculum"
      className="bg-card mb-4 space-y-3 rounded-xl border p-4 shadow-sm"
    >
      <input type="hidden" name="intent" value="update" />
      <input type="hidden" name="curriculumId" value={curriculum.curriculumId} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="이름" htmlFor="meta-name">
          <Input
            id="meta-name"
            name="name"
            defaultValue={curriculum.name}
            required
            maxLength={200}
            className="h-8 text-xs"
          />
        </Field>
        <Field label="기간 (주)" htmlFor="meta-dur">
          <Input
            id="meta-dur"
            name="durationWeeks"
            type="number"
            min={1}
            max={52}
            defaultValue={curriculum.durationWeeks}
            className="h-8 text-xs tabular-nums"
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="설명" htmlFor="meta-desc">
            <textarea
              id="meta-desc"
              name="description"
              defaultValue={curriculum.description ?? ""}
              maxLength={2000}
              rows={2}
              className="border-input bg-background w-full rounded-md border px-2 py-1 text-xs"
            />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Label className="text-muted-foreground text-[11px]">과목</Label>
          <div className="mt-1 flex flex-wrap gap-2">
            {LAW_SUBJECT_SLUGS.map((s) => (
              <label
                key={s}
                className="border-input flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-xs"
              >
                <input
                  type="checkbox"
                  name="subjectLaws"
                  value={s}
                  defaultChecked={curriculum.subjectLaws.includes(s)}
                />
                {LAW_SUBJECTS[s].shortName}
              </label>
            ))}
          </div>
        </div>
      </div>
      {fetcher.data && "error" in fetcher.data ? (
        <p className="text-rose-600 text-xs">{fetcher.data.error}</p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
          <XIcon className="size-3.5" /> 취소
        </Button>
        <Button type="submit" size="sm" disabled={fetcher.state !== "idle"}>
          저장
        </Button>
      </div>
    </fetcher.Form>
  );
}

// ─── 주차 카드 ───

function WeekCard({
  curriculumId,
  week,
}: {
  curriculumId: string;
  week: CurriculumWeek;
}) {
  const [editing, setEditing] = useState(false);
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const reload = useReload();

  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data &&
      "ok" in fetcher.data &&
      fetcher.data.ok
    ) {
      setEditing(false);
      reload();
    }
  }, [fetcher.state, fetcher.data, reload]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <Chip tone="neutral">Week {week.weekNumber}</Chip>
            <h3 className="mt-1.5 text-sm font-semibold">{week.title}</h3>
            {week.goalMd ? (
              <p className="text-muted-foreground mt-1 text-xs whitespace-pre-line">
                {week.goalMd}
              </p>
            ) : null}
          </div>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)}>
              <PencilIcon className="size-3" />
            </Button>
            <fetcher.Form method="post" action="/api/admin/curriculum">
              <input type="hidden" name="intent" value="delete_week" />
              <input type="hidden" name="weekId" value={week.weekId} />
              <Button
                type="submit"
                size="sm"
                variant="ghost"
                className="text-rose-600 hover:text-rose-700"
                onClick={(e) => {
                  if (!confirm(`Week ${week.weekNumber} 을(를) 삭제합니까? (항목도 함께 삭제)`)) {
                    e.preventDefault();
                  }
                }}
                disabled={fetcher.state !== "idle"}
              >
                <Trash2Icon className="size-3" />
              </Button>
            </fetcher.Form>
          </div>
        </div>
      </CardHeader>
      <Separator />
      <CardContent className="space-y-3 pt-3">
        {editing ? (
          <WeekEditForm
            curriculumId={curriculumId}
            week={week}
            onClose={() => setEditing(false)}
          />
        ) : null}

        {week.items.length === 0 ? (
          <p className="text-muted-foreground py-2 text-center text-xs">
            아직 학습 항목이 없습니다.
          </p>
        ) : (
          <ul className="divide-border divide-y">
            {week.items.map((item) => (
              <ItemRow key={item.itemId} item={item} />
            ))}
          </ul>
        )}

        <NewItemForm weekId={week.weekId} nextOrd={week.items.length} />
      </CardContent>
    </Card>
  );
}

function WeekEditForm({
  curriculumId,
  week,
  onClose,
}: {
  curriculumId: string;
  week: CurriculumWeek;
  onClose: () => void;
}) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const reload = useReload();
  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data &&
      "ok" in fetcher.data &&
      fetcher.data.ok
    ) {
      onClose();
      reload();
    }
  }, [fetcher.state, fetcher.data, onClose, reload]);
  return (
    <fetcher.Form
      method="post"
      action="/api/admin/curriculum"
      className="bg-muted/30 space-y-2 rounded-xl border p-3"
    >
      <input type="hidden" name="intent" value="upsert_week" />
      <input type="hidden" name="curriculumId" value={curriculumId} />
      <input type="hidden" name="weekId" value={week.weekId} />
      <div className="grid grid-cols-[80px_1fr] gap-2">
        <Input
          name="weekNumber"
          type="number"
          min={1}
          defaultValue={week.weekNumber}
          className="h-8 text-xs tabular-nums"
        />
        <Input
          name="title"
          defaultValue={week.title}
          required
          maxLength={200}
          className="h-8 text-xs"
          placeholder="주차 제목"
        />
      </div>
      <textarea
        name="goalMd"
        defaultValue={week.goalMd ?? ""}
        rows={2}
        maxLength={2000}
        placeholder="학습 목표"
        className="border-input bg-background w-full rounded-md border px-2 py-1 text-xs"
      />
      {fetcher.data && "error" in fetcher.data ? (
        <p className="text-rose-600 text-xs">{fetcher.data.error}</p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          취소
        </Button>
        <Button type="submit" size="sm" disabled={fetcher.state !== "idle"}>
          저장
        </Button>
      </div>
    </fetcher.Form>
  );
}

function NewWeekForm({
  curriculumId,
  nextWeekNumber,
}: {
  curriculumId: string;
  nextWeekNumber: number;
}) {
  const [open, setOpen] = useState(false);
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const reload = useReload();
  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data &&
      "ok" in fetcher.data &&
      fetcher.data.ok
    ) {
      setOpen(false);
      reload();
    }
  }, [fetcher.state, fetcher.data, reload]);
  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <PlusIcon className="size-3.5" /> 주차 추가
      </Button>
    );
  }
  return (
    <fetcher.Form
      method="post"
      action="/api/admin/curriculum"
      className="bg-card space-y-2 rounded-xl border p-3 shadow-sm"
    >
      <input type="hidden" name="intent" value="upsert_week" />
      <input type="hidden" name="curriculumId" value={curriculumId} />
      <div className="grid grid-cols-[80px_1fr] gap-2">
        <Input
          name="weekNumber"
          type="number"
          min={1}
          defaultValue={nextWeekNumber}
          className="h-8 text-xs tabular-nums"
        />
        <Input
          name="title"
          required
          maxLength={200}
          className="h-8 text-xs"
          placeholder="주차 제목 (예: 특허법 발명/특허요건)"
        />
      </div>
      <textarea
        name="goalMd"
        rows={2}
        maxLength={2000}
        placeholder="학습 목표 (선택)"
        className="border-input bg-background w-full rounded-md border px-2 py-1 text-xs"
      />
      {fetcher.data && "error" in fetcher.data ? (
        <p className="text-rose-600 text-xs">{fetcher.data.error}</p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          취소
        </Button>
        <Button type="submit" size="sm" disabled={fetcher.state !== "idle"}>
          추가
        </Button>
      </div>
    </fetcher.Form>
  );
}

// ─── 항목 ───

function ItemRow({ item }: { item: CurriculumItem }) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const reload = useReload();
  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data &&
      "ok" in fetcher.data &&
      fetcher.data.ok
    ) {
      reload();
    }
  }, [fetcher.state, fetcher.data, reload]);

  const refLabel =
    item.kind === "article" || item.kind === "recitation"
      ? (item.articleLabel ?? item.articleId ?? "—")
      : item.kind === "case"
        ? (item.caseTitle ?? item.caseId ?? "—")
        : item.kind === "problem"
          ? (item.problemSnippet ?? item.problemId ?? "—")
          : item.kind === "blank_set"
            ? (item.blankSetLabel ?? item.blankSetId ?? "—")
            : item.lectureTitle ?? item.lectureUrl ?? "—";

  return (
    <li className="flex items-center gap-2 py-2">
      <span className="text-muted-foreground w-6 text-center text-xs tabular-nums">
        {item.ord + 1}
      </span>
      <Chip tone="outline">{CURRICULUM_ITEM_KIND_LABEL[item.kind]}</Chip>
      <div className="min-w-0 flex-1 truncate text-xs">{refLabel}</div>
      {item.targetQuantity ? (
        <Chip tone="neutral">x{item.targetQuantity}</Chip>
      ) : null}
      {item.note ? (
        <span className="text-muted-foreground truncate text-[10px] italic">
          {item.note}
        </span>
      ) : null}
      <fetcher.Form method="post" action="/api/admin/curriculum">
        <input type="hidden" name="intent" value="delete_item" />
        <input type="hidden" name="itemId" value={item.itemId} />
        <Button
          type="submit"
          size="icon"
          variant="ghost"
          className="size-6 text-rose-600 hover:text-rose-700"
          onClick={(e) => {
            if (!confirm("이 항목을 삭제합니까?")) {
              e.preventDefault();
            }
          }}
          disabled={fetcher.state !== "idle"}
        >
          <Trash2Icon className="size-3" />
        </Button>
      </fetcher.Form>
    </li>
  );
}

function NewItemForm({ weekId, nextOrd }: { weekId: string; nextOrd: number }) {
  const [kind, setKind] = useState<CurriculumItemKind>("article");
  const [open, setOpen] = useState(false);
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const reload = useReload();
  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data &&
      "ok" in fetcher.data &&
      fetcher.data.ok
    ) {
      setOpen(false);
      reload();
    }
  }, [fetcher.state, fetcher.data, reload]);

  if (!open) {
    return (
      <Button size="sm" variant="outline" className="w-full" onClick={() => setOpen(true)}>
        <PlusIcon className="size-3.5" /> 항목 추가
      </Button>
    );
  }
  return (
    <fetcher.Form
      method="post"
      action="/api/admin/curriculum"
      className="bg-muted/30 space-y-2 rounded-xl border p-3"
    >
      <input type="hidden" name="intent" value="upsert_item" />
      <input type="hidden" name="weekId" value={weekId} />
      <input type="hidden" name="ord" value={nextOrd} />
      <div className="grid grid-cols-[140px_1fr] gap-2">
        <select
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as CurriculumItemKind)}
          className="border-input bg-background focus:border-primary h-8 rounded-md border px-2 text-xs outline-none"
        >
          {CURRICULUM_ITEM_KINDS.map((k) => (
            <option key={k} value={k}>
              {CURRICULUM_ITEM_KIND_LABEL[k]}
            </option>
          ))}
        </select>
        {kind === "lecture" ? (
          <Input
            name="lectureTitle"
            placeholder="강의 제목"
            maxLength={200}
            required
            className="h-8 text-xs"
          />
        ) : kind === "case" ? (
          <ContentPicker kind="case" name="caseId" required />
        ) : kind === "problem" ? (
          <ContentPicker kind="problem" name="problemId" required />
        ) : kind === "blank_set" ? (
          <ContentPicker kind="blank_set" name="blankSetId" required />
        ) : (
          <ContentPicker kind="article" name="articleId" required />
        )}
      </div>
      {kind === "lecture" ? (
        <div className="grid grid-cols-[1fr_100px] gap-2">
          <Input
            name="lectureUrl"
            type="url"
            placeholder="https://… (외부 영상 URL)"
            required
            maxLength={1000}
            className="h-8 text-xs"
          />
          <Input
            name="lectureDurationMin"
            type="number"
            min={0}
            placeholder="분"
            className="h-8 text-xs tabular-nums"
          />
        </div>
      ) : null}
      <div className="grid grid-cols-[100px_1fr] gap-2">
        <Input
          name="targetQuantity"
          type="number"
          min={0}
          placeholder="횟수 (선택)"
          className="h-8 text-xs tabular-nums"
        />
        <Input
          name="note"
          placeholder="메모 (선택)"
          maxLength={2000}
          className="h-8 text-xs"
        />
      </div>
      {fetcher.data && "error" in fetcher.data ? (
        <p className="text-rose-600 text-xs">{fetcher.data.error}</p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          취소
        </Button>
        <Button type="submit" size="sm" disabled={fetcher.state !== "idle"}>
          추가
        </Button>
      </div>
    </fetcher.Form>
  );
}
