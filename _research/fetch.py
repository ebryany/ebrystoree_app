import sys, re, subprocess

def get(url):
    r = subprocess.run(["curl", "-sL", "--max-time", "25",
        "-A", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        url], capture_output=True)
    return r.stdout.decode("utf-8", "ignore")

def to_text(html):
    html = re.sub(r"(?is)<(script|style|noscript|svg)[^>]*>.*?</\1>", " ", html)
    html = re.sub(r"(?is)<(br|/p|/div|/li|/h[1-6]|/tr)[^>]*>", "\n", html)
    html = re.sub(r"(?s)<[^>]+>", " ", html)
    html = re.sub(r"&nbsp;?", " ", html)
    html = re.sub(r"&amp;?", "&", html)
    html = re.sub(r"&quot;?", '"', html)
    html = re.sub(r"&#39;?", "'", html)
    html = re.sub(r"[ \t]+", " ", html)
    html = re.sub(r"\n\s*\n+", "\n", html)
    return html.strip()

if __name__ == "__main__":
    url = sys.argv[1]
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 6000
    txt = to_text(get(url))
    print(txt[:limit])
