/* =========================================================================
   ORVIA — Live tracking  ·  camera + pose model + swing engine
   Plugs into the existing session flow without changing it:
     START → count-in → camera window (.zc-feed) → End session → Session Report
   The camera window shows the real feed and skeleton; the report is built
   from the swings that were actually tracked. Without a camera (or when it is
   refused) a demo golfer stands in, and every surface says so.
   ========================================================================= */
(function(){
'use strict';

/* ------------------------------------------------------------ constants -- */
const MP_VER  = '0.10.14';
const MP_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + MP_VER;
const MODEL_URLS = [
  './pose_landmarker_full.task',      // optional local copy for offline exhibitions
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task'
];
const SHOULDER_CM = 39;               // assumed shoulder width, turns pixels into cm
/* diagnostics: ?debug=1, or triple-tap the tracking chip during a session */
let DEBUG = /[?&]debug=1/.test(location.search);
try{ if(localStorage.getItem('orviaDebug')==='1') DEBUG=true; }catch(e){}
const LOG_KEYS=[0,11,12,13,14,15,16,23,24,25,26,27,28,29,30,31,32];
const DEG = 180/Math.PI;
const LM = { nose:0, lSh:11, rSh:12, lEl:13, rEl:14, lWr:15, rWr:16,
             lHip:23, rHip:24, lKn:25, rKn:26, lAnk:27, rAnk:28 };
const BONES = [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],
               [23,25],[25,27],[24,26],[26,28],[27,31],[28,32],[27,29],[28,30]];
const JOINTS = [11,12,13,14,15,16,23,24,25,26,27,28];

/* Balance modes — the mission's mode name is the key. The weight position is the
   tungsten weight's distance from the grip end of the 700 mm club. Target ranges
   are face-on estimates; they shift with the mode the way the club's feel does. */
const MODE_ORDER = ['Driver','Fairway Wood','Hybrid','Mid Iron','Wedge','Putt'];
const MODES = {
  'Driver':      { short:'Driver', mm:290, type:'swing', snd:{hz:2300, body:.18},
    say:'Driver. The weight slides up to your hands.',
    t:{tempo:[2.6,3.4], shoulder:[80,110], hip:[36,60], leadArm:[150,185], head:[0,7], wTop:[8,46], wImp:[52,100], wFin:[68,100], tilt:[8,26]} },
  'Fairway Wood':{ short:'Wood', mm:360, type:'swing', snd:{hz:2000, body:.24},
    say:'Fairway wood. A little more head.',
    t:{tempo:[2.6,3.4], shoulder:[78,108], hip:[34,58], leadArm:[150,185], head:[0,7], wTop:[8,46], wImp:[54,100], wFin:[68,100], tilt:[6,22]} },
  'Hybrid':      { short:'Hybrid', mm:430, type:'swing', snd:{hz:1700, body:.32},
    say:'Hybrid. Balanced. Sweep it.',
    t:{tempo:[2.6,3.4], shoulder:[75,105], hip:[32,56], leadArm:[150,185], head:[0,6], wTop:[10,48], wImp:[56,100], wFin:[68,100], tilt:[5,20]} },
  'Mid Iron':    { short:'Iron', mm:510, type:'swing', snd:{hz:1350, body:.42},
    say:'Mid iron. The head gets heavier.',
    t:{tempo:[2.6,3.4], shoulder:[70,100], hip:[28,52], leadArm:[150,185], head:[0,6], wTop:[12,50], wImp:[58,100], wFin:[68,100], tilt:[3,18]} },
  'Wedge':       { short:'Wedge', mm:600, type:'swing', snd:{hz:1000, body:.55},
    say:'Wedge. The weight sits out in the head.',
    t:{tempo:[2.4,3.4], shoulder:[55,92], hip:[22,46], leadArm:[145,185], head:[0,5], wTop:[25,55], wImp:[60,100], wFin:[66,100], tilt:[0,14]} },
  'Putt':        { short:'Putt', mm:640, type:'putt', snd:{hz:1600, body:.12},
    say:'Putter balance. Rock the shoulders.',
    t:{tempo:[1.6,2.5], head:[0,2.5], sway:[0,2.5], rock:[3,22], wrist:[0,10]} },
};
const modeOf = name => MODES[name] ? name : 'Mid Iron';

/* ------------------------------------------------------- geometry helpers */
const mid  = (a,b)=>({x:(a.x+b.x)/2, y:(a.y+b.y)/2});
const dist = (a,b)=>Math.hypot(a.x-b.x, a.y-b.y);
const clamp=(v,lo,hi)=>v<lo?lo:v>hi?hi:v;
const angleAt=(a,b,c)=>{
  const v1x=a.x-b.x,v1y=a.y-b.y,v2x=c.x-b.x,v2y=c.y-b.y;
  const d=Math.hypot(v1x,v1y)*Math.hypot(v2x,v2y); if(!d) return 180;
  return Math.acos(clamp((v1x*v2x+v1y*v2y)/d,-1,1))*DEG;
};
const lineAng=(a,b)=>Math.atan2(b.y-a.y,b.x-a.x)*DEG;
const wrapDeg=d=>{ while(d>180)d-=360; while(d<-180)d+=360; return d; };
const torsoOf=lm=>dist(mid(lm[11],lm[12]), mid(lm[23],lm[24]));

/* =================================================================== ENGINE
   Pure analysis: 33 landmarks (pixels, un-mirrored frame) + time in ms →
   phase, live posture numbers, and events. The phase machine follows the
   hands' distance from where they rested at address, so the same logic reads
   a full swing and a putting stroke; only the thresholds change. */
function createEngine(modeName, handed){
  modeName=modeOf(modeName);
  let mode=MODES[modeName], hand=handed==='L'?'L':'R';
  let S=null, lastT=null, torso=null, phase='idle', phaseT=0, A=null;
  let stillSince=null, lastStillT=0, swing=null, count=0, prevD=0, lastSeen=-1e9;

  const side=()=>hand==='R'
    ? {sh:'lSh',tsh:'rSh',el:'lEl',wr:'lWr',hip:'lHip',thip:'rHip',ank:'lAnk',tank:'rAnk'}
    : {sh:'rSh',tsh:'lSh',el:'rEl',wr:'rWr',hip:'rHip',thip:'lHip',ank:'rAnk',tank:'lAnk'};
  const putt=()=>mode.type==='putt';

  function smooth(lm,t){
    const dt=lastT==null?16:Math.max(1,t-lastT);
    const keys=Object.keys(LM);
    if(!S){
      S={}; keys.forEach(k=>{ const p=lm[LM[k]]; S[k]={x:p.x,y:p.y,v:p.v==null?1:p.v}; });
      S.hands=mid(S.lWr,S.rWr); S.vx=0; S.vy=0; return;
    }
    const aF=1-Math.exp(-dt/28), aS=1-Math.exp(-dt/70);
    keys.forEach(k=>{ const p=lm[LM[k]], s=S[k], a=(k==='lWr'||k==='rWr')?aF:aS;
      s.x+=(p.x-s.x)*a; s.y+=(p.y-s.y)*a; s.v=p.v==null?1:p.v; });
    const h=mid(S.lWr,S.rWr);
    const vx=(h.x-S.hands.x)/(dt/1000), vy=(h.y-S.hands.y)/(dt/1000), av=1-Math.exp(-dt/40);
    S.vx+=(vx-S.vx)*av; S.vy+=(vy-S.vy)*av; S.hands=h;
  }
  const visible=()=>['lSh','rSh','lHip','rHip'].every(k=>S[k].v>=0.45);

  function measure(){
    const s=side(), shMid=mid(S.lSh,S.rSh), hipMid=mid(S.lHip,S.rHip);
    const shW=dist(S.lSh,S.rSh), hipW=dist(S.lHip,S.rHip);
    const ref=A||{shW,hipW,nose:S.nose,hipMid,shAng:lineAng(S[s.tsh],S[s.sh])};
    const cm=SHOULDER_CM/Math.max(20,ref.shW);
    const lead=S[s.ank], trail=S[s.tank], lx=lead.x-trail.x, ly=lead.y-trail.y, ll=lx*lx+ly*ly||1;
    const w=((hipMid.x-trail.x)*lx+(hipMid.y-trail.y)*ly)/ll*100;
    const trailSign=trail.x>=lead.x?1:-1;
    return {
      shoulder: Math.acos(clamp(shW/ref.shW,0,1))*DEG,
      hip:      Math.acos(clamp(hipW/ref.hipW,0,1))*DEG,
      head:     dist(S.nose,ref.nose)*cm,
      weight:   clamp(w,0,100),
      tilt:     Math.atan2((shMid.x-hipMid.x)*trailSign, hipMid.y-shMid.y)*DEG,
      leadArm:  angleAt(S[s.sh],S[s.el],S[s.wr]),
      sway:     Math.abs(hipMid.x-ref.hipMid.x)*cm,
      rock:     (a=>Math.min(a,180-a))(Math.abs(wrapDeg(lineAng(S[s.tsh],S[s.sh])-ref.shAng))),
      speed:    Math.hypot(S.vx,S.vy)*cm/100
    };
  }
  function setPhase(p,t,ev,extra){ phase=p; phaseT=t; ev.push(Object.assign({type:'phase',phase:p,t},extra||{})); }
  function addressLike(){
    const shMid=mid(S.lSh,S.rSh), hipMid=mid(S.lHip,S.rHip), h=S.hands;
    return feetIn() && h.y>shMid.y+0.5*torso && Math.abs(h.x-hipMid.x)<0.55*torso;
  }
  // the whole golfer must be in the picture — a seated or half-framed body never starts a swing
  const feetIn=()=>S.lAnk.v>=0.4 && S.rAnk.v>=0.4;
  function captureAddress(t){
    const s=side();
    A={t, hands:{x:S.hands.x,y:S.hands.y}, nose:{x:S.nose.x,y:S.nose.y},
       shW:dist(S.lSh,S.rSh), hipW:dist(S.lHip,S.rHip), hipMid:mid(S.lHip,S.rHip), torso,
       shAng:lineAng(S[s.tsh],S[s.sh]), leadArm:angleAt(S[s.sh],S[s.el],S[s.wr])};
  }
  function capture(ev,ph,t,m,force){ if(force || !swing.cap[ph]){ swing.cap[ph]=t; swing.ph[ph]=m; ev.push({type:'capture',phase:ph,t}); } }
  function reset(t,ev){ swing=null; A=null; setPhase('ready',t,ev); }

  function update(lm,t){
    const ev=[];
    const active=['takeaway','top','downswing','impact','through'].includes(phase);
    if(!lm || lm.length<29){
      // the model drops a frame or two in the blur of a fast downswing — ride it out
      if(active && t-lastSeen<380){ lastT=t; return {phase, live:null, events:ev, held:true}; }
      if(phase!=='idle'){ swing=null; A=null; setPhase('idle',t,ev); }
      lastT=t; return {phase, live:null, events:ev};
    }
    smooth(lm,t); lastT=t;
    if(!visible()){
      if(active && t-lastSeen<380) return {phase, live:null, events:ev, held:true};
      if(phase!=='idle'){ swing=null; A=null; setPhase('idle',t,ev); }
      return {phase, live:null, events:ev};
    }
    const prevSeen=lastSeen; lastSeen=t;
    const tl=dist(mid(S.lSh,S.rSh),mid(S.lHip,S.rHip));
    torso=torso==null?tl:torso+(tl-torso)*0.08;
    const speedPx=Math.hypot(S.vx,S.vy), P=putt();
    const still=speedPx<(P?0.10:0.30)*torso;
    if(still){ if(stillSince==null) stillSince=t; } else stillSince=null;
    if(phase==='address' && A && dist(S.hands,A.hands)<0.025*(A.torso||torso)) lastStillT=t;
    else if(still && phase!=='takeaway') lastStillT=t;
    const T=A?A.torso:torso, d=A?dist(S.hands,A.hands):0, vr=d-prevD; prevD=d;
    // if the model blinked through the strike, the hands come back already past
    // address on the lead side — the swing is still read, impact in the middle of the gap
    let crossed=false;
    if(swing && A){ const s_=side(), leadDir=Math.sign(S[s_.ank].x-S[s_.tank].x)||1;
      crossed = (S.hands.x-A.hands.x)*leadDir > 0.25*T && d>swing.dmax*0.3 && t-prevSeen>60 && swing.dmax>(P?0.07:0.7)*T; }
    const strike=(m,ti)=>{
      if(!swing.cap.downswing) capture(ev,'downswing',((swing.downAt||swing.tTop)+ti)/2,m);
      swing.tImp=ti; swing.tImpR=ti; swing.imp=m; swing.impD=crossed?0:d;
      capture(ev,'impact',ti,m);
      ev.push({type:'impact',t,speed:swing.peak});
      setPhase('impact',t,ev);
    };

    switch(phase){
      case 'idle': setPhase('ready',t,ev); break;
      case 'ready': case 'finish':
        if(phase==='finish' && t-phaseT<1300) break;
        if(addressLike() && stillSince!=null && t-stillSince>450){ captureAddress(t); setPhase('address',t,ev); }
        else if(phase==='finish'){ A=null; setPhase('ready',t,ev); }
        break;
      case 'address':
        if(still && addressLike()) captureAddress(t);
        if(d>(P?0.05:0.15)*T){
          swing={start:lastStillT, dmax:d, tTop:t, top:null, headMax:0, swayMax:0, peak:0, samples:[],
                 addr:measure(), cap:{}, ph:{}};
          capture(ev,'address',lastStillT,swing.addr);
          setPhase('takeaway',t,ev);
        } else if(!addressLike() && !still) setPhase('ready',t,ev);
        break;
      case 'takeaway': {
        const m=measure();
        swing.headMax=Math.max(swing.headMax,m.head); swing.swayMax=Math.max(swing.swayMax,m.sway);
        if(d>(P?0.07:0.45)*T) capture(ev,'takeaway',t,m);
        if(d>=swing.dmax){ swing.dmax=d; swing.tTop=t; swing.top=m; }
        const minTop=(P?0.07:0.70)*T;
        if(crossed){
          capture(ev,'top',swing.tTop,swing.top||m);
          setPhase('top',swing.tTop,ev); setPhase('downswing',t,ev); swing.downAt=swing.tTop;
          strike(m,(prevSeen+t)/2);
        } else if(swing.dmax>minTop && vr<0 && d<swing.dmax*0.9){
          if(!swing.cap.takeaway) capture(ev,'takeaway',swing.start+(swing.tTop-swing.start)*0.45,swing.top);
          capture(ev,'top',swing.tTop,swing.top);
          setPhase('top',swing.tTop,ev); setPhase('downswing',t,ev); swing.downAt=t;
        } else if(t-swing.start>3200 || (still && t-phaseT>600 && swing.dmax<minTop)) reset(t,ev);
        break;
      }
      case 'downswing': {
        const m=measure();
        swing.headMax=Math.max(swing.headMax,m.head); swing.swayMax=Math.max(swing.swayMax,m.sway);
        swing.peak=Math.max(swing.peak,m.speed); swing.samples.push([t,m.speed]);
        if(d<swing.dmax*0.62) capture(ev,'downswing',t,m);
        if(crossed || (d<swing.dmax*0.3 && t-swing.downAt>40)) strike(m, crossed?(prevSeen+t)/2:t);
        else if(t-swing.downAt>1100) reset(t,ev);
        break;
      }
      case 'impact': {
        const m=measure();
        // impact is called on the way in; the frame where the hands come closest to
        // address is the real strike — move the time and the still there
        if(d<swing.impD){ swing.impD=d; swing.imp=m; swing.tImpR=t; capture(ev,'impact',t,m,true); }
        swing.peak=Math.max(swing.peak,m.speed); swing.samples.push([t,m.speed]);
        if(d>swing.dmax*(P?0.35:0.45) || t-swing.tImp>900) setPhase('through',t,ev);
        break;
      }
      case 'through': {
        const m=measure();
        if(d>swing.dmax*(P?0.55:0.72)) capture(ev,'through',t,m);
        const settle=P?0.12*T:0.5*T;
        if((speedPx<settle && t-phaseT>120) || t-swing.tImp>1900){
          if(!swing.cap.through) capture(ev,'through',(phaseT+t)/2,m);
          capture(ev,'finish',t,m);
          count++;
          const rep=report(swing,m);
          setPhase('finish',t,ev);
          ev.push({type:'swing',t,report:rep});
          swing=null;
        }
        break;
      }
    }
    return {phase, feet:feetIn(), live:(A||phase==='finish')?measure():null, events:ev, dNorm:T?d/T:0,
            dbg:{vis:Math.min(S.lSh.v,S.rSh.v,S.lHip.v,S.rHip.v,S.lWr.v,S.rWr.v), torso, still, speed:speedPx/(torso||1)}};
  }

  function status(v,r){
    if(v>=r[0]&&v<=r[1]) return 'good';
    const span=Math.max(1e-6,r[1]-r[0]), off=v<r[0]?r[0]-v:v-r[1];
    return off<=span*0.25+1e-9?'warn':'bad';
  }
  function report(sw,fin){
    const tI=sw.tImpR||sw.tImp;
    // pipeline calibration (measured on the synthetic golfer): the takeaway is seen ~35 ms after
    // it begins and the filtered strike lands ~15 ms late — put both back
    const back=(sw.tTop-sw.start)/1000+0.035, down=Math.max(0.05,(tI-sw.tTop)/1000-0.015), ratio=back/down;
    const tg=mode.t, checks={};
    const add=(k,v,r)=>{ checks[k]={v, r, st:status(v,r)}; };
    add('tempo',ratio,tg.tempo);
    // release: how long before the strike the hands stopped speeding up (the club takes over)
    let pk=0, tPk=tI; sw.samples.forEach(([t,v])=>{ if(t<=tI && v>pk){ pk=v; tPk=t; } });
    const releaseMs=Math.round(tI-tPk);
    if(mode.type==='putt'){
      add('head',sw.headMax,tg.head); add('sway',sw.swayMax,tg.sway);
      add('rock',sw.top.rock,tg.rock); add('wrist',Math.abs(sw.imp.leadArm-sw.addr.leadArm),tg.wrist);
    } else {
      add('shoulder',sw.top.shoulder,tg.shoulder); add('hip',sw.top.hip,tg.hip);
      add('leadArm',sw.top.leadArm,tg.leadArm); add('head',sw.headMax,tg.head);
      add('wTop',sw.top.weight,tg.wTop); add('wImp',sw.imp.weight,tg.wImp);
      add('tilt',sw.imp.tilt,tg.tilt); add('wFin',fin.weight,tg.wFin);
    }
    const pts={good:1,warn:.6,bad:.2}, ks=Object.keys(checks);
    const score=Math.round(ks.reduce((s,k)=>s+pts[checks[k].st],0)/ks.length*100);
    const ph=Object.assign({}, sw.ph, {top:sw.top, impact:sw.imp, finish:fin});
    return { n:count, mode:modeName, type:mode.type, handed:hand,
      tempo:{back,down,ratio}, peakSpeed:sw.peak, releaseMs, headMax:sw.headMax, swayMax:sw.swayMax,
      strokeCm: sw.dmax*SHOULDER_CM/Math.max(20,A?A.shW:150),
      ph, checks, score };
  }

  return {
    update,
    setMode(n){ modeName=modeOf(n); mode=MODES[modeName]; swing=null; A=null; if(phase!=='idle') phase='ready'; },
    setHanded(h){ hand=h==='L'?'L':'R'; swing=null; A=null; if(phase!=='idle') phase='ready'; },
    get phase(){ return phase; }, get mode(){ return modeName; }, get handed(){ return hand; },
    get address(){ return A; }, get count(){ return count; },
    reset(){ S=null; lastT=null; torso=null; phase='idle'; A=null; swing=null; stillSince=null; }
  };
}

/* ============================================================== DEMO GOLFER
   A synthetic golfer for when there is no camera — and for automated checks.
   1280×720 frame, face-on, cycles through four swing personalities so the
   coaching changes from swing to swing. */
const DW=1280, DH=720;
const VARIANTS=[
  {back:.84,down:.28,turn:1,   head:0, shift:1,   arm:0,  tilt:1,  rel:'on'  },
  {back:.52,down:.27,turn:.95, head:0, shift:1,   arm:0,  tilt:1,  rel:'on'  },
  {back:.80,down:.28,turn:1,   head:34,shift:.15, arm:0,  tilt:.1, rel:'late'},
  {back:.78,down:.27,turn:.62, head:0, shift:.9,  arm:60, tilt:.8, rel:'cast'},
];
const sstep=p=>{ p=clamp(p,0,1); return p*p*(3-2*p); };
const lerp=(a,b,p)=>a+(b-a)*p;
function ik(s,h,a,b,sg){
  const dx=h.x-s.x, dy=h.y-s.y, d=Math.min(Math.hypot(dx,dy),a+b-.5), base=Math.atan2(dy,dx);
  const al=Math.acos(clamp((a*a+d*d-b*b)/(2*a*d),-1,1)), ang=base+al*sg;
  return {x:s.x+Math.cos(ang)*a, y:s.y+Math.sin(ang)*a};
}
function demoTimeline(type,v){
  const P=type==='putt';
  const back=P?.62:v.back, down=P?.31:v.down, thr=P?.36:.24;
  return {addr:1.7, back, down, thr, hold:2.2, total:1.7+back+down+thr+2.2};
}
function demoPose(t,type,vi,handed){
  const v=VARIANTS[vi%VARIANTS.length], P=type==='putt', tl=demoTimeline(type,v);
  const cx=DW/2, shY=262, hipY=430, ankY=650, R0=P?205:200;
  let phi, rad, sT, hT, shift, head=0, arm=0, lean=0;
  const tb=t-tl.addr, td=tb-tl.back, tt=td-tl.down;
  const top=P?112:238, fin=P?64:-58;
  if(tb<0){ phi=90; rad=R0; sT=0; hT=0; shift=0; }
  else if(td<0){ const p=sstep(tb/tl.back);
    phi=lerp(90,top,p); rad=lerp(R0,P?R0:196,p); lean=(P?0:10)*p;
    sT=(P?0:88*v.turn)*p; hT=(P?0:44*v.turn)*p; shift=(P?0:-10)*p; head=v.head*p*(P?.1:1); arm=v.arm*p; }
  else if(tt<0){ const x=td/tl.down;
    // hand-speed profile: peaks a beat before impact, at impact (late), or early (cast)
    let q = v.rel==='late' ? x*x : v.rel==='cast' ? sstep(x) : (1-Math.cos(Math.PI*x/1.4))/(1-Math.cos(Math.PI/1.4));
    phi=lerp(top,90,q); rad=lerp(P?R0:196,R0+(P?0:6),q); lean=lerp(P?0:10,P?0:52*v.tilt,q);
    sT=lerp(P?0:88*v.turn,P?0:8,q); hT=lerp(P?0:44*v.turn,P?0:30,q);
    shift=lerp(P?0:-10,P?0:30*v.shift,q); head=lerp(v.head*(P?.1:1),v.head*.6,q); arm=lerp(v.arm,0,q); }
  else { const x=clamp(tt/tl.thr,0,1), r=x<.7?x/.7*.82:.82+.18*sstep((x-.7)/.3);   // hands keep moving through the ball
    phi=lerp(90,fin,r); rad=lerp(R0+(P?0:6),P?R0:150,r); lean=lerp(P?0:52*v.tilt,0,r);
    sT=lerp(P?0:8,P?0:100,r); hT=lerp(P?0:30,P?0:76,r);
    shift=lerp(P?0:30*v.shift,P?0:46*Math.max(.6,v.shift),r); head=v.head*.6*(1-r); }
  if(P){ sT=0; hT=0; shift=0; }
  const dir=handed==='L'?-1:1, X=x=>cx+(x-cx)*dir;
  // slimmer build: shoulders ≈ ¼ of standing height, hips narrower again
  const shHW=54*Math.cos(sT/DEG)+3, hipHW=36*Math.cos(hT/DEG)+2;
  const shC={x:cx+shift*.55-lean, y:shY+(P?18:0)}, rock=P?(phi-90)*.9:0;
  const lS={x:shC.x+shHW,y:shC.y-rock}, tS={x:shC.x-shHW,y:shC.y+rock};
  const hand={x:shC.x+Math.cos(phi/DEG)*rad, y:shC.y+Math.sin(phi/DEG)*rad};
  const lE=ik(lS,hand,101-arm*.5,101-arm*.5,-1), tE=ik(tS,hand,100,100,1);
  const hipC={x:cx+shift,y:hipY}, lH={x:hipC.x+hipHW,y:hipY}, tH={x:hipC.x-hipHW,y:hipY};
  const lA={x:cx+60,y:ankY}, tA={x:cx-60,y:ankY};
  const lK={x:(lH.x+lA.x)/2+6,y:(hipY+ankY)/2}, tK={x:(tH.x+tA.x)/2-6,y:(hipY+ankY)/2};
  const nose={x:cx+head+shift*.15, y:196+(P?26:0)};
  const out=new Array(33), set=(i,p)=>{ out[i]={x:X(p.x),y:p.y,v:1}; };
  set(0,nose);
  for(let i=1;i<=10;i++) set(i,{x:nose.x+(i%2?1:-1)*(6+i), y:nose.y-10+(i>8?26:0)});
  set(11,lS); set(12,tS); set(13,lE); set(14,tE);
  set(15,{x:hand.x+3,y:hand.y}); set(16,{x:hand.x-3,y:hand.y+4});
  for(let k=17;k<=22;k++) set(k,{x:hand.x,y:hand.y+6});
  set(23,lH); set(24,tH); set(25,lK); set(26,tK); set(27,lA); set(28,tA);
  set(29,{x:lA.x-8,y:ankY+12}); set(30,{x:tA.x+8,y:ankY+12});
  set(31,{x:lA.x+18,y:ankY+14}); set(32,{x:tA.x-18,y:ankY+14});
  if(handed==='L') [[11,12],[13,14],[15,16],[23,24],[25,26],[27,28],[29,30],[31,32]]
    .forEach(([a,b])=>{ const tmp=out[a]; out[a]=out[b]; out[b]=tmp; });
  return out;
}

/* ================================================================== AUDIO */
let ac=null, noiseBuf=null;
function audio(){
  try{
    if(!ac){
      ac=new (window.AudioContext||window.webkitAudioContext)();
      noiseBuf=ac.createBuffer(1, ac.sampleRate*1.2, ac.sampleRate);
      const d=noiseBuf.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1;
    }
    if(ac.state==='suspended') ac.resume();
  }catch(e){ ac=null; }
  return ac;
}
function env(g,t,a,peak,dec){ g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(peak,t+a); g.gain.exponentialRampToValueAtTime(.0001,t+a+dec); }
function noise(t,dur,f,q,peak){
  const a=audio(); if(!a) return null;
  const s=a.createBufferSource(); s.buffer=noiseBuf;
  const bp=a.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=f; bp.Q.value=q;
  const g=a.createGain(); env(g,t,.004,peak,dur);
  s.connect(bp); bp.connect(g); g.connect(a.destination); s.start(t); s.stop(t+dur+.05);
  return bp;
}
function tone(t,f0,f1,dur,peak,type){
  const a=audio(); if(!a) return;
  const o=a.createOscillator(); o.type=type||'sine';
  o.frequency.setValueAtTime(f0,t); o.frequency.exponentialRampToValueAtTime(Math.max(20,f1),t+dur);
  const g=a.createGain(); env(g,t,.006,peak,dur);
  o.connect(g); g.connect(a.destination); o.start(t); o.stop(t+dur+.05);
}
const SND={
  // the ball screw carrying the tungsten weight: fine ticks over a rising whir
  motor(steps,up){ const a=audio(); if(!a) return; const t=a.currentTime+.02, dur=Math.max(.35,steps*.16);
    tone(t,up?200:120,up?115:210,dur,.03,'sawtooth');
    const n=Math.max(4,steps*5); for(let i=0;i<n;i++) tone(t+i*dur/n,2600,2400,.012,.025,'square');
    tone(t+dur+.02,1400,1400,.05,.045); },
  // the haptic pulse at impact, rendered as sound — heavier modes hit lower and longer
  impact(m){ const a=audio(); if(!a) return; const t=a.currentTime+.005;
    noise(t,.05,m.snd.hz,1.4,.5); tone(t,170,55,.1+m.snd.body*.35,.22+m.snd.body*.45); },
  whoosh(dur){ const a=audio(); if(!a) return; const t=a.currentTime+.005, bp=noise(t,dur,500,.9,.13);
    if(bp){ bp.frequency.setValueAtTime(450,t); bp.frequency.exponentialRampToValueAtTime(2600,t+dur); } },
  // the floor laser locking on at address
  lock(){ const a=audio(); if(!a) return; const t=a.currentTime+.01; tone(t,880,880,.06,.04); tone(t+.08,1320,1320,.09,.04); },
};

/* ================================================================== VOICE */
let voiceOn=false, voicePick=null;   // spoken coaching off — the line still shows on screen
function pickVoice(){
  try{
    const vs=speechSynthesis.getVoices();
    const pref=['Samantha','Karen','Moira','Serena','Google US English'];
    voicePick = pref.map(n=>vs.find(v=>v.name.indexOf(n)===0)).find(Boolean)
             || vs.find(v=>/^en(-|_)?(US|GB|AU)/i.test(v.lang)) || null;
  }catch(e){}
}
if('speechSynthesis' in window){ pickVoice(); speechSynthesis.onvoiceschanged=pickVoice; }
function say(text){
  if(!voiceOn || !('speechSynthesis' in window) || !text) return;
  try{
    speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance(text);
    u.lang='en-US'; if(voicePick) u.voice=voicePick; u.rate=.98; u.pitch=1;
    speechSynthesis.speak(u);
  }catch(e){}
}
// iOS only lets speech start from a tap — prime it inside the START handler
function primeVoice(){
  try{ if('speechSynthesis' in window){ const u=new SpeechSynthesisUtterance(' '); u.volume=0; speechSynthesis.speak(u); } }catch(e){}
}

/* ============================================================== COACH COPY
   One short line per swing, in the app's own voice. The same line is spoken
   and shown in the session title, so a glance and an ear get the same cue. */
/* One short line per swing, never the same twice running. It reads the swing's
   speed (peak hand speed, against the swing before) and its posture (the worst
   check, or the best one when everything held), and says one thing. */
let _lastLines=[];
const pickLine=(arr,seed)=>{ const free=arr.filter(t=>!_lastLines.includes(t)); const pool=free.length?free:arr; return pool[seed%pool.length]; };
function coachLine(rep){
  const c=rep.checks, P=rep.type==='putt', Ls=rep.handed==='R'?'left':'right', Rs=rep.handed==='R'?'right':'left';
  const prev=L.swings.length?L.swings[L.swings.length-1]:null;
  const v=rep.peakSpeed||0, dv=prev&&prev.type===rep.type?v-(prev.peakSpeed||0):0;
  const seed=(rep.n||0)*7+Math.round(v*10);
  const order = P ? ['head','sway','tempo','wrist','rock'] : ['tempo','head','wImp','shoulder','leadArm','wFin','hip','tilt','wTop'];
  let pick=null;
  for(const lvl of ['bad','warn']){ for(const k of order){ if(c[k] && c[k].st===lvl){ pick=k; break; } } if(pick) break; }
  const lo=pick && c[pick].v<c[pick].r[0], ratio=rep.tempo.ratio.toFixed(1);
  const V={
    good: P ? ['Smooth stroke. Same pace again.','That one rolled true — repeat it.','Quiet head, even pace. Again.']
            : [`That’s the one — ${ratio} to 1.`,'Clean from address to finish.','Balanced, full, on time. Again.','Good swing. Copy that rhythm.',`Smooth — ${v.toFixed(1)} m/s and in control.`],
    tempo: lo ? ['Slower back. Let the top breathe.','Take the club back slower.',`Quick back — ${ratio} to 1. Ease it.`]
              : ['Don’t hang at the top — go.','Swing through without the pause.',`${ratio} to 1 — start down sooner.`],
    head: P ? ['Head still until the putt is gone.','Eyes down — keep the head quiet.'] : ['Keep your head still through the ball.','Head drifted — stay centred.','Quiet head. Let the body turn under it.'],
    sway: ['Quiet the knees. Rock from the shoulders.','Less body — let the shoulders rock.'],
    rock: lo ? ['A longer stroke — rock the shoulders more.','Bigger shoulder rock.'] : ['Shorter back. Match it to the distance.','Trim the backstroke.'],
    wrist: ['Wrists out of it — arms and putter as one.','No flick. Hold the wrist angle.'],
    shoulder: lo ? [`Turn your ${Ls} shoulder under your chin.`,'A fuller turn — the shoulders stopped short.','Turn more. Back to the target.'] : ['Stop the backswing a touch shorter.','Shorter turn — stay in control.'],
    hip: lo ? ['Let the hips turn with you.','Free the hips on the way back.'] : [`Brace the ${Rs} knee — the hips over-turned.`,'Less hip turn. Resist with the knee.'],
    leadArm: [`Keep the ${Ls} arm long at the top.`,`Wide arc — straighter ${Ls} arm.`],
    wTop: lo ? [`You slid ${Rs}. Turn in place.`,'Turn, don’t sway.'] : [`Load your ${Rs} side on the way back.`,`Feel the weight into your ${Rs} heel.`],
    wImp: [`Drive onto your ${Ls} side through impact.`,'Weight stayed back — shift forward.',`Get to your ${Ls} foot at impact.`],
    tilt: lo ? ['Stay behind the ball at impact.','Upper body raced ahead — stay back.'] : ['Hanging back — stack over the ball.','Chest over the ball at impact.'],
    wFin: [`Hold the finish on your ${Ls} foot.`,'Finish tall, weight forward.'],
  };
  let text=pickLine(V[pick||'good'], seed);
  // speed, said only when it moved — one clause, before the posture note
  if(!P && prev && Math.abs(dv)>=0.6) text = `${dv>0?'Faster':'Slower'} hands (${dv>0?'+':'−'}${Math.abs(dv).toFixed(1)} m/s). ` + text;
  _lastLines=[..._lastLines.slice(-2), text.replace(/^.*?m\/s\)\. /,'')];
  return { key:pick||'good', level:pick?c[pick].st:'good', text };
}
// the read under the headline: speed and tempo, then the one posture point — two short sentences
function swingDetail(rep, prev){
  const c=rep.checks, P=rep.type==='putt';
  const v=rep.peakSpeed||0, dv=prev?v-(prev.peakSpeed||0):null;
  const sp = P ? `Stroke ${rep.tempo.ratio.toFixed(1)}:1, ${Math.round(rep.strokeCm||0)} cm back.`
               : `Hands ${v.toFixed(1)} m/s${dv==null?'':Math.abs(dv)<0.2?', same as last':`, ${dv>0?'+':'−'}${Math.abs(dv).toFixed(1)} vs last`} · tempo ${rep.tempo.ratio.toFixed(1)}:1.`;
  const NM={tempo:'tempo',shoulder:'shoulder turn',hip:'hip turn',leadArm:'lead arm',head:'head',wTop:'weight at the top',wImp:'weight at impact',tilt:'spine tilt',wFin:'finish',sway:'sway',rock:'shoulder rock',wrist:'wrists'};
  const rank={bad:0,warn:1,good:2}, ks=Object.keys(c).filter(k=>k!=='tempo');
  const all=Object.keys(c), worst=all.slice().sort((a,b)=>rank[c[a].st]-rank[c[b].st]||(a==='tempo'?1:-1))[0], best=ks.find(k=>c[k].st==='good');
  const fmt=(k)=>{ const x=c[k].v; return k==='tempo'?`${x.toFixed(1)}:1`:k==='head'||k==='sway'?`${x.toFixed(1)} cm`:/^w/.test(k)&&k!=='wrist'?`${Math.round(x)}%`:`${Math.round(x)}°`; };
  const po = !worst ? '' : c[worst].st==='good'
    ? `Every checkpoint held — ${NM[best]} ${fmt(best)}.`
    : worst==='tempo' ? `Posture held${best?` — ${NM[best]} ${fmt(best)}`:''}; the rhythm is the one to fix.`
    : `${NM[best]?NM[best][0].toUpperCase()+NM[best].slice(1)+' was fine; ':''}${NM[worst]} ${fmt(worst)} is the one to fix.`;
  return (sp+' '+po).trim();
}

