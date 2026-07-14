// 포인트 관리 — /lecture/points. 적립/사용 내역 + 잔액(point_transactions).
import { CoinsIcon } from "lucide-react";
import { redirect } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";

import type { Route } from "./+types/lecture-points";

export function meta() {
  return [{ title: "포인트 관리 | 리담변리사학원" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");

  const { data: txns } = await client
    .from("point_transactions")
    .select("txn_id, delta, reason, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = txns ?? [];
  const balance = rows.reduce((s, t) => s + t.delta, 0);
  return { balance, txns: rows };
}

const won = (n: number) => n.toLocaleString("ko-KR");

export default function LecturePoints({ loaderData }: Route.ComponentProps) {
  const { balance, txns } = loaderData;
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 md:px-6 md:py-10">
      <header className="mb-5">
        <p className="text-muted-foreground inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
          <CoinsIcon className="size-3.5" /> 마이페이지
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">포인트 관리</h1>
      </header>

      {/* 잔액 카드 */}
      <div className="from-primary/90 to-primary text-primary-foreground mb-6 rounded-2xl bg-gradient-to-br p-6 shadow-sm">
        <p className="text-primary-foreground/80 text-xs font-semibold tracking-wide uppercase">
          보유 포인트
        </p>
        <p className="mt-1 text-3xl font-extrabold tabular-nums">
          {won(balance)} <span className="text-lg font-bold">P</span>
        </p>
      </div>

      {txns.length === 0 ? (
        <div className="border-border text-muted-foreground rounded-xl border border-dashed py-12 text-center text-sm">
          적립·사용 내역이 없습니다.
          <br />
          강의 수강·이벤트 참여 시 포인트가 적립됩니다.
        </div>
      ) : (
        <ul className="divide-border border-border bg-card divide-y rounded-xl border">
          {txns.map((t) => (
            <li key={t.txn_id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t.reason ?? "포인트"}</p>
                <p className="text-muted-foreground text-xs tabular-nums">
                  {new Date(t.created_at).toLocaleDateString("ko-KR")}
                </p>
              </div>
              <span
                className={`text-sm font-bold tabular-nums ${
                  t.delta >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {t.delta >= 0 ? "+" : ""}
                {won(t.delta)} P
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
