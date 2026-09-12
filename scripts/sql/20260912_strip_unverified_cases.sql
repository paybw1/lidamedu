-- 확인되지 않는 사건번호 5종 제거 — 번호만 빼고 법리는 그대로 둔다(CLAUDE.md 12).
--
-- 원장 판단 2026-09-12: 교재 미적재 과목이라도 **casenote 에서 검색되지 않으면 없는 것**.
-- 5종 모두 라이브 재조회에서 casenote·국가법령정보센터 둘 다 없음, 우리 DB에도 없음.
--
-- ★유보 기록 — 이 규칙에는 반례가 있다. 2017다245789 는 두 소스 모두 없었으나
--   리담특허법 제25판이 선고일과 함께 인용하고 있어 실재로 확정됐다(같은 날 확인).
--   상표·디자인·민법 교재를 content_chunks 에 적재하면 이 5종도 같은 방식으로
--   되살릴 수 있다. 아래는 번호만 지우고 법리 문장은 남기므로 복원이 쉽다.
--
-- 백업: scripts/backups/20260912_strip5_before.json

-- ① P-9698 (민소법 2차) 채점기준 — 판례 나열에서 빼기
update public.problems
   set grading_rubric_md = replace(grading_rubric_md, '(2013다30301, 2011다108085)', '(2013다30301)'),
       updated_at = now()
 where display_no = 9698 and deleted_at is null
   and grading_rubric_md like '%(2013다30301, 2011다108085)%';

-- ② P-8971 (민법 1차) 해설 각주 — 항목 하나 제거
update public.problems
   set explanation_md = replace(explanation_md, ' · 대법원 2011. 6. 30. 선고 2011다15469', ''),
       updated_at = now()
 where display_no = 8971 and deleted_at is null
   and explanation_md like '% · 대법원 2011. 6. 30. 선고 2011다15469%';

-- ③ P-9768 (디자인 2차) 채점기준 — 판례 나열에서 빼기
update public.problems
   set grading_rubric_md = replace(grading_rubric_md, '대법원 2010후913, 2011후2737, 2016후1710 등', '대법원 2010후913, 2016후1710 등'),
       updated_at = now()
 where display_no = 9768 and deleted_at is null
   and grading_rubric_md like '%대법원 2010후913, 2011후2737, 2016후1710 등%';

-- ④ P-9768 모범답안 — 공지부분 법리의 괄호 인용 제거
update public.problems
   set model_answer_md = replace(model_answer_md, '권리범위에 속하지 않는다(대법원 2011후2737).', '권리범위에 속하지 않는다.'),
       updated_at = now()
 where display_no = 9768 and deleted_at is null
   and model_answer_md like '%권리범위에 속하지 않는다(대법원 2011후2737).%';

-- ⑤ P-9768 모범답안 — 요부관찰 법리의 괄호 인용 제거
update public.problems
   set model_answer_md = replace(model_answer_md, '판시(대법원 2011후3727 등)하여', '판시하여'),
       updated_at = now()
 where display_no = 9768 and deleted_at is null
   and model_answer_md like '%판시(대법원 2011후3727 등)하여%';

-- ⑥ P-9646 (상표 2차) 모범답안 — 상호 보통사용 판단기준의 괄호 인용 제거
update public.problems
   set model_answer_md = replace(model_answer_md, '표시된 것인지 판단한다(대법원 2021다257968 등).', '표시된 것인지 판단한다.'),
       updated_at = now()
 where display_no = 9646 and deleted_at is null
   and model_answer_md like '%표시된 것인지 판단한다(대법원 2021다257968 등).%';
