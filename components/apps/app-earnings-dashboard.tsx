"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { BrandCard, CornerBrackets } from "@/components/brand";
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
    try {
      const url = new URL(`/api/v1/apps/${appId}/earnings`, window.location.origin);
      url.searchParams.set("days", period);
      
      // Pass testData param to API if present in the page URL
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
      } else {
        setError(data.error || "Failed to load earnings data");
      }
    } catch (error) {
      console.error("Failed to fetch earnings:", error);
      setError(error instanceof Error ? error.message : "Failed to load earnings");
    } finally {
      setIsLoading(false);
    }
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
      <BrandCard>
        <CornerBrackets className="opacity-20" />
        <div className="relative z-10 text-center py-12">
          <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-400" />
          <h3 className="text-lg font-semibold text-white mb-2">Error loading earnings</h3>
          <p className="text-white/60 mb-4">{error}</p>
          <Button
            onClick={fetchEarnings}
            variant="outline"
            className="bg-white/5"
          >
            Try Again
          </Button>
        </div>
      </BrandCard>
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
        return <DollarSign className="h-4 w-4 text-gray-400" />;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "inference_markup":
        return (
          <Badge variant="secondary" className="bg-purple-500/20 text-purple-400">
            Inference
          </Badge>
        );
      case "purchase_share":
        return (
          <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-400">
            Purchase
          </Badge>
        );
      case "withdrawal":
        return (
          <Badge variant="secondary" className="bg-red-500/20 text-red-400">
            Withdrawal
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary" className="bg-gray-500/20 text-gray-400">
            {type}
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-6">
      {isTestData && (
        <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <FlaskConical className="h-5 w-5 text-amber-500" />
          <p className="text-sm text-amber-400">Test Data Mode</p>
        </div>
      )}
      
      <div className="flex justify-end">
        <Select value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!summary && !isLoading && (
        <BrandCard>
          <CornerBrackets className="opacity-20" />
          <div className="relative z-10 text-center py-12">
            <TrendingUp className="h-16 w-16 mx-auto mb-4 text-white/20" />
            <h3 className="text-lg font-semibold text-white mb-2">No earnings yet</h3>
            <p className="text-white/60 mb-4">
              Enable monetization to start earning from your app
            </p>
            <Button
              onClick={() => {
                router.push(`/dashboard/apps/${appId}?tab=monetization`);
              }}
              className="bg-gradient-to-r from-[#FF5800] to-purple-600"
            >
              Enable Monetization
            </Button>
          </div>
        </BrandCard>
      )}

      {summary && (
        <div className="grid gap-4 md:grid-cols-4">
          <BrandCard>
            <CornerBrackets size="sm" className="opacity-20" />
            <div className="relative z-10">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white/60">Lifetime Earnings</p>
                  <p className="text-2xl font-bold text-white mt-1">
                    ${summary.totalLifetimeEarnings.toFixed(2)}
                  </p>
                </div>
                <TrendingUp className="h-8 w-8 text-green-500" />
              </div>
            </div>
          </BrandCard>

          <BrandCard>
            <CornerBrackets size="sm" className="opacity-20" />
            <div className="relative z-10">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white/60">Pending</p>
                  <p className="text-2xl font-bold text-yellow-400 mt-1">
                    ${summary.pendingBalance.toFixed(2)}
                  </p>
                </div>
                <Clock className="h-8 w-8 text-yellow-500" />
              </div>
            </div>
          </BrandCard>

          <BrandCard>
            <CornerBrackets size="sm" className="opacity-20" />
            <div className="relative z-10">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white/60">Withdrawable</p>
                  <p className="text-2xl font-bold text-green-400 mt-1">
                    ${summary.withdrawableBalance.toFixed(2)}
                  </p>
                </div>
                <Wallet className="h-8 w-8 text-green-500" />
              </div>
            </div>
          </BrandCard>

          <BrandCard>
            <CornerBrackets size="sm" className="opacity-20" />
            <div className="relative z-10">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white/60">Withdrawn</p>
                  <p className="text-2xl font-bold text-white/60 mt-1">
                    ${summary.totalWithdrawn.toFixed(2)}
                  </p>
                </div>
                <ArrowUpRight className="h-8 w-8 text-white/40" />
              </div>
            </div>
          </BrandCard>
        </div>
      )}

      {breakdown && (
        <div className="grid gap-4 md:grid-cols-4">
          {[
            { label: "Today", data: breakdown.today },
            { label: "This Week", data: breakdown.thisWeek },
            { label: "This Month", data: breakdown.thisMonth },
            { label: "All Time", data: breakdown.allTime },
          ].map(({ label, data }) => (
            <BrandCard key={label}>
              <CornerBrackets size="sm" className="opacity-20" />
              <div className="relative z-10">
                <p className="text-sm text-white/60 mb-2">{label}</p>
                <p className="text-xl font-bold text-white">
                  ${data.total.toFixed(2)}
                </p>
                <div className="mt-2 flex gap-2 text-xs">
                  <span className="text-purple-400">
                    <Zap className="h-3 w-3 inline mr-1" />$
                    {data.inferenceEarnings.toFixed(2)}
                  </span>
                  <span className="text-yellow-400">
                    <Coins className="h-3 w-3 inline mr-1" />$
                    {data.purchaseEarnings.toFixed(2)}
                  </span>
                </div>
              </div>
            </BrandCard>
          ))}
        </div>
      )}

      <BrandCard>
        <CornerBrackets className="opacity-20" />
        <div className="relative z-10">
          <h3 className="text-lg font-semibold text-white mb-4">
            Earnings Over Time
          </h3>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.1)"
                />
                <XAxis
                  dataKey="date"
                  stroke="rgba(255,255,255,0.6)"
                  style={{ fontSize: "12px" }}
                />
                <YAxis
                  stroke="rgba(255,255,255,0.6)"
                  style={{ fontSize: "12px" }}
                  tickFormatter={(value) => `$${value.toFixed(2)}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(0,0,0,0.9)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "8px",
                    color: "white",
                  }}
                  formatter={(value: number) => `$${value.toFixed(4)}`}
                />
                <Legend />
                <Bar
                  dataKey="inferenceEarnings"
                  fill="#a855f7"
                  name="Inference Markup"
                  stackId="a"
                />
                <Bar
                  dataKey="purchaseEarnings"
                  fill="#eab308"
                  name="Purchase Share"
                  stackId="a"
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center text-white/60 py-12">
              <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-40" />
              <p>No earnings data yet</p>
            </div>
          )}
        </div>
      </BrandCard>

      {summary && (summary.totalInferenceEarnings > 0 || summary.totalPurchaseEarnings > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          <BrandCard>
            <CornerBrackets className="opacity-20" />
            <div className="relative z-10">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Zap className="h-5 w-5 text-purple-500" />
                Inference Earnings
              </h3>
              <div className="text-3xl font-bold text-purple-400">
                ${summary.totalInferenceEarnings.toFixed(2)}
              </div>
              <div className="mt-4 h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500"
                  style={{
                    width: `${(summary.totalInferenceEarnings / summary.totalLifetimeEarnings) * 100 || 0}%`,
                  }}
                />
              </div>
            </div>
          </BrandCard>

          <BrandCard>
            <CornerBrackets className="opacity-20" />
            <div className="relative z-10">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Coins className="h-5 w-5 text-yellow-500" />
                Purchase Earnings
              </h3>
              <div className="text-3xl font-bold text-yellow-400">
                ${summary.totalPurchaseEarnings.toFixed(2)}
              </div>
              <div className="mt-4 h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-yellow-500"
                  style={{
                    width: `${(summary.totalPurchaseEarnings / summary.totalLifetimeEarnings) * 100 || 0}%`,
                  }}
                />
              </div>
            </div>
          </BrandCard>
        </div>
      )}

      <BrandCard>
        <CornerBrackets className="opacity-20" />
        <div className="relative z-10">
          <h3 className="text-lg font-semibold text-white mb-4">
            Recent Transactions
          </h3>

          {transactions.length > 0 ? (
            <div className="space-y-3">
              {transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between p-3 bg-white/5 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    {getTypeIcon(tx.type)}
                    <div>
                      <p className="text-sm text-white">{tx.description}</p>
                      <p className="text-xs text-white/40">
                        {formatDistanceToNow(new Date(tx.created_at), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getTypeBadge(tx.type)}
                    <span
                      className={`font-mono font-semibold ${
                        Number(tx.amount) >= 0
                          ? "text-green-400"
                          : "text-red-400"
                      }`}
                    >
                      {Number(tx.amount) >= 0 ? "+" : ""}$
                      {Math.abs(Number(tx.amount)).toFixed(4)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-white/60 py-12">
              <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-40" />
              <p className="text-sm mb-2">No transactions yet</p>
              <p className="text-xs text-white/40">
                Transactions will appear here once you start earning
              </p>
            </div>
          )}
        </div>
      </BrandCard>

    </div>
  );
}

