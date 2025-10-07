"use client";

import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

interface ExportButtonProps {
  startDate: Date;
  endDate: Date;
  granularity: string;
  format?: "csv" | "json";
  type?: "timeseries" | "users";
}

export function ExportButton({
  startDate,
  endDate,
  granularity,
  format = "csv",
  type = "timeseries",
}: ExportButtonProps) {
  const handleExport = () => {
    const params = new URLSearchParams({
      format,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      granularity,
      type,
    });

    window.location.href = `/api/analytics/export?${params.toString()}`;
  };

  return (
    <Button onClick={handleExport} variant="outline" size="sm">
      <Download className="h-4 w-4 mr-2" />
      Export {format.toUpperCase()}
    </Button>
  );
}
