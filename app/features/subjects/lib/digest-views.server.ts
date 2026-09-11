// 정리비교표 열람 로그(유출방지 ⑤) — 도해의 abuse.server.ts 와 같은 꼴, 기록만 한다.
//
// ★이상 열람 감지는 두지 않는다 — 자료가 14장뿐이라 ‹ › 로 한 바퀴 넘기는 정상 열람과
//   대량 열람을 "고유 자료 수"로 가를 수 없다(도해는 94유닛이라 25/40 임계가 뜻이 있다).
//   누가 무엇을 언제 봤는지는 남으므로 유출 시 대조는 된다.
import adminClient from "~/core/lib/supa-admin-client.server";

export async function logDigestView(input: {
  profileId: string;
  digestId: string;
}): Promise<void> {
  const { error } = await adminClient.from("systematic_digest_views").insert({
    profile_id: input.profileId,
    digest_id: input.digestId,
  });
  // best-effort — 로그 실패가 열람을 막아서는 안 되지만, 조용히 삼키면 유실을 모른다.
  if (error) console.error("[digest-view] 열람 로그 실패:", error.message);
}
