# Workspace Layout & Panel Slide Design

This specification details the improvements to the `/workspace` page collapse/expand UX, panel transitions, and scrollbar aesthetics.

## Proposed Design Details

### 1. Unified Chat Header Bar
We will add a horizontal header bar (`h-13` / 52px) at the top of the chat area card in [ai-workspace.tsx](file:///c:/Users/patel/OneDrive/Documents/New%20project%204/apps/web/src/pages/ai-workspace.tsx).
- **Left Side**: Displays the current session guide context (e.g. `Active Guide: Brain Dump` with a pulsating status dot indicating active AI guides) or a generic `AI Product Guide` state.
- **Right Side**: Renders a dedicated layout button to toggle the Product Pack panel.
  - If open: displays a button `Hide Pack` with a `PanelRightClose` icon.
  - If closed: displays a button `Show Pack` with a `PanelRightOpen` icon.
- **Scroll Alignment**: The message scroll container begins *below* this header, solving the scrollbar/button overlap entirely.

### 2. Smooth Slide Transition
We will wrap the `ProductPackPanel` with an `AnimatePresence` and a `motion.div` in [ai-workspace.tsx](file:///c:/Users/patel/OneDrive/Documents/New%20project%204/apps/web/src/pages/ai-workspace.tsx):
- **Animation**: The sidebar will animate its `width` from `0` to `320px` and `opacity` from `0` to `1` using an `easeInOut` ease curve over `0.25s`.
- **Flex Adaptation**: Since the chat area uses `flex-1 min-w-0`, it will automatically shrink and expand smoothly as the sidebar slides in and out.
- **Vertical Strip Removal**: The old collapsed vertical strip (`w-12` vertical label) will be removed completely, freeing up layout space when the panel is closed.

### 3. Premium Global Scrollbar Customization
We will add a premium global scrollbar styling rule to [globals.css](file:///c:/Users/patel/OneDrive/Documents/New%20project%204/apps/web/src/globals.css) to replace the default Windows scrollbars:
- **Aesthetic**: Scrollbars will be thin (`6px` wide), rounded, and semi-transparent Slate/Zinc colors, with transparent tracks so they float seamlessly inside scrollable areas.

---

## Files to Modify

1. **[ai-workspace.tsx](file:///c:/Users/patel/OneDrive/Documents/New%20project%204/apps/web/src/pages/ai-workspace.tsx)**:
   - Add `AnimatePresence` import.
   - Refactor chat container to render the new page/chat header.
   - Wrap `ProductPackPanel` with `motion.div` + `AnimatePresence` for width animation.
   - Remove the `Collapsed Product Pack vertical strip` code block.
2. **[globals.css](file:///c:/Users/patel/OneDrive/Documents/New%20project%204/apps/web/src/globals.css)**:
   - Append custom webkit scrollbar styles to the end of the file.

---

## Verification Plan

1. Verify layout responsiveness across desktop and tablet screen sizes.
2. Check that the scrollbar no longer overlaps the toggle button and is custom styled.
3. Validate smooth animation on show/hide.
4. Run `pnpm typecheck` to ensure no TypeScript compilation issues.
