## 2024-03-24 - DropZone `for await` Optimization
**Learning:** In `app/components/vault/components/drop-zone.js`, processing a directory handle uses `for await (const entry of item.values())` which processes entries sequentially.
**Action:** Replace `for await` loops with `Promise.all` + recursive array mapping to improve concurrent processing during drag-and-drop.
