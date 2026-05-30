# Theme and Design Tokens

## Tailwind Configuration
**File**: `tailwind.config.ts`

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        'civic-dark': '#0a0a0a',
        'civic-gray': '#1a1a1a',
      },
      fontFamily: {
        'mono': ['var(--font-ibm-plex-mono)', 'monospace'],
        'sans': ['var(--font-space-grotesk)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
```

## Global Styles
**File**: `app/globals.css`

```css
@import "tailwindcss";

body {
  font-family:
    "Space Grotesk",
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    Roboto,
    Oxygen,
    Ubuntu,
    Cantarell,
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Custom scrollbar for dark theme */
.custom-scrollbar::-webkit-scrollbar {
  width: 8px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}
```

## CSS Variables (Font Loading)
Loaded in root layout via Next.js Google Fonts:

- `--font-ibm-plex-mono` - IBM Plex Mono (weights: 400, 600, 700)
- `--font-space-grotesk` - Space Grotesk (weights: 400, 600, 700)

## Color Palette

### Custom Colors
- `civic-dark`: #0a0a0a (almost black background)
- `civic-gray`: #1a1a1a (dark gray for panels)

### Accent Colors (Used from Tailwind defaults)
- Emerald (primary): emerald-300, emerald-400, emerald-500, emerald-600
- Teal (secondary): teal-500, teal-600, teal-700
- White with opacity: white with various opacity levels (5%, 10%, 50%, 60%, 70%, 80%)
- Status colors: red-500, yellow-500, green-500 (for traffic lights and status indicators)

## Typography Scale
Uses Tailwind's default type scale with custom font families:
- `font-mono`: IBM Plex Mono (for technical/data display)
- `font-sans`: Space Grotesk (for UI labels)

## Design System Patterns

### Glass-morphism
Consistent use of:
- `bg-opacity-90` or `bg-opacity-95` with `backdrop-blur-xl`
- Border with `border-white border-opacity-10`

### Spacing
Standard Tailwind spacing scale (px-4, py-3, gap-2, etc.)

### Border Radius
- Panels: `rounded-2xl`, `rounded-lg`
- Buttons: `rounded-lg`
- Small elements: `rounded-full`, `rounded-sm`

### Shadows
- Cards/panels: `shadow-2xl`, `shadow-lg`
