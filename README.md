# Ollie - Pure JavaScript JPEG Codec

Ollie is a lightweight, dependency-free JPEG encoder and decoder written in pure JavaScript. It demonstrates the core algorithms behind JPEG compression and decompression, making it an educational resource and a functional tool for web applications.

## Features

- **Pure JavaScript**: No external libraries or WebAssembly.
- **Encoder**: Converts raw RGBA image data to JPEG format.
- **Decoder**: Decodes JPEG files back to RGBA image data.
- **Educational**: Clean, modular code structure mirroring the JPEG specification steps.
- **Configurable**: Supports different IDCT algorithms (Naive, AAN, Reference) and optimization levels.

## Directory Structure

- `src/`: Source code
  - `main.js`: Entry point and UI logic
  - `core/`: Core algorithms
    - `jpeg-encoder.js`: Main encoder entry point
    - `jpeg-decoder.js`: Main decoder entry point
    - `encoder/`: Encoder-specific logic (DCT, Quantization, Huffman, etc.)
    - `decoder/`: Decoder-specific logicmplementations (Parsing, IDCT, Upsampling, etc.).
  - `utils/`: Helper classes (BitReader, BitWriter).
- `test/`: Unit and integration tests.

## How It Works

### JPEG Encoding Process

1.  **Color Space Conversion**: The image is converted from RGB (Red, Green, Blue) to YCbCr (Luminance, Blue-difference, Red-difference). The Y component represents brightness, while Cb and Cr represent color.
2.  **Block Splitting**: The image is divided into 8x8 pixel blocks.
3.  **Forward DCT (Discrete Cosine Transform)**: Each 8x8 block is converted from the spatial domain (pixels) to the frequency domain. This separates low-frequency details (broad changes) from high-frequency details (fine textures).
4.  **Quantization**: The frequency coefficients are divided by a quantization table and rounded to integers. This is the lossy part of the process, where high-frequency information (less visible to the human eye) is discarded or reduced in precision.
5.  **ZigZag Reordering**: The 8x8 block of quantized coefficients is reordered into a 1D array using a zigzag pattern. This groups the low-frequency non-zero coefficients at the start and the high-frequency zero coefficients at the end.
6.  **Entropy Coding (Huffman)**: The 1D array is compressed using Huffman coding. The DC coefficient (average brightness) is differentially encoded against the previous block's DC. The AC coefficients are run-length encoded (RLE) to efficiently represent runs of zeros.

### JPEG Decoding Process

1.  **Parsing**: The decoder reads the JPEG file markers (SOI, DQT, DHT, SOF0, SOS) to extract tables and image metadata.
2.  **Entropy Decoding**: The bitstream is read using Huffman tables to reconstruct the quantized coefficients.
3.  **Inverse ZigZag**: The 1D array of coefficients is reordered back into an 8x8 2D block.
4.  **Dequantization**: The coefficients are multiplied by the quantization table to restore their approximate original magnitude.
5.  **Inverse DCT (IDCT)**: The frequency domain data is converted back to spatial pixel data.
6.  **Color Space Conversion**: The YCbCr data is converted back to RGB.
7.  **Upsampling**: If chroma subsampling was used (e.g., 4:2:0), the Cb and Cr components are upsampled to match the Y component's resolution.
8.  **Assembly**: The 8x8 blocks are assembled to form the final image.

## Usage

Open `index.html` in a web browser to use the interactive demo. You can upload an image to encode it or upload a JPEG file to decode it.

## Testing

Open `test.html` in a web browser to run the test suite.
