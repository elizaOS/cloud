/**
 * App Domains Component
 *
 * Premium DNS management interface with exceptional UX.
 * Inspired by Vercel & Cloudflare's domain management.
 */

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { BrandCard, CornerBrackets } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Globe,
  Plus,
  Trash2,
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  AlertTriangle,
  Loader2,
  Lock,
  Zap,
  ArrowRight,
  X,
  Info,
  Sparkles,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";

// Types
interface DomainInfo {
  id: string;
  subdomain: string;
  subdomainUrl: string;
  customDomain: string | null;
  customDomainUrl: string | null;
  customDomainVerified: boolean;
  sslStatus: "pending" | "provisioning" | "active" | "error";
  isPrimary: boolean;
  verificationRecords: Array<{ type: string; name: string; value: string }>;
  createdAt: string;
  verifiedAt: string | null;
}

interface DnsInstruction {
  type: "A" | "CNAME" | "TXT";
  name: string;
  value: string;
}

interface DomainStatus {
  domain: string;
  status: "pending" | "valid" | "invalid" | "unknown";
  configured: boolean;
  verified: boolean;
  sslStatus: "pending" | "provisioning" | "active" | "error";
  configuredBy: "CNAME" | "A" | "http" | null;
  records: Array<{ type: string; name: string; value: string }>;
  isApexDomain: boolean;
  dnsInstructions: DnsInstruction[];
}

interface AppDomainsProps {
  appId: string;
}

