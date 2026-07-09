// 찾아오시는 길 — 공개 페이지. 푸터 "찾아오시는 길" 링크 대상.
// 카카오 약도 하나로 표시(주소·전화·오시는 길·길찾기는 약도 위젯에 포함).
import { KakaoRoughMap } from "~/features/home/components/kakao-rough-map";
import { AboutSectionNav } from "../components/about-section-nav";

import type { Route } from "./+types/location";

const ADDRESS = "서울특별시 서초구 서초대로 131 로고스빌딩 2층";

export const meta: Route.MetaFunction = () => [
  { title: "찾아오시는 길 | 리담변리사학원" },
  {
    name: "description",
    content: `리담변리사학원 오시는 길 — ${ADDRESS}. 7호선 내방역 8번 출구 도보 4분.`,
  },
];

export default function Location() {
  return (
    <>
      <AboutSectionNav />
      <main className="mx-auto w-full max-w-3xl px-5 py-16 md:px-8 md:py-24">
        <header className="mb-10 text-center">
          <p className="text-link mb-3 font-mono text-xs font-semibold tracking-[0.2em] uppercase">
            Location
          </p>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            찾아오시는 길
          </h1>
        </header>

        {/* 카카오 약도 — 진입 즉시 노출. 주소·전화·오시는 길·길찾기가 위젯에 포함.
            배경 흰색 고정(위젯 글씨가 다크 모드서 안 보이므로). */}
        <div className="border-border overflow-hidden rounded-xl border bg-white shadow-sm">
          <KakaoRoughMap />
        </div>
      </main>
    </>
  );
}
