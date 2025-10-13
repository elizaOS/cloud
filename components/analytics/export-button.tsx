"use client";

import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";

interface ExportButtonProps {
  startDate: Date;
  endDate: Date;
  granularity: string;
  format?: "csv" | "json";
  type?: "timeseries" | "users" | "providers" | "models";
  variant?: "simple" | "dropdown";
}

export function ExportButton({
  startDate,
  endDate,
  granularity,
  format = "csv",
  type = "timeseries",
  variant = "simple",
}: ExportButtonProps) {
  const handleExport = (
    exportFormat: "csv" | "json",
    exportType: "timeseries" | "users" | "providers" | "models"
  ) => {
    const params = new URLSearchParams({
      format: exportFormat,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      granularity,
      type: exportType,
      includeMetadata: "true",
    });

    window.location.href = `/api/analytics/export?${params.toString()}`;
  };

  if (variant === "dropdown") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" />
            Export data
            <ChevronDown className="ml-2 h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Export format</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => handleExport("csv", "timeseries")}>
            Time series (CSV)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExport("json", "timeseries")}>
            Time series (JSON)
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => handleExport("csv", "providers")}>
            Providers (CSV)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExport("json", "providers")}>
            Providers (JSON)
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => handleExport("csv", "models")}>
            Models (CSV)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExport("json", "models")}>
            Models (JSON)
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => handleExport("csv", "users")}>
            Users (CSV)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExport("json", "users")}>
            Users (JSON)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <Button
      onClick={() => handleExport(format, type)}
      variant="outline"
      size="sm"
    >
      <Download className="mr-2 h-4 w-4" />
      Export {format.toUpperCase()}
    </Button>
  );
}
