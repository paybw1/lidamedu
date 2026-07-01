// 찾아오시는 길 — 공개 페이지. 푸터 "찾아오시는 길" 링크 대상.
// 카카오 약도(주소·전화·길찾기는 약도 위젯 하단에 포함) + 대중교통 안내만.
import { KakaoRoughMap } from "~/features/home/components/kakao-rough-map";

import type { Route } from "./+types/location";

const ADDRESS = "(06588) 서울특별시 서초구 서초대로 131 2층";
const TRANSIT = [
  "7호선 내방역 8번 출구에서 도보 4분",
  "2호선 서초역 4번 출구에서 도보 10분",
];

export const meta: Route.MetaFunction = () => [
  { title: "찾아오시는 길 | 리담변리사학원" },
  {
    name: "description",
    content: `리담변리사학원 오시는 길 — ${ADDRESS}. 7호선 내방역 8번 출구 도보 4분.`,
  },
];

export default function Location() {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-16 md:px-8 md:py-24">
      <header className="mb-10 text-center">
        <p className="text-link mb-3 font-mono text-xs font-semibold tracking-[0.2em] uppercase">
          Location
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
          찾아오시는 길
        </h1>
      </header>

      {/* 카카오 약도 — 진입 즉시 노출. 배경 흰색 고정(위젯 글씨가 다크 모드서 안 보이므로). */}
      <div className="border-border mb-6 overflow-hidden rounded-xl border bg-white shadow-sm">
        <KakaoRoughMap />
      </div>

      {/* 주변 지하철 — 제목 바로 밑에 도보 안내 두 줄. */}
      <div className="text-center">
        <p className="text-foreground mb-1.5 font-semibold">주변 지하철</p>
        <ul className="text-foreground/90 space-y-1 leading-relaxed">
          {TRANSIT.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
    </main>
  );
}
