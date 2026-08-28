# SPEC.md — 리담변리사학원 (변리사 학습 플랫폼)

> 이 문서는 기능 로드맵과 진행 상태의 Single Source of Truth. **메뉴 진입 단위로 작업 구간(섹션)이 분할되어 있다.** 각 메뉴의 하위 화면이 곧 feature 묶음. 기능 착수/완료 시 본 문서의 상태(🔲 → 🟡 → ✅)를 갱신한다.

## 범례
- 🔲 미착수 · 🟡 진행 중 · ✅ 완료 · ⛔ 보류
- `P0` 출시 필수 · `P1` 출시 직후 · `P2` 향후

---

## 1. 프로젝트 개요

### 목표
변리사 1·2차 시험 수험생이 **법령 조문 / 대법원 판례 / 객관식·주관식 문제 / 논문**을 메뉴 트리를 따라 체계적으로 학습하고, 학습 진도·약점을 한눈에 파악할 수 있는 통합 플랫폼.

### 핵심 차별점
1. **메뉴 진입 트리** — 과목별 학습 → 산업재산권법 → 특허법 → 조문/판례/문제로 자연스러운 계층 진입
2. **3자 연관관계 그래프** — 조문 ↔ 판례 ↔ 문제, 어디서 진입하든 관련 자료로 곧장 이동
3. **콘텐츠 자체 추적** — 법 개정, 신규 판례, 신규 문제, 신규 논문이 "최신 정보" 메뉴에 자동 집계
4. **과목 특성별 학습 구조** — 법률 과목(조문+판례+문제) vs 자연과학(문제만)
5. **역할 기반 콘텐츠 파이프라인** — 강사가 콘텐츠를 일상적으로 업데이트, 운영자가 사용자/결제 관리

### 시험 구조 (도메인 컨텍스트)
- **1차 시험**: 객관식. 산업재산권법(특허·상표·디자인보호법), 민법, 자연과학(물리/화학/생물/지구과학 **4과목 모두 필수**)
- **2차 시험**: 주관식/논술. 산업재산권법, 상표법, 민사소송법 등
- **자연과학**: 1차 필수과목 (4과목 모두 응시). 변리사 시험에서 조문/판례 개념 없이 **객관식 문제만** 다룸

### 범위 외 (YAGNI, v1에서 제외)
- 라이브 강의/영상 스트리밍 (외부 링크 위임)
- 다국어
- 해외 결제
- AI 자동 해설 생성 (단, 콘텐츠 검색 기반 RAG 질의응답은 §5.9 feat-9 로 별도 계획 — v1 이후)

---

## 2. 메뉴 구조 (전체 사이트맵)

```
1. 대시보드
2. 학습목표 및 과목별 진도
3. 최신 정보
   ├─ 법 개정
   ├─ 최근 판례
   ├─ 객관식 문제
   ├─ 주관식 문제
   ├─ 논문
   └─ 도서 추록·정오표
4. 과목별 학습
   ├─ 민법                    [조문/판례/문제]
   ├─ 산업재산권법
   │   ├─ 특허법              [조문/판례/문제]
   │   ├─ 상표법              [조문/판례/문제]
   │   └─ 디자인보호법         [조문/판례/문제]
   ├─ 민사소송법              [조문/판례/문제]
   └─ 자연과학
       ├─ 물리                [문제만]
       ├─ 화학                [문제만]
       ├─ 생물                [문제만]
       └─ 지구과학            [문제만]
5. 온라인 GS  (placeholder, P1+)
6. 커뮤니티   (placeholder, P1+)
7. 운영자     (P0 일부 + P1+)
```

상세 화면 구성은 `docs/screens.md` 참고.

---

## 3. 도메인 모델 (한눈에)

```
                ┌─────────────┐
                │    law      │ 특허·상표·디자인·민법·민사소송법
                └──────┬──────┘
                       │ 1:N
                ┌──────▼──────┐            ┌──────────────────┐
                │   article   │◄───────────│ article_revision │
                │ (조/항/호/목)│            └──────────────────┘
                └──┬────────┬─┘
                   │        │   M:N (relations 5종)
                   ▼        ▼
              ┌────────┐  ┌────────┐
              │  case  │  │problem │   ← 자연과학 problem은 article/case 연결 없음
              │ (판례) │  │ (문제) │       (subject_type='science')
              └────────┘  └────┬───┘
                              │
                       ┌──────▼──────────┐
                       │ science_section │ 물리/화학/생물/지구과학의 단원
                       └─────────────────┘

           ┌──── papers ────┐  논문 (최신 정보 메뉴에서 노출)
           └────────────────┘

        ┌──────── user (profiles) ────────┐
        │  role: student | instructor | admin │
        └─┬──────┬──────┬──────┬──────┬────┘
          ▼      ▼      ▼      ▼      ▼
        memo  bookmark highlight progress attempt   (모두 polymorphic)
```

**자연과학 모델 분기**: `problem.subject_type`이 `'law'`(법률)인지 `'science'`(자연과학)인지로 구분. 자연과학 문제는 `science_subject` (`'physics'|'chemistry'|'biology'|'earth_science'`) + `science_section` (단원) 분류만 사용.

---

## 4. 역할별 권한 매트릭스

4단계 등급 — **원장 > 관리자 > 강사 > 수험생** (`user_role` enum `admin/manager/instructor/student`). 상세: `docs/features/feat-7-031-roles.md`.

| 기능 | 수험생 | 강사 | 관리자 | 원장 |
|------|:-----:|:---:|:-----:|:---:|
| 콘텐츠(조문/판례/문제/논문) 읽기 | ✅ | ✅ | ✅ | ✅ |
| 본인 메모/즐겨찾기/하이라이트/진도 | ✅ | ✅ | ✅ | ✅ |
| 콘텐츠 CRUD (조문 개정·판례·문제·논문·연관관계·빈칸) | ❌ | ✅ | ✅ | ✅ |
| 온라인 GS 운영·채점 | ❌ | ✅ | ✅ | ✅ |
| 반·커리큘럼·과제·학생 진도 | ❌ | 자기 반 | 전체 | 전체 |
| 커뮤니티 모더레이션 | ❌ | (반 한정) | ✅ | ✅ |
| 사용자 목록·공지·감사 로그·합격데이터 운영·인증 | ❌ | ❌ | ✅ | ✅ |
| 결제·수강 내역 조회 / 수강권 부여·환불 | ❌ | ❌ | ✅ | ✅ |
| 요금제·가격·PG 설정 | ❌ | ❌ | ❌ | ✅ |
| 역할 변경·강사 임명 | ❌ | ❌ | ❌ | ✅ |
| 운영자 메뉴 진입 | (안내) | ✅ | ✅ | ✅ |

> 역할 변경은 원장 전용(`updateUserRole` API) + `profiles` 트리거로 self-escalation 차단. RLS 는 `private.is_staff`(강사+)·`private.is_manager`(관리자+) 함수로 등급 판정.

---

## 5. 기능 로드맵 (메뉴 진입 단위)

### 작업 단위 명명 규칙
`feat-{메뉴번호}-{서브번호}` 형태. 메뉴 트리 위치를 보면 어느 화면에서 다루는 기능인지 즉시 파악 가능.

- `5.0` 인프라 (메뉴 무관 횡단)
- `5.1` 메뉴 1 = 대시보드
- `5.2` 메뉴 2 = 학습목표 및 과목별 진도
- `5.3` 메뉴 3 = 최신 정보 (5개 탭)
- `5.4` 메뉴 4 = 과목별 학습 (A: 법률, B: 자연과학)
- `5.5` 메뉴 5 = 온라인 GS
- `5.6` 메뉴 6 = 커뮤니티
- `5.7` 메뉴 7 = 운영자

---

## 5.0 인프라 & 공통 (Foundation)

화면별 메뉴와 무관한 횡단 기반.

| ID | 기능 | 우선순위 | 상태 |
|----|------|:-------:|:---:|
| feat-000-001 | React Router 7 + Vercel SSR 부트스트랩 | P0 | ✅ |
| feat-000-002 | Supabase Auth (이메일/비밀번호, 매직링크, 소셜) | P0 | ✅ |
| feat-000-003 | Drizzle + Supabase 연결, RLS 기본 정책 | P0 | ✅ |
| feat-000-004 | `profile` 테이블 + 역할(student/instructor/admin) | P0 | ✅ |
| feat-000-005 | 역할 기반 가드 (`requireAuth`, `requireRole`) | P0 | ✅ |
| feat-000-006 | shadcn/ui 도입 + 테마(라이트/다크) | P0 | ✅ |
| feat-000-007 | 상단 네비게이션 (메뉴 트리, 드롭다운, 모바일 햄버거) — 7 top-level 그룹핑(`d33a08e`) | P0 | ✅ |
| feat-000-008 | Resend 연동 + 가입/비밀번호 재설정 템플릿 | P0 | ✅ |
| feat-000-009 | 전역 검색 — Command Palette (⌘K, 조문/판례/문제 통합) + 검색 ranking + 최근 검색어 히스토리 | P1 | ✅ |
| feat-000-010 | Sentry 에러 모니터링 (`@sentry/react-router` + browser/node profiling) | P1 | ✅ |
| feat-000-011 | 콘텐츠 공통 스키마 (`articles`, `article_revisions`, `cases`, `problems`) | P0 | ✅ |
| feat-000-012 | Polymorphic 주석 시스템 (북마크/메모/하이라이트, target_type/id) | P0 | ✅ |
| feat-000-013 | 5종 연관관계 스키마 + RLS | P0 | ✅ |
| feat-000-014 | 학습 진도 자동 기록 미들웨어 (loader hook) | P0 | ✅ |
| feat-000-015 | `daily_study_stat` 일별 집계 배치 (읽기 시점 GROUP BY; Workers Cron 보류) | P1 | ✅ |
| feat-000-016 | **단일 세션 강제(중복 로그인 차단)** — 계정당 현재 유효 세션 1개(`profiles.active_session_id`), 새 로그인이 갈아치움(last-login-wins). 학생 한정. `lidam_sid` httpOnly 쿠키 vs DB 비교를 `private.layout`에서 매 요청 강제, 불일치 시 이 기기만 `signOut(local)` + `/login?reason=other-device`. SECURITY DEFINER RPC(`claim_session`/`release_session`). 무중단 롤아웃(컬럼 nullable=기존 사용자 다음 로그인부터). 2단계(유휴 하트비트·민감 API 차단·이전 기기 토큰 폐기) 완료·배포. 상세: `docs/features/feat-000-016-single-session.md` | P1 | ✅ |

상세 스펙: `docs/architecture.md`, `docs/db-schema.md`, `docs/spec-detail-foundation.md` (작성 예정).

---

## 5.1 메뉴: 대시보드 (`/dashboard`)

수험생이 로그인 후 처음 보는 학습 현황 종합 화면.

| ID | 기능 | 우선순위 | 상태 |
|----|------|:-------:|:---:|
| feat-1-001 | 대시보드 진입 가드 + 인사말/D-day 헤더 | P0 | ✅ |
| feat-1-002 | 전체 학습 진척도 카드 (원형 차트, 법령/판례/문제) | P0 | ✅ |
| feat-1-003 | 이번 주 학습 카드 (요일별 + streak) | P0 | ✅ |
| feat-1-004 | 과목별 진척도 카드 5개 (법률 과목, 클릭 시 과목 진입) | P0 | ✅ |
| feat-1-005 | 자연과학 진척도 카드 — 대시보드에 4과목 (물리/화학/생물/지구과학) 풀이 수·정답률 표시. 문제 미시드 과목은 dim 처리. 카드 클릭 시 해당 science hub 로 이동. | P1 | ✅ |
| feat-1-006 | 신규 개정 · 판례 알림 위젯 (최신 정보 메뉴로 링크) | P0 | ✅ |
| feat-1-007 | 오늘의 학습 목표 카드 (목표 진척도 + 빠른 진입 액션) | P0 | ✅ |
| feat-1-008 | 즐겨찾기 빠른 접근 (조문/판례/문제 chip) | P1 | ✅ |
| feat-1-009 | 최근 학습 피드 (시간순 활동 로그) | P1 | ✅ |
| feat-1-010 | 약점 지표 위젯 (정답률 하위, 미학습, 재도전 추천) | P1 | ✅ |

상세 스펙: `docs/spec-detail-5-1-dashboard.md` (작성 예정).

---

## 5.2 메뉴: 학습목표 및 과목별 진도 (`/goals`)

시험 일자 + 목표 점수 기준으로 과목별 권장 진도와 현재 진도의 차이를 시각화. "목표 vs 현재"의 차이에 집중.

