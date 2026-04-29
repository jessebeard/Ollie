## 2025-04-29 - Optimize F5 Syndrome Integer Math
**Learning:** In hot loops involving integer coefficient analysis (like F5 steganography), checking for absolute values (e.g. `Math.abs(val) === 1`) and parity (e.g. `Math.abs(val) % 2 === 1`) adds function call overhead.
**Action:** Replaced `Math.abs(val) === 1` with `val === 1 || val === -1` and `Math.abs(group[j].val) % 2 === 1` with `(group[j].val & 1) !== 0`. This is more efficient and takes advantage of bitwise representation for negative numbers, avoiding branching or function calls.
