# Toronto Event Permit Pre-Checker - Implementation Plan

## Context

Small event organizers in Toronto (students, nonprofits, first-timers) struggle with the permit application process because requirements change based on location, size, alcohol, noise, and other factors. City staff spend excessive time answering repetitive questions and reviewing incomplete applications.

**Solution**: An adaptive permit pre-checker that asks 8-12 smart questions, auto-generates a checklist of required permits with timelines and contacts, and flags missing information before submission. This is "TurboTax for city permits" - translating complex rules into an understandable system.

**Target**: Nvidia Spark Hackathon hackathon (~36 hours), 4-person team, React/Next.js + TypeScript stack, production-ready polish focus.

---

## Project Architecture

### Tech Stack
- **Framework**: Next.js 14+ with App Router
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS + shadcn/ui components
- **State Management**: React Context or Zustand (for form state)
- **Validation**: Zod schemas
- **Deployment**: Vercel (instant, free for hackathons)

**Why this stack**:
- Fast development velocity
- Professional UI out of the box
- No backend infrastructure needed initially
- Easy to add API routes if time permits
- Excellent for demos

---

## Core Features (Priority Order)

### ✅ Phase 1: Must-Have (Core Demo) - Hours 0-20

#### 1. Smart Questionnaire Flow
**Owner: Frontend Dev**

Multi-step wizard that asks contextual questions:
- Event basics (name, description)
- Location (dropdown of Toronto parks/venues OR address input)
- Date and time (with duration)
- Estimated attendance
- Event type checkboxes (alcohol, food, amplified sound, vendor booths)
- Road/sidewalk impact
- Organization type (student/nonprofit/for-profit)

**Technical approach**:
- React Hook Form for form management
- Conditional question rendering (e.g., if alcohol=yes, ask about liquor license)
- Progress indicator
- Clean, accessible UI using shadcn/ui components

**Validation**:
- Zod schemas for each step
- Real-time validation with helpful error messages
- "Previous" and "Next" navigation

#### 2. Rules Engine
**Owner: Rules Engine Dev**

Decision logic that maps answers to required permits:

```typescript
interface EventInput {
  location: string;
  attendance: number;
  hasAlcohol: boolean;
  hasFood: boolean;
  hasAmplifiedSound: boolean;
  hasRoadClosure: boolean;
  duration: number;
  isForProfit: boolean;
  // ... other fields
}

interface PermitRequirement {
  id: string;
  name: string;
  description: string;
  department: string;
  contactEmail: string;
  contactPhone: string;
  timeline: number; // days before event
  cost: number | "varies";
  requiredDocuments: string[];
  reasoning: string; // why this permit is required
}
```

**Rules logic** (simplified but authentic Toronto requirements):

1. **Special Event Permit**
   - IF: attendance > 50 OR hasAlcohol OR hasRoadClosure
   - Timeline: 14 days before
   - Cost: $100-$300

2. **Noise Exemption**
   - IF: hasAmplifiedSound AND (time after 9pm OR time before 7am)
   - Timeline: 10 days before
   - Cost: $75

3. **Parks Booking**
   - IF: location is a city park
   - Timeline: 7 days before
   - Cost: $50-$200

4. **Liquor License / Special Occasion Permit**
   - IF: hasAlcohol
   - Timeline: 21 days before
   - Cost: $80 (AGCO fee)

5. **Certificate of Insurance**
   - IF: attendance > 100 OR hasAlcohol OR city park
   - Required: $2M liability coverage
   - Timeline: Submit with application

6. **Food Vendor Permit**
   - IF: hasFood
   - Contact: Toronto Health Unit
   - Timeline: 7 days before

7. **Road Closure Permit**
   - IF: hasRoadClosure
   - Timeline: 30 days before
   - Cost: $200+

**Implementation**:
- Pure function: `determinePermits(input: EventInput): PermitRequirement[]`
- Comprehensive test coverage
- Detailed reasoning for each permit (shown to user)

#### 3. Results & Checklist Page
**Owner: Frontend Dev**

Clean display of all required permits with:
- **Summary card**: "Your event requires X permits"
- **Timeline warning**: Flag if submitted too close to event date
- **Permit cards**: Each showing:
  - Name and description
  - Department contact
  - Deadline (calculated from event date)
  - Required documents
  - Why it's needed (reasoning)
- **Downloadable checklist**: Print-friendly version
- **Next steps**: Instructions on how to proceed

**Design notes**:
- Color-coded by urgency (red if deadline tight, yellow if moderate, green if plenty of time)
- Mobile-responsive
- Shareable link (encode answers in URL params)

#### 4. Toronto Permit Data Configuration
**Owner: Data/Research Person**

Research actual Toronto permit requirements and create:

```typescript
// config/permits.ts
export const PERMIT_CATALOG = {
  specialEvent: { /* ... */ },
  noiseExemption: { /* ... */ },
  // ... etc
};

// config/locations.ts
export const TORONTO_VENUES = [
  { id: 'city-park', name: 'City Park', type: 'park', requiresBooking: true },
  { id: 'springer-market', name: 'Springer Market Square', type: 'square' },
  // ... real Toronto locations
];
```

