# Apps Feature Documentation

## Overview

The **Apps** feature allows third-party developers to integrate Eliza Cloud services into their own websites and applications. This feature provides a comprehensive solution for white-labeling, affiliate tracking, usage analytics, and API access management.

## Key Features

### 1. **App Management**

- Create and manage multiple apps under your organization
- Each app gets its own unique API key
- Configure allowed origins (URL whitelist) for security
- Enable/disable specific features per app (chat, image, video, voice, agents, embedding)
- Set custom rate limits per app

### 2. **Affiliate Tracking**

- Optional affiliate code generation for each app
- Track user signups through affiliate links
- Award referral bonuses (configurable)
- Full referral analytics

### 3. **URL Whitelist (CORS Protection)**

- Define allowed origins for each app
- Support for wildcard subdomains (e.g., `*.example.com`)
- Prevent unauthorized API usage
- Origin validation middleware

### 4. **Analytics & Monitoring**

- Real-time usage tracking
- User growth metrics
- Request volume monitoring
- Cost tracking per app
- Hourly, daily, and monthly aggregations
- Feature-specific analytics (chat, image, video, etc.)

### 5. **User Tracking**

- Track users who sign up through your app
- View user activity and spending
- Identify referral sources
- Track conversion metrics

### 6. **Custom Pricing**

- Optional custom pricing markup per app
- Percentage-based markup on LLM costs
- Transparent cost breakdown

## Database Schema

### Tables

#### `apps`

Main table storing app information:

- `id`: UUID primary key
- `name`: App name
- `slug`: URL-friendly identifier
- `organization_id`: Owner organization
- `created_by_user_id`: Creator user
- `app_url`: Primary app URL
- `allowed_origins`: JSON array of allowed origins
- `api_key_id`: Associated API key
- `affiliate_code`: Optional referral code
- `features_enabled`: JSON object of enabled features
- `rate_limit_per_minute`, `rate_limit_per_hour`: Rate limits
- `total_requests`, `total_users`, `total_credits_used`: Usage stats
- `custom_pricing_enabled`, `custom_pricing_markup`: Pricing config
- `is_active`, `is_approved`: Status flags

#### `app_users`

Tracks users who use services through apps:

- `id`: UUID primary key
- `app_id`: App reference
- `user_id`: User reference
- `signup_source`: How user signed up
- `referral_code_used`: Referral code if any
- `total_requests`, `total_credits_used`: User-specific stats
- `first_seen_at`, `last_seen_at`: Activity timestamps

#### `app_analytics`

Time-series analytics data:

- `id`: UUID primary key
- `app_id`: App reference
- `period_start`, `period_end`, `period_type`: Time period info
- `total_requests`, `successful_requests`, `failed_requests`: Request metrics
- `unique_users`, `new_users`: User metrics
- `total_input_tokens`, `total_output_tokens`: Token usage
- `total_cost`, `total_credits_used`: Cost metrics
- `chat_requests`, `image_requests`, etc.: Feature-specific metrics
- `avg_response_time_ms`: Performance metric

## API Endpoints

### App Management

#### `POST /api/v1/apps`

Create a new app.

**Request Body:**

```json
{
  "name": "My App",
  "description": "Description",
  "app_url": "https://myapp.com",
  "website_url": "https://website.com",
  "contact_email": "contact@myapp.com",
  "allowed_origins": ["https://myapp.com", "*.myapp.com"],
  "features_enabled": {
    "chat": true,
    "image": false,
    "video": false,
    "voice": false,
    "agents": false,
    "embedding": false
  },
  "generate_affiliate_code": true,
  "rate_limit_per_minute": 60,
  "rate_limit_per_hour": 1000
}
```

**Response:**

```json
{
  "success": true,
  "app": {
    /* app object */
  },
  "apiKey": "eliza_xxxxx..." // Only shown once
}
```

#### `GET /api/v1/apps`

List all apps for your organization.

#### `GET /api/v1/apps/:id`

Get a specific app by ID.

#### `PUT /api/v1/apps/:id`

Update an app.

#### `DELETE /api/v1/apps/:id`

Delete an app (also deletes associated API key).

#### `POST /api/v1/apps/:id/regenerate-api-key`

Regenerate the API key for an app.

**Response:**

```json
{
  "success": true,
  "apiKey": "eliza_xxxxx...", // Only shown once
  "message": "API key regenerated successfully"
}
```

### App Analytics

#### `GET /api/v1/apps/:id/analytics`

Get analytics for an app.

**Query Parameters:**

- `period`: "hourly" | "daily" | "monthly" (default: "daily")
- `start_date`: ISO date string (default: 30 days ago)
- `end_date`: ISO date string (default: now)

**Response:**

```json
{
  "success": true,
  "analytics": [
    /* array of analytics records */
  ],
  "totalStats": {
    "totalRequests": 1234,
    "totalUsers": 56,
    "totalCreditsUsed": "123.45"
  },
  "period": {
    "type": "daily",
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-31T23:59:59Z"
  }
}
```

### App Users

