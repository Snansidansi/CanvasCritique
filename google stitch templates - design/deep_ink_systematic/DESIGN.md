---
name: Deep Ink Systematic
colors:
  surface: '#f7f9fb'
  surface-dim: '#d8dadc'
  surface-bright: '#f7f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#eceef0'
  surface-container-high: '#e6e8ea'
  surface-container-highest: '#e0e3e5'
  on-surface: '#191c1e'
  on-surface-variant: '#434656'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#747688'
  outline-variant: '#c4c5d9'
  surface-tint: '#124af0'
  primary: '#0040e0'
  on-primary: '#ffffff'
  primary-container: '#2e5bff'
  on-primary-container: '#efefff'
  inverse-primary: '#b8c3ff'
  secondary: '#4457b3'
  on-secondary: '#ffffff'
  secondary-container: '#8b9dfe'
  on-secondary-container: '#1a2f8b'
  tertiary: '#4d5568'
  on-tertiary: '#ffffff'
  tertiary-container: '#656d81'
  on-tertiary-container: '#edf0ff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dde1ff'
  primary-fixed-dim: '#b8c3ff'
  on-primary-fixed: '#001356'
  on-primary-fixed-variant: '#0035be'
  secondary-fixed: '#dee1ff'
  secondary-fixed-dim: '#bac3ff'
  on-secondary-fixed: '#001159'
  on-secondary-fixed-variant: '#2b3e99'
  tertiary-fixed: '#dbe2fa'
  tertiary-fixed-dim: '#bfc6dd'
  on-tertiary-fixed: '#141b2c'
  on-tertiary-fixed-variant: '#3f4759'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 8px
  container-padding: 40px
  sidebar-width: 280px
  gutter: 24px
  section-gap: 48px
---

## Brand & Style

This design system is engineered for deep cognitive work and digital handwriting. The aesthetic is **Corporate Modern** with a high-fidelity, technical edge. It balances the precision of a professional tool with the energetic drive required for creative flow.

The target audience consists of professionals and researchers who require an environment free of visual friction. The UI should evoke a sense of **unlimited potential and structured clarity**. We achieve this through a "digital canvas" approach: the interface recedes to prioritize user content while using vibrant indigo accents to guide focus and action.

The style utilizes high-contrast interfaces, minimal but meaningful ornamentation, and a focus on "active states" that feel responsive and alive.

## Colors

The palette is anchored by **Vibrant Indigo (#2E5BFF)**, a color chosen for its high energy and professional resonance. It is used exclusively for primary actions, focus indicators, and active handwriting states.

- **Primary:** Used for the main CTA, active sidebar icons, and primary toggle states.
- **Surface Scale:** We utilize a "cool white" system. The main canvas is pure white (#FFFFFF), while navigation elements and sidebars use a light blue-tinted neutral (#F8FAFC) to create subtle separation without heavy borders.
- **Contrast:** Maintain a minimum 7:1 contrast ratio for body text against surfaces to ensure maximum legibility during long-form writing sessions.

## Typography

The design system exclusively utilizes **Inter** for its systematic, utilitarian, and highly legible characteristics. 

- **Hierarchy:** Use bold weights for headlines to create a strong structural anchor. 
- **Readability:** Body text is set with generous line heights (1.5x+) to prevent visual fatigue.
- **Handwriting Context:** When the user is in "focus mode," the interface typography should shrink in visual weight, allowing the handwritten strokes to dominate the visual hierarchy.

## Layout & Spacing

The layout philosophy follows a **Fixed Grid with Fluid Content Areas**. The central workspace is treated as a sacred zone with extreme margins to simulate the feel of a premium physical notebook.

- **The Sidebar:** A fixed 280px sidebar on the left for organization, collapsible to a 64px icon rail to maximize writing space.
- **Breathing Room:** Use a 48px gap between major functional sections. Internal component spacing follows an 8px base grid.
- **Mobile Adaptivity:** On mobile devices, sidebars transition to bottom sheets or full-screen overlays to preserve the width of the document viewer. Margins reduce from 40px to 16px.

## Elevation & Depth

We avoid heavy shadows in favor of **Tonal Layering and Low-Contrast Outlines**. Depth is used sparingly to signify "floating" utility tools.

- **Level 0 (Canvas):** Pure white. This is where all writing occurs.
- **Level 1 (Panels):** Light blue-grey (#F8FAFC) with a subtle 1px border (#E2E8F0). No shadow. Used for sidebars and toolbars.
- **Level 2 (Popovers/Modals):** Pure white with a soft, ambient shadow (0px 10px 25px rgba(46, 91, 255, 0.08)). The shadow is tinted with the primary indigo to maintain brand vibrance.

## Shapes

The shape language is **Rounded (Level 2)**. This softens the professional "coldness" of the indigo and white palette, making the tool feel approachable.

- **Standard Elements:** 0.5rem (8px) radius for buttons, inputs, and list items.
- **Large Containers:** 1rem (16px) for cards and main document areas.
- **Interactive Triggers:** Select circular shapes for tool-selection buttons (pen, eraser, highlighter) to differentiate them from structural UI buttons.

## Components

### Document Viewer
The focal point of the system. It should be a borderless white area. When scrolling, a subtle progress bar in Vibrant Indigo appears at the top of the viewport.

### Streamlined Sidebar
Navigation items use a "ghost" background by default. On hover or active state, they transition to a light indigo background (#E0E7FF) with a 4px vertical "pill" indicator on the left edge in Primary Indigo.

### Toggle Switches
Small, high-contrast switches. The "off" state is a light grey track; the "on" state is the Primary Indigo. The toggle handle should always be pure white and slightly oversized for a tactile feel.

### Buttons
- **Primary:** Solid Primary Indigo with white text.
- **Secondary:** Light indigo background with Primary Indigo text. No border.
- **Tertiary:** Transparent background, Primary Indigo text, underline on hover only.

### Input Fields
Minimalist design. A bottom-border-only approach or a very light 4-sided stroke. Focus states are indicated by a 2px Primary Indigo bottom border and a subtle blue glow.

### Tool Palette
A floating, pill-shaped container positioned at the bottom-center or top-center. It uses the Level 2 Elevation (soft indigo shadow) to appear detached from the canvas.