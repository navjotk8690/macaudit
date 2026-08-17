#!/bin/bash
set -euo pipefail

ROOT="${1:-.}"
if [ "$#" -gt 0 ]; then shift; fi

if [ ! -d "$ROOT" ]; then
  echo "privacy-check: not a directory: $ROOT" >&2
  exit 2
fi

cd "$ROOT"

files_tmp="$(mktemp)"
trap 'rm -f "$files_tmp"' EXIT

if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git ls-files -co --exclude-standard -z > "$files_tmp"
else
  find . -type f \
    ! -path './.git/*' \
    ! -path './build/*' ! -path './dist/*' \
    ! -name '*.zip' ! -name '*.tar' ! -name '*.gz' ! -name '*.tgz' \
    -print0 > "$files_tmp"
fi

python_bin=""
for candidate in /usr/bin/python3 /opt/homebrew/bin/python3 /usr/local/bin/python3; do
  [ -x "$candidate" ] && { python_bin="$candidate"; break; }
done
[ -n "$python_bin" ] || { echo "privacy-check: python3 is required" >&2; exit 2; }

"$python_bin" - "$files_tmp" "$@" <<'PY'
import ipaddress,re,sys
from pathlib import Path

list_file=Path(sys.argv[1]); extra=[x.lower() for x in sys.argv[2:] if x.strip()]
raw=list_file.read_bytes().split(b'\0')
files=[Path(x.decode('utf-8','surrogateescape')) for x in raw if x]

patterns=[
 ('private key',re.compile(r'-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----')),
 ('AWS access key',re.compile(r'\bAKIA[0-9A-Z]{16}\b')),
 ('GitHub token',re.compile(r'\bgh[pousr]_[A-Za-z0-9_]{20,}\b')),
 ('OpenAI-style secret',re.compile(r'\bsk-[A-Za-z0-9_-]{20,}\b')),
 ('Google API key',re.compile(r'\bAIza[0-9A-Za-z_-]{30,}\b')),
 ('JWT-like token',re.compile(r'\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b')),
 ('macOS home path',re.compile(r'/Users/([A-Za-z0-9._-]+)')),
 ('email address',re.compile(r'\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b',re.I)),
]
ip_re=re.compile(r'(?<![0-9])(?:[0-9]{1,3}\.){3}[0-9]{1,3}(?![0-9])')
allowed_home={'*','...','your-user','username','example','user'}
allowed_emails={'security@example.com','user@example.com'}
allowed_ips={ipaddress.ip_address('127.0.0.1'),ipaddress.ip_address('0.0.0.0')}
findings=[]
for path in files:
    try:
        data=path.read_bytes()
    except OSError:
        continue
    if b'\x00' in data[:8192]:
        continue
    text=data.decode('utf-8','replace')
    for label,rx in patterns:
        for m in rx.finditer(text):
            value=m.group(0)
            if label=='macOS home path' and m.group(1).lower() in allowed_home:
                continue
            if label=='email address' and value.lower() in allowed_emails:
                continue
            line=text.count('\n',0,m.start())+1
            findings.append((str(path),line,label,value[:180]))
    for m in ip_re.finditer(text):
        try: ip=ipaddress.ip_address(m.group(0))
        except ValueError: continue
        if ip in allowed_ips or ip.is_loopback or ip.is_unspecified or ip.is_multicast or ip.is_link_local or ip.is_private or ip.is_reserved:
            continue
        line=text.count('\n',0,m.start())+1
        findings.append((str(path),line,'public IPv4 literal',m.group(0)))
    lower=text.lower()
    for term in extra:
        start=0
        while True:
            pos=lower.find(term,start)
            if pos<0: break
            line=text.count('\n',0,pos)+1
            findings.append((str(path),line,f'extra term: {term}',text[pos:pos+180].splitlines()[0]))
            start=pos+len(term)

if findings:
    print('privacy-check: findings require review')
    for path,line,label,value in findings:
        print(f'{path}:{line}: {label}: {value}')
    raise SystemExit(1)
print(f'privacy-check: clean ({len(files)} project files scanned)')
PY
