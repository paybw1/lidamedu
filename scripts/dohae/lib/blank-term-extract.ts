// feat-2-037 — 도해 빈칸이 될 **말을 고르는 규칙**. 실측 도구(probe)와 적재
// 스크립트(gen)가 **같은 모듈**을 쓴다.
//
// ★두 벌로 두면 "재 본 것"과 "넣은 것"이 달라진다. 체계도 작업에서 파서를 두 벌 두었다가
//   트리와 조문 배치가 서로 다른 해석 위에 놓인 적이 있다(source-tree.mjs 의 교훈).
//
// 말은 **문제 쪽에서 모으고 유닛 본문에서 찾는다.** 도해 표 칸은 「신규성」처럼 조사 없이
// 낱말만 있어, 조사 기반 명사 추출이 유닛 본문에서는 거의 아무것도 못 잡는다.

import { nounStem } from "~/features/blanks/lib/noun-blanks";

/** 과목 전체에 두루 쓰이는 말은 빈칸이 되어도 답이 뻔하다 — 문서빈도 상한. */
export const TOO_COMMON = 0.08;
/** 두 글자 말은 웬만하면 일반어(판단·구성·방법·경우)라 더 좁게 본다. */
export const TOO_COMMON_SHORT = 0.02;

const MIN_LEN = 2;
const MAX_LEN = 12;

/**
 * 조사를 벗기다 남은 **문법 토막**. 코퍼스 어딘가에 홀로 쓰인 적이 있어(「하여」·「본다」)
 * 그 검사를 통과해 버린다 — 낱말이 아니므로 여기서 이름으로 막는다.
 * 일반명사는 아래 `GENERAL_WORDS` 로 따로 다룬다 — 토막인지 낱말인지는 다른 판단이다.
 */
const FRAGMENTS = new Set([
  "아니", "하지", "하여", "본다", "있기", "한다", "된다", "그중",
  // 2026-09-05 — 밀도를 「한 줄에 하나」로 올리자 이 토막들이 실제 빈칸으로 나왔다.
  "있어", "되지", "함께", "않고", "없어", "없음", "되기", "알고", "앞서", "적어", "보아",
  "보기", "에서",
  // 조사를 떼다 낱말이 잘린 것 — 「신규성」·「진보성」의 앞동강이다.
  "신규", "진보",
]);

/**
 * 두 글자 **일반어** — 법률용어가 아니라서 빈칸이 되어도 배울 것이 없다(원장 결정 2026-09-05).
 *
 * ★법률용어는 두 글자라도 남긴다 — 질권·기피·제척·항변·자백·송달·구술·불복·소급·취하·
 *   포기·승계·흠결·권원·요지·감축·단서·전단·본안·각하·하자·존부·문언 …
 *   여기 있는 것은 「의미·결론·형식」처럼 어느 글에나 나오는 말뿐이다.
 * ★문서빈도 상한(2%)으로는 안 걸린다. 이 말들은 도해 전체에 두루 퍼져 있지 않고
 *   몇 유닛에만 몰려 나오기 때문이다 — 그래서 이름으로 막는다.
 */
const GENERAL_WORDS = new Set([
  "각자", "견해", "결론", "계산", "관련", "관리", "교체", "구별", "국민", "근무",
  "기본", "기존", "기타", "다수", "단계", "달성", "대비", "대응", "대학", "동기",
  "문제", "발생", "법률", "복수", "부여", "부정", "부족", "부품", "분야", "사전",
  "성공", "성질", "세계", "수량", "시기", "식품", "실제", "실체", "암호", "양자",
  "언어", "염려", "영어", "영향", "예방", "오전", "요구", "유무", "의미", "이하",
  "인식", "인정", "일반", "일본", "일체", "작성", "장래", "장치", "전량", "전부",
  "전후", "정규", "제거", "제시", "제작", "제품", "조건", "조합", "종류", "종전",
  "종합", "주체", "지역", "직원", "직전", "진행", "차례", "출발", "측정", "특성",
  "폐기", "표현", "품목", "피부", "필름", "한국", "한쪽", "형식", "형태", "혈액",
  "확장", "횟수",
  // 앞의 92개를 뺀 뒤 그 자리를 받아 새로 올라온 것들(원장 지시 2026-09-05).
  "방지", "보통", "암시",
]);

const coreOf = (tok: string) =>
  tok.replace(/^[^가-힣]+/, "").replace(/[^가-힣]+$/, "");

/**
 * 한 덩이 글에서 후보 낱말들 — **조사가 실제로 벗겨진 체언만**.
 * ★조사 없이 끝난 어절까지 담으면 「공지된」·「반하여」·「받을」 같은 용언이 상위권에
 *   올라오고, 같은 말이 「진보성 / 진보성이 / 진보성을」 세 항목으로 갈라진다.
 */
export function termsOf(text: string): Set<string> {
  const out = new Set<string>();
  for (const tok of text.split(/\s+/)) {
    const core = coreOf(tok);
    if (core.length < MIN_LEN || core.length > MAX_LEN) continue;
    const stem = nounStem(core);
    if (stem) out.add(stem);
  }
  return out;
}

export interface Vocabulary {
  /** 문서(문제) 수. */
  docs: number;
  /** 말 → 그 말이 나온 문서 수. */
  df: Map<string, number>;
  /** 코퍼스에서 **조사 없이 홀로 쓰인** 적 있는 어절들. */
  bareCores: Set<string>;
}

