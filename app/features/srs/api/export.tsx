// SRS v2 ③ — GET /api/srs/export?from=&to=
// review_logs CSV 다운로드. 학생별 분석용. RLS 가 본인 행만 노출.

import makeServerClient from "~/core/lib/supa-client.server";
import { exportLogsCsv } from "~/features/srs/srs.server";

import type { Route } from "./+types/export";

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    return new Response("unauthorized", { status: 401 });
  }
  const url = new URL(request.url);
  const fromRaw = url.searchParams.get("from");
  const toRaw = url.searchParams.get("to");
  // YYYY-MM-DD 또는 ISO 둘 다 허용.
  const fromIso = fromRaw ? normalize(fromRaw, "start") : null;
  const toIso = toRaw ? normalize(toRaw, "end") : null;

  const csv = await exportLogsCsv(client, user.id, fromIso, toIso);
  const fname = `srs-logs-${user.id.slice(0, 8)}-${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fname}"`,
    },
  });
}

function normalize(s: string, kind: "start" | "end"): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    // KST 자정 (00:00) 또는 자정 직전 (23:59:59).
    const [y, m, d] = s.split("-").map(Number);
    if (kind === "start") {
      return new Date(Date.UTC(y, m - 1, d, -9, 0, 0)).toISOString();
    }
    return new Date(Date.UTC(y, m - 1, d + 1, -9, -0, -1)).toISOString();
  }
  // 이미 ISO.
  return s;
}
