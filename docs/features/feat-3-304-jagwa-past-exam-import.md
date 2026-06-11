# feat-3-304 — 자연과학 1차 기출 스캔 PDF 적재 파이프라인 (image-first)

## 배경

`feat-3-301`(객관식 문제, `mcq_packs`)로 1차 기출 인프라는 준비됐으나, 실제
기출 데이터는 산업재산권 3법(특허·상표·디자인)만 적재돼 있었다. 자연과학(자과)
1차 기출은 `source/기출모음(2010~2026)/1차/문제/{연도}_{회차}_1_자과{형}.pdf`
원본만 있고 미적재 상태였다.

자과 기출의 특수성: **원본 PDF가 텍스트 레이어 없는 스캔 이미지**다(폰트 0,
이미지 XObject만). 또한 자연과학 문항은 본질적으로 시각적이다 — 수식, 회로·장치
그림, 그래프 선지(①~⑤가 v–t 그래프), 화학 구조식, `<보기>` 박스. 따라서 선지를
텍스트로 옮기는 것이 불가능/손실이다.

## 목표

스캔 PDF를 파싱·분석해 자과 기출을 **1차 기출문제(`/latest/mcq`)** 와
**학습과목 자연과학(`/subjects/science`)** 양쪽에 적재한다. 두 영역은 동일한
`problems` 행을 공유하므로 1회 insert로 둘 다 충족한다(아래 "연결" 참조).

## 범위

- 대상: 자연과학 1차 기출. `problems.origin='past_exam'`, `exam_round='first'`,
  `subject_type='science'`.
- 1과목 = 40문항 = 물리(1–10)·화학(11–20)·생물(21–30)·지구과학(31–40) 각 10.
  과목 라벨이 지면에 없어 **내용으로 분류**(블록 구조가 가이드).
- 정답키는 연도별 별도 PDF(`정답/{연도}_{회차}_1_정답.pdf`)의 "3교시 자연과학개론"
  표. 복수정답(예: 2010 Q32 = ①③)은 선지 다중 `is_correct` 로 표현.

## 핵심 설계 결정 — image-first

자과 문항은 **문제 통째(발문+5선지)를 1장의 크롭 이미지로 저장**한다.

- `problems.body_md` = `![자과 {연도}-{회차} {n}번]({publicUrl})` (Markdown 이미지).
- `problem_choices` 5행: `body_md=""`(빈 문자열), `is_correct`=정답키. 응시 화면의
  선지 버튼은 번호 배지(1~5)만 노출 → 학생은 이미지에서 ①~⑤를 읽고 번호를 누른다.
- `format`은 보기형(`mc_box`)이라도 전부 **`mc_short` 로 통일**한다(박스는 이미지에
  포함, `problem_box_items` 미사용). 원 보기형 여부는 `problems.json`의
  `hasBogiBox` 로만 보존.

이유: 그래프·구조식 선지는 텍스트화 불가. 전체-문항 크롭이 충실도 100% + OCR 오류
0 + 기존 Runner와 호환. (텍스트 추출+단원 OCR 화는 후속 품질 업그레이드 여지.)

## 파이프라인 (`scripts/jagwa/`)

| 스크립트 | 역할 |
|---|---|
| `render-pdf.mjs` | mupdf로 PDF 페이지 → PNG(scale 2.2 ≈158dpi). |
| `data.mjs` | SSOT — 정답키 / page→문항 / 과목·유형 / **`OVERRIDE_CUTS`**(페이지별 컷 y). |
| `crop-questions.mjs` | sharp로 문항 단위 크롭 → `q01..q40.png` + 검수용 컨택트시트. |
| `ruler.mjs` | 페이지에 y 픽셀 자 오버레이 → 컷 좌표 육안 확정용. |
| `build-problems.mjs` | `problems.json`(40 problems + 선지 + 정답 + 저장경로) 산출. |
| `load.mjs` | 버킷 생성 → 이미지 업로드 → insert → 팩 생성. `--go` 필요. |
| `map-sections.mjs` | A) 40문항을 `science_sections`(단원)에 매핑. |
| `verify.mjs` | 적재 후 독립 검증(문항/선지/정답/팩/노출/이미지 200). |

