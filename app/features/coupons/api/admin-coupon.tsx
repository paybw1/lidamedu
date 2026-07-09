// feat-13 쿠폰 저장/삭제 액션 — staff 게이트, 요청 클라이언트(RLS staff 백스톱).
import { randomBytes } from "node:crypto";

import type { Database } from "database.types";
import { data, redirect } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";

import { codeExists, getCoupon } from "../queries.server";

import type { Route } from "./+types/admin-coupon";

const str = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").trim();
  return v.length ? v : null;
};
const int = (fd: FormData, k: string) => {
  const n = Number(fd.get(k));
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
};

// 쿠폰 코드 생성 — 대문자+숫자 10자, 충돌 시 재시도.
async function genCode(
  client: ReturnType<typeof makeServerClient>[0],
): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const raw = randomBytes(8).toString("base64").replace(/[^A-Z0-9]/gi, "");
    const code = "CP" + raw.toUpperCase().slice(0, 8);
    if (!(await codeExists(client, code))) return code;
  }
  return "CP" + randomBytes(6).toString("hex").toUpperCase();
}

export async function action({ request }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });
  if (!(await getStaffRole(client, user.id)))
    return data({ error: "Forbidden" }, { status: 403 });

  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "");
  const id = String(fd.get("id") ?? "");

  if (intent === "delete") {
    if (id) {
      const { softDeleteCoupon } = await import("../queries.server");
      await softDeleteCoupon(client, id);
    }
    return redirect("/admin/coupons");
  }
  if (intent !== "save") return data({ error: "bad intent" }, { status: 400 });

  const validFrom = str(fd, "valid_from");
  const validTo = str(fd, "valid_to");
  if (!validFrom || !validTo)
    return data({ error: "유효기간은 필수입니다." }, { status: 400 });

  const usableRaw = String(fd.get("usable_days") ?? "").trim();
  const row = {
    name: str(fd, "name") ?? "",
    scope: str(fd, "scope") ?? "all",
    min_amount: int(fd, "min_amount"),
    discount_type: str(fd, "discount_type") ?? "fixed",
    discount_value: int(fd, "discount_value"),
    max_discount: null as number | null,
    is_shared: fd.get("is_shared") !== "individual",
    issue_count: int(fd, "issue_count"),
    valid_from: validFrom,
    valid_to: validTo,
    usable_days: usableRaw ? Math.max(0, Math.trunc(Number(usableRaw))) : null,
    status: str(fd, "status") ?? "active",
    note: str(fd, "note"),
  } satisfies Omit<
    Database["public"]["Tables"]["coupons"]["Insert"],
    "code"
  >;

  if (id) {
    // 기존 코드 유지(식별자 보존).
    const existing = await getCoupon(client, id);
    if (!existing) return data({ error: "not found" }, { status: 404 });
    const { error } = await client
      .from("coupons")
      .update(row)
      .eq("coupon_id", id);
    if (error) return data({ error: error.message }, { status: 400 });
  } else {
    const code = await genCode(client);
    const { error } = await client.from("coupons").insert({ ...row, code });
    if (error) return data({ error: error.message }, { status: 400 });
  }
  return redirect("/admin/coupons");
}
