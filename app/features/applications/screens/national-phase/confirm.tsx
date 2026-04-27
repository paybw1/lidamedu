/**
 * National Phase Confirm Page
 *
 * 국제출원 국내단계 신청 확인 페이지입니다.
 */
import React from "react";
import { redirect } from "react-router";

export const meta = () => {
  return [
    { title: `국제출원 국내단계 확인 | ${import.meta.env.VITE_APP_NAME}` },
  ];
};

export async function loader({ request, params }: any) {
  const { patent_id, process_id } = params;

  if (!patent_id || !process_id) {
    throw new Response("Missing required parameters", { status: 400 });
  }

  // 임시 데이터 반환
  return {
    patent: {
      id: patent_id,
      title: "샘플 국제출원",
      international_application_number: "PCT/KR2023/012345",
      international_filing_date: "2023-01-15",
    },
    process: {
      id: process_id,
      is_urgent: false,
    },
    final_price: 29000,
    items: [
      {
        name: "국제출원 국내단계 진입",
        amount: 29000,
        currency: "usd",
        quantity: 1,
      },
    ],
  };
}

export default function Confirm({ loaderData }: any) {
  const { patent, process, final_price, items } = loaderData;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-gradient-to-r from-primary to-secondary bg-clip-text text-3xl font-bold text-transparent">
          국제출원 국내단계 신청 확인
        </h1>
        <p className="text-muted-foreground mt-2">
          입력하신 정보를 확인하고 결제를 진행하세요.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* 신청 정보 */}
        <div className="space-y-6">
          <div className="bg-card border-border group rounded-lg border p-6 transition-shadow duration-300 hover:shadow-lg">
            <h2 className="mb-4 text-xl font-semibold">신청 정보</h2>
            <div className="space-y-4">
              <div>
                <label className="text-muted-foreground text-sm font-medium">
                  발명의 명칭
                </label>
                <p className="text-base font-medium">{patent.title}</p>
              </div>
              <div>
                <label className="text-muted-foreground text-sm font-medium">
                  국제출원번호
                </label>
                <p className="text-base font-medium">
                  {patent.international_application_number}
                </p>
              </div>
              <div>
                <label className="text-muted-foreground text-sm font-medium">
                  국제출원일
                </label>
                <p className="text-base font-medium">
                  {patent.international_filing_date}
                </p>
              </div>
            </div>
          </div>

          {/* 결제 정보 */}
          <div className="bg-card border-border group rounded-lg border p-6 transition-shadow duration-300 hover:shadow-lg">
            <h2 className="mb-4 text-xl font-semibold">결제 정보</h2>
            <div className="space-y-4">
              {items.map((item: any, index: number) => (
                <div key={index} className="flex items-center justify-between">
                  <span className="text-base">{item.name}</span>
                  <span className="text-base font-medium">
                    ${(item.amount / 100).toFixed(2)}
                  </span>
                </div>
              ))}
              <div className="border-border border-t pt-4">
                <div className="flex items-center justify-between text-lg font-semibold">
                  <span>총 금액</span>
                  <span>${(final_price / 100).toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 결제 폼 */}
        <div className="bg-card border-border group rounded-lg border p-6 transition-shadow duration-300 hover:shadow-lg">
          <h2 className="mb-4 text-xl font-semibold">결제 진행</h2>
          <div className="py-8 text-center">
            <p className="text-muted-foreground mb-4">
              결제 시스템이 준비 중입니다.
            </p>
            <button className="btn btn-primary">결제 진행</button>
          </div>
        </div>
      </div>
    </div>
  );
}
