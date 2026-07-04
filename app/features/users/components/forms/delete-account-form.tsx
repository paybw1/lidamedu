import type { Route } from "@rr/app/features/users/api/+types/delete-account";

import { Loader2Icon } from "lucide-react";
import { useFetcher } from "react-router";

import FormErrors from "~/core/components/form-error";
import { Button } from "~/core/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/core/components/ui/card";
import { Checkbox } from "~/core/components/ui/checkbox";
import { Label } from "~/core/components/ui/label";

export default function DeleteAccountForm() {
  const fetcher = useFetcher<Route.ComponentProps["actionData"]>();
  return (
    <Card className="w-full max-w-screen-md bg-red-100 dark:bg-red-900/40">
      <CardHeader>
        <CardTitle>회원 탈퇴</CardTitle>
      </CardHeader>
      <CardContent>
        <fetcher.Form method="delete" className="space-y-4" action="/api/users">
          <p className="text-muted-foreground text-sm leading-relaxed">
            탈퇴 시 서비스 이용이 즉시 중지됩니다. 작성하신 학습 기록(메모·진도·문제
            풀이 등)은 개인정보처리방침에 따라 탈퇴 후 3년간 보관되며, 그 기간 안에
            다시 구독하시면 학습 기록을 이어서 이용하실 수 있습니다. 즉시 파기를
            원하시면 문의를 통해 요청하실 수 있습니다.
          </p>
          <Label>
            <Checkbox
              id="confirm-delete"
              name="confirm-delete"
              required
              className="border-black dark:border-white"
            />
            회원 탈퇴를 신청합니다.
          </Label>
          <Label>
            <Checkbox
              id="confirm-irreversible"
              name="confirm-irreversible"
              required
              className="border-black dark:border-white"
            />
            학습 기록 보관 정책(3년)을 확인했습니다.
          </Label>
          <Button
            variant={"destructive"}
            className="w-full"
            disabled={fetcher.state === "submitting"}
          >
            {fetcher.state === "submitting" ? (
              <Loader2Icon className="ml-2 size-4 animate-spin" />
            ) : (
              "회원 탈퇴"
            )}
          </Button>
          {fetcher.data?.error ? (
            <FormErrors errors={[fetcher.data.error]} />
          ) : null}
        </fetcher.Form>
      </CardContent>
    </Card>
  );
}
