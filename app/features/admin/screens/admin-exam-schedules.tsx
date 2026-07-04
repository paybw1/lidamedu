// 시험일 관리 (manager+) — 연도×차수별 변리사 시험일 등록.
// 학생 목표 폼("응시 시험" 선택)의 시험일 자동 파생 소스(exam_schedules SSOT).

import { CalendarDaysIcon } from "lucide-react";
import { Form, data, redirect, useActionData } from "react-router";
import { z } from "zod";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { roleAtLeast } from "~/core/lib/roles";
import makeServerClient from "~/core/lib/supa-client.server";
import adminClient from "~/core/lib/supa-admin-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import {
  AdminSelect,
  Chip,
  Field,
  IndexTable,
  TD,
  TR,
} from "~/features/admin/components/admin-ui";

import type { Route } from "./+types/admin-exam-schedules";

export const meta: Route.MetaFunction = () => [
  { title: "시험일 관리 | 운영자" },
];

async function requireManager(request: Request) {
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
  return user;
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireManager(request);
  const { data: rows, error } = await adminClient
    .from("exam_schedules")
    .select("exam_year, exam_round, exam_date, memo, updated_at")
    .order("exam_date", { ascending: false });
  if (error) throw error;
  return { schedules: rows ?? [] };
}

const upsertSchema = z.object({
  intent: z.literal("upsert"),
  examYear: z.coerce.number().int().min(2020).max(2100),
  examRound: z.enum(["first", "second"]),
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "시험일은 날짜 형식"),
  memo: z.string().max(200).optional().or(z.literal("")),
});
const deleteSchema = z.object({
  intent: z.literal("delete"),
  examYear: z.coerce.number().int(),
  examRound: z.enum(["first", "second"]),
});

export async function action({ request }: Route.ActionArgs) {
  await requireManager(request);
  const form = Object.fromEntries(await request.formData());

  if (form.intent === "upsert") {
    const parsed = upsertSchema.safeParse(form);
    if (!parsed.success)
      return data({ error: parsed.error.issues[0]?.message ?? "입력 오류" }, { status: 400 });
    const v = parsed.data;
    const { error } = await adminClient.from("exam_schedules").upsert({
      exam_year: v.examYear,
      exam_round: v.examRound,
      exam_date: v.examDate,
      memo: v.memo || null,
      updated_at: new Date().toISOString(),
    });
    if (error) return data({ error: error.message }, { status: 400 });
    return redirect("/admin/exam-schedules");
  }
  if (form.intent === "delete") {
    const parsed = deleteSchema.safeParse(form);
    if (!parsed.success)
      return data({ error: "입력값을 확인해 주세요." }, { status: 400 });
    const { error } = await adminClient
      .from("exam_schedules")
      .delete()
      .eq("exam_year", parsed.data.examYear)
      .eq("exam_round", parsed.data.examRound);
    if (error) return data({ error: error.message }, { status: 400 });
    return redirect("/admin/exam-schedules");
  }
  return data({ error: "알 수 없는 intent" }, { status: 400 });
}

export default function AdminExamSchedules({ loaderData }: Route.ComponentProps) {
  const { schedules } = loaderData;
  const actionData = useActionData<{ error?: string }>();
  const nextYear = new Date().getFullYear() + 1;
  const todayYmd = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

  return (
    <AdminShell
      cluster="analytics"
      title="시험일 관리"
      desc="연도·차수별 변리사 시험일을 등록합니다. 학생이 학습 목표에서 '응시 시험'(예: 2027년 1차)을 고르면 여기 등록된 시험일이 자동으로 설정됩니다."
    >
      <Form
        method="post"
        className="border-border bg-card mb-5 rounded-xl border p-4 shadow-sm"
      >
        <input type="hidden" name="intent" value="upsert" />
        <h2 className="mb-3 inline-flex items-center gap-1.5 text-sm font-bold">
          <CalendarDaysIcon className="text-link size-4" /> 시험일 등록·수정
        </h2>
        {actionData?.error ? (
          <p className="mb-3 text-xs font-semibold text-rose-600">{actionData.error}</p>
        ) : null}
        <div className="flex flex-wrap items-end gap-3">
          <Field label="연도" required htmlFor="examYear">
            <Input
              id="examYear"
              name="examYear"
              type="number"
              min={2020}
              max={2100}
              defaultValue={nextYear}
              required
              className="h-9 w-28"
            />
          </Field>
          <Field label="차수" required htmlFor="examRound">
            <AdminSelect id="examRound" name="examRound" defaultValue="first">
              <option value="first">1차 (객관식)</option>
              <option value="second">2차 (주관식)</option>
            </AdminSelect>
          </Field>
          <Field label="시험일" required htmlFor="examDate">
            <Input id="examDate" name="examDate" type="date" required className="h-9" />
          </Field>
          <Field label="메모" htmlFor="memo" className="min-w-[200px] flex-1">
            <Input id="memo" name="memo" maxLength={200} className="h-9" />
          </Field>
          <Button type="submit" size="sm">
            저장
          </Button>
        </div>
        <p className="text-muted-foreground mt-2 text-[11px]">
          같은 연도·차수를 다시 저장하면 시험일이 수정됩니다.
        </p>
      </Form>

      {schedules.length === 0 ? (
        <div className="border-border bg-card text-muted-foreground rounded-xl border py-12 text-center text-sm shadow-sm">
          등록된 시험 일정이 없습니다.
        </div>
      ) : (
        <IndexTable
          minWidth={620}
          headers={[
            { label: "연도", align: "center", width: "5rem" },
            { label: "차수", align: "center", width: "7rem" },
            { label: "시험일", width: "8rem" },
            { label: "상태", align: "center", width: "6rem" },
            { label: "메모" },
            { label: "", align: "right", width: "5rem" },
          ]}
        >
          {schedules.map((s) => (
            <TR key={`${s.exam_year}-${s.exam_round}`}>
              <TD align="center" mono>
                {s.exam_year}
              </TD>
              <TD align="center">
                <Chip tone={s.exam_round === "first" ? "blue" : "violet"}>
                  {s.exam_round === "first" ? "1차" : "2차"}
                </Chip>
              </TD>
              <TD mono>{s.exam_date}</TD>
              <TD align="center" soft>
                {s.exam_date >= todayYmd ? (
                  <Chip tone="emerald">예정</Chip>
                ) : (
                  <Chip tone="neutral">지남</Chip>
                )}
              </TD>
              <TD soft className="max-w-[16rem] truncate">
                {s.memo ?? "—"}
              </TD>
              <TD align="right">
                <Form
                  method="post"
                  onSubmit={(e) => {
                    if (
                      !confirm(
                        `${s.exam_year}년 ${s.exam_round === "first" ? "1차" : "2차"} 일정을 삭제하시겠습니까? 이 일정을 선택한 학생의 기존 시험일은 유지됩니다.`,
                      )
                    )
                      e.preventDefault();
                  }}
                >
                  <input type="hidden" name="intent" value="delete" />
                  <input type="hidden" name="examYear" value={s.exam_year} />
                  <input type="hidden" name="examRound" value={s.exam_round} />
                  <button
                    type="submit"
                    className="text-xs font-semibold text-rose-600 hover:underline dark:text-rose-400"
                  >
                    삭제
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
