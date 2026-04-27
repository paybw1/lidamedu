import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";

export namespace Route {
  export type LoaderArgs = LoaderFunctionArgs;
  export type MetaFunction = MetaFunction;

  export interface LoaderData {
    user: {
      id: string;
      email?: string;
      identities?: Array<{
        provider: string;
      }>;
    } | null;
  }

  export interface ComponentProps {
    loaderData: LoaderData;
  }
}
