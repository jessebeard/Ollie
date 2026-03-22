

## 2024-03-22 - Parallelize Directory Traversal in DropZone
**Learning:** Sequential `for await` loops for reading files from system handles block the main thread and significantly increase the latency of processing large directories during drag-and-drop operations.
**Action:** Use `Promise.all` and recursive concurrent processing in `DropZone.processQueue` to process directories and files in parallel.
