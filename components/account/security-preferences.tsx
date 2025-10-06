"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, Key, Bell, Lock, ExternalLink } from "lucide-react";
import Link from "next/link";

export function SecurityPreferences() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Security & Preferences
        </CardTitle>
        <CardDescription>
          Manage your security settings and notification preferences
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* API Keys */}
          <div className="flex items-start justify-between p-4 rounded-lg border bg-card/50">
            <div className="flex items-start gap-3">
              <div className="rounded-lg p-2 bg-blue-500/10">
                <Key className="h-4 w-4 text-blue-500" />
              </div>
              <div className="space-y-1">
                <p className="font-medium text-sm">API Keys</p>
                <p className="text-xs text-muted-foreground">
                  Manage your API keys for programmatic access
                </p>
              </div>
            </div>
            <Link href="/dashboard/api-keys">
              <Button variant="ghost" size="sm">
                <ExternalLink className="h-4 w-4" />
              </Button>
            </Link>
          </div>

          {/* Authentication */}
          <div className="flex items-start justify-between p-4 rounded-lg border bg-card/50">
            <div className="flex items-start gap-3">
              <div className="rounded-lg p-2 bg-green-500/10">
                <Lock className="h-4 w-4 text-green-500" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm">Two-Factor Authentication</p>
                  <Badge variant="outline" className="text-xs">
                    Coming Soon
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Add an extra layer of security to your account
                </p>
              </div>
            </div>
            <Button variant="ghost" size="sm" disabled>
              Enable
            </Button>
          </div>

          {/* Notifications */}
          <div className="flex items-start justify-between p-4 rounded-lg border bg-card/50">
            <div className="flex items-start gap-3">
              <div className="rounded-lg p-2 bg-purple-500/10">
                <Bell className="h-4 w-4 text-purple-500" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm">Notification Preferences</p>
                  <Badge variant="outline" className="text-xs">
                    Coming Soon
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Control how you receive updates and alerts
                </p>
              </div>
            </div>
            <Button variant="ghost" size="sm" disabled>
              Configure
            </Button>
          </div>

          {/* Divider */}
          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t"></div>
            </div>
          </div>

          {/* Danger Zone */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-destructive">Danger Zone</p>
            </div>
            
            <div className="p-4 rounded-lg border border-destructive/50 bg-destructive/5">
              <div className="space-y-2">
                <p className="font-medium text-sm">Delete Account</p>
                <p className="text-xs text-muted-foreground">
                  Permanently delete your account and all associated data. This action cannot be undone.
                </p>
                <Button 
                  variant="destructive" 
                  size="sm"
                  disabled
                  className="mt-2"
                >
                  Delete Account
                </Button>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