export function AppDomains({ appId }: AppDomainsProps) {
  const [domains, setDomains] = useState<DomainInfo[]>([]);
  const [sandboxUrl, setSandboxUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const [domainStatus, setDomainStatus] = useState<DomainStatus | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchDomains = useCallback(async () => {
    const response = await fetch(`/api/v1/apps/${appId}/domains`);
    const data = await response.json();
    if (data.success) {
      setDomains(data.domains);
      setSandboxUrl(data.sandboxUrl || null);
    }
    setIsLoading(false);
  }, [appId]);

  const checkDomainStatus = useCallback(
    async (domain: string, silent = false) => {
      if (!silent) setIsChecking(true);
      const response = await fetch(`/api/v1/apps/${appId}/domains/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });

      const data = await response.json();

      if (data.success) {
        setDomainStatus(data);
        setLastChecked(new Date());
        if (data.verified) {
          if (!silent) {
            toast.success("Domain verified!", {
              description: "SSL certificate is now being provisioned",
              icon: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
            });
          }
          await fetchDomains();
        }
      }
      if (!silent) setIsChecking(false);
    },
    [appId, fetchDomains],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetching on mount is valid
    fetchDomains();
  }, [fetchDomains]);

  // Auto-poll for unverified domains
  useEffect(() => {
    const primaryDomain = domains.find((d) => d.isPrimary);
    if (primaryDomain?.customDomain && !primaryDomain.customDomainVerified) {
      pollIntervalRef.current = setInterval(() => {
        checkDomainStatus(primaryDomain.customDomain!, true);
      }, 15000);

      return () => {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
        }
      };
    }
  }, [domains, checkDomainStatus]);

  // Focus input when form opens
  useEffect(() => {
    if (showAddForm && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showAddForm]);

  const copyToClipboard = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedValue(text);
    toast.success(`${label} copied to clipboard`);
    setTimeout(() => setCopiedValue(null), 2000);
  };

  const handleAddDomain = async () => {
    const domain = newDomain.trim().toLowerCase();
    if (!domain) return;

    // Basic validation
    const domainRegex = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;
    if (!domainRegex.test(domain)) {
      toast.error("Invalid domain", {
        description:
          "Please enter a valid domain like example.com or app.example.com",
      });
      return;
    }

    setIsAdding(true);
    const response = await fetch(`/api/v1/apps/${appId}/domains`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain }),
    });

    const data = await response.json();

    if (data.success) {
      toast.success(
        data.verified ? "Domain verified!" : "Domain added successfully",
        {
          description: data.verified
            ? "SSL certificate is being provisioned automatically"
            : "Configure your DNS records to complete setup",
        },
      );
      setDomainStatus({
        domain: data.domain,
        status: data.verified ? "valid" : "pending",
        configured: data.verified,
        verified: data.verified,
        sslStatus: data.verified ? "active" : "pending",
        configuredBy: null,
        records: data.verificationRecords,
        isApexDomain: data.isApexDomain,
        dnsInstructions: data.dnsInstructions,
      });
      setNewDomain("");
      setShowAddForm(false);
      await fetchDomains();
    } else {
      toast.error("Failed to add domain", { description: data.error });
    }
    setIsAdding(false);
  };

  const handleRemoveDomain = async (domain: string) => {
    setIsRemoving(true);
    const response = await fetch(`/api/v1/apps/${appId}/domains`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain }),
    });

    const data = await response.json();

    if (data.success) {
      toast.success("Domain removed successfully");
      setDomainStatus(null);
      await fetchDomains();
    } else {
      toast.error("Failed to remove domain", { description: data.error });
    }
    setIsRemoving(false);
  };

  const primaryDomain = domains.find((d) => d.isPrimary);
  const hasCustomDomain = !!primaryDomain?.customDomain;
  const needsVerification =
    hasCustomDomain && !primaryDomain?.customDomainVerified;

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Main Domains Card */}
        <BrandCard>
          <CornerBrackets className="opacity-20" />
          <div className="relative z-10">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
              <div className="space-y-1">
                <h2 className="text-xl sm:text-2xl font-semibold text-white tracking-tight">
                  Domains
                </h2>
                <p className="text-sm text-white/50">
                  Connect custom domains to your app
                </p>
              </div>
              {primaryDomain &&
                !hasCustomDomain &&
                !showAddForm &&
                !isLoading && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                  >
                    <Button
                      onClick={() => setShowAddForm(true)}
                      className="w-full sm:w-auto bg-gradient-to-r from-[#FF5800] to-[#FF7A33] hover:from-[#FF6A1A] hover:to-[#FF8844] text-white border-0 shadow-lg shadow-[#FF5800]/20"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Custom Domain
                    </Button>
                  </motion.div>
                )}
            </div>

            {/* Loading Skeleton */}
            {isLoading ? (
              <div className="space-y-3">
                <div className="h-20 bg-white/5 rounded-xl animate-pulse" />
                <div className="h-20 bg-white/5 rounded-xl animate-pulse opacity-50" />
              </div>
            ) : !primaryDomain && sandboxUrl ? (
              /* Sandbox URL Available - App in Development */
              <div className="space-y-3">
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <DomainCard
                    domain={new URL(sandboxUrl).hostname}
                    url={sandboxUrl}
                    type="subdomain"
                    status="verified"
                    copyToClipboard={copyToClipboard}
                    copiedValue={copiedValue}
                  />
                </motion.div>
                <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-500/5">
                  <div className="flex items-start gap-3">
                    <Info className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm text-blue-300 font-medium">
                        Development URL
                      </p>
                      <p className="text-xs text-blue-300/70 mt-1">
                        This is your sandbox development URL. Deploy your app to
                        get a permanent subdomain and add custom domains.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : !primaryDomain ? (
              /* No App Deployed State */
              <div className="p-8 rounded-xl border border-amber-500/20 bg-amber-500/5">
                <div className="flex flex-col items-center text-center">
                  <div className="w-14 h-14 rounded-full bg-amber-500/10 flex items-center justify-center mb-4">
                    <AlertTriangle className="h-7 w-7 text-amber-400" />
                  </div>
                  <h3 className="text-lg font-medium text-white mb-2">
                    No App Deployed
                  </h3>
                  <p className="text-sm text-white/50 max-w-md mb-4">
                    Deploy your app first to get a subdomain. Once deployed, you
                    can add custom domains here.
                  </p>
                  <p className="text-xs text-amber-400/80">
                    Use the App Creator to build and deploy your app
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Subdomain Row */}
                {primaryDomain && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <DomainCard
                      domain={primaryDomain.subdomain}
                      url={primaryDomain.subdomainUrl}
                      type="subdomain"
                      status="verified"
                      copyToClipboard={copyToClipboard}
                      copiedValue={copiedValue}
                    />
                  </motion.div>
                )}

                {/* Custom Domain Row */}
                {hasCustomDomain && primaryDomain?.customDomain && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                  >
                    <DomainCard
                      domain={primaryDomain.customDomain}
                      url={primaryDomain.customDomainUrl}
                      type="custom"
                      status={
                        primaryDomain.customDomainVerified
                          ? "verified"
                          : "pending"
                      }
                      sslStatus={primaryDomain.sslStatus}
                      onRefresh={() =>
                        checkDomainStatus(primaryDomain.customDomain!)
                      }
                      onRemove={() =>
                        handleRemoveDomain(primaryDomain.customDomain!)
                      }
                      isChecking={isChecking}
                      isRemoving={isRemoving}
                      copyToClipboard={copyToClipboard}
                      copiedValue={copiedValue}
                    />
                  </motion.div>
                )}

                {/* Add Domain Form */}
                <AnimatePresence mode="wait">
                  {showAddForm && primaryDomain && !hasCustomDomain && (
                    <motion.div
                      initial={{ opacity: 0, height: 0, marginTop: 0 }}
                      animate={{ opacity: 1, height: "auto", marginTop: 12 }}
                      exit={{ opacity: 0, height: 0, marginTop: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className="relative overflow-hidden rounded-xl border-2 border-dashed border-[#FF5800]/30 bg-[#FF5800]/5 p-5">
                        <div className="absolute inset-0 bg-gradient-to-br from-[#FF5800]/5 to-transparent" />
                        <div className="relative space-y-4">
                          <div className="flex items-center gap-2 text-[#FF5800]">
                            <Globe className="h-4 w-4" />
                            <span className="text-sm font-medium">
                              Add Custom Domain
                            </span>
                          </div>
                          <div className="flex flex-col sm:flex-row gap-3">
                            <Input
                              ref={inputRef}
                              placeholder="yourdomain.com"
                              value={newDomain}
                              onChange={(e) => setNewDomain(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && newDomain.trim()) {
                                  e.preventDefault();
                                  handleAddDomain();
                                }
                                if (e.key === "Escape") {
                                  setShowAddForm(false);
                                  setNewDomain("");
                                }
                              }}
                              className="flex-1 h-11 bg-black/30 border-white/10 text-white placeholder:text-white/30 focus:border-[#FF5800]/50 focus:ring-[#FF5800]/20"
                            />
                            <div className="flex gap-2">
                              <Button
                                onClick={handleAddDomain}
                                disabled={isAdding || !newDomain.trim()}
                                className="flex-1 sm:flex-none h-11 bg-white text-black hover:bg-white/90 font-medium"
                              >
                                {isAdding ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <>
                                    <ArrowRight className="h-4 w-4 mr-2" />
                                    Add Domain
                                  </>
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                onClick={() => {
                                  setShowAddForm(false);
                                  setNewDomain("");
                                }}
                                className="h-11 px-3 text-white/50 hover:text-white hover:bg-white/10"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          <p className="text-xs text-white/40">
                            Enter your domain (e.g., myapp.com or
                            app.mycompany.com)
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Empty State - show when app deployed but no custom domain */}
                {primaryDomain && !hasCustomDomain && !showAddForm && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="mt-4 p-6 rounded-xl border border-white/5 bg-white/[0.01]"
                  >
                    <div className="flex flex-col items-center text-center py-4">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#FF5800]/20 to-purple-500/20 flex items-center justify-center mb-4">
                        <Sparkles className="h-6 w-6 text-[#FF5800]" />
                      </div>
                      <h3 className="text-white font-medium mb-1">
                        Use Your Own Domain
                      </h3>
                      <p className="text-sm text-white/50 max-w-sm mb-4">
                        Connect a custom domain to make your app accessible at
                        your own branded URL
                      </p>
                      <Button
                        variant="outline"
                        onClick={() => setShowAddForm(true)}
                        className="border-white/20 text-white hover:bg-white/10"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Domain
                      </Button>
                    </div>
                  </motion.div>
                )}
              </div>
            )}
          </div>
        </BrandCard>

        {/* DNS Configuration Panel */}
        <AnimatePresence>
          {needsVerification && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <DnsConfigPanel
                domain={primaryDomain?.customDomain || ""}
                domainStatus={domainStatus}
                onRefresh={() =>
                  checkDomainStatus(primaryDomain?.customDomain || "")
                }
                isChecking={isChecking}
                lastChecked={lastChecked}
                copyToClipboard={copyToClipboard}
                copiedValue={copiedValue}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Quick Reference */}
        <BrandCard>
          <CornerBrackets className="opacity-20" />
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Info className="h-4 w-4 text-blue-400" />
              </div>
              <h3 className="font-medium text-white">Quick DNS Reference</h3>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <QuickRefCard
                title="Subdomains"
                example="app.example.com"
                type="CNAME"
                value="cname.vercel-dns.com"
              />
              <QuickRefCard
                title="Root Domains"
                example="example.com"
                type="A"
                value="76.76.21.21"
              />
            </div>
            <p className="mt-4 text-xs text-white/40 flex items-center gap-2">
              <Clock className="h-3 w-3" />
              DNS changes typically propagate within 5 minutes to 48 hours
            </p>
          </div>
        </BrandCard>
      </div>
    </TooltipProvider>
  );
}

// Domain Card Component
function DomainCard({
  domain,
  url,
  type,
  status,
  sslStatus = "active",
  onRefresh,
  onRemove,
  isChecking,
  isRemoving,
  copyToClipboard,
  copiedValue,
}: {
  domain: string;
  url: string | null;
  type: "subdomain" | "custom";
  status: "verified" | "pending" | "error";
  sslStatus?: string;
  onRefresh?: () => void;
  onRemove?: () => void;
  isChecking?: boolean;
  isRemoving?: boolean;
  copyToClipboard: (text: string, label: string) => void;
  copiedValue: string | null;
}) {
  const fullUrl = url || `https://${domain}`;
  const isVerified = status === "verified";

  return (
    <div
      className={`
        relative overflow-hidden rounded-xl border transition-all duration-200
        ${
          isVerified
            ? "bg-white/[0.02] border-white/10 hover:border-white/20"
            : "bg-amber-500/5 border-amber-500/20 hover:border-amber-500/30"
        }
      `}
    >
      {/* Subtle gradient overlay for verified domains */}
      {isVerified && (
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/[0.02] to-transparent pointer-events-none" />
      )}

      <div className="relative p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          {/* Domain Info */}
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-mono text-white font-medium truncate">
                {domain}
              </span>
              <DomainStatusBadge status={status} sslStatus={sslStatus} />
              {type === "subdomain" && (
                <span className="text-[10px] text-white/40 uppercase tracking-wider font-medium">
                  Default
                </span>
              )}
            </div>
            {isVerified && (
              <div className="flex items-center gap-1.5 text-emerald-400/80">
                <Lock className="h-3 w-3" />
                <span className="text-xs">SSL/TLS Secured</span>
              </div>
            )}
            {!isVerified && type === "custom" && (
              <div className="flex items-center gap-1.5 text-amber-400/80">
                <AlertTriangle className="h-3 w-3" />
                <span className="text-xs">DNS verification pending</span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 sm:gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(fullUrl, "URL")}
                  className="h-9 w-9 p-0 text-white/50 hover:text-white hover:bg-white/10"
                >
                  {copiedValue === fullUrl ? (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="text-emerald-400"
                    >
                      <Check className="h-4 w-4" />
                    </motion.div>
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Copy URL</TooltipContent>
            </Tooltip>

            {isVerified && url && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center h-9 w-9 text-white/50 hover:text-white hover:bg-white/10 rounded-md transition-colors"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </TooltipTrigger>
                <TooltipContent>Open in new tab</TooltipContent>
              </Tooltip>
            )}

            {type === "custom" && onRefresh && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onRefresh}
                    disabled={isChecking}
                    className="h-9 w-9 p-0 text-white/50 hover:text-white hover:bg-white/10"
                  >
                    <RefreshCw
                      className={`h-4 w-4 ${isChecking ? "animate-spin" : ""}`}
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Check DNS status</TooltipContent>
              </Tooltip>
            )}

            {type === "custom" && onRemove && (
              <AlertDialog>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isRemoving}
                        className="h-9 w-9 p-0 text-white/50 hover:text-red-400 hover:bg-red-500/10"
                      >
                        {isRemoving ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </AlertDialogTrigger>
                  </TooltipTrigger>
                  <TooltipContent>Remove domain</TooltipContent>
                </Tooltip>
                <AlertDialogContent className="sm:max-w-md">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove Domain</AlertDialogTitle>
                    <AlertDialogDescription className="space-y-2">
                      <span>
                        Are you sure you want to remove{" "}
                        <code className="px-1.5 py-0.5 bg-white/10 rounded font-mono text-white">
                          {domain}
                        </code>
                        ?
                      </span>
                      <span className="block text-white/50">
                        Users will no longer be able to access your app via this
                        domain.
                      </span>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter className="gap-2 sm:gap-0">
                    <AlertDialogCancel className="border-white/20">
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={onRemove}
                      className="bg-red-600 hover:bg-red-700 text-white"
                    >
                      Remove Domain
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Domain Status Badge
function DomainStatusBadge({
  status,
  sslStatus,
}: {
  status: string;
  sslStatus: string;
}) {
  if (status === "verified" && sslStatus === "active") {
    return (
      <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 gap-1.5">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
        </span>
        Active
      </Badge>
    );
  }

  if (sslStatus === "provisioning") {
    return (
      <Badge className="bg-blue-500/10 text-blue-400 border border-blue-500/30 gap-1.5">
        <Loader2 className="h-3 w-3 animate-spin" />
        Provisioning SSL
      </Badge>
    );
  }

  return (
    <Badge className="bg-amber-500/10 text-amber-400 border border-amber-500/30 gap-1.5">
      <Clock className="h-3 w-3" />
      Pending
    </Badge>
  );
}

// DNS Configuration Panel
function DnsConfigPanel({
  domain,
  domainStatus,
  onRefresh,
  isChecking,
  lastChecked,
  copyToClipboard,
  copiedValue,
}: {
  domain: string;
  domainStatus: DomainStatus | null;
  onRefresh: () => void;
  isChecking: boolean;
  lastChecked: Date | null;
  copyToClipboard: (text: string, label: string) => void;
  copiedValue: string | null;
}) {
  const isApex = domain.split(".").length === 2;
  const currentStatus = domainStatus?.status || "pending";

  const dnsRecords: DnsInstruction[] = domainStatus?.dnsInstructions || [
    isApex
      ? { type: "A", name: "@", value: "76.76.21.21" }
      : {
          type: "CNAME",
          name: domain.split(".")[0],
          value: "cname.vercel-dns.com",
        },
  ];

  const txtRecords =
    domainStatus?.records?.filter((r) => r.type === "TXT") || [];

  return (
    <BrandCard>
      <CornerBrackets className="opacity-20" />
      <div className="relative z-10">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="p-2.5 rounded-xl bg-amber-500/10">
                <Zap className="h-5 w-5 text-amber-400" />
              </div>
              {currentStatus === "pending" && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-400" />
                </span>
              )}
            </div>
            <div>
              <h3 className="font-semibold text-white">Configure DNS</h3>
              <p className="text-sm text-white/50">
                Add these records at your DNS provider
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {lastChecked && (
              <span className="text-xs text-white/40 hidden sm:block">
                Last checked: {lastChecked.toLocaleTimeString()}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={isChecking}
              className="border-white/20 text-white hover:bg-white/10"
            >
              {isChecking ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Verify DNS
            </Button>
          </div>
        </div>

        {/* Status Banner */}
        <motion.div
          initial={false}
          animate={{
            backgroundColor:
              currentStatus === "valid"
                ? "rgba(16, 185, 129, 0.1)"
                : currentStatus === "invalid"
                  ? "rgba(239, 68, 68, 0.1)"
                  : "rgba(245, 158, 11, 0.1)",
          }}
          className="mb-6 p-4 rounded-xl border flex items-start sm:items-center gap-3"
          style={{
            borderColor:
              currentStatus === "valid"
                ? "rgba(16, 185, 129, 0.3)"
                : currentStatus === "invalid"
                  ? "rgba(239, 68, 68, 0.3)"
                  : "rgba(245, 158, 11, 0.3)",
          }}
        >
          {currentStatus === "valid" ? (
            <>
              <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
              <div>
                <p className="text-emerald-300 font-medium">
                  DNS Verified Successfully
                </p>
                <p className="text-emerald-300/70 text-sm">
                  SSL certificate is being provisioned automatically
                </p>
              </div>
            </>
          ) : currentStatus === "invalid" ? (
            <>
              <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
              <div>
                <p className="text-red-300 font-medium">
                  DNS Configuration Issue
                </p>
                <p className="text-red-300/70 text-sm">
                  Please check your records match exactly
                </p>
              </div>
            </>
          ) : (
            <>
              <Loader2 className="h-5 w-5 text-amber-400 animate-spin shrink-0" />
              <div>
                <p className="text-amber-300 font-medium">
                  Waiting for DNS Propagation
                </p>
                <p className="text-amber-300/70 text-sm">
                  This may take a few minutes. We&apos;ll check automatically.
                </p>
              </div>
            </>
          )}
        </motion.div>

        {/* DNS Records */}
        <div className="space-y-4">
          {txtRecords.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">
                Verification Record
              </h4>
              <div className="space-y-2">
                {txtRecords.map((record, i) => (
                  <DnsRecordRow
                    key={i}
                    type="TXT"
                    name={record.name}
                    value={record.value}
                    copyToClipboard={copyToClipboard}
                    copiedValue={copiedValue}
                  />
                ))}
              </div>
            </div>
          )}

          <div>
            <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">
              {isApex ? "A Record" : "CNAME Record"}
            </h4>
            <div className="space-y-2">
              {dnsRecords.map((record, i) => (
                <DnsRecordRow
                  key={i}
                  type={record.type}
                  name={record.name}
                  value={record.value}
                  copyToClipboard={copyToClipboard}
                  copiedValue={copiedValue}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </BrandCard>
  );
}

// DNS Record Row
function DnsRecordRow({
  type,
  name,
  value,
  copyToClipboard,
  copiedValue,
}: {
  type: string;
  name: string;
  value: string;
  copyToClipboard: (text: string, label: string) => void;
  copiedValue: string | null;
}) {
  return (
    <div className="group relative bg-black/20 rounded-lg border border-white/5 overflow-hidden">
      {/* Desktop */}
      <div className="hidden sm:grid sm:grid-cols-[100px_minmax(100px,1fr)_minmax(200px,2fr)_48px] gap-4 p-4 items-center">
        <div>
          <Badge
            variant="outline"
            className="font-mono text-xs border-white/20 text-white/70 bg-white/5"
          >
            {type}
          </Badge>
        </div>
        <div className="font-mono text-sm text-white truncate" title={name}>
          {name}
        </div>
        <div className="font-mono text-sm text-white/60 truncate" title={value}>
          {value}
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copyToClipboard(value, `${type} value`)}
              className="h-8 w-8 p-0 text-white/40 hover:text-white hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              {copiedValue === value ? (
                <Check className="h-4 w-4 text-emerald-400" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Copy value</TooltipContent>
        </Tooltip>
      </div>

      {/* Mobile */}
      <div className="sm:hidden p-4 space-y-3">
        <div className="flex items-center justify-between">
          <Badge
            variant="outline"
            className="font-mono text-xs border-white/20 text-white/70 bg-white/5"
          >
            {type}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => copyToClipboard(value, `${type} value`)}
            className="h-8 px-3 text-white/50 hover:text-white hover:bg-white/10"
          >
            {copiedValue === value ? (
              <Check className="h-4 w-4 text-emerald-400" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            <span className="ml-2 text-xs">Copy</span>
          </Button>
        </div>
        <div className="space-y-2">
          <div>
            <p className="text-[10px] text-white/40 uppercase font-medium mb-1">
              Name / Host
            </p>
            <p className="font-mono text-sm text-white break-all">{name}</p>
          </div>
          <div>
            <p className="text-[10px] text-white/40 uppercase font-medium mb-1">
              Value / Target
            </p>
            <p className="font-mono text-sm text-white/60 break-all">{value}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Quick Reference Card
function QuickRefCard({
  title,
  example,
  type,
  value,
}: {
  title: string;
  example: string;
  type: string;
  value: string;
}) {
  return (
    <div className="p-4 rounded-lg bg-white/[0.02] border border-white/5">
      <div className="flex items-center justify-between mb-3">
        <span className="font-medium text-white text-sm">{title}</span>
        <span className="text-xs text-white/40 font-mono">{example}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="p-2 bg-black/20 rounded">
          <p className="text-white/40 mb-1">Type</p>
          <p className="font-mono text-white/80">{type}</p>
        </div>
        <div className="p-2 bg-black/20 rounded">
          <p className="text-white/40 mb-1">Value</p>
          <p className="font-mono text-white/60 truncate">{value}</p>
        </div>
      </div>
    </div>
  );
}
