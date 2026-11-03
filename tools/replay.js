#!/usr/bin/env node
/* Replays an orvia swing log (exported from the app in diagnostics mode) through the
   same engine the app runs, so detection and measurements can be checked and tuned
   offline against real swings.

     node tools/replay.js orvia-swing-log-….json            summary of every swing
     node tools/replay.js log.json --phases                  also print each phase change
     node tools/replay.js log.json --csv > frames.csv        per-frame live numbers

   It loads ../live.js with tiny browser stubs, so any threshold you change there is
   what gets replayed. */
const fs=require('fs'), path=require('path');
const file=process.argv[2];
if(!file){ console.error('usage: node tools/replay.js <log.json> [--phases] [--csv]'); process.exit(1); }
const showPhases=process.argv.includes('--phases'), csv=process.argv.includes('--csv');
global.window={ matchMedia:()=>({matches:false}), addEventListener(){}, removeEventListener(){} };
global.location={ search:'' }; global.localStorage={ getItem:()=>null, setItem(){} };
global.document={ createElement:()=>({ getContext:()=>({}) }), querySelector:()=>null, getElementById:()=>null };
eval(fs.readFileSync(path.join(__dirname,'..','live.js'),'utf8'));
const Live=window.Live, log=JSON.parse(fs.readFileSync(file,'utf8'));
const keys=log.keys;

const toLm=row=>{
  if(row.length<2) return null;
  const out=new Array(33); let k=1;
  keys.forEach(i=>{ out[i]={x:row[k],y:row[k+1],v:row[k+2]}; k+=3; });
  for(let i=0;i<33;i++) if(!out[i]) out[i]=out[0];       // face points aren't logged
  return out;
};
let mi=0, mode=log.modes[0][1];
const eng=Live._engine(mode, log.handed);
const got=[];
if(csv) console.log('t,phase,dNorm,vis,shoulder,hip,weight,head,tilt,leadArm,speed');
let drops=0, last=-1, gaps=[];
for(const row of log.frames){
  const t=row[0];
  while(mi+1<log.modes.length && log.modes[mi+1][0]<=t){ mi++; mode=log.modes[mi][1]; eng.setMode(mode); }
  if(last>=0 && t-last>70) gaps.push(t-last);
  last=t;
  const lm=toLm(row); if(!lm) drops++;
  const r=eng.update(lm,t);
  r.events.forEach(e=>{
    if(e.type==='phase' && showPhases) console.log(`${(t/1000).toFixed(2)}s  ${e.phase}`);
    if(e.type==='swing') got.push(e.report);
  });
  if(csv){ const m=r.live||{}, d=r.dbg||{}, f=v=>v==null?'':(+v).toFixed(2);
    console.log([t,r.phase,f(r.dNorm),f(d.vis),f(m.shoulder),f(m.hip),f(m.weight),f(m.head),f(m.tilt),f(m.leadArm),f(m.speed)].join(',')); }
}
if(csv) process.exit(0);
const dur=(log.frames.length?log.frames[log.frames.length-1][0]:0)/1000;
console.log(`\n${path.basename(file)}  ·  ${log.source}  ·  ${log.model?log.model.delegate:''}  ·  video ${log.video?log.video.join('×'):'?'}`);
console.log(`${log.frames.length} frames over ${dur.toFixed(1)} s = ${(log.frames.length/Math.max(dur,0.001)).toFixed(1)} fps  ·  no-pose frames ${drops}  ·  gaps >70 ms: ${gaps.length}${gaps.length?` (max ${Math.max(...gaps)} ms)`:''}`);
console.log(`swings: in the app ${log.swings.length}  ·  on replay ${got.length}\n`);
const r1=v=>(+v).toFixed(1);
got.forEach((r,i)=>{
  const a=log.swings[i];
  const cs=Object.entries(r.checks).map(([k,c])=>`${k} ${r1(c.v)}${c.st==='good'?'':c.st==='warn'?'~':'!'}`).join('  ');
  console.log(`#${r.n} ${r.mode}  score ${r.score}${a&&a.score!==r.score?` (app ${a.score})`:''}  tempo ${r.tempo.back.toFixed(2)}/${r.tempo.down.toFixed(2)} = ${r.tempo.ratio.toFixed(2)}:1  release ${r.releaseMs} ms  hands ${r1(r.peakSpeed)} m/s`);
  console.log(`    ${cs}`);
});
