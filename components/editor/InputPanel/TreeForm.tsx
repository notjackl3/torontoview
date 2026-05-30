import { useState } from 'react';
import { BuildingSpecification, TreeType, DEFAULT_TREE_CONFIG, TreeConfig } from '@/lib/editor/types/buildingSpec';

interface TreeFormProps {
  spec: BuildingSpecification;
  onUpdate: (updates: Partial<BuildingSpecification>) => void;
}

interface TreeInfo {
  value: TreeType;
  label: string;
  icon: string;
  scientificName: string;
  height: string;
  bio: string;
}

interface AIResponse {
  recommendation: {
    selectedTrees: TreeType[];
    density: number;
    radius: number;
    reasoning: string;
    tips: string[];
  };
  treeConfig: TreeConfig;
}

const TREE_TYPES: TreeInfo[] = [
  { value: 'autumn-blaze-maple', label: 'Autumn Blaze Maple', icon: '🍁', scientificName: 'Acer x freemanii', height: '15m', bio: 'Fast-growing with brilliant bright red fall colour. Provides excellent shade for open spaces.' },
  { value: 'canadian-serviceberry', label: 'Canadian Serviceberry', icon: '🌸', scientificName: 'Amelanchier canadensis', height: '5m', bio: 'Minimal maintenance with white spring flowers transitioning to deep red fall foliage. Perfect for landscapes.' },
  { value: 'colorado-blue-spruce', label: 'Colorado Blue Spruce', icon: '🌲', scientificName: 'Picea pungens', height: '10-15m', bio: 'Dense silvery-blue needles. Excellent wind coverage and a holiday favourite in urban settings.' },
  { value: 'cortland-apple', label: 'Cortland Apple', icon: '🍎', scientificName: 'Malus domestica', height: '2-4m', bio: 'Cross between Ben Davis and McIntosh. Crisp, sweet fruit that is slow to oxidise - great for salads.' },
  { value: 'eastern-redbud', label: 'Eastern Redbud', icon: '💗', scientificName: 'Cercis canadensis', height: '10m', bio: 'Heart-shaped leaves with vibrant pink spring blossoms. Flowers, leaves and seeds are all edible.' },
  { value: 'eastern-white-pine', label: 'Eastern White Pine', icon: '🌲', scientificName: 'Pinus strobus', height: '20m', bio: 'Iconic Canadian species with soft, fragrant dark green needles. Made famous by artist Tom Thomson.' },
  { value: 'mcintosh-apple', label: 'McIntosh Apple', icon: '🍏', scientificName: 'Malus domestica', height: '2-5m', bio: "Canada's national apple, first discovered in Southern Ontario in the early 19th century." },
  { value: 'northern-red-oak', label: 'Northern Red Oak', icon: '🌳', scientificName: 'Quercus rubra', height: '20-30m', bio: 'One of the largest local species. Majestic tree tolerant of urban conditions with excellent shade.' },
  { value: 'paper-birch', label: 'Paper Birch', icon: '🌿', scientificName: 'Betula papyrifera', height: '10m', bio: 'Recognizable by beautiful white peeling bark year-round. Vibrant green summer leaves turn bright yellow in fall.' },
  { value: 'sugar-maple', label: 'Sugar Maple', icon: '🍁', scientificName: 'Acer saccharum', height: '35m', bio: 'Produces delicious maple syrup from its sap. An icon in Canadian culture with vibrant fall colours.' },
  { value: 'white-spruce', label: 'White Spruce', icon: '🌲', scientificName: 'Picea glauca', height: '10-15m', bio: 'Hearty tree of the Canadian north. Dense branching offers shelter for birds, squirrels, and chipmunks.' },
];

const QUICK_PROMPTS = [
  { label: 'Best for shade', prompt: 'What trees provide the best shade for this building?' },
  { label: 'Save cost', prompt: 'What trees should I plant to save cost long-term with low maintenance?' },
  { label: 'Small space', prompt: 'What trees work best for a small property with limited space?' },
  { label: 'Wildlife', prompt: 'What trees attract and support local wildlife?' },
  { label: 'Year-round', prompt: 'What trees look good year-round including winter?' },
  { label: 'Canadian', prompt: 'What iconic Canadian native trees would fit this building?' },
];

const sliderClass = "w-full h-2 bg-white/10 rounded-full appearance-none cursor-pointer accent-blue-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-blue-400 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:active:cursor-grabbing";

