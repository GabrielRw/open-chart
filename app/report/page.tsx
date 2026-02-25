import { Suspense } from "react";

import { ReportPageClient } from "@/components/report/report-page-client";
import { ReportSkeleton } from "@/components/report/report-skeleton";

export default function ReportPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-10 sm:px-6">
          <ReportSkeleton />
        </main>
      }
    >
      <ReportPageClient />
    </Suspense>
  );
}
