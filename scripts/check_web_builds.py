import os
import json

base_dir = r"c:\Users\ohmyg\OneDrive\Desktop\AI facilitator\entry-offline"

# 1. Find Webpack files
webpack_files = []
for root, dirs, files in os.walk(base_dir):
    if "node_modules" in root:
        continue
    for file in files:
        if "webpack" in file.lower():
            webpack_files.append(os.path.relpath(os.path.join(root, file), base_dir))

print("=== Webpack Configuration Files ===")
for f in webpack_files:
    print(f"- {f}")
print()

# 2. Parse package.json scripts
package_json_path = os.path.join(base_dir, "package.json")
if os.path.exists(package_json_path):
    with open(package_json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
        scripts = data.get("scripts", {})
        print("=== package.json Scripts ===")
        for name, cmd in scripts.items():
            print(f"- {name}: {cmd}")
