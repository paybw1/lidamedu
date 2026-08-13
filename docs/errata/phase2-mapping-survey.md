# Phase 2 사전 조사 — 교재 ↔ 콘텐츠 대응관계 실측 (읽기 전용)

> 실행일: 2026-08-13 · 대상: 운영 `mcgdoplo` (SELECT·카탈로그·리포 검색만, DDL 없음)
> 재실행 도구: `tmp/errata-audit/survey-1~4.mjs`
> 요약 판정: **객관식 = 연결 있음(FK, 강함) · 판례 = 부분(텍스트 라벨+수록 순번, FK 없음) · 조문 = 없음(조문번호가 자연키) · 주관식/자연과학 = 없음(교재가 아니라 시험지 유래) · 페이지 번호 = 전무(설계 §11 3안 그대로)**

---

## 1. 교재를 나타내는 테이블 전수

이름 매칭(book|doc|source|workbook|publication…)으로 전수 스캔한 결과, 교재 성격 테이블은 **4계열로 흩어져 있고 서로 간 FK가 전혀 없다.**

| 테이블 | 행 | 성격 | 판·쇄 정보 |
|---|---|---|---|
| `books` | 15 | **도서몰 상품** (커머스 — 가격·재고·배송) | 타이틀 문자열에만 (`리담특허법 [제25판]` 등), `isbn`·`published_on` 컬럼 있음 |
| `problem_source_docs` ★ | 7 | **문제 시드 원천 문서 대장** — 문제편/해설편 쌍(`paired_with_doc_id`), hwpx 파일명 | `edition` 컬럼 (제20판/제3판) |
| `study_books` | 3 | **RAG 코퍼스 원천** (기본서·심사기준·심판편람) | `edition` 컬럼(현재 null, 타이틀에 제25판) |
| `book_updates` | 0 | 만들다 만 정오표성 테이블 (Phase 0 기지 — 폐기 후보) | — |
| 기타 | | `book_preview_pages`(105, 도서몰 미리보기 이미지)·`plan_books`(0)/`plan_book_links`(21, 상품↔도서 커머스)·`lecture_source_pdfs`/`lecture_resources`(강의노트 계열 — 교재 아님) | |

**"객관식 문제집(1)" 같은 개별 문제집이 행으로 존재하는가** — 예, 두 곳에 **따로**:
- `books`: "리담특허법 객관식 (Ⅰ) 기출문제 [제20판]" (판매 상품)
- `problem_source_docs`: "리담특허법 객관식(Ⅰ) 기출문제 제20판 — 문제편/해설편" (시드 문서 2행)

둘은 라벨 문자열로만 대응되고 FK 없음. `books`는 시리즈가 아니라 개별 판 단위 상품이다.

`problem_source_docs` 전 7행: 특허 객관식Ⅰ 기출(제20판) 문제/해설 · 특허 객관식Ⅱ 예상(제20판) 문제/해설 · 상표+디자인 기출(제3판) 문제/해설 · "변리사 1차 민법개론 기출 2010-2026"(교재 아닌 기출 폴더, edition null).

## 2. 콘텐츠 → 교재 연결 경로

| 콘텐츠 | 경로 | FK | 판정 |
|---|---|---|---|
| problems | **`source_doc_id` → `problem_source_docs`** | ✅ 실 FK (`problems_source_doc_id_fkey`) | **연결 있음** |
| problems | `source_gs_question_id` → `gs_questions`(8행, 연결 0) — 모의고사 시험지, 교재 무관 | FK 있으나 무의미 | — |
| problems (AI) | `source_chunk_ids[]` → content_chunks (생성 근거) | 배열, FK 없음 | 보조 |
| cases | `comment_source`(교재명 텍스트) + `source_seq`(**책 수록 순번**) + trademark 한정 `book_sections`(제16판 절 구조 jsonb) | ❌ FK 없음 | **부분** |
| articles / article_revisions | 교재 연결 컬럼 **없음** | — | **없음** (조문번호 자체가 조문정리 교재와의 자연키) |
| 이론(기본서 본문) | `content_chunks(source_type='textbook', source_id→study_books.book_id)` — 리담특허법 제25판 2,546청크, `heading_path`=절 경로, `chunk_index`=책 순서 | 논리 연결(조인 성립 확인) | 특허 기본서만 |
| 중간 매핑 테이블 (book_problems 류) | **없음** | — | — |

