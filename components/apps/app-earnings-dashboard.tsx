/**
 * Enhanced app earnings dashboard with animated counters, milestone tracking,
 * and celebratory withdrawal flow.
 */

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
  Sparkles,
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
import {
  AnimatedCounter,
  AnimatedCounterWithLabel,
  MilestoneProgress,
  WithdrawDialog,
} from "./monetization";
import { cn } from "@/lib/utils";

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

const PAYOUT_THRESHOLD = 25;

export function AppEarningsDashboard({ appId }: AppEarningsDashboardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const testDataParam = searchParams.get("testData") === "true";

  const [isLoading, setIsLoading] = useState(true);
  const [isTestData, setIsTestData] = useState(false);
  const [monetizationEnabled, setMonetizationEnabled] = useState<
    boolean | null
  >(null);
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
  const [showWithdrawDialog, setShowWithdrawDialog] = useState(false);

  const fetchEarnings = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const url = new URL(
        `/api/v1/apps/${appId}/earnings`,
        window.location.origin,
      );
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
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load earnings data",
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEarnings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId, period, testDataParam]);

  const handleWithdrawSuccess = (newBalance: number) => {
    if (summary) {
      setSummary({
        ...summary,
        withdrawableBalance: newBalance,
      });
    }
    fetchEarnings();
  };

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
          <h3 className="text-lg font-semibold text-white mb-2">
            Error loading earnings
          </h3>
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

  const canWithdraw =
    summary &&
    summary.withdrawableBalance >=
      (summary.payoutThreshold || PAYOUT_THRESHOLD);

  return (
    <div className="space-y-6">
      {isTestData && (
        <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <FlaskConical className="h-5 w-5 text-amber-500" />
          <p className="text-sm text-amber-400">
            Test Data Mode - Showing sample earnings data
          </p>
        </div>
      )}

      {/* Period Selector */}
      <div className="flex justify-end">
        <Select
          value={period}
          onValueChange={(v) => setPeriod(v as typeof period)}
        >
          <SelectTrigger className="w-[180px] bg-white/5 border-white/10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Empty State */}
      {!summary && !isLoading && (
        <BrandCard>
          <CornerBrackets className="opacity-20" />
          <div className="relative z-10 text-center py-12">
            <TrendingUp className="h-16 w-16 mx-auto mb-4 text-white/20" />
            <h3 className="text-lg font-semibold text-white mb-2">
              No earnings yet
            </h3>
            {monetizationEnabled ? (
              <p className="text-white/60">
                Earnings will appear here once users start using your app
              </p>
            ) : (
              <>
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
              </>
            )}
          </div>
        </BrandCard>
      )}

      {/* Hero Stats Card */}
      {summary && (
        <div
          className={cn(
            "relative overflow-hidden rounded-lg border p-6",
            canWithdraw
              ? "bg-gradient-to-br from-green-900/20 via-black/40 to-[#FF5800]/10 border-green-500/30"
              : "bg-gradient-to-br from-[#FF5800]/10 via-black/40 to-purple-900/10 border-white/10",
          )}
        >
          <CornerBrackets
            size="lg"
            color={canWithdraw ? "#22C55E" : "#FF5800"}
            className="opacity-30"
          />

          {/* Background decoration */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-gradient-to-br from-[#FF5800]/5 to-transparent rounded-full blur-3xl animate-liquid-orb" />
          </div>

          <div className="relative z-10 grid gap-6 md:grid-cols-2">
            {/* Left: Total Earnings */}
            <div>
              <p className="text-xs text-white/50 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <TrendingUp className="h-3 w-3" />
                Total Lifetime Earnings
              </p>
              <div className="text-4xl font-bold mb-3">
                <AnimatedCounter
                  value={summary.totalLifetimeEarnings}
                  prefix="$"
                  decimals={2}
                  className="gradient-text"
                  duration={2000}
                />
              </div>
              {breakdown && (
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-green-400 flex items-center gap-1">
                    <ArrowUpRight className="h-3 w-3" />$
                    {breakdown.thisWeek.total.toFixed(2)}
                  </span>
                  <span className="text-white/40">this week</span>
                </div>
              )}
            </div>

            {/* Right: Withdrawable Balance */}
            <div className="md:text-right">
              <p className="text-xs text-white/50 uppercase tracking-wider mb-2 flex items-center gap-1.5 md:justify-end">
                <Wallet className="h-3 w-3" />
                Ready to Withdraw
              </p>
              <div className="text-3xl font-bold text-green-400 mb-3">
                <AnimatedCounter
                  value={summary.withdrawableBalance}
                  prefix="$"
                  decimals={2}
                  duration={1500}
                />
              </div>

              {canWithdraw ? (
                <Button
                  onClick={() => setShowWithdrawDialog(true)}
                  className="bg-gradient-to-r from-green-500 to-green-600 text-white hover:opacity-90 animate-glow-pulse"
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Withdraw Now
                </Button>
              ) : (
                <div className="md:ml-auto md:max-w-[200px]">
                  <MilestoneProgress
                    current={summary.withdrawableBalance}
                    target={summary.payoutThreshold || PAYOUT_THRESHOLD}
                    showAmount={false}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      {summary && (
        <div className="grid gap-4 md:grid-cols-4">
          <StatCard
            label="Pending"
            value={summary.pendingBalance}
            icon={<Clock className="h-5 w-5" />}
            color="yellow"
          />
          <StatCard
            label="Withdrawable"
            value={summary.withdrawableBalance}
            icon={<Wallet className="h-5 w-5" />}
            color="green"
          />
          <StatCard
            label="From Inference"
            value={summary.totalInferenceEarnings}
            icon={<Zap className="h-5 w-5" />}
            color="purple"
          />
          <StatCard
            label="From Purchases"
            value={summary.totalPurchaseEarnings}
            icon={<Coins className="h-5 w-5" />}
            color="orange"
          />
        </div>
      )}

      {/* Period Breakdown */}
      {breakdown && (
        <div className="grid gap-4 md:grid-cols-4">
          {[
            { label: "Today", data: breakdown.today },
            { label: "This Week", data: breakdown.thisWeek },
            { label: "This Month", data: breakdown.thisMonth },
            { label: "All Time", data: breakdown.allTime },
          ].map(({ label, data }, index) => (
            <BrandCard
              key={label}
              className="animate-stagger-fade"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <CornerBrackets size="sm" className="opacity-20" />
              <div className="relative z-10">
                <p className="text-xs text-white/50 mb-2">{label}</p>
                <p className="text-xl font-bold text-white mb-2">
                  ${data.total.toFixed(2)}
                </p>
                <div className="flex gap-3 text-xs">
                  <span className="text-purple-400 flex items-center gap-1">
                    <Zap className="h-3 w-3" />$
                    {data.inferenceEarnings.toFixed(2)}
                  </span>
                  <span className="text-yellow-400 flex items-center gap-1">
                    <Coins className="h-3 w-3" />$
                    {data.purchaseEarnings.toFixed(2)}
                  </span>
                </div>
              </div>
            </BrandCard>
          ))}
        </div>
      )}

      {/* Chart */}
      <BrandCard>
        <CornerBrackets className="opacity-20" />
        <div className="relative z-10">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-[#FF5800]" />
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
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="purchaseEarnings"
                  fill="#eab308"
                  name="Purchase Share"
                  stackId="a"
                  radius={[4, 4, 0, 0]}
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

      {/* Recent Transactions */}
      <BrandCard>
        <CornerBrackets className="opacity-20" />
        <div className="relative z-10">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-white/60" />
            Recent Earnings
          </h3>

          {transactions.length > 0 ? (
            <div className="space-y-2">
              {transactions.map((tx, index) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/5 hover:border-white/10 transition-colors animate-stagger-fade"
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <div className="flex items-center gap-3">
                    <TransactionIcon type={tx.type} />
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
                    <TransactionBadge type={tx.type} />
                    <span
                      className={cn(
                        "font-mono font-semibold",
                        Number(tx.amount) >= 0
                          ? "text-green-400"
                          : "text-red-400",
                      )}
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

      {/* Withdraw Dialog */}
      {summary && (
        <WithdrawDialog
          open={showWithdrawDialog}
          onOpenChange={setShowWithdrawDialog}
          appId={appId}
          withdrawableBalance={summary.withdrawableBalance}
          payoutThreshold={summary.payoutThreshold || PAYOUT_THRESHOLD}
          onSuccess={handleWithdrawSuccess}
        />
      )}
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: "yellow" | "green" | "purple" | "orange";
}

function StatCard({ label, value, icon, color }: StatCardProps) {
  const colorClasses = {
    yellow: "text-yellow-400 bg-yellow-500/10",
    green: "text-green-400 bg-green-500/10",
    purple: "text-purple-400 bg-purple-500/10",
    orange: "text-[#FF5800] bg-[#FF5800]/10",
  };

  return (
    <BrandCard>
      <CornerBrackets size="sm" className="opacity-20" />
      <div className="relative z-10 flex items-center gap-3">
        <div className={cn("p-2 rounded-lg", colorClasses[color])}>{icon}</div>
        <div>
          <p className="text-xs text-white/50">{label}</p>
          <p
            className={cn(
              "text-lg font-bold",
              colorClasses[color].split(" ")[0],
            )}
          >
            <AnimatedCounter
              value={value}
              prefix="$"
              decimals={2}
              duration={1000}
            />
          </p>
        </div>
      </div>
    </BrandCard>
  );
}

function TransactionIcon({ type }: { type: string }) {
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
}

function TransactionBadge({ type }: { type: string }) {
  switch (type) {
    case "inference_markup":
      return (
        <Badge
          variant="secondary"
          className="bg-purple-500/20 text-purple-400 text-xs"
        >
          Inference
        </Badge>
      );
    case "purchase_share":
      return (
        <Badge
          variant="secondary"
          className="bg-yellow-500/20 text-yellow-400 text-xs"
        >
          Purchase
        </Badge>
      );
    case "withdrawal":
      return (
        <Badge
          variant="secondary"
          className="bg-red-500/20 text-red-400 text-xs"
        >
          Withdrawal
        </Badge>
      );
    default:
      return (
        <Badge
          variant="secondary"
          className="bg-gray-500/20 text-gray-400 text-xs"
        >
          {type}
        </Badge>
      );
  }
}
