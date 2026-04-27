## 2024-05-24 - Math.abs overhead in integer loops
**Learning:** In hot loops involving integer coefficient analysis (like F5 steganography), using Math.abs(val) === 1 and Math.abs(val) % 2 === 1 creates measurable function call overhead. Bitwise operations are significantly faster.
**Action:** Replace Math.abs(val) === 1 with (val === 1 || val === -1) and Math.abs(val) % 2 === 1 with (val & 1) !== 0 to optimize hot paths.
