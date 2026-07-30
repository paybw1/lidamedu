// 조문·판례 팝업 미리보기 (문제 해설의 배지 클릭 시 lazy 로드).
//   GET /api/problems/ref-preview?type=article&id=<articleId>
//   GET /api/problems/ref-preview?type=case&id=<caseId>
import { data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";

import type { Route } from "./+types/ref-preview";

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const id = url.searchParams.get("id");
  if (!id || !/^[0-9a-f-]{36}$/.test(id))
    return data({ error: "Invalid id" }, { status: 400 });

  if (type === "case") {
    const { data: row } = await client
      .from("cases")
      .select("case_number, case_title, summary_title, summary_body_md, is_en_banc")
      .eq("case_id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!row) return data({ error: "Not found" }, { status: 404 });
    return data({
      kind: "case" as const,
      heading: `대법원 ${row.case_number}${row.is_en_banc ? " 전원합의체" : ""}`,
      title: row.summary_title ?? row.case_title ?? row.case_number,
      bodyMd: (row.summary_body_md ?? "").slice(0, 8000),
    });
  }

  if (type === "article") {
    const { data: art } = await client
      .from("articles")
      .select("article_id, display_label, path, law_id")
      .eq("article_id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!art) return data({ error: "Not found" }, { status: 404 });
    // 조 + 하위(항·호·목) 스냅샷 본문 조립 — path prefix.
    const { data: subs } = await client
      .from("articles")
      .select("article_id, path, current_revision_id")
      .eq("law_id", art.law_id)
      .is("deleted_at", null)
      .like("path", `${String(art.path)}%`)
      .order("path")
      .limit(80);
    const revIds = (subs ?? [])
      .filter(
        (s) =>
          String(s.path) === String(art.path) ||
          String(s.path).startsWith(String(art.path) + "."),
      )
      .map((s) => s.current_revision_id)
      .filter((x): x is string => !!x);
    const texts: string[] = [];
    for (let i = 0; i < revIds.length; i += 100) {
      const { data: revs } = await client
        .from("article_revisions")
        .select("revision_id, body_text")
        .in("revision_id", revIds.slice(i, i + 100));
      const byId = new Map((revs ?? []).map((r) => [r.revision_id, r.body_text ?? ""]));
      for (const rid of revIds.slice(i, i + 100)) {
        const t = byId.get(rid);
        if (t) texts.push(t);
      }
    }
    return data({
      kind: "article" as const,
      heading: art.display_label,
      title: null,
      bodyMd: texts.join("\n").slice(0, 8000),
    });
  }

  return data({ error: "Invalid type" }, { status: 400 });
}
