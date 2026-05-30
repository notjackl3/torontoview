# Water / Drainage Impact — Implementation Plan

## Overview

Calculate stormwater runoff increase from a placed building's impervious surface, estimate drainage impact on the surrounding area, and suggest mitigation measures. Primarily calculation-based with a simple visual component.

## Architecture

```
lib/
  water/
    imperviousSurface.ts    -- Calculate added impervious area
    runoffModel.ts          -- SCS Curve Number runoff estimation
    mitigationSuggestions.ts -- Green infrastructure recommendations
components/
  DrainagePanel.tsx         -- Results display with mitigation suggestions
```

## Step 1: Impervious Surface Calculation

**File: `lib/water/imperviousSurface.ts`**

```typescript
interface ImperviousSurfaceResult {
  buildingFootprintM2: number;      // Building footprint area
  parkingAreaM2: number;            // Estimated parking (if applicable)
  sidewalksAndAccessM2: number;     // Estimated hardscape around building
  totalImperviousM2: number;        // Sum of all impervious surfaces
  previousCondition: string;        // What was here before (grass, existing building, etc.)
  netImperviousIncrease: number;    // New impervious minus what was already there
  imperviousPercentage: number;     // Of the lot/parcel area
}

function calculateImperviousSurface(
  buildingSpec: BuildingSpecification,
  zoneCode: string,
  lotAreaM2?: number  // Optional — estimate from building footprint if not provided
): ImperviousSurfaceResult
```

Building footprint: `width * depth` from BuildingSpecification.

Parking estimation by zone type (Toronto By-Law parking minimums):
- Residential: 1.2 spaces per unit × 15 m² per space
- Commercial: 1 space per 30 m² GFA × 15 m² per space
- Office: 1 space per 45 m² GFA × 15 m² per space
- Industrial: 1 space per 100 m² GFA × 15 m² per space

Sidewalks/access: Estimate as 15% of building footprint.

Lot area estimation (if not provided): `buildingFootprint * 2.5` (typical lot-to-building ratio for urban Toronto).

## Step 2: SCS Curve Number Runoff Model

**File: `lib/water/runoffModel.ts`**

The SCS (Soil Conservation Service) Curve Number method is the standard for stormwater runoff estimation in North America.

```typescript
interface RunoffResult {
  designStormMm: number;         // Rainfall depth used (e.g., 25mm for 2-year storm)
  runoffBeforeMm: number;        // Runoff depth before development
  runoffAfterMm: number;         // Runoff depth after development
  runoffIncreaseMm: number;      // Delta
  runoffVolumeIncreaseL: number; // Volume = depth × area
  peakFlowIncreaseM3s: number;   // Estimated peak flow rate increase
  returnPeriod: string;          // "2-year", "10-year", "100-year"
}

function calculateRunoff(
  totalAreaM2: number,
  imperviousBefore: number,       // fraction 0-1
  imperviousAfter: number,        // fraction 0-1
  stormDepthMm: number            // Design storm rainfall
): RunoffResult
```

SCS Curve Number calculation:
```
CN_before = weighted average of CN values for pre-development land cover
CN_after  = weighted average of CN values for post-development land cover

S = (25400 / CN) - 254          // Maximum soil retention (mm)
Ia = 0.2 * S                    // Initial abstraction (mm)
Q = (P - Ia)² / (P - Ia + S)   // Runoff depth (mm), where P > Ia; else Q = 0
```

