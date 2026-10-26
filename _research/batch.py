import sys, re, subprocess, os, json

HEADERS = ["-A", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
           "-H", "Accept-Language: en-US,en;q=0.9"]

def get(url):
    r = subprocess.run(["curl", "-sL", "--max-time", "30"] + HEADERS + [url], capture_output=True)
    return r.stdout.decode("utf-8", "ignore")

def to_text(html):
    html = re.sub(r"(?is)<(script|style|noscript|svg|nav|footer|header)[^>]*>.*?</\1>", " ", html)
    html = re.sub(r"(?is)<(br|/p|/div|/li|/h[1-6]|/tr|/td)[^>]*>", "\n", html)
    html = re.sub(r"(?s)<[^>]+>", " ", html)
    for a, b in [("&nbsp;", " "), ("&amp;", "&"), ("&quot;", '"'), ("&#39;", "'"), ("&rsquo;", "'"), ("&mdash;", "-"), ("&ndash;", "-"), ("&lt;", "<"), ("&gt;", ">")]:
        html = html.replace(a, b)
    html = re.sub(r"[ \t]+", " ", html)
    html = re.sub(r"\n\s*\n+", "\n", html)
    return html.strip()

urls = json.load(open(sys.argv[1]))
os.makedirs("pages", exist_ok=True)
for name, url in urls.items():
    try:
        txt = to_text(get(url))
        open(f"pages/{name}.txt", "w", encoding="utf-8").write(txt)
        print(f"OK   {name}: {len(txt)} chars")
    except Exception as e:
        print(f"FAIL {name}: {e}")
