// feat-8-008/8-027 — 학습과목(/subjects/*) 영역 + 과목별 게이트.
// area_subjects 미보유(무료회원) → /pricing?locked=area_subjects.
// 과목별: 체험=특허법만, 자기학습=결제 과목(+자연과학), 종합반/staff=전체. 미허용 과목은
// /pricing?locked=subject:<slug> 로 redirect. URL 2번째 세그먼트(과목 슬러그)로 단일 지점 게이트.

import { useEffect } from "react";
import {
  Outlet,
  data,
  redirect,
  useLocation,
  useMatches,
} from "react-router";

import { AreaTabs, type SectionTabItem } from "~/core/components/student";
import {
  STUDENT_DISABLED_SUBJECTS,
  isSubjectLocked,
  subjectLockedHint,
} from "~/core/lib/nav-groups";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  SUBJECT_NAV_ITEMS,
  subjectSlugFromHref,
} from "~/core/lib/subject-groups";
import { SubjectAxisChips } from "~/features/subjects/components/subject-bookmark-rail";
import { getMembershipAccess } from "~/features/subscriptions/membership.server";
import {
  LAW_SUBJECT_SLUGS,
  SUBJECT_TAB_VALUES,
  type SubjectTab,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/subjects.layout";

// 학습과목 슬러그 SSOT — 5개 법률과목 + 자연과학(science). URL 세그먼트 게이트 판정용.
const SUBJECT_SLUGS = new Set<string>([...LAW_SUBJECT_SLUGS, "science"]);

export async function loader({ request }: Route.LoaderArgs) {
  // headers 전달 — supabase 갱신 cookie 누수 방지 (private.layout 와 동일 이유).
  const [client, headers] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  // 비로그인은 상위 private.layout 이 처리.
  if (!user) {
    return data(
      { subjectAccess: [] as "all" | string[], isStaff: false },
      { headers },
    );
  }
  // 등급 리졸버 1회 조회 — 게이트 + 탭 비활성 판정 공용.
  const access = await getMembershipAccess(client, user.id);
  const isStaff = access.grade === "staff";
  // URL: /subjects/<subject>/... — 2번째 세그먼트가 과목 슬러그.
  const seg = new URL(request.url).pathname.split("/").filter(Boolean);
  const subjectSlug = seg[1];
  // 서버 게이트(리졸버 권위): area_subjects 없음(무료회원) 차단 + 미허용 과목 차단.
  if (!isStaff) {
    // 준비 중 과목(민법·민소) — 등급·구매 무관 학생 차단. 결제 유도가 아니므로 대시보드로.
    if (subjectSlug && STUDENT_DISABLED_SUBJECTS.includes(subjectSlug)) {
      throw redirect("/dashboard");
    }
    if (!access.features.includes("area_subjects")) {
      throw redirect("/pricing?locked=area_subjects");
    }
    if (
      subjectSlug &&
      SUBJECT_SLUGS.has(subjectSlug) &&
      access.subjects !== "all" &&
      !access.subjects.includes(subjectSlug)
    ) {
      throw redirect(
        `/pricing?locked=${encodeURIComponent(`subject:${subjectSlug}`)}`,
      );
    }
  }
  return data({ subjectAccess: access.subjects, isStaff }, { headers });
}

export default function SubjectsLayout({ loaderData }: Route.ComponentProps) {
  const { subjectAccess, isStaff } = loaderData;
  const location = useLocation();
  const matches = useMatches();

  // 축 칩(조문/판례/객관식/주관식) — 자식 라우트(뷰어·허브)의 loaderData 에서
  // axisCounts 를 읽어 상단 바 우측에 렌더. 없으면(퀴즈·OX 등) 칩 숨김.
  const seg = location.pathname.split("/").filter(Boolean);
  const currentSubject = seg[1];
  const axisData = (() => {
    for (let i = matches.length - 1; i >= 0; i--) {
      const d = matches[i].data as
        | {
            axisCounts?: Record<SubjectTab, number>;
            problem?: { format?: string };
          }
        | null
        | undefined;
      if (d && typeof d === "object" && d.axisCounts) return d;
    }
    return null;
  })();
  // 현재 축 도출 — 경로 세그먼트 기준(판례/문제), 허브는 ?tab=, 그 외 조문 계열.
  const activeAxis: SubjectTab = (() => {
    if (seg[2] === "cases") return "cases";
    if (seg[2] === "problems") {
      return axisData?.problem?.format === "subjective"
        ? "subjective"
        : "problems";
    }
    if (!seg[2]) {
      const tab = new URLSearchParams(location.search).get("tab");
      if (tab && (SUBJECT_TAB_VALUES as readonly string[]).includes(tab)) {
        return tab as SubjectTab;
      }
    }
    return "articles";
  })();

  // 학습과목 토글 — 6과목(SUBJECT_NAV_ITEMS) 파생. 권한 없는 과목은 비활성 표시.
  const tabItems: SectionTabItem[] = SUBJECT_NAV_ITEMS.map((s) => {
    const slug = subjectSlugFromHref(s.href);
    const disabled = isSubjectLocked(slug, isStaff, subjectAccess);
    return {
      id: s.href,
      to: s.href,
      label: s.name,
      match: [s.href],
      disabled,
      disabledHint: disabled ? subjectLockedHint(slug) : undefined,
    };
  });
  // 모바일 트리/학습보조 Sheet(모달 Radix Dialog)가 열린 채 트리 링크로 다른
  // 라우트(판례→조문/체계도, 문제→조문 등)로 전환되면, Sheet 이 cleanup 전에
  // unmount 되어 <body> 에 건 pointer-events:none 가 남고 → 도착 화면이 클릭
  // 불가(=전환 안 되는 것처럼 보임)가 된다. 이 레이아웃은 모든 조문/판례/문제/
  // 체계도 뷰어를 가로질러 유지되므로, 전환마다 잔존 잠금을 해제한다.
  useEffect(() => {
    if (document.body.style.pointerEvents === "none") {
      document.body.style.pointerEvents = "";
    }
  }, [location.pathname, location.search]);

  return (
    <>
      <AreaTabs
        ariaLabel="학습과목"
        items={tabItems}
        rightSlot={
          axisData && currentSubject ? (
            <SubjectAxisChips
              subjectSlug={currentSubject}
              active={activeAxis}
              counts={axisData.axisCounts}
              showSubjective={isStaff}
            />
          ) : undefined
        }
      />
      <Outlet />
    </>
  );
}
