// feat-2-036 — 연습 채점 실측. UI 를 짓기 전/고친 뒤에 지표부터 확인한 기록이다.
//
// 빈칸 방식(원장 2026-09-04)으로 바뀌면서 **재는 대상도 바뀌었다**. 예전에는 목차 15줄을
// 한 덩이로 맞췄지만, 지금은 칸 하나(제목 한 줄 · 본문 한 문단)를 따로 맞춘다.
// 제목은 핵심어가 2~4개뿐이라 "한두 개 어긋나면 비율이 크게 흔들리지 않는가"가 쟁점이다.
//
// ★실제로 쓰는 경로(`scorePractice`)로 잰다 — 손으로 만든 문자열을 재면 배포되는
//   동작과 다른 것을 재게 된다(한자 보존·숫자 제외가 여기서 갈린다).
import { describe, expect, it } from "vitest";

import { parseEssayOutline } from "~/features/subjects/lib/essay-outline";
import { scorePractice } from "~/features/subjects/lib/essay-practice-score";

// 2026년 1번(특허) 설문 (1) 모범답안에서 발췌 — 실제 데이터의 모양 그대로.
const MODEL = `## Ⅰ. 설문 (1) — 침해금지청구에 관한 쌍방 주장과 검토 (10점)

### 1. 문제의 소재

번복된 乙의 법정 진술에 재판상 자백이 성립하는지, 무효사유가 명백함을 이유로 한 권리남용의 항변이 성립하는지가 문제된다.

### 2. 甲의 주장

#### (1) 구성요소완비의 원칙에 의한 문언침해

특허발명의 보호범위는 청구범위에 적혀 있는 사항에 따라 정하여지고, 청구항에 기재된 구성요소 전부를 실시하여야 그 보호범위에 속한다. 침해품은 구성요소 A, B, C 전부를 유기적 결합관계를 유지한 채 구비하고 있으므로 문언침해가 성립한다.

#### (2) 재판상 자백에 의한 뒷받침

제품이 어떤 구성요소를 가지고 있는지에 관한 사실의 진술로서 재판상 자백이 성립한다. 자백한 사실은 증명을 요하지 아니한다.

### 3. 결론

침해품은 구성요소 전부를 구비하여 보호범위에 속하고 진보성도 부정되지 아니하므로, 甲의 침해금지청구는 인용된다.
`;

const block = parseEssayOutline(MODEL).blocks[0];
const idOf = (title: string) => {
  const rows: { id: string; title: string }[] = [];
  const walk = (ns: typeof block.nodes) => {
    for (const n of ns) {
      rows.push({ id: n.id, title: n.title });
      walk(n.children);
    }
  };
  walk(block.nodes);
  const hit = rows.find((r) => r.title === title);
  if (!hit) throw new Error(`제목 없음: ${title}`);
  return hit.id;
};

const T_MUNEON = "(1) 구성요소완비의 원칙에 의한 문언침해";
const T_JABAEK = "(2) 재판상 자백에 의한 뒷받침";

describe("목차 연습 — 짧은 제목 한 칸 채점", () => {
  const run = (answers: Record<string, string>) =>
    scorePractice(block, "outline", answers);

  it("말을 바꿔 쓴 제목도 인정", () => {
    const s = run({ [idOf(T_MUNEON)]: "구성요소완비 원칙에 따른 문언침해" });
    const b = s.blanks.find((x) => x.model === T_MUNEON)!;
    // eslint-disable-next-line no-console
    console.log(`  제목 바꿔 쓰기: ${b.match.ratio.toFixed(2)} (${b.verdict})`);
    expect(b.verdict).toBe("accepted");
  });

  it("핵심어를 절반만 쓰면 인정되지 않는다", () => {
    const s = run({ [idOf(T_MUNEON)]: "문언침해" });
    const b = s.blanks.find((x) => x.model === T_MUNEON)!;
    // eslint-disable-next-line no-console
    console.log(`  일부만: ${b.match.ratio.toFixed(2)} (${b.verdict})`);
    expect(b.verdict).not.toBe("accepted");
  });

  it("엉뚱한 제목은 미흡", () => {
    const s = run({ [idOf(T_MUNEON)]: "정정심판의 요건과 소급효" });
    const b = s.blanks.find((x) => x.model === T_MUNEON)!;
    // eslint-disable-next-line no-console
    console.log(`  엉뚱한 제목: ${b.match.ratio.toFixed(2)} (${b.verdict})`);
    expect(b.verdict).toBe("weak");
  });

  it("★비워 둔 칸은 채점에서 뺀다 — 한 칸만 연습해도 손해가 없다", () => {
    const s = run({ [idOf(T_MUNEON)]: "구성요소완비 원칙에 따른 문언침해" });
    expect(s.writtenCount).toBe(1);
    expect(s.acceptedCount).toBe(1);
    expect(s.verdict).toBe("accepted"); // 안 쓴 칸이 0점으로 깔리지 않는다
    expect(s.totalCount).toBeGreaterThan(1);
  });

  it("★이웃 칸의 답을 그 칸의 정답으로 세지 않는다", () => {
    const s = run({ [idOf(T_MUNEON)]: "재판상 자백에 의한 뒷받침" });
    const wrong = s.blanks.find((x) => x.model === T_MUNEON)!;
    const neighbor = s.blanks.find((x) => x.model === T_JABAEK)!;
    expect(wrong.verdict).toBe("weak");
    expect(neighbor.blank).toBe(true); // 안 쓴 칸은 안 쓴 칸이다
  });
});

