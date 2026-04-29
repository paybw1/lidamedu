import { ArrowLeftIcon, UploadIcon } from "lucide-react";
import { useState } from "react";
import { Form, Link, data, redirect, useActionData, useNavigation } from "react-router";
import { z } from "zod";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Input } from "~/core/components/ui/input";
import { Textarea } from "~/core/components/ui/textarea";
import makeServerClient from "~/core/lib/supa-client.server";
import { parseAndSeedBlanksFromText } from "~/features/blanks/lib/parser.server";
import { LAW_SUBJECT_SLUGS } from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-blanks-upload";

export const meta: Route.MetaFunction = () => [
  { title: "빈칸 자료 업로드 | Lidam Edu" },
];

const formSchema = z.object({
  lawCode: z.enum(LAW_SUBJECT_SLUGS),
  version: z.string().min(1).max(50).default("v1"),
  displayName: z.string().max(100).optional(),
  text: z.string().min(50),
  replaceExisting: z.string().optional().transform((v) => v === "on"),
});

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const { data: profile } = await client
    .from("profiles")
    .select("role, name")
    .eq("profile_id", user.id)
    .maybeSingle();
  const role = profile?.role ?? "student";
  if (role !== "instructor" && role !== "admin") {
    throw data("Forbidden", { status: 403 });
  }
  return { ownerName: profile?.name ?? "내" };
}

export async function action({ request }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const { data: profile } = await client
    .from("profiles")
    .select("role, name")
    .eq("profile_id", user.id)
    .maybeSingle();
  const role = profile?.role ?? "student";
  if (role !== "instructor" && role !== "admin") {
    throw data("Forbidden", { status: 403 });
  }

  const fd = await request.formData();
  const parsed = formSchema.safeParse({
    lawCode: fd.get("lawCode"),
    version: fd.get("version") || "v1",
    displayName: fd.get("displayName") || undefined,
    text: fd.get("text"),
    replaceExisting: fd.get("replaceExisting") || undefined,
  });
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.errors.map((e) => e.message).join(", "),
    };
  }

  try {
    const result = await parseAndSeedBlanksFromText(client, {
      lawCode: parsed.data.lawCode,
      version: parsed.data.version,
      ownerId: user.id,
      displayName: parsed.data.displayName?.trim() || (profile?.name ?? "내") + " 자료",
      text: parsed.data.text,
      replaceExisting: parsed.data.replaceExisting,
    });
    if (result.insertedSets === 0) {
      return {
        ok: false as const,
        error:
          "조문이 시드되지 않았습니다. 본문 시작 형식(`제1조 【제목】 (★)`)이 맞는지 확인하세요.",
      };
    }
    return redirect(
      `/admin/blanks?law=${parsed.data.lawCode}&owner=mine&result=${encodeURIComponent(
        `${result.insertedSets}개 조문 / 총 ${result.totalBlanks}개 빈칸 / 자동 매칭 ${result.mappedAnswers}개`,
      )}`,
    );
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "Upload failed",
    };
  }
}

export default function AdminBlanksUpload({ loaderData }: Route.ComponentProps) {
  const { ownerName } = loaderData;
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const submitting = nav.state !== "idle";
  const [text, setText] = useState("");

  return (
    <div className="mx-auto w-full max-w-screen-md px-5 py-6 md:px-10 md:py-8">
      <Link
        to="/admin/blanks"
        viewTransition
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeftIcon className="size-4" /> 빈칸 자료 목록
      </Link>

      <Card>
        <CardHeader>
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            운영자 · 빈칸 자료
          </p>
          <h1 className="text-xl font-bold tracking-tight">새 자료 업로드</h1>
          <p className="text-muted-foreground text-sm">
            변환된 utf8 텍스트를 붙여넣으면 자동으로 조문 단위로 분할하고
            <strong className="mx-0.5">{ownerName}</strong> 자료로 시드됩니다.
            정답은 가능한 만큼 자동 매칭되며, 미매칭은 편집 화면에서 보강하세요.
          </p>
        </CardHeader>
        <CardContent>
          <Form method="post" className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium" htmlFor="lawCode">
                  법령
                </label>
                <select
                  id="lawCode"
                  name="lawCode"
                  defaultValue="patent"
                  className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
                >
                  {LAW_SUBJECT_SLUGS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium" htmlFor="version">
                  버전 코드
                </label>
                <Input
                  id="version"
                  name="version"
                  defaultValue="v1"
                  className="h-9 text-sm"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium" htmlFor="displayName">
                표시 이름 (선택)
              </label>
              <Input
                id="displayName"
                name="displayName"
                placeholder={`${ownerName} 1차 대비 v1`}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium" htmlFor="text">
                빈칸 자료 텍스트 (utf8)
              </label>
              <Textarea
                id="text"
                name="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={16}
                placeholder={`제1조 【목적】 (★)\n이 법은 발명을 (    )·(    )하고 그 (    )을 도모...\n[전문개정 ...]\n제2조 【정의】 (★★)\n...`}
                className="font-mono text-xs"
              />
              <p className="text-muted-foreground text-xs">
                {text.length.toLocaleString()}자 / 본문은 `제1조 【...】 (★)` 줄부터
                시작해야 합니다.
              </p>
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" name="replaceExisting" />이 강사·이 버전의 기존 자료
              덮어쓰기 (없으면 추가)
            </label>

            {actionData && !actionData.ok ? (
              <div className="rounded-md border border-rose-300 bg-rose-50 p-2 text-xs text-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
                {actionData.error}
              </div>
            ) : null}

            <div className="flex items-center gap-2">
              <Button type="submit" disabled={submitting} className="gap-1">
                <UploadIcon className="size-4" />
                {submitting ? "업로드 중…" : "업로드 + 시드"}
              </Button>
              <Badge variant="outline" className="text-[10px]">
                강사: {ownerName}
              </Badge>
            </div>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
