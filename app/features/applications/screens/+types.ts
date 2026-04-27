import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";

export namespace Route {
  export type MetaFunction = MetaFunction;
  export type LoaderArgs = LoaderFunctionArgs;
  export type ComponentProps = {
    actionData?: any;
  };
}
