"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, CreditCard, Calendar } from "lucide-react";
import type { Organization } from "@/lib/types";

interface OrganizationInfoProps {
  organization: Organization;
}

export function OrganizationInfo({ organization }: OrganizationInfoProps) {
  const formatDate = (date: Date | null) => {
    if (!date) return "N/A";
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatCredits = (credits: number) => {
    return new Intl.NumberFormat("en-US").format(credits);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Organization
        </CardTitle>
        <CardDescription>Information about your organization</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Organization Name</p>
              <p className="font-medium">{organization.name}</p>
            </div>

            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Slug</p>
              <p className="font-mono text-sm">{organization.slug}</p>
            </div>

            <div className="space-y-1">
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Credit Balance
              </p>
              <p className="font-semibold text-lg">
                {formatCredits(organization.credit_balance)} credits
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Status</p>
              <Badge
                variant={organization.is_active ? "default" : "destructive"}
              >
                {organization.is_active ? "Active" : "Inactive"}
              </Badge>
            </div>

            <div className="space-y-1">
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Member Since
              </p>
              <p className="text-sm">{formatDate(organization.created_at)}</p>
            </div>
          </div>

          {organization.billing_email && (
            <div className="pt-4 border-t space-y-1">
              <p className="text-sm text-muted-foreground">Billing Email</p>
              <p className="text-sm">{organization.billing_email}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
