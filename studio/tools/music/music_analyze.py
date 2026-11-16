"""Measure a reference score from its stems: note-by-note pitch tracks of the bass and the lead (YIN), note-length stats
and register, the loop length (chroma self-similarity), drum onsets with a low/mid/high class, and the lead's envelope
and brightness, written to one JSON file.
    .venv/bin/python tools/music/music_analyze.py --film "$FILM" --stems <stem dir> [--bass bass.wav] [--lead other.wav]
        [--drums drums.wav] [--lead-range 150,1600] [--bass-range 35,220] [--out <stem dir>/music.json]
The stems come from tools/stems/split.py --four (vocals, drums, bass, other: the lead is usually in "other")."""
import argparse, os
import subprocess, numpy as np, json
ap=argparse.ArgumentParser(); ap.add_argument('--film',default=os.environ.get('FILM','.')); ap.add_argument('--stems',default='refs/audio/stems')
ap.add_argument('--bass',default='bass.mp3'); ap.add_argument('--lead',default='other.mp3'); ap.add_argument('--drums',default='drums.mp3')
ap.add_argument('--lead-range',default='150,1600'); ap.add_argument('--bass-range',default='35,220'); ap.add_argument('--out',default='refs/audio/music.json')
A=ap.parse_args(); P=lambda p: p if os.path.isabs(p) else os.path.join(A.film,p)
D=P(A.stems).rstrip('/')+'/'; OUT=P(A.out); LR=[float(x) for x in A.lead_range.split(',')]; BR=[float(x) for x in A.bass_range.split(',')]
SR=22050
def dec(p): return np.frombuffer(subprocess.run(['ffmpeg','-v','error','-i',D+p,'-ac','1','-ar',str(SR),'-f','f32le','-'],capture_output=True).stdout,np.float32)
NAMES=['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B']
def note(f): 
    m=int(round(69+12*np.log2(f/440))); return f'{NAMES[m%12]}{m//12-1}'
def yin(x, fmin, fmax, hop=256, win=2048, thr=0.15):
    out=[]
    tmin, tmax = int(SR/fmax), int(SR/fmin)
    for i in range(0, len(x)-win-tmax, hop):
        fr=x[i:i+win+tmax]; e=np.sqrt((fr[:win]**2).mean())
        if e<0.003: out.append((i/SR,0,0)); continue
        d=np.array([((fr[:win]-fr[t:t+win])**2).sum() for t in range(tmin,tmax)])
        cm=d*np.arange(1,len(d)+1)/np.maximum(np.cumsum(d),1e-9)
        idx=np.where(cm<thr)[0]
        if len(idx)==0: out.append((i/SR,0,e)); continue
        k=idx[0]
        while k+1<len(cm) and cm[k+1]<cm[k]: k+=1
        out.append((i/SR,SR/(k+tmin),e))
    return out
def segment(tr, minlen=0.08):
    notes=[]; cur=None
    for t,f,e in tr:
        n=note(f) if f>0 else None
        if cur and n==cur[0]: cur[2]=t
        else:
            if cur and cur[0] and cur[2]-cur[1]>=minlen: notes.append(tuple(cur))
            cur=[n,t,t]
    return notes
res={}
bass=dec(A.bass)
tb=yin(bass[:SR*60],BR[0],BR[1],hop=512)
nb=segment(tb,0.1)
res['bass_first60']=[(n,round(a,2),round(b-a,2)) for n,a,b in nb][:80]
other=dec(A.lead)
to=yin(other[:SR*45],LR[0],LR[1],hop=256,win=1024)
no=segment(to,0.07)
res['other_first45']=[(n,round(a,2),round(b-a,2)) for n,a,b in no][:160]
# note-duration stats and register
def stats(notes):
    if not notes: return {}
    d=np.array([b-a for _,a,b in notes]); reg={}
    for n,_,_ in notes: reg[n]=reg.get(n,0)+1
    return dict(n=len(notes), median_dur=round(float(np.median(d)),3), top=sorted(reg.items(),key=lambda x:-x[1])[:10])
res['bass_stats']=stats(nb); res['other_stats']=stats(no)
# loop length: self-similarity of chroma of the full music (bass+other) at 0.25 s frames
drm=dec(A.drums); n=min(len(bass),len(other),len(drm))
mus=bass[:n]+other[:n]+drm[:n]
hop=int(SR*0.25); C=[]
for i in range(0,len(mus)-4096,hop):
    X=np.abs(np.fft.rfft(mus[i:i+4096]*np.hanning(4096))); f=np.fft.rfftfreq(4096,1/SR); m=(f>50)&(f<3000)
    c=np.zeros(12); np.add.at(c,(np.round(12*np.log2(f[m]/261.63))%12).astype(int),X[m]); C.append(c/(np.linalg.norm(c)+1e-9))
C=np.array(C); best=[]
for lag in range(int(4/0.25),int(60/0.25)):
    best.append((float((C[:-lag]*C[lag:]).sum(1).mean()),lag*0.25))
best.sort(reverse=True); res['loop_candidates_s']=[(round(s,3),l) for s,l in best[:8]]
# drums: onset times in first 20 s + spectral class (low/mid/high)
dr=drm[:SR*20]; hop2=128; env=[]
for i in range(0,len(dr)-512,hop2): env.append(np.sqrt((dr[i:i+512]**2).mean()))
env=np.array(env); on=np.where((env[1:-1]>env[:-2])&(env[1:-1]>=env[2:])&(env[1:-1]>env.max()*0.25))[0]+1
hits=[]
for k in on:
    s=dr[k*hop2:k*hop2+2048]; X=np.abs(np.fft.rfft(s*np.hanning(len(s)))); f=np.fft.rfftfreq(len(s),1/SR)
    lo=X[f<150].sum(); mid=X[(f>=150)&(f<2000)].sum(); hi=X[f>=2000].sum(); cls=['low','mid','high'][int(np.argmax([lo,mid,hi]))]
    hits.append((round(k*hop2/SR,3),cls))
res['drum_hits_first20']=hits[:80]
# timbre of "other": attack/decay — fraction of energy in sustained frames vs transient
fr=np.array([np.sqrt((other[i:i+1024]**2).mean()) for i in range(0,len(other)-1024,512)])
res['other_envelope']=dict(crest=round(float(fr.max()/fr.mean()),2), frac_frames_below_half_mean=round(float((fr<fr.mean()*0.5).mean()),2))
X=np.abs(np.fft.rfft(other[SR*10:SR*30])); f=np.fft.rfftfreq(SR*20,1/SR)
res['other_centroid_hz']=round(float((f*X).sum()/X.sum()))
os.makedirs(os.path.dirname(os.path.abspath(OUT)),exist_ok=True); json.dump(res,open(OUT,'w'),indent=0); print('wrote',OUT)
print(json.dumps({k:v for k,v in res.items() if k not in('other_first45','bass_first60','drum_hits_first20')},indent=0))
print('BASS:',' '.join(f'{n}({d})' for n,a,d in res['bass_first60'][:50]))
print('OTHER:',' '.join(f'{n}@{a}({d})' for n,a,d in res['other_first45'][:110]))
print('DRUMS:',' '.join(f'{t}{c[0]}' for t,c in res['drum_hits_first20'][:70]))
