// feat-2-023 — 암기 카드(SRS v2) 인앱 생성 운영자 화면. /admin/srs-cards.
// 전역 카드 풀(srs_items)을 조문·판례에서 생성. ★dry-run 미리보기 → 승인 후 생성(멱등).
// 풀 현황 + 최근 카드 소프트삭제. 카드 학습은 학생 /srs(SRS v2 러너).

import { Trash2Icon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { data, useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip, IndexTable, TD, TR } from "~/features/admin/components/admin-ui";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  getCardPoolStats,
  listRecentCards,
  type CardGenPreview,
  type CardGenResult,
} from "~/features/srs/card-gen.server";
import {
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-srs-cards";

export const meta: Route.MetaFunction = () => [
  { title: "암기 카드 생성 | Lidam Patent Attorney Academy" },
];

const SOURCE_LABEL: Record<"article" | "case", string> = {
  article: "조문",
  case: "판례",
};

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const [poolStats, recent] = await Promise.all([
    getCardPoolStats(adminClient),
    listRecentCards(adminClient, 30),
  ]);
  return { role, poolStats, recent };
}

type GenData =
  | { ok: true; preview?: CardGenPreview; result?: CardGenResult }
  | { ok: false; error: string };

export default function AdminSrsCards({ loaderData }: Route.ComponentProps) {
  const { role, poolStats, recent } = loaderData;
  const [subject, setSubject] = useState<LawSubjectSlug>(LAW_SUBJECT_SLUGS[0]);
  const [sourceType, setSourceType] = useState<"article" | "case">("article");
  const [importanceMin, setImportanceMin] = useState(2);
  const [limit, setLimit] = useState(50);

  const fetcher = useFetcher<GenData>();
  const busy = fetcher.state !== "idle";
  const ok = fetcher.data?.ok === true ? fetcher.data : null;
  const err = fetcher.data?.ok === false ? fetcher.data.error : null;
  const preview = ok?.preview;
  const result = ok?.result;

  // 미리보기가 현재 폼 값과 일치할 때만 "생성" 허용(dry-run → 승인 게이트).
  const previewMatches =
    preview &&
    preview.subject === subject &&
    preview.sourceType === sourceType &&
    preview.importanceMin === importanceMin &&
    preview.limit === limit;

  const totalCards = poolStats.reduce((s, r) => s + r.count, 0);

  return (
    <AdminShell
      cluster="blanks"
      role={role}
      title="암기 카드 생성"
      desc="조문·판례에서 능동 암기 카드(SRS v2)를 생성합니다. 카드 풀은 전역 공유 — 한 번 생성하면 모든 학생이 /srs 에서 학습합니다. 미리보기로 생성 수를 확인한 뒤 생성하세요(멱등 — 같은 소스는 중복 생성되지 않습니다)."
    >
      {/* ── 생성 폼 ── */}
      <div className="border-border bg-card mb-6 rounded-xl border p-4 shadow-sm">
        <fetcher.Form method="post" action="/api/admin/srs-cards">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="과목">
              <select
                name="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value as LawSubjectSlug)}
                className="border-border bg-background w-full rounded-md border px-2 py-1.5 text-sm"
              >
                {LAW_SUBJECT_SLUGS.map((slug) => (
                  <option key={slug} value={slug}>
                    {LAW_SUBJECTS[slug].name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="소스">
              <select
                name="sourceType"
                value={sourceType}
                onChange={(e) =>
                  setSourceType(e.target.value as "article" | "case")
                }
                className="border-border bg-background w-full rounded-md border px-2 py-1.5 text-sm"
              >
                <option value="article">조문 (식별자 → 본문)</option>
                <option value="case">판례 (사건·쟁점 → 요지)</option>
              </select>
            </Field>
            <Field label="중요도 ≥ (0~5)">
              <input
                type="number"
                name="importanceMin"
                min={0}
                max={5}
                value={importanceMin}
                onChange={(e) => setImportanceMin(Number(e.target.value))}
                className="border-border bg-background w-full rounded-md border px-2 py-1.5 text-sm tabular-nums"
              />
            </Field>
            <Field label="소스 상한 (1~500)">
              <input
                type="number"
                name="limit"
                min={1}
                max={500}
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="border-border bg-background w-full rounded-md border px-2 py-1.5 text-sm tabular-nums"
              />
            </Field>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              type="submit"
              name="intent"
              value="preview"
              variant="outline"
              size="sm"
              disabled={busy}
            >
              미리보기 (dry-run)
            </Button>
            {previewMatches && preview.wouldInsert > 0 ? (
              <Button
                type="submit"
                name="intent"
                value="generate"
                size="sm"
                disabled={busy}
              >
                {preview.wouldInsert}장 생성
              </Button>
            ) : null}
            <span className="text-muted-foreground text-xs">
              ★ 미리보기로 생성 수를 확인한 뒤 생성하세요.
            </span>
          </div>
        </fetcher.Form>

        {err ? (
          <p className="mt-3 text-sm text-rose-600">오류: {err}</p>
        ) : null}

        {result ? (
          <div className="mt-3 rounded-md border border-emerald-500/40 bg-emerald-50 px-3 py-2 text-sm dark:bg-emerald-950/30">
            ✅ <strong className="tabular-nums">{result.inserted}</strong>장
            생성 완료
            {result.skipExisting > 0
              ? ` · 기존 ${result.skipExisting}장 skip(멱등)`
              : ""}
            .
          </div>
        ) : null}

        {preview && !result ? (
          <div className="border-border bg-muted/30 mt-3 rounded-md border px-3 py-2.5 text-sm">
            <p className="font-medium">
              미리보기 — {LAW_SUBJECTS[preview.subject].name} ·{" "}
              {SOURCE_LABEL[preview.sourceType]}
            </p>
            <p className="text-muted-foreground mt-1 text-xs tabular-nums">
              소스 후보 {preview.candidateCount} · 생성 예정{" "}
              <strong className="text-foreground">{preview.wouldInsert}</strong>{" "}
              · 기존 skip {preview.skipExisting}
            </p>
            {preview.wouldInsert === 0 ? (
              <p className="text-muted-foreground mt-1 text-xs">
                생성할 신규 카드가 없습니다(이미 생성됨 또는 조건에 맞는 소스
                없음).
              </p>
            ) : (
              <ul className="text-muted-foreground mt-2 space-y-0.5 text-xs">
                {preview.sample.map((f, i) => (
                  <li key={i} className="line-clamp-1">
                    · {f}
                  </li>
                ))}
                {preview.wouldInsert > preview.sample.length ? (
                  <li className="text-[11px]">
                    … 외 {preview.wouldInsert - preview.sample.length}장
                  </li>
                ) : null}
              </ul>
            )}
          </div>
        ) : null}
      </div>

      {/* ── 풀 현황 ── */}
      <div className="mb-6">
        <h2 className="mb-2 text-sm font-semibold">
          카드 풀 현황{" "}
          <span className="text-muted-foreground tabular-nums">
            (총 {totalCards}장)
          </span>
        </h2>
        {poolStats.length === 0 ? (
          <div className="border-border bg-card text-muted-foreground rounded-xl border py-10 text-center text-sm shadow-sm">
            아직 생성된 카드가 없습니다. 위 폼으로 생성하세요.
          </div>
        ) : (
          <IndexTable
            minWidth={420}
            headers={[
              { label: "과목" },
              { label: "소스" },
              { label: "카드 수", align: "right", width: "8rem" },
            ]}
          >
            {poolStats.map((r) => (
              <TR key={`${r.subject}-${r.sourceType}`}>
                <TD>
                  {LAW_SUBJECTS[r.subject as LawSubjectSlug]?.name ?? r.subject}
                </TD>
                <TD soft>
                  {SOURCE_LABEL[r.sourceType as "article" | "case"] ??
                    r.sourceType}
                </TD>
                <TD align="right" mono>
                  {r.count}
                </TD>
              </TR>
            ))}
          </IndexTable>
        )}
      </div>

      {/* ── 최근 카드 (소프트삭제) ── */}
      <div>
        <h2 className="mb-2 text-sm font-semibold">최근 생성 카드</h2>
        {recent.length === 0 ? (
          <div className="border-border bg-card text-muted-foreground rounded-xl border py-10 text-center text-sm shadow-sm">
            카드가 없습니다.
          </div>
        ) : (
          <IndexTable
            minWidth={560}
            headers={[
              { label: "앞면(front)" },
              { label: "과목", width: "7rem" },
              { label: "소스", align: "center", width: "5rem" },
              { label: "", align: "right", width: "4rem" },
            ]}
          >
            {recent.map((c) => (
              <TR key={c.itemId}>
                <TD>
                  <span className="line-clamp-1">{c.front}</span>
                </TD>
                <TD soft>
                  {LAW_SUBJECTS[c.subject as LawSubjectSlug]?.name ?? c.subject}
                </TD>
                <TD align="center">
                  <Chip tone={c.sourceType === "case" ? "amber" : "emerald"}>
                    {SOURCE_LABEL[c.sourceType as "article" | "case"] ??
                      c.sourceType ??
                      "기타"}
                  </Chip>
                </TD>
                <TD align="right">
                  <DeleteCardButton itemId={c.itemId} front={c.front} />
                </TD>
              </TR>
            ))}
          </IndexTable>
        )}
      </div>
    </AdminShell>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-muted-foreground mb-1 block text-xs font-medium">
        {label}
      </span>
      {children}
    </label>
  );
}

function DeleteCardButton({
  itemId,
  front,
}: {
  itemId: string;
  front: string;
}) {
  const fetcher = useFetcher<{ ok?: boolean }>();
  return (
    <fetcher.Form
      method="post"
      action="/api/admin/srs-cards"
      onSubmit={(e) => {
        if (!confirm(`카드를 삭제하시겠습니까?\n\n"${front}"`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="intent" value="soft-delete" />
      <input type="hidden" name="itemId" value={itemId} />
      <Button
        type="submit"
        size="icon"
        variant="ghost"
        aria-label="카드 삭제"
        disabled={fetcher.state !== "idle"}
        className="size-8 rounded-full text-rose-600 hover:text-rose-700"
      >
        <Trash2Icon className="size-3.5" />
      </Button>
    </fetcher.Form>
  );
}
