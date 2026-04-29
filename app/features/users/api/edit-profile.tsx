/**
 * Edit Profile API Endpoint
 *
 * This file implements an API endpoint for updating a user's profile information.
 * It handles form data processing, validation, avatar image uploads, and database updates.
 *
 * Key features:
 * - Form data validation with Zod schema
 * - File upload handling for avatar images
 * - Storage management with Supabase Storage
 * - Profile data updates in both auth and profiles tables
 * - Comprehensive error handling
 */

import type { Route } from "./+types/edit-profile";

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";

import { getUserProfile } from "../queries";

/**
 * Validation schema for profile update form data
 *
 * This schema defines the required fields and validation rules:
 * - name: Required, must be at least 1 character
 * - avatar: Must be a File instance (for avatar image uploads)
 * - marketingConsent: Boolean flag for marketing communications consent
 * - phone: 자유 입력 (예: 010-1234-5678 / +821012345678 / 빈값). 서버에서 정규화.
 * - notifyChannels: 'email' / 'kakao' 다중 선택 (FormData multi-value).
 *
 * The schema is used with Zod's safeParse method to validate form submissions
 * before processing them further.
 */
const schema = z.object({
  name: z.string().min(1),
  avatar: typeof File !== 'undefined' ? z.instanceof(File) : z.any(),
  marketingConsent: z.coerce.boolean(),
  phone: z
    .string()
    .max(40)
    .optional()
    .transform((v) => (v && v.trim().length > 0 ? v.trim() : "")),
});

// "010-1234-5678", "01012345678", "+82 10-1234-5678" 등을 +8210XXXXXXXX 로 정규화.
// 빈 문자열 → null. 형식 위반 → "invalid" 반환.
function normalizePhoneToE164(raw: string): string | null | "invalid" {
  if (!raw) return null;
  const stripped = raw.replace(/[\s\-()._]/g, "");
  if (stripped.length === 0) return null;
  if (/^\+8210\d{7,8}$/.test(stripped)) return stripped;
  if (/^8210\d{7,8}$/.test(stripped)) return `+${stripped}`;
  if (/^010\d{7,8}$/.test(stripped)) return `+82${stripped.slice(1)}`;
  return "invalid";
}

const NOTIFY_CHANNEL_VALUES = ["email", "kakao"] as const;
type NotifyChannel = (typeof NOTIFY_CHANNEL_VALUES)[number];

// 모든 fieldErrors 응답이 동일한 shape 을 갖도록 통일 (TS 분기 단순화).
type FieldErrors = {
  name?: string[];
  avatar?: string[];
  marketingConsent?: string[];
  phone?: string[];
  notifyChannels?: string[];
};


/**
 * Action handler for processing profile update requests
 *
 * This function handles the complete profile update flow:
 * 1. Validates the request method and authentication status
 * 2. Processes and validates form data using the Zod schema
 * 3. Handles avatar image uploads to Supabase Storage
 * 4. Updates profile information in both auth and profiles tables
 * 5. Returns appropriate success or error responses
 *
 * Security considerations:
 * - Validates authentication status before processing
 * - Validates file size and type for avatar uploads
 * - Uses user ID from authenticated session for database operations
 * - Handles errors gracefully with appropriate status codes
 *
 * @param request - The incoming HTTP request with form data
 * @returns Response indicating success or error with appropriate details
 */
export async function action({ request }: Route.ActionArgs) {
  // Create a server-side Supabase client with the user's session
  const [client] = makeServerClient(request);
  
  // Get the authenticated user's information
  const {
    data: { user },
  } = await client.auth.getUser();

  // Validate request method (only allow POST)
  if (request.method !== "POST") {
    return data(null, { status: 405 }); // Method Not Allowed
  }
  
  // Ensure user is authenticated
  if (!user) {
    return data(null, { status: 401 }); // Unauthorized
  }
  
  // Extract and validate form data
  const formData = await request.formData();

  // notifyChannels 는 다중 선택이라 별도 추출 (Object.fromEntries 는 첫 값만 가져감).
  const rawChannels = formData
    .getAll("notifyChannels")
    .map((v) => String(v))
    .filter((v): v is NotifyChannel =>
      (NOTIFY_CHANNEL_VALUES as readonly string[]).includes(v),
    );

  const {
    success,
    data: validData,
    error,
  } = schema.safeParse(Object.fromEntries(formData));

  // Return validation errors if any
  if (!success) {
    const fieldErrors: FieldErrors = error.flatten().fieldErrors;
    return data({ fieldErrors }, { status: 400 });
  }

  const phoneNormalized = normalizePhoneToE164(validData.phone);
  if (phoneNormalized === "invalid") {
    const fieldErrors: FieldErrors = {
      phone: ["휴대폰 번호 형식이 올바르지 않습니다 (예: 010-1234-5678)"],
    };
    return data({ fieldErrors }, { status: 400 });
  }

  // 채널 검증: 최소 1개 + 카카오 선택은 폰 등록 시에만 허용.
  const channels: NotifyChannel[] =
    rawChannels.length > 0 ? Array.from(new Set(rawChannels)) : ["email"];
  if (channels.includes("kakao") && !phoneNormalized) {
    const fieldErrors: FieldErrors = {
      notifyChannels: [
        "카카오 채널을 사용하려면 휴대폰 번호를 등록해야 합니다.",
      ],
    };
    return data({ fieldErrors }, { status: 400 });
  }
  
  // Get current user profile to determine existing avatar URL
  const profile = await getUserProfile(client, { userId: user.id });
  let avatarUrl = profile?.avatar_url || null;
  
  // Handle avatar image upload if a valid file was provided
  if (
    validData.avatar &&
    validData.avatar instanceof File &&
    validData.avatar.size > 0 &&
    validData.avatar.size < 1024 * 1024 && // 1MB size limit
    validData.avatar.type.startsWith("image/") // Ensure it's an image file
  ) {
    // Upload avatar to Supabase Storage
    const { error: uploadError } = await client.storage
      .from("avatars")
      .upload(user.id, validData.avatar, {
        upsert: true, // Replace existing avatar if any
      });
      
    // Handle upload errors
    if (uploadError) {
      return data({ error: uploadError.message }, { status: 400 });
    }
    
    // Get public URL for the uploaded avatar
    const {
      data: { publicUrl },
    } = await client.storage.from("avatars").getPublicUrl(user.id);
    avatarUrl = publicUrl;
  }
  
  // Update profile information in the profiles table
  const { error: updateProfileError } = await client
    .from("profiles")
    .update({
      name: validData.name,
      marketing_consent: validData.marketingConsent,
      avatar_url: avatarUrl,
      phone_e164: phoneNormalized,
      notify_channels: channels,
    })
    .eq("profile_id", user.id);
    
  // Update user metadata in the auth table
  const { error: updateError } = await client.auth.updateUser({
    data: {
      name: validData.name,
      display_name: validData.name,
      marketing_consent: validData.marketingConsent,
      avatar_url: avatarUrl,
    },
  });
  
  // Handle auth update errors
  if (updateError) {
    return data({ error: updateError.message }, { status: 400 });
  }
  
  // Handle profile update errors
  if (updateProfileError) {
    return data({ error: updateProfileError.message }, { status: 400 });
  }

  // Return success response
  return {
    success: true,
  };
}
