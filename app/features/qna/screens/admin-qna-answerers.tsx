// 운영관리 — Q&A 과목별 답변자 지정. 카테고리당 복수 담당자(다대다).
// 새 질문이 올라오면 해당 카테고리 담당자에게 이메일·카카오·인앱 알림이 발송된다.

import { CheckIcon, Loader2Icon } from "lucide-react";
import { useState } from "react";
import { Form, data, redirect, useNavigation } from "react-router";

import { Button } from "~/core/components/ui/button";
import { cn } from "~/core/lib/utils";
import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { logAuditEvent } from "~/features/admin/queries/audit-log.server";
import { getStaffRole } from "~/features/laws/queries.server";

import {
  QNA_ANSWERER_CATEGORY_GROUPS,
  QNA_ANSWERER_CATEGORY_LABEL,
  qnaAnswererCategorySchema,
  type QnaAnswererCategory,
} from "../answerers";
import {
  listAnswererAssignments,
  listStaffForAssignment,
  setCategoryAnswerers,
  type StaffOption,
} from "../answerers.server";

import type { Route } from "./+types/admin-qna-answerers";

export const meta: Route.MetaFunction = () => [
  { title: "Q&A 답변자 지정 | 운영자" },
];

const ROLE_LABEL: Record<string, string> = {
  instructor: "강사",
  manager: "매니저",
  admin: "원장",
};

function isManager(role: string | null): boolean {
  return role === "manager" || role === "admin";
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const role = await getStaffRole(client, user.id);
  if (!isManager(role)) throw redirect("/admin");

  // ★ 타 사용자 profile 조회·이름 join 은 RLS 우회(adminClient) 필요.
  const [staff, assignments] = await Promise.all([
    listStaffForAssignment(adminClient),
    listAnswererAssignments(adminClient),
  ]);
  return { staff, assignments };
}

export async function action({ request }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!isManager(role)) return data({ error: "Forbidden" }, { status: 403 });

  const fd = await request.formData();
  const parsed = qnaAnswererCategorySchema.safeParse(fd.get("category"));
  if (!parsed.success) return data({ error: "invalid-category" }, { status: 400 });
  const answererIds = fd.getAll("answererId").map(String).filter(Boolean);

  try {
    // 쓰기는 요청 client — RLS(qna_answerers_write_manager)가 최종 게이트.
    await setCategoryAnswerers(client, parsed.data, answererIds, user.id);
  } catch {
    return data({ error: "save-failed" }, { status: 400 });
  }
  // 감사 — Q&A 답변 라우팅(담당자) 변경은 거버넌스 이벤트.
  await logAuditEvent({
    actorId: user.id,
    actorRole: role,
    action: "qna.set_answerers",
    entityType: "qna_answerer_category",
    entityId: parsed.data,
    metadata: { answererIds },
  });
  return data({ ok: true, savedCategory: parsed.data });
}

export default function AdminQnaAnswerers({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { staff, assignments } = loaderData;
  const savedCategory =
    actionData && "savedCategory" in actionData
      ? actionData.savedCategory
      : null;
  const error = actionData && "error" in actionData ? actionData.error : null;

  return (
    <AdminShell title="Q&A 답변자 지정" cluster="ai-qna">
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <h1 className="text-xl font-bold tracking-tight">Q&A 답변자 지정</h1>
          <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
            과목별로 답변 담당자(강사·매니저·원장)를 지정합니다. 해당 과목의 새
            질문이 올라오면 담당자에게{" "}
            <b>이메일 · 카카오 · 인앱 알림</b>이 발송됩니다(담당자별 알림 채널
            설정에 따름). 담당자를 지정하지 않은 과목은 전체 staff 에게
            발송됩니다.
          </p>
        </header>

        {error ? (
          <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-300">
            저장에 실패했습니다. 다시 시도해 주세요.
          </p>
        ) : null}

        {staff.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            지정 가능한 강사·매니저·원장 계정이 없습니다.
          </p>
        ) : (
          QNA_ANSWERER_CATEGORY_GROUPS.map((group) => (
            <section key={group.label} className="space-y-3">
              <h2 className="text-muted-foreground text-xs font-bold tracking-[0.1em] uppercase">
                {group.label}
              </h2>
              <div className="space-y-2.5">
                {group.categories.map((category) => (
                  <CategoryRow
                    key={category}
                    category={category}
                    staff={staff}
                    assigned={(assignments[category] ?? []).map(
                      (a) => a.answererId,
                    )}
                    justSaved={savedCategory === category}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </AdminShell>
  );
}

function CategoryRow({
  category,
  staff,
  assigned,
  justSaved,
}: {
  category: QnaAnswererCategory;
  staff: StaffOption[];
  assigned: string[];
  justSaved: boolean;
}) {
  const navigation = useNavigation();
  const [selected, setSelected] = useState<Set<string>>(new Set(assigned));
  const saving =
    navigation.state !== "idle" &&
    navigation.formData?.get("category") === category;

  const dirty =
    selected.size !== assigned.length ||
    [...selected].some((id) => !assigned.includes(id));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Form
      method="post"
      className="border-border bg-card rounded-2xl border p-4 shadow-sm"
    >
      <input type="hidden" name="category" value={category} />
      {[...selected].map((id) => (
        <input key={id} type="hidden" name="answererId" value={id} />
      ))}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold">
          {QNA_ANSWERER_CATEGORY_LABEL[category]}
          <span className="text-muted-foreground ml-2 text-xs font-medium">
            {selected.size > 0 ? `담당 ${selected.size}명` : "미지정"}
          </span>
        </p>
        <div className="flex items-center gap-1.5">
          {justSaved && !dirty ? (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-300">
              <CheckIcon className="size-3.5" /> 저장됨
            </span>
          ) : null}
          <Button
            type="submit"
            size="sm"
            disabled={saving || !dirty}
            className="h-8 rounded-full"
          >
            {saving ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : (
              "저장"
            )}
          </Button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {staff.map((s) => {
          const on = selected.has(s.profileId);
          return (
            <button
              key={s.profileId}
              type="button"
              onClick={() => toggle(s.profileId)}
              aria-pressed={on}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] transition-colors",
                on
                  ? "border-primary bg-primary/10 text-primary font-semibold"
                  : "border-border text-muted-foreground hover:border-primary/40",
              )}
            >
              {on ? <CheckIcon className="size-3" /> : null}
              {s.name ?? "이름 미설정"}
              <span className="text-muted-foreground/70 text-[10px]">
                {ROLE_LABEL[s.role] ?? s.role}
              </span>
            </button>
          );
        })}
      </div>
    </Form>
  );
}
