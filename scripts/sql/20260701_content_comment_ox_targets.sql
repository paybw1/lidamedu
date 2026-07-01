-- feat: 정오문제(OX 지문)를 코멘트(content_comments) 대상으로 지원.
-- 정오문제 = problem_choice / problem_box_item. "지문 전체에 대한 의견" 이므로
-- 포스트잇(문구 앵커)이 아니라 코멘트(전체 대상)로 취급한다.
-- content_comments RLS 는 작성자 기준(author_id / is_staff)이라 새 대상에 자동 적용 → RLS 추가 불필요.

alter type public.content_comment_target_type add value if not exists 'problem_choice';
alter type public.content_comment_target_type add value if not exists 'problem_box_item';
