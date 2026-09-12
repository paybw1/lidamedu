// 부분 공개 과목의 **축 단위** 서버 게이트(원장 지시 2026-09-12).
//
// 상표·디자인은 조문만 연다. 판례·객관식·주관식은 콘텐츠 수정 중이라 계속 잠근다.
// 축 목록 SSOT 는 core/lib/nav-groups 의 PARTIAL_OPEN_SUBJECT_TABS 다.
//
// ★칩을 숨기는 것만으로는 부족하다 — 뷰어 loader 가 판례·문제를 그대로 내려주면
//   SSR 응답에 실려 나가고, 딥링크로 패널도 열린다. 그래서 **데이터를 비운다**.
// ★부분 공개 과목이 아니면 등급 조회 자체를 건너뛴다. 특허·민법 등 대다수 요청에
//   등급 리졸버(adminClient 다중 조회) 비용을 더하지 않기 위해서다.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import { openAxesFor, partialOpenTabs } from "~/core/lib/nav-groups";
import { getMembershipAccess } from "~/features/subscriptions/membership.server";

export interface SubjectAxisAccess {
  /** 판례를 감춰야 하는가. */
  hideCases: boolean;
  /** 객관식(기출문제)을 감춰야 하는가. */
  hideProblems: boolean;
  /** 주관식을 감춰야 하는가. */
  hideSubjective: boolean;
  /** 열린 축 목록. 부분 공개 과목이 아니거나 staff 면 null(제한 없음). */
  openAxes: ReadonlyArray<string> | null;
}

const UNRESTRICTED: SubjectAxisAccess = {
  hideCases: false,
  hideProblems: false,
  hideSubjective: false,
  openAxes: null,
};

const ALL_HIDDEN: SubjectAxisAccess = {
  hideCases: true,
  hideProblems: true,
  hideSubjective: true,
  openAxes: [],
};

export async function getSubjectAxisAccess(
  client: SupabaseClient<Database>,
  userId: string | null,
  subjectSlug: string,
): Promise<SubjectAxisAccess> {
  if (!partialOpenTabs(subjectSlug)) return UNRESTRICTED;
  // 비로그인은 상위 레이아웃이 이미 막지만, 여기서도 닫힌 쪽으로 둔다.
  if (!userId) return ALL_HIDDEN;

  const access = await getMembershipAccess(client, userId);
  const open = openAxesFor(
    subjectSlug,
    access.grade === "staff",
    access.subjects,
  );
  if (open === null) return UNRESTRICTED; // staff — 편집·검수를 위해 전부 본다.
  return {
    hideCases: !open.includes("cases"),
    hideProblems: !open.includes("problems"),
    hideSubjective: !open.includes("subjective"),
    openAxes: open,
  };
}
