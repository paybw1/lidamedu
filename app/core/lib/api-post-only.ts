// POST 전용 리소스 라우트(/api/*)의 GET 접근(브라우저 직접 열기·크롤러) 처리.
// loader 가 없으면 React Router 가 500(Unexpected Server Error)을 던지므로,
// action-only 라우트는 이 loader 를 재수출해 405 로 정중히 거절한다:
//   export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
// ★비-server lib 인 이유: loader 재수출이 클라이언트 번들 분석에 걸려도 무해하도록.
// ★Response.json 사용 — 리소스 라우트 GET 에서 react-router data() 의 status 가
//   전파되지 않는 것을 확인(200 으로 나감). 표준 Response 는 그대로 반환된다.
export function postOnlyLoader() {
  return Response.json(
    { error: "POST 전용 API 입니다." },
    { status: 405, headers: { Allow: "POST" } },
  );
}
