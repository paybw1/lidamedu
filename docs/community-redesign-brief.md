# 리담변리사학원 커뮤니티 영역 리디자인 브리프

> **Claude Design 핸드오프용.** claude.ai/design 의 `리담 디자인 시스템`(lidam-design-system) 프로젝트에 전달해 **커뮤니티 영역 전체**(온라인 GS · 커뮤니티 · Q&A · 공지사항, 13개 화면)의 UI kit 를 만들기 위한 명세다. 새 UI kit: `ui_kits/lidam-community/`.
>
> **앞선 작업과의 관계** — 같은 프로젝트의 랜딩(`ui_kits/lidam-web/`)·대시보드(`ui_kits/lidam-dashboard/`)·학습과목(`ui_kits/lidam-subjects/`)·학습보조(`ui_kits/lidam-study-aids/`)·학습정보(`ui_kits/lidam-latest/`)는 이미 Wantedly 기반 **딥 로열블루 `#2D5BA8`** 디자인 시스템으로 진행됐다. 커뮤니티 영역도 **같은 디자인 시스템**으로 통일한다. 콘텐츠·네비게이션·voice 규칙은 `landing-redesign-brief.md` 와 이 문서를 따른다.

---

## 0. 산출물 한 줄

> 변리사 수험생이 **혼자가 아니라 같이 공부하는** 영역. 정기 모의고사(온라인 GS)를 응시·상호 채점하고, 조문·판례·문제에 대한 질문을 강사에게 묻고, 학원 공지를 받는다. 학습이 *콘텐츠 소비*에서 *상호작용·피드백*으로 확장되는 곳.

---

## 1. 영역 정체성

| 항목 | 값 |
|------|----|
| 영역 | 네비게이션 "커뮤니티" 메뉴 하위 — 온라인 GS(`/gs/*`) · 커뮤니티(`/community`) · Q&A(`/qna/*`) · 공지사항(`/announcements`) |
| 대상 | 변리사 2차(주관식) 수험생(student) — 핵심 트래픽. 강사·원장(staff)은 Q&A 답변·GS 채점 권한을 가진다 |
| 화면 수 | 13 — 온라인 GS 8 + 커뮤니티 1 + Q&A 3 + 공지사항 1 |
| 성격 | 응시·상호 채점·질의응답·공지 — **사람 사이의 상호작용**이 중심. 데이터를 보는 곳이 아니라 *주고받는* 곳 |
| 셸 | 전역 네비게이션 레이아웃(상단 navigation-bar + footer, `private.layout`) 안에서 렌더. 자체 사이드바 없음 |
| 현재 디자인 | shadcn/ui 기본 톤(`Card`/`Badge`/`Button` 기본 radius·회색 테두리). 디자인 토큰(`#2D5BA8`·Pretendard)은 존재하나 화면 적용 안 됨. 상태색은 raw `emerald/amber/rose/slate` 하드코딩 |
| 데이터 출처 | 각 화면 loader — gs / qna / announcements 피처 쿼리 |
| 언어 | 한국어 단일 (하드코딩) |

---

## 2. 핵심 목적 — 커뮤니티가 지켜야 하는 3원칙

1. **응시·채점 흐름은 시험장처럼 또렷하게** — 온라인 GS 는 종이 답안지를 사진으로 올려 푸는 실전 모의고사다. 업로드·매핑·제출·채점 각 단계의 *지금 무엇을 해야 하는지*가 한눈에 보여야 한다. 학습과목 영역의 문제 풀이(`lidam-subjects` 퀴즈)와 시각 언어를 일치시킨다.
2. **상호작용에는 사람의 온도를** — 동료 채점·Q&A·우수 답안은 사람이 사람에게 주는 피드백이다. 차갑지 않게, 그러나 과시 없이. 익명 채점은 *익명임을 분명히*, 우수 답안은 *축하하되 절제해서*.
3. **흩어진 4종을 한 영역으로** — 온라인 GS·커뮤니티·Q&A·공지는 성격이 다르지만 모두 "커뮤니티" 메뉴 아래 형제다. 4개 하위 영역이 서로 단절되지 않게 탭 strip 으로 묶는다.

