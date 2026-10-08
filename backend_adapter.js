  // Real jobs must not display this pro. Catalog Marcus is not a backend identity.
  const DEMO_PRO_ID = "22222222-2222-4222-8222-222222222222";
  let havenProLabelRpcUnavailable = false;

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
  // anon key as Bearer. Signed-out job polls no longer hit /rest/v1/jobs
  // (anon SELECT on the base table is revoked; no anonymous marketplace).
  // The anon-mode flag does not choose the identity.
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
  // Slice 5: a 2xx with no returned row is a failed write. Do not treat it as landed.
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
      "Prefer":"return=representation",
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
      let rows=[];
      try{ rows=await res.json(); }catch{ rows=[]; }
      if(!Array.isArray(rows) || rows.length===0){
        console.warn("Haven CHUNK3 update returned no row; not treating as landed.");
        return false;
      }
      const wantStatus=fields && Object.prototype.hasOwnProperty.call(fields,"status") ? String(fields.status) : "";
      if(wantStatus){
        const landed=rows.some(r=>r && String(r.id).toLowerCase()===String(backendJobId).toLowerCase() && String(r.status)===wantStatus);
        if(!landed){
          console.warn("Haven CHUNK3 update returned no matching status row; not treating as landed.");
          return false;
        }
      }
      return true;
    }catch(err){
      console.warn("Haven CHUNK3 update error:", err);
      return false;
    }
  };

  // Phase 1B item B: receipt amounts. The in-app receipt, the PDF and the
  // share text read only these stored public.jobs columns (0001 / 0008):
  //   fixed_customer_labor_price_cents  labor
  //   materials_estimate_cents          materials the customer approved
  //   emergency_fee_cents               priority fee
  //   tip_amount_cents                  tip
  // There is no stored total column, so the total is the sum of these four.
  // Nothing comes from local job fields (lockedPrice, surge, emergencyFee,
  // tipAmount, demo completion materials). The poll below also asks for
  // these columns. That is a read-only select change.
  const HAVEN_RECEIPT_JOB_COLUMNS="fixed_customer_labor_price_cents,emergency_fee_cents,tip_amount_cents";
  // The materials amount counts only once the customer approved it. A pending
  // request (materials_requested) or a declined one (materials_declined,
  // inspection_completed) adds nothing.
  const HAVEN_RECEIPT_MATERIALS_STATUSES=new Set(["materials_approved","in_progress","complete"]);
  const havenReceiptCents=(v)=> (typeof v==="number" && Number.isFinite(v) && v>=0) ? Math.round(v) : null;
  // Returns null unless the row carries every stored amount. null means the
  // receipt shows no amounts. It never falls back to local numbers.
  const havenReceiptFromBackendRow=(row)=>{
    if(!row || typeof row!=="object") return null;
    const labor=havenReceiptCents(row.fixed_customer_labor_price_cents);
    const estimate=havenReceiptCents(row.materials_estimate_cents);
    const priority=havenReceiptCents(row.emergency_fee_cents);
    const tip=havenReceiptCents(row.tip_amount_cents);
    if(labor==null || estimate==null || priority==null || tip==null) return null;
    const materials=HAVEN_RECEIPT_MATERIALS_STATUSES.has(String(row.status||"")) ? estimate : 0;
    return {
      laborCents:labor,
      materialsCents:materials,
      priorityFeeCents:priority,
      tipCents:tip,
      totalCents:labor+materials+priority+tip,
      // No backend payment record exists yet: no payments table, and jobs has
      // no payment status. payment_snapshot is the Customer app's own copy of
      // the local card picked at booking, not proof of payment.
      payment:null,
    };
  };
  // PAID, and the card brand and last4, only from a backend payment record
  // whose status is "paid". Anything else (no record, a {brand,last4}
  // snapshot, processing, failed) is not paid and shows no card.
  const havenReceiptPaymentState=(record)=>{
    const paid=!!(record && typeof record==="object" && String(record.status||"").trim().toLowerCase()==="paid");
    const brand=paid && typeof record.brand==="string" ? record.brand.trim() : "";
    const last4=paid && typeof record.last4==="string" && /^\d{4}$/.test(record.last4.trim()) ? record.last4.trim() : "";
    return {paid, brand, last4, showCard:!!(paid && brand && last4)};
  };

  // Poll/rehydrate of locally linked jobs. Not the whole table.
  // Signed in: user access token and customer_id = that user. apikey stays the anon key.
  // Signed out: do not call /rest/v1/jobs. Anon SELECT on the base table is revoked;
  // a crafted anon poll must not pull private lifecycle rows. Local UI state stays.
  // Never DEMO_CUSTOMER_ID. No Supabase config: no jobs request (returns []).
  const fetchCanonicalJobsByIds=async(backendIds)=>{
    const cfg=getSupabaseConfig();
    if(!cfg) return [];
    if(!backendIds||backendIds.length===0) return [];
    const unique=[...new Set(backendIds.filter(Boolean))];
    if(unique.length===0) return [];
    const token=havenSignedInAccessToken();
    if(!token){
      // Signed-out: stop. Do not browse private lifecycle through the anon key.
      return [];
    }
    const customerId=havenJobCustomerId();
    if(!customerId) return [];
    const inList=unique.map(id=>encodeURIComponent(id)).join(",");
    const headers={"Accept":"application/json", apikey:cfg.anonKey, Authorization:`Bearer ${token}`};
    const url=`${cfg.url}/rest/v1/jobs?id=in.(${inList})&customer_id=eq.${encodeURIComponent(customerId)}&select=id,status,customer_id,pro_id,materials_items,materials_estimate_cents,${HAVEN_RECEIPT_JOB_COLUMNS}`;
    if(String(url).includes("11111111-1111-4111-8111-111111111111")) return [];
    try{
      const res=await fetch(url,{
        headers,
      });
      if(!res.ok){
        const text=await res.text().catch(()=>"(no body)");
        console.warn("Haven CHUNK4 fetch failed:", res.status, text);
        return [];
      }
      let rows=await res.json();
      if(!Array.isArray(rows)) return [];
      rows=rows.filter(r=>r && havenSameCustomerId(r.customer_id, customerId));
      return rows;
    }catch(err){
      console.warn("Haven CHUNK4 fetch error:", err);
      return [];
    }
  };

  // Display name for the pro on jobs this customer owns. Not a profile directory.
  // Returns {} when 0022 is not pasted yet. Never falls back to DEMO_PRO_ID.
  const fetchAssignedProLabels=async(backendIds)=>{
    if(havenProLabelRpcUnavailable) return {};
    const cfg=getSupabaseConfig();
    if(!cfg) return {};
    if(!backendIds||backendIds.length===0) return {};
    const unique=[...new Set(backendIds.filter(Boolean))];
    if(unique.length===0) return {};
    const token=havenSignedInAccessToken();
    if(!token) return {};
    const headers={
      "Accept":"application/json",
      "Content-Type":"application/json",
      apikey:cfg.anonKey,
      Authorization:`Bearer ${token}`,
    };
    try{
      const res=await fetch(`${cfg.url}/rest/v1/rpc/job_assigned_pro_labels`,{
        method:"POST",
        headers,
        body:JSON.stringify({p_job_ids:unique}),
      });
      if(res.status===404){
        havenProLabelRpcUnavailable=true;
        return {};
      }
      if(!res.ok) return {};
      const rows=await res.json();
      if(!Array.isArray(rows)) return {};
      const out={};
      rows.forEach(r=>{
        if(!r||!r.job_id) return;
        const name=r.display_name!=null?String(r.display_name).trim():"";
        if(name) out[String(r.job_id)]=name;
      });
      return out;
    }catch(err){
      return {};
    }
  };

