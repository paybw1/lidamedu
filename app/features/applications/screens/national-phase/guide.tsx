/**
 * National Phase Guide Page
 *
 * 국제출원 국내단계 진입 가이드 페이지입니다.
 */
export default function Guide() {
  return (
    <div className="prose prose-sm dark:prose-invert mx-auto max-w-4xl">
      <h1 className="text-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
        국제출원 국내단계 진입 가이드
      </h1>

      <div className="bg-card border-border group mb-8 rounded-lg border p-6 transition-shadow duration-300 hover:shadow-lg">
        <h2 className="mb-4 text-xl font-semibold text-[#0a2540]">
          1단계: 국제출원 정보 확인
        </h2>
        <p className="mb-4 text-[#586879]">
          국제출원번호(PCT 번호)와 국제출원일을 확인하세요. 이 정보는 국제출원
          시 받은 영수증에서 확인할 수 있습니다.
        </p>
        <ul className="list-inside list-disc space-y-2 text-[#586879]">
          <li>국제출원번호 형식: PCT/KR2023/012345</li>
          <li>국제출원일: 국제출원을 제출한 날짜</li>
          <li>발명의 명칭: 국제출원 시 사용한 명칭</li>
          <li>요약서: 국제출원의 요약 내용</li>
        </ul>
      </div>

      <div className="bg-card border-border group mb-8 rounded-lg border p-6 transition-shadow duration-300 hover:shadow-lg">
        <h2 className="mb-4 text-xl font-semibold text-[#0a2540]">
          2단계: 국내단계 진입 신청
        </h2>
        <p className="mb-4 text-[#586879]">
          국제출원일로부터 30개월(또는 31개월) 이내에 국내단계 진입을 신청해야
          합니다. 우리 플랫폼을 통해 신청하면:
        </p>
        <ul className="list-inside list-disc space-y-2 text-[#586879]">
          <li>국제출원 정보 검증 및 확인</li>
          <li>국내단계 진입 요건 검토</li>
          <li>필요 서류 준비 및 번역</li>
          <li>해당 국가 특허청에 제출</li>
        </ul>
      </div>

      <div className="bg-card border-border group mb-8 rounded-lg border p-6 transition-shadow duration-300 hover:shadow-lg">
        <h2 className="mb-4 text-xl font-semibold text-[#0a2540]">
          3단계: 결제 및 확인
        </h2>
        <p className="mb-4 text-[#586879]">
          신청 정보를 확인하고 결제를 진행하세요. 결제 완료 후:
        </p>
        <ul className="list-inside list-disc space-y-2 text-[#586879]">
          <li>국내단계 진입 신청서 제출</li>
          <li>수수료 납부 확인</li>
          <li>진입 확인서 발급</li>
          <li>진행 상황 모니터링 시작</li>
        </ul>
      </div>

      <div className="bg-card border-border group mb-8 rounded-lg border p-6 transition-shadow duration-300 hover:shadow-lg">
        <h2 className="mb-4 text-xl font-semibold text-[#0a2540]">
          4단계: 실질심사 대기
        </h2>
        <p className="mb-4 text-[#586879]">
          국내단계 진입이 완료되면 해당 국가의 특허청에서 실질심사를 진행합니다:
        </p>
        <ul className="list-inside list-disc space-y-2 text-[#586879]">
          <li>심사관의 선행기술 조사</li>
          <li>신규성 및 진보성 검토</li>
          <li>명세서 및 청구범위 검토</li>
          <li>심사 의견서 발송 (필요시)</li>
        </ul>
      </div>

      <div className="group rounded-lg border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-6 transition-shadow duration-300 hover:shadow-lg">
        <h2 className="mb-4 text-xl font-semibold text-[#0a2540]">주의사항</h2>
        <div className="space-y-3 text-[#586879]">
          <div className="flex items-start space-x-2">
            <div className="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-red-500"></div>
            <p>
              국내단계 진입 기한을 반드시 지켜야 합니다. 기한을 놓치면 해당
              국가에서 특허를 받을 수 없습니다.
            </p>
          </div>
          <div className="flex items-start space-x-2">
            <div className="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-yellow-500"></div>
            <p>
              각 국가별로 요구하는 서류와 수수료가 다를 수 있으므로 사전에
              확인이 필요합니다.
            </p>
          </div>
          <div className="flex items-start space-x-2">
            <div className="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-green-500"></div>
            <p>
              국내단계 진입 후에는 해당 국가의 특허법에 따라 절차가 진행됩니다.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