---

## 3. 화면 인벤토리 — 이 brief 가 다루는 13개 화면

| # | 화면 | 경로 | 한 줄 역할 | 현재 파일 |
|---|------|------|-----------|-----------|
| 1 | **온라인 GS 허브** | `/gs` | 공개 회차 + 내 응시 이력 + 시리즈 추이 + 동료 채점 배정 + 포인트 잔액 | `gs/screens/gs.tsx` |
| 2 | **GS 응시** | `/gs/:roundId/take` | 종이 답안지 페이지 업로드 + 페이지↔문항 매핑 + 판독 확인 + 제출 | `gs/screens/gs-take.tsx` |
| 3 | **GS 결과** | `/gs/:roundId/result` | 채점 결과 — 본인 답안 + 점수 + 피드백 + 모범답안 | `gs/screens/gs-result.tsx` |
| 4 | **동료 채점 (단건)** | `/gs/peer-review/:assignmentId` | 익명 답안 1건을 문항별 점수·피드백으로 채점 | `gs/screens/gs-peer-review.tsx` |
| 5 | **동료 채점 (라운드)** | `/gs/peer-review/round/:roundId` | 배정받은 N건을 매트릭스(표) 형식으로 동시 채점 | `gs/screens/gs-peer-review-round.tsx` |
| 6 | **내 시리즈 추이** | `/gs/series/:seriesId` | 회차별 점수·z-score·순위 변화, 코호트 평균 비교 | `gs/screens/gs-my-series.tsx` |
| 7 | **우수 답안** | `/gs/:roundId/distinguished` | 회차 우수 답안 모음 (운영자 공개 마킹분) | `gs/screens/gs-distinguished.tsx` |
| 8 | **GS 포인트** | `/gs/points` | GS 포인트 잔액 + 적립·차감 이력 | `gs/screens/gs-points.tsx` |
| 9 | **커뮤니티** | `/community` | 수험생 게시판 — **현재 미구현 플레이스홀더** | `community/screens/community.tsx` |
| 10 | **Q&A 목록** | `/qna` | 조문·판례·문제 질문 통합 목록 + 검색·필터 | `qna/screens/qna-list.tsx` |
| 11 | **새 질문** | `/qna/new` | 조문/판례/문제 대상 새 질문 작성 | `qna/screens/qna-new.tsx` |
| 12 | **Q&A 상세** | `/qna/:threadId` | 질문 본문 + 답변 + (강사) 답변 폼 / (질문자) 종료 | `qna/screens/qna-detail.tsx` |
| 13 | **공지사항** | `/announcements` | 학원 공지 수신함 — 펼침 열람 + 자동 읽음 | `announcements/screens/announcements-inbox.tsx` |

> 화면 2·3·4·5 는 GS 응시·채점 흐름(가장 공들일 부분), 6·7·8 은 GS 결과·보상, 10·11·12 는 Q&A, 13 은 공지. 화면 9 는 현재 빈 화면 — §6.9 참조.

### 온라인 GS 도메인 한눈에

> "온라인 GS" = 종이 답안지 기반 변리사 2차(주관식/논술) **정기 모의고사 시스템**. GS 는 2차 영역이므로 시리즈·회차의 과목은 **2차 법 과목(산업재산권법 = 특허·상표·디자인, 민사소송법)** 만 — 1차 전용인 민법은 GS 대상이 아니다. 엔티티 계층:
> `gs_series`(시리즈, 보통 8회) → `gs_rounds`(회차: draft/published/closed) → `gs_questions`(회차별 문제, rubric 보유) → `gs_submissions`(학생 응시) → `gs_submission_pages`(답안지 페이지 슬롯, 1슬롯=1파일, Google Vision OCR 메타 포함) ↔ `gs_question_pages`(페이지↔문항 M:N 매핑).
> 채점: `gs_answers`(강사 채점) 또는 `gs_peer_assignments`+`gs_peer_review_answers`(동료 채점). 보상: `gs_distinguished_answers`(우수 답안) → `gs_points_ledger`(포인트 원장, append-only).

