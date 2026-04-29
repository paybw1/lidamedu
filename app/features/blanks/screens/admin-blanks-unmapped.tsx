import { ArrowLeftIcon, ArrowRightIcon, FilterIcon } from "lucide-react";
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
import { listUnmappedBlanks } from "~/features/blanks/queries.server";

import type { Route } from "./+types/admin-blanks-unmapped";

export const meta: Route.MetaFunction = () => [
  { title: "미매칭 빈칸 일괄 검수 | Lidam Edu" },
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
  const ownerParam = url.searchParams.get("owner") ?? "mine";
  const ownerId =
    ownerParam === "all"
      ? undefined
      : ownerParam === "mine"
        ? user.id
        : ownerParam;
  const rows = await listUnmappedBlanks(client, lawCode, ownerId);

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
    rows,
    currentOwner: ownerParam,
    currentUserId: user.id,
    ownerList,
  };
}

export default function AdminBlanksUnmapped({
  loaderData,
}: Route.ComponentProps) {
  const { lawCode, rows, currentOwner, currentUserId, ownerList } = loaderData;

  // set 단위로 묶어 같은 article 의 미매칭 빈칸이 인접해 보이도록.
  const groups: Array<{
    setId: string;
    articleNumber: string | null;
    articleLabel: string;
    ownerId: string;
    ownerName: string | null;
    version: string;
    displayName: string | null;
    items: Array<{ blankIdx: number; blankLength: number; excerpt: string }>;
  }> = [];
  for (const r of rows) {
    const last = groups[groups.length - 1];
    if (last && last.setId === r.setId) {
      last.items.push({
        blankIdx: r.blankIdx,
        blankLength: r.blankLength,
        excerpt: r.excerpt,
      });
    } else {
      groups.push({
        setId: r.setId,
        articleNumber: r.articleNumber,
        articleLabel: r.articleLabel,
        ownerId: r.ownerId,
        ownerName: r.ownerName,
        version: r.version,
        displayName: r.displayName,
        items: [
          {
            blankIdx: r.blankIdx,
            blankLength: r.blankLength,
            excerpt: r.excerpt,
          },
        ],
      });
    }
  }

  return (
    <div className="mx-auto w-full max-w-screen-xl px-5 py-6 md:px-10 md:py-8">
      <header className="mb-6 space-y-2">
        <div className="flex items-center justify-between">
          <Link
            to={`/admin/blanks?law=${lawCode}&owner=${currentOwner}`}
            viewTransition
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
          >
            <ArrowLeftIcon className="size-4" /> 빈칸 자료 목록
          </Link>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">
          미매칭 빈칸 일괄 검수 — {lawCode}
        </h1>
        <p className="text-muted-foreground text-sm">
          정답이 비어있어 자동 매칭에 실패한 빈칸을 모두 모아 보여줍니다. 발췌(▢ 위치)를 보고
          편집 화면으로 이동해 정답을 채우세요.
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
          <FilterIcon className="text-muted-foreground size-3" />
          <span className="text-muted-foreground">강사 필터:</span>
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

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Kpi label="미매칭 빈칸" value={String(rows.length)} warn={rows.length > 0} />
        <Kpi label="조문 수" value={String(groups.length)} />
        <Kpi
          label="강사 수"
          value={String(new Set(groups.map((g) => g.ownerId)).size)}
        />
      </div>

      <Card>
        <CardHeader>
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            조문별 미매칭 목록
          </p>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">조문</TableHead>
                <TableHead>제목</TableHead>
                <TableHead className="w-32">강사 / 버전</TableHead>
                <TableHead className="w-12 text-right">#</TableHead>
                <TableHead>본문 발췌</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-muted-foreground py-8 text-center text-sm"
                  >
                    미매칭 빈칸이 없습니다. 모든 빈칸이 정답을 가지고 있습니다.
                  </TableCell>
                </TableRow>
              ) : (
                groups.flatMap((g) =>
                  g.items.map((it, i) => {
                    const mine = g.ownerId === currentUserId;
                    return (
                      <TableRow key={`${g.setId}:${it.blankIdx}`}>
                        {i === 0 ? (
                          <TableCell
                            className="align-top font-mono text-xs"
                            rowSpan={g.items.length}
                          >
                            제{g.articleNumber}조
                          </TableCell>
                        ) : null}
                        {i === 0 ? (
                          <TableCell
                            className="align-top text-sm"
                            rowSpan={g.items.length}
                          >
                            {g.articleLabel.replace(/^제\d+조(?:의\d+)?\s*/, "")}
                          </TableCell>
                        ) : null}
                        {i === 0 ? (
                          <TableCell
                            className="align-top text-xs"
                            rowSpan={g.items.length}
                          >
                            <span
                              className={
                                mine
                                  ? "text-primary font-medium"
                                  : "text-muted-foreground"
                              }
                            >
                              {g.ownerName ?? "(이름없음)"}
                            </span>
                            <span className="text-muted-foreground">
                              {" "}
                              · {g.displayName ?? g.version}
                            </span>
                          </TableCell>
                        ) : null}
                        <TableCell className="text-right">
                          <Badge
                            variant="destructive"
                            className="font-mono text-[10px]"
                          >
                            #{it.blankIdx}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          <code className="bg-muted/50 rounded px-1.5 py-0.5 text-[11px]">
                            {it.excerpt || "(발췌 없음)"}
                          </code>
                          <span className="text-muted-foreground ml-2 text-[10px]">
                            {it.blankLength}자
                          </span>
                        </TableCell>
                        <TableCell>
                          <Link
                            to={`/admin/blanks/${g.setId}?focus=${it.blankIdx}`}
                            viewTransition
                            className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
                          >
                            {mine ? "편집" : "보기"}{" "}
                            <ArrowRightIcon className="size-3" />
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  }),
                )
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
      to={`/admin/blanks/unmapped?law=${law}&owner=${owner}`}
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

function Kpi({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <Card>
      <CardContent className="space-y-1 py-4">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p
          className={`text-2xl font-bold tabular-nums ${
            warn ? "text-amber-600 dark:text-amber-400" : ""
          }`}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
