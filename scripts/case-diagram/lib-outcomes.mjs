// feat-2-035 — 심급별 결과(경과 배지) 추출. 생성기와 백필이 **같은 것**을 쓴다.
//
// timeline 은 "무슨 일이 언제" 만 담고 결과(인용/기각/각하·파기환송…)는 문장 속에만 있었다.
// 심급별 결론은 2차에서 사실관계만큼 자주 묻는 정보라 따로 뽑아 배지로 보여 준다.
//
// ★입력을 **주문이 있는 자리로 좁힌다** — 판결문 전체를 넣을 필요가 없다. 대법원 판결문은
//   주문이 앞머리(판결문 PDF) 또는 끝(법령정보센터 형식)에 있어 양끝을 함께 준다.
// ★심급 목록은 3칸 고정이 아니다. 심결취소계열(심판원→특허법원→대법원)과 민사계열
//   (지방법원→항소심→대법원)이 섞여 있다.
// ★없는 결과를 지어내지 않는다 — 판결문에 안 적힌 심급은 빼도록 지시한다(CLAUDE.md #11).

const LEVELS = ["trial_board", "first", "appeal", "supreme"];
const RESULTS = [
  "인용",
  "일부인용",
  "기각",
  "각하",
  "취소",
  "파기환송",
  "파기자판",
  "상고기각",
  "심리불속행",
  "기타",
];

export const OUTCOMES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    outcomes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          level: { type: "string", enum: LEVELS },
          court: { type: "string" },
          result: { type: "string", enum: RESULTS },
          caseNo: { type: "string" },
          when: { type: "string" },
        },
        required: ["level", "court", "result"],
      },
    },
  },
  required: ["outcomes"],
};

export const OUTCOMES_SYSTEM = `당신은 대한민국 특허·상표 판례를 정리하는 법률 편집자입니다.
한 사건이 거쳐 온 **심급별 결론**만 뽑습니다. 법리 설명·사실관계는 쓰지 않습니다.

# 심급(level)
- trial_board: 특허심판원의 심결·결정(무효심판·권리범위확인심판·취소신청·정정심판 등)
- first: 1심 법원
- appeal: 항소심 — **심결취소소송의 특허법원도 여기**
- supreme: 대법원

# 결과(result) — 그 심급의 **주문**을 기준으로 고릅니다
- 심판원: 인용 / 일부인용 / 기각 / 각하
- 법원(심결취소소송): 심결을 취소했으면 "취소", 청구를 물리쳤으면 "기각", 각하면 "각하"
- 법원(민사): 인용 / 일부인용 / 기각 / 각하
- 대법원: 파기환송 / 파기자판 / 상고기각 / 심리불속행 / 각하

# 규칙
- **판결문에 결론이 적힌 심급만** 넣습니다. 짐작으로 채우지 마세요.
- court 는 판결문 표기 그대로("특허심판원", "특허법원", "서울고등법원", "대법원").
- caseNo·when 은 확인되는 것만. 없으면 넣지 마세요.
- 이 사건과 무관한 관련 사건(다른 특허의 별건 심판 등)은 넣지 마세요.
- 시간 순서(심판원 → 법원 → 대법원)로 정렬합니다.
- 본안 판단 없이 정정심판만 따로 있는 경우처럼 사건의 심급 흐름이 아닌 것은 뺍니다.`;

/** 주문이 있을 만한 자리만 남긴다 — 앞머리와 끝. */
function ends(text, head = 2600, tail = 2000) {
  const t = (text ?? "").trim();
  if (t.length <= head + tail) return t;
  return `${t.slice(0, head)}\n\n…(중략)…\n\n${t.slice(-tail)}`;
}

/**
 * @param {object} a
 * @param {(args:{system:string,prompt:string,maxTokens:number,schema:object})=>Promise<string>} a.callModel
 * @returns {Promise<Array<{level:string,court:string,result:string,caseNo?:string,when?:string}>>}
 */
export async function draftOutcomes({
  callModel,
  caseNumber,
  court,
  decidedAt,
  officialText,
  lowerText,
  factsMd,
  timeline,
}) {
  const parts = [
    "# 사건",
    `- 대법원 사건번호: ${caseNumber}`,
    `- 법원/선고일: ${court ?? ""} ${decidedAt ?? ""}`,
    "",
    "# 대법원 판결문(앞머리·끝 — 주문이 있는 자리)",
    ends(officialText),
  ];
  if (lowerText) {
    parts.push(
      "",
      "# 하급심 판결문(앞머리·끝 — 주문과 심결 경위가 있는 자리)",
      ends(lowerText),
    );
  }
  if (factsMd) parts.push("", "# 이미 정리된 사실관계", factsMd.slice(0, 3000));
  if (Array.isArray(timeline) && timeline.length > 0) {
    parts.push(
      "",
      "# 이미 정리된 경과",
      timeline.map((e) => `- ${e.when} ${e.what}`).join("\n"),
    );
  }
  parts.push("", "위 자료에서 심급별 결론을 JSON 으로 정리하세요.");

  const raw = await callModel({
    system: OUTCOMES_SYSTEM,
    prompt: parts.join("\n"),
    maxTokens: 2000,
    schema: OUTCOMES_SCHEMA,
  });
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const order = Object.fromEntries(LEVELS.map((l, i) => [l, i]));
  const clean = (v, n) =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, n) : undefined;
  return (Array.isArray(parsed?.outcomes) ? parsed.outcomes : [])
    .map((o) => ({
      level: LEVELS.includes(o?.level) ? o.level : null,
      court: clean(o?.court, 40),
      result: RESULTS.includes(o?.result) ? o.result : null,
      ...(clean(o?.caseNo, 40) ? { caseNo: clean(o.caseNo, 40) } : {}),
      ...(clean(o?.when, 40) ? { when: clean(o.when, 40) } : {}),
    }))
    .filter((o) => o.level && o.court && o.result)
    .sort((a, b) => order[a.level] - order[b.level])
    .slice(0, 6);
}