---

## 4. 디자인 방향

### 4.1 톤

> "차분한 자습실 + 명료한 시험장". 응시·채점 화면은 군더더기 없이 또렷하게(시험장), 시리즈 추이·우수 답안·Q&A 는 따뜻하고 차분하게(자습실). 어느 쪽도 과시하지 않는다.

### 4.2 색 · 타이포 · 형태 (디자인 시스템 SSOT 그대로)

- **색**: `colors_and_type.css` 의 Wantedly 토큰. 전경 black-with-alpha, 브랜드 딥 블루 `#2D5BA8`(strong `#1E4789`, deep `#3B6FC4`). 중성 배경 흰색 / `#FAFAFA` / `#EEEEEE`.
- **타이포**: Pretendard 단일. 답안·질문·공지 본문 발췌는 가독성 우선(15~16px / 1.7~1.85 행간). 숫자(점수·z-score·포인트·타이머·순위)는 `tabular-nums` 필수.
- **형태**: 8pt 그리드. 카드 radius `R12`, 히어로/요약 카드 `R16`, chip·pill·아바타 `R100`. 2-layer 중성 그림자. 버튼은 알약형(pill).
- **모션**: in-view reveal, 카운트다운 타이머는 단순 갱신(과한 모션 금지). `prefers-reduced-motion` 존중.

### 4.3 카테고리 색 · 의미색

- **4 카테고리 색 dot** — 탭 strip·헤더 accent 에 절제해 사용: 온라인 GS = **블루** `#2D5BA8` · 커뮤니티 = **바이올렛** · Q&A = **앰버** · 공지사항 = **에메랄드**.
- **의미색** (현재 raw 하드코딩 → 토큰화):
  - 채점 점수: 만점 근접·우수 = **에메랄드 `#10A37F`**, 평균 이하·미흡 = **코랄 `#F65948`**, 중간 = 중립.
  - OCR 판독 등급: good = 중립/에메랄드 · warn = **앰버 `#F7B500`** · bad = 코랄.
  - z-score / 순위: 평균 초과 = 에메랄드 · 평균 미달 = 코랄.
  - GS 회차 단계: 진행 중(open) = 에메랄드 · 예정(upcoming) = 중립 · 마감(closed) = 회색.
  - GS 포인트 적립 = 에메랄드(양수) · 차감 = 코랄(음수).
- **익명 강조**: 동료 채점의 익명 안내는 앰버 tint 박스. 우수 답안은 앰버 accent + `CrownIcon`/`AwardIcon`.

---

## 5. 공통 패턴 — 13개 화면이 공유하는 셸

> **현재의 문제**: 13개 화면이 `mx-auto max-w-screen-* px-5 py-6` 컨테이너 + `<header className="mb-6 space-y-2">` 패턴을 **개별 복제**한다. 공통 컴포넌트가 없다.

### 5.1 페이지 셸

- 가운데 정렬. 폭은 화면 성격에 따라: 목록·허브 `~1040px`, 상세·폼 `~720px`(독서 폭), GS 응시 `~1200px`, 동료 채점 매트릭스 `~1400px`(가장 넓음).
- 좌우 거터 데스크톱 24~40px / 모바일 20px.

### 5.2 커뮤니티 탭 strip (신규 — 영역 연결 조직)