/* =========================================================== MODEL + CAMERA */
let landmarker=null, segmenter=null, loadP=null, segP=null;
function loadModel(){
  if(landmarker) return Promise.resolve(landmarker);
  if(loadP) return loadP;
  loadP = import(MP_BASE+'/vision_bundle.mjs').then(vision=>
    vision.FilesetResolver.forVisionTasks(MP_BASE+'/wasm').then(fileset=>{
      Live._vision={vision,fileset};
      const tries=[]; MODEL_URLS.forEach(u=>['GPU','CPU'].forEach(d=>tries.push([u,d])));
      let err=null;
      const next=i=>i>=tries.length ? Promise.reject(err||new Error('model'))
        : vision.PoseLandmarker.createFromOptions(fileset,{
            baseOptions:{modelAssetPath:tries[i][0], delegate:tries[i][1]},
            runningMode:'VIDEO', numPoses:1,
            minPoseDetectionConfidence:.5, minPosePresenceConfidence:.5, minTrackingConfidence:.5
          }).then(l=>{ Live._modelUrl=tries[i][0]; Live._delegate=tries[i][1]; return l; }).catch(e=>{ err=e; return next(i+1); });
      return next(0);
    })).then(l=>{
      // the first GPU inference compiles shaders (~3 s on a laptop) — pay it during the
      // count-in on a blank frame, so the camera window never freezes when it opens
      try{ const w=document.createElement('canvas'); w.width=w.height=64; w.getContext('2d').fillRect(0,0,64,64);
        const t0=performance.now(); l.detectForVideo(w, t0); Live._warmMs=Math.round(performance.now()-t0); }catch(e){}
      landmarker=l; return l; }).catch(e=>{ loadP=null; throw e; });
  return loadP;
}
// a second, still-image instance that only cuts the golfer's silhouette out of the
// captured phase frames — run between swings, never inside the live loop
function loadSegmenter(){
  if(segmenter) return Promise.resolve(segmenter);
  if(segP) return segP;
  const V=Live._vision; if(!V) return Promise.reject(new Error('no vision'));
  segP = V.vision.PoseLandmarker.createFromOptions(V.fileset,{
      baseOptions:{modelAssetPath:Live._modelUrl||MODEL_URLS[1], delegate:'CPU'},
      runningMode:'IMAGE', numPoses:1, outputSegmentationMasks:true })
    .then(s=>{ segmenter=s; return s; }).catch(e=>{ segP=null; throw e; });
  return segP;
}

