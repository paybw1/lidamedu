import { ArrowRightIcon, BrainIcon } from "lucide-react";
import { Link, data } from "react-router";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "~/core/components/ui/tabs";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Bar, IndexTable, TD, TR } from "~/features/admin/components/admin-ui";
import {
  getAdminAutoBlankStats,
  getAdminContentBlankStats,
  type AdminAutoStats,
  type AdminContentStats,
} from "~/features/blanks/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  getAdminRecitationStats,
  type AdminRecitationStats,
} from "~/features/recitation/queries.server";

import type { Route } from "./+types/admin-blanks-stats";

export const meta: Route.MetaFunction = () => [
  { title: "빈칸 학습 통계 (운영) | Lidam Patent Attorney Academy" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const [content, subject, period, recitation] = await Promise.all([
    getAdminContentBlankStats(client),
    getAdminAutoBlankStats(client, "subject"),
    getAdminAutoBlankStats(client, "period"),
    getAdminRecitationStats(client),
  ]);
  return { content, subject, period, recitation, role };
}

export default function AdminBlanksStats({
  loaderData,
}: Route.ComponentProps) {
  const { content, subject, period, recitation, role } = loaderData;

  return (
    <AdminShell
      cluster="blanks"
      role={role}
      title="빈칸 학습 분석"
      desc="학습자 시도 이력을 기반으로 한 모드별 집계. 가장 많이 틀린 빈칸을 확인해 출제 난이도를 조절하세요."
    >
      <Tabs defaultValue="content" className="space-y-4">
        <TabsList>
          <TabsTrigger value="content">
            내용 빈칸{" "}
            <span className="text-muted-foreground ml-1 tabular-nums">
              {content.totalAttempts}
            </span>
          </TabsTrigger>
          <TabsTrigger value="subject">
            주체 빈칸{" "}
            <span className="text-muted-foreground ml-1 tabular-nums">
              {subject.totalAttempts}
            </span>
          </TabsTrigger>
          <TabsTrigger value="period">
            시기 빈칸{" "}
            <span className="text-muted-foreground ml-1 tabular-nums">
              {period.totalAttempts}
            </span>
          </TabsTrigger>
          <TabsTrigger value="recitation">
            <BrainIcon className="mr-1 size-3.5" />
            암기{" "}
            <span className="text-muted-foreground ml-1 tabular-nums">
              {recitation.totalAttempts}
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="content">
          <ContentAdminView stats={content} />
        </TabsContent>
        <TabsContent value="subject">
          <AutoAdminView stats={subject} blankType="subject" />
        </TabsContent>
        <TabsContent value="period">
          <AutoAdminView stats={period} blankType="period" />
        </TabsContent>
        <TabsContent value="recitation">
          <RecitationAdminView stats={recitation} />
        </TabsContent>
      </Tabs>
    </AdminShell>
  );
}

function SummaryCards({
  totalAttempts,
  correctAttempts,
  activeUsers,
  uniqueBlanks,
}: {
  totalAttempts: number;
  correctAttempts: number;
  activeUsers: number;
  uniqueBlanks: number;
}) {
  const accuracy =
    totalAttempts > 0 ? Math.round((correctAttempts / totalAttempts) * 100) : 0;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <SummaryCard label="총 시도" value={String(totalAttempts)} />
      <SummaryCard
        label="평균 정답률"
        value={`${accuracy}%`}
        subtle={`정답 ${correctAttempts}`}
        tone={accuracy < 60 ? "coral" : "emerald"}
      />
      <SummaryCard label="학습자 수" value={String(activeUsers)} />
      <SummaryCard label="시도된 빈칸" value={String(uniqueBlanks)} />
    </div>
  );
}

function ContentAdminView({ stats }: { stats: AdminContentStats }) {
  return (
    <div className="space-y-4">
      <SummaryCards
        totalAttempts={stats.totalAttempts}
        correctAttempts={stats.correctAttempts}
        activeUsers={stats.activeUsers}
        uniqueBlanks={stats.uniqueBlanks}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <ContentBlanksTable
          title="가장 많이 틀린 빈칸 TOP 20"
          rows={stats.topWrong}
          orderBy="wrongCount"
        />
        <ContentBlanksTable
          title="가장 많이 시도한 빈칸 TOP 20"
          rows={stats.topTried}
          orderBy="attempts"
        />
      </div>
    </div>
  );
}

