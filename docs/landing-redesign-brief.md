# 리담변리사학원 랜딩 페이지 리디자인 브리프

> **읽는 사람에게**: 이 문서는 다른 Claude Code 세션이 단독으로 읽고 랜딩 페이지(`/`)를 리디자인 구현할 수 있도록 작성됐다. **이 문서만 읽고도** 플랫폼·톤·기술 제약·금지 사항을 모두 파악할 수 있게 자기 완결적으로 작성됐으니, 추측하지 말고 명시된 대로 따르라. 명세에 없는 자유 영역(예: 스크롤 인터랙션의 정확한 easing 곡선 등)은 "디자인 방향" 섹션의 톤을 따라 합리적으로 결정해도 된다.
>
> **수정 대상**: `app/features/home/screens/home.tsx` 단일 파일이 본 작업의 주 산출물. 부수적으로 `home.tsx` 안에서 사용할 신규 컴포넌트는 같은 파일 안에 inline 정의하거나 `app/features/home/components/` 아래에 분할해도 된다. **`app/core/components/navigation-bar.tsx` 와 `app/core/components/footer.tsx` 는 절대 수정하지 말 것** (전 화면이 공유함).

---

## 0. 산출물 한 줄

> "변리사 시험 1·2차 수험생이 1분 안에 '왜 리담변리사학원인가'를 이해하고 가입 버튼을 누르도록 만드는 단일 SSR 랜딩 페이지". 합격자 데이터 기반 컨설팅이라는 **유일한 차별점**과 조문·판례·문제·논문 통합 학습 흐름이라는 **핵심 자산**을 보여준다. 톤은 학구적이지만 따뜻하고, 인터랙션은 절제된 고급스러움.

---

## 1. 플랫폼 정체성 (절대 흔들리면 안 되는 사실)

| 항목 | 값 |
|------|----|
| 서비스명 | 리담변리사학원 (운영사: 리담지식재산교육원 주식회사) — 변리사 학원 SaaS |
| 도메인 | 대한민국 변리사 시험 (1차 객관식 + 2차 주관식/논술) |
| 대상 사용자 | (1) 변리사 수험생 — 핵심 트래픽. (2) 강사 (instructor) — 콘텐츠 작성·반 진도 관리. (3) 원장 (admin) — 사용자/결제/강사 관리 |
| 다루는 과목 | **법률 5과목**: 특허법 · 상표법 · 디자인보호법 · 민법 · 민사소송법 / **자연과학 4과목** (1차 필수): 물리 · 화학 · 생물 · 지구과학 |
| 콘텐츠 엔티티 | 조문 (article) · 판례 (case) · 문제 (problem, 객관식/OX/빈칸/주관식) · 논문 (paper) |
| 핵심 자산 | 조문 ↔ 판례 ↔ 문제 다대다 연관관계 그래프 + 합격자 데이터 |
| 결제 모델 | 무료 · 자기주도 구독 (₩29,900/월, 합격자 비교 컨설팅 풀 액세스) · 종합반 (학원 직접 상담) — 3-tier |
| 언어 | 한국어 단일 (i18n 미사용 — 모든 카피는 한국어 하드코딩) |

> **금기 표현**: "AI 변리사 자동화", "100% 합격 보장", "최단 합격" 같은 과장 표현 금지. 우리는 **데이터에 기반한 학습 컨설팅**을 제공한다.

---

## 2. 핵심 가치 제안 (USP) — 랜딩이 반드시 전달해야 하는 4가지

랜딩의 모든 섹션은 아래 4개 USP 중 하나 이상을 뒷받침해야 한다.

1. **합격자 데이터 기반 컨설팅** ← *유일·최강 차별점*
   - 실제 합격자가 동의한 학습 데이터(학습 시간·문제 풀이·정답률·활동 일수·streak)를 익명·집계해서 본인 학습과 비교. "합격자 평균에 얼마나 가까운가"를 분위·차이로 표시. 12주 학습 곡선 overlay, 비합격 패턴 위험 신호 알림.
   - 가입하면 즉시 본인 비교 가능. 표본은 자가 신고 + 합격증 인증 합격자.

2. **조문 · 판례 · 문제 · 논문 통합 흐름**
   - 조문 뷰어에서 우측 패널로 관련 판례·문제·메모·코멘트가 따라옴. 판례 뷰어에서 관련 조문·유사 문제. 문제 해설의 조문 ref 클릭 시 조문 뷰어 코멘트 탭으로 진입. 학습 흐름이 끊기지 않음.
   - 모든 콘텐츠 위에 본인 메모 / 즐겨찾기 / 하이라이트 (polymorphic).

3. **최신 정보 자동 추적**
   - 법 개정, 신규 판례, 신규 문제, 논문, 도서 추록·정오표를 한 화면(`/latest/*`)에 자동 집계. 즐겨찾기·메모한 조문이 개정되면 알림.

4. **학습 흐름 자동화 (학생) + 콘텐츠 운영 (강사·원장)**
   - 학생: 시험일·목표 점수 입력 → 매일 권장 진도 자동 계산 + 약점 단원 + 오답노트 자동 수집 + 합격 진단 점수 시계열.
   - 종합반(cohort): 강사가 짠 N주 커리큘럼 → 자동 주간 과제 변환 → 비활성 학생 알림 → 주간 리포트 이메일.

---

## 3. 정보 구조 (섹션 순서 — 이 순서를 따른다)

```
[Hero]                        — 단일 메시지 + 1차 CTA + Hero Preview (대시보드 미리보기 카드)
[PasserStatsSection]          — 합격자 통계 (loader 의 stats 가 null 아닐 때만 노출)
[FeaturesSection]             — WHY LIDAM 4 카드 (USP 핵심)
[IntegratedFlowSection] (신규) — 조문→판례→문제 통합 흐름 시각화 (USP 2 강화)
[SubjectsSection]             — 다루는 과목 (법률 5 + 자연과학 4)
[PreviewSection]              — 대시보드 모자이크 (D-day, 진도, 히트맵, 정답률)
[LatestSection] (신규)         — 최신 정보 자동 집계 미리보기 (USP 3)
[PricingTeaserSection] (신규)  — 무료/구독/종합반 3-tier 짧은 비교 + /pricing 으로 유도
[FlowSection]                 — STEP 1·2·3 시작 가이드
[FaqSection] (신규)            — 5 ~ 7 개 핵심 FAQ (수험생 의구심 해소)
[FinalCta]                    — 최종 가입 CTA
```

