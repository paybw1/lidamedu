// feat-6-012 강사소개 공개 화면 공유 스타일 — 로고 청(#0868B8) 디자인 토큰.
// 팔레트 SSOT = docs/lecture-palette-brief.md §2·§9(C8). 값은 강의 표면 .llx(landing-style.tsx)와 같은 hex 를
// 직접 기입한다(app.css 의 전역 프리미엄 토큰 참조 0 — 그 토큰은 수료증 인쇄 전용으로만 남는다). 금 토큰 없음.
// 앱 다크모드는 .dark 클래스 기반이므로 .dark .instr 로 오버라이드 — 라이트에 있는 색 토큰은 다크에도 빠짐없이.
// 모든 클래스는 .instr 하위 스코프.
// 폰트: 공식 폰트 Pretendard 로 통일(과거 명조 시안 → 사용자 요청으로 전면 교체).
// var(--i-serif)/class i-serif 이름은 유지하되 값은 Pretendard.
export const SERIF =
  '"Pretendard Variable","Pretendard","Apple SD Gothic Neo",system-ui,sans-serif';

export function InstructorStyle() {
  return (
    <style>{`
.instr {
  --i-ground:#f4f7fa; --i-surface:#ffffff; --i-ink:#14212f; --i-soft:#46556a; --i-faint:#5f6d87;
  --i-line:#e0e7ef; --i-line2:#cdd8e4; --i-navy:#0868b8; --i-navy2:#0a4d8c;
  --i-blue:#0868b8; --i-bluefg:#ffffff; --i-blueink:#0a5a9e;
  --i-heroink:#f5f9fe; --i-herosoft:#dfecf9;
  --i-serif:${SERIF};
  background:var(--i-ground); color:var(--i-ink);
}
.dark .instr {
  --i-ground:#0f141b; --i-surface:#151b25; --i-ink:#e6ebf2; --i-soft:#a9b3c4; --i-faint:#7f8a9c;
  --i-line:#232f3d; --i-line2:#303f52; --i-navy:#0a5798; --i-navy2:#073f70;
  --i-blue:#4d9fe6; --i-bluefg:#0b1a2b; --i-blueink:#78b8f0;
  --i-heroink:#f2f7fd; --i-herosoft:#c6dbf2;
}
.instr .i-serif{font-family:var(--i-serif);}
.instr .i-wrap{width:100%;max-width:920px;margin:0 auto;padding:0 24px;}
.instr .i-hero{position:relative;overflow:hidden;color:var(--i-heroink);
  background:linear-gradient(160deg,var(--i-navy),var(--i-navy2));}
.instr .i-hero::after{content:"";position:absolute;inset:0;background-image:linear-gradient(var(--i-herosoft) 1px,transparent 1px);background-size:100% 34px;opacity:.05;}
.instr .i-eyebrow{font-size:12px;letter-spacing:.28em;text-transform:uppercase;color:var(--i-herosoft);font-weight:700;margin:0 0 16px;}
.instr .i-mono{aspect-ratio:3/4;border-radius:4px;display:flex;align-items:center;justify-content:center;position:relative;
  background:linear-gradient(150deg,var(--i-navy),var(--i-navy2));border:1px solid color-mix(in srgb,var(--i-heroink) 18%,transparent);}
.instr .i-mono .fr{position:absolute;inset:8px;border:1px solid color-mix(in srgb,var(--i-herosoft) 45%,transparent);border-radius:2px;}
.instr .i-mono span{font-family:var(--i-serif);color:color-mix(in srgb,var(--i-heroink) 92%,transparent);}
.instr .i-metric{padding:24px 18px;text-align:center;border-left:1px solid var(--i-line);}
.instr .i-metric:first-child{border-left:0;}
/* 지표 숫자 = 경력 지표(성취 아님) → 청 잉크 */
.instr .i-num{font-family:var(--i-serif);font-variant-numeric:tabular-nums;font-size:32px;line-height:1;color:var(--i-blueink);font-weight:700;}
.instr .i-num .u{font-size:16px;}
.instr .i-mlab{margin-top:8px;font-size:12.5px;color:var(--i-faint);}
.instr .i-sec{padding:52px 0;border-bottom:1px solid var(--i-line);}
.instr .i-sechead{display:flex;align-items:baseline;gap:13px;margin:0 0 24px;}
.instr .i-sechead .kr{font-family:var(--i-serif);font-size:24px;font-weight:700;margin:0;}
.instr .i-sechead .en{font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--i-faint);font-weight:700;}
.instr .i-h3{font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--i-blueink);font-weight:700;margin:0 0 14px;padding-bottom:8px;border-bottom:1px solid var(--i-line);}
.instr .i-tl{list-style:none;margin:0;padding:0;}
.instr .i-tl li{position:relative;padding:0 0 14px 20px;font-size:15px;color:var(--i-soft);}
.instr .i-tl li::before{content:"";position:absolute;left:0;top:9px;width:7px;height:7px;border-radius:50%;background:var(--i-blue);box-shadow:0 0 0 3px color-mix(in srgb,var(--i-blue) 18%,transparent);}
.instr .i-tl li strong{color:var(--i-ink);font-weight:600;}
.instr .i-books{display:grid;grid-template-columns:repeat(auto-fill,minmax(116px,1fr));gap:16px;}
.instr .i-book .cov{aspect-ratio:3/4;border-radius:3px;position:relative;overflow:hidden;display:flex;align-items:flex-end;padding:11px;border:1px solid var(--i-line);
  background:linear-gradient(155deg,var(--i-navy),var(--i-navy2));box-shadow:0 10px 20px -12px rgba(8,104,184,.5);transition:transform .25s;}
/* 표지 위 제목(.bt)은 heroink — 시작점을 --i-blue 로 두면 다크(#4d9fe6)에서 2.6 으로 미달해 --i-navy 계열만 쓴다(3n+2 는 역순). */
.instr .i-book:nth-child(3n+2) .cov{background:linear-gradient(155deg,var(--i-navy2),var(--i-navy));}
/* 중립 회색 변형 — 시작점 #6b7b93 은 heroink 4.07 로 미달 → #5a6a82(5.20/5.11) */
.instr .i-book:nth-child(3n+3) .cov{background:linear-gradient(155deg,#5a6a82,#3c4a63);}
.instr .i-book .cov::before{content:"";position:absolute;left:0;top:0;bottom:0;width:7px;background:rgba(0,0,0,.18);}
.instr .i-book .bt{font-family:var(--i-serif);color:var(--i-heroink);font-size:13.5px;line-height:1.3;font-weight:600;position:relative;}
.instr .i-book:hover .cov{transform:translateY(-4px);}
.instr .i-book .cap{margin-top:8px;font-size:12px;color:var(--i-soft);text-align:center;}
.instr .i-pull{font-family:var(--i-serif);font-size:clamp(19px,2.6vw,25px);line-height:1.5;color:var(--i-ink);margin:0 0 20px;text-wrap:balance;word-break:keep-all;}
.instr .i-pull .hl{color:var(--i-blueink);}
.instr .i-btn{display:inline-flex;align-items:center;gap:8px;padding:13px 26px;border-radius:8px;font-weight:700;font-size:15px;text-decoration:none;transition:transform .15s;}
.instr .i-btn.primary{background:var(--i-blue);color:var(--i-bluefg);}
.instr .i-btn.ghost{background:transparent;color:var(--i-ink);border:1px solid var(--i-line2);}
.instr .i-btn:hover{transform:translateY(-2px);}
/* list */
/* 사진 중심 세로 카드 — 인물 사진을 크게(4/5) 앞세운다. */
.instr .i-card{display:flex;flex-direction:column;text-decoration:none;color:inherit;background:var(--i-surface);border:1px solid var(--i-line);border-radius:16px;overflow:hidden;transition:transform .2s,border-color .2s,box-shadow .2s;}
.instr .i-card:hover{transform:translateY(-4px);border-color:var(--i-line2);box-shadow:0 22px 42px -22px rgba(8,104,184,.45);}
.instr .i-photo{position:relative;aspect-ratio:4/5;overflow:hidden;background:linear-gradient(150deg,var(--i-navy),var(--i-navy2));}
.instr .i-photo img{width:100%;height:100%;object-fit:cover;transition:transform .5s cubic-bezier(.2,.7,.2,1);}
.instr .i-card:hover .i-photo img{transform:scale(1.045);}
.instr .i-phf{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;}
.instr .i-phf::before{content:"";position:absolute;inset:14px;border:1px solid color-mix(in srgb,var(--i-herosoft) 45%,transparent);border-radius:6px;}
.instr .i-phf span{font-family:var(--i-serif);font-size:clamp(44px,7vw,60px);color:color-mix(in srgb,var(--i-heroink) 92%,transparent);}
.instr .i-cbody{padding:15px 16px 18px;}
.instr .i-cnm{font-family:var(--i-serif);font-size:21px;font-weight:700;line-height:1.15;}
.instr .i-cmeta{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:10px;}
.instr .i-subj{font-size:11.5px;font-weight:700;color:var(--i-blueink);background:color-mix(in srgb,var(--i-blue) 12%,transparent);padding:4px 9px;border-radius:6px;}
.instr .i-role{font-size:12.5px;color:var(--i-faint);}
.instr .i-grouphead{display:flex;align-items:baseline;gap:12px;margin:0 0 18px;padding-bottom:10px;border-bottom:1px solid var(--i-line);}
.instr .i-grouphead .kr{font-family:var(--i-serif);font-size:19px;font-weight:700;margin:0;}
.instr .i-grouphead .en{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--i-faint);font-weight:700;}
.instr .i-grouphead .ct{margin-left:auto;font-size:12px;color:var(--i-faint);}
.instr .i-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:20px;}
@media (max-width:760px){
  .instr .i-heroinner{grid-template-columns:1fr!important;}
  .instr .i-cred{grid-template-columns:1fr!important;}
}
`}</style>
  );
}
