---
trigger: always_on
---

Always try to keep files (especially `.svelte` files) from becoming too large. Definitely create components and reuse them.

UI texts must always be written in both English and German, implemented via i18n, and written in plain language. Be carefull to not display the i18n keys in the ui but the associated value instead.

If the user provides several steps (1., 2., 3., etc.), you must commit after each task.