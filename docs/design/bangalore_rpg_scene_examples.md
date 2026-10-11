# NAMMA OUTBREAK — Scene components: worked example + stub (shape reference)
> Shows Claude Code the exact filled shape (act0_arrivals) and the stub shape (act2_salary_scooter). Full set generated during the build, audited one by one.

## WORKED EXAMPLE — data/scenes/act0_arrivals.json
{
  "id": "act0_arrivals", "district": "airport_interior", "act": 0,
  "title": "Arrivals", "time": "06:10 morning_haze",
  "player_goal": "Get your bag, find the exit, don't get scammed.",
  "design_goal": "Teach move/interact/dialogue + first UPI spend (reveal #1-4). Plant HIVR lanyard man.",
  "pacing": ["Calm","Curious","Engaged","Reward"],
  "entry": { "from": "TitleScene", "spawn": "gate" },
  "cast": [
    {"npc":"ambient_baggage","tier":1,"spawn":"belt","role":"trolleys"},
    {"npc":"npc_chai_anna","tier":2,"spawn":"stall","role":"first UPI sink; comments on accent"},
    {"npc":"npc_cab_tout_1","tier":2,"spawn":"exit","role":"scam; grudge if refused"},
    {"npc":"ambient_hivr_lanyard","tier":1,"spawn":"corner","role":"signs for cold-chain box; flag seen_hivr_lanyard"}
  ],
  "quests": ["q_act0_exit_airport"],
  "beats": [
    {"id":"F1","pacing":"Calm","what":"Collect backpack from belt","interact":"E/A/tap","reroute":"-"},
    {"id":"F2","pacing":"Curious","what":"Chai Anna offers chai ₹20","interact":"tap","reward":"+food, +1 social","economy":"spend 20","reroute":"decline → still proceed"},
    {"id":"F3","pacing":"Engaged","what":"Choose commute: Vayu Vajra bus or cab","interact":"choice","reroute":"either converges at Whitefield"},
    {"id":"F3b","pacing":"Engaged","what":"If cab: tout asks +₹100 AC (negotiate)","interact":"offer/counter/walk","reroute":"decline → sweaty arrival line"},
    {"id":"F4","pacing":"Reward","what":"Background: HIVR man signs for styrofoam box (silent)","flag":"seen_hivr_lanyard"},
    {"id":"F5","pacing":"Reward","what":"Exit → transit card (Hebbal flyover, HIVR sign flashes past) → whitefield_street"}
  ],
  "economy": [ {"trigger":"chai","spend":20,"canAfford":true}, {"trigger":"cab_ac","spend":100,"canAfford":true} ],
  "conditions": [], "pulse_slots": ["airport_wall_1"],
  "exits": [ {"zone":"exit_doors","to":"whitefield_street","spawn":"pg_gate","transit":"bus"} ],
  "save_flags": ["seen_hivr_lanyard","cab_or_bus"],
  "assets_needed": ["airport_interior_tiles","belt","chai_stall","vayu_vajra_bus","auto","player_M","player_F","ambient x3"],
  "acceptance": ["player reaches exit","≥1 UPI spend fired canAfford","flag set","transit card plays","lands at whitefield_street"]
}

## STUB — data/scenes/act2_salary_scooter.json
{
  "id":"act2_salary_scooter","district":"TODO","act":2,"title":"Salary & the Scooter","status":"STUB",
  "player_goal":"TODO","design_goal":"reveal #11 scooter + fuel gauge",
  "pacing":["Calm","Curious","Engaged","Tense","Reward"],
  "cast":["TODO: npc_sameer, scooter seller, RC-fraud owner"],
  "quests":["TODO: q_act2_scooter (type: chase closer per chapter_board_merge)"],
  "beats":["TODO from story_script_v1 Act 2 + act4_systems_and_cast_v1"],
  "economy":[{"trigger":"salary_credit","spend":0},{"trigger":"buy_scooter","spend":"TODO","canAfford":true}],
  "exits":["TODO"],"assets_needed":["scooter","fuel_gauge_ui","TODO"],
  "acceptance":["TODO — fill with user before building"]
}
