import sys
import os

def strip_comments(source):
    out = []
    i = 0
    n = len(source)
    
    # States
    NORMAL = 0
    STRING_SINGLE = 1
    STRING_DOUBLE = 2
    STRING_BACKTICK = 3
    COMMENT_LINE = 4
    COMMENT_BLOCK = 5
    JSDOC = 6
    
    state = NORMAL
    
    while i < n:
        char = source[i]
        next_char = source[i+1] if i+1 < n else ''
        
        if state == NORMAL:
            if char == '"':
                state = STRING_DOUBLE
                out.append(char)
            elif char == "'":
                state = STRING_SINGLE
                out.append(char)
            elif char == '`':
                state = STRING_BACKTICK
                out.append(char)
            elif char == '/' and next_char == '/':
                # Check for escaped slash
                if i > 0 and source[i-1] == '\\':
                    out.append(char)
                else:
                    state = COMMENT_LINE
                    i += 1 # Skip next slash
            elif char == '/' and next_char == '*':
                # Check for escaped slash
                if i > 0 and source[i-1] == '\\':
                    out.append(char)
                else:
                    # Check if it is JSDoc /**
                    if i+2 < n and source[i+2] == '*':
                        # Keep JSDoc
                        out.append(char)
                        out.append(next_char)
                        i += 1
                        state = JSDOC
                    else:
                        state = COMMENT_BLOCK
                        i += 1
            else:
                out.append(char)
                
        elif state == STRING_DOUBLE:
            out.append(char)
            # Handle escaped quote: count backslashes
            if char == '"':
                # Check if escaped
                backslashes = 0
                j = i - 1
                while j >= 0 and source[j] == '\\':
                    backslashes += 1
                    j -= 1
                if backslashes % 2 == 0:
                    state = NORMAL
        
        elif state == STRING_SINGLE:
            out.append(char)
            if char == "'":
                backslashes = 0
                j = i - 1
                while j >= 0 and source[j] == '\\':
                    backslashes += 1
                    j -= 1
                if backslashes % 2 == 0:
                    state = NORMAL

        elif state == STRING_BACKTICK:
            out.append(char)
            if char == '`':
                backslashes = 0
                j = i - 1
                while j >= 0 and source[j] == '\\':
                    backslashes += 1
                    j -= 1
                if backslashes % 2 == 0:
                    state = NORMAL
                
        elif state == COMMENT_LINE:
            if char == '\n':
                state = NORMAL
                out.append(char)
            # Ignore other chars
            
        elif state == COMMENT_BLOCK:
            if char == '*' and next_char == '/':
                state = NORMAL
                i += 1
            # Ignore other chars
            
        elif state == JSDOC:
            out.append(char)
            if char == '*' and next_char == '/':
                out.append(next_char)
                state = NORMAL
                i += 1
        
        i += 1
        
    return "".join(out)

if __name__ == "__main__":
    files = sys.argv[1:]
    for fpath in files:
        if not os.path.exists(fpath):
            print(f"File not found: {fpath}")
            continue
            
        with open(fpath, 'r') as f:
            content = f.read()
        
        new_content = strip_comments(content)
        
        # Safety check: if file size drops by > 50%, warn
        if len(new_content) < len(content) * 0.5:
            print(f"WARNING: {fpath} reduced by >50%. Checking...")
            # For now, just proceed but log it.
        
        # Remove empty lines created by stripped comments?
        # The script preserves newlines for line comments, so we might have empty lines.
        # Let's do a pass to remove multiple empty lines.
        # But maybe the user wants to keep spacing?
        # "clean up" implies removing clutter.
        # I'll replace 3+ newlines with 2.
        
        import re
        new_content = re.sub(r'\n\s*\n\s*\n+', '\n\n', new_content)
        
        with open(fpath, 'w') as f:
            f.write(new_content)
        print(f"Processed {fpath}")
