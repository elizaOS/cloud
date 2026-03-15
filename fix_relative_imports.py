import os
import re

for root, _, files in os.walk("packages"):
    for f in files:
        if not f.endswith((".ts", ".tsx", ".js", ".jsx")):
            continue
        path = os.path.join(root, f)
        with open(path, "r") as file:
            content = file.read()
        
        # We need to add an extra '../' to any relative import that targets a directory that wasn't moved, like 'app/'
        # E.g. '../../app/api/compat/_lib/error-handler' -> '../../../app/api/compat/_lib/error-handler'
        
        # Regex to find from matching quotes starting with one or more '../' followed by 'app/'
        # E.g. from "../../app/..."
        new_content = re.sub(r'([\'"])((?:\.\./)+)(app/)', r'\1../\2\3', content)
        
        if new_content != content:
            with open(path, "w") as file:
                file.write(new_content)
            print(f"Fixed imports in {path}")

