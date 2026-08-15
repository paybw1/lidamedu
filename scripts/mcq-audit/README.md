# scripts/mcq-audit — 객관식 정답키·선지해설 전수 대조

원본 해설편(`source/_converted/answer.json`·`expected-answers.json`)에서 `(장, 단원, 문항번호) → {정답, 선지별 해설}` 을 만들어
운영 DB 와 대조한다. **정답만 보면 해설 오배정을 못 잡기 때문에 둘을 함께** 본다.

왜 필요한지(사고 경위·근본 원인)는 `docs/audits/2026-08-15-patent-mcq-answer-audit.md`.

## 사용

```bash
node scripts/mcq-audit/audit.mjs            # 전수 대조 → scripts/mcq-audit/audit-result.json
node scripts/mcq-audit/compare.mjs 6061 …   # 특정 문항 원본 vs DB 나란히 보기
node scripts/mcq-audit/apply-fixes.mjs      # 정정 dry-run (--apply 로 반영)
node scripts/mcq-audit/fix-ox-truth.mjs     # 정답 정정 후 ox_truth 재산출 (--apply)
node scripts/mcq-audit/regrade.mjs          # 정답 바뀐 문항의 과거 풀이 재채점 (--apply)
```

DB 접근은 `.env` 의 `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` 를 쓴다. 반영 전 값은 `backups/` 에 남는다.

## 읽을 때 주의할 것

- **페이징 필수** — `publication_content_map` 은 1,100행이 넘어 PostgREST 기본 상한(1000)에 걸린다. 안 하면 조용히 잘린다.
- **오탐 1순위** — 교재 해설 앞머리의 `✕, ` `○, ` `는 `(선지마커 뒤 조사 잔재)는 DB 에 없다. `norm()` 이 이걸 걷어낸다.
- **교재가 구 조문번호를 쓰는 경우가 있다** — 예: `法 146의2` → 현행 `158의2`(적시제출주의). 이건 DB 가 옳으니 되돌리지 말 것.
- **`mc_box`(보기묶음형)는 선지별 해설이 없다** — 자동 대조 대상이 아니므로 정답만 `(단원, 번호)` 로 따로 확인해야 한다.
- **해설 앵커링의 한계** — 해설이 통째로 남의 것이면 그 남의 엔트리에 붙어 정상처럼 보인다. 그래서 앵커된 단원이 DB 단원과 다른 건을 따로 출력한다.
- **정답을 고치면 `ox_truth` 도 재산출** — 정오문제 표면이 별도 컬럼을 쓴다. 규칙 SSOT 는 `app/features/problems/lib/auto-ox.ts`.

## 미적용 범위

`mc_box` 의 box_item 해설, `problems.explanation_md`(문제 단위 해설·표), 그리고 **상표·디자인·민법**(같은 파서 계열이라 동일 위험).