/**
 * 코퍼스 전체에서 문서빈도와 "홀로 쓰인 말" 목록을 만든다.
 * @param docTexts 문서 한 건의 글(문제 본문 + 그 문제의 선지)
 * @param bareOnly 문서로는 안 세되 어휘 근거로만 쓸 글(박스 지문 등)
 */
export function buildVocabulary(docTexts: string[], bareOnly: string[] = []): Vocabulary {
  const df = new Map<string, number>();
  const bareCores = new Set<string>();
  const addBare = (text: string) => {
    for (const tok of text.split(/\s+/)) {
      const core = coreOf(tok);
      if (core.length >= MIN_LEN && core.length <= MAX_LEN) bareCores.add(core);
    }
  };
  for (const text of docTexts) {
    addBare(text);
    for (const t of termsOf(text)) df.set(t, (df.get(t) ?? 0) + 1);
  }
  for (const text of bareOnly) addBare(text);
  return { docs: docTexts.length, df, bareCores };
}

const dfRatio = (v: Vocabulary, t: string) => (v.df.get(t) ?? 0) / v.docs;
const idf = (v: Vocabulary, t: string) => Math.log(v.docs / (1 + (v.df.get(t) ?? 0)));

/**
 * 쓸 만한 말인가.
 * ★조사를 벗기다 말이 잘리는 일이 있다 — 「선출원주의」에서 `의` 를 떼면 「선출원주」가
 *   된다. 그래서 **코퍼스 어딘가에 조사 없이 홀로 쓰인 적 있는 말**만 인정한다.
 *   같은 규칙이 「적용받」·「소급되」·「보정하」 같은 용언 토막도 함께 걸러낸다.
 */
export function usable(v: Vocabulary, t: string): boolean {
  if (t.length < MIN_LEN || FRAGMENTS.has(t) || GENERAL_WORDS.has(t)) return false;
  if (!v.bareCores.has(t)) return false;
  return dfRatio(v, t) <= (t.length === MIN_LEN ? TOO_COMMON_SHORT : TOO_COMMON);
}

/** 한 유닛에 걸린 원천 글. 유형1 = 기출 문제 한 건씩, 유형2 = OX 지문 한 줄씩. */
export interface UnitSources {
  exam: string[];
  ox: string[];
}

export interface ExtractedTerm {
  term: string;
  fromExam: boolean;
  fromOx: boolean;
  examCount: number;
  oxCount: number;
  score: number;
}

/**
 * 한 유닛의 후보 말 — 원천에서 모으고, 유닛 본문에 실제로 있는 것만 남긴다.
 * 반환 순서는 점수 내림차순(동점은 말 순서)으로 **결정적**이다.
 */
export function extractTerms(
  unitText: string,
  src: UnitSources,
  vocab: Vocabulary,
): ExtractedTerm[] {
  const examCount = new Map<string, number>();
  const oxCount = new Map<string, number>();
  for (const s of src.exam) for (const t of termsOf(s)) examCount.set(t, (examCount.get(t) ?? 0) + 1);
  for (const s of src.ox) for (const t of termsOf(s)) oxCount.set(t, (oxCount.get(t) ?? 0) + 1);

  const out: ExtractedTerm[] = [];
  for (const t of new Set([...examCount.keys(), ...oxCount.keys()])) {
    if (!unitText.includes(t) || !usable(vocab, t)) continue;
    const e = examCount.get(t) ?? 0;
    const o = oxCount.get(t) ?? 0;
    out.push({
      term: t,
      fromExam: e > 0,
      fromOx: o > 0,
      examCount: e,
      oxCount: o,
      score: Number(((e + o) * idf(vocab, t)).toFixed(4)),
    });
  }
  return out.sort((a, b) => b.score - a.score || a.term.localeCompare(b.term));
}

/**
 * 저장할 말을 추린다 — **두 유형 순위 각각의 앞쪽**만.
 * ★점수 하나로 자르면 안 된다. 유형1 은 기출 등장 수로, 유형2 는 OX 등장 수로 순위를
 *   매기므로 점수 상위에 없어도 어느 한 유형에서는 앞자리인 말이 있다.
 * ★기본은 자르지 않는다(`headroom = Infinity`). 화면이 말 수에 상한을 두지 않으므로
 *   여기서 자르면 그게 곧 빈칸 수의 상한이 된다. 자를 때만 두 순위의 앞쪽을 각각 남긴다.
 */
export function pickForStorage(terms: ExtractedTerm[], headroom: number): ExtractedTerm[] {
  const top = (
    pool: ExtractedTerm[],
    countOf: (t: ExtractedTerm) => number,
  ): ExtractedTerm[] =>
    [...pool]
      .sort((a, b) => countOf(b) - countOf(a) || b.score - a.score || a.term.localeCompare(b.term))
      .slice(0, headroom);

  const keep = new Map<string, ExtractedTerm>();
  for (const t of top(terms.filter((x) => x.fromExam), (x) => x.examCount)) keep.set(t.term, t);
  for (const t of top(terms.filter((x) => x.fromOx), (x) => x.oxCount)) keep.set(t.term, t);
  return [...keep.values()].sort((a, b) => b.score - a.score || a.term.localeCompare(b.term));
}
