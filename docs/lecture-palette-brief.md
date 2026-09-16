# 강의 표면 팔레트 전환 — 로고 청 (디자인 C 실행 설계)

> **결정(2026-09-16, 원장)**: 팔레트 검토안 2의 **D 로고 청** 채택. 성취 배지는 자수정 대신 **저채도 금 워시 1곳**. 이 문서가 C 단계(`.llx` 토큰 재정의)의 실행 SSOT 다. 앞 단계 A(영어 템플릿 습관 제거)·B(타이포 스케일 통일)는 커밋·배포 완료(d9af65fe·017807e6).
> 검토안: 네이비 3안 https://claude.ai/code/artifact/638ccb9d-c10a-4e4b-8611-7b1f53009fa1 · 네이비 밖 6안 https://claude.ai/artifact/52sSXpid4wnkE5GvMdfQFa

## 0. 한 줄

강의 표면(`.llx` 8화면)의 브랜드 hue 를 **네이비+금박 → 로고 파랑 `#0868B8`** 로 옮기고, 금은 「성취 1곳」의 저채도 워시 배지로만 남긴다. 범위는 `.llx` 안(scope a) — 전역 `--prestige-*`(강사 테마·수료증)는 유지하되, 강의 레이아웃 아래 `/about/instructors` 3화면은 §5 에서 원장 결정.

근거: 실제 로고는 검정 워드마크 + 3색 매듭(`#0868B8`·`#E81860`·`#18A028`)이고 네이비+금박은 로고 색이 아니다. 심사 3인 평균 1위, 짙은 면 밝기 현행의 5.8배, 학습 표면(`#2d5ba8`)과 같은 계열이라 한 서비스로 읽힌다.

## 1. 실측 (2026-09-16, 읽기 전용 인벤토리)

| 항목 | 값 | 함의 |
|---|---|---|
| `var(--gilt*)` 참조 | **27곳**(`--gilt` 10 · `--gilt-2` 4 · `--gilt-soft` 13) — **성취 용도 0곳**(eyebrow·과목 라벨·D-day·프로모·탭·CTA) | 토큰만 바꾸면 성취색이 27곳으로 번진다. **금 회수 27곳 + 성취 배지 신설**은 별개 작업 |
| 실제 성취 표시 | `.chip.passer`(236) · `.rev .badge`(221, JSX `builtin-sections:380` 합격 배지)가 **`--ok`(정답색)** 사용 | 브리프 「금=성취」 위반 상태. 합격을 정답색에서 떼어낸다 |
| 158deg 네이비 그라디언트 복붙 | 8곳(`.slide` 4변형 46-49 · `.bt-card` 128 · `.eventcard` 239 · `.faxtab.on` 276 · `.final` 281) + `facilities .fc-card` 167 단색 | 유틸 1개로 수렴, 짙은 면은 4→2 |
| 하드코딩 | `#fff` 9 · `rgba(238,242,251)` 8 · 금 워시 `rgba(154,117,38)` 5 · `rgba(14,29,56)` 1 · `#c0392b` 리터럴(schedule 307·315) · Tailwind 폴백 `#b48a2f` 2(lecture-video-section 49·59) · admin-banners 197 기본 간격색 `#0e1d38` | 토큰으로 회수 |
| `.dark .llx` 누락 | `--navy`·`--navy2`·`--navy-soft`·`--gilt`·`--gilt-2`(prestige 경유로만 바뀜) · **`--ok`·`--warn`·`--hot`(진짜 고정 = 결함)** | `.llx` 가 자체 hex 를 갖는 순간 앞 5개는 직접 써야 하고, 의미색 다크값은 이번에 신설 |
| 선재 대비 결함 | `schedule.tsx:362 .seat.mid` `--warn` 텍스트 3.34 / `.faxtab .c` faint on lground 3.48 / `--faint` 흰 위 3.76(12px 이하 7곳) / 청 채움 위 `#fff` 9곳(다크 2.83~2.98) / `.eyebrow` gilt-2 3.21 | 팔레트와 별개지만 같은 파일이라 함께 고친다 |
| 사문 규칙 | `.seatn` 168-169 · `.gauge` 165-166 · `.rev .q .mk` 216 (JSX 소비처 0) | 삭제 |
| 배너 accent | `admin-banner-edit` 117-121 select 값 gilt/blue/green 이 그대로 CSS 클래스(`.slide.gilt`·`.bt-card.gilt`) | **클래스명·DB 값 rename 금지**, 색 정의만 교체, select 라벨만 「기본(청)」 |
| 범위 밖(강의 레이아웃 안) | `/about/instructors` 3화면(`instructor-theme .instr`, prestige 참조 + 금 워시 하드코딩) · 수료증 인쇄(prestige 유틸) | §5 |

