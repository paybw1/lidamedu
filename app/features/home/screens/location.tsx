// 찾아오시는 길 — 공개 페이지. 푸터 "찾아오시는 길" 링크 대상.
// 주소·전화·대중교통·카카오맵/오픈카톡(리담지식재산교육원 공식 정보).
import {
  ExternalLinkIcon,
  MapPinIcon,
  MessageCircleIcon,
  PhoneIcon,
  TrainFrontIcon,
} from "lucide-react";

import { Button } from "~/core/components/ui/button";
import { Card, CardContent } from "~/core/components/ui/card";
import { KakaoMap } from "~/features/home/components/kakao-map";
import { KakaoRoughMap } from "~/features/home/components/kakao-rough-map";

import type { Route } from "./+types/location";

const KAKAO_MAP_URL = "https://kko.to/-nr4arxA9m";
const OPEN_CHAT_URL = "https://open.kakao.com/o/pb4ApLdi";
const ADDRESS = "(06588) 서울특별시 서초구 서초대로 131 2층";
const PHONE = "02-594-8881";
// 키 없이 임베드 가능한 구글 지도(주소 검색) — 페이지에서 바로 위치 표시.
// 실제 길찾기는 한국 사용자 친화적인 카카오맵 버튼으로 유도.
const MAP_EMBED_URL = `https://www.google.com/maps?q=${encodeURIComponent(
  "서울특별시 서초구 서초대로 131",
)}&z=17&output=embed`;
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
    <main className="mx-auto w-full max-w-2xl px-5 py-16 md:px-8 md:py-24">
      <header className="mb-10 text-center">
        <p className="text-link mb-3 font-mono text-xs font-semibold tracking-[0.2em] uppercase">
          Location
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
          찾아오시는 길
        </h1>
      </header>

      {/* 지도 — 페이지 진입 시 바로 위치 노출(카카오맵, 실패 시 구글 폴백) */}
      <div className="border-border mb-5 overflow-hidden rounded-xl border shadow-sm">
        <KakaoMap
          address="서울특별시 서초구 서초대로 131"
          label="리담변리사학원 위치 지도"
          fallbackSrc={MAP_EMBED_URL}
          className="block h-[320px] w-full md:h-[380px]"
        />
      </div>

      <Card>
        <CardContent className="space-y-6 py-6">
          <InfoRow icon={MapPinIcon} label="주소">
            <p className="text-foreground font-medium">{ADDRESS}</p>
            <p className="text-muted-foreground text-sm">리담변리사학원</p>
          </InfoRow>

          <InfoRow icon={PhoneIcon} label="전화">
            <a
              href={`tel:${PHONE.replace(/-/g, "")}`}
              className="text-foreground font-medium hover:underline"
            >
              {PHONE}
            </a>
          </InfoRow>

          <InfoRow icon={TrainFrontIcon} label="대중교통">
            <ul className="space-y-1">
              {TRANSIT.map((t) => (
                <li key={t} className="text-foreground/90">
                  {t}
                </li>
              ))}
            </ul>
          </InfoRow>

          {/* 카카오 약도 위젯(등록된 roughmap) — 클라 전용 렌더. 대중교통↔길찾기 사이. */}
          <div className="border-border overflow-hidden rounded-lg border">
            <KakaoRoughMap />
          </div>

          <div className="flex flex-col gap-2.5 pt-1 sm:flex-row">
            <Button asChild className="flex-1">
              <a href={KAKAO_MAP_URL} target="_blank" rel="noreferrer noopener">
                <MapPinIcon className="size-4" />
                카카오맵으로 길찾기
                <ExternalLinkIcon className="size-3.5 opacity-70" />
              </a>
            </Button>
            <Button asChild variant="outline" className="flex-1">
              <a href={OPEN_CHAT_URL} target="_blank" rel="noreferrer noopener">
                <MessageCircleIcon className="size-4" />
                오픈카톡 문의
                <ExternalLinkIcon className="size-3.5 opacity-70" />
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

function InfoRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof MapPinIcon;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3.5">
      <span className="bg-primary/10 text-link inline-flex size-9 shrink-0 items-center justify-center rounded-lg">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-muted-foreground mb-0.5 text-[11px] font-semibold tracking-wide uppercase">
          {label}
        </p>
        {children}
      </div>
    </div>
  );
}