> 기존 (현재 home.tsx) 구성은 Hero · PasserStats · Features · Subjects · Preview · Flow · FinalCta 7섹션. **신규 4 섹션 추가**(`IntegratedFlowSection`, `LatestSection`, `PricingTeaserSection`, `FaqSection`)가 핵심 변경. 기존 섹션도 시각/타이포/애니메이션 강화는 OK, **카피·정보 구조는 기존을 살리되 윤색**.

각 섹션의 상세는 §6 에서 다룬다.

---

## 4. 네비게이션 (절대 수정 금지 — 그대로 노출)

랜딩에서 어떤 형태로 navigation-bar 를 노출하든, 메뉴 구성·라벨·링크는 아래 표 그대로다. (네비게이션 컴포넌트 자체는 `app/core/components/navigation-bar.tsx` 가 이미 책임지고 있고 랜딩에서는 import 만 한다 — 라벨·구조를 다시 만들지 말 것.)

### 4.1 데스크톱 — 좌→우 7개 top-level

| 위치 | 라벨 | 형태 | 진입 |
|------|------|------|------|
| 1 | 대시보드 | flat 링크 | `/dashboard` |
| 2 | 학습관리 | dropdown | 학습목표 및 과목별 진도 (`/goals`) · 학습 통계 (`/study/stats`) · 내 과제 (`/assignments`) · 알림 (`/inbox`) |
| 3 | 학습과목 | 2-col dropdown | **민법** 그룹: 민법 (`/subjects/civil`) · **산업재산권법** 그룹: 특허법 (`/subjects/patent`) · 상표법 (`/subjects/trademark`) · 디자인보호법 (`/subjects/design`) · **민사소송법** 그룹: 민사소송법 (`/subjects/civil-procedure`) · **자연과학** 그룹: 물리 (`/subjects/science/physics`) · 화학 (`/subjects/science/chemistry`) · 생물 (`/subjects/science/biology`) · 지구과학 (`/subjects/science/earth-science`) |
| 4 | 학습보조 | dropdown | 오답노트 (`/study/wrong-note`) · 즐겨찾기 (`/study/bookmarks`) · 메모 (`/study/notes`) · 하이라이트 (`/study/highlights`) |
| 5 | 학습정보 | dropdown | 법 개정 (`/latest/laws`) · 최근 판례 (`/latest/cases`) · 객관식 문제 (`/latest/mcq`) · 주관식 문제 (`/latest/essay`) · 논문 (`/latest/papers`) · 추록·정오표 (`/latest/book-updates`) |
| 6 | 커뮤니티 | dropdown | 온라인 GS (`/gs`) · 커뮤니티 (`/community`) · Q&A (`/qna`) · 공지사항 (`/announcements`) |
| 7 | 운영자 | flat 링크 | `/admin` |

추가 우측 영역: 전역 검색 (⌘K), 알림 벨 (로그인 시 인박스 미읽음 카운트), 환경 톱니, 테마 스위처, 언어 스위처, 그리고 우측 끝에 **비로그인 시 [로그인][회원가입]** 버튼 / 로그인 시 아바타 드롭다운.

### 4.2 모바일

햄버거 → Sheet 열림. 위 7개 top-level 을 그룹 헤더 + 들여쓴 자식 링크 형태로 동일하게 표시. 푸터에 검색·알림·테마·언어 + 로그인/가입 버튼.

### 4.3 푸터 (절대 수정 금지)

- 좌측 (모바일에서는 하단): `Copyright (c) 리담지식재산교육원 주식회사 All Rights Reserved.`
- 우측 (모바일에서는 상단): `Privacy Policy` (`/legal/privacy-policy`) · `Terms of Service` (`/legal/terms-of-service`)
- 컴포넌트: `app/core/components/footer.tsx`. 랜딩에서 직접 푸터 markup 을 넣지 말 것 — 레이아웃이 자동으로 감싸준다.

> **확인 사항**: 랜딩 본문에서 위 네비게이션 라벨/링크를 카드·CTA로 다시 인용해도 OK. 단 라벨은 위 표와 **글자까지 동일**해야 한다 (예: "학습관리"를 "학습 관리" 로 띄우면 안 됨).

---

## 5. 디자인 방향

### 5.1 톤·무드 한 줄

> "도서관의 따뜻한 조명 아래 잘 정돈된 변리사 합격생의 책상" — 학구적·신뢰감·차분함 + 카공 느낌의 따뜻한 종이 질감. *고급스럽지만 차갑지 않다*.

### 5.2 색상 (cozy-tokens.ts SSOT — 그대로 사용)

랜딩은 `COZY_PALETTES.sage` 팔레트를 메인으로 사용 중이다. 그대로 유지.

```ts
// app/core/lib/cozy-tokens.ts
COZY_PALETTES.sage = {
  primary: "#3F5A4A",   // 메인 진녹색 (CTA, 헤딩 강조)
  accent:  "#7FA08E",   // 보조 세이지
  soft:    "#CFDDD2",   // 가장 옅은 표면
  tint:    "#E6EDE6",   // 배지/카드 배경 tint
};
COZY_BASE     = "#FDFAF6";              // 페이지 베이스 (따뜻한 아이보리)
COZY_INK      = "#2B1F14";              // 본문 텍스트 (진한 코코아)
COZY_INK_SOFT = "#6B5A48";              // 부 텍스트 (로스트)
COZY_LINE     = "rgba(107,66,38,0.12)"; // 보더 라인
COZY_FONT_STACK = 'Pretendard, "Noto Sans KR", -apple-system, system-ui, sans-serif';
```

새로운 색상을 도입하지 말 것. 통계 카드의 4종 tone (primary/emerald/violet/amber) 은 기존 `STAT_CARD_TONE` 매핑이 있고 그대로 재사용.

### 5.3 타이포

- 본문/헤딩 모두 **Pretendard** 한국어 첫 번째. (영문은 `system-ui` fallback)
- 큰 헤딩은 `clamp(34px, 5vw, 56px)` (Hero), `clamp(24px, 3.4vw, 34px)` (섹션 타이틀) 패턴 유지. **letter-spacing: -0.02em** ~ **-0.025em** (한국어 시각 정돈).
- 숫자(통계·D-day·진도)는 `font-variant-numeric: tabular-nums` 필수. 정렬 흔들림 방지.
- eyebrow (섹션 위 작은 라벨)는 `letter-spacing: 0.08em ~ 0.12em + uppercase + ui-monospace` 패턴 유지 — 학구적 인상.

### 5.4 형태 언어

- 카드 라운딩: 14 ~ 24px. CTA 버튼은 14px. 큰 단독 박스는 24 ~ 28px.
- 보더는 항상 `COZY_LINE` (1px). 다크 카드(primary 배경)는 보더 대신 `box-shadow: 0 8px 24px rgba(63,90,74,0.18)` 으로 입체감.
- 강조 점/원: 6 ~ 10px 작은 원에 accent 컬러로 시그널 — 과하지 않게.

