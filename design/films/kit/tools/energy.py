import sys, subprocess, numpy as np
f=sys.argv[1]; sr=22050
raw=subprocess.run(["ffmpeg","-v","error","-i",f,"-ac","1","-ar",str(sr),"-f","f32le","-"],capture_output=True).stdout
x=np.frombuffer(raw,dtype=np.float32)
hop=sr//2
rms=[float(np.sqrt(np.mean(x[i:i+hop]**2))) for i in range(0,len(x)-hop,hop)]
m=max(rms)
bars="".join(" .:-=+*#%@"[min(9,int(r/m*9.99))] for r in rms)
# onset/tempo: spectral flux on 1024 frames
n=1024; h=512; win=np.hanning(n)
frames=[np.abs(np.fft.rfft(x[i:i+n]*win)) for i in range(0,len(x)-n,h)]
F=np.array(frames); flux=np.maximum(0,np.diff(F,axis=0)).sum(1); flux=(flux-flux.mean())/(flux.std()+1e-9)
ac=np.correlate(flux,flux,'full')[len(flux)-1:]
fps=sr/h; lags=np.arange(len(ac))/fps
sel=(lags>60/180)&(lags<60/70)
bpm=60/lags[sel][np.argmax(ac[sel])]
print(f.split('/')[-1], f"dur={len(x)/sr:.1f}s bpm~{bpm:.0f}")
for i in range(0,len(bars),60): print(f"{i/2:6.1f}s |{bars[i:i+60]}|")
