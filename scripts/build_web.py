import os
import shutil

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST_WEB = os.path.join(ROOT_DIR, "dist_web")

print(f"[BuildWeb] Building fast web dist in {DIST_WEB}...", flush=True)

# 1. Copy index.html & create favicon.ico
shutil.copy2(os.path.join(ROOT_DIR, "index.html"), os.path.join(DIST_WEB, "index.html"))
open(os.path.join(DIST_WEB, "favicon.ico"), "wb").close()

# 2. Copy src/main/views
src_main_views = os.path.join(ROOT_DIR, "src", "main", "views")
dest_main_views = os.path.join(DIST_WEB, "src", "main", "views")
shutil.copytree(src_main_views, dest_main_views, dirs_exist_ok=True)
print("[BuildWeb] Copied src/main/views", flush=True)
# 2b. Copy src/main/utils (including createLogger and other utilities)
src_main_utils = os.path.join(ROOT_DIR, "src", "main", "utils")
dest_main_utils = os.path.join(DIST_WEB, "src", "main", "utils")
shutil.copytree(src_main_utils, dest_main_utils, dirs_exist_ok=True)
print("[BuildWeb] Copied src/main utils", flush=True)
# 2c. Copy src/main/commonUtils.ts
src_common_utils = os.path.join(ROOT_DIR, "src", "main", "commonUtils.ts")
dest_common_utils = os.path.join(DIST_WEB, "src", "main", "commonUtils.ts")
shutil.copy2(src_common_utils, dest_common_utils)
print("[BuildWeb] Copied commonUtils.ts", flush=True)
# 2d. Copy root package.json so parseCommandLine can resolve it
src_pkg = os.path.join(ROOT_DIR, "package.json")
dest_pkg = os.path.join(DIST_WEB, "package.json")
shutil.copy2(src_pkg, dest_pkg)
print("[BuildWeb] Copied package.json", flush=True)


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
os.makedirs(dest_renderer_build, exist_ok=True)
for item in os.listdir(src_renderer_build):
    s = os.path.join(src_renderer_build, item)
    d = os.path.join(dest_renderer_build, item)
    if os.path.isdir(s):
        shutil.copytree(s, d, dirs_exist_ok=True)
    else:
        try:
            shutil.copy2(s, d)
        except Exception as e:
            print(f"[BuildWeb] Warning copying {item}: {e}", flush=True)
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

# 5. Update main.html and index.html inside dist_web to use absolute / paths
main_html_path = os.path.join(dest_main_views, "main.html")
with open(main_html_path, "r", encoding="utf-8") as f:
    content = f.read()

# Replace all relative prefixes with absolute / paths
updated_content = content.replace("../../../node_modules/", "/vendor/")
updated_content = updated_content.replace("../../renderer/", "/src/renderer/")
updated_content = updated_content.replace("../../renderer_build/", "/src/renderer_build/")

with open(main_html_path, "w", encoding="utf-8") as f:
    f.write(updated_content)

# Overwrite dist_web/index.html with main.html content so root / serves workspace directly with absolute paths
with open(os.path.join(DIST_WEB, "index.html"), "w", encoding="utf-8") as f:
    f.write(updated_content)

print("[BuildWeb] Updated main.html & index.html script/link tags to use absolute / paths", flush=True)

# 6. Create vercel.json inside dist_web & root
vercel_config = """{
  "version": 2,
  "public": true,
  "cleanUrls": false,
  "rewrites": [
    { "source": "/", "destination": "/index.html" },
    { "source": "/src/main/views/main.html", "destination": "/index.html" }
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
    { "source": "/", "destination": "/index.html" },
    { "source": "/src/main/views/main.html", "destination": "/index.html" }
  ]
}
"""

with open(os.path.join(ROOT_DIR, "vercel.json"), "w", encoding="utf-8") as f:
    f.write(root_vercel_config)

print("[BuildWeb] dist_web build completed successfully!", flush=True)

import urllib.request
import re

print("[BuildWeb] Verifying deployed live HTML asset tags on https://distweb-theta.vercel.app/...", flush=True)
try:
    live_html = urllib.request.urlopen("https://distweb-theta.vercel.app/").read().decode("utf-8")
    asset_paths = re.findall(r'(?:src|href)="([^"]+)"', live_html)
    print(f"[BuildWeb] Found {len(asset_paths)} asset tags in live HTML.", flush=True)
    all_ok = True
    for path in asset_paths:
        if path.startswith("http") or path.startswith("//"):
            continue
        full_url = "https://distweb-theta.vercel.app" + (path if path.startswith("/") else "/" + path)
        try:
            res = urllib.request.urlopen(full_url)
            code = res.getcode()
            print(f"  [200 OK] {path}", flush=True)
        except Exception as err:
            all_ok = False
            print(f"  [FAIL {err}] {path}", flush=True)
    if all_ok:
        print("[BuildWeb] ALL ASSET TAGS RETURNED 200 OK!", flush=True)
    else:
        print("[BuildWeb] WARNING: SOME ASSET TAGS FAILED!", flush=True)
except Exception as e:
    print(f"[BuildWeb] Live check exception: {e}", flush=True)
