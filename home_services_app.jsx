import React, { useState, useRef, useEffect } from "react";

// Brand + semantic colors — constant across light/dark themes (see App() for
// the theme-dependent surface/text/border tokens: BG, W, TX, TS, TM, BD, SL).
const N='#1C2B3A',AM='#F59E0B';
const SC='#059669';

const TASKS=[
  // Assembly
  {id:1, e:"🪑",n:"Assemble furniture",    p:65,  t:"50 min",c:"Assembly"},
  {id:2, e:"🛏️",n:"Assemble bed",          p:79,  t:"60 min",c:"Assembly",    pop:true},
  {id:3, e:"🏋️",n:"Assemble home gym",     p:120, t:"90 min",c:"Assembly"},
  {id:4, e:"🛋️",n:"Assemble sofa",         p:70,  t:"45 min",c:"Assembly"},
  {id:5, e:"🗄️",n:"Assemble office desk",  p:75,  t:"50 min",c:"Assembly"},
  // Installation
  {id:6, e:"📺",n:"Mount TV",              p:89,  t:"45 min",c:"Installation",pop:true},
  {id:7, e:"🖼️",n:"Hang artwork",          p:45,  t:"30 min",c:"Installation"},
  {id:8, e:"🪟",n:"Install curtains/blinds",p:55,  t:"35 min",c:"Installation"},
  {id:9, e:"📚",n:"Install shelving",      p:59,  t:"40 min",c:"Installation"},
  {id:10,e:"🚪",n:"Install door hardware", p:65,  t:"35 min",c:"Installation"},
  // Smart Home
  {id:11,e:"🔒",n:"Install smart lock",    p:95,  t:"30 min",c:"Smart Home",  pop:true},
  {id:12,e:"📡",n:"Install doorbell camera",p:65, t:"30 min",c:"Smart Home"},
  {id:13,e:"🌡️",n:"Install smart thermostat",p:75,t:"40 min",c:"Smart Home"},
  {id:14,e:"💡",n:"Install smart lighting",p:59,  t:"35 min",c:"Smart Home"},
  // Plumbing
  {id:15,e:"🚰",n:"Replace faucet",        p:85,  t:"45 min",c:"Plumbing"},
  {id:16,e:"🚽",n:"Install/repair toilet", p:95,  t:"50 min",c:"Plumbing"},
  {id:17,e:"🍽️",n:"Install dishwasher",    p:99,  t:"60 min",c:"Plumbing"},
  {id:18,e:"♻️",n:"Install garbage disposal",p:89, t:"45 min",c:"Plumbing"},
  {id:19,e:"🔧",n:"Fix leaky pipe",        p:79,  t:"Varies",c:"Plumbing"},
  // Electrical
  {id:20,e:"💡",n:"Replace light fixture", p:55,  t:"25 min",c:"Electrical"},
  {id:21,e:"🌀",n:"Install ceiling fan",   p:79,  t:"50 min",c:"Electrical"},
  {id:22,e:"🔌",n:"Install outlet/switch", p:65,  t:"30 min",c:"Electrical"},
  {id:23,e:"🧯",n:"Install EV charger outlet",p:149,t:"90 min",c:"Electrical"},
  // Painting
  {id:24,e:"🎨",n:"Paint a room",          p:249, t:"3-4 hrs",c:"Painting",  pop:true},
  {id:25,e:"🖌️",n:"Paint an accent wall",  p:129, t:"2 hrs",  c:"Painting"},
  {id:26,e:"🚪",n:"Paint doors/trim",      p:99,  t:"90 min", c:"Painting"},
  // Flooring
  {id:27,e:"🧱",n:"Install tile flooring", p:399, t:"4-6 hrs",c:"Flooring"},
  {id:28,e:"🪵",n:"Install laminate/vinyl flooring",p:349,t:"3-5 hrs",c:"Flooring"},
  {id:29,e:"🔨",n:"Repair squeaky floor",  p:89,  t:"Varies", c:"Flooring"},
  // Cleaning
  {id:30,e:"🧹",n:"Deep clean (2BR)",      p:159, t:"2-3 hrs",c:"Cleaning",  pop:true},
  {id:31,e:"🧽",n:"Move-out cleaning",     p:199, t:"3 hrs",  c:"Cleaning"},
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
  {id:41,e:"🔧",n:"Minor repairs",         p:59,  t:"Varies", c:"Repair"},
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
  {id:53,e:"🌡️",n:"AC/heating repair visit", p:99,  t:"Varies", c:"Repair"},
  {id:54,e:"⚡",n:"Electrical troubleshooting",p:89, t:"Varies", c:"Electrical"},
  // Added for search-by-symptom intent coverage — these are genuine repair
  // needs that had no non-install-only task to route to.
  {id:55,e:"🔧",n:"Appliance repair visit",p:89, t:"Varies", c:"Appliance"},
  {id:56,e:"🪟",n:"Window repair",         p:89, t:"Varies", c:"Repair"},
  {id:57,e:"🌀",n:"Ceiling fan repair",    p:69, t:"Varies", c:"Electrical"},
  {id:58,e:"🚪",n:"Door repair",           p:79, t:"Varies", c:"Repair"},
];
const PROS=[
  {i:"MT",n:"Marcus T.",r:4.97,j:543,s:"TV Mount Pro",   col:"#1E40AF",
    trustScore:98,onTimeRate:99,hireAgainRate:97,completionRate:99,responseTime:"4 min",
    badges:["Identity verified","Background checked","Insured"]},
  {i:"DR",n:"David R.", r:4.93,j:312,s:"Assembly Pro",   col:"#065F46",
    trustScore:95,onTimeRate:96,hireAgainRate:94,completionRate:98,responseTime:"7 min",
    badges:["Identity verified","Background checked"]},
  {i:"SK",n:"Sarah K.", r:4.99,j:189,s:"Smart Home Pro", col:"#5B21B6",
    trustScore:99,onTimeRate:100,hireAgainRate:98,completionRate:99,responseTime:"3 min",
    badges:["Identity verified","Background checked","Insured","Licensed"]},
];
const trustColor=score=>score>=97?SC:score>=90?AM:"#EF4444";
const TIME_PREFS=[
  {id:1,label:"ASAP",          sub:"Within 2 hours",              surge:10},
  {id:2,label:"This morning",  sub:"Today · 8:00 AM – 12:00 PM",  surge:0},
  {id:3,label:"This afternoon",sub:"Today · 12:00 – 5:00 PM",     surge:0},
  {id:4,label:"This evening",  sub:"Today · 5:00 – 9:00 PM",      surge:0},
  {id:5,label:"Tomorrow AM",   sub:"Tomorrow · 8:00 AM – 12:00 PM",surge:0},
  {id:6,label:"Tomorrow PM",   sub:"Tomorrow · 12:00 – 5:00 PM",  surge:0},
];
// Emergency jobs use their own short-window timing instead of normal scheduling.
const EMERGENCY_TIME_PREFS=[
  {id:101,label:"ASAP",            sub:"Within 1–2 hours", surge:10},
  {id:102,label:"Within 4 hours",  sub:"Response within 4 hours",surge:0},
  {id:103,label:"Within 6 hours",  sub:"Response within 6 hours",surge:0},
];
const ALL_TIME_PREFS=[...TIME_PREFS,...EMERGENCY_TIME_PREFS];
const CATS=["All","Assembly","Installation","Smart Home","Plumbing","Electrical","Painting","Flooring","Cleaning","Landscaping","Moving","Repair","Maintenance","Appliance","Pest Control"];
// Plain keyword table for now — deliberately kept as data, not logic, so a
// future AI/NLP service is a drop-in replacement for matchSymptomToCategories
// without any caller needing to change.
// ── SEARCH-BY-SYMPTOM: INTENT-BASED MATCHING ENGINE ─────────────────────
// Architecture: Search UI -> matchRepairIntent() -> INTENT_LIBRARY -> results.
// matchRepairIntent() is the ONLY thing a future AI/NLP service would need
// to replace — same input (a query string) and output shape (tier +
// ranked matches + optional clarification), so the UI never needs to know
// whether a result came from this keyword/phrase engine or a future model.
//
// Each intent is DATA, not logic: id, display label, parent category, an
// optional link to a real bookable task, phrases (synonyms + example
// phrasings people actually type), exclude (phrases that veto this intent
// even if a phrase partially matches), and an optional clarifyGroup for
// when several sibling intents are genuinely too close to call.
const INTENT_LIBRARY=[
  // Plumbing
  {id:"unclog_toilet",label:"Unclog Toilet",category:"Plumbing",taskId:16,
    phrases:["clogged toilet","blocked toilet","toilet backed up","toilet won't flush","toilet wont flush","water rises when flushed","commode clogged","toilet not flushing","toilet overflow when flushed","toilet clog","toilet stopped up"],
    exclude:["running constantly","runs constantly","leaking at base","leaking from tank","install","new toilet"],clarifyGroup:"toilet_issue"},
  {id:"running_toilet",label:"Fix Running Toilet",category:"Plumbing",taskId:16,
    phrases:["running toilet","toilet keeps running","toilet won't stop running","toilet wont stop running","toilet runs constantly","toilet tank running","phantom flush","toilet running non stop"],
    exclude:["clogged","blocked","backed up","overflow","won't flush","wont flush"],clarifyGroup:"toilet_issue"},
  {id:"overflowing_toilet",label:"Fix Overflowing Toilet",category:"Plumbing",taskId:16,
    phrases:["overflowing toilet","toilet overflowing","toilet overflows","water on floor from toilet","toilet spilling over"],
    exclude:["running constantly","runs constantly","leak at base"],clarifyGroup:"toilet_issue"},
  {id:"leaking_toilet",label:"Fix Leaking Toilet",category:"Plumbing",taskId:16,
    phrases:["toilet leaking","toilet leaking at base","water under toilet","toilet base leak","toilet leaks when flushed"],
    exclude:["clogged","won't flush","wont flush","overflow","running"],clarifyGroup:"toilet_issue"},
  {id:"toilet_installation",label:"Toilet Installation",category:"Plumbing",taskId:16,
    phrases:["install toilet","new toilet installation","replace toilet","toilet installation","need a new toilet installed"],
    exclude:["clogged","running","overflow","leak","won't flush"]},
  {id:"clogged_sink",label:"Unclog Sink",category:"Plumbing",taskId:19,
    phrases:["clogged sink","blocked sink","sink backing up","sink won't drain","sink wont drain","slow drain","water under sink","wet under sink","kitchen sink clogged","bathroom sink clogged"],
    exclude:["toilet"]},
  {id:"leaky_pipe",label:"Fix Leaky Pipe",category:"Plumbing",taskId:19,
    phrases:["leaky pipe","leaking pipe","pipe leak","dripping pipe","pipe burst","burst pipe","water damage from pipe","pipe under sink leaking","leak under sink","leaking under sink","leak under the sink"],
    exclude:["toilet","sink clogged","sink backing up","sink won't drain"]},
  {id:"low_water_pressure",label:"Low Water Pressure",category:"Plumbing",taskId:19,
    phrases:["low water pressure","weak water pressure","water pressure low","barely any water pressure","water trickling out"],
    exclude:["toilet","clogged"]},
  {id:"water_heater_issue",label:"Water Heater Issue",category:"Plumbing",taskId:19,
    phrases:["no hot water","water heater not working","water heater broken","water heater leaking","cold water only","hot water ran out"],
    exclude:["toilet"]},
  {id:"install_faucet",label:"Replace Faucet",category:"Plumbing",taskId:15,
    phrases:["install faucet","replace faucet","new faucet","faucet installation","old faucet replacement"],
    exclude:["leak","drip","dripping"]},
  {id:"install_dishwasher",label:"Install Dishwasher",category:"Plumbing",taskId:17,
    phrases:["install dishwasher","new dishwasher installation","dishwasher hookup"],
    exclude:["leaking","not draining","broken","won't start"]},
  {id:"dishwasher_repair",label:"Dishwasher Repair",category:"Appliance",taskId:55,
    phrases:["dishwasher leaking","dishwasher not draining","dishwasher won't start","dishwasher wont start","dishwasher broken","dishwasher not cleaning dishes"],
    exclude:["install","new dishwasher","hookup"]},
  {id:"garbage_disposal_issue",label:"Garbage Disposal Repair",category:"Plumbing",taskId:52,
    phrases:["garbage disposal not working","disposal jammed","disposal humming","disposal won't turn on","disposal wont turn on","disposal leaking","garbage disposal stuck"],
    exclude:["install","new disposal"]},
  {id:"install_garbage_disposal",label:"Install Garbage Disposal",category:"Plumbing",taskId:18,
    phrases:["install garbage disposal","new disposal installation","new garbage disposal"],
    exclude:["not working","jammed","broken","humming"]},
  // Electrical
  {id:"lights_flickering",label:"Lights Flickering",category:"Electrical",taskId:54,
    phrases:["lights flicker","lights flickering","light flickers","lights blink","lights dim","flickering lights","light bulb flickering","lights keep flickering"],
    exclude:["outlet not working","no power","dead outlet"]},
  {id:"outlet_not_working",label:"Outlet Not Working",category:"Electrical",taskId:54,
    phrases:["outlet not working","dead outlet","outlet no power","plug not working","socket not working","outlet stopped working"],
    exclude:["install new outlet","flicker","flickering"]},
  {id:"install_outlet",label:"Install Outlet/Switch",category:"Electrical",taskId:22,
    phrases:["install outlet","new outlet installation","add an outlet","install switch","install light switch"],
    exclude:["not working","dead","broken","stopped working"]},
  {id:"power_out_partial",label:"Electrical Troubleshooting",category:"Electrical",taskId:54,
    phrases:["no power in room","breaker keeps tripping","circuit breaker trips","power out in part of house","lost power to outlet","breaker won't reset"],
    exclude:[]},
  {id:"ceiling_fan_wobble",label:"Ceiling Fan Repair",category:"Electrical",taskId:57,
    phrases:["ceiling fan wobbles","ceiling fan wobbling","fan making noise","ceiling fan shaking","ceiling fan not working properly","fan wobbling loudly"],
    exclude:["install new fan","install ceiling fan"]},
  {id:"install_ceiling_fan",label:"Install Ceiling Fan",category:"Electrical",taskId:21,
    phrases:["install ceiling fan","new ceiling fan installation","add a ceiling fan"],
    exclude:["wobble","wobbling","noise","shaking"]},
  {id:"install_light_fixture",label:"Replace Light Fixture",category:"Electrical",taskId:20,
    phrases:["replace light fixture","install light fixture","new light fixture","change light fixture"],
    exclude:["flicker","flickering"]},
  {id:"ev_charger",label:"Install EV Charger Outlet",category:"Electrical",taskId:23,
    phrases:["install ev charger","electric car charger installation","ev charging outlet","install car charger"],
    exclude:[]},
  // HVAC / Appliance
  {id:"ac_not_cooling",label:"AC/Heating Repair Visit",category:"Repair",taskId:53,
    phrases:["ac blowing warm air","ac not cooling","air conditioning not cold","ac not working","air conditioner broken","ac blowing hot air"],
    exclude:["heat not working","furnace","no heat"]},
  {id:"heater_not_working",label:"AC/Heating Repair Visit",category:"Repair",taskId:53,
    phrases:["furnace not working","heater not working","no heat","heating not working","thermostat not responding","furnace won't turn on"],
    exclude:["ac","cooling","warm air","blowing hot"]},
  {id:"hvac_filter",label:"HVAC Filter Swap",category:"Maintenance",taskId:45,
    phrases:["change hvac filter","replace air filter","furnace filter swap","need new air filter"],
    exclude:[]},
  {id:"washer_issue",label:"Appliance Repair Visit",category:"Appliance",taskId:55,
    phrases:["washing machine shaking","washer shaking","washing machine leaking","washer not draining","washer won't start","washer wont start","washing machine noisy","washer making noise"],
    exclude:["install","new washer","hookup"]},
  {id:"dryer_issue",label:"Appliance Repair Visit",category:"Appliance",taskId:55,
    phrases:["dryer not heating","dryer won't start","dryer wont start","dryer making noise","dryer not drying clothes","dryer squeaking"],
    exclude:["install","new dryer","hookup"]},
  {id:"install_washer_dryer",label:"Washer/Dryer Installation",category:"Appliance",taskId:49,
    phrases:["install washer","install dryer","washer dryer installation","new washer hookup","new dryer hookup"],
    exclude:["not working","broken","shaking","leaking","won't start"]},
  {id:"fridge_issue",label:"Appliance Repair Visit",category:"Appliance",taskId:55,
    phrases:["fridge not cooling","refrigerator not working","fridge making noise","freezer not freezing","fridge running warm"],
    exclude:["install","new fridge","hookup"]},
  {id:"install_fridge",label:"Refrigerator Installation",category:"Appliance",taskId:50,
    phrases:["install refrigerator","new fridge installation","fridge hookup","new refrigerator delivery"],
    exclude:["not cooling","broken","not working","making noise"]},
  // Doors / Windows / Drywall
  {id:"door_wont_close",label:"Door Repair",category:"Repair",taskId:58,
    phrases:["door won't close","door wont close","door won't latch","door wont latch","sticking door","door sticks","misaligned door","door won't shut","door wont shut"],
    exclude:["garage"]},
  {id:"door_hardware_install",label:"Install Door Hardware",category:"Installation",taskId:10,
    phrases:["install door handle","install door knob","new door hardware","install deadbolt","replace door lock"],
    exclude:["won't close","wont close","stuck","broken","won't latch"]},
  {id:"garage_door_wont_open",label:"Garage Door Repair",category:"Repair",taskId:43,
    phrases:["garage door won't open","garage door wont open","garage door stuck","garage door not working","garage door opener broken","garage door won't close"],
    exclude:[]},
  {id:"window_stuck_or_broken",label:"Window Repair",category:"Repair",taskId:56,
    phrases:["window won't open","window wont open","window stuck","cracked window","broken window glass","broken window","window screen torn","window won't close","window wont close"],
    exclude:[]},
  {id:"drywall_hole",label:"Drywall Patch/Repair",category:"Repair",taskId:44,
    phrases:["hole in wall","drywall hole","drywall crack","dent in wall","wall patch needed","hole in drywall"],
    exclude:[]},
  {id:"fence_repair",label:"Fence Repair",category:"Repair",taskId:42,
    phrases:["fence broken","fence repair needed","fence board loose","fence leaning","fence panel damaged"],
    exclude:[]},
  // Flooring
  {id:"floor_squeak",label:"Repair Squeaky Floor",category:"Flooring",taskId:29,
    phrases:["squeaky floor","floor squeaks","creaky floorboard","floor creaking","floorboard squeaks"],
    exclude:["install new floor","new flooring"]},
  {id:"install_tile",label:"Install Tile Flooring",category:"Flooring",taskId:27,
    phrases:["install tile flooring","new tile floor","tile installation","lay tile floor"],
    exclude:["squeak","crack"]},
  {id:"install_laminate",label:"Install Laminate/Vinyl Flooring",category:"Flooring",taskId:28,
    phrases:["install laminate flooring","vinyl flooring installation","new laminate floor","lay vinyl floor"],
    exclude:["squeak"]},
  // Painting
  {id:"paint_room",label:"Paint a Room",category:"Painting",taskId:24,
    phrases:["paint a room","need a room painted","interior painting","paint bedroom","paint living room","repaint room"],
    exclude:["peeling","touch up","chipped"]},
  {id:"paint_accent_wall",label:"Paint an Accent Wall",category:"Painting",taskId:25,
    phrases:["paint an accent wall","accent wall painting","feature wall paint"],
    exclude:[]},
  {id:"paint_touch_up",label:"Paint Doors/Trim",category:"Painting",taskId:26,
    phrases:["paint peeling","chipped paint","faded paint","touch up paint","paint doors trim","trim needs paint"],
    exclude:["whole room","entire room","paint a room"]},
  // Assembly / TV Mounting / Smart Home
  {id:"assemble_furniture",label:"Assemble Furniture",category:"Assembly",taskId:1,
    phrases:["assemble furniture","put together furniture","flat pack assembly","furniture assembly needed"],
    exclude:["bed frame","sofa","office desk","home gym"]},
  {id:"assemble_bed",label:"Assemble Bed",category:"Assembly",taskId:2,
    phrases:["assemble bed frame","build a bed","bed frame assembly","put together bed"],
    exclude:[]},
  {id:"build_shelves",label:"Install Shelving",category:"Installation",taskId:9,
    phrases:["need shelves built","install shelves","shelf installation","build shelving","mount shelves","put up shelves"],
    exclude:[]},
  {id:"mount_tv",label:"Mount TV",category:"Installation",taskId:6,
    phrases:["mount tv","tv wall mount","hang tv on wall","tv mounting","install tv bracket","put tv on wall"],
    exclude:["won't turn on","wont turn on","not working","broken","black screen"]},
  {id:"tv_not_turning_on",label:"Electrical Troubleshooting",category:"Electrical",taskId:54,
    phrases:["tv won't turn on","tv wont turn on","tv screen black","tv not powering on","tv remote not working","tv has no power"],
    exclude:["mount","wall mount","install bracket"]},
  {id:"install_smart_lock",label:"Install Smart Lock",category:"Smart Home",taskId:11,
    phrases:["install smart lock","smart lock installation","keyless entry install"],
    exclude:[]},
  {id:"install_doorbell_camera",label:"Install Doorbell Camera",category:"Smart Home",taskId:12,
    phrases:["install doorbell camera","video doorbell installation","ring doorbell install"],
    exclude:[]},
  {id:"install_smart_thermostat",label:"Install Smart Thermostat",category:"Smart Home",taskId:13,
    phrases:["install smart thermostat","nest thermostat installation","smart thermostat setup"],
    exclude:[]},
  {id:"install_smart_lighting",label:"Install Smart Lighting",category:"Smart Home",taskId:14,
    phrases:["install smart lighting","smart bulbs setup","smart light installation"],
    exclude:[]},
  // Outdoor / Cleaning / Moving
  {id:"lawn_mowing",label:"Lawn Mowing",category:"Landscaping",taskId:34,
    phrases:["lawn mowing","mow the lawn","grass cutting","yard mowing needed"],exclude:[]},
  {id:"hedge_trimming",label:"Hedge Trimming",category:"Landscaping",taskId:35,
    phrases:["hedge trimming","trim bushes","trim hedges"],exclude:[]},
  {id:"leaf_removal",label:"Leaf Removal",category:"Landscaping",taskId:36,
    phrases:["leaf removal","rake leaves","yard leaves cleanup"],exclude:[]},
  {id:"gutter_cleaning",label:"Gutter Cleaning",category:"Maintenance",taskId:46,
    phrases:["gutter cleaning","clean gutters","clogged gutters","gutters overflowing"],exclude:[]},
  {id:"pressure_washing",label:"Pressure Washing",category:"Maintenance",taskId:47,
    phrases:["pressure washing","power wash driveway","clean patio","wash the deck"],exclude:[]},
  {id:"deep_clean",label:"Deep Clean",category:"Cleaning",taskId:30,
    phrases:["deep clean house","deep cleaning needed","full house cleaning"],exclude:["move out","moving out"]},
  {id:"move_out_clean",label:"Move-Out Cleaning",category:"Cleaning",taskId:31,
    phrases:["move out cleaning","moving out clean","end of lease cleaning"],exclude:[]},
  {id:"window_washing_interior",label:"Window Washing (Interior)",category:"Cleaning",taskId:32,
    phrases:["window washing interior","clean windows inside"],exclude:["exterior","outside"]},
  {id:"window_washing_exterior",label:"Window Washing (Exterior)",category:"Maintenance",taskId:48,
    phrases:["window washing exterior","clean windows outside"],exclude:["interior","inside"]},
  {id:"carpet_cleaning",label:"Carpet/Upholstery Cleaning",category:"Cleaning",taskId:33,
    phrases:["carpet cleaning","upholstery cleaning","clean carpet stains"],exclude:[]},
  {id:"pest_control",label:"Pest Control Treatment",category:"Pest Control",taskId:51,
    phrases:["ants in house","roaches","mice in house","rats in house","spiders everywhere","termites","pest problem","bugs everywhere"],exclude:[]},
  {id:"furniture_moving",label:"Furniture Moving",category:"Moving",taskId:38,
    phrases:["move furniture","furniture moving single item","help moving couch","move a couch"],exclude:["truck","load","unload"]},
  {id:"moving_truck_help",label:"Load/Unload Moving Truck",category:"Moving",taskId:39,
    phrases:["load moving truck","unload moving truck","help with moving truck"],exclude:[]},
  {id:"junk_removal",label:"Junk Removal",category:"Moving",taskId:40,
    phrases:["junk removal","haul away junk","remove old furniture","junk hauling"],exclude:[]},
];

const CLARIFICATION_GROUPS={
  toilet_issue:{
    question:"What best describes the problem?",
    options:[
      {label:"Won't flush",intentId:"unclog_toilet"},
      {label:"Overflowing",intentId:"overflowing_toilet"},
      {label:"Keeps running",intentId:"running_toilet"},
      {label:"Water leaking",intentId:"leaking_toilet"},
      {label:"Something else",intentId:null},
    ],
  },
};

// Scoring: word-level overlap weighted by inverse document frequency (a
// word that appears in many intents' phrase lists — "toilet", "water" —
// counts for much less than a word specific to one or two intents) feeds
// into a directly interpretable confidence tier, rather than a raw score
// normalized against a self-computed ceiling — an intent whose own phrases
// happen to overlap each other (e.g. "lights flicker" is a substring of
// "lights flickering") would otherwise get an inconsistently inflated
// ceiling relative to intents with sparser phrase lists, quietly
// mis-scoring real queries. An exact phrase match is unambiguous (100%);
// containing a known phrase's content words (in any order, with filler
// words allowed anywhere — real users rarely type a stored phrase
// verbatim, e.g. "i need my lawn mowed" vs. the stored "lawn mowing") is
// strong signal on its own (80-100%, nudged by word specificity);
// word-overlap with no real phrase match is capped well below high
// confidence — this is what actually enforces "a single word can never
// dominate a result on its own." A lightweight suffix-based stem (not a
// full stemmer, just enough for common English inflections) lets "mowed"
// match stored "mowing", "leaking" match stored "leak", etc.
const _STOP_WORDS=new Set(["a","an","the","is","are","was","were","my","your","his","her","its","our","their","and","or","but","with","without","for","of","to","in","on","at","from","by","this","that","these","those","it","its","i","me","we","us","you","he","she","they","them","not","no","so","up","down","out","just","really","very","quite","kind","sort","some","any","all","problem","issue","trouble","having","got","have","has"]);
function _stem(w){
  if(w.length<=3) return w;
  if(w.endsWith("ies")&&w.length>4) return w.slice(0,-3)+"y";
  if(w.endsWith("ing")&&w.length>5) return w.slice(0,-3);
  if(w.endsWith("ed")&&w.length>4) return w.slice(0,-2);
  if(w.endsWith("es")&&w.length>4) return w.slice(0,-2);
  if(w.endsWith("s")&&!w.endsWith("ss")&&w.length>3) return w.slice(0,-1);
  return w;
}
function _tokenize(s){ return (s||"").toLowerCase().replace(/[^a-z0-9\s]/g," ").split(/\s+/).filter(w=>w&&!_STOP_WORDS.has(w)).map(_stem); }
const _intentPhraseWordSets=INTENT_LIBRARY.map(intent=>intent.phrases.map(p=>new Set(_tokenize(p))));
const _intentWordSets=_intentPhraseWordSets.map(phraseSets=>{
  const words=new Set();
  phraseSets.forEach(set=>set.forEach(w=>words.add(w)));
  return words;
});
const _docFreq=(()=>{
  const df={};
  _intentWordSets.forEach(set=>{ set.forEach(w=>{ df[w]=(df[w]||0)+1; }); });
  return df;
})();
const _excludeWordSets=INTENT_LIBRARY.map(intent=>intent.exclude.map(ex=>new Set(_tokenize(ex))));
function _confidenceFor(query,queryWordSet,intent,wordSet,phraseWordSets,excludeWordSets){
  const isExcluded = excludeWordSets.some(ews=>ews.size>0&&[...ews].every(w=>queryWordSet.has(w)));
  if(isExcluded) return 0; // hard veto

  if(intent.phrases.some(p=>p===query)) return 100; // exact known phrasing

  let wordScore=0;
  queryWordSet.forEach(w=>{ if(wordSet.has(w)) wordScore += 1/(_docFreq[w]||1); });
  const wordRatio = queryWordSet.size>0 ? Math.min(1, wordScore/queryWordSet.size) : 0;

  const containsKnownPhrase = phraseWordSets.some(pws=>pws.size>0&&[...pws].every(w=>queryWordSet.has(w)));
  if(containsKnownPhrase) return Math.round(Math.min(100, 80 + wordRatio*20));

  return Math.round(Math.min(65, wordRatio*65));
}

// The single swappable entry point — a future AI/NLP service replaces
// only this function's internals. Same contract: a query string in,
// {tier, matches, clarification} out.
function matchRepairIntent(query){
  const q=(query||"").toLowerCase().trim();
  if(!q) return {tier:"none",matches:[],clarification:null};
  const qWordSet=new Set(_tokenize(q));
  const scored=INTENT_LIBRARY.map((intent,i)=>({
    intent,confidence:_confidenceFor(q,qWordSet,intent,_intentWordSets[i],_intentPhraseWordSets[i],_excludeWordSets[i]),
  })).filter(m=>m.confidence>0).sort((a,b)=>b.confidence-a.confidence);

  const matches=scored.map(({intent,confidence})=>({
    intentId:intent.id,label:intent.label,category:intent.category,taskId:intent.taskId,confidence,
  }));

  if(matches.length===0) return {tier:"low",matches:[],clarification:null};

  const top=matches[0];
  const second=matches[1];
  const tooClose = second && (top.confidence-second.confidence)<20;

  // Clarify only when genuinely needed: several sibling intents from the
  // same clarify group are close enough that guessing would be a real risk.
  const topIntent=INTENT_LIBRARY.find(i=>i.id===top.intentId);
  if(topIntent?.clarifyGroup && (top.confidence<70 || tooClose)){
    const siblingsInTop=matches.slice(0,4).filter(m=>{
      const mi=INTENT_LIBRARY.find(i=>i.id===m.intentId);
      return mi?.clarifyGroup===topIntent.clarifyGroup;
    });
    if(siblingsInTop.length>=2){
      return {tier:"low",matches,clarification:CLARIFICATION_GROUPS[topIntent.clarifyGroup]||null};
    }
  }

  if(top.confidence>=70 && !tooClose) return {tier:"high",matches:matches.slice(0,3)};
  if(top.confidence>=35) return {tier:"medium",matches:matches.slice(0,3)};
  return {tier:"low",matches:matches.slice(0,3),clarification:null};
}

const JOB_CATS=[...CATS.filter(c=>c!=="All"),"Other"];

// Simplified home screen entry tiles — each maps to a group of categories
const ENTRY_GROUPS=[
  {key:"fix",     label:"Fix",     e:"🔧", cats:["Repair","Plumbing","Electrical","Appliance","Pest Control"]},
  {key:"install", label:"Install", e:"🛠️", cats:["Installation","Smart Home","Flooring"]},
  {key:"assemble",label:"Assemble",e:"🪑", cats:["Assembly"]},
  {key:"clean",   label:"Clean",   e:"🧹", cats:["Cleaning"]},
  {key:"outdoor", label:"Outdoor", e:"🌿", cats:["Landscaping","Maintenance"]},
  {key:"move",    label:"Move",    e:"📦", cats:["Moving"]},
];
const EMERGENCY_FEE=35;
// "Trusted Home" is purely informational — no points, levels, or rewards.
// It simply reflects that a property has an established repair history
// through Haven. Configurable threshold, not tied to any gamification.
const TRUSTED_HOME_THRESHOLD=3;
// Emergency screen options — map to an existing catalog task where possible,
// otherwise fall back to a custom-job flow (Locked out, Other).
const EMERGENCY_OPTIONS=[
  {key:"leak",  label:"Active leak / burst pipe", e:"🚿", taskId:19, desc:"Emergency: active leak or burst pipe — needs urgent attention."},
  {key:"ac",    label:"No AC / heating issue",    e:"🌡️", taskId:53, desc:"Emergency: no AC or heating — needs urgent attention."},
  {key:"elec",  label:"Electrical issue",         e:"⚡", taskId:54, desc:"Emergency: electrical issue — needs urgent attention."},
  {key:"lock",  label:"Locked out",               e:"🔑", taskId:null, customTitle:"Emergency lockout assistance", customPrice:"89", ccat:"Repair", desc:"Emergency: locked out of home — needs urgent assistance."},
  {key:"garage",label:"Garage door stuck",        e:"🚪", taskId:43, desc:"Emergency: garage door stuck — needs urgent attention."},
  {key:"other", label:"Other urgent repair",      e:"❗", taskId:null, customTitle:"", customPrice:"", ccat:"Repair", desc:"Emergency: urgent repair needed — details below."},
];
// Demo/placeholder support number — replace before launch.
const SUPPORT_PHONE_DISPLAY="(407) 555-0147";
const SUPPORT_PHONE_LINK="tel:+14075550147";

const TOPICS=[
  {t:"Booking & pricing questions",a:"All prices shown are fixed — what you see at booking is what you pay, plus a surge fee only if you choose ASAP scheduling. There are no hidden fees or hourly surprises."},
  {t:"Cancel or reschedule a job",a:"You can cancel a job any time before a pro accepts it for free from the Bookings tab. Once a pro is en route, cancellations may include a small fee to compensate their travel time."},
  {t:"Report an issue with a pro",a:"If you experience a problem with a pro or a completed job, contact Haven Support. Our support team can review the booking details, messages, photos, and receipt and help determine the next steps."},
  {t:"Refunds & billing",a:"If a job wasn't completed to your satisfaction, contact support within 48 hours of completion and we'll review it for a partial or full refund."},
  {t:"Trust & safety",a:"Haven verifies each pro's identity and background-check status before they can accept jobs. Additional credentials, such as insurance or professional licenses, are shown on the pro's profile when verified. If you're ever in immediate danger, contact local emergency services first — Haven Support is not a substitute for emergency services."},
];

// Maintenance suggestion rules — keyed by TASKS id, used to generate simple
// simulated reminders from a customer's completed service history.
const MAINT_RULES={
  46:{months:6, msg:"Your gutters may be due for cleaning again soon."},
  45:{months:3, msg:"Time to check your HVAC filter — it's been a few months."},
  51:{days:90,  msg:"Your pest control treatment may need a follow-up soon."},
  47:{months:12,msg:"Your driveway or patio may be due for a refresh."},
};

// My Home edit-screen dropdown options
const HOME_TYPES=["Single-family home","Townhouse","Condo","Apartment","Duplex","Mobile/manufactured home","Other"];
const US_STATES=[
  ["AL","Alabama"],["AK","Alaska"],["AZ","Arizona"],["AR","Arkansas"],["CA","California"],
  ["CO","Colorado"],["CT","Connecticut"],["DE","Delaware"],["FL","Florida"],["GA","Georgia"],
  ["HI","Hawaii"],["ID","Idaho"],["IL","Illinois"],["IN","Indiana"],["IA","Iowa"],
  ["KS","Kansas"],["KY","Kentucky"],["LA","Louisiana"],["ME","Maine"],["MD","Maryland"],
  ["MA","Massachusetts"],["MI","Michigan"],["MN","Minnesota"],["MS","Mississippi"],["MO","Missouri"],
  ["MT","Montana"],["NE","Nebraska"],["NV","Nevada"],["NH","New Hampshire"],["NJ","New Jersey"],
  ["NM","New Mexico"],["NY","New York"],["NC","North Carolina"],["ND","North Dakota"],["OH","Ohio"],
  ["OK","Oklahoma"],["OR","Oregon"],["PA","Pennsylvania"],["RI","Rhode Island"],["SC","South Carolina"],
  ["SD","South Dakota"],["TN","Tennessee"],["TX","Texas"],["UT","Utah"],["VT","Vermont"],
  ["VA","Virginia"],["WA","Washington"],["WV","West Virginia"],["WI","Wisconsin"],["WY","Wyoming"],
];
const YEAR_OPTIONS=(()=>{
  const cy=new Date().getFullYear();
  const years=[]; for(let y=cy;y>=1900;y--) years.push(String(y));
  return [...years,"Before 1900","Not sure"];
})();
const BEDROOM_OPTIONS=["Studio","1","2","3","4","5","6+"];
const BATHROOM_OPTIONS=["1","1.5","2","2.5","3","3.5","4","4.5","5+"];
const formatLayout=h=>`${h.beds==="Studio"?"Studio":h.beds+" bed"} / ${h.baths} bath`;

