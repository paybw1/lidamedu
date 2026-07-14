// 학원시설 — /lecture/facilities. 공개 페이지. 강의 nav "리담안내" 하위.
//   콘텐츠 출처: source/학원소개/space.html. 사진은 facility-photos(public) 버킷.
//   디자인은 랜딩·시험정보와 동일한 .llx 스코프(네이비·금박·Pretendard).
import makeServerClient from "~/core/lib/supa-client.server";

import { LandingStyle } from "../components/landing-style";

import type { Route } from "./+types/facilities";

export const meta: Route.MetaFunction = () => [
  { title: "학원시설 | 리담변리사학원" },
  {
    name: "description",
    content:
      "리담변리사학원의 강의실·자습 공간과 편의시설을 소개합니다. 집중을 위한 학습 환경.",
  },
];

const BUCKET = "facility-photos";

// 학습 공간(space.html Section 1).
const LEARN: { img: string; title: string; desc: string }[] = [
  {
    img: "2.jpg",
    title: "강의부터 자습까지, 하나의 공간에서",
    desc: "변리사 수험생에게 가장 중요한 것은 시간입니다. 수업부터 자습까지 한 공간에서 — 이동은 줄이고 학습에만 집중하세요.",
  },
  {
    img: "3.jpg",
    title: "긴 호흡을 위한 쾌적함",
    desc: "1,050mm 넓은 책상과 여유로운 좌석 간격으로, 장시간 학습에도 편안하게 몰입할 수 있도록 설계했습니다.",
  },
  {
    img: "4.jpg",
    title: "편안한 시디즈 서울대의자",
    desc: "장시간 학습을 위한 인체공학적 의자로, 오래 앉아도 편안한 학습 환경을 제공합니다.",
  },
  {
    img: "5.jpg",
    title: "밝고 쾌적한 강의 공간",
    desc: "집중력은 높이고 피로는 줄이는 밝고 쾌적한 강의실입니다. 최적의 환경에서 강의에 온전히 몰입할 수 있습니다.",
  },
];

// 편의 시설(space.html Section 2).
const AMENITY: { img: string; title: string; desc: string }[] = [
  {
    img: "6.jpg",
    title: "상담실 & 휴게공간",
    desc: "궁금한 점은 편안하게 상담하고, 학습 사이에는 잠시 쉬어갈 수 있는 공간입니다. 집중과 휴식의 균형을 제공합니다.",
  },
  {
    img: "7.jpg",
    title: "편의시설",
    desc: "정수기·전자레인지 등 학습에 필요한 기본 편의시설을 갖췄습니다.",
  },
  {
    img: "8.jpg",
    title: "프리미엄 커피존",
    desc: "언제든 즐길 수 있는 원두커피로, 학습 중에도 잠시의 여유와 집중력을 충전할 수 있습니다.",
  },
  {
    img: "9.jpg",
    title: "개인 사물함",
    desc: "가로·세로 500mm의 넉넉한 개인 사물함으로 교재와 학습용품을 편리하게 보관할 수 있습니다.",
  },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const url = (name: string) =>
    client.storage.from(BUCKET).getPublicUrl(name).data.publicUrl;
  const withUrl = (arr: typeof LEARN) =>
    arr.map((it) => ({ ...it, src: url(it.img) }));
  return {
    heroSrc: url("1.jpg"),
    learn: withUrl(LEARN),
    amenity: withUrl(AMENITY),
  };
}

function CardGrid({
  items,
}: {
  items: { src: string; title: string; desc: string }[];
}) {
  return (
    <div className="fc-grid">
      {items.map((it, i) => (
        <article className="fc-card" key={it.title}>
          <img src={it.src} alt={it.title} loading="lazy" />
          <div className="fc-copy">
            <span className="fc-no">{String(i + 1).padStart(2, "0")}</span>
            <h3>{it.title}</h3>
            <p>{it.desc}</p>
          </div>
        </article>
      ))}
    </div>
  );
}

