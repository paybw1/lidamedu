// 체계도 단일 placement 원칙 위반 case 점검 — staff 가 primary_node_id 를
// 수동 지정해 단일 노드로 확정할 수 있도록 후보(현재 산포된 노드들) 를 제공.
// 원칙: 체계도 트리에서 한 case 는 한 노드(메인)에만 들어간다.
// 위반 조건:
//   • primary_node_id == NULL (단일 컬럼이 비어있어 fallback 경유) AND
//   • primary_article_id 의 article_systematic_links 가 2개 이상  (src: primary_article)
//     또는 둘 다 NULL 인 case 의 ACL articles 가 가리키는 nodes 가 2개 이상 (src: legacy_acl)

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

export interface ScatteredNode {
  nodeId: string;
  path: string;
}

export interface ViaArticle {
  articleId: string;
  articleNumber: string | null;
}

export interface CaseSystematicViolation {
  caseId: string;
  caseNumber: string;
  caseTitle: string;
  primaryArticleId: string | null;
  viaArticles: ViaArticle[];
  scatteredNodes: ScatteredNode[];
  src: "primary_article" | "legacy_acl";
}

export async function getCaseSystematicViolations(
  client: SupabaseClient<Database>,
  lawCode: string,
): Promise<CaseSystematicViolation[]> {
  const { data: lawRow, error: lawErr } = await client
    .from("laws")
    .select("law_id")
    .eq("law_code", lawCode)
    .maybeSingle();
  if (lawErr) throw lawErr;
  if (!lawRow) return [];
  const lawId = lawRow.law_id;

  const [articlesRes, casesRes, aslRes, aclRes, nodesRes] = await Promise.all([
    client
      .from("articles")
      .select("article_id, article_number, deleted_at, law_id"),
    client
      .from("cases")
      .select(
        "case_id, case_number, case_title, primary_article_id, primary_node_id, subject_laws, deleted_at",
      ),
    client.from("article_systematic_links").select("article_id, node_id"),
    client.from("article_case_links").select("article_id, case_id"),
    client
      .from("systematic_nodes")
      .select("node_id, parent_id, display_label, ord, law_code"),
  ]);

  if (articlesRes.error) throw articlesRes.error;
  if (casesRes.error) throw casesRes.error;
  if (aslRes.error) throw aslRes.error;
  if (aclRes.error) throw aclRes.error;
  if (nodesRes.error) throw nodesRes.error;

  const lawArticles = new Map<string, { articleNumber: string | null }>();
  for (const a of articlesRes.data ?? []) {
    if (a.law_id === lawId && !a.deleted_at) {
      lawArticles.set(a.article_id, {
        articleNumber: a.article_number ?? null,
      });
    }
  }

  const cases = (casesRes.data ?? []).filter(
    (c) => !c.deleted_at && (c.subject_laws ?? []).includes(lawCode),
  );

  const nodesByArticle = new Map<string, Set<string>>();
  for (const r of aslRes.data ?? []) {
    if (!lawArticles.has(r.article_id)) continue;
    let s = nodesByArticle.get(r.article_id);
    if (!s) {
      s = new Set();
      nodesByArticle.set(r.article_id, s);
    }
    s.add(r.node_id);
  }

  const caseIdSet = new Set(cases.map((c) => c.case_id));
  const articlesByCase = new Map<string, Set<string>>();
  for (const r of aclRes.data ?? []) {
    if (!caseIdSet.has(r.case_id) || !lawArticles.has(r.article_id)) continue;
    let s = articlesByCase.get(r.case_id);
    if (!s) {
      s = new Set();
      articlesByCase.set(r.case_id, s);
    }
    s.add(r.article_id);
  }

  const nodeMap = new Map(
    (nodesRes.data ?? []).map(
      (n) =>
        [
          n.node_id,
          {
            parentId: n.parent_id,
            displayLabel: n.display_label,
          },
        ] as const,
    ),
  );
  function pathOf(nodeId: string): string {
    const parts: string[] = [];
    let cur = nodeMap.get(nodeId);
    let safety = 10;
    while (cur && safety-- > 0) {
      parts.unshift(cur.displayLabel);
      cur = cur.parentId ? nodeMap.get(cur.parentId) : undefined;
    }
    return parts.join(" > ");
  }

  const result: CaseSystematicViolation[] = [];
  for (const c of cases) {
    if (c.primary_node_id) continue;

    let nodeIdSet: Set<string>;
    let viaArticleIds: Set<string>;
    let src: "primary_article" | "legacy_acl";
    if (c.primary_article_id) {
      nodeIdSet = new Set(nodesByArticle.get(c.primary_article_id) ?? []);
      viaArticleIds = new Set([c.primary_article_id]);
      src = "primary_article";
    } else {
      const articles = articlesByCase.get(c.case_id) ?? new Set<string>();
      nodeIdSet = new Set();
      for (const a of articles) {
        for (const n of nodesByArticle.get(a) ?? new Set<string>()) {
          nodeIdSet.add(n);
        }
      }
      viaArticleIds = articles;
      src = "legacy_acl";
    }

    if (nodeIdSet.size < 2) continue;

    const scatteredNodes: ScatteredNode[] = [...nodeIdSet]
      .map((nodeId) => ({ nodeId, path: pathOf(nodeId) }))
      .sort((a, b) => a.path.localeCompare(b.path, "ko"));

    const viaArticles: ViaArticle[] = [...viaArticleIds]
      .map((articleId) => ({
        articleId,
        articleNumber: lawArticles.get(articleId)?.articleNumber ?? null,
      }))
      .sort((a, b) => {
        const an = a.articleNumber ?? "";
        const bn = b.articleNumber ?? "";
        return an.localeCompare(bn, "ko", { numeric: true });
      });

    result.push({
      caseId: c.case_id,
      caseNumber: c.case_number,
      caseTitle: c.case_title,
      primaryArticleId: c.primary_article_id,
      viaArticles,
      scatteredNodes,
      src,
    });
  }

  result.sort((a, b) => {
    if (b.scatteredNodes.length !== a.scatteredNodes.length) {
      return b.scatteredNodes.length - a.scatteredNodes.length;
    }
    return a.caseNumber.localeCompare(b.caseNumber, "ko", { numeric: true });
  });

  return result;
}