// Keyword map for the "Describe the problem" diagnosis flow — simulates what a
// real NLP/AI matching backend would do. Matching is score-based: every keyword
// phrase found in the description adds to that entry's score, so more specific
// descriptions produce higher-confidence, less-generic matches.
const KEYWORD_MAP=[
  {kws:["disposal","garbage disposal","humming","not spinning","jammed disposal","disposal stuck","disposal won't turn"],taskId:52,issue:"Jammed or stuck garbage disposal",conf:"High"},
  {kws:["leak","leaking","drip","dripping","under sink","p-trap","water under","puddle","wet under cabinet","pipe leak","leaky pipe","water stain","dripping pipe"],taskId:19,issue:"Leaking pipe or fitting",conf:"High"},
  {kws:["clogged","clog","won't drain","not draining","backed up","slow drain","drain is slow","water won't go down"],taskId:19,issue:"Clogged or slow drain",conf:"Medium"},
  {kws:["toilet","running toilet","won't flush","toilet won't stop","toilet keeps running","toilet leaking","weak flush","clogged toilet"],taskId:16,issue:"Toilet malfunction",conf:"High"},
  {kws:["faucet","dripping faucet","faucet leaking","faucet loose","low water pressure faucet","faucet handle broken"],taskId:15,issue:"Faucet needs replacing",conf:"High"},
  {kws:["dishwasher","dishwasher not draining","dishwasher leaking","dishwasher won't start","dishwasher installation"],taskId:17,issue:"Dishwasher issue",conf:"High"},
  {kws:["ac ","air conditioning","not cooling","no ac","a/c","ac not working","ac blowing warm","central air"],taskId:53,issue:"AC not cooling properly",conf:"High"},
  {kws:["heater","furnace","not heating","no heat","heat not working","thermostat not working","hvac","cold air blowing"],taskId:53,issue:"Heating system not working",conf:"High"},
  {kws:["outlet","won't turn on","power out","tripping breaker","sparking","flicker","flickering","dead outlet","no power in room","breaker keeps tripping","outlet not working"],taskId:54,issue:"Electrical fault",conf:"High"},
  {kws:["install outlet","new outlet","add an outlet","switch installation"],taskId:22,issue:"New outlet or switch install",conf:"High"},
  {kws:["fan","ceiling fan","fan wobbling","fan noisy","fan not spinning","fan making noise"],taskId:21,issue:"Ceiling fan issue or install",conf:"High"},
  {kws:["light","bulb","fixture","light won't turn on","light fixture broken","flickering light","light socket"],taskId:20,issue:"Light fixture issue",conf:"Medium"},
  {kws:["smart lock","keypad lock","electronic lock","lock won't connect","keyless entry"],taskId:11,issue:"Smart lock install or issue",conf:"High"},
  {kws:["doorbell","ring camera","video doorbell","doorbell camera"],taskId:12,issue:"Doorbell camera install or issue",conf:"High"},
  {kws:["thermostat","nest","smart thermostat","ecobee"],taskId:13,issue:"Smart thermostat install or issue",conf:"High"},
  {kws:["smart bulb","smart lighting","hue lights","app controlled lights"],taskId:14,issue:"Smart lighting install",conf:"High"},
  {kws:["ev charger","car charger","tesla charger","electric vehicle outlet"],taskId:23,issue:"EV charger outlet install",conf:"High"},
  {kws:["tv","mount","television","tv falling","tv bracket","hang my tv","wall mount tv"],taskId:6,issue:"TV needs mounting",conf:"High"},
  {kws:["hang a picture","hang artwork","hang a frame","picture frame","mirror on wall"],taskId:7,issue:"Artwork or mirror needs hanging",conf:"High"},
  {kws:["curtains","blinds","curtain rod","hang curtains"],taskId:8,issue:"Curtains or blinds need installing",conf:"High"},
  {kws:["shelf","shelving","floating shelf","bookshelf install"],taskId:9,issue:"Shelving needs installing",conf:"High"},
  {kws:["door handle","door knob","door hinge","door hardware","sticky door","door won't close","door won't latch"],taskId:10,issue:"Door hardware issue",conf:"Medium"},
  {kws:["furniture","assemble","ikea","desk","build a bed","build furniture","flat pack","build my desk"],taskId:1,issue:"Furniture needs assembly",conf:"High"},
  {kws:["bed frame","assemble bed","build my bed","new bed setup"],taskId:2,issue:"Bed needs assembly",conf:"High"},
  {kws:["home gym","gym equipment","weight rack","exercise equipment assembly"],taskId:3,issue:"Home gym equipment needs assembly",conf:"High"},
  {kws:["sofa","couch","assemble sofa","build my couch"],taskId:4,issue:"Sofa needs assembly",conf:"High"},
  {kws:["paint","wall color","chip","chipped paint","repaint","faded paint","paint my room","need a paint job"],taskId:24,issue:"Wall paint touch-up or repaint",conf:"Medium"},
  {kws:["accent wall","feature wall"],taskId:25,issue:"Accent wall paint",conf:"High"},
  {kws:["paint trim","paint doors","baseboards need paint"],taskId:26,issue:"Trim/door paint touch-up",conf:"High"},
  {kws:["drywall","hole in wall","crack in wall","dent in wall","wall damage"],taskId:44,issue:"Drywall damage",conf:"High"},
  {kws:["tile","tile floor","cracked tile","tile installation"],taskId:27,issue:"Tile flooring work",conf:"High"},
  {kws:["laminate","vinyl floor","new flooring","floor installation"],taskId:28,issue:"Laminate/vinyl flooring work",conf:"High"},
  {kws:["squeaky floor","floor creaks","floor squeaks"],taskId:29,issue:"Squeaky floorboard",conf:"High"},
  {kws:["deep clean","house is a mess","need a cleaning","clean my house","clean my apartment"],taskId:30,issue:"Deep home cleaning",conf:"Medium"},
  {kws:["move out clean","moving out cleaning","end of lease clean"],taskId:31,issue:"Move-out cleaning",conf:"High"},
  {kws:["windows are dirty","clean windows inside","window cleaning inside"],taskId:32,issue:"Interior window cleaning",conf:"High"},
  {kws:["carpet stain","dirty carpet","upholstery stain","carpet cleaning","couch cleaning"],taskId:33,issue:"Carpet or upholstery cleaning",conf:"High"},
  {kws:["lawn","grass","mow","mowing","grass is long","overgrown lawn"],taskId:34,issue:"Lawn needs mowing",conf:"High"},
  {kws:["hedge","bushes","trim bushes","overgrown hedges"],taskId:35,issue:"Hedges need trimming",conf:"High"},
  {kws:["leaves","leaf pile","fall cleanup","raking leaves"],taskId:36,issue:"Leaf removal",conf:"High"},
  {kws:["garden bed","weeds","flower bed","overgrown garden"],taskId:37,issue:"Garden bed cleanup",conf:"High"},
  {kws:["move a couch","move furniture","help me move this","move a heavy item"],taskId:38,issue:"Single item needs moving",conf:"High"},
  {kws:["moving truck","load my truck","help unloading","moving day"],taskId:39,issue:"Moving truck help",conf:"High"},
  {kws:["junk","haul away","old furniture removal","get rid of","junk removal"],taskId:40,issue:"Junk needs hauling away",conf:"High"},
  {kws:["fence","broken fence","fence panel","gate broken"],taskId:42,issue:"Fence damage",conf:"High"},
  {kws:["garage door","garage door won't open","garage door stuck","garage opener broken"],taskId:43,issue:"Garage door malfunction",conf:"High"},
  {kws:["gutter","gutters full","gutters clogged","overflowing gutter"],taskId:46,issue:"Gutters need cleaning",conf:"High"},
  {kws:["pressure wash","driveway dirty","stained patio","power wash"],taskId:47,issue:"Driveway/patio needs pressure washing",conf:"High"},
  {kws:["windows dirty outside","exterior window cleaning","outside windows"],taskId:48,issue:"Exterior window cleaning",conf:"High"},
  {kws:["washer","dryer","washing machine install","laundry machine"],taskId:49,issue:"Washer/dryer installation",conf:"High"},
  {kws:["fridge","refrigerator","new fridge install"],taskId:50,issue:"Refrigerator installation",conf:"High"},
  {kws:["bug","bugs","ant","ants","roach","roaches","pest","spider","spiders","mice","rodent","infestation","termites"],taskId:51,issue:"Pest infestation",conf:"High"},
  {kws:["hvac filter","air filter","furnace filter"],taskId:45,issue:"HVAC filter needs replacing",conf:"High"},
  {kws:["ev outlet"],taskId:23,issue:"EV charger outlet",conf:"High"},
  {kws:["smell","odor","stuck","broken","squeak","noise","weird sound","not sure what's wrong","something's off"],taskId:41,issue:"General issue needing inspection",conf:"Low"},
];

// Score-based match: count how many keyword phrases hit, pick the highest score.
// More overlapping keywords = a more specific description = higher confidence.
function matchDiagnosis(text){
  const t=text.toLowerCase();
  let best=null,bestScore=0;
  for(const entry of KEYWORD_MAP){
    const score=entry.kws.reduce((n,kw)=>n+(t.includes(kw)?1:0),0);
    if(score>bestScore){best=entry;bestScore=score;}
  }
  if(!best) return null;
  const conf = bestScore>=2 ? "High" : best.conf;
  return {...best,conf};
}
const SF=["en_route","arrived","in_progress","complete"];
const SI={
  en_route:   {label:"Pro is on the way",  sub:"is heading to you",     em:"🚗"},
  arrived:    {label:"Pro has arrived",    sub:"is at your door",       em:"📍"},
  in_progress:{label:"Job in Progress",   sub:"is working on your job", em:"🔨"},
  complete:   {label:"Job Complete! 🎉",  sub:"— tap below to review",  em:"⭐"},
};
const STAR_LABELS=["","Terrible","Bad","OK","Good","Excellent!"];
const PRO_REPLIES=["Got it! 👍","On it!","Thanks for the heads up!","Almost there!","Sounds good!","Will do!"];
// Seed/default data — reused both for the initial useState value and by
// "Reset Prototype Data". Cards only ever hold safe prototype display
// fields (brand, last four digits, expiration, default flag) — never a
// full card number, CVV, or any real payment credential.
const DEFAULT_CARDS=[
  {id:1,brand:"Visa",last4:"4242",exp:"08/28",isDefault:true},
  {id:2,brand:"Mastercard",last4:"8821",exp:"02/27",isDefault:false},
];
const DEFAULT_ADDRESSES=[
  {id:1,label:"Home",isPrimary:true,street:"123 Market Street",unit:"Apt 4B",city:"San Francisco",state:"CA",zip:"94103",accessNotes:"",propertyType:"Apartment",yearBuilt:"1998",sqft:"1,150",beds:"2",baths:"1"},
  {id:2,label:"Work",isPrimary:false,street:"500 Folsom Street",unit:"",city:"San Francisco",state:"CA",zip:"94105",accessNotes:"",propertyType:"",yearBuilt:"",sqft:"",beds:"",baths:""},
];

const PersonIcon=({col=AM,sz=22})=>(
  <svg width={sz} height={sz} viewBox="0 0 24 24" fill={col} style={{display:"block"}}>
    <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
  </svg>
);

// Shared avatar component — the single source of truth for how the user's
// own profile photo renders, everywhere it appears (Home header, Profile
// account card, Edit Profile picker). Two layers of circular clipping on
// purpose: the container (fixed size, border-radius:50%, overflow:hidden)
// AND the image itself (also border-radius:50%) — a container clip alone
// can still let square image edges show through in some browsers during a
// transform or mid-load, so the image clips itself too as a second layer.
const Avatar=({photo,size,iconSize,iconColor,bg=AM,onClick,children})=>(
  <div onClick={onClick} style={{width:size,height:size,borderRadius:"50%",overflow:"hidden",background:bg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,position:"relative",cursor:onClick?"pointer":undefined}}>
    {photo?(
      <img src={photo} alt="" style={{width:"100%",height:"100%",objectFit:"cover",objectPosition:"center",display:"block",borderRadius:"50%"}}/>
    ):(
      <PersonIcon col={iconColor} sz={iconSize}/>
    )}
    {children}
  </div>
);

const CSS=`
.sc::-webkit-scrollbar{display:none}
.sc{-ms-overflow-style:none;scrollbar-width:none}
*{box-sizing:border-box}
button,input,textarea{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
/* iOS Safari zooms the viewport on focus when a form control's computed
   font-size is below 16px. Force a mobile-safe minimum everywhere rather
   than special-casing individual fields — this is the standard fix and
   deliberately does NOT touch user-scalable/maximum-scale, which would
   disable the person's own pinch-zoom accessibility instead of fixing the
   underlying cause. */
input,textarea,select{font-size:16px!important;}
@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.93)}}
@keyframes bounce{0%{transform:translateY(0)}100%{transform:translateY(-5px)}}
/* On an actual phone (or installed PWA) the app fills the real screen —
   the centered "phone frame" mockup below is a desktop-preview convenience
   only, and would otherwise float as a small fixed-size box on a real
   device instead of using the real screen. */
@media (max-width:480px){
  .haven-frame-outer{padding:0!important;background:#F5F2ED!important;align-items:stretch!important;}
  .haven-frame-phone{width:100%!important;height:100dvh!important;border-radius:0!important;box-shadow:none!important;}
}
/* Print isolation: hide everything except the receipt itself — no app
   chrome, no bottom nav, no header buttons, no phone-frame styling. */
@media print{
  body *{visibility:hidden!important;}
  .receipt-print-area,.receipt-print-area *{visibility:visible!important;}
  .receipt-print-area{position:absolute!important;top:0!important;left:0!important;width:100%!important;background:#FFFFFF!important;box-shadow:none!important;}
  .no-print{display:none!important;}
}
`;

// v0.13 — registry of every valid scr value. goTo() refuses navigation to
// anything not listed here (console-error, no crash). Adding a new screen
// requires adding its name here AND a render branch in the switch below.
const SCREENS = new Set([
  "home","browse","diagnose","emergency","task","custom","posted","tracking",
  "messages","rating","payment","editProfile","myhome","receiptList","receipt",
  "addressEdit","proProfile","addresses","help","serviceHistory",
  "notifCenter","settings","tip","jobPreferences",
]);
// Screens representing a temporary, single-use flow (the booking lifecycle,
// and one-off editable forms) — these are never eligible for tab-memory
// restoration, unlike stable "destination" screens (Notifications, My Home,
// Saved Addresses, etc.) that a user might reasonably expect restored when
// switching tabs and back. Prevents "zombie" restores into a flow the user
// has already finished or explicitly navigated away from via a fixed
// destination (e.g. Tracking's "← Bookings").
const TRANSIENT_FLOW_SCREENS = new Set([
  "task","custom","posted","tracking","messages","rating","receipt","addressEdit","editProfile","tip",
]);

