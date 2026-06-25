/**
 * Touch/Stylus drag-and-drop polyfill for HTML5 drag and drop APIs.
 * Converts pointer events (for touch and stylus) to standard drag and drop events.
 */
export function initTouchDragPolyfill(): void {
  if (typeof window === 'undefined') return;

  let dragSource: HTMLElement | null = null;
  let dragImage: HTMLElement | null = null;
  let lastTarget: Element | null = null;
  let dragTouchOffset = { x: 0, y: 0 };

  function getDragSource(el: HTMLElement | null): HTMLElement | null {
    while (el) {
      if (el.getAttribute && el.getAttribute('draggable') === 'true') {
        return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  window.addEventListener('pointerdown', (e: PointerEvent) => {
    // Let normal mouse drag use browser native HTML5 drag/drop
    if (e.pointerType === 'mouse') return;

    const target = e.target as HTMLElement;
    // Check if user is touching the drag indicator handle
    const dragIndicator = target.closest('.material-symbols-outlined');
    const isDragIndicator = dragIndicator && dragIndicator.textContent?.trim() === 'drag_indicator';

    if (!isDragIndicator) return;

    const source = getDragSource(target);
    if (!source) return;

    dragSource = source;
    
    // Dispatch dragstart
    const dragStartEvent = new CustomEvent('dragstart', { bubbles: true, cancelable: true });
    Object.defineProperty(dragStartEvent, 'dataTransfer', {
      value: {
        effectAllowed: 'move',
        setData: () => {},
        setDragImage: () => {}
      },
      writable: true,
      configurable: true
    });
    source.dispatchEvent(dragStartEvent);

    // Create drag image clone for visual feedback
    const rect = source.getBoundingClientRect();
    dragImage = source.cloneNode(true) as HTMLElement;
    dragImage.style.position = 'fixed';
    dragImage.style.top = `${rect.top}px`;
    dragImage.style.left = `${rect.left}px`;
    dragImage.style.width = `${rect.width}px`;
    dragImage.style.height = `${rect.height}px`;
    dragImage.style.opacity = '0.7';
    dragImage.style.pointerEvents = 'none';
    dragImage.style.zIndex = '1000';
    dragImage.style.border = '2px dashed var(--color-primary)';
    dragImage.style.backgroundColor = 'var(--color-surface-container-lowest)';
    document.body.appendChild(dragImage);

    // Store pointer offsets
    dragTouchOffset = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };

    // Capture the pointer to follow moves outside the source element
    try {
      source.setPointerCapture(e.pointerId);
    } catch (err) {}

    e.preventDefault();
  });

  window.addEventListener('pointermove', (e: PointerEvent) => {
    if (!dragSource || !dragImage) return;
    e.preventDefault();

    // Move drag image
    dragImage.style.left = `${e.clientX - dragTouchOffset.x}px`;
    dragImage.style.top = `${e.clientY - dragTouchOffset.y}px`;

    // Find element under the pointer
    dragImage.style.display = 'none';
    const target = document.elementFromPoint(e.clientX, e.clientY);
    dragImage.style.display = '';

    if (!target) return;

    // Dispatch dragover/dragenter
    if (target !== lastTarget) {
      if (lastTarget) {
        const dragLeaveEvent = new CustomEvent('dragleave', { bubbles: true });
        lastTarget.dispatchEvent(dragLeaveEvent);
      }
      const dragEnterEvent = new CustomEvent('dragenter', { bubbles: true });
      target.dispatchEvent(dragEnterEvent);
      lastTarget = target;
    }

    const dragOverEvent = new CustomEvent('dragover', { bubbles: true, cancelable: true });
    Object.defineProperty(dragOverEvent, 'dataTransfer', {
      value: { dropEffect: 'move' },
      writable: true,
      configurable: true
    });
    target.dispatchEvent(dragOverEvent);
  });

  window.addEventListener('pointerup', (e: PointerEvent) => {
    if (!dragSource) return;

    if (dragImage) {
      document.body.removeChild(dragImage);
      dragImage = null;
    }

    try {
      dragSource.releasePointerCapture(e.pointerId);
    } catch (err) {}

    // Find target element under the pointer
    const target = document.elementFromPoint(e.clientX, e.clientY);

    if (target) {
      const dropEvent = new CustomEvent('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(dropEvent, 'dataTransfer', {
        value: {
          dropEffect: 'move',
          getData: () => ''
        },
        writable: true,
        configurable: true
      });
      target.dispatchEvent(dropEvent);
    }

    const dragEndEvent = new CustomEvent('dragend', { bubbles: true });
    dragSource.dispatchEvent(dragEndEvent);

    dragSource = null;
    lastTarget = null;
  });
}
