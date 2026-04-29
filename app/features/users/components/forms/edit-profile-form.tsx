import { type Route } from "@rr/app/features/users/api/+types/edit-profile";
import { UserIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";

import FetcherFormButton from "~/core/components/fetcher-form-button";
import FormErrors from "~/core/components/form-error";
import FormSuccess from "~/core/components/form-success";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "~/core/components/ui/avatar";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/core/components/ui/card";
import { Checkbox } from "~/core/components/ui/checkbox";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";

// 저장된 E.164 형식을 사용자 친화 표기로 표시 (+821012345678 → 010-1234-5678).
function formatPhoneE164ForDisplay(e164: string | null): string {
  if (!e164) return "";
  if (/^\+8210\d{7,8}$/.test(e164)) {
    const local = "0" + e164.slice(3); // +8210XXXXXXXX → 010XXXXXXXX
    if (local.length === 11) {
      return `${local.slice(0, 3)}-${local.slice(3, 7)}-${local.slice(7)}`;
    }
    if (local.length === 10) {
      return `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}`;
    }
  }
  return e164;
}

export default function EditProfileForm({
  name,
  avatarUrl,
  marketingConsent,
  phoneE164,
  notifyChannels,
}: {
  name: string;
  marketingConsent: boolean;
  avatarUrl: string | null;
  phoneE164: string | null;
  notifyChannels: string[];
}) {
  const fetcher = useFetcher<Route.ComponentProps["actionData"]>();
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (fetcher.data && "success" in fetcher.data && fetcher.data.success) {
      formRef.current?.blur();
      formRef.current?.querySelectorAll("input").forEach((input) => {
        input.blur();
      });
    }
  }, [fetcher.data]);
  const [avatar, setAvatar] = useState<string | null>(avatarUrl);
  const onChangeAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatar(URL.createObjectURL(file));
    }
  };

  // 폰/채널 로컬 상태 — 폰 비우면 카카오 채널 자동 해제 UX
  const [phone, setPhone] = useState(formatPhoneE164ForDisplay(phoneE164));
  const [emailOn, setEmailOn] = useState(notifyChannels.includes("email"));
  const [kakaoOn, setKakaoOn] = useState(notifyChannels.includes("kakao"));
  const phoneTrimmed = phone.replace(/[\s\-()._]/g, "");
  const phoneEmpty = phoneTrimmed.length === 0;

  return (
    <fetcher.Form
      method="post"
      className="w-full max-w-screen-md"
      encType="multipart/form-data"
      ref={formRef}
      action="/api/users/profile"
    >
      <Card className="justify-between">
        <CardHeader>
          <CardTitle>프로필 편집</CardTitle>
          <CardDescription>이름, 아바타, 알림 설정을 관리합니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex w-full flex-col gap-7">
            <div className="flex items-center gap-10">
              <Label
                htmlFor="avatar"
                className="flex flex-col items-start gap-2"
              >
                <span>아바타</span>
                <Avatar className="size-24">
                  {avatar ? <AvatarImage src={avatar} alt="Avatar" /> : null}
                  <AvatarFallback>
                    <UserIcon className="text-muted-foreground size-10" />
                  </AvatarFallback>
                </Avatar>
              </Label>
              <div className="text-muted-foreground flex w-1/2 flex-col gap-2 text-sm">
                <div className="flex flex-col gap-1">
                  <span>최대 1MB</span>
                  <span>지원 형식: PNG, JPG, GIF</span>
                </div>
                <Input
                  id="avatar"
                  name="avatar"
                  type="file"
                  onChange={onChangeAvatar}
                />
              </div>
            </div>

            <div className="flex flex-col items-start space-y-2">
              <Label htmlFor="name" className="flex flex-col items-start gap-1">
                이름
              </Label>
              <Input
                id="name"
                name="name"
                required
                type="text"
                placeholder="홍길동"
                defaultValue={name}
              />
              {fetcher.data &&
              "fieldErrors" in fetcher.data &&
              fetcher.data.fieldErrors?.name ? (
                <FormErrors errors={fetcher.data?.fieldErrors?.name} />
              ) : null}
            </div>

            <div className="flex flex-col items-start space-y-2">
              <Label htmlFor="phone" className="flex flex-col items-start gap-1">
                휴대폰 번호 (선택)
              </Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                placeholder="010-1234-5678"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  // 폰 비우면 카카오 채널 자동 해제
                  if (e.target.value.replace(/[\s\-()._]/g, "").length === 0) {
                    setKakaoOn(false);
                  }
                }}
              />
              <p className="text-muted-foreground text-xs">
                카카오 알림톡으로 알림을 받으려면 휴대폰 번호를 입력하세요.
              </p>
              {fetcher.data &&
              "fieldErrors" in fetcher.data &&
              fetcher.data.fieldErrors?.phone ? (
                <FormErrors errors={fetcher.data.fieldErrors.phone} />
              ) : null}
            </div>

            <div className="flex flex-col items-start space-y-2">
              <Label className="flex flex-col items-start gap-1">알림 채널</Label>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    name="notifyChannels"
                    value="email"
                    checked={emailOn}
                    onCheckedChange={(v) => setEmailOn(Boolean(v))}
                  />
                  이메일
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    name="notifyChannels"
                    value="kakao"
                    checked={kakaoOn}
                    onCheckedChange={(v) => setKakaoOn(Boolean(v))}
                    disabled={phoneEmpty}
                  />
                  <span className={phoneEmpty ? "text-muted-foreground" : ""}>
                    카카오 알림톡
                    {phoneEmpty ? " (휴대폰 번호 등록 후 활성화)" : null}
                  </span>
                </label>
              </div>
              <p className="text-muted-foreground text-xs">
                최소 한 개 이상 선택해야 합니다. 둘 다 끄면 이메일로 발송됩니다.
              </p>
              {fetcher.data &&
              "fieldErrors" in fetcher.data &&
              fetcher.data.fieldErrors?.notifyChannels ? (
                <FormErrors
                  errors={fetcher.data.fieldErrors.notifyChannels}
                />
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="marketingConsent"
                name="marketingConsent"
                defaultChecked={marketingConsent}
              />
              <Label htmlFor="marketingConsent">마케팅 이메일 수신 동의</Label>
            </div>
            {fetcher.data &&
            "fieldErrors" in fetcher.data &&
            fetcher.data.fieldErrors?.marketingConsent ? (
              <FormErrors
                errors={fetcher.data?.fieldErrors?.marketingConsent}
              />
            ) : null}
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <FetcherFormButton
            submitting={fetcher.state === "submitting"}
            label="프로필 저장"
            className="w-full"
          />
          {fetcher.data && "success" in fetcher.data && fetcher.data.success ? (
            <FormSuccess message="프로필이 저장되었습니다" />
          ) : null}
          {fetcher.data && "error" in fetcher.data && fetcher.data.error ? (
            <FormErrors errors={[fetcher.data.error]} />
          ) : null}
        </CardFooter>
      </Card>
    </fetcher.Form>
  );
}