/* ================================================================== SESSION */
const S0 = () => ({
  on:false, source:null, mode:'Mid Iron', handed:'R', sets:10, first:false,
  engine:null, stream:null, raf:0, lastVT:-1, fw:DW, fh:DH,
  swings:[], frames:[], framing:null, trail:[], flashes:[], laser:0,
  demo:{start:0, i:0}, lastLm:null, pending:{}, curFrames:null,
  zs:null, cam:null, stand:null, titleHTML:'', facing:'user',
  log:null, t0:0, fps:0, fpsN:0, fpsT:0, dbgT:0, lastR:null
});
let lastLog=null;
let L=S0();

const RING=26, ring=[]; let ringI=0;
const CW=205, CH=292;                       // capture canvas: half of the 410×583 dot frame
for(let i=0;i<RING;i++){ const c=document.createElement('canvas'); c.width=CW; c.height=CH; ring.push({c,t:-1,lm:null}); }
const demoCv=document.createElement('canvas'); demoCv.width=DW; demoCv.height=DH;

function begin(cfg){
  end(false);
  L=S0();
  L.on=true; L.mode=modeOf(cfg.mode); L.sets=cfg.sets||10; L.first=!!cfg.first; L.mission=cfg.mission||null; L.forceDemo=!!cfg.demo; L.ratio=cfg.ratio||0;
  L.engine=createEngine(L.mode, L.handed);
  L.t0=performance.now();
  L.log={ app:'orvia-live', v:1, started:new Date().toISOString(), ua:navigator.userAgent,
    screen:[screen.width,screen.height,window.devicePixelRatio||1], mission:cfg.mission?{title:cfg.mission.title,mode:cfg.mission.mode}:null,
    handed:L.handed, modes:[[0,L.mode]], source:null, model:null, video:null, keys:LOG_KEYS, frames:[], events:[], swings:[] };
  L.zs=document.querySelector('#zs .zs');
  L.titleHTML=(L.zs&&L.zs.querySelector('.zs-title')||{}).innerHTML||'';
  audio(); primeVoice();
  loadModel().catch(()=>{});            // warm the model during the count-in
  mountReadouts(); mountStand(); syncStandLayout();
  window.addEventListener('resize', syncStandLayout);
}

