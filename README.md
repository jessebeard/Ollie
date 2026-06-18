# Ollie: Pure-JS Steganographic Password Vault

**Ollie** is a secure, dependency-free application that securely embeds and extracts an encrypted password vault directly within the frequency domain of standard JPEG images. By hiding your keychain inside ordinary photos, Ollie provides a stealthy, decentralized, and durable backup solution.

---

## 🏗️ Technical Architecture

Ollie is built entirely from scratch in vanilla JavaScript to achieve absolute control over the data embedding process. Rather than wrapping black-box native libraries or WebAssembly, the project implements a complete, bespoke JPEG codec.

### Core Engineering Features

- **Zero-Dependency JPEG Codec:** A fully functional Baseline Sequential DCT encoder and decoder written in pure JavaScript. This custom implementation provides low-level access to the Discrete Cosine Transform (DCT) coefficients—the precise layer where data is hidden.
- **Frequency Domain Steganography:** By mathematically manipulating quantized frequency coefficients during the encoding process, the vault data is deeply embedded. The visual impact on the resulting image is virtually undetectable to the naked eye.
- **Batch Embedding & Sharding:** The application can seamlessly shard a large encrypted vault across multiple JPEG files, effectively turning a photo album into a distributed, hidden database.
- **Cryptography:** Utilizes the native Web Crypto API to handle secure key generation, derivation, and payload encryption before embedding.
- **Custom Test Infrastructure:** The project relies on a bespoke test runner and assertion library (`test/runner.js`), entirely bypassing massive testing frameworks to maintain a tiny footprint and maximize performance.
- **Strict Test-Driven Development (TDD):** Every component—from bit-level stream readers to Huffman encoding and UI state—is rigorously tested to guarantee reliability and mathematical correctness.

---

## ▶️ Usage

Ollie runs entirely in your browser. The primary interface is the password vault.

1. Open **`app/vault.html`** in a modern web browser.
2. Follow the intuitive UI to create a new vault or unlock an existing one hidden within your uploaded JPEG images.

---

## 🧪 Testing

Given the complex nature of manipulating bitstreams, Huffman tables, and cryptographic payloads, Ollie maintains an incredibly robust testing suite.

### Run tests in Node.js
Execute the custom test runner from the command line:
```bash
npm test
```

### Run tests in the Browser
Open **`app/test.html`** to execute the complete suite with a visual interface.

---

## 🚀 Roadmap

Ollie is actively evolving as a functional application and an engineering testbed. Future plans outlined in the project constitution include:

- **Advanced Error Correction:** Integrating Reed-Solomon error correction to safeguard hidden payloads against corruption or minor image processing.
- **Broader Utility:** Expanding the steganography container format to support arbitrary data storage and secure messaging.
- **Rust Implementation:** Porting the core steganography and codec engine to Rust, utilizing the current pure-JS implementation as a functional reference architecture.
