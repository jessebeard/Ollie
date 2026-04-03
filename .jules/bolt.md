## 2024-04-03 - Optimize BitWriter by Batching Operations
**Learning:** Writing bits individually in a loop (e.g., calling `this.writeBit(bit)`) is highly inefficient in JavaScript.
**Action:** Batch bitwise operations (masking and shifting multiple bits at once before pushing a byte) significantly reduces function call overhead and speeds up stream encoding operations (e.g., `BitWriter.writeBits`).
