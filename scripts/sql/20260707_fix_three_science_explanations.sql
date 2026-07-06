-- 자과 해설 불일치 3건 확정 — 사용자 제공 원본 해설(source/) 기반으로 운영자 확정.
-- approve_explanation_draft RPC 와 동일 효과(드래프트 승인 + problems.explanation_md 복사)를
-- 관리 API 경유로 직접 수행(auth.uid() 부재로 RPC 직접 호출 불가).

with author as (
  select profile_id from profiles where role = 'admin' and name = '임병웅' limit 1
),
fixes(problem_id, md) as (values

('dd113dc1-68da-4b20-9972-bf47c39a4b92'::uuid, $md$**정답 ④** · 물리(강체의 회전 - 도르래의 등각가속도)

- 도르래(I = 3 kg·m², R = 0.6 m)를 크기 mg = 5×10 = 50 N 의 일정한 힘으로 잡아당겨 회전시키는 것으로 본다(출제 의도).
- 회전 운동 방정식 Iα = RT 에 T = 50 N 대입: 3α = 0.6 × 50 = 30 → α = 10 rad/s².
- 도르래가 10회전 하면 각변위 θ = 2π × 10 = 20π rad.
- 등각가속도 공식 θ = ω₀t + ½αt² (ω₀ = 0): 20π = ½ × 10 × t² → t² = 4π → t = 2√π 초 → ④.
- (참고) 물체가 줄에 매달려 함께 가속되는 것으로 엄밀히 풀면 장력이 T = Ia/R² 로 줄어 a = mg/(m + I/R²) = 15/4 m/s², t = √(32π/5) ≈ 2.52√π 초가 되어 선지에 없다. 확정 정답(④) 기준으로는 위와 같이 도르래를 일정한 힘 mg 로 당기는 해석이 출제 의도다.$md$),

('597bfd73-5dcc-4671-a8a3-3fe9b7c3b7d4'::uuid, $md$**정답 ⑤** · 물리(물체계의 운동 - 경사면과 운동마찰)

- 경사면(30°) 위의 A(질량 4m)와 줄로 연결되어 연직으로 매달린 B(질량 m)는 같은 크기의 속도·가속도를 갖는 물체계 — 하나의 물체로 보고 운동 방정식(F = ma)을 세운다.
- A 가 받는 수직항력 N = 4mg·cos30° = 2√3mg.
- 운동마찰력 f = μₖN = 2√3μₖmg.
- 물체계가 등속운동하므로 받는 알짜힘은 0: 4mg·sin30° + mg = f → 2mg + mg = 3mg = 2√3μₖmg.
- 따라서 μₖ = 3/(2√3) = √3/2 → ⑤.$md$),

('bebac816-daab-4439-8710-b594b48c2c43'::uuid, $md$**정답 ⑤** · 지구과학(마그마의 화학 조성)

- SiO₂ 함량 기준: 현무암질 52% 이하 · 안산암질 52~63% · 유문암질 63% 이상.
- 그림에서 SiO₂ 비율이 가장 작은 A = 현무암질, 중간인 B = 안산암질, 가장 큰 C = 유문암질 마그마다.
- ㄱ. (×) 현무암질(A) 마그마는 온도가 가장 **높다**. 온도가 가장 낮은 것은 유문암질(C)이다.
- ㄴ. (○) B 는 안산암질 마그마다.
- ㄷ. (○) SiO₂ 함량이 많을수록 점성이 커지므로 C(유문암질)의 점성이 가장 높다.
- 옳은 것은 ㄴ, ㄷ → ⑤.$md$)

),
upd_drafts as (
  update problem_explanation_drafts d
  set content_md = f.md,
      answer_match = true,
      status = 'approved',
      note = '운영자 확정 해설로 교체(원본 교재/공식 해설 반영, 2026-07-06)',
      reviewed_at = now(),
      reviewed_by = (select profile_id from author)
  from fixes f
  where d.problem_id = f.problem_id and d.status = 'pending'
  returning d.problem_id
)
update problems p
set explanation_md = f.md, updated_at = now()
from fixes f
where p.problem_id = f.problem_id;
