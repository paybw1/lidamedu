/**
 * National Phase Success Page
 *
 * 국제출원 국내단계 신청 성공 페이지입니다.
 */
import React from "react";
import { redirect } from "react-router";

export async function loader({ request, params }: any) {
  const url = new URL(request.url);
  const payment_intent = url.searchParams.get("payment_intent");
  const client_secret = url.searchParams.get("payment_intent_client_secret");
  const redirect_status = url.searchParams.get("redirect_status");

  if (!payment_intent || !client_secret || redirect_status !== "succeeded") {
    throw new Response("❌ 결제 인증 정보가 누락되었거나 실패함", {
      status: 400,
    });
  }

  // 임시 성공 데이터 반환
  return {
    status: "success",
    amount: 29000,
    method: "card",
  };
}

export default function PaymentSuccessPage({ loaderData }: any) {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mx-auto max-w-2xl text-center">
        {loaderData.status === "success" ? (
          <div className="space-y-6">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <svg
                className="h-8 w-8 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h1 className="text-gradient-to-r from-primary to-secondary bg-clip-text text-3xl font-bold text-transparent">
              국제출원 국내단계 신청 완료
            </h1>
            <p className="text-muted-foreground text-lg">
              결제가 성공적으로 완료되었습니다.
            </p>
            <div className="bg-card border-border group rounded-lg border p-6 transition-shadow duration-300 hover:shadow-lg">
              <h2 className="mb-4 text-xl font-semibold">결제 정보</h2>
              <div className="space-y-2 text-left">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">결제 금액:</span>
                  <span className="font-medium">
                    ${(loaderData.amount / 100).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">결제 방법:</span>
                  <span className="font-medium capitalize">
                    {loaderData.method}
                  </span>
                </div>
              </div>
            </div>
            <p className="text-muted-foreground text-sm">
              출원서 제출 준비가 진행 중입니다. 이메일로 진행 상황을
              안내드리겠습니다.
            </p>
            <div className="flex justify-center space-x-4">
              <button className="btn btn-primary">대시보드로 이동</button>
              <button className="btn btn-outline">신청 내역 보기</button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
              <svg
                className="h-8 w-8 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-red-600">결제 실패</h1>
            <p className="text-muted-foreground text-lg">
              결제 처리 중 오류가 발생했습니다.
            </p>
            <p className="text-muted-foreground text-sm">
              결제 실패 이유: {loaderData.error}
            </p>
            <div className="flex justify-center space-x-4">
              <button className="btn btn-primary">다시 시도</button>
              <button className="btn btn-outline">고객 지원</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
