// 운영자 — 체계도 최상위 노드별 문제 관리 진입.
// 8개 최상위 (01 총칙/보칙 ~ 08 국제출원) 카드 + 노드별 문제 수.

import { ArrowRightIcon } from "lucide-react";
import { Form, Link, data } from "react-router";

import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { listSystematicTopNodes } from "~/features/problems/queries.server";
import { LAW_SUBJECTS, LAW_SUBJECT_SLUGS } from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-problems-by-system";

export const meta: Route.MetaFunction = () => [
  { title: "체계도 기반 문제 관리 | Lidam Edu" },
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
  const subjectParam = url.searchParams.get("subject") ?? "patent";
  const subject = LAW_SUBJECT_SLUGS.includes(subjectParam as never)
    ? (subjectParam as (typeof LAW_SUBJECT_SLUGS)[number])
    : "patent";

  const nodes = await listSystematicTopNodes(client, subject);
  return { nodes, subject };
}

export default function AdminProblemsBySystem({ loaderData }: Route.ComponentProps) {
  const { nodes, subject } = loaderData;
  const subjectMeta = LAW_SUBJECTS[subject];
  return (
    <div className="mx-auto w-full max-w-screen-xl px-5 py-6 md:px-10 md:py-8">
      <header className="mb-6 space-y-2">
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          운영 — 체계도 기반
        </p>
        <h1 className="text-2xl font-bold tracking-tight">
          {subjectMeta.name} 객관식 문제 (체계별)
        </h1>
        <p className="text-muted-foreground text-sm">
          체계도 최상위 노드를 선택하면 그 안에 속한 모든 조문의 문제를 한 화면에서 편집할 수 있습니다.
        </p>
      </header>

      <Form method="get" className="mb-4 inline-flex items-center gap-2 text-xs">
        <label className="text-muted-foreground">과목</label>
        <select
          name="subject"
          defaultValue={subject}
          className="border-input bg-background h-7 rounded-md border px-2 text-xs"
        >
          {LAW_SUBJECT_SLUGS.map((s) => (
            <option key={s} value={s}>
              {LAW_SUBJECTS[s].name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="border-input bg-background hover:bg-accent rounded-md border px-2 py-1 text-xs"
        >
          전환
        </button>
      </Form>

      {nodes.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          이 과목에는 등록된 체계도 노드가 없습니다.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {nodes.map((n) => (
            <Link
              key={n.nodeId}
              to={`/admin/problems/system/${n.nodeId}?subject=${subject}`}
              viewTransition
              className="group block"
            >
              <Card className="hover:border-primary h-full">
                <CardHeader>
                  <p className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
                    {n.path}
                  </p>
                </CardHeader>
                <CardContent>
                  <h2 className="font-semibold">{n.displayLabel}</h2>
                  <p className="text-muted-foreground mt-2 text-xs">
                    문제 <span className="text-foreground font-bold">{n.problemCount}</span>건
                  </p>
                  <span className="text-primary mt-3 inline-flex items-center gap-1 text-xs">
                    편집 진입{" "}
                    <ArrowRightIcon className="size-3 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