#### `GET /api/v1/apps/:id/users`

Get users who have used the app.

**Query Parameters:**

- `limit`: Number of users to return (optional)

**Response:**

```json
{
  "success": true,
  "users": [
    /* array of app user records */
  ],
  "total": 56
}
```

## Services

### `appsService`

Main service for app CRUD operations:

- `create()`: Create new app with auto-generated API key
- `getById()`, `getBySlug()`, `getByAffiliateCode()`: Retrieve apps
- `listByOrganization()`: List apps
- `update()`, `delete()`: Modify apps
- `regenerateApiKey()`: Create new API key
- `trackUsage()`: Track app usage
- `getAppUsers()`: Get app users
- `getAnalytics()`: Get analytics
- `validateOrigin()`: Validate request origin

### `appAnalyticsService`

Analytics tracking and aggregation:

- `trackRequest()`: Track individual requests
- `aggregateAnalytics()`: Create time-series analytics
- `calculateAppPricing()`: Calculate costs with markup
- `getAppUsageSummary()`: Get usage summary

### `appSignupTrackingService`

User signup tracking:

- `trackSignup()`: Track when users sign up through apps
- `extractAffiliateCode()`: Extract affiliate code from request
- `getAppFromRequest()`: Identify app from request context
- `awardReferralBonus()`: Award referral bonuses

## Middleware

### `app-auth.ts`

Authentication and validation middleware:

- `validateAppAuth()`: Validate API key and origin
- `requireAppAuth()`: Wrapper for app-authenticated routes
- `validateOrigin()`: Origin validation logic
- `getAppFromApiKey()`: Extract app from API key

## UI Components

### Pages

#### `/dashboard/apps`

Main apps listing page with:

- Stats cards (total apps, active apps, users, requests)
- Apps table with quick actions
- Create app button

#### `/dashboard/apps/:id`

App details page with tabs:

1. **Overview**: Basic info, API key (on creation), affiliate code, features
2. **Analytics**: Charts for requests, users, costs over time
3. **Users**: List of users who used the app
4. **Settings**: Edit app, manage origins, rate limits, danger zone

### Components

- `AppsTable`: List view of apps
- `CreateAppDialog`: Form to create new app
- `AppOverview`: App information display
- `AppAnalytics`: Analytics charts and metrics
- `AppUsers`: User list for app
- `AppSettings`: Settings form with danger zone

## Navigation

Apps section added under **Infrastructure** in the sidebar:

- Icon: Grid3x3
- Badge: "NEW"
- Requires authentication (not available to anonymous users)

## Security Features

1. **API Key Validation**: All app requests must include valid API key
2. **Origin Validation**: Requests validated against allowed origins
3. **Rate Limiting**: Per-minute and per-hour rate limits enforced
4. **Active Status**: Inactive apps cannot make requests
5. **Organization Isolation**: Apps can only be accessed by their organization

## Usage Example

### 1. Create an App

```bash
curl -X POST https://cloud.eliza.ai/api/v1/apps \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Website",
    "app_url": "https://mywebsite.com",
    "allowed_origins": ["https://mywebsite.com"],
    "features_enabled": {
      "chat": true,
      "image": true
    },
    "generate_affiliate_code": true
  }'
```

### 2. Use the App API Key

```javascript
// In your website's frontend
const response = await fetch("https://cloud.eliza.ai/api/v1/chat", {
  method: "POST",
  headers: {
    "X-API-Key": "eliza_xxxxx...", // Your app's API key
    "Content-Type": "application/json",
    Origin: "https://mywebsite.com",
  },
  body: JSON.stringify({
    message: "Hello!",
    model: "gpt-4",
  }),
});
```

### 3. Track User Signups

```javascript
// When a user signs up on your site via affiliate link
// URL: https://mywebsite.com/signup?ref=MYAPP-ABC123

// In your signup handler
await fetch("https://cloud.eliza.ai/api/v1/auth/signup", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    email: "user@example.com",
    password: "password",
    affiliate_code: "MYAPP-ABC123", // Extracted from URL
  }),
});
```

## Migration

Run the migration to create the necessary tables:

```bash
# The migration file is: db/migrations/0003_add_apps_tables.sql
# Apply it using your database migration tool
```

## Future Enhancements

1. **Webhooks**: Notify apps of events (new users, usage milestones)
2. **Sandboxing**: Test mode for apps during development
3. **SDK Generation**: Auto-generate client SDKs for apps
4. **Advanced Analytics**: Funnel analysis, cohort analysis
5. **White-labeling**: Custom branding for embedded experiences
6. **Revenue Sharing**: Automatic revenue distribution for affiliates
7. **App Marketplace**: Public directory of apps
8. **Collaboration**: Multiple users can manage an app
9. **Monitoring**: Alerts for errors, downtime, unusual usage
10. **Agent Builder**: Visual interface for creating agent apps

## Support

For questions or issues with the Apps feature:

- Documentation: https://docs.eliza.ai/apps
- Support: support@eliza.ai
- API Status: https://status.eliza.ai
