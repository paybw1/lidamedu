// 법 개정 목록 (feat-7-004). 한 법령의 모든 개정 — 시행일 기준 단일 목록.
// 노출/현행 여부는 시행일로 결정(상태 워크플로우 없음).

import {
  ChevronRightIcon,
  FileEditIcon,
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
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import {
  Chip,
  IndexTable,
  TD,
  TR,
} from "~/features/admin/components/admin-ui";
import { type LawRevisionListItem } from "~/features/law-revisions/labels";
import { listLawRevisionsForAdmin } from "~/features/law-revisions/queries.server";
import { getLawByCode, getStaffRole } from "~/features/laws/queries.server";
import {
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-law-revisions";

export const meta: Route.MetaFunction = ({ data: d }) => {
  if (!d || !d.law)
    return [{ title: "법 개정 | 리담변리사학원" }];
  return [
    {
      title: `${d.law.shortLabel ?? d.law.displayLabel} 개정 | 리담변리사학원`,
    },
  ];
};

export async function loader({ params, request }: Route.LoaderArgs) {
  const lawCodeRaw = params.lawCode ?? "";
  if (!(LAW_SUBJECT_SLUGS as readonly string[]).includes(lawCodeRaw)) {
    throw data("Unknown law", { status: 404 });
  }
  const lawCode = lawCodeRaw as LawSubjectSlug;
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const law = await getLawByCode(client, lawCode);
  if (!law) throw data("Law not seeded", { status: 404 });
  const revisions = await listLawRevisionsForAdmin(client, { lawCode });
  return { law, lawCode, revisions, role };
}

/* ── 시행 상태 → Chip (시행일 파생) ──────────────────────────────────────── */

function forceState(
  effectiveDate: string | null,
  today: string,
): { tone: "emerald" | "amber" | "neutral"; label: string; inForce: boolean } {
  if (!effectiveDate) return { tone: "neutral", label: "미반영", inForce: false };
  if (effectiveDate <= today)
    return { tone: "emerald", label: "시행 중", inForce: true };
  return { tone: "amber", label: "시행 예정", inForce: false };
}

/* ── 컴포넌트 ─────────────────────────────────────────────────────────── */

export default function AdminLawRevisions({
  loaderData,
}: Route.ComponentProps) {
  const { law, lawCode, revisions, role } = loaderData;
  const [showAdd, setShowAdd] = useState(false);
  const subject = LAW_SUBJECTS[lawCode];
  const today = new Date().toISOString().slice(0, 10);
  // 법 개정과 내부 정정 스냅샷(조문 오탈자·라벨 정정이 개정 흐름으로 저장된 것) 분리 —
  // 정정분은 법 개정이 아니므로 본 목록에서 제외하고 하단 관리 섹션에서만 보여준다.
  const legal = revisions.filter((r) => !r.isMaintenance);
  const maintenance = revisions.filter((r) => r.isMaintenance);
  const reflected = legal.filter((r) => r.effectiveDate != null).length;
  const drafts = legal.length - reflected;

  return (
    <AdminShell
      cluster="laws"
      role={role}
      title={`${subject.name} 개정 목록`}
      desc={`전체 ${legal.length} · 반영 ${reflected} · 미반영 ${drafts}`}
      headerRight={
        !showAdd ? (
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <PlusIcon className="size-3.5" /> 새 개정
          </Button>
        ) : undefined
      }
    >
      {showAdd ? (
        <div className="mb-4">
          <CreateRevisionForm
            lawId={law.lawId}
            onClose={() => setShowAdd(false)}
          />
        </div>
      ) : null}

      <RevisionSection
        title="개정"
        revisions={legal}
        lawCode={lawCode}
        today={today}
        emptyText="등록된 개정이 없습니다."
      />

      <MaintenanceSection revisions={maintenance} lawCode={lawCode} />
    </AdminShell>
  );
}

/* ── MaintenanceSection — 조문 정정 스냅샷(시스템 생성) 관리 ─────────────── */
// 조문 오탈자·라벨 정정이 개정 흐름(원문 불변 원칙)으로 저장된 내부 스냅샷.
// 현재 시행 조문 본문을 보유할 수 있어 삭제 금지 — 조회 전용으로만 관리한다.
function MaintenanceSection({
  revisions,
  lawCode,
}: {
  revisions: LawRevisionListItem[];
  lawCode: LawSubjectSlug;
}) {
  const [open, setOpen] = useState(false);
  if (revisions.length === 0) return null;
  return (
    <section className="mb-6 space-y-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="text-muted-foreground hover:text-foreground font-mono text-[11px] font-semibold tracking-[0.08em] uppercase"
      >
        {open ? "▾" : "▸"} 조문 정정 스냅샷{" "}
        <span className="text-muted-foreground/60 tabular-nums">
          ({revisions.length})
        </span>
      </button>
      {open ? (
        <>
          <p className="text-muted-foreground text-xs leading-relaxed">
            조문 오탈자·라벨 정정 작업이 개정 이력(원문 불변 원칙)으로 저장된
            시스템 생성 스냅샷입니다. 법 개정이 아니므로 위 목록·학습정보에는
            표시되지 않습니다. 현재 시행 중인 조문 본문을 보유할 수 있어{" "}
            <strong className="text-foreground font-semibold">
              삭제하면 안 됩니다
            </strong>
            (조회 전용).
          </p>
          <IndexTable
            minWidth={520}
            headers={[
              { label: "정정 ID" },
              { label: "조문", align: "right", width: "6rem" },
              { label: "생성일", align: "right", width: "10rem" },
            ]}
          >
            {revisions.map((r) => (
              <TR key={r.lawRevisionId}>
                <TD>
                  <Link
                    to={`/admin/laws/${lawCode}/revisions/${r.lawRevisionId}`}
                    className="text-link font-mono text-xs hover:underline"
                    viewTransition
                  >
                    {r.revisionNumber}
                  </Link>
                </TD>
                <TD align="right">{r.articleCount}</TD>
                <TD align="right" soft>
                  {r.createdAt.slice(0, 10)}
                </TD>
              </TR>
            ))}
          </IndexTable>
        </>
      ) : null}
    </section>
  );
}

/* ── RevisionSection ─────────────────────────────────────────────────── */

function RevisionSection({
  title,
  revisions,
  lawCode,
  today,
  emptyText,
}: {
  title: string;
  revisions: LawRevisionListItem[];
  lawCode: LawSubjectSlug;
  today: string;
  emptyText: string;
}) {
  return (
    <section className="mb-6 space-y-2">
      <p className="text-muted-foreground font-mono text-[11px] font-semibold tracking-[0.08em] uppercase">
        {title}{" "}
        <span className="text-muted-foreground/60 tabular-nums">
          ({revisions.length})
        </span>
      </p>
      {revisions.length === 0 ? (
        <div className="border-border bg-card text-muted-foreground rounded-xl border py-10 text-center text-sm shadow-sm">
          <FileEditIcon className="text-muted-foreground/40 mx-auto mb-2 size-8" />
          {emptyText}
        </div>
      ) : (
        <IndexTable
          minWidth={620}
          headers={[
            { label: "시행 상태", width: "6rem" },
            { label: "개정 번호" },
            { label: "조문", align: "right", width: "6rem" },
            { label: "시행일", align: "right", width: "8rem" },
            { label: "공포일", align: "right", width: "8rem" },
            { label: "", align: "right", width: "5rem" },
          ]}
        >
          {revisions.map((r) => (
            <RevisionRow
              key={r.lawRevisionId}
              revision={r}
              lawCode={lawCode}
              today={today}
            />
          ))}
        </IndexTable>
      )}
    </section>
  );
}

/* ── RevisionRow ─────────────────────────────────────────────────────── */

function RevisionRow({
  revision,
  lawCode,
  today,
}: {
  revision: LawRevisionListItem;
  lawCode: LawSubjectSlug;
  today: string;
}) {
  const fs = forceState(revision.effectiveDate, today);
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

  return (
    <TR>
      <TD>
        <Chip tone={fs.tone}>{fs.label}</Chip>
      </TD>
      <TD>
        <Link
          to={`/admin/laws/${lawCode}/revisions/${revision.lawRevisionId}`}
          viewTransition
          className="text-link inline-flex items-center gap-1 font-semibold hover:underline"
        >
          {revision.revisionNumber}
          <ChevronRightIcon className="text-muted-foreground size-3" />
        </Link>
        {revision.reasonMd ? (
          <p className="text-muted-foreground mt-0.5 line-clamp-1 text-[11px]">
            {revision.reasonMd}
          </p>
        ) : null}
      </TD>
      <TD align="right" mono soft>
        {revision.articleCount}건
      </TD>
      <TD align="right" mono soft>
        {revision.effectiveDate ?? "—"}
      </TD>
      <TD align="right" mono soft>
        {revision.promulgatedAt ?? "—"}
      </TD>
      <TD align="right">
        {!fs.inForce ? (
          <delFetcher.Form method="post" action="/api/admin/law-revision">
            <input type="hidden" name="intent" value="delete" />
            <input
              type="hidden"
              name="lawRevisionId"
              value={revision.lawRevisionId}
            />
            <Button
              type="submit"
              size="icon"
              variant="ghost"
              aria-label="삭제"
              className="size-7 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/20"
              disabled={delFetcher.state !== "idle"}
              onClick={(e) => {
                if (
                  !confirm(
                    `"${revision.revisionNumber}" 개정을 삭제하시겠습니까? 포함된 조문 스냅샷도 함께 삭제됩니다.`,
                  )
                ) {
                  e.preventDefault();
                }
              }}
            >
              <Trash2Icon className="size-3.5" />
            </Button>
          </delFetcher.Form>
        ) : null}
      </TD>
    </TR>
  );
}

/* ── CreateRevisionForm ───────────────────────────────────────────────── */

function CreateRevisionForm({
  lawId,
  onClose,
}: {
  lawId: string;
  onClose: () => void;
}) {
  const fetcher = useFetcher<{
    ok?: true;
    lawRevisionId?: string;
    error?: string;
  }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isSaving = fetcher.state !== "idle";
  const hasError =
    fetcher.data && "error" in fetcher.data && fetcher.data.error;

  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data &&
      "ok" in fetcher.data &&
      fetcher.data.ok &&
      fetcher.data.lawRevisionId
    ) {
      navigate(
        `${location.pathname.replace(/\/$/, "")}/${fetcher.data.lawRevisionId}`,
        { preventScrollReset: true },
      );
    }
  }, [fetcher.state, fetcher.data, navigate, location.pathname]);

  return (
    <fetcher.Form
      method="post"
      action="/api/admin/law-revision"
      className="border-border bg-card space-y-3 rounded-xl border p-4 shadow-sm"
    >
      <input type="hidden" name="intent" value="create" />
      <input type="hidden" name="lawId" value={lawId} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_1fr]">
        <Field label="개정 번호" required htmlFor="revisionNumber">
          <Input
            id="revisionNumber"
            name="revisionNumber"
            required
            maxLength={100}
            placeholder="예: 법률 제20300호"
          />
        </Field>
        <Field label="개정 이유" htmlFor="reasonMd">
          <textarea
            id="reasonMd"
            name="reasonMd"
            maxLength={5000}
            rows={4}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-primary"
            placeholder="개정 이유·배경"
          />
        </Field>
      </div>
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
          onClick={onClose}
          disabled={isSaving}
        >
          <XIcon className="size-3.5" /> 취소
        </Button>
        <Button type="submit" size="sm" disabled={isSaving}>
          <PlusIcon className="size-3.5" /> 초안 생성
        </Button>
      </div>
    </fetcher.Form>
  );
}

// LocalField — Label+자식 정렬용. admin-ui Field 와 시그니처 다름.
function Field({
  label,
  required,
  htmlFor,
  children,
}: {
  label: string;
  required?: boolean;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor} className="text-xs font-semibold">
        {label}
        {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
      </Label>
      {children}
    </div>
  );
}
