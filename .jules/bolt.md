
## 2025-02-23 - Avoiding Sequential Await on File System APIs
**Learning:** Sequential `for await` loops for reading files from system handles inside asynchronous logic (such as processing drop zones and directories) act as significant bottlenecks. When processing large collections of items simultaneously, this can limit throughput.
**Action:** Replace sequential `while` loops processing queues containing file/directory handles with parallel execution using `Promise.all` and recursive directory processing, achieving substantially faster resolution of files dropped into the application.
