import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import routes, { initializeStorage } from "./routes.tsx";

const app = new Hono();

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Mount all routes from routes.tsx
app.route("/", routes);

// Health check endpoint
app.get("/make-server-fd33611c/health", (c) => {
  return c.json({ status: "ok" });
});

// Initialize storage buckets on server startup
console.log("🚀 Initializing Believers Badminton Academy server...");
initializeStorage().then(() => {
  console.log("✅ Storage initialization complete");
}).catch((error) => {
  console.error("❌ Storage initialization error:", error);
});

Deno.serve(app.fetch);