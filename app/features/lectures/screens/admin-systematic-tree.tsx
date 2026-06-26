// 체계도(systematic_nodes) 트리 export / import 운영자 화면.
// 한 과목의 트리를 JSON 으로 다운로드 → 수정 → 다른 과목으로 적재.
//
// GET /admin/systematic-tree                — 페이지 + 과목별 노드 수
// GET /admin/systematic-tree?download=patent — 해당 과목 JSON 파일 다운로드
// POST /admin/systematic-tree (multipart)   — JSON 업로드 + target law_code 로 import

import {
  AlertCircleIcon,
  CheckCircle2Icon,
  DownloadIcon,
  Loader2Icon,
  UploadIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { data, useFetcher } from "react-router";
import { z } from "zod";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  exportSystematicTree,
  importSystematicTree,
  type ImportSystematicResult,
  type SystematicTreeExport,
} from "~/features/lectures/queries.server";

import type { Route } from "./+types/admin-systematic-tree";

export const meta: Route.MetaFunction = () => [
  { title: "체계도 트리 가져오기·내보내기 | 리담변리사학원" },
];

const LAWS: { code: string; name: string }[] = [
  { code: "patent", name: "특허법" },
  { code: "trademark", name: "상표법" },
  { code: "design", name: "디자인보호법" },
  { code: "civil", name: "민법" },
  { code: "civil-procedure", name: "민사소송법" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const download = url.searchParams.get("download");

  // 다운로드 모드 — JSON Response 직접 반환
  if (download) {
    if (!LAWS.some((l) => l.code === download)) {
      throw data(`Unknown law_code: ${download}`, { status: 400 });
    }
    const tree = await exportSystematicTree(client, download);
    const filename = `systematic-tree-${download}-${tree.exportedAt.slice(0, 10)}.json`;
    return new Response(JSON.stringify(tree, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  // 페이지 — 각 과목 노드 수
  const stats: { code: string; name: string; nodeCount: number }[] = [];
  for (const l of LAWS) {
    const { count } = await client
      .from("systematic_nodes")
      .select("node_id", { count: "exact", head: true })
      .eq("law_code", l.code);
    stats.push({ ...l, nodeCount: count ?? 0 });
  }
  return { stats, role };
}

const importSchema = z.object({
  targetLawCode: z.enum(["patent", "trademark", "design", "civil", "civil-procedure"]),
  replaceExisting: z.string().transform((v) => v === "true" || v === "on" || v === "1"),
});

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ ok: false as const, error: "Method not allowed" }, { status: 405 });
  }
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ ok: false as const, error: "Unauthorized" }, { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) return data({ ok: false as const, error: "Forbidden" }, { status: 403 });

  const fd = await request.formData();
  const parsed = importSchema.safeParse({
    targetLawCode: fd.get("targetLawCode"),
    replaceExisting: fd.get("replaceExisting") ?? "false",
  });
  if (!parsed.success) {
    return data(
      { ok: false as const, error: parsed.error.issues[0]?.message ?? "입력 오류" },
      { status: 400 },
    );
  }
  const fileEntry = fd.get("file");
  if (!(fileEntry instanceof File) || fileEntry.size === 0) {
    return data({ ok: false as const, error: "JSON 파일을 선택하세요." }, { status: 400 });
  }
  let tree: SystematicTreeExport;
  try {
    const text = await fileEntry.text();
    tree = JSON.parse(text) as SystematicTreeExport;
    if (!Array.isArray(tree.nodes)) throw new Error("nodes 배열 누락");
  } catch (e) {
    return data(
      { ok: false as const, error: e instanceof Error ? e.message : "JSON 파싱 실패" },
      { status: 400 },
    );
  }

  try {
    const result = await importSystematicTree(client, {
      targetLawCode: parsed.data.targetLawCode,
      tree,
      replaceExisting: parsed.data.replaceExisting,
    });
    return data({ ok: true as const, result });
  } catch (e) {
    return data(
      { ok: false as const, error: e instanceof Error ? e.message : "Import 실패" },
      { status: 400 },
    );
  }
}

type ImportResponse =
  | { ok: true; result: ImportSystematicResult }
  | { ok: false; error: string };

