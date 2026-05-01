import {
  ArrowRightIcon,
  BrainIcon,
  TrendingDownIcon,
  UsersIcon,
} from "lucide-react";
import { Link, data } from "react-router";

import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/core/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "~/core/components/ui/tabs";
import makeServerClient from "~/core/lib/supa-client.server";
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
  { title: "빈칸 학습 통계 (운영) | Lidam Edu" },
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
  return { content, subject, period, recitation };
}

export default function AdminBlanksStats({
  loaderData,
}: Route.ComponentProps) {
  const { content, subject, period, recitation } = loaderData;

  return (
    <div className="mx-auto w-full max-w-screen-xl px-5 py-6 md:px-10 md:py-8">
      <header className="mb-6 space-y-2">
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          운영 통계
        </p>
        <h1 className="text-2xl font-bold tracking-tight">빈칸 학습 분석</h1>
        <p className="text-muted-foreground text-sm">
          학습자 시도 이력을 기반으로 한 모드별 집계. 가장 많이 틀린 빈칸을
          확인해 출제 난이도를 조절하세요.
        </p>
      </header>

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
    </div>
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
    <div className="grid gap-3 sm:grid-cols-4">
      <SummaryCard label="총 시도" value={String(totalAttempts)} />
      <SummaryCard
        label="평균 정답률"
        value={`${accuracy}%`}
        subtle={`정답 ${correctAttempts}`}
      />
      <SummaryCard
        icon={UsersIcon}
        label="학습자 수"
        value={String(activeUsers)}
      />
      <SummaryCard
        icon={TrendingDownIcon}
        label="시도된 빈칸"
        value={String(uniqueBlanks)}
      />
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
    <Card>
      <CardHeader>
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          {title}
        </p>
      </CardHeader>
      <CardContent className="px-0">
        {rows.length === 0 ? (
          <EmptyMsg text="시도 이력이 없습니다." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>조문</TableHead>
                <TableHead>정답</TableHead>
                <TableHead className="w-14 text-right">시도</TableHead>
                <TableHead className="w-14 text-right">오답</TableHead>
                <TableHead className="w-14 text-right">정답률</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={`${r.setId}:${r.blankIdx}`}>
                  <TableCell>
                    <p className="text-sm font-medium">
                      {r.articleLabel}
                      <span className="text-muted-foreground ml-1 text-xs">
                        #{r.blankIdx}
                      </span>
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {r.lawCode} · {r.ownerName ?? "(이름없음)"}
                    </p>
                  </TableCell>
                  <TableCell className="text-sm">{r.answer}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {r.attempts}
                  </TableCell>
                  <TableCell
                    className={`text-right tabular-nums text-sm ${orderBy === "wrongCount" ? "font-semibold text-rose-600 dark:text-rose-400" : ""}`}
                  >
                    {r.wrongCount}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {r.accuracy}%
                  </TableCell>
                  <TableCell>
                    <Link
                      to={`/admin/blanks/${r.setId}?focus=${r.blankIdx}`}
                      viewTransition
                      className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
                    >
                      편집 <ArrowRightIcon className="size-3" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
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
    <Card>
      <CardHeader>
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          {title}
        </p>
      </CardHeader>
      <CardContent className="px-0">
        {rows.length === 0 ? (
          <EmptyMsg text="시도 이력이 없습니다." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>조문</TableHead>
                <TableHead>정답</TableHead>
                <TableHead className="w-14 text-right">시도</TableHead>
                <TableHead className="w-14 text-right">오답</TableHead>
                <TableHead className="w-14 text-right">정답률</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow
                  key={`${r.articleId}:${r.blockIndex}:${r.cumOffset}`}
                >
                  <TableCell>
                    <p className="text-sm font-medium">{r.articleLabel}</p>
                    <p className="text-muted-foreground text-xs">{r.lawCode}</p>
                  </TableCell>
                  <TableCell className="text-sm">{r.answer}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {r.attempts}
                  </TableCell>
                  <TableCell
                    className={`text-right tabular-nums text-sm ${orderBy === "wrongCount" ? "font-semibold text-rose-600 dark:text-rose-400" : ""}`}
                  >
                    {r.wrongCount}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {r.accuracy}%
                  </TableCell>
                  <TableCell>
                    {r.articleNumber ? (
                      <Link
                        to={`/subjects/${r.lawCode}/articles/${r.articleNumber}?${modeQuery}`}
                        viewTransition
                        className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
                      >
                        보기 <ArrowRightIcon className="size-3" />
                      </Link>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function RecitationAdminView({ stats }: { stats: AdminRecitationStats }) {
  const completionRate =
    stats.totalAttempts > 0
      ? Math.round((stats.completedAttempts / stats.totalAttempts) * 100)
      : 0;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <SummaryCard label="총 시도" value={String(stats.totalAttempts)} />
        <SummaryCard
          label="평균 유사도"
          value={`${Math.round(stats.averageSimilarity * 100)}%`}
          subtle={`완료 ${stats.completedAttempts} (${completionRate}%)`}
        />
        <SummaryCard
          icon={UsersIcon}
          label="학습자 수"
          value={String(stats.activeUsers)}
        />
        <SummaryCard
          icon={TrendingDownIcon}
          label="시도된 조문"
          value={String(stats.uniqueArticles)}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <RecitationArticlesTable
          title="가장 많이 시도한 조문 TOP 20"
          rows={stats.topTried}
          orderBy="attempts"
        />
        <RecitationArticlesTable
          title="평균 유사도 낮은 조문 TOP 20 (시도 ≥ 3)"
          rows={stats.weakArticles}
          orderBy="similarity"
        />
      </div>
    </div>
  );
}

function RecitationArticlesTable({
  title,
  rows,
  orderBy,
}: {
  title: string;
  rows: AdminRecitationStats["topTried"];
  orderBy: "attempts" | "similarity";
}) {
  return (
    <Card>
      <CardHeader>
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          {title}
        </p>
      </CardHeader>
      <CardContent className="px-0">
        {rows.length === 0 ? (
          <EmptyMsg text="시도 이력이 없습니다." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>조문</TableHead>
                <TableHead className="w-14 text-right">시도</TableHead>
                <TableHead className="w-14 text-right">완료</TableHead>
                <TableHead className="w-16 text-right">평균</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.articleId}>
                  <TableCell>
                    <p className="text-sm font-medium">
                      {r.articleLabel}
                      {r.importance >= 2 ? (
                        <BrainIcon className="ml-1 inline size-3 text-violet-600 dark:text-violet-400" />
                      ) : null}
                    </p>
                    <p className="text-muted-foreground text-xs">{r.lawCode}</p>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {r.attempts}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {r.completedAttempts}
                  </TableCell>
                  <TableCell
                    className={`text-right tabular-nums text-sm ${orderBy === "similarity" && r.averageSimilarity < 0.7 ? "font-semibold text-rose-600 dark:text-rose-400" : ""}`}
                  >
                    {Math.round(r.averageSimilarity * 100)}%
                  </TableCell>
                  <TableCell>
                    {r.articleNumber ? (
                      <Link
                        to={`/subjects/${r.lawCode}/articles/${r.articleNumber}?recitation=1`}
                        viewTransition
                        className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
                      >
                        보기 <ArrowRightIcon className="size-3" />
                      </Link>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  subtle,
}: {
  icon?: typeof UsersIcon;
  label: string;
  value: string;
  subtle?: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-1 py-4">
        <div className="flex items-center gap-2">
          {Icon ? <Icon className="text-primary size-4" /> : null}
          <p className="text-muted-foreground text-xs">{label}</p>
        </div>
        <p className="text-2xl font-bold tabular-nums">{value}</p>
        {subtle ? (
          <p className="text-muted-foreground text-xs">{subtle}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function EmptyMsg({ text }: { text: string }) {
  return (
    <p className="text-muted-foreground px-6 py-6 text-center text-sm">
      {text}
    </p>
  );
}
