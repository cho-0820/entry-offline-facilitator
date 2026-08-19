import difflib
import sys

def extract_block_specs(content):
    start_idx = content.find("const BLOCK_SPECS")
    if start_idx == -1:
        return ""
    # Find matching closing brace for BLOCK_SPECS object
    end_idx = content.find("};", start_idx) + 2
    return content[start_idx:end_idx].strip()

def extract_validator(content):
    start_idx = content.find("function validateBlockJsonTypes")
    if start_idx == -1:
        return ""
    # Find closing brace of function
    # In both files, checkBlock(codeJson) is followed by return checkBlock(codeJson);\n} or similar
    end_idx = content.find("return checkBlock(codeJson);\n}", start_idx)
    if end_idx == -1:
        # Try without newline
        end_idx = content.find("return checkBlock(codeJson);}", start_idx)
    if end_idx == -1:
        # Try with code_json instead of codeJson
        end_idx = content.find("return checkBlock(code_json);\n}", start_idx)
    if end_idx == -1:
        end_idx = content.find("return checkBlock(code_json);}", start_idx)
        
    if end_idx != -1:
        # Include the closing brace
        return content[start_idx:end_idx + len("return checkBlock(codeJson);\n}")].strip()
    return ""

def extract_prompt(content):
    start_idx = content.find("const systemPrompt = `")
    if start_idx == -1:
        return ""
    # Find end of template literal
    end_idx = content.find("`;", start_idx)
    return content[start_idx:end_idx + 2].strip()

def main():
    file_orig = r"c:\Users\ohmyg\OneDrive\Desktop\AI facilitator\entry-offline\src\main\ipcMainHelper.ts"
    file_port = r"c:\Users\ohmyg\OneDrive\Desktop\AI facilitator\facilitator-api\app\api\chat\route.ts"
    
    with open(file_orig, 'r', encoding='utf-8') as f:
        orig = f.read()
    with open(file_port, 'r', encoding='utf-8') as f:
        port = f.read()
        
    orig_specs = extract_block_specs(orig)
    port_specs = extract_block_specs(port)
    
    orig_val = extract_validator(orig)
    port_val = extract_validator(port)
    
    orig_prompt = extract_prompt(orig)
    port_prompt = extract_prompt(port)
    
    print("=== BLOCK_SPECS Diff ===")
    if orig_specs == port_specs:
        print("100% Identical")
    else:
        diff = difflib.unified_diff(orig_specs.splitlines(), port_specs.splitlines(), lineterm='')
        print('\n'.join(diff))
        
    print("\n=== validateBlockJsonTypes Diff ===")
    if orig_val == port_val:
        print("100% Identical")
    else:
        diff = difflib.unified_diff(orig_val.splitlines(), port_val.splitlines(), lineterm='')
        print('\n'.join(diff))
        
    print("\n=== systemPrompt Diff ===")
    if orig_prompt == port_prompt:
        print("100% Identical")
    else:
        diff = difflib.unified_diff(orig_prompt.splitlines(), port_prompt.splitlines(), lineterm='')
        print('\n'.join(diff))

if __name__ == "__main__":
    main()
