<script lang="ts">
  let { class: className = "w-5 h-5" } = $props();
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  viewBox="0 0 24 24"
  fill="currentColor"
  class={className}
>
  <!-- Large Sparkle -->
  <path d="M 10 3 Q 10 13, 20 13 Q 10 13, 10 23 Q 10 13, 0 13 Q 10 13, 10 3 Z" />
  <!-- Small Sparkle -->
  <path d="M 18 2 Q 18 6, 22 6 Q 18 6, 18 10 Q 18 6, 14 6 Q 18 6, 18 2 Z" opacity="0.85" />
</svg>