### 5.5 이미지·아이콘

- **이미지 자산 신규 도입 금지**. 사진·일러스트가 필요하다면 SVG 패턴 / CSS 그라데이션 / 추상 도형으로 처리. 기존에 사용하던 paper-grain (radial-gradient dot) 패턴은 유지.
- 아이콘은 lucide-react 만 사용 (코드베이스 표준). 이모지(☕ 📚 🌿 📊 📈 🎯 📅 🔥) 는 현재 카피에서 제한적으로 쓰이고 있는데, **신규로 추가할 때는 1 섹션당 1 ~ 2개 이내**로 절제. 핵심 USP 카드의 number badge (01·02·03·04) 같은 차분한 식별자가 우선.

### 5.6 무드 보드 키워드

`서재` `차 한 잔` `손때 묻은 노트` `정돈된 책장` `세이지 그린` `따뜻한 종이` `절제된 그래프` `한국어 가독성` `노트 위 메모` `도장 찍기 전 조용함`

---

## 6. 섹션별 상세 명세

각 섹션은 `<section>` 시맨틱 태그 + `aria-labelledby` 권장. 모든 섹션은 `max-width: 1200px; margin: 0 auto; padding: 60 ~ 80px 24px;` 컨테이너 패턴을 따른다. (Hero 와 FinalCta 만 예외 — Hero 는 `padding: 84px 24px 64px`, FinalCta 는 `padding: 80px 24px 96px`.)

### 6.1 Hero

**메시지 (1차 후크)**
- H1: `변리사 시험,\n한 곳에서 차근차근.` (현 카피 유지하되 후술 애니메이션 적용)
- 서브: `조문 · 판례 · 문제 · 논문이 끊김 없이 이어지는 학습 플랫폼.\n매일의 진도를 따뜻하게 받쳐주는, 카공 같은 책상이 되어 드릴게요.`
- 좌측 배지: `리담 변리사 학원` (작은 dot + uppercase + sage tint 배경)
- CTA 1차: `[무료로 시작하기]` → `/join` (sage primary 배경, white)
- CTA 2차: `[로그인]` → `/login` (outline)
- 하단 mini stats 3개: `🔥 평균 23일 연속 학습`, `📚 5 법률 + 4 자연과학`, `🌿 조문·판례·문제 통합`

**Hero Preview (우측 카드)**
- 모킹된 학생 대시보드 카드. D-87 까지 시험 카운터, "어서오세요, 지원님 ☕", 학습/문제/정답률 3-stat, 오늘의 학습 계획 체크리스트 3개. (현 구현 유지.)
- **핵심**: 이 카드는 "실제 가입 후 보게 될 화면" 미리보기. 신뢰감 형성용.

**레이아웃**
- 데스크톱: `grid-template-columns: minmax(0,1.1fr) minmax(0,1fr)` 두 컬럼.
- 모바일 (≤960px): 단일 컬럼, Hero Preview 가 위로 (`order: -1`) 올라옴.

### 6.2 PasserStatsSection (loader 의 stats 가 truthy 일 때만)

**데이터 출처**: `getPublicPlatformStats()` (`app/features/exam-results/analytics.server.ts`) — `stats.consentedPasserCount > 0` 일 때만 노출. 0명일 땐 통째로 hide.

stats 구조:
```ts
type PublicPlatformStats = {
  totalPasserCount: number;       // 전체 자가 신고 합격자
  verifiedPasserCount: number;    // 합격증 인증 합격자
  consentedPasserCount: number;   // 분석 동의 합격자
  avgStudyHours: number | null;   // 응시 전년~당해 누적 평균
  avgProblemAttempts: number | null;
  avgAccuracyPct: number | null;
  avgActiveDays: number | null;
  totalSummaries: number;         // 합격 후기 글 수
};
```

**컴포지션**
- eyebrow: `📊 합격자 데이터 기반 컨설팅`
- H2: `합격자의 학습 패턴이 곧 본인의 합격 지도가 됩니다`
- 본문 1단락 (현 카피 유지): "실제 변리사 합격자가 직접 입력·동의한 …"
- StatCard 4개 (4-col grid, 모바일 720px 이하 2-col): 분석 합격자 / 평균 학습 / 평균 풀이 / 평균 정답률
- FeatureTile 3개 (3-col grid, 모바일 1-col): 평균 대비 비교 / 자동 추천 액션 / 12주 학습 곡선
- CTA: `[가입하고 비교 보기 →]` → `/join`. `totalSummaries > 0` 시 옆에 `합격자가 직접 쓴 학습 후기 N건도 가입 후 열람 가능` 보조 카피.

**시각**
- 큰 흰색 카드 한 장에 모두 담김. 라운딩 24px, 보더 1px, soft shadow.
- StatCard 의 숫자는 30px 800 weight tabular-nums.
- *카운트업 애니메이션 적용 — §7 참조*.

### 6.3 FeaturesSection (WHY LIDAM)

**eyebrow**: `WHY LIDAM`  
**H2**: `혼자 공부할 때 가장 필요한 것`  
**서브**: `흐름을 잃지 않고, 매일 한 걸음 나아가는 감각.`

4 카드 (4-col grid, ≤960px 2-col, ≤560px 1-col):

| Badge | Title | Body |
|-------|-------|------|
| 01 | 메뉴 진입 트리 | 과목 → 조문 · 판례 · 문제로 자연스럽게 깊이 들어갑니다. 클릭 한 번으로 도달할 수 있는 학습 단위. |
| 02 | 조문 ↔ 판례 ↔ 문제 | 어떤 화면에서 진입하든 관련 자료가 곁에 있습니다. 끊김 없이 잇고, 흐름을 잃지 않게. |
| 03 | 최신 정보 자동 추적 | 법 개정, 신규 판례, 신규 문제, 논문이 한 곳에 자동 집계됩니다. 매일 '무엇이 새로 올라왔는지' 한 눈에. |
| 04 | 과목 특성별 학습 구조 | 법률 과목은 조문·판례·문제 3탭, 자연과학은 문제 중심. 같은 시간을 들여도 결이 맞는 학습. |

(현 카피 그대로 유지. 카드 자체는 hover lift 애니메이션 추가 — §7 참조.)

### 6.4 IntegratedFlowSection (신규) — 통합 흐름 시각화

**의도**: USP 2 ("조문↔판례↔문제 통합 흐름")를 카피로만 말하지 말고 **시각적 다이어그램**으로 보여준다. 글로 한 번 말한 메시지를 그림으로 한 번 더 못 박는다.

