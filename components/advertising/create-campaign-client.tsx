"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Megaphone,
  ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useSetPageHeader } from "@/components/layout/page-header-context";
import { BrandCard, BrandButton } from "@/components/brand";
import type { GalleryItem } from "@/app/actions/gallery";
import { listUserMedia } from "@/app/actions/gallery";

interface AdAccount {
  id: string;
  platform: "meta" | "google" | "tiktok";
  accountName: string;
  externalAccountId: string;
  status: string;
}

type Step = "account" | "details" | "budget" | "media" | "review";

const OBJECTIVES = [
  {
    value: "awareness",
    label: "Brand Awareness",
    description: "Reach people likely to pay attention",
  },
  {
    value: "traffic",
    label: "Traffic",
    description: "Send people to a destination",
  },
  {
    value: "engagement",
    label: "Engagement",
    description: "Get more likes, comments, shares",
  },
  {
    value: "leads",
    label: "Lead Generation",
    description: "Collect leads for your business",
  },
  {
    value: "app_promotion",
    label: "App Promotion",
    description: "Get app installs and engagement",
  },
  {
    value: "sales",
    label: "Sales",
    description: "Find people likely to purchase",
  },
];

export function CreateCampaignClient() {
  useSetPageHeader({
    title: "Create Campaign",
    description: "Set up a new advertising campaign",
  });

  const router = useRouter();
  const [step, setStep] = useState<Step>("account");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  // Data
  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);

  // Form state
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [campaignName, setCampaignName] = useState("");
  const [objective, setObjective] = useState<string>("traffic");
  const [budgetType, setBudgetType] = useState<"daily" | "lifetime">("daily");
  const [budgetAmount, setBudgetAmount] = useState<string>("10");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [selectedMedia, setSelectedMedia] = useState<GalleryItem[]>([]);
  const [headline, setHeadline] = useState("");
  const [primaryText, setPrimaryText] = useState("");
  const [destinationUrl, setDestinationUrl] = useState("");

  // Targeting
  const [locations, setLocations] = useState<string>("US");
  const [ageMin, setAgeMin] = useState<string>("18");
  const [ageMax, setAgeMax] = useState<string>("65");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [accountsRes, galleryData] = await Promise.all([
        fetch("/api/v1/advertising/accounts"),
        listUserMedia({ type: "image", limit: 50 }),
      ]);

      if (cancelled) return;

      if (accountsRes.ok) {
        const data = await accountsRes.json();
        setAccounts(data.accounts || []);
      }
      setGalleryItems(galleryData);
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);

  const canProceed = () => {
    switch (step) {
      case "account":
        return !!selectedAccountId;
      case "details":
        return !!campaignName && !!objective;
      case "budget":
        return parseFloat(budgetAmount) > 0;
      case "media":
        return selectedMedia.length > 0 && !!headline && !!primaryText;
      case "review":
        return true;
      default:
        return false;
    }
  };

  const steps: Step[] = ["account", "details", "budget", "media", "review"];
  const currentStepIndex = steps.indexOf(step);

  const goNext = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < steps.length) {
      setStep(steps[nextIndex]);
    }
  };

  const goPrev = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setStep(steps[prevIndex]);
    }
  };

  const handleCreate = async () => {
    setIsCreating(true);

    const campaignResponse = await fetch("/api/v1/advertising/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        adAccountId: selectedAccountId,
        name: campaignName,
        objective,
        budgetType,
        budgetAmount: parseFloat(budgetAmount),
        budgetCurrency: "USD",
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        targeting: {
          locations: locations.split(",").map((l) => l.trim()),
          ageMin: parseInt(ageMin),
          ageMax: parseInt(ageMax),
        },
      }),
    });

    if (!campaignResponse.ok) {
      const error = await campaignResponse.json();
      toast.error(error.error || "Failed to create campaign");
      setIsCreating(false);
      return;
    }

    const campaign = await campaignResponse.json();

    // Create creative
    const creativeResponse = await fetch(
      `/api/v1/advertising/campaigns/${campaign.id}/creatives`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${campaignName} - Creative`,
          type: "image",
          headline,
          primaryText,
          destinationUrl,
          media: selectedMedia.map((m) => ({
            type: m.type,
            url: m.url,
            mimeType: m.mimeType || "image/jpeg",
          })),
        }),
      },
    );

    if (!creativeResponse.ok) {
      toast.warning("Campaign created but creative failed");
    }

    toast.success("Campaign created successfully");
    router.push("/dashboard/advertising");
    setIsCreating(false);
  };

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <Skeleton className="h-8 w-64 bg-white/10" />
        <Skeleton className="h-64 w-full bg-white/10" />
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="max-w-xl mx-auto text-center py-16">
        <div className="rounded-full bg-[#FF580020] border border-[#FF5800]/40 p-6 mb-4 mx-auto w-fit">
          <Megaphone className="w-12 h-12 text-[#FF5800]" />
        </div>
        <h3 className="text-xl font-semibold mb-2 text-white">
          No Ad Accounts Connected
        </h3>
        <p className="text-white/60 max-w-md mx-auto mb-6">
          Connect an advertising platform account to create campaigns. Currently
          supported: Meta (Facebook/Instagram).
        </p>
        <Link href="/dashboard/settings">
          <BrandButton variant="primary">Connect Account</BrandButton>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Progress Steps */}
      <div className="flex items-center justify-between mb-8">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center">
            <button
              onClick={() => i < currentStepIndex && setStep(s)}
              disabled={i > currentStepIndex}
              className={`w-8 h-8 flex items-center justify-center text-sm font-medium transition-colors ${
                i < currentStepIndex
                  ? "bg-[#FF5800] text-white"
                  : i === currentStepIndex
                    ? "bg-[#FF5800] text-white"
                    : "bg-white/10 text-white/40"
              }`}
            >
              {i < currentStepIndex ? <Check className="w-4 h-4" /> : i + 1}
            </button>
            {i < steps.length - 1 && (
              <div
                className={`w-12 sm:w-24 h-0.5 mx-1 ${
                  i < currentStepIndex ? "bg-[#FF5800]" : "bg-white/10"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <BrandCard corners={false} className="p-6">
        {step === "account" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white mb-2">
                Select Ad Account
              </h2>
              <p className="text-white/60">
                Choose the advertising platform account for this campaign.
              </p>
            </div>

            <div className="grid gap-4">
              {accounts.map((account) => (
                <button
                  key={account.id}
                  onClick={() => setSelectedAccountId(account.id)}
                  className={`p-4 text-left border transition-colors ${
                    selectedAccountId === account.id
                      ? "border-[#FF5800] bg-[#FF580010]"
                      : "border-white/10 hover:border-white/20"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <span className="text-2xl">
                      {account.platform === "meta" && "📘"}
                      {account.platform === "google" && "🔍"}
                      {account.platform === "tiktok" && "🎵"}
                    </span>
                    <div className="flex-1">
                      <p className="font-semibold text-white">
                        {account.accountName}
                      </p>
                      <p className="text-sm text-white/60 capitalize">
                        {account.platform} • {account.externalAccountId}
                      </p>
                    </div>
                    {selectedAccountId === account.id && (
                      <Check className="w-5 h-5 text-[#FF5800]" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "details" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white mb-2">
                Campaign Details
              </h2>
              <p className="text-white/60">
                Set your campaign name and objective.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-white">
                  Campaign Name
                </label>
                <Input
                  placeholder="My Campaign"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-white">
                  Objective
                </label>
                <div className="grid gap-3">
                  {OBJECTIVES.map((obj) => (
                    <button
                      key={obj.value}
                      onClick={() => setObjective(obj.value)}
                      className={`p-3 text-left border transition-colors ${
                        objective === obj.value
                          ? "border-[#FF5800] bg-[#FF580010]"
                          : "border-white/10 hover:border-white/20"
                      }`}
                    >
                      <p className="font-medium text-white">{obj.label}</p>
                      <p className="text-sm text-white/60">{obj.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {step === "budget" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white mb-2">
                Budget & Schedule
              </h2>
              <p className="text-white/60">
                Set your budget and campaign duration.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-white">
                  Budget Type
                </label>
                <Select
                  value={budgetType}
                  onValueChange={(v) =>
                    setBudgetType(v as "daily" | "lifetime")
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily Budget</SelectItem>
                    <SelectItem value="lifetime">Lifetime Budget</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-white">
                  Budget Amount (USD)
                </label>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="10"
                  value={budgetAmount}
                  onChange={(e) => setBudgetAmount(e.target.value)}
                />
                <p className="text-xs text-white/50">
                  Credits needed: ~$
                  {(parseFloat(budgetAmount || "0") * 1.1).toFixed(2)}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white">
                    Start Date (optional)
                  </label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white">
                    End Date (optional)
                  </label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-white">
                  Target Locations
                </label>
                <Input
                  placeholder="US, CA, GB"
                  value={locations}
                  onChange={(e) => setLocations(e.target.value)}
                />
                <p className="text-xs text-white/50">
                  Comma-separated country codes
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white">
                    Minimum Age
                  </label>
                  <Input
                    type="number"
                    min="13"
                    max="65"
                    value={ageMin}
                    onChange={(e) => setAgeMin(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white">
                    Maximum Age
                  </label>
                  <Input
                    type="number"
                    min="18"
                    max="65"
                    value={ageMax}
                    onChange={(e) => setAgeMax(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {step === "media" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white mb-2">
                Creative & Media
              </h2>
              <p className="text-white/60">
                Select media from your gallery and add copy.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-white">
                  Select Images from Gallery
                </label>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-48 overflow-y-auto p-2 border border-white/10 bg-black/20">
                  {galleryItems.length === 0 ? (
                    <div className="col-span-full py-8 text-center text-white/50">
                      <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No images in gallery</p>
                      <Link
                        href="/dashboard/gallery"
                        className="text-[#FF5800] text-sm hover:underline"
                      >
                        Go to Gallery
                      </Link>
                    </div>
                  ) : (
                    galleryItems.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => {
                          if (selectedMedia.find((m) => m.id === item.id)) {
                            setSelectedMedia(
                              selectedMedia.filter((m) => m.id !== item.id),
                            );
                          } else {
                            setSelectedMedia([...selectedMedia, item]);
                          }
                        }}
                        className={`aspect-square relative overflow-hidden border-2 transition-colors ${
                          selectedMedia.find((m) => m.id === item.id)
                            ? "border-[#FF5800]"
                            : "border-transparent"
                        }`}
                      >
                        <Image
                          src={item.thumbnailUrl || item.url}
                          alt=""
                          fill
                          className="object-cover"
                          sizes="80px"
                        />
                        {selectedMedia.find((m) => m.id === item.id) && (
                          <div className="absolute inset-0 bg-[#FF5800]/30 flex items-center justify-center">
                            <Check className="w-6 h-6 text-white" />
                          </div>
                        )}
                      </button>
                    ))
                  )}
                </div>
                <p className="text-xs text-white/50">
                  {selectedMedia.length} image(s) selected
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-white">
                  Headline
                </label>
                <Input
                  placeholder="Your attention-grabbing headline"
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  maxLength={40}
                />
                <p className="text-xs text-white/50">
                  {headline.length}/40 characters
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-white">
                  Primary Text
                </label>
                <Textarea
                  placeholder="Your ad copy..."
                  value={primaryText}
                  onChange={(e) => setPrimaryText(e.target.value)}
                  rows={3}
                  maxLength={125}
                />
                <p className="text-xs text-white/50">
                  {primaryText.length}/125 characters
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-white">
                  Destination URL
                </label>
                <Input
                  type="url"
                  placeholder="https://your-website.com"
                  value={destinationUrl}
                  onChange={(e) => setDestinationUrl(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        {step === "review" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white mb-2">
                Review & Launch
              </h2>
              <p className="text-white/60">
                Review your campaign before creating.
              </p>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-white/5 border border-white/10">
                  <p className="text-xs text-white/50 uppercase">Account</p>
                  <p className="font-medium text-white">
                    {selectedAccount?.accountName}
                  </p>
                </div>
                <div className="p-3 bg-white/5 border border-white/10">
                  <p className="text-xs text-white/50 uppercase">Objective</p>
                  <p className="font-medium text-white capitalize">
                    {objective}
                  </p>
                </div>
                <div className="p-3 bg-white/5 border border-white/10">
                  <p className="text-xs text-white/50 uppercase">Budget</p>
                  <p className="font-medium text-white">
                    ${budgetAmount} {budgetType}
                  </p>
                </div>
                <div className="p-3 bg-white/5 border border-white/10">
                  <p className="text-xs text-white/50 uppercase">Media</p>
                  <p className="font-medium text-white">
                    {selectedMedia.length} image(s)
                  </p>
                </div>
              </div>

              <div className="p-3 bg-white/5 border border-white/10">
                <p className="text-xs text-white/50 uppercase mb-2">Preview</p>
                <div className="flex gap-4">
                  {selectedMedia[0] && (
                    <div className="w-20 h-20 relative flex-shrink-0">
                      <Image
                        src={selectedMedia[0].url}
                        alt=""
                        fill
                        className="object-cover"
                      />
                    </div>
                  )}
                  <div className="flex-1">
                    <p className="font-semibold text-white">{headline}</p>
                    <p className="text-sm text-white/70 line-clamp-2">
                      {primaryText}
                    </p>
                    {destinationUrl && (
                      <p className="text-xs text-blue-400 truncate mt-1">
                        {destinationUrl}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-3 bg-amber-500/10 border border-amber-500/30">
                <p className="text-sm text-amber-400">
                  Creating this campaign will deduct ~$
                  {(parseFloat(budgetAmount) * 1.1 + 0.5).toFixed(2)} credits
                  from your account.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-white/10">
          <div>
            {currentStepIndex > 0 && (
              <BrandButton variant="outline" onClick={goPrev}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </BrandButton>
            )}
          </div>
          <div>
            {step === "review" ? (
              <BrandButton
                variant="primary"
                onClick={handleCreate}
                disabled={isCreating}
              >
                {isCreating ? "Creating..." : "Create Campaign"}
              </BrandButton>
            ) : (
              <BrandButton
                variant="primary"
                onClick={goNext}
                disabled={!canProceed()}
              >
                Next
                <ArrowRight className="w-4 h-4 ml-2" />
              </BrandButton>
            )}
          </div>
        </div>
      </BrandCard>
    </div>
  );
}
