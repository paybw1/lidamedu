import type { Route } from "./+types/success";

import { useEffect, useState } from "react";
import { redirect, useSearchParams } from "react-router";
import { useParams } from "react-router";
import { toast } from "sonner";
import Stripe from "stripe";

import makeServerClient from "~/core/lib/supa-client.server";

export async function loader({ request, params }: Route.LoaderArgs) {
  console.log("🚀 [loader] params in success.tsx", params);
  console.log("🚀 [loader] request in success.tsx", request);
  const [client] = makeServerClient(request);
  const url = new URL(request.url);
  const payment_intent = url.searchParams.get("payment_intent");
  const client_secret = url.searchParams.get("payment_intent_client_secret");
  const redirect_status = url.searchParams.get("redirect_status");

  if (!payment_intent || !client_secret || redirect_status !== "succeeded") {
    throw new Response("❌ 결제 인증 정보가 누락되었거나 실패함", {
      status: 400,
    });
  }

  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    throw redirect("/login");
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-06-30.basil",
  });

  const intent = await stripe.paymentIntents.retrieve(payment_intent);
  const amount = intent.amount ?? 0;
  const method = intent.payment_method_types?.[0] ?? "unknown";

  const { error: rpcError } = await client.rpc("submit_patent_payment", {
    _user_id: user.id,
    _patent_id: params.patent_id,
    _process_id: params.process_id,
    _amount: amount,
    _payment_method: method,
    _payment_ref: intent.id,
  });

  if (rpcError) {
    return { status: "rpc_failed", error: rpcError.message };
  }

  return {
    status: "success",
    amount,
    method,
  };
}

export default function PaymentSuccessPage({
  loaderData,
}: Route.ComponentProps) {
  return (
    <div className="p-4">
      {loaderData.status === "success" ? (
        <div>
          <h2 className="text-xl font-bold">
            ✅ 결제{loaderData.amount}가 성공적으로 완료되었습니다.
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            출원서 제출 준비가 진행 중입니다.
          </p>
        </div>
      ) : (
        <div>
          <h2 className="text-xl font-bold">
            ❌ 결제{loaderData.amount}가 실패했습니다.
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            결제 실패 이유: {loaderData.error}
          </p>
        </div>
      )}
    </div>
  );
}
