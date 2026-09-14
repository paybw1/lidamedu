// 폼 제출 가로채기 테스트 (feat-11-012 P7).
//
// ★못박는 것은 **React Router 의 Form 과 맞물리는 순서**다. RR 의 submitHandler 는 이렇게 생겼다:
//     onSubmit && onSubmit(event);          // ← 이 가드가 먼저 돈다
//     if (event.defaultPrevented) return;   // ← 1차에서 막으면 RR 이 멈춘다
//     event.preventDefault(); submit(submitter || event.currentTarget, …);
//   그래서 ① 1차에는 **await 이전에** preventDefault 가 불려야 하고(뒤로 밀면 RR 이 이미
//   제출을 보낸 뒤다) ② 2차(다시 쏜 제출)에는 **막지 않아야** RR 이 제 갈 길을 간다.
//   이 두 가지가 어긋나면 「확인을 눌렀는데 아무 일도 안 난다」 또는 「묻지도 않고 나간다」가 된다.

import { describe, expect, it, vi } from "vitest";

import { makeSubmitGuard } from "./use-confirm";

const PASSED = "data-confirm-passed";

/** 진짜 DOM 없이 form 의 필요한 부분만 흉내 낸다(테스트 환경이 node 다). */
function fakeForm() {
  const attrs = new Set<string>();
  return {
    requestSubmit: vi.fn(),
    hasAttribute: (n: string) => attrs.has(n),
    setAttribute: (n: string) => attrs.add(n),
    removeAttribute: (n: string) => attrs.delete(n),
    _attrs: attrs,
  };
}

function fakeEvent(form: ReturnType<typeof fakeForm>, submitter: unknown = null) {
  const e = {
    currentTarget: form,
    nativeEvent: { submitter },
    defaultPrevented: false,
    preventDefault: vi.fn(function (this: void) {
      e.defaultPrevented = true;
    }),
  };
  return e;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (guard: any, e: unknown) => guard(e as never) as Promise<void>;

describe("makeSubmitGuard — 1차 제출", () => {
  it("★await 이전에 preventDefault 가 불린다 — RR 이 동기로 defaultPrevented 를 보기 때문", async () => {
    let released: (v: boolean) => void = () => {};
    const confirm = vi.fn(
      () => new Promise<boolean>((r) => (released = r)),
    );
    const form = fakeForm();
    const e = fakeEvent(form);
    const p = run(makeSubmitGuard(confirm)({ title: "t" }), e);

    // 아직 확인 창에 답하지 않았는데도 이미 막혀 있어야 한다.
    expect(e.preventDefault).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(true);
    released(false);
    await p;
  });

  it("취소하면 다시 쏘지 않는다 — 아무 일도 일어나지 않아야 한다", async () => {
    const form = fakeForm();
    const e = fakeEvent(form);
    await run(makeSubmitGuard(async () => false)({ title: "t" }), e);
    expect(form.requestSubmit).not.toHaveBeenCalled();
    expect(form.hasAttribute(PASSED)).toBe(false);
  });

  it("확인하면 표식을 남기고 다시 쏜다", async () => {
    const form = fakeForm();
    const e = fakeEvent(form);
    await run(makeSubmitGuard(async () => true)({ title: "t" }), e);
    expect(form.requestSubmit).toHaveBeenCalledTimes(1);
    expect(form.hasAttribute(PASSED)).toBe(true);
  });

  it("★제출 버튼을 함께 넘긴다 — intent 를 버튼으로 나르는 폼이 있다", async () => {
    const form = fakeForm();
    const button = { form: {} }; // 버튼은 form 속성을 갖는다
    const e = fakeEvent(form, button);
    await run(makeSubmitGuard(async () => true)({ title: "t" }), e);
    expect(form.requestSubmit).toHaveBeenCalledWith(button);
  });

  it("제출 버튼이 없으면 undefined 로 쏜다(폼 자체 제출)", async () => {
    const form = fakeForm();
    const e = fakeEvent(form, null);
    await run(makeSubmitGuard(async () => true)({ title: "t" }), e);
    expect(form.requestSubmit).toHaveBeenCalledWith(undefined);
  });
});

describe("makeSubmitGuard — 2차(다시 쏜) 제출", () => {
  it("★막지 않고 통과시킨다 — 막으면 RR 이 멈춰 영영 제출되지 않는다", async () => {
    const confirm = vi.fn(async () => true);
    const guard = makeSubmitGuard(confirm)({ title: "t" });
    const form = fakeForm();

    await run(guard, fakeEvent(form)); // 1차 — 표식이 남는다
    expect(form.hasAttribute(PASSED)).toBe(true);

    const second = fakeEvent(form); // 2차 — requestSubmit 이 일으킨 이벤트
    await run(guard, second);

    expect(second.preventDefault).not.toHaveBeenCalled();
    expect(second.defaultPrevented).toBe(false);
    expect(confirm).toHaveBeenCalledTimes(1); // 두 번 묻지 않는다
  });

  it("표식은 한 번 쓰고 지운다 — 다음 제출은 다시 묻는다", async () => {
    const confirm = vi.fn(async () => true);
    const guard = makeSubmitGuard(confirm)({ title: "t" });
    const form = fakeForm();

    await run(guard, fakeEvent(form)); // 1차
    await run(guard, fakeEvent(form)); // 2차(통과) — 표식 소모
    expect(form.hasAttribute(PASSED)).toBe(false);

    await run(guard, fakeEvent(form)); // 새 제출
    expect(confirm).toHaveBeenCalledTimes(2);
  });
});
