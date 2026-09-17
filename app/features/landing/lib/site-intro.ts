// 강의 플랫폼 소개 문구·지표의 단일 소스 (feat-11-012 P3).
//
// ★배너가 0건이면 랜딩에 <h1> 이 **하나도** 남지 않았다. 학원을 설명하는 문장은
//   meta() 안에만 있어 사람 눈에는 보이지 않았고, 남는 첫 섹션은 영상(0건이면 또 사라짐)과
//   리담소식이라 — 검색으로 들어온 사람이 "여기가 무엇을 파는 곳인지" 읽을 수 없었다.
// ★지표 3개(8인·5과목·3종)는 코드에 박힌 숫자였다. 강사 목록은 DB 에서 불러오므로
//   강사가 늘거나 줄면 **홈 숫자만 어긋난다.** 셀 수 있는 것은 센다.
// ★이 파일은 meta() 와 화면이 함께 읽는다 — 검색 결과와 첫 화면이 같은 말을 하게 하는 것이
//   목적이다. `.server` 를 import 하지 않는다(클라이언트 번들 유입 시 build 가 깨진다).

import { PLAN_LAW_CODES } from "~/features/study-plans/labels";

/** 강의 제공 형태 — 현장·영상(2026-09-17 원장: 실시간 강의는 운영하지 않는다). 소개 수치 전용. */
const LECTURE_DELIVERY_KINDS = ["현장", "영상"] as const;

export const SITE_INTRO = {
  /** 검색 결과 제목 — 브랜드를 앞에 둔다. */
  metaTitle: "리담변리사학원 — 변리사 시험, 합격까지 함께",
  /** 검색 결과 설명 겸 첫 화면 소개 문장. 둘이 갈리지 않게 한 곳에서 쓴다. */
  description:
    "전임 강사진의 현장·영상 강의와 조문·판례·문제 통합 학습으로 1차부터 2차까지 이어서 준비합니다. 현장강의 일정·수강신청·합격 수기.",
  eyebrow: "리담변리사학원",
  /** 화면 h1 — 배너가 없을 때 첫 화면의 제목이 된다. */
  headline: "변리사 시험, 합격까지 함께합니다",
  /** headline 안에서 강조할 조각(없으면 강조 없음). */
  highlight: "합격까지",
  primary: { label: "수강신청 →", to: "/lecture/catalog" },
  secondary: { label: "현장강의 일정", to: "/lecture/schedule" },
} as const;

export const SITE_LOCATION = {
  address: "서울 서초구 서초대로 131 로고스빌딩 2층",
  transit: "7호선 내방역 8번 출구 도보 4분",
} as const;

export interface SiteFact {
  /** 숫자. */
  n: string;
  /** 단위(인·과목·종). */
  u: string;
  /** 설명. */
  l: string;
}

/**
 * 첫 화면 신뢰 지표 — 전부 셀 수 있는 값에서 만든다.
 * ★강사가 0명이면 그 줄은 내지 않는다("0인 전 과목 전임 강사"는 안 쓰느니만 못하다).
 */
export function buildSiteFacts(input: { instructorCount: number }): SiteFact[] {
  const facts: SiteFact[] = [];
  if (input.instructorCount > 0) {
    facts.push({
      n: String(input.instructorCount),
      u: "인",
      l: "전 과목 전임 강사",
    });
  }
  facts.push({
    n: String(PLAN_LAW_CODES.length),
    u: "과목",
    l: "1·2차 통합 커리큘럼",
  });
  facts.push({
    n: String(LECTURE_DELIVERY_KINDS.length),
    u: "종",
    l: LECTURE_DELIVERY_KINDS.join("·") + " 강의",
  });
  return facts;
}
