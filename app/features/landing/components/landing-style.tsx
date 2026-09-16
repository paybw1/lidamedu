// feat-12 강의 플랫폼 랜딩 공유 스타일 — 로고 청(#0868B8)·Pretendard. 모든 클래스는 .llx 스코프.
// 팔레트 SSOT = docs/lecture-palette-brief.md §2 (2026-09-16 네이비+금박 → 로고 청 전환).
// 전역 --prestige-* 는 더 이상 참조하지 않는다(강사소개 .instr·수료증 전용). 금은 성취(--prize*) 1곳만.
// 앱 다크모드는 .dark 클래스 기반 → .dark .llx 로 토큰 오버라이드. 라이트에 있는 색 토큰은
// 다크에도 빠짐없이 재정의한다(누락 = 다크에서 라이트 색이 그대로 뜬다).
export function LandingStyle() {
  return (
    <style>{`
.llx{
  --navy:#0868b8; --navy2:#0a4d8c; --navy-soft:#3a8fd8;
  --blue:#0868b8; --blue-fg:#ffffff; --blue-ink:#0a5a9e; --blue-wash:#e6f1fb;
  --ink:#14212f; --soft:#46556a; --faint:#5f6d87;
  --line:#e0e7ef; --line2:#cdd8e4;
  --lground:#f4f7fa; --lsurface:#ffffff;
  --hero-ink:#f5f9fe; --hero-soft:#dfecf9;
  --prize:#7a5c1c; --prize-bg:#f7f0dc; --prize-line:#e2d2a6;
  --ok:#1e824c; --warn:#c97a1a; --warn-ink:#a45f10; --hot:#c0392b;
  --lshadow:0 18px 40px -24px rgba(8,104,184,.35);
  --lfont:"Pretendard Variable",Pretendard,"Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif;
  background:var(--lground); color:var(--ink); font-family:var(--lfont); letter-spacing:-.01em;
}
.dark .llx{
  --navy:#0a5798; --navy2:#073f70; --navy-soft:#1e78bf;
  --blue:#4d9fe6; --blue-fg:#0b1a2b; --blue-ink:#78b8f0; --blue-wash:#10294a;
  --ink:#e6ebf2; --soft:#a9b3c4; --faint:#7f8a9c;
  --line:#232f3d; --line2:#303f52;
  --lground:#0f141b; --lsurface:#151b25;
  --hero-ink:#f2f7fd; --hero-soft:#c6dbf2;
  --prize:#dcc489; --prize-bg:#2a2412; --prize-line:#6b551f;
  --ok:#4fbf82; --warn:#e0a04a; --warn-ink:#e0ae5c; --hot:#ef6b5e;
  --lshadow:0 18px 42px -26px rgba(0,0,0,.7);
}
.llx a{color:inherit;text-decoration:none}
.llx h1,.llx h2,.llx h3,.llx p{margin:0}
.llx .wrap{max-width:1180px;margin:0 auto;padding:0 24px}
.llx .eyebrow{font-size:12px;font-weight:700;letter-spacing:.22em;color:var(--blue-ink)}
.llx .tnum{font-variant-numeric:tabular-nums}
/* 짙은 면(슬랩) 유틸 — 히어로 슬라이드·2/3단 카드·최종 CTA 가 전부 이 한 규칙으로 수렴. */
.llx .slab,.llx .slide,.llx .bt-card,.llx .final{background:linear-gradient(158deg,var(--navy),var(--navy2));color:var(--hero-ink)}
.llx .btn{display:inline-flex;align-items:center;gap:7px;border-radius:9px;font-weight:700;font-size:14px;padding:10px 18px;cursor:pointer;border:1px solid transparent;transition:transform .14s,box-shadow .14s,background .14s}
.llx .btn:hover{transform:translateY(-2px)}
.llx .btn.primary{background:var(--blue);color:var(--blue-fg);box-shadow:0 10px 22px -12px var(--blue)}
/* .gilt = 슬랩 위 주 버튼(클래스명은 DB accent 값과 같아 유지). 금박 → 흰 바탕 + 청 잉크 반전형. */
.llx .btn.gilt{background:var(--lsurface);color:var(--blue-ink)}
.llx .btn.ghost{background:transparent;color:var(--ink);border-color:var(--line2)}
.llx .btn.ghost.on-navy{color:var(--hero-ink);border-color:color-mix(in srgb,var(--hero-ink) 55%,transparent)}
.llx .btn.sm{padding:7px 13px;font-size:13px}

/* hero carousel */
/* 히어로 위 간격·색 = 운영자 설정(--tier-gap-top/-bg, landing.tsx 주입). 미설정 시 0·투명. */
.llx .hero-carousel{position:relative;overflow:hidden;padding-top:var(--tier-gap-top,0);background:var(--tier-gap-top-bg,transparent)}
.llx .track{display:flex}
.llx .track.anim{transition:transform .7s cubic-bezier(.4,0,.2,1)}
/* accent 변형(blue/gilt/green = DB 값, rename 금지): 기본·gilt 는 슬랩 그대로, blue 는 청 하이라이트, green 은 녹 하이라이트. */
.llx .slide{min-width:100%;position:relative;overflow:hidden}
.llx .slide.blue{background:radial-gradient(120% 130% at 14% -22%,rgba(58,143,216,.35),transparent 55%),linear-gradient(158deg,var(--navy),var(--navy2))}
.llx .slide.green{background:radial-gradient(120% 130% at 50% -32%,rgba(74,222,128,.16),transparent 55%),linear-gradient(158deg,var(--navy),var(--navy2))}
.llx .slide::after{content:"";position:absolute;inset:0;pointer-events:none;background-image:linear-gradient(var(--hero-soft) 1px,transparent 1px);background-size:100% 38px;opacity:.045}
.llx .hero-in{position:relative;z-index:1;display:grid;grid-template-columns:1.15fr .85fr;gap:48px;align-items:center;padding:72px 0 92px}
/* 이미지 배너 — 원본 비율 전체 표시(크롭 없음). 높이는 이미지 비율을 따라가 업로드 이미지가
   최적 크기로 보인다. (기존 cover 크롭 폐지 — 잘림·왜곡 방지) */
.llx .slide.imgslide{display:block}
.llx .slide.htmlslide{min-height:clamp(320px,40vw,500px);display:flex}
.llx .slide-imglink,.llx .slide-img{display:block;width:100%}
.llx .slide-img{height:auto;position:relative;z-index:1}
/* 이미지 최대 폭 지정(fit) — 가운데 정렬 + 원본 비율(꽉 채우지 않음), 화면보다 크면 축소 */
.llx .slide.imgslide.fit{display:flex;align-items:center;justify-content:center;padding:20px 16px}
.llx .slide.imgslide.fit .slide-imglink{width:100%;margin:0 auto}
.llx .slide.imgslide.fit .slide-img{height:auto;max-height:clamp(320px,40vw,500px);object-fit:contain;margin:0 auto;max-width:100%}
.llx .slide-html{position:relative;z-index:1;width:100%;align-self:center;color:var(--hero-ink)}
/* 스크립트 포함 HTML 배너 — iframe 격리 실행. 초기 높이(로드 후 JS가 내용 높이로 교체),
   스크롤바 없음(오토핏), 짧으면 세로 중앙. */
.llx .slide-htmlframe{position:relative;z-index:1;width:100%;height:clamp(320px,40vw,500px);border:0;display:block;overflow:hidden;align-self:center;background:transparent}
.llx .slide h1{font-size:clamp(32px,4.4vw,52px);font-weight:800;line-height:1.09;letter-spacing:-.035em;text-wrap:balance;margin:16px 0 18px}
.llx .slide h1 .hl{color:var(--hero-ink);background:linear-gradient(transparent 64%,color-mix(in srgb,var(--hero-ink) 22%,transparent) 0)}
.llx .slide .sub{color:var(--hero-soft);font-size:clamp(15px,1.5vw,17px);max-width:34ch;line-height:1.75}
.llx .slide .cta{display:flex;gap:12px;margin:28px 0 24px;flex-wrap:wrap}
.llx .trust{display:flex;gap:22px;flex-wrap:wrap;border-top:1px solid color-mix(in srgb,var(--hero-ink) 14%,transparent);padding-top:20px}
.llx .trust .t{display:flex;flex-direction:column;gap:2px}
.llx .trust .n{font-size:22px;font-weight:700;color:var(--hero-ink)}
.llx .trust .n .u{font-size:13px;color:var(--hero-soft);font-weight:700;margin-left:1px}
.llx .trust .l{font-size:12px;color:var(--hero-soft)}
.llx .cnav{position:absolute;top:50%;transform:translateY(-50%);z-index:4;width:42px;height:42px;border-radius:50%;border:1px solid color-mix(in srgb,var(--hero-ink) 24%,transparent);background:color-mix(in srgb,var(--navy2) 42%,transparent);color:var(--hero-ink);font-size:22px;cursor:pointer;display:grid;place-items:center;backdrop-filter:blur(6px);transition:background .15s,transform .15s}
.llx .cnav:hover{background:color-mix(in srgb,var(--hero-ink) 26%,transparent);transform:translateY(-50%) scale(1.06)}
.llx .cnav.prev{left:16px}.llx .cnav.next{right:16px}
.llx .dots{position:absolute;bottom:22px;left:50%;transform:translateX(-50%);z-index:4;display:flex;gap:8px}
.llx .dots button{width:9px;height:9px;padding:0;border-radius:99px;border:0;background:color-mix(in srgb,var(--hero-ink) 34%,transparent);cursor:pointer;transition:width .25s,background .25s}
.llx .dots button.on{background:var(--hero-ink);width:26px}
/* 소개 밴드 — 배너가 전부 이미지형일 때 "무엇을 파는 곳인지" 한 문장(feat-11-012 P3).
   배너 디자인은 그대로 두고 그 아래 한 줄을 더한다. */
.llx .introband{background:var(--lsurface);border-bottom:1px solid var(--line)}
.llx .introband .in{max-width:1180px;margin:0 auto;padding:24px;display:flex;flex-wrap:wrap;align-items:center;gap:14px 28px}
.llx .introband h1{font-size:clamp(19px,2.2vw,25px);font-weight:800;letter-spacing:-.03em;line-height:1.3;text-wrap:balance}
.llx .introband h1 .hl{color:var(--blue-ink)}
.llx .introband p{font-size:14px;color:var(--soft);line-height:1.65;flex:1;min-width:min(100%,260px)}
.llx .introband .cta{display:flex;gap:8px;flex-wrap:wrap}
/* hero right cards */
/* 히어로 유리 카드 — 흰 틴트 대신 navy2 로 살짝 짙게(hero-soft 12px 글자가 4.5 를 넘기려면 바탕이 슬랩보다 밝아지면 안 된다). */
.llx .hcard{background:linear-gradient(160deg,color-mix(in srgb,var(--navy2) 55%,transparent),color-mix(in srgb,var(--navy2) 25%,transparent));border:1px solid color-mix(in srgb,var(--hero-ink) 16%,transparent);border-radius:16px;padding:18px;backdrop-filter:blur(6px);box-shadow:0 30px 60px -30px rgba(0,0,0,.6)}
.llx .hcard .hh{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.llx .hcard .lab{font-size:11px;font-weight:700;letter-spacing:.16em;color:var(--hero-soft)}
.llx .hcard .live{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--hero-soft);font-weight:700}
.llx .hcard .dot{width:7px;height:7px;border-radius:50%;background:#4ade80;box-shadow:0 0 0 4px rgba(74,222,128,.18);animation:llxpulse 2s infinite}
@keyframes llxpulse{50%{box-shadow:0 0 0 7px rgba(74,222,128,0)}}
.llx .hrow{display:flex;align-items:center;gap:12px;padding:11px 4px;border-top:1px solid color-mix(in srgb,var(--hero-ink) 10%,transparent)}
.llx .hrow:first-of-type{border-top:0}
.llx .hrow .dday{width:52px;flex-shrink:0;text-align:center}
.llx .hrow .dday b{display:block;font-size:19px;font-weight:700;color:var(--hero-ink);line-height:1}
.llx .hrow .dday span{font-size:10px;color:var(--hero-soft)}
.llx .hrow .mid{flex:1;min-width:0}
.llx .hrow .mid .s{font-size:14px;font-weight:700;color:var(--hero-ink)}
.llx .hrow .mid .m{font-size:12px;color:var(--hero-soft)}
.llx .hrow .seat{font-size:11px;font-weight:700;color:var(--hero-soft);white-space:nowrap}
.llx .promo{background:linear-gradient(160deg,color-mix(in srgb,var(--navy2) 55%,transparent),color-mix(in srgb,var(--navy2) 25%,transparent));border:1px solid color-mix(in srgb,var(--hero-ink) 16%,transparent);border-radius:16px;padding:30px 26px;backdrop-filter:blur(6px);text-align:center;box-shadow:0 30px 60px -30px rgba(0,0,0,.6)}
.llx .promo .pk{font-size:11px;font-weight:700;letter-spacing:.2em;color:var(--hero-soft)}
.llx .promo .pbig{font-size:clamp(56px,8vw,78px);font-weight:800;line-height:1;color:var(--hero-ink);letter-spacing:-.04em;margin:12px 0}
.llx .promo .pbig span{font-size:.34em;color:var(--hero-soft);margin-left:4px;font-weight:700}
.llx .promo p{color:var(--hero-soft);font-size:14px;margin-bottom:20px;line-height:1.6}
.llx .pbadges{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:16px 0 20px}
.llx .pbadges span{font-size:12px;font-weight:700;color:var(--hero-ink);background:rgba(74,222,128,.16);border:1px solid rgba(74,222,128,.32);padding:6px 11px;border-radius:99px}

/* 히어로 아래 추가 단(2·3단) 배너 */
/* 단(tier) 사이 간격·색 = 운영자 설정(landing.tsx 주입). 각 단 상단 여백이 이전 단(또는
   히어로)과의 간격. 경계별 독립: gap-12(1↔2단)=--tier-gap, gap-23(2↔3단)=--tier-gap-2. */
.llx .btier{padding:0}
.llx .btier-gap-12{padding-top:var(--tier-gap,0);background:var(--tier-gap-bg,transparent)}
.llx .btier-gap-23{padding-top:var(--tier-gap-2,0);background:var(--tier-gap-2-bg,transparent)}
.llx .bt-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px}
.llx .bt-grid.one{grid-template-columns:1fr}
.llx .bt-block{border-radius:16px;overflow:hidden;box-shadow:var(--lshadow)}
.llx .bt-imglink{display:block;transition:transform .18s}
.llx .bt-imglink:hover{transform:translateY(-3px)}
.llx .bt-img{display:block;width:100%;height:auto}
.llx .bt-html{background:var(--lsurface);border:1px solid var(--line);padding:0}
/* 스크립트 포함 HTML(2·3단) — iframe 격리 실행. 로드 후 JS가 내용 높이로 교체, 스크롤바 없음. */
.llx .bt-htmlframe{width:100%;height:clamp(240px,26vw,360px);border:0;display:block;overflow:hidden;background:transparent}
.llx .bt-card{padding:26px 24px;display:flex;flex-direction:column;gap:10px;align-items:flex-start;position:relative;overflow:hidden}
.llx .bt-card.blue{background:radial-gradient(90% 90% at 92% 0,rgba(58,143,216,.35),transparent 55%),linear-gradient(158deg,var(--navy),var(--navy2))}
.llx .bt-card>*{position:relative;z-index:1}
.llx .bt-card .bt-eye{font-size:11px;font-weight:700;letter-spacing:.16em;color:var(--hero-soft)}
.llx .bt-card h3{font-size:20px;font-weight:700;line-height:1.3}
.llx .bt-card p{font-size:14px;color:var(--hero-soft);line-height:1.6}

/* section frame */
.llx .band{padding:70px 0}
.llx .band.tint{background:var(--lsurface);border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.llx .shead{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:28px}
.llx .shead h2{font-size:clamp(23px,2.6vw,31px);font-weight:800;letter-spacing:-.03em;margin-top:8px;text-wrap:balance}
.llx .shead p{color:var(--soft);font-size:14.5px;margin-top:8px;max-width:52ch}
.llx .more{color:var(--blue-ink);font-weight:700;font-size:13.5px;white-space:nowrap}
.llx .more:hover{text-decoration:underline}

/* 공부방법·맛보기 영상 */
.llx .vidsub{font-size:13px;font-weight:700;letter-spacing:.04em;color:var(--blue-ink)}
.llx .vidgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:18px;margin-top:12px}

/* schedule strip */
.llx .strip{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
.llx .sc{background:var(--lsurface);border:1px solid var(--line);border-radius:15px;padding:18px;box-shadow:var(--lshadow);display:flex;flex-direction:column;gap:11px;position:relative;overflow:hidden}
/* 레일 안에서는 고정폭 카드(Rail cardWidth=252 과 일치), 약간 축소 */
.llx .irailtrack .sc{flex:0 0 252px;padding:15px;gap:9px;text-decoration:none;color:inherit;transition:transform .2s,border-color .2s}
.llx .irailtrack .sc h3{font-size:16px}
.llx .irailtrack .sc:hover{transform:translateY(-4px);border-color:var(--line2)}
.llx .sc .tag{position:absolute;top:0;right:0;font-size:11px;font-weight:700;color:var(--blue-fg);padding:4px 11px;border-bottom-left-radius:10px}
/* waitlist 채움 = --warn-ink (--warn 위 흰 글자 3.34 로 미달 → 4.97) */
.llx .sc .tag.soon{background:var(--hot)}.llx .sc .tag.open{background:var(--blue)}.llx .sc .tag.waitlist{background:var(--warn-ink)}.llx .sc .tag.closed{background:var(--faint)}
.llx .sc .subj{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:700;color:var(--blue-ink);letter-spacing:.04em}
.llx .sc h3{font-size:17px;font-weight:700;letter-spacing:-.02em}
.llx .sc .tutor{font-size:13px;color:var(--soft);font-weight:600}
.llx .sc .meta{display:flex;flex-direction:column;gap:5px;font-size:12.5px;color:var(--soft);margin-top:2px}
.llx .sc .meta div{display:flex;gap:8px}
.llx .sc .meta .k{color:var(--faint);width:44px;flex-shrink:0}
.llx .sc .meta .v{font-weight:700;color:var(--ink)}
.llx .sc .foot{display:flex;align-items:center;justify-content:space-between;margin-top:auto}
.llx .sc .ddayb{font-size:12px;font-weight:700;color:var(--blue-ink);background:var(--blue-wash);padding:3px 9px;border-radius:7px}

/* instructors */
.llx .igroup{margin-bottom:24px}
/* 강사 레일 — 한 명씩 넘기는 캐러셀. 스크롤바 없음, 카드 잘림 없음, 화살표 상시 노출 */
.llx .irailwrap{position:relative}
.llx .irailview{overflow:hidden;margin:0 auto}
.llx .irailtrack{display:flex;gap:16px;transition:transform .45s cubic-bezier(.4,0,.2,1);will-change:transform}
.llx .irail-nav{position:absolute;top:42%;transform:translateY(-50%);z-index:3;width:44px;height:44px;border-radius:50%;border:1px solid var(--line2);background:var(--lsurface);color:var(--ink);font-size:26px;line-height:1;cursor:pointer;display:grid;place-items:center;box-shadow:0 10px 26px -12px rgba(8,104,184,.5);transition:transform .15s,background .15s,color .15s,opacity .15s}
.llx .irail-nav:hover:not(:disabled){background:var(--blue);color:var(--blue-fg);border-color:var(--blue);transform:translateY(-50%) scale(1.06)}
.llx .irail-nav:disabled{opacity:.32;cursor:default}
.llx .irail-nav.prev{left:2px}
.llx .irail-nav.next{right:2px}
.llx .ihd{display:flex;align-items:baseline;gap:12px;margin-bottom:14px;padding-bottom:9px;border-bottom:1px solid var(--line)}
.llx .ihd .kr{font-size:17px;font-weight:700}
.llx .ihd .en{font-size:11px;letter-spacing:.16em;color:var(--faint);font-weight:700}
/* 대형 인물 사진 세로 카드(고정 폭 186 — 페이지 계산 기준). 오버레이 프레임 없음. */
.llx .ic{flex:0 0 186px;width:186px;display:flex;flex-direction:column;text-decoration:none;color:inherit;background:var(--lsurface);border:1px solid var(--line);border-radius:15px;overflow:hidden;box-shadow:var(--lshadow);transition:transform .2s,border-color .2s}
.llx .ic:hover{transform:translateY(-4px);border-color:var(--line2)}
.llx .ic .por{width:100%;aspect-ratio:4/5;position:relative;display:grid;place-items:center;overflow:hidden;background:linear-gradient(150deg,var(--navy-soft),var(--navy2))}
.llx .ic .por b{color:color-mix(in srgb,var(--hero-ink) 94%,transparent);font-size:46px;font-weight:800}
.llx .ic .por img{width:100%;height:100%;object-fit:cover;transition:transform .5s cubic-bezier(.2,.7,.2,1)}
.llx .ic:hover .por img{transform:scale(1.04)}
.llx .ic .icb{padding:13px 14px 16px;display:flex;flex-direction:column;gap:6px}
.llx .ic .nm{font-size:16.5px;font-weight:700}
.llx .ic .role{align-self:flex-start;font-size:11px;font-weight:700;color:var(--blue-ink);background:var(--blue-wash);padding:3px 9px;border-radius:6px}
.llx .ic .cap{font-size:12px;color:var(--soft);line-height:1.5}

/* tiers */
.llx .tiers{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
.llx .tier{background:var(--lsurface);border:1px solid var(--line);border-radius:16px;padding:24px;display:flex;flex-direction:column;gap:13px;box-shadow:var(--lshadow)}
.llx .tier.feat{border:1.5px solid var(--blue);position:relative}
.llx .tier.feat::before{content:"추천";position:absolute;top:-11px;left:24px;background:var(--blue);color:var(--blue-fg);font-size:11px;font-weight:700;padding:3px 11px;border-radius:99px}
.llx .tier .tn{font-size:13px;font-weight:700;letter-spacing:.04em;color:var(--blue-ink)}
.llx .tier .price{font-size:26px;font-weight:800;letter-spacing:-.03em}
.llx .tier .price .u{font-size:14px;font-weight:700;color:var(--faint)}
.llx .tier .desc{font-size:13.5px;color:var(--soft);line-height:1.7}
.llx .tier ul{list-style:none;margin:4px 0 0;padding:0;display:flex;flex-direction:column;gap:9px}
.llx .tier li{font-size:13.5px;color:var(--ink);display:flex;gap:9px;align-items:flex-start}
.llx .tier li .ck{color:var(--blue);font-weight:700;flex-shrink:0}
.llx .tier .btn{margin-top:auto;justify-content:center}

/* reviews */
.llx .revs{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.llx .rev{background:var(--lsurface);border:1px solid var(--line);border-radius:14px;padding:20px;display:flex;flex-direction:column;gap:12px}
.llx .rev .q{font-size:14.5px;line-height:1.75;color:var(--ink);font-weight:500}
.llx .rev .who{display:flex;align-items:center;gap:10px;margin-top:auto;border-top:1px solid var(--line);padding-top:12px}
.llx .rev .av{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;color:var(--blue-fg);font-weight:700;font-size:13px;background:linear-gradient(145deg,var(--blue),var(--blue-ink))}
.llx .rev .who .nm{font-size:13px;font-weight:700}
.llx .rev .who .mt{font-size:11.5px;color:var(--faint)}
/* 배지 기본 = 중립(별점). 성취(합격)만 .passer 수정자로 저채도 금 워시 — 1화면 1금. */
.llx .rev .badge{display:inline-flex;align-items:center;gap:5px;align-self:flex-start;font-size:11px;font-weight:700;color:var(--soft);background:color-mix(in srgb,var(--faint) 12%,transparent);padding:3px 9px;border-radius:99px}
.llx .badge.passer{color:var(--prize);background:var(--prize-bg);border:1px solid var(--prize-line)}

/* news */
.llx .newswrap{display:grid;grid-template-columns:1.3fr .7fr;gap:26px;align-items:start}
/* ★그리드 자식의 기본 min-width:auto 때문에 칸이 내용 아래로 못 줄어, 폰(400px)에서 칸이
   455px 로 늘어나 문서 전체가 가로로 밀렸다(feat-11-012 P2 실측). 소식 제목이 말줄임이라
   눈으로는 안 보이고 페이지가 옆으로 흔들리는 증상으로만 나타난다. */
.llx .newswrap>*{min-width:0}
.llx .newslist{display:flex;flex-direction:column}
.llx .nrow{display:flex;align-items:center;gap:14px;padding:15px 6px;border-top:1px solid var(--line)}
.llx .nrow:first-child{border-top:0}
.llx .nrow:hover .nt{color:var(--blue-ink)}
.llx .chip{font-size:11px;font-weight:700;padding:3px 9px;border-radius:6px;white-space:nowrap;flex-shrink:0}
.llx .chip.notice{background:var(--blue-wash);color:var(--blue-ink)}
.llx .chip.event{background:var(--blue);color:var(--blue-fg)}
.llx .chip.passer{background:var(--prize-bg);color:var(--prize);border:1px solid var(--prize-line)}
.llx .nrow .nt{font-size:14.5px;font-weight:700;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.llx .nrow .nd{font-size:12px;color:var(--faint)}
/* 이벤트 카드 — 짙은 면에서 밝은 카드로 반전(짙은 면은 히어로·최종 CTA 둘만). 왼쪽 청 바 + 청 워시 키커. */
.llx .eventcard{background:var(--lsurface);color:var(--ink);border:1px solid var(--line);border-left:4px solid var(--blue);border-radius:16px;padding:24px;position:relative;overflow:hidden;box-shadow:var(--lshadow)}
.llx .eventcard .in{position:relative;z-index:1}
.llx .eventcard .k{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.16em;color:var(--blue-ink);background:var(--blue-wash);padding:3px 9px;border-radius:6px}
.llx .eventcard h3{font-size:21px;font-weight:700;margin:10px 0;line-height:1.3}
.llx .eventcard p{font-size:13px;color:var(--soft);margin-bottom:16px}
.llx .eventcard .btn.gilt{background:var(--blue);color:var(--blue-fg);box-shadow:0 10px 22px -12px var(--blue)}

/* books */
.llx .books{display:grid;grid-template-columns:repeat(6,1fr);gap:16px}
.llx .bk{display:flex;flex-direction:column;gap:9px}
.llx .bk .cov{aspect-ratio:3/4;border-radius:5px;position:relative;overflow:hidden;display:flex;align-items:flex-end;padding:12px;border:1px solid var(--line);background:linear-gradient(155deg,var(--navy),var(--navy2));box-shadow:var(--lshadow);transition:transform .22s}
/* 표지 위 제목(.bt)은 hero-ink — 시작점을 --blue 로 두면 다크(#4d9fe6)에서 2.63 으로 미달해 --navy 계열만 쓴다 */
.llx .bk:nth-child(3n+2) .cov{background:linear-gradient(155deg,var(--navy2),var(--navy))}
.llx .bk:nth-child(3n) .cov{background:linear-gradient(155deg,#6b7183,#3a4358)}
.llx .bk .cov::before{content:"";position:absolute;left:0;top:0;bottom:0;width:6px;background:rgba(0,0,0,.18)}
.llx .bk:hover .cov{transform:translateY(-4px)}
.llx .bk .bt{position:relative;color:var(--hero-ink);font-size:13px;font-weight:700;line-height:1.3}
.llx .bk .cov .bkimg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:1}
.llx .bk .bkt{margin-top:8px;font-size:12.5px;font-weight:700;color:var(--ink);text-align:center;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.llx .bk .cap{font-size:12px;font-weight:700;color:var(--blue-ink);text-align:center}

/* faq */
.llx .faq{max-width:820px;margin:0 auto;display:flex;flex-direction:column;gap:10px}
.llx details.qa{background:var(--lsurface);border:1px solid var(--line);border-radius:12px;padding:2px 18px}
.llx details.qa summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:12px;padding:16px 0;font-weight:700;font-size:15px}
.llx details.qa summary::-webkit-details-marker{display:none}
.llx details.qa summary .q{color:var(--blue-ink);font-weight:700;flex-shrink:0}
.llx details.qa summary .ar{margin-left:auto;color:var(--faint);transition:transform .2s}
.llx details.qa[open] summary .ar{transform:rotate(180deg)}
.llx details.qa summary .qt{flex:1;min-width:0}
.llx details.qa .a{font-size:14px;color:var(--soft);line-height:1.8;padding:0 0 18px 30px;white-space:pre-wrap}
/* faq — 분류 가로 탭(support_faqs) */
.llx .faqhint{white-space:nowrap}
.llx .faqx{max-width:860px}
.llx .faxtabs{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-start;margin-bottom:18px}
.llx .faxtab{display:inline-flex;align-items:center;gap:7px;padding:9px 16px;border-radius:999px;border:1px solid var(--line2);background:var(--lsurface);color:var(--soft);font-weight:700;font-size:13.5px;cursor:pointer;transition:border-color .15s,color .15s,background .15s,box-shadow .15s}
.llx .faxtab:hover{border-color:var(--blue);color:var(--ink)}
.llx .faxtab .c{font-size:11px;font-weight:700;color:var(--soft);background:var(--lground);border-radius:999px;padding:1px 7px;min-width:20px;text-align:center}
/* 활성 탭 — 짙은 면 대신 청 워시로 밝게 반전 */
.llx .faxtab.on{background:var(--blue-wash);color:var(--blue-ink);border-color:var(--blue)}
.llx .faxtab.on .c{background:var(--lsurface);color:var(--blue-ink)}
.llx .faxlist{display:flex;flex-direction:column;gap:10px}

/* final */
.llx .final{position:relative;overflow:hidden}
.llx .final-in{position:relative;z-index:1;display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:center;padding:60px 0}
.llx .final h2{font-size:clamp(25px,2.8vw,34px);font-weight:800;letter-spacing:-.03em;line-height:1.2;text-wrap:balance}
.llx .final p{color:var(--hero-soft);margin:14px 0 22px;font-size:15px;line-height:1.7}
.llx .loc{background:color-mix(in srgb,var(--navy2) 45%,transparent);border:1px solid color-mix(in srgb,var(--hero-ink) 16%,transparent);border-radius:14px;padding:20px}
.llx .loc .li{display:flex;gap:10px;padding:10px 0;border-top:1px solid color-mix(in srgb,var(--hero-ink) 10%,transparent);font-size:13.5px}
.llx .loc .li:first-child{border-top:0}
.llx .loc .li .k{color:var(--hero-soft);font-weight:700;width:64px;flex-shrink:0}
.llx .loc .li .v{color:var(--hero-ink)}

.llx .rv{opacity:0;transform:translateY(18px);transition:opacity .6s ease,transform .6s ease}
.llx .rv.in{opacity:1;transform:none}
@media (prefers-reduced-motion:reduce){.llx .rv{opacity:1;transform:none;transition:none}.llx .hcard .dot{animation:none}}

@media (max-width:1000px){
  .llx .hero-in{grid-template-columns:1fr;gap:30px;padding:52px 0 64px}
  .llx .strip{grid-template-columns:repeat(2,1fr)}
  .llx .tiers{grid-template-columns:1fr}
  .llx .revs{grid-template-columns:1fr}
  .llx .newswrap{grid-template-columns:1fr}
  .llx .books{grid-template-columns:repeat(4,1fr)}
  .llx .final-in{grid-template-columns:1fr;padding:44px 0}
}
@media (max-width:560px){
  .llx .wrap{padding:0 18px}
  .llx .strip{grid-template-columns:1fr}
  .llx .faqhint{white-space:normal}
  .llx .books{grid-template-columns:repeat(3,1fr)}
  .llx .shead{flex-direction:column;align-items:flex-start;gap:6px}
}
`}</style>
  );
}
