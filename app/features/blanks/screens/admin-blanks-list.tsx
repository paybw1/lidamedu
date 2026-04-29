import { AlertTriangleIcon, ArrowRightIcon } from "lucide-react";
import { Link, data } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/core/components/ui/table";
import makeServerClient from "~/core/lib/supa-client.server";
import { listBlankSetsWithStatus } from "~/features/blanks/queries.server";

import type { Route } from "./+types/admin-blanks-list";

export const meta: Route.MetaFunction = () => [
  { title: "빈칸 자료 관리 | Lidam Edu" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    throw data("Unauthorized", { status: 401 });
  }
  const { data: profile } = await client
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .maybeSingle();
  const role = profile?.role ?? "student";
  if (role !== "instructor" && role !== "admin") {
    throw data("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const lawCode = url.searchParams.get("law") ?? "patent";
  // ?owner=mine | all | <uuid>. 기본 mine (본인 owner 만)
  const ownerParam = url.searchParams.get("owner") ?? "mine";
  const ownerId =
    ownerParam === "all"
      ? undefined
      : ownerParam === "mine"
        ? user.id
        : ownerParam;
  const sets = await listBlankSetsWithStatus(client, lawCode, ownerId);

  // owner 목록 (filter dropdown용)
  const { data: owners } = await client
    .from("article_blank_sets")
    .select("owner_id, profiles!owner_id(name)")
    .order("owner_id");
  const ownerMap = new Map<string, string>();
  for (const o of owners ?? []) {
    if (!ownerMap.has(o.owner_id)) {
      ownerMap.set(o.owner_id, o.profiles?.name ?? "(이름없음)");
    }
  }
  const ownerList = [...ownerMap.entries()].map(([id, name]) => ({ id, name }));

  return {
    lawCode,
    sets,
    currentOwner: ownerParam,
    currentUserId: user.id,
    ownerList,
  };
}

export default function AdminBlanksList({ loaderData }: Route.ComponentProps) {
  const { lawCode, sets, currentOwner, currentUserId, ownerList } = loaderData;
  const total = sets.reduce((s, x) => s + x.totalBlanks, 0);
  const filled = sets.reduce((s, x) => s + x.filledBlanks, 0);
  const unmapped = total - filled;
  const articlesWithUnmapped = sets.filter((s) => s.unmappedBlanks > 0).length;

  return (
    <div className="mx-auto w-full max-w-screen-xl px-5 py-6 md:px-10 md:py-8">
      <header className="mb-6 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            운영자 · 콘텐츠 관리
          </p>
          <div className="flex items-center gap-3">
            <Link
              to={`/admin/blanks/unmapped?law=${lawCode}&owner=${currentOwner}`}
              viewTransition
              className="inline-flex items-center gap-1 text-xs text-amber-700 hover:underline dark:text-amber-400"
            >
              <AlertTriangleIcon className="size-3" />
              미매칭 일괄 검수 <ArrowRightIcon className="size-3" />
            </Link>
            <Link
              to="/admin/blanks/upload"
              viewTransition
              className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
            >
              새 자료 업로드 <ArrowRightIcon className="size-3" />
            </Link>
          </div>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">
          빈칸 자료 관리 — {lawCode}
        </h1>
        <p className="text-muted-foreground text-sm">
          빈칸 자료는 운영자·강사별로 분리해 관리합니다. 본인이 만든 자료만 편집 가능, 다른 강사 자료는 fork 후 수정.
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-muted-foreground text-xs">강사 필터:</span>
          <OwnerLink law={lawCode} owner="mine" current={currentOwner}>
            내 자료
          </OwnerLink>
          <OwnerLink law={lawCode} owner="all" current={currentOwner}>
            전체
          </OwnerLink>
          {ownerList
            .filter((o) => o.id !== currentUserId)
            .map((o) => (
              <OwnerLink
                key={o.id}
                law={lawCode}
                owner={o.id}
                current={currentOwner}
              >
                {o.name}
              </OwnerLink>
            ))}
        </div>
      </header>

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <KpiCard label="조문 수" value={String(sets.length)} />
        <KpiCard label="총 빈칸" value={String(total)} />
        <KpiCard label="정답 입력 완료" value={`${filled}`} subtle={`${total > 0 ? Math.round((filled / total) * 100) : 0}%`} />
        <KpiCard
          label="미매칭"
          value={String(unmapped)}
          subtle={`${articlesWithUnmapped}개 조문`}
          warn={unmapped > 0}
        />
      </div>

      <Card>
        <CardHeader>
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            조문별 진행 상태
          </p>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">조문</TableHead>
                <TableHead>제목</TableHead>
                <TableHead className="w-32">강사 / 버전</TableHead>
                <TableHead className="w-20 text-right">전체</TableHead>
                <TableHead className="w-20 text-right">완료</TableHead>
                <TableHead className="w-20 text-right">미매칭</TableHead>
                <TableHead className="w-32"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground py-8 text-center text-sm">
                    빈칸 자료가 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                sets.map((s) => {
                  const mine = s.ownerId === currentUserId;
                  return (
                    <TableRow key={s.setId}>
                      <TableCell className="font-mono text-xs">
                        제{s.articleNumber}조
                      </TableCell>
                      <TableCell className="text-sm">
                        {s.articleLabel.replace(/^제\d+조(?:의\d+)?\s*/, "")}
                      </TableCell>
                      <TableCell className="text-xs">
                        <span
                          className={
                            mine
                              ? "text-primary font-medium"
                              : "text-muted-foreground"
                          }
                        >
                          {ownerName(s.ownerId, ownerList)}
                        </span>
                        <span className="text-muted-foreground">
                          {" "}· {s.displayName ?? s.version}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.totalBlanks}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.filledBlanks}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.unmappedBlanks > 0 ? (
                          <Badge variant="destructive" className="font-mono">
                            {s.unmappedBlanks}
                          </Badge>
                        ) : (
                          <span className="text-emerald-600 dark:text-emerald-400">0</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Link
                          to={`/admin/blanks/${s.setId}`}
                          viewTransition
                          className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
                        >
                          {mine ? "편집" : "보기"}{" "}
                          <ArrowRightIcon className="size-3" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function OwnerLink({
  law,
  owner,
  current,
  children,
}: {
  law: string;
  owner: string;
  current: string;
  children: React.ReactNode;
}) {
  const active = owner === current;
  return (
    <Link
      to={`/admin/blanks?law=${law}&owner=${owner}`}
      className={`rounded-md border px-2 py-0.5 text-xs ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background text-muted-foreground border-input hover:bg-accent"
      }`}
    >
      {children}
    </Link>
  );
}

function ownerName(
  ownerId: string,
  ownerList: { id: string; name: string }[],
): string {
  return ownerList.find((o) => o.id === ownerId)?.name ?? "(이름없음)";
}

function KpiCard({
  label,
  value,
  subtle,
  warn,
}: {
  label: string;
  value: string;
  subtle?: string;
  warn?: boolean;
}) {
  return (
    <Card>
      <CardContent className="space-y-1 py-4">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className={`text-2xl font-bold tabular-nums ${warn ? "text-amber-600 dark:text-amber-400" : ""}`}>
          {value}
        </p>
        {subtle ? (
          <p className="text-muted-foreground text-xs">{subtle}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
