# 선순환 Phase 0 — 노드 스파인 정합성 감사 (읽기 전용)

> 목적: 강의–복습–테스트–보완 선순환을 배선하기 전에, **모든 서브시스템이 정말 같은 노드 축(SSOT)을 보고 있는지**와 **실제로 얼마나 채워져 있는지**를 확정한다.
> 성격: **점검 전용.** 코드·DB·마이그레이션 변경 0. 아래는 스키마/쿼리 정독 + 운영 DB(mcgdoplo) 집계 결과.
> 작성일: 2026-07-15. 데이터 스냅샷: 운영 DB 실측(`scripts/run-prod-sql.mjs`).

---

## 0. 한 줄 결론

- **노드 id 공간은 단일하다(SSOT 통일).** 약점·마스터리·OX·강의매핑·문제·판례·조문·Q&A가 전부 `systematic_nodes.node_id` 하나를 가리킨다. **"약점 노드 = 강의 매핑 노드"는 참** — 별개 taxonomy 아님. → **"체계 통일 먼저"는 id-공간 축에서는 불필요.**
- **그러나 데이터가 없어 Phase 1(강의→복습 시딩)은 지금 배선 불가.** 3대 공백:
  1. **강의↔노드 매핑 테이블 `lesson_node_links`가 완전히 비어 있음(0행)** + 실제 VOD 강의 카탈로그 자체가 테스트 수준(강좌 3·회차 4).
  2. **문제→노드 도달률이 과목 편중**: 특허·민법만 노드 신호가 산다(특허 1,109·민법 680). **상표·디자인은 0%**(문제에 노드도 조문 앵커도 없음). 자연과학은 노드 체계 밖.
  3. **1개의 attribution-edge 불일치**: 개인 약점(`getWeakNodes`)만 문제→노드를 `primary_article_id` 경로로만 잡아 `primary_node_id`를 무시 → 코호트/마스터리/OX와 문제 배치가 갈릴 수 있음(같은 id 공간, 다른 매핑 엣지).

---

## 1. 노드 SSOT 식별

### 표준 테이블 = `systematic_nodes` (체계도 노드)
| 컬럼 | 의미 |
|---|---|
| `node_id` (PK) | 노드 식별자(UUID) |
| `parent_id` → `systematic_nodes.node_id` | 자기참조 트리(단원 계층) |
| `path` (ltree) | materialized path(트리 순서/롤업) |
| `law_code` | **과목 스코프**(`patent`·`trademark`·`design`·`civil`) |
| `display_label`, `ord`, `case_only`, `case_display_label` | 표시·정렬·판례전용 노드 |

- **계층 = 과목(`law_code`) > 단원 > 세부논점**을 `parent_id`/`path`로 표현. 조/항/호/목의 법조문 트리(`articles`)와는 **별개**의 "교재 체계도" 트리다. 조문은 `article_systematic_links(article_id, node_id)`로 노드에 연결된다.

### ★ 차수(1차/2차) 구분 방식 — **노드는 차수를 구분하지 않는다**
- `systematic_nodes`에 round/차수 컬럼 **없음**. 노드는 **과목으로만** 구분.
- 차수는 **문제 레벨 속성**: `problems.exam_round ∈ {first, second}`. 즉 **같은 단원 노드가 1차·2차 문제를 공유**한다.
- 함의: "1차 루프 먼저"는 노드 트리를 새로 만드는 문제가 아니라 **문제/강의를 `exam_round=first`로 필터**하는 문제. 노드 스파인은 1·2차 공용.

### ★ 약점 노드 동일성 (이 감사 최우선 항목) — **동일함**
- `getWeakNodes`(개인)·`getCohortWeakNodes`(코호트)가 산출하는 "약점 노드 id"는 **문자 그대로 `systematic_nodes.node_id`**다. 골격은 `getSystematicSkeleton`(=`systematic_nodes` + `article_systematic_links`)에서 오고, 문제를 노드로 귀속시킨 뒤 트리에 집계한다.
- 강의 매핑 테이블 `lesson_node_links.node_id`도 **DDL에서 `systematic_nodes.node_id`로 FK**(`scripts/sql/20260708_lms_m2_tables.sql:84`).
- **∴ 약점 노드와 강의 매핑 노드는 동일 테이블·동일 id 공간.** "약점은 A단원인데 강의는 B단원" 같은 **id-공간 어긋남은 없다.**

