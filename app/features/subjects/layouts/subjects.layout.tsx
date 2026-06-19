// feat-8-008 — 학습과목(/subjects/*) 영역 게이트.
// 회원2(area_subjects) 이상만 진입. staff(강사/관리자/원장)는 requireFeature 가 면제.
// 미보유 시 /pricing?locked=area_subjects 로 redirect. UI 는 없음 — <Outlet/> 만.

import { useEffect } from "react";
import { Outlet, data, useLocation } from "react-router";

import { SectionTabs, type SectionTabItem } from "~/core/components/student";
import makeServerClient from "~/core/lib/supa-client.server";
import { SUBJECT_NAV_ITEMS } from "~/core/lib/subject-groups";
import { requireFeature } from "~/features/subscriptions/queries.server";

import type { Route } from "./+types/subjects.layout";

// 학습과목 토글 — 6과목 SSOT(SUBJECT_NAV_ITEMS) 파생, 상단바 학습과목 드롭다운과 동일.
// 다른 영역(학습관리·지원·정보)과 동일한 화면 내 가로 토글(SectionTabs)을 학습과목에도 제공.
const SUBJECT_TAB_ITEMS: SectionTabItem[] = SUBJECT_NAV_ITEMS.map((s) => ({
  id: s.href,
  to: s.href,
  label: s.name,
  match: [s.href],
}));

export async function loader({ request }: Route.LoaderArgs) {
  // headers 전달 — supabase 갱신 cookie 누수 방지 (private.layout 와 동일 이유).
  const [client, headers] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  // 비로그인은 상위 private.layout 이 처리 — 여기서는 로그인 사용자만 게이트.
  if (user) {
    await requireFeature(client, user.id, "area_subjects");
  }
  return data(null, { headers });
}

export default function SubjectsLayout() {
  const location = useLocation();
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
      <SectionTabs ariaLabel="학습과목" items={SUBJECT_TAB_ITEMS} />
      <Outlet />
    </>
  );
}
