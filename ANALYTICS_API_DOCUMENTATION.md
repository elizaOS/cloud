# Analytics API Documentation

This document describes the analytics API endpoints implemented to support advanced analytics features, including projections, cost breakdown, and comprehensive export functionality.

## Table of Contents

1. [Overview Endpoint](#overview-endpoint)
2. [Breakdown Endpoint](#breakdown-endpoint)
3. [Projections Endpoint](#projections-endpoint)
4. [Export Endpoint](#export-endpoint)
5. [Configuration Endpoint](#configuration-endpoint)
6. [Query Functions](#query-functions)
7. [Projection Utilities](#projection-utilities)
8. [Export Utilities](#export-utilities)

---

## Overview Endpoint

**GET** `/api/analytics/overview`

Provides comprehensive analytics data including time series, provider breakdown, model breakdown, summary statistics, and trend data.

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `timeRange` | string | `"daily"` | Time range for data: `"daily"`, `"weekly"`, or `"monthly"` |

### Response Schema

```typescript
{
  success: boolean;
  data: {
    timeSeries: Array<{
      date: string;           // ISO date string (YYYY-MM-DD)
      requests: number;
      cost: number;           // In credit units (×100)
      spent: number;          // Alias for cost
      tokens: number;
    }>;
    providerBreakdown: Array<{
      provider: string;
      name: string;           // Alias for provider
      requests: number;
      cost: number;
      spent: number;
      tokens: number;
      percentage: number;     // Usage percentage
      marketShare: number;    // Alias for percentage
    }>;
    modelBreakdown: Array<{
      model: string;
      requests: number;
      cost: number;
      spent: number;
      tokens: number;
    }>;
    summary: {
      totalRequests: number;
      totalCost: number;
      totalSpent: number;
      totalTokens: number;
      successRate: number;    // 0.0 to 1.0
      avgCostPerRequest: number;
      avgLatency: number;
      activeApiKeys: number;
    };
    trends: {
      requestsChange: number;      // Percentage change
      costChange: number;
      spentChange: number;
      tokensChange: number;
      successRateChange: number;
      period: string;              // e.g., "7d"
    };
  }
}
```

### Example Request

```bash
curl -X GET "https://your-domain.com/api/analytics/overview?timeRange=weekly" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Example Response

```json
{
  "success": true,
  "data": {
    "timeSeries": [
      {
        "date": "2025-10-01",
        "requests": 150,
        "cost": 2500,
        "spent": 2500,
        "tokens": 50000
      }
    ],
    "providerBreakdown": [
      {
        "provider": "openai",
        "name": "openai",
        "requests": 100,
        "cost": 2000,
        "spent": 2000,
        "tokens": 40000,
        "percentage": 80.0,
        "marketShare": 80.0
      }
    ],
    "modelBreakdown": [
      {
        "model": "gpt-4",
        "requests": 50,
        "cost": 1500,
        "spent": 1500,
        "tokens": 25000
      }
    ],
    "summary": {
      "totalRequests": 150,
      "totalCost": 2500,
      "totalSpent": 2500,
      "totalTokens": 50000,
      "successRate": 0.98,
      "avgCostPerRequest": 16.67,
      "avgLatency": 0,
      "activeApiKeys": 0
    },
    "trends": {
      "requestsChange": 15.5,
      "costChange": 12.3,
      "spentChange": 12.3,
      "tokensChange": 14.2,
      "successRateChange": 2.1,
      "period": "7d"
    }
  }
}
```

---

## Breakdown Endpoint

**GET** `/api/analytics/breakdown`

Provides cost breakdown by different dimensions with sorting and filtering capabilities.

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `dimension` | string | `"model"` | Breakdown dimension: `"model"`, `"provider"`, `"user"`, or `"apiKey"` |
| `sortBy` | string | `"cost"` | Sort field: `"cost"`, `"requests"`, or `"tokens"` |
| `sortOrder` | string | `"desc"` | Sort order: `"asc"` or `"desc"` |
| `limit` | number | `100` | Maximum number of results |
| `startDate` | string | 30 days ago | Start date (ISO format) |
| `endDate` | string | Now | End date (ISO format) |

### Response Schema

```typescript
{
  success: boolean;
  data: Array<{
    dimension: string;      // The dimension type
    value: string;          // The dimension value
    cost: number;
    spent: number;
    requests: number;
    tokens: number;
    successCount: number;
    totalCount: number;
    successRate: number;
  }>;
}
```

### Example Request

```bash
curl -X GET "https://your-domain.com/api/analytics/breakdown?dimension=provider&sortBy=cost&limit=10" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Example Response

```json
{
  "success": true,
  "data": [
    {
      "dimension": "provider",
      "value": "openai",
      "cost": 5000,
      "spent": 5000,
      "requests": 200,
      "tokens": 100000,
      "successCount": 195,
      "totalCount": 200,
      "successRate": 0.975
    },
    {
      "dimension": "provider",
      "value": "anthropic",
      "cost": 3000,
      "spent": 3000,
      "requests": 150,
      "tokens": 80000,
      "successCount": 148,
      "totalCount": 150,
      "successRate": 0.987
    }
  ]
}
```

---

## Projections Endpoint

**GET** `/api/analytics/projections`

Generates predictive analytics using linear regression on historical data, with alerts for cost concerns.

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `timeRange` | string | `"weekly"` | Historical time range: `"daily"`, `"weekly"`, or `"monthly"` |
| `periods` | number | `7` | Number of periods to project into the future |

### Response Schema

```typescript
{
  success: boolean;
  data: {
    historicalData: Array<{
      date: string;
      requests: number;
      spent: number;
      tokens: number;
    }>;
    projections: Array<{
      date: string;
      requests: number;
      spent: number;
      tokens: number;
      isProjected: boolean;
      confidence?: number;    // 0-100, only for projected data
    }>;
    alerts: Array<{
      type: "warning" | "danger" | "info";
      title: string;
      message: string;
      projectedValue?: number;
      projectedDate?: Date;
    }>;
    metadata: {
      timeRange: string;
      periods: number;
      creditBalance: number;
    };
  }
}
```

### Example Request

```bash
curl -X GET "https://your-domain.com/api/analytics/projections?timeRange=weekly&periods=14" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Example Response

```json
{
  "success": true,
  "data": {
    "historicalData": [
      {
        "date": "2025-10-01",
        "requests": 100,
        "spent": 2000,
        "tokens": 50000
      }
    ],
    "projections": [
      {
        "date": "2025-10-01",
        "requests": 100,
        "spent": 2000,
        "tokens": 50000,
        "isProjected": false
      },
      {
        "date": "2025-10-08",
        "requests": 115,
        "spent": 2300,
        "tokens": 57500,
        "isProjected": true,
        "confidence": 87
      }
    ],
    "alerts": [
      {
        "type": "warning",
        "title": "Moderate Cost Increase",
        "message": "Projected costs may increase by 35% in the coming period.",
        "projectedValue": 2700
      }
    ],
    "metadata": {
      "timeRange": "weekly",
      "periods": 14,
      "creditBalance": 50000
    }
  }
}
```

---

## Export Endpoint

**GET** `/api/analytics/export`

Enhanced export endpoint supporting multiple data types and formats with advanced formatting.

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `format` | string | `"csv"` | Export format: `"csv"`, `"json"`, `"excel"`, or `"pdf"` |
| `type` | string | `"timeseries"` | Data type: `"timeseries"`, `"users"`, `"providers"`, or `"models"` |
| `granularity` | string | `"day"` | Time granularity: `"hour"`, `"day"`, `"week"`, or `"month"` |
| `startDate` | string | 30 days ago | Start date (ISO format) |
| `endDate` | string | Now | End date (ISO format) |
| `includeMetadata` | boolean | `false` | Include metadata in export |

### Supported Data Types

1. **timeseries** - Time-series usage data with requests, costs, tokens
2. **users** - Per-user breakdown with activity tracking
3. **providers** - Provider-level aggregations with market share
4. **models** - Model-level statistics with cost analysis

### Export Formats

| Format | Status | Requirements |
|--------|--------|--------------|
| CSV | ✅ Implemented | None |
| JSON | ✅ Implemented | None |
| Excel | ⚠️ Placeholder | Requires `xlsx` package |
| PDF | ⚠️ Placeholder | Requires `pdfkit` package |

### Example Request

```bash
curl -X GET "https://your-domain.com/api/analytics/export?format=csv&type=models&includeMetadata=true" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  --output analytics-export.csv
```

### CSV Output Example

```csv
# Generated: 2025-10-07T12:00:00.000Z
# Total Records: 5
Model,Provider,Total Requests,Total Cost (Credits),Total Tokens,Avg Cost/Token,Success Rate
gpt-4,openai,100,25.00,50000,0.000500,98.5%
gpt-3.5-turbo,openai,200,8.50,80000,0.000106,99.2%
claude-3-opus,anthropic,50,18.00,35000,0.000514,97.8%
```

---

## Configuration Endpoint

**GET** `/api/analytics/config`
**PUT** `/api/analytics/config`

Manage analytics configuration settings at the organization level.

### GET Response Schema

```typescript
{
  success: boolean;
  data: {
    markupPercentage: number;      // 0-100
    autoRefreshInterval: number;   // Seconds, minimum 10
    defaultTimeRange: string;      // "daily" | "weekly" | "monthly"
    exportFormats: string[];       // ["csv", "json", "excel", "pdf"]
  }
}
```

### PUT Request Body

```typescript
{
  markupPercentage?: number;      // Optional, 0-100
  autoRefreshInterval?: number;   // Optional, >= 10 seconds
  defaultTimeRange?: string;      // Optional, "daily" | "weekly" | "monthly"
  exportFormats?: string[];       // Optional array of format strings
}
```

### Example Request

```bash
# GET current configuration
curl -X GET "https://your-domain.com/api/analytics/config" \
  -H "Authorization: Bearer YOUR_API_KEY"

# UPDATE configuration (requires owner/admin role)
curl -X PUT "https://your-domain.com/api/analytics/config" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "markupPercentage": 25,
    "autoRefreshInterval": 30,
    "defaultTimeRange": "weekly"
  }'
```

---

## Query Functions

### Provider Breakdown

```typescript
getProviderBreakdown(
  organizationId: string,
  options?: { startDate?: Date; endDate?: Date }
): Promise<ProviderBreakdown[]>
```

Returns aggregated usage statistics grouped by provider with market share calculations.

### Model Breakdown

```typescript
getModelBreakdown(
  organizationId: string,
  options?: {
    startDate?: Date;
    endDate?: Date;
    limit?: number
  }
): Promise<ModelBreakdown[]>
```

Returns detailed model-level statistics including average cost per token.

### Trend Data

```typescript
getTrendData(
  organizationId: string,
  currentPeriod: { startDate: Date; endDate: Date },
  previousPeriod: { startDate: Date; endDate: Date }
): Promise<TrendData>
```

Calculates percentage changes between two time periods for all key metrics.

### Cost Breakdown

```typescript
getCostBreakdown(
  organizationId: string,
  dimension: "model" | "provider" | "user" | "apiKey",
  options?: {
    startDate?: Date;
    endDate?: Date;
    sortBy?: "cost" | "requests" | "tokens";
    sortOrder?: "asc" | "desc";
    limit?: number;
  }
): Promise<CostBreakdownItem[]>
```

Flexible cost breakdown aggregation by any dimension with sorting capabilities.

---

## Projection Utilities

### Linear Regression

```typescript
calculateLinearRegression(values: number[]): LinearRegressionResult
```

Calculates slope and intercept for linear trend forecasting.

**Algorithm:**
```
slope = (n * Σ(xy) - Σx * Σy) / (n * Σ(x²) - (Σx)²)
intercept = (Σy - slope * Σx) / n
```

### Generate Projections

```typescript
generateProjections(
  historicalData: TimeSeriesDataPoint[],
  periods: number
): ProjectionDataPoint[]
```

Generates future projections using linear regression with:
- 10% variance simulation for realism
- Confidence scores decreasing over time (90% → 60%)
- Minimum value constraints (no negative projections)

### Generate Alerts

```typescript
generateProjectionAlerts(
  historicalData: TimeSeriesDataPoint[],
  projectedData: ProjectionDataPoint[],
  creditBalance: number
): ProjectionAlert[]
```

Analyzes projections and generates alerts for:
- **High Cost Projection** (>50% increase) - `danger`
- **Moderate Cost Increase** (>25% increase) - `warning`
- **Usage Spike Predicted** (>100% request increase) - `warning`
- **Declining Usage Trend** (negative slope) - `info`
- **Low Credit Balance** (<7 days remaining) - `danger`

---

## Export Utilities

### Format Functions

```typescript
formatCurrency(value: unknown): string
formatNumber(value: unknown): string
formatPercentage(value: unknown): string
formatDate(value: unknown): string
```

Consistent formatting utilities for export data:
- Currency: Credits / 100, 2 decimal places
- Numbers: K/M suffixes for large values
- Percentages: Multiplied by 100, 1 decimal place
- Dates: ISO 8601 format

### Enhanced CSV Generation

```typescript
generateCSV(
  data: Array<Record<string, unknown>>,
  columns: Array<ExportColumn>,
  options?: ExportOptions
): string
```

Features:
- Custom column formatting functions
- Optional metadata (timestamp, record count)
- Proper escaping for special characters
- Comment lines for metadata

### Enhanced JSON Generation

```typescript
generateJSON(
  data: unknown,
  options?: ExportOptions
): string
```

Features:
- Metadata wrapper with generation timestamp
- Record count statistics
- Pretty-printed with 2-space indentation

---

## Authentication

All endpoints support dual authentication:

1. **Session-based** - Automatic via browser cookies
2. **API Key** - Via `Authorization: Bearer <key>` header

Role requirements:
- Most endpoints: Any authenticated user
- Configuration updates: `owner` or `admin` role

---

## Rate Limiting

All analytics endpoints have a maximum duration of 60 seconds to handle complex aggregations.

---

## Error Responses

Standard error format:
```json
{
  "success": false,
  "error": "Error message describing what went wrong"
}
```

Common HTTP status codes:
- `400` - Bad request (invalid parameters)
- `401` - Unauthorized (missing or invalid credentials)
- `403` - Forbidden (insufficient permissions)
- `500` - Internal server error
- `501` - Not implemented (e.g., Excel/PDF without required packages)

---

## Future Enhancements

### Excel Export

To enable Excel export, install the `xlsx` package:

```bash
bun add xlsx
```

### PDF Export

To enable PDF export, install the `pdfkit` package:

```bash
bun add pdfkit @types/pdfkit
```

Both export functions are stubbed and will throw descriptive errors until the required packages are installed.

---

## Examples

### Complete Analytics Dashboard Data Fetch

```typescript
// Frontend code example
const fetchDashboardData = async (timeRange: string) => {
  const [overview, projections, breakdown] = await Promise.all([
    fetch(`/api/analytics/overview?timeRange=${timeRange}`),
    fetch(`/api/analytics/projections?timeRange=${timeRange}&periods=7`),
    fetch(`/api/analytics/breakdown?dimension=model&limit=10`)
  ]);

  return {
    overview: await overview.json(),
    projections: await projections.json(),
    breakdown: await breakdown.json()
  };
};
```

### Exporting Data Programmatically

```typescript
// Node.js/backend example
const exportAnalytics = async (apiKey: string) => {
  const response = await fetch(
    'https://your-domain.com/api/analytics/export?' +
    'format=csv&type=models&includeMetadata=true',
    {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    }
  );

  const csv = await response.text();
  await fs.writeFile('analytics-export.csv', csv);
};
```

---

## Migration Notes

### From Existing Implementation

The new analytics API is **fully backward compatible** with existing endpoints:

- `/api/analytics/export` - Enhanced with new data types and formats
- Server actions continue to work alongside new API routes
- All existing query functions preserved with new additions

### New Capabilities

1. **Overview endpoint** - Replaces multiple data fetches with single comprehensive call
2. **Projections** - New predictive analytics capability
3. **Breakdown** - Flexible aggregation by any dimension
4. **Configuration** - Centralized settings management
5. **Enhanced exports** - More data types, better formatting

---

## Support

For issues or questions about the analytics API:
- Check the main project README
- Review this documentation
- Examine the implementation files:
  - `lib/queries/analytics.ts` - Database queries
  - `lib/analytics/projections.ts` - Forecasting logic
  - `lib/export/analytics.ts` - Export utilities
  - `app/api/analytics/*` - API route handlers
