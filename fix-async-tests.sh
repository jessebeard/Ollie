#!/bin/bash
# Script to add await to encoder.encode() and decoder.decode() calls
# Usage: ./fix-async-tests.sh <test-file>

if [ $# -eq 0 ]; then
    echo "Usage: $0 <test-file>"
    exit 1
fi

FILE="$1"

# Backup original
cp "$FILE" "$FILE.bak"

# Fix encoder.encode calls
sed -i 's/const jpegBytes = encoder\.encode(/const jpegBytes = await encoder.encode(/g' "$FILE"
sed -i 's/const jpeg = encoder\.encode(/const jpeg = await encoder.encode(/g' "$FILE"
sed -i 's/const q[0-9]* = encoder\.encode(/const q10 = await encoder.encode(/g' "$FILE"
sed -i 's/ encoder\.encode(/ await encoder.encode(/g' "$FILE"

# Fix decoder.decode calls
sed -i 's/const decoded = decoder\.decode(/const decoded = await decoder.decode(/g' "$FILE"
sed -i 's/const result = decoder\.decode(/const result = await decoder.decode(/g' "$FILE"
sed -i 's/decoder\.decode(/await decoder.decode(/g' "$FILE"

# Fix it() declarations to be async
sed -i "s/it('\\(.*\\)', () => {/it('\\1', async () => {/g" "$FILE"
sed -i 's/it("\(.*\)", () => {/it("\1", async () => {/g' "$FILE"

echo "Fixed $FILE. Backup saved as $FILE.bak"
