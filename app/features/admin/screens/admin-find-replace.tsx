// feat-7-049 — 본문 찾아 고치기.
// 찾기 → 필드별 미리보기 → 고를 것만 적용 → batch 단위 되돌리기.
// 대상 필드·제외 대상은 find-replace-targets.ts (SSOT) 와 문서 참조.

import { ReplaceIcon, RotateCcwIcon, SearchIcon } from "lucide-react";
import { useState } from "react";
import { Form, Link, data, useNavigation } from "react-router";
import { z } from "zod";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Checkbox } from "~/core/components/ui/checkbox";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import {
  ENTITY_TYPES,
  FIND_REPLACE_TARGETS,
  MAX_MATCHES,
  MIN_TERM,
  type FindReplaceEntity,
} from "~/features/admin/lib/find-replace-targets";
import {
  applyReplacements,
  listEditBatches,
  revertBatch,
  searchContent,
  type ApplyResult,
  type FindMatch,
} from "~/features/admin/queries/find-replace.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/admin-find-replace";

export const meta: Route.MetaFunction = () => [
  { title: "본문 찾아 고치기 | 리담변리사학원" },
];

const entitySchema = z.enum(ENTITY_TYPES);
const termSchema = z.string().trim().min(MIN_TERM).max(200);
/** 바꿀 말은 비워 둘 수 있다 — 지우기가 된다. */
const replacementSchema = z.string().max(200);

async function requireStaff(request: Request) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });
  return { client, user, role };
}

export async function loader({ request }: Route.LoaderArgs) {
  const { client, role } = await requireStaff(request);
  const batches = await listEditBatches(client);
  return { role, batches };
}

export async function action({ request }: Route.ActionArgs) {
  const { client, user } = await requireStaff(request);
  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "");

  if (intent === "revert") {
    const batchId = String(fd.get("batchId") ?? "");
    if (!z.string().uuid().safeParse(batchId).success) {
      return { error: "잘못된 batch" as const };
    }
    const result = await revertBatch(client, batchId, user.id);
    return { reverted: result };
  }

  const term = termSchema.safeParse(fd.get("term"));
  const replacement = replacementSchema.safeParse(String(fd.get("replacement") ?? ""));
  if (!term.success || !replacement.success) {
    return { error: `찾을 말은 ${MIN_TERM}자 이상이어야 합니다.` };
  }
  const entityTypes = ENTITY_TYPES.filter((t) => fd.get(`type:${t}`) === "on");
  if (entityTypes.length === 0) return { error: "대상을 하나 이상 고르세요." };

  if (intent === "search") {
    const found = await searchContent(client, {
      term: term.data,
      replacement: replacement.data,
      entityTypes,
    });
    return {
      term: term.data,
      replacement: replacement.data,
      entityTypes,
      matches: found.matches,
      truncated: found.truncated,
    };
  }

  if (intent === "apply") {
    const targets = fd
      .getAll("target")
      .map((raw) => String(raw).split("|"))
      .filter((parts) => parts.length === 3)
      .map(([entityType, entityId, field]) => ({ entityType, entityId, field }))
      .filter((t) => entitySchema.safeParse(t.entityType).success)
      .map((t) => ({ ...t, entityType: t.entityType as FindReplaceEntity }));
    if (targets.length === 0) return { error: "고른 항목이 없습니다." };
    if (targets.length > MAX_MATCHES) return { error: "한 번에 200건까지입니다." };
    const result = await applyReplacements(client, {
      term: term.data,
      replacement: replacement.data,
      targets,
      authorId: user.id,
    });
    return { applied: result, term: term.data, replacement: replacement.data };
  }
  return { error: "알 수 없는 요청" };
}

