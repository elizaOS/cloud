"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, CreditCard, Calendar } from "lucide-react";
import { format } from "date-fns";
import type { Organization } from "@/db/schemas";

interface OrganizationGeneralTabProps {
  organization: Organization;
}

export function OrganizationGeneralTab({ organization }: OrganizationGeneralTabProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Organization Details
          </CardTitle>
          <CardDescription>
            Basic information about your organization
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Organization Name
              </label>
              <p className="mt-1 text-sm font-semibold">{organization.name}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Organization Slug
              </label>
              <p className="mt-1 text-sm font-mono">{organization.slug}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Status
              </label>
              <div className="mt-1">
                <Badge variant={organization.is_active ? "default" : "destructive"}>
                  {organization.is_active ? "Active" : "Inactive"}
                </Badge>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Created
              </label>
              <p className="mt-1 text-sm flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                {format(new Date(organization.created_at), "MMM d, yyyy")}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Billing Information
          </CardTitle>
          <CardDescription>
            Credit balance and billing details
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Credit Balance
              </label>
              <p className="mt-1 text-2xl font-bold">
                {organization.credit_balance.toLocaleString()} credits
              </p>
            </div>
            {organization.billing_email && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Billing Email
                </label>
                <p className="mt-1 text-sm">{organization.billing_email}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
