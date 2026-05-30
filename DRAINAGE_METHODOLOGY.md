# Drainage Impact Analysis — Methodology Reference

This document explains every metric shown in the Drainage Impact Analysis panel, how it's calculated, and where the numbers come from. Use this to answer any question about the feature during a pitch.

---

## Overview

When a user places a building on the map, we run a three-stage analysis:

1. **Impervious Surface** — How much hard surface (rooftops, parking, sidewalks) does this building add?
2. **Stormwater Runoff** — How much extra rainwater runs off the site instead of soaking into the ground?
3. **Mitigation Measures** — What green infrastructure could offset that extra runoff, and what would it cost?

The analysis uses the **USDA TR-55 method** (the industry standard for small-watershed hydrology) calibrated with **Toronto, Ontario climate data** from Environment and Climate Change Canada.

---

## Section 1: Impervious Surface

This section answers: *"How much of the lot becomes hard, waterproof surface?"*

### What's shown in the panel

| Row | What it means |
|-----|---------------|
| **Building footprint** | Width x length of the building at ground level (m²) |
| **Estimated parking** | Parking area calculated from the building's zoning requirements |
| **Access / sidewalks** | Entrances, driveways, walkways around the building |
| **Total impervious** | Sum of the three above — all new hard surface |
| **Previously impervious** | How much of the lot was already paved/built before this building |
| **Net increase** | Total impervious minus previously impervious — the actual new impact |
| **Before/After bar** | Visual showing impervious coverage as a percentage of the lot |

### How each number is calculated

**Building footprint:**
Directly from the building's 3D dimensions — `width x length`. If the building is 20m wide and 30m long, the footprint is 600 m².

**Estimated parking:**
Based on Toronto's actual zoning rules (By-Law 2022-62, Section 5, Table 5.7):

| Zone type | Required parking | Source |
|-----------|-----------------|--------|
| Residential | 1.2 spaces per unit (assuming ~80 m² per unit) | By-Law 2022-62, Table 5.7 |
| Commercial / Mixed Use | 1 space per 30 m² of floor area | By-Law 2022-62, Table 5.7 |
| Institutional | 1 space per 45 m² of floor area | By-Law 2022-62, Table 5.7 |
| Industrial / Employment | 1 space per 100 m² of floor area | By-Law 2022-62, Table 5.7 |

Each parking space = **15 m²** (a standard 2.6m x 5.5m stall plus its share of the drive aisle, per TAC Geometric Design Guide for Canadian Roads, 2017).

So for a 3-story commercial building with 1,800 m² of floor area: `1,800 / 30 = 60 spaces x 15 m² = 900 m²` of parking.

**Access / sidewalks:**
Estimated at **15% of the building footprint**. This accounts for entrance aprons, sidewalks, and driveway connections. The 10–20% range comes from the TRCA/CVC Low Impact Development Guide (2010), Table 3.3.

**Previously impervious:**
Not all sites are pristine grass. Downtown lots are already mostly paved. We estimate existing impervious cover by zone:

| Zone | Pre-existing impervious | Literature range | Source |
|------|------------------------|------------------|--------|
| Downtown / Mixed Use | 60% | 50–85% | TRCA LID Guide Table 3.2; Cappiella & Brown (2001) |
| Commercial | 50% | 50–95% | TRCA LID Guide Table 3.2 |
| Urban Residential | 30% | 25–40% | TRCA LID Guide Table 3.2 |
| Institutional | 40% | 30–50% | TRCA LID Guide Table 3.2 |
| Industrial | 40% | 35–55% | TRCA LID Guide Table 3.2 |
| Rural | 5% | 2–10% | TRCA LID Guide Table 3.2 |

**Lot area:**
If not known, estimated as **2.5x the building footprint** — a mid-range value for Toronto's urban zones where floor area ratios typically run 0.3–0.5 (City of Toronto Official Plan, 2023, Section 3.3).

---

## Section 2: Stormwater Runoff