Curve Numbers for Toronto conditions (Hydrologic Soil Group B — typical for Toronto's clay-loam):
| Surface | CN |
|---|---|
| Impervious (building, pavement) | 98 |
| Grass/lawn (good condition) | 61 |
| Open space (fair condition) | 69 |
| Woods (good condition) | 55 |
| Gravel | 82 |

Design storms for Toronto (IDF curves):
| Return Period | 1-hour Rainfall |
|---|---|
| 2-year | 25 mm |
| 10-year | 38 mm |
| 25-year | 47 mm |
| 100-year | 60 mm |

Calculate for all four return periods and display the 2-year and 100-year prominently.

Peak flow estimation using Rational Method:
```
Q_peak = C * i * A / 360
where:
  C = runoff coefficient ≈ CN/100
  i = rainfall intensity (mm/hr)
  A = catchment area (hectares)
```

## Step 3: Mitigation Suggestions

**File: `lib/water/mitigationSuggestions.ts`**

Based on the runoff increase, suggest specific green infrastructure measures:

```typescript
interface MitigationMeasure {
  name: string;
  description: string;
  volumeReductionL: number;    // How much runoff it handles
  areaRequiredM2: number;      // Space needed
  costEstimate: string;        // Rough cost range
  applicability: 'high' | 'medium' | 'low';
  icon: string;                // For UI display
}

function suggestMitigations(
  runoffIncrease: RunoffResult,
  buildingSpec: BuildingSpecification,
  zoneCode: string
): MitigationMeasure[]
```

Standard green infrastructure measures:

1. **Green Roof**
   - Captures: 50-75% of annual rainfall on roof
   - Volume: `roofArea * 0.015` m³ per rain event (15mm retention depth)
   - Applicability: High for flat roofs, Low for steep roofs
   - Cost: $150-$400/m²

2. **Permeable Pavement** (for parking areas)
   - Captures: 80% of rainfall on paved area
   - Volume: `pavementArea * 0.025` m³ per event
   - Applicability: High for parking, Low for high-traffic roads
   - Cost: $80-$150/m²

3. **Rain Garden / Bioswale**
   - Captures: Can handle 25mm of runoff from contributing area
   - Area needed: 5-10% of contributing impervious area
   - Applicability: High if open space available
   - Cost: $30-$60/m²

4. **Underground Detention Tank**
   - Captures: Designed to target volume
   - Volume: Sized to runoff increase
   - Applicability: High for constrained sites
   - Cost: $500-$1000/m³ stored

5. **Rainwater Harvesting** (cistern)
   - Captures: First flush from roof
   - Volume: Typically 5-20 m³
   - Applicability: Medium (requires ongoing maintenance)
   - Cost: $1000-$5000 per unit

Select and rank measures by:
- Applicability to building type and zone
- Volume reduction vs. the calculated runoff increase
- Whether the combination of suggested measures can offset 100% of the increase

## Step 4: Drainage Panel UI

**File: `components/DrainagePanel.tsx`**

Display as a tab or section within the environmental impact area:

**Impervious Surface section:**
```
Building footprint:    450 m²
Estimated parking:     270 m²
Access/sidewalks:       68 m²
────────────────────────────
Total impervious:      788 m²
Net increase:         +625 m²  (was 163 m² grass/gravel)
```

**Runoff Impact section (table):**
| Storm Event | Before | After | Increase |
|---|---|---|---|
| 2-year (25mm) | 1,200 L | 4,800 L | +3,600 L |
| 100-year (60mm) | 8,500 L | 18,200 L | +9,700 L |

**Peak Flow:**
```
2-year peak flow increase: +0.8 L/s
100-year peak flow increase: +2.1 L/s
```

**Mitigation Recommendations (cards):**
Each card shows:
- Measure name and icon
- "Handles X L of the Y L increase (Z%)"
- Area required
- Cost estimate
- "Recommended" / "Optional" badge

**Offset meter:**
A progress bar showing what percentage of the runoff increase is handled by selected mitigations. Goal: 100%.

```
[████████████░░░░] 78% of runoff increase offset
  Green roof (45%) + Permeable parking (33%)
  Add rain garden to reach 100%
```

## Step 5: Visual Component (Optional)

If time permits, add a simple visual overlay on the map:

1. **Impervious surface highlight**: Color the building footprint + estimated parking area in blue when drainage analysis is active.
2. **Flow arrows**: Small arrows on the ground showing drainage direction (downhill from building to nearest road/drainage).
3. **Catchment area outline**: Dashed line showing the area that drains through the building's location.

This is lower priority than the calculation panel because the visual adds less value for this feature compared to shadow or wind.

## Integration Points

| Existing Code | What Changes |
|---|---|
| `BuildingSpecification` type | Use width, depth, numberOfFloors, roofType for calculations |
| `lib/torontoZoning.ts` | Map zone codes to parking requirements and pre-development land cover |
| `app/map/page.tsx` | Drainage analysis state, pass to panel |
| `EnvironmentalReportModal.tsx` | Replace Gemini's water impact guesswork with calculated data |
| PlacedBuilding interface | Use lat/lng to determine local soil conditions (if data available) |

## Data Sources

All values used in this module are from publicly available sources:
- SCS Curve Numbers: USDA TR-55 (Urban Hydrology for Small Watersheds)
- Toronto IDF curves: Environment and Climate Change Canada IDF data for Toronto (Station 6104025)
- Parking minimums: City of Toronto Zoning By-Law 2022-62
- Green infrastructure costs: Ontario Low Impact Development Stormwater Management Guidance (2017)
- Green roof retention: TRCA/CVC performance monitoring data

## Estimated Effort

- Core calculations (Steps 1-3): 1 day. These are straightforward formulas with no Three.js involvement.
- UI panel (Step 4): 1 day. Mostly React components displaying calculated results.
- Visual overlay (Step 5): 0.5 day. Optional, skip if time-constrained.
- Total: 2-2.5 days.
