# feat-3-213 — 상표 판례 적재: 주제 배치 파이프라인 + 검토 화면

> 2026-07-06. 리담상표법 판례 [제16판] (`source/상표업로드/판례.hwpx`, 19MB·이미지 704개)을
> 체계도 "주제" 배치 규칙으로 적재. 특허 판례(scripts/precedents 파이프라인)와 최대한 동일 구조,
> 다른 점 = **주제(topic) 중간 노드**를 체계도에 생성해 그 아래 판례를 묶는다.

## 1. 원본 규약과 배치 규칙 (사용자 지시)

교재는 46개 "주제"로 구성: `주제N 제목(부모체계도라벨(法 refs))`.

> 예: `주제1 등록요건으로서의 사용 또는 사용의사(상표등록을 받을 수 있는 자 및 없는 자(法 3))`
> → 체계도 노드 **상표등록을 받을 수 있는 자 및 없는 자** 아래 자식 노드
> **등록요건으로서의 사용 또는 사용의사**(case_only)를 만들고 그 주제의 판례 1~5를 배치.

- 주제 노드는 `systematic_nodes` (case_only=true — 판례 트리에만 표시, 조문/문제 트리 비오염).
- 부모 라벨 매칭: 공백/중점 정규화, `[NN]` 접두 제거, **동일 라벨 다중이면 가장 깊은 노드**(예: "상표등록을
  받을 수 없는 상표" L2/L3 → 조문 리프 L3).
- 판례 배치 = `cases.primary_node_id` = 주제 노드, `source_seq` = 교재 전체 순번(주제 순 → 주제 내 순)
  → 기존 `computeCaseOverallOrder`/판례 트리·뷰어가 **코드 수정 없이** 특허와 동일하게 동작.
- 주제45 "기 타"의 부모 "기타"는 체계도 신 파일(2026-07-06)의 신설 대분류 `13 기타`(반영 완료).

## 2. 파이프라인 (스크립트 — Vercel 19MB/704이미지 제약상 로컬 실행)

| 단계 | 스크립트 | 산출 |
|---|---|---|
| ① 파싱 | `scripts/precedents/parse-trademark-book.mjs` | `source/_converted/tm-precedents.json` |
| ② 적재 | `scripts/precedents/seed-trademark-book.mjs` (dry-run 기본, `--apply`, `--topic=N` 파일럿) | 주제 노드 + cases + 이미지 업로드 |

### 파서 규약 (제16판 hwpx 분석 결과)
- 주제: `paraPrIDRef=27` 문단, 러닝헤더 접두 허용, 마지막 최상위 괄호 = 부모 라벨(내부 `(法 …)` 분리)
- 판례 헤더: `(닉네임) 법원 YYYY. M. D. 선고|자 사건번호 [전원합의체] 판결|결정 [사건명] (확정|전합…)`
  — 연속 중복 수록(개요선) dedup, 서식 변형(판결 생략·괄호 오탈자·병합 수록 "A 판결, …선고 B 판결") 허용
- 섹션: `[사안의 쟁점]`(→summary_items) `[사실관계]` `[원심의 판단|특허법원의 판단]` `[관련 법리]`
  `[대법원의 판단|판결요지]` `[Index]` → reasoning_md `###` 섹션으로 조립
- 도표(구분/등록·출원상표/지정상품/출원일/권리자): `hp:tbl` → md 표 + 상표 도형 이미지(position=summary)
- 평석: **표 형태 박스**(라벨 셀 = 이미지/특수글자 "ㅇㅌㅍ" + 본문 셀) → comment_body_md,
  comment_source="리담상표법 판례 [제16판]"
- 글상자 내부 문단(hp:container)은 앵커 뒤로 펼침, 그림 캡션(hp:shapeComment) 제외
- 이미지: BinData(BMP 580·GIF 60·JPG 44 등) → sharp+bmp-js 로 webp 변환 → `case-images/{case_id}/tm16-*.webp`

### 정책 (특허 seed-to-db.mjs 준용)
- 기존 상표 `case_number` 존재 시 skip (운영 손보정 보존, 재실행 멱등)
- 교재 내 중복 수록(4건: 2017나1148·96후1866·2002후567·2000후3708)은 최초 주제에만 insert — primary 단일 배치 제약
- 주제 노드는 같은 부모+같은 라벨이면 재사용

## 3-A. 뷰어 — 교재 구조 렌더 (2026-07-07 원장 지시로 특허와 분리)

상표 판례 본문은 특허의 generic 3섹션(요지/판시이유/비고)이 아니라 **교재 구조 그대로** 렌더:
**쟁점상표(표 — 도형 이미지 셀 포함) → 사안의 쟁점 → 사실관계 → 전심의 판단 → 관련 법리 →
본심의 판단 → 인덱스 → 평석**.

- 저장: `cases.book_sections` jsonb — `{kind:"tm-book", sections:[{key,label,blocks:[{type:"p",text}|
  {type:"table",rows:[[{text,images:[{url,alt}]}]]}]}]}` (`scripts/sql/20260707_cases_book_sections.sql`,
  백필 `scripts/precedents/backfill-tm-book-sections.mjs` — 337/337)
- 렌더: `CaseBody` 가 `bookSections` 있으면 교재 구조(BookTable=도형 셀 이미지), 없으면 기존
  generic 렌더(특허 무변화). 하이라이트 fieldPath = `case.book.{key}`.
- 기존 필드(summary_items/reasoning_md/comment_body_md)는 **검색·목록 제목용으로 병행 유지** —
  단 상표 뷰어 표시는 book_sections 가 SSOT 라 admin-case-edit 의 본문 수정은 상표 뷰어에 반영되지
  않음(후속: book_sections 편집 UI 필요 시 별도 태스크).

## 3. 화면 (특허와 동일 표면 재사용 — 신규 코드 0)

| 용도 | 경로 | 비고 |
|---|---|---|
| 판례 체계도·목록 (학생/검수) | `/subjects/trademark` 판례 탭 | 주제 노드가 트리에 표시, 특허와 동일 UI |
| 판례 뷰어 | `/trademark/cases/:caseId` | 도표 md·도형 이미지·요지(쟁점)·판시·평석 |
| 운영: 매핑·목록 | `/admin/cases` | 미매핑 KPI·필터 |
| 운영: 개별 수정 | `/admin/cases/edit/:caseId` | 배치(primary picker)·source_seq 이동·이미지 관리 |

**학생 노출 게이트**: trademark 는 `STUDENT_DISABLED_SUBJECTS` — staff 만 접근. 원장 검수 후
목록에서 slug 제거 시점에 학생 공개(민법 해설과 동일 패턴). 별도 draft 테이블 불필요 (과목 잠금 = 검수 게이트).

### 업로드 화면 (개정판 재적재용 — 후속, 미구현)
개정판(제17판 등) 재적재를 인앱으로 하려면:
1. 운영자가 hwpx 를 Supabase Storage 에 **브라우저 직접 업로드**(Vercel 4.5MB body 제한 우회)
2. 서버가 파싱은 못 하므로(19MB XML+이미지 변환은 서버리스 시간 초과) 로컬 CLI 실행이 현실적
   → v1 은 "스크립트 재실행 + `/admin/cases` 검수" 운영 절차로 확정. 인앱 업로드는 필요 시
   별도 태스크(Queue Worker 또는 로컬 러너)로 설계.

## 4. 매핑 요약 (교재 → cases)

| 교재 | cases 컬럼 |
|---|---|
| (닉네임) | nickname |
| 법원/선고일/사건번호/[사건명] | court(enum)·decided_at·case_number·case_type |
| 전합/(전합) | is_en_banc |
| [사안의 쟁점] 항목들 | summary_items `[{title, body:""}]` (case_title=첫 쟁점) |
| 도표 + [사실관계]~[대법원의 판단] | reasoning_md (md 표 + `###` 섹션) |
| 평석 박스 + [Index] | comment_body_md (+`**[Index]**`), comment_source |
| 상표 도형 | images jsonb (webp, position=summary) |
| 주제 노드/교재 순번 | primary_node_id / source_seq |

## 5. 결과 (2026-07-07 적재 완료)

- 주제 46/46 부모 매칭(미매칭 0), 주제 노드 46개 생성
- 상표 판례 **337건 = 교재 고유 사건번호 전량, 337/337 상표 트리 배치**
- **사건번호 유일성 = 법률 단위** (2026-07-07 원장 확정: "다른 법률 간에는 중복 가능, 동일 법률 안에서만
  금지") — `cases_case_number_unique_active` 를 `(case_number, subject_laws)` 부분 유니크로 변경
  (`scripts/sql/20260707_case_number_unique_per_law.sql`). 특허 판례집 겹침 11건은 **법률별 별도 행**
  (특허 행=특허 교재 콘텐츠·특허 배치 / 상표 행=상표 교재 콘텐츠·주제 노드 배치). subject_laws 는
  법률별 행 분리 원칙(단일 원소)으로 운영.
- 사건번호 조회 지점 보강: `admin-exam-case-links`(문제의 법률과 subject_laws 일치 행 우선),
  `findActiveCaseByDeletedId`(limit 1) — 중복 행에서 maybeSingle 오류 방지
- 주제 노드 라벨 = **"주제N 제목"** (예: "주제1 등록요건으로서의 사용 또는 사용의사")
- 평석 54건, 도형 이미지 **708장 전수 업로드(webp)** — WMF(실제 JPEG)·OLE(내장 BMP→GDI 변환)·
  TMP(실제 GIF)까지 전량 변환, **전수 검사 통과**(교재 기대치 337/337 일치·URL 708/708 정상·치수 이상 0)
- 부수 수정: 체계도 순번 랭킹의 path 문자열 정렬 결함(`b13`<`b2`) →
  `sortSystematicTreeOrder`(parent+ord DFS, `app/features/laws/lib/systematic-order.ts`)로
  `getSystematicSkeleton`·`attachProblemOverallNo` 교체 — 특허 `b10`·`b11` 어긋남도 함께 교정

## 6. 알려진 이슈·후속

- ~~특허 판례 이미지 구 프로젝트(nctokynz) URL~~ → **마이그레이션 완료**(2026-07-07): 판례 이미지 13·
  본문 md 6곳·summary_items 1·문제 해설 1(P-5215)을 현 프로젝트로 이전, 잔존 구 URL 0. 구 스토리지에서
  이미 죽어 있던 1장(83후26 related_md)은 참조 제거. 백업 `tmp/old-storage-migration-backup.json`.
- 교재 내 중복 수록 4건(2017나1148·96후1866·2002후567·2000후3708)은 최초 주제에만 배치 —
  두 번째 주제에서도 보이게 하려면 다중 배치 모델(현재 미지원) 필요.
- 도형 이미지 8쌍이 두 판례에 공유(같은 분쟁의 관련 판례 — 예: 2009다47340/2009후3572) — 교재 원본이
  같은 그림을 재사용한 것으로 정상.
- 디자인보호법 판례집도 같은 규약이면 이 파이프라인 재사용(파서 상수만 분리).
