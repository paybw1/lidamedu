// feat-7-041 강사관리 (admin 전용) — 강사별 담당 과목(콘텐츠 쓰기 권한) + 배분 규칙 연결.
// 담당 과목 = instructor_subjects. 강사는 지정된 과목만 문제·판례·조문개정 쓰기 가능.
// 정산은 매출·정산 > 강사 배분 기준(instructor_share_rules)이 담당 — 여기선 요약·불일치 경고만.

import { GraduationCapIcon } from "lucide-react";
import { Form, Link, data } from "react-router";
import { z } from "zod";

import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import adminClient from "~/core/lib/supa-admin-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip, IndexTable, TD, TR } from "~/features/admin/components/admin-ui";
import { getStaffRole } from "~/features/laws/queries.server";
import { listShareRules } from "~/features/subscriptions/settlements-admin.server";
import { LAW_SUBJECTS, LAW_SUBJECT_SLUGS } from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-instructors";

export const meta: Route.MetaFunction = () => [
  { title: "강사 관리 | 리담변리사학원" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (role !== "admin") throw data("Forbidden — admin only", { status: 403 });

  const [{ data: instructors }, { data: subjectRows }, rules] =
    await Promise.all([
      adminClient
        .from("profiles")
        .select("profile_id, member_no, name, created_at")
        .eq("role", "instructor")
        .order("name"),
      adminClient
        .from("instructor_subjects")
        .select("instructor_id, subject_code"),
      listShareRules({ activeOnly: true }),
    ]);
  const subjectsByInstructor = new Map<string, string[]>();
  for (const r of subjectRows ?? []) {
    if (!subjectsByInstructor.has(r.instructor_id))
      subjectsByInstructor.set(r.instructor_id, []);
    subjectsByInstructor.get(r.instructor_id)!.push(r.subject_code);
  }
  const rulesByInstructor = new Map<string, string[]>();
  for (const r of rules) {
    const label =
      (r.targetKind === "plan"
        ? (r.targetPlanName ?? "상품")
        : r.targetKind === "subject"
          ? (LAW_SUBJECTS[r.targetSubjectCode as keyof typeof LAW_SUBJECTS]?.name ??
            r.targetSubjectCode)
          : "전체") +
      " " +
      (r.shareKind === "percent"
        ? `${r.shareValue}%`
        : `₩${r.shareValue.toLocaleString("ko-KR")}/건`);
    if (!rulesByInstructor.has(r.instructorId))
      rulesByInstructor.set(r.instructorId, []);
    rulesByInstructor.get(r.instructorId)!.push(label);
  }

  return {
    role,
    instructors: (instructors ?? []).map((i) => ({
      profileId: i.profile_id,
      memberNo: i.member_no,
      name: i.name,
      createdAt: i.created_at,
      subjects: subjectsByInstructor.get(i.profile_id) ?? [],
      ruleLabels: rulesByInstructor.get(i.profile_id) ?? [],
    })),
  };
}

const saveSchema = z.object({
  intent: z.literal("set_subjects"),
  instructorId: z.string().uuid(),
});

export async function action({ request }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (role !== "admin") throw data("Forbidden — admin only", { status: 403 });

  const fd = await request.formData();
  const parsed = saveSchema.safeParse({
    intent: fd.get("intent"),
    instructorId: fd.get("instructorId"),
  });
  if (!parsed.success)
    return data({ error: "입력값을 확인해 주세요." }, { status: 400 });
  const subjects = fd
    .getAll("subjects")
    .map(String)
    .filter((s) => (LAW_SUBJECT_SLUGS as readonly string[]).includes(s));

  // 대상이 강사 계정인지 확인.
  const { data: prof } = await adminClient
    .from("profiles")
    .select("role")
    .eq("profile_id", parsed.data.instructorId)
    .maybeSingle();
  if (prof?.role !== "instructor")
    return data({ error: "강사 계정이 아닙니다." }, { status: 400 });

  // 교체 저장 — 기존 삭제 후 재삽입 (지정 이력이 필요해지면 grant/revoke 로그로 확장).
  const { error: delErr } = await adminClient
    .from("instructor_subjects")
    .delete()
    .eq("instructor_id", parsed.data.instructorId);
  if (delErr) return data({ error: delErr.message }, { status: 400 });
  if (subjects.length > 0) {
    const { error: insErr } = await adminClient.from("instructor_subjects").insert(
      subjects.map((s) => ({
        instructor_id: parsed.data.instructorId,
        subject_code: s,
        granted_by: user.id,
      })),
    );
    if (insErr) return data({ error: insErr.message }, { status: 400 });
  }
  return data({ ok: true });
}

export default function AdminInstructors({ loaderData }: Route.ComponentProps) {
  const { role, instructors } = loaderData;

  return (
    <AdminShell
      cluster="instructors"
      role={role}
      title="강사 관리"
      desc="강사별 담당 과목을 지정합니다. 강사는 담당 과목의 콘텐츠(문제·판례·조문 개정)만 작성·수정할 수 있으며, 담당 과목이 없으면 콘텐츠를 수정할 수 없습니다. 정산 배분율은 매출·정산 > 강사 배분 기준에서 설정합니다."
      headerRight={
        <Chip tone="solid">
          <GraduationCapIcon className="size-3" /> {instructors.length}명
        </Chip>
      }
    >
      {instructors.length === 0 ? (
        <div className="border-border bg-card text-muted-foreground rounded-xl border py-14 text-center text-sm shadow-sm">
          강사 계정이 없습니다. 수강생 목록에서 역할을 &ldquo;강사&rdquo;로 변경하면 여기에
          나타납니다.
        </div>
      ) : (
        <IndexTable
          minWidth={920}
          headers={[
            { label: "강사", width: "11rem" },
            { label: "담당 과목 (콘텐츠 쓰기 권한)" },
            { label: "배분 규칙", width: "16rem" },
            { label: "", align: "right", width: "6rem" },
          ]}
        >
          {instructors.map((ins) => (
            <TR key={ins.profileId}>
              <TD>
                {ins.name || "(이름 없음)"}
                {ins.memberNo != null ? (
                  <span className="text-muted-foreground ml-1 text-[11px]">
                    #{ins.memberNo}
                  </span>
                ) : null}
              </TD>
              <TD className="py-3">
                <Form method="post" className="flex flex-wrap items-center gap-3">
                  <input type="hidden" name="intent" value="set_subjects" />
                  <input type="hidden" name="instructorId" value={ins.profileId} />
                  {LAW_SUBJECT_SLUGS.map((slug) => (
                    <label
                      key={slug}
                      className="inline-flex items-center gap-1.5 text-[13px] font-medium"
                    >
                      <input
                        type="checkbox"
                        name="subjects"
                        value={slug}
                        defaultChecked={ins.subjects.includes(slug)}
                        className="accent-primary"
                      />
                      {LAW_SUBJECTS[slug].name}
                    </label>
                  ))}
                  <Button type="submit" size="sm" variant="outline" className="h-7">
                    저장
                  </Button>
                </Form>
                {ins.subjects.length === 0 ? (
                  <p className="mt-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                    담당 과목 미지정 — 콘텐츠 쓰기 불가 상태입니다.
                  </p>
                ) : null}
              </TD>
              <TD soft>
                {ins.ruleLabels.length > 0 ? (
                  <span className="block text-[12px]" title={ins.ruleLabels.join(", ")}>
                    {ins.ruleLabels.join(" · ")}
                  </span>
                ) : ins.subjects.length > 0 ? (
                  <Chip tone="amber">배분 규칙 미설정</Chip>
                ) : (
                  "—"
                )}
              </TD>
              <TD align="right">
                <Link
                  to="/admin/settlements/rules"
                  className="text-link text-xs font-semibold hover:underline"
                >
                  배분 규칙 →
                </Link>
              </TD>
            </TR>
          ))}
        </IndexTable>
      )}
    </AdminShell>
  );
}
