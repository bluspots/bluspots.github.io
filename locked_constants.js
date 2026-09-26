// Locked constants extracted for Phase 3 Step 1.
// Duplicated across apps temporarily; consolidate post–Phase-3 per docs/PHASE3_MODULARIZATION_ORDER.md.

// Category name list
const CATS=["All","Assembly","Installation","Smart Home","Plumbing","Electrical","Painting","Flooring","Cleaning","Landscaping","Moving","Repair","Maintenance","Appliance","Pest Control"];

// Emergency priority fee (locked)
const EMERGENCY_FEE=35;

// Status flow and status info dictionary
const SF=["en_route","arrived","diagnosing","materials_requested","materials_approved","in_progress","complete"];
const SI={
  en_route:            {label:"Pro is on the way",                 sub:"is heading to you",                 em:"🚗"},
  arrived:             {label:"Pro has arrived",                   sub:"is at your door",                   em:"📍"},
  diagnosing:          {label:"Assessing the job",                 sub:"is diagnosing the issue",           em:"🧪"},
  materials_requested: {label:"Materials needed — your approval",  sub:"review and approve",                em:"🧾"},
  materials_approved:  {label:"Materials approved — pro is buying",sub:"authorized purchase",               em:"🧾"},
  in_progress:         {label:"Job in progress",                   sub:"is working on your job",            em:"🔨"},
  inspection_completed:{label:"Inspection visit completed",        sub:"",                                  em:"🧪"},
  materials_declined:  {label:"Job ended — materials declined",    sub:"",                                  em:"⛔"},
  complete:            {label:"Job Complete! 🎉",                  sub:"— tap below to review",             em:"⭐"},
};

// Screen name registries
const SCREENS = new Set([
  "home","browse","diagnose","emergency","task","custom","posted","tracking",
  "messages","rating","payment","editProfile","myhome","receiptList","receipt",
  "addressEdit","proProfile","addresses","help","serviceHistory",
  "notifCenter","settings","tip","jobPreferences",
]);
const TRANSIENT_FLOW_SCREENS = new Set([
  "task","custom","posted","tracking","messages","rating","receipt","addressEdit","editProfile","tip",
]);

// Terminal and valid job status sets (hoisted from inside App)
const VALID_JOB_STATUSES=new Set([
  "posted","en_route","arrived","diagnosing",
  "materials_requested","materials_approved",
  "in_progress","inspection_completed","materials_declined",
  "complete","cancelled"
]);
const TERMINAL_STATUSES=new Set(["complete","inspection_completed","materials_declined"]);

