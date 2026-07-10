// feat-8-029 P6 — 도서정산 배분 기준 관리 (manager+).
// 규칙 = 도서(또는 전체 기본) × 정산 대상(저자/출판사) × 정률(%)/정액(원).
// 값 수정 대신 "새 규칙 + 기존 비활성"(강사 배분규칙과 동일, 지급 근거 보존).
// ※ 실제 도서정산 계산·지급은 추후 — 지금은 규칙 입력만.

import { BookIcon } from "lucide-react";
import { Form, redirect, useActionData } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { roleAtLeast } from "~/core/lib/roles";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { AdminSelect, Chip, Field, IndexTable, TD, TR } from "~/features/admin/components/admin-ui";
import { listBooksForPicker } from "~/features/bookstore/queries.server";
import { listBookSettlementRules } from "~/features/subscriptions/book-settlements-admin.server";

import type { Route } from "./+types/admin-book-settlements";

export const meta: Route.MetaFunction = () => [{ title: "도서 배분 기준 | 운영자" }];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const { data: prof } = await client
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!roleAtLeast(prof?.role, "manager")) throw redirect("/admin");

  const [rules, books] = await Promise.all([
    listBookSettlementRules(),
    listBooksForPicker(),
  ]);
  return { rules, books };
}

export default function AdminBookSettlements({ loaderData }: Route.ComponentProps) {
  const { rules, books } = loaderData;
  const actionData = useActionData<{ error?: string }>();
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

  return (
    <AdminShell
      cluster="sales"
      title="도서 배분 기준"
      desc="도서 판매 정산의 배분 규칙을 등록합니다. 도서별(또는 전체 기본) × 정산 대상(저자/출판사) × 정률(%)/정액(원). 값 변경은 새 규칙을 등록하고 기존 규칙을 비활성하세요 — 확정 정산의 지급 근거가 보존됩니다. (실제 정산 계산·지급 화면은 추후 제공)"
    >
      {/* 등록 폼 */}
      <Form
        method="post"
        action="/api/admin/book-settlement-rule"
        className="border-border bg-card mb-5 rounded-xl border p-4 shadow-sm"
      >
        <input type="hidden" name="intent" value="create" />
        <h2 className="mb-3 inline-flex items-center gap-1.5 text-sm font-bold">
          <BookIcon className="text-link size-4" /> 규칙 등록
        </h2>
        {actionData?.error ? (
          <p className="mb-3 text-xs font-semibold text-rose-600">{actionData.error}</p>
        ) : null}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Field label="대상 도서" htmlFor="bookId" hint="비우면 전체 기본 규칙">
            <AdminSelect id="bookId" name="bookId" defaultValue="">
              <option value="">전체 기본 (모든 도서)</option>
              {books.map((b) => (
                <option key={b.bookId} value={b.bookId}>
                  {b.title}
                </option>
              ))}
            </AdminSelect>
          </Field>
          <Field label="정산 대상" required htmlFor="payeeName" hint="저자/출판사 등">
            <Input id="payeeName" name="payeeName" maxLength={200} required className="h-9" />
          </Field>
          <Field label="배분 방식" required htmlFor="shareKind">
            <AdminSelect id="shareKind" name="shareKind" defaultValue="percent">
              <option value="percent">정률 (%)</option>
              <option value="fixed">정액 (원/권)</option>
            </AdminSelect>
          </Field>
          <Field
            label="배분 값"
            required
            htmlFor="shareValue"
            hint="정률: 1~100(%) · 정액: 판매 1권당 원"
          >
            <Input
              id="shareValue"
              name="shareValue"
              type="number"
              min={0}
              required
              className="h-9"
            />
          </Field>
          <Field label="적용 시작일" required htmlFor="effectiveFrom">
            <Input
              id="effectiveFrom"
              name="effectiveFrom"
              type="date"
              defaultValue={today}
              required
              className="h-9"
            />
          </Field>
          <Field label="메모" htmlFor="memo">
            <Input id="memo" name="memo" maxLength={300} className="h-9" />
          </Field>
        </div>
        <div className="mt-3">
          <Button type="submit" size="sm">
            등록
          </Button>
        </div>
      </Form>

      {/* 규칙 목록 */}
      {rules.length === 0 ? (
        <div className="border-border bg-card text-muted-foreground rounded-xl border py-12 text-center text-sm shadow-sm">
          등록된 도서 배분 규칙이 없습니다.
        </div>
      ) : (
        <IndexTable
          minWidth={860}
          headers={[
            { label: "대상 도서" },
            { label: "정산 대상", width: "10rem" },
            { label: "방식", align: "center", width: "6rem" },
            { label: "배분 값", align: "right", width: "8rem" },
            { label: "적용 시작", width: "7rem" },
            { label: "메모" },
            { label: "상태", align: "center", width: "5rem" },
            { label: "", align: "right", width: "6rem" },
          ]}
        >
          {rules.map((r) => (
            <TR key={r.ruleId}>
              <TD>
                {r.bookId ? (
                  <span>{r.bookTitle ?? "(삭제된 도서)"}</span>
                ) : (
                  <Chip tone="neutral">전체 기본</Chip>
                )}
              </TD>
              <TD>{r.payeeName}</TD>
              <TD align="center" soft>
                {r.shareKind === "percent" ? "정률" : "정액"}
              </TD>
              <TD align="right" mono>
                {r.shareKind === "percent"
                  ? `${r.shareValue}%`
                  : `₩${r.shareValue.toLocaleString("ko-KR")}/권`}
              </TD>
              <TD mono soft>
                {r.effectiveFrom}
              </TD>
              <TD soft className="max-w-[16rem] truncate">
                {r.memo ?? "—"}
              </TD>
              <TD align="center">
                {r.isActive ? (
                  <Chip tone="emerald">활성</Chip>
                ) : (
                  <Chip tone="neutral">비활성</Chip>
                )}
              </TD>
              <TD align="right">
                <Form method="post" action="/api/admin/book-settlement-rule">
                  <input type="hidden" name="intent" value="toggle" />
                  <input type="hidden" name="ruleId" value={r.ruleId} />
                  <input type="hidden" name="isActive" value={r.isActive ? "false" : "true"} />
                  <button
                    type="submit"
                    className="text-link text-xs font-semibold hover:underline"
                  >
                    {r.isActive ? "비활성화" : "활성화"}
                  </button>
                </Form>
              </TD>
            </TR>
          ))}
        </IndexTable>
      )}
    </AdminShell>
  );
}
