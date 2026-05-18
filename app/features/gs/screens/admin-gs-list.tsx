// 운영자 GS 회차 목록 — 모든 status (draft 포함). + 새 회차 생성 진입점.
// 패턴 P2 LIST/TABLE. AdminShell cluster="gs".

import { PlusIcon, RefreshCwIcon } from "lucide-react";
import { Form, Link, data } from "react-router";

import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import {
  Chip,
  IndexTable,
  TD,
  TR,
  type TableHeaderDef,
} from "~/features/admin/components/admin-ui";
import {
  listAllGsRounds,
  type GsRoundStatus,
} from "~/features/gs/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  FIRST_EXAM_LAW_SLUGS,
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
  SECOND_EXAM_LAW_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-gs-list";

export const meta: Route.MetaFunction = () => [
  { title: "온라인 GS 관리 | Lidam Patent Attorney Academy" },
];

const STATUS_LABEL: Record<GsRoundStatus, string> = {
  draft: "초안",
  published: "공개",
  closed: "종료",
};

function statusTone(
  s: GsRoundStatus,
): "neutral" | "emerald" | "amber" | "coral" {
  if (s === "published") return "emerald";
  if (s === "draft") return "amber";
  return "neutral";
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const subjectParam = url.searchParams.get("subject");
  const subject =
    subjectParam && LAW_SUBJECT_SLUGS.includes(subjectParam as never)
      ? (subjectParam as LawSubjectSlug)
      : undefined;
  const statusParam = url.searchParams.get("status");
  const status: GsRoundStatus | undefined =
    statusParam === "draft" ||
    statusParam === "published" ||
    statusParam === "closed"
      ? statusParam
      : undefined;

  const rounds = await listAllGsRounds(client, { subject, status });
  return {
    rounds,
    subject: subject ?? null,
    status: status ?? null,
    role,
  };
}

const TABLE_HEADERS: TableHeaderDef[] = [
  { label: "상태", width: "5rem" },
  { label: "제목" },
  { label: "과목", width: "7rem" },
  { label: "기간", width: "14rem" },
  { label: "제한", width: "5rem", align: "right" },
  { label: "", width: "4rem", align: "right" },
];

export default function AdminGsList({ loaderData }: Route.ComponentProps) {
  const { rounds, subject, status, role } = loaderData;
  const filterActive = !!(subject || status);

  return (
    <AdminShell
      cluster="gs"
      role={role}
      title="GS 회차 관리"
      desc="정기 모의고사 회차를 만들고 문제를 등록합니다. 공개(published) 상태에서만 학생에게 노출됩니다."
      headerRight={
        <Button asChild size="sm">
          <Link to="/admin/gs/new" viewTransition>
            <PlusIcon className="size-3.5" /> 새 회차
          </Link>
        </Button>
      }
    >
      {/* 필터 */}
      <Form
        method="get"
        className="border-border bg-card mb-3 flex flex-wrap items-end gap-2.5 rounded-xl border p-3 shadow-sm"
      >
        <FilterSelect
          name="subject"
          label="과목"
          value={subject ?? ""}
          options={[{ value: "", label: "전체 과목" }]}
          optionGroups={[
            {
              label: "1차 · 객관식",
              options: FIRST_EXAM_LAW_SLUGS.map((s) => ({
                value: s,
                label: LAW_SUBJECTS[s].name,
              })),
            },
            {
              label: "2차 · 주관식",
              options: SECOND_EXAM_LAW_SLUGS.map((s) => ({
                value: s,
                label: LAW_SUBJECTS[s].name,
              })),
            },
          ]}
        />
        <FilterSelect
          name="status"
          label="상태"
          value={status ?? ""}
          options={[
            { value: "", label: "전체" },
            { value: "draft", label: "초안" },
            { value: "published", label: "공개" },
            { value: "closed", label: "종료" },
          ]}
        />
        <Button type="submit" size="sm" variant="outline">
          적용
        </Button>
        {filterActive ? (
          <Link
            to="/admin/gs"
            className="text-primary inline-flex items-center gap-1 px-1 text-xs font-semibold"
          >
            <RefreshCwIcon className="size-3" /> 초기화
          </Link>
        ) : null}
      </Form>

      {/* 목록 */}
      {rounds.length === 0 ? (
        <div className="border-border bg-card text-muted-foreground rounded-xl border py-16 text-center text-sm shadow-sm">
          {filterActive
            ? "조건에 맞는 회차가 없습니다."
            : "등록된 GS 회차가 없습니다. 새 회차를 만들어 보세요."}
        </div>
      ) : (
        <IndexTable
          minWidth={760}
          headers={TABLE_HEADERS}
          footer={
            <div className="border-border/60 text-muted-foreground border-t px-3 py-2 text-[11px] font-medium tabular-nums">
              총 {rounds.length}건
            </div>
          }
        >
          {rounds.map((r) => (
            <TR key={r.roundId}>
              <TD>
                <Chip tone={statusTone(r.status)}>
                  {STATUS_LABEL[r.status]}
                </Chip>
              </TD>
              <TD>
                <Link
                  to={`/admin/gs/${r.roundId}`}
                  viewTransition
                  className="text-primary hover:underline font-medium"
                >
                  {r.title}
                </Link>
              </TD>
              <TD soft>
                {LAW_SUBJECTS[r.subject]?.name ?? r.subject}
              </TD>
              <TD mono soft>
                {formatRange(r.startAt, r.endAt)}
              </TD>
              <TD align="right" mono soft>
                {r.durationMin}분
              </TD>
              <TD align="right">
                <Link
                  to={`/admin/gs/${r.roundId}`}
                  className="text-primary text-xs font-semibold hover:underline"
                >
                  편집
                </Link>
              </TD>
            </TR>
          ))}
        </IndexTable>
      )}
    </AdminShell>
  );
}

/* ── 로컬 헬퍼 ──────────────────────────────────────────────────────────── */

function FilterSelect({
  name,
  label,
  value,
  options,
  optionGroups,
}: {
  name: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  optionGroups?: { label: string; options: { value: string; label: string }[] }[];
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-muted-foreground text-[11px] font-semibold">
        {label}
      </span>
      <select
        name={name}
        defaultValue={value}
        className="border-input bg-background focus:border-primary h-9 rounded-md border px-3 text-[13px] outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        {optionGroups?.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

function formatRange(start: string, end: string): string {
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };
  return `${fmt(start)} ~ ${fmt(end)}`;
}
