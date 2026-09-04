// feat-2-035 S6 — 답안 쓰기 연습의 채점.
//
// 학생이 쓴 법리·포섭을 모범답안(도식)과 맞춘다. **모범답안의 핵심어가 학생 답에
// 몇 % 담겼는가**(재현율형)를 본다 — 학생이 더 길게 써도 감점하지 않는다.
//
// ★암기 모드의 Levenshtein 을 쓰지 않는 이유: 조문 암기는 글자를 맞히는 일이지만
//   법리는 **바꿔 쓰는** 일이다. 제대로 쓴 답안도 편집거리로는 0.3 언저리가 나온다.
//
// ★"축이 어긋나도 인정"(원장 지정 2026-08-27): 채워진 축 하나하나를 **학생 답 전체**에
//   대고 맞춘다. 어느 축의 내용을 어디에 썼든 글이 들어 있으면 그 축은 맞은 것이다.
//
// 순수 모듈 — 화면·테스트 양쪽에서 쓴다(서버 전용 import 금지).
import {
  type CaseDiagramBlock,
  DOCTRINE_AXES,
  type DoctrineAxisKey,
  filledAxes,
} from "./case-diagram";

/**
 * 비교용 정규화 — 공백·문장부호를 지우고 소문자로. 조사 차이는 stem 이 따로 흡수한다.
 * ★내보내는 이유: 맞은 핵심어가 학생 글 **어디에서** 잡혔는지 세려면(목차 연습의 순서
 *   신호, feat-2-036) 여기와 **같은 좌표계**에서 찾아야 한다. 원문에 대고 indexOf 하면
 *   stem 으로 잘린 토큰이 안 잡혀 전부 "순서 어긋남"이 된다.
 *
 * ★`keepCjk` — 한자를 남긴다. 기본은 **끄기**다(도식 채점 임계값이 한자를 지운 상태로
 *   실측된 값이라 기본을 바꾸면 그 기준이 흔들린다). 목차 연습만 켠다:
 *   `2. 甲의 주장` 과 `3. 乙의 주장` 이 둘 다 `주장` 하나로 줄어 같은 항목이 되기
 *   때문이다 — 당사자 표시가 항목을 가르는 자리에서는 지우면 안 된다.
 */
export function normalize(s: string, opts: { keepCjk?: boolean } = {}): string {
  const re = opts.keepCjk ? /[^가-힣a-zA-Z0-9\u3400-\u4dbf\u4e00-\u9fff]/g : /[^가-힣a-zA-Z0-9]/g;
  return s.replace(re, "").toLowerCase();
}

/**
 * 조사·어미 벗기기 — 형태소 분석기 없이. **긴 것부터** 검사한다.
 * 어차피 완전하지 않지만, 커버리지 계산은 토큰이 조금 뭉개져도 결과가 흔들리지 않는다
 * (모범답안·학생 답 양쪽에 같은 규칙이 걸린다).
 */
const TAIL: readonly string[] = [
  "에서는",
  "으로서",
  "이라고",
  "에게서",
  "으로써",
  "에서",
  "에게",
  "으로",
  "라고",
  "이나",
  "이란",
  "까지",
  "부터",
  "보다",
  "처럼",
  "마다",
  "조차",
  "라도",
  "한다",
  "된다",
  "하는",
  "되는",
  "하여",
  "되어",
  "하고",
  "되고",
  "할",
  "한",
  "된",
  "은",
  "는",
  "이",
  "가",
  "을",
  "를",
  "의",
  "에",
  "와",
  "과",
  "도",
  "만",
  "로",
  "라",
  "며",
  "고",
  "여",
];

function stemToken(t: string): string {
  for (const tail of TAIL) {
    if (t.length > tail.length + 1 && t.endsWith(tail)) {
      return t.slice(0, -tail.length);
    }
  }
  return t;
}

/**
 * 핵심어에서 빼는 말 — 법리의 뼈대가 아니라 문장을 잇는 말들.
 * ★용언(있고·하는·같은)은 stem 으로 안 벗겨지는 짧은 형태가 많아 여기에 직접 적는다.
 */
