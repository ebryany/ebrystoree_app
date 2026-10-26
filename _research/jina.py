import sys, subprocess, os, json
urls = json.load(open(sys.argv[1]))
os.makedirs("jpages", exist_ok=True)
for name, url in urls.items():
    r = subprocess.run(["curl","-sL","--max-time","45","https://r.jina.ai/"+url], capture_output=True)
    t = r.stdout.decode("utf-8","ignore")
    open(f"jpages/{name}.txt","w",encoding="utf-8").write(t)
    print(f"{name}: {len(t)}")
