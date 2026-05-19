// 통합 1차 모의고사 색인 (feat-10-005) — /latest/mcq/exams.
// 시험 = 여러 교시(mcq_packs) 묶음. 명칭 클릭 → 시험 러너. staff 는 시험 CRUD.

import {
  BookOpenCheckIcon,
  LayersIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  Link,
  data,
  useFetcher,
  useLocation,
  useNavigate,
} from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import { cn } from "~/core/lib/utils";
import {
  IndexCard,
  LatestEmpty,
  Pill,
} from "~/features/latest/components/latest-list";
import { MockExamShell } from "~/features/mcq-exams/components/mock-exam-shell";
import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";
import type { McqExamItem } from "~/features/mcq-exams/labels";
import { listExams } from "~/features/mcq-exams/queries.server";

import type { Route } from "./+types/mcq-exam-index";

export const meta: Route.MetaFunction = () => [
  { title: "1차 통합 모의고사 | Lidam Patent Attorney Academy" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  const exams = await listExams(client);
  return { exams, canEdit: role !== null };
}

const COLUMNS = ["No", "명칭", "교시", "합격 평균", "연도"];

export default function McqExamIndex({ loaderData }: Route.ComponentProps) {
  const { exams, canEdit } = loaderData;
  const [showAdd, setShowAdd] = useState(false);

  return (
    <MockExamShell
      category="full"
      width="index"
      title="1차 통합 모의고사"
      desc={`${exams.length.toLocaleString("ko-KR")}건 — 산업재산권법·민법·자연과학을 한 시험으로 묶어 과목별 과락과 전 과목 평균으로 합격을 판정합니다.`}
      headerRight={
        canEdit && !showAdd ? (
          <Button
            size="sm"
            className="h-9 rounded-full"
            onClick={() => setShowAdd(true)}
          >
            <PlusIcon className="size-3.5" /> 시험 추가
          </Button>
        ) : undefined
      }
    >
      {canEdit && showAdd ? (
        <div className="mb-3.5">
          <ExamForm mode="create" onClose={() => setShowAdd(false)} />
        </div>
      ) : null}

      {exams.length === 0 ? (
        <LatestEmpty
          icon={LayersIcon}
          tone="neutral"
          title="아직 등록된 통합 모의고사가 없습니다"
          body={
            canEdit
              ? "상단 '시험 추가' 로 통합 모의고사를 만든 뒤, 시험 화면에서 교시(공개된 모의 팩)를 구성하세요."
              : "통합 모의고사가 등록되면 이곳에 모입니다."
          }
        />
      ) : (
        <IndexCard>
          <table className="w-full min-w-[680px] border-collapse">
            <thead>
              <tr className="border-border bg-muted/60 border-b">
                {COLUMNS.map((label, i) => (
                  <th
                    key={label}
                    className={cn(
                      "text-muted-foreground px-3 py-3 font-mono text-[11px] font-semibold tracking-[0.04em] whitespace-nowrap uppercase",
                      i === 0 || i === 2 || i === 3
                        ? "text-center"
                        : "text-left",
                    )}
                  >
                    {label}
                  </th>
                ))}
                {canEdit ? <th className="w-20" /> : null}
              </tr>
            </thead>
            <tbody>
              {exams.map((e, i) => (
                <ExamRow
                  key={e.examId}
                  exam={e}
                  index={i + 1}
                  canEdit={canEdit}
                />
              ))}
            </tbody>
          </table>
        </IndexCard>
      )}
    </MockExamShell>
  );
}

function ExamRow({
  exam,
  index,
  canEdit,
}: {
  exam: McqExamItem;
  index: number;
  canEdit: boolean;
}) {
  return (
    <tr className="border-border/60 hover:bg-muted/40 border-b transition-colors">
      <td className="text-muted-foreground px-3 py-3 text-center text-[13px] tabular-nums">
        {index}
      </td>
      <td className="px-3 py-3">
        <Link
          to={`/latest/mcq/exam/${exam.examId}`}
          viewTransition
          className="hover:text-primary text-[13px] font-semibold"
        >
          {exam.title}
        </Link>
        {!exam.isPublished ? (
          <Pill tone="amber" className="ml-2">
            비공개
          </Pill>
        ) : null}
        {exam.paperCount === 0 ? (
          <Pill tone="rose" className="ml-1.5">
            교시 미구성
          </Pill>
        ) : null}
        {exam.description ? (
          <p className="text-muted-foreground mt-0.5 line-clamp-1 text-xs">
            {exam.description}
          </p>
        ) : null}
      </td>
      <td className="px-3 py-3 text-center text-[13px] tabular-nums">
        {exam.paperCount}교시
      </td>
      <td className="px-3 py-3 text-center text-[13px] tabular-nums">
        {exam.passAverage}점
      </td>
      <td className="text-muted-foreground px-3 py-3 text-[13px] tabular-nums">
        {exam.year
          ? `${exam.year}년${exam.examRoundNo ? ` ${exam.examRoundNo}회` : ""}`
          : "—"}
      </td>
      {canEdit ? (
        <td className="px-3 py-3 text-right">
          <ExamRowActions exam={exam} />
        </td>
      ) : null}
    </tr>
  );
}

function ExamRowActions({ exam }: { exam: McqExamItem }) {
  const [editing, setEditing] = useState(false);
  const delFetcher = useFetcher<{ ok?: true; error?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (
      delFetcher.state === "idle" &&
      delFetcher.data &&
      "ok" in delFetcher.data &&
      delFetcher.data.ok
    ) {
      navigate(location.pathname + location.search, {
        replace: true,
        preventScrollReset: true,
      });
    }
  }, [
    delFetcher.state,
    delFetcher.data,
    navigate,
    location.pathname,
    location.search,
  ]);

  if (editing) {
    return (
      <ExamForm mode="update" exam={exam} onClose={() => setEditing(false)} />
    );
  }
  return (
    <div className="inline-flex gap-1">
      <Button
        size="icon"
        variant="ghost"
        onClick={() => setEditing(true)}
        aria-label="수정"
        className="size-8 rounded-full"
      >
        <PencilIcon className="size-3.5" />
      </Button>
      <delFetcher.Form method="post" action="/api/admin/mcq-exam">
        <input type="hidden" name="intent" value="delete" />
        <input type="hidden" name="examId" value={exam.examId} />
        <Button
          type="submit"
          size="icon"
          variant="ghost"
          aria-label="삭제"
          className="size-8 rounded-full text-rose-600 hover:text-rose-700"
          disabled={delFetcher.state !== "idle"}
          onClick={(e) => {
            if (!confirm(`"${exam.title}" 시험을 삭제하시겠습니까?`)) {
              e.preventDefault();
            }
          }}
        >
          <Trash2Icon className="size-3.5" />
        </Button>
      </delFetcher.Form>
    </div>
  );
}

