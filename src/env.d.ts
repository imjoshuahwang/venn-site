/// <reference types="astro/client" />
declare namespace App {
  interface Locals {
    supabase: import('@supabase/supabase-js').SupabaseClient;
    demo?: boolean;
    user: import('@supabase/supabase-js').User | null;
  }
}
