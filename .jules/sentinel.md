## 2024-06-29 - Path Traversal in Dev Server

**Vulnerability:** Path traversal in `scripts/dev-server.js`. The server decodes the URL and uses `path.join(ROOT, reqPath)`. Because `path.join` resolves `..` segments and URL decoding converts `%2e%2e%2f` to `../`, an attacker can read arbitrary files outside the ROOT directory, like `/etc/passwd`.

**Learning:** URL paths should always be sanitized and the resulting absolute path must be checked to ensure it still resides within the intended root directory. Simply using `path.join` with an untrusted decoded path allows directory traversal.

**Prevention:** Always use `path.normalize(path.join(ROOT, reqPath))` and strictly verify that the normalized path starts with `ROOT + path.sep`.

## 2024-06-29 - Path Traversal in Dev Server

**Vulnerability:** Path traversal in `scripts/dev-server.js`. The server decodes the URL and uses `path.join(ROOT, reqPath)`. Because `path.join` resolves `..` segments and URL decoding converts `%2e%2e%2f` to `../`, an attacker can read arbitrary files outside the ROOT directory, like `/etc/passwd`.

**Learning:** URL paths should always be sanitized and the resulting absolute path must be checked to ensure it still resides within the intended root directory. Simply using `path.join` with an untrusted decoded path allows directory traversal.

**Prevention:** Always use `path.normalize(path.join(ROOT, reqPath))` and strictly verify that the normalized path starts with `ROOT + path.sep` or exactly matches `ROOT`.
