# Workspace Layout & Panel Slide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the workspace collapsible right-panel UX with a clean chat header, macOS-style custom scrollbars, and smooth width transition animations using Framer Motion.

**Architecture:** Refactor the flex-row layout of the workspace page to use an upper chat card header that acts as a structural container for the show/hide action button, avoiding scrollbar overlaps. Wrap the sidebar with a motion.div for animation. Style webkit-scrollbars globally.

**Tech Stack:** TypeScript, React, Tailwind CSS, Framer Motion, Lucide icons.

## Global Constraints
- TypeScript strict mode
- Do not add text headers to the chat column
- Keep the sidebar toggle strictly out of the chat area's layout container

---

### Task 1: Premium Custom Scrollbars Global Styling

**Files:**
- Modify: [globals.css](file:///c:/Users/patel/OneDrive/Documents/New%20project%204/apps/web/src/globals.css)

**Interfaces:**
- Consumes: None
- Produces: Global custom styled scrollbars for all scrollable views

- [ ] **Step 1: Append premium custom scrollbar styling to the end of the file**

Add the following CSS rules at the end of [globals.css](file:///c:/Users/patel/OneDrive/Documents/New%20project%204/apps/web/src/globals.css):

```css
/* Custom premium scrollbars */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: rgba(100, 116, 139, 0.2);
  border-radius: 9999px;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(100, 116, 139, 0.4);
}
```

- [ ] **Step 2: Commit custom scrollbars styling**

```bash
git add apps/web/src/globals.css
git commit -m "style: add premium custom scrollbar styling globally"
```

---

### Task 2: Refactor Chat Header and Add Smooth Slide Transition

**Files:**
- Modify: [ai-workspace.tsx](file:///c:/Users/patel/OneDrive/Documents/New%20project%204/apps/web/src/pages/ai-workspace.tsx)

**Interfaces:**
- Consumes: [globals.css](file:///c:/Users/patel/OneDrive/Documents/New%20project%204/apps/web/src/globals.css) (scrollbar styles)
- Produces: A horizontal page header inside the chat card containing the collapse toggle; smooth Framer Motion sidebar animation.

- [ ] **Step 1: Modify imports in ai-workspace.tsx**

Update imports to include `PanelRightClose` and `AnimatePresence`.

```typescript
// Replace Lucide icons import with PanelRightClose added
import { MessageSquareText, Sparkles, Plus, ChevronDown, Mic, AudioLines, ArrowUp, Copy, ThumbsUp, ThumbsDown, Upload, RotateCcw, MoreHorizontal, Paperclip, X, PanelRightOpen, PanelRightClose } from "lucide-react";

// Replace framer-motion import
import { motion, AnimatePresence } from "framer-motion";
```

- [ ] **Step 2: Update Chat Card and Add Chat Header**

Replace lines 308–315:
```tsx
  return (
    <Page className="h-[calc(100vh-64px)] !p-0 flex overflow-hidden">
      {/* Chat column */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0 p-4 md:p-6">
        <Card className="relative flex-1 flex flex-col overflow-hidden p-0 min-h-0 border-none shadow-none bg-transparent">
          <div ref={scrollContainerRef} className="flex-grow overflow-y-auto bg-transparent p-4 sm:p-6 min-h-0" aria-live="polite">
```

With:
```tsx
  return (
    <Page className="h-[calc(100vh-64px)] !p-0 flex overflow-hidden">
      {/* Chat column */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0 p-4 md:p-6">
        <Card className="relative flex-1 flex flex-col overflow-hidden p-0 min-h-0 border border-border/60 bg-white/40 shadow-xs">
          {/* Unified Chat Header */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-border/50 bg-white/80 backdrop-blur-md shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {activeSkill ? `Guide: ${activeSkill.name}` : "Product Assistant"}
              </span>
            </div>
            {projectId && (
              <button
                type="button"
                onClick={() => setShowProductPack(prev => !prev)}
                className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border/80 bg-white hover:bg-zinc-50 text-muted-foreground hover:text-foreground text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                title={showProductPack ? "Hide Product Pack" : "Show Product Pack"}
              >
                {showProductPack ? (
                  <>
                    <span>Hide Pack</span>
                    <PanelRightClose size={13} />
                  </>
                ) : (
                  <>
                    <span>Show Pack</span>
                    <PanelRightOpen size={13} />
                  </>
                )}
              </button>
            )}
          </div>

          <div ref={scrollContainerRef} className="flex-grow overflow-y-auto bg-transparent p-4 sm:p-6 min-h-0" aria-live="polite">
```

- [ ] **Step 3: Update Collapsible Panel Layout and Transitions**

Replace the entire tail end layout (lines ~495–526):
```tsx
      {/* Product Pack panel */}
      {projectId && showProductPack && (
        <div className="hidden lg:flex w-[320px] shrink-0 border-l border-border bg-background flex-col overflow-hidden">
          <ProductPackPanel
            projectId={projectId}
            externalPack={liveProductPack}
            onCollapse={() => setShowProductPack(false)}
          />
        </div>
      )}

      {/* Collapsed Product Pack vertical strip */}
      {projectId && !showProductPack && (
        <div className="hidden lg:flex w-12 shrink-0 border-l border-border bg-card flex-col items-center py-4 gap-4 overflow-hidden select-none">
          <button
            type="button"
            onClick={() => setShowProductPack(true)}
            className="p-1.5 rounded-lg border border-border/60 bg-white hover:bg-secondary/15 text-muted-foreground hover:text-foreground shadow-xs transition-colors cursor-pointer"
            title="Expand Product Pack"
          >
            <PanelRightOpen size={16} />
          </button>
          <div className="flex-1 flex items-center justify-center">
            <span 
              className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 select-none whitespace-nowrap" 
              style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
            >
              Product Pack
            </span>
          </div>
        </div>
      )}
    </Page>
```

With:
```tsx
      {/* Product Pack panel with Smooth Slide Transition */}
      <AnimatePresence>
        {projectId && showProductPack && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 320, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="hidden lg:flex shrink-0 border-l border-border bg-background flex-col overflow-hidden"
          >
            <ProductPackPanel
              projectId={projectId}
              externalPack={liveProductPack}
              onCollapse={() => setShowProductPack(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </Page>
```

- [ ] **Step 4: Verify type safety in apps/web**

Run: `pnpm --filter @remorra/web typecheck`
Expected: PASS with 0 errors

- [ ] **Step 5: Commit changes**

```bash
git add apps/web/src/pages/ai-workspace.tsx
git commit -m "feat(web): refactor workspace layout with premium chat header and framer motion sidebar slide"
```
