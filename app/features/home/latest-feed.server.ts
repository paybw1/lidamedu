// 랜딩 LATEST 섹션 — 실데이터 기반 최신 피드(각 카테고리 최신 1건).
// 공개 콘텐츠라 비로그인 client 로 조회. 어떤 카테고리가 비어도 그 카드만 생략.
// ★논문은 오픈 준비 중이라 제외(feat: 논문 학생 숨김).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import { listBookUpdates } from "~/features/book-updates/queries.server";
import { listRecentCases } from "~/features/cases/queries.server";
import { listRecentLawRevisions } from "~/features/laws/queries.server";
import { listRecentProblems } from "~/features/problems/queries.server";
import { LAW_SUBJECTS } from "~/features/subjects/lib/subjects";

export interface LatestFeedItem {
  cat: string;
  dot: string;
  body: string;
  to: string;
}

function fmtDate(iso: string | null): string {
  return iso ? iso.slice(0, 10).replace(/-/g, ".") : "";
}

function subjectName(lawCode: string): string {
  return LAW_SUBJECTS[lawCode as keyof typeof LAW_SUBJECTS]?.name ?? "";
}

export async function getLatestLandingFeed(
  client: SupabaseClient<Database>,
): Promise<LatestFeedItem[]> {
  const [law, cases, mcq, essay, books] = await Promise.all([
    listRecentLawRevisions(client, 1).catch(() => []),
    listRecentCases(client, 1).catch(() => []),
    listRecentProblems(client, { limit: 1, formatFilter: "mcq" }).catch(
      () => [],
    ),
    listRecentProblems(client, { limit: 1, formatFilter: "subjective" }).catch(
      () => [],
    ),
    listBookUpdates(client, { pageSize: 1 })
      .then((p) => p.items)
      .catch(() => []),
  ]);

  const items: LatestFeedItem[] = [];
  if (law[0]) {
    const d = fmtDate(law[0].effectiveDate);
    items.push({
      cat: "법 개정",
      dot: "#5C7F6A",
      body: `${law[0].lawName}${d ? ` · ${d} 시행` : ""}`,
      to: "/latest/laws",
    });
  }
  if (cases[0]) {
    items.push({
      cat: "최근 판례",
      dot: "#7B6BA0",
      body: `${cases[0].caseNumber} · ${cases[0].caseTitle}`,
      to: "/latest/cases",
    });
  }
  if (mcq[0]) {
    const y = mcq[0].year ? `${mcq[0].year}년 ` : "";
    items.push({
      cat: "1차 기출문제",
      dot: "#A77B3F",
      body: `${y}${subjectName(mcq[0].lawCode)} 기출문제`.trim(),
      to: "/latest/mcq?kind=past_exam",
    });
  }
  if (essay[0]) {
    const y = essay[0].year ? `${essay[0].year}년 ` : "";
    items.push({
      cat: "2차 기출문제",
      dot: "#C97D5B",
      body: `${y}${subjectName(essay[0].lawCode)} 주관식`.trim(),
      to: "/latest/essay",
    });
  }
  if (books[0]) {
    items.push({
      cat: "추록·정오표",
      dot: "#8B5A2B",
      body: books[0].title,
      to: "/latest/book-updates",
    });
  }
  return items;
}