This section answers: *"During a rainstorm, how much more water runs off the site into Toronto's storm drains?"*

### What's shown in the panel

| Column / Row | What it means |
|------|---------------|
| **Storm** | The design storm — a standardized rainfall event used in engineering (e.g., "2-year" = a storm that statistically happens once every 2 years) |
| **Before (mm)** | Runoff depth before the building — how many mm of rainfall become runoff on the existing lot |
| **After (mm)** | Runoff depth after the building is placed |
| **Increase (L)** | The extra runoff volume in litres — this is the key number |
| **Peak flow increase (L/s)** | How much faster water hits the storm drain at the peak of the storm |

### The method: SCS Curve Number (TR-55)

We use the **SCS Curve Number method**, developed by the USDA and published in Technical Release 55 (1986). It's the standard approach used by civil engineers across North America for stormwater sizing. Here's how it works in plain terms:

**Step 1 — Assign a Curve Number (CN)**

Every surface type has a "curve number" from 0–100. Higher = more runoff.

| Surface | CN | Source |
|---------|-----|--------|
| Impervious (pavement, roofs) | 98 | TR-55 Table 2-2a, HSG B |
| Grass (good condition) | 61 | TR-55 Table 2-2a, HSG B |
| Open space (fair condition) | 69 | TR-55 Table 2-2a, HSG B |
| Woods | 55 | TR-55 Table 2-2a, HSG B |
| Gravel | 76 | TR-55 Table 2-2a, HSG B |

"HSG B" = Hydrologic Soil Group B, which represents clay-loam soils typical of Toronto (Farmington and Napanee series, per Ontario Institute of Pedology, "Soils of Frontenac County", 1989).

We calculate a **weighted CN** for the whole lot: if a lot is 40% impervious and 60% grass, the CN = `0.4 x 98 + 0.6 x 61 = 75.8`.

**Step 2 — Calculate runoff depth**

Using the SCS formula (TR-55 Equation 2-3):

```
S = (25,400 / CN) - 254          ← the soil's maximum retention capacity (mm)
Ia = 0.2 x S                      ← initial abstraction (rain absorbed before runoff starts)
Q = (P - Ia)² / (P - Ia + S)     ← runoff depth (mm), only when P > Ia
```

Where P = total rainfall in mm. The 0.2 initial abstraction factor is the standard NRCS assumption used in Ontario municipal engineering.

**Step 3 — Convert to volume**

```
Volume increase (L) = (runoff_after - runoff_before) mm × lot area (m²)
```

Since 1 mm of water over 1 m² = 1 litre, this is a direct conversion.

**Step 4 — Peak flow (Rational Method)**

For the peak flow numbers, we use the Rational Method (Ontario MOE Stormwater Manual, 2003, Section 3.2):

```
Q = C × i × A / 0.36
```

Where C = CN/100 (runoff coefficient), i = rainfall intensity in mm/hr, A = area in hectares. The 0.36 is a unit conversion factor. This tells us the maximum instantaneous flow rate hitting the storm drain.

### Toronto design storms

The rainfall amounts come from **Environment and Climate Change Canada (ECCC)** Intensity-Duration-Frequency (IDF) data for Toronto Pumping Station (Climate ID 6104175), 1-hour duration:

| Return period | Rainfall | What it means | ECCC published range |
|---------------|----------|---------------|---------------------|
| **2-year** | 25 mm | Common summer storm, happens ~every 2 years | 22–27 mm |
| **10-year** | 38 mm | Significant storm, used for minor drainage design | 35–41 mm |
| **25-year** | 47 mm | Major storm, used for road drainage | 44–50 mm |
| **100-year** | 60 mm | Extreme event, used for flood protection design | 56–65 mm |

The 2-year and 100-year storms are highlighted in the panel because they represent the two most important design thresholds — routine drainage and flood protection.

### Example walkthrough

