import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { trimTrailingSlash } from "hono/trailing-slash";
import { apiPort } from "@/src/utils/core";
import { authRoutes } from '@/src/routes'

const app = new Hono().basePath('/api/v1');

app.use(trimTrailingSlash());

app.route('/auth', authRoutes)

serve(
  {
    fetch: app.fetch,
    port: apiPort,
  },
  (info) => {
    console.log(`Server successfully running at http://localhost:${info.port}`);
  }
);

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});
