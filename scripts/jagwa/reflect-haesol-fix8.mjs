// 신규플래그/복수정답 교정 7건 반영 (2018지q32는 키 의심으로 제외).
// asIs: 기존 초안 그대로 승인(content_md→explanation_md). corrected: 교정 본문으로 교체.
//   node scripts/jagwa/reflect-haesol-fix8.mjs            (dry-run)
//   node scripts/jagwa/reflect-haesol-fix8.mjs --apply
import "dotenv/config";
import fs from "node:fs";
const REF = "mcgdoplovrjgklbxmozi";
const tok = process.env.SUPABASE_ACCESS_TOKEN;
const APPLY = process.argv.includes("--apply");
async function dbQuery(q) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: q }),
  });
  const t = await res.text();
  if (!res.ok) throw new Error(t);
  return JSON.parse(t);
}
const sqlStr = (s) => "'" + String(s).replace(/'/g, "''") + "'";

// 기존 초안 그대로 승인(검수상 정확 확인): 2014 물리 q7(복수정답 ③⑤), 2017 화학 q20(NMR, 스펙트럼 확증)
const asIs = [[2014, "physics", 7], [2017, "chemistry", 20]];

// 교정 본문 교체
const corrected = [
  { y: 2023, s: "chemistry", q: 16, text: `**정답: 전항정답(①②③④⑤)** · 화학(주기성)

- A는 나머지와 다른 주기 → A=Ne(2주기), B·C·D는 3주기. C⁻와 D가 등전자 → C=Cl(Cl⁻=18e⁻), D=Ar(18e⁻), 남은 B=Na. 정리: A=Ne, B=Na, C=Cl, D=Ar.
- ㄴ(참): 제1 이온화 에너지 Na(496)<Cl(1251)<Ar(1521)<Ne(2081) → B<C<D<A.
- ㄷ(거짓): 전자 1몰을 받을 때 방출하는 에너지(전자 친화도)는 Cl(약 349)>Na(약 53) → C>B인데 보기는 C<B.
- ㄱ: 'B⁺<A<D<C⁻'에서 원자/이온 반지름을 혼용해 비교한다. 이온 반지름 기준이면 성립하나, Ne·Ar의 (반데르발스) 원자 반지름을 잡으면 순서가 어긋나 비교 기준이 모호하다.
- 보기 ㄱ의 반지름 정의 모호성 때문에 공식 채점은 **전항정답**으로 처리되었다(이온 반지름 기준 표준 해석으로는 ㄱ·ㄴ 참, ㄷ 거짓 = ③).` },
  { y: 2022, s: "chemistry", q: 12, text: `**정답 ①** · 화학(반응속도론)

- 반응 A + 2B → C + 2D, 속도법칙 −d[A]/dt = k[A][B]ᵐ. [A]₀(20.0·10.0 M)가 [B](mM)보다 매우 커 [A]는 사실상 일정 → B에 대한 유사차수로 분석.
- **ㄱ (옳음)**: 1/[B]가 시간에 따라 일정하게 증가(T₁: 0.050→0.075→0.100…, 1분당 +0.025 / T₂: 0.10→0.20→0.30…, 1분당 +0.10) → 1/[B]가 직선 → B에 대해 2차 → **m = 2**.
- **ㄴ (틀림)**: −d[B]/dt = 2k[A]₀[B]²이므로 1/[B] 기울기 = 2k[A]₀. T₁: 0.025 = 2k₁·20 → k₁ = 6.25×10⁻⁴. T₂: 0.10 = 2k₂·10 → k₂ = 5.0×10⁻³. 따라서 k₂/k₁ = **8**(보기의 4가 아님).
- **ㄷ (틀림)**: C 생성속도 = k[A][B]², D 생성속도 = 2k[A][B]². **T₁ 2 min은 [B]=10.0 mM, T₂ 4 min은 [B]=2.00 mM**이다. 비 = (k₁·20.0·10.0²)/(2·k₂·10.0·2.00²) = (2000 k₁)/(80 k₂) = 25·(k₁/k₂) = **25/8**(∵ k₂/k₁=8). 보기의 25/4가 아니므로 틀림.
- 옳은 것은 ㄱ뿐 → **①**.` },
  { y: 2010, s: "earth_science", q: 32, text: `**정답 ①, ③ (복수정답)** · 지구과학(변성암·변성작용)

변성암과 형성 변성작용의 적절한 짝을 고르는 문제로, 공식 채점은 ①과 ③을 모두 정답으로 인정했다.
- **③ 대리암 - 광역변성작용 (적절)**: 석회암(또는 돌로스톤)이 변성되어 대리암이 된다. 조산대의 넓은 영역에서 일어나는 광역변성작용으로 흔히 형성되므로 적절한 짝이다.
- **① 규암 - 접촉변성작용 (적절)**: 규암은 석영질 사암이 변성된 암석으로, 마그마 관입부 주변의 접촉(열)변성으로도 형성될 수 있어 적절한 짝으로 인정된다.
- ② 규암 - 파쇄변성: 파쇄변성은 단층대의 기계적 파쇄가 주된 작용으로 규암 형성과 직접 연결되지 않아 부적절.
- ④ 편암 - 접촉변성 · ⑤ 편암 - 파쇄변성: 편암은 엽리가 발달한 대표적 **광역변성암**이라 접촉·파쇄변성과의 짝은 부적절.
- 따라서 적절한 짝은 ①과 ③.` },
  { y: 2017, s: "biology", q: 22, text: `**정답 ①** · 생물(배설 - 헨레고리와 집합관)

그림에서 좌측 U자 구조는 헨레고리, 우측 가지 친 구조는 집합관이다. (가)=하행각, (다)=상행각(바깥쪽 속질), (나)=고리 바닥(안쪽 속질), (라)=집합관 상부, (마)=집합관 하부.
- **① 옳음**: 하행각(가)은 물 투과성이 높아 **아쿠아포린을 통해 H₂O가 재흡수**된다.
- ② 틀림: 여과액 농도는 고리 바닥(나)에서 가장 높고 상행각(다)으로 갈수록 NaCl이 빠져 묽어지므로 (나) > (다)이다.
- ③ 틀림: (라)는 집합관이다. 집합관·상행각의 NaCl 재흡수는 단순 확산이 아니라 **능동수송**이므로 '확산에 의한 재흡수'는 거짓.
- ④ 틀림: 항이뇨호르몬(ADH)은 뇌하수체 **후엽**에서 분비된다(전엽 아님).
- ⑤ 틀림: 하행각은 물만 통과하고 상행각·집합관에서 NaCl이 재흡수되는 등 구간별 양상이 보기의 단순 구분과 일치하지 않는다.
- 따라서 옳은 것은 ① 하나뿐.` },
  { y: 2022, s: "earth_science", q: 37, text: `**정답 ①** · 지구과학(대기 안정도와 연기 확산형)

굴뚝 연기가 **원추형(coning)**으로 퍼지는 것은 대기가 **중립**일 때이다. 즉 환경기온감률 ≈ 건조단열감률이어서, 기온선(실선)과 건조단열선(점선)이 거의 **나란히(평행)** 그려진 그래프가 답이다.
- **① (정답)**: 실선과 점선이 거의 평행 → 중립 → 원추형(coning).
- 안정도 판정: 환경감률 < 건조단열감률 → **안정**, 환경감률 > 건조단열감률 → **불안정**, 같으면 **중립**.
- 나머지 형태와의 대응: 강한 안정(기온 역전 포함)은 **부채형(fanning)**, 불안정은 위아래로 요동치는 **환상형(looping)**, 상층 안정·하층 불안정은 **지붕형(lofting)**, 그 반대는 **훈증형(fumigation)**이다. 원추형(중립)에 해당하는 ①만 옳다.` },
];

async function pid(y, s, q) {
  const r = await dbQuery(`select problem_id from problems where year=${y} and science_subject='${s}' and problem_number=${q};`);
  return r[0]?.problem_id;
}

const plan = [];
for (const [y, s, q] of asIs) plan.push({ y, s, q, mode: "asIs", pid: await pid(y, s, q) });
for (const c of corrected) plan.push({ ...c, mode: "corrected", pid: await pid(c.y, c.s, c.q) });

console.log("반영 계획:");
for (const p of plan) console.log(`  ${p.y} ${p.s} q${p.q} [${p.mode}] ${p.pid ? "ok" : "✗ pid없음"}`);
if (plan.some((p) => !p.pid)) throw new Error("pid 누락");

if (!APPLY) { console.log("\n[dry-run] DB 무변경. 반영하려면 --apply"); }
else {
  const allIds = plan.map((p) => `'${p.pid}'`).join(",");
  const bk = await dbQuery(`select problem_id, explanation_md from problems where problem_id in (${allIds});`);
  fs.writeFileSync("tmp/jagwa/approve-backups/backup-fix8-20260616.json", JSON.stringify(bk, null, 2), "utf8");
  console.log(`백업: tmp/jagwa/approve-backups/backup-fix8-20260616.json (${bk.length}행)`);
  for (const p of plan) {
    if (p.mode === "asIs") {
      await dbQuery(`begin;
        update public.problems set explanation_md = (select content_md from public.problem_explanation_drafts where problem_id='${p.pid}'), updated_at=now() where problem_id='${p.pid}';
        update public.problem_explanation_drafts set status='approved', reviewed_at=now() where problem_id='${p.pid}';
        commit;`);
    } else {
      const md = sqlStr(p.text);
      await dbQuery(`begin;
        update public.problem_explanation_drafts set content_md=${md}, status='approved', reviewed_at=now() where problem_id='${p.pid}';
        update public.problems set explanation_md=${md}, updated_at=now() where problem_id='${p.pid}';
        commit;`);
    }
  }
  console.log(`✅ 반영 완료: ${plan.length}건 (asIs ${asIs.length} + 교정 ${corrected.length}). 정답키·본문(문제) 무변경.`);
}