export default function Facilities({ loaderData }: Route.ComponentProps) {
  const { heroSrc, learn, amenity } = loaderData;
  return (
    <div className="llx">
      <LandingStyle />
      <FacilityStyle />

      {/* 히어로 */}
      <section className="fc-hero">
        <img src={heroSrc} alt="리담변리사학원 학습 공간" />
        <div className="fc-hero-in">
          <div className="wrap">
            <p className="eyebrow">Space</p>
            <h1>집중을 위한 공간</h1>
            <p className="fc-hero-sub">
              리담변리사학원의 시설과 학습 환경을 소개합니다.
            </p>
          </div>
        </div>
      </section>

      {/* 학습 공간 */}
      <section className="band">
        <div className="wrap" style={{ maxWidth: 1180 }}>
          <div className="shead">
            <div>
              <p className="eyebrow">Study</p>
              <h2>리담의 학습 공간</h2>
              <p>강의부터 자습까지, 오래 앉아도 편안한 환경을 설계했습니다.</p>
            </div>
          </div>
          <CardGrid items={learn} />
        </div>
      </section>

      {/* 편의 시설 */}
      <section className="band tint">
        <div className="wrap" style={{ maxWidth: 1180 }}>
          <div className="shead">
            <div>
              <p className="eyebrow">Amenities</p>
              <h2>리담의 편의 시설</h2>
              <p>집중과 휴식의 균형 — 학습에 필요한 것들을 가까이 두었습니다.</p>
            </div>
          </div>
          <CardGrid items={amenity} />
        </div>
      </section>
    </div>
  );
}

// 학원시설 전용 보조 스타일 — .llx 스코프. 토큰은 LandingStyle 정의를 상속.
function FacilityStyle() {
  return (
    <style>{`
.llx .fc-hero{position:relative;min-height:clamp(340px,52vh,560px);display:flex;align-items:flex-end;overflow:hidden}
.llx .fc-hero img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.llx .fc-hero::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(14,29,56,.15) 20%,rgba(14,29,56,.82) 100%)}
.llx .fc-hero-in{position:relative;z-index:1;width:100%;padding:0 0 44px;color:#fff}
.llx .fc-hero-in .wrap{max-width:1180px}
.llx .fc-hero-in h1{font-size:clamp(32px,5vw,56px);font-weight:900;letter-spacing:-.04em;margin:12px 0 10px;text-wrap:balance}
.llx .fc-hero-sub{font-size:clamp(15px,1.6vw,18px);color:var(--hero-soft);line-height:1.6;max-width:44ch}
.llx .fc-grid{display:grid;grid-template-columns:repeat(12,1fr);gap:18px}
/* space.html 처럼 7/5·5/7 비대칭 폭 — 카드마다 사진 크기가 조금씩 달라 부드러운 리듬. */
.llx .fc-card{position:relative;overflow:hidden;grid-column:span 6;border:1px solid var(--line);border-radius:18px;box-shadow:var(--lshadow);background:var(--navy2)}
.llx .fc-card:nth-child(4n+1){grid-column:span 7}
.llx .fc-card:nth-child(4n+2){grid-column:span 5}
.llx .fc-card:nth-child(4n+3){grid-column:span 5}
.llx .fc-card:nth-child(4n+4){grid-column:span 7}
.llx .fc-card{min-height:460px}
.llx .fc-card img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:transform .7s cubic-bezier(.2,.7,.2,1)}
.llx .fc-card:hover img{transform:scale(1.04)}
.llx .fc-card::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 40%,rgba(10,20,40,.9) 100%)}
.llx .fc-copy{position:absolute;z-index:2;left:22px;right:22px;bottom:22px;color:#fff}
.llx .fc-no{display:inline-grid;place-items:center;width:38px;height:38px;border-radius:12px;background:rgba(201,164,78,.9);color:#1a1305;font-size:12px;font-weight:900;margin-bottom:12px}
.llx .fc-copy h3{font-size:22px;font-weight:900;letter-spacing:-.03em;margin:0 0 8px;text-wrap:balance}
.llx .fc-copy p{font-size:13.5px;line-height:1.65;color:rgba(255,255,255,.9);word-break:keep-all;margin:0}
@media (max-width:640px){
  /* 모바일: 1열로 펼치되 높이만 살짝 교차해 리듬 유지. */
  .llx .fc-card:nth-child(n){grid-column:span 12;min-height:300px}
  .llx .fc-card:nth-child(even){min-height:340px}
}
`}</style>
  );
}