## 3. 커버리지 (생존 행 기준, deleted_at is null)

**problems.source_doc_id** — 구조는 단일 FK 컬럼 = **1:N** (문제 1건 → 문제집 1곳, N:M 아님):

| 구간 | 전체 | 연결 | 비율 |
|---|---|---|---|
| 법률 expected(예상문제집) | 592 | 592 | 100% |
| 법률 past_exam | 1,798 | 1,514 | 84.2% |
| 법률 past_exam_variant | 127 | 126 | 99.2% |
| 자연과학 | 688 | 0 | 0% |

미연결 284건의 정체(전수 분해):
- **주관식 267건(특허 67·상표 68·디자인 64·민소 68)** — 2차 기출 시험지에서 적재. 교재 유래가 아님 → 미연결이 정답
- 상표 객관식 14건 — 전부 2026-07-30 생성 = **상표 워크북 마이그레이션 때 신규 적재분** (문제집 문서 대장에 상표 워크북(제20판)이 등록돼 있지 않음)
- 특허 객관식 3건 — 백필 잔재
- 자연과학 680건 — 공단 기출 시험지 유래. 교재 아님 → 미연결이 정답

주의: soft-deleted 문제 6,589건도 source_doc_id를 갖고 있다(시드 반복 잔재). 집계 시 `deleted_at is null` 필터 필수 — 안 걸면 특허 기출문제집이 6,249건으로 보인다.

**cases** (교재별 텍스트 라벨 `comment_source` 분포: 리담특허법 판례 **[제9판]** 225 · 리담상표법 판례 **[제16판]** 132 · 리담 디자인보호법 판례 62):

| 법률 | 전체 | book_sections | source_seq | comment_source |
|---|---|---|---|---|
| patent | 383 | 0 | 371 (97%) | 225 (59%) |
| trademark | 356 | **356 (100%)** | 356 | 132 |
| design | 62 | 0 | 62 (100%) | 62 |

특허의 comment_source 무 158건도 대부분 source_seq는 있음(156/158) — 라벨은 평석 보유분에만 기입된 것. 최근 추가 11건은 최신판례(교재 밖 신규)로 정상.

## 4. 순서·위치 정보

| 정보 | 존재 | 실측 |
|---|---|---|
| 페이지 번호 | ❌ **어디에도 없음** | 설계서 §11 판단(3안 toc_path 출발 → 신판부터 역주입) 그대로 유효 |
| 문제 번호 | ✅ `problem_number` 전 행 100% | ★단, 의미가 "책 통번호"가 아니라 **체계도 노드 내 순번**(워크북 section 기준 재배치 — 특허·상표 완료). 책 전체 순번은 체계도 트리순으로 파생 재계산(`attachProblemOverallNo` 기존 로직) |
| 실제 시험 문항번호 | `exam_number` 517건(특허 위주) + `year` 기출 전량 | 기출문제집이 연도·회차 편제라면 이 축으로도 책 내 위치 서술 가능 |
| 판례 수록 순번 | ✅ `cases.source_seq` 1..385 (3법 모두 96~100%) | **"판례교재 N번" 표기 즉시 가능** |
| 교재 절(목차) 경로 | ✅ 부분 | trademark `book_sections`(제16판 절 구조 — 쟁점상표/사안의 쟁점/법리 등 블록), 특허 기본서 `content_chunks.heading_path`("리담특허법 [제25판] · 제2절 …")+`chunk_index` |
| 단원 | `primary_node_id`(객관식 60~73%)·`problem_systematic_links`(주관식 68건)·science_section_id | 노드 → 교재 절 대응은 특허 워크북 기준 정합 완료(기지) |

