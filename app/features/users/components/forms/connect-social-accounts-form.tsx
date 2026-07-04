import { Button } from "~/core/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/core/components/ui/card";
import { KakaoLogo } from "~/features/auth/components/logos/kakao";

import {
  ConnectProviderButton,
  DisconnectProviderButton,
} from "../connect-provider-buttons";

// 카카오 단일 로그인 정책 — GitHub 등 다른 제공자는 노출하지 않는다.
const enabledProviders = [
  {
    name: "카카오",
    key: "kakao",
    logo: <KakaoLogo />,
  },
];

export default function ConnectSocialAccountsForm({
  providers,
}: {
  providers: string[];
}) {
  return (
    <Card className="w-full max-w-screen-md">
      <CardHeader>
        <CardTitle>소셜 계정 연결</CardTitle>
        <CardDescription>
          계정에 로그인 방식을 추가하거나 해제합니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {enabledProviders.map((provider) => {
          if (providers.includes(provider.key)) {
            return (
              <DisconnectProviderButton
                key={provider.key}
                provider={provider.name}
                logo={provider.logo}
                providerKey={provider.key}
              />
            );
          } else {
            return (
              <ConnectProviderButton
                key={provider.key}
                provider={provider.name}
                logo={provider.logo}
                providerKey={provider.key}
              />
            );
          }
        })}
      </CardContent>
    </Card>
  );
}
