// Slice 1 — Customer Supabase Auth session bootstrap.
// Slice 2 reads this mirror for Customer job writes (backend_adapter.js):
// a signed-in access token is the Bearer, and that user's id is customer_id.
// No session does not write a job and does not use DEMO_CUSTOMER_ID.
// This file does not change lifecycle, economics, materials, or jobs RLS.
// Phase 1B A1: the app always connects to the shipped Supabase project
// (supabase_public_config.js). There is no demo / anon mode and no local
// fallback. If the backend or Auth cannot be reached, the app shows a
// connection error with Retry (havenConnectBackend below).

const HAVEN_AUTH_ACCESS_TOKEN_KEY = "haven_auth_access_token";
const HAVEN_AUTH_EMAIL_KEY = "haven_auth_email";
const HAVEN_AUTH_ROLE_KEY = "haven_auth_role";
const HAVEN_AUTH_USER_ID_KEY = "haven_auth_user_id";
const HAVEN_AUTH_STORAGE_KEY = "haven-auth-session";

// Plain-language copy for any failure to reach Haven's backend or Auth.
const HAVEN_CONNECTION_ERROR_TITLE = "Can't connect to Haven";
// Same copy as the Pro app (Phase 1B A1).
const HAVEN_CONNECTION_ERROR_MESSAGE = "We couldn't reach Haven. Check your internet connection, then tap Retry.";
const HAVEN_CONNECTING_MESSAGE = "Connecting to Haven…";
// Sign-in / create-account forms have no Retry button; the form button retries.
const HAVEN_AUTH_NETWORK_ERROR_MESSAGE = "We couldn't reach Haven. Check your internet connection, then try again.";

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

// Indirection so Retry can reload after a CDN miss; tests stub .reload.
const havenNavigation = {
  reload(){ try{ window.location.reload(); }catch{} },
};

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
  const createClient = havenSupabaseCreateClient();
  if(!createClient){
    havenAuthClient = null;
    havenAuthClientKey = "";
    return null;
  }
  const key = cfg.url+"|"+cfg.anonKey;
  if(havenAuthClient && havenAuthClientKey===key) return havenAuthClient;
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

// No dev-facing setup text. A missing client is a connection problem.
function havenAuthUnavailableReason(){
  return HAVEN_AUTH_NETWORK_ERROR_MESSAGE;
}

// supabase-js reports an unreachable server as AuthRetryableFetchError
// (status 0) or a fetch TypeError. Show the plain connection copy for those.
function havenAuthErrorIsNetwork(err){
  if(!err) return false;
  const name = String(err.name||"");
  const msg = String(err.message||"").toLowerCase();
  if(name==="AuthRetryableFetchError") return true;
  if(err.status===0) return true;
  if(name==="TypeError" && (msg.includes("fetch") || msg.includes("network"))) return true;
  return msg.includes("failed to fetch") || msg.includes("network request failed") || msg.includes("load failed");
}

function havenAuthErrorMessage(err, fallback){
  if(havenAuthErrorIsNetwork(err)) return HAVEN_AUTH_NETWORK_ERROR_MESSAGE;
  return (err && err.message) || fallback;
}

// The stored session is not valid on the server (revoked, expired refresh,
// deleted user). That is a signed-out state, not a connection failure.
function havenAuthErrorIsInvalidSession(err){
  if(!err || havenAuthErrorIsNetwork(err)) return false;
  const name = String(err.name||"");
  if(name==="AuthSessionMissingError" || name==="AuthInvalidJwtError") return true;
  return err.status===401 || err.status===403;
}

// Boot connection. Runs on every load and on Retry.
// 1. The shipped public config and the Supabase Auth client must exist.
// 2. Haven's Auth server must answer (GET /auth/v1/health with the anon key).
// 3. Auth restores the session. A stored session is checked with the server
//    (getUser) so a stale or forged local session never opens the app.
// Returns {ok:true, client, session|null} or {ok:false, reason}. It never
// invents a local account, never uses DEMO_CUSTOMER_ID, never writes a job.
async function havenConnectBackend(){
  const cfg = typeof getSupabaseConfig==="function" ? getSupabaseConfig() : null;
  if(!cfg) return {ok:false, reason:"config"};
  const client = getHavenAuthClient();
  if(!client || !client.auth) return {ok:false, reason:"auth_client"};
  try{
    const res = await fetch(`${cfg.url}/auth/v1/health`, {headers:{apikey:cfg.anonKey}});
    if(!res || !res.ok) return {ok:false, reason:"health_"+(res && res.status ? res.status : 0)};
  }catch(err){
    return {ok:false, reason:"network"};
  }
  let session = null;
  try{
    const {data, error} = await client.auth.getSession();
    if(error) return {ok:false, reason:"session"};
    session = data && data.session ? data.session : null;
  }catch(err){
    return {ok:false, reason:"session"};
  }
  if(!session) return {ok:true, client, session:null};
  try{
    const {data, error} = typeof client.auth.getUser==="function"
      ? await client.auth.getUser()
      : {data:{user:session.user||null}, error:null};
    const user = data && data.user ? data.user : null;
    if(error || !user){
      if(error && !havenAuthErrorIsInvalidSession(error)) return {ok:false, reason:"user"};
      try{ await client.auth.signOut({scope:"local"}); }catch{}
      return {ok:true, client, session:null};
    }
    return {ok:true, client, session:Object.assign({}, session, {user})};
  }catch(err){
    return {ok:false, reason:"user"};
  }
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
    if(error) return {ok:false, error:havenAuthErrorMessage(error, "Sign up failed.")};
    const session = data && data.session;
    const user = (data && data.user) || (session && session.user) || null;
    if(session){
      applyHavenAuthSession(session, user);
      return {ok:true, signedIn:true, userId:user && user.id};
    }
    return {ok:true, signedIn:false, needsEmailConfirm:true, userId:user && user.id};
  }catch(err){
    return {ok:false, error:havenAuthErrorMessage(err, "Sign up failed.")};
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
    if(error) return {ok:false, error:havenAuthErrorMessage(error, "Sign in failed.")};
    const session = data && data.session;
    const user = (data && data.user) || (session && session.user) || null;
    if(!session) return {ok:false, error:"Sign in did not return a session."};
    applyHavenAuthSession(session, user);
    return {ok:true, signedIn:true, userId:user && user.id};
  }catch(err){
    return {ok:false, error:havenAuthErrorMessage(err, "Sign in failed.")};
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
