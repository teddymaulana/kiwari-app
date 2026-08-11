import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Uses the service role key, which bypasses Row Level Security entirely.
// Only import this from "use server" action files, and only for operations
// the anon key genuinely can't do (here: creating auth users as an admin).
// Never expose SUPABASE_SERVICE_ROLE_KEY to the client.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
