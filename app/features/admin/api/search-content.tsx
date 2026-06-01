// 운영자 검색 API — 커리큘럼/과제 항목 reference 선택용.
// kind: article | case | problem | blank_set
// 응답: { items: Array<{ id, label, secondary?: string }> }

import { data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import adminClient from "~/core/lib/supa-admin-client.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/search-content";

const LIMIT = 20;
const MIN_QUERY = 2;

interface SearchResult {
  id: string;
  label: string;
  secondary?: string;
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") ?? "";
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);

  // problem kind 는 필터만으로도 검색 허용 (출처/형식/연도 단독). 그 외 kind 는 query 필수.
  const isProblemKind = kind === "problem";
  const hasProblemFilter =
    isProblemKind &&
    (url.searchParams.get("origin") ||
      url.searchParams.get("format") ||
      url.searchParams.get("year") ||
      url.searchParams.get("lawCode"));
  if (q.length < MIN_QUERY && !hasProblemFilter) {
    return { items: [] as SearchResult[] };
  }

  const safe = q.replace(/[%_]/g, (m) => `\\${m}`);

  if (kind === "article") {
    // articles.display_label 또는 article_number ilike + laws.law_code 라벨
    const { data: rows } = await adminClient
      .from("articles")
      .select("article_id, display_label, article_number, laws(law_code)")
      .eq("level", "article")
      .or(`display_label.ilike.%${safe}%,article_number.ilike.%${safe}%`)
      .limit(LIMIT);
    const items: SearchResult[] = (rows ?? []).map((r) => ({
      id: r.article_id,
      label: r.display_label ?? r.article_number ?? "(라벨 없음)",
      secondary: r.laws?.law_code ?? undefined,
    }));
    return { items };
  }

  if (kind === "case") {
    const { data: rows } = await adminClient
      .from("cases")
      .select("case_id, case_title, case_number, court, decided_at")
      .or(`case_title.ilike.%${safe}%,case_number.ilike.%${safe}%`)
      .is("deleted_at", null)
      .limit(LIMIT);
    const items: SearchResult[] = (rows ?? []).map((r) => ({
      id: r.case_id,
      label: r.case_title ?? r.case_number ?? "(라벨 없음)",
      secondary: [r.court, r.case_number, r.decided_at]
        .filter(Boolean)
        .join(" · "),
    }));
    return { items };
  }

  if (kind === "problem") {
    // feat-10-002: 모의고사 팩 picker — 과목·차수·출처·형식·연도 필터 지원.
    // feat — 강사 검증 게이트. picker 는 운영자 UI 지만 학생 응시 풀(mcq_pack)에 들어가
    //   학생 노출이 되므로, 미승인(draft/rejected) 문제는 picker 에 보이지 않는다.
    //   강사 검증 화면 (§2) 은 search-content 가 아니라 별도 listing 엔드포인트 사용.
    const lawCode = url.searchParams.get("lawCode")?.trim() || null;
    const examRound = url.searchParams.get("examRound")?.trim() || null;
    const originRaw = url.searchParams.get("origin")?.trim() || null;
    const formatRaw = url.searchParams.get("format")?.trim() || null;
    const yearRaw = url.searchParams.get("year")?.trim() || null;

    let pq = adminClient
      .from("problems")
      .select(
        "problem_id, body_md, year, problem_number, exam_round, origin, format, created_at, laws(law_code)",
      )
      .eq("review_status", "approved")
      .is("deleted_at", null);
    if (safe.length >= MIN_QUERY) pq = pq.ilike("body_md", `%${safe}%`);
    if (lawCode) {
      const { data: law } = await adminClient
        .from("laws")
        .select("law_id")
        .eq("law_code", lawCode)
        .maybeSingle();
      if (law) pq = pq.eq("law_id", law.law_id);
    }
    if (examRound === "first" || examRound === "second") {
      pq = pq.eq("exam_round", examRound);
    }
    const ALLOWED_ORIGINS = [
      "past_exam",
      "past_exam_variant",
      "expected",
      "mock",
      "ai_draft",
    ];
    if (originRaw && ALLOWED_ORIGINS.includes(originRaw)) {
      pq = pq.eq(
        "origin",
        originRaw as "past_exam" | "past_exam_variant" | "expected" | "mock" | "ai_draft",
      );
    }
    const ALLOWED_FORMATS = [
      "mc_short",
      "mc_box",
      "mc_case",
      "ox",
      "blank",
      "subjective",
    ];
    if (formatRaw && ALLOWED_FORMATS.includes(formatRaw)) {
      pq = pq.eq(
        "format",
        formatRaw as "mc_short" | "mc_box" | "mc_case" | "ox" | "blank" | "subjective",
      );
    }
    if (yearRaw && /^\d{4}$/.test(yearRaw)) {
      pq = pq.eq("year", Number(yearRaw));
    }
    // 필터 우선 검색은 최근 생성순(연도 정보 없는 AI 초안/예상문제 대응).
    pq = pq.order("created_at", { ascending: false });
    const { data: rows } = await pq.limit(LIMIT);
    const items: SearchResult[] = (rows ?? []).map((r) => {
      const body = (r.body_md ?? "").slice(0, 80);
      return {
        id: r.problem_id,
        label: `${r.year ?? "?"}${r.problem_number ? ` ${r.problem_number}번` : ""} — ${body}${(r.body_md ?? "").length > 80 ? "…" : ""}`,
        secondary: [r.laws?.law_code, r.exam_round, r.origin, r.format]
          .filter(Boolean)
          .join(" · "),
      };
    });
    return { items };
  }

  if (kind === "blank_set") {
    // blank_set 의 article 라벨 + display_name + 빈칸 수
    const { data: rows } = await adminClient
      .from("article_blank_sets")
      .select(
        "set_id, display_name, blanks, articles(display_label, laws(law_code))",
      )
      .or(`display_name.ilike.%${safe}%`)
      .limit(LIMIT);
    const items: SearchResult[] = (rows ?? []).map((r) => {
      const blankCount = Array.isArray(r.blanks) ? r.blanks.length : 0;
      return {
        id: r.set_id,
        label: `${r.display_name ?? "(이름없음)"} · ${blankCount}칸`,
        secondary: [
          r.articles?.laws?.law_code,
          r.articles?.display_label,
        ]
          .filter(Boolean)
          .join(" · "),
      };
    });
    return { items };
  }

  return { items: [] as SearchResult[] };
}