export default function AdminSystematicTree({ loaderData }: Route.ComponentProps) {
  return (
    <AdminShell
      cluster="laws"
      role={loaderData.role}
      title="체계도 트리 가져오기·내보내기"
      desc={
        <>
          한 과목의 체계도(<code>systematic_nodes</code>) 트리를 JSON 으로 다운로드
          → 텍스트 에디터에서 수정 → 다른 과목으로 import 합니다.{" "}
          <code>linkedArticleNumbers</code> 는 대상 과목의{" "}
          <code>articles.article_number</code>로 자동 매칭됩니다.
        </>
      }
      width={900}
    >
      {/* 과목별 export 카드 */}
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold">과목별 다운로드</h2>
        <ul className="divide-y rounded-xl border">
          {loaderData.stats.map((s) => (
            <li
              key={s.code}
              className="flex items-center gap-3 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-foreground text-sm font-medium">{s.name}</p>
                <p className="text-muted-foreground text-xs">
                  law_code = <code>{s.code}</code> · 노드 {s.nodeCount.toLocaleString("ko-KR")}개
                </p>
              </div>
              {s.nodeCount > 0 ? (
                <Button asChild size="sm" variant="outline">
                  <a
                    href={`/admin/systematic-tree?download=${s.code}`}
                    download
                  >
                    <DownloadIcon className="size-3.5" /> JSON 다운로드
                  </a>
                </Button>
              ) : (
                <Badge variant="secondary" className="font-normal">
                  비어있음
                </Badge>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* import 카드 */}
      <section>
        <h2 className="mb-2 text-sm font-semibold">JSON 업로드 → 가져오기</h2>
        <ImportForm />
      </section>

      {/* JSON 형식 안내 */}
      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold">JSON 형식</h2>
        <pre className="bg-muted/40 overflow-x-auto rounded-lg border p-3 text-[11px] leading-relaxed">{`{
  "sourceLawCode": "patent",
  "exportedAt": "2026-05-20T...",
  "nodeCount": 109,
  "nodes": [
    {
      "tmpId": "n_001",
      "parentTmpId": null,
      "ord": 1,
      "displayLabel": "01 총칙/보칙",
      "linkedArticleNumbers": ["1", "2", "3"]
    },
    {
      "tmpId": "n_002",
      "parentTmpId": "n_001",
      "ord": 1,
      "displayLabel": "목적",
      "linkedArticleNumbers": ["1"]
    }
  ]
}`}</pre>
        <ul className="text-muted-foreground mt-2 space-y-0.5 pl-4 text-xs list-disc">
          <li><code>tmpId</code> / <code>parentTmpId</code> 로 부모-자식 표현 (UUID 가 아니라 import 시 새로 발급)</li>
          <li><code>ord</code> 는 같은 부모 아래 정렬 순서 (path 의 <code>b{"{ord}"}</code> 부분)</li>
          <li><code>linkedArticleNumbers</code> 는 대상 과목 articles 에 같은 번호가 있어야 매칭 (없으면 skip 으로 보고)</li>
        </ul>
      </section>
    </AdminShell>
  );
}

function ImportForm() {
  const fetcher = useFetcher<ImportResponse>();
  const submitting = fetcher.state !== "idle";
  const result = fetcher.data;
  const [targetLawCode, setTargetLawCode] = useState<string>("trademark");

  useEffect(() => {
    if (result && result.ok) {
      // 페이지 reload 로 노드 수 갱신
      const t = setTimeout(() => window.location.reload(), 2000);
      return () => clearTimeout(t);
    }
  }, [result]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("targetLawCode", targetLawCode);
    fetcher.submit(fd, {
      method: "post",
      action: "/admin/systematic-tree",
      encType: "multipart/form-data",
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-xl border bg-card p-4 shadow-sm"
    >
      <div className="space-y-1.5">
        <Label htmlFor="ist-file" className="text-xs">
          JSON 파일
        </Label>
        <Input
          id="ist-file"
          name="file"
          type="file"
          accept="application/json,.json"
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ist-target" className="text-xs">
          대상 과목 (law_code)
        </Label>
        <select
          id="ist-target"
          value={targetLawCode}
          onChange={(e) => setTargetLawCode(e.target.value)}
          className="border-input bg-background text-foreground focus-visible:ring-ring h-9 w-full rounded-md border px-2 text-sm focus-visible:ring-1 focus-visible:outline-none"
        >
          {LAWS.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name} ({l.code})
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <input
          id="ist-replace"
          type="checkbox"
          name="replaceExisting"
          value="true"
          defaultChecked
          className="size-4"
        />
        <Label htmlFor="ist-replace" className="text-xs">
          기존 트리 삭제 후 적재 (체크 해제 시 추가만)
        </Label>
      </div>

      <Button type="submit" disabled={submitting} size="sm" className="w-full">
        {submitting ? <Loader2Icon className="size-3.5 animate-spin" /> : <UploadIcon className="size-3.5" />}
        업로드 + 가져오기
      </Button>

      {result && result.ok && (
        <div className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 flex items-start gap-2 rounded-md p-3 text-xs">
          <CheckCircle2Icon className="size-4 flex-none" />
          <div className="space-y-0.5">
            <p>
              <strong>완료</strong>: 노드 {result.result.inserted}개 insert,
              {" "}article 매핑 {result.result.linked}건
              {result.result.deletedExisting > 0
                ? `, 기존 ${result.result.deletedExisting}개 삭제`
                : ""}
              {result.result.skippedLinks.length > 0
                ? `, 매칭 실패 ${result.result.skippedLinks.length}건`
                : ""}
            </p>
            {result.result.skippedLinks.length > 0 && (
              <details className="mt-1">
                <summary className="cursor-pointer">매칭 실패 상세</summary>
                <ul className="mt-1 pl-3">
                  {result.result.skippedLinks.slice(0, 20).map((s, i) => (
                    <li key={i}>
                      <code>{s.articleNumber}</code> — {s.reason}
                    </li>
                  ))}
                  {result.result.skippedLinks.length > 20 && (
                    <li>... 외 {result.result.skippedLinks.length - 20}건</li>
                  )}
                </ul>
              </details>
            )}
            <p className="text-emerald-700/70 dark:text-emerald-300/70">
              2초 후 페이지 새로고침 됩니다.
            </p>
          </div>
        </div>
      )}

      {result && !result.ok && (
        <div className="bg-destructive/10 text-destructive flex items-start gap-2 rounded-md p-3 text-xs">
          <AlertCircleIcon className="size-4 flex-none" />
          <p>{result.error}</p>
        </div>
      )}
    </form>
  );
}
