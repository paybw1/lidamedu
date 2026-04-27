// Daisy UI와 Tailwind가 적용된 반응형 빈 페이지입니다.
// 추후 결제 관련 UI를 이곳에 구현하세요.
import React from "react";

const ProvisionalPaymentPage = () => {
  return (
    <main className="from-base-100 to-base-200 flex min-h-screen items-center justify-center bg-gradient-to-b">
      {/* 이곳에 결제 페이지 UI를 추가하세요 */}
      <div className="text-center">
        <h1 className="text-primary mb-4 text-2xl font-bold">
          임시 결제 페이지
        </h1>
        <p className="text-base-content/70">
          여기에 결제 관련 내용을 추가하세요.
        </p>
      </div>
    </main>
  );
};

export default ProvisionalPaymentPage;
