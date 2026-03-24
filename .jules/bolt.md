## 2024-03-24 - DropZone Queue Processing Optimization
**Learning:** Sequential `for await` loops for reading files from system handles are considered a performance anti-pattern. Directory traversal and file processing can be parallelized using `Promise.all` and recursive processing to improve throughput during drag-and-drop operations.
**Action:** When handling I/O operations like directory traversal, prefer concurrent execution (e.g., `Promise.all` over `Array.map`) instead of sequential `while` or `for await` loops.
