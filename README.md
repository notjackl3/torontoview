# TorontoView

**A 3D urban planning platform where you design buildings with your voice, place them on a live map of Toronto, and simulate environmental impact -- before the first shovel hits the ground.**

Built for the City of Toronto at Nvidia Spark Hackathon 2026.

---

## 1. Project Overview

TorontoView is a real-time, voice-driven urban planning simulator built on top of a 3D model of Toronto, Ontario. It allows city planners, residents, and public officials to design buildings using natural language, place them at real-world coordinates, and immediately see the projected environmental, traffic, and community impact.

The platform combines three core technologies into a single interactive experience:

- **ElevenLabs** provides the voice and audio layer -- real-time narration of building designs, AI-generated sound effects for every editor action, and spoken feedback that makes the tool accessible to users who cannot or prefer not to read dense technical output.
- **Local Qwen/Gemma models** hosted through an OpenAI-compatible endpoint serve as the reasoning engine -- interpreting freeform speech, resolving ambiguity, generating structured building parameters, producing environmental impact reports, and recommending tree species from Toronto's municipal database.
- **Three.js and React Three Fiber** power a full 3D simulation of Toronto with over 100 vehicles, real traffic signals, A* pathfinding, construction noise propagation, and zoning overlays.

The result is a platform where anyone -- regardless of technical skill, visual ability, or planning expertise -- can participate in shaping their city.

---

## 2. Live Demo

