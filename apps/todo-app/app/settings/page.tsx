"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  Check,
  ArrowLeft,
  Phone,
  Calendar,
  Bell,
  ExternalLink,
  RefreshCw,
  Unlink,
} from "lucide-react";

import { useAuth } from "@/lib/use-auth";
import { Button } from "@/components/ui/button";

const CLOUD_URL = process.env.NEXT_PUBLIC_CLOUD_URL || "http://localhost:3000";

interface Integration {
  id: string;
  name: string;
  description: string;
  icon: typeof Phone;
  platform: string;
  connected: boolean;
  configFields?: { key: string; label: string; type: string }[];
}

const INTEGRATIONS: Integration[] = [
  {
    id: "twilio",
    name: "Twilio SMS",
    description: "Send SMS reminders for your tasks",
    icon: Phone,
    platform: "twilio",
    connected: false,
    configFields: [
      { key: "TWILIO_ACCOUNT_SID", label: "Account SID", type: "text" },
      { key: "TWILIO_AUTH_TOKEN", label: "Auth Token", type: "password" },
      { key: "TWILIO_FROM_NUMBER", label: "From Number", type: "text" },
      { key: "phone_number", label: "Your Phone Number", type: "text" },
    ],
  },
  {
    id: "google_calendar",
    name: "Google Calendar",
    description: "Add tasks to your Google Calendar",
    icon: Calendar,
    platform: "google_calendar",
    connected: false,
  },
  {
    id: "reminders",
    name: "Push Notifications",
    description: "Get browser notifications for task reminders",
    icon: Bell,
    platform: "browser",
    connected: false,
  },
];

