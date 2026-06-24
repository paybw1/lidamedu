# 랜딩 C 시각 점검 — 토큰 정렬(다크) · 폰트 위계 · 배경 분위기

> 읽기 전용(코드 0). 점검일 2026-06-24. frontend-design SKILL 기준 반영.
> 대상: `/` = `home.tsx` + 12섹션(A/B 신규 `weakness-engine-section`·합격자 SVG 포함) + `home/lib/landing.tsx`(`PALETTE`).
> 순서 = **C1 토큰(토대·최대) → C2 폰트 → C3 배경**. 토큰은 하위단계로 쪼개 각 단계 라이트·다크 확인.

---

## 0. 한눈 결론

- **랜딩은 인앱 토큰 시스템 밖의 "고정 라이트 섬"**: 전부 `home/lib/landing.tsx`의 JS `PALETTE`(하드 hex/rgba) + 인라인 스타일. `app.css` CSS 변수(`--foreground`·`--surface-*`·`--border`·dark)를 **하나도 안 씀**. → 다크에서 본문 전체 흰색 고정.
- **seam 확정**: `navigation-bar`·`footer`는 토큰(다크 대응). 본문(`home.tsx` `background:#ffffff` 인라인)은 라이트 고정 → **다크 시 nav/footer는 어두워지고 본문만 하얗게** 남는다. 색 정합성에서 앱을 토큰 통일한([[color-consistency-darkmode]]) **마지막 미정렬 조각**.
- **★ de-risk 핵심**: 인라인 스타일은 `var(--token)`을 그대로 받는다. **`PALETTE` 값을 `var(--…)`로 재정의하면 12섹션을 안 건드리고도 대부분 다크 대응**(섹션은 전부 `PALETTE`만 읽음). C1의 위험이 "11섹션 일괄 수정"이 아니라 "PALETTE 한 객체 + 비-PALETTE 하드코딩 일부"로 축소된다.
- **frontend-design 갭 2건**: ① `PALETTE.accent = #7B61FF`(**보라**) — 가이드가 명시적으로 경계하는 색, 게다가 브랜드(블루)와 충돌. 자과 점 1곳에만 사용 → 브랜드/토큰으로 교체. ② **Pretendard 단일·디스플레이 폰트 없음** + **중앙정렬 헤더 7회** = 위계·개성 부족(C2·C3).

---

## 1. C1 토큰 정렬 (점검)

### 1-A. `PALETTE` 인벤토리 → 토큰 매핑표

