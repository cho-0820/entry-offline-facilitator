import os

uploads_dir = r"c:\Users\ohmyg\OneDrive\Desktop\AI facilitator\entry-offline\src\renderer\resources\uploads"
mp3_files = []

for root, dirs, files in os.walk(uploads_dir):
    for f in files:
        if f.endswith('.mp3') or f.endswith('.wav'):
            rel_path = os.path.relpath(os.path.join(root, f), uploads_dir)
            mp3_files.append(rel_path)
            if len(mp3_files) >= 10:
                break
    if len(mp3_files) >= 10:
        break

print("Sample sound file relative paths in uploads/:")
for p in mp3_files:
    print(p)
