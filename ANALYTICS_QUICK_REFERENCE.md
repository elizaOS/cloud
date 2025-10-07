# Analytics API Quick Reference

**Quick access guide for the analytics API implementation.**

---

## 🚀 New Endpoints

```bash
# Overview - comprehensive analytics
GET /api/analytics/overview?timeRange=weekly

# Breakdown - flexible filtering
GET /api/analytics/breakdown?dimension=model&sortBy=cost

# Projections - predictive analytics
GET /api/analytics/projections?timeRange=weekly&periods=7

# Export - enhanced data export
GET /api/analytics/export?format=csv&type=models

# Config - settings management
GET /api/analytics/config
PUT /api/analytics/config
```

---

## 📊 Quick Examples

### Get Weekly Analytics
```bash
curl "https://your-domain.com/api/analytics/overview?timeRange=weekly" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Get Model Breakdown
```bash
curl "https://your-domain.com/api/analytics/breakdown?dimension=model&limit=10" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Get 14-Day Projections
```bash
curl "https://your-domain.com/api/analytics/projections?timeRange=weekly&periods=14" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Export Provider Data as CSV
```bash
curl "https://your-domain.com/api/analytics/export?format=csv&type=providers" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  --output providers.csv
```

---

## 🔧 Key Functions

### Query Functions (`lib/queries/analytics.ts`)

```typescript
// Provider stats
getProviderBreakdown(orgId, { startDate, endDate })

// Model stats
getModelBreakdown(orgId, { startDate, endDate, limit: 20 })

// Trend analysis
getTrendData(orgId, currentPeriod, previousPeriod)

// Flexible breakdown
getCostBreakdown(orgId, "model", { sortBy: "cost" })
```

### Projection Functions (`lib/analytics/projections.ts`)

```typescript
// Calculate regression
calculateLinearRegression([1, 2, 3, 4, 5])

// Generate forecasts
generateProjections(historicalData, 7)

// Generate alerts
generateProjectionAlerts(historical, projected, creditBalance)
```

### Export Functions (`lib/export/analytics.ts`)

```typescript
// Format helpers
formatCurrency(2500)    // "25.00"
formatNumber(150000)    // "150.0K"
formatPercentage(0.95)  // "95.0%"

// Export generation
generateCSV(data, columns, { includeMetadata: true })
generateJSON(data, { includeTimestamp: true })
```

---

## 📁 File Structure

```
lib/
├── queries/analytics.ts          # Enhanced query functions (+250 lines)
├── analytics/projections.ts      # NEW: Forecasting logic (190 lines)
└── export/analytics.ts            # Enhanced export utilities (+100 lines)

app/api/analytics/
├── overview/route.ts              # NEW: Main analytics endpoint (145 lines)
├── breakdown/route.ts             # NEW: Cost breakdown (65 lines)
├── projections/route.ts           # NEW: Predictive analytics (80 lines)
├── config/route.ts                # NEW: Settings management (130 lines)
└── export/route.ts                # Enhanced export (+150 lines)
```

---

## 🎯 Common Use Cases

### 1. Dashboard Overview
```typescript
const response = await fetch('/api/analytics/overview?timeRange=daily');
const { timeSeries, providerBreakdown, summary, trends } = response.data;
```

### 2. Cost Analysis
```typescript
const response = await fetch('/api/analytics/breakdown?dimension=provider');
const providers = response.data.map(p => ({
  name: p.value,
  cost: p.cost / 100,  // Convert to dollars
  percentage: (p.successRate * 100).toFixed(1)
}));
```

### 3. Future Planning
```typescript
const response = await fetch('/api/analytics/projections?periods=30');
const { projections, alerts } = response.data;
const highCostAlerts = alerts.filter(a => a.type === 'danger');
```

### 4. Data Export
```typescript
// Time-series export
const csv = await fetch('/api/analytics/export?format=csv&type=timeseries');

// User breakdown export
const usersCsv = await fetch('/api/analytics/export?format=csv&type=users');

