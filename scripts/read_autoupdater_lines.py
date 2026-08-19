import os

filepath = r"c:\Users\ohmyg\OneDrive\Desktop\AI facilitator\entry-offline\src\main\main.ts"
with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()
    for idx, line in enumerate(lines):
        if "autoUpdater" in line or "electron-updater" in line:
            print(f"Line {idx + 1}: {line.strip()}")
