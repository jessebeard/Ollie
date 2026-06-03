## 2025-02-18 - [Fix XSS Vulnerability in Vault UI]
**Vulnerability:** [XSS vulnerability in HTML escaping missing quotes escaping and vulnerable to non-string inputs]
**Learning:** [When escaping user input for dynamic HTML string interpolation, using DOM text assignment is insufficient because it does not escape double or single quotes. Relying on simple string replacement without casting to string can also cause exceptions when non-string inputs are passed.]
**Prevention:** [Always use Regex to explicitly escape &, <, >, ", and ', and ensure variables are explicitly cast to string before replacing.]
