# 토글(AreaTabs) sticky 안 먹는 원인 — 진단 (읽기 전용)

> 작성 2026-06-20 · 방법: SectionTabs·AreaTabs sticky 클래스 + 토글 조상 체인(navigation.layout·root·StudentShell·셸·레이아웃) overflow 전수 추적 + navbar 스택 확인. **코드 변경 0(진단). 수정은 승인 후.**
> **결론(한 줄)**: sticky 속성·조상 overflow는 **정상**(토글은 실제로 top-0에 붙는다). 진짜 원인은 **전역 NavigationBar(`sticky top-0 z-50 h-14`)와 토글(`sticky top-0 z-10`)이 둘 다 top-0** 이라, 토글이 top-0에 붙되 **56px 높이 navbar 뒤(z-10<z-50)로 가려져** "안 붙는 것처럼" 보이는 것. 디자인 이주 회귀 아님, 4영역 공통.

---

## ① AreaTabs sticky 속성 — 정상

- `AreaTabs`(`app/core/components/student/AreaTabs.tsx`)는 항상 `<SectionTabs … sticky />`.
- `SectionTabs`(`SectionTabs.tsx:74-77`): sticky 시 `className`에
  ```
  bg-card border-b border-border -mx-4 px-4 sm:-mx-6 … md:-mx-8  +  sticky top-0 z-10
  ```
- → **`position: sticky` + `top: 0` + `z-index: 10` 정상 보유**. 배경(`bg-card`)·경계(`border-b`)도 있어 (A) 가림 문제 아님. sticky가 "먹는지"가 핵심인데, 속성은 멀쩡하다.

---

## ② 조상 overflow 추적 — 범인 없음 (sticky는 실제로 동작)

`position: sticky`는 **가장 가까운 스크롤 가능(overflow≠visible) 조상** 기준으로 붙는다. 토글에서 위로 전 조상 확인:

| 조상 | 클래스 | overflow |
|---|---|---|
| 레이아웃 프래그먼트 | `study-management.layout`·`subjects.layout` = `<><Toggle/><Outlet/></>` / aids·info 셸 = `<><Toggle/><StudentShell/></>` | **없음**(프래그먼트, 토글은 형제·맨 위) |
| 콘텐츠 래퍼 | `navigation.layout:163` `<div className="w-full mx-auto">` | **없음** |
| 콘텐츠 행 | `navigation.layout:137` `<div className="flex w-full flex-1">` | **없음** |
| 레이아웃 루트 | `navigation.layout:69-77` `<div className="flex min-h-screen flex-col …">` | **없음** |
| body | `root.tsx:186` `<body className="h-full">` | **없음** |
| html | `root.tsx:170-172` `<html className="… h-full">` | **없음** |

- ★ **overflow-x:hidden → overflow-y:auto 승격(고전 sticky-breaker) 없음**: 토글 조상 체인 어디에도 `overflow-*` 없음. 전 코드 `overflow-hidden` 76파일은 전부 **컴포넌트 내부**(badge·avatar·dropdown·차트 등)로 토글 조상 아님.
- StudentShell(`Shell.tsx`)도 `mx-auto w-full px-… py-…` — overflow·높이 제약 없음.
- → **스크롤 컨테이너 = document(viewport)**. 토글 sticky는 viewport 기준으로 **정상 동작**(top-0에 붙는다). **overflow 범인 없음.**

---

## ③ 진짜 원인 — navbar와 top-0 충돌 (가려짐)

- **NavigationBar**(`navigation-bar.tsx:420`): `sticky top-0 z-50 … h-14 … bg-white/80 backdrop-blur-lg`. = top-0, **z-50**, **56px(h-14)**, 반투명+블러.
- **토글**: `sticky top-0 z-10`.
- 둘 다 `top: 0`. 문서 순서 = navbar 먼저 → (콘텐츠) → 토글. 스크롤하면:
  - navbar가 top-0에 고정(z-50, 0~56px 차지).
  - 토글도 자기 위치가 top-0에 닿으면 top-0에 고정 — **navbar와 같은 0~56px 구역에 겹쳐 z-10(뒤)로** 깔림.
  - navbar가 반투명+블러라 토글은 **그 뒤로 사라짐** → 사용자에겐 "스크롤하면 토글이 navbar 밑으로 빨려들어가 안 붙는다"로 보임.
- 즉 토글은 **붙긴 하는데 navbar에 가려** 안 보인다. (sidebar 모드는 navbar가 `hideAll`로 없어 top-0이 그대로 보임 → 정상.)

> **수정 방향**: 토글이 navbar **아래**(top-14 = 3.5rem = 56px)에 붙어야 한다. 단 sidebar 모드(navbar 없음)는 top-0 유지.

---

## ④ 디자인 이주 회귀? — 아님 (pre-existing)

