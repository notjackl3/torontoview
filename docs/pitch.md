# TorontoView — Pitch Script

**Mayor's Innovation Challenge | March 20, 2026 | Toronto City Hall**
**Time: 8 minutes + Q&A**
**Team: Phineas Truong, Jack Le, Vihaan Sharma, Dhan Narula**

---

## Who Is This For?

TorontoView is **not** for city planners — they already have professional tools (ArcGIS Urban, AutoCAD) and commission formal studies from licensed consultants. It is **not** for developers — they hire architects and engineers who need precise floor plans and structural analysis.

**TorontoView is for the people who currently have no tools at all.**

- The **resident** who shows up to a public consultation, stares at a 2D site plan taped to a board, and has to *imagine* what a 6-story building will do to their street, their sunlight, their commute.
- The **councillor** who has to vote on a development application based on a PDF rendering and a consultant's report they don't have time to fully read.
- The **community group** trying to articulate *why* a proposed building concerns them but lacking the visual evidence to make their case.

The planning process generates mountains of technical information. TorontoView makes that information **visible and accessible** to the people who are actually affected by the decision.

This is also why the voice interface isn't a gimmick — it's the point. The barrier to civic participation shouldn't be knowing how to use CAD software. It should be the ability to describe a building in a sentence.

---

## Pitch Structure

| Section | Time | Cumulative |
|---|---|---|
| 1. The Problem | 1:00 | 1:00 |
| 2. The Solution (15-second overview) | 0:15 | 1:15 |
| 3. Live Demo | 4:15 | 5:30 |
| 4. How It Works (tech credibility) | 0:45 | 6:15 |
| 5. What This Means for Toronto | 1:00 | 7:15 |
| 6. Close | 0:45 | 8:00 |

---

## 1. The Problem (1:00)

> **SLIDE: A photo of a Toronto public consultation — maybe a crowded room at City Hall, or a rendering taped to a wall.**

"Toronto is growing. Hundreds of development applications move through this building every year. And every one of them triggers the same question from the people who live here: *what is this going to do to my neighborhood?*

Right now, the answer lives in PDF reports, 2D site plans, and consultant studies that take weeks to produce. A resident shows up to a public consultation, looks at a flat drawing on a board, and tries to imagine — will this tower block my sunlight? Will my street get more traffic? What will it actually look like from my front door?

Planners have professional tools. Developers have architects. But the people who are actually affected by these decisions — the residents, the business owners, the councillors voting on the application — they have nothing. They have to imagine.

They shouldn't have to imagine. They should be able to *see* it.

That's what we built."

---

## 2. The Solution — One Sentence (0:15)

> **SLIDE: TorontoView logo + tagline on a clean slide.**

"TorontoView gives residents and councillors the same visibility that planners and developers already have. Describe a building in plain English, place it on a real 3D map of Toronto, and immediately see the impact — shadow, traffic, wind, noise — before the first shovel hits the ground.

Let me show you."

---

## 3. Live Demo (4:15)

> **Switch to live app. Practice this flow until it's muscle memory. Every click should be rehearsed.**

### 3a. Voice Design (0:45)

> Open the Building Editor. Click the mic button.

"I'll design a building with my voice. I'll say: *'A 6-story mixed-use building, brick facade, flat roof, arched windows.'*"

> The system processes the speech, Gemini interprets it, and the 3D building renders in the editor.

"In under two seconds, I have a 3D model. No CAD software. No training. I didn't open a menu or set a parameter — I just described what I wanted. A resident at a town hall meeting could do exactly this."

> Optionally: "Make it taller" to show incremental voice editing.

### 3b. Place on Toronto's Map (0:45)

> Export the building to the map. Place it at a recognizable Toronto location — Princess Street, the waterfront, or near City Hall.

"Now I place it on Toronto's map. This is a real 3D model of the city — 4,776 buildings from OpenStreetMap, real roads, real intersections. I'll drop it right here on [location name]."

> Show the building appear on the map among the existing Toronto buildings. Set a zoning designation.

"I've set the zoning to MU1 — Mixed Use — matching Toronto's Official Plan. The system knows all 76 zoning designations from By-Law 2022-62."

### 3c. Shadow Analysis (0:45)

> Toggle shadow analysis. Drag the time slider from morning to evening.

"Here's where it gets useful for planning. This is a shadow study — the same kind your planning department commissions for major applications. I'm simulating the sun's position for Toronto's latitude through the course of a day."

