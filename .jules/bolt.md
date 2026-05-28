## 2024-05-19 - Forward DCT Bottleneck
**Learning:** Found that the default `forwardDCT` implementation was using an unoptimized naive O(n^3) nested-loop approach, despite an existing `forwardDCTAAN` O(n) implementation being fully written and tested within the same file. Switching to it halved the execution time.
**Action:** Always check if a module already contains a better algorithmic implementation that simply isn't being exported as the default, particularly for heavy mathematical transforms.
