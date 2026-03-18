## 2026-03-18 - Parallelizing Drag and Drop File System Processing
**Learning:** Sequential processing using `while` queues and `for await` over `FileSystemDirectoryHandle.values()` can cause severe latency during drag-and-drop operations with deep nested directories or many files.
**Action:** Always prefer concurrent processing and mapping over items with `Promise.all()` when walking directories and evaluating file handles to maximize throughput.
