// 확인·입력 창 — 브라우저 기본 confirm()/prompt() 를 대신하는 공용 훅 (feat-11-012 P7).
//
// ★고치기 전 증상: 결제·환불·기기 초기화 같은 되돌리기 어려운 지점에서 **브라우저 기본 팝업**이
//   떴다. 디자인이 끊기는 것보다 나쁜 건 **출처가 안 보인다**는 것이다 — 주소창 도메인만 뜨는
//   회색 상자라, 돈이 오가는 자리에 나오면 피싱과 구분이 안 된다.
//   그리고 기본 prompt() 는 **검증을 못 한다** — 일시정지 일수에 "아무거나" 를 쳐도 받아 놓고
//   서버에서 거절당했고, 환불 사유를 비워도 그때서야 막혔다.
// ★부품은 이미 있었다(shadcn alert-dialog) — 저장소에 설치돼 있는데 **사용처가 0곳**이었다.
//
// ★이관의 진짜 함정은 문구가 아니라 **호출 모양**이다. 저장소의 confirm() 159곳 중 상당수가
//   `if (!confirm(...)) return;` 처럼 **동기 분기**라, Promise 를 돌려주는 훅을 그냥 끼울 수 없다.
//   그래서 세 가지를 함께 내보낸다:
//     ① useConfirm()       — async 핸들러용. `if (!(await confirm({...}))) return;`
//     ② usePromptValue()   — 값을 받아야 하는 자리(환불 사유·일시정지 일수). 검증까지 여기서.
//     ③ useConfirmSubmit() — 폼 제출용. 제출을 한 번 막고, 확인되면 **원래 제출을 다시 일으킨다.**
// ★★useConfirmSubmit 은 제출 방식을 **고정하지 않는다.** 대상이 두 갈래(일반 `<Form>` /
//   `fetcher.Form`)인데 한쪽으로 굳히면 다른 쪽이 조용히 깨진다. 둘 다 진짜 <form> 이므로
//   `requestSubmit()` 으로 **네이티브 제출을 다시 쏘아** 각자의 제출 경로가 알아서 타게 한다.
//
// ★이 훅은 `app/core/` 에 둔다 — 2027년 오픈 때 강의 플랫폼과 학습 플랫폼이 연동되므로
//   양쪽이 같은 창을 쓴다. 강의 플랫폼 안에 두면 나중에 옮겨야 한다.
// ★이번에 옮긴 것은 **학생 대면 지점뿐**이다(D7). 운영 화면의 나머지 confirm() 은 그대로 둔다 —
//   쓰는 사람이 소수이고 손대면 회귀 위험만 는다. 옮길 때는 이 훅을 그대로 쓰면 된다.

import { createContext, useCallback, useContext } from "react";

export interface ConfirmOptions {
  /** 무엇을 확인하는지. 한 줄. */
  title: string;
  /** 되돌릴 수 있는지·무엇이 바뀌는지. 생략 가능. */
  description?: string;
  /** 실행 버튼 문구. 기본 「확인」 — 되도록 동사로 적는다(「해제」·「삭제」). */
  confirmLabel?: string;
  cancelLabel?: string;
  /** danger = 빨간 실행 버튼. 되돌릴 수 없는 일에만. */
  tone?: "default" | "danger";
}

export interface PromptOptions extends ConfirmOptions {
  /** 입력칸 위 라벨. */
  inputLabel?: string;
  placeholder?: string;
  defaultValue?: string;
  /** number 면 숫자 키패드가 뜨고 min/max 가 걸린다. */
  inputType?: "text" | "number";
  min?: number;
  max?: number;
  /** 여러 줄 입력(사유 등). */
  multiline?: boolean;
  /**
   * 값 검증. 오류 문구를 돌려주면 창이 닫히지 않고 그 문구를 보여 준다.
   * null 이면 통과. ★비어 있는지 검사는 기본으로 하므로 여기 적지 않아도 된다.
   */
  validate?: (value: string) => string | null;
}