**eyebrow**: `INTEGRATED FLOW`  
**H2**: `한 번 들어간 학습은 끊기지 않습니다`  
**서브**: `조문에서 판례로, 판례에서 문제로 — 우측 패널이 늘 다음 자료를 들고 있습니다.`

**시각**: 3개 카드(조문 / 판례 / 문제)를 좌→우로 배치. 카드 사이를 **얇은 점선 화살표**(우측 방향 + 양방향 표기 — 어느 방향에서든 진입 가능)로 잇는다. 각 카드 안에는:

- 카드 1 (조문): "특허법 제29조 제1항", 본문 미리보기 한 줄 + 우측에 mini chip 들("관련 판례 12 · 관련 문제 47 · 메모 3")
- 카드 2 (판례): "대법원 2019다204869", "신규성 판단 기준" 같은 짧은 요지 + chip ("관련 조문 3 · 유사 문제 8")
- 카드 3 (문제): "객관식 #2024-1차-12", 지문 한 줄 + chip ("primary 조문 · 관련 판례 2")

화살표는 호버 시(혹은 in-view 시) 흐름 방향으로 light pulse. 모바일에서는 세로 stack + 화살표가 ↓ 로 회전.

**보조 카피 (다이어그램 아래)**: `polymorphic 메모 · 즐겨찾기 · 하이라이트 — 어느 화면에서든 본인의 노트가 따라옵니다.`

### 6.5 SubjectsSection

**eyebrow**: `SUBJECTS`  
**H2**: `다루는 과목`  
**서브**: `변리사 1차 + 2차, 그리고 1차 필수 자연과학 4과목까지.`

레이아웃 (2-col, ≤960px 1-col):
- 좌측 카드 (밝은 흰색): 라벨 `법률 과목 · 5`, sub `조문 · 판례 · 문제 3탭 구조`, chips: `특허법(산업재산권법) · 상표법(산업재산권법) · 디자인보호법(산업재산권법) · 민법 · 민사소송법`
- 우측 카드 (sage primary 배경, dark): 라벨 `자연과학 · 4`, sub `1차 필수 · 객관식 문제 중심`, chips: `물리 · 화학 · 생물 · 지구과학`. 우하단 코너에 옅은 accent 원 장식.

(현 구현 유지.)

### 6.6 PreviewSection (대시보드 미리보기)

**eyebrow**: `DASHBOARD`  
**H2**: `오늘 무엇을, 얼마나\n해야 하는지가 또렷해집니다.`  
**본문**: `D-day, 연속 학습일, 과목별 진도, 약점 지표가 한 화면에. 작은 성취가 매일 쌓이는 감각.`  
**CTA**: `[대시보드 둘러보기 →]` → `/dashboard`

우측 모자이크 (2x2 카드 그리드):
1. 진도 — `72%`, `특허법 38h`
2. 히트맵 — 7×4 mini heatmap (deterministic intensity, sage tone scale)
3. 이번 주 — `19.6h`, `목표 25h` (sage primary 배경 = tinted 카드)
4. 문제 — `1,248`, `정답률 74.2%`

(현 구현 유지. 카드 카운트업·hover lift 애니메이션 추가.)

### 6.7 LatestSection (신규) — 최신 정보 미리보기

**의도**: USP 3 (최신 정보 자동 추적) 시각화. 실제 `/latest/*` 페이지로 트래픽 유도.

**eyebrow**: `LATEST`  
**H2**: `매일 무엇이 새로 올라왔는지, 한 화면에`  
**서브**: `법 개정 · 신규 판례 · 신규 문제 · 논문 · 도서 추록까지. 즐겨찾기한 조문이 개정되면 알림으로 알려드려요.`

6 카드 (3-col, ≤960px 2-col, ≤560px 1-col) — 각 카드는 mock 데이터로 채움 (실 데이터 fetch 하지 말 것 — 가벼운 랜딩 유지):

| 카테고리 | 라벨 | mock 미리보기 한 줄 | 링크 |
|---------|------|--------------------|------|
| 🟢 법 개정 | 법 개정 | "특허법 제29조 — 2026.01.15. 시행" | `/latest/laws` |
| 🟣 판례 | 최근 판례 | "대법원 2025다123456 — 균등론 적용 범위" | `/latest/cases` |
| 🟡 객관식 | 객관식 문제 | "2026년 모의고사 — 상표법 240제 추가" | `/latest/mcq` |
| 🟠 주관식 | 주관식 문제 | "2026 GS 2회 — 디자인보호법 사례형" | `/latest/essay` |
| 🔵 논문 | 논문 | "직접침해와 간접침해의 경계 — 김OO 교수" | `/latest/papers` |
| 🟤 도서 | 추록·정오표 | "변리사법 강의 4판 — 정오표 v1.2" | `/latest/book-updates` |

각 카드는 작은 컬러 도트 + 카테고리 라벨 + 미리보기 + 우상단에 `→` 화살표. hover 시 sage primary 컬러로 라벨 강조 + 살짝 lift.

### 6.8 PricingTeaserSection (신규) — 3-tier 짧은 비교

**의도**: 가격을 숨기지 않고 미리 보여줌. 가입 전 의구심 해소. `/pricing` 으로 deep-link.

**eyebrow**: `PRICING`  
**H2**: `필요한 만큼만, 합리적으로`  
**서브**: `기본 학습은 평생 무료. 합격자 비교 컨설팅이 필요해진 시점에 자기주도 구독을 시작하세요.`

3 카드 (3-col, ≤960px 1-col, 가운데 카드 = "추천" 배지 + sage primary border):

**카드 1 — 무료**
- 라벨: `무료 · 평생`
- 가격: `₩0`
- 핵심 포함: 조문/판례/문제 열람 · 메모/하이라이트/즐겨찾기 · 기본 진도 추적 · 학습 통계
- CTA: `[무료로 시작]` → `/join` (outline)

**카드 2 — 자기주도 구독 (추천 — 가운데)**
- 라벨: `PRO · 자기주도 구독`
- 가격: `₩29,900 / 월`
- 핵심 포함: 무료 전체 + **합격자 평균 비교** + **자동 추천 액션** + **12주 학습 곡선** + **합격 후기 열람** + **합격 진단 점수 시계열**
- CTA: `[14일 둘러보고 결정]` 또는 `[구독 시작]` → `/pricing` (sage primary fill)
- 살짝 scale up + soft shadow 로 강조

**카드 3 — 종합반**
- 라벨: `학원 종합반`
- 가격: `상담 후 결정`
- 핵심 포함: 자기주도 전체 + **N주 커리큘럼** + **자동 주간 과제** + **강사 첨삭** + **온라인 GS 채점** + **반(cohort) 진도 관리**
- CTA: `[학원 상담 →]` → `/contact` (outline + 사람 모양 lucide 아이콘)

