
## 2024-05-20 - Parallel Directory Traversal
**Learning:** Sequential `while` loops processing directory entries one-by-one with `for await` are a significant performance bottleneck during drag-and-drop operations, especially for deeply nested directories or large numbers of files.
**Action:** Use recursive traversal combined with `Promise.all` to parallelize file and subdirectory processing, which significantly improves throughput.