- 화면 헤더 아래에 **4-segment 탭 strip**: `온라인 GS` · `커뮤니티` · `Q&A` · `공지사항`. 각 세그먼트는 카테고리 색 dot + 라벨.
- 현재 영역 세그먼트 = blue 활성. 나머지는 `<Link>` 로 형제 라우트 이동. 데스크톱 가로 정렬, 모바일 가로 스크롤.
- GS 하위 화면(응시·결과·동료채점·시리즈·우수답안·포인트)은 `온라인 GS` 세그먼트가 활성. Q&A 하위(새 질문·상세)는 `Q&A` 활성. 상단에 별도 뒤로가기 링크로 부모 복귀.

### 5.3 화면 헤더

- **eyebrow**: 작은 아이콘 + `COMMUNITY · 커뮤니티`(uppercase 라틴, mono).
- **제목**: 화면명. Pretendard 800.
- **한 줄 설명**: 무엇을 하는 화면인지 + 핵심 상태(공개 회차 수 / 미답변 질문 수 / 미읽음 공지 수 등).
- 하위 화면은 헤더 위에 `← {부모}` 뒤로가기 링크(blue, 작게).

### 5.4 두 가지 리스트 패턴

**(A) 카드 리스트** — GS 회차 목록 · Q&A 스레드 목록 · 공지 수신함
- 카드 1장 = 항목 1건. **헤더 메타 행**(카테고리/상태 badge + 우측 시각/카운트) + 제목 + 발췌 + 액션.
- hover 시 lift + 그림자 강화. 미읽음/대기 상태는 `border-primary/60` + `bg-primary` tint 로 강조.

**(B) 응시·채점 카드** — GS 응시 페이지 슬롯 · 문항 채점 카드 · 동료 채점 카드
- 학습과목 영역 문제 풀이와 같은 시각 언어: 카드 헤더 badge 행 + 본문(`whitespace-pre-line`, 15px/1.8) + rubric/점수 입력 블록.
- 점수 입력은 일관된 컴포넌트로 — 현재 raw `<input type="number">` 산재. rubric criterion 별 입력 + 자동 합계.

### 5.5 GS 응시 페이지 슬롯 그리드 (GS 응시 전용)

- 답안지 페이지 = N개 슬롯 그리드(`2~4열` 반응형). 슬롯 1개 = 1파일(사진/PDF). 빈 슬롯·업로드됨·판독 확인됨 3상태를 또렷하게.
- 슬롯에 OCR 판독 등급 badge(good/warn/bad), 페이지↔문항 매핑 칩, 판독 확인 체크박스. 드래그로 슬롯 순서 교환.
- 좌측 문제 목록(읽기 전용)에서 *아직 매핑 안 된 문항*을 코랄로 경고.

### 5.6 GS 채점 매트릭스 (동료 채점 라운드 전용)

- 배정받은 N개 답안 = 컬럼, 문항·rubric criterion = 행인 표. sticky 첫 컬럼.
- 셀 단위 점수 입력 + 디바운스 자동 저장. 소계·총계·순위 실시간 계산. 현재 raw `<table>` — 깔끔한 컴포넌트로.

### 5.7 빈 상태 · 로딩

- 빈 상태: 아이콘 + 카피 + (해당 시) CTA. 데이터 0 vs 필터 0 카피 구분.
- 상태 렌더 순서: `에러 → 로딩 스켈레톤 → 빈 상태 → 콘텐츠`.

---

## 6. 화면별 명세

### 6.1 온라인 GS 허브 (`/gs`)

학생 GS 진입점. 위→아래 섹션 스택:
- **GS 포인트 카드** — 잔액 + 누적 거래 건수. 클릭 시 `/gs/points`. 앰버 accent + `CoinsIcon`.
- **내 시리즈 추이** — 2열 카드 그리드. 시리즈별 응시 회차 / 예정 회차. 클릭 → `/gs/series/:id`.
- **동료 채점 배정** — 배정받은 답안 목록(라운드별 그룹). 채점 진행도(`N/M 문항`). 클릭 → 동료 채점 화면.
- **회차 목록** — `진행 중` / `예정` / `마감` 3개 섹션. 각 회차 카드 = 회차명 + 과목 badge + 단계 badge + 기간 + 본인 응시 상태(미응시/응시 중/제출/채점 완료) + CTA(응시하기 / 결과 보기).

