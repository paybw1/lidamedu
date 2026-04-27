import type { Route } from "./+types/provisional";

import { Suspense } from "react";
import { Await } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";

// 메타데이터 설정
export const meta: Route.MetaFunction = () => {
  return [{ title: `임시 신청 | ${import.meta.env.VITE_APP_NAME}` }];
};

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();

  return {
    user,
  };
}

export default function ProvisionalPage({ loaderData }: Route.ComponentProps) {
  const { user } = loaderData;

  return (
    <div className="flex w-full flex-col items-center gap-10 pt-0 pb-8">
      <div className="w-full max-w-screen-md">
        {/* 페이지 헤더 */}
        <div className="mb-8">
          <h1 className="text-base-content mb-4 text-4xl font-bold">
            임시 신청
          </h1>
          <p className="text-base-content/70">임시 신청 페이지입니다.</p>
        </div>

        {/* 메인 컨텐츠 영역 */}
        <div className="bg-base-100 rounded-lg p-6 shadow-lg">
          <div className="prose prose-lg max-w-none">
            {/* 여기에 컨텐츠가 들어갈 예정입니다 */}
          </div>
        </div>
      </div>
    </div>
  );
}