- navbar `sticky top-0 z-50 h-14` 와 SectionTabs `sticky top-0 z-10` 는 **둘 다 디자인 이주 이전부터** 존재. 이주는 SectionTabs sticky·navbar를 건드리지 않았다.
- 이주는 화면 본문을 `StudentShell`로 감쌌지만, **토글은 이주 전후 모두 StudentShell/셸 div 의 형제(위)** — 토글의 sticky 컨텍스트(document)·조상 overflow 불변. StudentShell은 overflow/높이 조상을 들이지 않음(② 표).
- → **이주로 생긴 회귀 아님.** top-0 충돌은 원래 있었고, 이번에 토글 동작을 점검하며 드러난 것.

---

## ⑤ 4영역 공통 여부 — 공통 (한 곳 수정으로 해결)

- 학습관리·학습과목·학습지원·학습정보 토글 **모두** `AreaTabs → SectionTabs(sticky top-0 z-10)` 사용. navbar는 전역(topbar 모드 전 페이지).
- → **4영역 동일 증상**. SectionTabs(또는 토글 top 값) **한 곳** 고치면 4영역 일괄 해결.
- 모드별: **topbar 모드 = 깨짐**(navbar 있음) / **sidebar 모드 = 정상**(navbar 없어 top-0 보임). 수정은 sidebar 모드를 깨면 안 됨.

---

## ⑤ 수정안 (승인 후)

### ★ navbar 높이·반응형 확인 결과 (수정안 정밀화)

- navbar 높이 = **항상 `h-14`(3.5rem=56px)** 고정(`navigation-bar.tsx:420`, 다른 값 없음).
- ★ 단 **인증 사용자는 navbar 가 `hidden md:flex`**(`:423`) — **모바일(<md)에선 navbar 숨김**(하단탭이 nav 담당). 즉 상단 sticky navbar 는 **md+ 에서만** 존재.
- → 오프셋은 **반응형**이어야 함:

| 모드 | 모바일(<md) | 데스크톱(md+) |
|---|---|---|
| topbar | navbar 없음 → **top-0** | navbar 56px → **top-14(3.5rem)** |
| sidebar(hideAll) | navbar 없음 → top-0 | navbar 없음 → top-0 |

> 단순 `isSidebar ? 0 : 3.5rem` 변수만 쓰면 **모바일 topbar 에서 토글이 56px 내려가 또 어긋남**(모바일엔 navbar 없으니까). `md:` 반응형으로 모바일은 항상 0 유지해야 함.

### (A) ★권고 — CSS 변수(md+ 오프셋) + 모바일 top-0

- `navigation.layout` 루트 div(모드 인지)에서 CSS 변수 설정:
  ```tsx
  // sidebar(navbar 없음) → 0 / topbar(md+ navbar 56px) → 3.5rem(=h-14)
  style={{ ["--area-sticky-top" as string]: isSidebar ? "0px" : "3.5rem" }}
  ```
- `SectionTabs`: `top-0` → **`top-0 md:top-[var(--area-sticky-top,0px)]`**
  - 모바일(<md): **항상 top-0**(navbar 없음 — topbar·sidebar 공통).
  - md+: 변수값 — sidebar=0px / topbar=3.5rem(navbar 아래).
- 효과: **4모드(topbar·sidebar × 모바일·데스크톱) 모두 정확**. CSS 변수는 navigation.layout 루트→SectionTabs 로 cascade(SectionTabs 가 descendant). 변수 미설정 화면은 fallback `0px`=top-0(안전).
- 1 컴포넌트 + 1 레이아웃 변수 → 4영역 일괄. 디자인 이주 영향 0(토글 top 값만). z-10 그대로 — md+ top-14 면 navbar(0~56px)와 안 겹쳐 z 무관.

### (B) SectionTabs `top-14` 하드코딩 — 비권고
- topbar는 고쳐지나 **sidebar 모드에서 56px 빈 틈**(navbar 없는데 56px 아래 고정) → sidebar 깨짐. (A)의 변수 없이는 모드 양립 불가.

### (C) navbar 비-sticky / 토글 z를 navbar 위로 — 비권고
- navbar를 안 붙이거나 토글 z를 z-50↑로 올리면, 토글이 navbar **위에** 그려져 navbar를 가림(역겹침). 상단 바 정체성 훼손. 부적절.

→ **(A) 권고.** 결정 포인트: (A) 적용할지 / navbar 높이 변동 가능성(반응형으로 h-14 외 값 쓰는 곳 있나) 확인 후 변수값 확정.

### 검증(수정 시)
- topbar 모드: 4영역(/study/wrong-note·/latest/laws·/study/today·/subjects/*) 스크롤 → 토글이 **navbar 바로 아래 고정·계속 보임**.
- sidebar 모드: 토글이 top-0에 정상(빈 틈 없음).
- 모바일/데스크톱 양쪽, navbar 높이와 토글 위치 이음새 확인.
