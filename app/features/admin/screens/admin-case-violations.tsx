// 체계도 단일 placement 위반 점검 — staff 가 메인 노드를 지정해
// cases.primary_node_id 를 확정한다. /api/admin/case `set_primary_placement`
// intent 재사용. articleId 는 기존 값을 carry (없으면 null 유지).

import { ScaleIcon } from "lucide-react";
import { Link, data, useFetcher } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import {
  AdminSelect,
  Chip,
  Field,
} from "~/features/admin/components/admin-ui";
import {
  getCaseSystematicViolations,
  type CaseSystematicViolation,
} from "~/features/admin/queries/case-violations.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  FIRST_EXAM_LAW_SLUGS,
  LAW_SUBJECTS,
  SECOND_EXAM_LAW_SLUGS,
  lawSubjectSlugSchema,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-case-violations";

export const meta: Route.MetaFunction = () => [
  { title: "체계도 단일 배치 위반 | 리담변리사학원" },
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
  const violations = await getCaseSystematicViolations(client, lawCode);
  return { violations, lawCode, role };
}

export default function AdminCaseViolations({
  loaderData,
}: Route.ComponentProps) {
  const { violations, lawCode, role } = loaderData;
  const subject = LAW_SUBJECTS[lawCode];

  return (
    <AdminShell
      cluster="checks"
      role={role}
      title="체계도 단일 배치 위반"
      desc={
        <>
          한 판례가 체계도 트리의 여러 노드에 잡히는 경우 — 메인 노드를
          지정해 <code>cases.primary_node_id</code> 를 확정합니다. 지정 후
          페이지 새로고침 시 목록에서 사라집니다.
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
        <ScaleIcon className="text-muted-foreground size-4" />
        <span className="text-muted-foreground text-sm">
          {subject.name} · 위반{" "}
          <span className="text-foreground font-semibold tabular-nums">
            {violations.length.toLocaleString("ko-KR")}
          </span>
          건
        </span>
        {violations.length === 0 ? (
          <Chip tone="emerald">위반 없음</Chip>
        ) : (
          <Chip tone="coral">{violations.length}건</Chip>
        )}
      </div>

      {violations.length === 0 ? (
        <div className="bg-emerald-500/5 text-muted-foreground rounded-xl border p-6 text-center text-sm">
          {subject.name} 의 모든 판례가 단일 체계도 노드에 배치되어 있습니다.
        </div>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {violations.map((v) => (
            <ViolationRow key={v.caseId} v={v} lawCode={lawCode} />
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
          to={`/admin/cases/violations?law=${s}`}
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

function ViolationRow({
  v,
  lawCode,
}: {
  v: CaseSystematicViolation;
  lawCode: LawSubjectSlug;
}) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const submitting = fetcher.state !== "idle";
  const done =
    fetcher.data && "ok" in fetcher.data && fetcher.data.ok === true;
  const err =
    fetcher.data && "error" in fetcher.data
      ? (fetcher.data.error ?? null)
      : null;

  const viaArticleLabel = v.viaArticles
    .map((a) => a.articleNumber)
    .filter((n): n is string => n !== null && n !== "")
    .join(", ");

  // case-edit 의 일반 메인 노드 picker 와 동일한 패턴 — amber 박스, AdminSelect,
  // "자동(미지정)" 옵션 + 안내. 변경 즉시 submit (별도 지정 버튼 없음).
  function submitNodeId(nodeId: string | null) {
    const fd = new FormData();
    fd.set("intent", "set_primary_placement");
    fd.set("caseId", v.caseId);
    if (v.primaryArticleId) fd.set("articleId", v.primaryArticleId);
    if (nodeId) fd.set("nodeId", nodeId);
    fetcher.submit(fd, {
      method: "post",
      action: "/api/admin/case",
    });
  }
  const selectId = `violation-node-${v.caseId}`;

  return (
    <li className="p-3 text-sm">
      <div className="mb-1 flex flex-wrap items-baseline gap-2">
        <Link
          to={`/subjects/${lawCode}/cases/${v.caseId}`}
          className="font-semibold hover:underline"
        >
          {v.caseNumber}
        </Link>
        <Chip tone={v.src === "primary_article" ? "amber" : "coral"}>
          {v.scatteredNodes.length}개 노드 산포
        </Chip>
        <span className="text-muted-foreground text-[11px]">
          {v.src === "primary_article"
            ? "primary_article_id 의 다중 ASL"
            : "legacy ACL (primary 미설정)"}
        </span>
        {viaArticleLabel ? (
          <span className="text-muted-foreground text-[11px]">
            via 제{viaArticleLabel}조
          </span>
        ) : null}
        <Link
          to={`/admin/cases/edit/${v.caseId}`}
          className="text-link text-[11px] hover:underline"
        >
          개별 수정 →
        </Link>
      </div>
      <p className="text-muted-foreground mb-2 line-clamp-2 text-xs">
        {v.caseTitle}
      </p>
      {done ? (
        <p className="text-xs text-emerald-600 dark:text-emerald-400">
          메인 노드 지정 완료. 새로고침 시 목록에서 사라집니다.
        </p>
      ) : (
        <div className="border-amber-300 bg-amber-50/60 dark:border-amber-700/50 dark:bg-amber-950/20 flex flex-wrap items-end gap-2 rounded-md border px-3 py-2">
          <Field label="체계도 메인 노드" htmlFor={selectId}>
            <AdminSelect
              id={selectId}
              defaultValue=""
              disabled={submitting}
              onChange={(e) => {
                const val = e.currentTarget.value;
                submitNodeId(val === "" ? null : val);
              }}
              className="w-72"
            >
              <option value="">
                — 자동 (미지정 — {v.scatteredNodes.length}개 산포) ⚠
              </option>
              {v.scatteredNodes.map((n) => (
                <option key={n.nodeId} value={n.nodeId}>
                  {n.path}
                </option>
              ))}
            </AdminSelect>
          </Field>
          <p className="text-muted-foreground basis-full text-[11px] leading-relaxed">
            메인 조문이 <strong>{v.scatteredNodes.length}개</strong> 체계도
            노드에 매핑되어 있어 학생 판례 트리에서 양쪽에 중복 노출됩니다. 한
            노드를 메인으로 지정하세요.
          </p>
          {err ? (
            <p className="text-destructive basis-full text-[11px]">{err}</p>
          ) : null}
        </div>
      )}
    </li>
  );
}