**카드 하단 보조 카피**: `요금제 비교 자세히 보기 →` (`/pricing` 링크, 작게)

### 6.9 FlowSection (시작 가이드)

**eyebrow**: `HOW IT WORKS`  
**H2**: `시작은 단순하게`  
**서브**: `가입하고 목표를 정하면, 나머지는 매일의 습관.`

3 단계 카드 (3-col, ≤960px 1-col). 카드 사이 작은 connector line (모바일 hide).

| n | 제목 | 본문 |
|---|------|------|
| STEP 1 | 학습 목표 설정 | 시험 일자와 목표 점수를 기준으로, 매일의 권장 진도가 자동 계산됩니다. |
| STEP 2 | 조문 → 판례 → 문제 | 한 흐름으로 깊이 들어가며, 메모와 하이라이트로 자기만의 노트를 쌓아갑니다. |
| STEP 3 | 약점·진도 한 눈에 | 히트맵, 정답률, 연속 학습일이 대시보드에 모입니다. 다음에 무엇을 풀지 추천도. |

(현 구현 유지.)

### 6.10 FaqSection (신규)

**의도**: 가입 전 의구심을 미리 풀어준다. 5 ~ 7 문항.

**eyebrow**: `FAQ`  
**H2**: `자주 묻는 질문`

각 항목은 details/summary 또는 shadcn `Accordion`. **질문은 정확히 다음 7개를 사용**:

1. **합격자 데이터는 어떻게 모이나요?**  
   합격자 본인이 직접 점수·합격 여부를 입력하고, 분석 활용에 명시적으로 동의한 경우에만 학습 데이터(시간·풀이·정답률·활동일수)를 익명으로 집계합니다. 합격증 인증은 선택입니다.

2. **무료 플랜만으로 충분히 학습할 수 있나요?**  
   조문·판례·문제·논문 열람, 메모·하이라이트·즐겨찾기, 기본 진도 추적은 평생 무료입니다. 합격자 평균 비교·자동 추천·12주 곡선이 필요한 분만 자기주도 구독을 추가하시면 됩니다.

3. **학원 종합반은 자기주도 구독과 어떻게 다른가요?**  
   종합반은 학원이 짠 N주 커리큘럼이 cohort 단위로 적용되어 자동 주간 과제·강사 첨삭·온라인 GS 채점·반 진도 관리까지 포함됩니다. 자기주도 구독은 본인 페이스로 합격자 데이터 비교 컨설팅만 이용하는 분께 적합합니다.

4. **자연과학 4과목도 다루나요?**  
   네, 변리사 1차 자연과학 4과목(물리·화학·생물·지구과학)은 모두 필수 응시 과목입니다 — 총 40문제 중 과목별 10문제씩 출제됩니다. 리담변리사학원은 4과목 모두 객관식 문제 중심으로 제공하며, 법률 과목과 동일한 학습 흐름·진도 추적·오답노트가 적용됩니다.

5. **법 개정·신규 판례는 얼마나 빨리 반영되나요?**  
   강사진이 개정 시행 시점에 맞춰 article_revision 스냅샷으로 반영하고, 즐겨찾기·메모한 조문이 개정되면 자동 알림과 주간 리포트로 안내합니다.

6. **모바일에서도 학습할 수 있나요?**  
   네, 모든 화면이 모바일 반응형입니다. 조문 뷰어의 사이드바는 시트(Sheet)로 변환되며, 대시보드·문제 풀이·통계 모두 모바일에 최적화되어 있습니다.

7. **결제는 어떻게 되나요?**  
   토스페이먼츠를 통해 카드 결제로 진행됩니다. 첫 결제 후 매월 자동 갱신되며, 언제든 본인 계정에서 해지할 수 있습니다.

**시각**: 좌측 작은 chevron 아이콘 (lucide `ChevronDown`), 펼치면 본문 + sage tint 배경. 한 번에 하나만 열림 (Accordion 단일 모드). 펼침 시 부드러운 height 트랜지션.

### 6.11 FinalCta

**카드 (max-width 720px, 가운데 정렬, sage primary 배경)**:
- H2: `오늘부터 한 걸음씩, 차근차근 ☕`
- 서브: `가입은 1분이면 충분합니다. 카드 정보 없이 시작해 보세요.`
- CTA 1차: `[무료로 시작하기]` → `/join` (white 배경, sage primary 글자)
- CTA 2차: `[이미 계정이 있어요]` → `/login` (transparent + 옅은 보더)
- 카드 우상단·좌하단에 옅은 accent 원 2개 장식 (현 구현 유지)

(현 구현 유지.)

---

## 7. 애니메이션 가이드 (이게 핵심 — "고급스럽게")

### 7.1 원칙

1. **절제**. 모든 모션은 **0.4 ~ 0.7s 사이, ease-out 또는 cubic-bezier(0.22, 1, 0.36, 1)**. 튀는 spring/bounce 금지.
2. **한 번만**. 스크롤 reveal 은 in-view 진입 시 한 번 트리거하고 다시 reset 하지 않음 (`IntersectionObserver` 의 `unobserve` 사용).
3. **사용자 의향 존중**. **`@media (prefers-reduced-motion: reduce)` 시 모든 모션을 0.01ms 로 단축**. (Hero 카운트업·heatmap 애니메이션도 즉시 최종 상태.)
4. **GPU 친화**. transform/opacity 만 애니메이션. width/height/top/left 변경 금지.
5. **dependency 추가 금지**. `framer-motion` 등 라이브러리 신규 설치 금지. **순수 CSS + 작은 React 훅** (`useInView` 25줄짜리 자체 구현 + `useCountUp` 30줄짜리 자체 구현)으로 충분.

### 7.2 인벤토리

