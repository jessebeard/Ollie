## 2026-05-01 - Bitwise Odd Number Check
**Learning:** In JavaScript, the remainder operator (%) retains the sign. To safely and efficiently check for odd numbers across both positive and negative integers in hot loops, use `(val & 1) !== 0` instead of `Math.abs(val) % 2 === 1`. This safely leverages the 32-bit integer representation while eliminating function call overhead.
**Action:** Replaced `Math.abs(val) % 2 === 1` with `(val & 1) !== 0` in `f5-syndrome.js` to optimize performance in loops.
