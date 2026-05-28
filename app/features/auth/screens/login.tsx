/**
 * Login Screen — 카카오 전용
 *
 * 로그인 수단은 카카오 OAuth 하나로 통일한다. (이메일/비밀번호·매직링크·OTP·기타 소셜 미제공)
 * 카카오는 신규/기존 구분 없이 동일 OAuth 흐름이므로 회원가입(/join)도 이 화면으로 합류한다.
 */
import type { Route } from "./+types/login";

import { Link } from "react-router";

import { Button } from "~/core/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/core/components/ui/card";

import { KakaoLogo } from "../components/logos/kakao";

export const meta: Route.MetaFunction = () => {
  return [
    {
      title: `로그인 | ${import.meta.env.VITE_APP_NAME}`,
    },
  ];
};

export default function Login() {
  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-col items-center">
          <CardTitle className="text-2xl font-semibold">로그인</CardTitle>
          <CardDescription className="text-base">
            카카오 계정으로 로그인하세요
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Button
            asChild
            className="inline-flex h-12 w-full items-center justify-center gap-2 bg-[#FEE500] text-[#191600] hover:bg-[#FADA0A]"
          >
            <Link to="/auth/social/start/kakao" viewTransition>
              <KakaoLogo className="size-5" />
              <span className="font-medium">카카오로 시작하기</span>
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
