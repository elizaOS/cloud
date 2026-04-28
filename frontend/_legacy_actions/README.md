# Legacy Next.js Server Actions

These were `"use server"` modules under the old `frontend/actions/` directory.
They cannot run in a static SPA (Cloudflare Pages). Each one needs to be
ported to a Workers route under `cloud/api/` by **Agent B**.

Files (and a one-line summary of each):

- `anonymous.ts` — Reads/sets the anonymous-user cookie via `next/headers`.
  Belongs in API as `GET/POST /api/anon/cookie` (HttpOnly cookie issuance).
- `auth.ts` — Calls `requireAuthWithOrg()` and exposes user/org info. Belongs
  in API as `GET /api/auth/me` (the auth helper itself already lives in
  `packages/lib/auth/`).
- `characters.ts` — Mutates characters and calls `revalidatePath`. The
  mutation half goes to API; the `revalidatePath` half is irrelevant in an
  SPA (just refetch via React Query).
- `gallery.ts` — Same shape as `characters.ts`. Move mutations to API,
  drop `revalidatePath`.
- `users.ts` — Same shape. Move mutations to API, drop `revalidatePath`.

**No frontend page imports any of these today** (verified via repo-wide
grep), so removal does not break any current React component. They are
preserved here so Agent B can use them as the source-of-truth spec when
writing the equivalent API routes.

Once the matching API routes are deployed, this whole directory can be
deleted in a follow-up cleanup pass.
