import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role client: bypasses RLS, so it must never reach the browser.
export const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
  auth: { persistSession: false },
});
