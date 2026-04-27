/**
 * National Phase FAQ Page
 *
 * 국제출원 국내단계 관련 자주 묻는 질문 페이지입니다.
 */
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "~/core/components/ui/accordion";

export default function FAQ() {
  return (
    <div className="prose prose-sm dark:prose-invert">
      <h1 className="text-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
        자주 묻는 질문
      </h1>
      <div className="not-prose">
        <Accordion type="single" collapsible className="w-full space-y-4">
          <AccordionItem
            value="item-1"
            className="group hover:bg-muted/50 rounded-lg transition-colors"
          >
            <AccordionTrigger className="group-hover:text-primary transition-colors">
              국제출원 국내단계란 무엇인가요?
            </AccordionTrigger>
            <AccordionContent>
              국제출원 국내단계는 PCT(Patent Cooperation Treaty) 국제출원을 통해
              특정 국가에서 특허를 받기 위해 해당 국가의 특허청에 진입하는
              과정입니다. 국제출원 후 30개월(또는 31개월) 이내에 원하는 국가에
              국내단계 진입을 신청해야 합니다.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem
            value="item-2"
            className="group hover:bg-muted/50 rounded-lg transition-colors"
          >
            <AccordionTrigger className="group-hover:text-primary transition-colors">
              국내단계 진입 기간은 언제인가요?
            </AccordionTrigger>
            <AccordionContent>
              국제출원일로부터 30개월(또는 31개월) 이내에 국내단계 진입을
              신청해야 합니다. 이 기간을 놓치면 해당 국가에서 특허를 받을 수
              없으므로 반드시 기한을 지켜야 합니다.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem
            value="item-3"
            className="group hover:bg-muted/50 rounded-lg transition-colors"
          >
            <AccordionTrigger className="group-hover:text-primary transition-colors">
              어떤 서류가 필요한가요?
            </AccordionTrigger>
            <AccordionContent>
              국제출원번호, 국제출원일, 발명의 명칭, 요약서 등이 필요합니다.
              또한 해당 국가의 언어로 번역된 명세서와 청구범위가 필요할 수
              있습니다. 우리가 모든 서류 준비를 도와드립니다.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem
            value="item-4"
            className="group hover:bg-muted/50 rounded-lg transition-colors"
          >
            <AccordionTrigger className="group-hover:text-primary transition-colors">
              처리 기간은 얼마나 걸리나요?
            </AccordionTrigger>
            <AccordionContent>
              기본 신청의 경우 7-10일, 긴급 신청의 경우 3-5일 내에 국내단계
              진입이 완료됩니다. 국가별로 차이가 있을 수 있으므로 구체적인
              기간은 문의해 주세요.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem
            value="item-5"
            className="group hover:bg-muted/50 rounded-lg transition-colors"
          >
            <AccordionTrigger className="group-hover:text-primary transition-colors">
              여러 국가에 동시에 진입할 수 있나요?
            </AccordionTrigger>
            <AccordionContent>
              네, 가능합니다. 여러 국가에 동시에 국내단계 진입을 신청할 수
              있으며, 각 국가별로 필요한 서류와 수수료를 준비하여 처리합니다.
              대량 신청 시 할인 혜택도 제공됩니다.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem
            value="item-6"
            className="group hover:bg-muted/50 rounded-lg transition-colors"
          >
            <AccordionTrigger className="group-hover:text-primary transition-colors">
              국내단계 진입 후의 절차는 어떻게 되나요?
            </AccordionTrigger>
            <AccordionContent>
              국내단계 진입 후에는 해당 국가의 특허청에서 실질심사를 진행합니다.
              심사관의 의견이 있을 경우 답변서를 제출하고, 최종적으로 특허 등록
              여부가 결정됩니다. 전체 과정은 보통 2-5년이 소요됩니다.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
}
