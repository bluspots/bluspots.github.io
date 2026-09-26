function getCompletionDetails(category,taskPrice){
  const templates=COMPLETION_TEMPLATES[category];
  const chosen=(templates&&templates.length)?templates[Math.floor(Math.random()*templates.length)]:DEFAULT_COMPLETION_TEMPLATE;
  // Simulation cap for generated example materials — keeps examples reasonable.
  const maxMaterialsCost=Math.max(0,Math.floor((taskPrice||0)*0.35));
  const materials=[]; let materialsCost=0;
  for(const m of chosen.materialsTemplate){
    if(materialsCost+m.amount<=maxMaterialsCost){ materials.push({...m}); materialsCost+=m.amount; }
  }
  return {
    workPerformed:chosen.workPerformed,
    materials, // materials are ADDITIVE on top of labor — not carved from it
    laborAmount:(taskPrice||0),
    proNotes:chosen.notes,
  };
}
// Property-aware pricing — deliberately separate from intent matching and
// from the property record itself. A propertyScoped task's own "p" field
// is only ever a fallback reference price (shown before any property is
// known); the real price is always computed here, from the ACTUAL
// selected property's real beds/baths/sqft. Never invents a missing
// value — if the property is missing required fields, this returns which
// ones so the caller can prompt the customer, never silently assume a
// size. Coefficients are calibrated so a typical 2-bed/1-bath home lands
// close to the task's own original reference price, scaling sensibly from
// there — not an arbitrary formula disconnected from prior pricing.
const CLEANING_PRICE_COEFFICIENTS={
  30:{base:69,perBed:25,perBath:20,per100Sqft:2},    // Deep Home Cleaning
  59:{base:39,perBed:15,perBath:12,per100Sqft:1.2},  // Standard Home Cleaning
  31:{base:89,perBed:28,perBath:22,per100Sqft:2.2},  // Move-Out Cleaning
};
function calculateCleaningPrice(task,property){
  if(!task?.propertyScoped) return {price:task?.p??0,missingFields:[]};
  if(!property) return {price:null,missingFields:["bedrooms","bathrooms","square footage"]};
  const missingFields=[];
  const bedsRaw=property.beds;
  const bedsNum = bedsRaw==="Studio" ? 0 : (bedsRaw&&!isNaN(parseFloat(bedsRaw)) ? parseFloat(bedsRaw) : null);
  const bathsNum = property.baths&&!isNaN(parseFloat(property.baths)) ? parseFloat(property.baths) : null;
  const sqftNum = property.sqft&&!isNaN(parseFloat(String(property.sqft).replace(/,/g,""))) ? parseFloat(String(property.sqft).replace(/,/g,"")) : null;
  if(bedsNum===null) missingFields.push("bedrooms");
  if(bathsNum===null) missingFields.push("bathrooms");
  if(sqftNum===null) missingFields.push("square footage");
  if(missingFields.length>0) return {price:null,missingFields};

  const coef=CLEANING_PRICE_COEFFICIENTS[task.id]||{base:task.p*0.4,perBed:15,perBath:12,per100Sqft:1.5};
  const raw=coef.base+bedsNum*coef.perBed+bathsNum*coef.perBath+(sqftNum/100)*coef.per100Sqft;
  const price=Math.round((raw+1)/10)*10-1; // snap to the app's existing "$X9" pricing convention
  return {price:Math.max(price,Math.round(task.p*0.4)),missingFields:[]}; // sane floor regardless of an unusually small property
}
