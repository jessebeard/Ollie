## 2024-05-19 - XSS Vulnerability in UI Escaping

**Vulnerability:** User input was not properly escaped before being rendered to the DOM, specifically missing single quote escaping and relying on insecure `textContent` to `innerHTML` conversions.
**Learning:** Using DOM text assignment (`div.textContent = str; return div.innerHTML;`) is insufficient for escaping strings destined for HTML attributes because it does not escape double (`"`) or single (`'`) quotes, leaving attribute injections vulnerable. `if (!str)` also evaluates `0` to empty string.
**Prevention:** Always use Regex to explicitly escape `&`, `<`, `>`, `"`, and `'`. Check for `null` and `undefined` inputs explicitly.
