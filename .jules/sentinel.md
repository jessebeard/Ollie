## 2024-05-09 - Cross-Site Scripting (XSS) in ModalManager

**Vulnerability:** The `ModalManager` directly interpolated user-controlled variables (like `title`, `label`, `message`) into `innerHTML` strings when constructing UI dialogs, enabling Cross-Site Scripting (XSS).

**Learning:** This occurred because of a lack of a central HTML escaping utility and relying purely on string interpolation for constructing dynamic DOM elements, assuming inputs were safe.

**Prevention:** To avoid this next time, always escape any dynamic content injected into `innerHTML`, or prefer using safer DOM manipulation methods like `textContent` and `createElement` instead of raw HTML strings. Ensure a robust sanitization function is available and used universally for such string constructions.
