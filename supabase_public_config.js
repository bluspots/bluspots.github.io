// ── Haven public Supabase client config (Phase 1B A1) ─────────────────────
// The ONE place the Customer app's Supabase connection comes from.
// getSupabaseConfig() (backend_adapter.js) returns these values by default,
// so a fresh browser connects with no setup and no localStorage keys.
//
// Both values are PUBLIC by design. They ship to every browser that loads
// the app, exactly like the Mapbox pk token in geocode.js. Access control is
// enforced by Supabase Auth and Row Level Security, not by hiding this key.
//
// Only the anon / publishable key belongs here. NEVER put a service_role
// key, an sb_secret_ key, a database password, or any other secret in this
// file or anywhere in the client. getSupabaseConfig() refuses a key whose
// JWT role is not "anon" (or that is not an sb_publishable_ key).
const HAVEN_PUBLIC_SUPABASE_URL = "https://tfykhsowsjffrrziefco.supabase.co";
const HAVEN_PUBLIC_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRmeWtoc293c2pmZnJyemllZmNvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk4NjQyODIsImV4cCI6MjEwNTQ0MDI4Mn0.xQYM82gkz4zLychAQydwibPWKg4QZrL-o5XXOwr4YsI";