function ExamForm({
  mode,
  exam,
  onClose,
}: {
  mode: "create" | "update";
  exam?: McqExamItem;
  onClose: () => void;
}) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isSaving = fetcher.state !== "idle";
  const hasError = fetcher.data && "error" in fetcher.data;
  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data &&
      "ok" in fetcher.data &&
      fetcher.data.ok
    ) {
      onClose();
      navigate(location.pathname + location.search, {
        replace: true,
        preventScrollReset: true,
      });
    }
  }, [
    fetcher.state,
    fetcher.data,
    onClose,
    navigate,
    location.pathname,
    location.search,
  ]);

  return (
    <fetcher.Form
      method="post"
      action="/api/admin/mcq-exam"
      className="border-border bg-card space-y-3 rounded-2xl border p-4 shadow-sm"
    >
      <input type="hidden" name="intent" value={mode} />
      {mode === "update" ? (
        <input type="hidden" name="examId" value={exam!.examId} />
      ) : null}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[120px_1fr_120px_1fr]">
        <Field label="명칭 *" full>
          <Input
            name="title"
            required
            maxLength={500}
            defaultValue={exam?.title ?? ""}
            className="h-8 text-xs"
            placeholder="예: 2026년 1월 1차 통합 모의고사"
          />
        </Field>
        <Field label="년도">
          <Input
            name="year"
            type="number"
            min={2000}
            max={2099}
            defaultValue={exam?.year ?? ""}
            className="h-8 text-xs"
            placeholder="2026"
          />
        </Field>
        <Field label="회차">
          <Input
            name="examRoundNo"
            type="number"
            min={1}
            max={999}
            defaultValue={exam?.examRoundNo ?? ""}
            className="h-8 text-xs"
            placeholder="1"
          />
        </Field>
        <Field label="합격 평균 (%)">
          <Input
            name="passAverage"
            type="number"
            min={0}
            max={100}
            defaultValue={exam?.passAverage ?? 60}
            className="h-8 text-xs"
            placeholder="60"
          />
        </Field>
        <Field label="출제일">
          <Input
            name="publishedAt"
            type="date"
            defaultValue={exam?.publishedAt ?? ""}
            className="h-8 text-xs"
          />
        </Field>
        <Field label="설명" full>
          <textarea
            name="description"
            maxLength={5000}
            defaultValue={exam?.description ?? ""}
            rows={2}
            className="border-input bg-background w-full rounded-md border px-2 py-1 text-xs"
          />
        </Field>
        <Field label="공개 여부">
          <label className="border-input flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-xs">
            <input
              type="checkbox"
              name="isPublished"
              defaultChecked={exam?.isPublished ?? false}
              value="1"
              className="accent-primary size-3.5"
            />
            학생에게 공개
          </label>
        </Field>
      </div>
      <p className="text-muted-foreground text-[11px]">
        교시(과목별 모의 팩) 구성은 시험 저장 후 시험 화면에서 합니다.
      </p>
      {hasError ? (
        <p className="text-xs text-rose-600">
          {(fetcher.data as { error: string }).error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="rounded-full"
          onClick={onClose}
          disabled={isSaving}
        >
          <XIcon className="size-3.5" /> 취소
        </Button>
        <Button
          type="submit"
          size="sm"
          className="rounded-full"
          disabled={isSaving}
        >
          {mode === "create" ? (
            <>
              <PlusIcon className="size-3.5" /> 추가
            </>
          ) : (
            <>
              <BookOpenCheckIcon className="size-3.5" /> 저장
            </>
          )}
        </Button>
      </div>
    </fetcher.Form>
  );
}

function Field({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      <Label className="text-muted-foreground text-[11px] sm:self-center">
        {label}
      </Label>
      <div className={full ? "sm:col-span-3" : ""}>{children}</div>
    </>
  );
}