| ID | 기능 | 우선순위 | 상태 |
|----|------|:-------:|:---:|
| feat-2-027 | **동기부여 게임화 (자기 진척 + 공부량 구간)** — 기존 학습 지표(진도·정답률·약점·SRS·공부량)를 "게임 옷" 입혀 꾸준함·질 높은 학습 유도. **게임화 개념은 전부 신설**(레벨/마스터리/뱃지 컬럼 0건 확인, `gs_points_*`는 논술채점이라 재사용 부적합, 스트릭만 `getDailyStudyStats.currentStreak` 계산기 존재·영속 없음). **자기진척(성장)**: ① 단원 마스터리 `학습중→익숙→마스터`(★질 게이트 = 정답률 + SRS 파지 reps≥2, 문제 수 아님 → 찍기·양치기 차단) ② 전체 레벨(마스터단원수 주축·단계명, 누적XP 아님) ③ **약점 정복**(약점 노드 해소 시 "정복!" — 약점진단 직결, 동기 최강) ④ 스트릭(★주간 케이던스 1차 프레이밍·회복가능·죄책감 없음). **공부량 구간**: ★1~N 순위 아님 — 백분위/구간("상위 30%")+나의 성장(지난주 대비), 코호트 비교는 **B(pool) 동의 게이트**(`hasPoolConsent` fail-closed, 미동의=본인 성장만, 대칭). 재료=`getCohortAggregateStats`+rank, 학습시간 합산 헬퍼만 신규. **함정 회피 4원칙 내장**(질 보상·스트릭 가볍게·뱃지=학습의미·구간≠순위) 메커닉별 검증표. **단계안**(위험 낮은 순): Phase1 자기진척(파생·신규스키마 0·A동의) → Phase2 레벨+스트릭 영속(`user_gamification` 신규) → Phase3 코호트 구간(B게이트). 표시는 별도 게임화면 X, `/study/stats`·`/dashboard` 증강. 설계 `docs/features/동기부여-게임화-설계.md`. **Phase 1(자기진척) 구현 완료**: 순수 마스터리 코어(`study/lib/mastery.ts` `computeNodeMastery`/`summarizeMastery` + 단위테스트 12 — ★양치기 차단 박제) · 서버 `getNodeMastery`(`study/mastery.server.ts`, 노드별 정답률 + SRS 평균 reps·overdue 파생, 문제→노드 매핑은 getSessionWeakNodes 미러) · `/study/stats` 한눈에 탭 **"단원 마스터리" 카드**(분포 바 + 정복=마스터 단원, A동의 게이트·디자인 SSOT 토큰·담백 톤). 실데이터 검증: 학기초라 마스터 희소(정답률 85%+ 노드 10개도 reps<2로 익숙 — 파지 게이트 정상) → 복습 선순환. 스키마 0(전부 파생). typecheck/build/테스트 통과, 라이브 확인 대기. **Phase 2(레벨+스트릭) 구현 완료**: 전체 레벨(파생 — 마스터 단원수 → 입문/정진/숙련/정통/통달, `study/lib/level.ts` + 테스트, XP 아님)·스트릭(`user_gamification` 테이블 적용+self RLS, 주간 케이던스 "이번 주 N일" + freeze 보호 연속 `study/lib/streak.ts` + 테스트, `gamification.server.ts` 표시값 즉시·영속 runAfterResponse)·`/study/stats` 한눈에 탭 **"성장" 카드**(현재 단계 + 다음 단계 격려 + 이번주/연속/최장, 담백·학기초 격려·SSOT·A동의). 임계 0/3/8/15/25는 ★데이터 플래그(학기초 대부분 입문 정상). typecheck/build/단위테스트25 통과. **Phase 3(공부량 코호트 구간) 구현 완료**: 자기성장(★주축 — 이번주/지난주 대비, A동의만)+코호트 구간(양념 — "상위 N%"·4구간 상위권/평균이상/중위/**꾸준히 쌓는 중**, ★순위·리더보드 아님). 안전 3중=B(pool)동의 게이트(미동의=본인성장만)·대칭 표본(B동의 peer만 `pool_consent_at`)·표본가드 `MIN_COHORT_PERCENTILE_SAMPLE=10`(★런타임 N체크=**자동활성화**, 현재 코호트 B동의 1명→잠김, 정식오픈·동의↑면 코드변경0 자동 ON). adminClient 집계(개인식별자/개별값 미반환·격리, `cohort_members` 학생 self-read RLS 없어 필수=코드가 방어선). 모집단=내 반(★공정, 여러반 열려도 cross-mix0). 합격률 비교 영구 제외. 파생(신규테이블 0). `study/lib/study-volume.ts`+테스트·`study/cohort-percentile.server.ts`·`/study/stats` "공부량" 카드. typecheck/build/단위테스트37 통과. **Phase 1·2·3 전부 구현 완료, 라이브 확인 + 정식오픈 후 구간 자동활성화 대기.** | P2 | 🟡 |
| feat-2-029 | **판례 단계별 암기 사다리 (요지 중심 + OX 기출 유래 자동 빈칸)** — 조문에만 있던 단계별 암기(빈칸→소제목→전체→SRS)를 판례에 구축. 판례는 현재 암기카드(SRS)만. 사다리 = ⓪쟁점 도출(issue-spotting, ★학생/운영자 토글로 배제 가능) → ①요지 핵심어 빈칸 → ②쟁점만 보기·요지 복원 → ③식별자만·전체 복원 → ④SRS(기존). 요지 중심(이유 verbatim 아님). ★핵심 = **①빈칸 자동후보를 1차 기출 OX X(거짓)지문에서 추출** — 출제자가 "무엇을 바꿔 거짓으로 만들었나"=시험 핵심어. `problem_case_links`+`getExamProblemsForCase`로 판례 연결 기출의 `ox_truth=X` 지문 수집 → AI가 거짓지문 vs 요지 대조해 함정 키워드 도출 → 요지 내 위치+근거OX 부착 → **운영자 승인 큐**(ox-article-matching 패턴, 자동노출 금지). 데이터=`case_blank_sets`(article_blank_sets 미러, summary_items body cloze). Phase 1(②③ UI토글·데이터0) → Phase 2(①빈칸+OX후보 파이프라인) → Phase 3(⓪ fact stem AI+토글) → Phase 4(판례 빈칸 SRS). **S1~S5 구현 완료**: S1 ②③ 뷰어 토글(★staff 게이트 — 수험생 미노출) · S2 `case_blank_sets` 스키마+조회 · S3 판례 빈칸 렌더러 `CaseBlankFillView`+뷰어 ①토글 · S4 후보 AI 파이프라인(`case_blank_candidates`, 특허 327건 적재) · S5 승인 큐 `/admin/blanks/cases`(승인→판례별 '기출 유래' 세트 기록·정답 인라인 수정·거절·되돌리기, E2E 검증) · **후보 일괄 검수 완료**(표본 수동 22 + AI 재분류 direct/indirect 일괄 → 승인 267·대기 12·거절 48, 152개 판례) · **뷰어 인라인 편집**(①빈칸 풀기↔편집 토글 — 드래그 새 빈칸/chip × 제거, 제거 시 승인 후보 rejected 동기화, `appendBlankToAutoSet` 공용 진입점, E2E). **조문 이식 완료(상표·디자인 준비)**: 조문 뷰어 인라인 편집(내용 빈칸 풀기↔편집, 내 세트, E2E)+빈칸 화면 prev/next(모드 유지 파라미터) · 조문 후보 파이프라인(`article_blank_candidates`+gen 스크립트+승인 큐 `/admin/blanks/article-candidates`) · 선행 백필(ox_truth 상표1,130/디자인1,060 · 명시인용 매핑 상표469/디자인205). **잔여 = 판례 대기 12건·조문 후보 검수(운영자) → staff 게이트 해제 판단, OX 미매핑 AI 매칭 후보·Phase 3·Phase 4 후속.** 설계 docs/features/feat-2-029-case-memorization-ladder.md | P2 | 🟡 |
| feat-2-028 | **2차 전환 사다리 — 기출 기반 쟁점·결론·목차 훈련** — 눈공부(재인)→손공부(산출) 전환 지원. ★진단(2026-07-07 실측): 쟁점추출 모듈(①쟁점→③결론→④응용목차 outlineMd)·판례 훈련(/case-training)·AI 초안·승인 큐 전부 구현돼 있으나 콘텐츠·사용 0(items 2·승인 0·시도 0, gs_question_issues 0) + 2차 기출 192문항은 열람 전용. **결정 = 신규 트레이너 신설 아님** — case_training_items 소스 확장(case_id XOR problem_id)으로 2차 기출을 기존 트랙에 태우고 콘텐츠 파이프라인(AI 초안 대량 생성→원장 승인)을 채운다. Stage1 ✅(dd170e6 — DDL·기출 피커·AI 초안·목록 배지·학생 가드) / Stage2 ✅(a515e93 — 학생 응시 기출 렌더·가드 해제·목차 소프트타이머·nav "쟁점·목차 훈련") / Stage3 ✅(889af6b — 특허 2차 32문항 AI 초안 생성 완료: 쟁점 184·결론 전건, 전부 draft=원장 승인 큐 대기, ~$2.25 / /study/stats 한눈에 '손공부' 카드). **잔여 = 원장 검수·승인(/admin/case-training)만 — 승인 즉시 학생 노출.** 설계 docs/features/feat-2-028-second-round-training-ladder.md | P1 | 🟡 |
| feat-2-026 | **복습 전용 러너 (풀기형 세션 + 조문 정독 읽기)** — `/study/srs` 표 행이 `/subjects/{과목}/...`로 단건 scatter 하던 것을 **묶음 세션 러너**로 전환(점검 `docs/survey/복습전용화면-점검.md`, 방향 = (b)갈래분리+(a)한입구 하이브리드). 혼재 실체 = 풀기 다수(MCQ·빈칸·OX) + 보기 하나(조문 정독). **Stage 1**(MCQ): API `session-from-srs`(과목별 due 묶음 → `createQuizSession` scope=`filter`+`scopePayload{source:srs,backHref:/study/srs}` → 첫 문제 `?session=` redirect, 패턴=`session-from-wrong`), `problem-viewer` 라벨·뒤로가기 `scopePayload.originLabel`/`backHref` 제너릭 override, `quiz-result` "복습으로" 복귀, `srs.tsx` MCQ 섹션 과목별 "복습 시작" 버튼. **제약**: 세션=단일 과목(`createQuizSession` lawCode XOR) → MCQ 러너는 과목별 세션. scope "srs" enum 없어 "filter" 재사용(마이그 0). **Stage 2** = ① 조문 정독을 읽기 전용 클릭 리스트로(읽기≠풀기 명시, 러너 강제X) + ② 빈칸 러너(조문 뷰어 `?blankReview=1` param-gated — 콘텐츠 빈칸 모드 자동 진입 + 같은 과목 due 세트 "다음 세트" 서버 재계산, 세션 불필요). **Stage 3** = ① 허브 "오늘 복습할 것" 요약 밴드(종류별 due 한눈+정오문제 러너 바로가기) ② OX 러너 한 문항씩 prev/next(답안 부모로 올려 유지) ③ MCQ "답 없이 해설 보기" 보기 게이트(`showAnswers=(revealed||viewMode)&&!isExam`, `?view=1` 딥링크, 미선택 verdict 중립, attempt 미기록=읽기≠풀이). Stage 1·2·3 전부 구현·푸시·typecheck+build 통과, 라이브 검증 대기. 설계 `docs/features/feat-2-026-review-runner.md`. | P1 | 🟡 |
| feat-2-001 | 목표 설정 화면 (시험일·목표점수·일일학습량·목표과목) | P1 | ✅ |
| feat-2-002 | 권장 진도 계산 엔진 (D-day 기반 일평균 권장량) | P1 | ✅ |
| feat-2-003 | 목표 vs 현재 KPI 카드 3종 (D-day · 조문 · 문제) | P1 | ✅ |
| feat-2-004 | 과목별 진도 상세 테이블 (조문/문제/정답률) | P1 | ✅ |
| feat-2-005 | 과목별 "학습하러 가기" 버튼 (해당 과목 허브로 이동) | P1 | ✅ |
| feat-2-006 | 진도 추이 그래프 (주별 12주 미니바) | P2 | ✅ |
| feat-2-007 | 목표 달성 알림 (마일스톤 25/50/75/100% 뱃지) | P2 | ✅ |
| feat-2-025 | **시험 차수 SSOT 일원화 (profiles)** — 차수(1·2차)가 `study_goals.exam_type`(write-only)·`profiles.next_exam_round`(추천·예측·cron) 이중 저장·미동기화였던 것을 **profiles 단일화**. /goals·온보딩이 차수를 `setNextExamPlan`(profiles)으로 읽고/쓰게 배선 → /goals 차수 변경이 `pickGapProblems` 추천 과목에 즉시 반영("목표가 학습을 바꾸는" 첫 연결). **①** 신규 유저 보장 = `profiles.next_exam_round` DEFAULT 'first'(트리거가 컬럼 생략 → 과거 NULL 생성 갭 해소). **Phase 2** = `study_goals.exam_type` DROP COLUMN(운영 dry-run: second 0행·백필 no-op·소실 0). 후속(c6f3fbd) = 2차(주관식)엔 객관식 추천 `gap_problems` 미제공(전 문항 1차 객관식). **Phase 3** = 대시보드 D-day 하드코딩 폴백(`EXAM_DATE_FALLBACK_ISO`) 제거 — 시험일 미설정 시 가짜 D-day 숨기고 설정 안내. **Phase 1~3 전부 운영 반영**(465dbf7/c6f3fbd/cef5d34/7416f2a). 후속(1cdbc3b): 대시보드 배지 "변리사 {1·2차}"·cohort 라벨도 차수/기수 실데이터로 치환(하드코딩 "1차" 2차 오표시 해소). 설계 `docs/features/feat-2-025-goal-exam-round-ssot.md`. | P1 | ✅ |
| feat-2-023b | **판례 암기 카드 품질 개선 (식별자·잘림·중복)** — feat-2-023 판례 카드 3종 결함 수정. front = `buildCitation`(법원·선고일·번호·**판결 【사건유형】**, cite-copy→`cases/labels.ts` 공용 이동) + 쟁점 질문(순수헬퍼 `srs/lib/case-card.ts`: `[N]`제거·중복회피·번호뿐이면 `case_title (쟁점 N)` 폴백). back cap 600→**4000**(실측 max 3693, 잘림 해소). `generateCards(...,updateExisting)` = 신규 insert + 기존 **in-place UPDATE(item_id 보존 → 학생 진척 유지)**; `previewCards`에 wouldUpdate·before→after·잘림수. `/admin/srs-cards` "기존 갱신" 토글. dry-run(특허 판례 imp≥2): 갱신 52·신규 67·잘림 0. typecheck 통과, 운영 52장 적용 승인 대기. 설계 `docs/features/feat-2-023b-case-card-quality.md`. | P2 | 🟡 |
| feat-2-024 | **암기 카드 종류별(조문/판례) 분리 학습 + 밀림 안내** — `/srs` 러너에 종류·과목 칩 필터(기본 전체). `getReviewQueue(client,userId,{subject?,sourceType?})` 확장 — due/new 임베디드 필터, **"전체"는 조문/판례 라운드로빈 인터리브**(판례 묻힘 해소). `getDueCountsByType`(종류별 due + 가장 오래된 경과일) → 칩 상시 due 배지 + 오늘 할 일 밀림 경고(임계 `due≥10` OR `oldest≥3일`, `SRS_BACKLOG_*` 상수·시작값). due 독립은 per-item 자동, `newPerDay` 예산만 전역 공유. 종류=`source_type`(스키마 변경 0). typecheck·단위테스트(14) 통과, 라이브 확인 대기. 설계 `docs/features/feat-2-024-srs-by-type.md`. | P2 | 🟡 |
| feat-2-023 | **암기 카드 인앱 생성 (조문·판례)** — SRS v2(`/srs`) 전역 카드 풀을 운영자가 인앱 생성(종전 오프라인 seed 스크립트만 → 사실상 비활성 해소). `card-gen.server.ts`: `previewCards`(★dry-run)·`generateCards`(멱등)·`getCardPoolStats`·`softDeleteCard`. 조문(front=식별자·back=본문, `source_id` 멱등)·**판례(쟁점=`summary_items` 항목당 1카드**, `source=case:{id}#{idx}` 멱등, `summary_body_md` 폴백, markdown→plain `srs-markdown.ts`). 전역 공유 풀(운영자 1회 생성 → 전 학생 `/srs`). `/admin/srs-cards`(생성 폼 + dry-run 미리보기→승인 생성 + 풀 현황 + 최근 카드 소프트삭제) staff 게이트, 쓰기 adminClient. 경계: 빈칸(cloze)=핵심문구 암기 / 카드(qa)=조문 통독·판례 이해(중복 회피). v1 qa 한정(러너 type 분기는 B). A단계 구현·typecheck 통과, 운영 생성·라이브(/srs) 확인 대기. 설계 `docs/features/feat-2-023-srs-card-generation.md`. | P2 | 🟡 |
| feat-2-022 | **OX 지문 약점 진단 (단원 × 지식종류 교차)** — OX 지문(선지·박스) 누적 정오를 `user_problem_attempts`(ox_answer≠null)에서 집계해 **단원(node) × 지식종류(choice_type: 조문/판례/이론)** 2축 매트릭스로 약점 진단. `computeOxDiagnosis`(study/lib/ox-diagnosis.server.ts) — box-item 포함 union(기존 byChoiceType는 선지만), 노드귀속 `getSessionWeakNodes` 미러, dedup 기본 latest(최신 1회)·`attempted_at` 보존+since/until 윈도우. 표본 게이트 `OX_DIAGNOSIS_MIN_ATTEMPTS=5` 미달 셀은 약점·처방 제외. ⑤' OX 시험 study 모드 지문별 정오 기록 추가(`/api/problems/attempt` mode='study', 회차 미생성). 합격자 패턴 비교(시간·합격여부·시험시점 3축)는 기존 passer 인프라(analytics.server.ts/`approximateExamDateMs`/`isPasserBenchmarkEnabled`)와 호환되는 그릇만(화면 X). 학생 진단 = `학습 통계`(`/study/stats`) **"정오문제 약점" 탭**(2026-06-17 흡수; `/study/ox-diagnosis`→`?tab=ox_diagnosis` 리다이렉트로 라우트 보존) + 강사 `/admin/students/:id` 드릴다운(공용 뷰 `ox-diagnosis-view`). 빈 상태 안전. ①~⑥ 구현·단위검산(ox-diagnosis.test.ts) 완료, 라이브 확인 대기. | P1 | 🟡 |
| feat-2-021 | **추천 슬롯 ON/OFF 사용자 설정** — `profiles.recommendation_prefs jsonb` (기본 `{}`, false 인 슬롯만 비활성). `parseRecommendationPrefs` 헬퍼 + `composeDailyMenu` 가 prefs 읽어 비활성 슬롯 즉시 null. POST `/api/study/recommendation-prefs`(zod) 가 본인 prefs upsert (true = 키 제거로 jsonb 최소화). `/study/today` 헤더 "추천 설정" 버튼 → 7 슬롯 토글 패널 (optimistic + 다음 KST 자정 안내). | P2 | ✅ |
| feat-2-020 | **SRS 처리 추이 차트** — `/study/srs` 상단 30일 일별 stacked bar (신규 추가 vs 재처리). `getSrsTrend`(srs-trend.server.ts) — 3 종 SRS created_at + user_problem_attempts/user_blank_attempts attempted_at 매칭. 신규 = 그 날 created_at, 재처리 = 그 날 attempts 총수 - 신규. 7일 평균 캡션 (신규/일 · 재처리/일). 큐 누적 vs 처리 속도 즉시 가시화. | P2 | ✅ |
| feat-2-019 | **합격자 SRS 표본 비교** — `/study/srs` 하단 `PasserBenchmarkSection`. 분석 동의 + status='passed' 합격자 표본 (≥3 명) 의 4 종 SRS due 평균을 본인 값과 비교. `getPasserSrsBenchmark`(passer-srs-benchmark.server.ts, admin client RLS 우회) — 합격자/본인 SRS bulk fetch + 학생별 집계 + 평균 산출. delta < 0 = 본인이 잘 처리(에메랄드), > 0 = 본인이 더 많이 보유(로즈). 표본 부족 시 안내 카드. | P2 | ✅ |
| feat-2-018 | **운영자 SRS 코호트 인사이트** — `/admin/cohorts/:cohortId/stats` 하단 `CohortSrsSection`. `getCohortSrsAggregate`(cohort-srs.server.ts, admin client) — 4 종 SRS bulk fetch + 학생별 합산 → 평균 KPI 4타일(학생당 평균 due) + 정체 학생 top 5 표(반응형 7컬럼: 총 due / 객관식 / 빈칸 / OX / 조문 / 가장 오래 / 상세 deep link) + 정체 학생 비율 헤더. | P2 | ✅ |
| feat-2-017 | **운영자 SRS 분석** — `/admin/students/:profileId` 에 `StudentSrsCard` 추가. `getStudentSrsSummary`(student-srs.server.ts, admin client) — 객관식 / 빈칸(세트 단위) / OX / 조문 복습 4 종 SRS 통합 카드 (due / total / lapses + 가장 오래된 overdue 일수). 4 SrsTile + 누적 실패 합산 캡션. | P2 | ✅ |
| feat-2-016 | **조문 정독 복습** — study_sessions(target_type='article') 기반 passive SRS — 별도 테이블 없이 visit_count + last_visit 으로 due 동적 계산. 매핑: 1회=7d / 2회=14d / 3회=30d / 4회+=60d. `getDueArticleReviews` / `getArticleReviewCounts`(article-review.server.ts). `/study/srs` 4번째 섹션(3 KPI + 표). daily-menu `article_review` 슬롯(medium priority). 정답/오답 채점이 없는 영역이라 SM-2 가 아닌 "방문 간격 알림" 모델. | P2 | ✅ |
| feat-2-015 | **cohort_track 데일리 슬롯** — feat-2-009 daily-menu 6번째 슬롯. `getCurrentWeekTrack` 미완 항목 중 ord 가장 작은 것 1개를 high priority 카드로. `cohort_track` kind 추가, cohort 미가입 학생은 자동 비움. | P1 | ✅ |
| feat-2-014 | **OX SRS** — feat-2-010 알고리즘을 OX 채점에 동일 적용. `user_ox_ref_srs(user_id, ref_type, ref_id PK)` — ref_type ∈ {'choice','box_item'}. `applyOxRefSrsUpdate` 가 `recordProblemAttempt` 의 OX 분기(ox_answer 비-null + selected_choice_id/selected_box_item_id)에서 hook. `getDueOxRefs` 는 부모 problem 조인해 lawCode·year·body_md snippet 함께 반환. `getOxSrsCounts`. `/study/srs` 3번째 섹션 — OX 채점(4 KPI + 표). 선택지·박스 항목 단위 추적·표시. | P1 | ✅ |
| feat-2-013 | **학습 활동 히트맵** — `/study/stats` 한눈에 탭에 GitHub 잔디 스타일 SVG 365일 + 요일·시간대 막대. `getActivityHeatmap`(activity-heatmap.server.ts) — `study_sessions.started_at` + `user_problem_attempts.attempted_at` 시계열 집계(KST). 셀 4 intensity bucket(emerald-200/400/500/700). 4 인사이트 타일(총 이벤트 / 활동한 날 / 최고 활동 요일·시간대) + 정답률 함께 표시. `ActivityHeatmap` 클라이언트 컴포넌트(`activity-heatmap.tsx`) — SVG rect + DowBars + HourBars. | P2 | ✅ |
| feat-2-012 | **추천 실행률 분석** — `/study/today` 하단 "지난 14일 실행률" 카드. `analyzeRecommendationCompletion`(recommendation-analytics.server.ts) — `user_daily_recommendations.items` 스냅샷 × `study_sessions` / `user_problem_attempts` / `user_blank_attempts` 매칭. 슬롯별 완수 룰: weak_problem=problem_id attempt 1+ / weak_article=article session 1+ / unread_case=case session 1+ / blank_due=set attempts 1+ / gap_problems=problemIds 중 1+ attempt. 카드: 전체 완수율(tone) + 슬롯별 막대 + 일별 미니 막대. v1.1 — 추천 엔진 튜닝 데이터로 활용. | P2 | ✅ |
| feat-2-011 | **빈칸 SRS** — feat-2-010 알고리즘(simplified SM-2) 을 빈칸에 동일 적용. `user_blank_srs(user_id, set_id, blank_idx PK)` — per-blank 추적 (빈칸 attempt 가 idx 단위라). `applyBlankSrsUpdate` 가 `blanks/api/attempt.tsx` insert 직후 best-effort upsert. `getDueBlankSets` 가 due blank 들을 **set 단위로 집계** (같은 set 의 due blank 들이 한 행으로) — 사용자는 set 진입해 모든 칸을 한 번에 풀이. `getBlankSrsCounts` (due 세트/due 빈칸/총 보유/누적 실패). `/study/srs` 화면 객관식 섹션 아래 빈칸 섹션 추가(4 KPI + 표). **feat-2-009 blank_due 슬롯이 SRS due 우선 + fallback 미시도 신규 세트** 로 자동 통합. | P1 | ✅ |
| feat-2-010 | **약점 자동 보충 SRS (`/study/srs`)** — 객관식 문제 Spaced Repetition. simplified SM-2: 정답 시 1→3→7→14→30→60일(최대 90일), 실패 시 1일 리셋 + ease 0.2 감소(최저 1.3). `user_problem_srs(user_id, problem_id PK + next_due_at·interval_days·ease·reps·lapses)` + RLS 본인 R/W + (user_id, next_due_at) 인덱스. `applyProblemSrsUpdate` 가 `recordProblemAttempt` insert 직후 best-effort upsert(OX 채점 제외 — ref 단위라 v1.1 별도 큐). `getDueProblems` / `getSrsCounts`(srs.server.ts). 화면: 4 KPI(due/7일내/총 보유/누적 실패) + 표(문제·과목·간격·실패·due·풀기 버튼) + 빈 상태 안내. **feat-2-009 데일리 메뉴 weak_problem 슬롯이 SRS due 우선 + fallback weak areas 로 자동 통합** — SRS 큐 ≥1 이면 "복습 due — {조문}" 카드, SRS 이력 없는 신규 학생만 기존 약점 로직. 상단 nav 학습관리 dropdown 2번째 메뉴. 영역 게이트 `area_study_mgmt`. | P1 | ✅ |
| feat-2-009 | **오늘의 학습 메뉴 (`/study/today`)** — 학습관리 첫 진입점. 본인 약점·미열람·진도 데이터를 합성한 5 슬롯 자동 추천: ① weak_problem(getWeakAreas top1 재시도) ② weak_article(약점 문제의 primary_article 중 study_session 없음) ③ unread_case(importance≥3 + 미열람) ④ blank_due(미시도 빈칸 세트 + importance 우선) ⑤ gap_problems(응시 과목 미풀이 객관식 랜덤 5문항). 슬롯별 우선순위(high/medium/low) + 예상 분 + 직접 학습 화면으로 가는 CTA. **하루 한 번 픽 고정** — `user_daily_recommendations`(user_id, recommendation_date PK) jsonb 스냅샷, KST 자정 기준 같은 날 재진입은 같은 픽. `composeDailyMenu`(`daily-menu.server.ts`) 5 슬롯 병렬 평가 + sortDailyMenu. `viewed_at` runAfterResponse 마킹. 대시보드 TODAY 섹션 상단 진입 배너 + 상단 nav 학습관리 dropdown 1번째 메뉴. 화면은 학습관리 영역 게이트(area_study_mgmt). | P1 | ✅ |
| feat-2-008 | 통합 학습 통계 페이지 (`/study/stats`) — 학습관리 메뉴의 "빈칸 학습 통계"를 "학습 통계"로 격상. 변리사 시험 차수(1차/2차)로 분리 — **1차 통계**(특허·상표·디자인·민법 + 자연과학) 객관식, **2차 통계**(특허·상표·디자인·민사소송법) 주관식. 탭 4종(한눈에 / 1차 통계 / 2차 통계 / 빈칸·암기). 각 차수 탭 내부에 **조문 + 판례 + 문제** sub-section을 시험 응시 과목으로 필터링해서 노출. 분기는 `LAW_SUBJECTS[code].exam` 필드(first/second/both)로 — 디자인보호법은 "first"였던 메타데이터를 "both"로 정정(`feat-2-008` 동반 fix). 한눈에=getOverallProgress+getDashboardKpis+getAllSubjectsProgress+getDailyStudyStats+getStudyAidCounts+자연과학(1차)+주관식(2차) 두 표. 신규 쿼리=getArticleStudyStats / getCaseStudyStats / getUserSubjectiveStats(study/queries.server.ts). 빈칸·암기=BlankStatsTabs 컴포넌트 추출하여 기존 4 sub-tab(내용/주체/시기/암기) 흡수. /study/blanks 라우트는 유지 + `/study/stats?tab=blanks` 로 redirect. **학습가치 강화**(2026-06-18, 점검 `docs/survey/학습통계-점검.md`): 탭 5종(정오문제 약점 추가). #1 한눈에 '약점→지금 복습' 카드(복습 시작=오답노트, 기존 weakAreas 재사용·새 쿼리 0) + #3 약점↔'오늘 할 일' 교차 안내(경량), #2 OX 진단 '이 단원 다시 풀기' 런처(`getOxQuestionsForNode`, due 무관·audience=self), #6 합격예측 추이 방문-시 lazy 스냅샷(크론 vercel.json 미등록 대안·runAfterResponse), #7 주석 정정, #4 KPI 카드 클릭 타겟(오답큐→오답노트·즐겨찾기·하이라이트), #5 탭 전환 재fetch 차단(`shouldRevalidate` — 탭은 loader 비의존, range/from/to 만 재검증 + passTrend 병렬화), #6 크론 등록(lazy 보완·CRON_SECRET/플랜 의존). | P1 | ✅ |

상세 스펙: `docs/spec-detail-5-2-goals.md` (작성 예정), `docs/features/feat-2-008-study-stats.md`.

---

## 5.3 메뉴: 최신 정보 (`/latest`)

콘텐츠 업데이트를 한 곳에서 추적. 5개 탭(법 개정 / 최근 판례 / 객관식 / 주관식 / 논문) 공통 레이아웃.

| ID | 기능 | 우선순위 | 상태 |
|----|------|:-------:|:---:|
| feat-3-000 | 최신 정보 공통 레이아웃 — 각 탭(/latest/laws, /cases, /mcq, /essay, /papers, /book-updates)이 독립 페이지로 구현. 상단 네비게이션이 탭 라우팅 담당. 공통 레이아웃 컴포넌트는 미적용(YAGNI — 각 탭의 필터/색인 형태가 상이) | P0 | ⛔ |
| **5.3.1 법 개정** | | | |
| feat-3-101 | 법 개정 (`/latest/laws`) — PPT 색인 양식 10컬럼 표(No/구분/명칭/법률번호/개정일/시행일/개정이유 O/신구조문대비표 O/개정해설 O/동영상 O). `law_revisions.revision_kind` ENUM(act/decree/rule) — 명칭에 '법령'/'시행령'/'시행규칙' 분기. 반영(effective_date set)된 개정만, 시행일 내림차순. | P0 | ✅ |
| feat-3-102 | 영향 조문 수 + 내 즐겨찾기 포함 여부 chip | P0 | ✅ |
| feat-3-103 | 첨부 O 클릭 시 행 아래 인라인 panel — 개정이유/개정해설 MarkdownView · 신구조문대비표/개정해설 PDF iframe(70vh) · 동영상 YouTube/Vimeo embed (그 외 URL은 외부 링크). | P0 | ✅ |
| **5.3.2 최근 판례** | | | |
| feat-3-201 | 신규 판례 피드 (선고일 최신순) | P0 | ✅ |
| feat-3-202 | 과목별 필터 + 중요판례 필터 (importance ≥ 3) | P0 | ✅ |
| feat-3-203 | 판례 카드에서 판례 상세로 이동 | P0 | ✅ |
| feat-3-204 | **운영자 노출 기간 설정** — `app_settings` key-value 테이블 + `latest_cases_recency_months`. `/latest/cases` 가 운영자 설정 롤링 N개월 창(`decided_at ≥ 오늘−N개월`)으로 수험생·운영자에게 노출. 0 = 제한 없음. staff 전용 인라인 패널(페이지 자체 action). 학습과목 판례 탭·뷰어는 미적용 — 노출 창은 `/latest/cases` 전용. 상세: `docs/features/feat-3-204-latest-cases-recency.md`. | P2 | ✅ |
| feat-3-205 | **학습정보 자체 콘텐츠 뷰어** — 학습정보 피드(최근 판례·2차 기출)의 상세를 학습과목(`/subjects/*`)이 아닌 자체 경량 read-only 뷰어(`/latest/cases/:id`·`/latest/essay/:id`)로 연결. 본문 렌더 컴포넌트를 학습과목 뷰어와 공용화(`CaseBody` 등 추출). feat-8-008 영역 게이팅의 선행 조건. 상세: `docs/features/feat-3-205-latest-content-viewers.md`. | P2 | ✅ |
| feat-3-206 | **판례 본문 밑줄 마커 반영 + staff highlight 변환** — (v1) 리담특허법판례 hwpx 원본의 underline 영역(`hh:charPr` 의 `BOTTOM` underline)을 `<u>...</u>` 인라인 마커로 추출해 `cases.summary_items / summary_body_md / reasoning_md / comment_body_md` 에 반영. 뷰어 `Prose` 가 `renderWithUnderline` 으로 React `<u>` element 렌더. `search_tsv` generated 식·AI Q&A `chunker.normalizeBody` 는 `<u>` strip. 적용 도구: `scripts/precedents/hwpx-to-text-underline.mjs` + `parse-hwp-text.mjs`(seq optional 보강) + `apply-underlines.mjs`. (v2 = feat-3-207 의 5번째 옵션 underline 도입 이후) `<u>` 마커를 staff 작성 underline highlight 로 일괄 변환 — `scripts/precedents/convert-u-to-staff-highlights.mjs` 가 `case-body.tsx` 의 textContent flow(SummaryBlock + Prose + `reflowNumberingSafe`) 정확 모방해서 each `<u>` 의 start/end_offset 계산, `user_highlights` 에 staff(임병웅 admin) 작성 row insert + 본문에서 `<u>` 마커 제거. 결과: **331 cases / 887 highlights**, 본문 `<u>` 잔존 0. 학생 viewer 는 CSS `::highlight(lidam-hl-staff-underline)` 으로 자동 표시, staff 는 toolbar 로 추가·HighlightList 로 삭제(본인 row 한정). 멱등 재실행 안전(기존 staff underline 먼저 delete). renderWithUnderline 은 fallback 으로 유지 — staff 가 본문 편집 중 `<u>` 직접 입력해도 처리. | P2 | ✅ |
| feat-3-207 | **하이라이트 5번째 옵션 "밑줄(underline)"** — 기존 4색(green/yellow/red/blue) 배경 하이라이트에 더해 배경 없이 텍스트 데코레이션만 적용하는 underline 추가. `HIGHLIGHT_COLORS` 에 "underline" 추가, `user_highlights.color` CHECK 제약 확장, `app.css` 에 `::highlight(lidam-hl-underline / lidam-hl-staff-underline)` 정의, `HighlightToolbar` 에 `UnderlineIcon` 버튼, `HighlightList` 의 발췌 텍스트에 inline underline 적용, study highlights 화면의 필터·집계에 추가. RLS 는 기존 정책 그대로 — staff (instructor/manager/admin) 가 그으면 모든 수험생에게 노출(staff style: 두꺼운 amber-600 밑줄), 수험생이 그으면 본인만(currentColor 가는 단색). | P2 | ✅ |
| feat-3-208 | **하이라이트 색상별 닉네임** — 사용자가 5색 각각에 목적 라벨(예: 노랑="암기 핵심", 빨강="출제 가능") 을 부여. `profiles.highlight_color_aliases` jsonb 컬럼 + `setHighlightColorAlias`/`getHighlightColorAliases` queries + `/api/annotations/highlight-alias` GET/POST(zod). 편집 UI = `/study/highlights` 상단의 `HighlightColorAliasEditor` (5개 색별 inline form). client 공유는 `useHighlightAliases` hook (sessionStorage 캐시 + custom event 브로드캐스트) — HighlightToolbar swatch `title` 에 "alias · 색 이름" 표시, HighlightList 의 본인 하이라이트 옆 alias 칩, study highlights 필터/요약도 alias 라벨로 동적 표시. | P2 | ✅ |
| feat-3-209 | **학습보조 기간 필터 (v3 — 완전 적용)** — `/study/*` 5개 페이지(하이라이트·포스트잇·메모·즐겨찾기·오답노트) + `/me/ox-sessions` + `/me/ox-wrong-note` + AI Q&A 대화 사이드바(`/ai`) + 학습 통계(`/study/stats`) 에 KST 자정 기준 "오늘·7일·30일·전체" preset + **사용자 지정(from~to 달력 popover)** 추가. 공용 헬퍼 `study-aids-list.tsx` 의 `RangeSelectionGroup` / `inRangeSelection` / `ALL_RANGE_SELECTION`/`isRangeSelectionAll`. 학습보조 5개 + `/me/ox-*` 가 `RangeSelectionGroup` 으로 통일. **stats v3**: URL `?range=&from=&to=` + loader 가 (1) 시계열 query 옵션화(`{ daysBack?, since?, until? }` / `{ weekCount?, since?, until? }` / `{ days?, since?, until? }` — custom 인 경우 since/until 전달) (2) **누적 통계 + visited stat 모두 since 인자 적용** — `getDashboardKpis`, `getStudyAidCounts`, `getUserSubjectiveStats`, `getUserBlankStats`, `getUserAutoBlankStats`, `getUserRecitationStats`, `getWeakAreas`, `listWrongAttempts`, `listOxWrongAttempts`, **`getArticleStudyStats`, `getCaseStudyStats`** 가 since 옵션 받음. 진도(`getOverallProgress`/`getAllSubjectsProgress`/`getAllScienceSubjectsProgress`) 만 누적 유지. `/ai` 좁은 사이드바는 inline grid chip 으로 preset 만 노출. | P2 | ✅ |
| feat-7-005-A | **개별 판례 수정 페이지에서 관련 조문 인라인 편집** — `/admin/cases/edit/:caseId` 의 Form 아래에 `RelatedArticlesEditor` 카드. 현재 매핑된 조문 chips(label + 제거 버튼) + 추가 form(과목 select — `subject_laws` 1개면 hidden, articleNumber input — "29"/"제29조"/"제29조의2" 정규화). `/api/admin/case-link` (intent=add/remove) 호출, fetcher revalidate + sonner toast. 기존 헤더 안내 "관련 조문은 별도 페이지에서" → "연관관계 부족분 일괄 편집" 링크로 변경. | P2 | ✅ |
| feat-3-211 | **조문 underline 노드 → staff highlight 통합** — feat-3-206 v2 의 case 변환을 article 에도 동일 패턴으로 적용. `articles.body_json` 의 `{ type: "underline", text }` inline 노드를 staff(임병웅 admin) 작성 underline highlight 로 일괄 변환. `scripts/articles/convert-underline-to-staff-highlights.mjs` 가 `ArticleBodyView` 의 textContent flow(walkBlocks + LabeledBlock 의 label/subtitle, inline 노드 매핑, splitTrailingRefs, RefsCollapsible button "관련 조문 N건", SubArticleGroup button "함께 공부할 조문") 정확 모방해서 each underline 의 start/end_offset 계산. (v2) `RefsCollapsible`/`SubArticleGroup` 에 `hasUnderlinesInside` default open 추가 + simulator 가 펼친 상태 textContent(button + 내부 inline/blocks/SubArticleView title "제N조 (title)" + preface "코멘트" 라벨) 까지 모방 → **118 articles / 284 highlights** 전면 변환(이전 closed-area 65건 포함). `article_revisions.body_json` 은 immutable trigger 라 cleanup 불가 — 대신 `ArticleBodyView` 의 `case "underline"` 을 Fragment(plain text) 로 변경해 시각 중복 제거. 학생/staff 동작은 case 와 동일. | P2 | ✅ |
| feat-3-213 | **상표 판례 적재 — 주제 배치 파이프라인** — 리담상표법 판례 [제16판](hwpx 19MB·이미지 704)을 "주제N 제목(부모체계도라벨(法 refs))" 규칙으로 적재. 주제 46개 → 체계도 부모 노드 아래 case_only 자식 노드 생성, 판례 primary_node_id=주제 노드·source_seq=교재 순번 → 기존 판례 트리/뷰어(특허와 동일 화면)가 무수정 동작. 파이프라인 `scripts/precedents/parse-trademark-book.mjs`(주제·헤더·섹션·도표·평석박스·글상자 파싱) → `seed-trademark-book.mjs`(dry-run 기본, 이미지 BMP→webp `case-images` 업로드). 결과: 판례 337건=교재 전량(insert 326+특허겹침 11=subject_laws 양법 등록)·주제 노드 46·이미지 694(잔여 WMF·OLE 4). **체계도 순번 결함 수정**: path 문자열 정렬이 대분류 10+ 에서 깨짐(b13<b2) → `sortSystematicTreeOrder`(parent+ord DFS, laws/lib/systematic-order.ts)로 getSystematicSkeleton·attachProblemOverallNo 랭킹 교체(특허 b10·b11 어긋남도 교정). 학생 노출=trademark STUDENT_DISABLED 해제 시(검수 게이트). **제16판(완0825) 개정판 반영 완료(2026-08-28)** — 판례 359(신규 3)·주제 47·교재 밑줄 624구간을 `<u>` 마커로 적재·이미지 773장 해시 재업로드(판본 간 binId 밀림 대응). 반영 순서·검증치는 문서 §7. 설계 docs/features/feat-3-213-trademark-case-import.md | P1 | 🟡 |
| feat-3-214 | **판례 다중 배치 — 한 판례, 주제별 서술** — 리담 판례집이 같은 판결을 두 주제에서 다른 각도로 다루는데(상표 5건: 96후1866·2002후567·2000후3708·2017나1148·2019허6747) 판례 1건=배치 1곳 모델이라 뒤 주제 서술이 통째로 안 보인다(2002후567 주제40=63회 기출 포함). `case_systematic_links(case_id, node_id, seq, is_primary, **book_sections**)` 신설 — 배치만 늘리고 본문이 하나면 문제가 그대로라 **주제별 본문을 링크에 둔다**. 선례=problem_systematic_links. 단계 A 마이그레이션+백필 / B 카운트·목록 필터 / C 뷰어 주제 전환 칩(`?node=`) / D 편집 배치 탭. 설계 docs/features/feat-3-214-case-multi-placement.md | P2 | 🔲 |
| feat-3-212 | **학습보조 복습 정리본 PDF** — 학습보조 "PDF 저장"을 화면 스크린샷(html2canvas) 대신 콘텐츠를 정리한 인쇄용 문서로 재설계. 전용 인쇄 라우트(`/study/wrong-note/print` 등, study-aids.layout 게이트 하위)가 문제 전문·선택지·정답·해설을 텍스트로 렌더 → 진입 시 `window.print()` 자동 호출(브라우저 "PDF로 저장"). 텍스트 기반(선택·검색·페이지분할 가능), 라이트 고정 색상, `@media print` 격리. 데이터: `queries-print.server.ts`(list*Attempts 재사용 + problems/problem_choices/box_items 보강). `StudyAidsShell` 에 `printHref` prop. 공용 `StudyPrintShell`(워터마크+툴바+인쇄CSS+그룹헤더). **잉크 절약**(검정 최소화 — 굵은 검정테두리·채움배지 → 연회색·아웃라인) + **페이지별 워터마크**(학생 이름·날짜·학원명, position:fixed 라 인쇄 시 모든 페이지 반복, 화면 숨김). **4개 탭 전부 완료**(오답노트·하이라이트·즐겨찾기·메모). | P2 | ✅ |
| **5.3.3 객관식 문제** | | | |
| feat-3-301 | 객관식 문제 (PPT 운영계획 반영) — `mcq_packs` 테이블(kind: past_exam/mock_full/mock_progressive/other, subject_scope: industrial/civil/civil_procedure/science, year/exam_round_no/duration_min/video_url/result_doc_url/published_at) + `mcq_pack_problems` (pack↔problem 매핑). `quiz_sessions.pack_id` 추가. RLS: 학생은 published만 read, staff CRUD. `/latest/mcq` 표 색인(No·과목·구분·명칭·출제일·문항), staff inline CRUD. | P1 | ✅ |
| feat-3-302 | 팩 상세 페이지 — `/latest/mcq/:packId` 헤더(과목·구분·명칭·출제일·문항·제한시간) + 동영상/결과자료 카드 + 학습/모의고사 시작 액션 + 문제 목록 (staff: problem_id로 추가/제거). 학습 시작은 quiz_session(mode=study), 모의는 mode=exam + time_limit. | P1 | ✅ |
| feat-3-303 | 팩 응시 결과 통계 — `/latest/mcq/:packId/result/:sessionId`. KPI(본인 정답률/총문항/오답/소요시간). 유형별(단답/박스/사례) + 지문별(조문/판례/이론) 정답률 — 본인 vs 전체 평균. 문제별 본인 정답 + 전체 정답률(get_problem_stats RPC). mock 완료 시 자동 리디렉트. | P1 | ✅ |
| feat-3-304 | **자연과학 1차 기출 스캔 PDF 적재 (image-first)** — 텍스트 레이어 없는 자과 기출 스캔 PDF를 문항 통째(발문+5선지) 이미지로 크롭해 적재. `problems`(origin=past_exam·subject_type=science·science_subject·science_section_id, body_md=`![]()` 이미지, format=mc_short 통일, 선지 body 빈문자+is_correct, 복수정답 지원) + science-scoped `mcq_packs`("{연도}년 1차 기출"). 두 영역(`/latest/mcq` 1차 기출 · `/subjects/science` 자연과학)이 동일 `problems` 공유 → 1회 insert로 양쪽 노출(단원 집계엔 `science_section_id` 매핑 필요). `mcq-pack-sheet`가 본문에 이미지 마크다운이 있을 때만 `MarkdownView` 렌더(텍스트 문항 무회귀, `337c024`). 파이프라인 `scripts/jagwa/*` (tag별 config + **OCR 자동 컷**: tesseract 로 좌측 마진 "N." 검출→문항 경계 자동화, 39~40/40 검출). render→OCR→crop→contact-sheet 검수→load→verify. 운영 DB=mcgdoplo `.env` 직접, 이미지 버킷 `problem-images`(public). **2010~2026(47~63회) 전 17개년 680문항 + 17 packs 적재 완료**(2019 56회는 2단 컬럼이라 `prep-2019-columns.mjs` 로 좌/우 분할 후 컬럼 ruler 판독으로 page-map 보정). 정답표는 연도별 A/B형·레이아웃(스택/2단/통합 최종정답) 상이 → 폼 확인 후 판독, 복수정답/모두정답(2014 Q7·2023 Q16) 처리. **단원(section) 매핑**: 2010 수동 + 2011~2026 OCR+키워드 자동분류(`classify-sections.mjs`) + 저신뢰 45문항 발문 OCR 판독 수동 보강 → **680/680(100%)**. 검수 중 2022 문제 PDF 1p가 시험 유의사항(번호 1~5)→OCR이 Q1~5로 오인 적재한 버그 발견, `pageOffset` 로 1p 건너뛰고 재적재 수정. 상세: `docs/features/feat-3-304-jagwa-past-exam-import.md`. | P1 | ✅ |
| feat-3-305 | **자연과학 1차 기출 AI 해설 생성 + 학생 노출 게이트** — feat-3-304로 적재한 680 이미지 문항에 해설이 없어 AI(opus 비전)로 생성. **게이트 설계**: 운영 `problems.explanation_md`에는 **승인된 해설만** 둔다. AI 초안은 별도 테이블 `problem_explanation_drafts`(status pending/approved/rejected · ai_answer · answer_match · RLS staff 전용)에 stage → 학생 렌더 8경로·AI-Q&A 색인 무변경으로 **구조적 차단**(초안이 운영 컬럼에 없으니 비노출). 승인은 RPC `approve_explanation_draft`(content_md→explanation_md 원자 복사 + status=approved). **생성**: `scripts/jagwa/` 다중 에이전트 워크플로우(연도·과목 67배치×10문항, 각 크롭 이미지 비전 판독 + 독립 풀이 + **정답키 교차검증**→불일치 자동 플래그, `.haesol/*.json`→`persist-haesol.mjs` upsert). **운영 DB(mcgdoplo) 680/680 전량 pending 적재**(정답키 일치 640/불일치 40), `explanation_md` 0건으로 학생 비노출 유지. **검수 화면** `/admin/problems/explanations`(문제 이미지+AI해설 나란히, 진행률 KPI·페이지네이션·불일치 우선 정렬·승인/반려/일괄승인). **잔여: 강사 승인(현재 0/680)**. 마이그레이션은 Supabase Management API(mcgdoplo ref 명시)로 적용. 상세: `docs/features/feat-3-305-jagwa-haesol.md`. | P2 | 🟡 |
| **5.3.4 주관식 문제** | | | |
| feat-3-401 | 신규 주관식 문제 피드 | P1 | ✅ |
| feat-3-402 | 모범답안 보기 + 첨삭 요청 — subjective problem-viewer 의 모범답안/채점기준 reveal + `/api/study/subjective-attempt` autosave + 첨삭 요청 워크플로우 + 강사 알림(이메일 + Kakao Alimtalk). **★2026-08-18 개편: 첨삭 요청·알림 전 경로 폐지**(실사용 0건, 채점은 AI 초안 일원화 — `docs/features/feat-2-032-essay-grading.md` S5). 모범답안·채점기준 reveal 과 autosave 만 유지. GS 강사 첨삭은 별개로 존속. | P1 | ✅ |
| **5.3.5 논문** | | | |
| feat-3-501 | 논문 데이터 모델 — `papers` (title/authors/source/publishedAt/abstract/url/pdfUrl/subject_laws[]/importance/tags) + `paper_article_links` + `paper_case_links`. RLS: public read, staff write. pg_trgm 인덱스 + 다과목 GIN. Soft delete. | P1 | ✅ |
| feat-3-502 | 논문 등록/수정 — `/api/admin/paper` (create/update/delete, Zod 검증) + `/api/admin/paper-link` (add/remove article/case by number). staff inline 폼 on /latest/papers. | P1 | ✅ |
| feat-3-503 | 논문 피드 + 관련 링크 — `/latest/papers` 검색·과목·중요 필터 + 페이지네이션. 카드: 제목·저자·출처·초록·subject 배지·관련 조문/판례 chip·외부 링크/PDF 버튼. staff: inline 추가/수정/삭제 + 링크 관리 토글. | P1 | ✅ |
| feat-3-504 | PDF 첨부 (Supabase Storage) — `papers.pdf_path` 컬럼 + private `papers` 버킷(20MB, application/pdf, staff write RLS). `/api/admin/paper-pdf`(multipart upload/delete, staff+) + `/papers/signed-url?paperId=`(인증 사용자, 5분). `/latest/papers` staff 폼 `PdfAttachSection` (fetcher form 형제) + 학생 view `PdfDownloadButton` (signed URL fetch + window.open). pdf_url(외부 링크) 와 양립. | P2 | ✅ |
| **5.3.6 도서 추록·정오표** | | | |
| feat-3-601 | 도서 추록/정오표 데이터 모델 — `book_updates` (book_title/publisher/edition/kind:supplement\|errata\|other/title/description/publishedAt/url/pdfUrl/subject_laws[]/importance/tags). RLS: public read, staff write. trgm + subject_laws GIN 인덱스. Soft delete. | P1 | ✅ |
| feat-3-602 | 도서 자료 등록/수정 — `/api/admin/book-update` (create/update/delete, Zod 검증) + staff inline 폼 on /latest/book-updates. | P1 | ✅ |
| feat-3-603 | 도서 추록/정오표 피드 — `/latest/book-updates` 검색·과목·유형·중요 필터 + 페이지네이션. 카드: 자료 제목·책 제목·판/쇄·출판사·내용·subject 배지·외부 링크/PDF 버튼. 네비게이션 메뉴 6번째 항목. | P1 | ✅ |

상세 스펙: `docs/spec-detail-5-3-latest.md` (작성 예정).

---

## 5.4 메뉴: 과목별 학습 (`/subjects`)

핵심 학습 영역. 과목 단위로 진입하면 그 안에서 조문/판례/문제 탭으로 학습.

### 5.4.A 공통 — 법률 과목 학습 허브

5개 법률 과목(특허·상표·디자인·민법·민사소송법)이 **동일한 화면 구조**를 공유. 데이터(과목)만 다름.

| ID | 기능 | 우선순위 | 상태 |
|----|------|:-------:|:---:|
| feat-4-A-001 | 과목 허브 레이아웃 (헤더 + 3탭: 조문/판례/문제) | P0 | ✅ |
| feat-4-A-002 | 과목 헤더 (과목명, 진도, 개정 배지, KPI 칩 조문/판례/문제) | P0 | ✅ |
| feat-4-A-003 | 탭 상태 URL 동기화 (`?tab=articles\|cases\|problems`) | P0 | ✅ |
| feat-4-A-004 | 정렬축 글로벌 토글 (체계도 / 조문 순서) — 과목 허브 헤더 + 조문 뷰어 트리 카드 inline 토글. 특허법 체계도2 기준 systematic_nodes(107)/article_systematic_links(301) 시드 완료. 모든 학습 조문 분류, 누락 0건 | P0 | ✅ |

### 5.4.A.1 — 조문 탭

| ID | 기능 | 우선순위 | 상태 |
|----|------|:-------:|:---:|
| feat-4-A-101 | 조문 트리 데이터 모델 (`articles`, 조/항/호/목, ltree 또는 path) | P0 | ✅ |
| feat-4-A-102 | 조문 식별자 양방향 변환 유틸 (`§29②2.가` ↔ struct ↔ URL). 표시(parseDisplay/toDisplay), 본문 약식(parseShorthand/toShorthand `法 29의2②2.가`), URL slug(parseSlug/toSlug — 가지조 branch round-trip 포함), inline ref 추출(extractRefs) 모두 대칭. DB 조회 caller 는 `articleSlug(article_number)` 직접 사용 (ltree 경유는 branch 손실). | P0 | ✅ |
| feat-4-A-103 | 조문 트리 렌더 (편/장/조 펼침, 진도 마커, 즐겨찾기 별) | P0 | ✅ |
| feat-4-A-104 | "최근 학습"·"미열람 권장" 카드 (importance 기반 chips) | P0 | ✅ |
| feat-4-A-105 | 조문 뷰어 (3분할: 트리/본문/관련자료) | P0 | ✅ |
| feat-4-A-106 | 조문 본문 하이라이트·메모·즐겨찾기 (polymorphic 주석) | P0 | ✅ |
| feat-4-A-107 | 관련 자료 사이드바 (조문/판례/문제/개정/메모 탭 + 정오/코멘트) | P0 | ✅ |
| feat-4-A-108 | 조문 시점 조회 (`?at=YYYY-MM-DD`) + 비교 모드(`?compare=`) — 본문 영역 2칼럼 분할, 시행일 캡션 | P1 | ✅ |
| feat-4-A-109 | 조문 트리 검색 — 트리 카드 안 검색 인풋, displayLabel substring 매칭 + 매칭 노드의 조상까지 노출 | P1 | ✅ |
| feat-4-A-110 | 큰 법 lazy-load — 본문은 활성 조문만 fetch. 서버 `getArticleChildren(lawId, parentId)` + `/api/laws/article-children` 라우트 + ArticleTree `lazyExpand={lawId}` UI 연결 완료(민법 적용). 펼침 시 fetch + 로딩 스피너 + 자식 dedup 누적. 전체 skeleton 이 미리 로드되어 있으면 fetch 가 no-op 라 안전. 트리 가상화(react-window 등) 는 1000+ 노드 노출 시 후속 | P1 | ✅ |
| feat-4-A-111 | 관련조문 inline 링크 (`法 89` 등 약식 표기 파서 + 클릭 이동, 본문 안에서는 dotted underline 형태 / header_refs 안에서는 chip) | P0 | ✅ |
| feat-4-A-112 | 해설 링크 → 코멘트 탭 활성 — problem-viewer 해설 안의 조문/판례 ref 클릭 시 article-viewer 우측 패널 코멘트 탭으로 진입(comment_target_id 자동 스크롤). | P1 | ✅ |
| feat-4-A-113 | 제목만 보기 (항 단위 본문 접기) | P1 | ✅ |
| feat-4-A-114 | 정오문제 위젯 (객관식 자동 연동 + 별도 업로드, 무작위 노출, 정답+해설) | P0 | ✅ |
| feat-4-A-115 | 코멘트 / 평석 패널 (staff 작성, 학생 read-only, 마크다운) | P0 | ✅ |
| feat-4-A-116 | Q&A 패널 — 동일 공용 컴포넌트(QnaPanel/qna-list). 검색 + 새 질문 → staff 알림 + 답변자 질문수준 평가 상/중/하. | P0 | ✅ |
| feat-4-A-117 | **관련자료(강의노트) 패널** — `lecture_resources` 테이블(`resource_kind`/`resource_target_type` enum, soft delete, source_pdf_id/page_start/end 추가) + private `lecture-notes` Storage 버킷(signed URL 5분) + RLS(authenticated read · staff write). article-right-panel "materials" placeholder 제거 → `LectureResourcesPanel` 실 구현(학생 read-only, staff 업로드/삭제). article-viewer / case-viewer 우측 패널에 통합. 학생은 클릭 시 새 탭에서 PDF 오픈 (브라우저 내장 뷰어). Phase 2 OCR(mupdf-wasm + tesseract.js kor) 시도했으나 강의노트 좌상단 헤더 박스(어두운 배경·흰 글씨) OCR 정확도 한계로 사용자 매핑 CSV 방식으로 전환. `scripts/import-lecture-note.mjs` + `tmp/lecture-note-mapping.csv` (시작/끝/종류/식별자/제목) + dry-run·apply 모드 + 같은 source_pdf_id 의 기존 자료 soft-delete 후 재 import(idempotent). 식별자 파서는 identifier.ts(`feat-4-A-102`) 의 parseDisplay 로직을 mjs 에 복제. 첫 콘텐츠: "리담특허법 강의노트(제10판)" 608쪽 (사용자가 매핑 CSV 작성 후 apply). 상세: `docs/features/feat-4-A-117-lecture-resources.md` · CSV 가이드: `docs/features/feat-4-A-117-csv-format.md`. | P0 | 🟡 |
| feat-4-A-130 | 조문 빈칸 채우기 학습 (article_blank_sets, 빈칸 모드 토글, 입력+채점, 시도 기록). 운영자 편집은 article-viewer "빈칸 자료" 버튼 → 자기 set 자동 생성+편집 / 모든 조문 한 화면(setless 카드도 drag→자동 생성). 매칭: ±30자 컨텍스트 + ANCHOR_LENGTHS=[30,20,12,10,8,6,4] + cross-token cumulative fallback (queries.server.ts collectCumulativeOccurrences) + blockIndex/cumOffset hints 로 정확 위치 추적. 입력 흐름: 정답 commit 후 **자동 focus 이동 제거** — 다음 빈칸은 시각적 highlight(primary ring + pulse) 만 표시, 사용자가 Tab/클릭으로 직접 진입(한국어 IME composer 충돌 우회). leak detection(다른 빈칸 정답 substring) 은 방어선 유지. | P0 | ✅ |

### 5.4.A.2 — 판례 탭

| ID | 기능 | 우선순위 | 상태 |
|----|------|:-------:|:---:|
| feat-4-A-201 | 판례 데이터 모델 (`cases`, 사건번호 정규화, tsvector) | P0 | ✅ |
| feat-4-A-202 | 판례 KPI 카드 (전체/중요/기출 보유). "내가 본 판례" 는 user_progress 매핑 후속. | P0 | ✅ |
| feat-4-A-203 | 판례 필터 (법원 4종 + 기출 4종(전체/1차/2차/1·2차 모두) + 정렬 3종 + 검색). hub cases 탭과 /latest/cases 모두 적용. | P0 | ✅ |
| feat-4-A-204 | 판례 카드 목록 (사건번호, 사건유형, 요약, 선고일, 기출년도 chip 1차=blue/2차=rose). | P0 | ✅ |
| feat-4-A-205 | 판례 상세 뷰어 — 헤더(법원·사건번호·사건유형·전합·중요도·선고일·기출년도) / 판결요지(복수 [1][2] 분리) / 판시이유 / 비고. 좌측 조문트리 · 우측 패널 3분할. | P0 | ✅ |
| feat-4-A-206 | 판례 본문 하이라이트 — 요지·이유·비고 3 영역에 fieldPath 별 HighlightOverlay + 상단 HighlightToolbar. 메모/즐겨찾기는 우측 패널(ArticleRightPanel). | P0 | ✅ |
| feat-4-A-207 | 인용 복사 버튼 — case-viewer 헤더 우측 "인용 복사" / buildCitation: "{법원} {YYYY. M. D.} 선고 {사건번호} 판결 【{유형}】". 클립보드 API + 폴백 prompt. | P1 | ✅ |
| feat-4-A-208 | 판례 전문 검색 — case_number / case_title / nickname / case_type / summary_title / summary_body_md / reasoning_md / comment_body_md 에 pg_trgm GIN 인덱스 + ilike 다중 컬럼 OR. 한국어 부분 매칭 안정 작동. search_tsv(simple config) 는 generated 컬럼으로 유지 — 향후 정확 매칭 ranking 도입 시 활용 가능. | P1 | ✅ |
| feat-4-A-209 | 판례 색인 화면 (테이블 — 중요·법원·선고일·사건번호·사건유형·닉네임+사건명+기출 chip·전합). 1차 기출 chip 은 출제문제 링크(클릭 시 문제 뷰어, feat-8-024), 2차는 연도 배지. 검색·정렬·기출 필터·페이지네이션(50/페이지). | P0 | ✅ |
| feat-4-A-210 | 판례 트리 진입 — cases 탭 좌측 사이드바: 조문 트리 + 체계도(SortAxisToggle 공유). 각 노드별 leaf 카운트(판례 수). 클릭 시 `?case_article` / `?case_chapter` / `?case_node` URL 파라미터로 필터링 + 필터 활성 chip + 전체 보기 해제 버튼. chapter 는 자손 article 합산, systematic 노드는 부분트리 article 합산(중복 제거). 0건 노드는 hide. | P1 | ✅ |
| feat-4-A-211 | 판결전문 PDF 뷰어 — cases.full_text_pdf URL 이 있으면 case-viewer 본문에 iframe 임베드(80vh) + "새 탭에서 열기" 버튼. 미첨부 case 는 섹션 자체 숨김. | P0 | ✅ |
| feat-4-A-212 | 관련문제 패널 — case-viewer 우측 패널 "유사 문제" 탭: `getRelatedProblemsByCase` (article_case_links 가 가리키는 article 의 primary_article_id 문제 12건). 1차/2차 양방향 링크는 explicit problem_case_links 모델 추가 시 보강. | P0 | ✅ |
| feat-4-A-213 | 비고/코멘트(평석) 출처/내용 분리 — comment_source 가 있으면 본문 위에 별도 박스(왼쪽 border-l)로 노출. 내용은 HighlightOverlay 로 wrap. | P0 | ✅ |
| feat-4-A-214 | 관련논문/기사 링크 — `case_references` 테이블(kind: paper/article/other, title/authors/source/publishedAt/url/pdfUrl/note/ord). case-viewer 본문에 패널 추가, 학생은 read-only (외부 링크 + PDF 열기 버튼). staff(instructor/admin) 는 inline 추가/수정/삭제. API: `/api/admin/case-reference` (create/update/delete). RLS: public read, staff write. | P1 | ✅ |
| feat-4-A-215 | Q&A 패널 — 우측 패널 통합(article/case/problem 공용). qna-list 검색 + 필터(scope/target/q). 새 질문 → 모든 staff fanout 알림(이메일+카카오 Alimtalk). 답변 시 질문수준 평가 상/중/하(qna_quality_grade) + asker 알림. | P0 | ✅ |
| feat-4-A-216 | 판례 닉네임 — `cases.nickname`(중요 판례 통칭, 예: 수지상 세포 사건. 선택·≤100자). 색인 목록·상세 뷰어에서 사건명 앞 amber 라벨로 표시, admin-case-edit 입력란 + `/api/admin/case` 저장, 전문 검색(feat-4-A-208) 대상 포함. | P1 | ✅ |

### 5.4.A.3 — 문제 탭

| ID | 기능 | 우선순위 | 상태 |
|----|------|:-------:|:---:|
| feat-4-A-301 | 문제 데이터 모델 — `problems` + 4유형(mc_short/mc_box/mc_case + ox + blank + subjective). enum problem_format 에 6종 모두 포함. OX 는 별도 풀이 흐름 (feat-4-A-313 /:subject/ox), blank 는 feat-4-A-130, subjective Runner 는 feat-4-A-305 (P1) 별도. | P0 | ✅ |
| feat-4-A-302 | 문제 KPI — subject hub 헤더 칩에 "문제 N · 풀이 N · 정답률 N%" + ProblemsTab 카드 3종(출제·내 풀이·정답률). problemStats(getUserProblemStats) 기반. | P0 | ✅ |
| feat-4-A-303 | 퀴즈 설정 폼 (유형/연도/극성/문항수/모드) + 오답만 모드 | P0 | ✅ |
| feat-4-A-304 | 문제 풀이 Runner — 객관식 (mc_short) | P0 | ✅ |
| feat-4-A-305 | 문제 풀이 Runner — 주관식. **★2026-08-18 재편: 완성 답안 작성·자기채점·첨삭 폐지 → ① 논점 추출 ② 목차 구성 ③ 사안의 포섭·결론 3단계 훈련**(3축 채점과 1:1). 3칸 autosave(`/api/study/subjective-attempt`) + AI 채점 + 모범답안/채점기준(배점표 읽기 전용) reveal + 시간제한 응시. 화면=`subjects/components/subjective-panel.tsx`. 상세 `docs/features/feat-2-032-essay-grading.md` S5. | P1 | ✅ |
| feat-2-035 | **2차 대비 판례 도식화 (사실관계→쟁점→법조문→법리→포섭→결론)** — 2차가 판례 사실관계를 각색해 출제하는 현실에 맞춰 판례를 답안 작성 순서대로 도식화. ★쟁점 단위 블록 반복(사실관계만 판례당 1개, 쟁점부터 결론까지는 쟁점마다 1세트), 법리는 4축(문언·취지·목적·형평) **각 축 optional** — 없는 축을 채우면 논거 창작이 되므로(Non-negotiable 11). ★소스 이원화: **사실관계=하급심**(상고심은 법률심이라 사실이 압축됨) / 쟁점~결론=대법원. 하급심 3단 폴백 — ⓪판례 자체가 하급심(`cases.court<>'supreme'`) ①대법원 원문 【원심판결】 파싱 → 국가법령정보센터 판례 API(★사건번호 검색 키는 `nb=`, `query=`는 사건명이라 0건) ②`source/하급심 판결문/특허/` 수기 투입(파일명 첫 토큰=대법원 사건번호) ③실패 시 `supreme_only`/`none`(사실관계 창작 금지). 신규 `case_diagrams`(case_id unique, facts_md + facts_source_kind/ref + blocks jsonb, `problem_review_status` 승인제, soft delete, 과목 무관). 노출=판례 목록·뷰어 `도식` 배지 → 우측 Sheet(approved 한정, staff 는 draft 도), staff 편집 `/admin/case-diagrams`. 대상=특허 2005~ **264건**, 1차 샘플=2025년 14건. **S0·S1 완료** — S0 수집기 `scripts/case-diagram/fetch-lower-court.mjs` + 폴더·README·gitignore — 2025 확보 7/14(자동 6·자체 1), 수기 대상 7건) · 전 범위 확보 167/264(자동 103·자체 64). S1 운영 DDL 적용 완료(RLS 2정책·트리거·인덱스, typegen 반영). S2 완료 — Zod SSOT(case-diagram.ts, 법리 4축 각 optional)+queries-case-diagram.server+/admin/case-diagrams(목록·편집·승인·soft delete)+인앱 AI 초안. ★인앱 초안은 쟁점~결론만(사실관계 근거인 하급심 캐시는 서버리스에서 못 읽음 — 배치가 채운다). 스모크 2건 실측 $0.051/$0.231, 법리 축 2개 이하만 채워짐 확인. S3 완료 — 2025년 14건 배치 생성(draft, 쟁점 35개, 실패 0, $2.36). AI 호출 2분할(사실관계=하급심 전문만 / 쟁점~결론=대법원 원문만)로 소스 이원화를 코드에서 강제. 법리 축 분포 1축 34%·2축 54%·3축 11%·**4축 0** — 축 채우려 논거 지어내는 실패 모드 미발생. 감사(audit-diagrams.mjs) FAIL 0 WARN 0(사건번호 인용 9건 전부 원문 실재). **원장 검수 대기** → 다음=S4 학생 배지+Sheet. **S4 완료**(학생 배지·Sheet·팝업/시트 선택). 운영 수집 화면 `/admin/cases/lower-court` 에서 하급심을 **바로 수집·적재**(자동 수집 / 원심번호 지정 / 전문 붙여넣기 / 필터 일괄 최대 8건) — 파싱·매칭 코어는 `app/features/cases/lib/lower-court-fetch.server.ts` SSOT 를 배치와 공유(★배치 실행은 `npx tsx`). 확보 179/264(대용량 수기 4건 추가). **S5 완료(2026-08-22)** — 전 범위 배치 57건 생성(실패 0, $10.23, 쟁점 113, 4축 1). 누적 도식 **240/264** · 잔여 24 = 조각난 하급심 8(원본 재투입 대기)·대법원 원문 0자 14(별건)·하급심 미확보 2. 감사 전수 **FAIL 0 · WARN 67**. ★감사기가 하급심 전문을 로컬 캐시에서만 읽어 DB 적재분 인용 90건이 전건 오탐이었다 — 생성기와 같은 DB 폴백 추가. ★PDF 추출을 글자 좌표 기반으로 교체(판결문 PDF 가 문장을 조각내 날짜·등록번호가 밀렸다). **S6 완료(2026-08-27) — 답안 쓰기 연습**: 패널 머리 「읽기/연습」 전환, 연습에서 법리·포섭이 빈칸이 되고 결론·강사코멘트는 「맞춰보기」 뒤에 열린다(접힘 미리보기도 차단). ★채점=핵심어 커버리지(Levenshtein 불가 — 법리는 바꿔 쓰는 일이라 제대로 쓴 답도 0.3), **축이 어긋나도 인정**(채워진 축 각각을 학생 답 전체에 대고 맞춤). 임계값 0.65/0.35 는 실측 고정 — 바꿔 쓴 답 0.73~0.96 / 일부만 0.09~0.20 / 엉뚱 0.00~0.07, 포섭도 같은 값(오히려 높게 나온다). 조문·청구항 번호(제1항·제128조)는 채점에 남기고 금액·날짜만 뺀다. 입력은 비제어 textarea(iPad IME)+localStorage 초안, 응시 이력 DB 저장은 다음 단계. `answer-match.ts`(+단위 12건)·`case-diagram-practice.tsx`. 쟁점 접기/펴기 동반. **껍데기 판결문 판정 추가** — 본문이 이미지인 스캔 PDF 는 열람 안내문만 추출돼(실질 0자) 사실관계 칸에 사과문이 들어앉았다. `isBoilerplateOnly`(실질 300자 미만)로 소스에서 제외하고, 이미 만들어진 6건은 `clear-shell-facts.ts` 로 비움(승인 2건 포함 — 그중 1건은 당사자를 창작). 설계 `docs/features/feat-2-035-case-diagram.md`. | P1 | 🟡 |
| feat-2-034 | **2차 기출 채점기준·모범답안 생성 파이프라인** — 강사별 해설(41조합)+채점위원 채점평(3축 표준)+법령 연혁 123버전(law.go.kr, 전부개정 대응표 자체 도출)+리담 교재 코퍼스(상표 제20판·디자인 제15판·심사기준)를 근거로 164문항(특·상·디·민소 2010~2025) 채점기준·모범답안·자기점검 체크리스트 AI 생성. 특·상·디 124문항은 현행법 대조 AI 감수 → 2회 수리로 critical 0 수렴(warn 37 문서화). `problems.model_answer_md/grading_rubric_md/rubric_items` 164건 반영 완료(백업 tmp/rubric-gen/db-backup-*). 도구 scripts/jagwa/{extract-instructor-*,fetch-law-history,derive-article-mapping,build-book-corpus,gen-rubric-model-answers,run-rubric-gen-all,audit-rubric-citations,verify-rubric-vs-book,repair-rubric-from-verify,apply-rubric-to-db}.mjs. 잔여: 해설 미확보 92문항(스캔 PDF 6건 OCR 복구 후보), 민소 미검증. | P1 | ✅ |
| feat-2-033 | **주관식 시험 모드 완료 파이프라인** — 시험 모드에 ①조기 "제출하기"(만료와 동일 제출 경로) ②완료 시 결과 카드(제한·소요 mm:ss·글자수, 조기제출=에메랄드/만료=로즈) ③카드 내 다음 절차 버튼(**2026-08-18 개편 후: AI 채점→채점기준 확인→모범답안 확인**, 종전 자기채점 입력 단계는 폐지) ④응시 기록 영속 `user_subjective_attempts.timed_limit_min/timed_elapsed_sec`(제출 시에만 기록, 학습 모드 제출은 기존 기록 보존) + 시작 바에 "지난 응시" 표기. 부수 수정: autosave 경로 `rubricSelfCheck` 폼값 유실 버그(체크리스트 미저장) 해소. | P1 | ✅ |
| feat-4-A-306 | 학습 모드 (즉시 해설) vs 시험 모드 (타이머 + 일괄 제출) | P0 | ✅ |
| feat-4-A-307 | 풀이 결과 화면 + 오답 노트 자동 수집 | P0 | ✅ |
| feat-4-A-308 | 문제 북마크·메모·하이라이트 (polymorphic 패널). **자연과학 문제 뷰어**(`subjects/screens/science/problem-viewer`)에도 즐겨찾기(BookmarkStars)+포스트잇(MemoList) 직접 연결(target_type='problem'). 과학 문제는 law 없어 `/study/bookmarks`·`/study/notes`·대시보드 집계(listAllBookmarks/listAllMemos/listTopBookmarks/listAllHighlights)에 과학 분기(href `/subjects/science/{path}/problems/{id}`) 추가. | P0 | ✅ |
| feat-4-A-309 | 유사 문제 추천 (같은 primary_article) | P2 | ✅ |
| feat-4-A-310 | 객관식 색인 화면 — 정렬·필터·난이도·본문 검색 | P0 | ✅ |
| feat-4-A-311 | 분류 라벨 시스템 (기출/변형/예상/모의 × 단원/종합 × 단답/박스/사례 × 긍정/부정). problems 테이블 origin/scope/format/polarity 4 enum + 운영자 편집 폼 + 학생/운영자 색인 4축 필터 + 학생 색인 표에 4축 모두 노출. 시드 데이터 97.86% 라벨링 완료. | P0 | ✅ |
| feat-4-A-312 | 정답률 기반 난이도 동적 계산 (RPC + 5단계 버킷) | P0 | ✅ |
| feat-4-A-313 | 지문별 색인 (problem_choice 자식 entity) + 정오문제 자동 연동 (article 패널 + /:subject/ox 페이지) | P0 | ✅ |
| feat-4-A-314 | 해설 — 지문별 O/X + 분류(조문/판례/실무) + 링크 | P0 | ✅ |
| feat-4-A-315 | 동영상 풀이 (강사 업로드, 문제 우측 패널) — problem-viewer 우측 패널 동영상 임베드(YouTube/Vimeo URL) + admin-problem-edit 폼에 video_url 컬럼. | P1 | ✅ |
| feat-4-A-316 | Q&A 패널 — 공용 QnaPanel. ArticleRightPanel 통해 problem 타깃도 동일 흐름. | P0 | ✅ |
| feat-4-A-320 | 주관식 색인 화면 (기출+모의 통합 테이블) — 과목 hub의 ProblemsTab 하단 "2차 주관식" 카드. `listProblemsBySubject` 가 반환하는 problems 중 `examRound='second'` 인 항목(secondRound)을 카드 리스트로 노출. SubjectiveCard 컴포넌트(주관식 배지·출처·연도/번호·subjective_kind·기본 조문 chip + 논점/본문 snippet/풀이 CTA). 기존 hub 필터(origin/year/format/polarity/scope/search)와 동일 필터 적용. exam !== 'first' 과목(특허·상표·디자인·민소법)에만 노출. 빈 상태는 필터 적용 시/미적용 시 안내 분기. | P1 | ✅ |
| feat-4-A-321 | 주관식 분류 라벨 (기출/변형/예상, 키워드, 사례·논점) — `problems.subjective_kind`(case_study/issue_set/discussion) + `subjective_keyword` 컬럼 + /latest/essay 필터. 색인은 /latest/essay 가 담당(과목 hub 의 ProblemsTab 은 MC 만 — feat-4-A-320 별도). | P1 | ✅ |
| feat-4-A-322 | 채점기준·모범답안·채점결과 우측 패널 — subjective problem-viewer 의 model answer + rubric reveal + self-score 입력 + 채점 체크리스트. admin-problem-edit 에서 모범답안/채점기준 작성. | P1 | ✅ |
| feat-4-A-323 | 답안 작성 시간제한·자동 저장 — 시간제한 응시 모드(타이머 + 만료시 자동 제출) + 답안 textarea autosave(debounce → `/api/study/subjective-attempt`). | P1 | ✅ |
| feat-4-A-330 | 2차 답안 업로드 — submission 단위 N페이지 슬롯 그리드 (1슬롯=1파일, JPG/PNG/WebP/PDF), 페이지별 OCR + 판독 자가확인, swap/끼워넣기 재배치. `gs_submission_pages` + `gs_question_pages` (M:N 매핑). → 5.5.1 GS 응시 흐름과 동일 모델 | P1 | ✅ |
| feat-4-A-331 | 답안지 N분할 — `gs_rounds.expected_pages` (default 20) 기반 슬롯 그리드 + PDF 다페이지 자동 분할. 페이지 ↔ 문항 매핑은 수동 다중 선택 | P1 | ✅ |
| feat-4-A-332 | 답안 교차 배정 (M명 채점자 부작위 매칭) → 5.5.2-203 (gs_peer_assignments) | P1 | ✅ |
| feat-4-A-333 | 채점기준·채점표 양식 (정량+정성) — `gs_questions.rubric` + `gs_answers.rubric_scores`. 항목별 입력 → 합산 자동. AI 채점도 rubric 항목별 점수 제안 (ai_grader 분기). AI 제안값은 `gs_answers.ai_suggested_*` 로 로깅 — 강사 최종값과 차이 분석 가능 | P1 | ✅ |
| feat-4-A-334 | 채점 입력 UI (소문제별 점수 + 정성 평가 + 코멘트) → 5.5.2-201 admin-gs-grade | P1 | ✅ |
| feat-4-A-335 | 평균/표준점수/등급/순위 자동 계산 → 5.5.3-301..303 RPCs (gs_round_student_stats 등) | P1 | ✅ |
| feat-4-A-336 | AI 채점 (Claude API) → 5.5.2-202 ai-grader.server.ts | P2 | ✅ |
| feat-4-A-337 | 채점결과 통계 화면 → 5.5.3-301..303 admin-gs-round-stats / admin-gs-series-stats | P1 | ✅ |
| feat-4-A-338 | 우수답안 노출 → 5.5.3-304 gs-distinguished + admin-gs-distinctions | P1 | ✅ |
| feat-4-A-339 | 포인트 지급 시스템 (순위 백분위 기반) → 5.5.3-305 gs-points | P2 | ✅ |
| feat-4-A-340 | **문제 체계도 소분류 배치** — 한 조문(제29조)이 여러 노드(산업상 이용가능성/신규성/진보성/확대된 선출원)에 걸려 문제가 4곳에 중복 노출되던 문제. `problems.primary_node_id`(nullable FK systematic_nodes) 추가 — 판례 `cases.primary_node_id` 모델 미러. 배치 우선순위 2단계(primary_node_id ∈ subtree → 없으면 primary_article_id 파생). 수정: `getSystematicNodeProblemStats`·`getSystematicNodeProblemSequence`·`getSystematicNodeProblems`·`listSystematicTopNodes`(공유 헬퍼 `fetchPlacedProblemRows`) + `getSessionWeakNodes`. staff 편집: admin-problem-edit 에 조문 ASL 노드 기반 "체계도 소분류" 제너릭 select(세분화 조문일 때만). 미태깅=현행(하위호환). node-progress 게이지는 후속. 상세: `docs/features/feat-4-A-340-problem-node-placement.md` | P1 | ✅ |
| feat-4-A-341 | **OX 지문 체계도 소분류 배치** — OX 지문(choices/box_items)이 `related_article_id`(조문 단위)로만 분류돼 체계도 트리에서 제29조 OX 가 4개 소분류에 합쳐지던 문제. **DB 변경 없이** OX 수집 시 부모 문제 `primary_node_id` 로 배치(지문 related_article=문제 primary_article 일 때만, 교차참조 지문은 조문 단위 유지). `getOxQuestionsForArticle` 에 `opts.nodeSubtreeIds` 추가 + `systematic-node-viewer` 가 subtree 전달. feat-4-A-340 태그 재사용 → 백필·지문 picker 불필요, 자동 동기화. 상세: `docs/features/feat-4-A-341-ox-node-placement.md` | P1 | ✅ |
| feat-4-A-342 | **지문(OX) 체계도 소분류 picker** — 지문(choice/box)별 조문을 제29조로 분류해도 소분류 picker 가 없어 OX 가 정밀 분류 안 되던 문제. `problem_choices.related_node_id` + `problem_box_items.related_node_id` 추가. ChoiceEditor/BoxItemEditor 에 입력 조문이 세분화 시 "체계도 소분류" select(admin-problem-edit 의 subNodeOptions 재사용). OX 배치 우선순위 3단계: 지문 related_node_id → 부모 문제 primary_node(feat-4-A-341) → 조문 scatter. getProblemById·getOxQuestionsForArticle·action 반영. 비파괴적. 상세: `docs/features/feat-4-A-342-choice-node-placement.md` | P1 | ✅ |
| feat-4-A-343 | **조문 정오(OX) 표시 중복 제거** — 조문 OX 패널에 서로 다른 정당한 문제(다른 회차)가 같은 지문을 물어 같은 문장이 2~3번 뜨던 문제. 진단(`scripts/jagwa/ox-dup-audit.mjs`): 표시 중복 22그룹/초과 23개(거의 특허법), 내용 동일 중복 problem 0건(박스형 선지패턴 오탐 제외), 정답 O/X 모순 1건(제226조). **비파괴적 표시 레이어 dedup** — `getOxQuestionsForArticle` 가 조문별 정규화 본문(공용 `ox-dedup.ts`: stripLeadingMarker+공백제거, 패널과 동일 규칙) 같은 ref 를 대표 1개로 합침(우선순위 승인>초안·기출>변형>예상·최신연도). 회차 정보는 `dupCount` 배지로 보존, O/X 모순 그룹은 합치지 않고 노출(가드). problem·데이터 삭제 없음. 모순 1건(제226조)=2023 실용신안 #14 보기의 특허법 OX 오링크가 뿌리, **데이터 무교정(과거 기출 원형 보존, 사용자 결정)**·표시 가드로 노출 처리. 상세: `docs/features/feat-4-A-343-ox-dedup.md` | P2 | 🟡 |

### 5.4.B — 자연과학 학습 허브 (문제만)

| ID | 기능 | 우선순위 | 상태 |
|----|------|:-------:|:---:|
| feat-4-B-001 | 자연과학 과목 허브 레이아웃 — 4과목 공용 ScienceHub (헤더 + KPI 실값 + 단원 카드 + 맞춤 퀴즈 진입) | P1 | ✅ |
| feat-4-B-002 | 자연과학 데이터 모델 — `science_subject` enum, `science_sections` 테이블 (parent_id 자기참조), `problems.science_subject` + `problems.science_section_id` + 정합성 가드 | P1 | ✅ |
| feat-4-B-003 | KPI 카드 — 출제 / 내 풀이 / 내 정답률 (user_problem_attempts 조인) | P1 | ✅ |
| feat-4-B-004 | 단원별 정답률 표 — science hub 단원 행에 풀이수/문제수·정답률 컬럼 추가. accuracy tone 4단계 색상(emerald/lime/amber/rose). | P1 | ✅ |
| feat-4-B-005 | 퀴즈 설정 폼 — `/subjects/science/:subject/quiz/setup`. 단원 다중 선택 + 문항수 + 모드 | P1 | ✅ |
| feat-4-B-006 | 자연과학 문제 풀이 Runner — `/subjects/science/:subject/problems/:id` 최소 viewer (선지 4지 + 정답·해설 + 세션 prev/next). KaTeX 수식 렌더 적용(`$...$`/`$$...$$`/`\(...\)`). 도식 이미지는 problem.body markdown 으로. | P1 | ✅ |
| feat-4-B-007 | 단원 시드 데이터 — 4과목 × 5~6 대단원 (총 21개). 샘플 문제 8개(과목별 2) 도 함께 시드. 변리사 협회 공식 분류 검증 후속 | P1 | ✅ |

상세 스펙: `docs/spec-detail-5-4-subjects-A.md` ✅ (5.4 도메인 모델·UX·결정사항·feat ID 정리), `docs/db-schema.md` ✅, `docs/article-tree.md` ✅, `docs/relations.md` ✅. `docs/spec-detail-5-4-subjects-B.md` (자연과학 — 작성 예정).

---

## 5.5 메뉴: 온라인 GS (`/gs`)

변리사 2차 모의고사를 온라인으로 응시·채점하는 흐름. 상시 회차/시리즈, 답안지 페이지 슬롯 그리드, AI/peer/강사 채점, 통계, 우수답안, 포인트.

### 5.5.0 — 회차/시리즈 인프라

| ID | 기능 | 우선순위 | 상태 |
|----|------|:-------:|:---:|
| feat-5-001 | 회차(`gs_rounds`) 도메인 모델 + RLS — 과목/시작·종료·상태(draft/published/closed)/시험지·모범답안 PDF | P0 | ✅ |
| feat-5-002 | 시리즈(`gs_series`) — 회차 묶음, 시리즈별 통계용 | P1 | ✅ |
| feat-5-003 | GS 메뉴 진입 화면 (`/gs`) — 노출 가능 회차 목록, 내 응시 현황 | P0 | ✅ |
| feat-5-004 | 시리즈 상세 (`/gs/series/:id`) — 회차 카드 + 내 추이 | P1 | ✅ |

### 5.5.1 — 학생 응시

| ID | 기능 | 우선순위 | 상태 |
|----|------|:-------:|:---:|
| feat-5-101 | 응시 시작 + 카운트다운 + 가드 (응시 시각·1회 제한) | P0 | ✅ |
| feat-5-102 | 답안지 페이지 슬롯 그리드 (회차별 `expected_pages`, default 20) | P0 | ✅ |
| feat-5-103 | 페이지 1슬롯 = 1파일 업로드 (JPG/PNG/WebP/PDF, 해상도·크기 검증, OCR) | P0 | ✅ |
| feat-5-104 | 페이지 ↔ 문항 매핑 (M:N 칩 다중 선택) | P0 | ✅ |
| feat-5-105 | 페이지별 판독 자가확인 토글 | P0 | ✅ |
| feat-5-106 | 다페이지 PDF 자동 분할 — confirm 후 PDF.js 가 페이지별 JPEG 으로 분배 | P0 | ✅ |
| feat-5-107 | 페이지 swap (드래그&드롭) — `gs_swap_pages` RPC + ON UPDATE CASCADE 매핑 | P0 | ✅ |
| feat-5-108 | 페이지 끼워넣기 — `gs_shift_pages_down` RPC, 마지막 페이지가 채워져 있으면 차단 | P0 | ✅ |
| feat-5-109 | 제출 가드 (모든 문항 매핑 + 모든 페이지 판독확인) | P0 | ✅ |
| feat-5-110 | 결과 페이지 — 답안지 페이지 갤러리 + 문항별 점수/피드백 + 매핑 anchor | P0 | ✅ |

### 5.5.2 — 채점 (강사·AI·peer)

| ID | 기능 | 우선순위 | 상태 |
|----|------|:-------:|:---:|
| feat-5-201 | 강사 채점 화면 — 답안지 인덱스 + 문항별 매핑 페이지 합본 갤러리 + 점수/피드백 | P0 | ✅ |
| feat-5-202 | AI 채점 초안 (Claude API + OCR 합본) | P0 | ✅ |
| feat-5-203 | 동료 채점 배정 (M명 균등 분배, 자기 답안 제외) — `gs_peer_assignments` | P1 | ✅ |
| feat-5-204 | 동료 채점 화면 (익명) — 단일 답안 모드(/gs/peer-review/:assignmentId) + 매트릭스 모드(/gs/peer-review/round/:roundId, 한 라운드의 배정 답안 N개를 컬럼으로 늘어놓고 문제·rubric criterion 행 × 답안 컬럼 입력, 소계·총계·순위 실시간, 정성평가 textarea, 디바운스 자동 저장 — 채점강의 PPT 6페이지 레이아웃 반영). gs_peer_review_answers.rubric_scores jsonb 컬럼 추가, score 는 rubric 합으로 자동 채움. | P1 | ✅ |
| feat-5-205 | 채점 마무리 → 학생에게 결과 공개 (`graded_at`, `total_score`) | P0 | ✅ |
| feat-5-206 | 채점 분쟁 표시 (동료 채점 표준편차 ≥ maxScore × 0.15) | P1 | ✅ |
| feat-5-207 | 자동 동료 배정 cron (응시 종료 후) | P1 | ✅ |

### 5.5.3 — 통계·우수답안·포인트

| ID | 기능 | 우선순위 | 상태 |
|----|------|:-------:|:---:|
| feat-5-301 | 회차별 학생 통계 (z·rank·percentile) | P1 | ✅ |
| feat-5-302 | 회차별 문항 통계 (avg·median·stdev·quartile) | P1 | ✅ |
| feat-5-303 | 시리즈 학생/회차 매트릭스 + 본인 추이 | P1 | ✅ |
| feat-5-304 | 우수답안(`gs_distinctions`) — 회차/문항 단위, 익명 옵션, 학생 화면 노출 | P1 | ✅ |
| feat-5-305 | 포인트 적립/소진 (`gs_points_*`) — 우수답안/응시 보상 | P2 | ✅ |

### 5.5.4 — 운영자

| ID | 기능 | 우선순위 | 상태 |
|----|------|:-------:|:---:|
| feat-5-401 | 회차 CRUD (admin-gs-edit) — 시험지/모범답안 PDF, 4문항 시드, expected_pages 설정 | P0 | ✅ |
| feat-5-402 | 시험지 PDF 페이지 수 ↔ expected_pages 동기화 안내 + 한 번에 맞추기 | P1 | ✅ |
| feat-5-403 | 회차 제출 목록 / 채점 진행도 | P0 | ✅ |
| feat-5-404 | 동료 채점 배정 운영 화면 | P1 | ✅ |
| feat-5-405 | 회차/시리즈 통계 화면 | P1 | ✅ |
| feat-5-406 | 우수답안 운영 화면 (자동 추천 + 발행) | P1 | ✅ |
| feat-5-407 | 포인트 운영 화면 | P2 | ✅ |
| feat-5-408 | 분쟁 문항 모니터링 화면 | P1 | ✅ |

### 5.5 데이터 모델 메모

- `gs_submission_pages` (submission 단위 N슬롯, 1슬롯=1파일, jsonb attachment + OCR)
- `gs_question_pages` (페이지 ↔ 문항 M:N, FK ON UPDATE CASCADE)
- `gs_answers` (점수/피드백 only — `attachments`/`legibility_confirmed` 컬럼은 deprecated)

상세 흐름은 `feat-4-A-330`/`feat-4-A-331` (5.4 의 답안 업로드/N분할 라인) 과 동일한 모델을 사용.

---

## 5.6 메뉴: 커뮤니티 (`/community`) — ✅ 구현 완료 (feat-6-001~008, 운영 동작 확인 2026-06-06) · 반별 게시판 feat-6-010 ✅ 라이브 검증 완료 2026-06-15

| ID | 기능 | 우선순위 | 상태 |
|----|------|:-------:|:---:|
| feat-6-010 | **반별 게시판 (cohort 스코프 커뮤니티)** — 반(cohort)에 연결된 게시판. **공지형**(`staff`=강사만 작성)/**소통형**(`members`=소속 학생도 작성) `write_scope`. `cohort_boards`·`cohort_board_cohorts`(M:N)·`cohort_board_posts`·`cohort_board_comments`·`cohort_board_post_attachments` + private 버킷. **접근통제는 RLS 가 DB 에서 강제**(학생 경로 전부 RLS client, `user_can_read/write/manages/attach_cohort_*` SECURITY DEFINER 헬퍼 — 화면 가드 비의존). 운영자 `/admin/cohort-boards`(생성·접근반 지정), 학생·강사 `/cohort-boards`(목록→글→상세+댓글+첨부). pin=manager 전용 RPC+가드 트리거. 합성 RLS 검증 ① 13/13 · ③b 14/14, 라이브 통합검증 2026-06-15. 상세: `docs/features/feat-6-010-cohort-boards.md`. | P2 | ✅ |
| feat-6-001 | 커뮤니티 메뉴 라벨 + Placeholder 화면 — `/community` ComingSoon 컴포넌트 사용. | P0 | ✅ |
| feat-6-008 | **스터디 매칭 — join/leave 멤버 패널** — `community_study_members(post_id, profile_id PK + joined_at + left_at)` + RLS (인증 read, 본인 join/leave). `community_posts.max_members int` 컬럼 추가. `getStudyMembership` / `joinStudy` / `leaveStudy` (study-members.server.ts). POST `/api/community/study-join` (zod intent=join/leave) — closed 체크·정원 체크·과거 left_at 복귀 upsert. study 게시글 상세에 `StudyMembersPanel` (멤버 chip 리스트 + "참여하기/취소" 버튼, 정원 가득/마감 disable). | P2 | ✅ |
| feat-6-007 | **모더레이션 패널** — manager+ 신고 큐 처리. `community_reports(report_id, target_type ∈ {post,comment}, target_id, reporter_id, reason, status ∈ {pending,resolved,dismissed}, resolved_at·resolved_by·action_note)` + RLS (본인 신고 + manager+ 전체) + unique(reporter, target). 인증 사용자 POST `/api/community/report` (zod 1~500자) — 중복은 409. 게시글 상세에 `ReportButton` (본인 글 제외, 펼침 form + 사유 입력). manager+ POST `/api/community/report-resolve` (status + 함께 삭제 옵션). `/admin/community/reports` 화면 — 상태 탭(대기/처리됨/기각/전체) + 카드 리스트(대상 컨텍스트 + 신고 사유 + 처리 form). 사이드바 cluster=comms 메뉴. | P2 | ✅ |
| feat-6-006 | **합격 후기 검색·필터** — `/community/review` 보드 상단에 `PasserSummariesSection` 통합 — `listPasserSummaries`(feat-8-009) 의 분석 동의 합격자 후기를 익명 카드로 노출. URL `?year=YYYY&round=first|second` 필터(form select 2개) + 인증 chip + 점수 버킷 chip + 본문 line-clamp-3. | P2 | ✅ |
| feat-6-005 | **콘텐츠 인용 marker** — 게시글·댓글 본문의 `[law:patent#29]` / `[case:2020다123456]` / `[problem:UUID]` 토큰을 인라인 미니 카드로 렌더. `extractContentRefs` / `splitBodyByRefs`(content-refs.ts, 클라/서버 공용) + `resolveRefsForBodies`(content-refs.server.ts, 일괄 lookup) + `RichBody` 컴포넌트(rich-body.tsx — kind 별 아이콘 + 라벨 + 학습 화면 진입 링크). 미해석 marker 는 회색 code 칩으로 표시. 게시글 ↔ 학습 콘텐츠 양방향 트래픽. | P1 | ✅ |
| feat-6-004 | **커뮤니티 알림 — 좋아요·멘션** (댓글 알림은 feat-6-002 에 이미 있음). `staff_notification_kind` enum 에 `community_post_like` / `community_post_mention` 추가. `notifyPostLiked`(community/notify.server.ts) — 본인 글이 아니고 같은 user×post 의 좋아요 알림이 7일 dedup 없음일 때만. `parseMentions` + `notifyMentions` — `@닉네임` 토큰(한글/영문/숫자/_.- 2~30자) profiles.name lookup 후 fanout. 게시글 작성·댓글 작성 둘 다 hook. `togglePostLike` 의 신규 like 만 알림. | P1 | ✅ |
| feat-6-003 | **인기·BEST 자동 강조** — RPC `community_popular_posts(p_board, p_days=7, p_limit=5)` security definer — `(likes×3 + comments×2 + views×0.5)` 점수로 정렬. `community_posts.view_count` 컬럼 + `community_increment_view` RPC (본인 글 제외). 게시글 상세 진입 시 `runAfterResponse` best-effort 증가. 보드 화면 상단 "이번 주 화제" top 3 카드 그리드 — 순위 배지 + 좋아요·댓글·조회 카운터. | P1 | ✅ |
| feat-6-002 | 커뮤니티 게시판 3종 (자유게시판·스터디 모집·합격 후기) — 단일 `community_posts`+`community_post_comments`+`board` enum. `/community` 허브 + `/community/:board` 목록·검색 + 작성/수정 + 상세·댓글. RLS 하이브리드(인증 전체 읽기 + 본인 쓰기 + manager 모더레이션·고정), soft delete, `public_profiles` 뷰로 작성자 표시. 상세: `docs/features/feat-6-002-community-boards.md`. | P1 | ✅ |
| feat-6-XXX | (잔여) 좋아요·첨부·알림·페이지네이션 등 게시판 v2 | P2 | ✅ |

**v2.1 + v2.2 완료 (2026-05-21)**: 
- v2.1 좋아요·페이지네이션: `community_post_likes` 테이블((post_id, user_id) PK), `togglePostLike` + post API `intent="toggle_like"`, `listPosts` 페이지네이션(page/pageSize default 20, count exact) + likedByMe/likeCount 매핑(`fetchLikeMeta` batch), community-board 카드 ♥ N + 페이지 네비, post-detail 옵티미스틱 LikeToggle.
- v2.2 첨부: `community_post_attachment_kind` enum(image/pdf/file) + `community_post_attachments` 테이블 + RLS(post 작성자/manager+ write, authenticated read), private bucket `community-attachments`(10MB, image+pdf MIME 화이트리스트). `/api/community/attachment` (multipart upload/delete, 작성자/manager+ 가드) + `/community/attachment/signed-url` (5분). post-detail 본문 아래 `AttachmentsList`(이미지 인라인 썸네일, PDF/기타 chip) + 작성자/manager+ 만 `AttachmentUploadForm`.
- v2.2 알림: `staff_notification_kind` enum 에 `community_post_comment` 값 추가. comment API create 흐름에서 글 작성자에게 user_notifications insert (본인 댓글 제외, runAfterResponse best-effort).

---

## 5.7 메뉴: 운영자 (`/admin`)

학생도 메뉴는 보이되 진입 시 권한별 안내. 강사/원장은 본격 운영 화면.

| ID | 기능 | 우선순위 | 상태 |
|----|------|:-------:|:---:|
| feat-7-001 | 운영자 메뉴 진입 가드 — `/admin` loader 가 staff role 확인. 비로그인은 /login 리다이렉트, 학생은 권한 안내 화면(추천 액션 — 대시보드/특허법/최신 정보/학습 목표 링크). | P0 | ✅ |
| feat-7-002 | 콘텐츠 관리 허브 — 콘텐츠 등록·수정(빈칸/문제/판례 매핑/MCQ 팩/논문/도서 추록·정오표) + 통계 분석 + 온라인 GS 3개 섹션으로 정리. 각 카드에 진입 링크 + "최신 정보" 배지. | P0 | ✅ |
| feat-7-003 | 강사 대시보드 (반 진도, 콘텐츠 현황) — `/admin` 운영자 허브가 staff 본인의 콘텐츠 통계(getStaffContentStats — 작성한 문제/판례/논문/도서 자료 수) + 반 진도(feat-7-010 `/admin/cohorts/:id/progress`) 진입점을 제공. | P1 | ✅ |
| feat-7-004 | 법 개정 워크스페이스 — **시행일 기반 모델**(초안/검토/발행 상태·발행일 없음. 노출·현행 여부는 `effective_date` 로만 결정). `/admin/laws/:lawCode/revisions` 단일 일람(시행일 desc, 시행 상태 chip: 시행 중/시행 예정/미반영) + 새 개정 생성. `/latest/laws` 상단에서 원장/스태프/강사가 과목 선택 후 새 개정 추가. `/admin/laws/:lawCode/revisions/:revisionId`: 조문 추가(현재 본문 자동 복사 / bulk add — 콤마/줄바꿈 구분 최대 50개) · 자동완성 · 변경 종류(신설/개정/폐지) · **시각 편집기**(ArticleBlockEditor — 마커 `__밑줄__`/`[강조]`/`((소제목))`) ↔ JSON 토글 · **Diff highlight** · **장/절 자동 그룹화** · **반영 전 체크리스트**(개정번호/조문≥1/본문변경/개정이유/신구조문대비표/개정해설/동영상) · **"조문에 반영"**(공포일+시행일 → RPC `apply_law_revision`: 스냅샷 effective_date 스탬프 + 직전본 expired_date 마감 + 시행일 도래분만 current_revision_id 스왑). **첨부 PDF 업로드**(`law-revision-files` 버킷, 30MB, PDF). 조문 뷰어는 미래 시행본이 있으면 **현재본+시행예정본 2-pane** 동시 표시. 시행일 도래 자동 전환 cron `/api/cron/promote-law-revisions`(RPC `promote_effective_revisions`). 불변성 — 날짜 가드 `article_revisions_protect_in_force`(시행 중 스냅샷만 수정·삭제 금지, 미래/미반영은 편집 가능). | P0 | ✅ |
| feat-7-005 | 판례 등록/수정 폼 — `/admin/cases/edit` (신규) / `/admin/cases/edit/:caseId` (수정). 사건번호/사건명/법원/선고일/전합/중요도/사건유형/1·2차 기출연도/요지·이유·비고 Markdown/판결전문 PDF URL. POST `/api/admin/case` (create/update/delete soft). 관련 조문 매핑은 `/admin/cases?law=` 또는 `/admin/relations/*` 별도 진입. 기존 판례 수정 진입점 — 판례 매핑 카드(`/admin/cases`)의 "수정" 링크 · 판례 뷰어 staff "수정" 버튼. | P0 | ✅ |
| feat-7-006 | 문제 출제 폼 — `/admin/problems/new` 최소 메타(과목·차수·출처·유형·극성·scope·연도·회차·번호·지문수) + 본문 입력 → INSERT (mc 계열은 빈 choices 자동 생성) → `/admin/problems/:problemId` 상세 편집으로 redirect. 상세 편집에서 지문·해설·연관 조문/판례 매핑 진행. | P0 | ✅ |
| feat-7-007 | 논문 등록/수정 폼 — feat-3-502 가 흡수 (/latest/papers staff inline 폼 + `/api/admin/paper`). | P1 | ✅ |
| feat-7-008 | 연관관계 일괄 편집 — TSV/CSV bulk import (`/admin/relations/bulk`). 5종 link 테이블(article-article/article-case/case-case/problem-article/problem-case) 전부 지원. dry-run preview + commit. | P1 | ✅ |
| feat-7-009 | 반/기수 관리 — `cohorts` (name/description/owner_id/starts_on/ends_on/is_archived) + `cohort_members` (N:M). RLS: admin 전부, instructor 본인 소유, student 자기 row read. `/admin/cohorts` 카드 일람 + 신규/수정 폼, `/admin/cohorts/:id` 상세에 멤버 목록 + 학생 검색 추가/제거. | P1 | ✅ |
| feat-7-010 | 학생 진도 모니터링 — `/admin/cohorts/:id/progress` 반 학생 요약 테이블(문제 풀이·정답률·조문 열람·빈칸·최근 활동) + KPI 4종. `/admin/students/:profileId` 학생 상세(과목별·자연과학별 진도, 최근 12건 활동, 빈칸 통계). admin client 로 RLS 우회, staff 권한 검사는 loader 에서. | P1 | ✅ |
| feat-7-011 | 공지사항 발송 — `announcements` + `announcement_audiences` (대상 종류: all/cohort/user) + `announcement_reads` (PK announcement_id, profile_id). RLS: staff(admin 전부 / instructor 본인 작성분) write, 일반 사용자는 자기에게 발송된 published 만 read (audience 측 RLS 가 join 필터링). `/admin/announcements` 인라인 작성 폼(전체/반 다중선택/사용자 검색·태그) + 발행/언발행/삭제 + 고정. 학생은 `/announcements` 수신함에서 카드 펼침 시 자동 읽음 처리. **노출 플랫폼 선택(2026-08-23)** — `platform_scope`(study/lecture/both)로 학습 `/announcements` · 강의 `/lecture/announcements` 중 어디에 띄울지 지정. 표시 필터일 뿐 보안 경계 아님(RLS 무변경). | P1 | ✅ |
| feat-7-012 | 사용자 관리 — `/admin/users` admin 전용. listAdminUsers (admin client 로 auth.users + profiles 조인) + 검색·역할 필터 + 페이지네이션. 인라인 select 로 역할 변경(student/instructor/admin), 본인 강등 차단. | P1 | ✅ |
| feat-7-013 | 강사 권한 관리 — feat-7-012 에 통합 (admin 이 user role 을 instructor 로 승격/강등). | P1 | ✅ |
| feat-7-014 | 수강권/결제 관리 (manager+) — `/admin/subscriptions` list(요약 카드 4종·필터·검색·만료 임박) + 학생 상세에 `AdminSubscriptionPanel`(활성/연장/취소/수동 부여·결제 이력). `admin-queries.server.ts` (listAllSubscriptions·listUserSubscriptionHistory·listPaymentsForUser·grantManualSubscription·extendSubscription·cancelSubscriptionAdmin). `/api/admin/subscription` (zod intent grant/extend/cancel, manager+ 가드). | P2 | ✅ |
| feat-7-015 | 감사 로그 — `audit_logs` 테이블 + 운영자 액션(콘텐츠 CRUD, 사용자 역할 변경, 공지 발송, 법 개정 발행) 추적. admin 전용 조회 화면. | P2 | ✅ |
| feat-7-016 | 5과목 시드 진행률 카드 — `/admin` 운영자 허브 상단. `admin_subject_coverage` RPC: 과목별(조문/판례/객관식/주관식/평석/발행 개정) 카운트. 막대 그래프(최댓값 대비) + tone 색상(0=rose / <10%=amber / <50%=sky / 그 외=emerald). 각 행에 "완성도 진단 →" deep link. | P1 | ✅ |
| feat-7-017 | 법령 완성도 진단 — `/admin/laws/:lawCode/completeness`. `admin_law_completeness` RPC: 실 조문(level='article') 기준 미커버 카운트(현행 revision / 빈칸 / 평석 / 관련조문 / 관련판례 / primary 문제 / 판례 요지·매핑 / 객관식 해설 / 주관식). 3섹션(조문/판례/문제) × 11차원 카드. 각 차원에 진행률 막대 + 미커버 카운트 + 작업 도구 deep link. tone: ≥95% 에메랄드 / ≥50% 앰버 / 그 외 로즈. | P1 | ✅ |
| feat-7-018 | 자동 백필 RPC 2종 — staff 권한 가드. (1) `backfill_article_article_links_from_body` — body_json 의 inline `ref_article` 노드를 jsonb_path_query 로 재귀 추출 → `article_article_links` `cross_reference` 백필. (2) `backfill_article_case_links_from_body` — 판례 본문(요지/이유/평석) "(법명) 제N조(의X)?" 자연어 패턴 추출 → `article_case_links` `cites` 백필. 완성도 페이지 헤더 버튼 2개로 수동 재실행. | P1 | ✅ |
| feat-7-019 | 반/기수 통계 모니터링 (`/admin/cohorts/:id/stats`) — feat-7-010 진도(학생별 행)와 분리된 cohort 평균/분포 종합 화면. 평균 KPI(평균 정답률·평균 시도·평균 조문 열람·최근 7일 활동 학생수). 정답률 5구간 분포(80+/60-79/40-59/20-39/0-19) 막대. **최근 4주 주별 추이 차트**(`getCohortAccuracyTrend` — 주별 정답률 막대 + 시도/활동 학생수). 5과목 평균 표(평균 시도·평균 정답률·평균 조문 열람). 상/하위 5명 카드(정답률 기준). 학생 detail(`/admin/students/:profileId`)에 **반 평균 대비 비교 카드**(`getStudentCohortComparisons` — 정답률·시도·조문 열람 차이 chip + 분위 badge + 반 통계 deep link). 신규 함수 3종 (`getCohortAggregateStats`/`getCohortAccuracyTrend`/`getStudentCohortComparisons`) 모두 admin client RLS 우회. cohort-detail 과 progress 양쪽에 진입 링크. e2e: `e2e/admin/cohort-stats.spec.ts`. | P1 | ✅ |
| feat-7-020 | **커리큘럼 / 학습 플랜** — 학원이 짠 N주 학습 트랙을 cohort 에 적용. **1차 종합반 우선** (객관식·빈칸·암기·조문/판례·강의). 2차(주관식)는 후속. `curricula`(이름·기간·소유자) + `curriculum_weeks`(주차·제목·목표) + `curriculum_items`(주차별 학습 단위: article/case/problem/blank_set/recitation/lecture 중 하나, kind 별 CHECK constraint) + `cohort_curricula`(cohort 적용·시작일). lecture 는 인라인 메타(title/url/duration_min) — 통합 LMS 는 후속. 운영자: `/admin/curricula` 목록 + `/admin/curricula/:id` 편집(메타·발행·주차/항목 CRUD) + cohort detail 에서 "커리큘럼 적용" + 시작일. **항목 reference 선택은 `ContentPicker` 검색 UI**(`/api/admin/search-content?kind=...&q=...` — article/case/problem/blank_set 라벨 검색 + 선택). | P0 | ✅ |
| feat-7-021 | **과제 배포** — cohort 단위. **자동(커리큘럼 주차 → 과제 변환) + 수동(임의 신규) 병행**. `assignments`(제목·설명·할당일·마감일·source_curriculum/source_week 추적) + `assignment_items`(학습 단위) + `assignment_submissions`(학생별 상태: pending/partial/completed + 완수 시각, cache). 자동 채점/완수 판정(`recomputeSubmission`) — 문제는 정답 1번 이상, 빈칸은 모든 blank_idx 정답, 조문/판례는 study_sessions 방문 1회, 암기는 user_recitation_attempts.is_complete=true. 운영자: `/admin/cohorts/:id/assignments` CRUD + 커리큘럼 주차 자동 변환 폼 + `/admin/cohorts/:id/assignments/:aid` 편집·학생 진척. 학생: 대시보드 "마감 임박 과제" 배너 + `/assignments` 본인 과제함 + `/assignments/:id` 상세(자동 완수 진척 막대 + **항목별 진입 URL** — article/case/problem/blank_set/recitation 각각 학습 화면으로 직접 진입). 알림 fanout: assignment 생성 시 `announcements` + `announcement_audiences(cohort)` 자동 발송(best-effort). **자동 주간 cron**(`/api/cron/curriculum-weekly`, CRON_SECRET 보호) — 활성 cohort_curricula 별로 현재 주차 계산(KST start_date 기준) → 미발송 주차를 자동 변환. 외부 cron(Vercel Cron/pg_cron/GitHub Actions)에서 매주 호출. e2e: `e2e/admin/curriculum-assignments.spec.ts`. | P0 | ✅ |
| feat-7-022 | **자동 주간 리포트** — 매주 월요일 학생/강사 이메일. 학생: 본인 진척·정답률·streak·약점 top3·미완 과제 top3 + 대시보드 deep link. 강사: cohort 평균 KPI·비활성 학생 명단·이번 주 과제 완수율. React Email 템플릿 2종 (`weekly-report-student/staff.tsx`) + `dispatchWeeklyReports` (notify.server.ts) + `/api/cron/weekly-reports` (CRON_SECRET 보호). notify_channels.email 활성자만. Resend 사용. | P1 | ✅ |
| feat-7-023 | **비활성 학생 자동 알림** — 7일+ 미접속 학생을 staff(cohort owner) 인박스에 push. `staff_notification_kind` enum 에 `cohort_inactive_alert` 추가. `/api/cron/inactive-alert` (CRON_SECRET, `?inactiveDays=N` 매개) → 활성 cohort 순회 → `listCohortProgressSummary` 의 lastActivityAt 기준 필터 → 1명 이상 시 staff inbox 알림 1건 (cohort progress 페이지 deep link). 이메일은 feat-7-022 weekly-report 에 포함되어 중복 안 함. | P1 | ✅ |
| feat-7-024 | **합격 진단 점수** — 학생 대시보드 KPI. 가중평균 모델(`predictPassScore`). **GS 응시 기록이 있으면 5요소**(학습량 25 + 정답률 25 + GS 30 + 활성도 10 + 완수 10), **없으면 4요소**(학습량 40 + 정답률 40 + 활성도 10 + 완수 10) = 0~100점. rating 4단계(안정 80+/가능 60+/주의 40+/취약). 대시보드 상단 큰 카드 — 점수 + tone + component 막대 + hint. `getUserGsAveragePct` 가 채점 완료 GS 응시의 (total_score / round max_score) 평균. **`/study/stats` 한눈에 탭에 최근 12주 정답률 추이 미니 차트**(`getUserAccuracyTrend` — KST Monday 주별 막대). | P1 | ✅ |
| feat-7-025 | **1:1 상담 코멘트** — 강사가 학생에게 비공개 메모. `student_notes` 테이블(student_id/author_id/body_md/visibility/is_pinned). visibility=`staff_only`(강사만)/`share_with_student`(학생도 read). RLS: author 본인 + admin 전부 CRUD, 학생 본인은 공유된 코멘트만 read. `/api/admin/student-note` CRUD + `/admin/students/:profileId` 코멘트 패널(핀/공유 토글, 작성자 + 시각 표시, edit/delete). | P1 | ✅ |
| feat-7-026 | **cron 엔드포인트 e2e 회귀 보호** — `/api/cron/curriculum-weekly` · `/weekly-reports` · `/inactive-alert` 3개 엔드포인트의 인증(secret 없으면 403, 잘못된 secret 도 403) + 정상 응답 shape(ok + summary). `e2e/admin/cron-endpoints.spec.ts`. CRON_SECRET 환경변수 필수. weekly-reports 는 실제 이메일 발송이라 `RUN_WEEKLY_REPORT_E2E=1` 명시적 opt-in 시만 실행. | P1 | ✅ |
| feat-7-027 | **합격 진단 점수 시계열** — `pass_prediction_snapshots`(user_id/score/rating/components jsonb/snapshot_date PK 일 1회). `/api/cron/pass-predict-snapshot` 일별 호출 → 모든 활성 cohort 멤버 predict + upsert. `getUserPassPredictionTrend` 최근 N일. 학생 `/study/stats` 한눈에 탭 + 운영자 `/admin/students/:id` 에 막대 차트(점수+델타 badge). RLS: 본인 + cohort owner/admin. | P1 | ✅ |
| feat-7-028 | **상담 코멘트 학생 알림 fanout** — `staff_notification_kind` enum 에 `student_note_shared` 추가. `createNote` 시 visibility=share_with_student 면 학생 inbox 알림(best-effort). `updateNote` 시 staff_only → share 로 전환되는 경우만 알림. body preview(120자) + `/inbox` deep link. | P1 | ✅ |
| feat-7-029 | **lecture 시청 추적** — `lecture_views`(user_id/item_id/viewed_at/completed_at/last_position_sec, UNIQUE(user,item)) + `/api/student/lecture-progress`(view/complete/position) + `/lectures/:itemId` 학생 viewer. YouTube/Vimeo URL 자동 embed(toEmbedUrl). 페이지 진입 시 자동 view 기록 + "수강 완료" 버튼. RLS: 본인 R/W + cohort owner/admin read. **YouTube/Vimeo postMessage 자동 진행률 추적**(`TrackedLectureFrame` 컴포넌트) — YouTube 는 `enablejsapi=1` + `event:"listening"` 핸드셰이크 + `getCurrentTime`/`getDuration` 5초 폴링 + `infoDelivery` 수신. Vimeo 는 `method:"addEventListener", value:"timeupdate"` 구독 + `timeupdate` 이벤트 수신. 위치 저장 15초 임계 + 시청 비율 ≥85% 시 자동 완료 마킹. `pagehide` 시 `navigator.sendBeacon` 으로 최종 위치 flush. 재진입 시 마지막 위치(`?start=N`)부터 재생. | P1 | ✅ |
| feat-7-030 | **이번 주 트랙 학생 카드** — 대시보드 상단. 학생이 멤버인 cohort 의 활성 cohort_curricula 에서 KST 기준 weekNumber(`floor((today - start_date)/7)+1`) 계산 → `curriculum_weeks` + `curriculum_items` 노출. 항목별 진입 URL(`/subjects/.../articles/:n`, `/subjects/.../cases/:id`, `/subjects/.../problems/:id`, `/subjects/.../articles/:n?blank=...`, `/subjects/.../articles/:n?recitation=1`, `/lectures/:itemId`). 항목별 완수 표시 — lecture_views(completed_at) / study_sessions(article·case) / user_problem_attempts(is_correct) / user_blank_attempts(전 칸 정답) / user_recitation_attempts(is_complete). 자동 생성된 assignment 가 있으면 "과제로 보기" deep link. `getCurrentWeekTrack(userId)` (curricula/queries.server.ts). 카드 컴포넌트는 dashboard.tsx 내부(`WeekTrackCard`). | P0 | ✅ |
| feat-7-031 | **4단계 회원 권한 (원장·관리자·강사·수험생)** — `user_role` enum 에 `manager` 추가(등급 student<instructor<manager<admin). 역할 SSOT `app/core/lib/roles.ts`(rank·label) + `requireMinRole` 가드. RLS 약 92개 정책 4단계 재분류(`private.is_staff`=강사+ / `private.is_manager`=관리자+, `subscription_plans` write 만 원장 전용). **`profiles` self-escalation 취약점 차단 트리거** — role 변경은 service_role(운영자 API)만. 관리자=강사+전체 운영, 원장=관리자+역할변경·요금제. 상세: `docs/features/feat-7-031-roles.md`. | P1 | ✅ |
| feat-7-032 | **운영 워크큐** — `/admin` 허브 상단 6타일 액션 카운터. RPC `admin_work_queue_counts` (security definer + private.is_staff 가드, 단일 호출 6 카운트): 오늘 신규 가입 / ~~첨삭 대기~~(2026-08-18 첨삭 폐지로 타일 제거, RPC 컬럼은 잔존·미사용) / AI 부정 피드백 미검토 / 미배정 점검(4법+민소법 체계도·판례·문제 누락 합산) / 7일 무접속 학생(가입 ≥14일 + study_session 없음) / 감사 이상(bulk delete burst≥10·권한 변경). 카운트>0 타일은 amber tone + deep link, 0 은 neutral. `getAdminWorkQueue` (work-queue.server.ts) → `WorkQueueRow` 컴포넌트(admin.tsx). | P1 | ✅ |
| feat-7-033 | **콘텐츠 헬스 통합 점수** — `/admin/laws/health` 신규. 5법(특·상·디·민·민소) × 8지표(조문 본문/빈칸/체계도/강사메모/판례 매핑/판례 요지/객관식 해설/조문당 문제) 매트릭스. RPC `admin_law_health_matrix` (security definer + private.is_staff 가드) 가 ratio 0~1 + 종합 점수(8지표 평균 × 100, 0~100 smallint) 반환. `getLawHealthMatrix` 는 가장 낮은 ratio 의 지표를 weakestMetric 으로 자동 추출. 화면: 법별 카드(점수·tone·"지금 작업하기" deep link → completeness) + 전체 매트릭스 표(가로 8 dim + 종합). tone: ≥80 에메랄드 / ≥50 앰버 / 그 외 로즈. 법령 운영 허브(`admin-laws-hub`) 상단 진입 배너 + 사이드바 cluster=laws 의 두번째 메뉴로 노출. | P1 | ✅ |
| feat-7-034 | **감사 로그 이상 탐지 알림** — `/admin/audit-logs` 상단 "이상 신호" 패널 + 워크큐 카운터 연동. RPC `admin_audit_anomalies(p_hours int)` (security definer + private.is_staff 가드) 가 카테고리별 anomaly row 반환 — (1) `bulk_delete`: 같은 actor+entity_type 1시간 윈도우 ≥10건 delete (severity: ≥50 high / ≥20 medium / 그 외 low) (2) `role_change`: `user.role.update` 단건 (always high). actor 이름·시각·대상 entity_type·event_count·sample log_id·detail jsonb 포함. `listAuditAnomalies(client, hours)` + `AnomalyPanel` 카드 그리드(severity tone 3단계 — rose/amber/sky). `admin_work_queue_counts` 의 audit_anomalies 카운터를 동일 룰로 정합화 (action 이름 `user.role.update` 정정). | P1 | ✅ |
| feat-7-035 | **수강생 위험군 통합 큐** — `/admin/cohorts/at-risk` 신규. feat-8-014 단일 cohort `getAtRiskStudents` 의 cross-cohort 확장. `getCrossCohortAtRisk` (at-risk-cross-cohort.server.ts) — instructor 는 자기 소유 cohort, manager+ 는 전체 cohort 의 위험 학생 통합 → 같은 profile_id 가 여러 반에 있으면 risk 가장 높은 것만 유지 (dedupe). 화면: 4 KPI (고위험·주의·관찰·합격자 표본) + cohort/risk 드롭다운 필터 + 학생 표(체크박스·반·risk·정답률·풀이수·무접속·사유 chips·"노트" CTA → `/admin/students/:id#notes`). **일괄 격려 메시지**: 선택한 학생들에게 `announcement` kind in-app notification 발송(POST `/api/admin/at-risk-notify` zod intent=send-encouragement, body 2~300자). 카카오 알림톡·이메일은 후속 (v1.1). 사이드바 cluster=cohorts 의 세번째 메뉴로 노출. | P1 | ✅ |
| feat-7-036 | **시드 import dry-run UI** — `/admin/seeds/preview` 신규. Non-negotiable §8 화면화 — 다건 일괄 정정을 CLI 스크립트 없이 운영자 UI 에서 dry-run preview → 승인 → 적용. 시드 v1 범위: `articles.importance` (CSV `law_code,article_number,importance 0–5`) + `cases.importance` (CSV `case_number,importance 0–5`). `seed-preview.server.ts` 의 `preview*` 가 row 별 diff(changed/unchanged/not_found/invalid) 반환, `apply*` 가 변경된 row 만 UPDATE + `audit_logs` 에 `article.importance.bulk_update` / `case.importance.bulk_update` 기록(metadata: attempted·applied). 화면: 엔티티 라디오 + CSV textarea(헤더·`#` 주석 자동 인식) + 미리보기 결과 표(현재→신규·상태·비고) + "N건 적용" 버튼. 사이드바 cluster=laws 4번째 메뉴. 조문 본문(`article_revisions`) in-place 수정은 본 도구에서 지원하지 않음 — 개정 흐름(feat-7-004) 사용. | P1 | ✅ |
| feat-7-037 | **판례 전문 자동 재확인·적재** — 미적재 대법원 판례를 일1회 cron 으로 open.law.go.kr 재확인 → 등록되면 전문+PDF 자동 적재. `cases` 재확인 추적 컬럼 3종(`official_text_checked_at`/`_check_count`/`_unavailable`) + 부분 인덱스. import 로직을 `precedent-import.server.ts` 로 추출(스크립트·cron 공유, triple-match 안전망 유지). cron `/api/cron/recheck-precedents`(배치 5건, Hobby 호환) — 성공 시 content_chunks dirty. 하급심(특허법원 허·고등/지법)은 초기 백필로 `unavailable` 마킹(API 낭비 방지). admin-case-pdf-missing 에 재확인 메타 컬럼+**역방향 전문 PDF 업로드**(staff 가 찾은 PDF → mupdf 텍스트 추출 → official_text_md 적재 + reindexCases 로 검색·AI Q&A 학습 활성화, 같은 버킷/필드라 뷰어 자동 표시). 대법원 외는 cron 1회 시도 후 unavailable. 상세: `docs/features/feat-7-037-precedent-auto-recheck.md`. **구현 완료(로컬 검증: due 쿼리·mupdf 추출 8254자·typecheck). 배포 후 검증: cron 첫 실행(KST 1:30)·서버리스 mupdf/폰트 번들.** | P2 | ✅ |
| feat-7-040 | **온라인 종합반 관리자 학습현황** — 3관점(반 전체 조망·개별 학생 파악·이상 신호 감지) + 보안·동의 정합. 설계 `docs/features/온라인종합반-관리자-학습현황.md`. **P0 보안·법무**: `at-risk-notify` 발송에 담당 반 멤버 서버 재검증(`getNotifiableStudentIds`·권한 밖 id 포함 시 403 fail-closed) · **약관 제7조 신설**(강사 지도형 과정에서의 학습현황 열람 = 계약 이행, 개인정보 보호법 15①4)·처리방침 보강 · 강사 열람 **고지 배너**(`InstructorAccessNotice`, cohort 멤버 한정 — 미등록자엔 비노출). **P1 개별뷰**(`admin-student-detail`): 단원 마스터리·성장(레벨·스트릭·공부량, `getGamificationSummary` persist=false 로 학생 상태 무변경) · 실제 응시결과(`listMyExamResults`) · 공부량 반내 위치(`getStudentCohortStudyRank` — 제7조 근거 반 전체 변형, `getCohortStudyPercentile` 의 B동의 대칭 모델과 구분). **P2 이상 신호**: `getAtRiskStudents` 에 개인 시계열 추세(정답률 급락·공부량 급감·진도 정체) 가산, ★표본 가드로 학기초 오탐 차단. **P3 조망**: `admin-cohort-stats` 에 반 공통 약점 단원(`getCohortWeakNodes`) 편입. | P1 | ✅ |
| feat-7-041 | **전체 학습현황 + 운영관리 IA 재구성** — (A) 운영관리 사이드바·허브를 **4개 상위 섹션**(콘텐츠 제작·수강생 운영·시험·분석·시스템)으로 그룹화, 과적재 `comms` 에서 **AI Q&A 운영** 클러스터 분리, `analytics` → "학습·합격 분석" 개명, 거짓 "9 클러스터" 라벨 제거. (B) **전체 학습현황** `/admin/analytics/students` 신규 — **manager+ 전용**(강사는 담당 반만, 약관 제7조), **집계·익명**(개인 식별 없음, 개인은 `admin-student-detail`). 모집단 = **활성 반 가로지른 distinct 학생**(자습 비종합반 제외 → 제7조 근거 모집단과 일치). KPI 밴드(수강생·7일활성·평균정답률·평균풀이·평균조문·활성반) + 정답률 분포 + 과목별 평균 + **반별 비교 표**(정답률 낮은 반 우선, 반 통계 deep link) + 위험군·약점 모니터링 연결. 재사용: `summarizeProgressForProfiles`(스캔 코어 추출)·`aggregateStatsFromMembers`(집계 추출)·`getAllStudentsOverview`(distinct 1회 스캔). **⑥ 전체 공통 약점 단원**: `getCohortWeakNodes` 의 시도 스캔(과목 무관)을 `fetchLatestAttemptsForProfiles`/`weakNodesFromLatestAttempts` 로 분리 → `getAllStudentsWeakNodes` 가 전체 모집단 1회 스캔으로 5과목 약점 merge(공통 가드 minRatio 0.15·floor 3, 반 0.3보다 완화). 무거우므로 **지연 로드 리소스 라우트**(`/admin/analytics/students/weak-nodes`, manager+) + 화면 useFetcher on-demand. at-risk 는 전용 화면 연결 유지. 위계=전체→반별(반 통계 deep link)→개인(student-detail) 드릴다운. **#1 약점 역추적**: 공통 약점 단원 행 펼치면 그 단원이 약한 **반별 정답률 + 약한 학생 명단**(정답률 낮은 순, 학생→상세·상담 직결) 지연 로드 — `buildProblemNodeAttribution` 추출 + `getWeakNodeBreakdown(lawCode,nodeId)`(시도 1회 스캔, manager+ 게이트, 약관 제7조 근거 개인식별). 약점이 정보 막다른길→상담·과제 행동으로 연결. **#2 반별 추세**: 반별 비교 표에 정답률 추세(최근14d vs 직전14d %p, 표본 ≥10 가드)·활동 추세(최근7d vs 직전7d 풀이 학생수) 컬럼 — `computeCohortTrendDeltas`(최근 28일 날짜한정 1회 스캔, overview 통합). 어느 반이 나아지고/처지는지 한눈. **#3 개인 위치**: admin-student-detail 의 "반 평균 대비" 카드에 **전체 평균 대비**를 같은 축에 추가(정답률·문제풀이·조문열람 각각 반/전체 2줄) — `getSchoolAverages`(활성 반 전체 학생 진척 1회 스캔, by-subject·델타 없이 KPI만). 위계 끝(개인)을 반·전체 조망과 연결. | P1 | ✅ |

| feat-7-042 | **오프라인 테스트** — 종합반 과제에 시험지 제작(빈칸·OX·객관식을 과목/파트/중요도로 조합) + 실제 시험지 양식 인쇄/PDF(문제지·정답해설지) + 오프라인 채점 결과 문항별 입력(그리드, 오답만 클릭) → 학생별 quiz_session(scope_payload.source='offline_test') + attempts 기록으로 **온라인 학습 신호에 합류**(약점진단·마스터리·반 통계 자동 통합) + 테스트·반 통계. 테이블 5종 `offline_tests`/`offline_test_questions`/`offline_test_results`/`offline_test_answers`(Phase 1 문항별 정오)/`offline_test_series`(feat-7-044 회차). Phase 1(2026-08-13): 배포 게이트(status draft/published/closed)·정오 스냅샷 question_id 키 전환·지필 결과 SRS 합류. 상세: `docs/features/feat-7-042-offline-test.md`. | P1 | ✅ |
| feat-7-043 | **출결 대장** — 종합반 오프라인 수업 회차(`cohort_class_sessions`)별 출석(`cohort_attendance`: 출석/지각/결석/온라인 대체/공결). `/admin/cohorts/:id/attendance` 회차 관리+학생별 누계 출석률, 회차별 출석 체크 그리드(전원 출석 기본·예외만 변경). 학생 `/assignments` 출결 요약 카드 + at-risk "최근 결석" 신호 합류. 온·오프 병행 종합반 주간 리듬 P0-①. 상세: `docs/features/feat-7-043-attendance.md`. | P0 | ✅ |

| feat-7-045 | **약점 개인 보충 과제 자동 생성** — assignments.target_profile_id(개인 과제, RLS member_read 개인 필터) + 학생별 약점(getWeakNodes)→picker seam→개인 과제 N문항. 반 과제 화면 [지금 생성]+자동 토글(cohorts.weak_assignment_auto), /api/cron/weak-assignments 주간. 주 1회 가드·최근 4주 출제 제외. 병행 종합반 P0-③(진단→처방 루프 폐쇄). 상세: `docs/features/feat-7-045-weak-personal-assignment.md`. | P0 | ✅ |
| feat-7-047 | **오프라인 학습 통합 Phase 3 — 진단·월간 계획·승인·기록** — 종이 상담 루프의 플랫폼 이전. 학생 진단(초시/재시·가용시간·과목별 수준, 자연과학 상/중/하는 진단 테스트 `offline_tests.is_diagnostic` 정답률 자동 파생 0.7/0.4) + 월간 계획(`study_plans`/`study_plan_items`, 승인 워크플로우 `approve_study_plan` RPC 원자 전이, 과욕지수·약점회피 자동 신호, 제출 회수) + 일일 기록(`study_logs` **append-only**, 기대 항목 파생·계획 외 학습·역방향 취소) + 격주 체크포인트(`study_plan_checkpoints`, checkpoint_date 소급 계산 스냅샷) + 지표(달성률·미분류 비율·과제 이행률 병기, 준수율=현재 승인본, 미제출 월 null). 학생 `/study/plan`(+`/log`)·staff `/admin/cohorts/:id/plans`. 상세: `docs/plans/phase3-stage1-design.md`·`phase3-completion-report.md`. | P0 | ✅ |
| feat-7-048 | **오프라인 종합반 운영 v2 — 진단·계획·공부통계·기록·타이머** — 4주 운영 피드백 반영(원장 요구서 `source/종합반운영/`). A 진단 진입 시기·가용시간 시/분 입력·시간 표기 통일 + 과목별 수준 드롭다운화(`basic_course_status`·`study_direction`) + 반 차수(`cohorts.exam_round` — 1차 반은 민사소송법 숨김) / B **상담자 계획 직접 편집**(in-flight 편집 → 대신 제출 → 기존 `approve_study_plan` RPC, `authored_by` 귀속) / C **공부 통계**(월 히트맵·일/주/월 탭·날짜별 상세, 진행 지표·격주 체크포인트 흡수, 과목 축 `subject_kind/code` + 색 팔레트) / D 기록 화면 개편(시각 축 10분 타일·미래 날짜 차단·계획 외 학습 과목 선택) / E **과목별 타이머**(`study_timer_sessions`, 진행 중 1개·자정 분할·미종료 복구, 총량 입력과 학생 선택 `record_mode`). 상세: `docs/features/feat-7-048-cohort-ops-v2.md`. | P0 | ✅ |

상세 스펙: `docs/spec-detail-5-7-admin.md` (작성 예정).

---

## 5.8 합격 데이터 / 분석 (Phase A — 데이터 캡처)

플랫폼의 최종 가치 = **합격자 데이터 기반 컨설팅**. 그 전제로 합격 결과(연도×차수 단위)와 학습 데이터 분석 활용 동의를 명시적으로 수집·관리. 분석 화면(Phase B)·합격자 비교 컨설팅(Phase C)·결제(Phase D)는 후속.

| ID | 기능 | 우선순위 | 상태 |
|----|------|:-------:|:---:|
| feat-8-001 | **exam_results 데이터 모델** — `exam_round`(first/second), `exam_result_status`(absent/pending/failed/passed), `exam_verification_status`(self_reported/document_submitted/verified/rejected) enum + `exam_results`(user_id/exam_year/exam_round/status/self_reported_total_score/self_reported_subject_scores jsonb/verification_status/certificate_path/verified_by/verified_at/rejection_reason/study_summary_md, UNIQUE(user,year,round)). `profiles` 컬럼 추가: `analytics_consent_at`/`next_exam_year`/`next_exam_round`. RLS: 본인 R/W(verification 컬럼 staff 만 변경, verified row 학생 삭제 차단) + cohort owner read + admin all. `exam-certificates` private storage 버킷(<user_id>/<result_id>/*, PDF/PNG/JPEG/WebP, 10MB). `user_notifications.kind` 에 `exam_certificate_submitted` 추가. | P0 | ✅ |
| feat-8-002 | **학생 결과 입력 + 동의 화면** — `/me/exam-results`. 연도×차수별 카드(상태/자가점수/학습 요약). 합격증 업로드(클라가 직접 Supabase Storage 업로드 → `intent=certificate` action 으로 `certificate_path` 첨부 + admin 인박스 알림 fanout). 분석 활용 동의 토글(`analytics_consent_at` set/null). 차기 응시 의향(연도/차수). | P0 | ✅ |
| feat-8-003 | **운영자 결과 일람·인증** — `/admin/exam-results`. 풀 사이즈 카드(합격 인증·합격 자가·불합격·인증 대기·분석 동의). 필터(연도/차수/상태/인증 상태/학생 검색) + 표 + 합격증 signed URL(5분) 열람 + 인증/반려 처리(admin 만). instructor 는 본인 cohort 학생만 read-only. | P0 | ✅ |
| feat-8-004 | **분석 활용 동의 약관** — `/legal/analytics-consent`. 수집 항목/처리 방식/보유 기간/동의 거부 권리/철회 방법/인증 결과 처리 명시 (PIPA §22, §15 1.1 별도 동의). | P0 | ✅ |
| feat-8-005 | **시즌별 결과 입력 알림 cron** — `/api/cron/exam-result-reminder` (CRON_SECRET, ?year=YYYY 옵션). `profiles.next_exam_year`/`next_exam_round` 설정 + 해당 (year,round) `exam_results` 미입력 학생을 후보로 산출 → 14일 throttle(같은 entity_id 알림 14일 내 존재 시 skip) → `user_notifications` insert(kind=`exam_result_reminder`, entity_id=`{year}-{round}`, href=`/me/exam-results`) + `notify_channels='email'` 활성 사용자에 Resend 이메일 발송(템플릿 `exam-result-reminder.tsx`). best-effort — 이메일 실패해도 인박스 알림은 유지. | P1 | ✅ |
| feat-8-006 | **(Phase B 첫 단계) 합격자 케이스 카드 + 통계 시각화** — `/admin/analytics/passers` admin 전용. 합격자 1명당 카드 — 시험 결과·자가 학습 요약·(분석 동의자만) 학습 로그 집계(`computeAggregates`: 응시 전년도~응시 연도 user_problem_attempts/study_sessions/user_blank_attempts/user_recitation_attempts → 풀이수·정답률·시간·활동일수·최장 streak·과목별 풀이 top5·빈칸/암기). 풀 사이즈 카드(합격 총수/인증/동의/표시) + 연도·차수 분포 + 필터(연도/차수/인증만/동의자만). 미동의자는 결과+자가 요약만, 학습 로그는 가림. `listPasserCases`/`getPasserPoolStats` (analytics.server.ts). **분포 통계 시각화**(`computePasserAggregateStats`/`StatsSection`) — 자가 점수·학습 시간·정답률·활동 일수·최장 streak·총 풀이 회수 6종 히스토그램(N/중간값/평균/IQR) + 과목별 평균 풀이/정답률 막대. 분석 동의자만 표본 포함, 표본 0명일 땐 안내 배너. | P1 | ✅ |
| feat-8-007 | **(Phase C) 합격자 비교 컨설팅 카드** — 대시보드 상단 `PasserBenchmarkCard`. `getPasserBenchmarks(userId)` — 본인 `next_exam_year/round` 매칭 합격자(분석 동의 + aggregates 보유) 표본 산출, 표본 <3 시 (year-1, same round) fallback → 그래도 부족하면 전체 동의 합격자. 5종 지표 비교(학습 시간/총 풀이/정답률/활동 일수/최장 연속) — 본인 값 / 합격자 평균 / 차이(+/-, % delta) / 분위(0~100). `metricFromValues` percentile + 색상 chip(green=ahead, red=behind). fallback 사유/계획 미설정 안내 배너. **`PasserSummariesPreview`** — 합격자 후기 top 3 대시보드 노출. | P1 | ✅ |
| feat-8-009 | **합격자 학습 후기 모음 (anonymized)** — `/study/passer-summaries` 학생 누구나 접근. `listPasserSummaries({year, round, limit})` — 분석 동의 + `study_summary_md` 보유 합격자만, 이름/이메일 마스킹. 표시: 연도·차수·점수 버킷(`60-64점` 등)·인증 chip·markdown 본문. 대시보드 미리보기 카드 3건 + 전체 페이지. | P1 | ✅ |
| feat-8-010 | **시연·QA 시드 데이터 도구** — `profiles.is_synthetic` flag + `seedPasserData(count)`/`cleanupSeedPassers()`/`getSeedCount()` (seed.server.ts). `/admin/analytics/passers` 상단 SeedToolBox: 1~20명 일괄 생성 / 전체 삭제. 합성: auth user(disposable email) → 트리거가 profile 생성 → mark `is_synthetic=true`/`analytics_consent_at` → exam_results(`passed`, 점수 63~92, 60% verified) + study_summary_md 랜덤 → user_problem_attempts(1500~4000건, 정답률 60~85%) + study_sessions(180~340 활동일, 800~2400h). 삭제 시 auth.users.deleteUser → FK CASCADE 정리. 시연·영업·QA 용도, 실제 합격자가 모이면 분석에서 옵션 필터링 가능. | P1 | ✅ |
| feat-8-011 | **약점 단원 합격자 가이드** — 대시보드 "약점 단원 (체계도)" 카드 각 row 에 `PasserLawHint` 인라인 chip. `getPasserLawAverages()` — 분석 동의 합격자의 과목(law_code)별 평균 풀이 회수/정답률/learners. 행 데이터: "합격자 평균 N회 · M% 정답률 · +K회 더 풀어 보세요" (본인이 미달 시) / "이미 합격자 평균 이상" (둘 다 상회 시). tone 3단계(rose/blue/emerald). | P1 | ✅ |
| feat-8-012 | **합격자 학습 곡선 12주 비교** — `/study/passer-trend` 학생 누구나 접근. `getPasserTrendData(userId)` — 합격자 응시일 근사(1차=2/25, 2차=7/20) 기준 D-11주~D-0주 주별 활동(study_sessions/user_problem_attempts) 평균 시리즈 + 본인의 next_exam_year/round 기반 D-W 매핑 + 현재 주차 marker. 3종 SVG 라인 차트(주별 학습 시간 / 풀이 회수 / 정답률) — 합격자 평균(solid) + 본인 곡선(dashed) + "지금" 세로선. 표본/fallback/계획 미설정 안내 배너. 대시보드 PasserBenchmarkCard 에 "12주 곡선 →" 진입 링크. | P1 | ✅ |
| feat-8-013 | **자동 학습 추천 액션 카드** — 대시보드 상단 `RecommendedActionsCard`. `generateRecommendedActions` 순수 함수(recommendations.ts) — 합격자 비교/약점/과제/streak/진단점수 결합해 priority(high/medium/low/celebrate) 별 액션 산출. 7종 룰: 마감 임박 과제, 학습 시간 격차, 정답률 격차, 풀이 회수 격차, 약점 단원(합격자 평균 hint), 슬럼프/연속 학습, 진단 '취약', 계획·표본 미설정 안내. 합격자 평균 모든 지표 상회 시 celebrate 카드. tone 4단계 색상 + 아이콘 + CTA + metric chip. priority 정렬 + top 5 cap. | P1 | ✅ |
| feat-8-014 | **강사용 위험 학생 자동 분류** — `getAtRiskStudents(cohortId)` (at-risk.server.ts) — 합격자 평균(분석 동의자, 풀이 회수 + 정답률) baseline 산출 + cohort 멤버별 격차 + 비활성 일수(7/14/21일 단계)를 weighted 합산 (정답률 0.5 / 풀이 0.3 / 비활성 0.2) → 0~1 risk score → high(≥0.55) / medium(≥0.30) / low. `/admin/cohorts/:id` cohort detail 에 `AtRiskCard` (top 5, 위험 사유 chip, "1:1 코멘트" CTA → `/admin/students/:id#notes` deep link). baseline 0표본 fallback(비활성·낮은 정답률 only). 학생 상세 노트 섹션에 `id="notes"` 앵커 추가. | P1 | ✅ |
| feat-8-015 | **합격 vs 비합격 패턴 비교 분석** — `listFailerCases` + `computeGroupComparison` (analytics.server.ts) — 두 그룹 평균/중간값/IQR + 절대·상대 격차 metric 5종(학습 시간/풀이/정답률/활동일수/streak). `/admin/analytics/failure-patterns` admin 전용 — 표본 크기 카드, 격차 큰 metric top 3 인사이트, 전체 비교 표 + 두 그룹 막대. **학생 위험 신호** — recommendations.ts 에 `failerBaseline` 입력 추가, 본인 metric 2개 이상이 비합격 평균에도 못 미치면 high priority "비합격자 패턴 위험 신호" 액션, 1개면 medium. 시드 도구에 비합격자 시드 폼 추가 — 두 그룹 분포 분리 (passers 점수 63~92/학습 800~2400h vs failers 40~62/250~1100h). | P1 | ✅ |
| feat-8-016 | **랜딩 페이지 합격자 통계 마케팅** — `getPublicPlatformStats()` (analytics.server.ts) — 인증 없이 합격자 카운트(전체/인증/분석동의) + 평균 학습시간/문제풀이/정답률/활동일수 + 후기 카운트. home.tsx 에 `PasserStatsSection` (hero 다음, FeaturesSection 위) — Stat 카드 4종(분석 합격자/평균 학습/평균 풀이/평균 정답률) + 기능 미리보기 3종(평균 대비 비교/자동 추천 액션/12주 곡선) + "가입하고 비교 보기" CTA. 표본 0명일 땐 섹션 숨김. 합격자 시드 도구로 즉시 시연 가능. | P1 | ✅ |
| feat-8-017 | **가입 직후 Onboarding 3단계 wizard** — `profiles.onboarded_at` 컬럼 추가. `/onboarding/welcome` — Step 1 응시 계획(next_exam_year/round/science) → Step 2 분석 동의 → Step 3 학습 목표(examDate/weeklyGoalHours). 각 step 저장 후 진행, 어디서든 "지금은 건너뛰기" 가능, 완료/skip 시 onboarded_at 설정. 대시보드 loader 가 onboarded_at IS NULL 사용자를 wizard 로 redirect (단, 기존 설정 데이터 보유 사용자는 자동 onboarded 처리해 컬럼 도입 이전 가입자 보호). 진행 표시 dots 3단계 + CheckCircle. | P1 | ✅ |
| feat-8-018 | **Phase D 결제·구독 인프라 (MVP)** — `subscription_plans` (code/name/price_krw/duration_days/features jsonb) + `payments` (toss_order_id 유니크, toss_payment_key/toss_response/status) + `user_subscriptions` (started_at/expires_at/status) 3 테이블 + RLS(self read, admin read all). seed 3 플랜(free/pro_monthly ₩29,900 30일/cohort 학원 상담). `/pricing` 공개 가격표 + 토스페이먼츠 client SDK 결제 + `/api/payments/create-order`(pending payment 생성) + `/api/payments/toss/confirm`(서버 confirm + payment.completed + subscription 연장/생성). `/me/subscription` 본인 구독 상태 + 결제 이력. `getActiveSubscription`/`hasFeature` helper. 환경변수 `TOSS_CLIENT_KEY`/`TOSS_SECRET_KEY` 필요. | P1 | ✅ |
| feat-8-019 | **권장 진도 합격자 실측 보정** — `/goals` 화면에 `PasserCalibrationCard` 추가. 합격자 평균(학습 시간/풀이/정답률) vs 본인 누적 + 격차 chip + "실측 권장 일평균 학습 시간 = 부족분/남은 일수" 계산. 본인 일 목표와 비교(±%) 안내. fallback 시 표본 부족 배너. `getPasserBenchmarks` 재활용. | P1 | ✅ |
| feat-8-020 | **모바일 UX 폴리시** — 대시보드 PasserBenchmarkCard `BenchmarkRow` 5→2 cols 모바일 스택. 운영자 `admin-failure-patterns` 표 `overflow-x-auto` + min-width. 기존 Tailwind 반응형 utility 활용한 onboarding/pricing/my-subscription 화면은 정상 작동 확인. | P2 | ✅ |
| feat-8-021 | **통합 코멘트 (조문/판례/문제)** — `content_comments` 폴리모픽 테이블(target_type/target_id/body_md/author/is_pinned) + RLS(public read / staff insert / author or admin update·delete). 기존 `article_comments` (단일 평석) 데이터 마이그레이션 후 DROP. `/api/comments/comment` CRUD endpoint(create/update/delete). `CommentsPanel` 공용 컴포넌트(다중 코멘트 + 핀 + 인라인 수정/삭제). article-viewer / case-viewer / problem-viewer 우측 패널에 통합 적용 — staff 작성, 모든 사용자 read. 기존 ArticleCommentPanel + /api/laws/article-comment 정리. | P0 | ✅ |
| feat-8-022 | ~~하이라이트형 코멘트~~ — **feat-8-023 으로 대체됨.** 앵커형(하이라이트형) 코멘트는 제거되고, 강사 하이라이트의 학생 노출은 작성자 역할 기반 가시성으로 대체. 상세: `docs/features/feat-8-022-comment-highlight.md` | P1 | ✅ |
| feat-8-023 | **주석 3종 통합 · 작성자 역할 기반 가시성** — 하이라이트 / 포스트잇(기존 메모) / 메모(기존 코멘트) 3종으로 정리. 가시성을 작성자 역할로 통일 — 강사 작성 주석은 전체 수험생 공개, 수험생 작성 주석은 본인 전용 (RLS `private.is_staff`). feat-8-022 앵커형 코멘트 제거 — `content_comments` 앵커 컬럼 6종 DROP + `deleted_at` 추가 + 학생 작성 허용. `user_highlights`/`user_memos` SELECT RLS 를 본인 OR 강사작성 으로 확장. 강사 하이라이트는 배경+밑줄(`lidam-hl-staff-*`)로 시각 구분. 용어 변경(화면 표시만): 코멘트→메모, 메모→포스트잇. 상세: `docs/features/feat-8-023-annotation-visibility.md` | P1 | ✅ |
| feat-8-024 | **기출문제 지문 기반 판례 연동** — 객관식 1차 기출문제(origin=past_exam·exam_round=first·format mc_*)의 지문(body_md+choices+box_items)에서 사건번호 토큰을 추출, `cases.case_number` 정확일치로 `problem_case_links` 자동 생성(`scan_exam_case_links()` plpgsql 함수). 판례 뷰어는 1차 기출을 문제별 칩으로 표시(클릭→문제). 미탐지 문제용 수동 매칭 staff 화면. 기존 1차 데이터 정리 — `cases.exam_1st_years` 비우기 + 1차 객관식 기존 링크 삭제 후 재스캔. 역방향 매칭(`case-exam-problems` 화면, bulk 문제↔판례 탭) 제거. 상세: `docs/features/feat-8-024-exam-case-linking.md` | P1 | ✅ |
| feat-8-025 | **운영자·강사 중요도 별점** — 판례·조문 뷰어 오른쪽 패널의 "즐겨찾기" 탭을 staff(instructor/admin)에게는 중요도 ★ 별점 에디터로 분기(`ImportanceRating` + `/api/admin/importance`). 학생은 기존 개인 즐겨찾기 유지. `cases.importance`/`articles.importance` 직접 수정 — 별도 편집 화면 불필요. 판례 importance 는 기출횟수(1차 `problem_case_links` + 2차 `exam_2nd_years`) 기반 1회성 backfill(0~2회→★1·3회→★2·4회+→★3). `admin-case-edit` 중요도 입력란 제거. 상세: `docs/features/feat-8-025-staff-importance-rating.md` | P1 | ✅ |
| feat-8-008 | **3-tier 가격 정책 + 영역 게이팅** — 무료(회원1)/정회원 ₩99,000·월(회원2)/종합반 상담(회원3). 메뉴 영역 단위 접근 제어 — `subscription_plans.features` 영역 플래그(`area_subjects`·`area_study_aids`·`area_study_mgmt`·`area_mock_exams`) + `requireFeature` 서버 가드 + 네비 잠금 UI. feat-8-018 결제 인프라 위에 게이팅. 회원3 = 활성 cohort 멤버. 선행: feat-3-205. 상세: `docs/features/feat-8-008-pricing-tiers.md`. | P2 | ✅ |
| feat-8-026 | **학습 데이터 활용 필수 동의 (가입 전제)** — 학습 데이터 처리를 서비스 본질(PIPA 15①4 계약 이행)로 이용약관 편입해 가입의 전제 조건화. `profiles.service_data_consent_at`(필수, 기존 선택 `analytics_consent_at` 와 별개·기존 분석 로직 불변). `requireServiceDataConsent` 게이트(private/dashboard layout, 학생 한정·staff 면제, allow-list `/consent`·`/logout`·`/api`) → 미동의 학생 `/consent` 강제. `join.tsx` 필수 체크박스 2종 + 소셜은 게이트로 수렴. 이용약관·개인정보처리방침 한글 재작성(영문 stub 대체) + analytics-consent 선택 범위 명확화 + 온보딩 Step2 선택 표기. 상세: `docs/features/feat-8-026-mandatory-data-consent.md` | P0 | ✅ |
| feat-8-028 | **요금·상품·할인 운영관리** — 구매 상품 = `subscription_plans` row(가격+`subject_codes`+`product_kind`). 개별 과목(특/상/디/민)·번들(산재통합/전체통합) 상품. 등급 리졸버가 plan.subject_codes 합집합으로 열람 과목 파생. 상품 관리 admin(`/admin/pricing`, manager+, 가격·부여 과목·기능·기간). `discounts` 테이블(기간·조건·쿠폰) + create-order 서버 할인 계산(할인가 결제·discount_id) + confirmPayment used_count + pricing 원가 취소선/쿠폰 + 할인 admin(`/admin/discounts`). 요금표 상품 종류별 카드 개편. 상세: `docs/features/feat-8-028-pricing-products-discounts.md` | P1 | ✅ |
| feat-8-029 | **주문결제·강사 정산 관리** — ①`/admin/payments` 기간(이번달/30·90일/올해/전체)·상품 필터 + 일/주/월 KST 집계(결제=결제일·환불=환불일 버킷) + 요약 카드 + 결제/환불내역 탭. ②`instructor_share_rules` — 강사 배분 규칙(정률%·정액원, 대상 상품>과목>전체 우선, 동급이면 effective_from 최신; 값 변경=세대 교체로 지급 근거 보존), `/admin/settlements/rules`. ③`instructor_settlements`+`items` — 월 정산 draft→confirmed→paid, 항목=결제×규칙 스냅샷, 이중계상 방지(전 기간 항목 대조), 확정분 환불은 익월 음수 차감(`refund_adjustment`), `/admin/settlements`(생성·확정·지급)+상세. manager+, adminClient 전용(RLS 정책無=클라 차단). admin 내비 "매출·정산" 클러스터(상품·할인 메뉴 이관). 상세: `docs/features/feat-8-029-payments-settlements.md` | P1 | ✅ |
| feat-8-030 | **가입 후 필수정보 입력 게이트** — 카카오 OAuth 가 회원명(없으면 이메일 앞부분 대체)·전화번호·주소를 사실상 제공 안 함(실데이터 159명: phone 11·address 0). `profiles.profile_completed_at` NULL 학생을 `/onboarding/profile`(회원명·휴대전화·주소 입력, 이메일 확인)로 강제(`requireProfileInfo`, 승인·동의 다음 마지막 게이트, staff 면제). 기존 회원은 now() 백필로 면제(신규만 게이트)—소급 수집 별도. 전화 E164 정규화 공용화(`onboarding/lib/profile-info.ts`). | P1 | ✅ |
| feat-8-027 | **회원 등급 (체험·무료회원·자기학습·종합반)** — 가입 등급별 열람 차등. 등급은 profiles 저장 없이 단일 리졸버(`getMembershipAccess`, adminClient) 파생: staff > 활성 cohort(종류별 범위) > 활성 자기학습 구독(과목별) > 체험(가입 15일·특허법) > 무료회원(학습과목 제외). ①`requireSubject` 과목별 게이트(`subjects.layout` 단일 지점). ②체험 배너(`TrialNoticeBanner`, 사전공지)+만료 임박 인박스 1회(`trial_expiry_warning`, `runAfterResponse` 지연 트리거, 크론 비의존)+자동 강등(리졸버 파생). ③자기학습 과목별 결제(`payments.subject_code`, pricing 과목별 구독, 자연과학 기본 무료). ④종합반 종류별 범위(`cohorts.access_scope` full/self_study 운영 UI). 승인=기존 멤버 추가, 신청=상담(/contact). 상세: `docs/features/feat-8-027-membership-grade.md` | P1 | ✅ |

상세 스펙: `docs/features/feat-8-001-exam-results.md` (작성 예정).

---

## 5.9 AI 학습 Q&A (RAG) — feat-9 🟡

생성형 AI 가 조문·판례·문제를 색인(RAG)해 수험생 질문에 **출처를 인용해** 즉답한다. 사람-간 Q&A(`feat-qna`)와 별개 — feat-qna 는 강사 답변, feat-9 는 AI 즉답. v1 출시 이후의 전략적 확장. 상세 계획: `docs/features/feat-9-ai-qna.md`.

§14 결정 6건 권장안 채택 (2026-05-20): Voyage `voyage-3-large` 1024 차원, `claude-sonnet-4-6`, 무료 5/일·회원3 50/일, 뷰어 패널 먼저, 직전 4턴, 자연과학 v1 제외.

> **★통합 Q&A (2026-06-26) — feat-9(AI) + feat-qna(강사) 일원화.** 별개였던 두 시스템을 커뮤니티 **Q&A(/qna)** 하나로 합쳤다. 학생이 질문하면 AI(**Haiku 4.5**)가 즉답하고 강사가 **정확/부정확**을 확인·보완. Phase 1~6 완료(설계·라이브): ① `qna_messages` 모델 + 등급별 즉답 토글(`app_settings.qna_ai_instant`) ② AI 즉답 배선(`generateInstantAnswer`, 토글/쿼터/글로벌캡 게이트, 거절=강사대기 폴백, 쿼터는 `ai_messages`+`qna_messages` 합산) ③ 강사 정오 평가(`qna_messages.verdict`) ④ 강사 검토 큐(`/qna?scope=review`) ⑤ 진입 통합(`/ai`→`/qna` redirect, `AskAiButton`→통합 작성, 대시보드 "최근 Q&A", nav 단일) ⑥ 운영자 등급별 즉답 토글 UI(`/admin/ai-qna/settings`). 아래 feat-9-004 의 `/ai` 챗 UI 는 **은퇴**(코드 git 이력 보존), RAG 인프라(feat-9-001~003)·관리자 화면·`/api/ai-qna/ask`(dormant)는 유지. **별도 후속**: 멀티턴 후속질문·출처 원문 링크·학생 👍/👎·기존 AI 대화 데이터 이관. 상세: `docs/features/feat-qna-unified-ai-instructor.md`.

| ID | 기능 | 우선순위 | 상태 |
|----|------|:-------:|:---:|
| feat-9-001 | RAG 인프라 — `vector` 확장 + `content_chunks`(임베딩) + 청킹 + 임베딩 파이프라인(`/api/cron/embed-chunks`) + 전체 백필 | P2 | 🟡 |
| feat-9-002 | 하이브리드 검색 — pgvector 의미 + pg_trgm 키워드 + 구조화 필터 + 연관관계 그래프 확장 + RRF 융합 | P2 | 🟡 |
| feat-9-003 | 답변 생성 — Claude API + 시스템 프롬프트 가드레일 + 출처 인용 + 스트리밍 | P2 | 🟡 |
| feat-9-004 | AI Q&A 화면 — `/ai` 채팅 UI + `ai_conversations`/`ai_messages` + 대화 이력 + 뷰어·대시보드 진입점 | P2 | 🟡 |
| feat-9-005 | 피드백 · eval · 품질 튜닝 — 👍/👎 + eval셋 + 지표 측정 | P2 | ✅ |
| feat-9-006 | 구독 게이팅 · 레이트 리밋 — feat-8-018 결제 연계 + 일 한도 | P2 | 🟡 |
| feat-9-010 | 커뮤니티 Q&A 대상 지정 질문 — `/qna` 에서 조문(과목+번호)·판례(번호)·문제(과목+차수+년도+번호)를 특정해 질문(상세패널과 등가). 식별자→target_id 해석 + 표준 URL 진입 | P2 | ✅ |

**feat-9-001 진행 상황 (🟡)**: 마이그레이션 적용 완료(`content_chunks` 테이블 + 4종 인덱스 + RLS), `database.types.ts` 재생성, 청킹 로직(`app/features/ai-qna/lib/chunker.ts`) + reindex 헬퍼(`source-chunker.server.ts`) + 큐 API(`queries.server.ts`) + cron 라우트(`/api/cron/embed-chunks`, dry-run + Voyage live) + dirty hooks(법 개정 publish / 판례 저장·생성 / 문제 저장·생성) + 백필 스크립트(`scripts/backfill-content-chunks.mjs`) + Vercel cron 등록(`*/15 * * * *`) 완료. **상태 점검(2026-06-06)**: VOYAGE_API_KEY 유효 확인(로컬 직접 호출 200 OK), 운영 DB(mcgdoplo) content_chunks 6238행 중 6164 임베딩 완료 + 백로그 75 수동 임베딩 해소(dirty=0). **문제**: 정기 임베딩 cron 이 프로덕션에서 미가동 — 임베딩 시점이 06-01/06-02 에 뭉쳐 있고 06-05/06 생성 청크가 방치돼 있었음. `vercel.json` 에 `*/15` cron 등록은 정상. 유력 원인 = Vercel Hobby 플랜(cron 일1회 제한 → `*/15` 무시) 또는 CRON_SECRET 미설정. **조치(2026-06-06) — 해결**: cron 정지 근본 원인 = 운영 Vercel 프로젝트(`lidamedu-ow2c`)에 `CRON_SECRET` 미설정 → cron 매번 403. CRON_SECRET 생성·등록(Production, embed-status 칩 녹색 확인) + embed-chunks cron 을 Hobby 대응 일1회(`0 17 * * *`)+`?limit=200` 로 조정(vercel.json). 백로그 75청크는 수동 임베딩 완료. 첫 자동 실행 = 다음 17:00 UTC. **잔여**: ① 일1회·200개/회 로 부족하면(대량 콘텐츠 변경 시) `scripts/diag/embed-pending-chunks.mjs --apply` 수동 드레인 또는 Pro 전환 ② dirty 누적 모니터링. (NB: 옛 Vercel 프로젝트 `lidamedu`=백업, 도메인 없음 — env 는 `lidamedu-ow2c` 에만.)

**feat-9-002 진행 상황 (🟡)**: 의미 검색 RPC `match_content_chunks`(hnsw cosine, law_filter, embedded_at 필터, k≤100) 적용. 질문 파서(`query-parser.ts` — 과목·조문번호·사건번호 추출, 기존 `extract.ts` 패턴 재사용). 하이브리드 검색 코어(`hybrid-search.server.ts`) — 4 path(semantic Voyage query mode / keyword pg_trgm ILIKE OR / structured 조문·사건번호 직격 / graph 인접 청크) + RRF(k=60) 융합 + top-K. 검증 endpoint `/api/ai-qna/search-debug?q=...` (staff only) 추가. **잔여**: ① VOYAGE_API_KEY 설정 후 실제 질의로 4 path 정합성 점검 ② keyword path 점수를 trigram similarity 또는 ts_rank 로 정교화(v1.1) ③ structured 의 다중 과목 fallback 보강.

**feat-9-003 진행 상황 (🟡)**: 시스템 프롬프트 + 컨텍스트 빌더(`system-prompt.ts` — 5조항 가드레일 + [N] 라벨 출처 블록), Claude 스트리밍 클라이언트(`answer.server.ts` — `@anthropic-ai/sdk` messages.stream, AsyncGenerator<AnswerEvent>, token usage 누적), 인용 파서(`citations.ts` — `[N]` 마커 → Citation[]). SSE 검증 endpoint `/api/ai-qna/answer-debug?q=...` (staff only) — `search` → `text` 스트리밍 → `done(citations, tokenUsage)` 이벤트 순. **잔여**: ① `ANTHROPIC_API_KEY` Vercel 환경변수 설정 ② 실제 질의·답변 정합성 점검(가드레일 ③ "강사 Q&A" fallback 발동 케이스, 자연과학 거절 케이스, 환각 라벨 무시 케이스) ③ prompt caching(시스템 프롬프트 캐시) 도입(v1.1).

**feat-9-004 진행 상황 (🟡)**: DB 마이그레이션(`ai_conversations` + `ai_messages` + `ai_message_role` enum + RLS 본인만 R/W + soft delete + 메시지 insert 시 부모 updated_at 트리거). 대화 CRUD(`conversations.server.ts` — listMyConversations 미리보기·count 포함 / getConversationWithMessages / createConversation / appendUserMessage / appendAssistantMessage / softDeleteConversation / autoTitleFromQuestion / setMessageFeedback) + 멀티턴 빌더(`buildMultiturnMessages` — AI_QNA_MULTITURN_LIMIT=4). `answer.server.ts` 시그니처 `messages[]` 받도록 변경(멀티턴 지원). 실사용 SSE `POST /api/ai-qna/ask` — 인증만, conversation_id 또는 새 대화 자동 생성, anchor·lawCodes 옵션, user 메시지 검색 전 저장 + assistant 메시지 done 시점 저장. 채팅 화면 `/ai` (`screens/ai-chat.tsx`) — 좌측 대화 list / 우측 메시지·출처 카드·입력창, 추천 질문 빈 상태, SSE 클라이언트(fetch+ReadableStream), 피드백 👍/👎(action), soft delete 버튼. navigation-bar 학습보조 dropdown 에 "AI Q&A (베타)" 진입점. **잔여**: ① ~~뷰어(조문/판례/문제) 우측 패널에 "AI에게 묻기" 진입점 + 앵커 전달~~ ✅ (2026-05-21 — AskAiButton 공용 컴포넌트, 조문/판례/문제 viewer 헤더 3곳 모두 추가, 시드 질문 자동) ② ~~대시보드 "최근 AI 대화" 카드~~ ✅ (2026-05-21 — AiQnaRecentCard, RE-STUDY 섹션 SpanCol span=3, last 3 대화 + 새 대화 CTA + 빈 상태) ③ ~~markdown 렌더링 (현재 whitespace-pre-wrap)~~ ✅ (2026-05-21 — MarkdownView 적용, assistant 본문만. user/스트리밍 중은 pre-wrap 유지) ④ ~~신규 대화 자동 제목을 LLM 요약으로~~ ✅ (2026-05-21 — AI_TITLE_MODEL=claude-haiku-4-5-20251001, summarizeConversationTitle, ask done 후 runAfterResponse, 실패 시 truncate fallback).

**feat-9-005 진행 상황 (🟡)**: ai_messages 에 `feedback_note text` + `feedback_at timestamptz` 컬럼 추가 + partial 인덱스(`feedback = -1`). staff RLS 정책 — feat-9-005 핫픽스(2026-05-21) 로 무한 재귀 사이클 해소, staff 정책 drop + admin client(`queries.staff.server.ts`) 로 우회. `setMessageFeedback` 가 note 옵션 받음(👎 시 1000자 자유 사유). `/ai` 채팅 화면 👎 클릭 시 인라인 textarea 노출(blur/명시 버튼 저장). RPC `ai_qna_daily_metrics(p_days=30)` / `ai_qna_total_metrics()` security definer + staff 체크. 운영자 화면 3종: `/admin/ai-qna/feedback`(👎 큐 + "eval 로 승격" / 강사 Q&A 에스컬레이션 링크), `/admin/ai-qna/metrics`(누적·최근 7일·일별 토큰·추정 비용), `/admin/ai-qna/eval`(eval 데이터셋 list/검색/아카이브) + `/admin/ai-qna/eval/new?fromMessage=` (👎 메시지에서 prefill). eval 데이터 모델 `ai_eval_items`(question/reference_answer/reference_sources jsonb/source_message_id/law_codes[]/difficulty 1-5/tags[]/status/notes, staff R/W RLS, gin 인덱스). **잔여**: ① ~~eval 데이터셋 테이블 + 운영자 화면~~ ✅ (2026-05-21) ② ~~자동 평가 cron(v1.2)~~ ✅ (2026-05-21) ③ ~~refusal_kind enum 정교화~~ ✅ (2026-05-21 — ai_refusal_kind enum + ai_messages.refusal_kind 컬럼, appendAssistantMessage 가 classifyRefusal 로 자동 분류, ai_qna_daily_metrics RPC 가 refusal_science/insufficient 분리 집계, metrics 화면 표 갱신, 기존 행 백필) ④ ~~사용자별 월별 사용량 export~~ ✅ (2026-05-21 — ai_qna_monthly_usage RPC + /admin/ai-qna/usage 화면 + CSV 다운로드(BOM UTF-8) + 최근 3개월 합계 카드) ⑤ ~~강사 검토 완료 표시 컬럼~~ ✅ (2026-05-21 — ai_review_status enum + review_status/reviewed_at/reviewed_by 컬럼, /admin/ai-qna/feedback 에 검토 상태 탭 필터 + 카드별 4단계 토글 버튼(pending/reviewed/escalated/dismissed) + ReviewStatusBadge, pending 큐 partial 인덱스).

**feat-9-006 진행 상황 (🟡)**: `app_settings.ai_qna_quotas` jsonb 단일 키로 한도·토큰 캡 운영 변경 가능(2026-05-21 보수안 seed: free 5/일, tier1 20/일, maxOutputTokens 800, maxContextChunks 8). tier 결정 — staff 또는 area_study_mgmt 보유 = tier1, 그 외 free (`getUserAiTier`). 사용량 측정 — KST 자정 기준 본인 assistant 메시지 카운트(`countAssistantMessagesToday`). `POST /api/ai-qna/ask` 초반에 `getQuotaState` 호출 → 초과 시 429 + JSON{tier, dailyLimit, usedToday, message}. answerQuestion 에 quota.maxOutputTokens 전달, hybridSearch 에 quota.maxContextChunks 전달. `/ai` 화면 헤더에 QuotaBadge("오늘 N/M", 0 잔여 = rose, 잔여 ≤2 = amber), 429 응답 시 QuotaBanner 인라인 + 강사 Q&A 안내. 운영자 화면 `/admin/ai-qna/settings` — 4개 필드 폼 + 실시간 비용 추정(회원3·무료 인원별). `ai_messages.token_usage` 가 이미 저장돼 향후 사용량 기반 정산에 그대로 활용. **잔여**: ① feat-8-018 결제 연계로 tier2/tier3(또는 PAYG) 도입 시 settings.server.ts tier 분기 확장 ② 한도 초과 시 강사 Q&A 자동 스레드 생성(에스컬레이션) ③ 월별 사용량 리포트(운영팀 비용 가시화).

---

## 5.10 모의고사 체계 정비 (1차·2차 + 문제은행 연결)

1차(객관식)·2차(주관식) 모의고사와 학습과목 문제은행을 잇는 정비. 2차 모의고사 = 온라인 GS(5.5), 1차 모의고사 = `mcq_packs` exam 모드(5.3). 3단계(Phase A/B/C)로 진행.

| ID | 기능 | 우선순위 | 상태 |
|----|------|:-------:|:---:|
| feat-10-001 | **Phase A — GS 문항 → 학습과목 주관식 문제은행 승격.** 종료된 GS 회차의 `gs_questions` 를 `problems`(format=subjective, origin=mock)로 일괄 승격. `problems.source_gs_question_id` 역참조(멱등성 키, 부분 유니크). 운영자 GS 회차 편집 화면의 "주관식 문제은행 등록" 패널. 2차 모의고사 흐름 ⑥ 완성 + 빈 주관식 문제은행 충전. 상세: `docs/features/feat-10-001-gs-question-promotion.md`. | P1 | ✅ |
| feat-10-002 | **Phase B1 — 1차 모의고사 출제·운영.** `mcq_packs` 모의고사 팩 문제 picker(검색·다중선택) + `problems.released_at` mock 가시성 게이트(미공개 mock 문제는 학습과목 비노출) + 팩 단위 "학습과목 공개"(흐름 ⑥). 상세: `docs/features/feat-10-002-mock-exam-authoring.md`. | P1 | ✅ |
| feat-10-003 | **Phase C — 모의고사 IA 정리.** 상단 네비 "모의고사" 메뉴 신설(1차 종합·진도별 + 2차 온라인 GS), GS 를 커뮤니티→모의고사 이동, 학습정보 객관식·주관식 → "기출문제" 개명. 라우트·DB 변경 없음. 상세: `docs/features/feat-10-003-mock-exam-ia.md`. | P2 | ✅ |
| feat-10-004 | **Phase B2 — 1차 모의고사 채점·합격선·등수.** `mcq_packs.pass_score`(합격선) + `mcq_pack_attempt_stats` 등수 RPC. 팩 응시 결과에 점수·합격 판정·등수(백분위·z-score). 종합·진도별 모의고사 공통(둘 다 팩 단위). 상세: `docs/features/feat-10-004-mock-exam-scoring.md`. | P1 | ✅ |
| feat-10-005 | **다과목 통합 1차 모의고사.** `mcq_exams`(시험=교시 묶음) + `mcq_exam_papers`(교시) + `mcq_exam_attempts`(응시 묶음) + `quiz_sessions.exam_attempt_id`. 교시별 순차 응시(기존 시트 재사용) + 과목별 과락 + 전 과목 평균 합격 판정 + `mcq_exam_attempt_stats` 등수 RPC. 산업재산권법+민법+자연과학 3교시 통합. 상세: `docs/features/feat-10-005-integrated-mock-exam.md`. | P2 | ✅ |

---

## 5.11 강의 LMS·커머스 (lidamedu 이전) — feat-11

영상 강의(DRM)·도서몰·주문·배수 회계. 설계 SSOT: `docs/features/lidamedu-이전-M1-설계.md` (M1 승인 2026-07-08, 단서 3 포함). 요구사항 원문: `docs/features/lidamedu-이전-요구사항-원문.md`.

| ID | 기능 | 우선순위 | 상태 |
|----|------|:-------:|:---:|
| feat-11-001 | **M2 시청 골격 — 테이블 배치.** course_series/courses(에디션)/course_lessons/lesson_videos(교체 이력)/lesson_materials/lesson_node_links + subscription_plans 확장(product_kind course·tpass, sale_status)+plan_courses+plan_policies + enrollments(+pauses·admin_logs). 승인 단서: lesson_staff_memos 분리(anon 컬럼 노출 방어)·is_active=false→hidden 백필. 적용 완료 2026-07-08. | P1 | ✅ |
| feat-11-002 | **M2 시청 골격 — staff 등록 화면 + 수동 지급 + 재생 판정.** 시리즈→에디션→회차→영상 등록(순서·미리보기·공개·메모), 에디션 발행 시 T-PASS 연결 제안(★단서), 수강권 수동 지급, 재생 판정 action+playback_grants(판정 스킵 플래그 — ★M4 결제 오픈 전 ON 체크리스트). [벤더] DRM 임베드는 벤더 확정 후. 구현 완료(라이브 검증 대기) — /admin/lms/courses·/admin/lms/enrollments·/api/lms/playback-grant. | P1 | 🟡 |
| feat-11-003 | **M3 기록·배수·기기.** watch_events/watch_positions/watch_ledger(append-only)+하트비트(/api/lms/watch-heartbeat), 진도·완강 파생(getLessonProgressForUser), 배수 회계(차감·맛보기 예외·credit/reset·영상 교체 모수 조정 제안), user_devices/reset_logs(+/admin/lms/devices), 일시정지 적용·재개(관리자 — 학생 셀프 신청은 M4 마이페이지). ★watch_events 영구 보존 법적 근거=처리방침 반영(정식 판매 전 법무 항목). ENFORCE_MULTIPLIER=ON, ENFORCE_DEVICE=[벤더] 대기. 회계 스모크 통과(2026-07-08). 학습현황 카드 연계는 [벤더] 플레이어 연동 후(시청 데이터 발생 시). | P1 | 🟡 |
| feat-11-004 | **M4 결제·커머스.** 4a 주문 일반화(orders/order_items+토스 confirm/웹훅 배선·자동 지급/회수·항목 부분환불·★단건 결제도 1-item 주문 경유) / 4b 무통장(신청 API·관리자 승인·기한 만료 cron+lazy) / 4c 도서몰(books·재고 원장·plan_book_links·shipments)+학생 마이페이지(/me/courses 수강현황·일시정지 신청·기기 셀프 초기화, /me/orders 주문·배송·쿠폰) / 4d 쿠폰(user_coupons·자동 발급)+cs_actions·playback_issues+매출 파생 뷰+**access duty 4종**(lms_video_admin/lms_cs/lms_orders_admin/lms_stats_view — 6화면 게이트). 구현 완료(라이브 검증 대기). 잔여: 정산 order_item 확장(기존 payments 정산 유지 중), course 상품 학생 구매 화면(pricing 노출). ★오픈 체크리스트: ENFORCE_DEVICE ON([벤더])·처리방침(법무)·T-PASS 연결 절차. | P1 | 🟡 |
| feat-11-005 | **M5 이관.** lidamedu 구매자 수강권 이관(enrollments source=migration 벌크, dry-run→승인)·병행 운영. | P2 | 🔲 |
| feat-11-006 | **콘텐츠 라이브러리 + 강의그룹(콜러스 운영 고도화).** 설계=`docs/features/강의플랫폼-추가설계-방향.md`. **Phase 1~4 구현·배포 완료(2026-07-21).** P1 콘텐츠 라이브러리(`video_contents`+`content_groups`, content_id 재배선·백필, 진도율 컬럼화, 콜러스 동기화 수동+**cron 자동+content_sync_logs**) / P2 통합 탭 등록 UX(course_categories 대중소·course_instructors 복수강사·course_audit_logs·courses 컬럼·강의복사·노출토글·배지) / P3 소스 우선 HTML 에디터(비주얼↔소스↔미리보기·이미지업로드·표/유튜브, 원본 HTML 무손실) / P4 course_reviews(수강평 plan·교재평 book, 별점·베스트·블라인드·신고·운영자답변·구매자 게이트)+/admin/lms/reviews+도서 무료배송 임계(app_settings). 잔여 P5=콜러스 업로드(선택)·M5 이관 병행. | P1 | ✅ |
| feat-11-007 | **강의플랫폼 기능보완(260727 요청서 17항목).** 설계=`docs/features/feat-11-007-lecture-platform-supplement-260727.md`. Phase 0(품절가드·이미지안내)·1(강의 CRUD 제목/회차/삭제가드)·3(주/부교재 `plan_book_links` 확장 — 문서 결정6의 plan_books 일원화는 미채택)·5(공지 HtmlEditor)·4(매출 3분할·기간·필터·CSV) 배포 완료. #4 콜러스 동기화 기준은 media_content_key 전환 **완료**(채널 API 경유). | P1 | ✅ |
| feat-11-008 | **강의관리·콘텐츠관리 보완(260807 요청서).** 설계=`docs/features/feat-11-008-lecture-content-admin-supplement-260807.md`. P0 표시·사이드바 즉효 / P1 쿠폰(29,999 진단·개별발급 검색) / P2 페이지관리 CMS(`custom_pages`·/page/:code) / P3 강의 카테고리 단일화(course_categories 승격) / P4 강의개설 목록·검색·등록 / P5 콘텐츠관리 라이브러리·강의그룹 분리(M:N)+에디터 섹션 / P6 내강의실 재생횟수(시간 비례 차감 — 원장 확정). **P0~P6 전 단계 배포 완료(2026-08-08)**. | P1 | ✅ |
| feat-12-002 | **강의 홈 짧은 영상(공부방법·맛보기).** 설계=`docs/features/feat-12-002-lecture-home-short-videos.md`. `lecture_videos`(공개읽기 RLS·soft delete, category 공부방법/맛보기/기타·provider youtube/kollus·linked_plan CTA). 강의 홈(`/lecture/home`) "공부방법 & 맛보기" 섹션(카드→라이트박스 iframe 재생) + 운영자 `/admin/lecture-videos`(목록/등록/정렬, `/api/admin/landing` entity=video). youtube=embed / kollus=콘텐츠 라이브러리 클립 → 랜딩 loader 서버 서명(`buildKollusWebTokenUrl`, 수강권 게이트 없음, mckey 비노출). ★맛보기 kollus 는 별도 짧은 클립만 지정(전체강의 지정 금지·공개재생). 유튜브 헬퍼 `core/lib/youtube.ts` 통합. | P2 | ✅ |

---

## 6. 마일스톤

### M1 — Foundation ✅
- 5.0 인프라 P0 전부 (`feat-000-001~014`) ✅
- 5.1 대시보드 셸 ✅
- 5.4.A.1 조문 데이터 모델 ✅
- 운영자 placeholder ✅
- 메뉴별 placeholder 화면 ✅

### M2 — 핵심 학습 (특허법 우선) ✅
- 5.4.A 전체 P0 (조문 뷰어 · 판례 상세 · 문제 풀이) ✅
- 5.7 운영자 콘텐츠 등록 P0 (`feat-7-004~006`) ✅
- 5.3 최신 정보 P0 (법 개정/최근 판례) ✅
- 5.1 대시보드 P0 보강 ✅

### M3 — 5과목 확장 + 대시보드 완성 🟡 (진행 중)
- 5.4.A 전체 5과목 시드 데이터 🟡 — **다음 작업 포커스**. 특허법은 풀빌드, 상표/디자인/민법/민사소송법 콘텐츠 양 부족
- 5.1 대시보드 P0 전부 + 자연과학 카드(P1) ✅
- 5.2 학습목표 메뉴 P1 ✅
- 5.3 최신 정보 P1 (객관식/주관식/논문) ✅

### M4 — 자연과학 + 운영 고도화 ✅ (P1 항목 완료)
- 5.4.B 자연과학 P1 전부 ✅ (Runner KaTeX 포함)
- 5.7 운영자 P1 (반 관리·학생 진도·공지·연관관계 bulk·감사 로그·인박스 알림) ✅

### M5+ — 확장
- 5.5 온라인 GS 본격 ✅ (학생 응시·peer/AI/강사 채점·통계·우수답안·포인트 P1 항목 다 완료. 추가 폴리시는 운영 피드백 기반)
- 5.6 커뮤니티 본격 ✅ (feat-6-001~008 전부 완료 — 게시판 3종·댓글·좋아요·첨부·신고/모더레이션·인기글·알림/멘션·콘텐츠 인용·스터디 매칭. 운영 동작 확인 2026-06-06)
- 5.6 **반별 게시판 feat-6-010 ✅** — cohort 스코프 공지형/소통형 게시판 + 첨부 + pin. 구현·배포·RLS 합성 검증(① 13/13 · ③b 14/14)·**라이브 통합검증 완료(2026-06-15)**. 접근통제는 RLS 가 DB 에서 강제(학생 경로 RLS client, adminClient 는 운영 목록·storage 블롭만). 커밋 a412429·5275bfe·b198efd
- 5.9 AI 학습 Q&A (RAG) 🟡 — `feat-9-*`, §14 결정 6건 권장안 채택. **답변 파이프라인(feat-9-003/004) 운영 가동 중**(ANTHROPIC 키 설정·실사용 답변 성공). 잔여: 임베딩 cron(feat-9-001)이 프로덕션에서 정기 미가동 — Vercel 요금제(Hobby=일1회 제한)/CRON_SECRET 확인 필요. 백로그 75청크는 2026-06-06 수동 임베딩으로 해소
- P2 잔여 항목: `feat-3-504` 논문 PDF Storage · `feat-7-014` 수강권/결제 · `feat-4-A-320` 주관식 색인(과목 hub)

---

## 7. 결정 사항

- ✅ 메뉴 구조는 7개 최상위 (대시보드/학습목표/최신정보/과목별학습/온라인GS/커뮤니티/운영자)
- ✅ 과목별 학습 진입은 계층(과목군 → 과목 → 학습탭)
- ✅ 법률 5과목은 동일한 3탭(조문/판례/문제) 구조 공유
- ✅ 자연과학 4과목은 문제만 (조문·판례 개념 없음)
- ✅ 산업재산권법은 그룹핑 노드, 실제 학습은 특허/상표/디자인 단위
- ✅ 학생도 운영자 메뉴는 보이되 권한 안내 화면 (메뉴 자체 숨김 X)
- ✅ "최신 정보"는 법 개정/판례/문제/논문 4종을 통합 추적
- ✅ 조문 본문은 `article_revisions`에만 저장. `articles`는 구조만
- ✅ 발행된 `article_revisions`는 DB 트리거로 불변 강제
- ✅ 주석(북마크/메모/하이라이트)은 polymorphic
- ✅ `cases.subject_laws`는 배열 (다과목 판례 대응)

## 8. 오픈 이슈 (결정 필요)

| 항목 | 옵션 | 결정 |
|------|------|------|
| 법령 원문 저장 (조문 본문) | (a) 마크다운 (b) 구조화 JSON (c) HTML | ✅ (b) 구조화 JSON — `article-body.ts` Zod schema (text/underline/subtitle/annotation/ref_article inline + block list) |
| 조문 트리 path 저장 | (a) ltree (b) materialized path 문자열 | ✅ (a) ltree — `docs/article-tree.md` |
| 판례 전문 검색 | (a) Postgres tsvector + pg_trgm (b) pgvector | ✅ (a) pg_trgm GIN + ilike 다중 컬럼 OR (feat-4-A-208). tsvector(simple) 는 generated 컬럼으로 유지(향후 ranking 도입 시) |
| 주관식 채점 | (a) 강사 수동 (b) 자기 채점 + 강사 리뷰 (c) 키워드 매칭 보조 | ✅ **2026-08-18 재결정 — 기출 경로는 AI 초안 채점 단일화**(자기채점·강사 첨삭 폐지). 2차가 오프라인 지필이라 온라인은 논점·목차·포섭 3단계 훈련만 하고, 그 3단계를 3축으로 AI가 채점한다(feat-2-032 S5). GS(2차 모의고사)는 종전대로 강사/peer/AI 트리오(feat-5-201~203) |
| 서버 ↔ Postgres 접근 | (a) postgres-js TCP (b) Supabase Data API | ✅ (b) Supabase Data API — @supabase/supabase-js (supa-client / supa-admin-client), ORM 미사용 |
| 결제/수강권 v1 필수? | 외부(계좌이체)로 충분할 수 있음 | ✅ v1 외부 처리 (수강권 관리 화면은 feat-7-014 P2 로 후속) |
| 자연과학 문제의 도식/수식 | (a) MathJax/KaTeX (b) 이미지 (c) 둘 다 | ✅ (c) 둘 다 — KaTeX (`$...$` / `$$...$$` / `\(...\)`) + markdown 이미지 (feat-4-B-006) |
| 논문 PDF 저장 위치 | (a) Supabase Storage (b) 외부 링크만 | 🟡 v1: 외부 링크 위주. Supabase Storage 첨부는 feat-3-504 P2 |

---

## 부록 A — 화면별 라우트 매핑

| 메뉴 경로 | 라우트 | 주요 feature |
|----------|--------|-------------|
| 대시보드 | `/dashboard` | feat-1-* |
| 학습목표 및 진도 | `/goals` | feat-2-* |
| 통합 학습 통계 | `/study/stats` | feat-2-008 |
| 최신 정보 (법 개정) | `/latest/laws` | feat-3-1* |
| 최신 정보 (판례) | `/latest/cases` | feat-3-2* |
| 최신 정보 (객관식) | `/latest/mcq` | feat-3-3* |
| 최신 정보 (주관식) | `/latest/essay` | feat-3-4* |
| 최신 정보 (논문) | `/latest/papers` | feat-3-5* |
| 최신 정보 (도서 추록/정오표) | `/latest/book-updates` | feat-3-6* |
| 민법 학습 | `/subjects/civil` | feat-4-A-* |
| 특허법 학습 | `/subjects/patent` | feat-4-A-* |
| 상표법 학습 | `/subjects/trademark` | feat-4-A-* |
| 디자인보호법 학습 | `/subjects/design` | feat-4-A-* |
| 민사소송법 학습 | `/subjects/civil-procedure` | feat-4-A-* |
| 자연과학 (물리) | `/subjects/science/physics` | feat-4-B-* |
| 자연과학 (화학) | `/subjects/science/chemistry` | feat-4-B-* |
| 자연과학 (생물) | `/subjects/science/biology` | feat-4-B-* |
| 자연과학 (지구과학) | `/subjects/science/earth-science` | feat-4-B-* |
| 조문 뷰어 | `/subjects/:subject/articles/:articlePath` | feat-4-A-105 |
| 판례 상세 | `/subjects/:subject/cases/:caseId` | feat-4-A-205 |
| 문제 풀이 Runner | `/subjects/:subject/quiz/runner` | feat-4-A-304~306 |
| 온라인 GS | `/gs` | feat-5-001 |
| 커뮤니티 허브 | `/community` | feat-6-002 |
| 커뮤니티 게시판 | `/community/:board` · `/:board/new` · `/:board/:postId` | feat-6-002 |
| 운영자 진입 | `/admin` | feat-7-001 |
| 콘텐츠 관리 허브 | `/admin/content` | feat-7-002 |
| 법 개정 워크스페이스 | `/admin/content/laws/:lawCode/revisions/:id` | feat-7-004 |
| 판례 등록/수정 | `/admin/content/cases/:id?` | feat-7-005 |
| 문제 출제 | `/admin/content/problems/:id?` | feat-7-006 |
| 반 관리 | `/admin/cohorts/:id?` | feat-7-009 |
| 반 통계 모니터링 | `/admin/cohorts/:id/stats` | feat-7-019 |
| 커리큘럼 목록·편집 | `/admin/curricula`, `/admin/curricula/:id` | feat-7-020 |
| 과제 배포·진척 | `/admin/cohorts/:id/assignments`, `/admin/cohorts/:id/assignments/:aid` | feat-7-021 |
| 학생 과제함 | `/assignments` | feat-7-021 |
| 운영자 콘텐츠 검색 API | `/api/admin/search-content` | feat-7-020 |
| 자동 주간 cron | `/api/cron/curriculum-weekly` | feat-7-021 |
| 주간 리포트 cron | `/api/cron/weekly-reports` | feat-7-022 |
| 비활성 알림 cron | `/api/cron/inactive-alert` | feat-7-023 |
| 1:1 상담 코멘트 API | `/api/admin/student-note` | feat-7-025 |
| 합격 진단 snapshot cron | `/api/cron/pass-predict-snapshot` | feat-7-027 |
| 강의 진행 update API | `/api/student/lecture-progress` | feat-7-029 |
| 학생 강의 viewer | `/lectures/:itemId` | feat-7-029 |
| 내 시험 결과 | `/me/exam-results` | feat-8-002 |
| 합격 결과 운영 | `/admin/exam-results` | feat-8-003 |
| 분석 활용 동의 약관 | `/legal/analytics-consent` | feat-8-004 |
| 가입 후 Onboarding | `/onboarding/welcome` | feat-8-017 |
| 학습 데이터 활용 동의 게이트 | `/consent` | feat-8-026 |
| 요금제 | `/pricing` | feat-8-018 |
| 내 구독 | `/me/subscription` | feat-8-018 |
| 결제 주문 생성 API | `/api/payments/create-order` | feat-8-018 |
| 결제 확인 콜백 | `/api/payments/toss/confirm` | feat-8-018 |
| 시험 결과 알림 cron | `/api/cron/exam-result-reminder` | feat-8-005 |
| 합격자 케이스 분석 | `/admin/analytics/passers` | feat-8-006 |
| 합격자 학습 후기 | `/study/passer-summaries` | feat-8-009 |
| 합격자 학습 곡선 비교 | `/study/passer-trend` | feat-8-012 |
| 합격 vs 비합격 패턴 | `/admin/analytics/failure-patterns` | feat-8-015 |
| 사용자 관리 | `/admin/users` | feat-7-012 |
| 공지사항 발송 | `/admin/announcements` | feat-7-011 |
| 공지사항 수신함 | `/announcements` | feat-7-011 |
| 공지사항 (강의 플랫폼) | `/lecture/announcements` | feat-7-011 |

---

## 부록 B — 상세 스펙 문서 분할 계획

본 SPEC.md는 로드맵·결정사항·메뉴 구조의 SSoT. 각 메뉴 단위 작업이 시작될 때 다음 상세 스펙 문서로 분리한다.

| 분할 문서 | 다루는 메뉴 | 상태 |
|----------|------------|------|
| `docs/spec-detail-foundation.md` | 5.0 인프라 | 🔲 |
| `docs/spec-detail-5-1-dashboard.md` | 5.1 대시보드 | 🔲 |
| `docs/spec-detail-5-2-goals.md` | 5.2 학습목표 및 진도 | 🔲 |
| `docs/spec-detail-5-3-latest.md` | 5.3 최신 정보 5탭 | 🔲 |
| `docs/spec-detail-5-4-subjects-A.md` | 5.4.A 법률 과목 학습 (PPT 운영계획 반영, 14개 결정사항 확정) | ✅ |
| `docs/spec-detail-5-4-subjects-B.md` | 5.4.B 자연과학 | 🔲 |
| `docs/spec-detail-5-7-admin.md` | 5.7 운영자 | 🔲 |

### 보조 문서 (5.4 가 의존)

| 문서 | 다루는 영역 | 상태 |
|---|---|---|
| `docs/db-schema.md` | 전체 DB 스키마 SSoT (테이블·인덱스·RLS·트리거·마이그레이션 순서) | ✅ |
| `docs/article-tree.md` | 조문 트리 저장(ltree)·식별자 변환·시점 조회·체계도 토글 | ✅ |
| `docs/relations.md` | 5종 link 테이블·방향성·양방향 union 조회·정합성 트리거 | ✅ |
