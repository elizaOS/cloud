import json

with open("package.json", "r") as f:
    pkg = json.load(f)

for k, v in pkg.get("scripts", {}).items():
    # Replace starting terms
    v = v.replace(" scripts/", " packages/scripts/")
    v = v.replace("./scripts/", "./packages/scripts/")
    v = v.replace(" tests/", " packages/tests/")
    v = v.replace("./tests/", "./packages/tests/")
    v = v.replace(" lib/", " packages/lib/")
    v = v.replace(" services/", " packages/services/")
    
    # special cases for the bulk test command
    v = v.replace("$(find tests/", "$(find packages/tests/")
    v = v.replace("! -path 'tests/", "! -path 'packages/tests/")
    
    pkg["scripts"][k] = v

with open("package.json", "w") as f:
    json.dump(pkg, f, indent=2)