/* the session clock hands over to the camera window — this is where the feed starts */
function attachCam(){
  if(!L.on || !L.zs) return;
  const win=L.zs.querySelector('.zc-inner'); if(!win) return;
  win.classList.add('is-live');
  win.insertAdjacentHTML('afterbegin', `<video class="zc-video" playsinline muted autoplay></video>`);
  win.insertAdjacentHTML('beforeend', `<canvas class="zc-canvas" aria-hidden="true"></canvas>
    <div class="zc-modes" role="radiogroup" aria-label="Balance mode">${MODE_ORDER.map(n=>
      `<button type="button" role="radio" data-mode="${n}" aria-checked="${n===L.mode}">${MODES[n].short}</button>`).join('')}</div>
    <div class="zc-note" aria-live="polite"></div>
    <pre class="zc-debug" hidden></pre>
    <button type="button" class="zc-log" hidden>Export log</button>
    <div class="zc-camcard" hidden role="alertdialog" aria-live="assertive"><b></b><p></p><button type="button">Keep the demo</button></div>
    <button type="button" class="zc-camon" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7.5h3l1.6-2h8.8l1.6 2h3v11H3z"/><circle cx="12" cy="13" r="3.6"/></svg><span>Turn on camera</span></button>`);
  win.querySelectorAll('.zc-modes button').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode,true)));
  win.querySelector('.zc-log').addEventListener('click', exportLog);
  win.querySelector('.zc-camon').addEventListener('click', retryCamera);
  win.querySelector('.zc-camcard button').addEventListener('click', ()=>{ L.cam.card.hidden=true; });
  wireDebugTap(win.querySelector('.zc-chip'));
  L.cam={win, video:win.querySelector('.zc-video'), cv:win.querySelector('.zc-canvas'), dbg:win.querySelector('.zc-debug'), logBtn:win.querySelector('.zc-log'),
         chip:win.parentElement.querySelector('.zc-chip')||win.querySelector('.zc-chip'),
         hint:win.querySelector('.zc-hint'), note:win.querySelector('.zc-note'), camon:win.querySelector('.zc-camon'), card:win.querySelector('.zc-camcard')};
  startSource();
}

function startSource(){
  const wantCam = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && window.isSecureContext;
  if(L.cam&&L.cam.camon) L.cam.camon.hidden=true;
  setChip('Starting camera');
  if(L.forceDemo){ startDemo('Demo'); return; }
  if(!wantCam){ const w=window.isSecureContext?'No camera on this device':'Camera needs an https address'; startDemo(w); if(L.asked) camCard(w,false); return; }
  const gum=navigator.mediaDevices.getUserMedia({audio:false, video:Object.assign({facingMode:L.facing, width:{ideal:1280}, height:{ideal:L.ratio?Math.round(1280/L.ratio):720}, frameRate:{ideal:60,max:60}}, L.ratio?{aspectRatio:{ideal:L.ratio}}:{})});
  let timedOut=false;
  const tmo=new Promise((_,rej)=>setTimeout(()=>{ timedOut=true; rej(Object.assign(new Error('timeout'),{name:'TimeoutError'})); }, 9000));
  gum.then(s=>{ if(timedOut) s.getTracks().forEach(t=>t.stop()); }).catch(()=>{});
  Promise.race([gum,tmo])
    .then(s=>{
      if(!L.on){ s.getTracks().forEach(t=>t.stop()); return; }
      L.stream=s;
      // the picture shows the moment the camera answers — tracking joins in as soon as the model is ready
      [L.cam&&L.cam.video, L.stand&&L.stand.video].forEach(v=>{ if(v){ v.srcObject=s; v.classList.toggle('mirror',L.facing==='user'); v.classList.add('on','now'); v.play().catch(()=>{}); } });
      setChip(landmarker?'Looking for you':'Loading tracker');
      return loadModel().then(()=>{
        if(!L.on) return;
        const v=L.cam.video;
        L.fw=v.videoWidth||1280; L.fh=v.videoHeight||720;
        L.source='camera';
        L.log.source='camera'; L.log.model={url:Live._modelUrl, delegate:Live._delegate, ver:MP_VER}; L.log.video=[L.fw,L.fh];
        [L.cam.video, L.stand&&L.stand.video].forEach(x=>x&&x.classList.add('on'));
        setChip('Looking for you'); say('Tracking. Take your address.');
        L.raf=requestAnimationFrame(loopCam);
      });
    })
    .catch(e=>{
      if(L.stream){ L.stream.getTracks().forEach(t=>t.stop()); L.stream=null; }
      const n=e&&e.name;
      let framed=false; try{ framed=window.top!==window.self; }catch(_){ framed=true; }
      const why = n==='NotAllowedError'||n==='SecurityError' ? (framed ? 'This preview can’t open the camera — use the site link' : 'Camera blocked — allow it in the browser settings')
                : n==='NotFoundError' ? 'No camera found' : n==='TimeoutError' ? 'The camera didn’t answer' : 'Tracker offline — check the connection';
      startDemo(why);
      if(L.asked) camCard(why, framed);
    });
}
const CARD_BODY={
  preview:'Claude’s preview window doesn’t give pages the camera. Open the site link (https) in Safari or Chrome on the phone or iPad.',
  blocked:'Allow camera access for this site in the browser’s settings, then tap Turn on camera again.',
  none:'This device has no camera the browser can use.',
  slow:'The browser never answered the camera request. Reload the page and try again.',
  offline:'The camera is fine, but the motion tracker couldn’t load. Check the internet connection.'
};
function camCard(why, framed){
  if(!L.cam||!L.cam.card) return;
  const k = /preview/.test(why)||(framed&&/blocked/i.test(why)) ? 'preview' : /blocked/i.test(why) ? 'blocked'
          : /No camera/.test(why) ? 'none' : /answer/.test(why) ? 'slow' : /https/.test(why) ? 'preview' : 'offline';
  L.cam.card.querySelector('b').textContent = k==='offline' ? 'Tracker didn’t load' : 'Camera isn’t available here';
  L.cam.card.querySelector('p').textContent = CARD_BODY[k];
  L.cam.card.hidden=false;
}
// the on-screen camera switch — runs from the tap, so the browser can ask for permission
function retryCamera(){
  if(!L.on) return;
  L.asked=true; if(L.cam&&L.cam.card) L.cam.card.hidden=true;
  cancelAnimationFrame(L.raf); L.raf=0; L.forceDemo=false; L.demo=null; L.source='starting';
  // demo swings don't count once a real camera takes over
  L.engine=createEngine(L.mode, L.handed); L.swings=[]; L.trail=[]; L.flashes=[];
  const se=document.querySelector('#zsSets'); if(se) se.innerHTML=`0<span class="zs-sets-tot"> / ${L.sets}</span>`;
  if(L.cam) L.cam.win.classList.remove('is-demo');
  if(L.stand) L.stand.el.classList.remove('is-demo');
  startSource();
}
function startDemo(reason){
  if(!L.on) return;
  L.source='demo'; L.fw=DW; L.fh=DH; L.demo={start:performance.now(), i:0}; L.demoReason=reason;
  if(L.log){ L.log.source='demo:'+reason; L.log.video=[DW,DH]; }
  if(L.cam) L.cam.win.classList.add('is-demo');
  if(L.stand) L.stand.el.classList.add('is-demo');
  setChip('Demo golfer');
  if(L.cam&&L.cam.camon) L.cam.camon.hidden=false;   // a camera switch is always on screen while the demo plays
  if(reason!=='Demo') note(`${reason}`, 4200);
  L.raf=requestAnimationFrame(loopDemo);
}

function loopCam(){
  if(!L.on || L.source!=='camera') return;
  L.raf=requestAnimationFrame(loopCam);
  const v=L.cam.video;
  if(v.readyState<2 || v.currentTime===L.lastVT) return;
  L.lastVT=v.currentTime; L.fw=v.videoWidth||L.fw; L.fh=v.videoHeight||L.fh;
  const now=performance.now(); let lm=null;
  try{
    const r=landmarker.detectForVideo(v, now), raw=r&&r.landmarks&&r.landmarks[0];
    if(raw){ const hasVis=raw.some(p=>p.visibility>0);
      lm=raw.map(p=>({x:p.x*L.fw, y:p.y*L.fh, v:hasVis?p.visibility:1})); }
  }catch(e){}
  frame(lm, now, v);
}
function loopDemo(){
  if(!L.on || L.source!=='demo') return;
  L.raf=requestAnimationFrame(loopDemo);
  const now=performance.now(), type=MODES[L.mode].type;
  // held while a swing read is open — the demo golfer waits, like a person reading would
  if(L.hold && L.lastDemoNow) L.demo.start+=now-L.lastDemoNow;
  L.lastDemoNow=now;
  let tl=demoTimeline(type, VARIANTS[L.demo.i%VARIANTS.length]), t=(now-L.demo.start)/1000;
  if(t>tl.total){ L.demo.i++; L.demo.start=now; t=0; }
  const lm=demoPose(t, type, L.demo.i, L.handed);
  paintDemoSource(lm);
  frame(lm, now, demoCv);
}

function frame(lm, now, src){
  const r=L.engine.update(lm, now);
  record(lm, now, r);
  if(lm) L.lastLm=lm;
  const ph=r.phase;
  if(lm && ph!=='idle'){
    if(L.engine.address && (!L.framing || ph==='address')) L.framing=framingFrom(lm);
    if(['address','takeaway','top','downswing','impact','through','finish'].includes(ph)) pushRing(src, lm, now);
    if(['takeaway','top','downswing','impact','through'].includes(ph)){
      L.trail.push({x:(lm[15].x+lm[16].x)/2, y:(lm[15].y+lm[16].y)/2, down:ph!=='takeaway'});
      if(L.trail.length>150) L.trail.shift();
    }
  }
  r.events.forEach(e=>onEvent(e, lm));
  if(!r.held){
    const want=L.engine.address||ph==='finish'?1:0; L.laser+=(want-L.laser)*.12;
    setChip(chipText(ph, lm));
    hintFor(ph, lm, r);
  }
  drawCam(lm, r);
  drawStand(lm, r);
  if(DEBUG) paintDebug(r, now);
}

function chipText(ph, lm){
  if(L.source==='demo') return ph==='idle'||ph==='ready'||ph==='address' ? 'Demo golfer' : 'Demo · '+phaseName(ph);
  if(!lm || ph==='idle') return 'Looking for you';
  if(ph==='ready') return 'Tracking';
  if(ph==='address') return 'Laser on';
  return phaseName(ph);
}
function phaseName(ph){
  const P=MODES[L.mode].type==='putt';
  return ({ready:'Ready', address:'Address', takeaway:P?'Backstroke':'Takeaway', top:P?'Transition':'Top',
           downswing:P?'Forward':'Downswing', impact:'Impact', through:'Through', finish:'Finish', idle:'Standby'})[ph]||ph;
}
let _hint='';
function hintFor(ph, lm, r){
  if(!L.cam || !L.cam.hint) return;
  const n=L.swings.length, more=n>0 && n<L.sets;
  const h = L.source==='demo' ? (L.demoReason==='Demo'?'Demo golfer — no camera in use':L.demoReason+' · demo golfer')
          : !lm||ph==='idle' ? 'Keep your whole body inside the frame'
          : (ph==='ready'||ph==='finish') && r && r.feet===false ? 'Step back until your feet are in the frame'
          : ph==='finish' ? (n>=L.sets ? 'Set complete' : `Swing ${n} done — set up again for swing ${n+1}`)
          : ph==='ready' ? (more ? `Address the ball for swing ${n+1} of ${L.sets}` : 'Hold your address for a beat — the laser locks on')
          : ph==='address' ? 'Swing when you’re ready'
          : '';
  if(h!==_hint){ _hint=h; L.cam.hint.textContent=h; L.cam.hint.classList.toggle('off',!h); }
}
let _chip='';
function setChip(t){
  if(t===_chip) return; _chip=t;
  [L.cam&&L.cam.chip, L.stand&&L.stand.chip].forEach(c=>{ if(c) c.innerHTML='<i></i>'+t; });
}
let _noteT=0;
function note(text, ms){
  [L.cam&&L.cam.note, L.stand&&L.stand.note].forEach(n=>{ if(!n) return; n.textContent=text; n.classList.add('show'); });
  clearTimeout(_noteT); _noteT=setTimeout(()=>[L.cam&&L.cam.note, L.stand&&L.stand.note].forEach(n=>n&&n.classList.remove('show')), ms||2200);
}

