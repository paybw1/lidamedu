// feat-6-012 강사소개 공개 화면 공유 스타일 — 딥네이비·금박 디자인 토큰.
// 앱 다크모드는 .dark 클래스 기반이므로 .dark .instr 로 오버라이드. 모든 클래스는 .instr 하위 스코프.
// 폰트: 공식 폰트 Pretendard 로 통일(과거 명조 시안 → 사용자 요청으로 전면 교체).
// var(--i-serif)/class i-serif 이름은 유지하되 값은 Pretendard.
export const SERIF =
  '"Pretendard Variable","Pretendard","Apple SD Gothic Neo",system-ui,sans-serif';

export function InstructorStyle() {
  return (
    <style>{`
.instr {
  --i-ground:#f5f6fb; --i-surface:#fff; --i-ink:#171b24; --i-soft:#4b5265; --i-faint:#79839a;
  --i-line:#dfe3ee; --i-line2:#cdd3e2; --i-navy:#22406e; --i-navy2:#1a2f52;
  --i-blue:#2d5ba8; --i-blueink:#274e8f; --i-gilt:#977224; --i-gilts:#b08a35;
  --i-heroink:#eef2fb; --i-herosoft:#aebbd6;
  --i-serif:${SERIF};
  background:var(--i-ground); color:var(--i-ink);
}
.dark .instr {
  --i-ground:#0f131b; --i-surface:#161b25; --i-ink:#e8ebf3; --i-soft:#aab2c6; --i-faint:#7c8398;
  --i-line:#262d3c; --i-line2:#333c4f; --i-navy:#0e1a30; --i-navy2:#0a1424;
  --i-blue:#6a97da; --i-blueink:#84a8e0; --i-gilt:#c9a44e; --i-gilts:#d8b968;
  --i-heroink:#eef2fb; --i-herosoft:#9fb0cf;
}
.instr .i-serif{font-family:var(--i-serif);}
.instr .i-wrap{width:100%;max-width:920px;margin:0 auto;padding:0 24px;}
.instr .i-hero{position:relative;overflow:hidden;color:var(--i-heroink);
  background:radial-gradient(120% 120% at 85% -10%,rgba(151,114,36,.16),transparent 55%),linear-gradient(160deg,var(--i-navy),var(--i-navy2));}
.instr .i-hero::after{content:"";position:absolute;inset:0;background-image:linear-gradient(var(--i-herosoft) 1px,transparent 1px);background-size:100% 34px;opacity:.05;}
.instr .i-eyebrow{font-size:12px;letter-spacing:.28em;text-transform:uppercase;color:var(--i-gilts);font-weight:700;margin:0 0 16px;}
.instr .i-mono{aspect-ratio:3/4;border-radius:4px;display:flex;align-items:center;justify-content:center;position:relative;
  background:linear-gradient(150deg,#2c4a7a,#1c3358);border:1px solid rgba(238,242,251,.18);}
.instr .i-mono .fr{position:absolute;inset:8px;border:1px solid rgba(201,164,78,.45);border-radius:2px;}
.instr .i-mono span{font-family:var(--i-serif);color:rgba(238,242,251,.92);}
.instr .i-metric{padding:24px 18px;text-align:center;border-left:1px solid var(--i-line);}
.instr .i-metric:first-child{border-left:0;}
.instr .i-num{font-family:var(--i-serif);font-variant-numeric:tabular-nums;font-size:32px;line-height:1;color:var(--i-gilt);font-weight:700;}
.instr .i-num .u{font-size:16px;}
.instr .i-mlab{margin-top:8px;font-size:12.5px;color:var(--i-faint);}
.instr .i-sec{padding:52px 0;border-bottom:1px solid var(--i-line);}
.instr .i-sechead{display:flex;align-items:baseline;gap:13px;margin:0 0 24px;}
.instr .i-sechead .kr{font-family:var(--i-serif);font-size:24px;font-weight:700;margin:0;}
.instr .i-sechead .en{font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--i-faint);font-weight:700;}
.instr .i-h3{font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--i-gilt);font-weight:700;margin:0 0 14px;padding-bottom:8px;border-bottom:1px solid var(--i-line);}
.instr .i-tl{list-style:none;margin:0;padding:0;}
.instr .i-tl li{position:relative;padding:0 0 14px 20px;font-size:15px;color:var(--i-soft);}
.instr .i-tl li::before{content:"";position:absolute;left:0;top:9px;width:7px;height:7px;border-radius:50%;background:var(--i-blue);box-shadow:0 0 0 3px color-mix(in srgb,var(--i-blue) 18%,transparent);}
.instr .i-tl li strong{color:var(--i-ink);font-weight:600;}
.instr .i-books{display:grid;grid-template-columns:repeat(auto-fill,minmax(116px,1fr));gap:16px;}
.instr .i-book .cov{aspect-ratio:3/4;border-radius:3px;position:relative;overflow:hidden;display:flex;align-items:flex-end;padding:11px;border:1px solid var(--i-line);
  background:linear-gradient(155deg,var(--i-blue),var(--i-navy));box-shadow:0 10px 20px -12px rgba(34,64,110,.5);transition:transform .25s;}
.instr .i-book:nth-child(3n+2) .cov{background:linear-gradient(155deg,#3a6098,#24406e);}
.instr .i-book:nth-child(3n+3) .cov{background:linear-gradient(155deg,#6b7b93,#3c4a63);}
.instr .i-book .cov::before{content:"";position:absolute;left:0;top:0;bottom:0;width:7px;background:rgba(0,0,0,.18);}
.instr .i-book .bt{font-family:var(--i-serif);color:#fff;font-size:13.5px;line-height:1.3;font-weight:600;position:relative;}
.instr .i-book:hover .cov{transform:translateY(-4px);}
.instr .i-book .cap{margin-top:8px;font-size:12px;color:var(--i-soft);text-align:center;}
.instr .i-pull{font-family:var(--i-serif);font-size:clamp(19px,2.6vw,25px);line-height:1.5;color:var(--i-ink);margin:0 0 20px;text-wrap:balance;}
.instr .i-pull .hl{color:var(--i-blueink);}
.instr .i-btn{display:inline-flex;align-items:center;gap:8px;padding:13px 26px;border-radius:8px;font-weight:700;font-size:15px;text-decoration:none;transition:transform .15s;}
.instr .i-btn.primary{background:var(--i-blue);color:#fff;}
.instr .i-btn.ghost{background:transparent;color:var(--i-ink);border:1px solid var(--i-line2);}
.instr .i-btn:hover{transform:translateY(-2px);}
/* list */
.instr .i-card{display:flex;gap:15px;align-items:center;text-decoration:none;color:inherit;background:var(--i-surface);border:1px solid var(--i-line);border-radius:12px;padding:16px;transition:transform .2s,border-color .2s,box-shadow .2s;}
.instr .i-card:hover{transform:translateY(-3px);border-color:var(--i-line2);box-shadow:0 16px 30px -18px rgba(34,64,110,.4);}
.instr .i-card:hover .i-cmono{border-color:var(--i-gilts);}
.instr .i-cmono{width:66px;height:84px;flex-shrink:0;border-radius:5px;position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden;background:linear-gradient(150deg,#2c4a7a,#1a3054);border:1px solid rgba(238,242,251,.2);transition:border-color .2s;}
.instr .i-cmono .fr{position:absolute;inset:5px;border:1px solid rgba(201,164,78,.4);border-radius:3px;}
.instr .i-cmono .m{font-family:var(--i-serif);font-size:30px;color:rgba(238,242,251,.92);}
.instr .i-cmono img{width:100%;height:100%;object-fit:cover;}
.instr .i-cnm{font-family:var(--i-serif);font-size:20px;font-weight:700;line-height:1.15;}
.instr .i-subj{display:inline-block;margin:6px 0 8px;font-size:11.5px;font-weight:700;color:var(--i-blueink);background:color-mix(in srgb,var(--i-blue) 12%,transparent);padding:3px 8px;border-radius:5px;}
.instr .i-cr{font-size:12.5px;color:var(--i-soft);line-height:1.5;}
.instr .i-grouphead{display:flex;align-items:baseline;gap:12px;margin:0 0 18px;padding-bottom:10px;border-bottom:1px solid var(--i-line);}
.instr .i-grouphead .kr{font-family:var(--i-serif);font-size:19px;font-weight:700;margin:0;}
.instr .i-grouphead .en{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--i-faint);font-weight:700;}
.instr .i-grouphead .ct{margin-left:auto;font-size:12px;color:var(--i-faint);}
.instr .i-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:16px;}
@media (max-width:760px){
  .instr .i-heroinner{grid-template-columns:1fr!important;}
  .instr .i-cred{grid-template-columns:1fr!important;}
}
`}</style>
  );
}