function AutoAdminView({
  stats,
  blankType,
}: {
  stats: AdminAutoStats;
  blankType: "subject" | "period";
}) {
  const modeQuery = blankType === "subject" ? "subjectBlank=1" : "periodBlank=1";
  return (
    <div className="space-y-4">
      <SummaryCards
        totalAttempts={stats.totalAttempts}
        correctAttempts={stats.correctAttempts}
        activeUsers={stats.activeUsers}
        uniqueBlanks={stats.uniqueBlanks}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <AutoBlanksTable
          title="가장 많이 틀린 빈칸 TOP 20"
          rows={stats.topWrong}
          orderBy="wrongCount"
          modeQuery={modeQuery}
        />
        <AutoBlanksTable
          title="가장 많이 시도한 빈칸 TOP 20"
          rows={stats.topTried}
          orderBy="attempts"
          modeQuery={modeQuery}
        />
      </div>
    </div>
  );
}

function ContentBlanksTable({
  title,
  rows,
  orderBy,
}: {
  title: string;
  rows: AdminContentStats["topWrong"];
  orderBy: "wrongCount" | "attempts";
}) {
  return (
    <div className="space-y-2">
      <TableTitle title={title} />
      {rows.length === 0 ? (
        <EmptyMsg text="시도 이력이 없습니다." />
      ) : (
        <IndexTable
          minWidth={440}
          headers={[
            { label: "조문" },
            { label: "정답" },
            { label: "시도", align: "right" },
            { label: "오답", align: "right" },
            { label: "정답률", align: "right", width: "8rem" },
            { label: "", align: "right", width: "4.5rem" },
          ]}
        >
          {rows.map((r) => (
            <TR key={`${r.setId}:${r.blankIdx}`}>
              <TD>
                <p className="text-[13px] font-semibold">
                  {r.articleLabel}
                  <span className="text-muted-foreground ml-1 text-xs">
                    #{r.blankIdx}
                  </span>
                </p>
                <p className="text-muted-foreground text-[11px] font-normal">
                  {r.lawCode} · {r.ownerName ?? "(이름없음)"}
                </p>
              </TD>
              <TD>{r.answer}</TD>
              <TD align="right" mono soft>
                {r.attempts}
              </TD>
              <TD
                align="right"
                mono
                className={
                  orderBy === "wrongCount"
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-muted-foreground"
                }
              >
                {r.wrongCount}
              </TD>
              <TD align="right">
                <AccuracyCell accuracy={r.accuracy} />
              </TD>
              <TD align="right">
                <Link
                  to={`/admin/blanks/${r.setId}?focus=${r.blankIdx}`}
                  viewTransition
                  className="text-primary inline-flex items-center gap-1 text-xs font-semibold hover:underline"
                >
                  편집 <ArrowRightIcon className="size-3" />
                </Link>
              </TD>
            </TR>
          ))}
        </IndexTable>
      )}
    </div>
  );
}

// 표 위에 붙는 섹션 제목 — 디자인 시스템 eyebrow 톤.
function TableTitle({ title }: { title: string }) {
  return (
    <p className="text-muted-foreground font-mono text-[11px] font-semibold tracking-[0.08em] uppercase">
      {title}
    </p>
  );
}

// 정답률 — Bar tone="auto" (의미색) + 수치.
function AccuracyCell({ accuracy }: { accuracy: number }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <Bar value={accuracy} tone="auto" className="w-16" />
      <span
        className={cn(
          "font-mono text-[12px] font-bold tabular-nums",
          accuracy < 50
            ? "text-rose-600 dark:text-rose-400"
            : accuracy < 70
              ? "text-amber-700 dark:text-amber-400"
              : "text-emerald-600 dark:text-emerald-400",
        )}
      >
        {accuracy}%
      </span>
    </div>
  );
}

function AutoBlanksTable({
  title,
  rows,
  orderBy,
  modeQuery,
}: {
  title: string;
  rows: AdminAutoStats["topWrong"];
  orderBy: "wrongCount" | "attempts";
  modeQuery: string;
}) {
  return (
    <div className="space-y-2">
      <TableTitle title={title} />
      {rows.length === 0 ? (
        <EmptyMsg text="시도 이력이 없습니다." />
      ) : (
        <IndexTable
          minWidth={440}
          headers={[
            { label: "조문" },
            { label: "정답" },
            { label: "시도", align: "right" },
            { label: "오답", align: "right" },
            { label: "정답률", align: "right", width: "8rem" },
            { label: "", align: "right", width: "4.5rem" },
          ]}
        >
          {rows.map((r) => (
            <TR key={`${r.articleId}:${r.blockIndex}:${r.cumOffset}`}>
              <TD>
                <p className="text-[13px] font-semibold">{r.articleLabel}</p>
                <p className="text-muted-foreground text-[11px] font-normal">
                  {r.lawCode}
                </p>
              </TD>
              <TD>{r.answer}</TD>
              <TD align="right" mono soft>
                {r.attempts}
              </TD>
              <TD
                align="right"
                mono
                className={
                  orderBy === "wrongCount"
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-muted-foreground"
                }
              >
                {r.wrongCount}
              </TD>
              <TD align="right">
                <AccuracyCell accuracy={r.accuracy} />
              </TD>
              <TD align="right">
                {r.articleNumber ? (
                  <Link
                    to={`/subjects/${r.lawCode}/articles/${r.articleNumber}?${modeQuery}`}
                    viewTransition
                    className="text-primary inline-flex items-center gap-1 text-xs font-semibold hover:underline"
                  >
                    보기 <ArrowRightIcon className="size-3" />
                  </Link>
                ) : null}
              </TD>
            </TR>
          ))}
        </IndexTable>
      )}
    </div>
  );
}

