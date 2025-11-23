# Ollie — Pure JavaScript JPEG Codec

**Ollie** is a lightweight, dependency-free JPEG encoder and decoder written entirely in vanilla JavaScript.  
Its goal is twofold:

1. **Educational** — to clearly expose each stage of the JPEG compression pipeline.  
2. **Practical** — to provide a functional, browser-friendly JPEG codec with no external dependencies or WASM.

Whether you're exploring how JPEG works under the hood or integrating a codec into a web project, Ollie aims to be clear, approachable, and hackable.

---

## ✨ Features

- **Pure JavaScript:** No native modules, no WebAssembly, no heavyweight dependencies.
- **JPEG Encoder:** Converts raw RGBA image data → JPEG binary.
- **JPEG Decoder:** Converts JPEG binary → raw RGBA image data.
- **Modular Architecture:** Each JPEG specification step is implemented as a clean, isolated module.
- **Configurable Internals:** Select between multiple IDCT implementations (Naive, AAN, Reference) and tuning options.
- **Educational Codebase:** Designed to be readable, traceable, and easy to learn from.

---

## 📁 Directory Structure

```
src/
  main.js                # Demo UI and entry point
  core/
    jpeg-encoder.js      # High-level encoder orchestrator
    jpeg-decoder.js      # High-level decoder orchestrator

    encoder/             # Encoder internals
      dct.js
      quantization.js
      huffman.js
      ... (color, RLE, zigzag)

    decoder/             # Decoder internals
      parser.js
      idct.js
      huffman.js
      upsampling.js
      ...

  utils/
    bit-reader.js
    bit-writer.js

test/                    # Unit + integration tests
```

---

## 🖼️ How JPEG Works (Overview)

JPEG is a **lossy**, block-based image compression format.  
Ollie implements the “baseline sequential DCT” JPEG, the most widely supported variant.

Below are the major stages, explained in a way that mirrors the project’s structure.

> **Tip for README graphics:**  
> You can add block-diagram visuals (Mermaid, SVG, or PNG) for the pipeline.  
> I can generate them—just say the word!

---

## 🔵 JPEG Encoding Pipeline

### 1. **Color Space Conversion (RGB → YCbCr)**  
JPEG separates brightness from color.  
- **Y** = luminance (perceived brightness — the most important part)  
- **Cb/Cr** = chroma (blue/red color difference)

This separation allows JPEG to compress color more aggressively than luminance, taking advantage of human visual sensitivity.

---

### 2. **(Optional) Chroma Subsampling**  
Most JPEGs store color at reduced resolution (e.g., **4:2:0**):  
- Y: full resolution  
- Cb/Cr: half resolution horizontally & vertically  
This dramatically reduces file size with minimal perceived quality loss.

---

### 3. **8×8 Block Splitting**  
Each Y/Cb/Cr component is divided into **8×8 blocks**.  
All further processing occurs on these blocks individually.

---

### 4. **Forward DCT (Spatial → Frequency Domain)**  
The **Discrete Cosine Transform** converts pixel values into frequency coefficients.  
- Upper-left coefficient = **DC term** = block's average brightness  
- Remaining 63 = **AC terms**, describing increasing spatial frequencies

Low frequencies carry most perceptual energy; high frequencies can be compressed more heavily.

---

### 5. **Quantization (Lossy Step)**  
Each frequency coefficient is divided by an entry in a **quantization table** and rounded.  
- Low frequencies: small divisors → preserved detail  
- High frequencies: larger divisors → values shrink to zero

This is where JPEG achieves most of its compression.

---

### 6. **Zigzag Ordering**  
The 8×8 coefficients are read using a zigzag pattern that pushes low-frequency values first and groups the long tail of zeros at the end.

```
0  1  5  6 14 15 ...
2  4  7 13 ...
3  8 12 ...
9 11 ...
10 ...
```

This arrangement makes run-length encoding extremely effective.

---

### 7. **Entropy Coding (Huffman + RLE)**  
Two key tricks happen here:

1. **DC differential coding**  
   - Each block’s DC value is stored as a delta from the previous block.

2. **AC run-length encoding (RLE)**  
   - Long sequences of zeros become compact tokens.

Finally, everything is Huffman-encoded into the final compressed bitstream.

---

## 🔶 JPEG Decoding Pipeline

Decoding reverses the above steps:

### 1. **Parsing JPEG Markers**  
The decoder reads the structured segments of a JPEG file:  
`SOI`, `DQT`, `DHT`, `SOF0`, `SOS`, etc.  
These define quantization tables, Huffman tables, sampling structure, and image dimensions.

---

### 2. **Entropy Decoding**  
The compressed bitstream is decoded using:  
- DC differential decoding  
- AC run-length expansion  
- Huffman tables from the file

Result → quantized frequency coefficients.

---

### 3. **Inverse Zigzag**  
Re-create the 8×8 coefficient matrix for each block.

---

### 4. **Dequantization**  
Multiply each coefficient by the value from the corresponding quantization table.

---

### 5. **Inverse DCT (IDCT)**  
Transforms each dequantized 8×8 block back into spatial pixel values.  
Ollie exposes multiple implementations to compare performance and accuracy.

---

### 6. **Chroma Upsampling**  
If the JPEG uses chroma subsampling (e.g., 4:2:0), the Cb and Cr planes are upscaled to full resolution.

---

### 7. **Color Conversion (YCbCr → RGB)**  
The final image is reconstructed by converting each pixel back to RGB.

---

### 8. **Block Assembly**  
All 8×8 blocks are stitched back together to form the output image.

---

## ▶️ Usage

Open **`index.html`** in a browser to try the interactive demo:

- **Encode** an uploaded image as JPEG  
- **Decode** any JPEG file into raw pixel data  
- Inspect intermediate stages if you're exploring how JPEG works

---

## 🧪 Testing

Open **`test.html`** in a browser to run the full test suite (unit + integration).

---

## 📝 Want Diagrams or Animations?

I can generate:

- Block-diagram SVGs for the encoding/decoding pipeline  
- Animated GIFs showing the zigzag ordering, DCT basis functions, or quantization effects  
- Mermaid or Graphviz diagrams directly embeddable in GitHub  

Just tell me what style you want!
