// feat-2-032 S4 — 2차 채점 기준 이용 가이드 등록/갱신(guide_articles). 멱등(title 기준 upsert).
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
if (!url || !url.includes("mcgdoplo")) throw new Error(`SAFETY: ${url} not prod`);
const sb = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TITLE = "2차 답안, 이렇게 채점됩니다 — 논점·목차·논증 3축";
const BODY = `2차 논술 답안은 **실제 채점위원의 채점평(2010~2017)** 에서 반복적으로 강조된 기준을 3축으로 정리해 평가합니다. 아는 것을 얼마나 많이 썼는지가 아니라 — **묻는 것을, 짜임새 있게, 근거를 들어 답했는지** 를 봅니다. 실제 채점평에 가장 많이 나온 한 문장이 핵심입니다.

> "답안은 **아는 것을 쓰는 것이 아니라 묻는 것을 답하는 것**입니다."

---

## ① 논점 추출 — "무엇을 묻는가"를 정확히 (가장 중요)

- 설문의 **취지와 핵심 쟁점**을 정확히 파악합니다. 사안이 제시한 **특정 사실**을 놓치지 마세요.
- 배점에 맞게 **쟁점을 빠짐없이** 적시합니다(30점이면 대개 핵심 쟁점 2~3개).
- 설문(1)/(2), 당사자(甲·乙·丙), 승소/패소 등 **경우를 구분**해 답합니다.

**흔한 감점**
- 묻지 않은 일반론·무관한 조문 나열, "설문 단서(예: ○○는 제외)"를 어김
- 아는 문제라고 넘겨짚어 **자의적으로 해석**, 핵심 쟁점 누락

## ② 목차·구성 — "짜임새 있게"

- **쟁점별 목차와 소제목**으로 구조를 드러냅니다. 소제목 없이 줄글로 쓰면 채점자가 이해하기 어렵습니다.
- **배점에 비례해 분량·강약을 배분**하세요. 법리·판례 일반론은 짧게, **사안 해결(포섭)에 지면을 많이** 씁니다.
- 학설과 판례는 **구분해서** 배치합니다.

**흔한 감점**
- 수험서 목차를 **그대로 암기**해 붙여, 정작 핵심 쟁점 설명이 얇아짐
- 특정 쟁점에만 편중, 서론이 장황, 조문을 그대로 옮겨 적는 나열식

## ③ 답안 작성·논증 — "근거를 들어 결론까지"

- **실정법(조문) → 학설·판례** 순으로 근거를 대고, **사안에 적용(포섭)** 해 판단합니다.
- **명확한 결론**과 **결론에 이르는 일관된 논리**가 있어야 합니다.
- 학설이 대립하면 **자기 입장을 밝히고 논거**를 제시합니다(관련 판례 인용 가점).

**흔한 감점**
- 법전·수험서를 이해 없이 **그대로 전사**
- "권리남용이면 패소, 아니면 승소" 식의 **애매모호한 결론**, 논리 비약, 본문과 결론의 모순

---

## AI 채점으로 스스로 점검하기

2차 기출 문제에서 답안을 작성한 뒤 **[AI 채점]** 버튼을 누르면, 위 3축(논점·목차·논증)으로 **점수와 총평**을 받아볼 수 있습니다. 채점 근거는 **그 문제의 실제 채점위원 채점평과 모범답안** 입니다.

- 결과는 **강사 확정 전 초안**입니다. 방향을 잡는 용도로 활용하고, 정식 평가는 강사 첨삭(첨삭 요청)으로 받으세요.
- 함께 있는 **[모범답안 보기] · [채점기준 보기]** 와 비교하면 부족한 축이 분명해집니다.

> 팁: 채점 직후 총평의 "보완할 점"을 다음 답안에서 하나씩 고쳐 보세요. 3축 중 **점수가 가장 낮은 축부터** 개선하는 것이 가장 빠릅니다.`;

const row = {
  title: TITLE,
  category: "2차 대비",
  audience: "student",
  body_md: BODY,
  screen_key: null,
  is_published: true,
  display_order: 402,
};

const { data: existing } = await sb
  .from("guide_articles")
  .select("guide_id")
  .eq("title", TITLE)
  .maybeSingle();

if (existing) {
  const { error } = await sb
    .from("guide_articles")
    .update(row)
    .eq("guide_id", existing.guide_id);
  if (error) throw error;
  console.log("updated guide:", existing.guide_id);
} else {
  const { data, error } = await sb
    .from("guide_articles")
    .insert(row)
    .select("guide_id")
    .single();
  if (error) throw error;
  console.log("inserted guide:", data.guide_id);
}
