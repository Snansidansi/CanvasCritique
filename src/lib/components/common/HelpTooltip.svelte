<script lang="ts">
  let {
    icon = 'help',
    text = '',
    position = 'top',
    class: customClass = ''
  }: {
    icon?: 'help' | 'info' | string;
    text: string;
    position?: 'top' | 'bottom';
    class?: string;
  } = $props();

  let isOpen = $state(false);

  function toggleOpen(e: MouseEvent) {
    e.stopPropagation();
    isOpen = !isOpen;
  }

  function handleBlur() {
    isOpen = false;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div 
  class="group relative inline-flex items-center {customClass}"
  tabindex="-1"
  onmouseleave={() => isOpen = false}
>
  <button
    type="button"
    onclick={toggleOpen}
    onblur={handleBlur}
    class="border-0 bg-transparent p-0 cursor-help flex items-center text-outline hover:text-primary focus:outline-none transition-colors select-none"
    aria-label="Help info"
  >
    <span class="material-symbols-outlined text-[15px]">{icon}</span>
  </button>
  <div 
    class="absolute {position === 'bottom' ? 'top-full mt-1.5' : 'bottom-full mb-1.5'} left-1/2 -translate-x-1/2 w-64 bg-surface-container-high text-on-surface border border-outline-variant text-[10.5px] p-2.5 rounded-lg shadow-xl transition-opacity z-50 leading-relaxed normal-case select-text font-normal text-left
           {isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 group-hover:opacity-100 pointer-events-none'}"
  >
    {text}
  </div>
</div>
