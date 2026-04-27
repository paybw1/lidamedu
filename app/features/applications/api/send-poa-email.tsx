import type { Route } from "../screens/+types/provisional";

import resendClient from "~/core/lib/resend-client.server";

export const action = async ({ request }: Route.LoaderArgs) => {
  const { email, poaUrl } = await request.json();

  const res = await fetch(poaUrl);
  const buffer = await res.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");

  console.log("🚀 [action] 실행됨", { email, poaUrl });

  await resendClient.emails.send({
    to: email,
    from: "BRANDIT POA <poa@brandit-ip.com>",
    subject: "Your POA Form",
    html: "<p>Please find your Power of Attorney form attached.</p>",
    attachments: [
      {
        filename: "POA.pdf",
        content: base64,
      },
    ],
  });
  console.log("🚀 [action] 실행됨 2", { email, poaUrl });

  // ✅ React Router 7: Response 객체를 직접 반환
  return new Response(JSON.stringify({ status: "sent" }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
  console.log("🚀 [action] 실행됨 3", { email, poaUrl });
};