**Research sources**:
- Toronto.ca official permit pages
- City bylaws (noise, parks, alcohol)
- AGCO regulations
- Insurance requirements from actual event applications

**Deliverable**: Well-documented config files with citations

---

### ⭐ Phase 2: Should-Have (If Time) - Hours 20-30

#### 5. Pre-Submission Validation
**Owner: Rules Engine Dev**

Before showing results, check for:
- **Missing information**: "You selected alcohol but didn't specify licensed server"
- **Timeline conflicts**: "Your event is in 8 days, but Special Event Permit needs 14 days"
- **Document reminders**: "Don't forget: insurance must be submitted with application"

Display warnings prominently before results page.

#### 6. Downloadable Output
**Owner: Integration Dev**

Generate a PDF or formatted document:
- Cover page with event details
- Permit checklist with checkboxes
- Contact information for each department
- Document submission checklist
- Timeline calendar view

**Tech**: Use `react-pdf` or `jspdf` or simple "print" CSS styling

#### 7. Admin Rule Configuration (Basic)
**Owner: Integration Dev**

Simple JSON editor or form to let "city staff" update rules without code:
- Add/edit permits
- Modify thresholds (attendance numbers, timelines)
- Update contact info

**Implementation**: Protected route with basic auth, form that edits JSON config

---

### 🚀 Phase 3: Nice-to-Have (Stretch) - Hours 30-36

#### 8. Save & Resume
- Store form state in localStorage or URL params
- "Email me this checklist" button

#### 9. Analytics Dashboard (Admin View)
- Most common event types
- Most frequently required permits
- Average completion time

#### 10. Multi-language Support
- French translations (Toronto is bilingual Ontario)
- Simple i18n setup

---

## Team Work Division

**Developer 1: Frontend/UI Lead**
- Hours 0-6: Project setup, Next.js scaffold, Tailwind + shadcn/ui
- Hours 6-18: Questionnaire flow, form validation, progress indicators
- Hours 18-28: Results page, styling, mobile responsiveness
- Hours 28-36: Polish, animations, accessibility, demo prep

**Developer 2: Rules Engine Lead**
- Hours 0-4: TypeScript interfaces, rules engine function skeleton
- Hours 4-16: Implement all permit determination logic
- Hours 16-22: Validation logic, timeline checking, missing info detection
- Hours 22-28: Unit tests, edge cases
- Hours 28-36: Refine reasoning text, help with integration

**Developer 3: Data/Research Lead**
- Hours 0-12: Research Toronto permits, bylaws, actual requirements
- Hours 12-18: Create permit catalog config files with real data
- Hours 18-24: Test scenarios (student concert, farmers market, cultural festival)
- Hours 24-30: Write demo script, prepare test cases
- Hours 30-36: User testing, feedback, polish

**Developer 4: Integration/DevOps Lead**
- Hours 0-6: Help with setup, deployment pipeline to Vercel
- Hours 6-12: API route setup (if needed), connect frontend to rules engine
- Hours 12-18: Download/print functionality
- Hours 18-28: Admin panel (basic rule editor)
- Hours 28-36: Final integration testing, demo environment, presentation support

**Team Syncs**:
- Kickoff (Hour 0)
- Integration checkpoint (Hour 12)
- Demo dry-run (Hour 32)

---

## File Structure

```
nvidia-spark-hackathon/
├── src/
│   ├── app/
│   │   ├── page.tsx                 # Landing page
│   │   ├── questionnaire/
│   │   │   └── page.tsx            # Multi-step form
│   │   ├── results/
│   │   │   └── page.tsx            # Results checklist
│   │   └── admin/
│   │       └── page.tsx            # Optional admin panel
│   ├── components/
│   │   ├── ui/                     # shadcn/ui components
│   │   ├── QuestionStep.tsx
│   │   ├── PermitCard.tsx
│   │   └── TimelineWarning.tsx
│   ├── lib/
│   │   ├── rules-engine.ts         # Core permit logic
│   │   ├── validators.ts           # Zod schemas
│   │   └── utils.ts
│   ├── config/
│   │   ├── permits.ts              # Permit catalog
│   │   ├── locations.ts            # Toronto venues
│   │   └── questions.ts            # Question flow config
│   └── types/
│       └── index.ts                # TypeScript interfaces
├── public/
│   └── toronto-logo.png
├── tests/
│   └── rules-engine.test.ts
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── README.md
```

---

## Critical Files to Create

### 1. `/src/lib/rules-engine.ts`
Core business logic - pure function that takes event details and returns required permits.

### 2. `/src/config/permits.ts`
Complete catalog of Toronto permits with all metadata (cost, timeline, contacts, documents).

### 3. `/src/config/questions.ts`
Configuration-driven question flow - allows easy reordering and conditional logic.

### 4. `/src/app/questionnaire/page.tsx`
Multi-step form with state management and validation.