export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;
/** 취소하면 null. 확인하면 다듬은(trim) 문자열. */
export type PromptFn = (options: PromptOptions) => Promise<string | null>;

export interface ConfirmApi {
  confirm: ConfirmFn;
  promptValue: PromptFn;
}

export const ConfirmContext = createContext<ConfirmApi | null>(null);

function useApi(): ConfirmApi {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    // ★조용히 true 를 돌려주면 **확인 없이 실행**돼 버린다. 실패는 눈에 보여야 한다.
    throw new Error(
      "useConfirm: <ConfirmDialogHost /> 가 트리에 없습니다 (root.tsx 확인).",
    );
  }
  return ctx;
}

/**
 * 확인 창을 띄우고 결과를 기다린다.
 *
 * ```ts
 * const confirm = useConfirm();
 * if (!(await confirm({ title: "이 기기를 해제할까요?", tone: "danger" }))) return;
 * ```
 */
export function useConfirm(): ConfirmFn {
  return useApi().confirm;
}

/**
 * 값을 받는 창. 취소하면 null.
 *
 * ```ts
 * const ask = usePromptValue();
 * const reason = await ask({ title: "환불 사유", inputLabel: "사유", multiline: true });
 * if (reason == null) return;
 * ```
 */
export function usePromptValue(): PromptFn {
  return useApi().promptValue;
}

/** 확인을 통과해 다시 쏘아진 제출임을 표시하는 표식 — 두 번 묻지 않기 위해. */
const PASSED = "data-confirm-passed";

/**
 * 제출 가로채기의 알맹이 — 훅 밖으로 빼 두어 **테스트로 못박을 수 있게** 한다.
 *
 * ★React Router 의 Form 구현(submitHandler)이 이렇게 생겼기 때문에 이 순서가 성립한다:
 *     onSubmit && onSubmit(event);            // ← 이 가드가 **먼저** 돈다
 *     if (event.defaultPrevented) return;     // ← 1차에서 막으면 RR 이 그대로 멈춘다
 *     event.preventDefault(); submit(submitter || event.currentTarget, …);
 *   1차: preventDefault 로 RR 을 세우고 확인 창을 띄운다.
 *   2차: requestSubmit 이 새 submit 이벤트를 쏘고, 표식이 있으니 **막지 않고** 통과 →
 *        defaultPrevented 가 false 라 RR 이 제 갈 길을 간다.
 * ★preventDefault 는 **첫 await 이전에** 불러야 한다 — RR 은 핸들러가 끝나자마자
 *   동기로 defaultPrevented 를 보므로, await 뒤로 밀면 이미 제출이 나가 버린다.
 */
export function makeSubmitGuard(confirm: ConfirmFn) {
  return (options: ConfirmOptions) =>
    async (e: React.FormEvent<HTMLFormElement>) => {
      const form = e.currentTarget;
      if (form.hasAttribute(PASSED)) {
        // 확인을 통과해 다시 쏘아진 제출 — 표식을 지우고 그대로 보낸다.
        form.removeAttribute(PASSED);
        return;
      }
      e.preventDefault(); // ★반드시 await 앞에서.
      // ★제출 버튼의 name/value 는 다시 쏠 때 사라진다. intent 를 버튼으로 나르는
      //   폼이 있으므로 그 버튼을 기억해 두고 함께 넘긴다.
      const submitter = (e.nativeEvent as SubmitEvent).submitter;
      if (!(await confirm(options))) return;
      form.setAttribute(PASSED, "");
      // ★instanceof 로 판별하지 않는다 — 다른 창(iframe)에서 온 노드에서는 깨지고,
      //   DOM 이 없는 환경에서는 전역이 없어 던진다. 제출 버튼인지는 form 속성으로 본다.
      const isSubmitter =
        submitter != null && typeof submitter === "object" && "form" in submitter;
      form.requestSubmit(isSubmitter ? (submitter as HTMLButtonElement) : undefined);
    };
}

export function useConfirmSubmit() {
  const confirm = useConfirm();
  return useCallback(makeSubmitGuard(confirm), [confirm]);
}
