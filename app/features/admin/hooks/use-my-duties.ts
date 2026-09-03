// feat-11-011 P0 — 내 담당(duty) 집합. 사이드바·명령 팔레트·허브가 공유한다.
//
// ★원장(admin)은 모든 duty 를 우회하므로 요청 자체를 하지 않는다(null 반환).
// ★모듈 스코프 캐시로 화면 이동마다 다시 부르지 않는다. 배정이 바뀌면 새로고침 한 번.
// ★로딩 중에는 duty 화면을 **감춘 채로 둔다** — 보였다 사라지면 눌렀는데 없어지는
//   최악의 순서가 된다. 나타나는 쪽이 낫다.

import { useEffect, useState } from "react";

import type { UserRole } from "~/core/lib/roles";
import type { StaffDuty } from "~/features/admin/lib/duties";

let cached: ReadonlySet<StaffDuty> | null = null;
let inflight: Promise<ReadonlySet<StaffDuty>> | null = null;

async function fetchDuties(): Promise<ReadonlySet<StaffDuty>> {
  if (cached) return cached;
  if (!inflight) {
    inflight = fetch("/api/admin/my-duties", { headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : { duties: [] }))
      .then((j: { duties?: string[] }) => {
        cached = new Set((j.duties ?? []) as StaffDuty[]);
        return cached;
      })
      .catch(() => new Set<StaffDuty>())
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/**
 * 담당 duty 집합. 원장이거나 아직 안 불러온 동안은 null.
 * 사용하는 쪽은 `role === "admin"` 을 먼저 확인한다(원장은 전부 통과).
 */
export function useMyDuties(role: UserRole | null | undefined): ReadonlySet<StaffDuty> | null {
  const [duties, setDuties] = useState<ReadonlySet<StaffDuty> | null>(cached);
  const enabled = Boolean(role) && role !== "admin" && role !== "student";

  useEffect(() => {
    if (!enabled || duties) return;
    let alive = true;
    void fetchDuties().then((d) => {
      if (alive) setDuties(d);
    });
    return () => {
      alive = false;
    };
  }, [enabled, duties]);

  return duties;
}