### 5. `/src/app/results/page.tsx`
Results display with permit cards, timeline warnings, and download option.

### 6. `/src/components/PermitCard.tsx`
Reusable component for displaying individual permit requirements.

---

## Data Requirements (Research Needed)

**Must research accurately**:
1. City of Toronto Special Event Permit requirements
2. Toronto Parks booking process and fees
3. Toronto noise bylaws and exemption process
4. AGCO Special Occasion Permit rules
5. Insurance requirements (typical is $2M liability)
6. Health Unit food vendor requirements
7. Road closure permit process and timelines

**Sources**:
- https://www.cityoftoronto.ca/
- Toronto bylaws
- Similar event organizer experiences
- Phone call to City Clerk's office (if time)

---

## Testing & Validation

### Test Scenarios (Create These)
1. **Student concert in City Park** (150 people, amplified sound, no alcohol)
   - Expected: Special Event, Parks Booking, Noise Exemption, Insurance
2. **Farmers market** (300 people, food vendors, 8am-2pm)
   - Expected: Special Event, Parks Booking, Food Vendor Permits, Insurance
3. **Small community gathering** (40 people, daytime, no alcohol/sound)
   - Expected: Parks Booking only
4. **Wedding reception** (120 people, alcohol, private venue)
   - Expected: Liquor License, Insurance
5. **Parade with road closure** (500 people, downtown)
   - Expected: Special Event, Road Closure, Insurance, Police notification

### End-to-End Testing
1. Complete questionnaire with test scenario
2. Verify correct permits are shown
3. Check timeline calculations are accurate
4. Verify all contact information is present
5. Test download/print functionality
6. Confirm mobile responsiveness

---

## Deployment & Demo

### Deployment (Hour 32)
- Deploy to Vercel
- Custom domain or memorable URL (nvidia-spark-hackathon-toronto-permits.vercel.app)
- Ensure fast loading (< 2 seconds)
- Test on mobile

### Demo Script (3 minutes)
**Minute 1: Problem Setup**
- "Small organizers in Toronto struggle with permits"
- "City staff answer same questions repeatedly"
- "We're not changing rules - we're translating them"

**Minute 2: Live Demo**
- Start questionnaire
- "I want to host a student concert in City Park, 150 people, with amplified music"
- Answer 8 questions quickly
- Show instant results with 4 permits, timeline warnings, contact info

**Minute 3: Impact & Next Steps**
- "This saves organizers hours of confusion"
- "This saves city staff dozens of back-and-forth emails"
- "Built with real Toronto data - pilot-ready, not just a demo"
- "Extensible to other cities and permit types"

---

## Why This Wins

**For City Staff Judges**:
- Solves a real, painful problem they face daily
- Doesn't threaten jobs - augments their work
- Shows you understand government workflows
- Pilot-ready feel, not hackathon prototype

**For Technical Judges**:
- Clean architecture, well-tested
- Production-quality code
- Thoughtful UX
- Extensible design

**For General Judges**:
- Clear value proposition
- Equity angle (helps first-time organizers)
- Polished demo
- Realistic implementation

---

## Risk Mitigation

**Risk**: Rules engine too complex
- **Mitigation**: Start with 4-5 permits, add more if time allows

**Risk**: Toronto data hard to research
- **Mitigation**: Use publicly available info, clearly note assumptions

**Risk**: UI takes too long
- **Mitigation**: Use shadcn/ui components out of the box, minimal custom styling

**Risk**: Team coordination issues
- **Mitigation**: Clear file ownership, Git branches per feature, integration checkpoints

---

## Success Metrics

**Minimum Viable Demo** (by Hour 24):
- ✅ Questionnaire works end-to-end
- ✅ Rules engine determines at least 4 permits correctly
- ✅ Results page displays cleanly
- ✅ Deployed and accessible

**Polished Demo** (by Hour 36):
- ✅ All 7 core permits implemented
- ✅ Timeline warnings work
- ✅ Professional styling throughout
- ✅ Mobile responsive
- ✅ Downloadable checklist
- ✅ Demo script rehearsed

---

## Post-Hackathon Extensions (Don't Build Now)

Ideas to mention in presentation:
- Connect directly to city permitting system API
- Analytics dashboard for city staff
- Risk scoring for internal use
- Template library for common events
- Integration with payment processing
- Automated reminder emails for deadlines
- Multi-city support

**Key message**: "This is designed to be production-ready, not just a demo."

---

## Next Steps After Plan Approval

1. **Hour 0**: Initialize Next.js project with TypeScript + Tailwind
2. **Hour 0.5**: Install shadcn/ui, set up folder structure
3. **Hour 1**: Team splits into 4 workstreams
4. **Hour 12**: First integration checkpoint
5. **Hour 24**: MVP checkpoint (basic demo works)
6. **Hour 32**: Demo dry-run
7. **Hour 36**: Final polish, presentation prep

---

## One-Liner for Pitch

> "We're not changing Toronto's permit rules. We're translating them into a system people can actually understand."
