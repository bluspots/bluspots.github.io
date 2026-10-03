  // ── Supabase REST dual‑write helper (CHUNK 2 prototype) ─────────────────────
  // Reads config from localStorage; if missing, dual‑write is a no‑op.
  const getSupabaseConfig=()=>{
    try{
      let url=(localStorage.getItem("haven_supabase_url")||"").trim();
      const key=(localStorage.getItem("haven_supabase_anon_key")||"").trim();
      if(!url||!key) return null;
      while (url.endsWith('/')) url = url.slice(0, -1);
      return {url, anonKey:key};
    }catch{ return null; }
  };
  // Slice 2: a signed-in session binds Customer job writes to that user.
  // Authorization is the access token. apikey stays the anon key — Supabase
  // rejects a user JWT in apikey. Slice 4: with no access token, job creates
  // and updates stop. They do not send DEMO_CUSTOMER_ID and do not send the
  // anon key as Bearer. Reads may still use the anon key. The anon-mode flag
  // does not choose the identity. This slice does not lock down anon grants.
  const havenSignedInAccessToken=()=>{
    try{
      if(typeof readHavenAuthMirror!=="function") return null;
      const mirror=readHavenAuthMirror();
      const token=mirror && mirror.accessToken ? String(mirror.accessToken).trim() : "";
      return token || null;
    }catch{
      return null;
    }
  };
  const havenDecodeBase64Url=(b64url)=>{
    try{
      let b64=String(b64url||"").replace(/-/g,"+").replace(/_/g,"/");
      while(b64.length%4) b64+="=";
      if(typeof atob==="function") return atob(b64);
      if(typeof Buffer!=="undefined") return Buffer.from(b64,"base64").toString("utf8");
      return "";
    }catch{
      return "";
    }
  };
  const havenUserIdFromAccessToken=(token)=>{
    try{
      const parts=String(token||"").split(".");
      if(parts.length<2 || !parts[1]) return "";
      const json=JSON.parse(havenDecodeBase64Url(parts[1])||"{}");
      const sub=json && json.sub!=null ? String(json.sub).trim() : "";
      return sub;
    }catch{
      return "";
    }
  };
  const havenDemoCustomerId=()=> (typeof DEMO_CUSTOMER_ID==="string" ? DEMO_CUSTOMER_ID : "");
  const havenSameCustomerId=(a,b)=>{
    const left=a ? String(a).trim() : "";
    const right=b ? String(b).trim() : "";
    if(!left || !right) return false;
    return left.toLowerCase()===right.toLowerCase();
  };
  // Signed-in: that user's id (mirror, else JWT sub). Never DEMO_CUSTOMER_ID.
  // No session: null. Do not fall back to the demo customer. A session with
  // no resolvable user id also returns null.
  const havenJobCustomerId=()=>{
    const token=havenSignedInAccessToken();
    const demoId=havenDemoCustomerId();
    if(!token) return null;
    let fromMirror="";
    try{
      const mirror=readHavenAuthMirror();
      fromMirror=mirror && mirror.userId ? String(mirror.userId).trim() : "";
    }catch{}
    if(fromMirror && !havenSameCustomerId(fromMirror, demoId)) return fromMirror;
    const fromJwt=havenUserIdFromAccessToken(token);
    if(fromJwt && !havenSameCustomerId(fromJwt, demoId)) return fromJwt;
    return null;
  };
  // Reads only. Job writes must not call this without a session: a missing
  // token stops the write instead of using the anon key as the user identity.
  const havenJobRestBearer=()=>{
    const token=havenSignedInAccessToken();
    if(token) return token;
    const cfg=getSupabaseConfig();
    return cfg ? cfg.anonKey : null;
  };
  const havenJobWriteSessionMissing=()=> !havenSignedInAccessToken();
  const havenJobRestHeaders=(extra)=>{
    const cfg=getSupabaseConfig();
    if(!cfg) return null;
    const bearer=havenJobRestBearer();
    if(!bearer) return null;
    const headers=Object.assign({"Accept":"application/json"}, extra||{});
    headers.apikey=cfg.anonKey;
    headers.Authorization=`Bearer ${bearer}`;
    return headers;
  };
  // True when customer_id is missing, blank, or the demo id.
  const havenCustomerIdIsDemoOrEmpty=(payload)=>{
    if(!payload || !Object.prototype.hasOwnProperty.call(payload, "customer_id")) return true;
    const customerId=payload.customer_id!=null ? String(payload.customer_id).trim() : "";
    const demoId=havenDemoCustomerId();
    return !customerId || havenSameCustomerId(customerId, demoId);
  };
  // Creates must carry the signed-in id. Updates that omit customer_id
  // (status, cancel, materials) stay allowed. Updates that stamp the demo id
  // are refused.
  const havenSignedInCreateUsesDemoCustomer=(payload)=>{
    return !!havenSignedInAccessToken() && havenCustomerIdIsDemoOrEmpty(payload);
  };
  const havenSignedInUpdateStampsDemoCustomer=(fields)=>{
    if(!havenSignedInAccessToken()) return false;
    if(!fields || !Object.prototype.hasOwnProperty.call(fields, "customer_id")) return false;
    return havenCustomerIdIsDemoOrEmpty(fields);
  };
  const postCanonicalJob=async(payload)=>{
    const cfg=getSupabaseConfig();
    if(!cfg) return null; // no‑op until configured
    if(havenJobWriteSessionMissing()){
      console.warn("Haven: job create skipped. No signed-in session, so the demo customer and anon bearer are not sent.");
      return null;
    }
    if(havenSignedInCreateUsesDemoCustomer(payload)){
      console.warn("Haven: signed-in job create refused the demo customer id.");
      return null;
    }
    const headers=havenJobRestHeaders({
      "Content-Type":"application/json",
      "Prefer":"return=representation",
    });
    if(!headers) return null;
    try{
      const res=await fetch(`${cfg.url}/rest/v1/jobs`,{
        method:"POST",
        headers,
        body:JSON.stringify(payload),
      });
      if(!res.ok){
        const text=await res.text().catch(()=>"(no body)");
        console.warn("Haven CHUNK2 dual‑write failed:", res.status, text);
        return null;
      }
      const rows=await res.json();
      const row=Array.isArray(rows)?rows[0]:rows;
      return row?.id||null;
    }catch(err){
      console.warn("Haven CHUNK2 dual‑write error:", err);
      return null;
    }
  };
  // Prototype PATCH helper — updates fields on jobs by backend UUID.
  // RLS currently allows terminals (inspection_completed/materials_declined) on assigned rows.
  const updateCanonicalJob=async(backendJobId,fields)=>{
    const cfg=getSupabaseConfig();
    if(!cfg||!backendJobId) return false;
    if(havenJobWriteSessionMissing()){
      console.warn("Haven: job update skipped. No signed-in session, so the demo customer and anon bearer are not sent.");
      return false;
    }
    if(havenSignedInUpdateStampsDemoCustomer(fields)){
      console.warn("Haven: signed-in job update refused the demo customer id.");
      return false;
    }
    const headers=havenJobRestHeaders({
      "Content-Type":"application/json",
      "Prefer":"return=minimal",
    });
    if(!headers) return false;
    try{
      const res=await fetch(`${cfg.url}/rest/v1/jobs?id=eq.${backendJobId}`,{
        method:"PATCH",
        headers,
        body:JSON.stringify(fields),
      });
      if(!res.ok){
        const text=await res.text().catch(()=>"(no body)");
        console.warn("Haven CHUNK3 update failed:", res.status, text);
        return false;
      }
      return true;
    }catch(err){
      console.warn("Haven CHUNK3 update error:", err);
      return false;
    }
  };

  // Batch fetch helper — reads canonical jobs by backend ids
  const fetchCanonicalJobsByIds=async(backendIds)=>{
    const cfg=getSupabaseConfig();
    if(!cfg) return [];
    if(!backendIds||backendIds.length===0) return [];
    const unique=[...new Set(backendIds.filter(Boolean))];
    if(unique.length===0) return [];
    // PostgREST IN filter — uuid list
    const inList=unique.join(",");
    const headers=havenJobRestHeaders();
    if(!headers) return [];
    try{
      const url=`${cfg.url}/rest/v1/jobs?id=in.(${inList})&select=id,status,materials_items,materials_estimate_cents`;
      const res=await fetch(url,{
        headers,
      });
      if(!res.ok){
        const text=await res.text().catch(()=>"(no body)");
        console.warn("Haven CHUNK4 fetch failed:", res.status, text);
        return [];
      }
      const rows=await res.json();
      return Array.isArray(rows)?rows:[];
    }catch(err){
      console.warn("Haven CHUNK4 fetch error:", err);
      return [];
    }
  };
