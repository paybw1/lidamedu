// feat-11-010 C단계 — 수강기간 연장 이력 (/admin/lms/extensions). 요청서_0901 §3.
//
// 요청서가 저장하라고 명시한 항목을 한 줄에 모아 보여 준다:
//   회원명/회원번호 · 강의명 · 기존 종료일 · 연장일수 · 변경 종료일 · 금액 ·
//   결제일 · 결제번호 · 횟수 · 결제상태 · 환불상태.
// ★환불했지만 **이미 연장기간을 써 버려** 만료일을 자동으로 못 되돌린 건은 배지로 띄운다.
//   그 건은 사람이 판단해야 한다(요청서 "관리자 확인 후 수동 처리 가능한 예외 기능").
import { useEffect } from "react";

import { CalendarPlusIcon } from "lucide-react";
import { Link, data, redirect, useFetcher } from "react-router";
import { toast } from "sonner";

import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip, IndexTable, TD, TR } from "~/features/admin/components/admin-ui";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  listExtensionHistory,
  markExtensionHandled,
} from "~/features/lms/extension.server";

import type { Route } from "./+types/admin-lms-extensions";

export function meta() {
  return [{ title: "수강기간 연장 이력 | 운영관리" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const role = await getStaffRole(client, user.id);
  if (!role) throw redirect("/dashboard");
  const rows = await listExtensionHistory();
  return { role, rows };
}

export async function action({ request }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "로그인이 필요합니다." }, { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) return data({ error: "권한이 없습니다." }, { status: 403 });

  const fd = await request.formData();
  if (fd.get("intent") !== "handled") {
    return data({ error: "알 수 없는 요청입니다." }, { status: 400 });
  }
  const note = String(fd.get("note") ?? "").trim();
  if (!note) return data({ error: "처리 내용을 입력해 주세요." }, { status: 400 });
  const res = await markExtensionHandled(
    String(fd.get("extensionId") ?? ""),
    note,
  );
  return res.ok
    ? { ok: true, message: "수동 처리 내용을 기록했습니다." }
    : data({ error: res.error }, { status: 400 });
}

const d10 = (v: string | null) => (v ? v.slice(0, 10) : "—");

export default function AdminLmsExtensions({ loaderData }: Route.ComponentProps) {
  const { role, rows } = loaderData;
  const fetcher = useFetcher<{ message?: string; error?: string }>();
  useEffect(() => {
    if (fetcher.data?.error) toast.error(fetcher.data.error);
    else if (fetcher.data?.message) toast.success(fetcher.data.message);
  }, [fetcher.data]);

  const pending = rows.filter((r) => r.needsManual && !r.note).length;

  return (
    <AdminShell
      cluster="lms"
      role={role}
      title="수강기간 연장 이력"
      desc="유료 연장 결제 내역과 만료일 변경 기록입니다. 환불 시 연장일수는 자동으로 원복됩니다."
      headerRight={
        <Chip tone={pending > 0 ? "amber" : "solid"}>
          <CalendarPlusIcon className="size-3" /> {rows.length}건
          {pending > 0 ? ` · 수동 처리 ${pending}` : ""}
        </Chip>
      }
    >
      {rows.length === 0 ? (
        <p className="text-muted-foreground py-10 text-center text-sm">
          연장 결제 내역이 아직 없습니다.
        </p>
      ) : (
        <IndexTable
          minWidth={1100}
          headers={[
            { label: "회원" },
            { label: "강의" },
            { label: "기존 종료일 → 변경 종료일" },
            { label: "일수", align: "right" },
            { label: "금액", align: "right" },
            { label: "결제" },
            { label: "상태" },
            { label: "처리" },
          ]}
        >
          {rows.map((r) => (
            <TR key={r.extensionId}>
              <TD>
                <span className="font-medium">{r.memberName ?? "—"}</span>
                {r.memberNo !== null ? (
                  <span className="text-muted-foreground ml-1 text-[11px] tabular-nums">
                    #{r.memberNo}
                  </span>
                ) : null}
              </TD>
              <TD>{r.courseLabel}</TD>
              <TD mono>
                {d10(r.prevExpiresAt)} → <b>{d10(r.nextExpiresAt)}</b>
              </TD>
              <TD mono align="right">
                {r.daysAdded}일
                <span className="text-muted-foreground ml-1 text-[11px]">
                  {r.seq}회차
                </span>
              </TD>
              <TD mono align="right">
                ₩{r.amountKrw.toLocaleString("ko-KR")}
              </TD>
              <TD>
                <div className="font-variant-numeric tabular-nums">
                  {d10(r.paidAt)}
                </div>
                <div className="text-muted-foreground text-[11px] break-all">
                  {r.paymentRef ?? "—"}
                </div>
              </TD>
              <TD>
                <Chip tone={r.status === "applied" ? "emerald" : "outline"}>
                  {r.status === "applied" ? "적용" : "원복"}
                </Chip>
                {r.refundedAt ? (
                  <Chip tone="amber">환불 {d10(r.refundedAt)}</Chip>
                ) : null}
                {r.paymentStatus ? (
                  <span className="text-muted-foreground ml-1 text-[11px]">
                    {r.paymentStatus}
                  </span>
                ) : null}
              </TD>
              <TD>
                {r.needsManual && !r.note ? (
                  <fetcher.Form method="post" className="flex items-center gap-1">
                    <input type="hidden" name="intent" value="handled" />
                    <input
                      type="hidden"
                      name="extensionId"
                      value={r.extensionId}
                    />
                    <Chip tone="amber">수동 처리 필요</Chip>
                    <input
                      name="note"
                      placeholder="처리 내용"
                      className="border-input bg-background h-7 w-32 rounded-md border px-2 text-[11px]"
                    />
                    <Button type="submit" size="sm" variant="outline">
                      기록
                    </Button>
                    <Button asChild size="sm" variant="ghost">
                      <Link to="/admin/lms/enrollments">기간 조정 →</Link>
                    </Button>
                  </fetcher.Form>
                ) : r.note ? (
                  <span className="text-muted-foreground text-[11px]">
                    {r.note}
                  </span>
                ) : (
                  <span className="text-muted-foreground text-[11px]">—</span>
                )}
              </TD>
            </TR>
          ))}
        </IndexTable>
      )}
    </AdminShell>
  );
}
