// feat-12 강의 플랫폼 랜딩 공유 스타일 — 네이비·금박·Pretendard. 모든 클래스는 .llx 스코프.
// 앱 다크모드는 .dark 클래스 기반 → .dark .llx 로 토큰 오버라이드.
export function LandingStyle() {
  return (
    <style>{`
.llx{
  --navy:var(--prestige-navy); --navy2:var(--prestige-navy-deep); --navy-soft:var(--prestige-navy-soft);
  --blue:#2d5ba8; --blue-ink:#27508f; --blue-wash:#eef3fb;
  --gilt:var(--prestige-gilt); --gilt-2:var(--prestige-gilt-bright); --gilt-soft:#c9a44e;
  --ink:#16202e; --soft:#48526a; --faint:#7a8499;
  --line:#e3e7f0; --line2:#d3d9e6;
  --lground:#f5f6fa; --lsurface:#ffffff;
  --hero-ink:#eef2fb; --hero-soft:#aebbd6;
  --ok:#1e824c; --warn:#c97a1a; --hot:#c0392b;
  --lshadow:0 18px 40px -24px rgba(22,41,74,.42);
  --lfont:"Pretendard Variable",Pretendard,"Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif;
  background:var(--lground); color:var(--ink); font-family:var(--lfont); letter-spacing:-.01em;
}
.dark .llx{
  --blue:#6a97da; --blue-ink:#84a8e0; --blue-wash:#132844;
  --gilt-soft:#d8b968;
  --ink:#e8ebf3; --soft:#aab2c6; --faint:#7c8398;
  --line:#26303f; --line2:#334053;
  --lground:#0f131b; --lsurface:#161b25;
  --hero-soft:#9fb0cf;
  --lshadow:0 18px 42px -26px rgba(0,0,0,.7);
}
.llx a{color:inherit;text-decoration:none}
.llx h1,.llx h2,.llx h3,.llx p{margin:0}
.llx .wrap{max-width:1180px;margin:0 auto;padding:0 24px}
.llx .eyebrow{font-size:12px;font-weight:800;letter-spacing:.22em;text-transform:uppercase;color:var(--gilt-2)}
.llx .tnum{font-variant-numeric:tabular-nums}
.llx .btn{display:inline-flex;align-items:center;gap:7px;border-radius:9px;font-weight:800;font-size:14px;padding:10px 18px;cursor:pointer;border:1px solid transparent;transition:transform .14s,box-shadow .14s,background .14s}
.llx .btn:hover{transform:translateY(-2px)}
.llx .btn.primary{background:var(--blue);color:#fff;box-shadow:0 10px 22px -12px var(--blue)}
.llx .btn.gilt{background:linear-gradient(145deg,var(--gilt-2),var(--gilt));color:#fff}
.llx .btn.ghost{background:transparent;color:var(--ink);border-color:var(--line2)}
.llx .btn.ghost.on-navy{color:var(--hero-ink);border-color:rgba(238,242,251,.28)}
.llx .btn.sm{padding:7px 13px;font-size:13px}

/* hero carousel */
.llx .hero-carousel{position:relative;overflow:hidden}
.llx .track{display:flex}
.llx .track.anim{transition:transform .7s cubic-bezier(.4,0,.2,1)}
.llx .slide{min-width:100%;position:relative;overflow:hidden;color:var(--hero-ink);background:radial-gradient(120% 130% at 88% -20%,rgba(154,117,38,.22),transparent 52%),linear-gradient(158deg,var(--navy),var(--navy2))}
.llx .slide.blue{background:radial-gradient(120% 130% at 14% -22%,rgba(45,91,168,.42),transparent 55%),linear-gradient(158deg,var(--navy),var(--navy2))}
.llx .slide.gilt{background:radial-gradient(130% 130% at 92% 115%,rgba(154,117,38,.34),transparent 52%),linear-gradient(158deg,var(--navy),var(--navy2))}
.llx .slide.green{background:radial-gradient(120% 130% at 50% -32%,rgba(74,222,128,.16),transparent 55%),linear-gradient(158deg,var(--navy),var(--navy2))}
.llx .slide::after{content:"";position:absolute;inset:0;pointer-events:none;background-image:linear-gradient(var(--hero-soft) 1px,transparent 1px);background-size:100% 38px;opacity:.045}
.llx .hero-in{position:relative;z-index:1;display:grid;grid-template-columns:1.15fr .85fr;gap:48px;align-items:center;padding:72px 0 92px}
/* 이미지/HTML 배너 슬라이드 — 만든 그대로 노출 */
.llx .slide.imgslide,.llx .slide.htmlslide{min-height:clamp(320px,40vw,500px);display:flex}
.llx .slide-imglink,.llx .slide-img{display:block;width:100%}
.llx .slide-img{height:100%;object-fit:cover;position:relative;z-index:1}
/* 이미지 최대 폭 지정(fit) — 가운데 정렬 + 원본 비율(꽉 채우지 않음) */
.llx .slide.imgslide.fit{align-items:center;justify-content:center;padding:20px 16px}
.llx .slide.imgslide.fit .slide-imglink{width:100%;margin:0 auto}
.llx .slide.imgslide.fit .slide-img{height:auto;max-height:clamp(320px,40vw,500px);object-fit:contain;margin:0 auto}
.llx .slide-html{position:relative;z-index:1;width:100%;align-self:center;color:var(--hero-ink)}
.llx .slide h1{font-size:clamp(32px,4.4vw,52px);font-weight:900;line-height:1.09;letter-spacing:-.035em;text-wrap:balance;margin:16px 0 18px}
.llx .slide h1 .hl{color:var(--gilt-soft)}
.llx .slide .sub{color:var(--hero-soft);font-size:clamp(15px,1.5vw,17px);max-width:34ch;line-height:1.75}
.llx .slide .cta{display:flex;gap:12px;margin:28px 0 24px;flex-wrap:wrap}
.llx .trust{display:flex;gap:22px;flex-wrap:wrap;border-top:1px solid rgba(238,242,251,.14);padding-top:20px}
.llx .trust .t{display:flex;flex-direction:column;gap:2px}
.llx .trust .n{font-size:22px;font-weight:900;color:#fff}
.llx .trust .n .u{font-size:13px;color:var(--gilt-soft);font-weight:800;margin-left:1px}
.llx .trust .l{font-size:12px;color:var(--hero-soft)}
.llx .cnav{position:absolute;top:50%;transform:translateY(-50%);z-index:4;width:42px;height:42px;border-radius:50%;border:1px solid rgba(238,242,251,.24);background:rgba(14,29,56,.42);color:var(--hero-ink);font-size:22px;cursor:pointer;display:grid;place-items:center;backdrop-filter:blur(6px);transition:background .15s,transform .15s}
.llx .cnav:hover{background:rgba(154,117,38,.5);transform:translateY(-50%) scale(1.06)}
.llx .cnav.prev{left:16px}.llx .cnav.next{right:16px}
.llx .dots{position:absolute;bottom:22px;left:50%;transform:translateX(-50%);z-index:4;display:flex;gap:8px}
.llx .dots button{width:9px;height:9px;padding:0;border-radius:99px;border:0;background:rgba(238,242,251,.34);cursor:pointer;transition:width .25s,background .25s}
.llx .dots button.on{background:var(--gilt-soft);width:26px}
/* hero right cards */
.llx .hcard{background:linear-gradient(160deg,rgba(255,255,255,.1),rgba(255,255,255,.03));border:1px solid rgba(238,242,251,.16);border-radius:16px;padding:18px;backdrop-filter:blur(6px);box-shadow:0 30px 60px -30px rgba(0,0,0,.6)}
.llx .hcard .hh{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.llx .hcard .lab{font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:var(--gilt-soft)}
.llx .hcard .live{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--hero-soft);font-weight:700}
.llx .hcard .dot{width:7px;height:7px;border-radius:50%;background:#4ade80;box-shadow:0 0 0 4px rgba(74,222,128,.18);animation:llxpulse 2s infinite}
@keyframes llxpulse{50%{box-shadow:0 0 0 7px rgba(74,222,128,0)}}
.llx .hrow{display:flex;align-items:center;gap:12px;padding:11px 4px;border-top:1px solid rgba(238,242,251,.1)}
.llx .hrow:first-of-type{border-top:0}
.llx .hrow .dday{width:52px;flex-shrink:0;text-align:center}
.llx .hrow .dday b{display:block;font-size:19px;font-weight:900;color:var(--gilt-soft);line-height:1}
.llx .hrow .dday span{font-size:10px;color:var(--hero-soft)}
.llx .hrow .mid{flex:1;min-width:0}
.llx .hrow .mid .s{font-size:14px;font-weight:800;color:#fff}
.llx .hrow .mid .m{font-size:12px;color:var(--hero-soft)}
.llx .hrow .seat{font-size:11px;font-weight:800;color:#ffd9a8;white-space:nowrap}
.llx .promo{background:linear-gradient(160deg,rgba(255,255,255,.1),rgba(255,255,255,.03));border:1px solid rgba(238,242,251,.16);border-radius:16px;padding:30px 26px;backdrop-filter:blur(6px);text-align:center;box-shadow:0 30px 60px -30px rgba(0,0,0,.6)}
.llx .promo .pk{font-size:11px;font-weight:800;letter-spacing:.2em;color:var(--gilt-soft)}
.llx .promo .pbig{font-size:clamp(56px,8vw,78px);font-weight:900;line-height:1;color:#fff;letter-spacing:-.04em;margin:12px 0}
.llx .promo .pbig span{font-size:.34em;color:var(--gilt-soft);margin-left:4px;font-weight:800}
.llx .promo p{color:var(--hero-soft);font-size:14px;margin-bottom:20px;line-height:1.6}
.llx .pbadges{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:16px 0 20px}
.llx .pbadges span{font-size:12px;font-weight:800;color:#fff;background:rgba(74,222,128,.16);border:1px solid rgba(74,222,128,.32);padding:6px 11px;border-radius:99px}

/* 히어로 아래 추가 단(2·3단) 배너 */
.llx .btier{padding:22px 0 0}
.llx .btier:first-of-type{padding-top:26px}
.llx .bt-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px}
.llx .bt-grid.one{grid-template-columns:1fr}
.llx .bt-block{border-radius:16px;overflow:hidden;box-shadow:var(--lshadow)}
.llx .bt-imglink{display:block;transition:transform .18s}
.llx .bt-imglink:hover{transform:translateY(-3px)}
.llx .bt-img{display:block;width:100%;height:auto}
.llx .bt-html{background:var(--lsurface);border:1px solid var(--line);padding:0}
.llx .bt-card{background:linear-gradient(158deg,var(--navy),var(--navy2));color:var(--hero-ink);padding:26px 24px;display:flex;flex-direction:column;gap:10px;align-items:flex-start;position:relative;overflow:hidden}
.llx .bt-card.blue{background:linear-gradient(158deg,#2d5ba8,#1c3f75)}
.llx .bt-card::after{content:"";position:absolute;inset:0;background:radial-gradient(90% 90% at 92% 0,rgba(154,117,38,.26),transparent 55%);pointer-events:none}
.llx .bt-card>*{position:relative;z-index:1}
.llx .bt-card .bt-eye{font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:var(--gilt-soft)}
.llx .bt-card h3{font-size:20px;font-weight:900;line-height:1.3}
.llx .bt-card p{font-size:14px;color:var(--hero-soft);line-height:1.6}

/* section frame */
.llx .band{padding:70px 0}
.llx .band.tint{background:var(--lsurface);border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.llx .shead{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:28px}
.llx .shead h2{font-size:clamp(23px,2.6vw,31px);font-weight:900;letter-spacing:-.03em;margin-top:8px;text-wrap:balance}
.llx .shead p{color:var(--soft);font-size:14.5px;margin-top:8px;max-width:52ch}
.llx .more{color:var(--blue-ink);font-weight:800;font-size:13.5px;white-space:nowrap}
.llx .more:hover{text-decoration:underline}

/* schedule strip */
.llx .strip{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
.llx .sc{background:var(--lsurface);border:1px solid var(--line);border-radius:15px;padding:18px;box-shadow:var(--lshadow);display:flex;flex-direction:column;gap:11px;position:relative;overflow:hidden}
/* 레일 안에서는 고정폭 카드(Rail cardWidth=252 과 일치), 약간 축소 */
.llx .irailtrack .sc{flex:0 0 252px;padding:15px;gap:9px;text-decoration:none;color:inherit;transition:transform .2s,border-color .2s}
.llx .irailtrack .sc h3{font-size:16px}
.llx .irailtrack .sc:hover{transform:translateY(-4px);border-color:var(--line2)}
.llx .sc .tag{position:absolute;top:0;right:0;font-size:11px;font-weight:800;color:#fff;padding:4px 11px;border-bottom-left-radius:10px}
.llx .sc .tag.soon{background:var(--hot)}.llx .sc .tag.open{background:var(--blue)}.llx .sc .tag.waitlist{background:var(--warn)}.llx .sc .tag.closed{background:var(--faint)}
.llx .sc .subj{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:800;color:var(--gilt);letter-spacing:.04em}
.llx .sc h3{font-size:17px;font-weight:900;letter-spacing:-.02em}
.llx .sc .tutor{font-size:13px;color:var(--soft);font-weight:600}
.llx .sc .meta{display:flex;flex-direction:column;gap:5px;font-size:12.5px;color:var(--soft);margin-top:2px}
.llx .sc .meta div{display:flex;gap:8px}
.llx .sc .meta .k{color:var(--faint);width:44px;flex-shrink:0}
.llx .sc .meta .v{font-weight:700;color:var(--ink)}
.llx .gauge{height:7px;border-radius:99px;background:var(--line);overflow:hidden}
.llx .gauge i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--gilt-2),var(--gilt))}
.llx .sc .foot{display:flex;align-items:center;justify-content:space-between;margin-top:auto}
.llx .sc .seatn{font-size:12px;font-weight:800}
.llx .sc .seatn.low{color:var(--hot)}.llx .sc .seatn.mid{color:var(--warn)}.llx .sc .seatn.ok{color:var(--ok)}
.llx .sc .ddayb{font-size:12px;font-weight:900;color:var(--gilt);background:var(--blue-wash);padding:3px 9px;border-radius:7px}

/* instructors */
.llx .igroup{margin-bottom:24px}
/* 강사 레일 — 한 명씩 넘기는 캐러셀. 스크롤바 없음, 카드 잘림 없음, 화살표 상시 노출 */
.llx .irailwrap{position:relative}
.llx .irailview{overflow:hidden;margin:0 auto}
.llx .irailtrack{display:flex;gap:16px;transition:transform .45s cubic-bezier(.4,0,.2,1);will-change:transform}
.llx .irail-nav{position:absolute;top:42%;transform:translateY(-50%);z-index:3;width:44px;height:44px;border-radius:50%;border:1px solid var(--line2);background:var(--lsurface);color:var(--ink);font-size:26px;line-height:1;cursor:pointer;display:grid;place-items:center;box-shadow:0 10px 26px -12px rgba(22,41,74,.5);transition:transform .15s,background .15s,color .15s,opacity .15s}
.llx .irail-nav:hover:not(:disabled){background:var(--navy);color:var(--hero-ink);border-color:var(--navy);transform:translateY(-50%) scale(1.06)}
.llx .irail-nav:disabled{opacity:.32;cursor:default}
.llx .irail-nav.prev{left:2px}
.llx .irail-nav.next{right:2px}
.llx .ihd{display:flex;align-items:baseline;gap:12px;margin-bottom:14px;padding-bottom:9px;border-bottom:1px solid var(--line)}
.llx .ihd .kr{font-size:17px;font-weight:900}
.llx .ihd .en{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--faint);font-weight:800}
/* 대형 인물 사진 세로 카드(고정 폭 186 — 페이지 계산 기준). 금박 오버레이 프레임 제거. */
.llx .ic{flex:0 0 186px;width:186px;display:flex;flex-direction:column;text-decoration:none;color:inherit;background:var(--lsurface);border:1px solid var(--line);border-radius:15px;overflow:hidden;box-shadow:var(--lshadow);transition:transform .2s,border-color .2s}
.llx .ic:hover{transform:translateY(-4px);border-color:var(--line2)}
.llx .ic .por{width:100%;aspect-ratio:4/5;position:relative;display:grid;place-items:center;overflow:hidden;background:linear-gradient(150deg,var(--navy-soft),var(--navy2))}
.llx .ic .por b{color:rgba(238,242,251,.94);font-size:46px;font-weight:800}
.llx .ic .por img{width:100%;height:100%;object-fit:cover;transition:transform .5s cubic-bezier(.2,.7,.2,1)}
.llx .ic:hover .por img{transform:scale(1.04)}
.llx .ic .icb{padding:13px 14px 16px;display:flex;flex-direction:column;gap:6px}
.llx .ic .nm{font-size:16.5px;font-weight:900}
.llx .ic .role{align-self:flex-start;font-size:11px;font-weight:800;color:var(--blue-ink);background:var(--blue-wash);padding:3px 9px;border-radius:6px}
.llx .ic .cap{font-size:12px;color:var(--soft);line-height:1.5}

/* tiers */
.llx .tiers{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
.llx .tier{background:var(--lsurface);border:1px solid var(--line);border-radius:16px;padding:24px;display:flex;flex-direction:column;gap:13px;box-shadow:var(--lshadow)}
.llx .tier.feat{border:1.5px solid var(--gilt-soft);position:relative}
.llx .tier.feat::before{content:"추천";position:absolute;top:-11px;left:24px;background:linear-gradient(145deg,var(--gilt-2),var(--gilt));color:#fff;font-size:11px;font-weight:800;padding:3px 11px;border-radius:99px}
.llx .tier .tn{font-size:13px;font-weight:800;letter-spacing:.04em;color:var(--gilt)}
.llx .tier .price{font-size:26px;font-weight:900;letter-spacing:-.03em}
.llx .tier .price .u{font-size:14px;font-weight:700;color:var(--faint)}
.llx .tier .desc{font-size:13.5px;color:var(--soft);line-height:1.7}
.llx .tier ul{list-style:none;margin:4px 0 0;padding:0;display:flex;flex-direction:column;gap:9px}
.llx .tier li{font-size:13.5px;color:var(--ink);display:flex;gap:9px;align-items:flex-start}
.llx .tier li .ck{color:var(--blue);font-weight:900;flex-shrink:0}
.llx .tier .btn{margin-top:auto;justify-content:center}

/* reviews */
.llx .revs{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.llx .rev{background:var(--lsurface);border:1px solid var(--line);border-radius:14px;padding:20px;display:flex;flex-direction:column;gap:12px}
.llx .rev .q{font-size:14.5px;line-height:1.75;color:var(--ink);font-weight:500}
.llx .rev .q .mk{background:linear-gradient(transparent 62%,rgba(201,164,78,.35) 0);font-weight:800}
.llx .rev .who{display:flex;align-items:center;gap:10px;margin-top:auto;border-top:1px solid var(--line);padding-top:12px}
.llx .rev .av{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;color:#fff;font-weight:800;font-size:13px;background:linear-gradient(145deg,var(--blue),var(--navy-soft))}
.llx .rev .who .nm{font-size:13px;font-weight:800}
.llx .rev .who .mt{font-size:11.5px;color:var(--faint)}
.llx .rev .badge{display:inline-flex;align-items:center;gap:5px;align-self:flex-start;font-size:11px;font-weight:800;color:var(--ok);background:color-mix(in srgb,var(--ok) 12%,transparent);padding:3px 9px;border-radius:99px}

/* news */
.llx .newswrap{display:grid;grid-template-columns:1.3fr .7fr;gap:26px;align-items:start}
.llx .newslist{display:flex;flex-direction:column}
.llx .nrow{display:flex;align-items:center;gap:14px;padding:15px 6px;border-top:1px solid var(--line)}
.llx .nrow:first-child{border-top:0}
.llx .nrow:hover .nt{color:var(--blue-ink)}
.llx .chip{font-size:11px;font-weight:800;padding:3px 9px;border-radius:6px;white-space:nowrap;flex-shrink:0}
.llx .chip.notice{background:var(--blue-wash);color:var(--blue-ink)}
.llx .chip.event{background:color-mix(in srgb,var(--gilt) 15%,transparent);color:var(--gilt)}
.llx .chip.passer{background:color-mix(in srgb,var(--ok) 14%,transparent);color:var(--ok)}
.llx .nrow .nt{font-size:14.5px;font-weight:700;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.llx .nrow .nd{font-size:12px;color:var(--faint)}
.llx .eventcard{background:linear-gradient(158deg,var(--navy),var(--navy2));color:var(--hero-ink);border-radius:16px;padding:24px;position:relative;overflow:hidden}
.llx .eventcard::after{content:"";position:absolute;inset:0;background:radial-gradient(90% 90% at 90% 0,rgba(154,117,38,.28),transparent 55%)}
.llx .eventcard .in{position:relative;z-index:1}
.llx .eventcard .k{font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:var(--gilt-soft)}
.llx .eventcard h3{font-size:21px;font-weight:900;margin:10px 0;line-height:1.3}
.llx .eventcard p{font-size:13px;color:var(--hero-soft);margin-bottom:16px}

/* books */
.llx .books{display:grid;grid-template-columns:repeat(6,1fr);gap:16px}
.llx .bk{display:flex;flex-direction:column;gap:9px}
.llx .bk .cov{aspect-ratio:3/4;border-radius:5px;position:relative;overflow:hidden;display:flex;align-items:flex-end;padding:12px;border:1px solid var(--line);background:linear-gradient(155deg,var(--blue),var(--navy));box-shadow:0 12px 22px -14px rgba(22,41,74,.5);transition:transform .22s}
.llx .bk:nth-child(3n+2) .cov{background:linear-gradient(155deg,#3a6098,#24406e)}
.llx .bk:nth-child(3n) .cov{background:linear-gradient(155deg,#6b7183,#3a4358)}
.llx .bk .cov::before{content:"";position:absolute;left:0;top:0;bottom:0;width:6px;background:rgba(0,0,0,.18)}
.llx .bk:hover .cov{transform:translateY(-4px)}
.llx .bk .bt{position:relative;color:#fff;font-size:13px;font-weight:800;line-height:1.3}
.llx .bk .cov .bkimg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:1}
.llx .bk .bkt{margin-top:8px;font-size:12.5px;font-weight:700;color:var(--ink);text-align:center;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.llx .bk .cap{font-size:12px;font-weight:800;color:var(--blue-ink);text-align:center}

/* faq */
.llx .faq{max-width:820px;margin:0 auto;display:flex;flex-direction:column;gap:10px}
.llx details.qa{background:var(--lsurface);border:1px solid var(--line);border-radius:12px;padding:2px 18px}
.llx details.qa summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:12px;padding:16px 0;font-weight:800;font-size:15px}
.llx details.qa summary::-webkit-details-marker{display:none}
.llx details.qa summary .q{color:var(--gilt);font-weight:900;flex-shrink:0}
.llx details.qa summary .ar{margin-left:auto;color:var(--faint);transition:transform .2s}
.llx details.qa[open] summary .ar{transform:rotate(180deg)}
.llx details.qa summary .qt{flex:1;min-width:0}
.llx details.qa .a{font-size:14px;color:var(--soft);line-height:1.8;padding:0 0 18px 30px;white-space:pre-wrap}
/* faq — 분류 가로 탭(support_faqs) */
.llx .faqhint{margin-inline:auto;white-space:nowrap}
.llx .faqx{max-width:860px;margin:0 auto}
.llx .faxtabs{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-bottom:18px}
.llx .faxtab{display:inline-flex;align-items:center;gap:7px;padding:9px 16px;border-radius:999px;border:1px solid var(--line2);background:var(--lsurface);color:var(--soft);font-weight:800;font-size:13.5px;cursor:pointer;transition:border-color .15s,color .15s,background .15s,box-shadow .15s}
.llx .faxtab:hover{border-color:var(--gilt-soft);color:var(--ink)}
.llx .faxtab .c{font-size:11px;font-weight:800;color:var(--faint);background:var(--lground);border-radius:999px;padding:1px 7px;min-width:20px;text-align:center}
.llx .faxtab.on{background:linear-gradient(158deg,var(--navy),var(--navy2));color:#fff;border-color:transparent;box-shadow:0 12px 24px -14px rgba(22,41,74,.6)}
.llx .faxtab.on .c{background:rgba(255,255,255,.16);color:var(--gilt-soft)}
.llx .faxlist{display:flex;flex-direction:column;gap:10px}

/* final */
.llx .final{background:linear-gradient(158deg,var(--navy),var(--navy2));color:var(--hero-ink);position:relative;overflow:hidden}
.llx .final::after{content:"";position:absolute;inset:0;background:radial-gradient(80% 120% at 15% 100%,rgba(154,117,38,.2),transparent 55%)}
.llx .final-in{position:relative;z-index:1;display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:center;padding:60px 0}
.llx .final h2{font-size:clamp(25px,2.8vw,34px);font-weight:900;letter-spacing:-.03em;line-height:1.2;text-wrap:balance}
.llx .final p{color:var(--hero-soft);margin:14px 0 22px;font-size:15px;line-height:1.7}
.llx .loc{background:rgba(255,255,255,.06);border:1px solid rgba(238,242,251,.16);border-radius:14px;padding:20px}
.llx .loc .li{display:flex;gap:10px;padding:10px 0;border-top:1px solid rgba(238,242,251,.1);font-size:13.5px}
.llx .loc .li:first-child{border-top:0}
.llx .loc .li .k{color:var(--gilt-soft);font-weight:800;width:64px;flex-shrink:0}
.llx .loc .li .v{color:#fff}

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
