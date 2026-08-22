// 표 라벨의 줄바꿈 자리 — 한국어 복합어를 뜻 단위로 끊는다.
//
// ★CSS 는 낱말의 짜임을 모른다. `word-break: keep-all` 로는 한 낱말을 통째로 유지하고,
//   칸보다 길면 `overflow-wrap: anywhere` 가 아무 데서나 자른다 — 그래서 「적법성심리」가
//   "적법성심 / 리" 로 끊겼다(원장 보고 2026-08-23). 끊을 자리를 <wbr> 로 알려주면
//   브라우저가 들어가는 자리 중 **가장 뒤쪽**을 골라 "적법성 / 심리" 로 접는다.
//
// ★<wbr> 은 textContent 에 아무것도 더하지 않는다 — 하이라이트·포스트잇의 글자 오프셋이
//   그대로 유지된다. (제로폭 공백 U+200B 은 글자로 세어져 오프셋을 밀어 버리므로 못 쓴다.)

/** 뒤에서 떼어 내는 형태소. 긴 것부터 본다. */
const TAILS = [
  // 3자
  "실시권",
  "청구권",
  "청구인",
  "관계인",
  "출원인",
  "신청인",
  "권리자",
  "발명자",
  "대리인",
  "승계인",
  "참가인",
  "심판관",
  "심사관",
  "명세서",
  "청구서",
  "신청서",
  "의견서",
  "답변서",
  "보정서",
  "취소권",
  "이용권",
  // 2자
  "심리",
  "심판",
  "심사",
  "청구",
  "신청",
  "출원",
  "결정",
  "부담",
  "통지",
  "송달",
  "제출",
  "보정",
  "요건",
  "효과",
  "효력",
  "절차",
  "기간",
  "범위",
  "제도",
  "등록",
  "취하",
  "무효",
  "정정",
  "참가",
  "종료",
  "확정",
  "이전",
  "변경",
  "연장",
  "공개",
  "판단",
  "성립",
  "제한",
  "소멸",
  "발생",
  "행사",
  "분류",
  "비교",
  "구별",
  "관계",
  "방법",
  "내용",
  "취지",
  "의의",
  "대상",
  "주체",
  "객체",
  "시기",
  "침해",
  "발명",
  "실시",
  "권리",
  "능력",
  "자격",
  "이유",
  "사유",
  "조치",
  "방식",
  "서류",
  "증거",
  "비용",
  "배상",
  "예외",
  "원칙",
  "문제",
  "사례",
  "유형",
  "종류",
  "기재",
  "형식",
  "승계",
  "상속",
  "양도",
  "설정",
  "소송",
  "판결",
  "심결",
  "각하",
  "기각",
  "인용",
  "보호",
  "지위",
  "성질",
  "취소",
  "회복",
  "포기",
  "공유",
  "질권",
  "제공",
  "조사",
  "공고",
  "반려",
  "수리",
  "진행",
  "계속",
  "지정",
  "명령",
  "위반",
  "흠결",
  "하자",
  "구제",
  "대응",
  "정의",
  "분할",
  "분리",
  "우선",
  "특례",
  "준용",
  "적용",
  "판례",
  "학설",
  "요지",
  "구성",
  "구조",
  "단계",
  "시점",
  "기준",
  "판정",
  "표시",
  "기회",
  "통보",
  "게재",
  "열람",
  "복사",
  "납부",
  "반환",
  "감면",
  "정지",
  "중단",
  "속행",
  "수계",
  "위임",
  "선임",
  "교체",
  "확장",
  "축소",
  "부가",
  "생략",
  "선택",
];
/** 떼고 남는 머리말의 최소 길이 — 한 글자만 남으면 오히려 읽기 나쁘다. */
const MIN_HEAD = 2;
const HANGUL_ONLY = /^[가-힣]+$/;

/** 한 낱말을 형태소 단위로 나눈다. 나눌 데가 없으면 통째로 돌려준다. */
function splitWord(word: string): string[] {
  if (!HANGUL_ONLY.test(word) || word.length < 4) return [word];
  const out: string[] = [];
  let head = word;
  for (;;) {
    const tail = TAILS.find(
      (t) => head.length - t.length >= MIN_HEAD && head.endsWith(t),
    );
    if (!tail) break;
    out.unshift(tail);
    head = head.slice(0, head.length - tail.length);
  }
  return head ? [head, ...out] : out;
}

/**
 * 라벨 한 줄 → 줄바꿈 기회로 나눈 조각들. 조각 사이에 <wbr> 을 넣어 그린다.
 * 빗금(/·ㆍ) 뒤에서도 끊을 수 있게 한다 — 「결정/심결」처럼 붙여 쓴 라벨이 많다.
 */
export function labelSegments(line: string): string[] {
  const out: string[] = [];
  let buf = "";
  for (const ch of line) {
    buf += ch;
    if (ch === "/" || ch === "·" || ch === "ㆍ") {
      out.push(buf);
      buf = "";
    }
  }
  if (buf) out.push(buf);
  return out.flatMap((part) => {
    // 끝의 빗금은 떼어 두고 나눈 뒤 되붙인다 — 붙어 있으면 한글이 아니라 안 나뉜다.
    const sep = /[/·ㆍ]$/.test(part) ? part.slice(-1) : "";
    const body = sep ? part.slice(0, -1) : part;
    const back = (parts: string[]) =>
      sep ? [...parts.slice(0, -1), parts[parts.length - 1] + sep] : parts;
    // 조각 안의 공백은 이미 줄바꿈 기회다 — 마지막 낱말만 나눠 본다.
    const at = body.lastIndexOf(" ");
    if (at < 0) return back(splitWord(body));
    const [lead, last] = [body.slice(0, at + 1), body.slice(at + 1)];
    const parts = splitWord(last);
    return back([lead + parts[0], ...parts.slice(1)]);
  });
}
