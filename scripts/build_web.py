import os
import shutil

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST_WEB = os.path.join(ROOT_DIR, "dist_web")

print(f"[BuildWeb] Building fast web dist in {DIST_WEB}...", flush=True)

# 1. Copy index.html
shutil.copy2(os.path.join(ROOT_DIR, "index.html"), os.path.join(DIST_WEB, "index.html"))

# 2. Copy src/main/views
src_main_views = os.path.join(ROOT_DIR, "src", "main", "views")
dest_main_views = os.path.join(DIST_WEB, "src", "main", "views")
shutil.copytree(src_main_views, dest_main_views, dirs_exist_ok=True)
print("[BuildWeb] Copied src/main/views", flush=True)

# 3. Copy src/renderer (skipping uploads) & src/renderer_build
def ignore_uploads(dirpath, names):
    if "uploads" in dirpath:
        return names
    return []

src_renderer = os.path.join(ROOT_DIR, "src", "renderer")
dest_renderer = os.path.join(DIST_WEB, "src", "renderer")
shutil.copytree(src_renderer, dest_renderer, ignore=ignore_uploads, dirs_exist_ok=True)
print("[BuildWeb] Copied src/renderer", flush=True)

src_renderer_build = os.path.join(ROOT_DIR, "src", "renderer_build")
dest_renderer_build = os.path.join(DIST_WEB, "src", "renderer_build")
shutil.copytree(src_renderer_build, dest_renderer_build, dirs_exist_ok=True)
print("[BuildWeb] Copied src/renderer_build", flush=True)

# 4. Copy required node_modules packages to dist_web/vendor
required_modules = [
    "entry-js",
    "entry-tool",
    "literallycanvas-mobile",
    "lodash",
    "jquery",
    "@entrylabs",
]

dest_vendor = os.path.join(DIST_WEB, "vendor")
os.makedirs(dest_vendor, exist_ok=True)

for mod in required_modules:
    mod_src = os.path.join(ROOT_DIR, "node_modules", mod)
    mod_dest = os.path.join(dest_vendor, mod)
    if os.path.exists(mod_src):
        print(f"[BuildWeb] Copying vendor package: {mod}...", flush=True)
        shutil.copytree(mod_src, mod_dest, dirs_exist_ok=True)

# 5. Update main.html inside dist_web to point node_modules -> /vendor/
main_html_path = os.path.join(dest_main_views, "main.html")
with open(main_html_path, "r", encoding="utf-8") as f:
    content = f.read()

updated_content = content.replace("../../../node_modules/", "/vendor/")

with open(main_html_path, "w", encoding="utf-8") as f:
    f.write(updated_content)

print("[BuildWeb] Updated main.html script & link tags to point to /vendor/", flush=True)

# 6. Create vercel.json inside dist_web & root
vercel_config = """{
  "version": 2,
  "public": true,
  "cleanUrls": false,
  "rewrites": [
    { "source": "/", "destination": "/src/main/views/main.html" }
  ]
}
"""

with open(os.path.join(DIST_WEB, "vercel.json"), "w", encoding="utf-8") as f:
    f.write(vercel_config)

root_vercel_config = """{
  "version": 2,
  "outputDirectory": "dist_web",
  "cleanUrls": false,
  "rewrites": [
    { "source": "/", "destination": "/src/main/views/main.html" }
  ]
}
"""

with open(os.path.join(ROOT_DIR, "vercel.json"), "w", encoding="utf-8") as f:
    f.write(root_vercel_config)

print("[BuildWeb] dist_web build completed successfully!", flush=True)