### 문항 경계 크롭이 난점

스캔 레이아웃은 **선지가 문제번호와 같은 좌측 마진에 정렬**돼 있어, 여백 투영
기반 자동 분할이 "문제번호 vs 선지"를 구분 못 한다(largest-gap 휴리스틱 오작동).
→ `ruler.mjs`로 페이지별 컷 y를 육안 확정해 `data.mjs`의 `OVERRIDE_CUTS`에 고정한다.
페이지당 ~수 분. 자동 분할은 연도별 레이아웃 변동에 불안정하므로 신뢰하지 않는다.

## 데이터 매핑

```
problems:  origin=past_exam · exam_round=first · exam_round_no={회차} · year={연도}
           subject_type=science · science_subject=물/화/생/지 · science_section_id={단원}
           problem_number=N · format=mc_short · review_status=approved · body_md=![]()
problem_choices: index 1..5 · body_md="" · is_correct=정답키
mcq_packs: kind=past_exam · subject_scope=science · year={연도} · title="{연도}년 1차 기출"
mcq_pack_problems: 위 40문항, ord=problem_number 순
```

- A형/B형 DB 컬럼 없음 → Storage 경로(`past-exam/{연도}_{회차}_{형}/qNN.png`)에만 기록.
- 이미지 버킷 `problem-images`(public). 운영 DB는 **mcgdoplo**, `.env` supabase-js
  직접(메모: MCP supabase 툴 stale 금지).

### 두 영역의 연결 (1회 insert로 양쪽 충족)

- **1차 기출**: `regeneratePastExamPacks`와 동일 로직을 science-scoped로 재현해
  `subject_scope='science'` 팩 생성 → `/latest/mcq?kind=past_exam`(과목=자연과학).
- **자연과학**: `listScienceProblems`는 `subject_type='science'`+`science_subject`만
  보고 `origin`을 안 가린다 → 허브/퀴즈에 자동 노출. **단, 단원(section) 기준 집계·
  단원 선택 퀴즈에 포함되려면 `science_section_id` 매핑 필수**(A 단계, `map-sections.mjs`).

## image-first 렌더 (Runner 수정)

`mcq-pack-sheet.tsx`(1차 기출 응시 화면)는 본문을 raw 텍스트로 렌더해 이미지 문항이
`![](url)` 글자로 노출됐다. → **본문에 이미지 마크다운이 있을 때만 `MarkdownView`**
경로로 분기(텍스트 문항은 기존 `whitespace-pre-line` 유지 — 무회귀). 커밋 `337c024`.
`/subjects/science` 풀이 화면은 기존부터 `MarkdownView`라 수정 불필요.

## 신규 연도 추가 절차

1. `render-pdf.mjs`로 해당 연도 문제·정답 PDF 렌더.
2. 전 페이지 + 정답표(crop+upscale) 비전 판독 → `data.mjs`(정답/page맵/과목·유형) 갱신.
3. `ruler.mjs` → 멀티문항 페이지 컷 y 확정 → `OVERRIDE_CUTS` 갱신.
4. `crop-questions.mjs` → 컨택트시트 검수(문항=1이미지 확인).
5. `build-problems.mjs` → `load.mjs --go` → `map-sections.mjs --go` → `verify.mjs`.

## 상태 / 후속

- ✅ **2010(47회) 자과 A형 40문항** 적재·단원 매핑·양쪽 노출·image-first 렌더 검증 완료.
- 🔲 2011~2026 자과 — 동일 절차 반복(연도별 컷 확정이 병목).
- 후속 여지: (a) 발문 텍스트 OCR화(검색/AI Q&A 대상화), (b) 자동 분할 정확도 개선,
  (c) 운영자용 in-app 컷 보정 도구.

## 발견·주의

- 적재 전 `subject_type='science'` 샘플 예상문제 2개/과목(origin=expected)이 이미
  존재 — 무관(허브에 기출과 함께 노출됨).
- 정답표는 저해상 직독 불가 → 자과 A형 표를 crop+upscale 후 판독(정확도 ↑).
