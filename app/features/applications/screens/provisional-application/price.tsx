import { Link } from "react-router";

import { Button } from "~/core/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/core/components/ui/card";

/**
 * Price Page
 *
 * 한국 가출원 비용 안내 페이지입니다.
 */
export default function Price() {
  return (
    <div className="pb-70">
      <div className="mt-9 flex h-full w-full flex-col gap-5 pb-20">
        <div className="prose prose-sm dark:prose-invert mb-15 flex flex-col gap-10">
          <h1 className="scroll-m-20 text-6xl leading-tight font-bold tracking-tighter text-balance text-[#0a2540]">
            <p>Pricing for</p>
            <p>Provisional applications</p>
          </h1>
        </div>
        <div className="flex flex-row justify-center gap-5">
          <Card className="flex w-[50%] flex-row rounded-md bg-white p-1">
            <div className="flex w-[50%] flex-col">
              <CardHeader className="pt-5">
                <CardTitle className="pb-3 text-xl text-[#0a2540]">
                  Single Filing
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-6">
                <p className="text-sm text-[#586879]">
                  Includes complete filing and digital receipt
                </p>
              </CardContent>
              <CardFooter className="pb-6">
                <Button
                  variant="default"
                  asChild
                  className="h-8 rounded-full px-4 text-base font-medium"
                >
                  <Link to="/applications/provisional-application">
                    Get Started &rarr;
                  </Link>
                </Button>
              </CardFooter>
            </div>
            <h2 className="flex w-[50%] items-center justify-center rounded-xs border-b bg-[#f6f9fc] text-center text-3xl font-medium tracking-tighter text-[#0a2540]">
              $400
            </h2>
          </Card>
          <Card className="flex w-[50%] flex-row rounded-md bg-white p-1">
            <div className="flex w-[50%] flex-col">
              <CardHeader className="pt-5">
                <CardTitle className="pb-3 text-xl text-[#0a2540]">
                  Multi-filing
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-6">
                <p className="text-sm text-[#586879]">
                  Planning to file more than 3?
                </p>
                <p className="text-sm text-[#586879]">
                  Get automatic discounts:
                </p>
              </CardContent>
              <CardFooter className="pb-6">
                <Button
                  variant="default"
                  asChild
                  className="h-8 rounded-full px-4 text-base font-medium"
                >
                  <Link to="/applications/provisional-application">
                    Get Started &rarr;
                  </Link>
                </Button>
              </CardFooter>
            </div>
            <h2 className="flex w-[50%] items-center justify-center rounded-xs border-b bg-[#f6f9fc] text-center text-3xl font-medium tracking-tighter text-[#0a2540]">
              <p>$360/each</p>
            </h2>
          </Card>
        </div>
      </div>
    </div>
  );
}
