// Slice 1 — Customer Supabase Auth session bootstrap.
// Slice 2 reads this mirror for Customer job writes (backend_adapter.js):
// a signed-in access token is the Bearer, and that user's id is customer_id.
// No session still uses the anon key and DEMO_CUSTOMER_ID.
// This file does not change lifecycle, economics, materials, or jobs RLS.
// haven_prototype_anon_mode defaults ON. It does not choose the job identity
// and does not require Auth for job create or lifecycle writes.

const HAVEN_PROTOTYPE_ANON_MODE_KEY = "haven_prototype_anon_mode";
const HAVEN_AUTH_ACCESS_TOKEN_KEY = "haven_auth_access_token";
const HAVEN_AUTH_EMAIL_KEY = "haven_auth_email";
const HAVEN_AUTH_ROLE_KEY = "haven_auth_role";
const HAVEN_AUTH_USER_ID_KEY = "haven_auth_user_id";
const HAVEN_AUTH_STORAGE_KEY = "haven-auth-session";

// Missing or unrecognized values stay ON. Only an explicit off turns it off.
function havenPrototypeAnonModeEnabled(){
  try{
    const raw = localStorage.getItem(HAVEN_PROTOTYPE_ANON_MODE_KEY);
    if(raw==null) return true;
    const v = String(raw).trim().toLowerCase();
    if(v==="" ) return true;
    if(v==="0" || v==="false" || v==="off" || v==="no") return false;
    return true;
  }catch{
    return true;
  }
}

// Mirrors the 0016 trigger: metadata role customer|pro, else customer.
function resolveProfileRole(meta){
  if(!meta || typeof meta!=="object") return "customer";
  const role = typeof meta.role==="string" ? meta.role.trim().toLowerCase() : "";
  if(role==="customer" || role==="pro") return role;
  return "customer";
}

// Customer sign-up always stamps this. The Pro app is a separate client.
function havenCustomerSignUpMetadata(){
  return {role:"customer"};
}

function havenAuthRedirectUrl(){
  try{
    if(typeof window==="undefined" || !window.location) return undefined;
    const origin = window.location.origin || "";
    const path = window.location.pathname || "/";
    if(!origin) return undefined;
    return origin+path;
  }catch{
    return undefined;
  }
}

function havenSupabaseCreateClient(){
  try{
    if(typeof supabase!=="undefined" && supabase && typeof supabase.createClient==="function"){
      return supabase.createClient.bind(supabase);
    }
  }catch{}
  try{
    const root = typeof globalThis!=="undefined" ? globalThis : null;
    if(root && root.supabase && typeof root.supabase.createClient==="function"){
      return root.supabase.createClient.bind(root.supabase);
    }
  }catch{}
  return null;
}

let havenAuthClient = null;
let havenAuthClientKey = "";

function getHavenAuthClient(){
  const cfg = typeof getSupabaseConfig==="function" ? getSupabaseConfig() : null;
  if(!cfg) return null;
  const key = cfg.url+"|"+cfg.anonKey;
  if(havenAuthClient && havenAuthClientKey===key) return havenAuthClient;
  const createClient = havenSupabaseCreateClient();
  if(!createClient) return null;
  try{
    havenAuthClient = createClient(cfg.url, cfg.anonKey, {
      auth:{
        persistSession:true,
        autoRefreshToken:true,
        detectSessionInUrl:true,
        // Implicit so an email-confirm link still establishes a session when
        // it is opened outside the browser that started sign-up. Static Pages
        // has no PKCE code-verifier handoff.
        flowType:"implicit",
        storageKey:HAVEN_AUTH_STORAGE_KEY,
      },
    });
    havenAuthClientKey = key;
    return havenAuthClient;
  }catch(err){
    console.warn("Haven auth client failed:", err);
    return null;
  }
}

function havenAuthUnavailableReason(){
  const cfg = typeof getSupabaseConfig==="function" ? getSupabaseConfig() : null;
  if(!cfg) return "Add haven_supabase_url and haven_supabase_anon_key on this device first.";
  return "Supabase Auth did not load. Refresh the page and try again.";
}

function clearHavenAuthMirror(){
  try{
    localStorage.removeItem(HAVEN_AUTH_ACCESS_TOKEN_KEY);
    localStorage.removeItem(HAVEN_AUTH_EMAIL_KEY);
    localStorage.removeItem(HAVEN_AUTH_ROLE_KEY);
    localStorage.removeItem(HAVEN_AUTH_USER_ID_KEY);
    localStorage.removeItem(HAVEN_AUTH_STORAGE_KEY);
  }catch{}
}