function onEvent(e, lm){
  if(L.log && e.type!=='swing') L.log.events.push([Math.round(e.t-L.t0), e.type, e.phase||'']);
  if(e.type==='phase'){
    if(e.phase==='address'){ emit('orvia:address', {n:L.swings.length, demo:L.source==='demo'}); if(L.swings.length<L.sets) hideSwingCard(); L.trail=[]; L.curFrames={}; SND.lock(); if(!L._saidLaser){ L._saidLaser=true; say('Laser on. Swing when ready.'); } }
    if(e.phase==='downswing') SND.whoosh(MODES[L.mode].type==='putt'?.25:.32);
    if(L.stand) L.stand.setPhase(e.phase);
  } else if(e.type==='capture'){
    grabFrame(e.phase, e.t);
  } else if(e.type==='impact'){
    SND.impact(MODES[L.mode]);
    if(lm) L.flashes.push({t:performance.now(), p:{x:(lm[15].x+lm[16].x)/2, y:(lm[15].y+lm[16].y)/2}});
    if(L.stand) L.stand.pulse();
  } else if(e.type==='swing'){
    onSwing(e.report);
  }
}

function onSwing(rep){
  rep.coach=coachLine(rep);
  if(L.log) L.log.swings.push(slimReport(rep));
  rep.frames=L.curFrames||{}; L.curFrames=null;
  L.swings.push(rep);
  const n=L.swings.length;
  // readouts: sets = swings, plus the last swing's tempo
  const setsEl=document.getElementById('zsSets');
  if(setsEl) setsEl.innerHTML=`${Math.min(n,999)}<span class="zs-sets-tot"> / ${L.sets}</span>`;
  const tEl=document.getElementById('zsTempo');
  if(tEl) tEl.innerHTML=`${rep.tempo.ratio.toFixed(1)}<span class="zs-sets-tot">:1</span>`;
  setTitle(rep.coach.text);
  if(!window.ORVIA_SWING_SHEET || rep.type==='putt') swingCard(rep, n);
  emit('orvia:swing', {rep, n, sets:L.sets, done:n>=L.sets});
  if(L.stand) L.stand.swing(rep);
  const done = n===L.sets;
  setTimeout(()=>say(done ? `${rep.coach.text} That’s the set — end the session for your report.` : rep.coach.text), 450);
  if(done){ const b=L.zs&&L.zs.querySelector('.zs-end'); if(b) b.textContent='End session — see your report';
    SND.lock(); try{ window.dispatchEvent(new CustomEvent('orvia:setdone',{detail:{swings:n}})); }catch(e){} }
  // cut the silhouettes out of this swing's frames while the golfer resets
  setTimeout(()=>refineFrames(rep), 700);
}

/* the instant read after every swing — sits in the camera window until the next address */
const CARD_LAB={tempo:'Tempo',shoulder:'Shoulder turn',hip:'Hip turn',leadArm:'Lead arm',head:'Head',wTop:'Weight · top',
  wImp:'Weight · impact',tilt:'Spine tilt',wFin:'Finish',sway:'Sway',rock:'Rock',wrist:'Wrist'};
function cardVal(k,v){
  if(k==='tempo') return v.toFixed(1)+':1';
  if(k==='head'||k==='sway') return v.toFixed(1)+' cm';
  if(/^w/.test(k)&&k!=='wrist') return Math.round(v)+'%';
  return Math.round(v)+'°';
}
let _cardT=0;
function swingCard(rep, n){
  if(!L.cam||!L.cam.win) return;
  let el=L.cam.win.querySelector('.zc-swing');
  if(!el){ L.cam.win.insertAdjacentHTML('beforeend','<div class="zc-swing" aria-live="polite"></div>'); el=L.cam.win.querySelector('.zc-swing'); }
  const rank={bad:0,warn:1,good:2}, c=rep.checks;
  const rest=Object.keys(c).filter(k=>k!=='tempo').sort((a,b)=>rank[c[a].st]-rank[c[b].st]).slice(0,2);
  const keys=(c.tempo?['tempo']:[]).concat(rest);
  const done=n>=L.sets;
  el.innerHTML=`<div class="zsw-head"><span class="zsw-n">${done?'Set complete':'Swing '+n+' of '+L.sets}</span><b class="zsw-score ${rep.score>=85?'good':rep.score>=65?'warn':'bad'}">${rep.score}</b></div>
    <div class="zsw-rows">${keys.map(k=>`<div class="zsw-row ${c[k].st}"><i></i><span>${CARD_LAB[k]||k}</span><b>${cardVal(k,c[k].v)}</b></div>`).join('')}</div>`;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(_cardT); _cardT=setTimeout(()=>el.classList.remove('show'), done?9000:5200);
}
function hideSwingCard(){ const el=L.cam&&L.cam.win&&L.cam.win.querySelector('.zc-swing'); if(el) el.classList.remove('show'); }

function setTitle(text){
  const t=L.zs&&L.zs.querySelector('.zs-title'); if(!t) return;
  t.classList.add('is-coach');
  t.classList.remove('swap'); void t.offsetWidth;
  t.textContent=text; t.classList.add('swap');
}

function setMode(name, user){
  name=modeOf(name); if(!L.on || name===L.mode) return;
  const prev=L.mode; L.mode=name; L.engine.setMode(name); L.trail=[]; L.curFrames=null;
  if(L.log) L.log.modes.push([Math.round(performance.now()-L.t0), name]);
  if(L.source==='demo') L.demo={start:performance.now(), i:0};
  document.querySelectorAll('.zc-modes button, .st-modes button').forEach(b=>b.setAttribute('aria-checked', String(b.dataset.mode===name)));
  if(L.stand) L.stand.setMode(name);
  if(user){
    const steps=Math.abs(MODE_ORDER.indexOf(name)-MODE_ORDER.indexOf(prev));
    SND.motor(steps, MODES[name].mm>MODES[prev].mm);
    say(MODES[name].say);
    note(`${name} · weight at ${MODES[name].mm} mm`, 2200);
  }
}

/* readouts: the "Sets" column counts real swings; a third column carries tempo */
function mountReadouts(){
  const set=L.zs&&L.zs.querySelector('#zsLive'); if(!set || set.querySelector('#zsTempo')) return;
  set.classList.add('has-tempo');
  set.insertAdjacentHTML('beforeend', `<div class="zs-live-div"></div>
    <div class="zs-live-col"><div class="zs-live-num" id="zsTempo">–</div><div class="zs-live-lab">Tempo</div></div>`);
  const sets=set.querySelector('#zsSets'); if(sets) sets.innerHTML=`0<span class="zs-sets-tot"> / ${L.sets}</span>`;
}

function end(save){
  if(!L.on) return null;
  L.on=false;
  cancelAnimationFrame(L.raf);
  if(L.log && L.log.frames.length){ L.log.ended=new Date().toISOString(); lastLog=L.log; if(DEBUG && save) setTimeout(exportLog, 300); }
  if(L.stream){ L.stream.getTracks().forEach(t=>t.stop()); L.stream=null; }
  try{ speechSynthesis.cancel(); }catch(e){}
  window.removeEventListener('resize', syncStandLayout);
  const z=document.getElementById('zs'); if(z){ z.classList.remove('stand-on'); const st=z.querySelector('.stand'); if(st) st.remove(); }
  _chip=''; _hint='';
  if(!save || !L.swings.length) return null;
  return buildRecord();
}

/* ========================================================== PHASE FRAMES
   Each swing keeps seven stills — the same seven the report plays back — drawn
   in the app's own halftone: an upright grid of near-black dots on a clear
   ground, figure normalised head-to-toe exactly like the original artwork, so
   the user's swing drops into the report without changing a pixel of layout. */
const FW=410, FH=583, HEAD_Y=31, TOE_Y=553;
function framingFrom(lm){
  const T=torsoOf(lm), hip=mid(lm[23],lm[24]);
  const top=lm[0].y-0.42*T, bottom=Math.max(lm[27].y,lm[28].y,lm[29].y,lm[30].y)+0.05*T;
  const k=(TOE_Y-HEAD_Y)/Math.max(10,bottom-top);
  return { k, sx:hip.x-(FW/2)/k, sy:top-HEAD_Y/k, sw:FW/k, sh:FH/k, torso:T };
}
function pushRing(src, lm, t){
  const F=L.framing||framingFrom(lm);
  const e=ring[ringI]; ringI=(ringI+1)%RING;
  const g=e.c.getContext('2d');
  g.clearRect(0,0,CW,CH);
  try{ g.drawImage(src, F.sx, F.sy, F.sw, F.sh, 0, 0, CW, CH); }catch(err){}
  e.t=t; e.F=F; e.lm=lm.map(p=>({x:(p.x-F.sx)*F.k, y:(p.y-F.sy)*F.k}));   // 410×583 frame coords
}
function grabFrame(phase, t){
  if(!L.curFrames) L.curFrames={};
  let best=null, bd=1e9;
  ring.forEach(e=>{ if(e.lm && Math.abs(e.t-t)<bd){ bd=Math.abs(e.t-t); best=e; } });
  if(!best || bd>420) return;
  const copy=document.createElement('canvas'); copy.width=CW; copy.height=CH;
  copy.getContext('2d').drawImage(best.c,0,0);
  const lm=best.lm, torsoF=best.F.torso*best.F.k;
  const fr={ src:copy, lm, torso:torsoF, url:null, dots:dotsFor(lm), hs:null };
  fr.hs={ shoulder:fr.dots[1], spine:fr.dots[7], wrist:fr.dots[6], pelvis:fr.dots[8] };
  fr.url=halftone(copy, capsuleMask(lm, torsoF));
  L.curFrames[phase]=fr;
}
/* the report's 14 joint dots, in its 200×284 viewBox, in the order the artwork uses:
   head, trail-sh, neck, lead-sh, trail-elb, lead-elb, hands, waist,
   trail-hip, lead-hip, trail-knee, lead-knee, trail-foot, lead-foot */
function dotsFor(lm){
  const R=L.handed==='R';
  const lead=i=>R?i:(i%2?i+1:i-1), trail=i=>R?(i%2?i+1:i-1):i;   // 11↔12 etc.
  const sx=200/FW, sy=284/FH, P=i=>[+(lm[i].x*sx).toFixed(1), +(lm[i].y*sy).toFixed(1)];
  const neck=[(lm[11].x+lm[12].x)/2*sx, (lm[11].y+lm[12].y)/2*sy];
  const hip=[(lm[23].x+lm[24].x)/2*sx, (lm[23].y+lm[24].y)/2*sy];
  const hands=[(lm[15].x+lm[16].x)/2*sx, (lm[15].y+lm[16].y)/2*sy];
  const waist=[neck[0]+(hip[0]-neck[0])*.72, neck[1]+(hip[1]-neck[1])*.72];
  const r=a=>[+a[0].toFixed(1), +a[1].toFixed(1)];
  return [P(0), P(trail(11)), r(neck), P(lead(11)), P(trail(13)), P(lead(13)), r(hands), r(waist),
          P(trail(23)), P(lead(23)), P(trail(25)), P(lead(25)), P(trail(27)), P(lead(27))];
}
function capsuleMask(lm, torso){
  const m=document.createElement('canvas'); m.width=CW; m.height=CH;
  const g=m.getContext('2d'), s=CW/FW;
  g.scale(s,s); g.fillStyle='#000';
  // a real camera frame is only masked like this until the segmenter's cut-out lands — keep it close to the body
  drawBody(g, lm, torso*(L.source==='demo'?1:1.04), ()=>{});
  return g.getImageData(0,0,CW,CH).data;   // alpha channel = coverage
}
function halftone(srcCv, maskData, maskIsFloat){
  const src=srcCv.getContext('2d').getImageData(0,0,CW,CH).data;
  const out=document.createElement('canvas'); out.width=FW; out.height=FH;
  const o=out.getContext('2d'); o.fillStyle='rgba(20,20,20,.94)';
  const pitch=6.4, rMax=2.85, demo=L.source==='demo';
  for(let y=pitch/2; y<FH; y+=pitch) for(let x=pitch/2; x<FW; x+=pitch){
    const sx=Math.min(CW-1,(x/2)|0), sy=Math.min(CH-1,(y/2)|0), k=sy*CW+sx;
    const cov = maskIsFloat ? maskData[k] : maskData[k*4+3]/255;
    if(cov<0.35) continue;
    const lum=(src[k*4]*.299+src[k*4+1]*.587+src[k*4+2]*.114)/255;
    const jit = demo ? .78+.22*(((Math.sin(x*12.9898+y*78.233)*43758.5453)%1+1)%1) : 1;
    const dark = (demo ? (0.5+0.5*(1-lum)) : (0.42+0.58*(1-lum)))*jit;
    const r=rMax*Math.sqrt(clamp(dark*Math.min(1,cov*1.4),0,1));
    if(r<1.05) continue;
    o.beginPath(); o.arc(x,y,r,0,Math.PI*2); o.fill();
  }
  return out.toDataURL('image/png');
}
/* swap the joint-capsule silhouette for the real one, frame by frame */
function refineFrames(rep){
  if(L.source!=='camera') return;
  const keys=Object.keys(rep.frames||{});
  if(!keys.length) return;
  loadSegmenter().then(seg=>{
    let i=0;
    const step=()=>{
      if(i>=keys.length) return;
      const fr=rep.frames[keys[i++]];
      try{
        const res=seg.detect(fr.src);
        const mask=res&&res.segmentationMasks&&res.segmentationMasks[0];
        if(mask){
          const f=mask.getAsFloat32Array();
          if(f && f.length===CW*CH) fr.url=halftone(fr.src, f, true);
          if(mask.close) mask.close();
        }
      }catch(e){}
      setTimeout(step, 30);
    };
    step();
  }).catch(()=>{});
}