export function TreeForm({ spec, onUpdate }: TreeFormProps) {
  const treeConfig = spec.treeConfig || DEFAULT_TREE_CONFIG;
  const [selectedTreeInfo, setSelectedTreeInfo] = useState<TreeInfo | null>(null);
  const [showAIAdvisor, setShowAIAdvisor] = useState(false);
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState<AIResponse | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const updateTreeConfig = (updates: Partial<typeof treeConfig>) => {
    onUpdate({ treeConfig: { ...treeConfig, ...updates } });
  };

  const toggleTreeType = (type: TreeType) => {
    const currentTypes = treeConfig.types;
    const newTypes = currentTypes.includes(type)
      ? currentTypes.filter((t) => t !== type)
      : [...currentTypes, type];
    if (newTypes.length > 0) updateTreeConfig({ types: newTypes });
  };

  const randomizeSeed = () => {
    updateTreeConfig({ seed: Math.floor(Math.random() * 100000) });
  };

  const askAI = async (question: string) => {
    setAiLoading(true);
    setAiError(null);
    setAiResponse(null);
    try {
      const response = await fetch('/api/tree-advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, buildingContext: { width: spec.width, depth: spec.depth, numberOfFloors: spec.numberOfFloors, floorHeight: spec.floorHeight, roofType: spec.roofType } }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get recommendation');
      }
      const data = await response.json() as AIResponse;
      setAiResponse(data);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'Failed to get AI recommendation');
    } finally {
      setAiLoading(false);
    }
  };

  const handleAskQuestion = () => {
    if (aiQuestion.trim()) askAI(aiQuestion);
  };

  const applyAIRecommendation = () => {
    if (aiResponse?.treeConfig) {
      updateTreeConfig(aiResponse.treeConfig);
      setShowAIAdvisor(false);
      setAiResponse(null);
      setAiQuestion('');
    }
  };

  const getTreeIcon = (treeId: TreeType) => TREE_TYPES.find(t => t.value === treeId)?.icon || '🌲';
  const getTreeLabel = (treeId: TreeType) => TREE_TYPES.find(t => t.value === treeId)?.label || treeId;

  return (
    <div className="space-y-6">
      <h3 className="text-xl font-bold text-zinc-100 mb-2">Landscaping</h3>
      <p className="text-xs text-zinc-500">Trees from Toronto's Neighbourhood Tree Planting Program</p>

      {/* AI Advisor Button */}
      <button
        onClick={() => setShowAIAdvisor(!showAIAdvisor)}
        className={`w-full px-4 py-3 rounded-xl font-medium text-sm border-2 flex items-center justify-center gap-2 transition-all duration-200 ${
          showAIAdvisor
            ? 'bg-purple-500/20 border-purple-400/40 text-purple-300'
            : 'bg-purple-500/10 border-purple-400/20 text-purple-300 hover:bg-purple-500/20 hover:border-purple-400/40'
        }`}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        AI Tree Advisor
        <span className="text-[10px] bg-purple-500/30 text-purple-300 px-1.5 py-0.5 rounded-full">Gemini</span>
      </button>

      {/* AI Advisor Panel */}
      {showAIAdvisor && (
        <div className="bg-purple-500/10 border border-purple-400/20 rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-2 text-purple-300">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <span className="text-sm font-semibold">Ask about tree recommendations</span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {QUICK_PROMPTS.map((qp) => (
              <button
                key={qp.label}
                onClick={() => { setAiQuestion(qp.prompt); askAI(qp.prompt); }}
                disabled={aiLoading}
                className="px-2 py-1 text-[10px] bg-white/5 border border-white/10 rounded-full text-zinc-300 hover:bg-white/10 hover:border-white/20 transition-colors disabled:opacity-50"
              >
                {qp.label}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={aiQuestion}
              onChange={(e) => setAiQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAskQuestion()}
              placeholder="What tree should I plant for this building?"
              className="flex-1 px-3 py-2 text-sm border border-white/10 bg-white/5 rounded-lg text-zinc-200 placeholder-zinc-600 focus:border-purple-400 focus:outline-none"
              disabled={aiLoading}
            />
            <button
              onClick={handleAskQuestion}
              disabled={aiLoading || !aiQuestion.trim()}
              className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {aiLoading ? (
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              )}
            </button>
          </div>

          {aiError && (
            <div className="bg-red-500/10 border border-red-400/20 rounded-lg p-3 text-sm text-red-400">
              <span className="font-semibold">Error:</span> {aiError}
            </div>
          )}

          {aiResponse && (
            <div className="space-y-3">
              <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                <p className="text-sm text-zinc-300">{aiResponse.recommendation.reasoning}</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                <p className="text-xs font-semibold text-purple-300 mb-2">Recommended Trees:</p>
                <div className="flex flex-wrap gap-2">
                  {aiResponse.recommendation.selectedTrees.map((treeId) => (
                    <span key={treeId} className="inline-flex items-center gap-1 px-2 py-1 bg-purple-500/20 text-purple-300 rounded-full text-xs">
                      {getTreeIcon(treeId)} {getTreeLabel(treeId)}
                    </span>
                  ))}
                </div>
              </div>
              <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                <p className="text-xs font-semibold text-purple-300 mb-2">Suggested Settings:</p>
                <div className="flex gap-4 text-xs text-zinc-400">
                  <span>Density: <strong className="text-zinc-200">{aiResponse.recommendation.density}</strong></span>
                  <span>Radius: <strong className="text-zinc-200">{aiResponse.recommendation.radius}m</strong></span>
                </div>
              </div>
              {aiResponse.recommendation.tips.length > 0 && (
                <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                  <p className="text-xs font-semibold text-purple-300 mb-2">Tips:</p>
                  <ul className="text-xs text-zinc-400 space-y-1">
                    {aiResponse.recommendation.tips.map((tip, i) => (
                      <li key={i} className="flex items-start gap-1">
                        <span className="text-purple-400">•</span>{tip}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <button
                onClick={applyAIRecommendation}
                className="w-full px-4 py-2.5 bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-lg font-medium text-sm hover:from-purple-600 hover:to-blue-600 transition-all flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Apply Recommendation
              </button>
            </div>
          )}
        </div>
      )}

      {/* Enable/Disable Toggle */}
      <div className="flex items-center justify-between">
        <label className="block text-sm font-semibold text-zinc-400">Enable Trees</label>
        <button
          onClick={() => updateTreeConfig({ enabled: !treeConfig.enabled })}
          className={`relative w-14 h-7 rounded-full transition-all duration-200 ${treeConfig.enabled ? 'bg-blue-500' : 'bg-white/10'}`}
        >
          <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all duration-200 ${treeConfig.enabled ? 'left-8' : 'left-1'}`} />
        </button>
      </div>

      {treeConfig.enabled && (
        <>
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-zinc-400 mb-2">
              Tree Species ({treeConfig.types.length} selected)
            </label>
            <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
              {TREE_TYPES.map((tree) => (
                <button
                  key={tree.value}
                  onClick={() => toggleTreeType(tree.value)}
                  onMouseEnter={() => setSelectedTreeInfo(tree)}
                  onMouseLeave={() => setSelectedTreeInfo(null)}
                  className={`px-2 py-2 rounded-lg text-xs font-medium border flex flex-col items-center gap-0.5 transition-colors duration-200 ${
                    treeConfig.types.includes(tree.value)
                      ? 'bg-white/15 border-white/20 text-white'
                      : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10 hover:border-white/20 hover:text-zinc-200'
                  }`}
                >
                  <span className="text-base">{tree.icon}</span>
                  <span className="text-center leading-tight">{tree.label.split(' ')[0]}</span>
                </button>
              ))}
            </div>
          </div>

          {selectedTreeInfo && (
            <div className="bg-white/5 border border-white/10 rounded-lg p-3 text-xs">
              <div className="flex items-start gap-2">
                <span className="text-2xl">{selectedTreeInfo.icon}</span>
                <div className="flex-1">
                  <p className="font-bold text-zinc-200">{selectedTreeInfo.label}</p>
                  <p className="text-zinc-500 italic text-[10px]">{selectedTreeInfo.scientificName}</p>
                  <p className="text-zinc-400 mt-1">Height: {selectedTreeInfo.height}</p>
                  <p className="text-zinc-400 mt-1">{selectedTreeInfo.bio}</p>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <label className="block text-sm font-semibold text-zinc-400 mb-2">
              Density: <span className="text-blue-400">{treeConfig.density}</span>
            </label>
            <input type="range" min="1" max="10" step="1" value={treeConfig.density}
              onChange={(e) => updateTreeConfig({ density: parseInt(e.target.value) })} className={sliderClass} />
            <p className="text-xs text-zinc-500">More = more trees around building</p>
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-semibold text-zinc-400 mb-2">
              Spread Radius: <span className="text-blue-400">{treeConfig.radius}m</span>
            </label>
            <input type="range" min="3" max="20" step="1" value={treeConfig.radius}
              onChange={(e) => updateTreeConfig({ radius: parseInt(e.target.value) })} className={sliderClass} />
            <p className="text-xs text-zinc-500">How far trees spread from building edge</p>
          </div>

          <div className="pt-4">
            <button
              onClick={randomizeSeed}
              className="w-full px-5 py-2.5 rounded-full font-medium text-sm border bg-white/5 border-white/10 text-zinc-300 hover:bg-white/10 hover:border-white/20 hover:text-white transition-colors duration-200 flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Randomize Layout
            </button>
            <p className="text-xs text-zinc-500 text-center mt-2">Generate a new random arrangement</p>
          </div>
        </>
      )}
    </div>
  );
}
