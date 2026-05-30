# Routes and Pages

## Next.js App Router Structure

### Routes

| URL Path | Component File | Description |
|----------|---------------|-------------|
| `/` | `app/page.tsx` | Home page with 3D traffic simulation map |
| `/editor` | `app/editor/page.tsx` | Building editor (separate feature) |

### Route Details

#### `/` - Home Page
**File**: `app/page.tsx`
**Layout**: Uses root layout (`app/layout.tsx`)
**Description**: Main page displaying Toronto Municipal Planning interface with:
- 3D interactive map (ThreeMap component)
- Top header with branding and status
- Left sidebar with real-time analytics
- Bottom control bar with view controls

#### `/editor` - Building Editor
**File**: `app/editor/page.tsx`
**Layout**: Uses root layout (`app/layout.tsx`)
**Description**: Building editor tool (separate from main traffic simulation)

### No Router Configuration File
Next.js App Router uses file-system based routing - no explicit router configuration exists.
