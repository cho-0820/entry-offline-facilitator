import os

base_dir = r"c:\Users\ohmyg\OneDrive\Desktop\AI facilitator\entry-offline"
matches = []

for root, dirs, files in os.walk(base_dir):
    if "node_modules" in root or ".git" in root:
        continue
    for file in files:
        if file.endswith((".md", ".txt")):
            filepath = os.path.join(root, file)
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()
                    if "electron-updater" in content or "autoUpdater" in content:
                        matches.append(os.path.relpath(filepath, base_dir))
            except Exception:
                pass

print("=== Documentation files mentioning updater ===")
for m in matches:
    print(f"- {m}")
