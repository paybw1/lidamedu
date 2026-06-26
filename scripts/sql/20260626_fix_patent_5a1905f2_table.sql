-- 특허 mc_box 문제(5a1905f2) 본문 표 복원. HWPX 적재 시 표가 한 줄로 평탄화돼
-- 가독 불가 → 원문 내용 그대로(추가/삭제 없음) HTML 표 2개로 구조화.
--   표1: 사실관계→최초거절→최초보정→최후거절 진행
--   표2: 최후보정 후 명세서 보기 ㉠㉡㉢㉣ (선택지 ①~⑤가 참조)
update public.problems
set
  body_md = $md$다음 표를 참고하여 지문 중 옳은 것을 고르시오.

<table>
<thead><tr><th>단계</th><th>내용</th></tr></thead>
<tbody>
<tr><td>사실관계</td><td>청구항 1 : A+B로 이루어진 장치<br>청구항 2 : A+B+C로 이루어진 장치</td></tr>
<tr><td>최초거절이유통지</td><td>청구항 1은 인용발명에 의해 진보성 없음</td></tr>
<tr><td>최초보정 후의 명세서</td><td>청구항 1 : A+B+D로 이루어진 장치<br>청구항 2 : A+B+C로 이루어진 장치</td></tr>
<tr><td>최후거절이유통지</td><td>청구항 1의 D는 신규사항임</td></tr>
</tbody>
</table>

<table>
<thead><tr><th>최후보정 후의 명세서</th><th>청구항 1</th><th>청구항 2</th></tr></thead>
<tbody>
<tr><td>㉠</td><td>A+B로 이루어진 장치</td><td>A+B+C로 이루어진 장치</td></tr>
<tr><td>㉡</td><td>A+b로 이루어진 장치 (b는 B의 하위개념, 진보성은 인정됨)</td><td>A+b+C로 이루어진 장치</td></tr>
<tr><td>㉢</td><td>삭제</td><td>A+B+C로 이루어진 장치</td></tr>
<tr><td>㉣</td><td>A+B+E로 이루어진 장치 (A+B+E는 최초 명세서 등의 범위 내이고 진보성은 인정됨)</td><td>A+B+C+F로 이루어진 장치 (F는 최초 명세서 등의 범위 밖의 사항)</td></tr>
</tbody>
</table>$md$,
  updated_at = now()
where problem_id = '5a1905f2-aab5-495b-b62d-8ebacb21a959';
