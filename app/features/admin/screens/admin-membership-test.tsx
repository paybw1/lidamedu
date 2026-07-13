// 회원 등급 체험 테스트 — 원장(admin) 전용.
// 자기 계정의 profiles.membership_test_grade 를 설정해, 학생 대면 화면(학습과목·요금제·
// 대시보드 등)을 선택한 등급 그대로 본다. 운영관리 접근(getStaffRole 기반)은 유지된다.

import { FlaskConicalIcon, RotateCcwIcon } from "lucide-react";
import { Form, data, redirect, useNavigation } from "react-router";
import { z } from "zod";

import { Button } from "~/core/components/ui/button";
import { requireAdmin } from "~/core/lib/admin-guard.server";
import adminClient from "~/core/lib/supa-admin-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip } from "~/features/admin/components/admin-ui";

import type { Route } from "./+types/admin-membership-test";

export const meta: Route.MetaFunction = () => [
  { title: "등급 체험 테스트 | 리담변리사학원" },
];

interface PlanOption {
  code: string;
  name: string;
  kind: string;
  subjectCodes: string[];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { user, role } = await requireAdmin(request);
  const [{ data: prof }, { data: planRows }] = await Promise.all([
    adminClient
      .from("profiles")
      .select("membership_test_grade")
      .eq("profile_id", user.id)
      .maybeSingle(),
    adminClient
      .from("subscription_plans")
      .select("code, name, product_kind, subject_codes")
      .in("product_kind", ["subject", "bundle"])
      .order("product_kind")
      .order("name"),
  ]);
  const plans: PlanOption[] = (planRows ?? []).map((p) => ({
    code: p.code,
    name: p.name,
    kind: p.product_kind,
    subjectCodes: Array.isArray(p.subject_codes)
      ? (p.subject_codes as string[])
      : [],
  }));
  return { current: prof?.membership_test_grade ?? null, plans, role };
}

const schema = z.object({ grade: z.string().max(100) });

export async function action({ request }: Route.ActionArgs) {
  const { user } = await requireAdmin(request);
  const fd = await request.formData();
  // 해제 버튼은 intent=clear — 라디오(name=grade)와 같은 name을 쓰면 체크된
  // 라디오 값이 먼저 직렬화되어 해제가 무시되므로 name을 분리한다.
  const isClear = fd.get("intent") === "clear";
  let value: string | null = null;
  if (!isClear) {
    const parsed = schema.safeParse({ grade: String(fd.get("grade") ?? "") });
    if (!parsed.success) return data({ error: "입력 오류" }, { status: 400 });
    value = parsed.data.grade === "" ? null : parsed.data.grade;
  }
  const { error } = await adminClient
    .from("profiles")
    .update({ membership_test_grade: value })
    .eq("profile_id", user.id);
  if (error) return data({ error: error.message }, { status: 400 });
  throw redirect("/admin/membership-test");
}

export default function AdminMembershipTest({
  loaderData,
}: Route.ComponentProps) {
  const { current, plans, role } = loaderData;
  const nav = useNavigation();
  const submitting = nav.state !== "idle";

  const options: Array<{ value: string; label: string; desc: string }> = [
    {
      value: "trial",
      label: "신규가입자 — 체험 (가입 15일 이내)",
      desc: "특허법 + 자연과학 열람, 자기학습 수준 기능",
    },
    {
      value: "free_member",
      label: "신규가입자 — 무료회원 (가입 15일 이후)",
      desc: "학습과목 제외, 커뮤니티·학습정보만",
    },
    ...plans.map((p) => ({
      value: `plan:${p.code}`,
      label: `${p.kind === "bundle" ? "번들" : "개별 과목"} — ${p.name}`,
      desc: `열리는 과목: ${p.subjectCodes.join(", ") || "(상품 정의 없음)"} + 자연과학`,
    })),
    {
      value: "cohort",
      label: "종합반",
      desc: "전 과목 + 종합반 전체 기능(상담·과제·반별 게시판 등)",
    },
  ];

  return (
    <AdminShell
      cluster="students"
      role={role}
      title="등급 체험 테스트"
      desc="선택한 등급으로 학생 대면 화면(학습과목·요금제·대시보드)이 보입니다. 운영관리 접근은 유지됩니다. (원장 전용, 본인 계정에만 적용)"
      headerRight={
        current ? (
          <Chip tone="solid">
            <FlaskConicalIcon className="size-3" /> 체험 중:{" "}
            {options.find((o) => o.value === current)?.label ?? current}
          </Chip>
        ) : (
          <Chip tone="outline">해제됨 (원장 본래 권한)</Chip>
        )
      }
    >
      {current ? (
        <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50/70 px-4 py-3 text-sm text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-200">
          ⚠️ 지금 학생 화면이{" "}
          <strong>
            {options.find((o) => o.value === current)?.label ?? current}
          </strong>{" "}
          등급으로 보입니다. 테스트가 끝나면 반드시 아래 ‘해제’로 되돌리세요.
        </div>
      ) : null}

      <Form method="post" className="space-y-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={`border-border bg-card hover:border-primary/50 flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 shadow-sm ${
              current === o.value ? "border-primary ring-primary/20 ring-2" : ""
            }`}
          >
            <input
              type="radio"
              name="grade"
              value={o.value}
              defaultChecked={current === o.value}
              className="mt-1 size-3.5"
            />
            <span>
              <span className="block text-sm font-semibold">{o.label}</span>
              <span className="text-muted-foreground block text-xs">
                {o.desc}
              </span>
            </span>
          </label>
        ))}

        <div className="flex items-center gap-2 pt-2">
          <Button type="submit" size="sm" disabled={submitting}>
            <FlaskConicalIcon className="size-3.5" /> 이 등급으로 체험
          </Button>
          <Button
            type="submit"
            size="sm"
            variant="outline"
            name="intent"
            value="clear"
            disabled={submitting || !current}
          >
            <RotateCcwIcon className="size-3.5" /> 해제 (원장 권한 복귀)
          </Button>
        </div>
      </Form>

      <p className="text-muted-foreground mt-4 text-xs leading-relaxed">
        적용 후 학습과목·요금제 등 학생 화면으로 이동하면 해당 등급의 게이트가
        그대로 동작합니다(예: 무료회원이면 학습과목 진입 시 요금제로 이동).
        결제 버튼 노출 테스트는 <code>/pricing?testStudent=1</code> 과 함께 쓸 수
        있습니다.
      </p>
    </AdminShell>
  );
}
