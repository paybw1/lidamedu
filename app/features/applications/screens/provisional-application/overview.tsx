import { Link } from "react-router";

import { Button } from "~/core/components/ui/button";

export default function Overview() {
  return (
    <div className="pb-40">
      <div className="mt-20 flex h-full w-full flex-row pb-10">
        <div className="prose prose-sm dark:prose-invert flex w-[60%] flex-col gap-10">
          <h1 className="scroll-m-20 text-6xl leading-tight font-bold tracking-tighter text-balance text-[#0a2540]">
            Start smart with a Korean provisional application
          </h1>
          <h4 className="scroll-m-20 text-lg font-normal tracking-tight text-balance text-[#586879]">
            With just a few clicks, you can file in Korea to secure your
            priority date under the Paris Convention — faster, simpler, and at a
            fraction of the cost of filing in the U.S.
          </h4>
        </div>
        <div className="w-[40%]"></div>
      </div>
      <div>
        <Button
          variant="default"
          asChild
          className="h-8 rounded-full px-6 text-base font-semibold"
        >
          <Link
            to="start"
            className="bg-primary text-primary-foreground ring-offset-background hover:bg-primary/90 focus-visible:ring-ring inline-flex h-10 items-center justify-center rounded-md px-8 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
          >
            Get started
          </Link>
        </Button>
      </div>
    </div>
  );
}