// Model analysis export
const modelsCsv = await fetch('/api/analytics/export?format=csv&type=models');
```

---

## ⚙️ Configuration Options

```typescript
// Get current config
GET /api/analytics/config

// Update config (owner/admin only)
PUT /api/analytics/config
{
  "markupPercentage": 25,
  "autoRefreshInterval": 30,
  "defaultTimeRange": "weekly",
  "exportFormats": ["csv", "json"]
}
```

---

## 🔐 Authentication

**Two methods supported:**

1. **Session-based** (automatic in browser)
2. **API Key** (programmatic access)

```bash
# Using API key
curl -H "Authorization: Bearer sk_live_..." /api/analytics/overview

# Session auth (cookies handled automatically)
fetch('/api/analytics/overview')
```

---

## 📊 Data Types

### Time Ranges
- `daily` - Last 24 hours, hourly granularity
- `weekly` - Last 7 days, daily granularity
- `monthly` - Last 30 days, daily granularity

### Breakdown Dimensions
- `model` - Group by AI model
- `provider` - Group by provider (OpenAI, Anthropic, etc.)
- `user` - Group by user
- `apiKey` - Group by API key

### Export Types
- `timeseries` - Time-series usage data
- `users` - Per-user breakdown
- `providers` - Provider aggregations
- `models` - Model statistics

### Export Formats
- `csv` - ✅ Ready
- `json` - ✅ Ready
- `excel` - ⚠️ Requires `xlsx` package
- `pdf` - ⚠️ Requires `pdfkit` package

---

## 🧮 Projection Alerts

**Alert Types:**
- 🚨 **danger** - High cost increase (>50%) or low balance (<7 days)
- ⚠️ **warning** - Moderate cost increase (>25%) or usage spike (>100%)
- ℹ️ **info** - Declining usage trend

**Example Alert:**
```json
{
  "type": "danger",
  "title": "High Cost Projection",
  "message": "Projected costs may increase by 65% in the coming period.",
  "projectedValue": 5000
}
```

---

## 💡 Tips

### Performance
- Use `limit` parameter for large datasets
- Choose appropriate time ranges (shorter = faster)
- Cache frequently accessed data
- Use projections sparingly (computationally intensive)

### Data Accuracy
- Costs are in credits × 100 (divide by 100 for dollars)
- Success rates are 0.0 to 1.0 (multiply by 100 for percentage)
- Timestamps are in ISO 8601 format
- Projections have decreasing confidence over time

### Best Practices
- Always specify date ranges for exports
- Use breakdown endpoint for detailed analysis
- Monitor projection alerts regularly
- Configure auto-refresh interval based on usage

---

## 🐛 Troubleshooting

**401 Unauthorized**
- Check API key validity
- Verify session cookie

**403 Forbidden**
- Config updates require owner/admin role
- Check user permissions

**500 Internal Server Error**
- Check database connection
- Review server logs
- Verify organization exists

**501 Not Implemented**
- Excel/PDF require additional packages
- Install with: `bun add xlsx` or `bun add pdfkit`

---

## 📚 Full Documentation

- `ANALYTICS_API_DOCUMENTATION.md` - Complete API reference
- `ANALYTICS_IMPLEMENTATION_SUMMARY.md` - Technical details
- `ELIZA_CLOUD_PRIVATE_FRONTEND_ANALYSIS.md` - Original requirements

---

**Quick Start:**
1. Choose endpoint based on need
2. Add authentication header
3. Parse JSON response
4. Handle errors gracefully

**Example Integration:**
```typescript
async function getAnalytics(timeRange = 'weekly') {
  try {
    const response = await fetch(
      `/api/analytics/overview?timeRange=${timeRange}`,
      { headers: { Authorization: `Bearer ${apiKey}` }}
    );

    if (!response.ok) throw new Error('Failed to fetch');

    const { data } = await response.json();
    return data;
  } catch (error) {
    console.error('Analytics error:', error);
    return null;
  }
}
```

---

**End of Quick Reference**