| PALETTE 키 | 값 | 주 사용처 | → app.css 토큰 | 다크 거동 | 비고/갭 |
|---|---|---|---|---|---|
| `primary` | `#2D5BA8` | eyebrow·버튼·아이콘·마커·칩 텍스트·D-day·번호·커넥터 — **전 섹션** | **`--primary`**(L #2d5ba8=동일 / D #3b6fc4) | ✅ 자동 | 정확 일치 |
| `primaryStrong` | `#1E4789` | 그라데이션 stop | `--secondary-foreground`(#1e4789) 또는 신규 `--lp-grad-to` | — | 그라데이션용(§1-C) |
| `primaryDeep` | `#3B6FC4` | `gradientPeople` stop | (= D `--primary`) / 신규 `--lp-grad-from` | — | 그라데이션용 |
| `accent` | `#7B61FF` **보라** | 자과 과목 점(subjects) 1곳 | **교체** → `--chart-3`(emerald) 또는 `--primary` | ⚠️ | ★frontend-design 보라 경계 + 브랜드 충돌 |
| `ink` | `rgba(0,0,0,.84)` | 제목·본문 — 전 섹션 | **`--foreground`**(#252525 / #fff) | ✅ 자동 | 0.84 뉘앙스→#252525 근사 |
| `inkSoft` | `rgba(0,0,0,.56)` | 보조 텍스트 — 전 섹션 | **`--ink-soft`**(#475569 / #cbd5e1) | ✅ 자동 | |
| `inkMute` | `rgba(0,0,0,.4)` | 캡션·축 라벨 | **`--ink-faint`**(#94a3b8) | ✅ 자동 | |
| `line` | `rgba(0,0,0,.12)` | 카드 경계(일부 — 나머진 하드 rgba) | **`--border`**(#e5e9ef / rgba white .1) | ✅ 자동 | |
| `tint` | `rgba(45,91,168,.06)` | 칩·배지 bg(통합플로우·features·hero·subjects·faq·passer·weakness) | **`--secondary`**(#e7edf6 / #444) 또는 신규 `--lp-tint` | ✅/근사 | 톤 약간 진해짐 — 확인 |
| `soft` | `rgba(45,91,168,.12)` | 거의 미사용 | `--secondary` | — | 정리 대상 |
| `base` | `#FFFFFF` | 타일 bg | **`--card`**/`--surface-1`(#fff / #333) | ✅ 자동 | |
| `subtle` | `rgb(250,250,250)` | 거의 미사용 | `--surface-2`(#f8fafc / #2a2a2a) | — | |
| `muted` | `rgb(238,238,238)` | 거의 미사용 | `--surface-3`(#f1f5f9 / #404040) | — | |
| `gradientPeople` | `linear(...#3B6FC4→#1E4789)` | subjects 자과 카드·final-cta | `var(--primary)`+`color-mix` 또는 `--lp-grad-*` | ⚠️ 재구성 | §1-C |
| `gradientVisit` | `linear(#2D5BA8→#1E4789)` | preview "이번주" 타일·weakness SRS 카드 | 동상 | ⚠️ 재구성 | §1-C |

### 1-B. 비-PALETTE 하드코딩(별도 손봐야 함 — PALETTE 재정의로 안 잡힘)

| 하드코딩 | 위치 | → 토큰 | 비고 |
|---|---|---|---|
| `"#fff"` / `"#ffffff"` | 카드 bg(features·flow·integrated·latest·preview·pricing·passer·weakness), 그라데이션 위 흰 텍스트 | 카드 bg→`--card` / 흰 텍스트→`--primary-foreground`(양 모드 #fff 유지 OK, 그라데이션 어두움) | 다수 |
| `rgba(0,0,0,.06~.12)` | 카드 경계·그림자·weakness 빈 셀(`.05`) | 경계→`--border` / 빈 셀→`--surface-3`/`--muted` | |
| `box-shadow rgba(0,0,0,X)` | hero·hover·카드 | 다크용 그림자 별도(어두운 bg에서 검은 그림자 무의미) | §위험 |
| `CELL_TONE #E26A53/#E0A43B/#4E9E78` | weakness 매트릭스(약/보통/강) + hero 칩 `#E26A53` | 신규 `--lp-weak/mid/strong`(L+D) | data-viz, 다크 명도 상향 필요 |
| `rgba(45,91,168,.22/.02)` | passer SVG 곡선 fill/stroke | `var(--primary)` 기반 | SVG 속성은 `style`로 var 주입 권장 |
| 점 `#5C7F6A·#7B6BA0·#A77B3F·#C97D5B·#8B5A2B` | latest 카테고리 점 | 유지 가능(작음) 또는 `--chart-*` | 다크 대비만 확인 |
| `rgba(45,91,168,X)` tones | preview MiniHeatmap | `var(--primary)` + 단계 alpha | |

### 1-C. 다크 갭(구체)

- **본문 루트**: `home.tsx`가 `background:"#ffffff"` + `color:"rgba(0,0,0,.84)"` 인라인 고정 → 다크에서 **본문 전체 흰 배경**. (nav/footer만 어두워지는 seam의 근원.)
- **전 섹션 카드/텍스트/경계**: `#fff`·`PALETTE.ink`·`PALETTE.line` 고정 → 다크 무반응.
- **그라데이션**: `gradientPeople/Visit`은 이미 진한 블루라 그 위 흰 텍스트는 양 모드 OK(우연히 다크에서 안 깨지는 유일 요소). 단 다크 표면에선 더 어둡게 가야 톤 정합.
- **그림자**: `rgba(0,0,0,.06~.22)` — 다크 배경에선 안 보이거나 탁함 → 다크 그림자(또는 경계 강조) 별도.
- **활성 방식**: `.dark` 클래스 기반. 로그인 사용자가 다크 설정 후 `/` 방문 시 깨진 랜딩 노출(로그아웃도 시스템/토글 경로 있으면 동일).

---

## 2. C2 폰트 위계 (점검)

- **현재**: 전 섹션 `font: "... Pretendard, sans-serif"` 단일 패밀리, 웨이트 400~800로만 위계. 디스플레이/제목 전용 폰트 없음. (`home.tsx` `fontFamily`도 Pretendard.)
- **frontend-design 갭**: "distinctive display font × refined body" 페어링 권장, 제네릭 단일 회피. Pretendard 자체는 한국어 표준(나쁘진 않음)이나 **위계·개성 부재**가 문제.
- **방향(절제)**: 본문 Pretendard 유지 + **제목용 디스플레이 1종** 도입(hero H1·`SectionHeader` H2·preview/finalcta H2). 후보 — (a) 정제 명조(예: Gowun Batang/Nanum Myeongjo) = 변리사 시험의 권위/에디토리얼 톤, (b) 강한 디스플레이 산세리프. 숫자(D-day·통계)는 tabular-nums 유지 또는 display 적용.
- **주의**: 한국어 웹폰트 용량 큼 → subset + `font-display: swap`. `--font-display` 토큰으로 정의(@theme), C1 토큰 토대 위.

---

## 3. C3 배경 분위기 (점검)

- **현재 단조 지점**: 거의 모든 섹션 평면 `#fff`, `SectionHeader`(eyebrow+title+subtitle 중앙정렬) **7회 반복**, 흰 카드. 깊이는 그라데이션 카드 2곳(subjects 자과·final-cta)뿐.
- **frontend-design 갭**: atmosphere/depth(은은한 그라데이션·layered·texture), predictable pattern 회피, 여백 리듬.
- **방향(slop 없이 절제)**:
  - **섹션 배경 교대**: 흰 ↔ `--surface-2`(은은한 slate)로 리듬·구획(토큰화 → 다크 자동).
  - **은은한 wash**: hero·final 등 1~2곳에 저투명 브랜드 radial/linear(러디언트 메시 아님, 약하게).
  - **헤더 단조 깨기**: 일부 `SectionHeader` 좌정렬/비대칭(7회 중앙 반복 완화).
  - **여백 리듬**: 섹션 padding 변주·구분선. 브랜드 톤(신뢰·정제)이라 과한 맥시멀 금지.

---

## 4. 단계안 (C1 토큰 → C2 폰트 → C3 배경)

### C1 — 토큰 정렬 (하위단계, 각 단계 라이트+다크 확인)
- **C1-0 토큰 보강**(app.css): 깔끔히 매핑 안 되는 것만 신규 토큰 — `--lp-weak/mid/strong`(viz 약/보통/강, L+D), 그라데이션은 `color-mix(in srgb, var(--primary), #000 22%)` 또는 `--lp-grad-from/to`. (소수, 토대.)
- **C1-1 PALETTE 재정의**(★레버): `landing.tsx` `PALETTE` 값 → `var(--token)`(primary·ink·inkSoft·inkMute·line·base·tint…). **12섹션 무수정으로 텍스트·카드·경계·칩 다크 대응**. 라이트 무변(토큰=동일 톤) + 다크 확인.
- **C1-2 본문 루트**: `home.tsx` `background/color` → 토큰(`var(--background)`/`var(--foreground)`). 본문 다크 bg 확정.
- **C1-3 그라데이션**: `gradientPeople/Visit` → 토큰/color-mix. subjects·final-cta·preview·weakness 확인.
- **C1-4 비-PALETTE 하드코딩**: 컴포넌트별 — weakness `CELL_TONE`→`--lp-*`, passer SVG, hero 칩, latest 점, **subjects 보라 accent→브랜드**, 인라인 `#fff`/`rgba` 경계. **파일별 점진**(weakness→passer→hero→subjects→latest→preview…), 각 다크 확인.
- **C1-5 그림자(선택)**: 다크 그림자/경계 보정.
- **위험**: 高(범위 넓음) but C1-1 레버로 대부분 단일 controlled 변경. 라이트 회귀 리스크 = 토큰 톤이 옛 하드 톤과 미세 차(ink .84 vs #252525, tint 톤) → 단계별 라이트 diff 확인으로 차단. SVG는 `var()`를 속성 아닌 `style`로.

### C2 — 폰트 위계 (토큰 후)
- `--font-display` 정의 + hero/`SectionHeader`/주요 H2에 적용. 본문 Pretendard 유지. subset·`swap`. **위험**: 中(웹폰트 로드·FOUT·한글 글리프 커버리지).

### C3 — 배경 분위기 (폰트 후)
- 섹션 bg 교대(surface-2)·은은한 wash·헤더 정렬 변주·여백 리듬. 토큰 위에서 다크 자동. **위험**: 中(과하면 slop — 절제 기준 유지).

### 독립 출하·확인
- C1→C2→C3 순차(토큰 먼저 안 하면 폰트·배경이 다크에서 재작업). 각 단계 라이트+다크 양쪽 확인 필수. C1은 하위단계마다 커밋(롤백 용이).

---

## 5. 완료 메모
PALETTE 인벤토리(§1-A) + 토큰 매핑표 + 비-PALETTE 하드코딩(§1-B) + 다크 갭(§1-C) + 폰트(§2)·배경(§3) + 단계안(C1 하위단계·C2·C3·위험, §4). **수정 0.** 착수는 C1-0→C1-1(레버)부터, 각 라이트+다크 확인.
