
## $(date +%Y-%m-%d) - Optimize BitWriter loop bitwise logic
**Learning:** In the core bit stream implementation, writing bits iteratively is highly inefficient. Changing `BitWriter.writeBits` to batch process bits with bitwise shifts and masks gives huge performance speedups. Also, replacing `Math.clz32(Math.abs(val))` with `Math.clz32(-val)` to calculate bits needed for Huffman symbols provides meaningful performance benefits for hot loop functions.
**Action:** Always batch bit operations in encoders/decoders rather than performing single bit operations in a loop, and avoid function call overhead like `Math.abs` where integer signs can be used directly for negative numbers.
