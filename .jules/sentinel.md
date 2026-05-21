## 2024-05-21 - ModalManager XSS

**Vulnerability:** Unescaped input interpolation into `innerHTML` for modal dialog titles, labels, and values in `ModalManager`.

**Learning:** Using JS template literals to generate HTML opens up the app to XSS via script and attribute injection when displaying user-controlled metadata.

**Prevention:** All user-controlled text strings must be passed through a strict `escapeHTML` utility using Regex replace before being set within `innerHTML`.