## 2. 토큰 — `.llx` 라이트 / `.dark .llx`

검토안 D 의 값을 그대로 쓰되, 심사가 요구한 두 토큰(`--blue-fg`·`--warn-ink`)과 성취 3종(`--prize*`), 의미색 다크값을 신설한다. `--gilt`·`--gilt-2`·`--gilt-soft` 는 **27곳 회수 후 삭제**(폴백이 살아나지 않도록 `var(--gilt,#b48a2f)` 꼴도 함께 제거).

| 토큰 | 라이트 | 다크 | 용도 · 대비 |
|---|---|---|---|
| `--navy` | `#0868b8` | `#0a5798` | 짙은 면 시작점(= 브랜드 청). 흰 글자 5.70 / 다크 6.89 |
| `--navy2` | `#0a4d8c` | `#073f70` | 짙은 면 끝점·시설 오버레이 |
| `--navy-soft` | `#3a8fd8` | `#1e78bf` | `.ic .por`·`.rev .av` 그라디언트 |
| `--blue` | `#0868b8` | `#4d9fe6` | 버튼·링크·게이지·활성. 다크 lground 위 6.53 |
| **`--blue-fg`** (신설) | `#ffffff` | `#0b1a2b` | `--blue` 채움 위 글자. ★다크에서 흰 글자 2.83 → 잉크 6.20 |
| `--blue-ink` | `#0a5a9e` | `#78b8f0` | 텍스트용 청(라벨·eyebrow·D-day·`.more`). 흰 위 7.07 |
| `--blue-wash` | `#e6f1fb` | `#10294a` | 칩·활성 탭 배경 |
| `--ink` / `--soft` / `--faint` | `#14212f` / `#46556a` / `#65738a` | `#e6ebf2` / `#a9b3c4` / `#7f8a9c` | faint 흰 위 4.80(현 3.76 → 교정) |
| `--line` / `--line2` | `#e0e7ef` / `#cdd8e4` | `#232f3d` / `#303f52` | |
| `--lground` / `--lsurface` | `#f4f7fa` / `#ffffff` | `#0f141b` / `#151b25` | |
| `--hero-ink` / `--hero-soft` | `#f5f9fe` / `#dfecf9` | `#f2f7fd` / `#c6dbf2` | ★hero-soft 는 새 청 위 4.75(현 `#aebbd6` 는 2.95 로 미달) — 9곳 소비 |
| **`--prize`** (신설) | `#7a5c1c` | `#dcc489` | 성취 글자(합격·합격자 추천). 워시 위 6.0+ |
| **`--prize-bg`** | `#f7f0dc` | `#2a2412` | 성취 워시 배경 |
| **`--prize-line`** | `#e2d2a6` | `#6b551f` | 성취 배지 테두리 |
| **`--warn-ink`** (신설) | `#a45f10` | `#e0ae5c` | 텍스트용 경고(잔여석). 흰 위 4.97 — `--warn` 채움색은 그대로 |
| `--ok` / `--warn` / `--hot` | 현행 | **`#4fbf82` / `#e0a04a` / `#ef6b5e`** (신설) | `.dark .llx` 가 빠뜨린 다크 의미색 — 마감임박·합격 배지가 다크에서 읽히지 않던 버그 |
| `--lshadow` | `0 18px 40px -24px rgba(8,104,184,.35)` | 현행 다크 | 네이비 그림자 → 청 |

## 3. 작업 (파일 · 줄은 인벤토리 기준, 실제 적용 시 재확인)

**C1 토큰 재정의** — `landing-style.tsx:6-27`. 라이트 블록에서 `var(--prestige-*)` 참조를 끊고 §2 값 직접 기입. `.dark .llx` 에 `--navy`·`--navy2`·`--navy-soft`·`--hero-ink`·`--ok`·`--warn`·`--hot`·`--prize*`·`--blue-fg`·`--warn-ink` 추가. `app.css:125-126` 주석의 「.llx 공유」 문구 정정.

