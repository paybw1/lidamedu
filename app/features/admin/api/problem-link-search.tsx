// 직접 추가용 검색 — 강사가 후보에 없는 조문/판례를 찾아 직접 연결.
//   GET /api/admin/problem-link-search?kind=article&lawCode=patent&q=29
//   GET /api/admin/problem-link-search?kind=case&q=2018후10844

import { data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/problem-link-search";

const LAW_LABEL: Record<string, string> = {
  patent: "특허법",
  trademark: "상표법",
  design: "디자인보호법",
  civil: "민법",
  "civil-procedure": "민사소송법",
};

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) return data({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  const q = (url.searchParams.get("q") ?? "").trim();
  if (!q) return data({ items: [] });

  if (kind === "article") {
    const lawCode = url.searchParams.get("lawCode");
    if (!lawCode) return data({ error: "lawCode required" }, { status: 400 });
    const { data: lawRow } = await client
      .from("laws")
      .select("law_id")
      .eq("law_code", lawCode)
      .maybeSingle();
    if (!lawRow) return data({ items: [] });
    // 정확한 조 번호 매칭 (e.g. "29", "28의2") + 부분 prefix 매칭.
    const { data: arts } = await client
      .from("articles")
      .select("article_id, article_number")
      .eq("law_id", lawRow.law_id)
      .eq("level", "article")
      .ilike("article_number", `${q}%`)
      .order("article_number")
      .limit(20);
    const items = (arts ?? [])
      .filter((a) => a.article_number)
      .map((a) => ({
        articleId: a.article_id,
        lawCode,
        articleNumber: a.article_number,
        displayLabel: `${LAW_LABEL[lawCode] ?? lawCode} 제${a.article_number}조`,
      }));
    return data({ items });
  }

  if (kind === "case") {
    const norm = q.replace(/\s+/g, "");
    const { data: cases } = await client
      .from("cases")
      .select("case_id, case_number, case_title")
      .ilike("case_number", `%${norm}%`)
      .is("deleted_at", null)
      .order("case_number")
      .limit(20);
    const items = (cases ?? []).map((c) => ({
      caseId: c.case_id,
      caseNumber: c.case_number,
      caseTitle: c.case_title ?? "",
    }));
    return data({ items });
  }

  return data({ error: "Invalid kind" }, { status: 400 });
}
