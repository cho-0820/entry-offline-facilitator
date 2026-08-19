import os

base_dir = r"c:\Users\ohmyg\OneDrive\Desktop\AI facilitator\entry-offline"
matches = []

for root, dirs, files in os.walk(base_dir):
    if "node_modules" in root or ".git" in root:
        continue
    for file in files:
        filepath = os.path.join(root, file)
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
                if "serialport" in content or "entry-hw" in content or "hardware" in content.lower():
                    matches.append(os.path.relpath(filepath, base_dir))
        except Exception:
            pass

print("=== Hardware related files in project (excluding node_modules) ===")
for m in matches:
    print(f"- {m}")