| # | 위치 | 애니메이션 | 트리거 | 디테일 |
|---|------|-----------|--------|--------|
| A1 | Hero H1 | 단어별 fade-up (`opacity 0→1, translateY 12px→0`), 80ms stagger | mount | 한국어라 단어 분할 시 어절 단위로 split. 첫 화면 로드 직후 즉시. |
| A2 | Hero 서브문장 | fade-up 1단계 | mount + 250ms delay | 한 덩어리. |
| A3 | Hero CTA 버튼 | fade-up + 가벼운 scale (0.96→1) | mount + 400ms delay | 두 버튼 한꺼번에. |
| A4 | Hero Preview 카드 | 우측에서 좌측으로 12px 슬라이드 + fade | mount + 300ms delay | 카드 자체. 내부 체크리스트 항목은 추가로 in-card stagger (50ms 간격). |
| A5 | 모든 섹션 진입 | section eyebrow → H2 → subtitle → contents 순으로 fade-up stagger (각 100ms) | IntersectionObserver `threshold: 0.15` | section 자체에 `data-reveal` attribute 추가하고 in-view 시 `.is-visible` 클래스 부여. |
| A6 | StatCard (PasserStats·Preview·등 모든 큰 숫자) | **카운트업** 0 → 최종값, 1.2s ease-out | section in-view | 정수는 정수, 시간(`186h`) 은 숫자 부분만 카운트, 퍼센트는 % 유지. tabular-nums 보장. |
| A7 | Feature 카드 (4개 + 다른 카드 그리드들) | 카드별 70ms stagger fade-up | section in-view | 마우스 hover 시 `transform: translateY(-3px)` + shadow 강화 (200ms). |
| A8 | IntegratedFlow 다이어그램 | 카드 좌→우 순차 fade-in + 화살표 path 가 stroke-dashoffset 으로 그어짐 | section in-view | SVG 화살표는 `stroke-dasharray + stroke-dashoffset` 트릭. 600ms 에 걸쳐 그려짐. 카드 등장 후 150ms delay. |
| A9 | Subjects chips | chip 별 30ms stagger pop-in (scale 0.9→1, opacity 0→1) | section in-view | 우측 dark 카드의 accent 원은 in-view 시 `scale(0.6)→scale(1)` 600ms ease-out. |
| A10 | Preview Mosaic | 카드 4개 200ms 간격 fade-up. tinted 카드(이번 주)는 살짝 더 큰 lift. | section in-view | 히트맵 셀들은 in-view 후 좌상→우하 wave 로 색상 페이드 인 (셀당 18ms stagger, 총 ≈500ms). |
| A11 | Latest 카드 | hover 시 우상단 화살표가 `translateX(3px)` + 카드 자체 lift | hover | in-view 진입은 카드 70ms stagger fade-up. |
| A12 | Pricing 카드 | mount stagger + 가운데 추천 카드는 영구적인 옅은 pulse (border-glow 1.6s loop, opacity 0.6→1→0.6) | section in-view + loop | 추천 카드의 pulse 는 prefers-reduced-motion 시 정지. |
| A13 | Flow connector (STEP 사이 점선) | in-view 시 좌→우 stroke-draw | section in-view | 600ms. |
| A14 | FAQ Accordion | 펼침/접힘 height 트랜지션 (300ms ease) + chevron rotate 180deg | click | shadcn Accordion 기본 동작이 이미 이 정도. |
| A15 | FinalCta 카드 | 항상 옅은 background 그라데이션이 천천히 흐름 (배경 위치 6s 무한 loop) | always | 카드 안 큰 원 2개는 in-view 시 ease-out 으로 등장. |
| A16 | 페이지 전체 paper-grain dot 배경 | 정적 (애니메이션 없음 — 의도적) | — | 종이 질감을 흔들지 않음. |
| A17 | 버튼 hover | `transform: translateY(-1px) + shadow 강화`, 160ms | hover | 모든 CTA 공통. 현 `buttonBase` 의 transition 활용. |

### 7.3 구현 스니펫 (참고용)

**useInView 훅** (자체 구현):

```ts
// app/features/home/lib/use-in-view.ts
import { useEffect, useRef, useState } from "react";

export function useInView<T extends Element>(threshold = 0.15) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          io.unobserve(el);
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return { ref, inView };
}
```

**useCountUp 훅**:

```ts
// app/features/home/lib/use-count-up.ts
import { useEffect, useState } from "react";

export function useCountUp(target: number, durationMs = 1200, start = false) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!start) return;
    if (typeof window === "undefined") {
      setValue(target);
      return;
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setValue(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
      setValue(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs, start]);
  return value;
}
```

**reveal 패턴 (CSS)**:

```css
[data-reveal] { opacity: 0; transform: translateY(12px); transition: opacity 600ms cubic-bezier(.22,1,.36,1), transform 600ms cubic-bezier(.22,1,.36,1); }
[data-reveal].is-visible { opacity: 1; transform: translateY(0); }
[data-reveal][data-delay="1"] { transition-delay: 80ms; }
[data-reveal][data-delay="2"] { transition-delay: 160ms; }
[data-reveal][data-delay="3"] { transition-delay: 240ms; }
@media (prefers-reduced-motion: reduce) {
  [data-reveal], [data-reveal].is-visible { opacity: 1; transform: none; transition: none; }
}
```

> 위 스니펫은 *예시*다. 실제 구현은 home.tsx 가 inline `<style>` 태그로 CSS 를 주입하는 현재 패턴(`<style>{` ... `}</style>`)과 일관되게 두어도 좋고, 새 훅 파일을 `app/features/home/lib/` 아래에 만들어도 좋다.

---

## 8. 기술 제약

### 8.1 스택 (위반 시 즉시 작업 중단)

- **React Router 7** (SSR, file-based routing). loader 가 `getPublicPlatformStats()` 를 best-effort 로 부르고 있고 그대로 유지. 추가 데이터 fetch 가 필요하면 같은 loader 안에서 병렬로 try/catch 로 묶을 것 — 실패해도 랜딩은 정상 노출.
- **Cloudflare Workers** SSR. **Node 전용 API 절대 금지** (`fs`, `net`, Node `crypto.randomBytes`, `setImmediate`, `process` 깊은 접근 등). Web Crypto / Workers 호환 라이브러리만 사용.
- **Tailwind CSS v4** 사용 가능. 단, 현 home.tsx 는 inline style 위주 — 일관성 위해 **inline style + Tailwind 혼용 모두 OK**. 새 컴포넌트는 어느 쪽이든 가독성 우선으로 선택.
- **shadcn/ui** (New York style) + **Radix UI** + **lucide-react** 만. 외부 UI 라이브러리·아이콘 라이브러리 추가 금지.
- **TypeScript strict**. `any` / `@ts-ignore` / `@ts-expect-error` 절대 금지. 타입 명확.
- **언어**: 한국어 단일. i18n key 추가하지 말고 한국어 하드코딩 (`home.title`, `home.subtitle` 만 기존대로 i18next 사용).
- **이미지·폰트 신규 자산 추가 금지** (cozy-tokens 의 폰트 스택 그대로). 외부 폰트 CDN 금지.
- **외부 스크립트 금지** (analytics 등은 layout 레벨에서 처리됨). 랜딩에서 직접 `<script src="...">` 추가 금지.

### 8.2 패키지 (이미 설치된 것만 사용)