/* ============================================================ DIAGNOSTICS
   For checking accuracy on the real device: a live panel of what the tracker sees,
   and a log of every frame's joints + every event, exported as one JSON file that
   tools/replay.js runs back through this same engine. */
function record(lm, now, r){
  L.fpsN++;
  if(now-L.fpsT>1000){ L.fps=Math.round(L.fpsN*1000/(now-L.fpsT)); L.fpsN=0; L.fpsT=now; }
  L.lastR=r;
  if(!L.log || L.log.frames.length>=6000) return;          // ~3 min at 30 fps
  const t=Math.round(now-L.t0);
  if(!lm){ L.log.frames.push([t]); return; }
  const row=[t];
  LOG_KEYS.forEach(i=>{ const p=lm[i]; row.push(Math.round(p.x*10)/10, Math.round(p.y*10)/10, Math.round((p.v==null?1:p.v)*100)/100); });
  L.log.frames.push(row);
}
function slimReport(rep){
  const r1=n=>Math.round(n*10)/10, ph={};
  Object.entries(rep.ph||{}).forEach(([k,m])=>{ if(m){ ph[k]={}; Object.entries(m).forEach(([q,v])=>ph[k][q]=r1(v)); } });
  const checks={}; Object.entries(rep.checks).forEach(([k,c])=>checks[k]={v:r1(c.v),r:c.r,st:c.st});
  return { n:rep.n, mode:rep.mode, type:rep.type, handed:rep.handed, score:rep.score,
    tempo:{back:r1(rep.tempo.back*100)/100, down:r1(rep.tempo.down*100)/100, ratio:r1(rep.tempo.ratio)},
    releaseMs:rep.releaseMs, peakSpeed:r1(rep.peakSpeed), headMax:r1(rep.headMax), swayMax:r1(rep.swayMax),
    checks, ph, coach:rep.coach&&rep.coach.text };
}
function exportLog(){
  const log=(L.on?L.log:lastLog)||lastLog; if(!log) return;
  const stamp=new Date().toISOString().replace(/[:T]/g,'-').slice(0,16);
  const name=`orvia-swing-log-${stamp}.json`;
  const blob=new Blob([JSON.stringify(log)],{type:'application/json'});
  try{
    const file=new File([blob],name,{type:'application/json'});
    if(navigator.canShare && navigator.canShare({files:[file]})){
      navigator.share({files:[file], title:'orvia swing log'}).catch(()=>download(blob,name)); return;
    }
  }catch(e){}
  download(blob,name);
}
function download(blob,name){
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name;
  document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },1500);
}
function setDebug(on){
  DEBUG=!!on;
  try{ localStorage.setItem('orviaDebug', DEBUG?'1':'0'); }catch(e){}
  [L.cam&&L.cam.dbg, L.cam&&L.cam.logBtn, L.stand&&L.stand.dbg].forEach(el=>{ if(el) el.hidden=!DEBUG; });
  note(DEBUG?'Diagnostics on — recording every frame':'Diagnostics off', 1800);
}
function wireDebugTap(el){
  if(!el) return; let taps=[];
  el.addEventListener('click',()=>{ const now=performance.now(); taps=taps.filter(t=>now-t<700); taps.push(now);
    if(taps.length>=3){ taps=[]; setDebug(!DEBUG); } });
}
function paintDebug(r, now){
  if(now-L.dbgT<200) return; L.dbgT=now;
  const m=r.live, d=r.dbg||{}, last=L.swings[L.swings.length-1];
  const f=(v,n=0)=>v==null||isNaN(v)?'–':(+v).toFixed(n);
  const lines=[
    `${L.source||'–'} ${L.source==='camera'?(Live._delegate||'')+' warm '+(Live._warmMs||0)+'ms ':''}${L.fw}×${L.fh} · ${L.fps} fps`,
    `phase ${r.phase}${r.held?' (held)':''} · vis ${f(d.vis,2)} · torso ${f(d.torso)}px`,
    `hands d/T ${f(r.dNorm,2)} · speed ${f(d.speed,2)}T/s${d.still?' · still':''}`,
    m?`sh ${f(m.shoulder)}° hip ${f(m.hip)}° w ${f(m.weight)}% tilt ${f(m.tilt)}°`:'no address yet',
    m?`head ${f(m.head,1)}cm arm ${f(m.leadArm)}° rock ${f(m.rock)}° v ${f(m.speed,1)}m/s`:'',
    last?`#${last.n} ${f(last.tempo.back,2)}/${f(last.tempo.down,2)}s = ${f(last.tempo.ratio,1)}:1 · rel ${last.releaseMs}ms · ${last.score}`:'no swing yet',
    `log ${L.log?L.log.frames.length:0} frames · ${L.swings.length} swings`
  ].filter(Boolean).join('\n');
  [L.cam&&L.cam.dbg, L.stand&&L.stand.dbg].forEach(el=>{ if(el){ el.hidden=false; el.textContent=lines; } });
  if(L.cam&&L.cam.logBtn) L.cam.logBtn.hidden=false;
}

/* ============================================================== DRAWING
   Phone window: the app's own camera language — pale lime bones, dark joints,
   the floor laser, and the hands' path. The stand view adds measurements. */
function fitCanvas(cv){
  const dpr=Math.min(2, window.devicePixelRatio||1), w=cv.clientWidth, h=cv.clientHeight;
  if(!w||!h) return null;
  if(cv.width!==Math.round(w*dpr)||cv.height!==Math.round(h*dpr)){ cv.width=Math.round(w*dpr); cv.height=Math.round(h*dpr); }
  const g=cv.getContext('2d'); g.setTransform(dpr,0,0,dpr,0,0); g.clearRect(0,0,w,h);
  return {g,w,h};
}
function mapper(w,h,cover){
  // phone window and stand view share the same mapping rules: the camera fills the
  // window (cover) and the front camera reads like a mirror; the demo is contained
  const s = cover ? Math.max(w/L.fw, h/L.fh) : Math.min(w/L.fw, h/L.fh)*0.98;
  const ox=(w-L.fw*s)/2, oy=(h-L.fh*s)/2 + (cover?0:h*.02);
  const mirror = L.source==='camera' && L.facing==='user';
  return {s, f:p=>{ const x=ox+p.x*s; return {x:mirror?w-x:x, y:oy+p.y*s, v:p.v==null?1:p.v}; }};
}
// skeleton = the system's joint-recognition token (--skel #D0FF00): crisp over a live feed
const C={ bone:'#D0FF00', joint:'#D0FF00', jointFill:'#07100b', laser:'#C6E74C', ink:'#EEF1E8', dim:'rgba(244,246,239,.55)' };

function drawFigure(g, P, torso, scale){
  // silhouette under the skeleton for the demo golfer, so it reads as a body
  if(L.source==='demo'){
    g.save(); drawBody(g, P, torso, k=>{ g.fillStyle = k==='arm' ? 'rgba(208,255,0,.07)' : 'rgba(208,255,0,.09)'; }); g.restore();
  }
  const seen=i=>!(P[i].v<0.35), bones=BONES.filter(([a,b])=>seen(a)&&seen(b));
  g.save(); g.lineCap='round';
  g.strokeStyle='rgba(2,6,3,.5)'; g.lineWidth=2.6*scale+3;
  bones.forEach(([a,b])=>{ g.beginPath(); g.moveTo(P[a].x,P[a].y); g.lineTo(P[b].x,P[b].y); g.stroke(); });
  g.strokeStyle=C.bone; g.globalAlpha=.95; g.lineWidth=2.4*scale;
  bones.forEach(([a,b])=>{ g.beginPath(); g.moveTo(P[a].x,P[a].y); g.lineTo(P[b].x,P[b].y); g.stroke(); });
  const sh=mid(P[11],P[12]);
  g.beginPath(); g.moveTo(sh.x,sh.y); g.lineTo(P[0].x,P[0].y+torso*.1); g.stroke();
  g.beginPath(); g.arc(P[0].x,P[0].y-torso*.03,torso*.15,0,Math.PI*2); g.stroke();
  g.globalAlpha=1;
  JOINTS.filter(seen).forEach(i=>{ g.beginPath(); g.arc(P[i].x,P[i].y,4.2*scale,0,Math.PI*2);
    g.fillStyle=C.jointFill; g.fill(); g.lineWidth=2*scale; g.strokeStyle=C.joint; g.stroke(); });
  g.restore();
}
function drawLaser(g, P, torso, scale){
  if(L.laser<.02 || P[27].v<0.35 || P[28].v<0.35) return;
  const bx=(P[27].x+P[28].x)/2, by=Math.max(P[27].y,P[28].y)+torso*.09, half=torso*1.7;
  g.save(); g.globalAlpha=L.laser;
  g.shadowColor='rgba(198,231,76,.9)'; g.shadowBlur=10*scale;
  g.strokeStyle=C.laser; g.lineWidth=2*scale;
  g.beginPath(); g.moveTo(bx-half,by); g.lineTo(bx+half,by); g.stroke();
  g.beginPath(); g.arc(bx,by,4.5*scale,0,Math.PI*2); g.stroke();
  g.shadowBlur=0; g.setLineDash([2*scale,5*scale]); g.lineWidth=1.2*scale;
  g.beginPath(); g.moveTo(bx,by); g.lineTo(bx,by-torso*.45); g.stroke();
  g.restore();
}
function drawTrail(g, M, scale){
  if(L.trail.length<2) return;
  g.save(); g.lineCap=g.lineJoin='round';
  for(let i=1;i<L.trail.length;i++){
    const a=M.f(L.trail[i-1]), b=M.f(L.trail[i]), k=i/L.trail.length, dn=L.trail[i].down;
    g.strokeStyle = dn ? `rgba(198,231,76,${(.25+.6*k).toFixed(2)})` : `rgba(238,241,232,${(.12+.35*k).toFixed(2)})`;
    g.lineWidth=(dn?3.4:2.2)*scale;
    g.beginPath(); g.moveTo(a.x,a.y); g.lineTo(b.x,b.y); g.stroke();
  }
  g.restore();
}
function drawFlashes(g, M, torso, scale){
  const now=performance.now();
  L.flashes=L.flashes.filter(f=>now-f.t<650);
  L.flashes.forEach(f=>{ const k=(now-f.t)/650, p=M.f(f.p);
    g.save(); g.globalAlpha=1-k; g.strokeStyle=C.laser; g.lineWidth=(3.5*(1-k)+1)*scale;
    g.beginPath(); g.arc(p.x,p.y,(10+k*torso*.8),0,Math.PI*2); g.stroke(); g.restore(); });
}
function drawCam(lm){
  if(!L.cam) return;
  const c=fitCanvas(L.cam.cv); if(!c) return;
  if(!lm) return;
  const M=mapper(c.w,c.h,true), P=lm.map(M.f), torso=torsoOf(P);
  drawLaser(c.g,P,torso,1); drawTrail(c.g,M,1); drawFigure(c.g,P,torso,1); drawFlashes(c.g,M,torso,1);
}

/* A human silhouette from the joints — head, neck, trapezius slope, rounded
   shoulders, chest tapering to the waist, hips, and limbs that thin from thigh to
   shin and upper arm to forearm. Shared by the demo source, the dot-frame mask and
   the demo figure in the camera window, so every view reads as the same body.
   paint(kind) sets the fill per part: 'torso' | 'limb' | 'head'. */
