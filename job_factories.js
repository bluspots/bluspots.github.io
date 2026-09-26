// v0.13 — single factory for job objects. All fields declared with
// defaults so nothing is ever missing at creation (receipts render directly
// from job data — a missing field breaks a receipt silently). If a feature
// needs a new job field, add it here first, then use it via postJob/updateJob.
function makeJob({
  taskId=null, custom=null, tpId=null, photos=[], desc="", status="posted",
  pro=null, msgs=[], surge=0, justAccepted=false, emergency=false, emergencyFee=0,
  addressText="—", addressLabel="", paymentBrand="Card", paymentLast4="----",
  completedAt=null, rated=false, stars=0, reviewTxt="", hireAgain=null,
  cancelStatus=null, cancellationRequestedAt=null, // null | "requested"
  tipAmount=0, tipStatus="notAdded", tippedAt=null, // notAdded | processing | paid | failed
  acceptedAt=null, // when status became en_route — anchors the arrival-window/ETA simulation
  jobPreferences=[], // snapshot of enabled preference labels at booking time — the shape a future Pro-app surface would read
  workPerformed=[], materials=[], proNotes="", // populated once, at completion — see getCompletionDetails()
  lockedPrice=null, // the actual labor price agreed to at booking time (property-aware for scoped tasks like Deep/Standard/Move-Out Cleaning). null for older jobs or non-scoped tasks — those fall back to the catalog's reference price, which is safe since it was never property-dependent to begin with.
  requiresDiagnosis=false, // computed once at creation for diagnosis categories; used for materials-decline outcome
  materialsRequest=null,   // {items:[{description,qty,amount}], estimatedTotal} — shown while awaiting approval
  backendJobId=null,       // canonical UUID from Supabase dual-write; preserved across reloads
}={}){
  return {
    id:Date.now(), // known limitation: two jobs in the same millisecond would collide — impossible via UI, fix when a backend exists
    taskId, custom, tpId, photos, desc, status, pro, msgs, surge, justAccepted,
    emergency, emergencyFee, addressText, addressLabel, paymentBrand, paymentLast4,
    completedAt, rated, stars, reviewTxt, hireAgain,
    cancelStatus, cancellationRequestedAt,
    tipAmount, tipStatus, tippedAt,
    acceptedAt,
    jobPreferences,
    workPerformed, materials, proNotes,
    lockedPrice,
    requiresDiagnosis,
    materialsRequest,
    // Backend (canonical) UUID once dual-write succeeds — preserved if present.
    backendJobId,
  };
}

const NOTIF_TYPES = {
  JOB_UPDATE:"JOB_UPDATE", MESSAGE:"MESSAGE", CANCELLATION:"CANCELLATION",
  RECEIPT:"RECEIPT", PAYMENT:"PAYMENT", LOCATION:"LOCATION", SUPPORT:"SUPPORT", ACCOUNT:"ACCOUNT",
};
// Types that must never be suppressible via notification preferences —
// safety notices, payment failures, account security, essential cancellation
// decisions. JOB_UPDATE/RECEIPT/MESSAGE/SUPPORT respect the user's toggles.
const CRITICAL_NOTIF_TYPES = new Set([NOTIF_TYPES.CANCELLATION, NOTIF_TYPES.PAYMENT, NOTIF_TYPES.LOCATION, NOTIF_TYPES.ACCOUNT]);
let notifIdCounter=0;
// v0.13-style single factory — every notification object shape comes from
// here, matching the makeJob() convention. Never construct one manually.
function makeNotification({
  type, title, body, jobId=null, conversationId=null, propertyId=null, receiptId=null,
  destination=null, priority="normal", isRead=false, count=1,
}={}){
  notifIdCounter+=1;
  return {
    id:`n${Date.now()}_${notifIdCounter}`,
    type, title, body, createdAt:Date.now(), isRead,
    jobId, conversationId, propertyId, receiptId, destination, priority, count,
  };
}

