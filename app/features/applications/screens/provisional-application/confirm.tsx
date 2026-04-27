import type { Route } from "./+types/confirm";

import {
  CheckoutProvider,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { Loader2, XIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { redirect } from "react-router";

import CheckoutForm from "~/core/components/checkout-form";
import { Button } from "~/core/components/ui/button";
import { Checkbox } from "~/core/components/ui/checkbox";
import { Label } from "~/core/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "~/core/components/ui/select";
import { Separator } from "~/core/components/ui/separator";
import { Switch } from "~/core/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/core/components/ui/tooltip";
import { browserClient } from "~/core/lib/browser-client";
import makeServerClient from "~/core/lib/supa-client.server";

export const meta: Route.MetaFunction = () => {
  return [{ title: `Confirm Application | ${import.meta.env.VITE_APP_NAME}` }];
};

export async function loader({ request, params }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const { patent_id, process_id } = params;
  console.log("🚀 [loader] params", params);
  const url = new URL(request.url);
  const origin = url.origin;

  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return redirect("/login");
  }

  if (!patent_id || !process_id) {
    throw new Response("Missing required parameters", { status: 400 });
  }

  // 1️⃣ patents 테이블에서 해당 특허 가져오기
  const { data: patent, error: patentError } = await client
    .from("patents")
    .select("*")
    .eq("id", patent_id)
    .eq("user_id", user.id)
    .single();

  if (patentError || !patent) {
    throw new Response("Patent not found", { status: 404 });
  }

  // 2️⃣ processes_patents 테이블에서 해당 프로세스 가져오기
  const { data: process, error: processError } = await client
    .from("processes_patents")
    .select("*")
    .eq("id", process_id)
    .eq("user_id", user.id)
    .single();

  if (processError || !process) {
    throw new Response("Process not found", { status: 404 });
  }
  //   console.log("🚀 [loader] process", process);
  //   console.log("🚀 [loader] patent", patent);
  const default_price = 29000; // 29000 cents
  const urgent_price = 10000; // 10000 cents
  const final_price = process.is_urgent
    ? default_price + urgent_price
    : default_price;

  const items = [
    {
      name: "Provisional Patent Filing",
      amount: final_price,
      currency: "usd",
      quantity: 1,
    },
  ];

  const sessionResponse = await fetch(
    `${origin}/applications/provisional-application/api/create-checkout-session`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: user.id,
        items,
      }),
    },
  );

  const { client_secret } = await sessionResponse.json();

  // 3️⃣ 반환
  return {
    user,
    patent,
    process,
    client_secret,
  };
}

// Make sure to call `loadStripe` outside of a component’s render to avoid
// recreating the `Stripe` object on every render.
const stripePromise = loadStripe(
  "pk_test_51Qp68PFgjFzivUMi3ABZptBjWuGkeaiBgqFLsFY5ijxThyHOsvOcgwOYw5qu1xhY6tG5Y6yMRRX6DqC98ESkvJPM00NQgn4fXg",
);
stripePromise.then((stripe) => {
  if (!stripe) {
    console.error("❌ Stripe 객체가 로딩되지 않았습니다");
  } else {
    console.log("✅ Stripe 로딩 완료", stripe);
  }
});

// async function createCheckoutSession(): Promise<string> {
//   const response = await fetch(
//     `${window.location.origin}/applications/provisional-application/api/create-checkout-session`,
//     {
//       method: "POST",
//       headers: {
//         "Content-Type": "application/json",
//       },
//       body: JSON.stringify({
//         user_id: "d09cd8c7-76b5-456d-82e8-64ca6fb99996", // 사용자 UUID
//         items: [
//           {
//             name: "Provisional Patent Filing", // 상품명
//             amount: 99, // 가격 (단위: 원, 정수. Stripe는 원화도 지원)
//             currency: "usd", // 통화 (예: "krw", "usd")
//             quantity: 1, // 수량
//           },
//         ],
//       }),
//     },
//   );

//   if (!response.ok) {
//     throw new Error("Failed to create checkout session");
//   }

//   const data = await response.json();

//   // 🎯 이 client_secret은 Stripe Elements에서 결제에 사용할 key야
//   return data.client_secret;
// }

