-- 55c2484c: 청구범위(청구항1~3, box_items)를 발문 중 '아래와 같이 청구범위를 기재' 다음,
-- 질문 위에 case-box 목록으로 이동. box_items 는 본문에 들어갔으므로 제거(이중 렌더 방지).
-- 시도 0건 확인 후 삭제. 선지 ①~⑤(정답 ①)는 그대로.
update public.problems
set
  body_md = $md$甲은 아래와 같이 청구범위를 기재하여 특허출원하고 특허등록을 받았다.

<div class="case-box">
<strong>[청구항1]</strong> A+B로 구성된 것을 특징으로 하는 물건 X<br>
<strong>[청구항2]</strong> 제1항에 있어서, C를 더 포함하는 것을 특징으로 하는 물건 X<br>
<strong>[청구항3]</strong> 제1항에 있어서, D를 더 포함하는 것을 특징으로 하는 물건 X
</div>

그런데 乙은 청구항 1과 청구항2가 진보성이 없다는 이유로 무효심판을 청구하였다. 다음 각 설명 중 옳은 것은? (각 지문은 독립적이며, 견해대립이 있는 경우에는 判例에 따라 판단하시오.)$md$,
  updated_at = now()
where problem_id = '55c2484c-4ce0-45f0-b343-a1d870035fd0';

delete from public.problem_box_items
where problem_id = '55c2484c-4ce0-45f0-b343-a1d870035fd0';
