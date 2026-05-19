## 2024-05-19 - [XSS] Fix escaping function
**Vulnerability:** XSS vulnerability through attribute injection because HTML escaping functions didn't escape quotes, or relied on `textContent` assignment which doesn't escape quotes.
**Learning:** Always use explicit Regex replacement for `<`, `>`, `&`, `"`, and `'` for HTML escaping, as `textContent` logic leaves attributes vulnerable, and partial regex replacements leave gaps.
**Prevention:** Property-based tests generating adversarial inputs.