export default function Confirm({ loaderData }: Route.ComponentProps) {
  // ✅ publishable key로 stripePromise 만들기
  //   const stripePromise = loadStripe(
  //     "pk_test_51Qp68PFgjFzivUMi3ABZptBjWuGkeaiBgqFLsFY5ijxThyHOsvOcgwOYw5qu1xhY6tG5Y6yMRRX6DqC98ESkvJPM00NQgn4fXg",
  //   );
  const { patent, process, user } = loaderData;
  const [isReminderEnabled, setIsReminderEnabled] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  let return_url = "";

  if (typeof window !== "undefined") {
    return_url = `${window.location.origin}/applications/provisional-application/${loaderData.patent.id}/${loaderData.process.id}/success`;
  }

  // const return_url = `${window.location.origin}/applications/provisional-application/${loaderData.patent.id}/${loaderData.process.id}/success`;
  // ✅ React Router 프레임워크 모드에선 굳이 FormEvent import 안 해도 됨

  // useEffect(() => {
  //   const loadSecret = async () => {
  //     const secret = await createCheckoutSession();
  //     console.log("🎯 [clientSecret from server]", secret); // 여기 반드시 확인
  //     setClientSecret(secret);
  //   };
  //   loadSecret();
  // }, []);
  // ✅ 각 버튼 별 개별 상태 관리
  const [threeMonths, setThreeMonths] = useState(false);
  const [twoMonths, setTwoMonths] = useState(false);
  const [oneMonth, setOneMonth] = useState(false);
  const [twoWeeks, setTwoWeeks] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);

  const default_price = 290;
  const urgent_price = 100;
  const final_price = process.is_urgent
    ? default_price + urgent_price
    : default_price;

  // ✅ switch가 켜질 때 모든 알림 버튼을 true로 설정
  useEffect(() => {
    if (isReminderEnabled) {
      setThreeMonths(true);
      setTwoMonths(true);
      setOneMonth(true);
      setTwoWeeks(true);
    }
  }, [isReminderEnabled]);

  const handleView = async () => {
    const filePath = (process.attached_files as any[])[0].url;

    const { data, error } = await browserClient.storage
      .from("provisional-application") // ✅ your bucket name
      .createSignedUrl(filePath, 60); // 유효기간 60초

    if (error) {
      console.error("❌ Error generating signed URL:", error.message);
      return;
    }

    if (data?.signedUrl) {
      window.open(data.signedUrl, "_blank");
    }
  };

  return (
    <div className="flex w-full flex-col items-center pt-0 pb-8">
      <div className="flex w-full flex-row items-center justify-start bg-[#0e3359] px-4 py-1.5">
        <h1 className="text-md text-center font-medium text-white">
          Provisional Application
        </h1>
      </div>
      <div className="w-full border-b border-gray-300 bg-[#0e3359]">
        <div className="mx-auto w-full rounded-tl-md rounded-tr-md bg-[#f6f9fc] px-[1vw] py-4">
          <div className="flex w-full items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                // onClick={() => setIsCanceled(true)}
              >
                <XIcon className="size-4" />
              </Button>
              <span className="text-md font-light text-[#414552]">
                Confirm your provisional application before checkout
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="default"
                className="min-w-[100px] rounded-md p-3 font-semibold"
                // disabled={isSubmittingCheckout}
                // onClick={() => handleUpload("checkout")}
              >
                {/* {isSubmittingCheckout ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  "Checkout"
                )} */}
                Checkout
              </Button>
            </div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-6 gap-4">
        <div className="col-span-4 mt-10 w-full max-w-screen-md">
          <div className="px-4 py-2">
            <p className="text-xl font-medium">{patent.title_en}</p>
          </div>
          <Separator className="my-4" />
          <div className="flex flex-col items-start gap-2 px-4 py-2 md:flex-row">
            <div className="flex flex-row items-end gap-4 md:w-1/2">
              <p className="text-base font-medium">
                {`Applicant${(patent.applicant as any[])?.length === 1 ? "" : "s"}`}
              </p>
              <p className="text-muted-foreground text-medium font-light">
                {`${(patent.applicant as any[])?.length ?? 0} ${(patent.applicant as any[])?.length === 1 ? "party" : "parties"}`}
              </p>
            </div>
            <div className="flex flex-col justify-center gap-2 px-1">
              {(patent.applicant as any[])?.map((applicant: any) => (
                <div key={applicant.id} className="flex flex-col gap-1">
                  <p className="text-sm font-semibold">{applicant.name_en}</p>
                  <p className="text-sm font-light">{applicant.address_en}</p>
                </div>
              ))}
            </div>
          </div>
          <Separator className="my-4" />
          <div className="flex flex-col items-start gap-2 px-4 py-2 md:flex-row">
            <div className="flex flex-row items-end gap-4 md:w-1/2">
              <p className="text-base font-medium">
                {`Inventor${(patent.inventor as any[])?.length === 1 ? "" : "s"}`}
              </p>
              <p className="text-muted-foreground text-medium font-light">
                {`${(patent.inventor as any[])?.length ?? 0} ${(patent.inventor as any[])?.length === 1 ? "person" : "persons"}`}
              </p>
            </div>
            <div className="flex flex-col justify-center gap-2 px-1">
              {(patent.inventor as any[])?.map((inventor: any) => (
                <div key={inventor.id} className="flex flex-col gap-0 pl-0">
                  <p className="text-sm font-semibold">{inventor.name_en}</p>
                  <p className="text-sm font-light">{inventor.address_en}</p>
                </div>
              ))}
            </div>
          </div>
          <Separator className="my-4" />
          <div className="flex flex-col items-start gap-2 px-4 py-2 md:flex-row">
            <p className="text-base font-medium md:w-1/2">
              Review submitted documents
            </p>
            <div className="flex w-full flex-row justify-end gap-2 md:w-1/2 md:justify-start">
              <Button
                variant="link"
                className="pl-1 text-sm hover:bg-transparent"
                onClick={handleView}
              >
                View application file
              </Button>
            </div>
          </div>

          <Separator className="my-4" />
          <div className="flex flex-col items-start gap-2 px-4 py-2 md:flex-row">
            <p className="text-base font-medium md:w-1/2">
              Estimated filing date
            </p>
            <div className="flex w-full flex-row justify-end gap-2 md:w-1/2 md:justify-start">
              5th, October 2025
            </div>
          </div>
          <Separator className="my-4" />
          <div className="flex flex-col items-start gap-2 px-4 py-2 md:flex-row">
            <p className="text-base font-medium md:w-1/2">Summary</p>
            <div className="mt-2 flex w-full flex-col justify-end gap-2 md:w-1/2">
              <div className="flex flex-row justify-between gap-2">
                <p className="text-sm font-light">
                  Provisional application preparation and filing
                </p>
                <div className="text-sm font-light">${default_price}</div>
              </div>
              {!process.is_urgent && (
                <div className="flex flex-row justify-between gap-2">
                  <p className="text-sm font-light">Urgent processing</p>
                  <div className="text-sm font-light">${urgent_price}</div>
                </div>
              )}
              <Separator className="my-1" />
              <div className="flex flex-row justify-between gap-2">
                <p className="text-sm font-medium">Total</p>
                <div className="text-sm font-medium">${final_price}</div>
              </div>
            </div>
          </div>
          <Separator className="my-4" />
          <div className="flex flex-col gap-2 px-4 py-2 md:flex-row">
            <p className="text-base font-medium md:w-1/2">Payment method</p>
            <div className="flex flex-row justify-end gap-2 md:justify-start">
              <div className="flex w-full justify-end">
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a payment method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Payment method</SelectLabel>
                      <SelectItem value="card">Credit Card</SelectItem>
                      <SelectItem value="bank">Bank Transfer</SelectItem>
                      <SelectItem value="stablecoin">Stablecoin</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <Separator className="my-4" />
          <div className="flex flex-col items-start gap-2 px-4 py-2">
            <Label className="flex items-start gap-3 rounded-lg border p-3 has-[[aria-checked=true]]:border-blue-600 has-[[aria-checked=true]]:bg-blue-50 dark:has-[[aria-checked=true]]:border-blue-900 dark:has-[[aria-checked=true]]:bg-blue-950">
              <Switch
                id="email-notification"
                checked={isReminderEnabled}
                onCheckedChange={setIsReminderEnabled}
              />
              <div className="grid w-full gap-1.5 font-normal">
                {/* ✅ 제목 */}
                <p className="text-sm leading-none font-medium">
                  Don’t miss the 1-Year Deadline
                </p>

                {/* ✅ 설명 */}
                <p className="text-muted-foreground text-sm">
                  A provisional application must be followed by a
                  non-provisional application within 12 months. If you miss this
                  deadline, your application will become invalid and cannot be
                  revived. Turn on reminders to receive email alerts before the
                  deadline.
                </p>

                {/* ✅ 버튼 그룹 */}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() =>
                      isReminderEnabled && setThreeMonths(!threeMonths)
                    }
                    disabled={!isReminderEnabled}
                    className={`rounded-full px-3 py-0 text-sm font-light transition ${!isReminderEnabled ? "cursor-not-allowed border-none opacity-50" : ""} ${threeMonths ? "border-primary border" : "border-muted border"} `}
                  >
                    3 Months before
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() =>
                      isReminderEnabled && setTwoMonths(!twoMonths)
                    }
                    disabled={!isReminderEnabled}
                    className={`rounded-full px-3 py-0 text-sm font-light transition ${!isReminderEnabled ? "cursor-not-allowed border-none opacity-50" : ""} ${twoMonths ? "border-primary border" : "border-muted border"} `}
                  >
                    2 Months before
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => isReminderEnabled && setOneMonth(!oneMonth)}
                    disabled={!isReminderEnabled}
                    className={`rounded-full px-3 py-0 text-sm font-light transition ${!isReminderEnabled ? "cursor-not-allowed border-none opacity-50" : ""} ${oneMonth ? "border-primary border" : "border-muted border"} `}
                  >
                    1 Month before
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => isReminderEnabled && setTwoWeeks(!twoWeeks)}
                    disabled={!isReminderEnabled}
                    className={`rounded-full px-3 py-0 text-sm font-light transition ${!isReminderEnabled ? "cursor-not-allowed border-none opacity-50" : ""} ${twoWeeks ? "border-primary border" : "border-muted border"} `}
                  >
                    2 Weeks before
                  </Button>
                </div>
              </div>
            </Label>
          </div>
          <div className="flex flex-col gap-2 px-4 py-2">
            <Label className="flex items-start gap-3 rounded-lg border p-3 has-[[aria-checked=true]]:border-blue-600 has-[[aria-checked=true]]:bg-blue-50 dark:has-[[aria-checked=true]]:border-blue-900 dark:has-[[aria-checked=true]]:bg-blue-950">
              <Checkbox
                id="toggle-2"
                checked={isConfirmed}
                onCheckedChange={(checked) =>
                  setIsConfirmed(checked === "indeterminate" ? false : checked)
                }
                className="data-[state=checked]:border-blue-600 data-[state=checked]:bg-blue-600 data-[state=checked]:text-white dark:data-[state=checked]:border-blue-700 dark:data-[state=checked]:bg-blue-700"
              />
              <div className="grid gap-1.5 font-normal">
                <p className="text-sm leading-none font-medium">
                  I confirm the application details.
                </p>
                <p className="text-muted-foreground text-sm">
                  I have reviewed all information and attached documents above,
                  and wish to proceed with the submission.
                </p>
              </div>
            </Label>
          </div>
          <div className="flex w-full flex-col items-center justify-center gap-2 px-4 py-5">
            <Button
              className="w-1/2"
              disabled={!isConfirmed}
              // onClick={(e) => handleSubmit(e as any)}
            >
              Checkout
            </Button>
          </div>
        </div>
        <div className="col-span-2 mx-auto mt-20 w-full max-w-screen-md">
          <div className="flex w-full flex-col items-center justify-center gap-2 px-4 py-5">
            {loaderData.client_secret && (
              <Elements
                stripe={stripePromise}
                options={{ clientSecret: loaderData.client_secret }}
              >
                <CheckoutForm
                  onSuccess={() => {
                    console.log("✅ 결제 성공");
                  }}
                  return_url={return_url}
                />
              </Elements>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
