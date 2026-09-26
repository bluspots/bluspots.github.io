// ── PERSISTENCE ───────────────────────────────────────────────────────────
// One shared, defensive persistence pattern used by every persisted domain
// (jobs, addresses, cards, profile, notifications, notification preferences,
// appearance). Each domain gets its own storage key — never one giant blob —
// and its own schema version, so a corrupt or outdated domain can reset
// independently without wiping the rest of the app.
//
// Storage shape: {"__v": <schema version>, "data": <domain data>}
// Legacy/pre-versioning data (a bare value with no {__v,data} wrapper) is
// treated as version 0 and run through the same migrate() path, so nothing
// already saved by an earlier Haven build gets silently discarded.
function usePersistedState(key, initialValue, {version=1, migrate=null, validate=null}={}){
  const getDefault = ()=> typeof initialValue==="function" ? initialValue() : initialValue;
  const [state,setState] = useState(()=>{
    try{
      const raw = localStorage.getItem(key);
      if(!raw) return getDefault();
      const parsed = JSON.parse(raw);
      let data, fromVersion;
      if(parsed&&typeof parsed==="object"&&!Array.isArray(parsed)&&"__v" in parsed&&"data" in parsed){
        data = parsed.data; fromVersion = parsed.__v;
      }else{
        data = parsed; fromVersion = 0; // legacy unwrapped data from before schema versioning
      }
      if(migrate&&fromVersion!==version){
        try{ data = migrate(data, fromVersion); }
        catch{ return getDefault(); } // irrecoverable migration failure — reset only this domain
      }
      if(validate){
        const sanitized = validate(data);
        if(sanitized===null||sanitized===undefined) return getDefault();
        return sanitized;
      }
      return data;
    }catch{
      return getDefault(); // malformed JSON, etc. — never let a bad key block boot
    }
  });
  useEffect(()=>{
    try{ localStorage.setItem(key, JSON.stringify({__v:version, data:state})); }catch{}
  },[state]);
  return [state,setState];
}
// Clears every key this app persists — used by the "Reset Prototype Data"
// testing utility. Kept as one list, next to the hook, so a newly-persisted
// domain is easy to remember to add here too.
const PERSISTED_KEYS = ["haven_theme","haven_notifications","haven_notif_prefs","haven_jobs","haven_addresses","haven_cards","haven_profile","haven_draft","haven_job_prefs"];

