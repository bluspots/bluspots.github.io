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
    phrases:["running toilet","toilet keeps running","toilet won't stop running","toilet wont stop running","toilet runs constantly","toilet tank running","phantom flush","toilet running non stop","toilet keeps filling","toilet tank keeps filling","toilet won't stop filling"],
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
    exclude:["toilet","clean","cleaning"]},
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
    exclude:["install new outlet","flicker","flickering","smell","burning","burnt","hot to touch"]},
  {id:"electrical_burning_smell",label:"Electrical Safety Concern",category:"Electrical",taskId:54,urgent:true,
    phrases:["smells burnt near outlet","burning smell near outlet","outlet smells burnt","burning smell from outlet","outlet is hot to the touch","smell burning from the wall","electrical burning smell","outlet sparking","sparks from outlet"],
    exclude:[]},
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
    phrases:["ac blowing warm air","ac not cooling","air conditioning not cold","ac not working","air conditioner broken","ac blowing hot air","room is too hot","house is too hot","room too hot","house too hot","not getting cold air","ac isn't cooling"],
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
    exclude:[],clarifyGroup:"mounting_category"},
  {id:"mount_tv",label:"Mount TV",category:"Installation",taskId:6,
    phrases:["mount tv","tv wall mount","hang tv on wall","tv mounting","install tv bracket","put tv on wall"],
    exclude:["won't turn on","wont turn on","not working","broken","black screen"],clarifyGroup:"mounting_category"},
  {id:"mounting_general",label:"Mounting (unspecified)",category:"Installation",taskId:null,
    phrases:["need this mounted","need something mounted","want this mounted","mount this for me","hang this up","need it mounted on the wall"],
    exclude:["tv","television","shelf","shelves","shelving"],clarifyGroup:"mounting_category"},
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
  {id:"deep_clean",label:"Deep Home Cleaning",category:"Cleaning",taskId:30,
    phrases:["deep clean","deep cleaning","deep clean house","deep cleaning needed","full house cleaning","whole house deep cleaned","deep clean my house","deep clean the house"],
    exclude:["move out","moving out"],clarifyGroup:"cleaning_category"},
  {id:"standard_clean",label:"Standard Home Cleaning",category:"Cleaning",taskId:59,
    phrases:["standard cleaning","regular cleaning","house cleaning","clean my house","clean the house","need my house cleaned","weekly cleaning","recurring cleaning","house is dirty","house is messy","place is a mess","house needs cleaning","garage cleanout","garage needs cleaning","garage is a mess"],
    exclude:["deep clean","move out","moving out","carpet","window"],clarifyGroup:"cleaning_category"},
  {id:"bathroom_clean",label:"Bathroom Cleaning",category:"Cleaning",taskId:60,
    phrases:["clean my bathroom","clean the bathroom","bathroom cleaning","bathroom needs cleaning","scrub the bathroom","clean bathrooms"],
    exclude:["clogged","leak","running","overflow","won't flush","wont flush","not draining"],clarifyGroup:"cleaning_category"},
  {id:"kitchen_clean",label:"Kitchen Cleaning",category:"Cleaning",taskId:61,
    phrases:["clean my kitchen","clean the kitchen","kitchen cleaning","kitchen needs cleaning","scrub the kitchen"],
    exclude:["clogged","leak","not working","won't start","wont start","not draining","leaking"],clarifyGroup:"cleaning_category"},
  {id:"move_out_clean",label:"Move-Out Cleaning",category:"Cleaning",taskId:31,
    phrases:["move out cleaning","moving out clean","end of lease cleaning","moving out and need everything cleaned","move in cleaning"],
    exclude:[],clarifyGroup:"cleaning_category"},
  {id:"window_washing_interior",label:"Window Washing (Interior)",category:"Cleaning",taskId:32,
    phrases:["window washing interior","clean windows inside"],exclude:["exterior","outside"],clarifyGroup:"cleaning_category"},
  {id:"window_washing_exterior",label:"Window Washing (Exterior)",category:"Maintenance",taskId:48,
    phrases:["window washing exterior","clean windows outside"],exclude:["interior","inside"]},
  {id:"carpet_cleaning",label:"Carpet/Upholstery Cleaning",category:"Cleaning",taskId:33,
    phrases:["carpet cleaning","upholstery cleaning","clean carpet stains","carpet needs cleaning","carpet needs cleaned"],exclude:[],clarifyGroup:"cleaning_category"},
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
      {label:"Water leaking",intentId:"leaky_pipe"},
      {label:"Something else",intentId:null},
    ],
  },
  cleaning_category:{
    question:"What would you like cleaned?",
    options:[
      {label:"Standard Home Cleaning",intentId:"standard_clean"},
      {label:"Deep Home Cleaning",intentId:"deep_clean"},
      {label:"Move-In / Move-Out Cleaning",intentId:"move_out_clean"},
      {label:"Carpet Cleaning",intentId:"carpet_cleaning"},
      {label:"Bathroom Cleaning",intentId:"bathroom_clean"},
      {label:"Kitchen Cleaning",intentId:"kitchen_clean"},
      {label:"Garage",intentId:null},
      {label:"Other / Not Listed",intentId:null},
    ],
  },
  mounting_category:{
    question:"What would you like mounted?",
    options:[
      {label:"TV",intentId:"mount_tv"},
      {label:"Shelves",intentId:"build_shelves"},
      {label:"Mirror or artwork",intentId:null},
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

// Hierarchical confidence, second level: CATEGORY confidence, independent
// of any single intent's score. A word like "clean" is generic enough that
// it can't meaningfully win any ONE cleaning intent on its own (that's
// correct — plain word-overlap deliberately can't reach high confidence
// alone, see _confidenceFor above), but aggregated across every cleaning
// intent's vocabulary, "this query is about Cleaning" is a real, confident
// signal even when "which cleaning service" isn't yet. This is what lets
// the matcher ask a category-scoped question ("What would you like
// cleaned?") instead of either guessing an unrelated service or giving up
// with no guidance at all.
const _categoryList=[...new Set(INTENT_LIBRARY.map(i=>i.category))];
// Per word, how many intents in EACH category use it — the basis for a
// concentration-weighted category score below (not the same as the
// global per-intent _docFreq, which is deliberately the opposite signal).
const _wordCategoryCounts={};
INTENT_LIBRARY.forEach((intent,i)=>{
  _intentWordSets[i].forEach(w=>{
    if(!_wordCategoryCounts[w]) _wordCategoryCounts[w]={};
    _wordCategoryCounts[w][intent.category]=(_wordCategoryCounts[w][intent.category]||0)+1;
  });
});
// The clarification a category falls back to is whatever its own member
// intents already share — no separate mapping table to keep in sync.
const _categoryClarifyGroup=Object.fromEntries(_categoryList.map(cat=>{
  const withGroup=INTENT_LIBRARY.find(i=>i.category===cat&&i.clarifyGroup);
  return [cat,withGroup?withGroup.clarifyGroup:null];
}));
function _categoryConfidence(queryWordSet,category){
  if(queryWordSet.size===0) return 0;
  let matchedWeight=0;
  queryWordSet.forEach(w=>{
    const counts=_wordCategoryCounts[w];
    if(!counts) return;
    const totalCount=Object.values(counts).reduce((a,b)=>a+b,0);
    const catCount=counts[category]||0;
    if(totalCount>0) matchedWeight += catCount/totalCount; // this word's concentration in THIS category vs all categories it appears in
  });
  return Math.round(Math.min(100,(matchedWeight/queryWordSet.size)*100));
}

// The single swappable entry point — a future AI/NLP service replaces
// only this function's internals. Same contract: a query string in,
// {tier, matches, clarification} out.
function matchRepairIntent(query){
  const q=(query||"").toLowerCase().trim();
  if(!q) return {tier:"none",matches:[],clarification:null,topCategory:null,topCategoryConfidence:0};
  const qWordSet=new Set(_tokenize(q));
  const scored=INTENT_LIBRARY.map((intent,i)=>({
    intent,confidence:_confidenceFor(q,qWordSet,intent,_intentWordSets[i],_intentPhraseWordSets[i],_excludeWordSets[i]),
  })).filter(m=>m.confidence>0).sort((a,b)=>b.confidence-a.confidence);

  const matches=scored.map(({intent,confidence})=>({
    intentId:intent.id,label:intent.label,category:intent.category,taskId:intent.taskId,confidence,
  }));

  // Category-level confidence is ALWAYS computed — never gated behind
  // "did no intent score anything." That gate was the actual root cause
  // of the "clean garage" bug: a single word shared with an unrelated
  // single-purpose intent (here, "garage" belonging only to Garage Door
  // Repair) can score a misleadingly moderate confidence on its own, even
  // when the query's dominant, more holistic signal clearly points
  // elsewhere ("clean" is far more broadly tied to Cleaning than "garage"
  // is to Repair). The fix isn't a higher/lower threshold — it's that the
  // top-scoring INTENT now has to actually agree with the top-scoring
  // CATEGORY to be trusted, not just clear a number in isolation.
  const categoryScores=_categoryList.map(cat=>({cat,confidence:_categoryConfidence(qWordSet,cat)})).sort((a,b)=>b.confidence-a.confidence);
  const topCat=categoryScores[0], secondCat=categoryScores[1];
  const catClearlyAhead = topCat && (!secondCat || (topCat.confidence-secondCat.confidence)>=20);
  const topCategory=topCat?topCat.cat:null, topCategoryConfidence=topCat?topCat.confidence:0;

  const top=matches[0];
  const second=matches[1];
  const tooClose = second && (top.confidence-second.confidence)<20;
  const topIntentAgreesWithCategory = top && topCat && top.category===topCat.cat;
  // An exact phrase match (100%) is a deliberate, explicit signal and
  // always wins outright. Short of that, a match is only "trustworthy"
  // enough to override the category-level signal if it's both confident
  // AND actually belongs to the category the query is dominantly about.
  const topIntentIsTrustworthy = top && (top.confidence===100 || (topIntentAgreesWithCategory && top.confidence>=70 && !tooClose));

  if(topCat && topCat.confidence>=45 && catClearlyAhead && !topIntentIsTrustworthy){
    const group=_categoryClarifyGroup[topCat.cat];
    if(group && CLARIFICATION_GROUPS[group]){
      return {tier:"low",matches,clarification:CLARIFICATION_GROUPS[group],topCategory,topCategoryConfidence};
    }
  }

  if(matches.length===0) return {tier:"low",matches:[],clarification:null,topCategory,topCategoryConfidence};

  // Clarify only when genuinely needed: several sibling intents from the
  // same clarify group are close enough that guessing would be a real risk.
  const topIntent=INTENT_LIBRARY.find(i=>i.id===top.intentId);
  if(topIntent?.clarifyGroup && (top.confidence<70 || tooClose)){
    const siblingsInTop=matches.slice(0,4).filter(m=>{
      const mi=INTENT_LIBRARY.find(i=>i.id===m.intentId);
      return mi?.clarifyGroup===topIntent.clarifyGroup;
    });
    if(siblingsInTop.length>=2){
      return {tier:"low",matches,clarification:CLARIFICATION_GROUPS[topIntent.clarifyGroup]||null,topCategory,topCategoryConfidence};
    }
  }

  // An intent with no canonical taskId (no real Haven service to book)
  // must never become a bookable "high" or "medium" recommendation,
  // regardless of how confidently its phrases matched. Route to its own
  // clarify group if it has one; otherwise fall through honestly rather
  // than render a "recommendation" with nothing behind it.
  if(top && !top.taskId){
    const group=topIntent?.clarifyGroup;
    if(group && CLARIFICATION_GROUPS[group]) return {tier:"low",matches,clarification:CLARIFICATION_GROUPS[group],topCategory,topCategoryConfidence};
    return {tier:"low",matches,clarification:null,topCategory,topCategoryConfidence};
  }

  if(top.confidence>=70 && !tooClose) return {tier:"high",matches:matches.slice(0,3),clarification:null,topCategory,topCategoryConfidence};
  if(top.confidence>=35) return {tier:"medium",matches:matches.slice(0,3),clarification:null,topCategory,topCategoryConfidence};
  return {tier:"low",matches:matches.slice(0,3),clarification:null,topCategory,topCategoryConfidence};
}

// Safety/urgency signal words — deliberately independent of which specific
// service matched, since urgency is a different dimension than "which
// service." A burning smell is urgent regardless of whether the matching
// engine confidently identified the exact electrical issue.
const URGENCY_KEYWORDS=["smoke","burning smell","burnt smell","smells burnt","gas smell","smell gas","sparking","spark","shock","electrocut","fire","flooding","water everywhere","water pouring","emergency","urgent","can't wait","cant wait","no power at all","exposed wire"];
function _detectUrgency(rawInput,topIntent){
  if(topIntent?.urgent) return "high";
  const lower=(rawInput||"").toLowerCase();
  if(URGENCY_KEYWORDS.some(kw=>lower.includes(kw))) return "high";
  return "normal";
}

// interpretHomeIntent(input, context) — the single boundary the UI
// consumes. Everything above (INTENT_LIBRARY, matchRepairIntent,
// category/service confidence, clarification groups) is implementation
// detail behind this contract. A future AI classifier only needs to
// implement this same function signature and output shape; the UI does
// not need to change, and does not need to know which one is answering.
//
// context is optional and additive — for the prototype, only `property`
// (the selected/primary property record: beds/baths/sqft/propertyType) is
// actually used, for property-aware scope/pricing on services that need
// it. Other fields the product spec anticipates (previousServices,
// activeJobs, savedPreferences, location) are accepted in the shape but
// not yet used by any matching logic — there's no concrete behavior
// defined for them yet, and inventing one would be speculative rather
// than principled. Extending scopeContext/matching to use them later
// only requires extending this function, not the UI.
function interpretHomeIntent(input,context={}){
  const raw=input||"";
  const result=matchRepairIntent(raw);
  const top=result.matches[0]||null;
  const topIntent=top?INTENT_LIBRARY.find(i=>i.id===top.intentId):null;
  const task=top?.taskId?TASKS.find(t=>t.id===top.taskId):null;

  const clarificationRequired=!!result.clarification;
  const isBookable=(result.tier==="high"||result.tier==="medium")&&!!task;

  // Property-aware scope: only computed when there's an actual bookable,
  // property-scoped service to compute it for. Never invents property
  // data — calculateCleaningPrice already refuses to guess missing
  // beds/baths/sqft, and that behavior carries through unchanged here.
  let scopeContext=null;
  if(task?.propertyScoped){
    const pricing=calculateCleaningPrice(task,context.property||null);
    scopeContext={
      basedOnProperty:context.property?(context.property.label||"selected property"):null,
      beds:context.property?.beds||null,
      baths:context.property?.baths||null,
      sqft:context.property?.sqft||null,
      estimatedPrice:pricing.price,
      missingPropertyFields:pricing.missingFields,
    };
  }

  let fallbackType="none";
  if(!isBookable){
    fallbackType=clarificationRequired?"clarification":"custom_job";
  }

  return {
    categoryId:isBookable?(top.category||null):((result.topCategoryConfidence>0)?result.topCategory:null),
    serviceId:isBookable?task.id:null,
    intentId:top?top.intentId:null,
    categoryConfidence:result.topCategoryConfidence>0?result.topCategoryConfidence:(top?100:0),
    serviceConfidence:top?top.confidence:0,
    clarificationRequired,
    clarificationQuestion:result.clarification?result.clarification.question:null,
    clarificationOptions:result.clarification?result.clarification.options.map(o=>({label:o.label,intentId:o.intentId})):null,
    urgency:_detectUrgency(raw,topIntent),
    scopeContext,
    fallbackType,
    // Internal/debug — not part of the stable contract, but useful for
    // the UI to render "Recommended for you" without needing its own
    // second lookup into TASKS/INTENT_LIBRARY.
    _task:task,
    _matches:result.matches,
  };
}

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

