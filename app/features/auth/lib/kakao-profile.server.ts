// feat-8-030 — 카카오 승인 동의항목(이름·전화번호·배송지) 자동 수집.
//
// ★왜 Kakao API 직결인가: Supabase GoTrue 는 카카오의 표준 클레임(닉네임·이메일·프로필사진)만
//   user_metadata 로 매핑한다. 추가 동의항목(실명 name·phone_number·shipping_address)은
//   user_metadata 에 실리지 않으므로, OAuth 교환 직후 받은 provider_token(카카오 액세스 토큰)으로
//   `/v2/user/me` 를 직접 호출해 값을 가져와 profiles 에 채운다.
//
// 정책: 이미 채워진 필드는 보존(재로그인마다 덮어쓰지 않음). 세 항목이 모두 확보되면
//   profile_completed_at 을 설정해 온보딩 게이트(필수정보 입력)를 자동 통과. 비치명적 —
//   토큰 없음·API 실패·필드 부재 시 조용히 no-op 하고, 온보딩 게이트가 안전망으로 남는다.

import adminClient from "~/core/lib/supa-admin-client.server";
import { normalizePhoneToE164 } from "~/features/onboarding/lib/profile-info";

interface KakaoShippingAddress {
  base_address?: string;
  detail_address?: string;
}
interface KakaoMe {
  kakao_account?: {
    name?: string;
    phone_number?: string;
    shipping_addresses?: KakaoShippingAddress[];
  };
}

const KAKAO_ME_URL = "https://kapi.kakao.com/v2/user/me";
const FETCH_TIMEOUT_MS = 3500;

export async function syncKakaoProfileFromToken(
  userId: string,
  providerToken: string | null | undefined,
): Promise<void> {
  if (!providerToken) return;
  try {
    // 이미 완료됐거나 프로필 없음 → 스킵(첫 가입·미완료 사용자에게만 시도).
    const { data: profile } = await adminClient
      .from("profiles")
      .select("name, phone_e164, address, profile_completed_at")
      .eq("profile_id", userId)
      .maybeSingle();
    if (!profile || profile.profile_completed_at) return;

    // 카카오 사용자 정보 — provider_token(Bearer)으로 조회. 타임아웃으로 로그인 지연 방지.
    let me: KakaoMe | null = null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const resp = await fetch(KAKAO_ME_URL, {
        headers: { Authorization: `Bearer ${providerToken}` },
        signal: ctrl.signal,
      });
      if (!resp.ok) return;
      me = (await resp.json()) as KakaoMe;
    } finally {
      clearTimeout(timer);
    }
    const acc = me?.kakao_account;
    if (!acc) return;

    const patch: { name?: string; phone_e164?: string; address?: string } = {};

    // 이름(실명) — 기존 값이 비어 있을 때만.
    const kakaoName = acc.name?.trim();
    if (kakaoName && !profile.name?.trim()) patch.name = kakaoName;

    // 전화번호 — E164 정규화("+82 10-1234-5678" → +8210XXXXXXXX), 기존 비어 있을 때만.
    if (!profile.phone_e164 && acc.phone_number) {
      const e164 = normalizePhoneToE164(acc.phone_number);
      if (e164 && e164 !== "invalid") patch.phone_e164 = e164;
    }

    // 배송지 — 첫 주소(기본주소 + 상세주소), 기존 비어 있을 때만.
    if (!profile.address?.trim()) {
      const ship = acc.shipping_addresses?.[0];
      const addr = [ship?.base_address, ship?.detail_address]
        .map((s) => (s ?? "").trim())
        .filter((s) => s.length > 0)
        .join(" ")
        .trim();
      if (addr) patch.address = addr;
    }

    // 병합 후 세 항목이 모두 확보되면 온보딩 완료 처리(게이트 스킵).
    const finalName = patch.name ?? profile.name?.trim() ?? "";
    const finalPhone = patch.phone_e164 ?? profile.phone_e164 ?? "";
    const finalAddr = patch.address ?? profile.address?.trim() ?? "";

    const update: {
      name?: string;
      phone_e164?: string;
      address?: string;
      profile_completed_at?: string;
    } = { ...patch };
    if (finalName && finalPhone && finalAddr) {
      update.profile_completed_at = new Date().toISOString();
    }
    if (Object.keys(update).length === 0) return;

    await adminClient.from("profiles").update(update).eq("profile_id", userId);

    // 실명이 새로 확보되면 auth 표시 이름도 정정(헤더·관리자 목록 일관).
    if (patch.name) {
      await adminClient.auth.admin.updateUserById(userId, {
        user_metadata: { name: patch.name, display_name: patch.name },
      });
    }
  } catch {
    // 비치명적 — 온보딩 게이트가 안전망.
  }
}
