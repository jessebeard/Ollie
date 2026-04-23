## 2026-04-23 - Optimizing Math.abs in Hot Loops
**Learning:** In hot loops involving integer coefficient analysis (like F5 steganography), using `Math.abs` can introduce unnecessary function call overhead.
**Action:** Replace `Math.abs(val) === 1` with `val === 1 || val === -1`. Similarly, replace `Math.abs(val) % 2 === 1` with `(val & 1) !== 0` for safely checking for odd numbers across both positive and negative integers.
