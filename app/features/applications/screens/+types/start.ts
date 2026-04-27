import type { LoaderFunctionArgs } from "react-router";

export namespace Route {
  export type LoaderArgs = LoaderFunctionArgs;

  export interface LoaderData {
    user: {
      id: string;
      email?: string;
      identities?: Array<{
        provider: string;
      }>;
    } | null;
    existingApplications: Array<{
      id: string;
      title: string;
      international_application_number: string;
      created_at: string;
    }>;
  }

  export interface ComponentProps {
    loaderData: LoaderData;
  }
}