### 노드 실측(운영 DB)
| law_code | 노드 수 | 판례전용(case_only) |
|---|---:|---:|
| patent(특허) | 181 | 72 |
| trademark(상표) | 204 | 48 |
| design(디자인) | 166 | 16 |
| civil(민법) | 141 | 0 |
| **합계** | **692** | 136 |
| **leaf(자식 없는 말단) 총** | **508** | — |

- **노드가 존재하지 않는 과목**: `civil-procedure(민사소송법, 2차 전용)` · `science(자연과학)`. 자연과학 문제는 노드 대신 `science_section_id`라는 **별도 taxonomy**를 쓴다(§3 참조).

---

## 2. 서브시스템별 노드 참조 경로

두 표준 귀속 엣지:
- **직접**: `problems.primary_node_id` → `systematic_nodes.node_id`
- **폴백**: `problems.primary_article_id` → `article_systematic_links(article_id, node_id)` → `systematic_nodes.node_id`

| 서브시스템 | 참조 경로(테이블.컬럼 / 브리지) | 노드 id 공간? | 근거(file:line) |
|---|---|---|---|
| **복습 MCQ** | `user_problem_srs.problem_id` (노드 없음, problems→articles→laws만) | **아니오 (문제키)** | `study/srs.server.ts:80-93` |
| **복습 OX** | `user_ox_ref_srs.ref_id`(choice/box_item) | **아니오 (ref키)** | `study/ox-srs.server.ts:24,92,199` |
| **복습 조문정독** | `study_sessions` + `articles.article_id` | **아니오 (조문키)** | `study/article-review.server.ts:45,98,135` |
| **복습 빈칸** | article-viewer `?blankReview=1`, 서버 재계산(조문 단위) | **아니오 (조문키)** | study/*.server 내 노드 참조 없음 |
| **약점 개인** `getWeakNodes` | 노드=`getSystematicSkeleton`; 문제귀속=**`primary_article_id`만** | **예** (단, 조문엣지 전용) | `subjects/lib/weak-nodes.server.ts:44,68,88`; `subjects/lib/node-progress.server.ts:51-58` |
| **약점 코호트** `getCohortWeakNodes` | `primary_node_id` 우선, 없으면 `article_systematic_links` | **예** | `admin/queries/cohort-weakness.server.ts:141-150` |
| **약점→개인과제** `weak-personal` | `getWeakNodes` 재사용(개인 경로) | **예** (조문엣지) | `assignments/weak-personal.server.ts:20,37` |
| **진도·정답률** `getOverallProgress` | 전체 코퍼스 카운트 + `study_sessions.scope.target_id`(article/case) + `user_problem_attempts.problem_id` | **아니오 (과목/조문/문제키)** | `study/queries.server.ts:1653-1699`; `node-progress.server.ts`(article_id 그룹) |
| **마스터리·레벨** `getNodeMastery` | `user_problem_attempts`→`primary_node_id` 우선/조문 폴백; 라벨은 `systematic_nodes` | **예** | `study/mastery.server.ts:75-129,158-178` |
| **OX 진단** `computeOxDiagnosis` | `primary_node_id` 우선/조문 폴백; 트리·라벨 `systematic_nodes` | **예** | `study/lib/ox-diagnosis.server.ts:563-621` |
| **모의고사/모의팩** | `mcq_pack_problems(problem_id)` — 노드 컬럼 없음, `primary_node_id` **상속** | 상속 | `mcq-packs/queries.server.ts:514`; `mcq-exams/queries.server.ts:135` |
| **오프라인 테스트** | `offline_test_questions(problem_id/...)` — 노드 없음, `problemIdsForNode`로 상속 | 상속 | `offline-tests/queries.server.ts:183,701-729` |
| **강의(VOD)↔노드** | `lesson_node_links(lesson_id, node_id)` | **예**(FK) — **단, 0행·미배선** | `lms/queries.server.ts:196`(읽기 1곳, 결과 폐기) |
| **강의노트↔콘텐츠** | `lecture_resources`·`lecture_pdf_locations`(polymorphic → **article/case**) | **N/A**(노드 아님) | `lectures/queries.server.ts:198-293,381-451` |
| 참고: **문제/판례/조문/Q&A** | `problems.primary_node_id`·`cases.primary_node_id`·`article_systematic_links.node_id`·`qna_threads.node_id` | **예(전부 동일 FK)** | database.types.ts |

---

## 3. 동일성 판정 (SSOT 확인)

### 결론: **id 공간은 단일. 별개 taxonomy 없음.** — 단, 두 종류의 "정합성 주의점"이 있다.

**(a) 정상적으로 노드 밖에 있는 서브시스템(설계상 의도, 버그 아님)**
- **복습/SRS**와 **진도·정답률**은 노드가 아니라 **문제 id·ref id·조문 id·코퍼스 카운트**로 돈다. → 선순환에서 "복습"은 노드가 아니라 **문제 단위로 시딩**된다는 뜻(강의→노드→그 노드의 문제들을 복습 큐에 적재하는 형태). 노드는 약점/마스터리/OX/테스트빌드의 **집계·선택 축**으로만 쓰인다.

**(b) 같은 id 공간 안의 매핑-엣지 불일치 — ★유일한 어긋난 쌍**
- **어긋난 쌍**: `개인 약점 getWeakNodes`(및 이를 재사용하는 `weak-personal` 개인과제 생성) **↔** `코호트 약점 / 마스터리 / OX 진단`.
- 내용: 개인 약점은 문제→노드를 **`primary_article_id`↔`article_systematic_links` 경로로만** 잡고 **`problems.primary_node_id`를 무시**한다(`node-progress.server.ts:51-58`). 나머지(코호트·마스터리·OX)는 **`primary_node_id` 우선**.
- 영향: `primary_node_id`가 조문파생 노드와 **다르게 핀 고정된** 문제(특허에 다수)는 **개인 약점/개인과제**에서 **다른 노드**로 배치될 수 있다. 같은 `systematic_nodes.node_id` 공간이지만 **문제→노드 매핑이 비대칭.**
- 성격: id 공간 문제가 아니라 **귀속 규칙 통일** 문제 → Phase 1 배선 시(약점→과제→강의 라우팅) 반드시 한 규칙으로 정렬 필요. 현재 memory `patent-node-mapping-workbook`이 특허를 `primary_node_id` 기준으로 재배치했으므로, **개인 약점 경로가 특허 재배치를 반영하지 못하는** 상태.

---

## 4. 공백 분석 (1차 과목 우선 집계 / 2차는 목록)

> 1차 노드 과목 = **특허·상표·디자인**(산업재산권법) + **민법**. 자연과학은 노드 밖(별도). 민사소송법은 2차 전용.

### 4-1. 문제→노드 도달률 (복습·테스트·약점의 실질 신호원)
문제 활성 수와 **노드 도달(직접 OR 조문폴백)** 실측:

| 과목 | 활성 문제 | 노드 도달 | 도달 불가 | 도달률 | 비고 |
|---|---:|---:|---:|---:|---|
| **patent(특허)** | ~1,173 | **1,109** | 64 | **~95%** | `primary_node_id` 직접 1,096 + 조문폴백 13 |
| **civil(민법)** | 680 | **680** | 0 | **100%** | 거의 전량 **조문폴백**(직접 태그 6) |
| **design(디자인)** | 280 | **0** | 280 | **0%** | 문제에 노드·조문 앵커 **둘 다 없음** |
| **trademark(상표)** | 296 | **0** | 296 | **0%** | 문제에 노드·조문 앵커 **둘 다 없음** |
| science(자연과학) | 688 | 0 | 688 | — | **노드 체계 밖**(`science_section_id`) |
| civil-procedure(민소법) | 64 | 0 | 64 | — | 노드 없음(2차 전용) |

- 문제 origin(1차 활성): `past_exam` 2,196 · `expected` 600 · `past_exam_variant` 126 · `ai_draft` 8.
- **핵심 공백**: 상표·디자인 문제는 **단원 노드에 전혀 걸려 있지 않다** → 이 두 과목은 현재 **약점 분석·마스터리·OX·노드별 모의고사가 데이터상 작동 불가**. (memory `patent-node-mapping-workbook`의 "상표/디자인/민법 미실행"과 일치. 단, 민법은 조문폴백으로 사실상 도달됨.)

### 4-2. 강의 없는 노드 / 노드 없는 강의 (★핵심 게이트)
| 지표 | 값 |
|---|---:|
| `lesson_node_links` 총 행 | **0** |
| 노드에 매핑된 회차(distinct lesson) | **0** |
| 강의 걸린 노드(distinct node) | **0** |
| **강의 없는 노드**(patent/trademark/design/civil 전부) | **692 / 692 (100%)** |
| **문제는 있는데 강의 없는 노드**(보완→강의 라우팅 불가 지점) | patent **82** · civil **3** (상표·디자인은 문제 자체가 노드 미태깅이라 0으로 집계) |
| `course_lessons` 총 | 4 (테스트) |
| **노드 매핑 없는 회차** | **4 / 4** |
| `courses` 총 | 3 (테스트) |

- **`lesson_node_links`는 죽은 테이블**: M2에서 "테이블만" 생성(`docs/db-schema.md:1124`), **쓰기 경로 전무**(insert/upsert/update 0곳), 읽기 1곳(`lms/queries.server.ts:196`)이나 그 `nodeIds` 결과는 **호출자에서 렌더조차 안 됨**. 강의를 노드에 걸 **운영 UI가 없다**.
- **강의 시스템이 두 갈래**로 병존하며 **둘 다 노드에 안 걸림**:
  - **A. LMS VOD**(`course_series→courses→course_lessons→lesson_videos`) — 과목 연결은 **series의 `subject_code`**(노드 아님).
  - **B. 종합반 커리큘럼**(`curricula→curriculum_weeks→curriculum_items(kind=lecture)`) — 외부 URL, 노드/과목 컬럼 없음.
  - 강의노트(`lecture_resources`·`lecture_pdf_locations`)는 **article/case**에 걸림(노드 아님).

### 4-3. 조문·판례 스파인 (참고: 상대적으로 건강)
| 지표 | 값 |
|---|---:|
| `article_systematic_links` 행 | 1,993 |
| 활성 조문 | 2,721 |
| 판례 활성 | 790 |
| 판례 노드 태깅 | **770** (patent 352·trademark 356·design 62), 미태깅 20 |

- 판례는 노드 태깅이 잘 되어 있고(97%), 조문↔노드도 상당수 존재. **문제 태깅만 유독 특허 편중**이라는 게 데이터의 요지.

### 4-4. orphan / 태그 없는 테스트 문항
- **orphan 노드**(복습·테스트가 참조하는데 트리에 없는 id): 구조상 0 — 문제·판례·조문·강의·Q&A의 node 컬럼 전부 `systematic_nodes`로 **FK 강제**라 dangling 불가.
- **태그 없는 테스트/모의 문항**: 모의·테스트는 노드를 **문제에서 상속**하므로, "태그 없는 문항 수" = **노드 미도달 문제 수**(§4-1)와 동치. 즉 상표 296·디자인 280·자연과학 688·(2차 256 전량)이 노드 없는 문항으로 흘러들어감.

### 4-5. 2차 노드 지형(목록만)
- 2차 문제 활성 256건 — **전량 `primary_node_id` NULL**(노드 미태깅).
- 2차 전용 과목 **민사소송법(civil-procedure)**: 노드 트리 **없음**.
- 특허·상표·디자인·민법의 노드 트리는 1·2차 공용(차수 컬럼 없음)이므로 2차 루프 설계 시 별도 트리 신설 없이 재사용 가능. 단 **2차 문제의 노드 태깅이 0**이라 2차는 태깅부터 시작.

---

## 5. Phase 1(1차 "강의→복습 시딩") 착수 가능성 판정

### 판정: **지금은 착수 불가(데이터 미충족). 단 id-공간은 통일돼 있어 "체계 통일" 선행은 불필요.**

두 축으로 분리 판정:

**축 A — taxonomy/id 공간: ✅ 통과.**
- 약점=마스터리=OX=강의매핑=`systematic_nodes.node_id` 단일. 배선 전 "체계 통일 먼저" 리팩토링은 **불필요**. (단 §3-(b) 개인약점 엣지 정렬 1건은 배선 전 정리 권장.)

**축 B — 데이터 충족: ❌ 미달.** 착수를 막는 선결 분량:

| 선결 과제 | 현황 | 필요 작업 |
|---|---|---|
| **P0. "강의" 정의 확정** | VOD(A)·종합반(B) 두 갈래, 카탈로그는 테스트뿐 | 루프의 "강의"가 LMS VOD인지 종합반 커리큘럼인지 결정 |
| **P1. 강의 카탈로그** | 강좌 3·회차 4(테스트) | 파일럿 과목의 실제 VOD 회차 적재(LMS 콘텐츠 마일스톤 선행) |
| **P2. `lesson_node_links` 채우기** | **0행 + 쓰기 UI 없음** | 회차↔노드 매핑 **운영 UI 신설** + 데이터 입력 |
| **P3. 문제→노드 태깅 완성** | patent 95%·civil 100%(조문폴백) / **design·trademark 0%** | 상표·디자인 문제 노드(또는 조문) 앵커링 |
| **P4. 약점 엣지 정렬** | 개인약점만 조문엣지 전용 | `getWeakNodes` 귀속을 `primary_node_id` 우선으로 통일 |

### 권고 실행 순서
1. **파일럿 = 특허(patent).** 유일하게 **문제 노드 태깅(1,109)이 성숙**하고 노드 트리(181)가 갖춰진 과목. Phase 1을 특허 단일 과목으로 좁혀 검증.
2. 그러나 특허조차 **강의 입력이 없다**(카탈로그·`lesson_node_links` 공백) → **Phase 1의 진짜 첫 선결은 "특허 VOD 회차 적재 + 회차↔노드 매핑 UI/데이터"**. 이게 채워지기 전엔 "강의→복습"이 시딩할 **소스가 존재하지 않음**.
3. 상표·디자인은 **문제 태깅(P3)이 별도 선행**돼야 루프에 합류 가능. 자연과학은 노드 밖이라 **별도 설계**(section↔loop) 없이는 미합류.
4. 배선 착수 시 **§3-(b) 개인약점 엣지(P4)**를 먼저 정렬해 약점→과제→강의 라우팅이 코호트/마스터리와 같은 노드를 가리키게 한다.

### 요약
- **좋은 소식**: 지도(id 공간)는 하나로 그려져 있다. 잘못된 지도 위에 집 짓는 위험은 없다.
- **나쁜 소식**: 그 지도의 **강의 칸이 통째로 비어 있고**(`lesson_node_links` 0, 카탈로그 테스트뿐), **문제 칸도 특허·민법만 칠해져 있다**(상표·디자인 0%).
- **∴ Phase 1은 "배선"이 아니라 "적재"부터**다: 파일럿 특허의 **강의 카탈로그 + 회차↔노드 매핑**을 먼저 채우고(그리고 개인약점 엣지 정렬), 그 위에서 강의→복습 시딩을 dry-run 게이트로 넣는다.

---

### 부록 — 감사 방법
- 스키마: `database.types.ts` 정독(FK 관계 확인).
- 서브시스템 경로: `app/features/{study,subjects,admin,assignments,mcq-packs,mcq-exams,offline-tests,lms,lectures,problems}` 서버 쿼리 정독(위 file:line).
- 집계: 운영 DB(mcgdoplo) 실측 3쿼리(노드/문제/판례/강의 카운트 + 조문폴백 도달률). 읽기 전용, 무변경.
