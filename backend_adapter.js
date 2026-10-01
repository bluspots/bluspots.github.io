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
  // Slice 1 stores an Auth access token for a later slice, but job REST keeps
  // using the anon key as Bearer. haven_prototype_anon_mode does not change
  // this. Ownership RLS and anon lockdown are not this slice.
  const havenJobRestBearer=()=>{
    const cfg=getSupabaseConfig();
    return cfg ? cfg.anonKey : null;
  };
  const havenJobRestHeaders=(extra)=>{
    const bearer=havenJobRestBearer();
    if(!bearer) return null;
    const headers=Object.assign({"Accept":"application/json"}, extra||{});
    headers.apikey=bearer;
    headers.Authorization=`Bearer ${bearer}`;
    return headers;
  };
  const postCanonicalJob=async(payload)=>{
    const cfg=getSupabaseConfig();
    if(!cfg) return null; // no‑op until configured
    try{
      const res=await fetch(`${cfg.url}/rest/v1/jobs`,{
        method:"POST",
        headers:havenJobRestHeaders({
          "Content-Type":"application/json",
          "Prefer":"return=representation",
        }),
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
    try{
      const res=await fetch(`${cfg.url}/rest/v1/jobs?id=eq.${backendJobId}`,{
        method:"PATCH",
        headers:havenJobRestHeaders({
          "Content-Type":"application/json",
          "Prefer":"return=minimal",
        }),
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
    try{
      const url=`${cfg.url}/rest/v1/jobs?id=in.(${inList})&select=id,status,materials_items,materials_estimate_cents`;
      const res=await fetch(url,{
        headers:havenJobRestHeaders(),
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