A 20m x 30m, 3-story commercial building on an urban lot:
- Footprint: 600 m², GFA: 1,800 m², lot: ~1,500 m²
- Before: 50% impervious (commercial zone) → CN = 79.5
- After: parking + building + sidewalks push it to ~85% impervious → CN = 92.4
- For the 2-year storm (25 mm):
  - Runoff before: ~6.2 mm, Runoff after: ~14.8 mm
  - Volume increase: ~12,900 L of extra stormwater per storm event

---

## Section 3: Mitigation Measures

This section answers: *"What can we do about it, and what would it cost?"*

### What's shown in the panel

| Element | What it means |
|---------|---------------|
| **Offset meter** (green/amber/red bar) | If you applied ALL suggested measures, what percentage of the 2-year storm runoff increase would be captured |
| **Each measure card** | Name, volume it captures, area needed, cost range, and applicability rating |
| **Applicability dot** | Green = highly suitable for this building, amber = viable with constraints, gray = poor fit |

The offset meter thresholds: **100%+** = green (fully offset), **70–99%** = amber (good but not complete), **<70%** = red (significant gap).

### The five mitigation measures

#### 1. Green Roof

| Parameter | Value | Source |
|-----------|-------|--------|
| Retention per storm | 15 mm | NRC (2024) measured 10–25 mm in Toronto/Ottawa zone; TRCA LID Guide Table 4.6.1 |
| Volume captured | 15 mm x roof area (m²) = litres | Direct conversion |
| Cost | $150–$400 per m² | TRCA Life Cycle Cost Report (2021), adjusted to 2024 CAD |
| Applicability | **High** for flat roofs, **Low** for gable/hip | Flat roofs are structurally suitable; pitched roofs need expensive modifications |

**How to explain it:** "A green roof is a layer of plants and soil on top of the building. It acts like a sponge — absorbs the first 15mm of every rainstorm before any water runs off. That's enough to capture most routine rain events entirely."

#### 2. Permeable Pavement

| Parameter | Value | Source |
|-----------|-------|--------|
| Retention per storm | 25 mm | TRCA/CVC LID Guide Section 4.7; ICPI Tech Spec 18 |
| Volume captured | 25 mm x parking area (m²) = litres | Direct conversion |
| Cost | $80–$150 per m² | TRCA Life Cycle Cost Report (2021), adjusted to 2024 CAD |
| Applicability | **High** (always viable for parking) | Standard commercial product |

**How to explain it:** "Instead of solid asphalt, use pavers with gaps or porous concrete for the parking lot. Rain soaks through into a gravel reservoir underneath instead of sheeting off into the storm drain. Captures the first 25mm of rainfall."

#### 3. Rain Garden / Bioswale

| Parameter | Value | Source |
|-----------|-------|--------|
| Size | 7% of total impervious area | Ontario MOE Manual Section 4.6.3 (5–10% range); TRCA LID Guide Section 4.4 |
| Ponding depth | 150 mm | TRCA LID Guide Table 4.4.3 (recommended 150–250 mm) |
| Volume captured | 150 mm x garden area = litres | Direct conversion |
| Cost | $30–$60 per m² | TRCA Life Cycle Cost Report (2021) — simplified rain garden |
| Applicability | **High** | Works on most sites with available perimeter space |

**How to explain it:** "A landscaped depression along the building's edge that collects runoff. It ponds up to 150mm of water and lets it slowly soak into the ground over 48–72 hours. Also filters pollutants. Think of it as a really functional garden bed."

#### 4. Underground Detention Tank

| Parameter | Value | Source |
|-----------|-------|--------|
| Volume | Sized to capture 100% of 2-year storm increase | Standard engineering practice |
| Depth | 1.5 m (standard chamber depth) | TRCA LID Guide Section 4.9 (1.0–2.0m range) |
| Footprint | volume / 1.5 m² | Direct from depth |
| Cost | $500–$1,000 per m³ | TRCA Life Cycle Cost Report (2021) |
| Applicability | **Medium** | Requires excavation; best for constrained sites |

