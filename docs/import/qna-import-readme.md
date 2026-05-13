# Q&A 일괄 import 양식

다음 카페 `ezpatent` 에 있는 Q&A 데이터를 리담에듀 시스템(`qna_threads`)으로 이관하기 위한 CSV 양식.

옮길 글을 골라 `qna-import-template.csv` 한 행에 하나씩 채운 뒤, 후속 import 스크립트가 행을 읽어 `qna_threads` 에 INSERT 한다.

---

## 빠른 사용 방법

1. `qna-import-template.csv` 를 **엑셀** 또는 **구글 시트** 로 연다.
2. 예시 행은 그대로 두거나 지우고, **카페에서 옮길 Q&A 한 건 = 한 행** 으로 채운다.
3. 다 채우면 **UTF-8 CSV** 로 저장:
   - 엑셀: 「다른 이름으로 저장」 → 파일 형식 「CSV UTF-8(쉼표로 분리)」
   - 구글 시트: 「파일 → 다운로드 → 쉼표로 구분된 값(.csv)」
4. 운영자(또는 Claude) 가 import 스크립트를 돌려 DB 에 반영.

---

## 컬럼 정의

| 컬럼 | 필수 | 설명 |
|------|:---:|------|
| `target_kind` | ✅ | `article` (조문) / `case` (판례) / `problem` (객관식 문제) |
| `target_ref` | ✅ | 대상 식별자. `target_kind` 별 형식은 아래 ↓ |
| `title` | ✅ | 질문 제목. 한 줄 권장 |
| `question_md` | ✅ | 질문 본문 (Markdown). 줄바꿈/콤마/따옴표 OK — 셀 통째 자동 처리 |
| `answer_md` |  | 답변 본문 (Markdown). 비우면 `status=open` (미답변) 으로 저장 |
| `asker_name` | ✅ | 질문자 표시명. 시스템 계정이 없어도 됨 |
| `asker_email` |  | 질문자 이메일. lidam 회원이면 그 profile 에 매핑, 아니면 archive 계정 사용 |
| `answerer_name` |  | 답변자 표시명 (강사명 등) |
| `answerer_email` |  | 답변자 이메일. lidam staff 회원과 매핑 |
| `quality_grade` |  | `high` / `mid` / `low` — 답변 품질 등급 (강사 평가). 비워도 됨 |
| `asked_at` |  | 카페 원글 작성일 (`YYYY-MM-DD`). 비우면 import 시점 |
| `answered_at` |  | 답변 작성일 (`YYYY-MM-DD`). 비우면 import 시점 (답변이 있을 때) |
| `notes` |  | 카페 원글 URL · 첨부 메모 등 자유 메모. **DB 저장 X · 운영자 참고용** |

---

## `target_ref` 형식

### `article` — 조문

`{lawCode}/{articleNumber}`

- `lawCode`: `patent` · `trademark` · `design` · `civil` · `civil-procedure`
- `articleNumber`: 조 번호. 가지조는 **`29의2`** 처럼 (`28의2`, `29의3` 등)

예시:
- `patent/29`
- `patent/28의2`
- `trademark/33`
- `civil/2의2`

### `case` — 판례

사건번호 원문 그대로. 공백/구두점 정규화는 import 스크립트가 처리.

예시:
- `2019후10001`
- `2020다123456`
- `2018허5432`

### `problem` — 객관식 문제

`{lawCode}/{year}/{problemNumber}` 형식 또는 problem_id (UUID 직접).

예시:
- `patent/2020/12` — 특허법 2020년 시험의 12번 문제
- `trademark/2019/8`
- `c3a4b8e0-…` (UUID 직접)

매칭되는 문제가 시스템에 없으면 import 시 매핑 실패로 로그에 남는다. 그런 행은 `notes` 컬럼에 원본 표현(예: "특허법 99회 35번")을 적어 두면 후속 수동 매핑이 쉽다.

---

## 멀티라인 본문 — CSV 주의

- 본문에 **줄바꿈 / 콤마 / 큰따옴표** 가 포함되면 셀 전체를 큰따옴표로 감싸야 한다: `"줄1\n줄2, 줄3"`.
- 본문 안의 큰따옴표는 `""` 두 번으로 escape.
- 엑셀에서 그냥 입력하면 위 두 가지를 자동으로 처리하므로, **엑셀 → CSV UTF-8 로 저장** 하는 흐름이 가장 안전하다.

---

## 한 카페 글이 여러 답변/댓글을 가질 때

`qna_threads` 는 **1 질문 + 1 답변** 구조다. 카페 원글에 답변·댓글이 여러 개 있다면:

- 가장 중요한 답변 하나만 `answer_md` 에 채운다.
- 나머지 답변/댓글은 `answer_md` 끝에 `---` 구분선 뒤에 이어 붙이거나, `notes` 에 메모.
- 또는 같은 질문에 대해 **행을 여러 개** 만들어 각각 다른 답변을 가진 thread 로 분리해도 된다.

---

## 첨부 / 이미지

CSV 양식은 첨부 파일을 직접 옮길 수 없다. 옮길 가치가 있는 첨부는:

1. 운영자가 본인 PC 에 별도 보관
2. `notes` 컬럼에 원본 카페 URL 또는 첨부 위치 메모
3. import 후 `qna_threads` 가 만들어진 다음, 답변 본문에 storage upload 한 이미지/PDF URL 을 추가하는 방식으로 후속 보강

---

## 누가 채우면 되는가

- 원장(admin) / 강사(instructor) 권한이 있는 사람이 채운다.
- `asker_email` / `answerer_email` 은 가능하면 채워 두면 import 시 자동으로 시스템 계정에 매핑된다.
- 매핑되는 시스템 계정이 없으면 import 스크립트가 임시 archive 계정으로 묶고, 운영자가 후속으로 재할당할 수 있다.

---

## 다음 단계 — import 스크립트

이 양식이 채워지면 (또는 일부만 채워 시범 import 하고 싶으면) 알려 주세요. 다음 스크립트를 작성합니다:

- CSV 파싱 → `target_ref` → `target_id` 매핑 (article/case/problem 각각 lookup)
- `asker_email` / `answerer_email` → profile_id 매핑
- 매핑 실패 행은 별도 로그 (`qna-import-skipped.csv`) 로 남기고 성공 행만 INSERT
- 멱등성: 같은 (target_id + title + asked_at) 조합은 중복 INSERT 방지