### 6.2 GS 응시 (`/gs/:roundId/take`)

- 헤더: 회차명 + 과목 badge + **카운트다운 타이머** + 안내 카드(설명/주의/시험지 PDF 링크).
- 본문: `좌측 문제 목록(280px) + 우측 페이지 슬롯 그리드`. §5.5 참조.
- 하단: 제출 카드 — 미매핑 문항·미확인 페이지 경고 후 제출.
- **data-testid 보존**: `gs-submit`, `gs-page-slot-{n}`, `gs-page-grip-{n}`, `gs-page-insert-{n}`, `gs-page-file-input-{n}`, `gs-page-{n}-question-{i}`, `gs-page-confirm-{n}`.

### 6.3 GS 결과 (`/gs/:roundId/result`)

- 3상태 분기: `응시 중`(중앙 안내 카드) / `제출 — 채점 대기`(점수·피드백·모범답안 가림) / `채점 완료`.
- 채점 완료: 헤더 우측 **총점 큰 숫자** + 상태 badge + 우수 답안/모범답안 PDF 링크. 본문 = 답안지 페이지 갤러리 + 문항별 채점 카드(점수·rubric·피드백·모범답안).
- **data-testid 보존**: `result-total-score`, `result-page-{n}`.

### 6.4 동료 채점 — 단건 (`/gs/peer-review/:assignmentId`)

- 헤더: 회차명 + 과목 + 제출완료/진행중 badge + **익명 안내 카드**(앰버 tint — "익명 답안입니다").
- 본문: 문항별 채점 카드 — 익명 답안 페이지 + OCR 텍스트 + rubric criterion 별 점수 입력 + 피드백 textarea + 모범답안. 하단 "채점 제출".

### 6.5 동료 채점 — 라운드 (`/gs/peer-review/round/:roundId`)

- 가장 넓은 폭. §5.6 매트릭스. 문항별 매트릭스 카드 + 종합 순위 표 + 답안별 제출 버튼. 셀 자동 저장.
- 배정 0건이면 좁은 폭 빈 상태.

### 6.6 내 시리즈 추이 (`/gs/series/:seriesId`)

- 헤더: 시리즈명 + 과목 + 예정 회차.
- 본문: ① 4칸 요약 카드(응시 회차 / 평균 점수 / 평균 z-score / 시리즈 순위), ② 회차별 코호트 비교 표(본인 vs 코호트 평균·표준편차), ③ z-score 추이 — 인라인 막대 시각화(차트 라이브러리 없이 div, 평균 초과/미달 색 구분).

### 6.7 우수 답안 (`/gs/:roundId/distinguished`)

- 헤더: `← 내 결과로` + `AwardIcon` eyebrow + 회차명.
- 본문: ① 회차 종합 우수자 카드(`CrownIcon`), ② 문항별 우수 답안 카드(문제 + 모범답안 + 우수 답안 목록). 우수 답안 1건 = 답안 페이지 + 사유 + 작성자(익명/공개). 앰버 accent.
- **data-testid 보존**: `distinguished-{distinctionId}`.

### 6.8 GS 포인트 (`/gs/points`)

- 헤더: `CoinsIcon` eyebrow + "GS 포인트".
- 본문: ① 잔액 카드(큰 숫자 + 누적 거래 건수), ② 적립·차감 이력 표(시각 / 유형 / 내용 / 금액 — 양수 에메랄드, 음수 코랄).

### 6.9 커뮤니티 (`/community`)

> **현재 상태**: DB·스키마·loader 전무. `ComingSoon` 플레이스홀더만 렌더.

