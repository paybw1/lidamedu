// /me/subscription — 본인 구독 상태 + 결제 이력.
import type { Route } from "./+types/my-subscription";

import {
  CheckCircle2Icon,
  CircleAlertIcon,
  CrownIcon,
  ReceiptIcon,
} from "lucide-react";
import { Link, data, redirect } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
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
import { cn } from "~/core/lib/utils";
import {
  FEATURE_LABEL,
  PAYMENT_STATUS_LABEL,
  type PaymentStatus,
  SUBSCRIPTION_STATUS_LABEL,
} from "~/features/subscriptions/labels";
import {
  getActiveSubscription,
  listMyPayments,
} from "~/features/subscriptions/queries.server";

export const meta: Route.MetaFunction = () => [
  { title: "내 구독 | Lidam Patent Attorney Academy" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const [active, payments] = await Promise.all([
    getActiveSubscription(client, user.id),
    listMyPayments(client, user.id),
  ]);
  const url = new URL(request.url);
  const paid = url.searchParams.get("paid") === "1";
  const failed = url.searchParams.get("failed") === "1";
  const failMsg = url.searchParams.get("msg");
  return { active, payments, paid, failed, failMsg };
}

const STATUS_TONE: Record<PaymentStatus, string> = {
  completed: "bg-emerald-50 text-emerald-800 border-emerald-200",
  pending: "bg-amber-50 text-amber-800 border-amber-200",
  failed: "bg-rose-50 text-rose-800 border-rose-200",
  refunded: "bg-muted text-muted-foreground",
};

export default function MySubscription({ loaderData }: Route.ComponentProps) {
  const { active, payments, paid, failed, failMsg } = loaderData;

  return (
    <div className="mx-auto w-full max-w-screen-md px-5 py-6 md:px-10 md:py-8">
      <header className="mb-6 space-y-1">
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
          <CrownIcon className="size-3.5" /> 구독 관리
        </p>
        <h1 className="text-2xl font-bold tracking-tight">내 구독</h1>
        <p className="text-muted-foreground text-sm">
          현재 구독 상태와 결제 이력을 확인할 수 있습니다.
        </p>
      </header>

      {paid ? (
        <Card className="mb-4 border-emerald-300 bg-emerald-50/60">
          <CardContent className="px-4 py-3 text-sm text-emerald-900">
            <CheckCircle2Icon className="mr-1 inline size-4" />
            결제가 완료되어 구독이 활성화되었습니다. 대시보드에서 새 기능을
            확인해 보세요.
          </CardContent>
        </Card>
      ) : null}
      {failed ? (
        <Card className="mb-4 border-rose-300 bg-rose-50/60">
          <CardContent className="px-4 py-3 text-sm text-rose-900">
            <CircleAlertIcon className="mr-1 inline size-4" />
            결제가 완료되지 않았습니다{failMsg ? ` — ${failMsg}` : ""}.
            <Link to="/pricing" className="ml-1 underline">
              요금제로 돌아가기
            </Link>
          </CardContent>
        </Card>
      ) : null}

      <Card className="mb-5">
        <CardHeader className="px-4 pb-2">
          <p className="text-sm font-semibold">현재 플랜</p>
        </CardHeader>
        <CardContent className="space-y-3 px-4 pb-4">
          {active.hasActive && active.subscription ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-lg font-bold">
                    {active.subscription.planName}
                  </p>
                  <p className="text-muted-foreground text-xs tabular-nums">
                    시작 {active.subscription.startedAt.slice(0, 10)} → 만료{" "}
                    {active.subscription.expiresAt.slice(0, 10)}
                  </p>
                </div>
                <Badge
                  variant="default"
                  className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
                >
                  {SUBSCRIPTION_STATUS_LABEL[active.subscription.status]}
                </Badge>
              </div>
              <ul className="space-y-1">
                {active.features.map((f) => (
                  <li
                    key={f}
                    className="mr-3 inline-flex items-center gap-1 text-xs"
                  >
                    <CheckCircle2Icon className="size-3 text-emerald-600" />
                    {FEATURE_LABEL[f] ?? f}
                  </li>
                ))}
              </ul>
              <Button asChild size="sm" variant="outline">
                <Link to="/pricing">플랜 비교 / 연장</Link>
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm">
                현재 <strong>무료 플랜</strong> 사용 중입니다.
              </p>
              <p className="text-muted-foreground text-xs">
                기본 학습은 무료로 계속 사용 가능하며, 합격자 컨설팅 기능을 모두
                풀어 보려면 자기주도 구독을 추천합니다. (합격자 비교는 실 합격자
                데이터가 누적되면 활성화됩니다.)
              </p>
              <Button asChild size="sm">
                <Link to="/pricing">구독 시작하기 →</Link>
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="px-4 pb-2">
          <p className="text-sm font-semibold">
            <ReceiptIcon className="mr-1 inline size-3.5" /> 결제 이력
          </p>
        </CardHeader>
        <CardContent className="px-0 pb-3">
          {payments.length === 0 ? (
            <p className="text-muted-foreground px-4 text-xs">
              아직 결제 이력이 없습니다.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>일시</TableHead>
                  <TableHead>플랜</TableHead>
                  <TableHead className="text-right">금액</TableHead>
                  <TableHead>상태</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.paymentId}>
                    <TableCell className="text-xs tabular-nums">
                      {p.createdAt.slice(0, 16).replace("T", " ")}
                    </TableCell>
                    <TableCell className="text-xs">{p.planName}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      ₩{p.amountKrw.toLocaleString("ko-KR")}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn("text-[10px]", STATUS_TONE[p.status])}
                      >
                        {PAYMENT_STATUS_LABEL[p.status]}
                      </Badge>
                      {p.failureReason ? (
                        <div className="text-[10px] text-rose-600">
                          {p.failureReason}
                        </div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
