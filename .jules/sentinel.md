## 2024-05-12 - Prevent XSS in window.open

**Vulnerability:** XSS via javascript: URLs in window.open. User-provided URLs could execute arbitrary JavaScript.
**Learning:** URL parameters in window.open must be validated. Prepending 'https://' as a fallback is insufficient if the string already has a malicious scheme.
**Prevention:** Validate protocols using new URL(url).protocol and only allow 'http:' and 'https:'. Always add 'noopener,noreferrer'.
