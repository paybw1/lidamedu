// feat-2-037 S1 — 도해 빈칸 배치 규칙을 못으로 박아 둔다.
// 여기 걸린 규칙은 전부 "안 그러면 이렇게 망가진다"가 있는 것들이다.
import { describe, expect, it } from "vitest";

import type { DohaeBlock } from "../labels";
import {
  type DohaeTerm,
  type DohaeTextNode,
  LINE_CHARS,
  MAX_HITS_PER_TERM,
  blankableNodes,
  buildBlanks,
  isArticleBox,
  judgeBlank,
  rankTerms,
  scoreBlanks,
} from "./dohae-blanks";

const cell = (text: string, extra: Record<string, unknown> = {}) => ({
  text,
  colSpan: 1,
  rowSpan: 1,
  ...extra,
});

const term = (t: string, over: Partial<DohaeTerm> = {}): DohaeTerm => ({
  termId: `id-${t}`,
  term: t,
  fromExam: true,
  fromOx: true,
  examCount: 1,
  oxCount: 1,
  score: t.length,
  ...over,
});

const nodes = (...texts: string[]): DohaeTextNode[] =>
  texts.map((text, i) => ({ path: `b${i}`, text }));

describe("빈칸을 놓을 수 있는 글", () => {
  it("★조문 원문 박스는 뺀다 — 도해에서 조문은 빈칸으로 만들지 않는다", () => {
    const blocks: DohaeBlock[] = [
      { type: "table", cells: [[cell("제29조(특허요건) ① 산업상 이용할 수 있는 발명…")]] },
      { type: "p", text: "신규성은 출원 시를 기준으로 판단한다." },
    ];
    expect(isArticleBox(blocks[0])).toBe(true);
    expect(blankableNodes(blocks).map((n) => n.text)).toEqual([
      "신규성은 출원 시를 기준으로 판단한다.",
    ]);
  });

  it("소제목·도해 이미지·도해가 그려진 칸은 빼고, 중첩표는 넣는다", () => {
    const blocks: DohaeBlock[] = [
      { type: "h", numeral: "Ⅰ", text: "특허요건" },
      { type: "diagram", image: "a.png" },
      {
        type: "table",
        cells: [
          [
            cell("구분"),
            cell("", { diagram: true, diagramTexts: ["도해"] }),
            cell("표 안 그림", { diagram: true }),
            cell("내용", { tables: [[[cell("속표 칸")]]] }),
            cell("   "),
          ],
        ],
      },
    ];
    expect(blankableNodes(blocks)).toEqual([
      { path: "b2.r0.c0", text: "구분", breaks: [] },
      // 속표가 글 끝(오프셋 = 길이)에 붙으면 글을 가르지 않는다 → 끊는 자리 없음.
      { path: "b2.r0.c3", text: "내용", breaks: [] },
      { path: "b2.r0.c3.t0.r0.c0", text: "속표 칸", breaks: [] },
    ]);
  });
});

