import urllib.request, json, sys
try:
    r = urllib.request.urlopen('http://localhost:8002/api/system/health', timeout=10)
    d = json.loads(r.read())
    print(f"       API status: {d.get('status','?')} | total logs: {d.get('total_logs','?')}")
except Exception as e:
    print(f"       API not ready yet: {e}")
    sys.exit(1)
