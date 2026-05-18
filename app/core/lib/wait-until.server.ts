// 응답 후 백그라운드 작업 — Vercel 서버리스 대응.
//
// Vercel 서버리스 함수는 응답을 반환하면 invocation 이 freeze/종료되어, await 하지 않은
// promise(이메일·카카오 알림 fanout 등)가 중간에 잘릴 수 있다. waitUntil 로 invocation
// 수명을 promise 완료 시점까지 연장한다. 상시 Node 서버·로컬 dev 에서는 waitUntil 이
// 무의미하지만 promise 가 자연히 끝까지 실행된다.
//
// 서버 전용 — action/loader 에서만 호출.
import { waitUntil } from "@vercel/functions";

/**
 * 응답 전송 후에도 끝까지 실행돼야 하는 best-effort 백그라운드 작업을 등록한다.
 * 전달한 promise 의 reject 는 삼켜서 로깅하므로 호출부는 별도 `.catch` 가 필요 없다.
 *
 * @example
 *   runAfterResponse(notifyNewQuestion(payload, user.id));
 */
export function runAfterResponse(work: Promise<unknown>): void {
  const safe = work.catch((error: unknown) => {
    console.error("[after-response] 백그라운드 작업 실패:", error);
  });
  try {
    waitUntil(safe);
  } catch {
    // Vercel 런타임 컨텍스트 밖(로컬 dev 등) — waitUntil 미지원.
    // work 는 이미 실행 중이므로 상시 프로세스에서 그대로 완료된다.
  }
}
