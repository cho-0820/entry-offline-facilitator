import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def search_files():
    matches = []
    keywords = ["mediaFilePath", "mediaURL", "libDir", "publicPath", "images", "resources", "png", "svg"]
    
    for root, dirs, files in os.walk(os.path.join(ROOT, "src")):
        for f in files:
            if f.endswith((".ts", ".tsx", ".js", ".jsx", ".html", ".json")):
                filepath = os.path.join(root, f)
                with open(filepath, "r", encoding="utf-8", errors="ignore") as file:
                    content = file.read()
                    for kw in ["mediaFilePath", "mediaURL", "publicPath", "StudentLoginModal", "login.tsx"]:
                        if kw in content:
                            matches.append((filepath, kw))
    
    for m in set(matches):
        print(f"Match: {m[1]} in {m[0]}")

search_files()