> Drag slider slowly. Shadows sweep across the scene.

"Watch what happens at 3 PM in December. That shadow falls across [nearby area]. The system identifies that **X residential buildings lose more than 2 hours of direct sunlight**. Before and after — toggle it."

> Hit the before/after toggle to show the scene with and without the proposed building.

"That's a real shadow study, running live, for any building you design — in seconds."

### 3d. Street-Level View (0:30)

> Click "View from Street" on the placed building. Camera swoops down to pedestrian height.

"Residents always ask: *what will this look like from my street?* So let's go look."

> Camera is now at eye level. Slowly look around.

"This is the view from [street name]. You can see the proposed building from where a resident would actually stand. This is the view that matters to the people who live here."

> Exit street view back to bird's-eye.

### 3e. Traffic Impact (0:30)

> Show the traffic simulation running. Point out the vehicles and congestion heatmap.

"We're running a live traffic simulation — over 100 vehicles with A* pathfinding on Toronto's actual road network. When I place this building, the system estimates it generates approximately 140 daily vehicle trips based on ITE trip generation standards."

> Show road heatmap coloring changing from green to yellow/red on nearby streets.

"You can see [street name] goes from free-flow to moderate congestion. That's the kind of data that informs intersection upgrades and traffic impact assessments."

### 3f. Wind + Environmental Report (0:30)

> Toggle wind overlay briefly. Then open the environmental report.

"We can also visualize wind acceleration between buildings — the Venturi effect that makes some downtown corridors miserable in winter. Toronto's prevailing wind comes from the west-southwest."

> Open environmental report.

"And here's a full environmental impact summary — carbon footprint, stormwater runoff, noise, community impact, mitigation recommendations. All grounded in real data about the building you just designed."

### 3g. Quick recap while transitioning (0:10)

"So in under three minutes, we designed a building with our voice, placed it on Toronto's map, ran a shadow study, viewed it from street level, simulated traffic impact, and generated an environmental report. That's TorontoView."

---

## 4. How It Works — Technical Credibility (0:45)

> **SLIDE: Clean architecture diagram. Not a code dump — a clear flow.**

"Three technologies make this possible.

**Google Gemini** is the intelligence layer. It interprets natural language into building parameters, generates environmental reports grounded in Toronto's geography, and recommends tree species from the city's actual planting program — 40 verified species.

**Three.js** renders the full 3D city. 4,776 buildings, Toronto's road network, real-time traffic with collision detection, and shadow mapping at Toronto's latitude. Everything you just saw runs in a browser — no downloads, no plugins.

**Real Toronto data.** 76 zoning designations from By-Law 2022-62. OpenStreetMap buildings and roads. ITE trip generation standards. Solar position equations for 44 degrees north. SCS curve numbers for stormwater. This isn't a toy with made-up numbers — the calculations use the same standards your planning department uses."

---

## 5. What This Means for Toronto (1:00)

> **SLIDE: Three use cases, each with a one-line description.**

"We built TorontoView for three moments in the planning process where the people who matter most are currently left in the dark.

**Public consultations.** Project TorontoView at a council meeting. Instead of asking residents to interpret a 2D site plan, show them their actual street — with shadows, traffic, the view from their front door. They can see the impact and respond to something real, not something they have to imagine.

**Council decision-making.** A councillor is voting on a development application next week. They open TorontoView, drop the proposed building on the map, and in sixty seconds they can see which residential buildings lose sunlight, which intersections get congested, and what the street looks like at eye level. That's an informed vote.

**Community advocacy.** Right now, when a neighborhood group opposes a development, they write letters. With TorontoView, they can show — concretely, visually — what a 10-story building does to their block. The voice interface means anyone can participate. A high school student, a senior, a new Canadian — if you can describe a building in a sentence, you can use this tool. That's a different kind of civic participation."

---

## 6. Close (0:45)

> **SLIDE: Clean final slide — TorontoView name, URL, team names.**

"Every development application that moves through this building affects real people — their sunlight, their commute, their view, their street. Those people deserve to see what's coming, not guess.

Planners have tools. Developers have tools. TorontoView is the tool for everyone else.

TorontoView lets Toronto see its future before it's built.

We're Phineas, Jack, Vihaan, and Dhan. Thank you."

---

## Q&A Prep — Likely Questions and Answers

### "How accurate is the shadow analysis?"