const STOP = new Set([
  "있다",
  "있고",
  "있는",
  "없다",
  "없는",
  "없이",
  "한다",
  "하고",
  "하는",
  "된다",
  "되는",
  "같은",
  "같이",
  "이는",
  "그러",
  "때에",
  "자에",
  "경우",
  "따라서",
  "그리고",
  "또는",
  "다만",
  "한편",
  "위와",
  "이때",
  "대하",
  "의하",
  "인하",
  "관하",
  "위하",
  "것으",
  "모든",
  "각각",
  "이상",
  "다음",
  "해당",
  "여부",
  "자기",
]);

/**
 * **사건 고유의 수치**인 토큰 — 금액·날짜. 포섭 채점에서 뺀다(§10.3).
 * ★"제1항"·"제128조"·"구성요소6" 처럼 **글자가 섞인 번호는 남긴다** — 조문·청구항
 *   번호는 제대로 쓴 답안이라면 당연히 들어가는 말이라, 빼면 채점이 헐거워진다.
 *   숫자가 든 토큰을 통째로 버렸더니 "제1항"이 함께 사라졌다(실측 2026-08-27).
 */
function isFigure(t: string): boolean {
  return /^\d+$/.test(t) || /^\d+[원년월일억만]/.test(t);
}

export interface KeyTermOptions {
  /** true 면 숫자가 든 토큰을 핵심어에서 뺀다(포섭용). */
  dropFigures?: boolean;
  /** true 면 한자를 핵심어에 남긴다(목차 연습 — 甲/乙 이 항목을 가른다). 기본 끄기. */
  keepCjk?: boolean;
}

