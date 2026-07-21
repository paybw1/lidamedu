// feat-7-046 회원 CRM — 회원정보/회원이력 탭 데이터.
// staff 조회이므로 cross-user private 데이터는 adminClient(RLS 우회) 사용.
// (profiles RLS 는 staff 에게도 본인만 허용 → 타 회원 조회는 adminClient 필수.)

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";

// ── 회원정보 (프로필 기재사항 + 로그인 계정) ──────────────────────────────
export interface MemberProfile {
  profileId: string;
  name: string;
  nickname: string | null;
  memberNo: number | null;
  phoneE164: string | null;
  address: string | null;
  avatarUrl: string | null;
  role: Database["public"]["Enums"]["user_role"];
  marketingConsent: boolean;
  notifyChannels: string[];
  nextExamYear: number | null;
  nextExamRound: Database["public"]["Enums"]["exam_round"] | null;
  membershipTestGrade: string | null;
  createdAt: string;
  onboardedAt: string | null;
  accessApprovedAt: string | null;
  trialEndsAt: string | null;
  serviceDataConsentAt: string | null;
  analyticsConsentAt: string | null;
  // 로그인 계정(auth)
  email: string | null;
  emailConfirmedAt: string | null;
  providers: string[]; // ['kakao'] 등 연결된 로그인 수단
  lastSignInAt: string | null;
}

export async function getMemberProfile(
  profileId: string,
): Promise<MemberProfile | null> {
  const { data: p } = await adminClient
    .from("profiles")
    .select(
      "profile_id, name, nickname, member_no, phone_e164, address, avatar_url, role, marketing_consent, notify_channels, next_exam_year, next_exam_round, membership_test_grade, created_at, onboarded_at, access_approved_at, trial_ends_at, service_data_consent_at, analytics_consent_at",
    )
    .eq("profile_id", profileId)
    .maybeSingle();
  if (!p) return null;

  // 이메일·로그인 수단·최근 로그인 — auth.users 에서.
  const { data: authRes } = await adminClient.auth.admin.getUserById(profileId);
  const authUser = authRes?.user ?? null;
  const providers = authUser
    ? Array.from(
        new Set(
          (authUser.identities ?? [])
            .map((i) => i.provider)
            .filter((v): v is string => !!v),
        ),
      )
    : [];

  return {
    profileId: p.profile_id,
    name: p.name,
    nickname: p.nickname,
    memberNo: p.member_no,
    phoneE164: p.phone_e164,
    address: p.address,
    avatarUrl: p.avatar_url,
    role: p.role,
    marketingConsent: p.marketing_consent,
    notifyChannels: p.notify_channels ?? [],
    nextExamYear: p.next_exam_year,
    nextExamRound: p.next_exam_round,
    membershipTestGrade: p.membership_test_grade,
    createdAt: p.created_at,
    onboardedAt: p.onboarded_at,
    accessApprovedAt: p.access_approved_at,
    trialEndsAt: p.trial_ends_at,
    serviceDataConsentAt: p.service_data_consent_at,
    analyticsConsentAt: p.analytics_consent_at,
    email: authUser?.email ?? null,
    emailConfirmedAt: authUser?.email_confirmed_at ?? null,
    providers,
    lastSignInAt: authUser?.last_sign_in_at ?? null,
  };
}

// ── 회원이력 · 접속 기록 ──────────────────────────────────────────────────
export interface AccessLogRow {
  createdAt: string;
  kind: string;
  client: string | null;
  browser: string | null;
  device: string | null;
  ip: string | null;
}

export async function listUserAccessLogs(
  profileId: string,
  limit = 40,
): Promise<AccessLogRow[]> {
  const { data } = await adminClient
    .from("user_access_logs")
    .select("created_at, kind, client, browser, device, ip")
    .eq("user_id", profileId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => ({
    createdAt: r.created_at,
    kind: r.kind,
    client: r.client,
    browser: r.browser,
    device: r.device,
    ip: r.ip,
  }));
}

// ── 회원이력 · 다운로드(도서 PDF) ─────────────────────────────────────────
export interface DownloadRow {
  at: string;
  label: string;
}

export async function listUserBookDownloads(
  profileId: string,
  limit = 40,
): Promise<DownloadRow[]> {
  const { data } = await adminClient
    .from("book_downloads")
    .select("created_at, books(title)")
    .eq("user_id", profileId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => ({
    at: r.created_at,
    label:
      (r.books as { title: string } | null)?.title ?? "(도서)",
  }));
}

// ── 회원정보 안전 편집 저장 ───────────────────────────────────────────────
export interface UpdateMemberProfileInput {
  name: string;
  nickname: string | null;
  phoneE164: string | null;
  address: string | null;
  marketingConsent: boolean;
}

export async function updateMemberProfile(
  _client: SupabaseClient<Database>,
  profileId: string,
  input: UpdateMemberProfileInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await adminClient
    .from("profiles")
    .update({
      name: input.name,
      nickname: input.nickname,
      phone_e164: input.phoneE164,
      address: input.address,
      marketing_consent: input.marketingConsent,
      updated_at: new Date().toISOString(),
    })
    .eq("profile_id", profileId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
