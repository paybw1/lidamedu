// 조문·판례 팝업 미리보기 (문제 해설의 배지 클릭 시 lazy 로드).
//   GET /api/problems/ref-preview?type=article&id=<articleId>
//   GET /api/problems/ref-preview?type=case&id=<caseId>
import { data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";

import type { Route } from "./+types/ref-preview";

// body_json → 읽기용 텍스트 평탄화. clause 블록의 label + inline 텍스트, children(호·목) 재귀.
interface BodyBlock {
  kind?: string;
  label?: string;
  inline?: Array<{ text?: string; type?: string }>;
  children?: BodyBlock[];
}
function flattenBlock(b: BodyBlock, depth: number): string {
  const inline = (b.inline ?? [])
    .filter((t) => t.type !== "subtitle")
    .map((t) => t.text ?? "")
    .join("")
    .trim();
  const label = b.label ? `${b.label} ` : "";
  const indent = "  ".repeat(Math.min(depth, 3));
  const self = inline ? `${indent}${label}${inline}` : "";
  const kids = (b.children ?? [])
    .map((c) => flattenBlock(c, depth + 1))
    .filter(Boolean)
    .join("\n");
  return [self, kids].filter(Boolean).join("\n");
}
function flattenBodyJson(bodyJson: unknown): string {
  const blocks = (bodyJson as { blocks?: BodyBlock[] } | null)?.blocks;
  if (!Array.isArray(blocks)) return "";
  return blocks
    .filter((b) => b.kind !== "header_refs")
    .map((b) => flattenBlock(b, 0))
    .filter(Boolean)
    .join("\n")
    .split("\n")
    .filter((line) => !/^[\s,·]+$/.test(line))
    .join("\n");
}

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
      .select("case_number, case_title, summary_title, summary_body_md, summary_items, is_en_banc")
      .eq("case_id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!row) return data({ error: "Not found" }, { status: 404 });
    // 다중 쟁점([1][2]…) 판례는 summary_items 전체를 합성 — summary_body_md 는 [1]만 담고 있음.
    const items = Array.isArray(row.summary_items)
      ? (row.summary_items as Array<{ title?: string; body?: string }>)
      : [];
    const multi = items.length > 1;
    const bodyMd = multi
      ? items
          .map((it, i) => `**[${i + 1}] ${(it.title ?? "").trim()}**\n\n${(it.body ?? "").trim()}`)
          .join("\n\n")
      : (row.summary_body_md ?? "");
    return data({
      kind: "case" as const,
      heading: `대법원 ${row.case_number}${row.is_en_banc ? " 전원합의체" : ""}`,
      title: multi ? null : (row.summary_title ?? row.case_title ?? row.case_number),
      bodyMd: bodyMd.slice(0, 10000),
    });
  }

  if (type === "article") {
    const { data: art } = await client
      .from("articles")
      .select("article_id, display_label, path, current_revision_id")
      .eq("article_id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!art) return data({ error: "Not found" }, { status: 404 });
    // 조 + 하위(항·호·목) 수집 — path 는 ltree 라 LIKE 불가 → parent_id BFS(최대 3단계).
    const rows: Array<{ article_id: string; path: unknown; current_revision_id: string | null }> =
      [{ article_id: art.article_id, path: art.path, current_revision_id: art.current_revision_id }];
    let frontier = [art.article_id];
    for (let depth = 0; depth < 3 && frontier.length; depth++) {
      const { data: kids } = await client
        .from("articles")
        .select("article_id, path, current_revision_id")
        .in("parent_id", frontier)
        .is("deleted_at", null)
        .limit(300);
      if (!kids?.length) break;
      rows.push(...kids);
      frontier = kids.map((k) => k.article_id);
    }
    // 문서 순 정렬 — path 세그먼트 숫자 우선 비교.
    const seg = (p: unknown) => String(p ?? "").split(".");
    rows.sort((a, b) => {
      const as = seg(a.path), bs = seg(b.path);
      for (let i = 0; i < Math.max(as.length, bs.length); i++) {
        const x = as[i] ?? "", y = bs[i] ?? "";
        if (x === y) continue;
        const xn = Number(x), yn = Number(y);
        if (!Number.isNaN(xn) && !Number.isNaN(yn) && xn !== yn) return xn - yn;
        return x < y ? -1 : 1;
      }
      return 0;
    });
    const revIds = rows.map((r) => r.current_revision_id).filter((x): x is string => !!x);
    const texts: string[] = [];
    for (let i = 0; i < revIds.length; i += 100) {
      const { data: revs } = await client
        .from("article_revisions")
        .select("revision_id, body_json")
        .in("revision_id", revIds.slice(i, i + 100));
      const byId = new Map((revs ?? []).map((r) => [r.revision_id, r.body_json]));
      for (const rid of revIds.slice(i, i + 100)) {
        const t = flattenBodyJson(byId.get(rid));
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
