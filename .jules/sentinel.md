
## 2025-02-14 - Predictable Pseudo-Random Generation in Cryptographic Contexts
**Vulnerability:** Core logic components, such as `ImmutableVault` and `ChunkManager`, relied on `Math.random()` to generate IDs.
**Learning:** `Math.random()` is not cryptographically secure and exposes the application to ID-guessing or enumeration vulnerabilities. When combined with predictable timestamp-based generation, this drastically reduces the entropy.
**Prevention:** Always use `crypto.randomUUID()` or a compatibility layer (like `cryptoInstance`) for ID generation in security-sensitive or broadly applicable contexts instead of building custom `Math.random()` implementations.