function drawBody(g, P, T, paint){
  const S=mid(P[11],P[12]), H=mid(P[23],P[24]);
  let ux=H.x-S.x, uy=H.y-S.y; const ul=Math.hypot(ux,uy)||1; ux/=ul; uy/=ul;       // spine, pointing down
  const nx=-uy, ny=ux;                                                            // across the body
  const at=(p,a,b)=>({x:p.x+ux*a+nx*b, y:p.y+uy*a+ny*b});
  const toward=(p,c,k)=>({x:c.x+(p.x-c.x)*k, y:c.y+(p.y-c.y)*k});
  const side=(sh,hp,sgn)=>{
    const out=toward(sh,S,1.04), del=at(out,T*.03,0);                      // shoulder cap, a touch outside the joint
    const pit=at(toward(sh,S,.86),T*.24,0);                                 // armpit
    const waist=toward({x:sh.x+(hp.x-sh.x)*.66, y:sh.y+(hp.y-sh.y)*.66}, {x:S.x+(H.x-S.x)*.66, y:S.y+(H.y-S.y)*.66}, .80);
    const hip=at(toward(hp,H,1.32),T*.04,0);                                // flesh beyond the hip joint
    return {out, del, pit, waist, hip};
  };
  // a turned body still has depth: the chest never gets thinner than it is front-to-back
  // each side stays on its own side (past 90° of turn the shoulder joints swap over in a face-on picture)
  const hs=Math.sign((P[23].x-P[24].x)*nx+(P[23].y-P[24].y)*ny)||1;
  const widen=(p,c,s,min)=>{ const bx=p.x-c.x, by=p.y-c.y, w=Math.max(Math.abs(bx*nx+by*ny),min), a=bx*ux+by*uy;
    return {x:c.x+nx*s*w+ux*a, y:c.y+ny*s*w+uy*a}; };
  const lSh=widen(P[11],S,hs,T*.21), rSh=widen(P[12],S,-hs,T*.21), lHp=widen(P[23],H,hs,T*.17), rHp=widen(P[24],H,-hs,T*.17);
  const L=side(lSh,lHp,1), R=side(rSh,rHp,-1);
  const neckW=T*.085, nb=at(S,-T*.05,0), dirLR=Math.sign((lSh.x-rSh.x)*nx+(lSh.y-rSh.y)*ny)||1;
  const nkL=at(nb,0,neckW*dirLR), nkR=at(nb,0,-neckW*dirLR);
  const crotch=at(H,T*.16,0);
  // limbs: thick near the body, thinner toward hands and feet
  const limb=(a,b,w0,w1)=>{ const dx=b.x-a.x, dy=b.y-a.y, d=Math.hypot(dx,dy)||1, px=-dy/d, py=dx/d;
    g.beginPath(); g.moveTo(a.x+px*w0/2,a.y+py*w0/2); g.lineTo(b.x+px*w1/2,b.y+py*w1/2);
    g.lineTo(b.x-px*w1/2,b.y-py*w1/2); g.lineTo(a.x-px*w0/2,a.y-py*w0/2); g.closePath(); g.fill();
    g.beginPath(); g.arc(a.x,a.y,w0/2,0,Math.PI*2); g.fill();
    g.beginPath(); g.arc(b.x,b.y,w1/2,0,Math.PI*2); g.fill(); };
  paint('limb');
  limb(P[23],P[25],T*.25,T*.17); limb(P[24],P[26],T*.25,T*.17);                  // thighs
  limb(P[25],P[27],T*.16,T*.10); limb(P[26],P[28],T*.16,T*.10);                  // shins
  limb(P[27],P[31],T*.10,T*.07); limb(P[28],P[32],T*.10,T*.07);                  // feet
  paint('torso');
  g.beginPath();
  g.moveTo(nkL.x,nkL.y);
  g.quadraticCurveTo(L.out.x+(nkL.x-L.out.x)*.35-ux*T*.035, L.out.y+(nkL.y-L.out.y)*.35-uy*T*.035, L.out.x, L.out.y);   // trapezius
  g.quadraticCurveTo(L.del.x+nx*dirLR*T*.03, L.del.y+ny*dirLR*T*.03, L.pit.x, L.pit.y);                                 // deltoid
  g.quadraticCurveTo(L.waist.x+(L.pit.x-L.waist.x)*.15, L.waist.y+(L.pit.y-L.waist.y)*.15, L.waist.x, L.waist.y);       // ribcage to waist
  g.quadraticCurveTo(L.hip.x, L.hip.y-uy*T*.10, L.hip.x, L.hip.y);
  g.quadraticCurveTo(crotch.x+(L.hip.x-crotch.x)*.5+ux*T*.06, crotch.y+(L.hip.y-crotch.y)*.5+uy*T*.06, crotch.x, crotch.y);
  g.quadraticCurveTo(crotch.x+(R.hip.x-crotch.x)*.5+ux*T*.06, crotch.y+(R.hip.y-crotch.y)*.5+uy*T*.06, R.hip.x, R.hip.y);
  g.quadraticCurveTo(R.hip.x, R.hip.y-uy*T*.10, R.waist.x, R.waist.y);
  g.quadraticCurveTo(R.waist.x+(R.pit.x-R.waist.x)*.15, R.waist.y+(R.pit.y-R.waist.y)*.15, R.pit.x, R.pit.y);
  g.quadraticCurveTo(R.del.x-nx*dirLR*T*.03, R.del.y-ny*dirLR*T*.03, R.out.x, R.out.y);
  g.quadraticCurveTo(R.out.x+(nkR.x-R.out.x)*.35-ux*T*.035, R.out.y+(nkR.y-R.out.y)*.35-uy*T*.035, nkR.x, nkR.y);
  g.closePath(); g.fill();
  // neck and head — an upright oval, a little forward of the shoulders
  paint('head');
  const hc=at(P[0],-T*.07,0), hb=at(hc,T*.17,0);
  limb(nb,hb,neckW*2.1,neckW*1.9);
  g.beginPath(); g.ellipse(hc.x,hc.y,T*.15,T*.195,Math.atan2(uy,ux)-Math.PI/2,0,Math.PI*2); g.fill();
  // arms last, over the chest — face-on the hands hang in front of the body
  paint('arm');
  limb(P[11],P[13],T*.15,T*.12); limb(P[12],P[14],T*.15,T*.12);                  // upper arms
  limb(P[13],P[15],T*.12,T*.085); limb(P[14],P[16],T*.12,T*.085);                // forearms
  const hand=mid(P[15],P[16]); g.beginPath(); g.arc(hand.x,hand.y,T*.075,0,Math.PI*2); g.fill();
}
function paintDemoSource(lm){
  // what the phase frames are cut from in demo mode: a soft-shaded figure on clear
  const g=demoCv.getContext('2d'); g.clearRect(0,0,DW,DH);
  const T=torsoOf(lm), grd=g.createLinearGradient(0,150,0,680);
  grd.addColorStop(0,'#3A4036'); grd.addColorStop(.45,'#8C9284'); grd.addColorStop(1,'#3A4036');
  const arm=g.createLinearGradient(0,150,0,680);
  arm.addColorStop(0,'#2E332B'); arm.addColorStop(.5,'#6E7466'); arm.addColorStop(1,'#2E332B');
  g.lineJoin='round';
  drawBody(g, lm, T, k=>{ g.fillStyle = k==='arm' ? arm : grd; });
}

/* ================================================================ STAND VIEW
   iPad, landscape only: the stand's own camera, large, beside the phone. It is the
   camera window grown up — same glass, corners, chip and skeleton — with the
   numbers drawn on the body, so a visitor three metres away can read them. */