// v0.13 — Fix 3: catches render errors that would otherwise produce a silent
// blank screen. Only catches render-phase errors (React limitation) — errors
// thrown inside event handlers still go to the console, which is why goTo()
// logs-and-refuses on an unknown screen rather than throwing.
class ErrorBoundary extends React.Component{
  constructor(props){ super(props); this.state={error:null}; }
  static getDerivedStateFromError(error){ return {error}; }
  render(){
    if(this.state.error){
      return (
        <div style={{minHeight:"100vh",background:"#F5F2ED",display:"flex",alignItems:"center",justifyContent:"center",padding:20,fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif"}}>
          <div style={{maxWidth:420,width:"100%",background:"#FFFFFF",borderRadius:20,padding:24,boxShadow:"0 8px 30px rgba(28,43,58,.15)"}}>
            <div style={{fontSize:32,marginBottom:12}}>⚠️</div>
            <div style={{fontWeight:800,fontSize:18,color:"#1C2B3A",marginBottom:8}}>Something went wrong</div>
            <div style={{fontSize:13,color:"#5A6B78",marginBottom:12,lineHeight:1.5}}>{String(this.state.error?.message||this.state.error)}</div>
            {this.state.error?.stack&&(
              <pre style={{fontSize:10,color:"#9AAAB6",background:"#F5F2ED",borderRadius:10,padding:12,marginBottom:16,maxHeight:160,overflow:"auto",whiteSpace:"pre-wrap"}}>{this.state.error.stack}</pre>
            )}
            <button onClick={()=>window.location.reload()} style={{width:"100%",padding:14,borderRadius:14,border:"none",background:"#F59E0B",color:"#fff",fontWeight:800,fontSize:15,cursor:"pointer"}}>Reload</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

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

export default function App(){
  // Appearance — System / Light / Dark. Persisted so it survives reopening
  // the installed PWA. "Tokens, not per-screen styles": every screen in this
  // file already references BG/W/TX/TS/TM/BD/SL by name via closure, so
  // computing them once here (instead of as module-level constants) is
  // enough to theme the entire app — no screen's own JSX needs to change.
  const [themePref,setThemePref]=usePersistedState("haven_theme","system",{
    version:1,
    validate:v=>["system","light","dark"].includes(v)?v:"system",
  });
  const [systemDark,setSystemDark]=useState(()=>{
    try{ return typeof window!=="undefined"&&window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches; }catch{ return false; }
  });
  useEffect(()=>{
    if(typeof window==="undefined"||!window.matchMedia)return;
    const mq=window.matchMedia("(prefers-color-scheme: dark)");
    const onChange=e=>setSystemDark(e.matches);
    try{ mq.addEventListener("change",onChange); return ()=>mq.removeEventListener("change",onChange); }
    catch{ mq.addListener(onChange); return ()=>mq.removeListener(onChange); }
  },[]);
  useEffect(()=>{
    if(typeof window==="undefined")return;
    const end=()=>setStarDragging(false);
    try{ window.addEventListener("pointerup",end); return ()=>window.removeEventListener("pointerup",end); }
    catch{ return undefined; }
  },[]);
  const isDark = themePref==="dark" || (themePref==="system" && systemDark);
  // Theme-dependent surface/text/border tokens. Brand colors (N, AM, SC) stay
  // constant across themes on purpose — they're accent/semantic colors, not
  // surface colors, and a naive full-invert would break the navy hero
  // sections. Receipts are intentionally kept light-only (see receiptScreen).
  const BG = isDark ? "#10161D" : "#F5F2ED";
  const W  = isDark ? "#1B242E" : "#FFFFFF";
  const TX = isDark ? "#F1EFE9" : "#1C2B3A";
  const TS = isDark ? "#9FB0BC" : "#5A6B78";
  const TM = isDark ? "#63727D" : "#9AAAB6";
  const BD = isDark ? "#2A3540" : "#E5DED4";
  const SL = isDark ? "#0F2A20" : "#ECFDF5";
  // The restrained "selected/default" light-blue treatment, reused by the
  // address/card pickers and now the Notification Center's unread state.
  const SELBG = isDark ? "#1E3A5F" : "#EFF6FF";
  const SELBORDER = isDark ? "#3B6EA8" : "#BFDBFE";
  const trustBg=score=>score>=97?SL:score>=90?(isDark?"#3A2E12":"#FEF3C7"):(isDark?"#3A1414":"#FEF2F2");

  const [tid,setTid]       = useState(null);
  const [tpid,setTpid]     = useState(null);
  const [photos,setPhotos] = useState([]);
  const [desc,setDesc]     = useState("");
  const [emergency,setEmergency] = useState(false);
  const [ctitle,setCtitle] = useState("");
  const [ccat,setCcat]     = useState("Repair");
  const [cprice,setCprice] = useState("");
  const VALID_JOB_STATUSES=new Set(["posted","en_route","arrived","in_progress","complete","cancelled"]);
  const [jobs,setJobs] = usePersistedState("haven_jobs",[],{
    version:1,
    validate:v=>{
      if(!Array.isArray(v))return null;
      const seenIds=new Set();
      return v
        .filter(j=>j&&typeof j==="object"&&typeof j.id!=="undefined")
        .filter(j=>{ if(seenIds.has(j.id))return false; seenIds.add(j.id); return true; })
        .map(j=>{
          const full=makeJob(j); // fills in any missing/new fields with safe defaults
          full.id=j.id; // preserve the original stable id — notifications reference jobId by it
          if(!VALID_JOB_STATUSES.has(full.status))full.status="posted";
          return full;
        });
    },
  });
  const [vjid,setVjid]     = useState(null);
  const [scr,setScr]       = useState("home");
  const [tab,setTab]       = useState("home");
  const [cat,setCat]       = useState("All");
  const [q,setQ]           = useState("");
  const [bFilter,setBFilter]= useState("all");
  const [stars,setStars]       = useState(0);
  const [starDragging,setStarDragging] = useState(false);
  const [reviewTxt,setReviewTxt]= useState("");
  const [hireAgain,setHireAgain]= useState(null);
  const [minput,setMinput] = useState("");
  const [typing,setTyping] = useState(false);
  const DEFAULT_NOTIF_PREFS={push:true,jobUpdates:true,messages:true,promos:false,email:true};
  const [notifPrefs,setNotifPrefs] = usePersistedState("haven_notif_prefs",DEFAULT_NOTIF_PREFS,{
    version:1,
    validate:v=>(v&&typeof v==="object"&&!Array.isArray(v))?{...DEFAULT_NOTIF_PREFS,...v}:null,
  });
  // Job Preferences — recurring instructions the customer would otherwise
  // have to retype on every booking (shoe removal, gate codes, pets, etc).
  // Enabled preferences are snapshotted onto each job at posting time (see
  // postJob), which is also the shape a future Pro-app surface would read.
  const DEFAULT_JOB_PREFS=[
    {id:"remove_shoes",label:"Remove shoes before entering",enabled:false,custom:false},
    {id:"text_not_call",label:"Text instead of calling",enabled:false,custom:false},
    {id:"side_gate",label:"Side gate is unlocked",enabled:false,custom:false},
    {id:"knock_not_ring",label:"Knock instead of ringing the doorbell",enabled:false,custom:false},
    {id:"pets_inside",label:"Pets are inside",enabled:false,custom:false},
  ];
  const [jobPrefs,setJobPrefs]=usePersistedState("haven_job_prefs",DEFAULT_JOB_PREFS,{
    version:1,
    validate:v=>{
      if(!Array.isArray(v))return null;
      const seen=new Set();
      return v.filter(p=>p&&typeof p==="object"&&typeof p.id!=="undefined"&&typeof p.label==="string")
        .filter(p=>{ if(seen.has(p.id))return false; seen.add(p.id); return true; })
        .map(p=>({id:p.id,label:p.label,enabled:!!p.enabled,custom:!!p.custom}));
    },
  });
  const toggleJobPref=(id)=>setJobPrefs(ps=>ps.map(p=>p.id===id?{...p,enabled:!p.enabled}:p));
  const addCustomJobPref=(label)=>{
    const trimmed=label.trim();
    if(!trimmed)return;
    setJobPrefs(ps=>[...ps,{id:`custom_${Date.now()}`,label:trimmed,enabled:true,custom:true}]);
  };
  const removeJobPref=(id)=>setJobPrefs(ps=>ps.filter(p=>p.id!==id));
  // Notification Center — persisted locally so read/unread state survives
  // closing and reopening the PWA. Defensive against malformed legacy data:
  // anything that isn't a well-formed array of objects with an id is dropped
  // rather than crashing the app.
  const [notifications,setNotifications]=usePersistedState("haven_notifications",[],{
    version:1,
    validate:v=>Array.isArray(v)?v.filter(n=>n&&typeof n==="object"&&typeof n.id!=="undefined"&&typeof n.createdAt==="number"):null,
  });
  const [lastDeletedNotif,setLastDeletedNotif]=useState(null);
  const [showUndoToast,setShowUndoToast]=useState(false);
  const [showUnavailableToast,setShowUnavailableToast]=useState(false);
  const [showShareFallback,setShowShareFallback]=useState(false);
  const [showCopiedToast,setShowCopiedToast]=useState(false);
  const [openSwipeId,setOpenSwipeId]=useState(null);
  const [openSwipeDir,setOpenSwipeDir]=useState(null); // 'left' | 'right' | null
  const [swipeState,setSwipeState]=useState({id:null,startX:0,startY:0,deltaX:0,deltaY:0,dragging:false,locked:false});
  const unreadCount = notifications.filter(n=>!n.isRead).length;
  // App visibility — backgrounded/hidden Haven must NEVER suppress a
  // notification based on "the last visible screen"; suppression only
  // applies when the app is genuinely visible AND the user is looking at
  // the exact matching context right now.
  const [isAppVisible,setIsAppVisible]=useState(()=>{
    try{ return typeof document==="undefined" || document.visibilityState!=="hidden"; }catch{ return true; }
  });
  useEffect(()=>{
    if(typeof document==="undefined")return;
    const onVis=()=>{
      const nowVisible = document.visibilityState!=="hidden";
      setIsAppVisible(nowVisible);
      if(nowVisible) syncAppBadge(unreadCount); // resume: recalculate/correct any stale badge
    };
    document.addEventListener("visibilitychange",onVis);
    return ()=>document.removeEventListener("visibilitychange",onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  // Notifications are often created from inside a setTimeout scheduled much
  // earlier (a simulated pro reply, a status delay) — a plain closure over
  // scr/vjid/etc. would freeze whatever those were at SCHEDULING time, not
  // when the notification actually fires. This ref is refreshed on every
  // render (see the effect further below, once all its dependencies are
  // declared) so shouldCreateNotification always reads the live, current
  // context regardless of which render's closure is calling it.
  const liveContextRef = useRef({});
  // Centralized active-context check — the ONLY place suppression logic
  // lives. Returns false only when the user is actively viewing the exact
  // relevant screen/job/conversation right now; being elsewhere in Haven
  // (Home, Bookings, a different job) never suppresses.
  const shouldCreateNotification=({type,jobId,conversationId})=>{
    const live=liveContextRef.current;
    if(!live.isAppVisible) return true;
    if(type===NOTIF_TYPES.MESSAGE && live.scr==="messages" && conversationId!=null && live.vjid===conversationId) return false;
    if(type===NOTIF_TYPES.SUPPORT && live.scr==="help" && live.showSupportChat) return false;
    if(type===NOTIF_TYPES.JOB_UPDATE && (live.scr==="tracking"||live.scr==="posted") && jobId!=null && live.vjid===jobId) return false;
    if(type===NOTIF_TYPES.RECEIPT && live.scr==="receipt" && jobId!=null && live.vjid===jobId) return false;
    return true;
  };
  // Installed PWA icon badge — one centralized helper, feature-detected, never
  // throws or blocks the app if unsupported or permission is denied. Direct
  // navigator.setAppBadge/clearAppBadge calls should never appear anywhere
  // else in this file.
  const syncAppBadge=(count)=>{
    try{
      if(typeof navigator==="undefined")return;
      if(count>0){
        if("setAppBadge" in navigator) navigator.setAppBadge(count).catch(()=>{});
      }else{
        if("clearAppBadge" in navigator) navigator.clearAppBadge().catch(()=>{});
      }
    }catch{}
  };
  useEffect(()=>{ syncAppBadge(unreadCount); },[unreadCount]);
  const [showResetConfirm,setShowResetConfirm]=useState(false);
  // Testing utility only — clears every domain this app persists and
  // returns all in-memory state to its clean defaults. Not a real
  // customer-facing "sign out" or data-deletion feature.
  const resetPrototypeData=()=>{
    PERSISTED_KEYS.forEach(k=>{ try{ localStorage.removeItem(k); }catch{} });
    setJobs([]); setVjid(null);
    setAddresses(DEFAULT_ADDRESSES.map(a=>({...a})));
    setCards(DEFAULT_CARDS.map(c=>({...c})));
    setProfile({name:"Jane Doe",bio:"",photo:null,accountCreatedAt:Date.now()});
    setNotifications([]);
    setNotifPrefs({push:true,jobUpdates:true,messages:true,promos:false,email:true});
    setJobPrefs(DEFAULT_JOB_PREFS.map(p=>({...p})));
    setThemePref("system");
    setTid(null);setTpid(null);setCtitle("");setCcat("Repair");setCprice("");setDesc("");setPhotos([]);setEmergency(false);
    setSelectedAddressId(1);setSelectedCardId(1);
    setTabScr({});
    setShowResetConfirm(false);
    syncAppBadge(0);
    goHome();
  };
  // Job updates and messages/support respect their own toggle; cancellation,
  // payment, location, and account notices are never suppressible.
  const notifAllowed=(type)=>{
    if(CRITICAL_NOTIF_TYPES.has(type))return true;
    if(type===NOTIF_TYPES.JOB_UPDATE||type===NOTIF_TYPES.RECEIPT)return notifPrefs.jobUpdates;
    if(type===NOTIF_TYPES.MESSAGE||type===NOTIF_TYPES.SUPPORT)return notifPrefs.messages;
    return true;
  };
  const createNotification=(partial)=>{
    if(!notifAllowed(partial.type))return null;
    if(!shouldCreateNotification({type:partial.type,jobId:partial.jobId,conversationId:partial.conversationId}))return null;
    const n=makeNotification(partial);
    setNotifications(prev=>[n,...prev]);
    return n;
  };
  const JOB_TRANSITION_NOTIFS={
    en_route:proName=>({title:"Pro accepted your job",body:`${proName} accepted the job and is on the way.`}),
    arrived:proName=>({title:"Pro arrived",body:`${proName} has arrived at your property.`}),
    in_progress:proName=>({title:"Work has started",body:`${proName} has started the job.`}),
    complete:()=>({title:"Job completed",body:"Your job is complete — rate your experience or view the receipt."}),
  };
  // Centralized job-transition notification hook — called from proAccepts()
  // and advance() (the same two functions Demo Pro Controls already route
  // through), so a future real Pro app triggers identical notifications
  // without any change here.
  const handleJobTransition=(jobId,newStatus,proName)=>{
    const gen=JOB_TRANSITION_NOTIFS[newStatus];
    if(!gen)return;
    const {title,body}=gen(proName);
    const destination = newStatus==="complete" ? {screen:"rating",jobId} : {screen:"tracking",jobId};
    createNotification({type:NOTIF_TYPES.JOB_UPDATE,title,body,jobId,destination});
  };
  const handleCancellationTransition=(jobId,kind)=>{
    const copy={
      requested:["Cancellation request received","We've received your cancellation request and will follow up shortly."],
      approved:["Cancellation approved","Your cancellation has been approved."],
      denied:["Cancellation needs attention","Haven Support has a question about your cancellation request."],
    }[kind];
    if(!copy)return;
    createNotification({type:NOTIF_TYPES.CANCELLATION,title:copy[0],body:copy[1],jobId,destination:{screen:"tracking",jobId}});
  };
  // Deterministic grouping: while an existing unread MESSAGE notification for
  // the same conversation is still unread, additional incoming messages fold
  // into it (incrementing count and updating the title) instead of creating
  // a new row — avoids "excessive message notifications" per spec.
  const handleIncomingMessage=(jobId,proName)=>{
    if(!notifAllowed(NOTIF_TYPES.MESSAGE))return;
    if(!shouldCreateNotification({type:NOTIF_TYPES.MESSAGE,jobId,conversationId:jobId}))return; // live in an open conversation — seen, not suppressed-then-delayed
    setNotifications(prev=>{
      const idx=prev.findIndex(n=>n.type===NOTIF_TYPES.MESSAGE&&n.jobId===jobId&&!n.isRead);
      if(idx>=0){
        const existing=prev[idx];
        const count=(existing.count||1)+1;
        const updated={...existing,count,title:`${count} new messages from ${proName}`,createdAt:Date.now()};
        const next=prev.slice(); next[idx]=updated;
        return next;
      }
      return [makeNotification({type:NOTIF_TYPES.MESSAGE,title:`New message from ${proName}`,body:"Tap to view the conversation.",jobId,destination:{screen:"messages",jobId}}),...prev];
    });
  };
  const handleIncomingSupportMessage=()=>{
    if(!notifAllowed(NOTIF_TYPES.SUPPORT))return;
    if(!shouldCreateNotification({type:NOTIF_TYPES.SUPPORT}))return; // live in the open support conversation — seen, not suppressed-then-delayed
    setNotifications(prev=>{
      const idx=prev.findIndex(n=>n.type===NOTIF_TYPES.SUPPORT&&!n.isRead);
      if(idx>=0){
        const existing=prev[idx];
        const count=(existing.count||1)+1;
        const updated={...existing,count,title:`${count} new messages from Haven Support`,createdAt:Date.now()};
        const next=prev.slice(); next[idx]=updated;
        return next;
      }
      return [makeNotification({type:NOTIF_TYPES.SUPPORT,title:"New message from Haven Support",body:"Tap to view the conversation.",destination:{screen:"help",supportChat:true}}),...prev];
    });
  };
  const markNotifRead=(id,read=true)=>setNotifications(prev=>prev.map(n=>n.id===id?{...n,isRead:read}:n));
  const markAllNotifsRead=()=>setNotifications(prev=>prev.map(n=>n.isRead?n:{...n,isRead:true}));
  const deleteNotification=(id)=>{
    const n=notifications.find(x=>x.id===id);
    if(!n)return;
    setNotifications(prev=>prev.filter(x=>x.id!==id));
    setLastDeletedNotif(n);
    setShowUndoToast(true);
    setOpenSwipeId(null);setOpenSwipeDir(null);
    setTimeout(()=>setShowUndoToast(false),4000);
  };
  const undoDeleteNotification=()=>{
    if(!lastDeletedNotif)return;
    setNotifications(prev=>[...prev,lastDeletedNotif].sort((a,b)=>b.createdAt-a.createdAt));
    setLastDeletedNotif(null);
    setShowUndoToast(false);
  };
  const openNotification=(n)=>{
    markNotifRead(n.id,true);
    setOpenSwipeId(null);
    const d=n.destination;
    if(!d){ return; }
    const flagUnavailable=()=>{ setShowUnavailableToast(true); setTimeout(()=>setShowUnavailableToast(false),3000); };
    const job = d.jobId!=null ? jobs.find(j=>j.id===d.jobId) : null;
    if(d.jobId!=null && !job){ flagUnavailable(); return; }
    switch(d.screen){
      case "tracking": setVjid(job.id); goTo("tracking"); break;
      case "rating": setVjid(job.id); openRating(); break;
      case "receipt": openReceipt(job.id); break;
      case "messages": setVjid(job.id); goTo("messages"); break;
      case "help": openHelp(); if(d.supportChat) setShowSupportChat(true); break;
      case "payment": goTo("payment"); break;
      case "draftAddress":
        if(hasDraft){ goTo(tid?"task":"custom",navFrom[tid?"task":"custom"]); }
        else{ flagUnavailable(); }
        break;
      default: flagUnavailable();
    }
  };
  const SWIPE_REVEAL=44, SWIPE_COMMIT=120;
  const swipeDown=(id,e)=>{
    setSwipeState({id,startX:e.clientX,startY:e.clientY,deltaX:0,deltaY:0,dragging:true,locked:false});
  };
  const swipeMove=(id,e)=>{
    setSwipeState(s=>{
      if(s.id!==id||!s.dragging)return s;
      const deltaX=e.clientX-s.startX, deltaY=e.clientY-s.startY;
      let locked=s.locked;
      if(!locked){
        if(Math.abs(deltaX)>10&&Math.abs(deltaX)>Math.abs(deltaY)) locked=true;
        else if(Math.abs(deltaY)>10) return {...s,deltaX:0,deltaY,dragging:false}; // vertical scroll — abandon the swipe, never block scrolling
      }
      return {...s,deltaX,deltaY,locked};
    });
  };
  const swipeUp=(id)=>{
    const s=swipeState;
    if(s.id===id&&s.locked){
      const n=notifications.find(x=>x.id===id);
      if(s.deltaX<=-SWIPE_COMMIT){ deleteNotification(id); }
      else if(s.deltaX<=-SWIPE_REVEAL){ setOpenSwipeId(id); setOpenSwipeDir("left"); }
      else if(s.deltaX>=SWIPE_COMMIT){ if(n)markNotifRead(id,!n.isRead); setOpenSwipeId(null); setOpenSwipeDir(null); }
      else if(s.deltaX>=SWIPE_REVEAL){ setOpenSwipeId(id); setOpenSwipeDir("right"); }
      else { setOpenSwipeId(null); setOpenSwipeDir(null); }
    }
    setSwipeState({id:null,startX:0,startY:0,deltaX:0,deltaY:0,dragging:false,locked:false});
  };
  const [catGroup,setCatGroup] = useState(null);   // {cats:[...], label} or null
  const [emergencyFlag,setEmergencyFlag] = useState(false);
  const [diagInput,setDiagInput] = useState("");
  const [diagResult,setDiagResult] = useState(null);
  const [navFrom,setNavFrom] = useState({}); // v0.13 — per-screen origin {scr,tab}, replaces cameFrom/proProfileFrom/receiptFrom/helpFrom
  // Profile
  const DEFAULT_PROFILE={name:"Jane Doe",bio:"",photo:null,accountCreatedAt:Date.now()};
  const [profile,setProfile] = usePersistedState("haven_profile",DEFAULT_PROFILE,{
    version:1,
    validate:v=>{
      if(!v||typeof v!=="object")return null;
      return {
        name:typeof v.name==="string"&&v.name.trim()?v.name:DEFAULT_PROFILE.name,
        bio:typeof v.bio==="string"?v.bio:"",
        photo:typeof v.photo==="string"?v.photo:null,
        // Stable, one-time migration default: existing profiles from before
        // this field existed get a fixed creation timestamp assigned once
        // (now), which then persists — never regenerated on later boots.
        accountCreatedAt:typeof v.accountCreatedAt==="number"?v.accountCreatedAt:Date.now(),
      };
    },
  });
  const [draftName,setDraftName] = useState("");
  const [draftBio,setDraftBio]   = useState("");
  const [draftPhoto,setDraftPhoto]= useState(null);
  // Payment methods
  const [cards,setCards] = usePersistedState("haven_cards",DEFAULT_CARDS,{
    version:1,
    validate:v=>{
      if(!Array.isArray(v))return null;
      const seen=new Set();
      const cleaned=v
        .filter(c=>c&&typeof c==="object"&&typeof c.id!=="undefined")
        .filter(c=>{ if(seen.has(c.id))return false; seen.add(c.id); return true; })
        .map(c=>({
          id:c.id,
          brand:typeof c.brand==="string"?c.brand:"Card",
          last4:typeof c.last4==="string"?c.last4:"----",
          exp:typeof c.exp==="string"?c.exp:"",
          isDefault:!!c.isDefault,
        }));
      if(cleaned.length===0)return cleaned;
      const defaults=cleaned.filter(c=>c.isDefault);
      if(defaults.length>1){
        let kept=false;
        cleaned.forEach(c=>{ if(c.isDefault){ if(kept)c.isDefault=false; else kept=true; } });
      }else if(defaults.length===0){
        cleaned[0].isDefault=true;
      }
      return cleaned;
    },
  });
  const [expandedCard,setExpandedCard]=useState(null);
  const [addingCard,setAddingCard]=useState(false);
  const [newCardNum,setNewCardNum]=useState("");
  const [newCardExp,setNewCardExp]=useState("");
  const [newCardCvv,setNewCardCvv]=useState("");
  const [newCardAddr,setNewCardAddr]=useState("");
  const [newCardCity,setNewCardCity]=useState("");
  const [newCardState,setNewCardState]=useState("");
  const [newCardZip,setNewCardZip]=useState("");
  // Addresses — canonical property/address model. Exactly one entry has
  // isPrimary:true; that entry IS "My Home" (no separate home/draftHome
  // state exists anymore — My Home reads/writes this same array so the two
  // screens can never drift out of sync with each other).
  const [addresses,setAddresses]=usePersistedState("haven_addresses",DEFAULT_ADDRESSES,{
    version:1,
    validate:v=>{
      if(!Array.isArray(v))return null;
      const seen=new Set();
      const cleaned=v
        .filter(a=>a&&typeof a==="object"&&typeof a.id!=="undefined")
        .filter(a=>{ if(seen.has(a.id))return false; seen.add(a.id); return true; })
        .map(a=>({
          id:a.id, label:typeof a.label==="string"&&a.label?a.label:"Address", isPrimary:!!a.isPrimary,
          street:a.street||"", unit:a.unit||"", city:a.city||"", state:a.state||"", zip:a.zip||"",
          accessNotes:a.accessNotes||"", propertyType:a.propertyType||"",
          yearBuilt:a.yearBuilt||"", sqft:a.sqft||"", beds:a.beds||"", baths:a.baths||"",
        }));
      if(cleaned.length===0)return cleaned; // zero properties is valid — booking will require adding one
      const primaries=cleaned.filter(a=>a.isPrimary);
      if(primaries.length>1){
        let kept=false;
        cleaned.forEach(a=>{ if(a.isPrimary){ if(kept)a.isPrimary=false; else kept=true; } });
      }else if(primaries.length===0){
        cleaned[0].isPrimary=true;
      }
      return cleaned;
    },
  });
  const [expandedAddr,setExpandedAddr]=useState(null);
  const [confirmDeleteAddrId,setConfirmDeleteAddrId]=useState(null);
  const [editingAddressId,setEditingAddressId]=useState(null); // null while adding a new address
  const emptyDraftAddress={label:"",street:"",unit:"",city:"",state:"",zip:"",accessNotes:"",propertyType:"",yearBuilt:"",sqft:"",beds:"",baths:""};
  const [draftAddress,setDraftAddress]=useState(emptyDraftAddress);
  const [addressFormError,setAddressFormError]=useState("");
  const [selectedAddressId,setSelectedAddressId]=useState(1); // which address the current booking will use
  // Location awareness — architecture supports every real permission state,
  // even though the current prototype only ever uses "simulated". A future
  // real implementation replaces requestLocation()'s body with
  // navigator.geolocation.getCurrentPosition(...) — no UI code needs to change.
  const [locationPermission,setLocationPermission]=useState("never_requested"); // never_requested|requesting|granted|denied|unavailable|simulated
  const [detectedCity,setDetectedCity]=useState(null); // null = not yet checked this session
  const [locationWarningDismissed,setLocationWarningDismissed]=useState(false);
  const SIMULATED_NEARBY_CITIES={"San Francisco":"Oakland","Oakland":"San Francisco"};
  const requestLocation=()=>{
    setLocationPermission("requesting");
    setTimeout(()=>{
      setLocationPermission("simulated");
      setDetectedCity(selectedAddress?selectedAddress.city:null);
      setLocationWarningDismissed(false);
    },350);
  };
  const simulateDifferentLocation=()=>{
    const currentCity=selectedAddress?.city||"";
    const newCity=SIMULATED_NEARBY_CITIES[currentCity]||"a nearby city";
    setLocationPermission("simulated");
    setDetectedCity(newCity);
    setLocationWarningDismissed(false);
    createNotification({
      type:NOTIF_TYPES.LOCATION,
      title:"Location differs from booked property",
      body:`Your booking is for your ${selectedAddress?.label||"selected"} property, but your phone appears to be in ${newCity}.`,
      destination:{screen:"draftAddress"}, // resolved at tap time against whatever draft is currently active, if any
    });
  };
  const [showAddressPicker,setShowAddressPicker]=useState(false);
  const [showCancelConfirm,setShowCancelConfirm]=useState(false); // pre-accept direct cancel confirmation
  const [showCancelRequest,setShowCancelRequest]=useState(false); // post-accept support-mediated cancel panel
  const [tabScr,setTabScr]=useState({}); // per-tab remembered last screen — {home:..., bookings:..., profile:...}
  const [lastTabTap,setLastTabTap]=useState({tab:null,time:0}); // for double-tap-to-reset detection
  const [showDiscardConfirm,setShowDiscardConfirm]=useState(false); // "Discard draft?" prompt
  const [selectedCardId,setSelectedCardId]=useState(1); // which card the current booking will use
  const [showCardPicker,setShowCardPicker]=useState(false);
  // Help & support
  const [showSupportChat,setShowSupportChat]=useState(false);
  useEffect(()=>{ liveContextRef.current = {scr,tab,vjid,isAppVisible,showSupportChat}; });
  const [supportMsgs,setSupportMsgs]=useState([{id:1,f:"agent",m:"Hi! I'm a support specialist — what can I help with today?",t:"Just now"}]);
  const [supportInput,setSupportInput]=useState("");
  const [supportTyping,setSupportTyping]=useState(false);
  const [openTopicIdx,setOpenTopicIdx]=useState(null);
  // Pro profile
  const [proProfileId,setProProfileId]=useState(null);
  const [proProfileCtx,setProProfileCtx]=useState("view"); // "tracking" | "posted" | "view"
  const msgEnd = useRef(null);
  const scrollPositions = useRef({});
  useEffect(()=>{
    const el = (typeof document!=="undefined") ? document.querySelector(".sc") : null;
    if(!el) return;
    el.scrollTop = scrollPositions.current[scr] ?? 0;
    const onScroll = () => { scrollPositions.current[scr] = el.scrollTop; };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  },[scr]);

  const tp          = ALL_TIME_PREFS.find(t=>t.id===tpid);
  const surge       = tp?.surge||0;
  const browsedTask = TASKS.find(t=>t.id===tid);
  const customTask  = ctitle?{id:null,e:"🔧",n:ctitle,p:parseInt(cprice)||0,t:"Varies",c:ccat}:null;
  const currentTask = browsedTask||customTask;
  const total       = currentTask?currentTask.p+surge+(emergency?EMERGENCY_FEE:0):0;
  // Search-by-symptom now runs through matchRepairIntent() (module-level,
  // see INTENT_LIBRARY above) instead of category-level keywords. Category
  // browsing via the chips below is completely unaffected — it never
  // touches intent matching at all, only a live query does.
  const intentResult = q ? matchRepairIntent(q) : {tier:"none",matches:[],clarification:null};
  const items       = TASKS.filter(t=>{
    const passCat = catGroup ? catGroup.cats.includes(t.c) : (cat==="All"||t.c===cat);
    const passQ   = !q||t.n.toLowerCase().includes(q.toLowerCase());
    return passCat&&passQ;
  });

  const vj    = jobs.find(j=>j.id===vjid);
  const vjTask= vj?(vj.taskId?TASKS.find(t=>t.id===vj.taskId):vj.custom?{e:"🔧",n:vj.custom.title,p:vj.custom.price,t:"Varies"}:null):null;
  const vjTp  = vj?ALL_TIME_PREFS.find(t=>t.id===vj.tpId):null;
  const vjPro = vj?.pro||PROS[0];
  const vjPname=vjPro.n.split(" ")[0];
  const vjTotal=vjTask?vjTask.p+(vj?.surge||0)+(vj?.emergencyFee||0):0;
  const vjSIdx= vj?SF.indexOf(vj.status):-1;
  // Progressively-tightening arrival estimate — deterministic, anchored to
  // real elapsed time since the pro accepted (not random), so it always
  // counts down smoothly and believably rather than jumping around.
  const [etaTick,setEtaTick]=useState(0);
  useEffect(()=>{
    if(scr!=="tracking"||vj?.status!=="en_route")return;
    const interval=setInterval(()=>setEtaTick(t=>t+1),3000);
    return ()=>clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[scr,vj?.status,vj?.id]);
  const getArrivalSim=(job)=>{
    if(!job?.acceptedAt)return null;
    const elapsedSec=(Date.now()-job.acceptedAt)/1000;
    const minutesAway=Math.max(1,Math.round(18-elapsedSec/8));
    const milesAway=Math.max(0.1,Math.round(minutesAway*0.22*10)/10);
    const etaTime=new Date(Date.now()+minutesAway*60000).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
    const fmt=(mins)=>new Date(Date.now()+mins*60000).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
    let stage,windowLabel;
    if(elapsedSec<15){ stage="broad"; windowLabel=`${fmt(Math.max(0,minutesAway-30))} – ${fmt(minutesAway+90)}`; }
    else if(elapsedSec<35){ stage="medium"; windowLabel=`${fmt(Math.max(0,minutesAway-10))} – ${fmt(minutesAway+10)}`; }
    else{ stage="tight"; windowLabel=null; }
    return {minutesAway,milesAway,etaTime,stage,windowLabel};
  };
  const vjArrivalSim=vj?.status==="en_route"?getArrivalSim(vj):null;
  const vjMsgs= vj?.msgs||[];
  const proProfilePro = PROS.find(p=>p.i===proProfileId) || PROS[0];
  const formatAddress=a=>a?`${a.street}${a.unit?", "+a.unit:""}, ${a.city}, ${a.state} ${a.zip}`:"";
  // Expected-duration model — replaces vague "Varies" text and giant
  // best-/worst-case ranges with a single most-likely estimate, only
  // surfacing the inspection caveat when the task is genuinely open-ended
  // (not on every job). Derived from each task's existing rough duration
  // string rather than requiring per-task field additions to the catalog.
  const getExpectedDuration=(t)=>{
    if(!t||t==="Varies")return {estimatedDurationMin:60,estimatedDurationMax:180,durationConfidence:"low",mayRequireInspection:true};
    const m=/^(\d+)\s*(min|hr|hrs|hour|hours)$/i.exec(t.trim());
    if(m){
      const n=parseInt(m[1]);
      const minutes=/hr|hour/i.test(m[2])?n*60:n;
      return {estimatedDurationMin:Math.max(15,Math.round(minutes*0.8)),estimatedDurationMax:Math.round(minutes*1.3),durationConfidence:"high",mayRequireInspection:false};
    }
    return {estimatedDurationMin:30,estimatedDurationMax:120,durationConfidence:"medium",mayRequireInspection:false};
  };
  const formatDurationRange=(minM,maxM)=>{
    const fmt=(mins)=>mins<60?`${mins} min`:(mins%60===0?`${mins/60} hr${mins/60>1?"s":""}`:`${Math.floor(mins/60)}h ${mins%60}m`);
    if(Math.abs(maxM-minM)<15)return fmt(Math.round((minM+maxM)/2));
    return `${fmt(minM)}–${fmt(maxM)}`;
  };
  // A property's icon is determined ONLY by its own label/type — never by
  // whether it's currently Primary. Primary is communicated separately via
  // the badge and highlight, not by swapping the icon.
  const addressIcon=(a)=>{
    const label=(a?.label||"").trim().toLowerCase();
    if(label==="home")return "🏠";
    if(label==="work")return "💼";
    if(label==="rental")return "🔑";
    if(label==="family")return "👨‍👩‍👧";
    return "📍";
  };
  const primaryHome = addresses.find(a=>a.isPrimary) || addresses[0];
  const sortedAddresses = addresses.slice().sort((a,b)=>(b.isPrimary?1:0)-(a.isPrimary?1:0));
  const sortedCards = cards.slice().sort((a,b)=>(b.isDefault?1:0)-(a.isDefault?1:0));
  const selectedAddress = addresses.find(a=>a.id===selectedAddressId) || primaryHome;
  const selectedCard = cards.find(c=>c.id===selectedCardId) || cards.find(c=>c.isDefault) || cards[0];

  const allJobs   = jobs.filter(j=>j.status!=="cancelled").slice().reverse();
  const shownJobs = allJobs.filter(j=>{
    if(bFilter==="active") return j.status!=="complete";
    if(bFilter==="done")   return j.status==="complete";
    return true;
  });
  const activeCount= allJobs.filter(j=>j.status!=="complete").length;
  const doneCount  = allJobs.filter(j=>j.status==="complete").length;
  const hasActive  = activeCount>0;

  useEffect(()=>{
    if(scr==="messages") setTimeout(()=>msgEnd.current?.scrollIntoView({behavior:"smooth"}),60);
  },[vjMsgs,scr,typing]);

  const updateJob  =(id,u)=>setJobs(p=>p.map(j=>j.id===id?{...j,...u}:j));
  const addMsg     =(id,m)=>setJobs(p=>p.map(j=>j.id===id?{...j,msgs:[...j.msgs,m]}:j));
  // v0.13 — the only 3 places setScr may appear: goTo, backFrom, goTab.
  const goTo=(screen,forceOrigin,forTab)=>{
    if(!SCREENS.has(screen)){console.error(`goTo: unknown screen "${screen}" — navigation blocked. Add it to SCREENS first.`);return;}
    setNavFrom(f=>({...f,[screen]:forceOrigin||{scr,tab}})); // origin recorded automatically, unless explicitly preserved
    if(!TRANSIENT_FLOW_SCREENS.has(screen)){
      setTabScr(ts=>({...ts,[forTab!==undefined?forTab:tab]:screen})); // remember this as the (possibly just-switched-to) tab's last screen
    }
    setScr(screen);
  };
  // The single rule for "where does Back from this screen go" — backFrom()
  // uses it to actually navigate; the interactive back gesture uses the
  // exact same computation to know what to render underneath while
  // dragging, and calls backFrom() itself to commit. Never two systems.
  const peekBackDestination=(screen,fallback={scr:"home",tab:"home"})=>{
    const o=navFrom[screen];
    const dest=(o&&SCREENS.has(o.scr))?o:fallback;
    const destTab=dest.scr==="home"?(dest.tab||"home"):tab;
    return {scr:dest.scr,tab:destTab};
  };
  const backFrom=(screen,fallback={scr:"home",tab:"home"})=>{
    const dest=peekBackDestination(screen,fallback);
    setTabScr(ts=>{
      const next={...ts};
      if(dest.scr==="home"||TRANSIENT_FLOW_SCREENS.has(dest.scr)) delete next[dest.tab];
      else next[dest.tab]=dest.scr;
      for(const k of Object.keys(next)) if(TRANSIENT_FLOW_SCREENS.has(next[k])) delete next[k];
      return next;
    });
    setScr(dest.scr);
    if(dest.scr==="home")setTab(dest.tab);
  };
  const goTab      =t=>{
    if(t==="home")setQ("");
    setTabScr(ts=>{
      const next={...ts};
      delete next[t];
      for(const k of Object.keys(next)) if(TRANSIENT_FLOW_SCREENS.has(next[k])) delete next[k];
      return next;
    });
    setScr("home");setTab(t);
  };
  const goHome     =()=>goTab("home");
  const goBookings =()=>goTab("bookings");
  const goProfile  =()=>goTab("profile");
  // Interactive, reversible edge-swipe back gesture — the current screen
  // visually follows the finger with a live parallax reveal of the
  // destination screen underneath; releasing past the completion rule
  // (distance OR velocity) commits via the exact same backFrom() a visible
  // Back button uses; releasing early smoothly cancels back to rest. One
  // state machine and one set of helpers — reduced motion simplifies only
  // the rendering/timing below, it does not duplicate this tracking logic.
  const canGoBack=()=>scr!=="home";
  const prefersReducedMotion=()=>{
    try{ return typeof window!=="undefined"&&window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches; }catch{ return false; }
  };
  const EDGE_ZONE_PX=24;
  const EDGE_COMMIT_PROGRESS=0.35; // commit past ~35% of viewport width
  const EDGE_COMMIT_VELOCITY=0.55; // px/ms — a fast flick commits even if the drag was short
  const IDLE_GESTURE={phase:"idle",startX:0,startY:0,dragX:0,velocityX:0,destScr:null,destTab:null,settleTo:0};
  const [edgeBackGesture,setEdgeBackGesture]=useState(IDLE_GESTURE);
  const edgeGestureMeta=useRef({lastX:0,lastT:0});
  const canStartInteractiveBack=(x,y,target)=>{
    if(!canGoBack())return false;
    if(x>EDGE_ZONE_PX)return false;
    // Never arm over a form control, or anything that declares its own
    // gesture handling (notification swipe rows, the star-rating widget,
    // carousels, image viewers, maps) — checking for an ancestor with
    // data-no-edge-swipe lets any such surface opt out explicitly and
    // centrally, without scattering conditionals here.
    const tag=target?.tagName;
    if(tag==="INPUT"||tag==="TEXTAREA"||tag==="SELECT")return false;
    if(target?.closest?.("[data-no-edge-swipe]"))return false;
    return true;
  };
  const beginInteractiveBack=(x,y)=>{
    const dest=peekBackDestination(scr,{scr:"home",tab:"home"});
    edgeGestureMeta.current={lastX:x,lastT:(typeof performance!=="undefined"?performance.now():Date.now())};
    setEdgeBackGesture({phase:"tracking",startX:x,startY:y,dragX:0,velocityX:0,destScr:dest.scr,destTab:dest.tab,settleTo:0});
  };
  const updateInteractiveBack=(x,y)=>{
    setEdgeBackGesture(g=>{
      if(g.phase==="idle"||g.phase==="settling")return g;
      const dx=x-g.startX, dy=y-g.startY;
      if(g.phase==="tracking"){
        if(Math.abs(dx)>10&&Math.abs(dx)>Math.abs(dy)){
          // Direction-lock just engaged on THIS move — reset the velocity
          // reference point to right now, not gesture start. Otherwise the
          // very next move's velocity is measured against a stale, far-away
          // reference and comes out wildly (and wrongly) inflated.
          const now=(typeof performance!=="undefined"?performance.now():Date.now());
          edgeGestureMeta.current={lastX:x,lastT:now};
          const vw=(typeof window!=="undefined"&&window.innerWidth)?window.innerWidth:390;
          return {...g,phase:"dragging",dragX:Math.max(0,Math.min(vw,dx))};
        }
        if(Math.abs(dy)>10)return IDLE_GESTURE; // predominantly vertical — hand off to normal scrolling entirely
        return g;
      }
      const now=(typeof performance!=="undefined"?performance.now():Date.now());
      const meta=edgeGestureMeta.current;
      const dt=Math.max(1,now-meta.lastT);
      const vx=(x-meta.lastX)/dt;
      edgeGestureMeta.current={lastX:x,lastT:now};
      const vw=(typeof window!=="undefined"&&window.innerWidth)?window.innerWidth:390;
      return {...g,dragX:Math.max(0,Math.min(vw,dx)),velocityX:vx};
    });
  };
  const cancelInteractiveBack=()=>{
    setEdgeBackGesture(g=>(g.phase==="dragging"||g.phase==="tracking")?{...g,phase:"settling",settleTo:0}:IDLE_GESTURE);
  };
  const completeInteractiveBack=()=>{
    setEdgeBackGesture(g=>g.phase==="dragging"?{...g,phase:"settling",settleTo:1}:g);
  };
  // After the settle animation finishes, either commit real navigation
  // (through backFrom — never a second navigation path) or just reset.
  // Reduced motion collapses the settle duration to 0, so this still fires
  // immediately rather than needing a separate code path.
  useEffect(()=>{
    if(edgeBackGesture.phase!=="settling")return;
    const duration=prefersReducedMotion()?0:280;
    const t=setTimeout(()=>{
      if(edgeBackGesture.settleTo===1) backFrom(scr,{scr:"home",tab:"home"});
      setEdgeBackGesture(IDLE_GESTURE);
    },duration);
    return ()=>clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[edgeBackGesture.phase,edgeBackGesture.settleTo]);
  useEffect(()=>{
    if(typeof document==="undefined")return;
    const onDown=(e)=>{
      const x=e.clientX ?? e.touches?.[0]?.clientX;
      const y=e.clientY ?? e.touches?.[0]?.clientY;
      if(x==null||y==null)return;
      if(!canStartInteractiveBack(x,y,e.target))return;
      beginInteractiveBack(x,y);
    };
    const onMove=(e)=>{
      const x=e.clientX ?? e.touches?.[0]?.clientX;
      const y=e.clientY ?? e.touches?.[0]?.clientY;
      if(x==null||y==null)return;
      updateInteractiveBack(x,y);
    };
    const onUp=(e)=>{
      setEdgeBackGesture(g=>{
        if(g.phase!=="dragging")return g.phase==="idle"?g:IDLE_GESTURE;
        const vw=(typeof window!=="undefined"&&window.innerWidth)?window.innerWidth:390;
        const progress=g.dragX/vw;
        const shouldCommit=progress>=EDGE_COMMIT_PROGRESS||g.velocityX>=EDGE_COMMIT_VELOCITY;
        return {...g,phase:"settling",settleTo:shouldCommit?1:0};
      });
    };
    document.addEventListener("pointerdown",onDown);
    document.addEventListener("pointermove",onMove);
    document.addEventListener("pointerup",onUp);
    document.addEventListener("pointercancel",onUp);
    return ()=>{
      document.removeEventListener("pointerdown",onDown);
      document.removeEventListener("pointermove",onMove);
      document.removeEventListener("pointerup",onUp);
      document.removeEventListener("pointercancel",onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[scr]);
  const hasDraft = tid!==null || ctitle.trim()!=="";
  // Draft booking persistence — restored once on mount, saved as one
  // combined snapshot (not scattered keys) whenever the draft's own content
  // changes, and automatically cleared once hasDraft becomes false (posted
  // or discarded). If the restored address/card no longer exists, the
  // existing "no address/card saved" fallback UI already handles it —
  // nothing extra needed here for that case.
  const draftHydratedRef = useRef(false);
  useEffect(()=>{
    if(draftHydratedRef.current)return;
    draftHydratedRef.current=true;
    try{
      const raw=localStorage.getItem("haven_draft");
      if(!raw)return;
      const parsed=JSON.parse(raw);
      const d=(parsed&&typeof parsed==="object"&&"data" in parsed)?parsed.data:parsed;
      if(!d||typeof d!=="object")return;
      if(d.tid!=null)setTid(d.tid);
      if(d.tpid!=null)setTpid(d.tpid);
      if(typeof d.ctitle==="string")setCtitle(d.ctitle);
      if(typeof d.ccat==="string")setCcat(d.ccat);
      if(typeof d.cprice==="string")setCprice(d.cprice);
      if(typeof d.desc==="string")setDesc(d.desc);
      if(Array.isArray(d.photos))setPhotos(d.photos);
      if(typeof d.emergency==="boolean")setEmergency(d.emergency);
      if(d.selectedAddressId!=null)setSelectedAddressId(d.selectedAddressId);
      if(d.selectedCardId!=null)setSelectedCardId(d.selectedCardId);
    }catch{}
  },[]);
  useEffect(()=>{
    if(!draftHydratedRef.current)return; // don't stomp storage with pre-hydration defaults on first render
    try{
      const currentlyDraft = tid!==null || ctitle.trim()!=="";
      if(currentlyDraft){
        localStorage.setItem("haven_draft",JSON.stringify({__v:1,data:{tid,tpid,ctitle,ccat,cprice,desc,photos,emergency,selectedAddressId,selectedCardId}}));
      }else{
        localStorage.removeItem("haven_draft");
      }
    }catch{}
  },[tid,tpid,ctitle,ccat,cprice,desc,photos,emergency,selectedAddressId,selectedCardId]);
  // Bottom-tab-bar tap handler ONLY — every other internal "return to root"
  // call site (goHome/goBookings/goProfile, used as fixed-destination back
  // targets from many screens) still goes through the untouched goTab above,
  // and is NOT affected by memory-restore or double-tap-reset. Per-tab
  // memory is only ever written by goTo() and only ever cleared here by an
  // explicit double-tap — never by ordinary back navigation — matching the
  // "do not automatically reset tabs" rule exactly.
  const tabBarTap=(t)=>{
    const now=Date.now();
    const isDoubleTap = lastTabTap.tab===t && (now-lastTabTap.time)<500;
    setLastTabTap({tab:t,time:now});
    if(isDoubleTap){
      setTabScr(ts=>({...ts,[t]:undefined}));
      goTab(t);
      return;
    }
    if(t==="bookings"&&hasDraft){
      const draftScreen=tid?"task":"custom";
      setTab(t);
      goTo(draftScreen,navFrom[draftScreen],t); // preserve the draft's own original back-origin; record under the tab we're switching TO
      return;
    }
    const remembered=tabScr[t];
    if(remembered&&SCREENS.has(remembered)){
      setTab(t);
      goTo(remembered,navFrom[remembered],t);
    }else{
      goTab(t);
    }
  };
  const scrubDraftFromTabMemory=()=>{
    // "task"/"custom" render nothing meaningful once their underlying data
    // is cleared — if a tab's memory still points at one of them (because
    // the draft was cleared, whether posted or discarded, without ever
    // navigating away first), restoring it later would show a blank screen.
    setTabScr(ts=>{
      const next={...ts};
      for(const k of Object.keys(next)) if(next[k]==="task"||next[k]==="custom") delete next[k];
      return next;
    });
  };
  const discardDraftAndGo=(navFn)=>{
    setTid(null);setTpid(null);setDesc("");setPhotos([]);setCtitle("");setCcat("Repair");setCprice("");setEmergency(false);
    setShowDiscardConfirm(false);
    scrubDraftFromTabMemory();
    navFn();
  };
  const resetBookingSelections=()=>{
    setSelectedAddressId(primaryHome?.id);
    setSelectedCardId((cards.find(c=>c.isDefault)||cards[0])?.id);
    setShowAddressPicker(false);setShowCardPicker(false);
    setLocationPermission("never_requested");setDetectedCity(null);setLocationWarningDismissed(false);
    isPostingRef.current=false; // re-arm the double-submission guard for this fresh draft
  };
  const openTask   =(id)=>{setTid(id);setTpid(2);setDesc("");setEmergency(false);resetBookingSelections();goTo("task");};
  const photoInputRef = useRef(null);
  const isPostingRef = useRef(false); // synchronous guard against rapid-double-tap creating duplicate jobs
  const addPhoto   =()=>{ photoInputRef.current?.click(); };
  const handlePhotoFiles=(e)=>{
    const files=Array.from(e.target.files||[]).slice(0,4-photos.length);
    files.forEach(file=>{
      const reader=new FileReader();
      reader.onload=()=>setPhotos(p=>p.length<4?[...p,reader.result]:p);
      reader.readAsDataURL(file);
    });
    e.target.value=""; // allow re-selecting the same file
  };
  const remPhoto   =i=>setPhotos(p=>p.filter((_,x)=>x!==i));

  // Profile edit
  const profilePhotoInputRef = useRef(null);
  const openEditProfile=()=>{setDraftName(profile.name);setDraftBio(profile.bio);setDraftPhoto(profile.photo);goTo("editProfile");};
  const handleProfilePhoto=(e)=>{
    const file=e.target.files?.[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=()=>setDraftPhoto(reader.result);
    reader.readAsDataURL(file);
    e.target.value="";
  };
  const saveProfile=()=>{setProfile(p=>({...p,name:draftName.trim()||"Jane Doe",bio:draftBio.trim(),photo:draftPhoto}));goProfile();};

  // My Home / Addresses — one canonical model, one edit form for both contexts
  const openMyHome=()=>goTo("myhome");
  const [highlightField,setHighlightField]=useState(null);
  useEffect(()=>{
    if(scr!=="addressEdit"||!highlightField)return;
    const t1=setTimeout(()=>{
      try{
        const el=document.getElementById(`field-${highlightField}`);
        if(el&&el.scrollIntoView)el.scrollIntoView({behavior:"smooth",block:"center"});
      }catch{}
    },80); // let the screen finish mounting before measuring/scrolling
    const t2=setTimeout(()=>setHighlightField(null),2200); // brief highlight, then clear
    return ()=>{ clearTimeout(t1); clearTimeout(t2); };
  },[scr,highlightField]);
  const openAddressForm=(addr,targetField=null)=>{
    setEditingAddressId(addr?addr.id:null);
    setDraftAddress(addr?{...addr}:{...emptyDraftAddress});
    setAddressFormError("");
    setHighlightField(targetField);
    goTo("addressEdit");
  };
  const saveAddressForm=()=>{
    if(!draftAddress.street.trim()||!draftAddress.city.trim()||!draftAddress.state.trim()||!draftAddress.zip.trim()){
      setAddressFormError("Please fill in street, city, state, and ZIP before saving.");
      return;
    }
    if(editingAddressId){
      setAddresses(as=>as.map(a=>a.id===editingAddressId?{...a,...draftAddress,label:draftAddress.label.trim()||a.label}:a));
    }else{
      setAddresses(as=>[...as,{...draftAddress,id:Date.now(),isPrimary:as.length===0,label:draftAddress.label.trim()||"Address"}]);
    }
    backFrom("addressEdit",{scr:"myhome",tab:"home"});
  };
  const openReceipt=(jobId)=>{ setVjid(jobId); goTo("receipt"); };
  const openProProfile=(pro,ctx)=>{setProProfileId(pro.i);setProProfileCtx(ctx);goTo("proProfile");};
  const openHelp=()=>{setShowSupportChat(false);setOpenTopicIdx(null);goTo("help");};

  // Payment methods
  const setCardDefault=id=>{setCards(cs=>cs.map(c=>({...c,isDefault:c.id===id})));setExpandedCard(null);};
  const removeCard=id=>{setCards(cs=>cs.filter(c=>c.id!==id));setExpandedCard(null);};
  const addCard=()=>{
    if(newCardNum.trim().length<4)return;
    const last4=newCardNum.trim().slice(-4);
    // Only brand, last 4, expiry, and default status are ever persisted —
    // CVV and billing address are used for this prototype form only and discarded.
    setCards(cs=>[...cs,{id:Date.now(),brand:"Card",last4,exp:newCardExp.trim()||"—",isDefault:cs.length===0}]);
    setNewCardNum("");setNewCardExp("");setNewCardCvv("");setNewCardAddr("");setNewCardCity("");setNewCardState("");setNewCardZip("");setAddingCard(false);
  };

  // Addresses
  const removeAddr=id=>{
    setAddresses(as=>{
      const target=as.find(a=>a.id===id);
      const remaining=as.filter(a=>a.id!==id);
      if(target?.isPrimary&&remaining.length>0){
        return remaining.map((a,i)=>i===0?{...a,isPrimary:true}:{...a,isPrimary:false});
      }
      return remaining;
    });
    setExpandedAddr(null);
    setConfirmDeleteAddrId(null);
  };
  const setPrimaryAddress=id=>{setAddresses(as=>as.map(a=>({...a,isPrimary:a.id===id})));setExpandedAddr(null);};

  // Support chat
  const sendSupportMsg=()=>{
    if(!supportInput.trim())return;
    const txt=supportInput.trim();
    setSupportMsgs(p=>[...p,{id:Date.now(),f:"me",m:txt,t:new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}]);
    setSupportInput("");setSupportTyping(true);
    setTimeout(()=>{
      setSupportTyping(false);
      setSupportMsgs(p=>[...p,{id:Date.now()+1,f:"agent",m:"Thanks for the details — a specialist will follow up shortly. Anything else I can help with in the meantime?",t:new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}]);
      handleIncomingSupportMessage();
    },1800);
  };

  const openBrowse=(cats=null,label="",emergency=false)=>{
    setCatGroup(cats?{cats,label}:null);
    setCat("All");setEmergencyFlag(emergency);goTo("browse");
  };
  const clearGroup=()=>{setCatGroup(null);setEmergencyFlag(false);};
  const openDiagnose=()=>{setDiagInput("");setDiagResult(null);goTo("diagnose");};
  const runDiagnosis=()=>{
    if(!diagInput.trim())return;
    const hit=matchDiagnosis(diagInput);
    const match=hit?TASKS.find(t=>t.id===hit.taskId):TASKS.find(t=>t.id===41);
    setDiagResult({task:match,issue:hit?hit.issue:"Not sure from the description — a general repair pro can take a look",conf:hit?hit.conf:"Low"});
  };
  const bookDiagnosis=()=>{
    if(!diagResult)return;
    setTid(diagResult.task.id);setTpid(2);setDesc(diagInput);setEmergency(false);resetBookingSelections();goTo("task");
  };

  const postJob=()=>{
    if(!currentTask||!tpid)return;
    if(isPostingRef.current)return; // already posted this draft — a rapid second tap must not create a duplicate job
    isPostingRef.current=true;
    const nj=makeJob({
      taskId:tid,
      custom:tid?null:{title:ctitle,cat:ccat,price:parseInt(cprice)||0},
      tpId:tpid,photos:[...photos],desc,surge,
      emergency,emergencyFee:emergency?EMERGENCY_FEE:0,
      addressText:selectedAddress?formatAddress(selectedAddress):"—",addressLabel:selectedAddress?.label||"",
      paymentBrand:selectedCard?.brand||"Card",paymentLast4:selectedCard?.last4||"----",
      jobPreferences:jobPrefs.filter(p=>p.enabled).map(p=>p.label),
    });
    setJobs(p=>[...p,nj]);setVjid(nj.id);
    setPhotos([]);setDesc("");setTpid(null);setTid(null);setCtitle("");setCcat("Repair");setCprice("");setEmergency(false);
    setShowCancelConfirm(false);setShowCancelRequest(false);
    scrubDraftFromTabMemory();
    goTo("posted");
  };

  const startEmergency=(opt)=>{
    setEmergency(true);setTpid(101);setDesc(opt.desc);setPhotos([]);resetBookingSelections();
    if(opt.taskId){
      setTid(opt.taskId);setCtitle("");setCcat("Repair");setCprice("");goTo("task");
    }else{
      setTid(null);setCtitle(opt.customTitle);setCcat(opt.ccat);setCprice(opt.customPrice);goTo("custom");
    }
  };

  const proAccepts=()=>{
    const p=PROS[Math.floor(Math.random()*PROS.length)];
    updateJob(vjid,{pro:p,status:"en_route",msgs:[],justAccepted:true,acceptedAt:Date.now()});
    handleJobTransition(vjid,"en_route",p.n);
    goTo("tracking");
    setTimeout(()=>updateJob(vjid,{justAccepted:false}),3500);
  };

  const advance=()=>{
    if(!vj)return;
    const i=SF.indexOf(vj.status);
    if(i<SF.length-1){
      const next=SF[i+1];
      updateJob(vjid, next==="complete" ? {status:next,completedAt:Date.now()} : {status:next});
      handleJobTransition(vjid,next,vj.pro?.n||"Your pro");
    }
  };
  const cancelJobDirect=()=>{ updateJob(vjid,{status:"cancelled"}); setShowCancelConfirm(false); goHome(); };
  const requestCancellation=()=>{ updateJob(vjid,{cancelStatus:"requested",cancellationRequestedAt:Date.now()}); setShowCancelRequest(false); handleCancellationTransition(vjid,"requested"); };

  const sendMsg=()=>{
    if(!minput.trim()||vj?.status==="complete")return;
    const txt=minput.trim();
    const forJobId=vjid, proName=vj?.pro?.n||"your pro";
    addMsg(vjid,{id:Date.now(),f:"cu",m:txt,t:new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})});
    setMinput("");setTyping(true);
    setTimeout(()=>{
      setTyping(false);
      addMsg(forJobId,{id:Date.now()+1,f:"pro",m:PRO_REPLIES[Math.floor(Math.random()*PRO_REPLIES.length)],t:new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})});
      handleIncomingMessage(forJobId,proName);
    },2000);
  };

  const openRating=()=>{setStars(0);setReviewTxt("");setHireAgain(null);goTo("rating");};
  const submitRating=()=>{updateJob(vjid,{rated:true,stars,reviewTxt,hireAgain});setStars(0);setReviewTxt("");setHireAgain(null);goHome();};
  // Tipping — fully optional, never blocks rating/receipt/job completion.
  const [tipSelection,setTipSelection]=useState(null); // 5 | 10 | 15 | 20 | 'custom' | null
  const [tipCustomAmount,setTipCustomAmount]=useState("");
  const [tipError,setTipError]=useState("");
  const isTippingRef=useRef(false); // synchronous guard against rapid-double-tap creating two tip charges
  const openTip=()=>{ setTipSelection(null); setTipCustomAmount(""); setTipError(""); isTippingRef.current=false; goTo("tip"); };
  // Single centralized write path for tip data — the only place any screen
  // may modify a job's tip fields. Simulates a brief processing state, then
  // resolves to paid; on failure, the amount is preserved for retry and
  // neither the Receipt nor Pro earnings are touched (both are derived from
  // tipStatus==="paid", so a failed/processing tip simply doesn't count yet).
  const addTipToJob=(jobId,amount,{simulateFailure=false}={})=>{
    if(isTippingRef.current)return;
    isTippingRef.current=true;
    setJobs(js=>js.map(j=>j.id===jobId?{...j,tipStatus:"processing"}:j));
    setTimeout(()=>{
      if(simulateFailure){
        setJobs(js=>js.map(j=>j.id===jobId?{...j,tipStatus:"failed"}:j));
      }else{
        setJobs(js=>js.map(j=>j.id===jobId?{...j,tipAmount:amount,tipStatus:"paid",tippedAt:Date.now()}:j));
      }
      isTippingRef.current=false;
    },900);
  };

  // ── BOTTOM NAV (fixed alignment: every icon in a matched 24x24 box) ────────
  // Single shared bottom-tab-bar renderer — one fixed style definition, no
  // per-screen variants. The active-tab underline and the Bookings badge dot
  // are ALWAYS mounted (never conditionally added/removed from the DOM) —
  // only their color/opacity toggles. This was the actual cause of the bar's
  // height fluctuating: when no tab was "active" (every non-tab-root screen),
  // the underline element used to be omitted entirely, making the bar a few
  // pixels shorter there than on Home/Bookings/Profile. Each button is also
  // now a fixed flex:1 share (not content-sized), so bold-vs-regular label
  // text never changes a button's width either.
  const bottomNav=()=>(
    <div style={{background:W,borderTop:`1px solid ${BD}`,paddingTop:10,paddingBottom:20,display:"flex",flexShrink:0}}>
      {[["home","🏠","Home"],["bookings","📋","Bookings"],["profile",null,"Profile"]].map(([id,ic,lb])=>{
        const a=tab===id;
        const ariaLabel = id==="profile" ? `Profile${unreadCount>0?`, ${unreadCount} unread notification${unreadCount!==1?"s":""}`:""}` : lb;
        return(
          <button key={id} onClick={()=>tabBarTap(id)} aria-label={ariaLabel} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3,background:"none",border:"none",cursor:"pointer",padding:0}}>
            <div style={{width:24,height:24,display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>
              {id==="profile"?<PersonIcon col={AM} sz={22}/>:<span style={{fontSize:21,lineHeight:1}}>{ic}</span>}
              <div style={{position:"absolute",top:-2,right:-2,width:8,height:8,borderRadius:4,background:AM,opacity:(id==="bookings"&&(hasActive||hasDraft))?1:0}}/>
              {id==="profile"&&unreadCount>0&&(
                <div style={{position:"absolute",top:-6,right:-10,minWidth:16,height:16,borderRadius:8,background:"#DC2626",display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px",boxShadow:`0 0 0 1.5px ${W}`}}>
                  <span style={{fontSize:9,fontWeight:800,color:"#FFFFFF",lineHeight:1}}>{unreadCount>9?"9+":unreadCount}</span>
                </div>
              )}
            </div>
            <span style={{fontSize:11,fontWeight:a?700:400,color:a?N:TM}}>{lb}</span>
            <div style={{width:16,height:3,borderRadius:2,background:a?N:"transparent",marginTop:1}}/>
          </button>
        );
      })}
    </div>
  );

  // ── HOME (simplified dashboard) ─────────────────────────────────────────────
  // ── EMERGENCY ──────────────────────────────────────────────────────────────
  const emergencyScreen=()=>(
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div className="sc" style={{flex:1,overflowY:"auto",background:BG}}>
        <div style={{background:N,padding:"14px 20px 32px"}}>
          <button onClick={goHome} style={{background:"rgba(255,255,255,.12)",border:"none",color:W,padding:"8px 16px",borderRadius:12,cursor:"pointer",fontSize:13,fontWeight:600,marginBottom:18,display:"inline-flex",alignItems:"center",gap:6}}>← Back</button>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:40,marginBottom:10}}>🚨</div>
            <div style={{color:W,fontWeight:800,fontSize:20,marginBottom:6}}>What's the emergency?</div>
            <div style={{color:"rgba(255,255,255,.6)",fontSize:13}}>We'll prioritize nearby available pros.</div>
          </div>
        </div>
        <div style={{background:BG,borderRadius:"22px 22px 0 0",marginTop:-18,padding:"20px 20px 16px",position:"relative",zIndex:1}}>
          <div style={{background:"#FFF7ED",border:"1px solid #FDE9CC",borderRadius:14,padding:"12px 14px",marginBottom:16,textAlign:"center"}}>
            <span style={{fontSize:12,color:"#92400E",fontWeight:600}}>Emergency priority fee: +${EMERGENCY_FEE}</span>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {EMERGENCY_OPTIONS.map(opt=>(
              <div key={opt.key} onClick={()=>startEmergency(opt)} style={{background:W,borderRadius:16,padding:"15px 16px",display:"flex",alignItems:"center",gap:14,cursor:"pointer",boxShadow:"0 2px 10px rgba(28,43,58,.06)"}}>
                <div style={{width:42,height:42,borderRadius:21,background:"#FFF1EE",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{opt.e}</div>
                <span style={{flex:1,fontWeight:600,fontSize:14,color:TX}}>{opt.label}</span>
                <span style={{color:TM,fontSize:18}}>›</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  // ── HOME (simplified dashboard) ─────────────────────────────────────────────
  const homeScreen=()=>{
    const popular = TASKS.filter(t=>t.pop);
    return(
    <div className="sc" style={{flex:1,overflowY:"auto",background:BG}}>
      <div style={{background:N,padding:"8px 20px 30px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
          <div>
            <div style={{color:AM,fontSize:11,fontWeight:800,letterSpacing:2.5,marginBottom:6}}>HAVEN</div>
            <div onClick={()=>goTo("addresses")} aria-label={primaryHome?`Current location: ${primaryHome.city}, ${primaryHome.state}. Tap to manage addresses.`:"No address saved. Tap to add one."} style={{color:"rgba(255,255,255,.5)",fontSize:11,marginBottom:2,cursor:"pointer"}}>📍 {primaryHome?`${primaryHome.city}, ${primaryHome.state}`:"Add an address"}</div>
            <div style={{color:W,fontSize:22,fontWeight:800,lineHeight:1.25}}>What do you<br/>need done?</div>
          </div>
          <button onClick={goProfile} aria-label="Profile" style={{width:40,height:40,borderRadius:20,border:"none",background:"none",padding:0,cursor:"pointer",flexShrink:0}}>
            <Avatar photo={profile.photo} size={40} iconSize={22} iconColor={W}/>
          </button>
        </div>
        <div style={{display:"flex",gap:16,marginBottom:16}}>
          {["✓ Fixed pricing","✓ Background checked","✓ Same-day"].map(x=>(<span key={x} style={{color:"rgba(255,255,255,.55)",fontSize:11,whiteSpace:"nowrap",fontWeight:500}}>{x}</span>))}
        </div>
        <div onClick={()=>openBrowse(null,"")} style={{background:W,borderRadius:14,padding:"11px 16px",display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}>
          <span style={{fontSize:16,color:TM}}>🔍</span>
          <input value={q} onChange={e=>setQ(e.target.value)} onFocus={()=>openBrowse(null,"")} placeholder="Search 50+ services..." style={{border:"none",flex:1,fontSize:15,color:TX,background:"transparent",outline:"none"}} readOnly/>
        </div>
      </div>

      <div style={{background:BG,borderRadius:"22px 22px 0 0",marginTop:-18,position:"relative",zIndex:1,padding:"20px 20px 24px"}}>

        {/* Describe the problem */}
        <button onClick={openDiagnose} style={{width:"100%",textAlign:"left",font:"inherit",background:W,border:"none",borderRadius:20,padding:18,marginBottom:12,boxShadow:"0 2px 10px rgba(28,43,58,.07)",cursor:"pointer",display:"flex",gap:14,alignItems:"center"}}>
          <div style={{width:48,height:48,borderRadius:24,background:"#EEF2FF",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,flexShrink:0}}>🔍</div>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,fontSize:15,color:TX}}>What's going on at home?</div>
            <div style={{fontSize:12,color:TS,marginTop:2}}>Describe it — we'll find the right pro and price</div>
          </div>
          <span style={{color:TM,fontSize:20}}>›</span>
        </button>

        {/* Emergency + Custom Job — compact side-by-side pair */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20}}>
          <button onClick={()=>goTo("emergency")} style={{font:"inherit",background:"#FFF1EE",border:"1.5px solid #FFD4C7",borderRadius:16,padding:"16px 12px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",textAlign:"center",minHeight:88}}>
            <div style={{fontSize:22,marginBottom:6}}>🚨</div>
            <div style={{fontWeight:700,fontSize:13,color:"#C2410C"}}>Urgent</div>
            <div style={{fontSize:10,color:"#C2410C",opacity:.75,marginTop:1}}>Fast help</div>
          </button>
          <button onClick={()=>{setTid(null);setTpid(2);setDesc("");setCtitle("");setCcat("Repair");setCprice("");setEmergency(false);resetBookingSelections();goTo("custom");}}
            style={{font:"inherit",background:"#EFF6FF",border:"1.5px solid #BFDBFE",borderRadius:16,padding:"16px 12px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",textAlign:"center",minHeight:88}}>
            <div style={{fontSize:22,marginBottom:6}}>✏️</div>
            <div style={{fontWeight:700,fontSize:13,color:N}}>Not Listed?</div>
            <div style={{fontSize:10,color:TS,marginTop:1}}>Describe it</div>
          </button>
        </div>

        {/* Entry tiles */}
        <div style={{fontWeight:700,fontSize:15,color:TX,marginBottom:12}}>What do you need?</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:22}}>
          {ENTRY_GROUPS.map(g=>(
            <div key={g.key} onClick={()=>openBrowse(g.cats,g.label)} style={{background:W,borderRadius:16,padding:"14px 8px",textAlign:"center",cursor:"pointer",boxShadow:"0 2px 8px rgba(28,43,58,.06)"}}>
              <div style={{fontSize:24,marginBottom:6}}>{g.e}</div>
              <div style={{fontSize:11,fontWeight:600,color:TX,lineHeight:1.3}}>{g.label}</div>
            </div>
          ))}
        </div>

        {/* Popular services rail */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <span style={{fontWeight:700,fontSize:15,color:TX}}>Popular services</span>
          <span onClick={()=>openBrowse(null,"")} style={{fontSize:12,color:AM,fontWeight:700,cursor:"pointer"}}>See all →</span>
        </div>
        <div className="sc" style={{display:"flex",gap:12,overflowX:"auto",marginBottom:4,paddingBottom:4}}>
          {popular.map(t=>(
            <div key={t.id} onClick={()=>openTask(t.id)} style={{background:W,borderRadius:18,padding:"14px 12px",cursor:"pointer",boxShadow:"0 2px 10px rgba(28,43,58,.07)",flexShrink:0,width:120}}>
              <div style={{fontSize:26,marginBottom:8}}>{t.e}</div>
              <div style={{fontWeight:700,fontSize:12,color:TX,marginBottom:6,lineHeight:1.3}}>{t.n}</div>
              <div style={{fontWeight:800,fontSize:16,color:AM}}>${t.p}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );};

  // ── BROWSE (full category grid — reached via search, tiles, or "see all") ──
  const browseScreen=()=>(
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div style={{background:W,padding:"12px 20px 12px",borderBottom:`1px solid ${BD}`,flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
          <button onClick={goHome} style={{background:"none",border:"none",color:N,fontSize:24,cursor:"pointer",padding:0,lineHeight:1,fontWeight:300}}>‹</button>
          <div style={{flex:1,background:BG,borderRadius:12,padding:"9px 14px",display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:14,color:TM}}>🔍</span>
            <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search services..."
              style={{border:"none",flex:1,fontSize:14,color:TX,background:"transparent",outline:"none"}}/>
            {q&&<button onClick={()=>setQ("")} style={{background:"none",border:"none",cursor:"pointer",color:TM,fontSize:13,padding:0}}>✕</button>}
          </div>
        </div>
        {catGroup&&(
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:12,background:N,color:W,padding:"5px 12px",borderRadius:20,fontWeight:600}}>{catGroup.label||"Filtered"}</span>
            <button onClick={clearGroup} style={{background:"none",border:"none",color:TM,fontSize:12,cursor:"pointer",textDecoration:"underline"}}>Clear</button>
          </div>
        )}
      </div>
      {emergencyFlag&&(
        <div style={{background:"#FFF1EE",padding:"10px 20px",flexShrink:0,textAlign:"center"}}>
          <span style={{fontSize:12,color:"#C2410C",fontWeight:600}}>🚨 Showing pros who can respond fastest for urgent jobs</span>
        </div>
      )}
      <div className="sc" style={{flex:1,overflowY:"auto",background:BG}}>
        <div className="sc" style={{overflowX:"auto",padding:"16px 20px 12px",display:"flex",gap:8}}>
          {CATS.map(c=>{
            const a=!catGroup&&cat===c;
            return <button key={c} onClick={()=>{setCatGroup(null);setCat(c);}} style={{border:"none",borderRadius:20,padding:"8px 16px",fontSize:12,cursor:"pointer",whiteSpace:"nowrap",fontWeight:a?700:500,flexShrink:0,background:a?AM:W,color:a?W:TS,boxShadow:a?`0 2px 8px rgba(245,158,11,.35)`:`0 1px 3px rgba(0,0,0,.07)`}}>{c}</button>;
          })}
        </div>
        <div style={{padding:"4px 20px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontWeight:700,fontSize:15,color:TX}}>{q?`"${q}"`:catGroup?catGroup.label:cat==="All"?"All services":cat}</span>
          {!q&&<span style={{fontSize:12,color:TM}}>{items.length} services</span>}
        </div>
        {q?(
          intentResult.tier==="high"?(()=>{
            const top=intentResult.matches[0];
            const task=TASKS.find(t=>t.id===top.taskId);
            return (
              <div style={{padding:"0 20px 24px"}}>
                <div style={{fontSize:11,fontWeight:700,color:TS,letterSpacing:.4,textTransform:"uppercase",marginBottom:10}}>Recommended for you</div>
                {task&&(
                  <div onClick={()=>openTask(task.id)} style={{background:W,borderRadius:20,padding:18,cursor:"pointer",boxShadow:"0 4px 16px rgba(28,43,58,.1)",border:`2px solid ${AM}`,marginBottom:14,display:"flex",alignItems:"center",gap:14}}>
                    <div style={{fontSize:38,lineHeight:1,flexShrink:0}}>{task.e}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:800,fontSize:16,color:TX,marginBottom:2}}>{task.n}</div>
                      <div style={{fontSize:12,color:TS}}>Matched to "{top.label}"</div>
                    </div>
                    <div style={{fontWeight:800,fontSize:19,color:AM,flexShrink:0}}>${task.p}</div>
                  </div>
                )}
                <button onClick={()=>{setTid(null);setTpid(2);setDesc(q);setCtitle("");setCcat("Repair");setCprice("");setEmergency(false);resetBookingSelections();goTo("custom");}} style={{background:"none",border:"none",color:TM,fontSize:12,cursor:"pointer",textDecoration:"underline",padding:0}}>Not what you meant? Post a custom job instead</button>
              </div>
            );
          })():intentResult.tier==="medium"?(
            <div style={{padding:"0 20px 24px"}}>
              <div style={{fontSize:11,fontWeight:700,color:TS,letterSpacing:.4,textTransform:"uppercase",marginBottom:10}}>A few likely matches</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                {intentResult.matches.map(m=>{
                  const task=TASKS.find(t=>t.id===m.taskId);
                  if(!task)return null;
                  return (
                    <div key={m.intentId} onClick={()=>openTask(task.id)} style={{background:W,borderRadius:18,padding:"16px 14px 14px",cursor:"pointer",position:"relative",boxShadow:"0 2px 10px rgba(28,43,58,.07)"}}>
                      <div style={{fontSize:32,marginBottom:10,lineHeight:1}}>{task.e}</div>
                      <div style={{fontWeight:700,fontSize:13,color:TX,marginBottom:6,lineHeight:1.3}}>{task.n}</div>
                      <div style={{fontWeight:800,fontSize:20,color:AM}}>${task.p}</div>
                    </div>
                  );
                })}
                <div onClick={()=>{setTid(null);setTpid(2);setDesc(q);setCtitle("");setCcat("Repair");setCprice("");setEmergency(false);resetBookingSelections();goTo("custom");}}
                  style={{background:N,borderRadius:18,padding:"16px 14px 14px",cursor:"pointer",display:"flex",flexDirection:"column",justifyContent:"center",alignItems:"center",textAlign:"center",minHeight:120}}>
                  <div style={{fontSize:28,marginBottom:8}}>✏️</div>
                  <div style={{fontWeight:700,fontSize:13,color:W,lineHeight:1.3,marginBottom:4}}>Post a custom job</div>
                  <div style={{fontSize:11,color:"rgba(255,255,255,.55)"}}>Don't see what you need?</div>
                </div>
              </div>
            </div>
          ):intentResult.clarification?(
            <div style={{padding:"0 20px 24px"}}>
              <div style={{background:W,borderRadius:20,padding:20,boxShadow:"0 2px 10px rgba(28,43,58,.07)"}}>
                <div style={{fontWeight:700,fontSize:15,color:TX,marginBottom:14}}>{intentResult.clarification.question}</div>
                {intentResult.clarification.options.map(opt=>(
                  <button key={opt.label} onClick={()=>{
                    if(opt.intentId){
                      const intent=INTENT_LIBRARY.find(i=>i.id===opt.intentId);
                      const task=intent&&TASKS.find(t=>t.id===intent.taskId);
                      if(task){ openTask(task.id); return; }
                    }
                    setTid(null);setTpid(2);setDesc(q);setCtitle("");setCcat("Repair");setCprice("");setEmergency(false);resetBookingSelections();goTo("custom");
                  }} style={{width:"100%",textAlign:"left",padding:"13px 16px",borderRadius:12,border:`1px solid ${BD}`,background:BG,color:TX,fontWeight:600,fontSize:14,cursor:"pointer",marginBottom:8}}>{opt.label}</button>
                ))}
              </div>
            </div>
          ):(
            <div style={{textAlign:"center",padding:"40px 20px"}}>
              <div style={{fontSize:48,marginBottom:12}}>🔍</div>
              <div style={{fontWeight:700,fontSize:15,color:TX,marginBottom:4}}>No exact matches for "{q}"</div>
              <div style={{fontSize:13,color:TS,lineHeight:1.5,marginBottom:20,maxWidth:260,marginLeft:"auto",marginRight:"auto"}}>Describe what's going on and we'll match you with the right pro.</div>
              <button onClick={()=>{setTid(null);setTpid(2);setDesc(q);setCtitle("");setCcat("Repair");setCprice("");setEmergency(false);resetBookingSelections();goTo("custom");}} style={{background:AM,border:"none",color:W,padding:"12px 22px",borderRadius:14,fontWeight:700,cursor:"pointer",fontSize:14,marginBottom:10,display:"block",width:"100%"}}>Post a custom job</button>
              <button onClick={()=>{setQ("");clearGroup();setCat("All");}} style={{background:"none",border:"none",color:TS,fontWeight:600,cursor:"pointer",fontSize:13,textDecoration:"underline"}}>Clear filters</button>
            </div>
          )
        ):items.length>0?(
          <div style={{padding:"0 20px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,paddingBottom:24}}>
            {items.map(t=>(
              <div key={t.id} onClick={()=>openTask(t.id)} style={{background:W,borderRadius:18,padding:"16px 14px 14px",cursor:"pointer",position:"relative",boxShadow:"0 2px 10px rgba(28,43,58,.07)"}}>
                {t.pop&&<span style={{position:"absolute",top:10,right:10,background:"#FEF3C7",color:"#D97706",fontSize:9,fontWeight:800,padding:"2px 7px",borderRadius:10}}>POPULAR</span>}
                <div style={{fontSize:32,marginBottom:10,lineHeight:1}}>{t.e}</div>
                <div style={{fontWeight:700,fontSize:13,color:TX,marginBottom:6,lineHeight:1.3}}>{t.n}</div>
                <div style={{fontWeight:800,fontSize:20,color:AM}}>${t.p}</div>
                <div style={{fontSize:11,color:TM,marginTop:1}}>est. {formatDurationRange(getExpectedDuration(t.t).estimatedDurationMin,getExpectedDuration(t.t).estimatedDurationMax)}</div>
              </div>
            ))}
            <div onClick={()=>{setTid(null);setTpid(2);setDesc("");setCtitle("");setCcat("Repair");setCprice("");setEmergency(false);resetBookingSelections();goTo("custom");}}
              style={{background:N,borderRadius:18,padding:"16px 14px 14px",cursor:"pointer",display:"flex",flexDirection:"column",justifyContent:"center",alignItems:"center",textAlign:"center",minHeight:120}}>
              <div style={{fontSize:28,marginBottom:8}}>✏️</div>
              <div style={{fontWeight:700,fontSize:13,color:W,lineHeight:1.3,marginBottom:4}}>Post a custom job</div>
              <div style={{fontSize:11,color:"rgba(255,255,255,.55)"}}>Don't see what you need?</div>
            </div>
          </div>
        ):(
          <div style={{textAlign:"center",padding:"40px 20px"}}>
            <div style={{fontSize:48,marginBottom:12}}>🔍</div>
            <div style={{fontWeight:700,fontSize:15,color:TX,marginBottom:4}}>No services found</div>
            <button onClick={()=>{setQ("");clearGroup();setCat("All");}} style={{background:AM,border:"none",color:W,padding:"10px 20px",borderRadius:12,fontWeight:600,cursor:"pointer",fontSize:14}}>Clear filters</button>
          </div>
        )}
      </div>
    </div>
  );

  // ── DIAGNOSE ("Describe the problem" flow) ──────────────────────────────────
  const diagnoseScreen=()=>(
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div className="sc" style={{flex:1,overflowY:"auto",background:BG}}>
        <div style={{background:N,padding:"14px 20px 34px"}}>
          <button onClick={goHome} style={{background:"rgba(255,255,255,.12)",border:"none",color:W,padding:"8px 16px",borderRadius:12,cursor:"pointer",fontSize:13,fontWeight:600,marginBottom:18,display:"inline-flex",alignItems:"center",gap:6}}>← Back</button>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:44,marginBottom:10}}>🔍</div>
            <div style={{color:W,fontWeight:800,fontSize:20,marginBottom:6}}>What's going on at home?</div>
            <div style={{color:"rgba(255,255,255,.6)",fontSize:13}}>Describe it in your own words</div>
          </div>
        </div>
        <div style={{background:BG,borderRadius:"22px 22px 0 0",marginTop:-18,padding:"20px 20px 16px",position:"relative",zIndex:1}}>
          <div style={{background:W,borderRadius:18,padding:18,marginBottom:14,boxShadow:"0 2px 10px rgba(28,43,58,.07)"}}>
            <textarea value={diagInput} onChange={e=>{setDiagInput(e.target.value);setDiagResult(null);}} maxLength={300}
              placeholder={`e.g. "My garbage disposal is humming but not spinning" or "There's a small leak under my kitchen sink"`}
              style={{width:"100%",minHeight:90,border:"none",resize:"none",background:"transparent",color:TX,fontSize:14,lineHeight:1.55,outline:"none",padding:0}}/>
            <div style={{fontSize:11,color:TM,textAlign:"right",marginTop:6,paddingTop:6,borderTop:`1px solid ${BD}`}}>{diagInput.length}/300</div>
          </div>
          {!diagResult&&(
            <button onClick={runDiagnosis} disabled={!diagInput.trim()} style={{width:"100%",padding:16,borderRadius:16,border:"none",background:diagInput.trim()?N:"#DDD9D2",color:W,fontWeight:700,fontSize:15,cursor:diagInput.trim()?"pointer":"default",marginBottom:8}}>
            Find a solution →</button>
          )}

          {diagResult&&(
            <div style={{background:W,borderRadius:20,padding:20,boxShadow:"0 2px 10px rgba(28,43,58,.07)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <span style={{fontSize:11,fontWeight:700,color:TM,letterSpacing:.6,textTransform:"uppercase"}}>Diagnosis</span>
                <span style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:10,
                  background:diagResult.conf==="High"?SL:diagResult.conf==="Medium"?"#FEF3C7":"#F1F5F9",
                  color:diagResult.conf==="High"?SC:diagResult.conf==="Medium"?"#D97706":TS}}>{diagResult.conf} confidence</span>
              </div>
              <div style={{fontWeight:700,fontSize:15,color:TX,marginBottom:14}}>Likely issue: {diagResult.issue}</div>
              <div style={{background:BG,borderRadius:16,padding:14,display:"flex",gap:12,alignItems:"center",marginBottom:16}}>
                <div style={{fontSize:28}}>{diagResult.task.e}</div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:14,color:TX}}>{diagResult.task.n}</div>
                  <div style={{fontSize:12,color:TS,marginTop:1}}>est. {formatDurationRange(getExpectedDuration(diagResult.task.t).estimatedDurationMin,getExpectedDuration(diagResult.task.t).estimatedDurationMax)}</div>
                </div>
                <div style={{fontWeight:800,fontSize:18,color:AM}}>${diagResult.task.p}</div>
              </div>
              <button onClick={bookDiagnosis} style={{width:"100%",padding:16,borderRadius:16,border:"none",background:AM,color:W,fontWeight:800,fontSize:15,cursor:"pointer",boxShadow:`0 6px 20px rgba(245,158,11,.3)`,marginBottom:10}}>Book this repair →</button>
              <button onClick={()=>{setDiagInput("");setDiagResult(null);}} style={{width:"100%",padding:12,borderRadius:16,border:"none",background:"none",color:TS,fontWeight:600,fontSize:13,cursor:"pointer"}}>Try a different description</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // ── BOOKINGS ───────────────────────────────────────────────────────────────
  const bookingsScreen=()=>{
    if(allJobs.length===0) return(
      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:28,textAlign:"center",background:BG}}>
        <div style={{fontSize:52,marginBottom:16}}>📋</div>
        <div style={{fontWeight:800,fontSize:20,color:TX,marginBottom:8}}>No bookings yet</div>
        <div style={{color:TS,fontSize:14,lineHeight:1.6,marginBottom:24}}>Post a job and a pro will accept it. You'll track everything here.</div>
        <button onClick={()=>goTab("home")} style={{background:N,color:W,border:"none",padding:"14px 30px",borderRadius:16,fontWeight:700,fontSize:15,cursor:"pointer"}}>Browse services</button>
      </div>
    );
    return(
      <div className="sc" style={{flex:1,overflowY:"auto",background:BG,padding:"20px 20px 100px"}}>
        <div style={{fontWeight:800,fontSize:22,color:TX,marginBottom:16}}>Bookings</div>
        <div style={{display:"flex",gap:8,marginBottom:18}}>
          {[["all",`All (${allJobs.length})`],["active",`Active (${activeCount})`],["done",`Done (${doneCount})`]].map(([id,lb])=>{
            const a=bFilter===id;
            return <button key={id} onClick={()=>setBFilter(id)} style={{flex:1,padding:"9px 0",borderRadius:12,border:"none",fontWeight:a?700:500,background:a?N:W,color:a?W:TS,fontSize:13,cursor:"pointer",boxShadow:a?`0 2px 8px rgba(28,43,58,.18)`:`0 1px 3px rgba(0,0,0,.06)`}}>{lb}</button>;
          })}
        </div>
        {shownJobs.length===0?(
          <div style={{textAlign:"center",padding:"40px 20px"}}>
            <div style={{fontSize:40,marginBottom:12}}>{bFilter==="active"?"⏳":bFilter==="done"?"✅":"📋"}</div>
            <div style={{fontWeight:700,fontSize:15,color:TX,marginBottom:6}}>{bFilter==="active"?"No active jobs":bFilter==="done"?"No completed jobs yet":"No bookings yet"}</div>
            <div style={{fontSize:13,color:TS,lineHeight:1.5,maxWidth:240,margin:"0 auto"}}>{bFilter==="active"?"Jobs you book will appear here while they're in progress.":bFilter==="done"?"Finished jobs will show up here once they're done.":"Book a service from Home and it'll show up here."}</div>
          </div>
        ):shownJobs.map(j=>{
          const jt=j.taskId?TASKS.find(t=>t.id===j.taskId):j.custom?{e:"🔧",n:j.custom.title,p:j.custom.price}:null;
          const jtp=ALL_TIME_PREFS.find(t=>t.id===j.tpId);
          const jTotal=jt?jt.p+j.surge+(j.emergencyFee||0):0;
          const isPending=j.status==="posted";const isDone=j.status==="complete";
          const isCancelPending=j.cancelStatus==="requested"&&!isDone;
          const statusLabel=isCancelPending?"Pending Cancellation":isPending?"Waiting for pro":isDone?"Completed":SI[j.status]?.label||"Active";
          const statusColor=isCancelPending?"#DC2626":isPending?AM:isDone?SC:N;
          const statusBg=isCancelPending?"#FEF2F2":isPending?"#FEF3C7":isDone?SL:"#EEF2FF";
          return(
            <div key={j.id} onClick={()=>{setVjid(j.id);setShowCancelConfirm(false);setShowCancelRequest(false);goTo(isPending?"posted":"tracking");}} style={{background:W,borderRadius:20,padding:18,boxShadow:"0 2px 10px rgba(28,43,58,.07)",marginBottom:12,cursor:"pointer"}}>
              <div style={{display:"flex",gap:14,alignItems:"center",marginBottom:12}}>
                <div style={{width:50,height:50,borderRadius:25,background:"#FEF3C7",display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,flexShrink:0}}>{jt?.e||"🔧"}</div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:15,color:TX}}>{jt?.n||"Custom job"}</div>
                  <div style={{fontSize:13,color:TS,marginTop:2}}>{jtp?jtp.label:"—"} · ${jTotal}</div>
                  {j.desc&&<div style={{fontSize:12,color:TM,marginTop:3,lineHeight:1.4,fontStyle:"italic"}}>"{j.desc.slice(0,55)}{j.desc.length>55?"…":""}"</div>}
                </div>
                <span style={{color:TM,fontSize:20,flexShrink:0}}>›</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:6}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:12,fontWeight:700,color:statusColor,background:statusBg,padding:"5px 12px",borderRadius:20}}>{statusLabel}</span>
                  {j.emergency&&<span style={{fontSize:11,fontWeight:700,color:"#C2410C",background:"#FFF1EE",padding:"4px 10px",borderRadius:20}}>🚨 Emergency</span>}
                </div>
                {!isPending&&j.pro&&<span style={{fontSize:12,color:TS}}>Pro: {j.pro.n}</span>}
                {isDone&&!j.rated&&<span style={{fontSize:12,color:AM,fontWeight:700}}>⭐ Rate now</span>}
                {isDone&&j.rated&&<span style={{fontSize:12,color:SC,fontWeight:600,display:"inline-flex",alignItems:"center",gap:4}}>{starDisplay(j.stars,11)} Reviewed</span>}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // ── PROFILE (main + sub-screens) ────────────────────────────────────────────
  const profileScreen=()=>(
    <div className="sc" style={{flex:1,overflowY:"auto",padding:"20px 20px 100px",background:BG}}>
      <div style={{fontWeight:800,fontSize:22,color:TX,marginBottom:20}}>Profile</div>
      <button onClick={openEditProfile} style={{width:"100%",textAlign:"left",font:"inherit",background:N,border:"none",borderRadius:20,padding:20,marginBottom:16,display:"flex",gap:14,alignItems:"center",cursor:"pointer"}}>
        <Avatar photo={profile.photo} size={52} iconSize={30} iconColor={W}/>
        <div style={{flex:1}}>
          <div style={{fontWeight:700,fontSize:16,color:W}}>{profile.name}</div>
          <div style={{color:"rgba(255,255,255,.55)",fontSize:13,marginTop:2}}>{profile.bio||`Member since ${new Date(profile.accountCreatedAt).getFullYear()}`}</div>
        </div>
        <span style={{color:"rgba(255,255,255,.6)",fontSize:12,fontWeight:600}}>Edit ›</span>
      </button>

      {/* My Home — large featured card */}
      <button onClick={openMyHome} style={{width:"100%",textAlign:"left",font:"inherit",background:"linear-gradient(135deg,#FEF3C7,#FDE68A)",border:"none",borderRadius:20,padding:18,marginBottom:16,display:"flex",gap:14,alignItems:"center",cursor:"pointer",boxShadow:"0 2px 10px rgba(28,43,58,.07)"}}>
        <div style={{width:48,height:48,borderRadius:24,background:"rgba(255,255,255,.55)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,flexShrink:0}}>🏡</div>
        <div style={{flex:1}}>
          <div style={{fontWeight:700,fontSize:15,color:"#92400E"}}>My Home</div>
          <div style={{fontSize:12,color:"#92400E",opacity:.8,marginTop:2}}>Service history, maintenance & more</div>
        </div>
        <span style={{color:"#92400E",fontSize:18}}>›</span>
      </button>

      {/* Notifications — large featured card, same weight as My Home, distinct notification-blue treatment */}
      <button onClick={()=>goTo("notifCenter")} aria-label={unreadCount>0?`Notifications, ${unreadCount>9?"9+":unreadCount} unread`:"Notifications"} style={{width:"100%",textAlign:"left",font:"inherit",background:`linear-gradient(135deg,${SELBG},${SELBORDER}33)`,border:`1px solid ${SELBORDER}`,borderRadius:20,padding:18,marginBottom:16,display:"flex",gap:14,alignItems:"center",cursor:"pointer",boxShadow:"0 2px 10px rgba(28,43,58,.07)"}}>
        <div style={{width:48,height:48,borderRadius:24,background:"rgba(255,255,255,.55)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,flexShrink:0}}>🔔</div>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontWeight:700,fontSize:15,color:N}}>Notifications</span>
            {unreadCount>0&&<span style={{fontSize:11,fontWeight:800,color:W,background:"#DC2626",padding:"1px 7px",borderRadius:10,minWidth:18,textAlign:"center"}}>{unreadCount>9?"9+":unreadCount}</span>}
          </div>
          <div style={{fontSize:12,color:N,opacity:.75,marginTop:2}}>Job updates, messages & account alerts</div>
        </div>
        <span style={{color:N,fontSize:18}}>›</span>
      </button>

      <div style={{background:W,borderRadius:20,overflow:"hidden",boxShadow:"0 2px 10px rgba(28,43,58,.07)"}}>
        {[
          ["Payment Methods",()=>goTo("payment"),false,null],
          ["Saved Addresses",()=>goTo("addresses"),false,null],
          ["Settings",()=>goTo("settings"),false,null],
          ["Help & Support",()=>openHelp(),false,null],
        ].map(([item,fn,disabledItem,badge],i,arr)=>(
          <div key={item} onClick={disabledItem?undefined:fn} aria-label={badge?`${item}, ${badge} unread`:item} style={{padding:"16px 20px",borderBottom:`1px solid ${BD}`,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:disabledItem?"default":"pointer"}}>
            <span style={{fontWeight:500,fontSize:15,color:disabledItem?TM:TX}}>{item}</span>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              {badge&&<span style={{fontSize:11,fontWeight:800,color:W,background:"#DC2626",padding:"1px 7px",borderRadius:10,minWidth:18,textAlign:"center"}}>{badge}</span>}
              {!disabledItem&&<span style={{color:TM,fontSize:18}}>›</span>}
            </div>
          </div>
        ))}
        <div onClick={()=>{}} style={{padding:"16px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"default"}}>
          <span style={{fontWeight:500,fontSize:15,color:TM}}>Sign Out</span>
        </div>
      </div>
      <div style={{textAlign:"center",marginTop:28}}>
        <div style={{fontSize:13,fontWeight:800,color:TM,letterSpacing:2.5}}>HAVEN</div>
        <div style={{fontSize:11,color:TM,marginTop:4}}>Prototype build · v0.1</div>
      </div>
    </div>
  );

  const subHeader=(title,onBack=goProfile)=>(
    <div style={{background:W,padding:"14px 20px 16px",borderBottom:`1px solid ${BD}`,flexShrink:0,display:"flex",alignItems:"center",gap:14}}>
      <button onClick={onBack} style={{background:"none",border:"none",color:N,fontSize:24,cursor:"pointer",padding:0,lineHeight:1,fontWeight:300}}>‹</button>
      <span style={{fontWeight:700,fontSize:17,color:TX}}>{title}</span>
    </div>
  );
  // Shared "referenced job no longer exists" fallback — used anywhere a
  // screen depends on vjid resolving to a real job. Currently unreachable in
  // practice (jobs are never removed from the jobs array), but a cheap
  // defensive guard against a real dead-end (a blank screen with no way
  // back) if that assumption ever stops holding.
  const unavailableScreen=(title,onBack)=>(
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",background:BG}}>
      {subHeader(title,onBack)}
      <div className="sc" style={{flex:1,overflowY:"auto",padding:20,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",textAlign:"center"}}>
        <div style={{fontSize:32,marginBottom:12}}>🔍</div>
        <div style={{fontSize:13,color:TS}}>This item is no longer available.</div>
      </div>
    </div>
  );

  // Demo Pro Controls — a customer never sees this in a real deployment.
  // Clearly separated (dashed border, distinct background, explicit label)
  // from normal customer UI so it can never be mistaken for a real control.
  // Every button here routes through the same centralized helpers (proAccepts,
  // advance) a future real Pro app would call — no separate transition logic.
  const demoProControlsPanel=(buttons)=>(
    <div style={{margin:"0 20px 20px",background:"repeating-linear-gradient(135deg,#FFF7ED,#FFF7ED 10px,#FEF3C7 10px,#FEF3C7 20px)",border:"1.5px dashed #F59E0B",borderRadius:16,padding:14}}>
      <div style={{fontSize:11,fontWeight:800,color:"#92400E",letterSpacing:.6,marginBottom:2}}>🛠️ DEMO — PRO CONTROLS</div>
      <div style={{fontSize:11,color:"#92400E",opacity:.85,marginBottom:10}}>Stands in for the future Pro app. Not visible in a real customer build.</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
        {buttons.map(([label,fn])=>(
          <button key={label} onClick={fn} style={{padding:"9px 14px",borderRadius:10,border:"1.5px solid #F59E0B",background:"#FFFFFF",color:"#92400E",fontWeight:700,fontSize:12,cursor:"pointer"}}>{label}</button>
        ))}
      </div>
    </div>
  );

  // ── TRUST SCORE (shared small components) ───────────────────────────────────
  const trustBadge=(score,sz=13)=>(
    <span style={{background:trustBg(score),color:trustColor(score),fontWeight:800,fontSize:sz,padding:"3px 9px",borderRadius:10,display:"inline-flex",alignItems:"center",gap:4,flexShrink:0}}>🛡️ {score}</span>
  );
  const trustLine=pro=>(
    <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
      {trustBadge(pro.trustScore)}
      <span style={{fontSize:11,color:TS}}>{pro.onTimeRate}% on-time · {pro.hireAgainRate}% would hire again</span>
    </div>
  );

  // ── BOOKING FLOW — SHARED COMPACT COMPONENTS ────────────────────────────────
  // Compact chip-style time selector (replaces the old stacked full-width cards)
  const timeChips=(list,isEmergency)=>{
    const selected=list.find(p=>p.id===tpid);
    return(
      <div style={{marginBottom:16}}>
        <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:selected?8:0}}>
          {list.map(p=>{
            const a=tpid===p.id;
            return(
              <button key={p.id} onClick={()=>setTpid(p.id)} style={{border:`1.5px solid ${a?N:BD}`,borderRadius:14,padding:"9px 14px",cursor:"pointer",background:a?N:W,display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontWeight:700,fontSize:13,color:a?W:TX}}>{p.label}</span>
                {p.surge>0&&<span style={{fontSize:10,fontWeight:700,color:a?"#FFE8B0":"#D97706"}}>+${p.surge}</span>}
              </button>
            );
          })}
        </div>
        {selected&&<div style={{fontSize:12,color:isEmergency?"#C2410C":TM}}>{selected.sub}</div>}
      </div>
    );
  };
  // Compact address + payment summary — smart defaults, editable via existing screens
  const addressPaymentCard=()=>(
    <div style={{background:W,borderRadius:18,padding:16,marginBottom:12,boxShadow:"0 2px 10px rgba(28,43,58,.07)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",gap:10,alignItems:"center",minWidth:0}}>
          <span style={{fontSize:16,flexShrink:0}}>📍</span>
          <span style={{fontSize:13,color:selectedAddress?TX:N,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",cursor:selectedAddress?"default":"pointer"}} onClick={selectedAddress?undefined:()=>openAddressForm(null)}>{selectedAddress?formatAddress(selectedAddress):"No address saved — tap to add one"}</span>
        </div>
        {addresses.length>1&&<span onClick={()=>{setShowAddressPicker(v=>!v);setShowCardPicker(false);}} style={{fontSize:12,color:N,fontWeight:700,cursor:"pointer",flexShrink:0,marginLeft:10}}>Change</span>}
      </div>
      {locationPermission==="never_requested"&&(
        <div onClick={requestLocation} style={{marginTop:10,fontSize:11,color:TM,cursor:"pointer"}}>📡 Check my location to help prevent mistakes</div>
      )}
      {locationPermission==="requesting"&&(
        <div style={{marginTop:10,fontSize:11,color:TM}}>📡 Checking your location…</div>
      )}
      {detectedCity!==null&&selectedAddress&&detectedCity!==selectedAddress.city&&!locationWarningDismissed&&(
        <div style={{marginTop:12,background:"#FFF7ED",border:"1px solid #FDE9CC",borderRadius:14,padding:14}}>
          <div style={{fontSize:12,color:"#92400E",lineHeight:1.5,marginBottom:10}}>
            Your repair is booked for your {selectedAddress.label} property, but your phone appears to be in {detectedCity}.
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>setLocationWarningDismissed(true)} style={{flex:1,padding:"8px 0",borderRadius:9,border:"1.5px solid #FDE9CC",background:W,color:"#92400E",fontWeight:700,fontSize:12,cursor:"pointer"}}>Continue</button>
            <button onClick={()=>{setShowAddressPicker(true);setLocationWarningDismissed(true);}} style={{flex:1,padding:"8px 0",borderRadius:9,border:"none",background:"#F59E0B",color:W,fontWeight:700,fontSize:12,cursor:"pointer"}}>Change Address</button>
          </div>
        </div>
      )}
      {detectedCity!==null&&selectedAddress&&detectedCity===selectedAddress.city&&(
        <div style={{marginTop:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:11,color:SC}}>📡 Location matches this property</span>
          <span onClick={simulateDifferentLocation} style={{fontSize:10,color:TM,textDecoration:"underline",cursor:"pointer"}}>Simulate different location (demo)</span>
        </div>
      )}
      {showAddressPicker&&(
        <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${BD}`}}>
          {sortedAddresses.map(a=>(
            <div key={a.id} onClick={()=>{setSelectedAddressId(a.id);setShowAddressPicker(false);}}
              style={{padding:"9px 10px",borderRadius:10,marginBottom:6,cursor:"pointer",background:a.id===selectedAddressId?"#EFF6FF":BG,border:`1.5px solid ${a.id===selectedAddressId?"#BFDBFE":"transparent"}`}}>
              <div style={{fontSize:12,fontWeight:700,color:TX}}>{a.label}{a.isPrimary?" · Primary":""}</div>
              <div style={{fontSize:11,color:TS,marginTop:1}}>{formatAddress(a)}</div>
            </div>
          ))}
        </div>
      )}
      <div style={{height:1,background:BD,margin:"12px 0"}}/>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          <span style={{fontSize:16}}>💳</span>
          <span style={{fontSize:13,color:TX,fontWeight:600}}>{selectedCard?`${selectedCard.brand} •••• ${selectedCard.last4}`:"No card saved"}</span>
        </div>
        {cards.length>1&&<span onClick={()=>{setShowCardPicker(v=>!v);setShowAddressPicker(false);}} style={{fontSize:12,color:N,fontWeight:700,cursor:"pointer"}}>Change</span>}
      </div>
      {showCardPicker&&(
        <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${BD}`}}>
          {cards.map(c=>(
            <div key={c.id} onClick={()=>{setSelectedCardId(c.id);setShowCardPicker(false);}}
              style={{padding:"9px 10px",borderRadius:10,marginBottom:6,cursor:"pointer",background:c.id===selectedCardId?"#EFF6FF":BG,border:`1.5px solid ${c.id===selectedCardId?"#BFDBFE":"transparent"}`,display:"flex",justifyContent:"space-between"}}>
              <span style={{fontSize:12,fontWeight:700,color:TX}}>{c.brand} •••• {c.last4}</span>
              {c.isDefault&&<span style={{fontSize:10,color:TM}}>Default</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
  // Inline horizontal photo row — optional, no separate screen required
  const photoRow=()=>(
    <div style={{background:W,borderRadius:18,padding:16,marginBottom:12,boxShadow:"0 2px 10px rgba(28,43,58,.07)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <span style={{fontSize:11,fontWeight:700,color:TM,letterSpacing:.8,textTransform:"uppercase"}}>Photos</span>
        <span style={{fontSize:11,color:TM}}>Optional</span>
      </div>
      <input ref={photoInputRef} type="file" accept="image/*" capture="environment" multiple onChange={handlePhotoFiles} style={{display:"none"}}/>
      <div className="sc" style={{display:"flex",gap:8,overflowX:"auto"}}>
        {photos.map((p,i)=>(
          <div key={i} style={{position:"relative",width:64,height:64,borderRadius:12,overflow:"hidden",flexShrink:0,background:BD}}>
            <img src={p} alt={`Photo ${i+1}`} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>
            <button onClick={()=>remPhoto(i)} style={{position:"absolute",top:2,right:2,width:18,height:18,borderRadius:9,background:"rgba(0,0,0,.55)",border:"none",color:W,fontSize:10,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
          </div>
        ))}
        {photos.length<4&&(
          <div onClick={addPhoto} style={{width:64,height:64,borderRadius:12,background:BG,border:`1.5px dashed ${BD}`,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0}}>
            <span style={{fontSize:20,color:TM}}>📷</span>
          </div>
        )}
      </div>
    </div>
  );

  // ── PRO PROFILE ────────────────────────────────────────────────────────────
  const proProfileScreen=()=>{
    const p=proProfilePro;
    const metrics=[
      ["On-time rate",`${p.onTimeRate}%`],
      ["Would hire again",`${p.hireAgainRate}%`],
      ["Completion rate",`${p.completionRate}%`],
      ["Avg. response",p.responseTime],
    ];
    return(
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",background:BG}}>
        {subHeader("Pro profile",()=>backFrom("proProfile",{scr:"tracking",tab:"home"}))}
        <div className="sc" style={{flex:1,overflowY:"auto",padding:20}}>
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",marginBottom:20}}>
            <div style={{width:76,height:76,borderRadius:38,background:p.col,display:"flex",alignItems:"center",justifyContent:"center",color:W,fontWeight:800,fontSize:26,marginBottom:12}}>{p.i}</div>
            <div style={{fontWeight:800,fontSize:19,color:TX,marginBottom:3}}>{p.n}</div>
            <div style={{color:AM,fontSize:13,fontWeight:600,marginBottom:10}}>{p.s}</div>
            <div style={{fontSize:12,color:TS}}>⭐ {p.r} · {p.j} completed jobs</div>
          </div>

          {/* Trust Score — primary card */}
          <div style={{background:"linear-gradient(135deg,#1C2B3A,#2E4359)",borderRadius:20,padding:20,marginBottom:14,textAlign:"center"}}>
            <div style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,.55)",letterSpacing:.8,textTransform:"uppercase",marginBottom:8}}>Trust Score</div>
            <div style={{fontSize:44,fontWeight:900,color:W,lineHeight:1}}>{p.trustScore}<span style={{fontSize:18,color:"rgba(255,255,255,.5)"}}>/100</span></div>
          </div>

          {/* Metric chips */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
            {metrics.map(([l,v])=>(
              <div key={l} style={{background:W,borderRadius:16,padding:14,boxShadow:"0 2px 10px rgba(28,43,58,.07)"}}>
                <div style={{fontSize:10,color:TM,fontWeight:600,marginBottom:4}}>{l}</div>
                <div style={{fontSize:18,fontWeight:800,color:TX}}>{v}</div>
              </div>
            ))}
          </div>

          {/* Badges */}
          <div style={{background:W,borderRadius:18,padding:16,marginBottom:20,boxShadow:"0 2px 10px rgba(28,43,58,.07)"}}>
            <div style={{fontSize:11,fontWeight:700,color:TM,letterSpacing:.8,textTransform:"uppercase",marginBottom:12}}>Verification</div>
            <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
              {p.badges.map(b=>(
                <span key={b} style={{fontSize:11,background:SL,color:SC,padding:"5px 11px",borderRadius:20,fontWeight:700}}>✓ {b}</span>
              ))}
            </div>
          </div>

          {proProfileCtx==="tracking"&&vj&&(
            <button onClick={()=>goTo("messages")} style={{width:"100%",padding:16,borderRadius:16,border:"none",background:N,color:W,fontWeight:800,fontSize:15,cursor:"pointer"}}>💬 Message {p.n.split(" ")[0]}</button>
          )}
        </div>
      </div>
    );
  };

  // ── EDIT PROFILE ──────────────────────────────────────────────────────────
  const editProfileScreen=()=>(
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",background:BG}}>
      {subHeader("Edit profile")}
      <div className="sc" style={{flex:1,overflowY:"auto",padding:20}}>
        <input ref={profilePhotoInputRef} type="file" accept="image/*" onChange={handleProfilePhoto} style={{display:"none"}}/>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",marginBottom:22}}>
          <Avatar photo={draftPhoto} size={88} iconSize={40} iconColor={W} onClick={()=>profilePhotoInputRef.current?.click()}>
            <div style={{position:"absolute",bottom:0,left:0,right:0,background:"rgba(0,0,0,.45)",color:W,fontSize:10,fontWeight:700,textAlign:"center",padding:"4px 0"}}>Change</div>
          </Avatar>
          <span onClick={()=>profilePhotoInputRef.current?.click()} style={{fontSize:12,color:N,fontWeight:600,cursor:"pointer",marginTop:10}}>Tap to change photo</span>
        </div>
        <div style={{background:W,borderRadius:18,padding:18,marginBottom:12,boxShadow:"0 2px 10px rgba(28,43,58,.07)"}}>
          <div style={{fontSize:11,fontWeight:700,color:TM,letterSpacing:.8,textTransform:"uppercase",marginBottom:10}}>Name</div>
          <input value={draftName} onChange={e=>setDraftName(e.target.value)} placeholder="Your name"
            style={{width:"100%",border:"none",fontSize:16,fontWeight:600,color:TX,background:"transparent",outline:"none",padding:0}}/>
        </div>
        <div style={{background:W,borderRadius:18,padding:18,marginBottom:20,boxShadow:"0 2px 10px rgba(28,43,58,.07)"}}>
          <div style={{fontSize:11,fontWeight:700,color:TM,letterSpacing:.8,textTransform:"uppercase",marginBottom:10}}>Bio</div>
          <textarea value={draftBio} onChange={e=>setDraftBio(e.target.value)} maxLength={150} placeholder="Tell pros a little about yourself or your home (optional)"
            style={{width:"100%",minHeight:70,border:"none",resize:"none",background:"transparent",color:TX,fontSize:14,lineHeight:1.55,outline:"none",padding:0}}/>
          <div style={{fontSize:11,color:TM,textAlign:"right",marginTop:6,paddingTop:6,borderTop:`1px solid ${BD}`}}>{draftBio.length}/150</div>
        </div>
        <button onClick={saveProfile} style={{width:"100%",padding:17,borderRadius:18,border:"none",background:AM,color:W,fontWeight:800,fontSize:16,cursor:"pointer",boxShadow:`0 6px 20px rgba(245,158,11,.3)`,marginBottom:10}}>Save changes</button>
        <button onClick={goProfile} style={{width:"100%",padding:15,borderRadius:18,border:`1.5px solid ${BD}`,background:"transparent",color:TS,fontWeight:600,fontSize:15,cursor:"pointer"}}>Cancel</button>
      </div>
    </div>
  );

  // ── MY HOME ────────────────────────────────────────────────────────────────
  const completedJobs = jobs.filter(j=>j.status==="complete").slice().sort((a,b)=>(b.completedAt||b.id)-(a.completedAt||a.id));
  const primaryAddressText = formatAddress(primaryHome);
  const primaryCompletedJobs = completedJobs.filter(j=>!j.addressText||j.addressText===primaryAddressText);
  const maintSuggestions = (()=>{
    const seen=new Set(); const out=[];
    primaryCompletedJobs.forEach(j=>{
      const rule=j.taskId&&MAINT_RULES[j.taskId];
      if(rule&&!seen.has(j.taskId)){
        seen.add(j.taskId);
        const jt=TASKS.find(t=>t.id===j.taskId);
        out.push({taskId:j.taskId,name:jt?.n||"Service",e:jt?.e||"🔧",msg:rule.msg,every:rule.months?`Every ${rule.months} month${rule.months>1?"s":""}`:`Every ${rule.days} days`});
      }
    });
    return out;
  })();
  const jobDisplayInfo=j=>{
    const jt=j.taskId?TASKS.find(t=>t.id===j.taskId):j.custom?{e:"🔧",n:j.custom.title,p:j.custom.price}:null;
    const jTotal=jt?jt.p+j.surge+(j.emergencyFee||0):0;
    const dateStr=new Date(j.completedAt||j.id).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
    return {jt,jTotal,dateStr};
  };
  // SVG-based star, not a text glyph — text-glyph stars (★) have
  // inconsistent font-baseline/glyph-box positioning across browsers and
  // OSes, which is what caused stars to appear clipped/offset/unclear
  // before. An SVG path has a precise, predictable bounding box, so the
  // fill-percentage overlay lines up exactly regardless of platform.
  const STAR_PATH="M12 2.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7z";
  const starDisplay=(n,sz=13)=>(
    <span style={{display:"inline-flex",gap:1,verticalAlign:"middle",lineHeight:0}}>
      {[1,2,3,4,5].map(i=>{
        const fillPct=Math.max(0,Math.min(1,n-(i-1)))*100;
        return(
          <span key={i} style={{position:"relative",display:"inline-block",width:sz,height:sz}}>
            <svg width={sz} height={sz} viewBox="0 0 24 24" style={{display:"block",position:"absolute",inset:0}}>
              <path d={STAR_PATH} fill="#DDD"/>
            </svg>
            <span style={{position:"absolute",inset:0,width:`${fillPct}%`,overflow:"hidden"}}>
              <svg width={sz} height={sz} viewBox="0 0 24 24" style={{display:"block"}}>
                <path d={STAR_PATH} fill={AM}/>
              </svg>
            </span>
          </span>
        );
      })}
    </span>
  );

  const myhomeScreen=()=>{
    if(!primaryHome){
      return(
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",background:BG}}>
          {subHeader("My Home")}
          <div className="sc" style={{flex:1,overflowY:"auto",padding:20,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",textAlign:"center"}}>
            <div style={{fontSize:36,marginBottom:12}}>🏠</div>
            <div style={{fontWeight:700,fontSize:16,color:TX,marginBottom:6}}>No property saved yet</div>
            <div style={{fontSize:13,color:TS,lineHeight:1.5,marginBottom:20,maxWidth:240}}>Add a property to see your home overview, service history, and maintenance suggestions.</div>
            <button onClick={()=>openAddressForm(null)} style={{padding:"13px 24px",borderRadius:14,border:"none",background:AM,color:W,fontWeight:700,fontSize:14,cursor:"pointer"}}>+ Add a property</button>
          </div>
        </div>
      );
    }
    return(
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",background:BG}}>
      {subHeader("My Home")}
      <div className="sc" style={{flex:1,overflowY:"auto",padding:"20px 20px 32px"}}>

        {/* Home Overview */}
        <div style={{background:W,borderRadius:20,padding:20,marginBottom:20,boxShadow:"0 2px 10px rgba(28,43,58,.07)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
            <div style={{fontSize:11,fontWeight:700,color:TM,letterSpacing:.8,textTransform:"uppercase"}}>Home overview</div>
            <span onClick={()=>openAddressForm(primaryHome)} style={{fontSize:12,color:N,fontWeight:700,cursor:"pointer"}}>Edit ›</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14,flexWrap:"wrap"}}>
            <div style={{fontWeight:700,fontSize:15,color:TX,lineHeight:1.4}}>📍 {formatAddress(primaryHome)}</div>
            {primaryCompletedJobs.length>=TRUSTED_HOME_THRESHOLD&&(
              <span aria-label="Trusted Home — this property has an established repair history through Haven" style={{fontSize:11,fontWeight:700,color:SC,background:SL,padding:"3px 9px",borderRadius:10,whiteSpace:"nowrap"}}>🏡 Trusted Home</span>
            )}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            {[["Home type",primaryHome.propertyType||"Not set","propertyType"],["Year built",primaryHome.yearBuilt||"Not set","yearBuilt"],["Square footage",primaryHome.sqft?`${primaryHome.sqft} sqft`:"Not set","sqft"],["Layout",formatLayout(primaryHome),"beds"]].map(([l,v,fieldKey])=>(
              <button key={l} onClick={()=>openAddressForm(primaryHome,fieldKey)} aria-label={`${l}: ${v}. Tap to edit.`} style={{textAlign:"left",font:"inherit",background:BG,border:"none",borderRadius:12,padding:"10px 12px",cursor:"pointer",position:"relative"}}>
                <div style={{fontSize:10,color:TM,fontWeight:600,marginBottom:2,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span>{l}</span>
                  <span style={{color:TM,fontSize:11}}>✎</span>
                </div>
                <div style={{fontSize:13,fontWeight:700,color:TX}}>{v}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Service History — compact preview only */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <span style={{fontWeight:700,fontSize:15,color:TX}}>Service history</span>
          <span style={{fontSize:12,color:TM}}>{primaryCompletedJobs.length} completed</span>
        </div>
        {primaryCompletedJobs.length===0?(
          <div style={{background:W,borderRadius:18,padding:20,marginBottom:12,textAlign:"center",boxShadow:"0 2px 10px rgba(28,43,58,.07)"}}>
            <div style={{fontSize:28,marginBottom:8}}>🗂️</div>
            <div style={{fontWeight:700,fontSize:14,color:TX,marginBottom:4}}>No completed jobs yet.</div>
            <div style={{fontSize:12,color:TS,lineHeight:1.5}}>Completed repairs will automatically appear here.</div>
          </div>
        ):(
          <div style={{marginBottom:12}}>
            {primaryCompletedJobs.slice(0,2).map(j=>{
              const {jt,jTotal,dateStr}=jobDisplayInfo(j);
              return(
                <div key={j.id} style={{background:W,borderRadius:18,padding:16,marginBottom:10,boxShadow:"0 2px 10px rgba(28,43,58,.07)"}}>
                  <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:10}}>
                    <div style={{width:42,height:42,borderRadius:21,background:SL,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{jt?.e||"🔧"}</div>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700,fontSize:14,color:TX}}>{jt?.n||"Custom job"}</div>
                      <div style={{fontSize:12,color:TS,marginTop:1}}>{dateStr} · {j.pro?.n||"Pro"}</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontWeight:800,fontSize:15,color:AM}}>${jTotal}</div>
                      <span style={{fontSize:10,fontWeight:700,color:SC,background:SL,padding:"2px 8px",borderRadius:8}}>Completed</span>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>{setVjid(j.id);goTo("tracking");}} style={{flex:1,padding:"9px 0",borderRadius:10,border:`1.5px solid ${BD}`,background:BG,color:TX,fontWeight:600,fontSize:12,cursor:"pointer"}}>View details</button>
                    <button onClick={()=>openReceipt(j.id)} style={{flex:1,padding:"9px 0",borderRadius:10,border:`1.5px solid ${BD}`,background:BG,color:TX,fontWeight:600,fontSize:12,cursor:"pointer"}}>View receipt</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div onClick={()=>goTo("serviceHistory")} style={{background:W,borderRadius:16,padding:14,marginBottom:20,boxShadow:"0 2px 10px rgba(28,43,58,.07)",cursor:"pointer",display:"flex",justifyContent:"center",alignItems:"center",gap:6}}>
          <span style={{fontSize:13,fontWeight:700,color:N}}>View all service history</span>
          <span style={{color:N,fontSize:16}}>›</span>
        </div>

        {/* Maintenance Suggestions */}
        <div style={{fontWeight:700,fontSize:15,color:TX,marginBottom:12}}>Suggested maintenance</div>
        {maintSuggestions.length>0?(
          <div style={{marginBottom:20}}>
            {maintSuggestions.map(s=>(
              <div key={s.taskId} style={{background:"#FFF7ED",border:"1px solid #FDE9CC",borderRadius:18,padding:16,marginBottom:10,display:"flex",gap:12,alignItems:"center"}}>
                <div style={{fontSize:22,flexShrink:0}}>{s.e}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,color:"#92400E",fontWeight:600,lineHeight:1.4}}>{s.msg}</div>
                  <div style={{fontSize:11,color:"#B45309",marginTop:2}}>{s.every}</div>
                </div>
              </div>
            ))}
          </div>
        ):(
          <div style={{background:W,borderRadius:18,padding:18,marginBottom:20,textAlign:"center",boxShadow:"0 2px 10px rgba(28,43,58,.07)"}}>
            <div style={{fontSize:24,marginBottom:8}}>🔔</div>
            <div style={{fontSize:13,color:TS,lineHeight:1.5}}>No suggestions yet — these appear automatically after you complete services like gutter cleaning, HVAC filter swaps, pest control, or pressure washing.</div>
          </div>
        )}

        {/* Documents */}
        <div style={{fontWeight:700,fontSize:15,color:TX,marginBottom:12}}>Documents</div>
        <div onClick={()=>goTo("receiptList")}
          style={{background:W,borderRadius:18,padding:16,marginBottom:20,boxShadow:"0 2px 10px rgba(28,43,58,.07)",cursor:"pointer",display:"flex",alignItems:"center",gap:14}}>
          <div style={{width:44,height:44,borderRadius:22,background:SL,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontSize:22}}>🧾</span></div>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,fontSize:14,color:TX}}>Receipts</div>
            <div style={{fontSize:12,fontWeight:600,color:SC,marginTop:2}}>{completedJobs.length} saved</div>
          </div>
          <span style={{color:TM,fontSize:20}}>›</span>
        </div>

        {/* Home Report */}
        <div style={{background:"linear-gradient(135deg,#1C2B3A,#2E4359)",borderRadius:20,padding:20}}>
          <div style={{fontWeight:700,fontSize:15,color:W,marginBottom:6}}>📄 Home Report</div>
          <div style={{fontSize:12,color:"rgba(255,255,255,.65)",lineHeight:1.5,marginBottom:14}}>Your Home Report will combine completed services, receipts, and maintenance history into one clean record.</div>
          <button disabled style={{width:"100%",padding:13,borderRadius:14,border:"none",background:"rgba(255,255,255,.15)",color:"rgba(255,255,255,.7)",fontWeight:700,fontSize:13,cursor:"default"}}>Coming soon</button>
        </div>
      </div>
    </div>
    );
  };

  // ── DEDICATED SERVICE HISTORY SCREEN ─────────────────────────────────────
  const serviceHistoryScreen=()=>(
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",background:BG}}>
      {subHeader("Service History",()=>goTo("myhome"))}
      <div className="sc" style={{flex:1,overflowY:"auto",padding:20}}>
        <div style={{fontSize:12,color:TS,marginBottom:16}}>📍 {primaryHome?.label||"Property"} · {primaryAddressText}</div>
        {primaryCompletedJobs.length===0?(
          <div style={{background:W,borderRadius:18,padding:24,textAlign:"center",boxShadow:"0 2px 10px rgba(28,43,58,.07)"}}>
            <div style={{fontSize:32,marginBottom:10}}>🗂️</div>
            <div style={{fontWeight:700,fontSize:15,color:TX,marginBottom:6}}>No completed jobs yet.</div>
            <div style={{fontSize:13,color:TS,lineHeight:1.5}}>Completed repairs will automatically appear here.</div>
          </div>
        ):primaryCompletedJobs.map(j=>{
          const {jt,jTotal,dateStr}=jobDisplayInfo(j);
          return(
            <div key={j.id} style={{background:W,borderRadius:16,padding:14,marginBottom:10,boxShadow:"0 2px 10px rgba(28,43,58,.07)"}}>
              <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:10}}>
                <div style={{width:36,height:36,borderRadius:18,background:SL,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,flexShrink:0}}>{jt?.e||"🔧"}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:13,color:TX}}>{jt?.n||"Custom job"}</div>
                  <div style={{fontSize:11,color:TS,marginTop:1}}>{dateStr} · {j.pro?.n||"Pro"}</div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontWeight:800,fontSize:14,color:AM}}>${jTotal}</div>
                  {j.rated&&starDisplay(j.stars,11)}
                </div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>{setVjid(j.id);goTo("tracking");}} style={{flex:1,padding:"8px 0",borderRadius:9,border:`1.5px solid ${BD}`,background:BG,color:TX,fontWeight:600,fontSize:11,cursor:"pointer"}}>View details</button>
                <button onClick={()=>openReceipt(j.id)} style={{flex:1,padding:"8px 0",borderRadius:9,border:`1.5px solid ${BD}`,background:BG,color:TX,fontWeight:600,fontSize:11,cursor:"pointer"}}>View receipt</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const homeFieldCard=(label,children,fieldKey=null)=>(
    <div id={fieldKey?`field-${fieldKey}`:undefined} style={{background:W,borderRadius:18,padding:18,marginBottom:12,boxShadow:"0 2px 10px rgba(28,43,58,.07)",transition:"box-shadow .3s, border-color .3s",border:fieldKey&&highlightField===fieldKey?`2px solid ${AM}`:"2px solid transparent"}}>
      <div style={{fontSize:11,fontWeight:700,color:TM,letterSpacing:.8,textTransform:"uppercase",marginBottom:10}}>{label}</div>
      {children}
    </div>
  );
  const selectStyle={width:"100%",border:"none",fontSize:15,fontWeight:600,color:TX,background:"transparent",outline:"none",padding:0,appearance:"none",WebkitAppearance:"none"};
  const addressSelect=(key,options)=>(
    <div style={{position:"relative"}}>
      <select value={draftAddress[key]} onChange={e=>setDraftAddress(h=>({...h,[key]:e.target.value}))} style={selectStyle}>
        <option value="">Not set</option>
        {options.map(o=><option key={o} value={o}>{o}</option>)}
      </select>
      <span style={{position:"absolute",right:0,top:1,color:TM,fontSize:13,pointerEvents:"none"}}>▾</span>
    </div>
  );
  // One shared state selector — reused across My Home, Saved Addresses, and
  // the booking address flow (all three route through this same form).
  // Stores the standard 2-letter abbreviation; prevents free-text spelling errors.
  const stateSelect=()=>(
    <div style={{position:"relative"}}>
      <select value={draftAddress.state} onChange={e=>setDraftAddress(h=>({...h,state:e.target.value}))} style={selectStyle}>
        <option value="">Select a state</option>
        {US_STATES.map(([abbr,name])=><option key={abbr} value={abbr}>{abbr} — {name}</option>)}
      </select>
      <span style={{position:"absolute",right:0,top:1,color:TM,fontSize:13,pointerEvents:"none"}}>▾</span>
    </div>
  );

  // ── RECEIPTS ───────────────────────────────────────────────────────────────
  const receiptListScreen=()=>(
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",background:BG,position:"relative"}}>
      {subHeader("Receipts",()=>goTo("myhome"))}
      <div className="sc" style={{flex:1,overflowY:"auto",padding:20}}>
        {completedJobs.length===0?(
          <div style={{background:W,borderRadius:18,padding:24,textAlign:"center",boxShadow:"0 2px 10px rgba(28,43,58,.07)"}}>
            <div style={{fontSize:32,marginBottom:10}}>🧾</div>
            <div style={{fontWeight:700,fontSize:15,color:TX,marginBottom:6}}>No receipts yet.</div>
            <div style={{fontSize:13,color:TS,lineHeight:1.5}}>Completed jobs automatically generate professional receipts.</div>
          </div>
        ):completedJobs.map(j=>{
          const jt=j.taskId?TASKS.find(t=>t.id===j.taskId):j.custom?{e:"🔧",n:j.custom.title,p:j.custom.price}:null;
          const jTotal=(jt?jt.p+j.surge+(j.emergencyFee||0):0)+(j.tipAmount>0?j.tipAmount:0);
          const dateStr=new Date(j.completedAt||j.id).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
          return(
            <div key={j.id} style={{background:W,borderRadius:18,padding:16,marginBottom:12,boxShadow:"0 2px 10px rgba(28,43,58,.07)"}}>
              <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:12}}>
                <div style={{width:42,height:42,borderRadius:21,background:SL,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{fontSize:20}}>{jt?.e||"🔧"}</span></div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:14,color:TX}}>{jt?.n||"Custom job"}</div>
                  <div style={{fontSize:12,color:TS,marginTop:1}}>{dateStr} · {j.pro?.n||"Pro"}</div>
                </div>
                <div style={{fontWeight:800,fontSize:15,color:AM}}>${jTotal}</div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>openReceipt(j.id)} style={{flex:1,padding:"10px 0",borderRadius:10,border:`1.5px solid ${BD}`,background:BG,color:TX,fontWeight:700,fontSize:12,cursor:"pointer"}}>View Receipt</button>
                <button onClick={()=>shareReceiptForJob(j)} aria-label="Share Receipt" style={{width:44,padding:"10px 0",borderRadius:10,border:`1.5px solid ${BD}`,background:BG,color:TS,fontSize:14,cursor:"pointer"}}>⬆️</button>
              </div>
            </div>
          );
        })}
      </div>

      {listShareFallbackJobId!=null&&(()=>{
        const job=completedJobs.find(j=>j.id===listShareFallbackJobId);
        if(!job)return null;
        const printThisReceipt=()=>{ openReceipt(job.id); setListShareFallbackJobId(null); setTimeout(()=>{ try{window.print();}catch{} },50); };
        const downloadThisReceipt=()=>{
          try{
            const {text,receiptId}=buildReceiptShareText(job);
            const blob=new Blob([text],{type:"text/plain"});
            const url=URL.createObjectURL(blob);
            const a=document.createElement("a");
            a.href=url; a.download=`Haven-Receipt-${receiptId}.txt`;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }catch{}
          setListShareFallbackJobId(null);
        };
        const copyThisReceipt=()=>{
          try{
            const {text}=buildReceiptShareText(job);
            if(typeof navigator!=="undefined"&&navigator.clipboard&&navigator.clipboard.writeText){
              navigator.clipboard.writeText(text).then(()=>{ setShowCopiedToast(true); setTimeout(()=>setShowCopiedToast(false),2500); }).catch(()=>{});
            }
          }catch{}
          setListShareFallbackJobId(null);
        };
        return(
          <div className="no-print" onClick={()=>setListShareFallbackJobId(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.4)",display:"flex",alignItems:"flex-end",zIndex:20}}>
            <div onClick={e=>e.stopPropagation()} style={{background:"#FFFFFF",borderRadius:"20px 20px 0 0",padding:20,width:"100%",paddingBottom:"max(20px, env(safe-area-inset-bottom))"}}>
              <div style={{fontWeight:800,fontSize:15,color:"#1C2B3A",marginBottom:14,textAlign:"center"}}>Share Receipt</div>
              <button onClick={printThisReceipt} style={{width:"100%",padding:14,borderRadius:12,border:"1.5px solid #E5DED4",background:"#FFFFFF",color:"#1C2B3A",fontWeight:600,fontSize:14,cursor:"pointer",marginBottom:8,textAlign:"left",display:"flex",alignItems:"center",gap:10}}>🖨️ Print Receipt</button>
              <button onClick={downloadThisReceipt} style={{width:"100%",padding:14,borderRadius:12,border:"1.5px solid #E5DED4",background:"#FFFFFF",color:"#1C2B3A",fontWeight:600,fontSize:14,cursor:"pointer",marginBottom:8,textAlign:"left",display:"flex",alignItems:"center",gap:10}}>⬇️ Save or Download Receipt</button>
              <button onClick={copyThisReceipt} style={{width:"100%",padding:14,borderRadius:12,border:"1.5px solid #E5DED4",background:"#FFFFFF",color:"#1C2B3A",fontWeight:600,fontSize:14,cursor:"pointer",marginBottom:10,textAlign:"left",display:"flex",alignItems:"center",gap:10}}>📋 Copy Receipt Details</button>
              <button onClick={()=>setListShareFallbackJobId(null)} style={{width:"100%",padding:14,borderRadius:12,border:"none",background:"#F5F2ED",color:"#5A6B78",fontWeight:600,fontSize:14,cursor:"pointer"}}>Cancel</button>
            </div>
          </div>
        );
      })()}
      {showCopiedToast&&(
        <div className="no-print" style={{position:"fixed",left:16,right:16,bottom:96,background:N,borderRadius:14,padding:"12px 16px",textAlign:"center",boxShadow:"0 8px 24px rgba(0,0,0,.25)",zIndex:21}}>
          <span style={{color:"#FFFFFF",fontSize:13,fontWeight:600}}>Receipt details copied</span>
        </div>
      )}
    </div>
  );

  // Single source of truth for the receipt's shareable text representation
  // — takes a job directly (not the currently-viewed vj) so both the
  // individual Receipt screen and the Receipts-list Share action produce
  // identical output without duplicating this formatting logic.
  const buildReceiptShareText=(job)=>{
    const jt=job.taskId?TASKS.find(t=>t.id===job.taskId):job.custom?{n:job.custom.title,p:job.custom.price}:null;
    const jPro=job.pro||PROS[0];
    const jTotal=(jt?jt.p:0)+(job.surge||0)+(job.emergencyFee||0);
    const grandTotal=jTotal+(job.tipAmount>0?job.tipAmount:0);
    const dateStr=new Date(job.completedAt||job.id).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
    const timeStr=new Date(job.completedAt||job.id).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
    const receiptId=`HVN-${String(job.id).slice(-6).toUpperCase()}`;
    const lineItems=[
      ["Labor",`$${jt?jt.p:(job.custom?.price||0)}`],
      ...(job.surge>0?[["ASAP surge",`$${job.surge}`]]:[]),
      ...(job.emergency?[["Emergency priority fee",`$${job.emergencyFee}`]]:[]),
      ...(job.tipAmount>0?[[`Tip to ${jPro.n}`,`$${job.tipAmount.toFixed(2)}`]]:[]),
    ];
    return {
      receiptId,
      text:[
        "HAVEN — RECEIPT",
        `Receipt #${receiptId}   PAID`,
        `Completed ${dateStr} at ${timeStr}`,
        "",
        `Customer: ${profile.name}`,
        `Service address: ${job.addressText||"—"}`,
        `Pro: ${jPro.n}`,
        `Service: ${jt?jt.n:"Custom job"}`,
        "",
        ...lineItems.map(([l,v])=>`${l}: ${v}`),
        `Total paid: $${grandTotal.toFixed(2)}`,
        "",
        `Payment method: ${job.paymentBrand||"Card"} •••• ${job.paymentLast4||"----"} — Paid`,
        "",
        "Haven Support: support@haven.app",
      ].join("\n"),
    };
  };
  const [listShareFallbackJobId,setListShareFallbackJobId]=useState(null);
  const shareReceiptForJob=(job)=>{
    const {text}=buildReceiptShareText(job);
    try{
      if(typeof navigator!=="undefined"&&navigator.share){
        navigator.share({title:"Haven Receipt",text}).catch(()=>{});
      }else{
        setListShareFallbackJobId(job.id);
      }
    }catch{ setListShareFallbackJobId(job.id); }
  };
  const receiptScreen=()=>{
    if(!vj) return unavailableScreen("Receipt",()=>backFrom("receipt",{scr:"myhome",tab:"home"}));
    // Intentional exception: receipts always render light, regardless of the
    // app's current theme — a receipt reads as a fixed document (like a
    // printed one), not a themed UI surface. Shadowing the token names here
    // means the JSX below needs zero changes to get this behavior.
    const BG="#F5F2ED", W="#FFFFFF", TX="#1C2B3A", TS="#5A6B78", TM="#9AAAB6", BD="#E5DED4", SL="#ECFDF5";
    const dateStr=new Date(vj.completedAt||vj.id).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
    const timeStr=new Date(vj.completedAt||vj.id).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
    const receiptId=`HVN-${String(vj.id).slice(-6).toUpperCase()}`;
    const serviceName=vjTask?vjTask.n:"Custom job";
    const lineItems=[
      ["Labor",`$${vjTask?vjTask.p:(vj.custom?.price||0)}`],
      ...(vj.surge>0?[["ASAP surge",`$${vj.surge}`]]:[]),
      ...(vj.emergency?[["Emergency priority fee",`$${vj.emergencyFee}`]]:[]),
      ...(vj.tipAmount>0?[[`Tip to ${vjPro.n}`,`$${vj.tipAmount.toFixed(2)}`]]:[]),
    ];
    const grandTotal=vjTotal+(vj.tipAmount>0?vj.tipAmount:0);
    const {text:shareText}=buildReceiptShareText(vj);
    const shareReceipt=()=>{
      try{
        if(typeof navigator!=="undefined"&&navigator.share){
          navigator.share({title:`Haven Receipt ${receiptId}`,text:shareText}).catch(()=>{});
        }else{
          setShowShareFallback(true);
        }
      }catch{ setShowShareFallback(true); }
    };
    const printReceipt=()=>{
      setShowShareFallback(false);
      try{ if(typeof window!=="undefined"&&window.print) window.print(); }catch{}
    };
    const downloadReceipt=()=>{
      try{
        const blob=new Blob([shareText],{type:"text/plain"});
        const url=URL.createObjectURL(blob);
        const a=document.createElement("a");
        a.href=url; a.download=`Haven-Receipt-${receiptId}.txt`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }catch{}
      setShowShareFallback(false);
    };
    const copyReceiptDetails=()=>{
      try{
        if(typeof navigator!=="undefined"&&navigator.clipboard&&navigator.clipboard.writeText){
          navigator.clipboard.writeText(shareText).then(()=>{
            setShowCopiedToast(true); setTimeout(()=>setShowCopiedToast(false),2500);
          }).catch(()=>{});
        }
      }catch{}
      setShowShareFallback(false);
    };
    return(
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",background:BG}}>
        <div className="no-print" style={{flexShrink:0}}>{subHeader("Receipt",()=>backFrom("receipt",{scr:"myhome",tab:"home"}))}</div>
        <div className="sc" style={{flex:1,overflowY:"auto",padding:20}}>
          <div className="receipt-print-area" style={{background:W,borderRadius:20,padding:28,boxShadow:"0 4px 20px rgba(28,43,58,.1)"}}>

            {/* Header: Haven wordmark top-left, RECEIPT/PAID/date top-right */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:22,paddingBottom:20,borderBottom:`2px solid ${TX}`}}>
              <div>
                <div style={{fontSize:20,fontWeight:800,color:N,letterSpacing:1.5}}>HAVEN</div>
                <div style={{fontSize:10,color:TM,marginTop:2,letterSpacing:.5}}>Home Services, Done Right</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:13,fontWeight:800,color:TX,letterSpacing:2}}>RECEIPT</div>
                <div style={{fontSize:11,color:TS,marginTop:3}}>#{receiptId}</div>
                <div style={{display:"inline-block",marginTop:5,padding:"2px 10px",borderRadius:8,background:SL,color:SC,fontSize:10,fontWeight:800,letterSpacing:.5}}>PAID</div>
                <div style={{fontSize:11,color:TS,marginTop:5}}>{dateStr} · {timeStr}</div>
              </div>
            </div>

            {/* Customer & service info */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:20}}>
              <div>
                <div style={{fontSize:10,fontWeight:700,color:TM,letterSpacing:.6,marginBottom:4}}>BILLED TO</div>
                <div style={{fontSize:13,fontWeight:700,color:TX}}>{profile.name}</div>
                <div style={{fontSize:12,color:TS,marginTop:2,lineHeight:1.4}}>{vj.addressText||"—"}</div>
                {vj.addressLabel&&<div style={{fontSize:11,color:TM,marginTop:1}}>{vj.addressLabel}</div>}
              </div>
              <div>
                <div style={{fontSize:10,fontWeight:700,color:TM,letterSpacing:.6,marginBottom:4}}>SERVICE PROVIDER</div>
                <div style={{fontSize:13,fontWeight:700,color:TX}}>{vjPro.n}</div>
                <div style={{fontSize:12,color:TS,marginTop:2}}>via Haven</div>
              </div>
            </div>

            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20,background:BG,borderRadius:14,padding:14}}>
              <div style={{width:40,height:40,borderRadius:20,background:W,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontSize:20}}>{vjTask?vjTask.e:"🔧"}</span></div>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:14,color:TX}}>{serviceName}</div>
                <div style={{fontSize:11,color:TS,marginTop:1}}>Job #{vj.id} · Completed {dateStr} at {timeStr}</div>
              </div>
            </div>

            {vj.desc&&(
              <div style={{marginBottom:20}}>
                <div style={{fontSize:10,fontWeight:700,color:TM,letterSpacing:.6,marginBottom:6}}>DESCRIPTION</div>
                <div style={{fontSize:12,color:TS,lineHeight:1.5}}>{vj.desc}</div>
              </div>
            )}

            {/* Payment breakdown */}
            <div style={{marginBottom:20}}>
              <div style={{fontSize:10,fontWeight:700,color:TM,letterSpacing:.6,marginBottom:10}}>PAYMENT BREAKDOWN</div>
              {lineItems.map(([l,v])=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",marginBottom:9}}>
                  <span style={{fontSize:13,color:TS}}>{l}</span>
                  <span style={{fontSize:13,color:TX,fontWeight:600}}>{v}</span>
                </div>
              ))}
              <div style={{borderTop:`2px solid ${TX}`,marginTop:6,paddingTop:12,display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
                <span style={{fontSize:14,color:TX,fontWeight:800}}>Total paid</span>
                <span style={{fontSize:20,color:TX,fontWeight:900}}>${grandTotal.toFixed(2)}</span>
              </div>
            </div>

            {/* Payment method */}
            <div style={{background:BG,borderRadius:14,padding:14,marginBottom:20,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:10,fontWeight:700,color:TM,letterSpacing:.6,marginBottom:3}}>PAYMENT METHOD</div>
                <div style={{fontSize:13,color:TX,fontWeight:700}}>{vj.paymentBrand||"Card"} •••• {vj.paymentLast4||"----"}</div>
              </div>
              <div style={{padding:"3px 10px",borderRadius:8,background:SL,color:SC,fontSize:11,fontWeight:800}}>Paid</div>
            </div>

            <div style={{background:SL,borderRadius:14,padding:14,display:"flex",gap:10,alignItems:"center",marginBottom:20}}>
              <span style={{fontSize:16}}>✅</span>
              <span style={{fontSize:12,color:SC,fontWeight:600,lineHeight:1.4,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                {vj.rated?<>Rated {starDisplay(vj.stars,13)} — covered by Haven's satisfaction guarantee.</>:"This job is covered by Haven's trust & safety guarantee."}
              </span>
            </div>

            <div style={{borderTop:`1px solid ${BD}`,paddingTop:14,textAlign:"center"}}>
              <div style={{fontSize:11,color:TM,lineHeight:1.6}}>Questions about this receipt? Contact Haven Support at support@haven.app</div>
              <div style={{fontSize:10,color:TM,marginTop:6}}>This receipt confirms a completed payment. No balance is owed.</div>
            </div>
          </div>

          <div className="no-print" style={{display:"flex",justifyContent:"flex-end",marginTop:16,paddingBottom:8}}>
            <button onClick={shareReceipt} aria-label="Share Receipt" style={{display:"flex",alignItems:"center",gap:8,padding:"12px 20px",borderRadius:14,border:"none",background:N,color:"#FFFFFF",fontWeight:700,fontSize:14,cursor:"pointer",boxShadow:"0 4px 14px rgba(28,43,58,.2)"}}>
              <span style={{fontSize:16}}>⬆️</span> Share Receipt
            </button>
          </div>

          {showShareFallback&&(
            <div className="no-print" onClick={()=>setShowShareFallback(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.4)",display:"flex",alignItems:"flex-end",zIndex:20}}>
              <div onClick={e=>e.stopPropagation()} style={{background:"#FFFFFF",borderRadius:"20px 20px 0 0",padding:20,width:"100%",paddingBottom:"max(20px, env(safe-area-inset-bottom))"}}>
                <div style={{fontWeight:800,fontSize:15,color:"#1C2B3A",marginBottom:14,textAlign:"center"}}>Share Receipt</div>
                <button onClick={printReceipt} style={{width:"100%",padding:14,borderRadius:12,border:"1.5px solid #E5DED4",background:"#FFFFFF",color:"#1C2B3A",fontWeight:600,fontSize:14,cursor:"pointer",marginBottom:8,textAlign:"left",display:"flex",alignItems:"center",gap:10}}>🖨️ Print Receipt</button>
                <button onClick={downloadReceipt} style={{width:"100%",padding:14,borderRadius:12,border:"1.5px solid #E5DED4",background:"#FFFFFF",color:"#1C2B3A",fontWeight:600,fontSize:14,cursor:"pointer",marginBottom:8,textAlign:"left",display:"flex",alignItems:"center",gap:10}}>⬇️ Save or Download Receipt</button>
                <button onClick={copyReceiptDetails} style={{width:"100%",padding:14,borderRadius:12,border:"1.5px solid #E5DED4",background:"#FFFFFF",color:"#1C2B3A",fontWeight:600,fontSize:14,cursor:"pointer",marginBottom:10,textAlign:"left",display:"flex",alignItems:"center",gap:10}}>📋 Copy Receipt Details</button>
                <button onClick={()=>setShowShareFallback(false)} style={{width:"100%",padding:14,borderRadius:12,border:"none",background:"#F5F2ED",color:"#5A6B78",fontWeight:600,fontSize:14,cursor:"pointer"}}>Cancel</button>
              </div>
            </div>
          )}
          {showCopiedToast&&(
            <div className="no-print" style={{position:"fixed",left:16,right:16,bottom:96,background:N,borderRadius:14,padding:"12px 16px",textAlign:"center",boxShadow:"0 8px 24px rgba(0,0,0,.25)",zIndex:21}}>
              <span style={{color:"#FFFFFF",fontSize:13,fontWeight:600}}>Receipt details copied</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── UNIFIED ADDRESS EDIT (used by both My Home and Saved Addresses) ──────
  const addressInput=(field,placeholder,extra={})=>(
    <input value={draftAddress[field]} onChange={e=>setDraftAddress(d=>({...d,[field]:e.target.value}))} placeholder={placeholder}
      style={{width:"100%",border:"none",fontSize:15,fontWeight:600,color:TX,background:"transparent",outline:"none",padding:0}} {...extra}/>
  );
  const addressEditScreen=()=>{
    const isPrimaryEdit = editingAddressId===primaryHome?.id;
    return(
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",background:BG}}>
        {subHeader(isPrimaryEdit?"Edit home details":editingAddressId?"Edit address":"Add address",()=>backFrom("addressEdit",{scr:"myhome",tab:"home"}))}
        <div className="sc" style={{flex:1,overflowY:"auto",padding:20}}>
          {addressFormError&&(
            <div style={{background:"#FEF2F2",border:"1px solid #FCA5A5",borderRadius:14,padding:"12px 14px",marginBottom:16}}>
              <span style={{fontSize:12,color:"#DC2626",fontWeight:600}}>{addressFormError}</span>
            </div>
          )}
          {!isPrimaryEdit&&homeFieldCard("Label",addressInput("label","e.g. Work, Parents' house"))}
          {homeFieldCard("Street address",addressInput("street","123 Main Street"))}
          {homeFieldCard("Apartment, unit, suite, or building (optional)",addressInput("unit","Apt, unit, suite, or building"))}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            {homeFieldCard("City",addressInput("city","City"))}
            {homeFieldCard("State",stateSelect())}
          </div>
          {homeFieldCard("ZIP code",addressInput("zip","ZIP code",{inputMode:"numeric"}))}
          {homeFieldCard("Access notes (optional)",addressInput("accessNotes","Gate code, parking notes, etc."))}
          {homeFieldCard("Property type",addressSelect("propertyType",HOME_TYPES),"propertyType")}
          {isPrimaryEdit&&(
            <>
              {homeFieldCard("Year built", addressSelect("yearBuilt",YEAR_OPTIONS),"yearBuilt")}
              {homeFieldCard("Square footage",addressInput("sqft","e.g. 1,150",{inputMode:"numeric"}),"sqft")}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:0}}>
                {homeFieldCard("Bedrooms", addressSelect("beds",BEDROOM_OPTIONS),"beds")}
                {homeFieldCard("Bathrooms", addressSelect("baths",BATHROOM_OPTIONS),"baths")}
              </div>
            </>
          )}
          <button onClick={saveAddressForm} style={{width:"100%",padding:17,borderRadius:18,border:"none",background:AM,color:W,fontWeight:800,fontSize:16,cursor:"pointer",boxShadow:`0 6px 20px rgba(245,158,11,.3)`,marginBottom:10,marginTop:8}}>Save changes</button>
          <button onClick={()=>backFrom("addressEdit",{scr:"myhome",tab:"home"})} style={{width:"100%",padding:15,borderRadius:18,border:`1.5px solid ${BD}`,background:"transparent",color:TS,fontWeight:600,fontSize:15,cursor:"pointer"}}>Cancel</button>
        </div>
      </div>
    );
  };

  // ── PAYMENT METHODS ───────────────────────────────────────────────────────
  const cardColors={Visa:N,Mastercard:"#EA580C",Card:"#5B21B6"};
  const paymentScreen=()=>(
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",background:BG}}>
      {subHeader("Payment methods",()=>backFrom("payment",{scr:"home",tab:"profile"}))}
      <div className="sc" style={{flex:1,overflowY:"auto",padding:20}}>
        {sortedCards.map(c=>{
          const open=expandedCard===c.id;
          return(
            <div key={c.id} style={{background:c.isDefault?"#EFF6FF":W,border:c.isDefault?"1.5px solid #BFDBFE":"1.5px solid transparent",borderRadius:18,marginBottom:12,boxShadow:"0 2px 10px rgba(28,43,58,.07)",overflow:"hidden"}}>
              <div onClick={()=>setExpandedCard(open?null:c.id)} style={{padding:16,display:"flex",alignItems:"center",gap:14,cursor:"pointer"}}>
                <div style={{width:44,height:30,borderRadius:6,background:cardColors[c.brand]||N,display:"flex",alignItems:"center",justifyContent:"center",color:W,fontSize:9,fontWeight:800,flexShrink:0}}>{c.brand.slice(0,4).toUpperCase()}</div>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span style={{fontWeight:700,fontSize:14,color:TX}}>{c.brand} •••• {c.last4}</span>
                    {c.isDefault&&<span style={{fontSize:10,fontWeight:700,color:N,background:"#DBEAFE",padding:"2px 8px",borderRadius:8}}>Default</span>}
                  </div>
                  <div style={{fontSize:12,color:TS,marginTop:2}}>Expires {c.exp}</div>
                </div>
                <span style={{color:TM,fontSize:16,transform:open?"rotate(90deg)":"none",display:"inline-block"}}>›</span>
              </div>
              {open&&(
                <div style={{display:"flex",gap:8,padding:"0 16px 16px"}}>
                  <button onClick={()=>setCardDefault(c.id)} disabled={c.isDefault} style={{flex:1,padding:"9px 0",borderRadius:10,border:`1.5px solid ${BD}`,background:c.isDefault?BG:W,color:c.isDefault?TM:N,fontWeight:600,fontSize:12,cursor:c.isDefault?"default":"pointer"}}>{c.isDefault?"Default card":"Set as default"}</button>
                  <button onClick={()=>removeCard(c.id)} style={{flex:1,padding:"9px 0",borderRadius:10,border:"1.5px solid #FCA5A5",background:"#FEF2F2",color:"#DC2626",fontWeight:600,fontSize:12,cursor:"pointer"}}>Remove card</button>
                </div>
              )}
            </div>
          );
        })}
        {addingCard?(
          <div style={{background:W,borderRadius:18,padding:16,marginBottom:12,boxShadow:"0 2px 10px rgba(28,43,58,.07)"}}>
            <div style={{fontSize:11,fontWeight:700,color:TM,letterSpacing:.6,textTransform:"uppercase",marginBottom:8}}>Card number</div>
            <input value={newCardNum} onChange={e=>setNewCardNum(e.target.value.replace(/\D/g,"").slice(0,16))} placeholder="1234 5678 9012 3456" inputMode="numeric"
              style={{width:"100%",border:`1.5px solid ${BD}`,borderRadius:10,padding:"10px 12px",fontSize:14,color:TX,marginBottom:12,outline:"none"}}/>

            <div style={{display:"flex",gap:10,marginBottom:12}}>
              <div style={{flex:1}}>
                <div style={{fontSize:11,fontWeight:700,color:TM,letterSpacing:.6,textTransform:"uppercase",marginBottom:8}}>Expiry</div>
                <input value={newCardExp} onChange={e=>setNewCardExp(e.target.value)} placeholder="MM/YY"
                  style={{width:"100%",border:`1.5px solid ${BD}`,borderRadius:10,padding:"10px 12px",fontSize:14,color:TX,outline:"none"}}/>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:11,fontWeight:700,color:TM,letterSpacing:.6,textTransform:"uppercase",marginBottom:8}}>CVV</div>
                <input value={newCardCvv} onChange={e=>setNewCardCvv(e.target.value.replace(/\D/g,"").slice(0,4))} placeholder="123" inputMode="numeric"
                  style={{width:"100%",border:`1.5px solid ${BD}`,borderRadius:10,padding:"10px 12px",fontSize:14,color:TX,outline:"none"}}/>
              </div>
            </div>

            <div style={{fontSize:11,fontWeight:700,color:TM,letterSpacing:.6,textTransform:"uppercase",marginBottom:8}}>Billing address</div>
            <input value={newCardAddr} onChange={e=>setNewCardAddr(e.target.value)} placeholder="Street address"
              style={{width:"100%",border:`1.5px solid ${BD}`,borderRadius:10,padding:"10px 12px",fontSize:14,color:TX,marginBottom:10,outline:"none"}}/>
            <div style={{display:"flex",gap:8,marginBottom:14}}>
              <input value={newCardCity} onChange={e=>setNewCardCity(e.target.value)} placeholder="City"
                style={{flex:2,minWidth:0,border:`1.5px solid ${BD}`,borderRadius:10,padding:"10px 10px",fontSize:13,color:TX,outline:"none"}}/>
              <input value={newCardState} onChange={e=>setNewCardState(e.target.value.slice(0,2).toUpperCase())} placeholder="ST"
                style={{width:52,border:`1.5px solid ${BD}`,borderRadius:10,padding:"10px 8px",fontSize:13,color:TX,outline:"none",textAlign:"center"}}/>
              <input value={newCardZip} onChange={e=>setNewCardZip(e.target.value.replace(/\D/g,"").slice(0,5))} placeholder="ZIP" inputMode="numeric"
                style={{width:68,border:`1.5px solid ${BD}`,borderRadius:10,padding:"10px 8px",fontSize:13,color:TX,outline:"none"}}/>
            </div>

            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>{setAddingCard(false);setNewCardNum("");setNewCardExp("");setNewCardCvv("");setNewCardAddr("");setNewCardCity("");setNewCardState("");setNewCardZip("");}} style={{flex:1,padding:"10px 0",borderRadius:10,border:`1.5px solid ${BD}`,background:BG,color:TS,fontWeight:600,fontSize:13,cursor:"pointer"}}>Cancel</button>
              <button onClick={addCard} disabled={newCardNum.length<4} style={{flex:1,padding:"10px 0",borderRadius:10,border:"none",background:newCardNum.length>=4?AM:"#DDD9D2",color:W,fontWeight:700,fontSize:13,cursor:newCardNum.length>=4?"pointer":"default"}}>Add card</button>
            </div>
          </div>
        ):(
          <button onClick={()=>setAddingCard(true)} style={{width:"100%",padding:15,borderRadius:16,border:`1.5px dashed ${BD}`,background:"transparent",color:N,fontWeight:700,fontSize:14,cursor:"pointer",marginBottom:14}}>+ Add payment method</button>
        )}
        <div style={{display:"flex",gap:8,alignItems:"flex-start",justifyContent:"center",padding:"0 8px"}}>
          <span style={{fontSize:13,flexShrink:0}}>🔒</span>
          <span style={{fontSize:11,color:TM,lineHeight:1.5,textAlign:"center"}}>Payments are securely processed. Your full card information is never displayed.</span>
        </div>
      </div>
    </div>
  );

  // ── SAVED ADDRESSES ───────────────────────────────────────────────────────
  const addressesScreen=()=>(
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",background:BG}}>
      {subHeader("Saved addresses",()=>backFrom("addresses",{scr:"home",tab:"profile"}))}
      <div className="sc" style={{flex:1,overflowY:"auto",padding:20}}>
        {sortedAddresses.map(a=>{
          const open=expandedAddr===a.id;
          return(
            <div key={a.id} style={{background:a.isPrimary?"#EFF6FF":W,border:a.isPrimary?"1.5px solid #BFDBFE":"1.5px solid transparent",borderRadius:18,marginBottom:12,boxShadow:"0 2px 10px rgba(28,43,58,.07)",overflow:"hidden"}}>
              <div onClick={()=>setExpandedAddr(open?null:a.id)} style={{padding:16,display:"flex",gap:12,alignItems:"flex-start",cursor:"pointer"}}>
                <span style={{fontSize:20}}>{addressIcon(a)}</span>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span style={{fontWeight:700,fontSize:14,color:TX}}>{a.label}</span>
                    {a.isPrimary&&<span style={{fontSize:10,fontWeight:700,color:N,background:"#DBEAFE",padding:"2px 8px",borderRadius:8}}>🏠 Primary</span>}
                  </div>
                  <div style={{fontSize:13,color:TS,marginTop:3,lineHeight:1.4}}>{formatAddress(a)}</div>
                  {a.accessNotes&&<div style={{fontSize:11,color:TM,marginTop:2}}>Access notes: {a.accessNotes}</div>}
                </div>
                <span style={{color:TM,fontSize:16,transform:open?"rotate(90deg)":"none",display:"inline-block"}}>›</span>
              </div>
              {open&&(
                <div style={{display:"flex",gap:8,padding:"0 16px 16px",flexWrap:"wrap"}}>
                  {a.isPrimary?(
                    <button disabled style={{flex:1,padding:"9px 0",borderRadius:10,border:`1.5px solid ${BD}`,background:BG,color:TM,fontWeight:600,fontSize:12,cursor:"default"}}>Primary</button>
                  ):(
                    <button onClick={()=>setPrimaryAddress(a.id)} style={{flex:1,padding:"9px 0",borderRadius:10,border:`1.5px solid ${BD}`,background:W,color:N,fontWeight:600,fontSize:12,cursor:"pointer"}}>Set as Primary</button>
                  )}
                  <button onClick={()=>openAddressForm(a)} style={{flex:1,padding:"9px 0",borderRadius:10,border:`1.5px solid ${BD}`,background:W,color:N,fontWeight:600,fontSize:12,cursor:"pointer"}}>Edit</button>
                  <button onClick={()=>setConfirmDeleteAddrId(a.id)} style={{flex:1,padding:"9px 0",borderRadius:10,border:"1.5px solid #FCA5A5",background:"#FEF2F2",color:"#DC2626",fontWeight:600,fontSize:12,cursor:"pointer"}}>Delete</button>
                </div>
              )}
              {confirmDeleteAddrId===a.id&&(
                <div style={{margin:"0 16px 16px",background:"#FEF2F2",border:"1px solid #FCA5A5",borderRadius:14,padding:14}}>
                  <div style={{fontWeight:700,fontSize:13,color:"#DC2626",marginBottom:4}}>Delete this property?</div>
                  <div style={{fontSize:12,color:"#991B1B",marginBottom:12,lineHeight:1.4}}>This will remove it from Saved Addresses and My Home.</div>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>setConfirmDeleteAddrId(null)} style={{flex:1,padding:"9px 0",borderRadius:10,border:`1.5px solid ${BD}`,background:W,color:TS,fontWeight:600,fontSize:12,cursor:"pointer"}}>Cancel</button>
                    <button onClick={()=>removeAddr(a.id)} style={{flex:1,padding:"9px 0",borderRadius:10,border:"none",background:"#DC2626",color:W,fontWeight:700,fontSize:12,cursor:"pointer"}}>Delete Property</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <button onClick={()=>openAddressForm(null)} style={{width:"100%",padding:15,borderRadius:16,border:`1.5px dashed ${BD}`,background:"transparent",color:N,fontWeight:700,fontSize:14,cursor:"pointer",marginTop:4}}>+ Add address</button>
      </div>
    </div>
  );

  const toggleNotif=k=>setNotifPrefs(p=>({...p,[k]:!p[k]}));
  const notifRow=(label,sub,k)=>(
    <div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0",borderBottom:`1px solid ${BD}`}}>
      <div><div style={{fontWeight:600,fontSize:14,color:TX}}>{label}</div><div style={{fontSize:12,color:TS,marginTop:2}}>{sub}</div></div>
      <button onClick={()=>toggleNotif(k)} role="switch" aria-checked={!!notifPrefs[k]} aria-label={label} style={{width:44,height:26,borderRadius:13,background:notifPrefs[k]?AM:BD,border:"none",padding:0,position:"relative",cursor:"pointer",flexShrink:0}}>
        <div style={{width:20,height:20,borderRadius:10,background:W,position:"absolute",top:3,left:notifPrefs[k]?21:3,transition:"left .15s",boxShadow:"0 1px 3px rgba(0,0,0,.2)"}}/>
      </button>
    </div>
  );
  const [newJobPrefText,setNewJobPrefText]=useState("");
  const jobPreferencesScreen=()=>(
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",background:BG}}>
      {subHeader("Job Preferences",()=>backFrom("jobPreferences",{scr:"settings",tab:"profile"}))}
      <div className="sc" style={{flex:1,overflowY:"auto",padding:20}}>
        <div style={{fontSize:13,color:TS,lineHeight:1.5,marginBottom:18}}>These automatically accompany every future booking, so you don't have to retype the same instructions each time.</div>
        <div style={{background:W,borderRadius:18,padding:"4px 16px",boxShadow:"0 2px 10px rgba(28,43,58,.07)",marginBottom:20}}>
          {jobPrefs.map((p,i)=>(
            <div key={p.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0",borderBottom:i<jobPrefs.length-1?`1px solid ${BD}`:"none",gap:10}}>
              <span style={{fontSize:14,fontWeight:600,color:TX,flex:1}}>{p.label}</span>
              {p.custom&&<button onClick={()=>removeJobPref(p.id)} aria-label={`Remove ${p.label}`} style={{background:"none",border:"none",color:TM,fontSize:16,cursor:"pointer",padding:"0 4px"}}>✕</button>}
              <button onClick={()=>toggleJobPref(p.id)} role="switch" aria-checked={p.enabled} aria-label={p.label} style={{width:44,height:26,borderRadius:13,background:p.enabled?AM:BD,border:"none",padding:0,position:"relative",cursor:"pointer",flexShrink:0}}>
                <div style={{width:20,height:20,borderRadius:10,background:W,position:"absolute",top:3,left:p.enabled?21:3,transition:"left .15s",boxShadow:"0 1px 3px rgba(0,0,0,.2)"}}/>
              </button>
            </div>
          ))}
        </div>

        <div style={{fontSize:11,fontWeight:700,color:TM,letterSpacing:.6,textTransform:"uppercase",marginBottom:8,padding:"0 4px"}}>Add Custom Preference</div>
        <div style={{background:W,borderRadius:18,padding:16,boxShadow:"0 2px 10px rgba(28,43,58,.07)",display:"flex",gap:10}}>
          <input value={newJobPrefText} onChange={e=>setNewJobPrefText(e.target.value)} placeholder="e.g. Use the back entrance" maxLength={80}
            style={{flex:1,border:"none",fontSize:14,fontWeight:500,color:TX,background:"transparent",outline:"none",padding:0}}/>
          <button onClick={()=>{addCustomJobPref(newJobPrefText);setNewJobPrefText("");}} disabled={!newJobPrefText.trim()} style={{padding:"8px 16px",borderRadius:10,border:"none",background:newJobPrefText.trim()?AM:"#DDD9D2",color:newJobPrefText.trim()?W:TM,fontWeight:700,fontSize:13,cursor:newJobPrefText.trim()?"pointer":"default"}}>Add</button>
        </div>
        <div style={{fontSize:11,color:TM,lineHeight:1.5,padding:"10px 4px 0"}}>Your assigned pro will be able to see these preferences before starting the job.</div>
      </div>
    </div>
  );
  const settingsScreen=()=>{
    const themeOptions=[
      ["system","System","Match your device's setting"],
      ["light","Light","Always use Haven's light appearance"],
      ["dark","Dark","Always use Haven's dark appearance"],
    ];
    return(
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",background:BG}}>
        {subHeader("Settings")}
        <div className="sc" style={{flex:1,overflowY:"auto",padding:20}}>
          <div style={{fontSize:11,fontWeight:700,color:TM,letterSpacing:.6,textTransform:"uppercase",marginBottom:8,padding:"0 4px"}}>Notifications</div>
          <div style={{background:W,borderRadius:18,padding:"4px 16px",boxShadow:"0 2px 10px rgba(28,43,58,.07)",marginBottom:6}}>
            {notifRow("Push notifications","Enable notifications on this device","push")}
            {notifRow("Job updates","Important booking and cancellation changes","jobUpdates")}
            {notifRow("Messages","Messages from pros and Haven Support","messages")}
            {notifRow("Offers and updates","Optional Haven promotions and product news","promos")}
            {notifRow("Email updates","Receipts and account activity","email")}
          </div>
          <div style={{fontSize:11,color:TM,lineHeight:1.5,padding:"0 4px 20px"}}>Safety notices, payment issues, and essential cancellation updates are always delivered regardless of these settings.</div>

          <div style={{fontSize:11,fontWeight:700,color:TM,letterSpacing:.6,textTransform:"uppercase",marginBottom:8,padding:"0 4px"}}>Appearance</div>
          <div style={{background:W,borderRadius:18,overflow:"hidden",boxShadow:"0 2px 10px rgba(28,43,58,.07)",marginBottom:6}}>
            {themeOptions.map(([key,label,sub],i)=>{
              const active=themePref===key;
              return(
                <button key={key} onClick={()=>setThemePref(key)} role="radio" aria-checked={active} style={{width:"100%",textAlign:"left",font:"inherit",background:"none",border:"none",padding:"16px 18px",borderBottom:i<themeOptions.length-1?`1px solid ${BD}`:"none",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:15,color:TX}}>{label}</div>
                    <div style={{fontSize:12,color:TS,marginTop:2}}>{sub}</div>
                  </div>
                  <div style={{width:22,height:22,borderRadius:11,border:`2px solid ${active?N:BD}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    {active&&<div style={{width:11,height:11,borderRadius:6,background:N}}/>}
                  </div>
                </button>
              );
            })}
          </div>
          <div style={{fontSize:12,color:TM,lineHeight:1.5,padding:"0 4px",marginBottom:24}}>Your appearance preference is saved on this device and applied throughout the app the next time you open it.</div>

          <div style={{fontSize:11,fontWeight:700,color:TM,letterSpacing:.6,textTransform:"uppercase",marginBottom:8,padding:"0 4px"}}>Booking</div>
          <button onClick={()=>goTo("jobPreferences")} style={{width:"100%",textAlign:"left",font:"inherit",background:W,border:"none",borderRadius:18,padding:16,boxShadow:"0 2px 10px rgba(28,43,58,.07)",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
            <div>
              <div style={{fontWeight:700,fontSize:15,color:TX}}>Job Preferences</div>
              <div style={{fontSize:12,color:TS,marginTop:2}}>{jobPrefs.filter(p=>p.enabled).length>0?`${jobPrefs.filter(p=>p.enabled).length} active — attached to every booking`:"Instructions that automatically accompany every booking"}</div>
            </div>
            <span style={{color:TM,fontSize:18,flexShrink:0}}>›</span>
          </button>

          <div style={{fontSize:11,fontWeight:700,color:TM,letterSpacing:.6,textTransform:"uppercase",marginBottom:8,padding:"0 4px"}}>Testing</div>
          <button onClick={()=>setShowResetConfirm(true)} style={{width:"100%",padding:16,borderRadius:18,border:"1.5px solid #FCA5A5",background:"#FEF2F2",color:"#DC2626",fontWeight:700,fontSize:14,cursor:"pointer",textAlign:"left"}}>Reset Prototype Data</button>
          <div style={{fontSize:11,color:TM,lineHeight:1.5,padding:"8px 4px 0"}}>Prototype/testing utility — not a real customer-facing feature. Clears all locally saved Haven data on this device.</div>

          {showResetConfirm&&(
            <div className="no-print" onClick={()=>setShowResetConfirm(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.4)",display:"flex",alignItems:"flex-end",zIndex:30}}>
              <div onClick={e=>e.stopPropagation()} style={{background:"#FFFFFF",borderRadius:"20px 20px 0 0",padding:24,width:"100%",paddingBottom:"max(24px, env(safe-area-inset-bottom))"}}>
                <div style={{fontWeight:800,fontSize:16,color:"#1C2B3A",marginBottom:8,textAlign:"center"}}>Reset Prototype Data?</div>
                <div style={{fontSize:13,color:"#5A6B78",lineHeight:1.6,marginBottom:18,textAlign:"center"}}>
                  This clears every job, saved property, saved card, profile edit, draft, notification, and preference stored on this device — and returns Haven to a clean default state. This cannot be undone.
                </div>
                <button onClick={resetPrototypeData} style={{width:"100%",padding:15,borderRadius:14,border:"none",background:"#DC2626",color:"#FFFFFF",fontWeight:800,fontSize:15,cursor:"pointer",marginBottom:10}}>Reset Prototype Data</button>
                <button onClick={()=>setShowResetConfirm(false)} style={{width:"100%",padding:14,borderRadius:14,border:"1.5px solid #E5DED4",background:"transparent",color:"#5A6B78",fontWeight:600,fontSize:14,cursor:"pointer"}}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const NOTIF_ICONS={JOB_UPDATE:"🔧",MESSAGE:"💬",CANCELLATION:"⚠️",RECEIPT:"🧾",PAYMENT:"💳",LOCATION:"📍",SUPPORT:"🎧",ACCOUNT:"👤"};
  const notifTimeLabel=(ts)=>{
    const d=new Date(ts), now=new Date();
    const startOfToday=new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime();
    if(ts>=startOfToday) return d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
    return d.toLocaleDateString('en-US',{month:'short',day:'numeric'});
  };
  const groupNotifsByDate=(list)=>{
    const now=new Date();
    const startOfToday=new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime();
    const startOfYesterday=startOfToday-86400000;
    const today=[],yesterday=[],earlier=[];
    list.forEach(n=>{
      if(n.createdAt>=startOfToday) today.push(n);
      else if(n.createdAt>=startOfYesterday) yesterday.push(n);
      else earlier.push(n);
    });
    return [["Today",today],["Yesterday",yesterday],["Earlier",earlier]].filter(([,arr])=>arr.length>0);
  };

  const notifCenterScreen=()=>{
    const sorted=notifications.slice().sort((a,b)=>b.createdAt-a.createdAt);
    const groups=groupNotifsByDate(sorted);
    return(
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",background:BG,position:"relative"}}>
        <div style={{background:W,padding:"14px 20px 16px",borderBottom:`1px solid ${BD}`,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"space-between",gap:14}}>
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            <button onClick={()=>backFrom("notifCenter",{scr:"home",tab:"profile"})} style={{background:"none",border:"none",color:N,fontSize:24,cursor:"pointer",padding:0,lineHeight:1,fontWeight:300}}>‹</button>
            <span style={{fontWeight:700,fontSize:17,color:TX}}>Notifications</span>
          </div>
          {unreadCount>0&&<button onClick={markAllNotifsRead} aria-label="Mark all notifications as read" style={{background:"none",border:"none",color:N,fontSize:13,fontWeight:700,cursor:"pointer",padding:0}}>Mark all as read</button>}
        </div>
        <div className="sc" onClick={()=>{setOpenSwipeId(null);setOpenSwipeDir(null);}} style={{flex:1,overflowY:"auto",padding:sorted.length?"12px 16px":20}}>
          {sorted.length===0?(
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",textAlign:"center",paddingTop:40}}>
              <div style={{fontSize:36,marginBottom:12}}>🔔</div>
              <div style={{fontWeight:700,fontSize:16,color:TX,marginBottom:6}}>You're all caught up.</div>
              <div style={{fontSize:13,color:TS,lineHeight:1.5,maxWidth:240}}>We'll let you know when something needs your attention.</div>
            </div>
          ):groups.map(([label,list])=>(
            <div key={label} style={{marginBottom:18}}>
              <div style={{fontSize:11,fontWeight:700,color:TM,letterSpacing:.6,textTransform:"uppercase",marginBottom:8,padding:"0 4px"}}>{label}</div>
              {list.map(n=>{
                const isOpen=openSwipeId===n.id;
                const isDragging=swipeState.id===n.id&&swipeState.dragging&&swipeState.locked;
                const liveOffset=isDragging?Math.max(-160,Math.min(160,swipeState.deltaX)):(isOpen?(openSwipeDir==="left"?-88:88):0);
                return(
                  <div key={n.id} style={{position:"relative",marginBottom:8,borderRadius:14,overflow:"hidden"}}>
                    <div style={{position:"absolute",inset:0,display:"flex"}}>
                      <button onClick={()=>markNotifRead(n.id,!n.isRead)} aria-label={n.isRead?"Mark as unread":"Mark as read"} style={{width:88,background:"#2563EB",border:"none",color:W,fontWeight:700,fontSize:11,cursor:"pointer"}}>{n.isRead?"Mark Unread":"Mark Read"}</button>
                      <div style={{flex:1}}/>
                      <button onClick={()=>deleteNotification(n.id)} aria-label="Delete notification" style={{width:88,background:"#DC2626",border:"none",color:W,fontWeight:700,fontSize:12,cursor:"pointer"}}>Delete</button>
                    </div>
                    <div
                      data-no-edge-swipe
                      onClick={(e)=>{ if(Math.abs(swipeState.deltaX)>5)return; e.stopPropagation(); if(isOpen){setOpenSwipeId(null);setOpenSwipeDir(null);return;} openNotification(n); }}
                      onPointerDown={e=>swipeDown(n.id,e)}
                      onPointerMove={e=>swipeMove(n.id,e)}
                      onPointerUp={()=>swipeUp(n.id)}
                      onPointerLeave={()=>{ if(swipeState.id===n.id&&swipeState.dragging) swipeUp(n.id); }}
                      style={{
                        position:"relative",transform:`translateX(${liveOffset}px)`,
                        transition:isDragging?"none":"transform .18s ease",
                        background:n.isRead?W:SELBG,
                        borderLeft:n.isRead?"none":`3px solid ${SELBORDER}`,
                        padding:"12px 14px",display:"flex",gap:12,alignItems:"flex-start",cursor:"pointer",touchAction:"pan-y",
                      }}>
                      <div style={{width:36,height:36,borderRadius:18,background:n.isRead?BG:SELBORDER,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>{NOTIF_ICONS[n.type]||"🔔"}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",justifyContent:"space-between",gap:8}}>
                          <span style={{fontWeight:700,fontSize:13,color:TX}}>{n.title}{!n.isRead&&<span style={{display:"inline-block",width:6,height:6,borderRadius:3,background:SELBORDER,marginLeft:6,verticalAlign:"middle"}}/>}</span>
                          <span style={{fontSize:11,color:TM,flexShrink:0}}>{notifTimeLabel(n.createdAt)}</span>
                        </div>
                        <div style={{fontSize:12,color:TS,marginTop:2,lineHeight:1.4}}>{n.body}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        {showUndoToast&&(
          <div style={{position:"absolute",left:16,right:16,bottom:96,background:N,borderRadius:14,padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",boxShadow:"0 8px 24px rgba(0,0,0,.25)"}}>
            <span style={{color:W,fontSize:13,fontWeight:600}}>Notification deleted</span>
            <button onClick={undoDeleteNotification} style={{background:"none",border:"none",color:"#FBBF24",fontWeight:800,fontSize:13,cursor:"pointer"}}>Undo</button>
          </div>
        )}
        {showUnavailableToast&&(
          <div style={{position:"absolute",left:16,right:16,bottom:96,background:N,borderRadius:14,padding:"12px 16px",textAlign:"center",boxShadow:"0 8px 24px rgba(0,0,0,.25)"}}>
            <span style={{color:W,fontSize:13,fontWeight:600}}>This item is no longer available.</span>
          </div>
        )}
      </div>
    );
  };


  // ── HELP & SUPPORT ────────────────────────────────────────────────────────
  const helpScreen=()=>{
    if(showSupportChat) return(
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",background:BG}}>
        {subHeader("Support chat",()=>setShowSupportChat(false))}
        <div className="sc" style={{flex:1,overflowY:"auto",padding:"16px 20px"}}>
          {supportMsgs.map(m=>{
            const mine=m.f==="me";
            return(
              <div key={m.id} style={{display:"flex",flexDirection:mine?"row-reverse":"row",gap:10,marginBottom:14,alignItems:"flex-end"}}>
                {!mine&&<div style={{width:30,height:30,borderRadius:15,background:N,display:"flex",alignItems:"center",justifyContent:"center",color:W,fontWeight:700,fontSize:13,flexShrink:0}}>🎧</div>}
                <div style={{maxWidth:"72%"}}>
                  <div style={{background:mine?N:W,borderRadius:mine?"18px 18px 4px 18px":"18px 18px 18px 4px",padding:"10px 14px",boxShadow:mine?"none":"0 1px 4px rgba(28,43,58,.08)"}}>
                    <div style={{fontSize:14,color:mine?W:TX,lineHeight:1.45}}>{m.m}</div>
                  </div>
                  <div style={{fontSize:10,color:TM,marginTop:4,textAlign:mine?"right":"left",fontWeight:500}}>{m.t}</div>
                </div>
              </div>
            );
          })}
          {supportTyping&&(
            <div style={{display:"flex",gap:10,marginBottom:14,alignItems:"flex-end"}}>
              <div style={{width:30,height:30,borderRadius:15,background:N,display:"flex",alignItems:"center",justifyContent:"center",color:W,fontWeight:700,fontSize:13,flexShrink:0}}>🎧</div>
              <div style={{background:W,borderRadius:"18px 18px 18px 4px",padding:"12px 16px",boxShadow:"0 1px 4px rgba(28,43,58,.08)"}}>
                <div style={{display:"flex",gap:4,alignItems:"center"}}>
                  {[0,1,2].map(i=><div key={i} style={{width:7,height:7,borderRadius:3.5,background:TM,opacity:.7,animation:`bounce 0.6s ${i*0.15}s infinite alternate`}}/>)}
                </div>
              </div>
            </div>
          )}
        </div>
        <div style={{flexShrink:0,padding:"12px 16px 24px",background:W,borderTop:`1px solid ${BD}`,display:"flex",gap:10,alignItems:"center"}}>
          <input value={supportInput} onChange={e=>setSupportInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendSupportMsg()}
            placeholder="Describe your issue…"
            style={{flex:1,background:BG,border:`1.5px solid ${BD}`,borderRadius:24,padding:"12px 18px",fontSize:14,color:TX,outline:"none"}}/>
          <button onClick={sendSupportMsg} style={{width:46,height:46,borderRadius:23,background:supportInput.trim()?N:BD,border:"none",color:W,fontSize:18,cursor:supportInput.trim()?"pointer":"default",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>➤</button>
        </div>
      </div>
    );
    return(
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",background:BG}}>
        {subHeader("Help & support",()=>backFrom("help",{scr:"home",tab:"profile"}))}
        <div className="sc" style={{flex:1,overflowY:"auto",padding:20}}>
          <a href={SUPPORT_PHONE_LINK} style={{textDecoration:"none",background:W,borderRadius:18,padding:16,marginBottom:12,boxShadow:"0 2px 10px rgba(28,43,58,.07)",display:"flex",gap:12,alignItems:"center",cursor:"pointer"}}>
            <span style={{fontSize:22}}>📞</span>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,fontSize:14,color:TX}}>Speak with support</div>
              <div style={{fontSize:13,fontWeight:700,color:N,marginTop:2}}>{SUPPORT_PHONE_DISPLAY}</div>
            </div>
            <span style={{color:TM,fontSize:18}}>›</span>
          </a>
          <div onClick={()=>setShowSupportChat(true)} style={{background:W,borderRadius:18,padding:16,marginBottom:16,boxShadow:"0 2px 10px rgba(28,43,58,.07)",display:"flex",gap:12,alignItems:"center",cursor:"pointer"}}>
            <span style={{fontSize:22}}>💬</span>
            <div style={{flex:1}}><div style={{fontWeight:700,fontSize:14,color:TX}}>Chat with support</div><div style={{fontSize:12,color:TS,marginTop:2}}>Avg. response time: 3 minutes</div></div>
            <span style={{color:TM,fontSize:18}}>›</span>
          </div>
          <div style={{fontSize:12,fontWeight:700,color:TM,letterSpacing:.6,textTransform:"uppercase",marginBottom:10}}>Common topics</div>
          <div style={{background:W,borderRadius:18,overflow:"hidden",boxShadow:"0 2px 10px rgba(28,43,58,.07)",marginBottom:16}}>
            {TOPICS.map((topic,i)=>{
              const open=openTopicIdx===i;
              return(
                <div key={topic.t} style={{borderBottom:i<TOPICS.length-1?`1px solid ${BD}`:"none"}}>
                  <div onClick={()=>setOpenTopicIdx(open?null:i)} style={{padding:"14px 18px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}>
                    <span style={{fontSize:14,color:TX,fontWeight:500}}>{topic.t}</span>
                    <span style={{color:TM,transform:open?"rotate(90deg)":"none",display:"inline-block"}}>›</span>
                  </div>
                  {open&&<div style={{padding:"0 18px 16px",fontSize:13,color:TS,lineHeight:1.6}}>{topic.a}</div>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // ── TASK DETAIL ────────────────────────────────────────────────────────────
  // ── TASK DETAIL / BOOK SCREEN ────────────────────────────────────────────────
  // Single screen: everything needed to post a job lives here — description,
  // address/payment (smart defaults), time, and optional photos. Tapping
  // "Post Job" posts immediately; no separate photo or confirmation screen.
  const taskScreen=()=>{
    if(!browsedTask) return unavailableScreen("Service",()=>backFrom("task",{scr:"home",tab:"home"}));
    return(
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div className="sc" style={{flex:1,overflowY:"auto",background:BG}}>
          <div style={{background:N,padding:"14px 20px 34px"}}>
            <button onClick={()=>{if(hasDraft)setShowDiscardConfirm(true);else backFrom("task",{scr:"home",tab:"home"});}} style={{background:"rgba(255,255,255,.12)",border:"none",color:W,padding:"8px 16px",borderRadius:12,cursor:"pointer",fontSize:13,fontWeight:600,marginBottom:16,display:"inline-flex",alignItems:"center",gap:6}}>← Back</button>
            <div style={{display:"flex",alignItems:"center",gap:14}}>
              <div style={{fontSize:38,flexShrink:0}}>{browsedTask.e}</div>
              <div style={{flex:1,minWidth:0}}>
                {emergency&&<span style={{display:"inline-flex",alignItems:"center",gap:4,background:"rgba(255,255,255,.15)",color:"#FFD4C7",fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:20,marginBottom:5}}>🚨 Emergency</span>}
                <div style={{color:W,fontWeight:800,fontSize:18,lineHeight:1.25}}>{browsedTask.n}</div>
                <div style={{color:"rgba(255,255,255,.5)",fontSize:12,marginTop:2}}>Fixed price</div>
              </div>
              <div style={{textAlign:"right",flexShrink:0}}>
                <div style={{color:W,fontWeight:900,fontSize:24}}>${total}</div>
                {(surge>0||emergency)&&<div style={{color:"#FFD4C7",fontSize:10,fontWeight:600}}>{surge>0&&`+$${surge} surge`}{surge>0&&emergency&&" · "}{emergency&&`+$${EMERGENCY_FEE} priority`}</div>}
              </div>
            </div>
          </div>

          <div style={{background:BG,borderRadius:"22px 22px 0 0",marginTop:-18,padding:"18px 20px 16px",position:"relative",zIndex:1}}>
            {addressPaymentCard()}

            {!emergency&&(()=>{
              const dur=getExpectedDuration(browsedTask.t);
              return(
                <div style={{background:W,borderRadius:18,padding:16,marginBottom:16,boxShadow:"0 2px 10px rgba(28,43,58,.07)",display:"flex",gap:12,alignItems:"flex-start"}}>
                  <span style={{fontSize:20,flexShrink:0}}>⏱️</span>
                  <div>
                    <div style={{fontSize:11,fontWeight:700,color:TM,letterSpacing:.6,textTransform:"uppercase",marginBottom:3}}>Expected time</div>
                    <div style={{fontWeight:700,fontSize:15,color:TX}}>{formatDurationRange(dur.estimatedDurationMin,dur.estimatedDurationMax)}</div>
                    {dur.mayRequireInspection&&<div style={{fontSize:12,color:TS,marginTop:4,lineHeight:1.4}}>Could take longer if hidden damage or additional materials are discovered.</div>}
                  </div>
                </div>
              );
            })()}

            <div style={{fontWeight:700,fontSize:14,color:TX,marginBottom:8}}>{emergency?"Emergency timing":"When do you need it?"}</div>
            {emergency&&<div style={{fontSize:12,color:"#C2410C",marginBottom:10}}>Urgent issues, handled within 6 hours.</div>}
            {timeChips(emergency?EMERGENCY_TIME_PREFS:TIME_PREFS,emergency)}

            {photoRow()}

            <div style={{background:W,borderRadius:18,padding:16,marginBottom:4,boxShadow:"0 2px 10px rgba(28,43,58,.07)"}}>
              <div style={{fontSize:11,fontWeight:700,color:TM,letterSpacing:.8,textTransform:"uppercase",marginBottom:8}}>Anything else we should know?</div>
              <textarea value={desc} onChange={e=>setDesc(e.target.value)} maxLength={500} rows={2}
                placeholder="Optional — e.g. wall type, access notes, anything a pro should bring"
                style={{width:"100%",border:"none",resize:"none",background:"transparent",color:TX,fontSize:14,lineHeight:1.5,outline:"none",padding:0}}/>
            </div>
          </div>
        </div>
        <div style={{flexShrink:0,padding:"14px 20px 22px",background:W,borderTop:`1px solid ${BD}`}}>
          <button onClick={postJob} disabled={!selectedAddress} style={{width:"100%",padding:18,borderRadius:18,border:"none",background:selectedAddress?AM:"#DDD9D2",color:selectedAddress?W:TM,fontWeight:800,fontSize:17,cursor:selectedAddress?"pointer":"default",boxShadow:selectedAddress?`0 6px 20px rgba(245,158,11,.35)`:"none"}}>
            {selectedAddress?`Post Job — $${total}`:"Add an address to continue"}
          </button>
        </div>
      </div>
    );
  };

  // ── CUSTOM JOB ─────────────────────────────────────────────────────────────
  const customScreen=()=>{
    const canPost = ctitle.trim() && cprice && selectedAddress;
    return(
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div className="sc" style={{flex:1,overflowY:"auto",background:BG}}>
        <div style={{background:N,padding:"14px 20px 30px"}}>
          <button onClick={()=>{if(hasDraft)setShowDiscardConfirm(true);else backFrom("custom",{scr:"home",tab:"home"});}} style={{background:"rgba(255,255,255,.12)",border:"none",color:W,padding:"8px 16px",borderRadius:12,cursor:"pointer",fontSize:13,fontWeight:600,marginBottom:16,display:"inline-flex",alignItems:"center",gap:6}}>← Back</button>
          <div style={{fontWeight:800,fontSize:20,color:W,marginBottom:4}}>Post a custom job</div>
          <div style={{fontSize:13,color:"rgba(255,255,255,.6)"}}>Describe any job and local pros will respond.</div>
          {emergency&&<span style={{display:"inline-flex",alignItems:"center",gap:4,background:"rgba(255,255,255,.15)",color:"#FFD4C7",fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:20,marginTop:8}}>🚨 Emergency</span>}
        </div>
        <div style={{background:BG,borderRadius:"22px 22px 0 0",marginTop:-16,padding:"18px 20px 16px",position:"relative",zIndex:1}}>

          <div style={{background:W,borderRadius:18,padding:16,marginBottom:12,boxShadow:"0 2px 10px rgba(28,43,58,.07)"}}>
            <div style={{fontSize:11,fontWeight:700,color:TM,letterSpacing:.8,textTransform:"uppercase",marginBottom:8}}>What needs to be done?</div>
            <input value={ctitle} onChange={e=>setCtitle(e.target.value)} placeholder="e.g. Pressure wash my driveway"
              style={{width:"100%",border:"none",fontSize:16,fontWeight:600,color:TX,background:"transparent",outline:"none",padding:0,marginBottom:10}}/>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {JOB_CATS.map(c=>{
                const a=ccat===c;
                return <button key={c} onClick={()=>setCcat(c)} style={{border:"none",borderRadius:20,padding:"6px 12px",fontSize:11,cursor:"pointer",fontWeight:a?700:500,background:a?N:BG,color:a?W:TS}}>{c}</button>;
              })}
            </div>
          </div>

          <div style={{background:W,borderRadius:18,padding:16,marginBottom:12,boxShadow:"0 2px 10px rgba(28,43,58,.07)"}}>
            <div style={{fontSize:11,fontWeight:700,color:TM,letterSpacing:.8,textTransform:"uppercase",marginBottom:8}}>Your budget</div>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:20,fontWeight:700,color:AM}}>$</span>
              <input type="number" value={cprice} onChange={e=>setCprice(e.target.value)} placeholder="0"
                style={{border:"none",fontSize:20,fontWeight:700,color:TX,background:"transparent",outline:"none",width:"100%",padding:0}}/>
            </div>
            {emergency&&<div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${BD}`,display:"flex",justifyContent:"space-between"}}><span style={{fontSize:12,color:"#C2410C",fontWeight:600}}>🚨 Emergency priority fee</span><span style={{fontSize:12,color:"#C2410C",fontWeight:700}}>+${EMERGENCY_FEE}</span></div>}
          </div>

          {addressPaymentCard()}

          <div style={{fontWeight:700,fontSize:14,color:TX,marginBottom:8}}>{emergency?"Emergency timing":"When do you need it?"}</div>
          {emergency&&<div style={{fontSize:12,color:"#C2410C",marginBottom:10}}>Urgent issues, handled within 6 hours.</div>}
          {timeChips(emergency?EMERGENCY_TIME_PREFS:TIME_PREFS,emergency)}

          {photoRow()}

          <div style={{background:W,borderRadius:18,padding:16,marginBottom:4,boxShadow:"0 2px 10px rgba(28,43,58,.07)"}}>
            <div style={{fontSize:11,fontWeight:700,color:TM,letterSpacing:.8,textTransform:"uppercase",marginBottom:8}}>Anything else we should know?</div>
            <textarea value={desc} onChange={e=>setDesc(e.target.value)} maxLength={500} rows={2}
              placeholder="Optional — access details, tools needed, materials on hand"
              style={{width:"100%",border:"none",resize:"none",background:"transparent",color:TX,fontSize:14,lineHeight:1.5,outline:"none",padding:0}}/>
          </div>
        </div>
      </div>
      <div style={{flexShrink:0,padding:"14px 20px 22px",background:W,borderTop:`1px solid ${BD}`}}>
        <button onClick={postJob} disabled={!canPost}
          style={{width:"100%",padding:18,borderRadius:18,border:"none",background:canPost?AM:"#DDD9D2",color:canPost?W:TM,fontWeight:800,fontSize:17,cursor:canPost?"pointer":"default",boxShadow:canPost?`0 6px 20px rgba(245,158,11,.35)`:"none"}}>
          {canPost?`Post Job — $${total}`:!selectedAddress?"Add an address to continue":"Add a title & budget to continue"}
        </button>
      </div>
    </div>
  );};

  // ── POSTED / PENDING ────────────────────────────────────────────────────────
  const postedScreen=()=>{
    if(!vj) return unavailableScreen("Booking",goBookings);
    return(
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",background:BG}}>
        <div style={{background:N,padding:"14px 20px 20px",flexShrink:0,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <button onClick={goBookings} style={{background:"rgba(255,255,255,.12)",border:"none",color:W,padding:"8px 16px",borderRadius:12,cursor:"pointer",fontSize:13,fontWeight:600,display:"inline-flex",alignItems:"center",gap:6}}>← Bookings</button>
          <span style={{color:"rgba(255,255,255,.6)",fontSize:13,fontWeight:600}}>Pending</span>
        </div>
        <div className="sc" style={{flex:1,overflowY:"auto",padding:"0 20px 24px"}}>
          <div style={{textAlign:"center",padding:"28px 0 22px"}}>
            <div style={{width:72,height:72,borderRadius:36,background:vj.emergency?"#FFF1EE":"#FEF3C7",display:"flex",alignItems:"center",justifyContent:"center",fontSize:36,margin:"0 auto 16px",animation:"pulse 1.8s ease-in-out infinite"}}>{vj.emergency?"🚨":"📋"}</div>
            {vj.emergency&&<span style={{display:"inline-flex",alignItems:"center",gap:5,background:"#FFF1EE",color:"#C2410C",fontSize:11,fontWeight:700,padding:"4px 10px",borderRadius:20,marginBottom:10}}>Emergency priority</span>}
            <div style={{fontWeight:800,fontSize:22,color:TX,marginBottom:8}}>{vj.emergency?"Prioritizing nearby available pros…":"Looking for a pro…"}</div>
            <div style={{fontSize:14,color:TS,lineHeight:1.6}}>{vj.emergency?"Your job is flagged as urgent — nearby pros are notified first.":"Verified pros near you can see your job and are deciding whether to accept."}</div>
          </div>
          <div style={{background:W,borderRadius:20,padding:18,marginBottom:14,boxShadow:"0 2px 10px rgba(28,43,58,.07)"}}>
            <div style={{display:"flex",gap:14,alignItems:"center",paddingBottom:14,marginBottom:14,borderBottom:`1px solid ${BD}`}}>
              <div style={{width:52,height:52,borderRadius:26,background:"#FEF3C7",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,flexShrink:0}}>{vjTask?vjTask.e:"🔧"}</div>
              <div><div style={{fontWeight:700,fontSize:16,color:TX}}>{vjTask?vjTask.n:"Custom job"}</div><div style={{fontWeight:800,fontSize:20,color:AM,marginTop:2}}>${vjTotal}</div></div>
            </div>
            {[["When",vjTp?vjTp.label:"—"],["Window",vjTp?vjTp.sub:"—"],["Photos",vj.photos?.length>0?`${vj.photos.length} added`:"None"]].map(([l,v])=>(
              <div key={l} style={{display:"flex",justifyContent:"space-between",marginBottom:9}}><span style={{color:TS,fontSize:13}}>{l}</span><span style={{fontWeight:600,fontSize:13,color:TX}}>{v}</span></div>
            ))}
            {vj.desc&&<div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${BD}`}}><div style={{fontSize:11,fontWeight:700,color:TM,marginBottom:4}}>DESCRIPTION</div><div style={{fontSize:13,color:TS,lineHeight:1.5,fontStyle:"italic"}}>"{vj.desc}"</div></div>}
          </div>
          <div style={{background:W,borderRadius:20,padding:18,marginBottom:14,boxShadow:"0 2px 10px rgba(28,43,58,.07)"}}>
            <div style={{fontSize:11,fontWeight:700,color:TM,letterSpacing:.8,textTransform:"uppercase",marginBottom:14}}>Pros near you viewing this job</div>
            {PROS.map((p,i)=>(
              <div key={p.i} onClick={()=>openProProfile(p,"posted")} style={{display:"flex",gap:12,alignItems:"center",marginBottom:i<PROS.length-1?12:0,cursor:"pointer"}}>
                <div style={{width:40,height:40,borderRadius:20,background:p.col,display:"flex",alignItems:"center",justifyContent:"center",color:W,fontWeight:700,fontSize:13,flexShrink:0}}>{p.i}</div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:600,fontSize:14,color:TX,marginBottom:2}}>{p.n}</div>
                  {trustBadge(p.trustScore,11)}
                </div>
                <div style={{display:"flex",gap:3,alignItems:"center"}}>{[0,1,2].map(d=><div key={d} style={{width:5,height:5,borderRadius:2.5,background:AM,animation:`bounce 0.5s ${d*0.18}s infinite alternate`}}/>)}</div>
              </div>
            ))}
          </div>
          {demoProControlsPanel([["Accept job (start travel)",proAccepts]])}
          {!showCancelConfirm?(
            <div style={{textAlign:"center"}}>
              <button onClick={()=>setShowCancelConfirm(true)} style={{background:"none",border:`1.5px solid #FCA5A5`,color:"#DC2626",fontSize:13,fontWeight:700,cursor:"pointer",padding:"10px 20px",borderRadius:12}}>Cancel Job</button>
            </div>
          ):(
            <div style={{background:"#FEF2F2",border:"1px solid #FCA5A5",borderRadius:16,padding:16,textAlign:"center"}}>
              <div style={{fontSize:13,fontWeight:700,color:"#DC2626",marginBottom:4}}>Cancel this job?</div>
              <div style={{fontSize:12,color:"#991B1B",marginBottom:12}}>No pro has accepted yet, so this cancels immediately with no fee.</div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>setShowCancelConfirm(false)} style={{flex:1,padding:"9px 0",borderRadius:10,border:`1.5px solid ${BD}`,background:W,color:TS,fontWeight:600,fontSize:12,cursor:"pointer"}}>Keep job</button>
                <button onClick={cancelJobDirect} style={{flex:1,padding:"9px 0",borderRadius:10,border:"none",background:"#DC2626",color:W,fontWeight:700,fontSize:12,cursor:"pointer"}}>Yes, cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── TRACKING MAP ────────────────────────────────────────────────────────────
  const trackMap=()=>{
    const px=vjSIdx>=1?240:60+vjSIdx*90; const showCar=vjSIdx<3;
    return(
      <svg width="100%" height="185" viewBox="0 0 350 185" style={{display:"block"}}>
        <rect width="350" height="185" fill="#E8EBF2"/>
        <rect x="10" y="12" width="52" height="50" rx="4" fill="#D5D9E8"/><rect x="100" y="12" width="78" height="50" rx="4" fill="#D5D9E8"/><rect x="220" y="12" width="52" height="50" rx="4" fill="#D5D9E8"/><rect x="300" y="12" width="38" height="50" rx="4" fill="#D5D9E8"/>
        <rect x="10" y="115" width="52" height="38" rx="4" fill="#D5D9E8"/><rect x="100" y="115" width="78" height="38" rx="4" fill="#D5D9E8"/><rect x="220" y="115" width="118" height="38" rx="4" fill="#D5D9E8"/>
        <rect x="0" y="74" width="350" height="18" fill={W}/><rect x="72" y="0" width="14" height="185" fill={W}/><rect x="192" y="0" width="14" height="185" fill={W}/><rect x="292" y="0" width="14" height="185" fill={W}/>
        {[90,130,170,210,250].map(x=><rect key={x} x={x} y="82" width="14" height="2" rx="1" fill="#C5CAD8"/>)}
        {showCar&&vjSIdx<1&&<line x1={px+14} y1={83} x2={224} y2={83} stroke={N} strokeWidth="3" strokeDasharray="8,5" opacity="0.4"/>}
        {vjSIdx<3&&<><circle cx={240} cy={83} r="18" fill={W} stroke={N} strokeWidth="2.5"/><text x="240" y="88" textAnchor="middle" fontSize="14">🏠</text></>}
        {vjSIdx===3&&<><circle cx={240} cy={83} r="22" fill={SL}/><circle cx={240} cy={83} r="16" fill={SC}/><text x="240" y="89" textAnchor="middle" fontSize="14" fill={W} fontWeight="900">✓</text></>}
        {showCar&&<><circle cx={px} cy={83} r="20" fill={N} opacity="0.12"/><circle cx={px} cy={83} r="14" fill={N}/><text x={px} y="88" textAnchor="middle" fontSize="13">🚗</text></>}
        {vj?.status==="en_route"&&<><rect x={px-2} y="50" width="90" height="21" rx="10" fill={AM}/><text x={px+43} y="65" textAnchor="middle" fontSize="11" fill={W} fontWeight="700">{vjArrivalSim?`${vjArrivalSim.minutesAway} min away`:"On the way"}</text></>}
        {vj?.status==="arrived"&&<><rect x="138" y="50" width="104" height="21" rx="10" fill={SC}/><text x="190" y="65" textAnchor="middle" fontSize="11" fill={W} fontWeight="700">{vjPname} is here!</text></>}
      </svg>
    );
  };

  // ── TRACKING ────────────────────────────────────────────────────────────────
  const trackingScreen=()=>{
    if(!vj) return unavailableScreen("Tracking",goBookings);
    const info=SI[vj.status]||SI.en_route;
    const emBg={en_route:"#FEF3C7",arrived:"#DBEAFE",in_progress:"#FEF3C7",complete:SL}[vj.status]||"#FEF3C7";
    return(
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",background:BG}}>
        {vj.justAccepted&&(
          <div style={{background:SC,padding:"12px 20px",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
            <span style={{fontSize:20}}>🎉</span>
            <div><div style={{color:W,fontWeight:700,fontSize:14}}>{vjPro.n} accepted your job!</div><div style={{color:"rgba(255,255,255,.8)",fontSize:12}}>They're on their way</div></div>
          </div>
        )}
        <div style={{background:W,padding:"12px 20px 14px",borderBottom:`1px solid ${BD}`,flexShrink:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <button onClick={goBookings} style={{background:"none",border:"none",color:N,fontSize:14,fontWeight:700,cursor:"pointer",padding:0}}>← Bookings</button>
            <span style={{fontWeight:700,fontSize:15,color:TX}}>{vjTask?vjTask.n:"Your job"}</span>
            <button onClick={()=>openHelp()} style={{background:"none",border:"none",color:N,fontSize:14,fontWeight:600,cursor:"pointer",padding:0}}>Help</button>
          </div>
          <div style={{display:"flex",alignItems:"center"}}>
            {SF.map((s,i)=>{
              const isL=i===SF.length-1;const past=i<vjSIdx;const curr=i===vjSIdx;const sz=curr?20:16;
              return(
                <div key={s} style={{display:"flex",alignItems:"center",flex:isL?0:1}}>
                  <div style={{width:sz,height:sz,borderRadius:sz/2,background:i<=vjSIdx?N:BD,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    {past&&<span style={{color:W,fontSize:8,fontWeight:900}}>✓</span>}
                    {curr&&<div style={{width:7,height:7,borderRadius:3.5,background:W}}/>}
                  </div>
                  {!isL&&<div style={{flex:1,height:2.5,background:past?N:BD,margin:"0 3px"}}/>}
                </div>
              );
            })}
          </div>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:5}}>
            {["En Route","Arrived","Working","Done"].map((l,i)=>(
              <span key={l} style={{fontSize:9,color:i<=vjSIdx?N:TM,fontWeight:i===vjSIdx?700:400,flex:i===0||i===3?0:1,textAlign:i===0?"left":i===3?"right":"center",width:i===0||i===3?44:undefined,flexShrink:0}}>{l}</span>
            ))}
          </div>
        </div>
        <div className="sc" style={{flex:1,overflowY:"auto"}}>
          <div style={{margin:"14px 20px 0",background:W,borderRadius:20,padding:"16px 18px",boxShadow:"0 2px 10px rgba(28,43,58,.07)",display:"flex",gap:14,alignItems:"center"}}>
            <div style={{width:52,height:52,borderRadius:26,background:emBg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,flexShrink:0}}>{info.em}</div>
            <div><div aria-live="polite" style={{fontWeight:800,fontSize:17,color:TX,marginBottom:3}}>{info.label}</div><div style={{fontSize:13,color:TS}}>{vjPname} {info.sub}</div></div>
          </div>
          <div style={{margin:"12px 20px",borderRadius:20,overflow:"hidden",boxShadow:"0 2px 10px rgba(28,43,58,.07)"}}>{trackMap()}</div>
          {vjArrivalSim&&(
            <div style={{margin:"0 20px 12px",background:W,borderRadius:20,padding:18,boxShadow:"0 2px 10px rgba(28,43,58,.07)"}}>
              {vjArrivalSim.stage!=="tight"?(
                <>
                  <div style={{fontSize:11,fontWeight:700,color:TM,letterSpacing:.6,textTransform:"uppercase",marginBottom:4}}>Arriving</div>
                  <div aria-live="polite" style={{fontWeight:800,fontSize:20,color:TX}}>{vjArrivalSim.windowLabel}</div>
                </>
              ):(
                <>
                  <div aria-live="polite" style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:10}}>
                    <span style={{fontSize:11,fontWeight:700,color:TM,letterSpacing:.6,textTransform:"uppercase"}}>Time remaining</span>
                    <span style={{fontWeight:800,fontSize:18,color:TX}}>{vjArrivalSim.minutesAway} min away</span>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:10,paddingTop:10,borderTop:`1px solid ${BD}`}}>
                    <span style={{fontSize:11,fontWeight:700,color:TM,letterSpacing:.6,textTransform:"uppercase"}}>Distance remaining</span>
                    <span style={{fontWeight:700,fontSize:14,color:TX}}>{vjArrivalSim.milesAway} miles</span>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",paddingTop:10,borderTop:`1px solid ${BD}`}}>
                    <span style={{fontSize:11,fontWeight:700,color:TM,letterSpacing:.6,textTransform:"uppercase"}}>Estimated arrival</span>
                    <span style={{fontWeight:700,fontSize:14,color:TX}}>{vjArrivalSim.etaTime}</span>
                  </div>
                </>
              )}
            </div>
          )}
          <div style={{margin:"0 20px 12px",background:W,borderRadius:20,padding:18,boxShadow:"0 2px 10px rgba(28,43,58,.07)"}}>
            <div onClick={()=>openProProfile(vjPro,"tracking")} style={{display:"flex",gap:14,alignItems:"center",marginBottom:14,cursor:"pointer"}}>
              <div style={{width:50,height:50,borderRadius:25,background:vjPro.col,display:"flex",alignItems:"center",justifyContent:"center",color:W,fontWeight:800,fontSize:16,flexShrink:0}}>{vjPro.i}</div>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:15,color:TX}}>{vjPro.n}</div>
                <div style={{color:AM,fontSize:12,fontWeight:600,marginBottom:6}}>{vjPro.s}</div>
                {trustLine(vjPro)}
                <div style={{fontSize:11,color:TM,marginTop:4}}>⭐ {vjPro.r} · {vjPro.j} jobs</div>
              </div>
              <span style={{color:TM,fontSize:18,alignSelf:"flex-start"}}>›</span>
            </div>
            <button onClick={()=>goTo("messages")} style={{width:"100%",padding:"11px 0",borderRadius:14,border:`1.5px solid ${vj.status==="complete"?BD:N}`,background:vj.status==="complete"?BG:"rgba(28,43,58,.06)",color:vj.status==="complete"?TM:N,fontWeight:700,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:7}}>
              💬 {vj.status==="complete"?"Chat (closed)":"Message"}
            </button>
          </div>
          <div style={{margin:"0 20px 12px",background:W,borderRadius:20,padding:18,boxShadow:"0 2px 10px rgba(28,43,58,.07)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <span style={{fontSize:11,fontWeight:700,color:TM,letterSpacing:.8,textTransform:"uppercase"}}>Booking Summary</span>
              {vj.emergency&&<span style={{fontSize:11,fontWeight:700,color:"#C2410C",background:"#FFF1EE",padding:"4px 10px",borderRadius:20}}>🚨 Emergency priority</span>}
            </div>
            {[["Service",vjTask?vjTask.n:"Custom job"],["Time",vjTp?vjTp.label:"—"],["Photos",vj.photos?.length>0?`${vj.photos.length} shared`:"None"],
              ...(vj.emergency?[["Emergency fee",`+$${vj.emergencyFee}`]]:[]),
              ["Total",`$${vjTotal}`]].map(([l,v])=>(
              <div key={l} style={{display:"flex",justifyContent:"space-between",marginBottom:9}}><span style={{color:TS,fontSize:13}}>{l}</span><span style={{fontWeight:600,fontSize:13,color:l==="Total"?AM:TX}}>{v}</span></div>
            ))}
            {vj.desc&&<div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${BD}`}}><div style={{fontSize:11,fontWeight:700,color:TM,marginBottom:4}}>DESCRIPTION</div><div style={{fontSize:13,color:TS,lineHeight:1.5}}>{vj.desc}</div></div>}
          </div>
          {vj.status!=="complete"?(
            <>
              {demoProControlsPanel([[{en_route:"Arrive",arrived:"Start work",in_progress:"Complete job"}[vj.status]||"Advance",advance]])}
              {vj.cancelStatus==="requested"?(
                <div style={{margin:"0 20px 24px",background:"#FEF2F2",border:"1px solid #FCA5A5",borderRadius:16,padding:16,textAlign:"center"}}>
                  <div style={{fontSize:13,fontWeight:700,color:"#DC2626",marginBottom:4}}>Pending Cancellation</div>
                  <div style={{fontSize:12,color:"#991B1B",lineHeight:1.5}}>Haven Support will review timing and any work already performed, then follow up with you.</div>
                </div>
              ):!showCancelRequest?(
                <div style={{margin:"0 20px 24px",textAlign:"center"}}>
                  <button onClick={()=>setShowCancelRequest(true)} style={{background:"none",border:"none",color:TM,fontSize:12,cursor:"pointer",textDecoration:"underline",padding:"8px 0"}}>Need to cancel this job?</button>
                </div>
              ):(
                <div style={{margin:"0 20px 24px",background:W,borderRadius:18,padding:18,boxShadow:"0 2px 10px rgba(28,43,58,.07)"}}>
                  <div style={{fontWeight:700,fontSize:14,color:TX,marginBottom:6}}>Cancel this job?</div>
                  <div style={{fontSize:12,color:TS,lineHeight:1.5,marginBottom:14}}>A pro has already accepted. Haven Support may need to review timing, work already performed, or applicable fees before this can be cancelled.</div>
                  <button onClick={()=>setShowCancelRequest(false)} style={{width:"100%",padding:12,borderRadius:12,border:"none",background:AM,color:W,fontWeight:700,fontSize:13,cursor:"pointer",marginBottom:8}}>Continue with job</button>
                  <button onClick={requestCancellation} style={{width:"100%",padding:12,borderRadius:12,border:`1.5px solid ${BD}`,background:BG,color:TX,fontWeight:700,fontSize:13,cursor:"pointer",marginBottom:8}}>Request cancellation</button>
                  <button onClick={()=>{setShowCancelRequest(false);openHelp();}} style={{width:"100%",padding:12,borderRadius:12,border:`1.5px solid ${BD}`,background:"transparent",color:TX,fontWeight:700,fontSize:13,cursor:"pointer"}}>Contact Haven Support</button>
                </div>
              )}
            </>
          ):(
            <div style={{margin:"0 20px 24px"}}>
              {!vj.rated?(
                <button onClick={openRating} style={{width:"100%",padding:17,borderRadius:18,border:"none",background:AM,color:W,fontWeight:800,fontSize:16,cursor:"pointer",boxShadow:`0 6px 20px rgba(245,158,11,.35)`,marginBottom:10}}>⭐ Rate {vjPname}</button>
              ):(
                <div style={{background:SL,borderRadius:18,padding:16,textAlign:"center",marginBottom:10}}>
                  <div style={{marginBottom:4}}>{starDisplay(vj.stars,22)}</div>
                  <div style={{fontWeight:700,fontSize:14,color:SC}}>Review submitted — thanks!</div>
                </div>
              )}
              {vj.tipStatus==="paid"?(
                <button onClick={openTip} style={{width:"100%",padding:15,borderRadius:18,border:`1.5px solid ${BD}`,background:"transparent",color:SC,fontWeight:700,fontSize:14,cursor:"pointer",marginBottom:10}}>✓ Tip sent: ${vj.tipAmount.toFixed(2)}</button>
              ):(
                <button onClick={openTip} style={{width:"100%",padding:15,borderRadius:18,border:`1.5px solid ${BD}`,background:"transparent",color:TX,fontWeight:700,fontSize:14,cursor:"pointer",marginBottom:10}}>💛 Tip Pro</button>
              )}
              <button onClick={()=>openReceipt(vj.id)} style={{width:"100%",padding:15,borderRadius:18,border:`1.5px solid ${BD}`,background:"transparent",color:TX,fontWeight:700,fontSize:14,cursor:"pointer"}}>🧾 View Receipt</button>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── RATING ─────────────────────────────────────────────────────────────────
  const tipScreen=()=>{
    if(!vj) return unavailableScreen("Tip Pro",goBookings);
    const presets=[5,10,15,20];
    const parsedCustom=parseFloat(tipCustomAmount);
    const customValid=tipCustomAmount.trim()!==""&&!isNaN(parsedCustom)&&parsedCustom>0&&parsedCustom<=2000;
    const finalAmount=tipSelection==="custom"?(customValid?parsedCustom:null):tipSelection;
    const canConfirm=finalAmount!=null&&finalAmount>0&&vj.tipStatus!=="processing";
    const validateCustom=(val)=>{
      setTipCustomAmount(val);
      if(val.trim()===""){ setTipError(""); return; }
      const n=parseFloat(val);
      if(isNaN(n)){ setTipError("Enter a valid amount."); }
      else if(n<=0){ setTipError("Tip must be greater than $0."); }
      else if(n>2000){ setTipError("That amount seems unusually large — please double-check."); }
      else{ setTipError(""); }
    };
    const confirmTip=()=>{
      if(!canConfirm)return;
      addTipToJob(vj.id,finalAmount);
    };
    const retryTip=()=>{
      if(vj.tipAmount>0){ addTipToJob(vj.id,vj.tipAmount); } // preserve the amount that failed, for retry
      else if(finalAmount!=null){ addTipToJob(vj.id,finalAmount); }
    };
    return(
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",background:BG}}>
        <div style={{background:W,padding:"14px 20px 16px",borderBottom:`1px solid ${BD}`,flexShrink:0}}>
          <button onClick={()=>backFrom("tip",{scr:"tracking",tab:"bookings"})} style={{background:"none",border:"none",color:N,fontSize:14,fontWeight:700,cursor:"pointer",padding:0}}>← Back</button>
        </div>
        <div className="sc" style={{flex:1,overflowY:"auto",padding:"28px 22px"}}>
          <div style={{textAlign:"center",marginBottom:24}}>
            <div style={{width:64,height:64,borderRadius:32,background:vjPro.col,display:"flex",alignItems:"center",justifyContent:"center",color:W,fontWeight:800,fontSize:22,margin:"0 auto 12px"}}>{vjPro.i}</div>
            <div style={{fontWeight:800,fontSize:20,color:TX,marginBottom:4}}>Tip {vjPname}</div>
            <div style={{fontSize:13,color:TS}}>{vjTask?vjTask.n:"Custom job"} · Completed</div>
          </div>

          {vj.tipStatus==="paid"?(
            <div style={{background:SL,borderRadius:18,padding:20,textAlign:"center"}}>
              <div style={{fontSize:28,marginBottom:8}}>✓</div>
              <div style={{fontWeight:800,fontSize:18,color:SC,marginBottom:4}}>Tip sent: ${vj.tipAmount.toFixed(2)}</div>
              <div style={{fontSize:12,color:TS}}>100% of your tip goes to {vjPname}.</div>
            </div>
          ):vj.tipStatus==="failed"?(
            <div style={{background:"#FEF2F2",border:"1px solid #FCA5A5",borderRadius:18,padding:18,textAlign:"center",marginBottom:16}}>
              <div style={{fontWeight:700,fontSize:14,color:"#DC2626",marginBottom:4}}>Tip couldn't be processed</div>
              <div style={{fontSize:12,color:"#991B1B",marginBottom:14,lineHeight:1.4}}>Your card wasn't charged. You can try again.</div>
              <button onClick={retryTip} style={{width:"100%",padding:13,borderRadius:12,border:"none",background:"#DC2626",color:W,fontWeight:700,fontSize:14,cursor:"pointer"}}>Retry Tip</button>
            </div>
          ):(
            <>
              <div style={{fontSize:13,color:TS,textAlign:"center",marginBottom:20,lineHeight:1.5}}>Recognize exceptional service with an optional tip.</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                {presets.map(amt=>(
                  <button key={amt} onClick={()=>{setTipSelection(amt);setTipCustomAmount("");setTipError("");}}
                    style={{padding:"16px 0",borderRadius:14,border:`2px solid ${tipSelection===amt?AM:BD}`,background:tipSelection===amt?"#FEF3C7":W,color:TX,fontWeight:800,fontSize:18,cursor:"pointer"}}>${amt}</button>
                ))}
              </div>
              <button onClick={()=>setTipSelection("custom")} style={{width:"100%",padding:14,borderRadius:14,border:`2px solid ${tipSelection==="custom"?AM:BD}`,background:tipSelection==="custom"?"#FEF3C7":W,color:TX,fontWeight:700,fontSize:14,cursor:"pointer",marginBottom:tipSelection==="custom"?12:20}}>Custom amount</button>
              {tipSelection==="custom"&&(
                <div style={{marginBottom:20}}>
                  <div style={{position:"relative"}}>
                    <span style={{position:"absolute",left:16,top:"50%",transform:"translateY(-50%)",fontSize:16,fontWeight:700,color:TS}}>$</span>
                    <input value={tipCustomAmount} onChange={e=>validateCustom(e.target.value)} placeholder="0.00" inputMode="decimal"
                      style={{width:"100%",padding:"14px 16px 14px 30px",borderRadius:14,border:`1.5px solid ${tipError?"#FCA5A5":BD}`,fontSize:16,fontWeight:700,color:TX,outline:"none"}}/>
                  </div>
                  {tipError&&<div style={{fontSize:12,color:"#DC2626",marginTop:6}}>{tipError}</div>}
                </div>
              )}

              {finalAmount!=null&&finalAmount>0&&(
                <div style={{background:BG,borderRadius:14,padding:14,marginBottom:16,textAlign:"center"}}>
                  <div style={{fontSize:12,color:TS,marginBottom:2}}>You're tipping</div>
                  <div style={{fontSize:22,fontWeight:900,color:TX}}>${finalAmount.toFixed(2)}</div>
                </div>
              )}

              <button onClick={confirmTip} disabled={!canConfirm} style={{width:"100%",padding:16,borderRadius:16,border:"none",background:canConfirm?AM:"#DDD9D2",color:canConfirm?W:TM,fontWeight:800,fontSize:15,cursor:canConfirm?"pointer":"default",marginBottom:10,boxShadow:canConfirm?"0 6px 20px rgba(245,158,11,.3)":"none"}}>
                {vj.tipStatus==="processing"?"Processing…":"Confirm Tip"}
              </button>
              <button onClick={()=>backFrom("tip",{scr:"tracking",tab:"bookings"})} style={{width:"100%",padding:14,borderRadius:16,border:"none",background:"transparent",color:TS,fontWeight:600,fontSize:14,cursor:"pointer"}}>Not Now</button>
            </>
          )}
        </div>
      </div>
    );
  };
  const ratingScreen=()=>{
    if(!vj) return unavailableScreen("Rate your experience",goBookings);
    const HIRE=[["yes","Yes, definitely! 👍"],["maybe","Maybe"],["no","No"]];
    return(
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",background:BG}}>
        <div style={{background:W,padding:"14px 20px 16px",borderBottom:`1px solid ${BD}`,flexShrink:0}}>
          <button onClick={()=>goTo("tracking")} style={{background:"none",border:"none",color:N,fontSize:14,fontWeight:700,cursor:"pointer",padding:0}}>← Back</button>
        </div>
        <div className="sc" style={{flex:1,overflowY:"auto",padding:"28px 22px"}}>
          <div style={{textAlign:"center",marginBottom:28}}>
            <div style={{width:72,height:72,borderRadius:36,background:vjPro.col,display:"flex",alignItems:"center",justifyContent:"center",color:W,fontWeight:800,fontSize:24,margin:"0 auto 14px"}}>{vjPro.i}</div>
            <div style={{fontWeight:800,fontSize:22,color:TX,marginBottom:4}}>Rate {vjPname}</div>
            <div style={{fontSize:14,color:TS}}>{vjPro.s} · ⭐ {vjPro.r} current rating</div>
          </div>
          <div style={{background:W,borderRadius:20,padding:"22px 20px",marginBottom:14,boxShadow:"0 2px 10px rgba(28,43,58,.07)",textAlign:"center"}}>
            <div style={{fontSize:13,fontWeight:600,color:TS,marginBottom:14}}>How was your experience?</div>
            <div
              data-no-edge-swipe
              onPointerDown={()=>setStarDragging(true)}
              onPointerUp={()=>setStarDragging(false)}
              onPointerLeave={()=>setStarDragging(false)}
              style={{position:"relative",display:"inline-flex",gap:4,justifyContent:"center",marginBottom:10,touchAction:"none",userSelect:"none"}}
            >
              {[1,2,3,4,5].map(s=>{
                const filled = s<=Math.floor(stars);
                const isHalfHere = !filled && s===Math.ceil(stars) && stars%1!==0;
                return(
                  <div key={s} style={{position:"relative",width:40,height:40}}>
                    <svg width={40} height={40} viewBox="0 0 24 24" style={{display:"block",position:"absolute",inset:0}}>
                      <path d={STAR_PATH} fill="#DDD"/>
                    </svg>
                    {(filled||isHalfHere)&&<span style={{position:"absolute",inset:0,overflow:"hidden",width:isHalfHere?"50%":"100%"}}>
                      <svg width={40} height={40} viewBox="0 0 24 24" style={{display:"block"}}>
                        <path d={STAR_PATH} fill={AM}/>
                      </svg>
                    </span>}
                    {/* Two invisible half-width hit zones per star — tap selects instantly, dragging/swiping across them live-updates the value continuously */}
                    <div style={{position:"absolute",inset:0,display:"flex"}}>
                      <div onClick={()=>setStars(s-0.5)} onPointerEnter={()=>{if(starDragging)setStars(s-0.5);}} style={{flex:1,cursor:"pointer"}}/>
                      <div onClick={()=>setStars(s)} onPointerEnter={()=>{if(starDragging)setStars(s);}} style={{flex:1,cursor:"pointer"}}/>
                    </div>
                  </div>
                );
              })}
            </div>
            {stars>0&&<div style={{fontWeight:700,fontSize:17,color:AM}}>{stars}★ · {STAR_LABELS[Math.round(stars)]||STAR_LABELS[Math.ceil(stars)]}</div>}
          </div>
          <div style={{background:W,borderRadius:20,padding:18,marginBottom:14,boxShadow:"0 2px 10px rgba(28,43,58,.07)"}}>
            <div style={{fontSize:11,fontWeight:700,color:TM,letterSpacing:.8,textTransform:"uppercase",marginBottom:10}}>Leave a review (optional)</div>
            <textarea value={reviewTxt} onChange={e=>setReviewTxt(e.target.value)} maxLength={300}
              placeholder={`Tell others about your experience with ${vjPname}.`}
              style={{width:"100%",minHeight:90,border:"none",resize:"none",background:"transparent",color:TX,fontSize:14,lineHeight:1.55,outline:"none",padding:0}}/>
            <div style={{fontSize:11,color:TM,textAlign:"right",marginTop:6,paddingTop:6,borderTop:`1px solid ${BD}`}}>{reviewTxt.length}/300</div>
          </div>
          <div style={{background:W,borderRadius:20,padding:18,marginBottom:24,boxShadow:"0 2px 10px rgba(28,43,58,.07)"}}>
            <div style={{fontSize:14,fontWeight:700,color:TX,marginBottom:14}}>Would you hire {vjPname} again?</div>
            <div style={{display:"flex",gap:8}}>
              {HIRE.map(([val,lbl])=>{
                const a=hireAgain===val;
                return(
                  <button key={val} onClick={()=>setHireAgain(a?null:val)} style={{flex:1,padding:"10px 4px",borderRadius:12,border:`1.5px solid ${a?N:BD}`,background:a?N:BG,color:a?W:TS,fontWeight:a?700:500,fontSize:12,cursor:"pointer",lineHeight:1.3}}>{lbl}</button>
                );
              })}
            </div>
          </div>
          <button onClick={submitRating} disabled={stars===0} style={{width:"100%",padding:18,borderRadius:18,border:"none",background:stars>0?AM:"#DDD9D2",color:stars>0?W:TM,fontWeight:800,fontSize:17,cursor:stars>0?"pointer":"default",boxShadow:stars>0?`0 6px 20px rgba(245,158,11,.35)`:"none",marginBottom:12}}>
            {stars>0?"Submit review":"Select a rating first"}
          </button>
          <button onClick={goHome} style={{width:"100%",padding:15,borderRadius:18,border:`1.5px solid ${BD}`,background:"transparent",color:TS,fontWeight:600,fontSize:15,cursor:"pointer"}}>Skip for now</button>
        </div>
      </div>
    );
  };

  // ── MESSAGES ────────────────────────────────────────────────────────────────
  const messagesScreen=()=>{
    if(!vj) return unavailableScreen("Messages",goBookings);
    const locked=vj.status==="complete";
    return(
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",background:BG}}>
        <div style={{background:W,padding:"12px 20px 14px",borderBottom:`1px solid ${BD}`,flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            <button onClick={()=>goTo("tracking")} style={{background:"none",border:"none",color:N,fontSize:24,cursor:"pointer",padding:0,lineHeight:1,fontWeight:300}}>‹</button>
            <div style={{width:38,height:38,borderRadius:19,background:vjPro.col,display:"flex",alignItems:"center",justifyContent:"center",color:W,fontWeight:800,fontSize:14,flexShrink:0}}>{vjPro.i}</div>
            <div>
              <div style={{fontWeight:700,fontSize:15,color:TX}}>{vjPro.n}</div>
              <div style={{fontSize:12,color:locked?"#EF4444":SC,fontWeight:600}}>{locked?"Chat closed":"● Active job"}</div>
            </div>
          </div>
        </div>
        <div style={{background:"#FEF3C7",borderBottom:`1px solid ${BD}`,padding:"10px 20px",display:"flex",gap:10,alignItems:"center",flexShrink:0}}>
          <span style={{fontSize:18}}>{vjTask?vjTask.e:"🔧"}</span>
          <div><div style={{fontSize:12,fontWeight:700,color:"#92400E"}}>{vjTask?vjTask.n:"Custom job"}</div><div style={{fontSize:11,color:TS}}>{vjTp?vjTp.label:"—"} · ${vjTotal}</div></div>
        </div>
        {locked&&<div style={{background:"#FFF1F2",borderBottom:"1px solid #FCC",padding:"10px 20px",textAlign:"center",flexShrink:0}}><span style={{fontSize:12,color:"#E11D48",fontWeight:600}}>🔒 Chat closed — job completed successfully.</span></div>}
        <div className="sc" role="log" aria-live="polite" aria-label="Conversation messages" style={{flex:1,overflowY:"auto",padding:"16px 20px"}}>
          {vjMsgs.length===0&&!typing?(
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",textAlign:"center",paddingTop:40}}>
              <div style={{fontSize:32,marginBottom:10}}>💬</div>
              <div style={{fontWeight:700,fontSize:15,color:TX,marginBottom:6}}>{locked?"No messages were sent.":"No messages yet."}</div>
              <div style={{fontSize:13,color:TS,lineHeight:1.5,maxWidth:220}}>{locked?"This conversation is now closed.":`You'll be able to chat with ${vjPname} here now that the job's been accepted.`}</div>
            </div>
          ):(
            <div style={{textAlign:"center",marginBottom:18}}><span style={{fontSize:11,color:TM,background:BD,padding:"4px 12px",borderRadius:12,fontWeight:500}}>Today</span></div>
          )}
          {vjMsgs.map(m=>{
            const mine=m.f==="cu";
            return(
              <div key={m.id} style={{display:"flex",flexDirection:mine?"row-reverse":"row",gap:10,marginBottom:14,alignItems:"flex-end"}}>
                {!mine&&<div style={{width:30,height:30,borderRadius:15,background:vjPro.col,display:"flex",alignItems:"center",justifyContent:"center",color:W,fontWeight:700,fontSize:11,flexShrink:0}}>{vjPro.i}</div>}
                <div style={{maxWidth:"72%"}}>
                  <div style={{background:mine?N:W,borderRadius:mine?"18px 18px 4px 18px":"18px 18px 18px 4px",padding:"10px 14px",boxShadow:mine?"none":"0 1px 4px rgba(28,43,58,.08)"}}>
                    <div style={{fontSize:14,color:mine?W:TX,lineHeight:1.45}}>{m.m}</div>
                  </div>
                  <div style={{fontSize:10,color:TM,marginTop:4,textAlign:mine?"right":"left",fontWeight:500}}>{m.t}</div>
                </div>
              </div>
            );
          })}
          {typing&&(
            <div style={{display:"flex",gap:10,marginBottom:14,alignItems:"flex-end"}}>
              <div style={{width:30,height:30,borderRadius:15,background:vjPro.col,display:"flex",alignItems:"center",justifyContent:"center",color:W,fontWeight:700,fontSize:11,flexShrink:0}}>{vjPro.i}</div>
              <div style={{background:W,borderRadius:"18px 18px 18px 4px",padding:"12px 16px",boxShadow:"0 1px 4px rgba(28,43,58,.08)"}}>
                <div style={{display:"flex",gap:4,alignItems:"center"}}>
                  {[0,1,2].map(i=><div key={i} style={{width:7,height:7,borderRadius:3.5,background:TM,opacity:.7,animation:`bounce 0.6s ${i*0.15}s infinite alternate`}}/>)}
                </div>
              </div>
            </div>
          )}
          <div ref={msgEnd}/>
        </div>
        <div style={{flexShrink:0,padding:"12px 16px 24px",background:W,borderTop:`1px solid ${BD}`}}>
          {locked?(
            <div style={{textAlign:"center",padding:"12px 0",fontSize:13,color:TM,fontWeight:500}}>🔒 Messaging only available during an active job</div>
          ):(
            <div style={{display:"flex",gap:10,alignItems:"center"}}>
              <input value={minput} onChange={e=>setMinput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendMsg()}
                placeholder={`Message ${vjPname}…`}
                style={{flex:1,background:BG,border:`1.5px solid ${BD}`,borderRadius:24,padding:"12px 18px",fontSize:14,color:TX,outline:"none"}}/>
              <button onClick={sendMsg} style={{width:46,height:46,borderRadius:23,background:minput.trim()?N:BD,border:"none",color:W,fontSize:18,cursor:minput.trim()?"pointer":"default",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>➤</button>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Whether the current screen's top region is the dark navy hero style or
  // a light header — used only to color the safe-area spacer so it blends
  // seamlessly with whichever screen is showing (no visible seam at the top).
  const topIsDark=["task","custom","diagnose","emergency"].includes(scr)||(scr==="home"&&tab==="home");

  // Parameterized render switch — identical to the old inline conditional
  // block, just taking (targetScr, targetTab) instead of always reading the
  // live scr/tab closure variables. The main render call passes the current
  // scr/tab (byte-for-byte equivalent to before this existed); the
  // interactive back gesture also calls this with the *destination*
  // scr/tab so that screen can be shown live underneath while dragging.
  const renderScreenFor=(targetScr,targetTab)=>(
    <>
      {targetScr==="home"     &&targetTab==="home"     &&homeScreen()}
      {targetScr==="browse"   &&browseScreen()}
      {targetScr==="diagnose" &&diagnoseScreen()}
      {targetScr==="emergency" &&emergencyScreen()}
      {targetScr==="home"     &&targetTab==="bookings" &&bookingsScreen()}
      {targetScr==="home"     &&targetTab==="profile"  &&profileScreen()}
      {targetScr==="task"     &&taskScreen()}
      {targetScr==="custom"   &&customScreen()}
      {targetScr==="posted"   &&postedScreen()}
      {targetScr==="tracking" &&trackingScreen()}
      {targetScr==="messages" &&messagesScreen()}
      {targetScr==="rating"   &&ratingScreen()}
      {targetScr==="tip"      &&tipScreen()}
      {targetScr==="payment"  &&paymentScreen()}
      {targetScr==="editProfile" &&editProfileScreen()}
      {targetScr==="myhome"   &&myhomeScreen()}
      {targetScr==="serviceHistory" &&serviceHistoryScreen()}
      {targetScr==="receiptList" &&receiptListScreen()}
      {targetScr==="receipt"  &&receiptScreen()}
      {targetScr==="addressEdit" &&addressEditScreen()}
      {targetScr==="proProfile" &&proProfileScreen()}
      {targetScr==="addresses"&&addressesScreen()}
      {targetScr==="notifCenter"&&notifCenterScreen()}
      {targetScr==="settings"&&settingsScreen()}
      {targetScr==="jobPreferences"&&jobPreferencesScreen()}
      {targetScr==="help"     &&helpScreen()}
    </>
  );

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return(
    <>
      <style>{CSS}</style>
      <div className="haven-frame-outer" style={{minHeight:"100vh",background:"linear-gradient(155deg,#B8C6D1 0%,#C8BBA8 100%)",display:"flex",alignItems:"center",justifyContent:"center",padding:20,fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif"}}>
        <div className="haven-frame-phone" style={{width:390,height:844,background:BG,borderRadius:46,overflow:"hidden",boxShadow:"0 32px 80px rgba(28,43,58,.28),0 0 0 1px rgba(28,43,58,.09)",display:"flex",flexDirection:"column"}}>
          <div style={{flexShrink:0,paddingTop:"env(safe-area-inset-top)",background:topIsDark?N:W}}/>
          {(()=>{
            const gestureVW=(typeof window!=="undefined"&&window.innerWidth)?window.innerWidth:390;
            const reducedMotion=prefersReducedMotion();
            const gestureActive=edgeBackGesture.phase!=="idle"&&!reducedMotion;
            const isSettling=edgeBackGesture.phase==="settling";
            const rawProgress=gestureVW>0?Math.max(0,Math.min(1,edgeBackGesture.dragX/gestureVW)):0;
            const displayProgress=isSettling?edgeBackGesture.settleTo:rawProgress;
            const renderedDragX=gestureActive?(isSettling?(edgeBackGesture.settleTo===1?gestureVW:0):edgeBackGesture.dragX):0;
            const backgroundTranslateX=-0.25*gestureVW*(1-displayProgress);
            const dimOpacity=0.18*(1-displayProgress);
            const settleTransition=isSettling?"transform 280ms cubic-bezier(0.32,0.72,0,1)":"none";
            return(
              <div style={{flex:1,overflow:"hidden",position:"relative"}}>
                {gestureActive&&edgeBackGesture.destScr&&(
                  <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",transform:`translateX(${backgroundTranslateX}px)`,transition:settleTransition,zIndex:0}}>
                    {renderScreenFor(edgeBackGesture.destScr,edgeBackGesture.destTab)}
                    <div style={{position:"absolute",inset:0,background:"#000",opacity:dimOpacity,pointerEvents:"none",transition:settleTransition.replace("transform","opacity")}}/>
                  </div>
                )}
                <div style={{position:gestureActive?"absolute":"relative",inset:0,display:"flex",flexDirection:"column",height:"100%",transform:gestureActive?`translateX(${renderedDragX}px)`:"none",transition:settleTransition,zIndex:1,background:BG,boxShadow:gestureActive&&renderedDragX>0?"-8px 0 24px rgba(0,0,0,.15)":"none"}}>
                  {renderScreenFor(scr,tab)}
                </div>
              </div>
            );
          })()}
          {bottomNav()}
          {showDiscardConfirm&&(
            <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.4)",display:"flex",alignItems:"flex-end",zIndex:10}}>
              <div style={{background:W,borderRadius:"20px 20px 0 0",padding:24,width:"100%"}}>
                <div style={{fontWeight:800,fontSize:17,color:TX,marginBottom:6,textAlign:"center"}}>Discard draft?</div>
                <div style={{fontSize:13,color:TS,lineHeight:1.5,marginBottom:18,textAlign:"center"}}>This booking hasn't been posted yet. Your progress will be lost.</div>
                <button onClick={()=>setShowDiscardConfirm(false)} style={{width:"100%",padding:14,borderRadius:14,border:"none",background:AM,color:W,fontWeight:800,fontSize:15,cursor:"pointer",marginBottom:10}}>Keep Editing</button>
                <button onClick={()=>discardDraftAndGo(()=>backFrom(tid?"task":"custom",{scr:"home",tab:"home"}))} style={{width:"100%",padding:14,borderRadius:14,border:`1.5px solid ${BD}`,background:"transparent",color:"#DC2626",fontWeight:700,fontSize:15,cursor:"pointer"}}>Discard Draft</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