describe("말이 놓일 자리", () => {
  it("★어절 중간에서는 시작하지 않는다 — 「특허출원」이 「특허___」이 되면 안 된다", () => {
    const one = buildBlanks(nodes("특허출원을 한다."), [term("출원")], 3);
    expect(one.hits).toHaveLength(0);
    const two = buildBlanks(nodes("특허 출원을 한다."), [term("출원")], 3);
    expect(two.hits.map((h) => [h.start, h.end])).toEqual([[3, 5]]);
  });

  it("뒤쪽은 열어 둔다 — 「재심사청구」에서 「재심사」를 뚫는 것은 정상이다", () => {
    const p = buildBlanks(nodes("재심사청구를 할 수 있다."), [term("재심사")], 3);
    expect(p.hits.map((h) => h.answer)).toEqual(["재심사"]);
  });

  it("★긴 말이 먼저 자리를 잡는다 — 「정정」이 먼저 잡으면 「___심판」이 된다", () => {
    const p = buildBlanks(nodes("정정심판을 청구한다."), [term("정정"), term("정정심판")], 3);
    expect(p.hits.map((h) => h.answer)).toEqual(["정정심판"]);
    // 자리를 못 잡은 말은 빈칸 목록에서도 빠진다.
    expect(p.terms.map((t) => t.term)).toEqual(["정정심판"]);
  });

  it("겹치지 않는 자리라면 짧은 말도 함께 놓인다", () => {
    const p = buildBlanks(
      nodes("정정심판을 청구한다.", "정정 은 별개다."),
      [term("정정"), term("정정심판")],
      3,
    );
    expect(p.hits.map((h) => h.answer)).toEqual(["정정심판", "정정"]);
  });

  it("★한 칸에는 한 번만 — 같은 문장에 같은 답을 두 번 치는 것은 연습이 아니다", () => {
    const p = buildBlanks(nodes("신규성 판단과 신규성 상실"), [term("신규성")], 3);
    expect(p.hits).toHaveLength(1);
  });

  it(`★같은 말은 ${MAX_HITS_PER_TERM}회까지만 — 다 풀면 「종업원」을 67번 치는 유닛이 있다`, () => {
    const p = buildBlanks(
      nodes(...Array.from({ length: 8 }, (_, i) => `거절이유통지 ${i}`)),
      [term("거절이유통지")],
      3,
    );
    expect(p.hits).toHaveLength(MAX_HITS_PER_TERM);
    // 읽기 순 앞에서부터 — 뒤쪽 글조각은 몫을 못 받는다.
    expect(p.hits.map((h) => h.path)).toEqual(["b0", "b1", "b2", "b3", "b4"]);
  });

  it("★한 줄에 하나 — 짧은 칸에 쟁점이 여럿 있어도 한 칸만 뚫는다", () => {
    // 20자 = 한 줄. 말이 셋 다 있어도 앞의 하나만 자리를 받는다.
    const p = buildBlanks(nodes("신규성 과 진보성 과 선행기술"), [
      term("신규성"),
      term("진보성"),
      term("선행기술"),
    ], 3);
    expect(p.hits.map((h) => h.answer)).toEqual(["신규성"]);
  });

  it(`★긴 글은 줄 수(${LINE_CHARS}자)만큼 받는다 — 문단마다 하나면 유닛당 19칸에서 멈춘다`, () => {
    const long = `${"가".repeat(38)} 신규성 ${"나".repeat(38)} 진보성 ${"다".repeat(38)} 선행기술`;
    const p = buildBlanks([{ path: "b0", text: long }], [
      term("신규성"),
      term("진보성"),
      term("선행기술"),
    ], 3);
    expect(Math.ceil(long.length / LINE_CHARS)).toBeGreaterThanOrEqual(3);
    expect(p.hits.map((h) => h.answer)).toEqual(["신규성", "진보성", "선행기술"]);
  });

  it("★상한에 걸린 말은 자리를 다음 말에게 넘긴다 — 멈추면 그 줄이 통째로 빈칸 없이 지나간다", () => {
    const spent = Array.from({ length: MAX_HITS_PER_TERM }, (_, i) => `흔한말 ${i}`);
    const p = buildBlanks(nodes(...spent, "흔한말 과 드문말"), [term("흔한말"), term("드문말")], 3);
    // 마지막 글조각에서 「흔한말」은 상한을 다 썼으므로 「드문말」이 그 몫을 받는다.
    expect(p.hits.filter((h) => h.path === `b${spent.length}`).map((h) => h.answer)).toEqual([
      "드문말",
    ]);
  });

  it("★속표가 끼어드는 자리를 가로지르는 말은 뚫지 않는다 — 놓을 데가 없다", () => {
    // 「신규성」이 4~7자에 있고 속표가 6자에 끼어든다 → 화면이 그 자리에서 글을 쪼갠다.
    const withBreak: DohaeTextNode[] = [
      { path: "b0.r0.c0", text: "가나다 신규성 라마", breaks: [6] },
    ];
    expect(buildBlanks(withBreak, [term("신규성")], 3).hits).toHaveLength(0);
    // 같은 글이라도 끊기지 않으면 뚫린다.
    const noBreak: DohaeTextNode[] = [{ path: "b0.r0.c0", text: "가나다 신규성 라마" }];
    expect(buildBlanks(noBreak, [term("신규성")], 3).hits).toHaveLength(1);
  });

  it("빈칸 번호는 읽기 순으로 매겨진다", () => {
    const p = buildBlanks(nodes("가나 신규성 다라", "마바 진보성"), [term("신규성"), term("진보성")], 3);
    expect(p.hits.map((h) => [h.idx, h.answer])).toEqual([
      [0, "신규성"],
      [1, "진보성"],
    ]);
  });
});