- **이번 작업 범위**: 커뮤니티 셸 안에서 **정돈된 "준비 중" 상태**를 디자인한다 — 아이콘 + "커뮤니티는 준비 중입니다" + 향후 제공 기능 한 줄 안내. 빈 화면이 아니라 *의도된* 대기 화면.
- **범위 밖**: 게시판 데이터 모델(글·댓글·좋아요 등) 신설은 별도 기획. 이 brief 는 게시판을 설계하지 않는다. mockup 에서는 향후 IA 스케치(자유게시판 / 스터디 모집 / 합격 후기 탭)를 *비활성 미리보기*로만 제시해도 좋다.

### 6.10 Q&A 목록 (`/qna`)

- 헤더: "Q&A" + 우측 `새 질문` 버튼.
- 필터: 검색 인풋 + 분류 칩(전체 / 내 질문 / 내 답변 / 답변 대기) + 대상 칩(전체 / 조문 / 판례 / 문제).
- 목록: 스레드 카드 — 대상 badge + 상태 badge(답변 대기/완료) + 품질 등급(상/중/하) + 제목 + 질문자·답변자 + 시각. `답변 대기`는 강조.

### 6.11 새 질문 (`/qna/new`)

- `?targetType=&targetId=` 쿼리로 진입(조문/판례/문제 뷰어 우측 패널에서). 헤더: `← Q&A 목록`.
- 단일 카드: 대상 badge + 라벨 + 제목 인풋 + 내용 textarea + 취소/등록.
- 등록 성공 시 같은 화면을 성공 상태(중앙 텍스트 + 목록/내 질문 버튼)로 교체.

### 6.12 Q&A 상세 (`/qna/:threadId`)

- 헤더: `← Q&A 목록`.
- 본문: ① 질문 카드(대상·상태·품질 badge + 대상 링크 + 제목 + 작성자/시각 + 본문), ② 답변 카드(있을 때 — `답변` badge 에메랄드), ③ 조건부: 강사·미답변이면 답변 폼(textarea + 질문 수준 상/중/하 칩), 질문자·답변완료면 스레드 종료 버튼.

### 6.13 공지사항 (`/announcements`)

- 헤더: `MegaphoneIcon` + "공지사항" + 건수·미읽음 카운트. `안 읽음만` 필터 체크박스.
- 본문: 공지 카드 스택. 카드 = 제목 + 대상(전체/반/개인) badge + 고정(`isPinned`) 표시 + 발행일. **미읽음 카드는 `border-primary/60` + `bg-primary` tint**. 클릭 시 본문 펼침(`MarkdownView`) + 자동 읽음.

---

## 7. 애니메이션

- **카드/행 진입**: in-view fade-up stagger. `IntersectionObserver` 한 번만, 긴 리스트는 상위 N개만.
- **공지 카드 펼침**: height 트랜지션 + chevron rotate.
- **탭 strip**: 활성 인디케이터 slide.
- **GS 페이지 슬롯 드래그**: 드래그 중 lift + 드롭 위치 표시.
- **카운트다운 타이머**: 1초 단순 갱신. 잔여 5분 이하 코랄 전환 정도만.
- **점수 카운트업**: GS 총점·시리즈 요약 숫자는 진입 시 count-up (선택).
- 전 구간 `prefers-reduced-motion: reduce` 시 모션 정지. transform/opacity 만.

---

## 8. 데이터 (구현 참고 — 디자인 시 데이터 형태 파악용)

각 화면 loader 반환. 디자이너는 현실적인 mock 값으로 디자인한다.