**C2 금 회수 27곳** (성취 아님 → 용도별 대체)
- eyebrow·라벨·부제 → `var(--blue-ink)`: `.eyebrow` 31 · `.vidsub` 146 · `.sc .subj` 158 · `.tier .tn` 203 · `details.qa summary .q` 264 · `.loc .li .k` 289 · exam-info 416·440·466 · schedule-detail 182 · `.bt-eye` 132 · `.hcard .lab` 92 · `.promo .pk` 106
- 짙은 면 위 강조(hero) → `var(--hero-ink)` 또는 청 하이라이트: `.slide h1 .hl` 67 · `.trust .n .u` 73 · `.dots button.on` 80 · `.hrow .dday b` 99 · `.promo .pbig span` 108
- 프로모·추천 → `var(--blue)`/`--blue-wash`: `.tier.feat` 201 테두리 · `.tier.feat::before` 202 배지(그라디언트 제거, 단색) · `.chip.event` 235 · `.faxtab:hover` 274
- CTA `.btn.gilt` 36 → **흰 배경 + `--blue-ink` 잉크 반전형**(슬랩 위 주 버튼, JSX 9곳 무변경 — 클래스명 유지). `.btn.primary` 35 의 `color:#fff` → `var(--blue-fg)`
- 게이지 → `var(--blue)`. Tailwind 폴백 `bg-[var(--gilt,#b48a2f)]`·`text-[…]`(lecture-video-section 49·59) → `var(--blue)` 로 바꾸고 폴백 제거
- 검증: `grep -c "var(--gilt" app/features/landing` = **0**

**C3 짙은 면 — 유틸 1개, 4 → 2**
- `.llx .slab { background: linear-gradient(158deg, var(--navy), var(--navy2)); color: var(--hero-ink) }` 신설. `.slide` 4변형(46-49)·`.bt-card`(128)은 그라디언트를 `.slab` 로 통일하고 금 radial(46·48·130·240·282) 삭제, `.slide.blue`(47)의 구 파랑 알파 → `rgba(58,143,216,.35)` 청 하이라이트 하나로. 클래스명 `blue/gilt/green` 유지(DB 값). `admin-banner-edit` select 라벨 「금박」→「기본(청)」
- **유지(짙게)**: 최종 CTA `.final` 281 · 학원시설 오버레이 `facilities 160`(`rgba(14,29,56)` → `rgba(10,77,140,…)`)
- **반전(밝게)**: `.eventcard` 239 → `--lsurface` 카드 + 왼쪽 4px `--blue` 바 + `--blue-wash` 키커 / `.faxtab.on` 276 → `--blue-wash` 배경 + `--blue-ink` 글자 + `--blue` 1px 테두리
- `facilities .fc-card` 167 → `var(--navy2)` 유지(사진 로딩 전 바탕이라 무해) · `.irail-nav:hover` 179 → `--blue` · `.ic .por` 189 그대로(토큰이 청으로 바뀜) · `.bk .cov` 249 → `--blue`→`--navy2`, 그림자 `--lshadow`

**C4 하드코딩 회수** — `#fff` 9곳 → 용도별 `var(--blue-fg)`(청 채움 위) / `var(--hero-ink)`(슬랩 위) / `var(--lsurface)`; `rgba(238,242,251,.x)` 8곳 → `color-mix(in srgb, var(--hero-ink) x%, transparent)`; schedule 307·315 `#c0392b` → `var(--hot)`; facilities 175·177 금 배지 → `--prize*`; admin-banners 197 기본값 → `#0a4d8c`(저장된 운영자 값은 재설정 사항으로 안내).

**C5 성취 배지 신설** — `.badge.passer` 수정자: `color:var(--prize); background:var(--prize-bg); border:1px solid var(--prize-line)`. JSX `builtin-sections:380` 합격 배지에 `passer` 수정자 1건 추가(별점 329 는 그대로 `--ok`… 아니라 별점은 중립 → `--faint`). `.chip.passer` 236 → `--prize*`. **1화면 1금**: 그 밖의 금 0.

**C6 선재 결함** — schedule.tsx 362 `.seat.mid` → `var(--warn-ink)` / `.faxtab .c` 275 → `var(--soft)` / `--faint` 값 자체 교정(§2) / 청 채움 위 흰 글자 9곳 → `var(--blue-fg)`(landing-style 35·156-157·218·249-254·276, schedule 317·349-351, schedule-detail 180-181) / 사문 규칙 3개 삭제.

**C7 문서** — `docs/survey/디자인-보이스-통일-브리프.md` §3 「권위 — 네이비」에 **강의 표면은 로고 청** 예외를 적고, §9 P2 「금박 규율화 위반 없음」을 실측(27곳)으로 정정. 메모리 `design-brief-two-surfaces` 갱신.