describe("유형", () => {
  const pool = [
    term("기출것", { fromOx: false, examCount: 9, oxCount: 0, score: 90 }),
    term("정오것", { fromExam: false, examCount: 0, oxCount: 9, score: 80 }),
    term("둘다", { examCount: 5, oxCount: 5, score: 70 }),
  ];
  // ★말마다 제 글조각을 준다 — 한 칸에 몰아 두면 「한 줄에 하나」라 하나만 뚫려
  //   무엇이 뽑혔는지를 잴 수 없다.
  const text = nodes("기출것 이 있다.", "정오것 이 있다.", "둘다 가 있다.");

  it("유형 1 은 기출 유래만, 유형 2 는 정오 유래만", () => {
    expect(buildBlanks(text, pool, 1).terms.map((t) => t.term)).toEqual(["기출것", "둘다"]);
    expect(buildBlanks(text, pool, 2).terms.map((t) => t.term)).toEqual(["정오것", "둘다"]);
  });

  it("★유형 3 = 유형 1 ∪ 유형 2 (겹치는 말은 한 번만)", () => {
    expect(buildBlanks(text, pool, 3).terms.map((t) => t.term).sort()).toEqual(
      ["기출것", "둘다", "정오것"].sort(),
    );
  });

  it("순위는 유형마다 다르다 — 유형 1 은 기출 등장 수, 유형 2 는 OX 등장 수", () => {
    expect(rankTerms(pool, 1).map((t) => t.term)).toEqual(["기출것", "둘다"]);
    expect(rankTerms(pool, 2).map((t) => t.term)).toEqual(["정오것", "둘다"]);
  });

  it("★자리를 못 잡는 말이 상한을 차지하지 않는다 — 빈칸이 조용히 줄어든다", () => {
    // 「출원」은 어절 중간에만 있어 자리를 못 잡는다. 상한 2 를 그것이 차지하면
    // 빈칸이 1개로 줄어든다 — 다음 순위인 「진보성」이 대신 들어와야 한다.
    const p = buildBlanks(
      nodes("특허출원 이 있다.", "신규성 이 있다.", "진보성 이 있다."),
      [
        term("출원", { examCount: 9, score: 90 }),
        term("신규성", { examCount: 8, score: 80 }),
        term("진보성", { examCount: 7, score: 70 }),
      ],
      1,
      2,
    );
    expect(p.terms.map((t) => t.term)).toEqual(["신규성", "진보성"]);
  });
});

describe("채점", () => {
  it("한자 병기는 한글만 써도 정답 — 조문·판례 빈칸과 같은 잣대", () => {
    expect(judgeBlank("고안", "고안(考案)")).toBe("correct");
    expect(judgeBlank(" 신규성 ", "신규성")).toBe("correct");
    expect(judgeBlank("진보성", "신규성")).toBe("wrong");
    expect(judgeBlank("   ", "신규성")).toBe("empty");
  });

  it("★비워 둔 칸은 채점에서 뺀다 — 한 칸만 연습해도 손해가 없다", () => {
    // ★말마다 제 글조각을 준다 — 한 칸에 몰면 「한 줄에 하나」라 한 칸만 뚫려 모수가 1이 된다.
    const p = buildBlanks(nodes("신규성 이 있다.", "진보성 이 있다.", "선행기술 이 있다."), [
      term("신규성"),
      term("진보성"),
      term("선행기술"),
    ], 3);
    const s = scoreBlanks(p.hits, { 0: "신규성" });
    expect(s).toEqual({ total: 3, written: 1, correct: 1, ratio: 1 });
  });
});
