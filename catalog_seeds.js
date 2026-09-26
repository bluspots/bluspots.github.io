const TASKS=[
  {id:41,e:"🔧",n:"Minor repairs",         p:59,  t:"Varies", c:"Repair",     pop:true},
  // Assembly
  {id:1, e:"🪑",n:"Assemble furniture",    p:65,  t:"50 min",c:"Assembly"},
  {id:3, e:"🏋️",n:"Assemble home gym",     p:120, t:"90 min",c:"Assembly"},
  {id:4, e:"🛋️",n:"Assemble sofa",         p:70,  t:"45 min",c:"Assembly"},
  {id:5, e:"🗄️",n:"Assemble office desk",  p:75,  t:"50 min",c:"Assembly"},
  // Installation
  {id:6, e:"📺",n:"Mount TV",              p:89,  t:"45 min",c:"Installation",pop:true},
  {id:2, e:"🛏️",n:"Assemble bed",          p:79,  t:"60 min",c:"Assembly",    pop:true},
  {id:7, e:"🖼️",n:"Hang artwork",          p:45,  t:"30 min",c:"Installation"},
  {id:8, e:"🪟",n:"Install curtains/blinds",p:55,  t:"35 min",c:"Installation"},
  {id:9, e:"📚",n:"Install shelving",      p:59,  t:"40 min",c:"Installation"},
  {id:10,e:"🚪",n:"Install door hardware", p:65,  t:"35 min",c:"Installation"},
  // Smart Home
  {id:11,e:"🔒",n:"Install smart lock",    p:95,  t:"30 min",c:"Smart Home",  pop:false},
  {id:12,e:"📡",n:"Install doorbell camera",p:65, t:"30 min",c:"Smart Home"},
  {id:13,e:"🌡️",n:"Install smart thermostat",p:75,t:"40 min",c:"Smart Home"},
  {id:14,e:"💡",n:"Install smart lighting",p:59,  t:"35 min",c:"Smart Home"},
  {id:53,e:"🌡️",n:"AC/heating repair visit", p:99,  t:"Varies", c:"Repair",     pop:true},
  // Plumbing
  {id:15,e:"🚰",n:"Replace faucet",        p:85,  t:"45 min",c:"Plumbing"},
  {id:16,e:"🚽",n:"Install/repair toilet", p:95,  t:"50 min",c:"Plumbing"},
  {id:17,e:"🍽️",n:"Install dishwasher",    p:99,  t:"60 min",c:"Plumbing"},
  {id:18,e:"♻️",n:"Install garbage disposal",p:89, t:"45 min",c:"Plumbing"},
  {id:19,e:"🔧",n:"Fix leaky pipe",        p:79,  t:"Varies",c:"Plumbing", pop:true},
  // Electrical
  {id:20,e:"💡",n:"Replace light fixture", p:55,  t:"25 min",c:"Electrical"},
  {id:21,e:"🌀",n:"Install ceiling fan",   p:79,  t:"50 min",c:"Electrical"},
  {id:22,e:"🔌",n:"Install outlet/switch", p:65,  t:"30 min",c:"Electrical"},
  {id:23,e:"🧯",n:"Install EV charger outlet",p:149,t:"90 min",c:"Electrical"},
  // Painting
  {id:24,e:"🎨",n:"Paint a room",          p:249, t:"3-4 hrs",c:"Painting",  pop:false},
  {id:25,e:"🖌️",n:"Paint an accent wall",  p:129, t:"2 hrs",  c:"Painting"},
  {id:26,e:"🚪",n:"Paint doors/trim",      p:99,  t:"90 min", c:"Painting"},
  // Flooring
  {id:27,e:"🧱",n:"Install tile flooring", p:399, t:"4-6 hrs",c:"Flooring"},
  {id:28,e:"🪵",n:"Install laminate/vinyl flooring",p:349,t:"3-5 hrs",c:"Flooring"},
  {id:29,e:"🔨",n:"Repair squeaky floor",  p:89,  t:"Varies", c:"Flooring"},
  // Cleaning
  // NOTE: "p" is a base/fallback reference price only, shown when no real
  // property data exists yet. propertyScoped tasks get their actual price
  // computed from the selected property's real beds/baths/sqft at booking
  // time — see calculateCleaningPrice(). Never bake a property size into a
  // service's own name or its own separate catalog entry (that was the
  // root cause of the original "Deep clean (2BR)" bug).
  {id:30,e:"🧹",n:"Deep Home Cleaning",      p:159, t:"2-3 hrs",c:"Cleaning",  pop:false, propertyScoped:true},
  {id:59,e:"🧼",n:"Standard Home Cleaning",  p:99,  t:"1-2 hrs",c:"Cleaning",  propertyScoped:true},
  {id:60,e:"🚿",n:"Bathroom Cleaning",       p:59,  t:"45 min", c:"Cleaning"},
  {id:61,e:"🍽️",n:"Kitchen Cleaning",        p:69,  t:"45 min", c:"Cleaning"},
  {id:31,e:"🧽",n:"Move-Out Cleaning",     p:199, t:"3 hrs",  c:"Cleaning", propertyScoped:true},
  {id:32,e:"🪟",n:"Window washing (interior)",p:79,t:"60 min",c:"Cleaning"},
  {id:33,e:"🛋️",n:"Carpet/upholstery cleaning",p:119,t:"90 min",c:"Cleaning"},
  // Landscaping
  {id:34,e:"🌱",n:"Lawn mowing",           p:49,  t:"45 min", c:"Landscaping"},
  {id:35,e:"✂️",n:"Hedge trimming",        p:69,  t:"60 min", c:"Landscaping"},
  {id:36,e:"🍂",n:"Leaf removal",          p:79,  t:"75 min", c:"Landscaping"},
  {id:37,e:"🌸",n:"Garden bed cleanup",    p:89,  t:"90 min", c:"Landscaping"},
  // Moving & Hauling
  {id:38,e:"📦",n:"Furniture moving (single item)",p:89,t:"45 min",c:"Moving"},
  {id:39,e:"🚛",n:"Load/unload moving truck",p:149,t:"2 hrs",c:"Moving"},
  {id:40,e:"🗑️",n:"Junk removal",          p:99,  t:"60 min", c:"Moving"},
  // Repair
 
  {id:42,e:"🚪",n:"Fence repair",          p:159, t:"2 hrs",  c:"Repair"},
  {id:43,e:"🚗",n:"Garage door repair",    p:139, t:"90 min", c:"Repair"},
  {id:44,e:"🧱",n:"Drywall patch/repair",  p:99,  t:"60 min", c:"Repair"},
  // Maintenance
  {id:45,e:"❄️",n:"HVAC filter swap",      p:35,  t:"20 min", c:"Maintenance"},
  {id:46,e:"🏠",n:"Gutter cleaning",       p:119, t:"90 min", c:"Maintenance"},
  {id:47,e:"💦",n:"Pressure washing (driveway/patio)",p:149,t:"2 hrs",c:"Maintenance"},
  {id:48,e:"🪟",n:"Window washing (exterior)",p:99,t:"75 min",c:"Maintenance"},
  // Appliance
  {id:49,e:"🌀",n:"Washer/dryer installation",p:99,t:"60 min",c:"Appliance"},
  {id:50,e:"🧊",n:"Refrigerator installation",p:89,t:"45 min",c:"Appliance"},
  // Pest Control
  {id:51,e:"🐜",n:"Pest control treatment",p:129, t:"60 min", c:"Pest Control"},
  // Added for problem-diagnosis coverage
  {id:52,e:"🌀",n:"Garbage disposal repair",p:89,  t:"40 min", c:"Plumbing"},

  {id:54,e:"⚡",n:"Electrical troubleshooting",p:89, t:"Varies", c:"Electrical"},
  // Added for search-by-symptom intent coverage — these are genuine repair
  // needs that had no non-install-only task to route to.
  {id:55,e:"🔧",n:"Appliance repair visit",p:89, t:"Varies", c:"Appliance"},
  {id:56,e:"🪟",n:"Window repair",         p:89, t:"Varies", c:"Repair"},
  {id:57,e:"🌀",n:"Ceiling fan repair",    p:69, t:"Varies", c:"Electrical"},
  {id:58,e:"🚪",n:"Door repair",           p:79, t:"Varies", c:"Repair"},
];
const PROS=[
  {i:"MT",n:"Marcus T.",r:4.97,j:543,s:"TV Mount Pro",   col:"#1E40AF",memberSince:"2019",
    trustScore:98,onTimeRate:99,hireAgainRate:97,completionRate:99,responseTime:"4 min",
    badges:["Identity verified","Background checked"]},
  {i:"DR",n:"David R.", r:4.93,j:312,s:"Assembly Pro",   col:"#065F46",memberSince:"2020",
    trustScore:95,onTimeRate:96,hireAgainRate:94,completionRate:98,responseTime:"7 min",
    badges:["Identity verified","Background checked"]},
  {i:"SK",n:"Sarah K.", r:4.99,j:189,s:"Smart Home Pro", col:"#5B21B6",memberSince:"2021",
    trustScore:99,onTimeRate:100,hireAgainRate:98,completionRate:99,responseTime:"3 min",
    badges:["Identity verified","Background checked","Licensed"]},
];
// Simulated job-completion detail (work performed, materials, pro notes),
// keyed by category so a plumbing job and an electrical job get distinct,
// contextually appropriate content rather than generic boilerplate — same
// spirit as PRO_REPLIES being a real (if simulated) pool rather than one
// fixed string. IMPORTANT: materials are ADDITIVE — listed materials are
// additional approved costs shown on the receipt ON TOP of the labor price.
// Labor remains the full task/service price; Haven takes 0% of materials.
const COMPLETION_TEMPLATES={
  Plumbing:[{
    workPerformed:["Diagnosed the source of the issue","Replaced the affected component","Tested water pressure and flow","Checked for leaks at all connections","Cleaned the work area"],
    materialsTemplate:[{description:"Replacement cartridge",qty:1,amount:28},{description:"Compression fitting",qty:2,amount:9}],
    notes:"Found the original part had worn past a simple repair, so replaced it outright rather than patching — should hold up long-term. Tested under full pressure before wrapping up; no drips at any connection.",
  }],
  Electrical:[{
    workPerformed:["Shut off power at the breaker before starting","Diagnosed the wiring issue","Replaced the faulty component","Tested the circuit under load","Restored power and confirmed normal operation"],
    materialsTemplate:[{description:"Outlet/switch (code-rated)",qty:1,amount:14},{description:"Wire nuts and connectors",qty:1,amount:6}],
    notes:"Everything tested normal after the repair — no flickering, no warm-to-the-touch spots. Recommend keeping an eye on it for the next week just as routine follow-up, but I don't expect any issues.",
  }],
  Appliance:[{
    workPerformed:["Diagnosed the malfunction","Replaced the failed part","Ran a full test cycle","Checked for leaks and unusual noise","Confirmed normal operation before leaving"],
    materialsTemplate:[{description:"Replacement part (OEM-equivalent)",qty:1,amount:32}],
    notes:"Ran a complete cycle after the repair to confirm everything's back to normal — no error codes, no unusual noise. Should be good to go.",
  }],
  Installation:[{
    workPerformed:["Confirmed placement and measurements","Completed the installation","Secured all mounting points","Tested for stability and proper function","Cleaned up packaging and work area"],
    materialsTemplate:[{description:"Mounting hardware kit",qty:1,amount:18}],
    notes:"Double-checked everything was level and securely mounted before finishing. Let me know if you'd like anything adjusted.",
  }],
  Assembly:[{
    workPerformed:["Unpacked and inventoried all parts","Assembled per manufacturer specifications","Tightened and checked all hardware","Tested stability","Cleared away packaging"],
    materialsTemplate:[],
    notes:"All hardware fully tightened and checked for stability. Packaging removed — let me know if you'd like it kept for a return.",
  }],
  Cleaning:[{
    workPerformed:["Dusted and wiped all surfaces","Vacuumed and mopped floors","Cleaned kitchen and bathroom fixtures","Emptied trash and replaced liners","Final walkthrough for quality"],
    materialsTemplate:[],
    notes:"Focused extra attention on the kitchen and bathrooms as usual. Everything's ready to go.",
  }],
  Landscaping:[{
    workPerformed:["Assessed the yard/area","Completed the requested work","Cleared and bagged debris","Edged and tidied borders","Final walkthrough"],
    materialsTemplate:[],
    notes:"Yard's in good shape. Let me know if you'd like this set up as a recurring visit.",
  }],
  Painting:[{
    workPerformed:["Prepped surfaces (patched, sanded, taped)","Applied primer where needed","Applied two coats of paint","Removed tape and protected surfaces","Cleaned up work area"],
    materialsTemplate:[{description:"Paint (per gallon)",qty:1,amount:34},{description:"Painter's tape and supplies",qty:1,amount:7}],
    notes:"Two full coats for even coverage. Give it about 24 hours before hanging anything or wiping down the walls.",
  }],
  Flooring:[{
    workPerformed:["Inspected the affected area","Completed the repair/installation","Checked for levelness and secure fit","Cleaned the area","Final inspection"],
    materialsTemplate:[{description:"Flooring materials/adhesive",qty:1,amount:22}],
    notes:"Everything's level and secure. Give any adhesive a full 24 hours before heavy foot traffic in that area.",
  }],
  "Smart Home":[{
    workPerformed:["Confirmed compatibility and placement","Completed the installation and wiring","Paired the device with your network/app","Tested all functions","Walked through basic usage"],
    materialsTemplate:[{description:"Mounting/wiring hardware",qty:1,amount:12}],
    notes:"Device is paired and tested — all functions working as expected. Happy to answer any questions about the app setup.",
  }],
  Maintenance:[{
    workPerformed:["Inspected the system/area","Performed the requested maintenance","Checked for any additional issues","Tested normal operation","Cleaned up work area"],
    materialsTemplate:[{description:"Filter/consumable part",qty:1,amount:15}],
    notes:"Everything's in good working order. I noted the date so you'll have a record for next time this is due.",
  }],
  "Pest Control":[{
    workPerformed:["Inspected the affected areas","Identified entry points and activity","Applied treatment","Sealed accessible entry points where possible","Provided prevention recommendations"],
    materialsTemplate:[{description:"Treatment product",qty:1,amount:19}],
    notes:"Treated all active areas and the main entry points I could find. You may see some activity for a few days as the treatment takes effect — that's normal.",
  }],
  Moving:[{
    workPerformed:["Confirmed the scope with you before starting","Carefully wrapped/protected items as needed","Completed the move","Placed items in requested locations","Final walkthrough"],
    materialsTemplate:[],
    notes:"Everything moved without any damage. Let me know if anything needs to be repositioned.",
  }],
  Repair:[{
    workPerformed:["Diagnosed the issue","Completed the repair","Tested for proper function","Inspected surrounding area for related wear","Cleaned up work area"],
    materialsTemplate:[{description:"Repair parts/hardware",qty:1,amount:16}],
    notes:"Fixed and tested — working normally now. Let me know if you notice anything else in that area.",
  }],
};
const DEFAULT_COMPLETION_TEMPLATE={
  workPerformed:["Assessed the job on arrival","Completed the requested work","Tested the result","Cleaned up the work area"],
  materialsTemplate:[],
  notes:"Completed as requested — let me know if you have any questions.",
};

