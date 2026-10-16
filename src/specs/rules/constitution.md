Ollie is a JPEG steganography project that aims to provide a secure and efficient way to use JPEG libraries as a base for steganography. 

Ollie aims to allow dual use of seemingly benign jpeg libraries for information storage and transmission. Like a photo online, add it to your photo vault and get additional secret storage!

Ollie is not a tool for malicious purposes. It is a tool to help keep data safe and in sight.

Data security is the maximum priority of Ollie; as a tool it is designed to allow you to securely proliferate a keychain. 

Ollie features error correction and detection, and robust error handling. It offers a modular design with a focus on performance and security. 

Ollie has a built-in password vault, a message system, as well as the ability to be used for arbitrary data storage, and a modular design that allows for easy extension.

Ollie will use test driven development.

Ollie is meant to be understandable, and easy to modify. It is not meant to be a black box. It is meant to be a tool that can be used by anyone, for any purpose, as long as it is used responsibly. It is written to be easy to read, and understand. 

Ollie is also meant to be a test bed for a Rust implementation of the same functionality. 

Ollie has a UI that is clean and modern, and easy to use. 
 
Ollie projects should have an outline.xml file in the specs folder that outlines the project, and the rules for the project.

Ollie maintains a complete mermaid.js wireframe of the entire project in `WIREFRAME.md` at `src/specs/WIREFRAME.md`: directory layout, layer and module dependency graphs, runtime pipelines, the wire-format stack, and the test architecture. The wireframe is a living document and must be updated in the same change that modifies project structure or dependencies, so the whole system remains understandable from one diagram at all times.

Ollie's cryptographic design is exclusively symmetric-key. All encryption (AES-256-GCM), key derivation (Argon2id / PBKDF2-HMAC-SHA-256), message authentication (HMAC-SHA256), and hashing (SHA-256) use symmetric primitives that are resistant to quantum attacks under Grover's algorithm with adequate key sizes. Asymmetric cryptography (RSA, ECC, Ed25519) MUST NOT be introduced: these rely on integer factorization or discrete logarithm problems that Shor's algorithm solves in polynomial time on a sufficiently large quantum computer, which would break the entire security model. Post-quantum resistance is achieved not by adopting NIST PQ algorithms but by restricting the cryptographic surface to well-understood symmetric constructions with generous key lengths (256-bit keys throughout).

**Codebase Exception — Vendored Argon2id WASM:**
As a constitutional rule, Ollie code is 100% bespoke, plain JavaScript with zero runtime npm dependencies. A single, explicit, auditable exception is granted for the vendored OpenPGP.js Argon2id WebAssembly binary located in `src/vendor/argon2/` alongside its MIT license. This exception is required to eliminate cryptographic side-channel timing attacks and provide hardware-level memory-hard key derivation ($m = 64\text{ MB}, t = 3, p = 1$) that resists GPU/ASIC password cracking in the absence of a native `SubtleCrypto` Argon2 API. The WASM module is inlined as raw base64 data to ensure zero network requests, zero CORS dependency, and 100% offline portability across Node.js and browser environments (`file:///`).
