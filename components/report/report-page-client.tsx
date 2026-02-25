"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { ReportSkeleton } from "@/components/report/report-skeleton";
import { ReportView } from "@/components/report/report-view";
import { decodeReportEnvelope } from "@/lib/natal-request";
import { natalResponseSchema } from "@/lib/schemas/astro";
import { NatalChartResponse } from "@/lib/types/astro";

const MAX_REPORT_AGE_MS = 1000 * 60 * 60 * 24;

interface ApiErrorBody {
  error?: {
    message?: string;
  };
}

const REQUIRED_FEATURES = ["asc", "mc", "chiron", "lilith", "true_node", "mean_node"] as const;

export function ReportPageClient() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<NatalChartResponse | null>(null);
  const [chartSvg, setChartSvg] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const encoded = searchParams.get("data");
  const envelope = useMemo(() => {
    if (!encoded) {
      return null;
    }

    return decodeReportEnvelope(encoded);
  }, [encoded]);

  const isExpired = useMemo(() => {
    if (!envelope) {
      return false;
    }

    return Date.now() - envelope.createdAt > MAX_REPORT_AGE_MS;
  }, [envelope]);

  useEffect(() => {
    const currentEnvelope = envelope;

    if (!currentEnvelope || isExpired) {
      return;
    }

    const uniqueFeatures = new Set([
      ...(currentEnvelope.payload.include_features ?? []),
      ...REQUIRED_FEATURES,
    ]);

    const requestPayload = {
      ...currentEnvelope.payload,
      include_features: Array.from(uniqueFeatures),
      include_dominants: true,
    };
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);
      setChartSvg(null);

      try {
        const cacheBust = Date.now();
        const [natalResponse, chartResponse] = await Promise.all([
          fetch(`/api/natal/calculate?t=${cacheBust}`, {
            method: "POST",
            cache: "no-store",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(requestPayload),
          }),
          fetch(`/api/natal/chart-svg?t=${cacheBust}`, {
            method: "POST",
            cache: "no-store",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(requestPayload),
          }),
        ]);

        const natalBody = (await natalResponse.json()) as NatalChartResponse | ApiErrorBody;

        if (!natalResponse.ok) {
          const message =
            "error" in natalBody && natalBody.error?.message
              ? natalBody.error.message
              : "Could not generate report.";
          throw new Error(message);
        }

        const parsed = natalResponseSchema.safeParse(natalBody);

        if (!parsed.success) {
          throw new Error("Report response shape is invalid.");
        }

        if (!cancelled) {
          setData(parsed.data);
        }

        if (chartResponse.ok) {
          const chartBody = (await chartResponse.json()) as { svg?: string };
          if (!cancelled && chartBody.svg && chartBody.svg.includes("<svg")) {
            setChartSvg(chartBody.svg);
          }
        }
      } catch (unknownError) {
        if (!cancelled) {
          setError(
            unknownError instanceof Error
              ? unknownError.message
              : "Unexpected error while generating report.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [envelope, isExpired, refreshKey]);

  if (!encoded || !envelope) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-10 sm:px-6">
        <section className="border border-black p-6">
          <h1 className="font-serif text-2xl">Invalid report link</h1>
          <p className="mt-2 text-sm">
            This report URL is missing required data. Generate a new report from the
            home page.
          </p>
          <Link className="mt-4 inline-block border border-black px-4 py-2 text-sm" href="/">
            Back to input
          </Link>
        </section>
      </main>
    );
  }

  if (isExpired) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-10 sm:px-6">
        <section className="border border-black p-6">
          <h1 className="font-serif text-2xl">Report link expired</h1>
          <p className="mt-2 text-sm">
            This report payload is older than 24 hours. Generate a fresh report.
          </p>
          <Link className="mt-4 inline-block border border-black px-4 py-2 text-sm" href="/">
            Back to input
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-10 sm:px-6">
      <header className="mb-10 border-b border-black pb-6">
        <h1 className="font-serif text-4xl">Natal Chart Report</h1>
        <p className="mt-3 text-sm">Generated from FreeAstroAPI live data.</p>
        <Link className="mt-4 inline-block border border-black px-4 py-2 text-sm" href="/">
          New report
        </Link>
      </header>

      {loading ? <ReportSkeleton /> : null}

      {error ? (
        <section className="border border-black p-6">
          <h2 className="font-serif text-2xl">Report error</h2>
          <p className="mt-2 text-sm">{error}</p>
          <button
            type="button"
            onClick={() => setRefreshKey((prev) => prev + 1)}
            className="mt-4 border border-black bg-black px-4 py-2 text-sm text-white"
          >
            Retry
          </button>
        </section>
      ) : null}

      {!loading && !error && data ? <ReportView data={data} chartSvg={chartSvg} /> : null}
    </main>
  );
}
