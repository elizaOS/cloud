# Environment Variables

Use [`../.env.example`](../.env.example) as the only tracked template.

Setup:

```bash
cp .env.example .env.local
```

Rules:

- Keep live credentials in `.env.local` only.
- Never commit `.env.local`.
- Never introduce tracked files like `example.env.local`.
- Keep `.env.example` limited to placeholders and safe public defaults.

Minimum local setup:

- `DATABASE_URL`
- `NEXT_PUBLIC_PRIVY_APP_ID`
- `PRIVY_APP_SECRET`
- `PRIVY_WEBHOOK_SECRET`
- One AI provider key such as `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`

Feature-specific variables remain documented inline in [`../.env.example`](../.env.example).