describe("내용 연습 — 본문 한 칸 채점", () => {
  const run = (answers: Record<string, string>) =>
    scorePractice(block, "content", answers);

  it("실제 답안 수준으로 쓰면 인정", () => {
    const s = run({
      [idOf(T_MUNEON)]:
        "특허발명의 보호범위는 청구범위에 적혀 있는 사항에 따라 정하여진다. 청구항에 기재된 구성요소 전부를 실시하여야 그 보호범위에 속하는데, 이를 구성요소완비의 원칙이라 한다. 사안에서 침해품은 구성요소 A, B, C 전부를 유기적 결합관계를 유지한 채 구비하고 있으므로 문언침해가 성립한다.",
    });
    const b = s.blanks.find((x) => x.model.includes("보호범위는 청구범위"))!;
    // eslint-disable-next-line no-console
    console.log(`  실제 답안 수준: ${b.match.ratio.toFixed(2)} (${b.verdict})`);
    expect(b.verdict).toBe("accepted");
  });

  // ★압축해 요약한 답은 「부분」으로 떨어진다(0.62). 임계값을 내려 맞추지 않는다 —
  //   2차 답안은 법률용어를 그대로 쓰는 것이 채점 요소이고, 도식 연습의 실측
  //   (제대로 쓴 답 0.73~0.96)과도 같은 자리다. 자를 물건에 맞추면 기준이 무너진다.
  it("압축해 요약한 답은 부분", () => {
    const s = run({
      [idOf(T_MUNEON)]:
        "보호범위는 청구범위에 적힌 사항으로 정해지고 청구항의 구성요소 전부를 실시해야 보호범위에 속한다(구성요소완비). 침해품이 구성요소 A B C 를 유기적 결합관계 그대로 구비하므로 문언침해가 성립한다.",
    });
    const b = s.blanks.find((x) => x.model.includes("보호범위는 청구범위"))!;
    // eslint-disable-next-line no-console
    console.log(`  압축 요약: ${b.match.ratio.toFixed(2)} (${b.verdict})`);
    expect(b.verdict).toBe("partial");
  });

  it("다른 쟁점의 법리를 쓰면 미흡", () => {
    const s = run({
      [idOf(T_MUNEON)]:
        "정정심판은 청구범위의 감축, 잘못된 기재의 정정, 분명하지 아니한 기재의 석명을 목적으로 하는 경우에만 청구할 수 있다.",
    });
    const b = s.blanks.find((x) => x.model.includes("보호범위는 청구범위"))!;
    // eslint-disable-next-line no-console
    console.log(`  다른 법리: ${b.match.ratio.toFixed(2)} (${b.verdict})`);
    expect(b.verdict).toBe("weak");
  });

  it("내용 연습은 본문이 있는 칸만 빈칸이 된다", () => {
    const s = run({});
    // 「2. 甲의 주장」은 제목만 있는 묶음이라 빈칸이 아니다.
    expect(s.blanks.some((b) => b.model.trim() === "")).toBe(false);
    expect(s.totalCount).toBe(block.leaves.length);
  });
});
