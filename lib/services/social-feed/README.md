# Social Feed Service

Bidirectional social media integration for monitoring external platforms and routing engagement to internal channels.

## Features

- **Feed Monitoring**: Poll external social platforms (Twitter, Bluesky, Reddit, Mastodon) for mentions, replies, quote tweets, reposts, likes
- **Internal Notifications**: Send notifications to Discord, Telegram, or Slack channels
- **Reply Flow**: Users can reply to notifications; replies are routed back to the original platform after confirmation

## Required Environment Variables

```bash
# For cron job authentication
CRON_SECRET=your-secret-here

# For Slack webhook signature verification
SLACK_SIGNING_SECRET=your-slack-signing-secret
```

## Required Secrets (per organization)

These must be set via the secrets service for each organization:

- `SLACK_BOT_TOKEN` - Bot token for posting to Slack (xoxb-...)

## Database Tables

Migration: `db/migrations/0024_social_feed_management.sql`

- `org_feed_configs` - Feed monitoring configurations
- `social_engagement_events` - Tracked engagement events
- `pending_reply_confirmations` - Reply confirmations awaiting approval
- `social_notification_messages` - Maps notifications to messages for reply detection

## API Endpoints

### REST API

| Method | Endpoint                            | Description               |
| ------ | ----------------------------------- | ------------------------- |
| GET    | `/api/v1/org/feeds`                 | List feed configurations  |
| POST   | `/api/v1/org/feeds`                 | Create feed configuration |
| GET    | `/api/v1/org/feeds/[id]`            | Get feed configuration    |
| PATCH  | `/api/v1/org/feeds/[id]`            | Update feed configuration |
| DELETE | `/api/v1/org/feeds/[id]`            | Delete feed configuration |
| POST   | `/api/v1/org/feeds/poll`            | Manually trigger polling  |
| GET    | `/api/v1/org/engagements`           | List engagement events    |
| GET    | `/api/v1/org/engagements/[id]`      | Get engagement event      |
| GET    | `/api/v1/org/replies`               | List pending replies      |
| PATCH  | `/api/v1/org/replies/[id]`          | Confirm/reject reply      |
| POST   | `/api/v1/org/notifications/process` | Process unnotified events |

### Cron Job

**Single consolidated cron job** handles all social feed tasks:

```
POST /api/cron/social-feed
Authorization: Bearer $CRON_SECRET
```

Runs every minute to:

1. Poll feeds due for polling
2. Send notifications for new engagements
3. Expire pending reply confirmations

Returns:

```json
{
  "success": true,
  "duration": 1234,
  "results": {
    "polling": { "feedsPolled": 5, "newEngagements": 12, "errors": 0 },
    "notifications": { "processed": 12, "successful": 12, "failed": 0 },
    "expiredConfirmations": 2
  }
}
```

### Webhooks

Reply detection is handled in existing webhook handlers:

- `app/api/webhooks/telegram/[botId]/route.ts`
- `app/api/webhooks/discord/route.ts`
- `app/api/webhooks/slack/route.ts`
- `app/api/internal/discord/events/route.ts`

## MCP Tools

Available in the org MCP server:

- `create_feed_config` - Create feed monitoring config
- `update_feed_config` - Update feed config
- `list_feed_configs` - List feed configs
- `list_engagements` - List engagement events
- `list_pending_replies` - List pending reply confirmations
- `confirm_reply` - Confirm and send a reply
- `reject_reply` - Reject a pending reply
- `poll_feeds` - Manually trigger polling
- `send_manual_reply` - Create manual reply for confirmation

## Circuit Breaker

Feeds with more than 5 consecutive poll errors are automatically skipped until manually reset.

To reset a feed's error count:

```typescript
await feedConfigService.resetErrorCount(configId);
```

## Rate Limits

Platform-specific rate limits are enforced (see `lib/services/social-media/rate-limit.ts`):

| Platform | Requests | Window |
| -------- | -------- | ------ |
| Twitter  | 300      | 15 min |
| Bluesky  | 3000     | 5 min  |
| Discord  | 50       | 1 sec  |
| Telegram | 30       | 1 sec  |
| Slack    | 50       | 1 min  |
| Reddit   | 60       | 1 min  |
| Mastodon | 300      | 5 min  |

## Assumptions

1. **Bot connections exist**: Discord/Telegram bots must be connected via org platform connections
2. **Credentials available**: External platform credentials must be stored in `platform_credentials` or fetched via social media service
3. **Polling interval**: Default 60 seconds, configurable per feed
4. **Reply expiry**: Pending replies expire after 24 hours
5. **Notification channels**: Must be valid Discord/Telegram/Slack channel IDs where bots have permission to post
