import { Hono } from "hono";

import type { AppEnv } from "@/api-lib/context";

const app = new Hono<AppEnv>();

app.all("/", (c) => c.json({ success: false, error: "Not implemented on Workers" }, 501));

export default app;
