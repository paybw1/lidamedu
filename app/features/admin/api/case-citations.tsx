// 운영자 case 인용 일괄 작업 API.
// /api/admin/case-citations
//   - intent=migrate       : 옛 case → 새 case 로 해설 본문 풀 인용 형식 치환
//                            + (옵션) 기출연도(exam_*_years) 이전
//   - intent=backfill_links: 해설 텍스트 인용 있지만 link 없는 문제에 link 보완
// staff(instructor/admin) 만 호출 가능.

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import {
  backfillCaseLinks,
  migrateCaseCitation,
} from "~/features/admin/queries/case-citations.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/case-citations";

const migrateSchema = z.object({
  intent: z.literal("migrate"),
  caseId: z.string().uuid(),
  newNumber: z.string().min(1).max(40),
  transferExamYears: z.enum(["on", "off"]).optional(),
  transferProblemLinks: z.enum(["on", "off"]).optional(),
});
const backfillSchema = z.object({
  intent: z.literal("backfill_links"),
  caseId: z.string().uuid(),
  caseNumber: z.string().min(1).max(40),
});

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) return data({ error: "Forbidden" }, { status: 403 });

  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "");

  if (intent === "migrate") {
    const parsed = migrateSchema.safeParse({
      intent,
      caseId: fd.get("caseId"),
      newNumber: fd.get("newNumber"),
      transferExamYears: fd.get("transferExamYears") ?? "off",
      transferProblemLinks: fd.get("transferProblemLinks") ?? "off",
    });
    if (!parsed.success)
      return data({ error: "Invalid input" }, { status: 400 });
    const newNumber = parsed.data.newNumber.trim();
    if (!newNumber)
      return data({ error: "Empty case number" }, { status: 400 });
    try {
      const res = await migrateCaseCitation(
        client,
        parsed.data.caseId,
        newNumber,
        {
          transferExamYears: parsed.data.transferExamYears === "on",
          transferProblemLinks: parsed.data.transferProblemLinks === "on",
        },
      );
      return data({
        ok: true,
        updatedChoices: res.updatedChoices,
        examYearsAdded: res.examYearsAdded,
        linksTransferred: res.linksTransferred,
        linksDropped: res.linksDropped,
        newCaseId: res.newCase.caseId,
        newCaseNumber: res.newCase.caseNumber,
      });
    } catch (err) {
      return data(
        { error: err instanceof Error ? err.message : "마이그레이션 실패" },
        { status: 400 },
      );
    }
  }

  if (intent === "backfill_links") {
    const parsed = backfillSchema.safeParse({
      intent,
      caseId: fd.get("caseId"),
      caseNumber: fd.get("caseNumber"),
    });
    if (!parsed.success)
      return data({ error: "Invalid input" }, { status: 400 });
    const res = await backfillCaseLinks(
      client,
      parsed.data.caseId,
      parsed.data.caseNumber.trim(),
      user.id,
    );
    return data({ ok: true, added: res.added });
  }

  return data({ error: "Unknown intent" }, { status: 400 });
}
