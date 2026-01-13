"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  TrendingUp,
  DollarSign,
  Clock,
  Wallet,
  ArrowUpRight,
  Coins,
  Zap,
  FlaskConical,
  AlertCircle,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { formatDistanceToNow } from "date-fns";

interface EarningsSummary {
  totalLifetimeEarnings: number;
  totalInferenceEarnings: number;
  totalPurchaseEarnings: number;
  pendingBalance: number;
  withdrawableBalance: number;
  totalWithdrawn: number;
  payoutThreshold: number;
}

interface EarningsBreakdown {
  period: string;
  inferenceEarnings: number;
  purchaseEarnings: number;
  total: number;
}

interface ChartDataPoint {
  date: string;
  inferenceEarnings: number;
  purchaseEarnings: number;
  total: number;
}

interface Transaction {
  id: string;
  type: string;
  amount: string;
  description: string;
  created_at: string;
  metadata: Record<string, unknown>;
}

interface AppEarningsDashboardProps {
  appId: string;
}

export function AppEarningsDashboard({ appId }: AppEarningsDashboardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const testDataParam = searchParams.get("testData") === "true";

  const [isLoading, setIsLoading] = useState(true);
  const [isTestData, setIsTestData] = useState(false);
  const [monetizationEnabled, setMonetizationEnabled] = useState<boolean | null>(null);
  const [period, setPeriod] = useState<"7" | "30" | "90">("30");
  const [summary, setSummary] = useState<EarningsSummary | null>(null);
  const [breakdown, setBreakdown] = useState<{
    today: EarningsBreakdown;
    thisWeek: EarningsBreakdown;
    thisMonth: EarningsBreakdown;
    allTime: EarningsBreakdown;
  } | null>(null);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchEarnings = async () => {
    setIsLoading(true);
    setError(null);

    const url = new URL(`/api/v1/apps/${appId}/earnings`, window.location.origin);
    url.searchParams.set("days", period);
    if (testDataParam) {
      url.searchParams.set("testData", "true");
    }

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const data = await response.json();

    if (data.success) {
      setSummary(data.earnings.summary);
      setBreakdown(data.earnings.breakdown);
      setChartData(data.earnings.chartData);
      setTransactions(data.earnings.recentTransactions);
      setIsTestData(data.testData === true);
      if (data.monetization) {
        setMonetizationEnabled(data.monetization.enabled);
      }
    } else {
      setError(data.error || "Failed to load earnings data");
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchEarnings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId, period, testDataParam]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-[#FF5800]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-neutral-900 rounded-xl p-6 text-center">
        <AlertCircle className="h-10 w-10 mx-auto mb-3 text-red-400" />
        <h3 className="text-sm font-medium text-white mb-1">Error loading earnings</h3>
        <p className="text-xs text-neutral-500 mb-4">{error}</p>
        <Button onClick={fetchEarnings} variant="outline" size="sm" className="border-white/10">
          Try Again
        </Button>
      </div>
    );
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "inference_markup":
        return <Zap className="h-4 w-4 text-purple-400" />;
      case "purchase_share":
        return <Coins className="h-4 w-4 text-yellow-400" />;
      case "withdrawal":
        return <ArrowUpRight className="h-4 w-4 text-red-400" />;
      default:
        return <DollarSign className="h-4 w-4 text-neutral-400" />;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "inference_markup":
        return <Badge className="bg-purple-500/10 text-purple-400 border-purple-500/30 text-[10px]">Inference</Badge>;
      case "purchase_share":
        return <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30 text-[10px]">Purchase</Badge>;
      case "withdrawal":
        return <Badge className="bg-red-500/10 text-red-400 border-red-500/30 text-[10px]">Withdrawal</Badge>;
      default:
        return <Badge className="bg-neutral-500/10 text-neutral-400 border-neutral-500/30 text-[10px]">{type}</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      {isTestData && (
        <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <FlaskConical className="h-4 w-4 text-amber-400" />
          <p className="text-xs text-amber-400">Test Data Mode</p>
        </div>
      )}

      <div className="flex justify-end">
        <Select value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
          <SelectTrigger className="w-[150px] h-9 bg-neutral-900 border-white/10 rounded-lg">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-neutral-800 border-white/10 rounded-lg">
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!summary && !isLoading && (
        <div className="bg-neutral-900 rounded-xl p-8 text-center">
          <TrendingUp className="h-12 w-12 mx-auto mb-3 text-neutral-600" />
          <h3 className="text-sm font-medium text-white mb-1">No earnings yet</h3>
          {monetizationEnabled ? (
            <p className="text-xs text-neutral-500">Earnings will appear here once users start using your app</p>
          ) : (
            <>
              <p className="text-xs text-neutral-500 mb-4">Enable monetization to start earning from your app</p>
              <Button
                onClick={() => router.push(`/dashboard/apps/${appId}?tab=monetization`)}
                size="sm"
                className="bg-[#FF5800] hover:bg-[#FF5800]/80 text-white"
              >
                Enable Monetization
              </Button>
            </>
          )}
        </div>
      )}

      {summary && (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <StatCard label="Lifetime Earnings" value={`$${summary.totalLifetimeEarnings.toFixed(2)}`} icon={<TrendingUp className="h-5 w-5 text-green-400" />} />
          <StatCard label="Pending" value={`$${summary.pendingBalance.toFixed(2)}`} valueColor="text-yellow-400" icon={<Clock className="h-5 w-5 text-yellow-400" />} />
          <StatCard label="Withdrawable" value={`$${summary.withdrawableBalance.toFixed(2)}`} valueColor="text-green-400" icon={<Wallet className="h-5 w-5 text-green-400" />} />
          <StatCard label="Withdrawn" value={`$${summary.totalWithdrawn.toFixed(2)}`} valueColor="text-neutral-400" icon={<ArrowUpRight className="h-5 w-5 text-neutral-400" />} />
        </div>
      )}

      {breakdown && (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Today", data: breakdown.today },
            { label: "This Week", data: breakdown.thisWeek },
            { label: "This Month", data: breakdown.thisMonth },
            { label: "All Time", data: breakdown.allTime },
          ].map(({ label, data }) => (
            <div key={label} className="bg-neutral-900 rounded-xl p-3">
              <p className="text-[10px] text-neutral-500 mb-1">{label}</p>
              <p className="text-lg font-semibold text-white">${data.total.toFixed(2)}</p>
              <div className="mt-1.5 flex gap-2 text-[10px]">
                <span className="text-purple-400 flex items-center gap-0.5">
                  <Zap className="h-2.5 w-2.5" />${data.inferenceEarnings.toFixed(2)}
                </span>
                <span className="text-yellow-400 flex items-center gap-0.5">
                  <Coins className="h-2.5 w-2.5" />${data.purchaseEarnings.toFixed(2)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-neutral-900 rounded-xl p-4">
        <h3 className="text-sm font-medium text-white mb-4">Earnings Over Time</h3>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis dataKey="date" stroke="rgba(255,255,255,0.4)" style={{ fontSize: "11px" }} />
              <YAxis stroke="rgba(255,255,255,0.4)" style={{ fontSize: "11px" }} tickFormatter={(value) => `$${value.toFixed(2)}`} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#171717",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "8px",
                  color: "white",
                  fontSize: "12px",
                }}
                formatter={(value: number) => `$${value.toFixed(4)}`}
              />
              <Legend />
              <Bar dataKey="inferenceEarnings" fill="#a855f7" name="Inference Markup" stackId="a" />
              <Bar dataKey="purchaseEarnings" fill="#eab308" name="Purchase Share" stackId="a" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-center text-neutral-500 py-12">
            <DollarSign className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No earnings data yet</p>
          </div>
        )}
      </div>

      {summary && (summary.totalInferenceEarnings > 0 || summary.totalPurchaseEarnings > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="bg-neutral-900 rounded-xl p-4">
            <h3 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
              <Zap className="h-4 w-4 text-purple-400" />
              Inference Earnings
            </h3>
            <div className="text-2xl font-bold text-purple-400">${summary.totalInferenceEarnings.toFixed(2)}</div>
            <div className="mt-3 h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-purple-500" style={{ width: `${(summary.totalInferenceEarnings / summary.totalLifetimeEarnings) * 100 || 0}%` }} />
            </div>
          </div>

          <div className="bg-neutral-900 rounded-xl p-4">
            <h3 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
              <Coins className="h-4 w-4 text-yellow-400" />
              Purchase Earnings
            </h3>
            <div className="text-2xl font-bold text-yellow-400">${summary.totalPurchaseEarnings.toFixed(2)}</div>
            <div className="mt-3 h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-yellow-500" style={{ width: `${(summary.totalPurchaseEarnings / summary.totalLifetimeEarnings) * 100 || 0}%` }} />
            </div>
          </div>
        </div>
      )}

      <div className="bg-neutral-900 rounded-xl p-4">
        <h3 className="text-sm font-medium text-white mb-4">Recent Transactions</h3>

        {transactions.length > 0 ? (
          <div className="space-y-2">
            {transactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between p-3 bg-black/30 rounded-lg border border-white/5">
                <div className="flex items-center gap-3">
                  {getTypeIcon(tx.type)}
                  <div>
                    <p className="text-xs text-white">{tx.description}</p>
                    <p className="text-[10px] text-neutral-500">{formatDistanceToNow(new Date(tx.created_at), { addSuffix: true })}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {getTypeBadge(tx.type)}
                  <span className={`font-mono text-xs font-medium ${Number(tx.amount) >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {Number(tx.amount) >= 0 ? "+" : ""}${Math.abs(Number(tx.amount)).toFixed(4)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center text-neutral-500 py-8">
            <DollarSign className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-xs mb-1">No transactions yet</p>
            <p className="text-[10px] text-neutral-600">Transactions will appear here once you start earning</p>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, valueColor = "text-white", icon }: { label: string; value: string; valueColor?: string; icon: React.ReactNode }) {
  return (
    <div className="bg-neutral-900 rounded-xl p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-neutral-500">{label}</p>
          <p className={`text-xl font-semibold mt-1 ${valueColor}`}>{value}</p>
        </div>
        {icon}
      </div>
    </div>
  );
}
