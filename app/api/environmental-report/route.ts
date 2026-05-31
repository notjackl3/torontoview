import { NextRequest, NextResponse } from 'next/server';
import { analyzeDrainage, type BuildingSpec } from '@/lib/water';
import { generateLocalCompletionWithRetry } from '@/lib/localLlm';

interface PlacedBuilding {
  id: string;
  lat: number;
  lng: number;
  scale: { x: number; y: number; z: number };
  position: { x: number; y: number; z: number };
  modelPath?: string;
  timeline?: { zoneType?: string; startDate?: string; durationDays?: number };
}

interface EnvironmentalReport {
  summary: string;
  buildings: BuildingImpact[];
  overallImpact: OverallImpact;
  recommendations: string[];
}

interface BuildingImpact {
  id: string;
  coordinates: { lat: number; lng: number };
  locationDescription: string;
  environmentalImpact: {
    carbonFootprint: string;
    habitatDisruption: string;
    waterImpact: string;
    airQuality: string;
  };
  societalImpact: {
    trafficIncrease: string;
    noiseLevel: string;
    communityEffect: string;
    economicImpact: string;
  };
  riskLevel: 'low' | 'medium' | 'high';
  mitigationMeasures: string[];
}

interface OverallImpact {
  environmentalScore: number; // 1-100
  societalScore: number; // 1-100
  sustainabilityRating: string;
  totalCarbonTonnes: number;
  treesRequired: number;
}

interface MetricsSnapshot {
  timelineDate: string;
  co2Emissions: number;
  energyConsumption: number;
  waterUsage: number;
  totalFootprint: number;
  materialComplexity: string;
  sustainabilityScore: number;
  populationHappiness: number;
  avgDb: number;
  activeCount: number;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { buildings: PlacedBuilding[]; snapshot?: MetricsSnapshot };
    const { buildings, snapshot } = body;

    if (!buildings || buildings.length === 0) {
      return NextResponse.json({ error: 'No buildings provided for analysis' }, { status: 400 });
    }

    // Run drainage analysis for each building
    const drainageResults = buildings.map((b) => {
      const widthM = Math.max(5, Math.round(b.scale.x * 10));
      const lengthM = Math.max(5, Math.round(b.scale.z * 10));
      const heightM = Math.max(3, Math.round(b.scale.y * 3));
      const floors = Math.max(1, Math.round(heightM / 3.5));
      const spec: BuildingSpec = {
        widthM, lengthM, floors,
        roofStyle: 'flat',
        zoneType: b.timeline?.zoneType,
      };
      return analyzeDrainage(spec);
    });

    // Build rich details for the local model: dimensions, zoning, type so it can estimate impacts
    const buildingDetails = buildings.map((b, i) => {
      const footprint = Math.round(b.scale.x * b.scale.z * 100);
      const heightM = Math.round(b.scale.y * 3);
      const zoneType = b.timeline?.zoneType ?? 'unknown';
      const buildingType = b.modelPath?.includes('custom') || b.modelPath?.includes('editor')
        ? 'Custom building (user-designed)'
        : b.modelPath?.includes('let_me_sleep') ? 'Default model (Let Me Sleep Building)' : 'Placed building';
      const drainage = drainageResults[i];
      const storm2yr = drainage.runoff[0];
      const storm100yr = drainage.runoff.find(r => r.returnPeriod === '100-year');
      return `
Building ${i + 1}:
- ID: ${b.id}
- GPS: ${b.lat.toFixed(6)}°N, ${b.lng.toFixed(6)}°W
- Dimensions: scale X=${b.scale.x.toFixed(1)} Y=${b.scale.y.toFixed(1)} Z=${b.scale.z.toFixed(1)} (Y = height axis)
- Approximate footprint: ${footprint} sq meters
- Approximate height: ~${heightM} m
- Zoning: ${zoneType}
- Building type: ${buildingType}
- CALCULATED DRAINAGE DATA (use these exact numbers for waterImpact):
  · Net impervious surface increase: ${drainage.surface.netImperviousIncrease} m²
  · Impervious coverage: ${drainage.surface.imperviousPercentBefore}% → ${drainage.surface.imperviousPercentAfter}%
  · 2-year storm runoff increase: +${storm2yr?.runoffVolumeIncreaseL ?? 0} L (+${storm2yr?.peakFlowIncreaseLps ?? 0} L/s peak)
  · 100-year storm runoff increase: +${storm100yr?.runoffVolumeIncreaseL ?? 0} L (+${storm100yr?.peakFlowIncreaseLps ?? 0} L/s peak)
  · Mitigation offset potential: ${drainage.offsetPercent}% (green roof, permeable paving, rain gardens)
`;
    }).join('\n');

    const snapshotContext = snapshot
      ? `
CURRENT METRICS SNAPSHOT (as of ${new Date(snapshot.timelineDate).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}):
- Active construction sites at this date: ${snapshot.activeCount}
- CO2 emissions (tonnes/PA): ${snapshot.co2Emissions.toFixed(1)}
- Energy consumption (MWh/PA): ${snapshot.energyConsumption.toFixed(1)}
- Water usage (m³/PA): ${snapshot.waterUsage.toFixed(0)}
- Total footprint (sq m): ${snapshot.totalFootprint.toFixed(0)}
- Material complexity: ${snapshot.materialComplexity}
- Sustainability score: ${snapshot.sustainabilityScore}/100
- Population happiness (noise impact): ${snapshot.populationHappiness}/100
- Average construction noise: ~${snapshot.avgDb} dB

Use these snapshot values to align your overall impact numbers and summary with the current timeline state. Reference "as of [this date]" where relevant.
`
      : '';