## 4. 검증 게이트

1. `grep "var(--gilt" app/features/landing` 0건 · `grep "#c0392b\|#fff\b" landing-style.tsx` 0건(의도한 `#ffffff` 토큰 정의 제외)
2. 대비 재계산(node, WCAG 2) — §2 표의 값 전부 + 9곳 hero-soft·9곳 blue-fg 실측
3. `npm run typecheck` · `npm run build` · vitest
4. 라이트·다크 스크린샷 4화면(강의 홈·일정·시험정보·학원시설) — **다크에서 마감임박 태그·합격 배지가 읽히는지**가 합격선
5. 배너 accent 3종(gilt/blue/green) 렌더 확인 — DB 값 변경 없음
6. 푸시 = 하드스톱(원장 확인 후)

## 5. 원장 결정 필요

| | 질문 | 권고 |
|---|---|---|
| Q1 | `/about/instructors` 3화면(`.instr`, 네이비+금박)을 함께 청으로 바꾸는가 | **2단계(C8)로 동반 전환** — 강의 레이아웃 안에서 한 페이지만 다른 브랜드로 남는 것이 더 어색. 수료증 인쇄는 유지 |
| Q2 | 학생 눈에 「공공기관·은행 룩」으로 보일 위험(원장·수험생 심사 지적) | 격은 타이포(B 단계)가 이미 세웠으므로 수용. 스크린샷 게이트에서 판단 |
| Q3 | 배너 accent 라벨 「금박」을 「기본(청)」으로 바꾸는가(값·클래스는 유지) | 예 |

## 6. 실행 순서

C1+C2+C5(토큰·금 회수·성취) 한 커밋 → C3+C4(짙은 면·하드코딩) → C6(결함) → 스크린샷 검토 → C7 문서 → **푸시 하드스톱** → (승인 시) C8 `.instr`.

## 7. 적용 기록(2026-09-16) — C1~C7 완료, C8 대기

**바뀐 파일(코드 13 + 문서 2)**: `app/features/landing/components/landing-style.tsx`(토큰 2블록 + 규칙 약 60개) · `screens/schedule.tsx`(10) · `screens/schedule-detail.tsx`(6) · `screens/exam-info.tsx`(3) · `screens/facilities.tsx`(7 + 주석) · `components/lecture-video-section.tsx`(Tailwind 폴백 2) · `components/builtin-sections.tsx`(합격 배지 `passer` 수정자 1) · `screens/admin-banner-edit.tsx`(select 라벨·hint) · `labels.ts`(`BANNER_ACCENT_LABEL.gilt` 「기본(청)」) · `screens/admin-banners.tsx`(기본 간격색 `#0a4d8c`) · `app/app.css`(prestige 주석 정정) · 주석만 `hero-carousel.tsx`·`hero-parts.tsx` · 문서 이 파일 + `docs/survey/디자인-보이스-통일-브리프.md`. JSX `className` 변경은 `badge passer` 추가 1건과 lecture-video-section 의 Tailwind 임의값 2건뿐(클래스명·DB accent 값 rename 0).

**게이트 실측**: `var(--gilt` 0건 · `#fff`·`#c0392b` 리터럴 0건(`--hot` 토큰 정의 `#c0392b` 만 잔존 — `#ffffff` 정의와 같은 범주) · 라이트/다크 토큰 패리티(라이트에만 있는 토큰 = `--lfont` 뿐) · typecheck·build·vitest(50파일 570) 통과 · WCAG 2 대비 64개 조합 실측: 텍스트 62쌍 전부 ≥ 4.5(최저 라이트 `--faint`/lground 4.85·`--ok`/lsurface 4.82) · 대형 텍스트 1(`.ic .por b` 46px, 3.26/4.34 ≥ 3.0) · 비텍스트 테두리 1(`.btn.ghost.on-navy` 2.72 L / 3.22 D — 기록만).

