export function generateCSV(
  data: Array<Record<string, unknown>>,
  columns: Array<{ key: string; label: string }>
): string {
  const header = columns.map((col) => col.label).join(",");
  const rows = data.map((row) =>
    columns
      .map((col) => {
        const value = row[col.key];
        if (
          typeof value === "string" &&
          (value.includes(",") || value.includes('"'))
        ) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value ?? "";
      })
      .join(",")
  );

  return [header, ...rows].join("\n");
}

export function generateJSON(data: unknown): string {
  return JSON.stringify(data, null, 2);
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
    },
  });
}
