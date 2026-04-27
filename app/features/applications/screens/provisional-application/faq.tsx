/**
 * FAQ Page
 *
 * 한국 가출원 관련 자주 묻는 질문 페이지입니다.
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
      <h1>Frequently Asked Questions</h1>
      <div className="not-prose">
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="item-1">
            <AccordionTrigger>
              What is a Korean provisional application?
            </AccordionTrigger>
            <AccordionContent>
              A Korean provisional application is similar to a U.S. provisional
              application. It establishes a priority date for your invention
              while giving you 12 months to file a regular patent application.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-2">
            <AccordionTrigger>How long does it take to file?</AccordionTrigger>
            <AccordionContent>
              Once you provide all necessary documents, we can file your
              application within 1-2 business days. You'll receive the official
              filing receipt shortly after.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-3">
            <AccordionTrigger>
              What documents do I need to provide?
            </AccordionTrigger>
            <AccordionContent>
              You'll need to provide a description of your invention in English,
              including any drawings if applicable. We'll handle the translation
              and formatting according to Korean patent office requirements.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
}
