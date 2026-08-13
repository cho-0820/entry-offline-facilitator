import os
import re

search_dir = r"c:\Users\ohmyg\OneDrive\Desktop\AI facilitator\entry-offline\src\renderer"
pattern = re.compile(r"(ipcRenderer|remote|from\s+['\"]electron['\"]|require\(['\"]electron['\"]\))")

results = {}

for root, dirs, files in os.walk(search_dir):
    for file in files:
        if file.endswith(('.ts', '.tsx', '.js', '.jsx')):
            filepath = os.path.join(root, file)
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    lines = f.readlines()
                    matching_lines = []
                    for idx, line in enumerate(lines):
                        if pattern.search(line):
                            matching_lines.append((idx + 1, line.strip()))
                    if matching_lines:
                        rel_path = os.path.relpath(filepath, search_dir)
                        results[rel_path] = matching_lines
            except Exception as e:
                pass

for filepath, matches in sorted(results.items(), key=lambda x: len(x[1]), reverse=True):
    print(f"=== {filepath} ({len(matches)} occurrences) ===")
    for line_num, content in matches:
        print(f"  Line {line_num}: {content}")
    print()
