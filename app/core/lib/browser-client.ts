// 📁 lib/supabase/browser-client.ts
import type { Database } from "database.types";

import { createBrowserClient } from "@supabase/ssr";

export const browserClient = createBrowserClient<Database>(
  "https://cnohkgfaktjcdelsbegt.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNub2hrZ2Zha3RqY2RlbHNiZWd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc4MDMwNzMsImV4cCI6MjA2MzM3OTA3M30.oNEqzJgsD39m7iv2iLk9gUC31HAT3OrRoADosqF9DZs",
);