export default function AdminFindReplace({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { role, batches } = loaderData;
  const nav = useNavigation();
  const busy = nav.state !== "idle";

  const result = actionData as
    | {
        error?: string;
        term?: string;
        replacement?: string;
        entityTypes?: FindReplaceEntity[];
        matches?: FindMatch[];
        truncated?: boolean;
        applied?: ApplyResult;
        reverted?: { reverted: number; skipped: string[] };
      }
    | undefined;

  const [term, setTerm] = useState("");
  const [replacement, setReplacement] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const matches = result?.matches ?? [];
  const keyOf = (m: FindMatch) => `${m.entityType}|${m.entityId}|${m.field}`;

  const toggle = (key: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <AdminShell
      cluster="checks"
      role={role}
      title="본문 찾아 고치기"
      desc={
        <>
          여러 콘텐츠에 흩어진 같은 오기를 한 번에 고칩니다. 찾은 자리를 확인하고{" "}
          <strong>고른 것만</strong> 바뀝니다. 적용 뒤에는 아래 기록에서 되돌릴 수
          있습니다.
          <br />
          <span className="text-muted-foreground">
            법령 조문 · 판례 사건번호 · 2차 모범답안/채점기준 · 문제 발문은 대상이
            아닙니다. 정규식은 쓰지 않고 글자 그대로 찾습니다(대소문자 구분).
          </span>
        </>
      }
      width={1100}
    >
      <div className="space-y-6">
        <Form method="post" className="border-border space-y-4 rounded-xl border p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="term">찾을 말</Label>
              <Input
                id="term"
                name="term"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="예: 대법원 판례해설 122호"
                required
                minLength={MIN_TERM}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="replacement">바꿀 말</Label>
              <Input
                id="replacement"
                name="replacement"
                value={replacement}
                onChange={(e) => setReplacement(e.target.value)}
                placeholder="비워 두면 지웁니다"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            {ENTITY_TYPES.map((t) => (
              <label key={t} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name={`type:${t}`}
                  defaultChecked
                  className="accent-primary size-4"
                />
                {FIND_REPLACE_TARGETS[t].label}
              </label>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" name="intent" value="search" disabled={busy}>
              <SearchIcon className="size-4" /> 찾기
            </Button>
            {matches.length > 0 ? (
              <Button
                type="submit"
                name="intent"
                value="apply"
                variant="destructive"
                disabled={busy || checked.size === 0}
              >
                <ReplaceIcon className="size-4" /> 고른 {checked.size}건 바꾸기
              </Button>
            ) : null}
          </div>

          {[...checked].map((key) => (
            <input key={key} type="hidden" name="target" value={key} />
          ))}
        </Form>

        {result?.error ? (
          <p className="text-destructive text-sm">{result.error}</p>
        ) : null}

        {result?.applied ? (
          <div className="border-border bg-muted/40 space-y-1 rounded-lg border p-4 text-sm">
            <p>
              <strong>{result.applied.applied}건</strong> 바꿨습니다.
              {result.applied.skipped.length > 0
                ? ` ${result.applied.skipped.length}건은 건너뛰었습니다.`
                : ""}
            </p>
            {result.applied.skipped.map((s) => (
              <p key={`${s.entityId}-${s.field}`} className="text-muted-foreground text-xs">
                {s.entityId.slice(0, 8)} · {s.field} — {s.reason}
              </p>
            ))}
            <p className="text-muted-foreground text-xs">
              되돌리려면 아래 기록에서 이 batch 를 되돌리세요.
            </p>
          </div>
        ) : null}

        {result?.reverted ? (
          <div className="border-border bg-muted/40 space-y-1 rounded-lg border p-4 text-sm">
            <p>
              <strong>{result.reverted.reverted}건</strong> 되돌렸습니다.
            </p>
            {result.reverted.skipped.map((s) => (
              <p key={s} className="text-muted-foreground text-xs">
                {s}
              </p>
            ))}
          </div>
        ) : null}

        {matches.length > 0 ? (
          <section className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold">
                찾은 자리 {matches.length}곳
                <span className="text-muted-foreground ml-2 font-normal">
                  (등장 {matches.reduce((n, m) => n + m.occurrences, 0)}회)
                </span>
              </h2>
              {result?.truncated ? (
                <Badge variant="outline" className="text-xs">
                  {MAX_MATCHES}건까지만 표시 — 검색어를 좁히세요
                </Badge>
              ) : null}
              <div className="ml-auto flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setChecked(new Set(matches.map(keyOf)))}
                >
                  전부 선택
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setChecked(new Set())}
                >
                  선택 해제
                </Button>
              </div>
            </div>

            <ul className="space-y-2">
              {matches.map((m) => {
                const key = keyOf(m);
                return (
                  <li key={key} className="border-border rounded-lg border p-3">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={checked.has(key)}
                        onCheckedChange={() => toggle(key)}
                        aria-label={`${m.entityLabel} ${m.fieldLabel} 선택`}
                        className="mt-1"
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <Badge variant="outline" className="text-xs">
                            {FIND_REPLACE_TARGETS[m.entityType].label}
                          </Badge>
                          <span className="font-medium">{m.entityLabel}</span>
                          <span className="text-muted-foreground text-xs">
                            {m.fieldLabel} · {m.occurrences}회
                          </span>
                          {m.href ? (
                            <Link
                              to={m.href}
                              target="_blank"
                              className="text-link ml-auto text-xs underline underline-offset-2"
                            >
                              편집 화면
                            </Link>
                          ) : null}
                        </div>
                        {m.entitySub ? (
                          <p className="text-muted-foreground truncate text-xs">
                            {m.entitySub}
                          </p>
                        ) : null}
                        <div className="space-y-1 pt-1">
                          {m.contexts.map((c, i) => (
                            <div key={i} className="space-y-0.5 text-xs">
                              <p className="text-muted-foreground break-all">
                                {c.before}
                              </p>
                              <p className="text-foreground break-all">→ {c.after}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <section className="space-y-2">
          <h2 className="text-sm font-semibold">최근 바꾼 기록</h2>
          {batches.length === 0 ? (
            <p className="text-muted-foreground text-xs">아직 없습니다.</p>
          ) : (
            <ul className="space-y-2">
              {batches.map((b) => (
                <li
                  key={b.batchId}
                  className="border-border flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm"
                >
                  <span className="font-medium">
                    &ldquo;{b.searchTerm}&rdquo; → &ldquo;{b.replaceTerm}&rdquo;
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {b.rows}곳 · {b.occurrences}회 ·{" "}
                    {new Date(b.createdAt).toLocaleString("ko-KR")}
                    {b.authorName ? ` · ${b.authorName}` : ""}
                  </span>
                  {b.revertedAt ? (
                    <Badge variant="outline" className="ml-auto text-xs">
                      되돌림
                    </Badge>
                  ) : (
                    <Form method="post" className="ml-auto">
                      <input type="hidden" name="intent" value="revert" />
                      <input type="hidden" name="batchId" value={b.batchId} />
                      <Button
                        type="submit"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        className="h-7 gap-1 text-xs"
                      >
                        <RotateCcwIcon className="size-3" /> 되돌리기
                      </Button>
                    </Form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