| 화면 | loader 반환 (요지) |
|------|----|
| GS 허브 | `views`(회차+phase+본인 제출), `peerAssignments`(배정), `mySeries`(시리즈+응시수), `points`(잔액·건수) |
| GS 응시 | `round`, `submission`, `questions`(rubric), `pages`(첨부·OCR·매핑·판독확인), `paperUrl` |
| GS 결과 | `state`("in-progress"/"submitted"/"graded") + `round`·`submission`·`questions`·`answers`·`pages`·`attUrls`·`answerKeyUrl` |
| 동료 채점(단건) | `round`, `questions`, `assignment`, `pagesByQuestion`, `ocrTextByQuestion`, `myAnswers` |
| 동료 채점(라운드) | `round`, `questions`, `columns`(답안별 페이지·OCR·채점) |
| 시리즈 추이 | `series`, `progress`(회차별 본인·코호트), `summary`(평균·순위) |
| 우수 답안 | `round`, `questions`, `items`(round/question + distinction + pages) |
| GS 포인트 | `balance`, `ledger`(적립·차감 행) |
| Q&A 목록 | `threads`, `scope`, `targetType?`, `query`, `currentUserId` |
| 새 질문 | `targetType`, `targetId`, `target`(라벨·링크) |
| Q&A 상세 | `thread`(질문+답변), `currentUserId`, `isStaff`, `target` |
| 공지사항 | `items`(공지 + 미읽음 여부), `unreadOnly` |

---

## 9. 절대 수정 금지 / Out of scope

- ❌ 네비게이션 "커뮤니티" 메뉴의 라벨·링크, `navigation-bar.tsx` / `footer.tsx`.
- ❌ 라우트 추가·변경 — 13개 화면 고정.
- ❌ DB 스키마 · loader 쿼리 로직 — GS 채점 계산(z-score·순위·rubric 합), 동료 채점 배정, 포인트 원장, Q&A·공지 쿼리 의미 그대로. 본 작업은 시각 디자인.
- ❌ 응시·채점·제출 API 엔드포인트(`/api/gs/*`, `/api/qna/thread`, `/api/announcements/read` 등) 및 동작 로직. OCR·signed URL 발급 흐름.
- ❌ 학습과목 영역의 조문·판례·문제 **뷰어** — Q&A 대상 클릭 시 그쪽으로 이동(별도 `ui_kits/lidam-subjects/` 소관).
- ❌ 운영자용 GS 관리 화면(`admin-gs-*`) — 별도 `admin-redesign-brief.md` 소관.
- ❌ 커뮤니티 게시판 데이터 모델 신설 — §6.9 참조.
- ❌ 기존 `data-testid` 제거·변경 — E2E 의존(`gs-submit`, `gs-page-slot-*`, `gs-page-grip-*`, `gs-page-insert-*`, `gs-page-file-input-*`, `gs-page-*-question-*`, `gs-page-confirm-*`, `result-total-score`, `result-page-*`, `distinguished-*`). 마크업에 그대로 유지. 그 외 화면은 testid 없음 — 재설계 시 추가 권장.
- ❌ shadcn 기본 톤 잔존 — 디자인 시스템 블루로 통일.

---

## 10. 기술 제약 (코딩 단계 참고)

실제 구현은 React Router 7 (SSR) + TypeScript strict + Tailwind v4 + shadcn(New York) + lucide-react + Vercel (Node SSR).

- 신규 npm 패키지·이미지/폰트 자산 도입 금지. 외부 스크립트 금지. 차트는 div 기반 인라인 시각화 유지(차트 라이브러리 도입 금지).
- 학습정보·학습보조와 같은 구현 방식 — **Tailwind 유틸리티 클래스** 기반, 블루는 디자인 시스템 토큰(`bg-primary` 등). 상태색(emerald/amber/rose)은 의미색 컨벤션으로 통일.
- **다크 모드 지원** — `dark:` 변형. 디자인 시 두 모드 모두 제공.
- 모바일 반응형 필수 — GS 응시 슬롯 그리드 1열, 채점 매트릭스 가로 스크롤, 탭 strip 가로 스크롤.
- PDF 는 `<iframe>`, 답안지 페이지는 signed URL `<img>` — 현 구현 유지.
- 파일 길이 목표 300줄 — §5 공통 셸·페이지 헤더·탭 strip·카드·응시 슬롯·채점 매트릭스를 컴포넌트로 추출(`app/features/{gs,qna,announcements}/components/` 또는 공통 `app/features/community/components/`).
- 컴포넌트는 표시 + 이벤트 연결만. `console.log` 잔류 금지. `any` / `@ts-ignore` 금지.
- 접근성(WCAG AA): 탭 strip·카드 링크는 `<Link>`/`<button>`. 채점 점수 입력은 `<label>` 연결. 카운트다운 타이머는 `aria-live` 적절히. 상태색은 색 + 라벨/아이콘 병기.

