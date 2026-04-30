## 2024-04-30 - XSS via javascript: URLs in window.open
**Vulnerability:** The \`btn-launch\` action in \`VaultView\` passed user-controlled URLs directly to \`window.open\` without validating the protocol. An attacker could craft a payload like \`javascript:alert(1)\` which executes in the context of the application when the user clicks the Launch button.
**Learning:** Even if HTML is escaped before display, URLs need separate validation to ensure safe protocols (e.g., http, https) before being opened or followed, to prevent JavaScript injection.
**Prevention:** Always parse untrusted URLs using \`new URL(url)\` and assert that \`protocol\` is \`http:\` or \`https:\`. Also use \`noopener,noreferrer\` in \`window.open\` as an additional best practice.
