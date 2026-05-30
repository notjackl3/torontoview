# Design System - Toronto Municipal Planning Authority

## Typography

### Font Families
- **Primary (Body)**: Archivo (weights: 400, 500, 700, 800)
- **Serif (Headings/Numbers)**: Lora (weights: 400, 700)

### Font Usage
```css
body { font-family: 'Archivo', sans-serif; }
h1, h2, h3, .serif-font { font-family: 'Lora', serif; }
```

### Type Scales
- `.ui-label`: 10px, font-weight: 700, uppercase, letter-spacing: 0.05em, color: #64748b
- Small text: 9px - 11px (font-bold for emphasis)
- Body text: 12px - 14px
- Headings: 14px - 16px (font-black, uppercase, tracking-tight)
- Display numbers: 18px - 20px (serif-font, font-bold)

## Colors

### Primary Palette
- **Accent Blue**: #003F7C (primary brand color)
  - Use for: primary buttons, active states, highlights
  - Text: `accent-blue` class or `text-[#003F7C]`
  - Background: `bg-accent-blue` or `bg-[#003F7C]`
  - Border: `border-accent-blue` or `border-[#003F7C]`

### Neutral Palette (Slate)
- Background light: `bg-slate-100` (#f1f5f9)
- Background medium: `bg-slate-200` (#e2e8f0)
- Borders: `border-slate-100`, `border-slate-200`, `border-slate-300`
- Text primary: `text-slate-900` (#0f172a)
- Text secondary: `text-slate-800` (#1e293b)
- Text muted: `text-slate-600` (#475569)
- Text subtle: `text-slate-500` (#64748b)
- Text disabled: `text-slate-400` (#94a3b8)

### Semantic Colors
- **Warning**: `text-amber-700`, `bg-amber-600`
- **Error/Alert**: `text-rose-700`
- **Success**: (use accent-blue for affirmative states)

### Surface Styles

#### Glass Effect
```css
.glass {
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(8px);
    border: 1px solid #e2e8f0;
}
```

#### Map Gradient Overlay
```css
.map-gradient {
    background: radial-gradient(circle at center, transparent 0%, rgba(241, 245, 249, 0.6) 100%);
}
```

## Spacing

Use Tailwind's default spacing scale:
- Gap between elements: `gap-2` (8px), `gap-3` (12px), `gap-4` (16px)
- Padding: `p-2` to `p-5` (8px - 20px)
- Margin: `m-1` to `m-8` (4px - 32px)
- Sidebar widths: `w-72` (288px), `w-80` (320px)
- Positions: `left-6`, `right-6`, `top-6`, `bottom-32` (24px, 128px)

## Border Radius

- Cards/Panels: `rounded-lg` (8px)
- Small elements: `rounded` (4px), `rounded-md` (6px)
- Buttons: `rounded` (4px)
- Icons: `rounded` for square icons
- Progress bars: `rounded-sm` (2px)
- Icon badges: `rounded` (4px)

## Shadows

- Cards: `shadow-sm`, `shadow-md`, `shadow-lg`
- Buttons: `shadow-sm`
- No heavy shadows - keep it subtle and professional

## Components

### Buttons

#### Primary Button
```html
<button class="w-10 h-10 rounded bg-accent-blue flex items-center justify-center text-white hover:bg-slate-900 transition-colors shadow-sm">
```

#### Secondary Button
```html
<button class="text-[10px] font-black accent-blue border border-accent-blue px-2 py-0.5 rounded hover:bg-blue-50">
```

#### Icon Button
```html
<button class="p-1 hover:bg-slate-100 rounded transition-colors text-slate-400">
```

### Cards

#### Glass Panel
```html
<div class="glass rounded-lg p-4 shadow-sm border-slate-200">
```

#### Metric Card
```html
<div class="bg-slate-50 rounded-md p-3 border border-slate-200">
  <p class="ui-label mb-1">Label</p>
  <p class="text-lg font-bold text-slate-900 serif-font">Value</p>
</div>
```

#### Layer Item Card
```html
<div class="p-2.5 rounded-md border border-slate-200 bg-white group cursor-pointer">
  <div class="flex items-center gap-3">
    <div class="w-7 h-7 rounded bg-slate-50 border border-slate-100 flex items-center justify-center">
      <!-- icon -->
    </div>
    <div class="flex-1">
      <p class="text-[11px] font-bold text-slate-900">Title</p>
      <p class="text-[9px] text-slate-500">Subtitle</p>
    </div>
  </div>
</div>
```

### Icons

Use lucide icons via Iconify:
```html
<iconify-icon icon="lucide:landmark" class="text-white text-sm"></iconify-icon>
```

Common icons:
- `lucide:landmark` - Municipal/authority
- `lucide:building-2` - Buildings
- `lucide:traffic-cone` - Infrastructure
- `lucide:leaf` - Environmental
- `lucide:file-text` - Documents/reports
- `lucide:play-circle` - Play/simulation
- `lucide:clock` - Time/timestamp
- `lucide:settings` - Settings
- `lucide:sliders-horizontal` - Adjustments

### Scrollbar

Custom scrollbar for dark/light theme:
```css
.custom-scrollbar::-webkit-scrollbar {
    width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 4px;
}
```

## Layout Structure

### Positioning
- Sidebars use absolute positioning within a `relative` container
- Left sidebar: `left-6 top-6 bottom-32 w-72`
- Right sidebar: `right-6 top-6 bottom-32 w-80`
- Bottom panel: `bottom-0 left-0 right-0`
- Use `z-0`, `z-40`, `z-50` for layering
- `pointer-events-none` on containers, `pointer-events-auto` on interactive elements

### Responsive Behavior
Design is optimized for desktop/large screens. Mobile responsiveness not yet defined.

## Transitions

Consistent transition timing:
```css
.sidebar-transition {
    transition: all 0.2s ease-in-out;
}
```

Use `transition-colors` and `transition-all` for hover states.

## Accessibility

- Checkboxes: `accent-[#003F7C]` for brand consistency
- Text contrast: Ensure all text meets WCAG AA standards
- Interactive elements should have clear hover states
- Icon buttons should have appropriate ARIA labels

## Design Principles

1. **Professional & Technical**: Use monospace-style fonts for data, uppercase for labels
2. **Glass Morphism**: Light glass panels over map background
3. **Minimal Color Palette**: Primarily slate grays with accent blue highlights
4. **Data-Dense**: Small font sizes, compact spacing, lots of information visible
5. **Government/Municipal Aesthetic**: Formal, structured, authoritative
