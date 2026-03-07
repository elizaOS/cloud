"use client";

import { useState, useEffect, useCallback } from "react";
import { BrandCard } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Copy, CheckCircle2, UserCog, Link as LinkIcon, AlertTriangle, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { getAppUrl } from "@/lib/utils/app-url";

interface AffiliateData {
    id: string;
    code: string;
    markup_percent: string;
    is_active: boolean;
}

export function AffiliatesPageClient() {
    const [affiliateData, setAffiliateData] = useState<AffiliateData | null>(null);
    const [loading, setLoading] = useState(true);

    const [markupPercent, setMarkupPercent] = useState<string>("0.00");
    const [isSaving, setIsSaving] = useState(false);
    const [copied, setCopied] = useState(false);

    const fetchAffiliateData = useCallback(async () => {
        try {
            const res = await fetch("/api/v1/affiliates");
            if (res.ok) {
                const data = await res.json();
                setAffiliateData(data.code);
                setMarkupPercent(data.code ? data.code.markup_percent : "0.00");
            }
        } catch (e) {
            console.error("Failed to load affiliate data", e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAffiliateData();
    }, [fetchAffiliateData]);

    const handleCopyLink = () => {
        if (!affiliateData) return;
        const url = `${window.location.origin}/login?code=${affiliateData.code}`;
        navigator.clipboard.writeText(url);
        setCopied(true);
        toast.success("Link copied to clipboard!");
        setTimeout(() => setCopied(false), 2000);
    };

    const handleSaveMarkup = async () => {
        const numericValue = parseFloat(markupPercent);
        if (isNaN(numericValue) || numericValue < 0 || numericValue > 1000) {
            toast.error("Invalid markup. Must be between 0 and 1000%.");
            return;
        }

        setIsSaving(true);
        try {
            const res = await fetch("/api/v1/affiliates", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ markupPercent: numericValue }),
            });

            if (res.ok) {
                const data = await res.json();
                setAffiliateData(data.code);
                setMarkupPercent(data.code.markup_percent);
                toast.success("Markup percentage updated!");
            } else {
                const err = await res.json();
                toast.error(err.error || "Failed to save markup");
            }
        } catch (e) {
            toast.error("An unexpected error occurred");
        } finally {
            setIsSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col gap-6 max-w-4xl mx-auto">
                <Skeleton className="h-44 rounded-lg" />
                <Skeleton className="h-44 rounded-lg" />
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6 max-w-4xl mx-auto">
            {/* Introduction Banner */}
            <BrandCard className="relative" corners={false}>
                <div className="flex items-start gap-3">
                    <UserCog className="h-5 w-5 text-[#FF5800] mt-0.5 shrink-0" />
                    <div>
                        <h3 className="text-xl font-semibold text-white mb-2">
                            Affiliate Program
                        </h3>
                        <p className="text-sm text-white/60 mb-2">
                            Share your customized referral link with your users and partners to earn a percentage of all their credit purchases and elizaOS Agent usage.
                        </p>
                        <p className="text-sm text-white/60">
                            When a user signs up using your link, you get a direct cut (your markup percentage) of their activity forever. You can track this revenue in your
                            <Link href="/dashboard/earnings" className="text-[#FF5800] hover:underline mx-1">
                                Earnings
                            </Link>
                            dashboard, which can be withdrawn to any EVM or Solana wallet as $ELIZA tokens.
                        </p>
                    </div>
                </div>
            </BrandCard>

            {/* Referral Link */}
            <BrandCard corners={false}>
                <h3 className="text-lg font-semibold text-white mb-1">Your Referral Link</h3>
                <p className="text-sm text-white/60 mb-4">
                    Copy this link and share it anywhere. Users who create an account using this link will be automatically tracked as your referrals.
                </p>

                <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-lg p-3">
                    <LinkIcon className="h-5 w-5 text-white/40 shrink-0" />
                    <div className="flex-1 font-mono text-white/80 overflow-hidden text-ellipsis whitespace-nowrap text-sm">
                        {typeof window !== "undefined" ? `${window.location.origin}/login?code=${affiliateData?.code}` : `${getAppUrl()}/login?code=${affiliateData?.code}`}
                    </div>
                    <Button
                        variant="secondary"
                        className="shrink-0 bg-white/10 hover:bg-white/20 text-white border-transparent"
                        onClick={handleCopyLink}
                    >
                        {copied ? (
                            <CheckCircle2 className="h-4 w-4 mr-2 text-green-400" />
                        ) : (
                            <Copy className="h-4 w-4 mr-2" />
                        )}
                        {copied ? "Copied" : "Copy"}
                    </Button>
                </div>
            </BrandCard>

            {/* Markup Configuration */}
            <BrandCard corners={false}>
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="text-lg font-semibold text-white mb-1">Fee Markup Setting</h3>
                        <p className="text-sm text-white/60 max-w-xl">
                            Set the exact percentage you want to charge your referred users on top of base elizaOS prices. This fee applies to credit top-ups and exact usage cost for MCPs/Agents.
                        </p>
                    </div>

                    <div className="p-3 bg-white/5 border border-white/10 rounded-lg text-center min-w-[120px]">
                        <span className="block text-xs text-white/40 mb-1">Current Markup</span>
                        <span className="block text-xl font-bold text-[#FF5800]">{affiliateData?.markup_percent}%</span>
                    </div>
                </div>

                <div className="flex items-end gap-4 max-w-md mt-6">
                    <div className="flex-1">
                        <label className="text-sm text-white/60 mb-2 block">
                            Your Markup Percentage (0 - 1000%)
                        </label>
                        <Input
                            type="number"
                            value={markupPercent}
                            onChange={(e) => setMarkupPercent(e.target.value)}
                            className="bg-white/5 border-white/10 text-white font-mono"
                            min={0}
                            max={1000}
                            step={0.1}
                        />
                    </div>
                    <Button
                        onClick={handleSaveMarkup}
                        disabled={isSaving || markupPercent === affiliateData?.markup_percent}
                        className="bg-[#FF5800] hover:bg-[#FF5800]/90 text-white min-w-[100px]"
                    >
                        {isSaving ? "Saving..." : "Save Config"}
                    </Button>
                </div>

                <div className="mt-4 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 flex gap-3 text-sm">
                    <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0" />
                    <div className="text-yellow-500/90">
                        <strong>Pricing Example:</strong> If an API normally costs 10 credits and you set a 20% markup, your user pays 12 credits. You will earn exactly 2 credits which drops instantly into your redeemable token balance.
                    </div>
                </div>
            </BrandCard>
        </div>
    );
}
