import type { Route } from "./+types/account";

import { Suspense } from "react";
import { Await } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";

import ChangeEmailForm from "../components/forms/change-email-form";
import ChangePasswordForm from "../components/forms/change-password-form";
import ConnectSocialAccountsForm from "../components/forms/connect-social-accounts-form";
import DeleteAccountForm from "../components/forms/delete-account-form";
import EditProfileForm from "../components/forms/edit-profile-form";
import { getUserProfile } from "../queries";

export const meta: Route.MetaFunction = () => {
  return [{ title: `내 계정 | ${import.meta.env.VITE_APP_NAME}` }];
};

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  const identities = client.auth.getUserIdentities();
  const profile = getUserProfile(client, { userId: user!.id });
  return {
    user,
    identities,
    profile,
  };
}

export default function Account({ loaderData }: Route.ComponentProps) {
  const { user, identities, profile } = loaderData;
  const hasEmailIdentity = user?.identities?.some(
    (identity) => identity.provider === "email",
  );
  return (
    <div className="flex w-full flex-col items-center gap-10 pt-0 pb-8">
      <Suspense
        fallback={
          <div className="bg-card animate-fast-pulse h-60 w-full max-w-screen-md rounded-xl border shadow-sm" />
        }
      >
        <Await
          resolve={profile}
          errorElement={
            <div className="text-red-500">프로필을 불러오지 못했습니다</div>
          }
        >
          {(profile) => {
            if (!profile) {
              return null;
            }
            return (
              <EditProfileForm
                name={profile.name}
                marketingConsent={profile.marketing_consent}
                avatarUrl={profile.avatar_url}
                phoneE164={profile.phone_e164}
                notifyChannels={profile.notify_channels}
              />
            );
          }}
        </Await>
      </Suspense>
      <ChangeEmailForm email={user?.email ?? ""} />
      <ChangePasswordForm hasPassword={hasEmailIdentity ?? false} />
      <Suspense
        fallback={
          <div className="bg-card animate-fast-pulse h-60 w-full max-w-screen-md rounded-xl border shadow-sm" />
        }
      >
        <Await
          resolve={identities}
          errorElement={
            <div className="text-red-500">소셜 계정을 불러오지 못했습니다</div>
          }
        >
          {({ data, error }) => {
            if (!data) {
              return (
                <div className="text-red-500">
                  <span>소셜 계정을 불러오지 못했습니다</span>
                  <span className="text-xs">오류 코드: {error.code}</span>
                  <span className="text-xs">메시지: {error.message}</span>
                </div>
              );
            }
            return (
              <ConnectSocialAccountsForm
                providers={data.identities
                  .filter((identity) => identity.provider !== "email")
                  .map((identity) => identity.provider)}
              />
            );
          }}
        </Await>
      </Suspense>
      <DeleteAccountForm />
    </div>
  );
}
