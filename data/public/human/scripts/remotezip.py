# Minimal HTTP-range-backed zip reader: list or extract single members without downloading whole archive.
import io, sys, zipfile, urllib.request, ssl
class RangeFile(io.RawIOBase):
    def __init__(self, url):
        self.url=url; self.pos=0
        req=urllib.request.Request(url, method='HEAD')
        with urllib.request.urlopen(req) as r: self.size=int(r.headers['Content-Length'])
    def seekable(self): return True
    def readable(self): return True
    def tell(self): return self.pos
    def seek(self, off, whence=0):
        self.pos = off if whence==0 else (self.pos+off if whence==1 else self.size+off); return self.pos
    def read(self, n=-1):
        if n<0: n=self.size-self.pos
        if n==0 or self.pos>=self.size: return b''
        end=min(self.pos+n, self.size)-1
        req=urllib.request.Request(self.url, headers={'Range':'bytes=%d-%d'%(self.pos,end)})
        with urllib.request.urlopen(req) as r: data=r.read()
        self.pos+=len(data); return data
    def readinto(self,b):
        d=self.read(len(b)); b[:len(d)]=d; return len(d)
url=sys.argv[1]; z=zipfile.ZipFile(io.BufferedReader(RangeFile(url), buffer_size=1<<20))
if sys.argv[2]=='list':
    for i in z.infolist(): print(i.filename, i.file_size, i.compress_size)
else:
    member, out = sys.argv[3], sys.argv[4]
    with z.open(member) as src, open(out,'wb') as dst:
        while True:
            b=src.read(1<<20)
            if not b: break
            dst.write(b)
    print('wrote', out)
