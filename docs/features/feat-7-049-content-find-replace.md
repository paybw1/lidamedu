# feat-7-049 — 본문 찾아 고치기 (운영자)

`/admin/tools/find-replace` · staff(instructor·admin) 전용

## 왜

같은 오기가 여러 콘텐츠에 흩어져 있는 일이 반복된다. 최근만 해도 판례해설 인용
호수 밀림, 저자 `윤태`→`윤태식`, `상표법 제7조`→`제73조`. 지금까지는 매번 스크립트를
새로 짜서 고쳤는데, 그건 운영자가 스스로 할 수 없고 되돌리기도 각자 다르다.

찾고 → 무엇이 바뀌는지 보고 → 고를 것만 고치고 → 되돌릴 수 있는 경로를 하나 만든다.

## 하지 않는 것 (의도적 제외)

| 대상 | 이유 |
|---|---|
| **법령 조문**(`articles`) | 조문은 읽기 전용 불변. 개정 흐름(`article_revision`)으로만 바뀐다 |
| 판례 **식별 필드**(`case_number`·`court`·`decided_at`) | 판례를 특정하는 축. 잘못 건드리면 인용·연결이 통째로 깨진다 |
| **2차 모범답안·채점기준**(`model_answer_md`·`grading_rubric_md`·`rubric_items`) | 별도 감사 파이프라인(`audit-essay-answers.mjs`)을 반드시 거쳐야 하는 콘텐츠. 일반 치환 경로를 열면 그 게이트를 우회하게 된다 |
| 문제 **발문**(`body_md`) | 정답·해설과 세트로 검증돼야 한다. 해설만 연다 |
| **정규식** | 오폭이 크고 미리보기로 예측하기 어렵다. 문자열 그대로만 찾는다 |

## 대상 필드 (SSOT: `app/features/admin/lib/find-replace-targets.ts`)

| 종류 | 테이블 | 필드 |
|---|---|---|
| 판례 | `cases` | `summary_title` · `summary_body_md` · `reasoning_md` · `comment_body_md` · `related_md` · `summary_items`(jsonb: title·body·commentMd) · `book_sections`(jsonb: text) |
| 판례 배치 | `case_systematic_links` | `book_sections`(jsonb: text) — ★`is_primary=false` 만 |
| 참고문헌 | `case_references` | `title` · `authors` · `source` · `note` |
| 문제 해설 | `problems` | `explanation_md` |

- ★`summary_items` 를 빼면 안 된다. 뷰어는 `summary_items` 가 있으면 그걸 그리고
  `summary_body_md` 는 폴백이다(`case-body.tsx`). `summary_body_md` 만 고치면
  "고쳤는데 화면이 그대로"가 된다.
- ★`book_sections` 의 jsonb 순회는 **키 화이트리스트**다(`text` 만). 문자열을 전부
  훑으면 `key`·`kind`·`type` 같은 구조 키와 이미지 URL까지 바뀐다.
- ★대표 배치(`is_primary`)의 `book_sections` 는 `cases.book_sections` 의 사본이다
  (`api/admin/case.tsx` 가 저장 때마다 미러링). 스캔에서 빼고, `cases` 를 고칠 때
  같은 트랜잭션 흐름에서 대표 링크도 함께 갱신한다. 안 그러면 미리보기에 같은 자리가
  두 번 나오고, 한쪽만 고치면 두 사본이 갈라진다.

## 흐름

1. **찾기** — 검색어 + 대상 종류 체크. `find_content_matches(term, limit)` RPC 가
   DB 안에서 스캔(`strpos` — 와일드카드 이스케이프 불필요, 대소문자 구분)하고
   (종류·id·필드)만 돌려준다. 본문은 걸린 행만 다시 읽어 맥락을 만든다.
   - jsonb 를 앱으로 끌어와 훑으면 안 된다 — `book_sections` 를 단 1000행만 받아도
     `fetch failed` 가 난다(실측).
2. **미리보기** — (대상, 필드)마다 한 줄. 그 필드 안 등장 횟수, 앞뒤 30자 맥락,
   바뀐 뒤 모습, 해당 화면 링크.
3. **선택 적용** — 체크한 줄만. 필드 안 등장은 전부 바꾼다. 상한 200건.
   - ★적용 시점에 **현재 값을 다시 읽는다**. 미리보기 이후 누가 고쳤을 수 있으므로,
     검색어가 사라졌으면 건너뛰고 그 사실을 보고한다.
4. **되돌리기** — 한 번의 적용 = 한 `batch_id`. 되돌릴 때도 현재 값이 적용 직후 값과
   같을 때만 되돌린다(그 뒤 누가 또 고쳤으면 건너뜀).

## 테이블

```sql
create table public.content_edit_logs (
  log_id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  entity_type text not null,   -- case | case_placement | case_reference | problem
  entity_id uuid not null,
  field text not null,
  before_value jsonb not null, -- 텍스트도 jsonb 문자열로. 원값 타입을 잃지 않는다
  after_value jsonb not null,
  search_term text not null,
  replace_term text not null,
  occurrences integer not null default 1,
  created_by uuid references public.profiles(profile_id),
  created_at timestamptz not null default now(),
  reverted_at timestamptz,
  reverted_by uuid references public.profiles(profile_id)
);
```

RLS: staff 만 select/insert/update. 쓰기는 **요청 클라이언트**로 — action 게이트와
RLS 양쪽에서 막는다(adminClient 금지).

## 권한

`getStaffRole` 로 loader·action 양쪽에서 확인. 화면 노출(운영관리 사이드바
「데이터 점검」)은 편의일 뿐이고 실제 방어는 서버다.