**§2 와 달라진 값·판단**
| 항목 | §2/§3 | 적용 | 이유 |
|---|---|---|---|
| `--faint` 라이트 | `#65738a` | **`#5f6d87`** | §2 는 흰 위(4.80)만 측정. `.ei-note` 등 lground 위 12px 이 4.47 로 미달 → 4.85/5.22 |
| `.hcard .lab`·`.promo .pk`·`.bt-eye`·`.loc .li .k` | `--blue-ink` | **`--hero-soft`** | 넷 다 슬랩(짙은 면) 위 — `#0a5a9e` on `#0868b8` 은 읽히지 않음. 라벨 역할로 묶인 §3 오분류 |
| `.hcard`·`.promo` 유리 | 흰 틴트 10% | **navy2 55%→25% 틴트** | 흰 틴트가 면을 밝혀 hero-soft 12px 이 3.93 → 5.94/5.26 |
| `.rev .av` 끝점 | `--navy-soft` | **`--blue-ink`** | 흰 글자 on navy-soft 3.44 → 7.07(다크 8.28) |
| `.tag.waitlist`·`.sd-tag.waitlist` 채움 | `--warn` 그대로 | **`--warn-ink`** | `--warn` 위 흰 글자 3.34(선재 결함) → 4.97. `--warn` 채움은 영상 형태 막대·점(비텍스트)에만 남음 |
| `.scard-thumb.off/.vid` 끝점 | 고정 hex | **`color-mix(색 72%, var(--ink))`** | 다크에서 `--blue-fg`(잉크) on `#14663a` 가 2.50. `--ink` 와 섞으면 라이트는 짙어지고 다크는 밝아져 양쪽 다 6.8+ |
| 일정 「영상」 형태 색(6곳) | §2 에 없음 | **`--warn`(채움)/`--warn-ink`(글자)** | off=`--ok`·live=`--blue` 와 구별되는 §2 내 색이 이것뿐. 잔여석 `.seat.mid`(warn-ink)와 한 카드에 놓여 의미 충돌 — §8 질문 |
| facilities `.fc-no` 번호 배지 | `--prize*` | **`--hero-ink` 바탕 + `--navy2` 글자** | 카드마다 붙는 순번이라 성취가 아니고, 1화면 1금(C5)과 충돌 |
| `.eventcard .btn.gilt` | (없음) | **청 채움 + `--blue-fg`** | 카드가 밝게 반전되면 반전형 `.btn.gilt`(흰 바탕)가 흰 카드에 묻힘. JSX 무변경 |
| `.rev .badge` 별점 | `--ok` | **`--soft` on faint 12%** | `--faint` 글자는 4.14 로 미달 → 6.49 |
| `.btn.ghost.on-navy` 테두리 | hero-ink 28% | **55%** | 비텍스트 3:1 기준 라이트 2.72(다크 3.22) — 글자(5.39)가 버튼을 식별하므로 1.4.11 은 범위 밖으로 두고 기록만 |
| `.bk .cov` 시작점 | `--blue`→`--navy2` | **`--navy`→`--navy2`** (3n+2 는 역순) | 표지 제목 `.bt`(hero-ink)가 다크 `--blue` `#4d9fe6` 위 2.63 → `--navy` 6.89. 라이트는 두 값이 같아 무변화. 구 네이비 hex(`#3a6098`) 변형도 함께 회수 |
| `.hrow .seat` (히어로 카드 잔여석) | (언급 없음) | `#ffd9a8`(복숭아) → **`--hero-soft`** | 슬랩 위 경고색 토큰이 §2 에 없어 중립으로. 신호색이 필요하면 Q4 의 형태·경고 토큰과 함께 결정 |
| facilities `.fc-card::after` | `rgba(10,20,40,.9)` | `color-mix(var(--navy2) 90%)` | 토큰 경유(다크에서도 navy2 를 따라감) |
| `.slide h1 .hl` | hero-ink 또는 청 하이라이트 | hero-ink 글자 + hero-ink 22% 밑줄 워시 | 슬랩이 청이라 청 하이라이트는 보이지 않음 |
| `--hot` 라이트 | 현행 | `#c0392b` 유지 | 토큰 정의에만 남음(리터럴 소비 0) |

**남긴 것**: C8 `.instr` 강사소개 3화면(prestige 참조 + 금 워시 하드코딩) — 별도 커밋. 스크린샷 게이트(§4-4)·배너 accent 3종 렌더(§4-5)는 원장 확인. 저장된 운영자 간격색(`#0e1d38`)은 재설정 안내.

## 8. 원장 추가 질문(적용 후)

| | 질문 | 권고 |
|---|---|---|
| Q4 | 일정 화면 「영상」 형태 색을 `--warn`(주황) 으로 두는가 — 잔여석 경고(`--warn-ink`)와 같은 카드에서 겹친다 | 형태 전용 토큰(`--kind-vid`) 1개를 §2 에 추가하고 값은 스크린샷 보고 결정 |