/** 모범답안에서 뽑은 핵심어 — 중복 없이, 나온 순서대로. */
export function keyTerms(model: string, opts: KeyTermOptions = {}): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const splitter = opts.keepCjk
    ? /[^가-힣a-zA-Z0-9\u3400-\u4dbf\u4e00-\u9fff]+/
    : /[^가-힣a-zA-Z0-9]+/;
  for (const raw of model.split(splitter)) {
    if (!raw) continue;
    const t = stemToken(raw);
    if (t.length < 2 || STOP.has(t) || seen.has(t)) continue;
    if (opts.dropFigures && isFigure(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/**
 * 놓친 말을 **보여줄 때만** 거르는 규칙 — 점수는 전체 핵심어로 낸다(§10.3).
 * stem 이 놓친 찌꺼기("있고"·"입은"·"얻은")가 목록에 섞이면 학생이 그걸 외우려 든다.
 * 두 글자 토큰이 조사로만 끝나면 명사가 아니라고 본다. 「의·고·과·도」는 뺀다 —
 * 정의·보고·결과·제도처럼 그 글자로 끝나는 명사가 흔하다.
 */
const PARTICLE_TAIL = /[에은는을를며어]$/;
const MISSED_SHOWN_MAX = 8;

/**
 * 놓친 말 **목록에서만** 빼는 활용형 찌꺼기. 점수에는 그대로 센다 — 임계값이 이걸
 * 포함해 실측된 값이라, 여기서 빼면 기준이 흔들린다.
 * ★어미 글자로 자르는 규칙은 못 쓴다 — "취지"·"인지"처럼 그 글자로 끝나는 핵심어가
 *   있다. 법률 산문에 실제로 나오는 형태만 적어 둔다.
 */
const DISPLAY_STOP = new Set([
  "있으",
  "있으나",
  "있었",
  "없으",
  "없으나",
  "하나",
  "하며",
  "하여",
  "하였",
  "되므",
  "되어",
  "되었",
  "않았",
  "않아",
  "않는",
  "아니",
  "아니다",
  "두지",
  "그대",
  "내지",
  "이고",
  "이며",
  "였다",
  "대하여",
  "위하여",
  "관하여",
  "의하여",
  "인하여",
  "이라",
  "라는",
  "다고",
  "만큼",
  "뿐만",
  "앞서",
  "그에",
  "것과",
  "하는지",
  "있는지",
  "때문",
]);

function displayable(t: string): boolean {
  if (DISPLAY_STOP.has(t)) return false;
  if (t.length > 2) return true;
  return !PARTICLE_TAIL.test(t);
}

export interface MatchResult {
  /** 0..1 — 모범답안 핵심어 중 학생 답에 담긴 비율. 핵심어가 없으면 1. */
  ratio: number;
  /** 담긴 핵심어. */
  matched: string[];
  /** 놓친 핵심어 — 표시용으로 걸러 최대 8개. */
  missed: string[];
  /** 놓친 핵심어 전체 개수(표시에서 잘린 것 포함). */
  missedCount: number;
}

/** 모범답안 한 덩이를 학생 답 **전체**에 대고 맞춘다. */
export function matchAnswer(
  model: string,
  student: string,
  opts: KeyTermOptions = {},
): MatchResult {
  const terms = keyTerms(model, opts);
  if (terms.length === 0) {
    return { ratio: 1, matched: [], missed: [], missedCount: 0 };
  }
  const hay = normalize(student, opts);
  const matched: string[] = [];
  const missed: string[] = [];
  for (const t of terms) {
    if (hay.includes(normalize(t, opts))) matched.push(t);
    else missed.push(t);
  }
  return {
    ratio: matched.length / terms.length,
    matched,
    missed: missed.filter(displayable).slice(0, MISSED_SHOWN_MAX),
    missedCount: missed.length,
  };
}

// ── 판정 ───────────────────────────────────────────────────────────────────

export const VERDICTS = ["accepted", "partial", "weak"] as const;
export type Verdict = (typeof VERDICTS)[number];

export const VERDICT_LABEL: Record<Verdict, string> = {
  accepted: "인정",
  partial: "부분",
  weak: "미흡",
};

/**
 * 임계값. 실측(2026-08-27, 승인 도식) 결과 성격이 다른 법리들에서 값이 같은 자리에
 * 떨어져 고정으로 둔다 — 제대로 바꿔 쓴 답 0.73~0.74 / 일부만 0.17~0.20 / 엉뚱 0.04~0.07.
 * ★포섭은 사건 고유의 수치를 핵심어에서 빼고(dropFigures) 같은 기준을 쓴다.
 */
export const ACCEPT_MIN = 0.65;
export const PARTIAL_MIN = 0.35;

export function verdictOf(ratio: number): Verdict {
  if (ratio >= ACCEPT_MIN) return "accepted";
  if (ratio >= PARTIAL_MIN) return "partial";
  return "weak";
}

// ── 도식 블록 채점 ─────────────────────────────────────────────────────────

export interface AxisScore {
  key: DoctrineAxisKey;
  label: string;
  /** 모범답안 본문 — 채점 후 펼쳐 보여 준다. */
  model: string;
  match: MatchResult;
  verdict: Verdict;
}

export interface BlockScore {
  /** 채워진 축 각각의 판정. 축이 하나도 없으면 빈 배열. */
  axes: AxisScore[];
  /** 인정된 축 수 / 전체 축 수 — 법리 전체의 성적. */
  acceptedAxes: number;
  application: { model: string; match: MatchResult; verdict: Verdict } | null;
}

/**
 * 한 쟁점에 대한 학생 답 채점.
 * ★법리는 학생이 **한 칸에** 쓴다 — 축별로 나눠 받으면 "축이 어긋나도 인정"이
 *   성립하지 않고, 실제 답안도 축을 나눠 쓰지 않는다.
 */
export function scoreBlock(
  block: CaseDiagramBlock,
  input: { doctrine: string; application: string },
): BlockScore {
  const axes: AxisScore[] = filledAxes(block).map((ax) => {
    const match = matchAnswer(ax.body, input.doctrine);
    return {
      key: ax.key,
      label: ax.label,
      model: ax.body,
      match,
      verdict: verdictOf(match.ratio),
    };
  });
  const appModel = block.application.trim();
  const application = appModel
    ? (() => {
        const match = matchAnswer(appModel, input.application, {
          dropFigures: true,
        });
        return { model: appModel, match, verdict: verdictOf(match.ratio) };
      })()
    : null;
  return {
    axes,
    acceptedAxes: axes.filter((a) => a.verdict === "accepted").length,
    application,
  };
}

/** 연습 대상이 되는 쟁점인가 — 쓸 모범답안이 있어야 채점이 성립한다. */
export function practicable(block: CaseDiagramBlock): boolean {
  return filledAxes(block).length > 0 || block.application.trim().length > 0;
}

/** 축 이름 목록 — 채점 결과에서 "어느 축을 놓쳤는지" 안내할 때 쓴다. */
export const ALL_AXIS_LABELS = DOCTRINE_AXES.map((a) => a.label);
