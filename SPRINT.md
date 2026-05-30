# TorontoView — Mayor's Innovation Challenge Sprint

**Goal:** Transform TorontoView from a hackathon demo into a credible urban planning decision-making tool.
**Timeline:** 2 weeks (presenting in Toronto)
**Core reframe:** The USP is **impact analysis**, not 3D rendering. The map is the delivery vehicle — the value is answering "what happens to the neighborhood when this building goes here?"

---

## Priority 1: Shadow / Sunlight Analysis

**Why:** Urban planners actually use shadow studies. This is the single most credible feature you can add. Visually dramatic, technically feasible, and directly useful.

**What to build:**
- Directional light matching real sun position for Toronto's latitude (44.23°N)
- Time-of-day slider (6am → 8pm) that moves the sun and casts shadows across the 3D scene
- Shadow overlay showing which surrounding buildings/areas lose sunlight when a new building is placed
- Before/after toggle: scene without proposed building vs. with it
- Summary stat: "X residential units lose >2 hours of direct sunlight"

**Technical notes:**
- Three.js DirectionalLight + shadow mapping already supported
- Sun position can be calculated from latitude + time using solar position equations
- Shadow map resolution will need tuning for performance at city scale
- Consider date picker too (winter vs summer shadows differ significantly at 44°N)

**Estimated effort:** 3–4 days

---

## Priority 2: Street-Level POV

**Why:** "What will my street look like?" is the #1 thing residents care about. The professor specifically asked for this.

**What to build:**
- Camera mode that drops to pedestrian height (~1.7m) at a clicked location
- First-person orbit controls (look around from a fixed point)
- Quick-access button: "View from street" when a building is selected
- Optional: walk mode (WASD movement at ground level)

**Technical notes:**
- Camera position change + swapping OrbitControls for PointerLockControls or constrained orbit
- Need to handle ground plane clipping and building occlusion
- Transition animation from bird's-eye to street level (tween the camera)

**Estimated effort:** 1–2 days

---

## Priority 3: Stakeholder Impact View

**Why:** This is what turns the tool into something the mayor's office would actually use. Answers "who gets affected and how."

**What to build:**
- When a building is placed, identify all residential/commercial buildings within a configurable radius
- Calculate and display per-building impacts:
  - Shadow impact (from Priority 1)
  - Distance from new construction
  - Estimated noise during construction
  - View obstruction (ray casting from windows toward new building)
- Summary dashboard: "X residential units affected, Y commercial properties, Z lose significant sunlight"
- Color-code surrounding buildings by impact severity (green/yellow/red)

**Technical notes:**
- Spatial query on existing buildings data (already have 4,776 buildings with positions)
- Raycasting for view obstruction is straightforward in Three.js
- Impact radius should be configurable (100m, 250m, 500m)
- This ties directly into the environmental report — replace Gemini's guesswork with actual calculated data

**Estimated effort:** 3–4 days

---

## Priority 4: Traffic Impact Analysis (not just simulation)

**Why:** You already have 100+ vehicles and A* pathfinding. The missing piece is before/after comparison showing actual impact of a new building.

**What to build:**
- Trip generation model: building type + size → estimated daily vehicle trips (use ITE trip generation rates)
- Inject generated trips into existing simulation at the building's location
- Before/after traffic density comparison on surrounding roads
- Highlight intersections that become congested
- Fix traffic signals visually ("reds being red" — professor noticed they don't look right)

**Technical notes:**
- ITE Trip Generation Manual rates are publicly summarized (e.g., residential = ~6 trips/unit/day, office = ~10 trips/1000sqft)
- Can show delta as a road-segment heatmap (green → red based on volume increase)
- Traffic signal visual fix is likely just a material/color issue in the renderer

**Estimated effort:** 3–4 days

---

## Priority 5: Wind Effect Visualization

**Why:** Wind tunnel effects between tall buildings are a real urban planning concern. Visually compelling.

**What to build:**
- Simplified wind model: identify gaps between tall buildings where wind accelerates (Venturi effect)
- Particle system or animated arrows showing wind flow at street level
- Highlight danger zones where wind speed exceeds comfort/safety thresholds
- Factor in prevailing wind direction for Toronto (typically W/SW)

**Technical notes:**
- Not real CFD — use a simplified model based on building heights, gaps, and orientation relative to wind
- Three.js particle systems or instanced meshes for wind visualization
- Could be a toggleable overlay layer like the existing zoning layer

**Estimated effort:** 3–4 days

---

## Priority 6: Water / Drainage Impact

**Why:** Stormwater management matters but is harder to visualize compellingly.

**What to build:**
- Calculate added impervious surface area from building footprint
- Estimate stormwater runoff increase (simple curve number method)
- Show drainage impact on surrounding area
- Suggest mitigation (green roofs, permeable surfaces, retention)

**Technical notes:**
- Mostly calculation-based, less visual than other features
- Could integrate into the environmental report with real numbers instead of Gemini speculation
- Lower priority because it's less visually impactful for a live demo

**Estimated effort:** 2–3 days

---

## Cleanup: Reduce Gimmicks

These features were added for the ElevenLabs hackathon track and should be deprioritized or removed for the mayor's challenge:

| Feature | Action |
|---|---|
| 9 ElevenLabs sound effects (whoosh, snap, etc.) | Remove or mute by default. They undermine credibility in a government presentation. |
| Street-level ambient sound generation | Remove. |
| ElevenLabs TTS narration | Remove. Keep voice *input* (useful), drop voice *output* (gimmick). |
| Landing page parallax / fireflies | Simplify. Clean, professional landing page for a government audience. |

---

## Suggested 2-Week Schedule

| Days | Focus |
|---|---|
| 1–4 | Shadow/sunlight analysis + street-level POV |
| 5–8 | Stakeholder impact view + traffic impact analysis |
| 9–10 | Wind visualization |
| 11–12 | Gimmick cleanup, UI polish, presentation prep |
| 13–14 | Testing, bug fixes, rehearsal |

---

## Success Criteria

After this sprint, the tool should be able to answer these questions for any proposed building:

1. **Who loses sunlight?** (shadow analysis)
2. **What does it look like from the street?** (POV mode)
3. **How many people are affected?** (stakeholder impact)
4. **How does traffic change?** (trip generation + simulation)
5. **Where does wind become a problem?** (wind visualization)

If you can demo all five in Toronto, you're not showing a hackathon project — you're showing a planning tool.