function RecitationAdminView({ stats }: { stats: AdminRecitationStats }) {
  const completionRate =
    stats.totalAttempts > 0
      ? Math.round((stats.completedAttempts / stats.totalAttempts) * 100)
      : 0;
  const avgSimilarity = Math.round(stats.averageSimilarity * 100);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="총 시도" value={String(stats.totalAttempts)} />
        <SummaryCard
          label="평균 유사도"
          value={`${avgSimilarity}%`}
          subtle={`완료 ${stats.completedAttempts} (${completionRate}%)`}
          tone={avgSimilarity < 70 ? "coral" : "emerald"}
        />
        <SummaryCard label="학습자 수" value={String(stats.activeUsers)} />
        <SummaryCard label="시도된 조문" value={String(stats.uniqueArticles)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <RecitationArticlesTable
          title="가장 많이 시도한 조문 TOP 20"
          rows={stats.topTried}
        />
        <RecitationArticlesTable
          title="평균 유사도 낮은 조문 TOP 20 (시도 ≥ 3)"
          rows={stats.weakArticles}
        />
      </div>
    </div>
  );
}

function RecitationArticlesTable({
  title,
  rows,
}: {
  title: string;
  rows: AdminRecitationStats["topTried"];
}) {
  return (
    <div className="space-y-2">
      <TableTitle title={title} />
      {rows.length === 0 ? (
        <EmptyMsg text="시도 이력이 없습니다." />
      ) : (
        <IndexTable
          minWidth={420}
          headers={[
            { label: "조문" },
            { label: "시도", align: "right" },
            { label: "완료", align: "right" },
            { label: "평균 유사도", align: "right", width: "8rem" },
            { label: "", align: "right", width: "4.5rem" },
          ]}
        >
          {rows.map((r) => (
            <TR key={r.articleId}>
              <TD>
                <p className="text-[13px] font-semibold">
                  {r.articleLabel}
                  {r.importance >= 2 ? (
                    <BrainIcon className="ml-1 inline size-3 text-violet-600 dark:text-violet-400" />
                  ) : null}
                </p>
                <p className="text-muted-foreground text-[11px] font-normal">
                  {r.lawCode}
                </p>
              </TD>
              <TD align="right" mono soft>
                {r.attempts}
              </TD>
              <TD align="right" mono soft>
                {r.completedAttempts}
              </TD>
              <TD align="right">
                <AccuracyCell accuracy={Math.round(r.averageSimilarity * 100)} />
              </TD>
              <TD align="right">
                {r.articleNumber ? (
                  <Link
                    to={`/subjects/${r.lawCode}/articles/${r.articleNumber}?recitation=1`}
                    viewTransition
                    className="text-primary inline-flex items-center gap-1 text-xs font-semibold hover:underline"
                  >
                    보기 <ArrowRightIcon className="size-3" />
                  </Link>
                ) : null}
              </TD>
            </TR>
          ))}
        </IndexTable>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  subtle,
  tone,
}: {
  label: string;
  value: string;
  subtle?: string;
  // 의미색 강조 — 정답률/유사도 등 핵심 지표.
  tone?: "emerald" | "coral";
}) {
  return (
    <div className="border-border bg-card rounded-xl border p-4 shadow-sm">
      <p className="text-muted-foreground font-mono text-[11px] font-semibold tracking-[0.08em] uppercase">
        {label}
      </p>
      <p
        className={cn(
          "mt-2 text-2xl font-extrabold tracking-tight tabular-nums",
          tone === "emerald"
            ? "text-emerald-600 dark:text-emerald-400"
            : tone === "coral"
              ? "text-rose-600 dark:text-rose-400"
              : "text-foreground",
        )}
      >
        {value}
      </p>
      {subtle ? (
        <p className="text-muted-foreground mt-0.5 text-[11px]">{subtle}</p>
      ) : null}
    </div>
  );
}

function EmptyMsg({ text }: { text: string }) {
  return (
    <div className="border-border bg-card text-muted-foreground rounded-xl border py-12 text-center text-sm shadow-sm">
      {text}
    </div>
  );
}
