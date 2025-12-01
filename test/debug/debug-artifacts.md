# Block Artifact Examples

The decoder is producing visible 8x8 block boundary artifacts:

![Artifact Example 1](/home/jb/.gemini/antigravity/brain/8123d47a-a88d-4806-a754-f473620daa95/uploaded_image_0_1763842855104.png)

![Artifact Example 2](/home/jb/.gemini/antigravity/brain/8123d47a-a88d-4806-a754-f473620daa95/uploaded_image_1_1763842855104.png)

These block artifacts are particularly visible on smooth gradient areas (like the car hood) and indicate an issue in the decoding pipeline. Since the naive implementation works correctly, the bug is in the optimized path.
