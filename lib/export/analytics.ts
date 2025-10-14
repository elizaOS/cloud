export interface ExportColumn {
  key: string;
  label: string;
  format?: (value: unknown) => string;
}

export interface ExportOptions {
  includeTimestamp?: boolean;
  includeMetadata?: boolean;
  groupBy?: string;
}

/**
 * Sanitize value to prevent CSV injection attacks
 * Values starting with =, +, -, @, tab, or carriage return are prefixed with '
 * @param value - The value to sanitize
 * @returns Sanitized value safe for CSV export
 */
function sanitizeCSVValue(value: string): string {
  const dangerousChars = ['=', '+', '-', '@', '\t', '\r'];

  if (dangerousChars.some(char => value.startsWith(char))) {
    return `'${value}`; // Prefix with single quote to treat as text
  }

  return value;
}

export function generateCSV(
  data: Array<Record<string, unknown>>,
  columns: Array<ExportColumn>,
  options?: ExportOptions
): string {
  const rows: string[] = [];

  if (options?.includeTimestamp) {
    rows.push(`# Generated: ${new Date().toISOString()}`);
  }

  if (options?.includeMetadata && data.length > 0) {
    rows.push(`# Total Records: ${data.length}`);
  }

  const header = columns.map((col) => col.label).join(",");
  rows.push(header);

  const dataRows = data.map((row) =>
    columns
      .map((col) => {
        let value = row[col.key];
        if (col.format) {
          value = col.format(value);
        }

        // Convert to string
        const stringValue = value?.toString() ?? "";

        // Sanitize for CSV injection
        const sanitized = sanitizeCSVValue(stringValue);

        // Quote if contains comma or quote
        if (sanitized.includes(",") || sanitized.includes('"')) {
          return `"${sanitized.replace(/"/g, '""')}"`;
        }

        return sanitized;
      })
      .join(",")
  );

  rows.push(...dataRows);
  return rows.join("\n");
}

export function generateJSON(
  data: unknown,
  options?: ExportOptions
): string {
  const output: Record<string, unknown> = {};

  if (options?.includeTimestamp) {
    output.generatedAt = new Date().toISOString();
  }

  if (options?.includeMetadata && Array.isArray(data)) {
    output.metadata = {
      totalRecords: data.length,
    };
  }

  output.data = data;

  return JSON.stringify(output, null, 2);
}

export async function generateExcel(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ..._args: [
    data: Array<Record<string, unknown>>,
    columns: Array<ExportColumn>,
    options?: ExportOptions
  ]
): Promise<Buffer> {
  throw new Error(
    "Excel export requires 'xlsx' package. Install with: bun add xlsx"
  );
}

export async function generatePDF(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ..._args: [
    data: Array<Record<string, unknown>>,
    columns: Array<ExportColumn>,
    title: string,
    options?: ExportOptions
  ]
): Promise<Buffer> {
  throw new Error(
    "PDF export requires 'pdfkit' package. Install with: bun add pdfkit @types/pdfkit"
  );
}

export function createDownloadResponse(
  content: string,
  filename: string,
  contentType: string
): Response {
  return new Response(content, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-cache",
    },
  });
}

export function formatCurrency(value: unknown): string {
  const num = Number(value);
  return isNaN(num) ? "0.00" : (num / 100).toFixed(2);
}

export function formatNumber(value: unknown): string {
  const num = Number(value);
  if (isNaN(num)) return "0";
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

export function formatPercentage(value: unknown): string {
  const num = Number(value);
  return isNaN(num) ? "0.0%" : `${(num * 100).toFixed(1)}%`;
}

export function formatDate(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string") {
    return new Date(value).toISOString();
  }
  return "";
}
