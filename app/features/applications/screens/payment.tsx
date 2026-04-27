import { type MetaFunction, redirect } from "react-router";
import { useLoaderData } from "react-router";

// 메타데이터 설정
export const meta: MetaFunction = () => {
  return [
    { title: "결제 | SupaPlate" },
    { name: "description", content: "결제 페이지입니다." },
  ];
};

// 로더 함수
export async function loader() {
  // 예시: 결제 정보가 없으면 대시보드로 리다이렉트
  return redirect("/dashboard/provisional-applications");
}

export default function PaymentPage() {
  const data = useLoaderData<typeof loader>();

  return (
    <div className="container mx-auto px-4 py-8">
      {/* 결제 페이지 헤더 */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
          결제
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          안전하고 편리한 결제를 진행해주세요.
        </p>
      </div>

      {/* 결제 정보 섹션 */}
      <div className="grid gap-8 md:grid-cols-2">
        {/* 결제 상세 정보 */}
        <div className="rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
          <h2 className="mb-4 text-xl font-semibold text-gray-900 dark:text-gray-100">
            결제 정보
          </h2>
          <div className="space-y-4">
            {/* 여기에 결제 정보 폼이 들어갈 예정입니다 */}
            <div className="animate-pulse">
              <div className="h-4 w-3/4 rounded bg-gray-200 dark:bg-gray-700"></div>
              <div className="mt-2 h-4 w-1/2 rounded bg-gray-200 dark:bg-gray-700"></div>
            </div>
          </div>
        </div>

        {/* 결제 요약 */}
        <div className="rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
          <h2 className="mb-4 text-xl font-semibold text-gray-900 dark:text-gray-100">
            결제 요약
          </h2>
          <div className="space-y-4">
            {/* 여기에 결제 요약 정보가 들어갈 예정입니다 */}
            <div className="animate-pulse">
              <div className="h-4 w-3/4 rounded bg-gray-200 dark:bg-gray-700"></div>
              <div className="mt-2 h-4 w-1/2 rounded bg-gray-200 dark:bg-gray-700"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
