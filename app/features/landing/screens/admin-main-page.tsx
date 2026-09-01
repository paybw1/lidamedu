// feat-11-009 — 메인화면 관리 (/admin/main-page). 요청서_0901 §2.
//
// 블록을 추가·복사·삭제하고 순서를 바꾼다. 순서는 Drag&Drop 이 기본이고,
// ↑/↓ 버튼도 함께 둔다(키보드·터치에서 드래그가 어려운 경우 + 저장소 규칙 일관).
// PC·모바일 미리보기는 /lecture/home 을 iframe 으로 띄운다 — 실제 화면 그 자체라
// "미리보기와 실제가 다르다" 는 문제가 생길 여지가 없다.
import { useEffect, useState } from "react";

import {
  ChevronDownIcon,
  ChevronUpIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  GripVerticalIcon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react";
import { Link, data, redirect, useFetcher } from "react-router";
import { toast } from "sonner";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { getStaffRole } from "~/features/laws/queries.server";

import {
  DEVICE_LABEL,
  KIND_LABEL,
  MAIN_MODULE_DEVICES,
  MAIN_MODULE_KINDS,
  isConfigurable,
  isMainModuleKind,
  parseDevice,
} from "../lib/main-modules";
import {
  createMainPageModule,
  deleteMainPageModule,
  duplicateMainPageModule,
  listMainPageModules,
  reorderMainPageModules,
  updateMainPageModule,
} from "../queries.server";

import type { Route } from "./+types/admin-main-page";

export function meta() {
  return [{ title: "메인화면 관리 | 운영관리" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const role = await getStaffRole(client, user.id);
  if (!role) throw redirect("/dashboard");
  const modules = await listMainPageModules(client, { includeHidden: true });
  return { role, modules };
}

export async function action({ request }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "로그인이 필요합니다." }, { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) return data({ error: "권한이 없습니다." }, { status: 403 });

  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "");
  const moduleId = String(fd.get("moduleId") ?? "");

  if (intent === "create") {
    const kind = String(fd.get("kind") ?? "");
    if (!isMainModuleKind(kind)) {
      return data({ error: "알 수 없는 모듈 종류입니다." }, { status: 400 });
    }
    const res = await createMainPageModule(client, { kind });
    return res.ok ? { ok: true } : data({ error: res.error }, { status: 400 });
  }

  if (intent === "toggle") {
    const res = await updateMainPageModule(client, moduleId, {
      isVisible: fd.get("isVisible") === "1",
    });
    return res.ok ? { ok: true } : data({ error: res.error }, { status: 400 });
  }

  if (intent === "device") {
    const res = await updateMainPageModule(client, moduleId, {
      device: parseDevice(fd.get("device")),
    });
    return res.ok ? { ok: true } : data({ error: res.error }, { status: 400 });
  }

  if (intent === "window") {
    // 빈 값 = 제한 없음. datetime-local 은 타임존이 없으므로 KST 로 못박아 해석한다.
    const toIso = (v: FormDataEntryValue | null): string | null => {
      const s = String(v ?? "").trim();
      if (!s) return null;
      const d = new Date(`${s}:00+09:00`);
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    };
    const res = await updateMainPageModule(client, moduleId, {
      startsAt: toIso(fd.get("startsAt")),
      endsAt: toIso(fd.get("endsAt")),
    });
    return res.ok ? { ok: true } : data({ error: res.error }, { status: 400 });
  }

  if (intent === "duplicate") {
    const res = await duplicateMainPageModule(client, moduleId);
    return res.ok ? { ok: true } : data({ error: res.error }, { status: 400 });
  }

  if (intent === "delete") {
    const res = await deleteMainPageModule(client, moduleId);
    return res.ok ? { ok: true } : data({ error: res.error }, { status: 400 });
  }

  if (intent === "reorder") {
    const ids = String(fd.get("orderedIds") ?? "")
      .split(",")
      .filter(Boolean);
    if (ids.length === 0) return data({ error: "순서가 비었습니다." }, { status: 400 });
    const res = await reorderMainPageModules(client, ids);
    return res.ok ? { ok: true } : data({ error: res.error }, { status: 400 });
  }

  return data({ error: "알 수 없는 요청입니다." }, { status: 400 });
}

/** ISO → datetime-local 값(KST 기준). 빈 값이면 "". */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 3600_000);
  return kst.toISOString().slice(0, 16);
}

