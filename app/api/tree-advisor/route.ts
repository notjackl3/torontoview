import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';
import { TORONTO_TREES, TREE_DATASET_SUMMARY, TorontoTreeData } from '@/lib/editor/data/torontoTrees';
import { TreeType, TreeConfig } from '@/lib/editor/types/buildingSpec';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

interface BuildingContext {
  width: number;
  depth: number;
  numberOfFloors: number;
  floorHeight: number;
  roofType: string;
}

interface TreeRecommendation {
  selectedTrees: TreeType[];
  density: number;
  radius: number;
  reasoning: string;
  tips: string[];
}

export async function POST(request: NextRequest) {
  try {
    const { question, buildingContext } = await request.json() as {
      question: string;
      buildingContext?: BuildingContext;
    };

    if (!question) {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 });
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 });
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const buildingInfo = buildingContext
      ? `
CURRENT BUILDING SPECIFICATIONS:
- Building dimensions: ${buildingContext.width}m wide x ${buildingContext.depth}m deep
- Building height: ${buildingContext.numberOfFloors} floors x ${buildingContext.floorHeight}m = ${(buildingContext.numberOfFloors * buildingContext.floorHeight).toFixed(1)}m total
- Roof type: ${buildingContext.roofType}
- Building footprint area: ${(buildingContext.width * buildingContext.depth).toFixed(1)} sq meters
`
      : '';

    const treeDataJson = JSON.stringify(TORONTO_TREES, null, 2);

    const prompt = `You are a tree planting advisor for Toronto, Ontario's Neighbourhood Tree Planting Program.

${TREE_DATASET_SUMMARY}

COMPLETE TREE DATABASE:
${treeDataJson}

${buildingInfo}

USER QUESTION: "${question}"

Based on the question and any building context provided, recommend appropriate trees from the Toronto program.

You MUST respond with valid JSON in this exact format:
{
  "selectedTrees": ["tree-id-1", "tree-id-2"],
  "density": <number 1-10>,
  "radius": <number 3-20>,
  "reasoning": "One sentence explaining why these trees were chosen",
  "tips": ["Short tip 1", "Short tip 2"]
}

IMPORTANT: Keep responses concise!
- "reasoning" must be 1-2 sentences max
- "tips" should have 1-2 tips only, each under 10 words

RULES:
1. selectedTrees must only contain valid tree IDs from: ${TORONTO_TREES.map(t => t.id).join(', ')}
2. density (1-10) represents how many trees: 1-3 = sparse, 4-6 = moderate, 7-10 = dense
3. radius (3-20) is how far from building edge trees should spread in meters
4. Consider the building size when recommending density and radius
5. For cost savings, all trees are $20 but factor in maintenanceLevel (low = cheaper long-term)
6. Match tree mature height to building scale (don't recommend 35m trees for small buildings)
7. Consider spacing requirements (5-6m between trees minimum)

For cost-focused questions: prioritize low-maintenance trees
For shade questions: prioritize trees with "excellent" or "good" shade ratings
For small spaces: recommend trees with height.max <= 10m
For wildlife: recommend trees where wildlife = true
For food/edible: recommend fruit trees or eastern redbud

Respond ONLY with the JSON object, no additional text.`;

    // Retry logic for flaky network
    let result;
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      try {
        result = await model.generateContent(prompt);
        break;
      } catch (fetchError) {
        attempts++;
        if (attempts >= maxAttempts) {
          throw fetchError;
        }
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
      }
    }

    if (!result) {
      throw new Error('Failed to get response after retries');
    }

    const response = result.response;
    const text = response.text();

    // Parse the JSON response
    let recommendation: TreeRecommendation;
    try {
      // Clean up the response - remove markdown code blocks if present
      const cleanedText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      recommendation = JSON.parse(cleanedText);
    } catch {
      console.error('Failed to parse Gemini response:', text);
      return NextResponse.json({
        error: 'Failed to parse AI response',
        rawResponse: text
      }, { status: 500 });
    }

    // Validate the tree IDs
    const validTreeIds = TORONTO_TREES.map(t => t.id);
    const validatedTrees = recommendation.selectedTrees.filter(id =>
      validTreeIds.includes(id as TreeType)
    ) as TreeType[];

    if (validatedTrees.length === 0) {
      validatedTrees.push('sugar-maple'); // Default fallback
    }

    // Clamp values to valid ranges
    const validatedRecommendation: TreeRecommendation = {
      selectedTrees: validatedTrees,
      density: Math.min(10, Math.max(1, recommendation.density || 5)),
      radius: Math.min(20, Math.max(3, recommendation.radius || 8)),
      reasoning: recommendation.reasoning || 'Trees selected based on your requirements.',
      tips: recommendation.tips || [],
    };

    // Get full tree info for selected trees
    const selectedTreeInfo = validatedTrees.map(id =>
      TORONTO_TREES.find(t => t.id === id)
    ).filter(Boolean) as TorontoTreeData[];

    return NextResponse.json({
      recommendation: validatedRecommendation,
      treeDetails: selectedTreeInfo,
      treeConfig: {
        enabled: true,
        types: validatedTrees,
        density: validatedRecommendation.density,
        radius: validatedRecommendation.radius,
        minScale: 0.8,
        maxScale: 1.4,
        seed: Math.floor(Math.random() * 100000),
      } as TreeConfig,
    });

  } catch (error) {
    console.error('Tree advisor error:', error);
    return NextResponse.json({
      error: 'Failed to get tree recommendation',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
