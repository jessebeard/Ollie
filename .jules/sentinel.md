## 2025-03-01 - High Severity: XSS via attribute injection

**Vulnerability:** The HTML escaping logic in the vault application used incomplete strategies: regex escaping that missed single quotes, and a flawed DOM `textContent` assignment method that failed to escape quotes entirely.

**Learning:** Assigning text to `textContent` and reading `innerHTML` does not escape single (`'`) or double (`"`) quotes, leaving applications open to attribute injection if the escaped string is embedded within attributes. Additionally, regexes must be exhaustive and cover all 5 structural characters (`&`, `<`, `>`, `"`, `'`).

**Prevention:** Always use an exhaustive regex replacement covering all 5 structural HTML characters. Use generative testing (PBT) to assert that output strings do not contain any unescaped literal structural characters.