---

## 11. 우선순위 — 디자이너가 시간을 어디에 쓸지

1. **공통 셸 1벌** (§5) — 페이지 셸 · 커뮤니티 탭 strip · 헤더 · 카드 리스트 패턴 · 빈 상태. 13화면 공유.
2. **GS 응시 + 결과** — 페이지 슬롯 그리드, 채점 카드. 가장 복잡하고 학습과목 퀴즈와 시각 일관.
3. **동료 채점 (단건 + 라운드 매트릭스)** — 익명 처리, 매트릭스 컴포넌트.
4. **GS 허브 + 시리즈 추이 + 우수 답안 + 포인트** — 카드 섹션, z-score 시각화.
5. **Q&A 3화면** — 목록 · 작성 · 상세.
6. **공지사항** — 수신함 카드, 미읽음 강조.
7. **커뮤니티 "준비 중" 상태** — §6.9.
8. **빈 상태 / 로딩 스켈레톤**.

---

## 12. 점검 체크리스트 (mockup 완성 시)

- [ ] §3 의 13개 화면이 모두 디자인됐다.
- [ ] 커뮤니티 탭 strip 으로 4개 하위 영역을 서로 오갈 수 있다.
- [ ] GS 응시·채점 화면이 학습과목 문제 풀이와 시각 언어가 일관된다.
- [ ] 응시 페이지 슬롯의 빈/업로드/판독확인 3상태가 또렷하다.
- [ ] 동료 채점 매트릭스가 깔끔한 표 컴포넌트로 정리됐다 (raw `<table>` 탈피).
- [ ] 익명 채점이 익명임을 분명히 표시한다.
- [ ] 의미색(점수·OCR·z-score·포인트)이 raw 팔레트 하드코딩 대신 일관된 컨벤션을 따른다.
- [ ] 미읽음 공지·답변 대기 질문이 시각적으로 또렷하다.
- [ ] 커뮤니티(`/community`)가 빈 화면이 아니라 의도된 "준비 중" 상태다.
- [ ] 빈 상태가 화면별로 디자인됐고, 데이터 0 vs 필터 0 카피가 구분된다.
- [ ] 색·타이포·radius·그림자·모션이 `colors_and_type.css` 와 일치한다 (shadcn 기본 톤 잔존 0).
- [ ] 데스크톱 / 태블릿 / 모바일 반응형. light·dark 두 모드 모두.
- [ ] 한국어 카피가 §6 표기 그대로다. 네비 라벨 "커뮤니티" 변경 금지.

---

## 13. 참고

- 콘텐츠 · 네비게이션 · voice 규칙: `landing-redesign-brief.md`.
- 디자인 토큰 SSOT: `colors_and_type.css`.
- 완성된 UI kit: `ui_kits/lidam-web/` · `lidam-dashboard/` · `lidam-subjects/` · `lidam-study-aids/` · `lidam-latest/` — 같은 톤·컴포넌트 패턴 재사용.
- Q&A 기능 명세: `docs/features/feat-qna.md`. GS·공지 전용 명세 문서는 미작성(코드 주석 feature ID 참조).
- 운영자용 GS 관리·공지 발송 화면은 `admin-redesign-brief.md` 소관.

— 끝.