## 5. 재구성 가능성 — 시드 스크립트·원본 잔존 여부

**추출 파이프라인이 리포에 전부 남아 있다** (재실행 가능):
- 객관식 시드: `scripts/seed-problems.mjs`·`seed-patent-expected.mjs`·`seed-missing-patent.mjs`
- 2차 주관식: `scripts/jagwa/` (hwpx-to-text → parse-essay-2cha → seed)
- 상표 판례 제16판 파서: `scripts/precedents/parse-trademark-book.mjs`·`seed-trademark-book.mjs`
- 기본서 코퍼스: `scripts/jagwa/build-book-corpus.mjs`·`book-read.mjs`, 워크북↔노드: `apply-wb-node.mjs`
- **원본 hwpx/폴더도 `source/`에 상존** (기출모음(2010~2026), 문제집 내지 파일 등 — `problem_source_docs.file_name`과 대응)

역추론 필요성: 낮음. 객관식은 FK가 이미 있고, 주관식·자과는 애초에 교재 유래가 아니므로 역추론 대상이 아니다. 유일한 재구성 후보는 상표 객관식 신규 14건(워크북 문서를 대장에 추가 후 연결)과 특허 3건.

---

## 판단 필요 사항 (각 단일 권고)

1. **판본 마스터 통합** — 판 정보가 4곳(books 상품 타이틀 / problem_source_docs.edition / study_books 타이틀 / cases.comment_source 텍스트)에 흩어져 있고 상호 FK가 없다. **권고: Phase 2의 `publications`/`publication_editions`를 신설하고, 기존 4곳은 건드리지 않은 채 라벨 매칭으로 1회 연결**(대상이 십수 종이라 수동 확정 감당 가능). 기존 테이블을 개조하는 것보다 안전하다.
2. **판(edition) 불일치 발견** ★ — 판례 콘텐츠는 **제9판**(특허 판례) 기준 시드인데 현행 유통 상품은 **제10판**, 상표 판례는 제16판 시드인데 도서몰에 상표 판례 교재 상품이 없다. "최신판만 지원"(결정 3) 적용 시 **콘텐츠의 출처 판 ≠ 유통 최신판**인 교재의 처리 방침 필요. **권고: publication_content_map은 유통 최신판에 대해 만들되, 구판 유래 매핑(source_seq 등)은 '신판에서도 순서 불변'을 임별님이 교재로 1회 확인 후 승계.**
3. **매핑 시드 즉시 가능 범위** — 재구성 없이 지금 데이터로 `publication_content_map`(toc_path 3안)을 채울 수 있는 것: ① 객관식→문제집(FK) ② 판례→판례교재(`source_seq` 순번) ③ 상표 판례 절(`book_sections`) ④ 특허 기본서 절(`heading_path`). **권고: Phase 2 시드는 이 4축으로 한정**하고 페이지 번호는 계획대로 신판 역주입까지 보류.
4. **정오표 대상 제외 확정** — 주관식 모범답안·채점기준(자체 제작물)과 자연과학(공단 시험지)은 교재 위치가 애초에 없다. **권고: 이 둘은 추록에서 위치 표기 없이 "문항 단위" 고지로 확정**(P-번호/연도·문항번호 인용).
5. **상표 워크북 문서 대장 미등록** — 상표 객관식은 문제편 기반 재배치까지 끝났는데 `problem_source_docs`에 상표 워크북(제20판) 행이 없어 신규 14건이 미연결이다. **권고: Phase 2에서 문서 행 추가 + 14건(및 특허 3건) 연결 백필**(소량·기계적).

*Phase 2 사전 조사 종료 — 지시대로 여기서 정지한다. DDL·백필은 수행하지 않았다.*
