# feat-2-028 — 2차 전환 사다리: 기출 기반 쟁점·결론·목차 훈련

> 상태: 설계(사용자 검토 대기) · 2026-07-07
> 배경 논의: 눈공부(1차 재인)→손공부(2차 산출) 전환 지원 방향 설계

## 1. 문제

변리사 2차는 발문에서 쟁점을 파악하고 결론을 도출한 뒤 목차를 잡아 답안을 산출해야
한다. 대부분의 수험생이 "눈으로 하는 공부"(재인)에서 "손으로 하는 공부"(산출)로의
전환에 실패하는데, 원인은 의지가 아니라 **중간 계단의 부재**다 — 쟁점 고르기에서
2시간 전문 작성으로 바로 점프하면 인지 부하가 한계를 넘어 회피가 일어난다.

## 2. 진단 (2026-07-07 운영 DB 실측)

| 자산 | 구현 | 콘텐츠/사용 |
|---|---|---|
| 쟁점추출 공통 모듈(`features/issue-extraction`) | ✅ ①쟁점추출 → ③결론 → ④응용목차(outlineMd·강약) phase machine + 자가채점 + AI 분석 | — |
| 판례 기반 훈련(`/case-training`, `case_training_*`) | ✅ 학생 응시 + 강사 저작 + AI 초안(draft-ai) + 승인 큐 | **items 2건·승인 0·시도 0** |
| GS 논점 훈련(`/gs/issues`) | ✅ | **기준(gs_question_issues) 0건·시도 0** |
| GS 전문 작성·채점·피어리뷰 | ✅ | questions 8·submissions 4 |
| 2차 기출 | ✅ 뷰어(`/latest/essay`)+채점평 | **192문항 — 훈련 미연결** |

**결론: 사다리 기능(L3~L5)은 이미 완비. 병목은 (a) 훈련 기준 콘텐츠 저작이 비어
있고 (b) 실전 전이에 가장 좋은 재료인 2차 기출 192문항이 열람 전용으로만 있다는 것.**
새 트레이너 신설은 오답 — 기존 트랙에 기출을 태우고 콘텐츠 파이프라인을 채우는 것이
정답이다(Judgment: 통합 우선·뮤테이션 경로 동결).

## 3. 설계

### 3.1 데이터 — case_training 트랙의 소스 확장 (판례 XOR 기출 문항)

```sql
alter table case_training_items
  alter column case_id drop not null,
  add column problem_id uuid references problems(problem_id),
  add constraint case_training_items_source_xor
    check ((case_id is null) <> (problem_id is null));
```

- 판례 소스: 기존 그대로(사실관계 요약 facts_summary_md에서 출발).
- **기출 소스: 발문(problems.body_md)이 곧 지문** — facts_summary_md 불필요(빈 값 허용).
- 쟁점(case_training_issues)·시도(case_issue_attempts/case_conclusion_attempts)·승인
  (review_status)·RLS 전부 무변경 재사용.

### 3.2 운영자 — 저작·AI 초안·승인

- 저작 화면: 소스 선택(판례 피커 | 2차 기출 문항 피커). 기출은 과목·연도·문항 선택.
- AI 초안(draft-ai) 확장: 기출 소스일 때 입력 = 발문 + 해설/채점평(있으면) →
  쟁점 목록·모범 결론·권장 강약 초안. 기존 GS 비용 가드(usage-tracker) 재사용.
- 승인 큐: 기존 review_status 흐름 그대로. **AI 초안은 자동 노출 금지, 승인 후 학생
  노출**(ox-article-matching과 동일 원칙).

### 3.3 학생 — 응시·진입점

- `/case-training` 목록: 소스 배지(판례/기출 N년 #n) + 과목 필터. nav 라벨
  "판례 쟁점훈련" → **"쟁점·목차 훈련"**.
- 응시 화면(take·conclusion): 기출 소스면 발문을 지문으로 렌더(판례 사실관계 자리).
  ① 쟁점추출(발문 읽고 쟁점 뽑기) → ③ 결론 → ④ 목차·강약 — 기존 phase 그대로.
- ④ 목차 단계에 **권장 제한시간 타이머**(기본 15분, 소프트 — 초과 시 표시만).
  실전(2시간 전문 작성)은 기존 GS가 담당, 여기는 그 전 단계.

### 3.4 콘텐츠 파이프라인 (이 기능의 본체)

특허 2차 기출(채점평 부착 2010~2017 우선)부터: AI 초안 대량 생성 → 원장 승인 큐 →
학생 노출. 목표: 초기 30문항 승인(사다리 체감에 충분한 최소량) → 반응 보고 확대.

### 3.5 지표 (Stage 3)

`/study/stats` 2차 통계에 훈련 시도·쟁점 커버리지(hit율)·목차 완주 수 합류 —
"손공부가 보이는" 첫 지표. 마스터리·약점진단 연계는 후속.

## 4. 단계 (하드 스톱)

- **Stage 1**: DB 확장 + 운영자 저작(기출 피커·AI 초안·승인) — 학생 무영향.
- **Stage 2**: 학생 응시 기출 소스 지원 + 목록·nav 정비 + ④ 타이머.
- **Stage 3**: 특허 2차 AI 초안 대량 생성·승인 큐 채우기 + /study/stats 지표 합류.

## 5. 비범위 (YAGNI — 별도 feat로)

- 단문 쓰기 트레이너(P0-①, 키워드 커버리지 자동 채점) — 다음 feat.
- 백지 체계도 복기, 재작성 루프, 손글씨 사진 첨삭, 페이딩 재도전.
- GS 논점(gs_question_issues) 콘텐츠 채우기 — GS 회차 운영과 함께.