export default function AdminMainPage({ loaderData }: Route.ComponentProps) {
  const { role, modules } = loaderData;
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  // 드래그 중에는 서버 순서 대신 화면 순서를 쓴다(놓는 순간 저장 → 응답 오면 서버 순서로 복귀).
  const [order, setOrder] = useState<string[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [preview, setPreview] = useState<"pc" | "mobile" | null>(null);

  useEffect(() => {
    if (fetcher.data?.error) toast.error(fetcher.data.error);
  }, [fetcher.data]);
  // 서버가 새 목록을 주면 화면 순서를 버린다 — 두 소스가 어긋난 채 남지 않게.
  useEffect(() => {
    setOrder(null);
  }, [modules]);

  const rows = order
    ? order
        .map((id) => modules.find((m) => m.moduleId === id))
        .filter((m): m is (typeof modules)[number] => Boolean(m))
    : modules;

  const submitOrder = (ids: string[]) => {
    const fd = new FormData();
    fd.set("intent", "reorder");
    fd.set("orderedIds", ids.join(","));
    fetcher.submit(fd, { method: "post" });
  };

  const move = (index: number, dir: -1 | 1) => {
    const ids = rows.map((r) => r.moduleId);
    const next = index + dir;
    if (next < 0 || next >= ids.length) return;
    [ids[index], ids[next]] = [ids[next], ids[index]];
    setOrder(ids);
    submitOrder(ids);
  };

  const drop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const ids = rows.map((r) => r.moduleId);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    setOrder(ids);
    setDragId(null);
    submitOrder(ids);
  };

  const post = (fields: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    fetcher.submit(fd, { method: "post" });
  };

  return (
    <AdminShell
      cluster="landing"
      role={role}
      title="메인화면 관리"
      desc="강의 플랫폼 메인화면을 블록으로 조립합니다."
    >
      <div className="space-y-4">
        <p className="text-muted-foreground text-sm">
          강의 플랫폼 메인화면(<code>/lecture/home</code>)을 블록으로 조립합니다.
          순서는 끌어서 옮기거나 ↑/↓ 로 바꿉니다. 기간이 지난 블록은 자동으로
          내려갑니다.
        </p>

        {/* 모듈 추가 */}
        <fetcher.Form method="post" className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="intent" value="create" />
          <select
            name="kind"
            defaultValue="hero_banner"
            className="border-input bg-background h-9 rounded-md border px-2 text-sm"
          >
            <optgroup label="모듈">
              {MAIN_MODULE_KINDS.filter((k) => k.configurable).map((k) => (
                <option key={k.kind} value={k.kind}>
                  {k.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="기존 섹션">
              {MAIN_MODULE_KINDS.filter((k) => !k.configurable).map((k) => (
                <option key={k.kind} value={k.kind}>
                  {k.label}
                </option>
              ))}
            </optgroup>
          </select>
          <Button type="submit" size="sm">
            <PlusIcon className="size-4" /> 모듈 추가
          </Button>
          <span className="flex-1" />
          <Button
            type="button"
            size="sm"
            variant={preview === "pc" ? "default" : "outline"}
            onClick={() => setPreview((v) => (v === "pc" ? null : "pc"))}
          >
            PC 미리보기
          </Button>
          <Button
            type="button"
            size="sm"
            variant={preview === "mobile" ? "default" : "outline"}
            onClick={() => setPreview((v) => (v === "mobile" ? null : "mobile"))}
          >
            모바일 미리보기
          </Button>
        </fetcher.Form>

        {/* 목록 */}
        {rows.length === 0 ? (
          <div className="border-input rounded-lg border border-dashed p-8 text-center">
            <p className="text-sm font-semibold">등록된 모듈이 없습니다.</p>
            <p className="text-muted-foreground mt-1 text-xs">
              모듈이 하나도 없으면 메인화면은 기존 고정 구성으로 표시됩니다.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {rows.map((m, i) => {
              const expired =
                m.endsAt !== null && new Date(m.endsAt).getTime() <= Date.now();
              const notYet =
                m.startsAt !== null &&
                new Date(m.startsAt).getTime() > Date.now();
              return (
                <li
                  key={m.moduleId}
                  draggable
                  onDragStart={() => setDragId(m.moduleId)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => drop(m.moduleId)}
                  className={
                    "border-input bg-background rounded-lg border p-3 " +
                    (dragId === m.moduleId ? "opacity-50" : "")
                  }
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <GripVerticalIcon className="text-muted-foreground size-4 cursor-grab" />
                    <div className="flex flex-col">
                      <button
                        type="button"
                        aria-label="위로"
                        disabled={i === 0}
                        onClick={() => move(i, -1)}
                        className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      >
                        <ChevronUpIcon className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label="아래로"
                        disabled={i === rows.length - 1}
                        onClick={() => move(i, 1)}
                        className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      >
                        <ChevronDownIcon className="size-3.5" />
                      </button>
                    </div>
                    <span className="text-sm font-bold">{KIND_LABEL[m.kind]}</span>
                    {m.label ? (
                      <span className="text-muted-foreground text-xs">
                        {m.label}
                      </span>
                    ) : null}
                    {!m.isVisible ? <Badge variant="outline">숨김</Badge> : null}
                    {expired ? <Badge variant="outline">기간 종료</Badge> : null}
                    {notYet ? <Badge variant="outline">노출 예정</Badge> : null}
                    {m.device !== "all" ? (
                      <Badge variant="secondary">{DEVICE_LABEL[m.device]}</Badge>
                    ) : null}

                    <span className="flex-1" />

                    <select
                      value={m.device}
                      aria-label="노출 기기"
                      onChange={(e) =>
                        post({
                          intent: "device",
                          moduleId: m.moduleId,
                          device: e.target.value,
                        })
                      }
                      className="border-input bg-background h-8 rounded-md border px-2 text-xs"
                    >
                      {MAIN_MODULE_DEVICES.map((d) => (
                        <option key={d} value={d}>
                          {DEVICE_LABEL[d]}
                        </option>
                      ))}
                    </select>

                    {isConfigurable(m.kind) ? (
                      <Button asChild size="sm" variant="outline">
                        <Link to={`/admin/main-page/${m.moduleId}`}>
                          <SettingsIcon className="size-3.5" /> 설정
                        </Link>
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        post({
                          intent: "toggle",
                          moduleId: m.moduleId,
                          isVisible: m.isVisible ? "0" : "1",
                        })
                      }
                    >
                      {m.isVisible ? (
                        <EyeIcon className="size-3.5" />
                      ) : (
                        <EyeOffIcon className="size-3.5" />
                      )}
                      {m.isVisible ? "노출" : "숨김"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        post({ intent: "duplicate", moduleId: m.moduleId })
                      }
                    >
                      <CopyIcon className="size-3.5" /> 복사
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (!window.confirm("이 모듈을 삭제할까요?")) return;
                        post({ intent: "delete", moduleId: m.moduleId });
                      }}
                    >
                      <Trash2Icon className="size-3.5" />
                    </Button>
                  </div>

                  {/* 노출 기간 */}
                  <fetcher.Form
                    method="post"
                    className="mt-2 flex flex-wrap items-center gap-2"
                  >
                    <input type="hidden" name="intent" value="window" />
                    <input type="hidden" name="moduleId" value={m.moduleId} />
                    <span className="text-muted-foreground text-[11px] font-semibold">
                      노출기간(KST)
                    </span>
                    <input
                      type="datetime-local"
                      name="startsAt"
                      defaultValue={toLocalInput(m.startsAt)}
                      className="border-input bg-background h-8 rounded-md border px-2 text-xs"
                    />
                    <span className="text-muted-foreground text-xs">~</span>
                    <input
                      type="datetime-local"
                      name="endsAt"
                      defaultValue={toLocalInput(m.endsAt)}
                      className="border-input bg-background h-8 rounded-md border px-2 text-xs"
                    />
                    <Button type="submit" size="sm" variant="ghost">
                      기간 저장
                    </Button>
                    <span className="text-muted-foreground text-[11px]">
                      비워 두면 제한 없음
                    </span>
                  </fetcher.Form>
                </li>
              );
            })}
          </ul>
        )}

        {/* 미리보기 — 실제 화면을 그대로 띄운다. */}
        {preview ? (
          <div className="border-input rounded-lg border p-3">
            <p className="text-muted-foreground mb-2 text-xs">
              {preview === "pc" ? "PC" : "모바일"} 미리보기 — 실제
              <code> /lecture/home </code>
              화면입니다. 숨김·기간 밖 모듈은 여기에도 보이지 않습니다.
            </p>
            <div className="flex justify-center overflow-auto">
              <iframe
                title="메인화면 미리보기"
                src="/lecture/home"
                style={{
                  width: preview === "mobile" ? 390 : "100%",
                  maxWidth: "100%",
                  height: 700,
                  border: 0,
                }}
              />
            </div>
          </div>
        ) : null}
      </div>
    </AdminShell>
  );
}