- `react-router` ^7.5.1, `react` ^19.0.0
- `lucide-react` (아이콘)
- `react-markdown` (마크다운 — 랜딩에 마크다운 필요 없을 듯)
- 현 home.tsx 가 의존하는 모든 것: `~/core/lib/cozy-tokens`, `~/core/lib/i18next.server`, `~/features/exam-results/analytics.server`

**신규 패키지 설치 금지**. framer-motion, react-spring, @react-spring/web, gsap, lottie 등 추가하지 말 것.

### 8.3 코드 품질

- **파일 길이 목표 300줄 — 초과 시 분할**. 현 home.tsx 가 이미 1471줄로 초과 상태인데, 본 리디자인을 기회로 다음과 같이 분할할 것:
  - `app/features/home/screens/home.tsx` — 페이지 entry, loader, meta, 섹션 조합 (≤200줄)
  - `app/features/home/components/hero.tsx`
  - `app/features/home/components/passer-stats-section.tsx`
  - `app/features/home/components/features-section.tsx`
  - `app/features/home/components/integrated-flow-section.tsx` *(신규)*
  - `app/features/home/components/subjects-section.tsx`
  - `app/features/home/components/preview-section.tsx`
  - `app/features/home/components/latest-section.tsx` *(신규)*
  - `app/features/home/components/pricing-teaser-section.tsx` *(신규)*
  - `app/features/home/components/flow-section.tsx`
  - `app/features/home/components/faq-section.tsx` *(신규)*
  - `app/features/home/components/final-cta.tsx`
  - `app/features/home/components/section-header.tsx` *(공용 eyebrow + H2 + subtitle)*
  - `app/features/home/lib/use-in-view.ts`, `use-count-up.ts` *(신규 훅)*
- 컴포넌트는 표시 + 이벤트 연결만. 비즈니스/계산 로직은 `lib/` 아래.
- `console.log` 잔류 금지 (디버깅 후 제거). loader 의 `console.warn` 은 best-effort 로그라 유지 OK.
- 매직 숫자 — 같은 값이 3+ 번 반복되면 같은 파일 상단 const 로 추출.

### 8.4 SEO·메타

```tsx
export const meta: Route.MetaFunction = ({ data }) => [
  { title: data?.title ?? "리담변리사학원 — 변리사 시험, 한 곳에서 차근차근" },
  { name: "description", content: data?.subtitle ?? "조문·판례·문제·논문이 끊김 없이 이어지는 변리사 학습 플랫폼. 합격자 데이터 기반 컨설팅으로 본인의 학습이 합격자 평균에 얼마나 가까운지 한눈에." },
  { property: "og:title", content: "리담변리사학원 — 변리사 학습 플랫폼" },
  { property: "og:description", content: "합격자 데이터 기반 컨설팅 + 조문·판례·문제 통합 흐름" },
  { property: "og:type", content: "website" },
];
```

기존 i18next 의 `home.title` / `home.subtitle` 키를 우선 사용하되, fallback 으로 위 한국어 카피 사용.

### 8.5 접근성 (WCAG AA)

- 모든 섹션에 `aria-labelledby` 또는 `aria-label`.
- 큰 색-텍스트 대비: sage primary `#3F5A4A` 위 `#FFF` 텍스트 = 8.5:1 (AAA 통과).
- 장식 요소(paper-grain, accent 원, SVG 화살표 등)는 모두 `aria-hidden="true"`.
- 인터랙티브 요소는 `<Link>` / `<button>` 만 사용. 클릭 가능한 div 금지.
- 키보드 포커스 링: 기본 브라우저 outline 또는 `focus-visible:ring-2 ring-sage-primary` 명시. 제거하지 말 것.
- FAQ Accordion 은 `aria-expanded` / `aria-controls` 적절히.
- 카운트업 숫자는 화면낭독기에 최종값으로 들리도록 `aria-live="off"` (불필요한 announce 방지) 또는 `aria-hidden` 처리하고 sr-only 에 최종값 텍스트 별도.

### 8.6 성능

- LCP 타깃: 2.5s 이하 (Cloudflare Workers SSR + 정적 SVG/CSS 만 → 자연 도달).
- CLS 0 — Hero Preview·이미지 자리 미리 확보. 카운트업은 placeholder 0 이 아니라 최종값 폭 미리 잡기 위해 `min-width` 또는 `tabular-nums`.
- IntersectionObserver 는 한 섹션당 1개로 묶어 batch (개별 카드마다 observer 안 만들기).

### 8.7 반응형 break 포인트 (현 구현 그대로)

- `≤960px` — Hero 1-col, Hero Preview 위로, Features 2-col, Subjects 1-col, Preview 1-col, Flow 1-col, connector hide
- `≤720px` — PasserStats stat-grid 2-col, feature-tile 1-col
- `≤560px` — Features 1-col

신규 섹션도 같은 break 포인트 패턴 따를 것. inline `<style>{` `}</style>` 의 미디어쿼리 패턴 일관 유지.

---

## 9. 데이터 결합 (loader)

```ts
// app/features/home/screens/home.tsx
export async function loader({ request }: Route.LoaderArgs) {
  const t = await i18next.getFixedT(request);
  let stats: PublicPlatformStats | null = null;
  try {
    stats = await getPublicPlatformStats();
  } catch (e) {
    console.warn(
      "[home] getPublicPlatformStats failed",
      e instanceof Error ? e.message : String(e),
    );
  }
  return { title: t("home.title"), subtitle: t("home.subtitle"), stats };
}
```

**위 loader 형태 유지**. 추가 fetch 가 필요한 섹션은 모두 mock 으로 처리 (LatestSection 의 카드 미리보기 등). 랜딩에 무거운 쿼리를 매달지 않는 게 원칙.

---

## 10. Out of scope (수정·추가 금지)

- ❌ `app/core/components/navigation-bar.tsx` 의 메뉴 구성·라벨·링크 — 절대 변경 금지.
- ❌ `app/core/components/footer.tsx` — 절대 변경 금지.
- ❌ `cozy-tokens.ts` 의 색상 팔레트 — 신규 색 추가 금지 (sage 외 다른 팔레트 변경도 금지).
- ❌ `getPublicPlatformStats()` 시그니처/리턴 타입 — 변경 금지 (analytics.server.ts 는 통계 화면도 공유).
- ❌ DB 스키마, 마이그레이션, RLS 정책 — 본 작업은 순수 프론트엔드 작업.
- ❌ 라우트 추가 (`routes.ts` 변경) — 본 작업은 `/` 단일 페이지 리디자인.
- ❌ i18n 키 추가 (한국어 하드코딩으로 충분).
- ❌ 신규 npm 패키지 설치.
- ❌ 이미지·폰트·SVG 자산 신규 업로드 (`public/` 추가 금지). SVG 는 inline 만.
- ❌ Sentry / GA / Hotjar 등 추적 코드 직접 삽입 (이미 layout 에서 처리됨).
- ❌ `console.log` 잔류.
- ❌ 마케팅 과장 카피 ("100% 합격", "최단", "AI 자동 합격" 등).
- ❌ 다크 모드 전용 처리 (현 랜딩은 라이트 모드 전제. dark 모드는 layout 토글이지만 랜딩은 항상 cozy 라이트 톤 유지).

