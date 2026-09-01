// feat-11-009 — 메인화면 모듈 설정 (/admin/main-page/:moduleId). 요청서_0901 §2.
//
// kind 마다 설정 항목이 다르다. 스키마는 lib/main-modules.ts 가 소유하고 여기서는 폼만 그린다
// (저장 시 같은 스키마로 parse → 잘못된 값이 DB 로 들어가지 않는다).
// 붙박이(builtin_*)는 설정이 없다 — 라벨만 고칠 수 있다.
import {
  Link,
  data,
  redirect,
  useNavigation,
  Form,
} from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { listBookstoreBooks } from "~/features/bookstore/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { HtmlEditor } from "~/features/lms/components/html-editor";
import { listSubscriptionPlans } from "~/features/subscriptions/queries.server";

import {
  BOARD_SOURCE_LABEL,
  KIND_LABEL,
  barBannerConfigSchema,
  boardRecentConfigSchema,
  bookListConfigSchema,
  freeHtmlConfigSchema,
  heroBannerConfigSchema,
  isConfigurable,
  lectureListConfigSchema,
  youtubeConfigSchema,
} from "../lib/main-modules";
import {
  listMainPageModules,
  updateMainPageModule,
} from "../queries.server";

import type { Route } from "./+types/admin-main-page-edit";

export function meta() {
  return [{ title: "모듈 설정 | 운영관리" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const role = await getStaffRole(client, user.id);
  if (!role) throw redirect("/dashboard");

  const modules = await listMainPageModules(client, { includeHidden: true });
  const module = modules.find((m) => m.moduleId === params.moduleId);
  if (!module) throw redirect("/admin/main-page");

  // 선택 목록 — 필요한 kind 일 때만 조회한다(불필요한 왕복 방지).
  const plans =
    module.kind === "lecture_list"
      ? await listSubscriptionPlans(client).catch(() => [])
      : [];
  const books =
    module.kind === "book_list"
      ? await listBookstoreBooks(client).catch(() => [])
      : [];
  return { role, module, plans, books };
}

export async function action({ request, params }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "로그인이 필요합니다." }, { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) return data({ error: "권한이 없습니다." }, { status: 403 });

  const moduleId = params.moduleId ?? "";
  const modules = await listMainPageModules(client, { includeHidden: true });
  const module = modules.find((m) => m.moduleId === moduleId);
  if (!module) return data({ error: "모듈을 찾을 수 없습니다." }, { status: 404 });

  const fd = await request.formData();
  const s = (k: string) => String(fd.get(k) ?? "");
  /** 줄바꿈·쉼표로 나눈 목록 입력 → 배열. */
  const lines = (k: string) =>
    s(k)
      .split(/[\n,]/)
      .map((v) => v.trim())
      .filter(Boolean);

  let config: Record<string, unknown> = module.config;
  try {
    switch (module.kind) {
      case "hero_banner":
        config = heroBannerConfigSchema.parse({ tier: s("tier") });
        break;
      case "lecture_list":
        config = lectureListConfigSchema.parse({
          eyebrow: s("eyebrow"),
          heading: s("heading"),
          moreHref: s("moreHref"),
          planIds: fd.getAll("planIds").map(String),
        });
        break;
      case "board_recent":
        config = boardRecentConfigSchema.parse({
          eyebrow: s("eyebrow"),
          heading: s("heading"),
          source: s("source"),
          limit: s("limit"),
          moreHref: s("moreHref"),
        });
        break;
      case "youtube":
        config = youtubeConfigSchema.parse({
          eyebrow: s("eyebrow"),
          heading: s("heading"),
          urls: lines("urls"),
        });
        break;
      case "book_list":
        config = bookListConfigSchema.parse({
          eyebrow: s("eyebrow"),
          heading: s("heading"),
          moreHref: s("moreHref"),
          bookIds: fd.getAll("bookIds").map(String),
        });
        break;
      case "bar_banner":
        config = barBannerConfigSchema.parse({
          imagePc: s("imagePc"),
          imageMobile: s("imageMobile"),
          href: s("href"),
          alt: s("alt"),
        });
        break;
      case "free_html":
        config = freeHtmlConfigSchema.parse({ html: s("html") });
        break;
      default:
        // 붙박이 — config 없음.
        config = {};
    }
  } catch {
    return data({ error: "입력값을 확인해 주세요." }, { status: 400 });
  }

  const res = await updateMainPageModule(client, moduleId, {
    label: s("label").trim() || null,
    config,
  });
  if (!res.ok) return data({ error: res.error }, { status: 400 });
  return redirect("/admin/main-page");
}

const LABEL_CLS =
  "text-muted-foreground text-[11px] font-semibold tracking-wide uppercase";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className={LABEL_CLS}>{label}</span>
      {children}
    </label>
  );
}

