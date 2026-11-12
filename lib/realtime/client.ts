// Shared browser Supabase client for Realtime subscriptions.
// The SSR browser client is a singleton per page load in practice, but we
// keep one explicit instance here so every channel in the dashboard shares
// a single websocket connection.
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

let browserClient: SupabaseClient<Database> | null = null;

export function getRealtimeClient(): SupabaseClient<Database> {
  if (!browserClient) browserClient = createBrowserClient();
  return browserClient;
}
