import os
import re

search_dir = r"c:\Users\ohmyg\OneDrive\Desktop\AI facilitator\entry-offline\src\main"
pattern = re.compile(r"ipcMain\.(handle|on)\s*\(\s*['\"]([^'\"]+)['\"]")

handlers = []

for root, dirs, files in os.walk(search_dir):
    for file in files:
        if file.endswith(('.ts', '.tsx', '.js', '.jsx')):
            filepath = os.path.join(root, file)
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()
                    matches = pattern.findall(content)
                    for type_, channel in matches:
                        handlers.append((os.path.relpath(filepath, search_dir), type_, channel))
            except Exception as e:
                pass

print(f"Found {len(handlers)} ipcMain handlers in src/main:")
for file, type_, channel in sorted(handlers, key=lambda x: (x[0], x[2])):
    print(f"- [{type_}] '{channel}' in {file}")
