## 2024-05-23 - Sequential `for await` loops are performance anti-patterns
**Learning:** Using a `while` loop combined with `for await` for filesystem directory traversal forces sequential processing. When parsing large file trees, processing the items one by one dramatically blocks execution and throughput compared to parallel execution.
**Action:** Use `Promise.all` and recursive function calls for tasks processing multiple independent async tasks in parallel to improve performance. For example, the `DropZone.processQueue` is much faster when mapped to `Promise.all`.
