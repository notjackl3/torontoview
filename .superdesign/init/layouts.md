# Layout Components

## Root Layout
**File**: `app/layout.tsx`
**Description**: Root layout with font configuration and metadata

```tsx
import type { Metadata } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

const ibmPlexMono = IBM_Plex_Mono({
  weight: ["400", "600", "700"],
  subsets: ["latin"],
  variable: "--font-ibm-plex-mono",
});

const spaceGrotesk = Space_Grotesk({
  weight: ["400", "600", "700"],
  subsets: ["latin"],
  variable: "--font-space-grotesk",
});

export const metadata: Metadata = {
  title: "Toronto Municipal Planning | Traffic Simulation",
  description: "Real-time 3D traffic simulation and urban analytics for Toronto",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.NodeNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${ibmPlexMono.variable} ${spaceGrotesk.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
```

## Page-Specific Layouts

The current application does not use shared layout components like navigation bars, sidebars, headers, or footers as separate components. Instead, the layout is embedded directly in the page component (app/page.tsx) with the following structure:

- Full-screen 3D map background
- Top header bar (inline component)
- Left sidebar for analytics (inline component)
- Bottom control bar (inline component)

All layout elements are defined inline within the home page component rather than extracted as reusable layout components.
