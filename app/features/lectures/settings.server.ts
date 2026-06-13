// 강의노트 통합본 PDF 위치링크 — 학생 노출 플래그 (app_settings 재사용).
//   staff(instructor/manager/admin)는 플래그와 무관하게 항상 미리보기.
//   학생은 이 플래그가 true 일 때만 통합본 위치 링크를 본다(끄면 조각으로 복귀).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import { getAppSetting } from "~/core/lib/app-settings.server";

export const PDF_LOCATIONS_ENABLED_KEY = "lecture_pdf_locations_enabled";

/** 학생에게 통합본 PDF 위치 링크를 노출할지. 미설정/비boolean = false(기본 꺼짐). */
export async function getPdfLocationsEnabled(
  client: SupabaseClient<Database>,
): Promise<boolean> {
  const raw = await getAppSetting(client, PDF_LOCATIONS_ENABLED_KEY);
  return raw === true;
}
