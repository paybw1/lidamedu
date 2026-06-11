// 파일럿 검증: 2010 물리 1~10번 AI 해설을 pending 초안으로 적재 (게이트 확인용).
// 운영 explanation_md 는 건드리지 않는다 → 학생 비노출 유지. 승인 시에만 복사된다.
import { adminClient } from "./db.mjs";

const sb = adminClient();
const MODEL = "claude-opus-4-8";

const HAESOL = {
  1: { ans: "①", md: `**정답 ①** · 역학(일·에너지)

- 마찰이 없으므로 알짜힘은 *F* 뿐 → 등가속도, *a* = *F*/*m*.
- 정지(*v*₀=0)에서 *t*₁초 동안 이동거리: *s* = ½*at*₁² = *Ft*₁²/(2*m*).
- 힘이 한 일: *W* = *Fs* = **F²t₁²/(2m)**.
- (검산·일–운동에너지 정리) *v* = *at*₁ = *Ft*₁/*m* → *W* = ½*mv*² = *F²t₁²/(2m)*. 동일.` },
  2: { ans: "④", md: `**정답 ④** · 역학(회전운동·관성모멘트)

- 세 물체 모두 같은 크기 *F*를 같은 팔길이 *R*에 접선으로 작용 → 돌림힘 τ = *FR* 동일.
- 각가속도 α = τ/*I* 이므로 *I*(관성모멘트)가 클수록 α는 작다.
- 면에 수직한 중심축 기준: 원판 *I*=½*MR²*(0.5), 원형고리 *I*=*MR²*(1.0), 속이 찬 구 *I*=⅖*MR²*(0.4).
- *I*: 원형고리>원판>속이 찬 구 → α는 역순.
- ∴ α: **원형고리 < 원판 < 속이 찬 구** = ④.` },
  3: { ans: "①", md: `**정답 ①** · 전자기(전자기 유도)

- 사각 도선은 영역에 **들어갈 때·나갈 때만** 관통 자속이 변해 유도전류가 흐르고, 렌츠 법칙에 따라 운동을 방해(감속)한다.
- 도선 폭 *D* < 영역 폭 2*D* 이므로 **완전히 내부에 머무는 구간**이 존재 → 그동안 자속 일정 → 유도전류 0 → 등속.
- 따라서 *v*: 등속 → (진입)감속 → 등속 → (탈출)감속 → 등속 의 **2단 계단형 감소** = ①.` },
  4: { ans: "⑤", md: `**정답 ⑤** · 전자기(도체 표면의 전기장)

- 정전 평형 도체 표면 바로 바깥의 전기장은 **표면에 수직**, 크기 **σ/ε₀**(가우스 법칙).
- ∴ 방향: 표면에 수직, 크기: σ/ε₀ = ⑤.
- 함정: σ/(2ε₀)(④)는 *무한 대전 평면*(양쪽으로 장 형성) 값이고, 도체는 장이 바깥에만 있어 2배인 σ/ε₀. 평형 도체는 접선 성분 0이라 "표면과 나란한 방향"(①·②)은 오답.` },
  5: { ans: "③", md: `**정답 ③** · 전자기(직류 회로)

- 저항 *R* 인 두 도선 A, B를 **병렬** 연결 후 양단에 *V* → 각 가지 전압은 그대로 *V*.
- A에 흐르는 전류 *I*_A = *V*/*R*_A = **V/R** = ③.` },
  6: { ans: "②", md: `**정답 ②** · 열·물성(밀도의 온도 의존)

- 같은 부피 *V* = 5×10⁴ cm³ 주유 시, 온도가 달라지면 밀도가 달라 질량차 발생.
- 일교차 Δ*T* = 10 K 의 밀도차: Δρ = |기울기|·Δ*T* = 1.6×10⁻³ × 10 = 1.6×10⁻² g/cm³.
- 최대 질량차: Δ*m* = *V*·Δρ = 5×10⁴ × 1.6×10⁻² = 800 g = **0.8 kg** = ②.` },
  7: { ans: "②", md: `**정답 ②** · 파동(가시광선의 진동수)

- 가시광선 파장 ≈ 400~700 nm, *f* = *c*/λ.
- λ = 500 nm → *f* = 3×10⁸ / 5×10⁻⁷ = 6×10¹⁴ Hz (범위 ≈ 4.3~7.5×10¹⁴ Hz).
- ∴ **6.0×10¹⁴ Hz** = ②. (①은 자외선, ③·④는 적외선 영역.)` },
  8: { ans: "④", md: `**정답 ④** · 양자(광자 에너지)

- 광자 1개의 에너지 *E* = *hc*/λ ∝ 1/λ.
- *E*_A/*E*_B = λ_B/λ_A = 1250/625 = **2** = ④.` },
  9: { ans: "②", md: `**정답 ②** · 양자(드브로이 물질파)

- 정지 전자를 *V* 로 가속: *eV* = *p*²/(2*m*) → *p* = √(2*meV*).
- λ = *h*/*p* = *h*/√(2*meV*) ∝ 1/√*V*.
- 전압 2배(2*V*) → λ′ = **λ/√2** = ②.` },
  10: { ans: "③", md: `**정답 ③** · 양자(1차원 무한 퍼텐셜 우물)

- 바닥상태(n=1) 에너지: *E*₁ = *h*²/(8*mL*²).
- = (6.6×10⁻³⁴)² / [8 × 9.1×10⁻³¹ × (1.0×10⁻¹⁰)²] = 4.356×10⁻⁶⁷ / 7.28×10⁻⁵⁰ ≈ 5.98×10⁻¹⁸ J.
- eV 환산: ÷ 1.6×10⁻¹⁹ ≈ 37 eV ≈ **3.8×10¹ eV** = ③.` },
};

const { data: probs, error: pe } = await sb.from("problems")
  .select("problem_id, problem_number")
  .eq("year", 2010).eq("subject_type", "science").eq("origin", "past_exam")
  .eq("exam_round", "first").eq("science_subject", "physics");
if (pe) throw pe;
const byNum = new Map(probs.map((p) => [p.problem_number, p.problem_id]));

let ok = 0;
for (const [num, h] of Object.entries(HAESOL)) {
  const pid = byNum.get(Number(num));
  if (!pid) { console.log(`no problem for #${num}`); continue; }
  const { error } = await sb.from("problem_explanation_drafts").upsert(
    { problem_id: pid, content_md: h.md, ai_answer: h.ans, answer_match: true, model: MODEL, status: "pending" },
    { onConflict: "problem_id" },
  );
  if (error) { console.log(`#${num}: ${error.message}`); continue; }
  ok++;
}
console.log(`seeded pending drafts: ${ok}/10`);

// 게이트 확인: 이 문제들의 explanation_md 는 여전히 null 이어야 한다(학생 비노출).
const { data: chk } = await sb.from("problems")
  .select("problem_number, explanation_md").in("problem_id", [...byNum.values()]).order("problem_number");
console.log("explanation_md (null=게이트 유지):", chk.map((c) => `${c.problem_number}:${c.explanation_md === null ? "null" : "SET"}`).join(" "));
const { count } = await sb.from("problem_explanation_drafts").select("draft_id", { count: "exact", head: true }).eq("status", "pending");
console.log(`pending drafts in table: ${count}`);