**How to explain it:** "A buried storage system — modular plastic or concrete chambers under the parking lot or landscaping. Captures the entire storm, then slowly releases it over hours. The underground option when there's no room for surface solutions."

#### 5. Rainwater Harvesting Cistern

| Parameter | Value | Source |
|-----------|-------|--------|
| Volume | Roof area x 0.015 m, clamped to 5–20 m³ | TRCA LID Guide Section 4.1; Ontario Building Code 2024, SB-1 |
| Cost | $1,000–$5,000 (fixed range) | TRCA Life Cycle Cost Report (2021) |
| Applicability | **Medium** | Requires plumbing for reuse (irrigation, toilets) |

**How to explain it:** "A tank that captures roof runoff and stores it for later use — watering landscaping, flushing toilets, washing. Dual benefit: reduces stormwater AND reduces water bills. The 5–20 m³ range covers everything from a residential rain barrel system to a commercial-scale underground cistern."

### How the offset percentage works

```
offset % = (sum of all measures' volume reductions) / (2-year storm volume increase) x 100
```

If the 2-year storm creates 12,900 L of extra runoff, and the combined measures capture 15,000 L, the offset is 116% → shown as **100%** (green). This means the site fully manages its own stormwater for routine storms.

---

## Key assumptions and limitations

These are important to mention if someone presses on accuracy:

| Assumption | Why we made it | What would change in a real assessment |
|------------|----------------|---------------------------------------|
| Hydrologic Soil Group B | Conservative choice for Toronto clay-loam; actual soils range B–C | A geotechnical report would determine this per-site. HSG C would increase all runoff numbers |
| 1-hour storm duration | Standard for small urban lots | Larger sites would model multiple durations |
| Lot area = 2.5x footprint | Mid-range for urban Toronto | A real project uses the actual property boundary from survey/GIS |
| Pre-development impervious by zone | Literature mid-range values | Actual existing conditions from site visit or aerial imagery |
| All mitigation volumes are additive | Simplification for the offset meter | In practice, some measures overlap (e.g., green roof reduces what reaches the rain garden) |
| Costs are 2024 CAD estimates | Based on TRCA lifecycle cost studies, adjusted for inflation | Actual quotes from contractors would vary by site conditions |

---

## Source bibliography

1. **USDA NRCS (1986).** "Urban Hydrology for Small Watersheds" (TR-55). https://www.nrcs.usda.gov/sites/default/files/2023-10/TR55.pdf

2. **ECCC.** IDF Curves — Toronto Pumping Station (Climate ID 6104175). https://climate-change.canada.ca/climate-data/short-duration-rainfall-intensity-duration-frequency

3. **City of Toronto.** Zoning By-Law No. 2022-62, Section 5 (Parking). https://www.cityoftoronto.ca/residents/property-taxes/zoning

4. **TRCA / CVC (2010).** "Low Impact Development Stormwater Management Planning and Design Guide", v1.0. https://cvc.ca/wp-content/uploads/2014/04/LID-SWM-Guide-v1.0_2010_1_no-appendices.pdf

5. **Ontario MOE (2003).** "Stormwater Management Planning and Design Manual." Queen's Printer for Ontario.

6. **NRC Canada (2024).** "Performance of Green Infrastructure in Canadian Climate Zones." NRC Construction Portfolio.

7. **TRCA (2021).** "Assessment of Life Cycle Costs for Low Impact Development Stormwater Management Practices." Sustainable Technologies Evaluation Program.

8. **Cappiella, K. & Brown, K. (2001).** "Impervious Cover and Land Use in the Chesapeake Bay Watershed." Center for Watershed Protection.

9. **Ontario Institute of Pedology (1989).** "Soils of Frontenac County." OMAFRA Soil Survey Reports.

10. **TAC (2017).** Geometric Design Guide for Canadian Roads, Chapter 5.3 (Parking).

11. **City of Toronto (2019).** Stormwater Master Plan.

12. **City of Toronto (2023).** Official Plan, Section 3.3 — Density and Built Form.