function applyHavenAuthSession(session, user){
  try{
    const token = session && session.access_token ? String(session.access_token) : "";
    const u = user || (session && session.user) || null;
    if(!token){
      clearHavenAuthMirror();
      return;
    }
    localStorage.setItem(HAVEN_AUTH_ACCESS_TOKEN_KEY, token);
    if(u){
      const role = resolveProfileRole(u.user_metadata || u.raw_user_meta_data || {});
      localStorage.setItem(HAVEN_AUTH_ROLE_KEY, role);
      if(u.email) localStorage.setItem(HAVEN_AUTH_EMAIL_KEY, u.email);
      if(u.id) localStorage.setItem(HAVEN_AUTH_USER_ID_KEY, u.id);
    }
  }catch{}
}

function havenApplyProfileRow(row){
  if(!row || typeof row!=="object") return;
  try{
    if(row.role==="customer" || row.role==="pro") localStorage.setItem(HAVEN_AUTH_ROLE_KEY, row.role);
    if(typeof row.email==="string" && row.email) localStorage.setItem(HAVEN_AUTH_EMAIL_KEY, row.email);
    if(row.id) localStorage.setItem(HAVEN_AUTH_USER_ID_KEY, row.id);
  }catch{}
}

function readHavenAuthMirror(){
  try{
    const accessToken = localStorage.getItem(HAVEN_AUTH_ACCESS_TOKEN_KEY)||"";
    const email = localStorage.getItem(HAVEN_AUTH_EMAIL_KEY)||"";
    const role = localStorage.getItem(HAVEN_AUTH_ROLE_KEY)||"";
    const userId = localStorage.getItem(HAVEN_AUTH_USER_ID_KEY)||"";
    if(!accessToken && !email) return null;
    return {
      accessToken,
      email,
      role: role==="pro" || role==="customer" ? role : "customer",
      userId,
    };
  }catch{
    return null;
  }
}

async function havenFetchOwnProfile(client, userId){
  if(!client || !userId || typeof client.from!=="function") return null;
  try{
    const query = client.from("profiles").select("id,role,email,display_name").eq("id", userId);
    const {data, error} = typeof query.maybeSingle==="function" ? await query.maybeSingle() : await query;
    if(error){
      console.warn("Haven profile read failed:", error.message||error);
      return null;
    }
    if(Array.isArray(data)) return data[0]||null;
    return data||null;
  }catch(err){
    console.warn("Haven profile read error:", err);
    return null;
  }
}

function havenAuthInputError(email, password){
  const clean = String(email||"").trim();
  if(!clean || clean.indexOf("@")<1) return "Enter a valid email.";
  if(!password || String(password).length<6) return "Use a password of at least 6 characters.";
  return "";
}

async function havenSignUpCustomer(email, password){
  const problem = havenAuthInputError(email, password);
  if(problem) return {ok:false, error:problem};
  const client = getHavenAuthClient();
  if(!client) return {ok:false, error:havenAuthUnavailableReason()};
  const clean = String(email).trim();
  try{
    const {data, error} = await client.auth.signUp({
      email:clean,
      password:String(password),
      options:{
        data:havenCustomerSignUpMetadata(),
        emailRedirectTo:havenAuthRedirectUrl(),
      },
    });
    if(error) return {ok:false, error:error.message||"Sign up failed."};
    const session = data && data.session;
    const user = (data && data.user) || (session && session.user) || null;
    if(session){
      applyHavenAuthSession(session, user);
      return {ok:true, signedIn:true, userId:user && user.id};
    }
    return {ok:true, signedIn:false, needsEmailConfirm:true, userId:user && user.id};
  }catch(err){
    return {ok:false, error:(err && err.message) || "Sign up failed."};
  }
}

async function havenSignInCustomer(email, password){
  const problem = havenAuthInputError(email, password);
  if(problem) return {ok:false, error:problem};
  const client = getHavenAuthClient();
  if(!client) return {ok:false, error:havenAuthUnavailableReason()};
  try{
    const {data, error} = await client.auth.signInWithPassword({
      email:String(email).trim(),
      password:String(password),
    });
    if(error) return {ok:false, error:error.message||"Sign in failed."};
    const session = data && data.session;
    const user = (data && data.user) || (session && session.user) || null;
    if(!session) return {ok:false, error:"Sign in did not return a session."};
    applyHavenAuthSession(session, user);
    return {ok:true, signedIn:true, userId:user && user.id};
  }catch(err){
    return {ok:false, error:(err && err.message) || "Sign in failed."};
  }
}

async function havenSignOut(){
  const client = getHavenAuthClient();
  try{
    if(client && client.auth && typeof client.auth.signOut==="function"){
      await client.auth.signOut();
    }
  }catch(err){
    console.warn("Haven auth signOut:", err);
  }
  clearHavenAuthMirror();
  return {ok:true};
}
