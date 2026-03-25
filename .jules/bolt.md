## 2024-05-24 - Parallelize System File Read API loops
**Learning:** Sequential `for await` loops and asynchronous callback chaining for reading files from FileSystem handles are significant performance anti-patterns that block execution. Modern directory handles and recursive file exploration natively yield paths to independent streams of I/O.
**Action:** Parallelize directory traversal using `Promise.all` and recursive processing to improve throughput during operations like drag-and-drop. Map processing actions across asynchronous queues rather than synchronously draining them.
