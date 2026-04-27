// 📁 app/routes/checkout.tsx 또는 routes 내부 페이지 컴포넌트
import type { Stripe } from "@stripe/stripe-js";

import {
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { useCallback } from "react";
import { Form } from "react-router";

import { Button } from "./ui/button";

export default function CheckoutForm({
  onSuccess,
  return_url,
}: {
  onSuccess: () => void;
  return_url: string;
}) {
  const stripe = useStripe();
  const elements = useElements();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!stripe || !elements) return;

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: return_url,
      },
    });

    if (error) {
      console.error("❌ 결제 실패:", error.message);
    } else {
      console.log("✅ 결제 성공 또는 리디렉션 중...");
      onSuccess(); // 필요한 경우 콜백 실행
    }
  };

  return (
    <Form onSubmit={handleSubmit} className="w-full">
      <PaymentElement />
      <Button type="submit" className="mt-4 w-full">
        Checkout
      </Button>
    </Form>
  );
}