export default function SettingsPage() {
  const router = useRouter();
  const { isLoading, isAuthenticated, token } = useAuth();
  const [integrations, setIntegrations] = useState<Integration[]>(INTEGRATIONS);
  const [loadingIntegration, setLoadingIntegration] = useState<string | null>(null);
  const [twilioConfig, setTwilioConfig] = useState({
    TWILIO_ACCOUNT_SID: "",
    TWILIO_AUTH_TOKEN: "",
    TWILIO_FROM_NUMBER: "",
    phone_number: "",
  });

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.push("/");
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    if (token) loadIntegrationStatus();
  }, [token]);

  const loadIntegrationStatus = async () => {
    if (!token) return;

    // Check Google Calendar status
    const response = await fetch(`${CLOUD_URL}/api/v1/credentials?platform=google_calendar`, {
      headers: { "X-App-Token": token },
    }).catch(() => null);

    if (response?.ok) {
      const data = await response.json();
      if (data.credentials?.length > 0) {
        setIntegrations((prev) =>
          prev.map((i) =>
            i.id === "google_calendar" ? { ...i, connected: true } : i
          )
        );
      }
    }

    // Check push notification permission
    if ("Notification" in window && Notification.permission === "granted") {
      setIntegrations((prev) =>
        prev.map((i) => (i.id === "reminders" ? { ...i, connected: true } : i))
      );
    }
  };

  const connectGoogleCalendar = async () => {
    if (!token) return;
    setLoadingIntegration("google_calendar");

    const callbackUrl = `${window.location.origin}/settings?connected=google_calendar`;
    const response = await fetch(`${CLOUD_URL}/api/v1/credentials/link`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-App-Token": token,
      },
      body: JSON.stringify({
        platform: "google_calendar",
        callbackUrl,
      }),
    });

    if (!response.ok) {
      toast.error("Failed to start Google Calendar connection");
      setLoadingIntegration(null);
      return;
    }

    const { authUrl } = await response.json();
    window.location.href = authUrl;
  };

  const saveTwilioConfig = async () => {
    if (!token) return;
    setLoadingIntegration("twilio");

    const response = await fetch(`${CLOUD_URL}/api/v1/secrets`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-App-Token": token,
      },
      body: JSON.stringify({
        secrets: [
          { key: "TWILIO_ACCOUNT_SID", value: twilioConfig.TWILIO_ACCOUNT_SID },
          { key: "TWILIO_AUTH_TOKEN", value: twilioConfig.TWILIO_AUTH_TOKEN },
          { key: "TWILIO_FROM_NUMBER", value: twilioConfig.TWILIO_FROM_NUMBER },
          { key: "TODO_PHONE_NUMBER", value: twilioConfig.phone_number },
        ],
      }),
    });

    setLoadingIntegration(null);

    if (!response.ok) {
      toast.error("Failed to save Twilio configuration");
      return;
    }

    setIntegrations((prev) =>
      prev.map((i) => (i.id === "twilio" ? { ...i, connected: true } : i))
    );
    toast.success("Twilio configuration saved");
  };

  const enableNotifications = async () => {
    if (!("Notification" in window)) {
      toast.error("Browser notifications not supported");
      return;
    }

    setLoadingIntegration("reminders");
    const permission = await Notification.requestPermission();
    setLoadingIntegration(null);

    if (permission === "granted") {
      setIntegrations((prev) =>
        prev.map((i) => (i.id === "reminders" ? { ...i, connected: true } : i))
      );
      toast.success("Notifications enabled");
      new Notification("Todo App", { body: "You will now receive task reminders" });
    } else {
      toast.error("Notification permission denied");
    }
  };

  const disconnectIntegration = async (integrationId: string) => {
    setIntegrations((prev) =>
      prev.map((i) => (i.id === integrationId ? { ...i, connected: false } : i))
    );
    toast.success("Integration disconnected");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 backdrop-blur-sm sticky top-0 z-40 bg-background/80">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-4">
          <Link href="/dashboard" className="p-2 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-orange-600 flex items-center justify-center">
              <Check className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-lg">Settings</span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-2">Integrations</h1>
        <p className="text-muted-foreground mb-8">
          Connect services to enhance your todo experience
        </p>

        <div className="space-y-4">
          {integrations.map((integration) => (
            <div
              key={integration.id}
              className="border border-border rounded-lg p-6 bg-card"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
                    <integration.icon className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div>
                    <h3 className="font-semibold flex items-center gap-2">
                      {integration.name}
                      {integration.connected && (
                        <span className="text-xs bg-green-500/20 text-green-500 px-2 py-0.5 rounded-full">
                          Connected
                        </span>
                      )}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {integration.description}
                    </p>
                  </div>
                </div>

                {integration.connected ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => disconnectIntegration(integration.id)}
                  >
                    <Unlink className="h-4 w-4 mr-1" />
                    Disconnect
                  </Button>
                ) : integration.id === "google_calendar" ? (
                  <Button
                    size="sm"
                    onClick={connectGoogleCalendar}
                    disabled={loadingIntegration === "google_calendar"}
                  >
                    {loadingIntegration === "google_calendar" ? (
                      <RefreshCw className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <ExternalLink className="h-4 w-4 mr-1" />
                    )}
                    Connect
                  </Button>
                ) : integration.id === "reminders" ? (
                  <Button
                    size="sm"
                    onClick={enableNotifications}
                    disabled={loadingIntegration === "reminders"}
                  >
                    {loadingIntegration === "reminders" ? (
                      <RefreshCw className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <Bell className="h-4 w-4 mr-1" />
                    )}
                    Enable
                  </Button>
                ) : null}
              </div>

              {integration.id === "twilio" && !integration.connected && (
                <div className="mt-4 pt-4 border-t border-border space-y-3">
                  {integration.configFields?.map((field) => (
                    <div key={field.key}>
                      <label className="text-sm font-medium mb-1 block">
                        {field.label}
                      </label>
                      <input
                        type={field.type}
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
                        value={twilioConfig[field.key as keyof typeof twilioConfig]}
                        onChange={(e) =>
                          setTwilioConfig((prev) => ({
                            ...prev,
                            [field.key]: e.target.value,
                          }))
                        }
                        placeholder={
                          field.key === "phone_number"
                            ? "+1234567890"
                            : field.key === "TWILIO_FROM_NUMBER"
                              ? "+1234567890"
                              : undefined
                        }
                      />
                    </div>
                  ))}
                  <Button
                    onClick={saveTwilioConfig}
                    disabled={
                      loadingIntegration === "twilio" ||
                      !twilioConfig.TWILIO_ACCOUNT_SID ||
                      !twilioConfig.TWILIO_AUTH_TOKEN ||
                      !twilioConfig.TWILIO_FROM_NUMBER
                    }
                    className="mt-2"
                  >
                    {loadingIntegration === "twilio" ? (
                      <RefreshCw className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <Check className="h-4 w-4 mr-1" />
                    )}
                    Save Configuration
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
