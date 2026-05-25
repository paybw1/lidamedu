// Staff underline orphan 점검 — label 이 본문에 없어 자동 재배치 불가한 highlight.
// staff 가 case viewer 에서 새 underline 을 그은 뒤 옛 row 를 삭제하는 작업 도구.

import { HighlighterIcon, ExternalLinkIcon } from "lucide-react";
import { useState } from "react";
import { Link, data, useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip } from "~/features/admin/components/admin-ui";
import {
  getOrphanHighlights,
  type OrphanHighlight,
} from "~/features/admin/queries/orphan-highlights.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  FIRST_EXAM_LAW_SLUGS,
  LAW_SUBJECTS,
  SECOND_EXAM_LAW_SLUGS,
  lawSubjectSlugSchema,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-orphan-highlights";

export const meta: Route.MetaFunction = () => [
  { title: "Orphan staff underline | Lidam" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const lawParam = url.searchParams.get("law") ?? "patent";
  const parsed = lawSubjectSlugSchema.safeParse(lawParam);
  const lawCode: LawSubjectSlug = parsed.success ? parsed.data : "patent";
  const orphans = await getOrphanHighlights(client, lawCode);
  return { orphans, lawCode, role };
}

export default function AdminOrphanHighlights({
  loaderData,
}: Route.ComponentProps) {
  const { orphans, lawCode, role } = loaderData;
  const subject = LAW_SUBJECTS[lawCode];

  // case 별 group
  const byCase = new Map<string, OrphanHighlight[]>();
  for (const o of orphans) {
    const arr = byCase.get(o.caseId) ?? [];
    arr.push(o);
    byCase.set(o.caseId, arr);
  }
  const caseEntries = [...byCase.entries()];

  return (
    <AdminShell
      cluster="cases"
      role={role}
      title="Orphan staff underline"
      desc={
        <>
          staff 가 그은 underline 중 본문에 label 텍스트가 더 이상 없는 row.
          본문이 크게 편집돼 자동 재배치 불가 — case viewer 에서 새 underline 을
          긋고 옛 row 를 여기서 삭제하세요.
        </>
      }
      width={1100}
    >
      <div className="mb-4 space-y-2">
        <SubjectGroup
          label="1차 · 객관식"
          slugs={FIRST_EXAM_LAW_SLUGS}
          current={lawCode}
        />
        <SubjectGroup
          label="2차 · 주관식"
          slugs={SECOND_EXAM_LAW_SLUGS}
          current={lawCode}
        />
      </div>

      <div className="mb-3 flex items-center gap-2">
        <HighlighterIcon className="text-muted-foreground size-4" />
        <span className="text-muted-foreground text-sm">
          {subject.name} · orphan{" "}
          <span className="text-foreground font-semibold tabular-nums">
            {orphans.length.toLocaleString("ko-KR")}
          </span>
          건 · 영향 case{" "}
          <span className="text-foreground font-semibold tabular-nums">
            {caseEntries.length.toLocaleString("ko-KR")}
          </span>
          개
        </span>
        {orphans.length === 0 ? (
          <Chip tone="emerald">없음</Chip>
        ) : (
          <Chip tone="coral">{orphans.length}</Chip>
        )}
      </div>

      {orphans.length === 0 ? (
        <div className="bg-emerald-500/5 text-muted-foreground rounded-xl border p-6 text-center text-sm">
          {subject.name} 의 staff underline 이 모두 본문과 정합합니다.
        </div>
      ) : (
        <ul className="space-y-3">
          {caseEntries.map(([caseId, items]) => (
            <CaseGroup
              key={caseId}
              caseId={caseId}
              caseNumber={items[0].caseNumber}
              caseTitle={items[0].caseTitle}
              items={items}
              lawCode={lawCode}
            />
          ))}
        </ul>
      )}
    </AdminShell>
  );
}

function SubjectGroup({
  label,
  slugs,
  current,
}: {
  label: string;
  slugs: readonly LawSubjectSlug[];
  current: LawSubjectSlug;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-muted-foreground mr-1 text-[10px] font-medium tracking-wide uppercase">
        {label}
      </span>
      {slugs.map((s) => (
        <Link
          key={s}
          to={`/admin/cases/orphan-highlights?law=${s}`}
          className={
            current === s
              ? "bg-primary text-primary-foreground border-primary rounded-md border px-2 py-1 text-[11px]"
              : "hover:bg-accent text-foreground/70 rounded-md border px-2 py-1 text-[11px]"
          }
        >
          {LAW_SUBJECTS[s].name}
        </Link>
      ))}
    </div>
  );
}

function CaseGroup({
  caseId,
  caseNumber,
  caseTitle,
  items,
  lawCode,
}: {
  caseId: string;
  caseNumber: string;
  caseTitle: string;
  items: OrphanHighlight[];
  lawCode: LawSubjectSlug;
}) {
  return (
    <li className="bg-card rounded-xl border p-4">
      <div className="mb-2 flex flex-wrap items-baseline gap-2">
        <span className="font-semibold">{caseNumber}</span>
        <span className="text-muted-foreground line-clamp-1 text-xs">
          {caseTitle}
        </span>
        <Chip tone="amber" className="ml-auto">
          {items.length}건
        </Chip>
        <Button asChild variant="outline" size="sm" className="h-7 gap-1 text-xs">
          <Link
            to={`/subjects/${lawCode}/cases/${caseId}`}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLinkIcon className="size-3" /> case 본문 열기 (새 탭)
          </Link>
        </Button>
      </div>
      <ul className="divide-y rounded-md border">
        {items.map((item) => (
          <OrphanRow key={item.highlightId} item={item} />
        ))}
      </ul>
    </li>
  );
}

function OrphanRow({ item }: { item: OrphanHighlight }) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const [expanded, setExpanded] = useState(false);
  const submitting = fetcher.state !== "idle";
  const done =
    fetcher.data && "ok" in fetcher.data && fetcher.data.ok === true;
  const err =
    fetcher.data && "error" in fetcher.data
      ? (fetcher.data.error ?? null)
      : null;
  if (done) return null;

  const short = item.label.length > 100;
  const display = expanded ? item.label : item.label.slice(0, 100);

  return (
    <li className="p-3 text-sm">
      <div className="mb-1 flex flex-wrap items-baseline gap-2">
        <Chip tone="blue">{item.fieldPath}</Chip>
        <span className="text-muted-foreground text-[11px] tabular-nums">
          옛 offset {item.startOffset}..{item.endOffset}
        </span>
      </div>
      <p className="text-foreground/85 mb-2 text-xs leading-relaxed whitespace-pre-wrap">
        “{display}
        {short && !expanded ? "…" : ""}”
        {short ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-primary ml-1 hover:underline"
          >
            {expanded ? "접기" : "펼치기"}
          </button>
        ) : null}
      </p>
      <fetcher.Form
        method="post"
        action="/api/annotations/highlight"
        className="flex items-center gap-2"
      >
        <input type="hidden" name="intent" value="delete" />
        <input type="hidden" name="highlightId" value={item.highlightId} />
        <Button
          type="submit"
          size="sm"
          variant="outline"
          className="h-7 gap-1 text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20"
          disabled={submitting}
          onClick={(e) => {
            if (!confirm("이 orphan highlight 를 삭제합니다. 진행할까요?")) {
              e.preventDefault();
            }
          }}
        >
          {submitting ? "삭제 중…" : "삭제"}
        </Button>
        {err ? <span className="text-destructive text-xs">{err}</span> : null}
      </fetcher.Form>
    </li>
  );
}
