# Config

Static configuration files (JSON, etc.) used at runtime. Prefer config files here over env for structured or multi-value settings so changes are versioned and reviewable.

## signup-codes.json

**Purpose**: Defines which signup codes exist and how much bonus credit (USD) each grants. Used for marketing/ads and one-time welcome bonuses.

**Why a file here**: Env vars don’t scale for many codes (one key per campaign is messy). A single JSON file is easy to edit, diff, and deploy; the app loads it once per process and caches.

**Schema**:

```json
{
  "codes": {
    "codeKey": amountInDollars,
    "launch50": 50,
    "friend100": 100
  }
}
```

- `codes`: Object. Keys are the code string (case-insensitive at runtime). Values are numbers (bonus in dollars).
- Missing file or invalid JSON → no codes active (empty map). Invalid entries are skipped.

**Usage**: Add or change codes in this file and deploy. New codes apply on next cold start (config is cached per process). See [Signup codes](../docs/signup-codes.md) for flows and API.
