"use client";

import { useEffect, useState } from "react";

import { getAdminAnalytics } from "@/network/http/client";
import DateRangeFilter from "@/components/admin/DateRangeFilter";
import StatCard from "@/components/admin/StatCard";
import { LoadingBlock } from "@/components/ui/Spinner";

function formatMinSec(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds || 0));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return m > 0 ? `${m}m ${rem}s` : `${rem}s`;
}

export default function AdminOverviewPage() {
  const [preset, setPreset] = useState("7d");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError("");
    getAdminAnalytics("/overview", { preset })
      .then((res) => !cancelled && setData(res))
      .catch((err) => !cancelled && setError(err?.message || "Failed to load overview."));
    return () => {
      cancelled = true;
    };
  }, [preset]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 text-lg font-bold text-white">Overview</h1>
        <DateRangeFilter value={preset} onChange={setPreset} />
      </div>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {!data && !error ? <LoadingBlock /> : null}

      {data ? (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
            <StatCard label="Visitors" stat={data.visitors} />
            <StatCard label="New Visitors" stat={data.newVisitors} />
            <StatCard label="Returning Visitors" stat={data.returningVisitors} />
            <StatCard label="Signups" stat={data.signups} />
            <StatCard
              label="Avg. Time on Site"
              stat={{ ...data.avgSessionSeconds, value: formatMinSec(data.avgSessionSeconds.value) }}
            />
            <StatCard label="Audio Uploads" stat={data.uploads} />
            <StatCard label="Completed Masters" stat={data.masters} />
            <StatCard label="Pricing Views" stat={data.pricingViews} />
            <StatCard label="Checkout Starts" stat={data.checkoutStarts} />
            <StatCard label="New Customers" stat={data.newCustomers} />
            <StatCard label="Revenue" stat={data.revenue} suffix=" €" />
            <StatCard label="MRR" stat={Math.round(data.mrr)} suffix=" €" />
            <StatCard label="Active Subscribers" stat={data.activeSubscribers} />
            <StatCard label="Cancellations" stat={data.cancellations} />
          </div>

          <div>
            <p className="m-0 mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-500">Core Conversion</p>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <StatCard label="Visitor → Upload" stat={`${data.conversion.visitorToUpload}%`} />
              <StatCard label="Visitor → Master" stat={`${data.conversion.visitorToMaster}%`} />
              <StatCard label="Visitor → Paid" stat={data.conversion.visitorToPaid} suffix="%" />
              <StatCard label="Checkout → Paid" stat={`${data.conversion.checkoutToPaid}%`} />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
