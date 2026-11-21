---
trigger: always_on
---

Only use plain JavaScript. No libraries or external npm packages.
(Explicit approved exception: `src/vendor/argon2/` contains the vendored OpenPGP.js Argon2id WASM binary alongside its MIT license to provide memory-hard key derivation immune to cryptographic side-channel timing attacks).