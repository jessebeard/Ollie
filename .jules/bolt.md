## 2024-06-07 - DOM Manipulation in Hot Loops
**Learning:** Using `document.createElement('div')` and reading `innerHTML` just to escape HTML entities is a massive performance bottleneck when called inside tight loops (like mapping over a large array of UI elements).
**Action:** Always prefer regex-based string manipulation (`String(text).replace(...)`) over DOM creation for simple utility functions, especially in frontend render cycles.
