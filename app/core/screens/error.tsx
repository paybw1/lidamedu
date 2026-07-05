import type { Route } from "./+types/error";

import { Link, useSearchParams } from "react-router";

import { Button } from "~/core/components/ui/button";

export const meta: Route.MetaFunction = () => {
  return [
    {
      title: `오류 | 리담변리사학원`,
    },
  ];
};

// 인증(OAuth) 리다이렉트 오류 — Supabase 가 영문 원문으로 돌려보내는 것을
// 수험생이 이해할 수 있는 한국어 안내 + 복구 동선(다시 로그인)으로 바꾼다.
//   bad_oauth_state: 로그인 시도(state) 만료·재사용 — 카카오 화면에 오래 머문 경우,
//     뒤로가기·이전 탭으로 예전 로그인 URL 을 다시 쓴 경우. 재시도로 해결.
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  bad_oauth_state:
    "로그인 시도가 만료되었거나 이미 사용되었습니다. 로그인 화면에 오래 머물렀거나 이전 화면으로 되돌아간 경우 생길 수 있습니다.",
  access_denied: "로그인이 취소되었습니다.",
  otp_expired: "링크가 만료되었습니다. 다시 요청해 주세요.",
};

export default function ErrorPage() {
  const [searchParams] = useSearchParams();
  const errorCode = searchParams.get("error_code");
  const errorDescription = searchParams.get("error_description");
  const authMessage = errorCode ? AUTH_ERROR_MESSAGES[errorCode] : undefined;

  if (authMessage) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-2xl font-semibold">로그인하지 못했습니다</h1>
        <p className="text-muted-foreground max-w-md text-sm leading-relaxed">
          {authMessage}
        </p>
        <Button asChild className="mt-2">
          <Link to="/login">다시 로그인하기</Link>
        </Button>
        <Button variant="link" asChild>
          <Link to="/">홈으로 &rarr;</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-2">
      <h1 className="text-3xl font-semibold text-red-700">오류</h1>
      <p className="text-muted-foreground">오류 코드: {errorCode}</p>
      <p className="text-muted-foreground">{errorDescription}</p>
      <Button variant={"link"} asChild>
        <Link to="/">홈으로 &rarr;</Link>
      </Button>
    </div>
  );
}