export default function AdminMainPageEdit({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { role, module, plans, books } = loaderData;
  const navigation = useNavigation();
  const busy = navigation.state === "submitting";
  const c = module.config;
  const str = (k: string, fallback = "") =>
    typeof c[k] === "string" ? (c[k] as string) : fallback;
  const arr = (k: string): string[] =>
    Array.isArray(c[k]) ? (c[k] as unknown[]).map(String) : [];

  return (
    <AdminShell
      cluster="landing"
      role={role}
      title={`${KIND_LABEL[module.kind]} 설정`}
      desc={
        isConfigurable(module.kind)
          ? undefined
          : "기존 섹션 블록입니다 — 내용은 각 관리 화면에서 수정합니다. 여기서는 이름만 붙입니다."
      }
    >
      <Form method="post" className="max-w-2xl space-y-4">
        {actionData && "error" in actionData && actionData.error ? (
          <p className="text-sm font-semibold text-rose-600">
            {actionData.error}
          </p>
        ) : null}

        <Field label="관리용 이름 (선택)">
          <Input
            name="label"
            defaultValue={module.label ?? ""}
            placeholder="목록에서 구분할 이름 — 화면에는 나오지 않습니다"
          />
        </Field>

        {module.kind === "hero_banner" ? (
          <Field label="배너 단">
            <select
              name="tier"
              defaultValue={String(c.tier ?? 1)}
              className="border-input bg-background h-9 rounded-md border px-2 text-sm"
            >
              <option value="1">1단 — 메인 히어로 캐러셀</option>
              <option value="2">2단</option>
              <option value="3">3단</option>
            </select>
            <span className="text-muted-foreground text-xs">
              배너 이미지·링크·노출기간은{" "}
              <Link className="underline" to="/admin/landing-banners">
                히어로 배너 관리
              </Link>
              에서 설정합니다.
            </span>
          </Field>
        ) : null}

        {module.kind === "lecture_list" ? (
          <>
            <Field label="윗줄(eyebrow)">
              <Input name="eyebrow" defaultValue={str("eyebrow", "수강신청")} />
            </Field>
            <Field label="제목">
              <Input name="heading" defaultValue={str("heading")} />
            </Field>
            <Field label="더보기 링크">
              <Input name="moreHref" defaultValue={str("moreHref", "/lecture/catalog")} />
            </Field>
            <Field label="진열할 상품 (Ctrl+클릭으로 복수 선택)">
              <select
                name="planIds"
                multiple
                size={10}
                defaultValue={arr("planIds")}
                className="border-input bg-background rounded-md border px-2 py-1 text-sm"
              >
                {plans.map((p) => (
                  <option key={p.planId} value={p.planId}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
          </>
        ) : null}

        {module.kind === "board_recent" ? (
          <>
            <Field label="윗줄(eyebrow)">
              <Input name="eyebrow" defaultValue={str("eyebrow", "리담소식")} />
            </Field>
            <Field label="제목">
              <Input name="heading" defaultValue={str("heading", "공지 · 이벤트")} />
            </Field>
            <Field label="분류">
              <select
                name="source"
                defaultValue={str("source", "all")}
                className="border-input bg-background h-9 rounded-md border px-2 text-sm"
              >
                {Object.entries(BOARD_SOURCE_LABEL).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="노출 건수">
              <Input
                name="limit"
                type="number"
                min={1}
                max={20}
                defaultValue={String(c.limit ?? 5)}
              />
            </Field>
            <Field label="더보기 링크">
              <Input name="moreHref" defaultValue={str("moreHref", "/lecture/news")} />
            </Field>
          </>
        ) : null}

        {module.kind === "youtube" ? (
          <>
            <Field label="윗줄(eyebrow)">
              <Input name="eyebrow" defaultValue={str("eyebrow", "영상")} />
            </Field>
            <Field label="제목">
              <Input name="heading" defaultValue={str("heading", "리담 영상")} />
            </Field>
            <Field label="유튜브 URL — 한 줄에 하나">
              <textarea
                name="urls"
                rows={5}
                defaultValue={arr("urls").join("\n")}
                placeholder="https://www.youtube.com/watch?v=..."
                className="border-input bg-background rounded-md border px-2 py-1 font-mono text-xs"
              />
            </Field>
          </>
        ) : null}

        {module.kind === "book_list" ? (
          <>
            <Field label="윗줄(eyebrow)">
              <Input name="eyebrow" defaultValue={str("eyebrow", "리담 교재")} />
            </Field>
            <Field label="제목">
              <Input name="heading" defaultValue={str("heading")} />
            </Field>
            <Field label="더보기 링크">
              <Input name="moreHref" defaultValue={str("moreHref", "/lecture/books")} />
            </Field>
            <Field label="진열할 도서 (비우면 최신 6권)">
              <select
                name="bookIds"
                multiple
                size={10}
                defaultValue={arr("bookIds")}
                className="border-input bg-background rounded-md border px-2 py-1 text-sm"
              >
                {books.map((b) => (
                  <option key={b.bookId} value={b.bookId}>
                    {b.title}
                  </option>
                ))}
              </select>
            </Field>
          </>
        ) : null}

        {module.kind === "bar_banner" ? (
          <>
            <Field label="PC 이미지 URL">
              <Input name="imagePc" defaultValue={str("imagePc")} />
            </Field>
            <Field label="모바일 이미지 URL (비우면 PC 이미지 공용)">
              <Input name="imageMobile" defaultValue={str("imageMobile")} />
            </Field>
            <Field label="링크">
              <Input name="href" defaultValue={str("href")} placeholder="/lecture/catalog" />
            </Field>
            <Field label="대체 텍스트">
              <Input name="alt" defaultValue={str("alt")} />
            </Field>
          </>
        ) : null}

        {module.kind === "free_html" ? (
          <Field label="본문 (HTML · CSS · JavaScript)">
            <HtmlEditor
              name="html"
              defaultValue={str("html")}
              uploadUrl="/api/lms/editor-image"
              minHeight={360}
            />
          </Field>
        ) : null}

        <div className="flex gap-2">
          <Button type="submit" disabled={busy}>
            {busy ? "저장 중…" : "저장"}
          </Button>
          <Button asChild type="button" variant="outline">
            <Link to="/admin/main-page">취소</Link>
          </Button>
        </div>
      </Form>
    </AdminShell>
  );
}