---

## 11. 작업 절차 (이 순서로 진행)

1. **읽기**: 본 문서 전체 + `app/features/home/screens/home.tsx` 현재 구현 + `app/core/lib/cozy-tokens.ts` + `app/core/components/navigation-bar.tsx` (네비 라벨 확인용, 수정 금지) + `app/features/exam-results/analytics.server.ts` (`getPublicPlatformStats` 타입 확인).
2. **분할 계획**: §8.3 의 파일 분할 구조대로 신규 컴포넌트 파일 생성. 기존 home.tsx 의 helper(`StatCard`, `FeatureTile`, `SubjectsCol`, `MosaicCard`, `MiniHeatmap`, `SectionHeader`, `Stat` 등)는 책임에 맞는 컴포넌트 파일 안으로 이전.
3. **공용 토큰 정리**: `palette = COZY_PALETTES.sage` 와 `buttonBase` 같은 inline 토큰을 `app/features/home/lib/landing-tokens.ts` 같은 곳에 모아 공용화.
4. **신규 4 섹션 구현**: IntegratedFlow → Latest → PricingTeaser → Faq 순서로. 각 섹션 완성 후 `npm run dev` 로 시각 확인.
5. **애니메이션 훅 도입**: `useInView`, `useCountUp` 추가. 모든 섹션의 reveal·카운트업 적용. `prefers-reduced-motion` 핸들링 확인.
6. **Hero refresh**: 단어별 fade-up + Hero Preview 슬라이드.
7. **반응형 점검**: Chrome devtools 에서 360 / 768 / 1024 / 1440 폭으로 모두 확인. break 포인트 ≤960px / ≤720px / ≤560px 일관성.
8. **타입체크**: `npm run typecheck` 통과 (필수).
9. **빌드 점검**: `npm run build` 성공 확인. Cloudflare Workers 호환 에러 없는지.
10. **접근성 빠른 점검**: 키보드 Tab 순서가 자연스러운지, 색 대비 문제 없는지, FAQ aria 속성 정상인지.
11. **성능 빠른 점검**: 첫 화면에 폰트/이미지 새 요청이 안 발생하는지, IntersectionObserver 가 disconnect 되는지.

---

## 12. 점검 체크리스트 (PR 전 확인)

다음 항목을 모두 ✅ 한 뒤 PR 올림.

- [ ] §3 의 11 섹션 (기존 7 + 신규 4)이 명세 순서대로 모두 존재한다.
- [ ] 신규 섹션 4개 (`IntegratedFlow` / `Latest` / `PricingTeaser` / `Faq`)가 각자 §6 에 명시된 카피·구성 그대로 구현됐다.
- [ ] §4 의 네비게이션 라벨·링크가 한 글자도 어긋나지 않는다 (직접 수정한 부분 없음). `navigation-bar.tsx` diff 가 비어 있다.
- [ ] `footer.tsx` diff 가 비어 있다.
- [ ] `cozy-tokens.ts` diff 가 비어 있다 (신규 색 추가 없음).
- [ ] `routes.ts` diff 가 비어 있다.
- [ ] `package.json` 의 dependencies 에 신규 항목이 없다 (애니메이션 라이브러리 미설치).
- [ ] `npm run typecheck` 통과.
- [ ] `npm run build` 통과.
- [ ] `console.log` 잔존 0건.
- [ ] `any` / `@ts-ignore` 사용 0건.
- [ ] 이미지·폰트 자산 신규 업로드 0건 (`public/` diff 비어 있음 또는 cosmetic 만).
- [ ] §7 의 17개 애니메이션 항목 중 13개 이상이 작동한다 (부분 구현 허용 항목: A12 pulse, A15 background flow 같은 영구 loop는 선택).
- [ ] `prefers-reduced-motion: reduce` 활성 시 모든 모션이 사실상 정지한다.
- [ ] 360px 폭에서 깨지는 레이아웃 없음.
- [ ] LCP < 2.5s (네트워크 fast 3G 시뮬레이션 기준).
- [ ] 화면낭독기로 Hero 카운트업 숫자가 최종값으로 들린다 (`aria-hidden` 또는 sr-only fallback).

---

## 13. 참고 — 기존 home.tsx 구조 다이제스트

현 1471줄 단일 파일 구조 (이대로는 분할 대상):

```
home.tsx
├─ meta()                              [SEO]
├─ loader()                            [t() + getPublicPlatformStats()]
├─ Home (default export)               [섹션 조합]
├─ Hero
│  ├─ Stat (icon+label)
│  └─ HeroPreview (D-87 + 학습 계획 카드)
├─ PasserStatsSection (조건부)
│  ├─ StatCard (4-tone: primary/emerald/violet/amber)
│  └─ FeatureTile
├─ FeaturesSection (4 카드)
├─ SubjectsSection
│  └─ SubjectsCol (light/dark 두 변형)
├─ PreviewSection
│  ├─ DashboardMosaic (2x2)
│  ├─ MosaicCard
│  └─ MiniHeatmap (7x4 deterministic)
├─ FlowSection (3 STEP)
├─ FinalCta
└─ SectionHeader (eyebrow + H2 + subtitle 공용)
```

위 구조의 helper 들은 분할 시 의미별 파일에 흩뿌려져 들어간다 — `StatCard`/`FeatureTile` → passer-stats-section.tsx, `MosaicCard`/`MiniHeatmap` → preview-section.tsx, `SectionHeader` → 공용 components/section-header.tsx 등.

---

## 14. 마지막 한 마디

이 페이지가 신규 사용자가 리담변리사학원을 처음 만나는 단 한 화면이다. **카피 한 줄, 색 한 톤, 모션 한 박자가 학원의 첫인상을 결정한다**. 절제와 따뜻함을 동시에 — 기능 자랑이 아니라, "여기서 공부하면 될 것 같다"는 차분한 확신을 만드는 것이 목표다.

명세에 적혀 있지 않은 부분은 §5 디자인 방향의 톤·키워드를 기준으로 보수적으로 결정한다. 의심되면 추가하지 말고 절제하는 쪽을 선택한다. 화려함보다 정돈됨이 늘 우선.

— 끝.