**Try it now:** [https://torontoview.vercel.app](https://torontoview.vercel.app)

### What to try first

1. **Open the Build page** -- Navigate to the Building Editor.
2. **Use Voice Design** -- Click "Design with Voice" and say something like:
   - *"Make me a 5-story modern glass tower with a flat roof"*
   - *"A small brick house with arched windows and a gable roof"*
   - *"A 10-floor concrete office building, 20 meters wide"*
3. **Listen** -- ElevenLabs will speak back a confirmation of what was built.
4. **Hear the sounds** -- Every action in the editor (adding floors, resizing, rotating, placing windows) triggers an AI-generated sound effect created by ElevenLabs.
5. **Open the Map** -- Place your building on Toronto's live 3D map.
6. **Zoom into a street** -- Scroll in close to street level and hear an AI-generated metropolitan city ambiance produced by ElevenLabs in real time. The volume fades smoothly based on how close you are to the ground.
7. **Generate an Environmental Report** -- See carbon footprint, noise levels, habitat impact, and community effects analyzed by a local model.
8. **Ask the Tree Advisor** -- Get tree recommendations from Toronto's official planting program, powered by a local model.

---

## 3. What it does

TorontoView makes urban planning conversational, audible, and visual -- all at once.

1. The user speaks a building description (e.g., *"A 3-story brick building with round windows"*)
2. A local Qwen/Gemma model interprets the request and generates a structured JSON configuration
3. The configuration is validated against a Zod schema with automatic retry on failure
4. The 3D building renders instantly in the editor
5. ElevenLabs narrates a spoken confirmation of what was built
6. The user places the building on Toronto's 3D map, sets a construction timeline, and generates a full environmental impact report

Non-technical users, seniors, and visually impaired users can participate in city design. The barrier to civic engagement drops from "knows CAD software" to "can describe a building in a sentence."

---

## 4. Architecture

```
Voice Input -> Web Speech API -> /api/design -> Local LLM (parse + validate)
                                                      v
                                              3D Building Editor (Three.js)
                                              + ElevenLabs Sound Effects (9 AI-generated sounds)
                                                      v
                                              /api/speak -> ElevenLabs TTS (spoken confirmation)
                                                      v
                                              3D Toronto Map (100+ vehicles, traffic, zoning)
                                              + /api/street-sound -> ElevenLabs Sound Gen (city ambiance on zoom)
                                                      v
                              /api/environmental-report -> Local LLM (carbon, noise, habitat, community)
                              /api/tree-advisor -> Local LLM (40+ Toronto tree species, planting advice)
```

---

## 5. ElevenLabs Integration

ElevenLabs is not a cosmetic addition to TorontoView. It is a core layer of the platform that makes the tool accessible, engaging, and usable in contexts where visual interfaces alone are insufficient.

### 5.1 Real-Time Voice Narration (Text-to-Speech API)

When a user designs a building by voice, TorontoView does not simply display the result on screen. It speaks the result back.

After the local model generates a building configuration, a one-sentence confirmation is sent to the ElevenLabs Text-to-Speech API via the `/api/speak` endpoint. The confirmation is streamed as MP3 audio and played immediately in the browser.

This voice feedback serves several critical purposes:

- **Accessibility:** Users with visual impairments or reading difficulties receive confirmation of their design without needing to read anything on screen.
- **Hands-free interaction:** Users operating the tool in a presentation, public meeting, or classroom setting can keep their attention on the 3D view while receiving audio confirmation.
- **Public consultation:** In a city hall presentation, a planner can speak a building description and the audience hears the system respond -- creating a conversational, transparent design process.
- **Error correction:** If the system misinterprets a request, the spoken confirmation makes the misinterpretation immediately obvious, allowing the user to correct it in their next voice command.

### 5.2 AI-Generated Sound Effects (Sound Generation API)

Every interaction in the Building Editor is accompanied by a sound effect generated by the ElevenLabs Sound Generation API. These are not stock audio files. Each sound was generated from a natural-language prompt describing the desired audio experience.

**Nine custom sounds were generated:**

| Editor Action | ElevenLabs Prompt | Duration |
|---------------|-------------------|----------|
| Place object | "A fast whoosh followed by a soft landing thud, like something flying in and dropping into place" | 1.0s |
| Add floor | "A satisfying plastic lego brick snapping and clicking into place, crisp snap click sound, short and punchy" | 0.6s |
| Resize building | "A rubber stretching and elastic pulling sound, like a material being stretched out longer with tension" | 1.0s |
| Change texture | "A quick light whoosh, like a card being flipped or a page turning fast in the wind" | 0.6s |
| Place brick | "A fast smooth whoosh sound effect, like an object flying through the air and landing" | 0.8s |
| Rotate object | "A quick spinning whoosh, like something rotating fast through the air with a smooth swooshing wind sound" | 0.7s |
| Move object | "A smooth gliding whoosh, like an object sliding quickly through the air" | 0.8s |
| Edit window | "A light airy whoosh, like a curtain being pulled open quickly" | 0.6s |
| Add window | "A solid block clicking into place with a satisfying snap and a short bam" | 0.7s |

The sound generation script (`scripts/generate-sounds.mjs`) calls the ElevenLabs Sound Generation API at `https://api.elevenlabs.io/v1/sound-generation` for each prompt and saves the resulting MP3 files to `public/sounds/building/`.

**Sound playback architecture:**

The `SoundManager` class (`lib/editor/utils/SoundManager.ts`) manages all sound playback with:

- **Audio caching:** All nine sounds are preloaded on first use to eliminate latency.
- **Cooldown system:** Each sound has a cooldown (100--400ms) to prevent overlap during rapid interactions like slider adjustments.
- **Clone-based playback:** Audio elements are cloned for each play event, allowing multiple simultaneous sounds.
- **Volume control and mute toggle:** Users can adjust or disable sounds.

### 5.3 Street-Level Ambient Sound (Sound Generation API -- Real-Time)

When a user zooms into street level on the 3D Toronto map, ElevenLabs generates a metropolitan city ambiance in real time. The `/api/street-sound` endpoint calls the ElevenLabs Sound Generation API with a prompt describing a busy urban street -- car horns, engines, pedestrians, distant sirens -- and streams the resulting audio back to the browser.

**How it works:**

1. The 3D map tracks the camera's distance from the ground in every animation frame.
2. When the camera crosses the street-level threshold (< 200 world units), the client calls `/api/street-sound`.
3. ElevenLabs generates a 5-second metropolitan city ambiance clip from a natural-language prompt.
4. The audio plays in a loop with volume that scales smoothly based on zoom distance -- closer to the street means louder ambiance.
5. When the user zooms back out, the sound fades and stops.
6. The audio is cached client-side so subsequent zoom-ins replay instantly without another API call.

This creates an immersive experience where zooming into Toronto's streets feels like walking down a real city block. The sound is not a pre-recorded stock file -- it is generated by ElevenLabs from a text description, the same way the editor sound effects are created.

---

## 6. Local Model Integration

TorontoView uses a local OpenAI-compatible model endpoint for three core features. In development this can be Qwen, Gemma, vLLM, NIM, or any compatible server configured with `LOCAL_LLM_BASE_URL` and `LOCAL_LLM_MODEL`.

### 6.1 Voice Design Parser (`/api/design`)

Converts natural language like *"Make me a tall glass building with round windows"* into a structured building configuration (floors, dimensions, materials, roof, windows, color). The local model resolves ambiguity -- *"tall"* becomes 8 floors, *"glass"* maps to both texture and wall color, *"round windows"* resolves to the `circular` enum. Output is validated against a Zod schema with up to 3 automatic retries. Supports incremental editing: *"Make it taller"* updates only the relevant fields.

### 6.2 Environmental Impact Report (`/api/environmental-report`)

Generates a full environmental and societal impact report for buildings placed on Toronto's map. Covers carbon footprint, habitat disruption, water impact, air quality, traffic projections, noise levels, community effects, risk classification, mitigation measures, and overall sustainability scores (0--100). Grounded in Toronto's geography, zoning, and Great Lakes-St. Lawrence ecosystem.

### 6.3 Tree Advisor (`/api/tree-advisor`)

Recommends tree species from Toronto's Neighbourhood Tree Planting Program -- a real municipal dataset of 40+ species. Returns species selection, planting density, radius, reasoning, and tips. All recommendations are validated against the official Toronto dataset.

---

## 7. Accessibility and Inclusion

TorontoView was designed with accessibility as a primary constraint, not an afterthought. The entire building design workflow can be completed without touching a keyboard or reading output -- press "Design with Voice," describe the building, and hear the spoken confirmation from ElevenLabs.

This serves **visually impaired users**, **seniors**, **non-native English speakers**, and **motor-impaired users**. The user never needs to learn parameter names, unit systems, or menu structures. TorontoView requires the ability to describe a building in a sentence -- nothing more.

---

## 8. Impact and Use Cases

- **City planning** -- Describe a development, place it on the map, and generate an environmental impact report in under a minute.
- **Public consultations** -- Project TorontoView at a town hall. A facilitator speaks, the audience sees the 3D result, and ElevenLabs narrates the output. Residents suggest modifications verbally in real time.
- **Education** -- Students prototype developments and see environmental consequences without learning CAD software.
- **Real estate** -- Developers test designs against zoning codes and generate preliminary impact reports before engaging consultants.

---

## 9. Technical Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS, Framer Motion |
| 3D Engine | Three.js, React Three Fiber, Drei |
| AI Reasoning | Local Qwen/Gemma model through an OpenAI-compatible API (voice design, environmental report, tree advisor) |
| Voice and Sound | ElevenLabs Text-to-Speech API, ElevenLabs Sound Generation API (editor effects + real-time street ambiance), Web Speech API |
| Validation | Zod (schema validation with retry) |
| Geospatial | Turf.js, OpenStreetMap data, lat/lng projection |
| Traffic Simulation | A* pathfinding, spatial grid collision detection, signal coordination, vehicle state machine |
| Data Sources | Toronto Official Plan zoning (76 zones), Toronto tree planting program (40+ species), OpenStreetMap buildings and roads, traffic signal locations |
| Export | GLB (3D model), GeoJSON (geospatial data) |

---

## 10. How to Run Locally

```bash
git clone https://github.com/Lemirq/nvidia-spark-hackathon.git && cd nvidia-spark-hackathon
npm install
```

Add model and API settings to `.env.local`:

```env
LOCAL_LLM_BASE_URL=http://127.0.0.1:8000/v1
LOCAL_LLM_MODEL=unsloth/Qwen3.6-35B-A3B-GGUF
# LOCAL_LLM_API_KEY=optional_if_your_local_gateway_requires_auth
ELEVENLABS_API_KEY=your_elevenlabs_api_key
```

```bash
npm run dev                # Start at http://localhost:3000
npm run generate-sounds    # Regenerate ElevenLabs sound effects
```

---

## 11. Team

Built at Nvidia Spark Hackathon 2026 by:


- **Phineas Truong**
- **Jack Le**
- **Vihaan Sharma**
- **Dhan Narula**


---
