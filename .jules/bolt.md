## 2024-06-25 - Entropy Coding Bottlenecks

**Learning:** Writing bits individually in a loop (`this.writeBit(bit)`) causes massive function call and loop overhead in JavaScript when encoding bitstreams (e.g. JPEG Huffman). Similarly, calculating bit-lengths using an O(log N) `while` loop is a major CPU bottleneck in hot paths.
**Action:** Replace single-bit writing loops with batch bitwise operations (`Math.min`, bit masks, and shifts) to push chunks of bits at once. Replace manual bit-length counting with `32 - Math.clz32(Math.abs(val))` to leverage native hardware instructions for O(1) bit counting.
