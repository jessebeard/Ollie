## 2024-05-24 - Parallelizing DropZone file processing safely
**Learning:** Sequential queue processing of file handles during drag-and-drop ingestion restricts throughput significantly, but replacing it with unbounded `Promise.all` recursive processing is unsafe and can result in out-of-memory crashes or hitting browser file-handle limits on large folders.
**Action:** Always implement a concurrency control limit (e.g. limiting active promises to 10) using a custom token bucket/semaphore pattern to safely parallelize UI and IO operations in Web apps.
