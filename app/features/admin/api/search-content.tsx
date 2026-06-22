// 운영자 검색 API — 커리큘럼/과제 항목 reference 선택용.
// kind: article | case | problem | blank_set
// 응답: { items: Array<{ id, label, secondary?: string }> }
import type { Route } from "./+types/search-content";

import { data } from "react-router";

import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { getSystematicNodeProblemSequence } from "~/features/problems/queries.server";
import { getProblemStatsBulk } from "~/features/study/queries.server";

const LIMIT = 20;
const MIN_QUERY = 2;
// 난이도 정렬 모드는 "난이도 상위 N" 일괄선택 용으로 더 넓게 보여준다.
const DIFFICULTY_DISPLAY = 40;

interface SearchResult {
  id: string;
  label: string;
  secondary?: string;
  /** 미리보기용 — 문제 발문 전체(problem kind 만 채움). */
  preview?: string;
  /** 난이도 정렬 모드에서만 — 전역 정답률(%)·시도 수(클라이언트 일괄선택 규칙용). */
  accuracyPct?: number | null;
  attempts?: number;
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
      url.searchParams.get("lawCode") ||
      url.searchParams.get("nodeId"));
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
    const nodeIdRaw = url.searchParams.get("nodeId")?.trim() || null;
    const sortRaw = url.searchParams.get("sort")?.trim() || null;

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
        originRaw as
          | "past_exam"
          | "past_exam_variant"
          | "expected"
          | "mock"
          | "ai_draft",
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
        formatRaw as
          | "mc_short"
          | "mc_box"
          | "mc_case"
          | "ox"
          | "blank"
          | "subjective",
      );
    }
    if (yearRaw && /^\d{4}$/.test(yearRaw)) {
      pq = pq.eq("year", Number(yearRaw));
    }
    // 단원(체계도 노드) 필터 — node subtree 의 problem_id 로 한정. 빈 노드는 sentinel 로 무매칭.
    if (nodeIdRaw) {
      const seq = await getSystematicNodeProblemSequence(
        adminClient,
        nodeIdRaw,
      );
      const nodeProblemIds = seq?.problems.map((p) => p.problemId) ?? [];
      pq = pq.in(
        "problem_id",
        nodeProblemIds.length
          ? nodeProblemIds
          : ["00000000-0000-0000-0000-000000000000"],
      );
    }
    // 필터 우선 검색은 최근 생성순(연도 정보 없는 AI 초안/예상문제 대응).
    pq = pq.order("created_at", { ascending: false });
    // 난이도 정렬(어려운/쉬운 순)은 전역 정답률 기준 — 후보를 더 넓게 받아 정렬 후 LIMIT.
    const wantDifficulty = sortRaw === "hard" || sortRaw === "easy";
    const { data: rows } = await pq.limit(wantDifficulty ? 100 : LIMIT);

    let ordered = rows ?? [];
    let statsMap: Awaited<ReturnType<typeof getProblemStatsBulk>> | null = null;
    if (wantDifficulty && ordered.length > 0) {
      statsMap = await getProblemStatsBulk(
        adminClient,
        ordered.map((r) => r.problem_id),
      );
      const acc = (id: string) => statsMap?.get(id)?.accuracyPct ?? null;
      ordered = [...ordered].sort((a, b) => {
        const aa = acc(a.problem_id);
        const ba = acc(b.problem_id);
        // 표본 부족(null)은 항상 뒤로.
        if (aa === null && ba === null) return 0;
        if (aa === null) return 1;
        if (ba === null) return -1;
        return sortRaw === "hard" ? aa - ba : ba - aa;
      });
      ordered = ordered.slice(0, DIFFICULTY_DISPLAY);
    }

    const items: SearchResult[] = ordered.map((r) => {
      const full = r.body_md ?? "";
      const body = full.slice(0, 80);
      const stat = statsMap?.get(r.problem_id);
      const diffLabel = wantDifficulty
        ? stat && stat.accuracyPct !== null
          ? `정답률 ${stat.accuracyPct}%`
          : "표본 부족"
        : null;
      return {
        id: r.problem_id,
        label: `${r.year ?? "?"}${r.problem_number ? ` ${r.problem_number}번` : ""} — ${body}${full.length > 80 ? "…" : ""}`,
        secondary: [
          r.laws?.law_code,
          r.exam_round,
          r.origin,
          r.format,
          diffLabel,
        ]
          .filter(Boolean)
          .join(" · "),
        // 미리보기 — 발문 전체(최대 2000자). 선지·이미지 렌더는 후속 단계.
        preview: full ? full.slice(0, 2000) : undefined,
        accuracyPct: stat ? stat.accuracyPct : undefined,
        attempts: stat ? stat.attempts : undefined,
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
        secondary: [r.articles?.laws?.law_code, r.articles?.display_label]
          .filter(Boolean)
          .join(" · "),
      };
    });
    return { items };
  }

  return { items: [] as SearchResult[] };
}