"We use the standard solar position equations for Toronto's latitude — 44.23 degrees north. The sun angle is astronomically correct for any date and time. The shadow casting uses Three.js shadow mapping, which is geometrically accurate for the building shapes in the scene. It's not a substitute for a professional shadow study commissioned under the Planning Act, but it gives planners and residents an immediate, directionally correct picture in seconds rather than weeks."

### "Where does the building data come from?"

"The 4,776 buildings are from OpenStreetMap — community-maintained, open data. Building footprints and heights are extracted from OSM tags. The road network is also from OSM. Zoning data comes from Toronto's Official Plan land use designations, accessed through the city's public ArcGIS MapServer. All of this is open, public data."

### "How reliable are the environmental reports?"

"The traffic estimates use ITE Trip Generation rates — the same standard traffic engineers use across North America. Stormwater calculations use the SCS Curve Number method with Toronto's rainfall data. The shadow analysis is based on real solar geometry. The environmental report synthesizes these calculations with AI interpretation — it's a screening-level assessment, not a professional engineering report. But it gives planners a fast, informed starting point."

### "Could this actually be used by the city?"

"Yes. It runs in a web browser — there's nothing to install. The data sources are all public. The tool could be embedded in the city's website or used internally by planning staff. The next step would be a pilot with your planning department — have staff use it on a real application and compare the results against their current workflow. We'd also want to integrate the city's own GIS layers for more precise parcel data."

### "What about accessibility?"

"The voice interface works through the Web Speech API — built into every modern browser. You describe a building in plain English and the system builds it. No menus, no parameters, no training required. We designed it so that anyone who can attend a public consultation and speak can also use this tool."

### "What would you need from the city to take this further?"

"Three things: access to better parcel-level data from the city's GIS, a pilot project with planning staff to validate against a real development application, and feedback from residents at a public consultation to see how the tool performs in a real civic engagement setting."

### "How is this different from SketchUp/ArcGIS Urban/other planning tools?"

"Those are professional tools — they're powerful, and planners should keep using them. But they serve the supply side: the people producing developments. TorontoView serves the demand side: the people living with the consequences. A resident doesn't need a $700/year ArcGIS license to understand what a building does to their street. They need to describe it, see it, and react to it. That's a fundamentally different user and a fundamentally different tool."

### "Who exactly would use this?"

"Three groups. First, residents at public consultations — instead of staring at a 2D site plan, they see a 3D model on their actual street with real shadow and traffic data. Second, councillors preparing for a vote — they can drop the proposed building on the map and see the impact in sixty seconds instead of reading a 50-page consultant report. Third, community organizations trying to advocate for or against a development — TorontoView gives them visual evidence instead of just written objections."

---

## Demo Contingency Plan

Wi-Fi at City Hall is unreliable (the email warns about this). Prepare for offline/degraded scenarios:

1. **Record a full demo video** (2-3 minutes) as a backup. Embed it in the PowerPoint as instructed.
2. **Pre-load the app** before the presentation starts — have the map, buildings, and data cached.
3. **Pre-compute one shadow analysis** and screenshot/screen-record it so you can show it even if the live demo fails.
4. **Test at practice round** on March 16 — use the optional practice session at Council Chambers to test your setup on their projector and network.
5. **Mobile hotspot** — bring a phone with data as a backup network. The app is lightweight enough to run on cellular.

## Slide Deck Structure (PowerPoint)

Since slides must be submitted by March 17 at 4pm:

| Slide | Content | Notes |
|---|---|---|
| 1 | Title: TorontoView + tagline + team names | Clean, no clutter |
| 2 | The Problem — photo of a public consultation + "Planners have tools. Developers have tools. Residents have nothing." | One image, one sentence |
| 3 | Live Demo (or embedded video backup) | Fullscreen — this is the main event |
| 4 | Architecture — simple 3-part diagram (Gemini + Three.js + Toronto Data) | Not technical — just three boxes |
| 5 | Three users: Residents / Councillors / Community groups | One sentence each, an icon per user |
| 6 | Close — "The tool for everyone else." + team + URL | Clean exit |

Maximum 6 slides. The demo is the pitch. Slides are just scaffolding.

## Timing Drill

Practice the full pitch with a stopwatch at least 5 times before March 20. Target each section within its time budget. The most common failure mode for an 8-minute pitch is running long on the demo and rushing the close. The close is what they remember — protect that time.

If the demo goes wrong, cut to the video backup and narrate over it. Never debug live. Say "let me show you the recording" and move on.
