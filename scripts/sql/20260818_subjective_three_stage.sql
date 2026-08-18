-- 2차 주관식 학습 재편 (feat-2-032 개편, 2026-08-18)
--   2차는 오프라인 지필 시험이라 온라인에서 완성 답안을 타이핑하는 훈련은 효용이 낮다.
--   대신 ① 논점 추출 ② 목차 구성 ③ 사안의 포섭·결론 3단계로 나눠 훈련한다.
--   이 3단계는 AI 채점 3축(논점 40 / 목차·구성 25 / 논증 35)과 1:1 로 대응한다.
--
--   자기채점(self_score·self_score_note·submitted_at·rubric_self_check)과
--   강사 첨삭(review_*)은 화면·API 에서 걷어내지만 **컬럼은 남긴다** —
--   사용자 학습 데이터는 삭제하지 않는다(CLAUDE.md Non-negotiable 9).

alter table public.user_subjective_attempts
  add column if not exists issues_md   text not null default '',
  add column if not exists outline_md  text not null default '',
  add column if not exists analysis_md text not null default '';

comment on column public.user_subjective_attempts.issues_md is
  '① 논점 추출 — 설문에서 뽑아낸 쟁점. AI 채점 issue 축의 입력.';
comment on column public.user_subjective_attempts.outline_md is
  '② 목차 구성 — 답안 목차·소제목·배점 배분. AI 채점 structure 축의 입력.';
comment on column public.user_subjective_attempts.analysis_md is
  '③ 사안의 포섭·결론 — 조문·판례를 사안에 적용하고 결론까지. AI 채점 writing 축의 입력.';

-- answer_md 는 NOT NULL 인데 새 경로가 더는 쓰지 않는다 → 기본값이 없으면 신규 insert 가 깨진다.
alter table public.user_subjective_attempts
  alter column answer_md set default '';

comment on column public.user_subjective_attempts.answer_md is
  '(2026-08-18 이후 미사용) 완성 답안 전문. 3단계 재편 전 작성분 보존용 — 새 경로는 쓰지 않는다.';
comment on column public.user_subjective_attempts.self_score is
  '(2026-08-18 이후 미사용) 자기채점 점수. 자기채점 제거로 화면·API 에서 걷어냄, 기존 기록 보존.';
comment on column public.user_subjective_attempts.self_score_note is
  '(2026-08-18 이후 미사용) 자기채점 메모. 위와 동일.';
comment on column public.user_subjective_attempts.rubric_self_check is
  '(2026-08-18 이후 미사용) 채점 체크리스트 체크 인덱스. 자기채점 도구라 함께 제거.';
comment on column public.user_subjective_attempts.review_requested_at is
  '(2026-08-18 이후 미사용) 강사 첨삭 요청 시각. 기출 경로 첨삭 폐지 — GS(2차 모의고사) 채점은 별개 시스템으로 유지.';

-- 기존 답안은 ③ 칸으로 옮겨 이어서 쓸 수 있게 한다(원본은 answer_md 에 그대로 남는다).
update public.user_subjective_attempts
   set analysis_md = answer_md
 where analysis_md = ''
   and coalesce(answer_md, '') <> '';

select
  count(*)                                             as rows_total,
  count(*) filter (where analysis_md <> '')            as with_analysis,
  count(*) filter (where issues_md   <> '')            as with_issues,
  count(*) filter (where outline_md  <> '')            as with_outline,
  count(*) filter (where deleted_at is null)           as alive
from public.user_subjective_attempts;
