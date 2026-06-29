# Touch pinch-to-zoom for image previews

## Goal
Add two-finger pinch-to-zoom support to image previews in dropdown panels and popup modals, matching the existing pinch-zoom behavior on the infinite canvas.

## Files to modify

### 1. `src/lib/components/practice/PracticeInfoPanels.svelte`
- **Inline dropdown image preview** (lines ~30–99, 408–424): The `handleInlinePointerDown/Move/Up` handlers and inline state.
- **Popup modal preview** (lines ~186–244, 578–612): The `handleModalMouseDown/Move/Up` handlers and modal state.

### 2. `src/lib/views/TaskEditor.svelte`
- **Popup modal preview** (lines ~172–238, 814–847): The `handleModalMouseDown/Move/Up` handlers and modal state.

## Changes (same pattern for all three locations)

Reference implementation: `PracticeCanvas.svelte` lines 646–672 (pointerdown pinch detection) and 890–926 (pointermove pinch handling).

### A. Add pinch state variables per location

For inline images: add to each `inlineState` object (line 33).
For modals: add module-level `$state` variables, similar to existing `modalZoom`/`modalPan`.

```
activePointers: Map<number, PointerEvent>   // track all active pointers (or plain object)
isPinching: boolean
initialPinchDistance: number
initialPinchZoom: number
initialPinchMidpoint: { x: number; y: number }
initialPinchPanOffset: { x: number; y: number }
```

### B. Modify `pointerdown` (all locations)

1. Add the incoming pointer to `activePointers`.
2. **When `activePointers.size === 2`** (pinch start):
   - Both pointers must be `pointerType === 'touch'` (reject pen+touch).
   - Compute `initialPinchDistance` via `Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY)`.
   - Compute `initialPinchMidpoint` as the average of both client coordinates.
   - Store `initialPinchZoom = currentZoom`, `initialPinchPanOffset = currentPan`.
   - Set `isPinching = true`.
   - Clear any active single-pointer drag (`isDragging = false`).
   - Call `e.preventDefault()` and return early.
3. **When `activePointers.size > 2`**: return early (ignore).

### C. Modify `pointermove` (all locations)

1. Update the moving pointer in `activePointers`.
2. **If `isPinching && activePointers.size === 2`**:
   - Compute `currentDistance` and `currentMidpoint` from the two pointers.
   - `factor = currentDistance / initialPinchDistance`.
   - `newZoom = clamp(initialPinchZoom * factor, 0.5, maxZoom)` (maxZoom = 4 for inline, 8 for modal).
   - Compute new pan offset anchored to the pinch midpoint, using the same formula as PracticeCanvas lines 904–919 (convert screen midpoint to world coords, then back to pan offset at new zoom).
   - Apply new zoom and pan.
   - Return early.
3. **If `activePointers.size > 1`**: return early (ignore non-pinch multi-touch).
4. Otherwise: existing single-pointer drag logic runs.

### D. Modify `pointerup/pointercancel` (all locations)

1. Remove the released pointer from `activePointers`.
2. If `activePointers.size < 2`: clear `isPinching`.
3. If `activePointers.size === 0`: finish any active drag.
4. Call `releasePointerCapture`.

### E. Switch from mouse-only to pointer events on modals

The popup modals currently use `onmousedown/onmousemove/onmouseup`. Change to `onpointerdown/onpointermove/onpointerup/onpointercancel` so touch events are captured. The image `class` already has `pointer-events-none` on modals, which prevents touch from reaching the `<img>` — **add pointer handlers on the container `<div>` instead**, use `touch-action: none` on the container, and remove `pointer-events-none` from the `<img>` inside modals (or keep it and handle pointer events on the container).

### F. Preserve existing behavior
- Single-finger drag/pan: unchanged.
- Mouse wheel zoom: unchanged (`onwheel`).
- Zoom-in button click to open popup: unchanged.
- Audio, PDF, TXT, MD files: no change (only images affected).
- `touch-action: none` already set on inline images — keep it.
- `touch-action: none` must be added to modal container `<div>` (currently missing).

## Validation
1. On a touch device, expand a dropdown with an image → pinch with two fingers → image should zoom smoothly around the pinch center without jumping.
2. Single-finger drag should still pan the zoomed image.
3. Mouse wheel should still zoom on desktop.
4. Popup modal should behave identically.
5. Other file types (PDF, audio, text) should remain unaffected.
