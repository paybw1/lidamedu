// 📁 src/core/epo/getEpoToken.server.ts
// 서버 전용 파일 (.server.ts) → 브라우저 번들에 비밀키 노출X

// ▸ Vite 환경변수
const EPO_CLIENT_ID = import.meta.env.VITE_EPO_CLIENT_ID!;
const EPO_CLIENT_SECRET = import.meta.env.VITE_EPO_CLIENT_SECRET!;

let cached: { value: string; expiresAt: number } | null = null;

/** 2 분도 안 남았으면 새로 얻어오기 */
export async function getEpoToken() {
  const now = Date.now();
  if (cached && cached.expiresAt - now > 120_000) {
    return cached.value; // 충분히 남았으니 그대로 사용
  }

  const basic = btoa(`${EPO_CLIENT_ID}:${EPO_CLIENT_SECRET}`);
  const res = await fetch("https://ops.epo.org/3.2/auth/accesstoken", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    console.error(await res.text());
    throw new Error("EPO 인증 실패");
  }

  const { access_token, expires_in } = await res.json();
  cached = { value: access_token, expiresAt: now + expires_in * 1000 };
  return access_token;
}