const wideQ = () => window.matchMedia('(min-width:1000px) and (orientation:landscape)').matches;
function mountStand(){
  const z=document.getElementById('zs'); if(!z || z.querySelector('.stand')) return;
  if(document.documentElement.hasAttribute('data-no-stand')) return;   // tablet-portrait page: one camera window only
  const logo = (document.querySelector('.launch-logo')||{}).src || 'logo-orvia-word.webp';
  z.insertAdjacentHTML('afterbegin', `<section class="stand" aria-label="Stand camera">
    <video class="st-video" playsinline muted autoplay></video>
    <div class="st-scan" aria-hidden="true"></div>
    <canvas class="st-canvas" aria-hidden="true"></canvas>
    <div class="st-top">
      <div class="st-id"><span class="eyebrow">Stand camera</span><span class="zc-chip st-chip"><i></i>Starting camera</span></div>
    </div>
    <div class="st-phase"><div class="st-ph" id="stPh">Standby</div>
      <div class="st-modeline"><b class="st-mode-n">${L.mode}</b><span class="st-mm">weight at ${MODES[L.mode].mm} mm</span></div></div>
    <div class="st-note" aria-live="polite"></div>
    <img class="st-logo" src="${logo}" alt="">
    <pre class="st-debug" hidden></pre>
  </section>`);
  const el=z.querySelector('.stand');
  const ph=el.querySelector('#stPh');
  wireDebugTap(el.querySelector('.st-chip'));
  L.stand={
    el, video:el.querySelector('.st-video'), cv:el.querySelector('.st-canvas'), dbg:el.querySelector('.st-debug'),
    chip:el.querySelector('.st-chip'), note:el.querySelector('.st-note'),
    setPhase(p){
      ph.textContent=phaseName(p);
      ph.classList.remove('swap'); void ph.offsetWidth; ph.classList.add('swap');
    },
    setMode(n){ el.querySelector('.st-mode-n').textContent=n; el.querySelector('.st-mm').textContent='weight at '+MODES[n].mm+' mm'; },
    pulse(){ el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit'); },
    swing(){}   // the stand camera keeps to the picture — the read lives in the swing sheet
  };
}
function syncStandLayout(){
  const z=document.getElementById('zs'); if(!z) return;
  z.classList.toggle('stand-on', L.on && !!L.stand && wideQ());
}
function tag(g, x, y, text, scale, align){
  g.save();
  g.font=`700 ${12.5*scale}px -apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif`;
  const w=g.measureText(text).width, ph=8*scale, h=24*scale;
  let bx = align==='left' ? x-w-ph*2-10*scale : align==='right' ? x+10*scale : x-w/2-ph;
  const by=y-h/2;
  g.fillStyle='rgba(7,16,11,.62)'; g.strokeStyle='rgba(255,255,255,.18)'; g.lineWidth=1;
  const r=h/2; g.beginPath();
  g.moveTo(bx+r,by); g.lineTo(bx+w+ph*2-r,by); g.arc(bx+w+ph*2-r,by+r,r,-Math.PI/2,Math.PI/2);
  g.lineTo(bx+r,by+h); g.arc(bx+r,by+r,r,Math.PI/2,Math.PI*1.5); g.closePath(); g.fill(); g.stroke();
  g.fillStyle=C.ink; g.textBaseline='middle'; g.fillText(text,bx+ph,y+.5);
  g.restore();
}
function drawStand(lm, r){
  if(!L.stand || !document.getElementById('zs').classList.contains('stand-on')) return;
  const c=fitCanvas(L.stand.cv); if(!c||!lm) return;
  const M=mapper(c.w,c.h,true), P=lm.map(M.f), torso=torsoOf(P);
  const sc=clamp(torso/120,1,1.8);
  drawLaser(c.g,P,torso,sc); drawTrail(c.g,M,sc); drawFigure(c.g,P,torso,sc); drawFlashes(c.g,M,torso,sc);
  const m=r.live; if(!m) return;
  const R=L.handed==='R', trailSh=P[R?12:11], leadAnk=P[R?27:28], trailAnk=P[R?28:27];
  const mirror=L.source==='camera'&&L.facing==='user';
  const trailLeft = (trailSh.x < mid(P[11],P[12]).x);
  const P_=MODES[L.mode].type==='putt';
  // measurements sit beside the joint they describe; turns only once the swing is moving
  const moving=!['ready','address','idle'].includes(r.phase);
  if(moving){
    if(P_) tag(c.g, trailSh.x, trailSh.y-16*sc, `Rock ${Math.round(m.rock)}°`, sc, trailLeft?'left':'right');
    else   tag(c.g, trailSh.x, trailSh.y-16*sc, `Turn ${Math.round(m.shoulder)}°`, sc, trailLeft?'left':'right');
    const hipM=mid(P[23],P[24]);
    if(!P_) tag(c.g, hipM.x, hipM.y, `Hips ${Math.round(m.hip)}°`, sc, trailLeft?'right':'left');
  }
  tag(c.g, P[0].x, P[0].y-torso*.42, `Head ${m.head.toFixed(1)} cm`, sc);
  // weight: a bar between the feet with the hips' share marked
  const y=Math.max(leadAnk.y,trailAnk.y)+torso*.16, x0=trailAnk.x, x1=leadAnk.x;
  c.g.save(); c.g.strokeStyle='rgba(238,241,232,.22)'; c.g.lineWidth=4*sc; c.g.lineCap='round';
  c.g.beginPath(); c.g.moveTo(x0,y); c.g.lineTo(x1,y); c.g.stroke();
  const wx=x0+(x1-x0)*(P_?0.5:m.weight/100);
  c.g.strokeStyle=C.laser; c.g.beginPath(); c.g.moveTo(x0,y); c.g.lineTo(wx,y); c.g.stroke();
  c.g.fillStyle=C.laser; c.g.beginPath(); c.g.arc(wx,y,6*sc,0,Math.PI*2); c.g.fill(); c.g.restore();
  if(!P_){ const right=Math.max(x0,x1), left=Math.min(x0,x1);
    if(right+190*sc < c.w) tag(c.g, right+8*sc, y, `Weight ${Math.round(m.weight)}% lead`, sc, 'right');
    else tag(c.g, left-8*sc, y, `Weight ${Math.round(m.weight)}% lead`, sc, 'left'); }
  void mirror;
}

/* ============================================================= REPORT RECORD
   Builds the same record shape the Session Report already renders (todayRecord),
   from the swings that were actually tracked — plus the frames, joint dots and
   coached-joint points so the avatar, strip and close-ups show this golfer. */
function avg(a){ return a.reduce((s,v)=>s+v,0)/(a.length||1); }
function buildRecord(only, opts){
  opts=opts||{};
  const pool=only||L.swings;
  const sw=pool.filter(s=>s.type!=='putt'), pt=pool.filter(s=>s.type==='putt');
  if(!only && pt.length>sw.length) return { type:'putt', putt:puttRecord(pt) };
  const list=sw.length?sw:pool;
  const last=list[list.length-1];
  const mode=MODES[last.mode], R=last.handed==='R';
  const ph=last.ph, tg=mode.t;
  const st=(v,r)=>v>=r[0]&&v<=r[1]?'good':'alert';
  const G={address:'good',takeaway:'good',top:'good',downswing:'good',impact:'good',finish:'good'};
  const relOf=ms=>ms>90?'Early':ms<15?'Late':'On time';
  const rel=last.releaseMs, relLab=relOf(rel);
  const shTop=Math.round(ph.top.shoulder);
  const shSt=st(ph.top.shoulder,tg.shoulder), tiltSt=st(ph.impact.tilt,tg.tilt),
        wImpSt=st(ph.impact.weight,tg.wImp), wFinSt=st(ph.finish.weight,tg.wFin), relSt=relLab==='On time'?'good':'alert';
  const g=k=>ph[k]||ph.top;
  const LEAD='lead', W=k=>Math.round(g(k).weight);
  const hs=[
    { id:'shoulder', joint:'shR', name:'Shoulder rotation', st:{...G, top:shSt},
      m:{address:['Square','Set at address'], takeaway:[`Turn ${Math.round(g('takeaway').shoulder)}°`,'One-piece takeaway'],
         top:[`Turn ${shTop}°`, shSt==='good'?`A full ${mode.short.toLowerCase()} turn`: shTop<tg.shoulder[0]?`${Math.round(tg.shoulder[0]-shTop)}° short of a full turn`:`+${Math.round(shTop-tg.shoulder[1])}° past your top`],
         downswing:[`Turn ${Math.round(g('downswing').shoulder)}°`,'Unwinding'],
         impact:[`Turn ${Math.round(g('impact').shoulder)}°`, g('impact').shoulder<30?'Square to target':'Open through the ball'],
         finish:['Full','Released through']},
      coach:{top: shSt==='good'?'Shoulder turn is right where this balance wants it.': shTop<tg.shoulder[0]?`Turn your ${R?'left':'right'} shoulder under your chin — you stopped short.`:'Stop the backswing a touch shorter — the shoulder is over-rotating at the top.',
             _:'Shoulder line is tracking well through this phase.'} },
    { id:'spine', joint:'spine', name:'Spine tilt', st:{...G, impact:tiltSt},
      m:{address:[`${Math.round(g('address').tilt)}°`,'Set at address'], takeaway:[`${Math.round(g('takeaway').tilt)}°`,'Held from address'],
         top:[`${Math.round(g('top').tilt)}°`,'Over the ball'], downswing:[`${Math.round(g('downswing').tilt)}°`,'Moving behind the ball'],
         impact:[`${Math.round(ph.impact.tilt)}°`, tiltSt==='good'?'Behind the ball': ph.impact.tilt<tg.tilt[0]?'Lunging past the ball':'Hanging back'],
         finish:['—','Tall & balanced']},
      coach:{impact: tiltSt==='good'?'Spine tilt at impact is in the window for this club.': ph.impact.tilt<tg.tilt[0]?'Stay behind the ball — your upper body is racing ahead at impact.':'You’re hanging back — let the chest stack over the ball.',
             _:'Spine tilt is holding steady.'} },
    { id:'wrist', joint:'hand', name:'Wrist release', st:{...G, impact:relSt},
      m:{address:['Neutral','Set at address'], takeaway:['Setting','Hinge starting'], top:['Hinged','Fully loaded'],
         downswing: relLab==='Early'?['Releasing','Unhinging early']:['Held','Lag retained'],
         impact:[relLab==='On time'||Math.abs(rel)<20?relLab:`${relLab} ${(Math.abs(rel)/1000).toFixed(2)}s`,
                 relLab==='On time'?'Squares at the ball':relLab==='Early'?'Hands slowing before the ball':'Releasing behind the ball'],
         finish:['Unhinged','Complete']},
      coach:{impact: relLab==='On time'?'Release timing looks on schedule.':relLab==='Early'?'Hold the angle longer — you’re casting from the top.':'Start the release a hair earlier so the face squares at the ball.',
             _:'Release timing looks on schedule.'} },
    { id:'pelvis', joint:'hip', name:'Weight transfer', st:{...G, impact:wImpSt, finish:wFinSt},
      m:{address:[`${W('address')}%`,'Centered'], takeaway:[`${100-W('takeaway')}% trail`,'Loading the trail side'],
         top:[`${100-W('top')}% trail`,'Loaded into the trail side'], downswing:[`${W('downswing')}% ${LEAD}`,'Shift started'],
         impact:[`${W('impact')}% ${LEAD}`, wImpSt==='good'?'Driving onto the lead side':'Stuck on the trail side'],
         finish:[`${W('finish')}% ${LEAD}`, wFinSt==='good'?'Fully through':'Finish hanging back']},
      coach:{impact: wImpSt==='good'?'Weight transfer onto the lead side is right on time.':`Drive onto your ${R?'left':'right'} side through impact — the weight stayed back.`,
             finish: wFinSt==='good'?'Balanced finish on the lead side.':`Hold the finish on your ${R?'left':'right'} foot.`,
             _:'Weight transfer is tracking well.'} },
  ];

  // session numbers — averaged over every tracked swing
  const tempo=avg(list.map(s=>s.tempo.ratio)), headCm=avg(list.map(s=>s.headMax));
  const head=Math.round(clamp(100-headCm*2,40,100)), weight=Math.round(avg(list.map(s=>s.ph.impact.weight)));
  const rels=list.map(s=>relOf(s.releaseMs));
  const relMode=['On time','Early','Late'].map(k=>[k,rels.filter(r=>r===k).length]).sort((a,b)=>b[1]-a[1])[0][0];
  // compare against: the swing before this one (per-swing read), or the last session (session report)
  const headOf=s=>Math.round(clamp(100-s.headMax*2,40,100));
  const SWV={ 'Tempo':s=>+s.tempo.ratio.toFixed(1), 'Head Steadiness':headOf, 'Weight Transfer':s=>Math.round(s.ph.impact.weight) };
  let D=(typeof DATA!=='undefined'&&DATA.report)||null;
  if(opts.history){
    const hist=opts.history, before=hist.slice(0,-1), pr=before[before.length-1];
    D = pr ? { metrics:Object.keys(SWV).map(k=>({k, v:''+SWV[k](pr), spark:hist.slice(-5,-1).map(SWV[k])})) } : null;
  }
  const prev=k=>D?(D.metrics.find(m=>m.k===k)||{}):{};
  const pv=k=>parseFloat(prev(k).v);
  const sp=(k,v)=>{ const s=(prev(k).spark||[]).slice(-4); return s.length?[...s,v]:[v,v]; };
  const dirOf=(v,p,better)=>{ if(isNaN(p)) return 'flat';
    if(better==='closer3'){ const a=+Math.abs(+v.toFixed(1)-3).toFixed(1), b=+Math.abs(p-3).toFixed(1); return a===b?'flat':a<b?'up':'down'; }
    return Math.round(v)===Math.round(p)?'flat':v>p?'up':'down'; };
  const sgn=x=>x===0?'steady':(x>0?'+':'−')+Math.abs(x);
  const metrics=[
    {k:'Tempo', v:tempo.toFixed(1), sub:':1', dir:dirOf(tempo,pv('Tempo'),'closer3'),
      d: isNaN(pv('Tempo'))?'—':sgn(+(tempo-pv('Tempo')).toFixed(1)), spark:sp('Tempo',+tempo.toFixed(1))},
    {k:'Head Steadiness', v:''+head, sub:'%', dir:dirOf(head,pv('Head Steadiness')),
      d: isNaN(pv('Head Steadiness'))?'—':sgn(head-pv('Head Steadiness')), spark:sp('Head Steadiness',head)},
    {k:'Weight Transfer', v:''+weight, sub:'% lead', dir:dirOf(weight,pv('Weight Transfer')),
      d: isNaN(pv('Weight Transfer'))?'—':sgn(weight-pv('Weight Transfer')), spark:sp('Weight Transfer',weight)},
    relMode==='On time'
      ? {k:'Wrist Release', v:'On time', sub:'timing', dir:'up', d:'fixed', spark:[81,83,84,86,88]}
      : {k:'Wrist Release', v:relMode, sub:'timing', dir:'down', d:relMode==='Early'?'casting':'late', spark:[88,86,85,84,81], warn:true},
  ];

  // mission success: the share of swings that met the mission's one measurable goal
  const mis=L.mission||{}, goal=(mis.title||'').toLowerCase();
  const key = /tempo/.test(goal)?'tempo' : /head/.test(goal)?'head' : /weight|low point/.test(goal)?'wImp' : null;
  const met = list.filter(s=> key ? s.checks[key] && s.checks[key].st==='good' : s.score>=80).length;
  const success=Math.round(met/list.length*100);

  const phases=[['address','Address'],['takeaway','Takeaway'],['top','Top'],['downswing','Downswing'],['impact','Impact'],['finish','Finish']]
    .map(([k,l])=>({k:l, warn: hs.some(h=>h.st[k]==='alert')}));
  // the avatar is the hand-made dot artwork (dot-1…7) — the live read changes the words and the flags, not the figure
  const frames={}, dots={}, hsPts={};

  return {
    type:'swing', live:true, demo:L.source==='demo',
    label: opts.history ? `Swing ${opts.n||list.length}` : `Tonight · ${list.length} swing${list.length>1?'s':''}`,
    hotspots:hs, finding:findingFor(list,last,{shSt,tiltSt,wImpSt,wFinSt,relSt,tempo,head,weight}),
    phases, metrics, success, streak:(D&&D.streak)||1,
    improved: metrics.filter(m=>m.dir==='up').length, total:4,
    missionName: mis.short || (mis.title||'Practice'),
    frames, dots, hsPts, mode:last.mode,
    note:'Tracked live from the stand.'
  };
}
/* one swing, read on its own — the report's avatar, phases and metrics for this swing,
   compared with the swing before it in the session */
function swingRecord(rep){
  const i=L.swings.indexOf(rep), hist=L.swings.slice(0, i<0?L.swings.length:i+1).filter(s=>s.type!=='putt');
  const r=buildRecord([rep], {history:hist, n:rep.n});
  r.finding=swingDetail(rep, hist.length>1?hist[hist.length-2]:null);
  r.score=rep.score; r.coach=rep.coach; r.n=rep.n; r.sets=L.sets; r.first=hist.length<2;
  return r;
}
function emit(name, detail){ try{ window.dispatchEvent(new CustomEvent(name,{detail})); }catch(e){} }
function findingFor(list,last,s){
  const n=list.length, mode=last.mode.toLowerCase();
  const good=[], bad=[];
  if(Math.abs(s.tempo-3)<=0.35) good.push(`tempo held at ${s.tempo.toFixed(1)}:1`); else bad.push(s.tempo<3?`the backswing ran quick (${s.tempo.toFixed(1)}:1)`:`you paused at the top (${s.tempo.toFixed(1)}:1)`);
  if(s.head>=88) good.push('your head stayed quiet'); else bad.push('your head drifted off the ball');
  if(s.shSt==='good') good.push('the turn was full'); else bad.push(last.ph.top.shoulder<MODES[last.mode].t.shoulder[0]?'the turn stopped short':'the top over-rotated');
  if(s.wImpSt==='good') good.push('weight got to the lead side at impact'); else bad.push('weight stayed back through impact');
  if(s.relSt!=='good') bad.push('the release came '+(last.releaseMs>90?'early':'late'));
  const cap=t=>t[0].toUpperCase()+t.slice(1);
  const over=n>1?` across ${n} swings`:'';
  if(!bad.length) return `${cap(good[0])}${over}, and ${good[1]||'every checkpoint held'} — a clean ${mode} session from address to finish.`;
  if(!good.length) return `A starting point${over}: ${bad[0]}, and ${bad[1]||'the finish wasn’t balanced'}. One fix at a time from here.`;
  return `${cap(good[0])}${over}, but ${bad[0]} — that’s the one to work on next.`;
}
function puttRecord(list){
  const clean=list.filter(s=>['tempo','head'].every(k=>s.checks[k].st!=='bad')).length;
  const lens=list.map(s=>s.strokeCm), mean=avg(lens);
  const spread=Math.round(Math.sqrt(avg(lens.map(l=>(l-mean)*(l-mean)))));
  const ratios=list.map(s=>s.tempo.ratio), rm=avg(ratios);
  const cv=Math.sqrt(avg(ratios.map(r=>(r-rm)*(r-rm))))/(rm||1);
  const tempo=Math.round(clamp(100-cv*100,40,100));
  const P=(typeof DATA!=='undefined'&&DATA.puttReport)||{};
  return { live:true, demo:L.source==='demo', made:clean, attempts:list.length, lastMade:P.made||0,
    streak:P.streak||1, avgError:spread, avgErrorGain:Math.max(0,(P.avgError||spread)-spread), tempo, tempoDelta:tempo-(P.tempo||tempo),
    finding: clean===list.length ? `Every stroke held its pace — tempo ${rm.toFixed(1)}:1 with the head still.`
           : `${clean} of ${list.length} strokes were clean. ${list.some(s=>s.checks.head.st==='bad')?'The head followed the putter on the misses.':'Pace drifted on the misses — keep the 2:1 count.'}`,
    accSpark:[...(P.accSpark||[spread]).slice(-4), spread], tempoSpark:[...(P.tempoSpark||[tempo]).slice(-4), tempo],
    date:`Tonight · ${list.length} strokes` };
}

/* ================================================================= EXPORT */
const Live = {
  begin, attachCam, end, setMode, exportLog, setDebug,
  preload(){ return loadModel().catch(()=>{}); },      // pages call this on load so Start is instant
  get debug(){ return DEBUG; }, get lastLog(){ return lastLog; },
  get active(){ return L.on; },
  get swings(){ return L.swings; },
  set mission(m){ L.mission=m; }, get mission(){ return L.mission; },
  set voice(v){ voiceOn=!!v; }, get voice(){ return voiceOn; },
  hold(on){ L.hold=!!on; }, swingRecord, sessionRecord:()=>L.swings.length?buildRecord():null,
  // exposed for automated checks
  _engine: createEngine, _demoPose: demoPose, _demoTimeline: demoTimeline, _VARIANTS: VARIANTS, _MODES: MODES,
  get _state(){ return L; }
};
window.Live = Live;
})();
