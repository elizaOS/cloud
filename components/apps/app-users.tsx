/**
 * App users component displaying users who have used the app.
 * Shows both authenticated users and anonymous visitors (by IP).
 *
 * @param props - App users configuration
 * @param props.appId - App ID to fetch users for
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { BrandCard, CornerBrackets } from "@/components/brand";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Loader2,
  Users as UsersIcon,
  DollarSign,
  Activity,
  Globe,
  RefreshCw,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";

interface AppUserDisplay {
  id: string;
  user_id: string;
  total_requests: number;
  total_credits_used: string;
  first_seen_at: string;
  last_seen_at: string;
}

interface Visitor {
  ip: string;
  requestCount: number;
  lastSeen: string;
}

interface AppUsersProps {
  appId: string;
}

export function AppUsers({ appId }: AppUsersProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [users, setUsers] = useState<AppUserDisplay[]>([]);
  const [visitors, setVisitors] = useState<Visitor[]>([]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [usersRes, visitorsRes] = await Promise.all([
        fetch(`/api/v1/apps/${appId}/users?limit=50`),
        fetch(`/api/v1/apps/${appId}/analytics/requests?view=visitors&limit=50`),
      ]);

      const [usersData, visitorsData] = await Promise.all([
        usersRes.json(),
        visitorsRes.json(),
      ]);

      if (usersData.success) {
        setUsers(usersData.users);
      }
      if (visitorsData.success) {
        setVisitors(visitorsData.visitors);
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setIsLoading(false);
    }
  }, [appId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-[#FF5800]" />
      </div>
    );
  }

  const hasUsers = users.length > 0;
  const hasVisitors = visitors.length > 0;

  if (!hasUsers && !hasVisitors) {
    return (
      <BrandCard>
        <CornerBrackets className="opacity-20" />
        <div className="relative z-10 text-center py-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/5 mb-4">
            <UsersIcon className="h-8 w-8 text-white/40" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">
            No users yet
          </h3>
          <p className="text-white/60">
            Users will appear here once they start using your app
          </p>
        </div>
      </BrandCard>
    );
  }

  return (
    <div className="space-y-6">
      {hasUsers && (
        <BrandCard>
          <CornerBrackets className="opacity-20" />
          <div className="relative z-10 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <UsersIcon className="h-5 w-5 text-[#FF5800]" />
                Authenticated Users ({users.length})
              </h2>
            </div>

            <div className="space-y-3">
              {users.map((appUser) => (
                <div
                  key={appUser.id}
                  className="flex items-center justify-between p-4 bg-white/5 hover:bg-white/[0.07] rounded-lg border border-white/10 hover:border-white/20 transition-all"
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-gradient-to-br from-[#FF5800] to-purple-600 text-white">
                        {appUser.user_id.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate mb-1">
                        User {appUser.user_id.substring(0, 8)}
                      </p>
                      <div className="flex items-center gap-4 text-sm text-white/60">
                        <span className="flex items-center gap-1">
                          <Activity className="h-3 w-3" />
                          {appUser.total_requests} requests
                        </span>
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3" />$
                          {parseFloat(appUser.total_credits_used).toFixed(2)}
                        </span>
                      </div>
                    </div>

                    <div className="text-right hidden lg:block">
                      <p className="text-sm text-white/60">
                        First seen{" "}
                        {formatDistanceToNow(new Date(appUser.first_seen_at), {
                          addSuffix: true,
                        })}
                      </p>
                      <p className="text-xs text-white/40 mt-1">
                        Last seen{" "}
                        {formatDistanceToNow(new Date(appUser.last_seen_at), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </BrandCard>
      )}

      {hasVisitors && (
        <BrandCard>
          <CornerBrackets className="opacity-20" />
          <div className="relative z-10 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <Globe className="h-5 w-5 text-[#FF5800]" />
                Visitors ({visitors.length})
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fetchData()}
                disabled={isLoading}
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-3 px-4 text-white/60 font-medium">
                      IP Address
                    </th>
                    <th className="text-right py-3 px-4 text-white/60 font-medium">
                      Requests
                    </th>
                    <th className="text-right py-3 px-4 text-white/60 font-medium">
                      Last Seen
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visitors.map((visitor, index) => (
                    <tr
                      key={visitor.ip}
                      className="border-b border-white/5 hover:bg-white/5"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white/5">
                            <span className="text-white/40 text-xs">
                              {index + 1}
                            </span>
                          </div>
                          <code className="text-white font-mono text-sm">
                            {visitor.ip}
                          </code>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="text-white font-medium">
                          {visitor.requestCount.toLocaleString()}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right text-white/60">
                        {formatDistanceToNow(new Date(visitor.lastSeen), {
                          addSuffix: true,
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </BrandCard>
      )}
    </div>
  );
}