    const prompt = `You are an environmental and urban planning expert analyzing proposed building developments in Toronto, Ontario, Canada (near Queen's University campus area at coordinates 44.2253°N, 76.4951°W).

PROPOSED BUILDINGS FOR ANALYSIS (use dimensions, zoning, and type to estimate impacts):
${buildingDetails}
${snapshotContext}

ESTIMATION INSTRUCTIONS:
- Estimate construction and operational CO2, energy use, water use, and material intensity for each building using:
  - Footprint (sq m) and height to infer scale and embodied carbon (concrete, steel, glass).
  - Zoning code (e.g. MU1, R1, C1) to infer use type (mixed-use, residential, commercial) and typical energy/water intensity.
  - Building type (custom vs default) to inform complexity and material choices.
- Typical ranges: construction 0.3–0.8 tonnes CO2/sq m; operational 15–40 kWh/sq m/year for commercial, 80–120 for residential; water 5–15 L/sq m/day. Scale with height and footprint.
- Your overallImpact.totalCarbonTonnes and treesRequired should be numerical estimates consistent with the building dimensions and zoning. Prefer your own estimates over the snapshot when the snapshot is from a simple calculator.

LOCATION CONTEXT:
- Area: Toronto, Ontario, Canada - Historic university town on Lake Ontario
- Nearby landmarks: Queen's University campus, Lake Ontario waterfront
- Climate: Humid continental (Dfb), cold winters, warm summers
- Ecological zone: Great Lakes-St. Lawrence mixed forest region
- Notable wildlife: Migratory birds, urban wildlife corridors

Analyze each building and provide a comprehensive environmental and societal impact assessment. Base carbon, energy, water, and material estimates on the dimensions, zoning, and building type above.

You MUST respond with valid JSON in this exact format:
{
  "summary": "2-3 sentence overview of the overall development impact",
  "buildings": [
    {
      "id": "building-id",
      "coordinates": { "lat": 44.225, "lng": -76.495 },
      "locationDescription": "Brief description of the specific location and what currently exists there",
      "environmentalImpact": {
        "carbonFootprint": "Estimated construction and operational carbon impact",
        "habitatDisruption": "Impact on local flora, fauna, and ecosystems",
        "waterImpact": "Effects on drainage, groundwater, Lake Ontario",
        "airQuality": "Construction and long-term air quality effects"
      },
      "societalImpact": {
        "trafficIncrease": "Expected traffic and congestion changes",
        "noiseLevel": "Noise pollution during and after construction",
        "communityEffect": "Impact on nearby residents, students, businesses",
        "economicImpact": "Jobs, property values, local economy effects"
      },
      "riskLevel": "low|medium|high",
      "mitigationMeasures": ["Specific actionable mitigation measure 1", "Measure 2"]
    }
  ],
  "overallImpact": {
    "environmentalScore": 75,
    "societalScore": 68,
    "sustainabilityRating": "B+ (Good with room for improvement)",
    "totalCarbonTonnes": 2500,
    "treesRequired": 150
  },
  "recommendations": [
    "Strategic recommendation 1",
    "Recommendation 2",
    "Recommendation 3"
  ]
}

SCORING GUIDELINES:
- environmentalScore: 100 = no impact, 0 = devastating impact
- societalScore: 100 = highly beneficial, 0 = highly detrimental
- totalCarbonTonnes: Estimate from footprint, height, and zoning (construction + 10-year operational). Typical: 0.3–0.8 t CO2/sq m construction; 0.02–0.05 t/sq m/year operational.
- treesRequired: Offset totalCarbonTonnes (avg tree ~20 kg CO2/year; use for 10–20 year offset)

Be specific about the Toronto, Ontario context. Reference real features of the area when relevant (Lake Ontario, Queen's University, downtown Toronto, local parks, transit routes).

Respond ONLY with the JSON object, no additional text.`;

    const text = await generateLocalCompletionWithRetry({
      messages: [
        {
          role: 'system',
          content: 'You are an environmental and urban planning analyst. Return only valid JSON matching the requested schema.',
        },
        { role: 'user', content: prompt },
      ],
      maxTokens: 4096,
      temperature: 0.2,
    });

    let report: EnvironmentalReport;
    try {
      const cleanedText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      report = JSON.parse(cleanedText);
    } catch {
      console.error('Failed to parse local model response:', text);
      return NextResponse.json({
        error: 'Failed to parse AI response',
        rawResponse: text
      }, { status: 500 });
    }

    return NextResponse.json({
      report,
      generatedAt: new Date().toISOString(),
      buildingCount: buildings.length,
      snapshotDate: snapshot?.timelineDate ?? null,
    });

  } catch (error) {
    console.error('Environmental report error:', error);
    return NextResponse.json({
      error: 'Failed to generate environmental report',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
