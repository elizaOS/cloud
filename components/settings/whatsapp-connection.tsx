"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Loader2,
  CheckCircle,
  XCircle,
  MessageCircle,
  ChevronDown,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

// WhatsApp icon SVG
const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

interface WhatsAppStatus {
  configured: boolean;
  connected: boolean;
  phoneNumber?: string;
  twilioConnected?: boolean;
  error?: string;
}

export function WhatsAppConnection() {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [showInstructions, setShowInstructions] = useState(false);

  const fetchStatus = async () => {
    try {
      const response = await fetch("/api/v1/whatsapp/status");
      const data: WhatsAppStatus = await response.json();
      setStatus(data);
    } catch {
      toast.error("Failed to fetch WhatsApp status");
    }
    setIsLoading(false);
  };

  useEffect(() => {
    const controller = new AbortController();

    const loadStatus = async () => {
      setIsLoading(true);
      try {
        const response = await fetch("/api/v1/whatsapp/status", {
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          const data: WhatsAppStatus = await response.json();
          setStatus(data);
          setIsLoading(false);
        }
      } catch {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    loadStatus();

    return () => controller.abort();
  }, []);

  const handleConnect = async () => {
    if (!phoneNumber.trim()) {
      toast.error("Please enter your WhatsApp-enabled phone number");
      return;
    }

    setIsConnecting(true);

    try {
      const response = await fetch("/api/v1/whatsapp/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        toast.success("WhatsApp connected successfully!");
        setPhoneNumber("");
        fetchStatus();
      } else {
        toast.error(data.error || "Failed to connect WhatsApp");
      }
    } catch {
      toast.error("Network error. Please check your connection.");
    }

    setIsConnecting(false);
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);

    try {
      const response = await fetch("/api/v1/whatsapp/disconnect", {
        method: "DELETE",
      });

      if (response.ok) {
        toast.success("WhatsApp disconnected");
        fetchStatus();
      } else {
        const data = await response.json().catch(() => ({}));
        toast.error(data.error || "Failed to disconnect WhatsApp");
      }
    } catch {
      toast.error("Network error. Please check your connection.");
    }

    setIsDisconnecting(false);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // Twilio not connected - show warning
  if (!status?.twilioConnected) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <WhatsAppIcon className="h-5 w-5 text-[#25D366]" />
                WhatsApp
              </CardTitle>
              <CardDescription>
                Send and receive WhatsApp messages
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400 mb-2">
              <AlertTriangle className="h-4 w-4" />
              <span className="font-medium">Twilio Required</span>
            </div>
            <p className="text-sm text-muted-foreground">
              WhatsApp messaging requires a Twilio connection. Please connect
              Twilio first, then enable WhatsApp with your WhatsApp-enabled
              Twilio number.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <WhatsAppIcon className="h-5 w-5 text-[#25D366]" />
              WhatsApp
            </CardTitle>
            <CardDescription>
              Send and receive WhatsApp messages via Twilio
            </CardDescription>
          </div>
          {status?.connected && (
            <Badge variant="default" className="bg-green-500">
              <CheckCircle className="h-3 w-3 mr-1" />
              Connected
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {status?.connected ? (
          <div className="space-y-4">
            {/* Connected phone */}
            <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
              <div className="h-12 w-12 rounded-full bg-[#25D366] flex items-center justify-center">
                <WhatsAppIcon className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold">{status.phoneNumber}</div>
                <div className="text-sm text-muted-foreground">
                  WhatsApp Business number
                </div>
              </div>
            </div>

            {/* Capabilities */}
            <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
              <p className="text-sm font-medium text-green-700 dark:text-green-400 mb-2">
                Your AI agent can now:
              </p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li className="flex items-center gap-2">
                  <MessageCircle className="h-3 w-3" />
                  Send WhatsApp messages
                </li>
                <li className="flex items-center gap-2">
                  <MessageCircle className="h-3 w-3" />
                  Receive and respond to messages
                </li>
              </ul>
            </div>

            {/* Disconnect */}
            <div className="flex items-center justify-between pt-2 border-t">
              <div className="text-sm text-muted-foreground">
                WhatsApp via Twilio is active.
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600 hover:text-red-700"
                    disabled={isDisconnecting}
                  >
                    {isDisconnecting ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <XCircle className="h-4 w-4 mr-1" />
                    )}
                    Disconnect
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Disconnect WhatsApp?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will disable WhatsApp messaging. Your Twilio
                      connection will remain active for SMS.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDisconnect}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      Disconnect
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <Collapsible
              open={showInstructions}
              onOpenChange={setShowInstructions}
            >
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-between p-2 h-auto text-xs"
                >
                  <span>How to enable WhatsApp</span>
                  <ChevronDown
                    className={`h-3 w-3 transition-transform ${
                      showInstructions ? "rotate-180" : ""
                    }`}
                  />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="text-xs text-muted-foreground p-2 bg-muted rounded-lg mt-1">
                <ol className="list-decimal list-inside space-y-1">
                  <li>
                    Go to{" "}
                    <a
                      href="https://www.twilio.com/console/sms/whatsapp/senders"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-green-600 hover:underline inline-flex items-center gap-1"
                    >
                      Twilio WhatsApp Senders
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </li>
                  <li>Enable WhatsApp for your Twilio number</li>
                  <li>Enter your WhatsApp-enabled number below</li>
                </ol>
              </CollapsibleContent>
            </Collapsible>

            <div className="space-y-2">
              <Label htmlFor="whatsappPhone" className="text-xs">
                WhatsApp-Enabled Phone Number
              </Label>
              <Input
                id="whatsappPhone"
                type="tel"
                placeholder="+14155551234"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="h-8 text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Must be a Twilio number with WhatsApp enabled
              </p>
            </div>

            <Button
              onClick={handleConnect}
              disabled={isConnecting || !phoneNumber.trim()}
              className="w-full bg-[#25D366] hover:bg-[#1da851]"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Connecting...
                </>
              ) : (
                <>
                  <WhatsAppIcon className="h-4 w-4 mr-2" />
                  Enable WhatsApp
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
