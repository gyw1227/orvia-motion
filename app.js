/* =========================================================================
   ARVIA — Posture Coach  ·  pure JS, no dependencies
   Screens render into #screen; icons & charts are inline SVG.
   ========================================================================= */
'use strict';
const RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* Shared status bar (time · signal · wifi · battery) — every phone-shaped
   screen (main app, launch, onboarding, zero-screen) shows the same one. */
const statusbarHTML = () => `<div class="statusbar" aria-hidden="true">
  <span class="sb-time">9:41</span>
  <span class="sb-right">
    <svg width="18" height="12" viewBox="0 0 18 12"><rect x="0" y="7" width="3" height="5" rx="1" fill="currentColor"/><rect x="5" y="4" width="3" height="8" rx="1" fill="currentColor"/><rect x="10" y="1.5" width="3" height="10.5" rx="1" fill="currentColor"/><rect x="15" y="0" width="3" height="12" rx="1" fill="currentColor" opacity=".35"/></svg>
    <svg width="17" height="12" viewBox="0 0 17 12"><path d="M8.5 2.4c2 0 3.9.8 5.3 2.1l1.2-1.3A9.4 9.4 0 0 0 8.5.6 9.4 9.4 0 0 0 2 3.2l1.2 1.3A7.4 7.4 0 0 1 8.5 2.4Z" fill="currentColor"/><path d="M8.5 6c1 0 2 .4 2.7 1.1l1.2-1.3A6 6 0 0 0 8.5 4a6 6 0 0 0-3.9 1.8l1.2 1.3A3.9 3.9 0 0 1 8.5 6Z" fill="currentColor"/><circle cx="8.5" cy="9.6" r="1.7" fill="currentColor"/></svg>
    <svg width="26" height="12" viewBox="0 0 26 12"><rect x="1" y="1" width="21" height="10" rx="3" fill="none" stroke="currentColor" opacity=".5"/><rect x="3" y="3" width="15" height="6" rx="1.5" fill="currentColor"/><rect x="23.5" y="4" width="1.5" height="4" rx=".75" fill="currentColor" opacity=".5"/></svg>
  </span>
</div>`;

/* ---------------------------------------------------------------- data --- */
const DATA = {
  user:{ name:'Jiwon', initial:'J', handicap:18, goal:'Break 90',
         roundInDays:3, roundName:'Namdong CC', streak:6, weekSessions:4,
         baselineDate:'Jun 3, 2026' },
  mission:{
    title:'Impact Stability',
    focus:'Hold your head still through the ball — quiet the sway you had at the top last time.',
    min:12, mode:'Mid Iron', reps:'3 blocks · 8 reps',
    adjusted:'Load lightened for the left wrist you flagged — fewer full swings, more slow tempo reps.',
  },
  correction:'Let the trail elbow fold later. You’re casting from the top.',
  report:{
    date:'Tonight · 13 min',
    finding:'The top over-rotated again, but impact was the steadiest it’s been — the fix is holding downstream.',
    phases:[
      {k:'Address',   warn:false},
      {k:'Takeaway',  warn:false},
      {k:'Top',       warn:true },
      {k:'Downswing', warn:true },
      {k:'Impact',    warn:false},
      {k:'Finish',    warn:false},
    ],
    metrics:[
      {k:'Tempo',           v:'3.0', sub:':1', dir:'up',   d:'+0.2', spark:[2.6,2.7,2.7,2.9,3.0]},
      {k:'Head Steadiness', v:'92',  sub:'%',            dir:'up',   d:'+4',   spark:[80,83,85,88,92]},
      {k:'Weight Transfer', v:'78',  sub:'% lead',       dir:'up',   d:'+6',   spark:[64,67,70,74,78]},
      {k:'Wrist Release',   v:'Late',sub:'timing',       dir:'down', d:'−3',   spark:[88,86,85,84,81], warn:true},
    ],
    improved:3, total:4, success:82, streak:6,
  },
  growth:{
    weekSessions:4, weekMin:52, weekGoal:5, monthName:'July 2026',
    firstDow:2 /* Jul 1 2026 = Wed(0=Sun) */, days:31, today:22,
    done:[1,2,4,6,7,9,11,13,14,16,18,20,21,22],
    /* club-head speed: the headline number, gauged against the range ARVIA tracks */
    speed:{ best:94, prev:88, unit:'mph', floor:60, ceil:110, when:'Jul 22 · mid iron' },
    /* year at a glance — 12 month columns × 5 week rows, filled = trained that week */
    year:2026, curMonth:6,
    weeks:(()=>{
      const dens=[.20,.30,.42,.52,.64,.76,.88];       // Jan…Jul, the habit building
      const out=[];
      for(let w=0;w<5;w++){
        const row=[];
        for(let m=0;m<12;m++){
          if(m>6){ row.push(null); continue; }         // future months
          row.push((((m*5+w*7)%13)/13) < dens[m]);
        }
        out.push(row);
      }
      return out;
    })(),
    /* every logged swing since day 0 — a slow climb that steepens as the fix holds */
    records:(()=>{
      const n=56, out=[];
      for(let i=0;i<n;i++){
        const t=i/(n-1);
        const base=62 + 32*Math.pow(t,1.9);          // gentle start, steeper finish
        const jitter=[0,1.4,-1.1,.7,-.6,1.1,-1.5,.4][i%8];
        out.push(+(base+jitter).toFixed(1));
      }
      return out;
    })(),
    trend:{ name:'Head Steadiness', baseline:74,
            values:[74,76,79,82,84,88,92], labels:['W1','W2','W3','W4','W5','W6','Now'] },
    ba:[
      {k:'Spine angle at address', b:'28°',   a:'34°',  d:'+6°'},
      {k:'Head sway, top → impact',b:'6.2 cm', a:'3.7 cm',d:'−40%'},
      {k:'Hip rotation at impact', b:'32°',   a:'41°',  d:'+9°'},
    ],
  },
  // Putting session = game-result report (no posture avatar; measurable outcomes only)
  puttReport:{ date:'Tonight · 9 min', made:4, attempts:5, lastMade:3,
    streak:6, avgError:20, avgErrorGain:6, tempo:91, tempoDelta:3,
    finding:'Pace control tightened — your misses clustered just short, an easy read to adjust.',
    accSpark:[34,30,27,24,20], tempoSpark:[82,85,87,89,91] },
  // Individual training missions — measurable actions only (counts / tempo / pass-fail)
  missions:[
    {id:'m1', cat:'putt',  goal:'Sink ten 3-metre putts',            min:8,  mode:'Putt',        diff:'Medium', done:true,  short:'Short putts', rec:false},
    {id:'m2', cat:'putt',  goal:'Pass the putting gate 8 of 10',     min:6,  mode:'Putt',        diff:'Medium', done:false, short:'Gate control', rec:true },
    {id:'m3', cat:'putt',  goal:'Lag 8m putts to inside 1m — 6 of 8',min:7,  mode:'Putt',        diff:'Hard',   done:false, short:'Lag distance', rec:false},
    {id:'m4', cat:'swing', goal:'Hold wedge tempo across 20 swings', min:10, mode:'Wedge',       diff:'Medium', done:true,  short:'Wedge tempo', rec:false},
    {id:'m5', cat:'swing', goal:'Fix weight-transfer timing — 10 swings', min:9, mode:'Mid Iron',diff:'Medium', done:false, short:'Weight transfer', rec:true },
    {id:'m6', cat:'swing', goal:'Keep head steady — 12 mid-iron swings', min:8, mode:'Mid Iron', diff:'Easy',   done:false, short:'Head steady', rec:true },
    {id:'m7', cat:'swing', goal:'Adapt to the driver balance — 15 swings', min:12, mode:'Driver',diff:'Hard',   done:false, short:'Driver balance', rec:false},
    {id:'m8', cat:'swing', goal:'Fairway-wood tempo — 15 swings',    min:11, mode:'Fairway Wood',diff:'Medium', done:false, short:'Wood tempo', rec:false},
    {id:'m9', cat:'swing', goal:'Hybrid low-point control — 12 swings', min:9, mode:'Hybrid',    diff:'Medium', done:false, short:'Low point', rec:false},
    {id:'m10',cat:'swing', goal:'Wedge ladder — 30 / 50 / 70 m', min:10, mode:'Wedge',      diff:'Medium', done:false, short:'Distance ladder', rec:false},
  ],
};
/* Round-prep set = the weak spots pulled from recent sessions, run back-to-back */
const ROUND_PREP={ title:'Round Prep', mode:'Full-bag mix', min:22, sets:12,
  focus:'Top over-rotation, impact spine angle, and 3m putts — your softest spots this month.' };

const MODES = ['Driver','Fairway Wood','Hybrid','Mid Iron','Wedge','Putt'];
const DIFF_ORDER={Easy:0,Medium:1,Hard:2};

/* --------------------------------------------------------------- state --- */
const state = {
  screen:'home',
  mood:null,              // 0 fresh · 1 okay · 2 tired · null = none selected
  areas:new Set(),        // discomfort
  growthTab:'calendar',
  recRange:'w',                // speed-trend chart window — opens on the week
  pickedMission:'m5',          // tonight's pick — swiped on the home carousel
  missionCat:'all',       // missions filter: all | swing | putt | rec
  ob:0,                   // onboarding step
  obGoal:0,
  reflected:false,
  reportPhase:'address',  // avatar phase shown in report — opens on the setup frame
  sessionType:'swing',    // 'swing' → posture report · 'putt' → game-result report
  replaying:false,
  replayTimer:null,
  // baseline: established demo by default; onboarding flips to a fresh user
  hasBaseline:true,       // false = no starting point captured yet
  baselineJustSet:false,  // show the "saved as baseline" state on the report
  obScore:null,           // onboarding: target-score choice (none until tapped)
  obRound:null,           // onboarding: next-round choice (none until tapped)
};

/* --------------------------------------------------------------- icons --- */
const I = {
  home:'<path d="M4 11 12 4l8 7"/><path d="M6 10.2V19h4v-5h4v5h4v-8.8"/>',
  growth:'<path d="M4 5v14h16"/><path d="M7 14l3.5-4L14 13l5-7"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4.5 20c1.4-3.6 5-5 7.5-5s6.1 1.4 7.5 5"/>',
  play:'<path d="M8 5.2 19 12 8 18.8Z"/>',
  bell:'<path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  share:'<path d="M12 3v12"/><path d="m8 7 4-4 4 4"/><path d="M5 12v7h14v-7"/>',
  back:'<path d="M15 5 8 12l7 7"/>',
  chev:'<path d="m9 6 6 6-6 6"/>',
  gear:'<circle cx="12" cy="12" r="3.1"/><path d="M12 2.5v2.6M12 18.9v2.6M4.6 4.6 6.5 6.5M17.5 17.5l1.9 1.9M2.5 12h2.6M18.9 12h2.6M4.6 19.4 6.5 17.5M17.5 6.5l1.9-1.9"/>',
  camera:'<rect x="3" y="7" width="18" height="13" rx="3.5"/><circle cx="12" cy="13.5" r="3.4"/><path d="M8.5 7 10 4h4l1.5 3"/>',
  laser:'<circle cx="12" cy="12" r="7"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
  voice:'<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0"/><path d="M12 17.5V21"/>',
  shield:'<path d="M12 3l7 3v5.5c0 4.6-3.2 7.6-7 9.5-3.8-1.9-7-4.9-7-9.5V6z"/><path d="m9 12 2 2 4-4"/>',
  target:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
  cal:'<rect x="3" y="5" width="18" height="16" rx="3.5"/><path d="M3 9.5h18M8 3v4M16 3v4"/>',
  edit:'<path d="M4 20h4L18.5 9.5l-4-4L4 16z"/><path d="m13 7 4 4"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  bt:'<path d="m8 7 8 10-4 3V4l4 3-8 10"/>',
  clock:'<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 1.8"/>',
  flag:'<path d="M6 21V4"/><path d="M6 5h11l-2 3 2 3H6"/>',
  bolt:'<path d="M13 3 5 13h5l-1 8 8-11h-5z"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  x:'<path d="M6 6l12 12M18 6 6 18"/>',
  missions:'<path d="M10 6h10M10 12h10M10 18h10"/><path d="M4 5.6l1.3 1.3L7.7 4.2M4 11.6l1.3 1.3L7.7 10.2M4 17.6l1.3 1.3L7.7 16.2"/>',
  target2:'<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
};
const svgIco = (p, extra='') => `<svg viewBox="0 0 24 24" ${extra}>${p}</svg>`;

/* mood faces (SVG, not emoji) */
const FACE = {
  0:'<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.2 4.2 0 0 0 7 0"/><circle cx="9" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r="1" fill="currentColor" stroke="none"/>',
  1:'<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5h7"/><circle cx="9" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r="1" fill="currentColor" stroke="none"/>',
  2:'<circle cx="12" cy="12" r="9"/><path d="M8.5 15.5a4.2 4.2 0 0 1 7 0"/><path d="M8 10.5l2 .6M16 10.5l-2 .6"/>',
};
const MOOD_LAB = ['Fresh','Okay','Tired'];

/* ----------------------------------------------------- posture photo ----- */
/* The mannequin used to be a procedurally-posed stick figure; it's now a
   single studio photo (사람 형태.jpg) with tappable joint markers overlaid on
   it. viewBox is 0 0 200 200 (the photo is square) so every marker/callout
   size tuned for the old 200-wide coordinate space still applies untouched. */
const cap = s => s[0].toUpperCase()+s.slice(1);
const PHOTO_SRC = '사람 형태1-small.png';
const PHOTO_HOTSPOTS = { shoulder:[99,56], spine:[101,74], wrist:[116,34], pelvis:[103,88] };
/* the 6 swing phases — single source of truth (key = lowercase id used everywhere) */
const PHASES = [
  { key:'address',   label:'Address',   short:'Set'    },
  { key:'takeaway',  label:'Takeaway',  short:'Take'   },
  { key:'top',       label:'Top',       short:'Top'    },
  { key:'downswing', label:'Downswing', short:'Down'   },
  { key:'impact',    label:'Impact',    short:'Impact' },
  { key:'finish',    label:'Finish',    short:'Finish' },
];
const PHASE_KEYS = PHASES.map(p=>p.key);
/* playback runs one frame past the strip: 7.png is the full follow-through */
const SWING_FRAMES = [...PHASE_KEYS, 'through'];

/* per-phase avatar photo — the joint markers are drawn INTO these images by hand */
const PHASE_AVATAR = {
  address:'dot-1-address.webp',   takeaway:'dot-2-takeaway.webp', top:'dot-3-top.webp',
  downswing:'dot-4-downswing.webp', impact:'dot-5-impact.webp',   finish:'dot-6-finish.webp',
  through:'dot-7-through.webp',   // playback only — no joint table, so it never reaches the strip
};
const phaseAvatarSrc = phase => { const k=String(phase).toLowerCase();
  return (curRecord&&curRecord.frames&&curRecord.frames[k]) || PHASE_AVATAR[k] || PHOTO_SRC; };
/* a live session carries its own joint dots + coached-joint points per phase */
const liveDots = ph => curRecord&&curRecord.dots&&curRecord.dots[ph];
const liveHS   = ph => curRecord&&curRecord.hsPts&&curRecord.hsPts[ph];

/* portrait viewBox 0 0 200 284 — the canvas is sized so the tallest club still
   fits; every figure is head-to-toe identical (head y≈52, toe y≈266) */
const VBH = 284;
/* every joint dot the user drew on each phase image — each is an
   invisible tap target sitting exactly on the drawn circle → opens a close-up */
/* Every figure is normalised on the PERSON, not the artwork: head-to-toe is the
   same height in all six (head at y≈26, toe at y≈234) and the body is centred on
   x=100 — the club is free to run outside the frame. Joints are placed against
   that fixed band per pose.
   order: head, trail-sh, neck, lead-sh, trail-elb, lead-elb, hands, waist,
          trail-hip, lead-hip, trail-knee, lead-knee, trail-foot, lead-foot */
const PHASE_DOTS = {
  address:   [[105,71],[93,100],[104,100],[116,100],[94,131],[118,131],[99,154],[106,150],[96,170],[118,170],[91,210],[120,210],[81,260],[128,260]],
  takeaway:  [[109,67],[94,97],[107,97],[119,97],[88,129],[113,129],[109,153],[109,145],[98,169],[122,169],[95,210],[126,210],[80,261],[132,261]],
  top:       [[110,69],[100,99],[108,99],[116,99],[97,131],[118,131],[110,158],[115,148],[99,171],[120,171],[98,211],[126,211],[82,261],[131,261]],
  downswing: [[101,67],[91,97],[102,97],[113,97],[97,129],[119,129],[118,152],[117,148],[103,169],[121,169],[91,210],[119,210],[70,261],[119,261]],
  impact:    [[99,67],[91,97],[101,97],[112,97],[103,129],[125,129],[107,153],[125,148],[101,170],[125,170],[85,211],[116,211],[58,262],[115,262]],
  finish:    [[115,68],[102,98],[110,98],[117,98],[105,130],[124,130],[112,153],[110,149],[106,170],[116,170],[92,211],[115,211],[71,262],[109,262]],
};
/* coached joints per phase (shoulder = trail shoulder, spine = waist, wrist = hands) */
const PHASE_HS = {
  address  : { shoulder:[93,100], spine:[106,150], wrist:[99,154],  pelvis:[96,170] },
  takeaway : { shoulder:[94,97],  spine:[109,145], wrist:[109,153], pelvis:[98,169] },
  top      : { shoulder:[100,99], spine:[115,148], wrist:[110,158], pelvis:[99,171] },
  downswing: { shoulder:[91,97],  spine:[117,148], wrist:[118,152], pelvis:[103,169] },
  impact   : { shoulder:[91,97],  spine:[125,148], wrist:[107,153], pelvis:[101,170] },
  finish   : { shoulder:[102,98], spine:[110,149], wrist:[112,153], pelvis:[106,170] },
};
/* which drawn dot (if any) corresponds to a coached joint — nearest within 7 units */
function coachedJointAt(phase, pt){
  const ph=String(phase).toLowerCase(), hs=liveHS(ph)||PHASE_HS[ph]; if(!hs) return null;
  for(const [j,[x,y]] of Object.entries(hs))
    if((pt[0]-x)*(pt[0]-x)+(pt[1]-y)*(pt[1]-y) < 49) return j;
  return null;
}
/* tap targets over the hand-drawn dots — the joints flagged for this phase get
   a solid orange marker; the rest stay invisible until hovered/focused */
function skeletonLayer(phase){
  const ph=String(phase).toLowerCase();
  const pts=liveDots(ph)||PHASE_DOTS[ph]; if(!pts) return '';
  const alertJoints=new Set(HS().filter(h=>h.st[ph]==='alert').map(h=>h.id));
  const dots=pts.map(([x,y],i)=>{
    const j=coachedJointAt(ph,[x,y]);
    const bad=!!j && alertJoints.has(j);
    return `<g class="jd${bad?' jd-bad':''}" data-act="jz:${i}" tabindex="0" role="button"
       aria-label="${bad?'Needs work — joint close-up':'Joint close-up'}">
       ${bad?`<circle class="jd-mark" cx="${x}" cy="${y}" r="4.6"/>`:''}
       <circle class="jd-hit" cx="${x}" cy="${y}" r="8"/></g>`;
  }).join('');
  return `<g class="skel">${dots}</g>`;
}
/* how far to zoom for each joint's close-up crop (half-width, in viewBox units) */
const JOINT_ZOOM = { shoulder:40, spine:46, wrist:42, pelvis:42 };
const photoImage = (src=PHOTO_SRC, h=200) => `<image href="${src}" x="0" y="0" width="200" height="${h}" preserveAspectRatio="xMidYMid slice"/>`;
/* Before / After compares the same phase twice — address, the setup posture the
   whole session is measured against */
function buildSkeleton(cls=''){
  return `<img class="ba-pose ${cls}" src="${PHASE_AVATAR.address}" alt="Address posture" decoding="async">`;
}

/* per-phase swing photos for the "Posture by phase" strip — one still per phase,
   all cropped from the same-scale render so they read as a sequence */
const PHASE_POSE = PHASE_AVATAR;   // same stills serve the "Posture by phase" strip
function phasePose(phaseKey, cls=''){
  const k=String(phaseKey).toLowerCase(), src = (curRecord&&curRecord.frames&&curRecord.frames[k]) || PHASE_POSE[k];
  if(!src) return buildSkeleton(cls);
  return `<img class="pose ${cls}" src="${src}" alt="${cap(phaseKey)} posture" loading="lazy" decoding="async">`;
}

/* hotspots — golf-posture joints only (no health/medical metrics) */
const HOTSPOTS=[
  { id:'shoulder', joint:'shR', name:'Shoulder rotation',
    st:{address:'good',takeaway:'good',top:'alert',downswing:'good',impact:'good',finish:'good'},
    m:{address:['Turn 10°','Coiling on plane'], takeaway:['Turn 42°','One-piece takeaway'],
       top:['Turn 104°','+14° past your top'], downswing:['Turn 66°','Unwinding on plane'],
       impact:['Turn 42°','Square to target'], finish:['Full','Released through']},
    coach:{top:'Stop the backswing a touch shorter — the shoulder is over-rotating at the top.',
           _:'Shoulder line is tracking well through this phase.'} },
  { id:'spine', joint:'spine', name:'Spine angle',
    st:{address:'good',takeaway:'good',top:'good',downswing:'alert',impact:'good',finish:'good'},
    m:{address:['34°','Set at address'], takeaway:['34°','Held from address'],
       top:['33°','Held from address'], downswing:['29°','Standing up 5° early'],
       impact:['36°','Recovered near address'], finish:['—','Tall & balanced']},
    coach:{downswing:'You’re standing up out of the shot early — feel your chest stay down through the ball.',
           _:'Spine angle is holding steady.'} },
  { id:'wrist', joint:'hand', name:'Wrist release',
    st:{address:'good',takeaway:'good',top:'good',downswing:'good',impact:'alert',finish:'good'},
    m:{address:['Neutral','Set at address'], takeaway:['Setting','Hinge starting'],
       top:['Hinged','Fully loaded'], downswing:['Held','Lag retained'],
       impact:['Late 0.05s','Releasing behind the ball'], finish:['Unhinged','Complete']},
    coach:{impact:'Start the release a hair earlier so the face squares at the ball, not after it.',
           _:'Release timing looks on schedule.'} },
  { id:'pelvis', joint:'hip', name:'Weight transfer',
    st:{address:'good',takeaway:'good',top:'good',downswing:'good',impact:'good',finish:'good'},
    m:{address:['50%','Centered'], takeaway:['58% trail','Loading the trail side'],
       top:['62% trail','Loaded into the trail side'], downswing:['54% lead','Shift started'],
       impact:['78% lead','+6% vs last — driving forward'], finish:['92% lead','Fully through']},
    coach:{_:'Weight transfer onto the lead side is improving — keep it up.'} },
];
const hsPoint=(id,phase)=>{ const ph=phase&&String(phase).toLowerCase(), l=ph&&liveHS(ph);
  return (l&&l[id]) || (ph&&PHASE_HS[ph]&&PHASE_HS[ph][id]) || PHOTO_HOTSPOTS[id]; };

/* The avatar/detail engine reads its joints from the "active record", so the
   same view serves today's report AND any past day opened from the calendar. */
let curRecord=null;
const HS = () => (curRecord && curRecord.hotspots) || HOTSPOTS;

/* only the red leader + callout for flagged joints — the tappable dots come from skeletonLayer */
function markerLayer(phase){
  const alerts=HS().filter(h=>h.st[phase]==='alert').map(h=>({h, p:hsPoint(h.id,phase)}));
  return alerts.slice(0,2).map((a,i)=>{
    const left=i===0, [jx,jy]=a.p, cw=72, ch=25;
    const cx=left?3:200-3-cw, cyr=jy-ch/2, cy=Math.max(5,Math.min(VBH-ch-5,cyr));
    const ax=left?cx+cw:cx, ay=cy+ch/2, m=a.h.m[phase];
    return `<line class="lead" x1="${jx}" y1="${jy}" x2="${ax}" y2="${ay}" pathLength="1"/>
      <g class="callout" data-act="hs:${a.h.id}" tabindex="0" role="button" aria-label="${a.h.name}">
        <rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" rx="7"/>
        <text class="co-t" x="${cx+8}" y="${cy+10}">${a.h.name}</text>
        <text class="co-v" x="${cx+8}" y="${cy+20}">${m[0]}</text></g>`;
  }).join('');
}
/* All six stills are stacked and cross-faded, so stepping through them plays the
   swing back as motion instead of swapping pictures. */
function avatarSVG(phase){
  return SWING_FRAMES.map(k=>
      `<img class="glow-photo${k===phase?' on':''}" data-ph="${k}" src="${phaseAvatarSrc(k)}" alt=""/>`).join('')
    + `<svg class="mk-layer" viewBox="0 0 200 ${VBH}">${skeletonLayer(phase)+markerLayer(phase)}</svg>`;
}

/* --------------------------------------------------------- charts (svg) -- */
function lineChart(cfg){
  const W=320,H=150,pL=6,pR=6,pT=14,pB=22;
  const vs=cfg.values, n=vs.length;
  const all=vs.concat([cfg.baseline]);
  let lo=Math.min(...all), hi=Math.max(...all);
  const pad=(hi-lo)*.25||1; lo-=pad; hi+=pad;
  const X=i=>pL+(W-pL-pR)*(i/(n-1));
  const Y=v=>pT+(H-pT-pB)*(1-(v-lo)/(hi-lo));
  const pts=vs.map((v,i)=>[X(i),Y(v)]);
  const line=pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
  const area=line+` L ${X(n-1).toFixed(1)} ${H-pB} L ${pL} ${H-pB} Z`;
  const by=Y(cfg.baseline);
  const dots=pts.map((p,i)=>{
    const last=i===n-1;
    return `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${last?4.5:2.6}" fill="${last?'#5C8228':'#F3F7E2'}" stroke="#5C8228" stroke-width="1.8"/>`
      + (last?`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="9" fill="none" stroke="#5C8228" stroke-opacity=".3" stroke-width="1.5"/>`:'');
  }).join('');
  const labels=cfg.labels.map((l,i)=>`<text x="${X(i).toFixed(1)}" y="${H-6}" fill="#5E6156" font-size="9" font-weight="600" text-anchor="middle">${l}</text>`).join('');
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}">
    <defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#5C8228" stop-opacity=".22"/>
      <stop offset="1" stop-color="#5C8228" stop-opacity="0"/></linearGradient></defs>
    <line x1="${pL}" y1="${by.toFixed(1)}" x2="${W-pR}" y2="${by.toFixed(1)}" stroke="#5E6156" stroke-width="1" stroke-dasharray="4 4"/>
    <text x="${W-pR}" y="${(by-6).toFixed(1)}" fill="#6E7460" font-size="9" font-weight="700" text-anchor="end">BASELINE ${cfg.baseline}</text>
    <path d="${area}" fill="url(#ag)"/>
    <path d="${line}" fill="none" stroke="#5C8228" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
    ${dots}${labels}
  </svg></div>`;
}
function sparkline(vs){
  const W=100,H=28,p=3;
  const lo=Math.min(...vs),hi=Math.max(...vs),r=hi-lo||1;
  const X=i=>p+(W-2*p)*(i/(vs.length-1));
  const Y=v=>p+(H-2*p)*(1-(v-lo)/r);
  const d=vs.map((v,i)=>(i?'L':'M')+X(i).toFixed(1)+' '+Y(v).toFixed(1)).join(' ');
  const lx=X(vs.length-1).toFixed(1), ly=Y(vs[vs.length-1]).toFixed(1);
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <path d="${d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${lx}" cy="${ly}" r="2.4" fill="currentColor"/></svg>`;
}
function ring(pct,size=118,sw=11){
  const r=(size-sw)/2, c=2*Math.PI*r, off=c*(1-pct/100);
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="rgba(20,24,14,.08)" stroke-width="${sw}"/>
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="#3F5F58" stroke-width="${sw}"
      stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/></svg>`;
}
const deltaHTML=(dir,txt)=>{
  const ic = dir==='up' ? '<path d="M12 19V5M6 11l6-6 6 6"/>'
           : dir==='down' ? '<path d="M12 5v14M6 13l6 6 6-6"/>'
           : '<path d="M5 12h14"/>';
  return `<span class="delta ${dir}">${svgIco(ic,'stroke="currentColor" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"')}${txt}</span>`;
};

/* ================================================================ HOME === */
function renderHome(){
  const d=DATA, u=d.user;
  const fresh = !state.hasBaseline;               // onboarded but no first session yet
  const rd = u.roundInDays;                        // may be null (no round scheduled)
  const focus = !fresh && rd!=null && rd<=3;
  const adjusted = !fresh && (state.mood===2 || state.areas.size>0);
  const streak = fresh?0:u.streak;
  const week = fresh?0:u.weekSessions;

  const lastScore = d.report.success;
  // readiness going into tonight — streak + weekly consistency, trimmed on a rough day
  const ready = fresh ? null : Math.max(55, Math.min(99, 62 + streak*3 + week*4 - (state.mood===2?14:0)));
  const clock = c => svgIco(I.clock, `stroke="${c}" fill="none" stroke-width="1.9"`);
  const picked = d.missions.find(m=>m.id===state.pickedMission) || d.missions[4];

  return `
    <div class="hm-head">
      <div class="hm-titles">
        <div class="hm-kicker">${fresh?'Welcome.':'Tonight.'}</div>
        <div class="hm-sub">${fresh?'Set your baseline':`${picked.mode} · ${picked.min} min`}</div>
      </div>
      <button class="hm-ava" data-act="nav:profile" aria-label="Profile">${u.initial}</button>
    </div>

    <div class="hm-hero">
      <span class="hm-big">${fresh?'Day 0':ready}${fresh?'':'<i>%</i>'}</span>
      ${fresh?'':`<span class="hm-caret">${svgIco('<path d="M7 14l5-5 5 5"/>','stroke="currentColor" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"')}</span>`}
    </div>
    <div class="hm-herolab${fresh?' is-fresh':''}">${fresh
      ? 'Your first session reads your starting posture'
      : 'Readiness · from your streak and weekly consistency'}</div>

    <div class="hm-bar">
      <div class="hm-bar-top"><span>This week</span><span>${week} / 5</span></div>
      <div class="hm-track"><i style="width:${Math.max(3, week/5*100)}%"></i></div>
    </div>

    <div class="hm-tiles">
      <button class="hm-tile" data-act="nav:growth" aria-label="Open Growth">
        <span class="hm-tl">Day streak</span>
        <span class="hm-ti">${svgIco(I.bolt,'fill="var(--lime-deep)" stroke="none"')}</span>
        <span class="hm-tv">${fresh?'0':streak}</span>
      </button>
      <button class="hm-tile" data-act="nav:report" aria-label="Open last report">
        <span class="hm-tl">Last session</span>
        <span class="hm-ti">${clock('var(--lime-deep)')}</span>
        <span class="hm-tv">${lastScore}<i>%</i></span>
      </button>
    </div>

    <div class="hm-picktitle">
      <span class="eyebrow">Tonight’s mission</span>
      <span class="small dim">swipe to choose</span>
    </div>
    <div class="mpick">
      ${d.missions.filter(m=>!m.done).map(m=>`
        <button class="mp-card" data-act="pickm:${m.id}" aria-pressed="${m.id===picked.id}">
          <div class="mp-head">
            <div class="mp-mode">${m.mode}</div>
            <div class="mp-short">${m.short}</div>
          </div>
          <div class="mp-num">${m.min}<i>min</i></div>
          <div class="mp-foot">${m.rec?'Recommended':m.diff}</div>
        </button>`).join('')}
    </div>
  `;
}

/* ============================================================== REPORT === */
const sUp   = v => [v-8,v-6,v-4,v-2,v];
const sDown = v => [v+7,v+6,v+5,v+3,v];

/* today's record (from DATA.report) and per-day past records share one shape */
function todayRecord(){
  const r=DATA.report;
  return { label:r.date, hotspots:HOTSPOTS, finding:r.finding, phases:r.phases,
    metrics:r.metrics, success:r.success, streak:r.streak, improved:r.improved, total:r.total,
    note:'Felt steadier at impact than last time.' };
}
/* Deterministic sample for a past calendar day — earlier days sit closer to the
   baseline, later days show the improvement story. Golf-posture metrics only. */
function makeRecord(day){
  const done=DATA.growth.done, idx=Math.max(0,done.indexOf(day)), n=done.length;
  const prog = n>1 ? idx/(n-1) : 1;                 // 0 earliest .. 1 latest
  const b = prog<.34?0 : prog<.7?1 : 2;             // rough / improving / sharp
  const head=Math.round(78+prog*15), weight=Math.round(63+prog*18), tempo=2.7+prog*0.35;
  const spineAng=Math.round(41-prog*6), drop=spineAng-34, shTop=Math.round(96+(b<2?12:2));
  const G={address:'good',takeaway:'good',top:'good',downswing:'good',impact:'good',finish:'good'};
  const st={
    shoulder:{...G, top:b<2?'alert':'good'},
    spine:{...G, downswing:b===0?'alert':'good'},
    wrist:{...G, impact:b===0?'alert':'good'},
    pelvis:{...G},
  };
  const hs=HOTSPOTS.map(h=>{
    const o={...h, st:st[h.id], m:{...h.m}};
    if(h.id==='spine')    o.m={...h.m, downswing:[`${spineAng}°`, drop>1?`Standing up ${drop}° early`:'Held your angle through']};
    if(h.id==='shoulder') o.m={...h.m, top:[`Turn ${shTop}°`, b<2?`+${shTop-92}° past your top`:'On plane']};
    if(h.id==='wrist')    o.m={...h.m, impact: st.wrist.impact==='alert'?['Late 0.05s','Releasing behind the ball']:['On time','Squares at the ball']};
    if(h.id==='pelvis')   o.m={...h.m, impact:[`${weight}% lead`,'Driving onto the lead side']};
    return o;
  });
  const wristAlert = st.wrist.impact==='alert';
  const metrics=[
    {k:'Tempo', v:tempo.toFixed(1), sub:':1 back·down', dir:'up', d:'+'+(0.1*(1+idx%2)).toFixed(1), spark:[2.6,2.7,2.7,+(tempo-.1).toFixed(1),+tempo.toFixed(1)]},
    {k:'Head Steadiness', v:''+head, sub:'%', dir:'up', d:'+'+(2+b), spark:sUp(head)},
    {k:'Weight Transfer', v:''+weight, sub:'% to lead', dir:'up', d:'+'+(3+b), spark:sUp(weight)},
    wristAlert
      ? {k:'Wrist Release', v:'Late', sub:'timing', dir:'down', d:'−3', spark:sDown(84), warn:true}
      : {k:'Wrist Release', v:'On time', sub:'timing', dir:'up', d:'+2', spark:sUp(86)},
  ];
  const phases=PHASES.map(p=>({k:p.label, warn: hs.some(h=>h.st[p.key]==='alert')}));
  const finding = b===0
    ? 'Early session — the top over-rotated and you lost spine angle at impact. A clear place to build from.'
    : b===1 ? 'Cleaner through impact today. The one thing left is trimming the over-rotation at the top.'
    : 'Sharp from address to finish — posture held all the way through the strike.';
  return { label:`Jul ${day}, 2026`, hotspots:hs, finding, phases, metrics,
    success: Math.round(66+prog*24+(day%3)*2), streak: idx+1,
    improved: metrics.filter(m=>m.dir==='up').length, total:4,
    note: b===2?'Best it’s felt in weeks.':b===1?'Getting more repeatable.':'Rough, but a start.' };
}

/* the interactive avatar + finding + phases + metrics — reused by the report
   screen AND the calendar's past-day modal (data comes from `rec`) */
function reportContent(rec, opts={}){
  const bl=!!opts.bl, flagged=rec.phases.filter(p=>p.warn).length;
  return `
    <div class="avatar-stage" style="margin-top:6px">
      <div class="avatar-grid"></div>
      <div id="avatarWrap" class="avatarWrap">${avatarSVG(state.reportPhase)}</div>
      <button class="swing-play" data-act="swingplay" aria-label="Play the swing">
        <svg viewBox="0 0 24 24" class="ic-play"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>
        <svg viewBox="0 0 24 24" class="ic-pause"><rect x="7.6" y="5.5" width="3.2" height="13" rx="1.1" fill="currentColor"/><rect x="13.2" y="5.5" width="3.2" height="13" rx="1.1" fill="currentColor"/></svg>
      </button>
    </div>
    <div class="seg seg-6" id="phaseSwitch" style="margin-top:10px">
      ${PHASES.map(p=>`
        <button data-act="rphase:${p.key}" aria-selected="${state.reportPhase===p.key}">${p.short}</button>`).join('')}
    </div>
    <div class="small dim center pseg-cap">Joint recognition · full-body tracking · flagged = needs work</div>

    <div class="card card-tight" style="margin-top:14px;border-color:rgba(63,95,88,.22)">
      <span class="eyebrow">${bl?'Where you’re starting':'Key finding'}</span>
      <div class="body" style="margin-top:7px;font-weight:600">${bl
        ? 'Here’s your Day-0 read. Nothing to compare against yet — from tonight on, ARVIA tracks every change against these numbers.'
        : rec.finding}</div>
    </div>

    <div class="sec-title"><span class="h3">Posture by phase</span>
      <span class="small dim">${flagged?`${flagged} flagged`:'all clear'}</span></div>
    <div class="frames">
      ${rec.phases.map(p=>`
        <div class="frame ${p.warn?'warn':''}">
          ${p.warn?'<span class="flag">!</span>':''}
          <div class="mini pose-mini">${phasePose(p.k, p.warn?'warn':'')}</div>
          <div class="fl">${p.k}</div>
        </div>`).join('')}
    </div>

    <div class="sec-title"><span class="h3">Swing metrics</span>
      <span class="small ${bl?'dim':'lime'}">${bl?'Your Day-0 numbers':`${rec.improved} of ${rec.total} improved`}</span></div>
    <div class="bento">
      ${rec.metrics.map(m=>`
        <div class="card metric">
          <div class="ml">${m.k}</div>
          <div class="mv" style="${m.warn?'color:var(--alert)':''}">${m.v}<small>${/^[:%]/.test(m.sub)?'':' '}${m.sub}</small></div>
          ${bl?'<span class="delta flat" style="margin-top:7px">baseline</span>':deltaHTML(m.dir, m.d)}
          ${bl?'':`<div style="color:${m.warn?'var(--alert)':'var(--lime-deep)'}">${sparkline(m.spark)}</div>`}
        </div>`).join('')}
    </div>

    ${bl?`
    <div class="bento" style="margin-top:12px">
      <div class="card v-between" style="min-height:132px">
        <span class="eyebrow">Baseline</span>
        <div><span class="big lime">Day 0</span>
          <div class="small dim" style="margin-top:6px">Saved ${DATA.user.baselineDate}</div></div>
      </div>
      <div class="card v-between" style="min-height:132px">
        <span class="eyebrow">Streak</span>
        <div><span class="big">1</span><span class="unit"> day</span>
          <div class="small dim" style="margin-top:6px">It starts tonight — keep it going</div></div>
      </div>
    </div>`:`
    <div class="bento" style="margin-top:12px">
      <div class="card-lime card v-between hero-duo">
        <span class="eyebrow">Mission success</span>
        <div class="hd-fig"><span class="mega" style="font-size:52px">${rec.success}</span><span class="unit" style="font-size:21px;font-weight:800;color:rgba(12,13,9,.62)">%</span></div>
        <div class="hd-cap" style="color:#fff">${rec.missionName||'Impact stability'}</div>
      </div>
      <div class="card v-between hero-duo">
        <span class="eyebrow">Streak</span>
        <div class="hd-fig hd-ring">
          ${ring(rec.streak/7*100,80,7.5)}
          <div class="hd-ringnum"><div class="med hd-n">${rec.streak}</div>
            <div class="small dim hd-d">days</div></div>
        </div>
        <div class="hd-cap dim">Keep the run going</div>
      </div>
    </div>`}`;
}

/* Putting session → game-result report (no posture avatar, no spine/weight metrics) */
function renderPuttReport(){
  const p=state.livePutt||DATA.puttReport, live=!!state.livePutt, bl=state.baselineJustSet, rate=Math.round(p.made/Math.max(1,p.attempts)*100);
  return `
    <div class="head">
      <button class="icon-btn" data-act="nav:home" aria-label="Back">${svgIco(I.back)}</button>
      <div class="head-titles center" style="flex:1">
        <div class="eyebrow">${live&&p.demo?'Putting · demo golfer':'Putting · game result'}</div>
        <div class="h3" style="margin-top:2px">${bl?'Tonight · first session':p.date}</div>
      </div>
      <button class="icon-btn" data-act="toast:Report saved to your records" aria-label="Share">${svgIco(I.share)}</button>
    </div>

    <div class="card-lime card-xl" style="margin-top:6px;text-align:center;padding:26px 22px">
      <span class="eyebrow">Mission success</span>
      <div style="margin-top:8px"><span class="mega" style="font-size:72px">${p.made}</span><span class="unit" style="font-size:30px;font-weight:800">/${p.attempts}</span></div>
      <div class="small dim" style="margin-top:4px">${live?'clean strokes':'putts made'} · ${rate}%${bl||live?'':` · up from ${p.lastMade}/${p.attempts} last time`}</div>
      <div class="meter" style="margin:16px auto 0;max-width:220px"><i style="width:${rate}%"></i></div>
    </div>

    <div class="card card-tight" style="margin-top:12px;border-color:rgba(63,95,88,.28)">
      <span class="eyebrow">Key finding</span>
      <div class="body" style="margin-top:7px;font-weight:600">${bl?'Your Day-0 putting read. From here, every session compares to these numbers.':p.finding}</div>
    </div>

    <div class="sec-title"><span class="h3">Putting result</span>
      <span class="small ${bl?'dim':'lime'}">${bl?'Your Day-0 numbers':live?'Tracked tonight':'vs last session'}</span></div>
    <div class="bento">
      <div class="card metric">
        <div class="ml">${live?'Length control':'Distance accuracy'}</div>
        <div class="mv">${p.avgError}<small> cm ${live?'spread':'avg miss'}</small></div>
        ${bl?'<span class="delta flat" style="margin-top:7px">baseline</span>':live?deltaHTML('flat','this session'):deltaHTML('up', `${p.avgErrorGain}cm tighter`)}
        <div style="color:var(--lime-deep)">${sparkline(p.accSpark)}</div>
      </div>
      <div class="card metric">
        <div class="ml">Tempo consistency</div>
        <div class="mv">${p.tempo}<small> %</small></div>
        ${bl?'<span class="delta flat" style="margin-top:7px">baseline</span>':live?deltaHTML('flat','this session'):deltaHTML('up', `+${p.tempoDelta} vs last`)}
        <div style="color:var(--lime-deep)">${sparkline(p.tempoSpark)}</div>
      </div>
    </div>

    <div class="bento" style="margin-top:12px">
      <div class="card v-between" style="min-height:150px">
        <span class="eyebrow">Streak</span>
        <div class="row" style="align-items:center;gap:14px">
          <div style="position:relative;width:96px;height:96px">
            ${ring((bl?1:p.streak)/7*100,96,10)}
            <div style="position:absolute;inset:0;display:grid;place-items:center;text-align:center">
              <div><div class="med">${bl?1:p.streak}</div><div class="small dim" style="font-size:10px">days</div></div></div>
          </div>
        </div>
        <div class="small dim">${bl?'It starts tonight':'Keep the run going'}</div>
      </div>
      <div class="card v-between" style="min-height:150px">
        <span class="eyebrow">${bl?'Baseline':live?'Tonight':'Change vs last'}</span>
        ${bl?`<div><span class="big lime">Saved</span><div class="small dim" style="margin-top:6px">Starting point · ${DATA.user.baselineDate}</div></div>`
           :live?`<div class="stack" style="width:100%">
              <div class="row between"><span class="small dim">Clean strokes</span><span class="small lime" style="font-weight:700">${p.made}/${p.attempts}</span></div>
              <div class="row between"><span class="small dim">Length spread</span><span class="small lime" style="font-weight:700">${p.avgError} cm</span></div>
              <div class="row between"><span class="small dim">Tempo</span><span class="small lime" style="font-weight:700">${p.tempo}%</span></div>
            </div>`
           :`<div class="stack" style="width:100%">
              <div class="row between"><span class="small dim">Putts made</span><span class="small lime" style="font-weight:700">+${p.made-p.lastMade}</span></div>
              <div class="row between"><span class="small dim">Avg miss</span><span class="small lime" style="font-weight:700">−${p.avgErrorGain} cm</span></div>
              <div class="row between"><span class="small dim">Tempo</span><span class="small lime" style="font-weight:700">+${p.tempoDelta}%</span></div>
            </div>`}
      </div>
    </div>

    <div class="card" style="margin-top:12px">
      <span class="eyebrow">One-line reflection</span>
      <textarea class="input" id="reflect" rows="2" style="margin-top:12px" placeholder="How did tonight feel? (optional)"></textarea>
      <button class="btn btn-primary" data-act="save-reflect" style="margin-top:14px;height:50px;font-size:15px">
        ${svgIco(I.check,'stroke="var(--lime-ink)" fill="none" stroke-width="2.4" style="width:18px;height:18px"')} Save &amp; finish</button>
    </div>
  `;
}

function renderReport(){
  if(state.sessionType==='putt') return renderPuttReport();
  curRecord = state.liveRecord || todayRecord();    // active data for the avatar — tonight’s tracked swings when there are any
  const bl=state.baselineJustSet, rec=curRecord;
  return `
    <div class="head">
      <button class="icon-btn" data-act="nav:home" aria-label="Back">${svgIco(I.back)}</button>
      <div class="head-titles center" style="flex:1">
        <div class="eyebrow">${rec.demo?'Session report · demo golfer':'Session report'}</div>
        <div class="h3" style="margin-top:2px">${bl?'Tonight · first session':rec.label}</div>
      </div>
      <button class="icon-btn" data-act="toast:Report saved to your records" aria-label="Share">${svgIco(I.share)}</button>
    </div>

    ${reportContent(rec,{bl})}

    <div class="card" style="margin-top:12px">
      <span class="eyebrow">One-line reflection</span>
      <textarea class="input" id="reflect" rows="2" style="margin-top:12px"
        placeholder="How did tonight feel? (optional)"></textarea>
      <button class="btn btn-primary" data-act="save-reflect" style="margin-top:14px;height:50px;font-size:15px">
        ${svgIco(I.check,'stroke="var(--lime-ink)" fill="none" stroke-width="2.4" style="width:18px;height:18px"')} Save &amp; finish</button>
    </div>
  `;
}

/* ---- Past-day record modal (opened from the calendar) -------------------- */
function openDayRecord(day, originEl){
  const rec=makeRecord(day);
  curRecord=rec; state.reportPhase='address';
  let o=$('#record');
  if(!o){ o=document.createElement('div'); o.id='record'; o.className='record-overlay';
    $('#phone').appendChild(o);                          // mount inside the phone frame
    o.addEventListener('click',e=>{ if(e.target===o || e.target.classList.contains('record-back')) closeDayRecord(); });
  }
  o.innerHTML=`<div class="record-back"></div>
    <div class="record-card">
      <div class="record-head">
        <div><div class="eyebrow">Past session</div><div class="h3" style="margin-top:2px">${rec.label}</div></div>
        <button class="icon-btn sm" data-act="record-close" aria-label="Close">${svgIco(I.x)}</button>
      </div>
      <div class="record-scroll">
        ${reportContent(rec,{})}
        <div class="card card-tight" style="margin-top:12px">
          <span class="eyebrow">Your note that day</span>
          <div class="body" style="margin-top:7px;font-weight:600">${rec.note}</div>
        </div>
      </div>
    </div>`;
  o.classList.add('show');
  growFrom(o.querySelector('.record-card'), originEl);   // grow out of the tapped day
  setTimeout(()=>o.classList.add('in'),20);              // reveal (fires even when rAF is throttled)
}
function closeDayRecord(){
  const o=$('#record'); if(!o || !o.classList.contains('show')) return;
  closeDetail();
  o.classList.remove('in');
  const done=()=>{ o.classList.remove('show'); o.innerHTML=''; curRecord=null; };
  const card=o.querySelector('.record-card');
  if(card) card.addEventListener('transitionend',done,{once:true});
  setTimeout(done,380);
}
function hardCloseRecord(){ const o=$('#record'); if(o){ o.className='record-overlay'; o.innerHTML=''; } }

/* ============================================================== GROWTH === */
function renderGrowth(){
  const g=DATA.growth;
  const tabBody = state.growthTab==='ba' ? beforeAfterView(g) : calendarView(g);

  return `
    <div class="head">
      <div class="head-titles"><div class="eyebrow">Your progress</div>
        <div class="h1" style="margin-top:3px">Growth</div></div>
      <button class="icon-btn" data-act="toast:Filter — coming soon" aria-label="Filter">${svgIco(I.cal)}</button>
    </div>

    ${speedGauge(g)}
    ${recordBars(g)}

    <div class="bento" style="margin-top:14px">
      <div class="card-lime card v-between col-2" style="min-height:0;padding:20px 22px">
        <div class="row between">
          <span class="eyebrow">This week</span>
          <span class="pill pill-dark">${g.weekSessions}/${g.weekGoal} sessions</span>
        </div>
        <div class="row between" style="align-items:flex-end;margin-top:16px">
          <div><span class="mega" style="font-size:58px;color:var(--lime-ink)!important">${g.weekMin}</span><span class="unit" style="font-weight:800"> min trained</span></div>
          <div class="small" style="color:rgba(12,13,9,.72);text-align:right;font-weight:650">Since baseline<br>${DATA.user.baselineDate}</div>
        </div>
        <div class="meter" style="margin-top:16px"><i style="width:${g.weekSessions/g.weekGoal*100}%"></i></div>
      </div>
    </div>

    <div class="seg" style="margin-top:16px">
      ${[['calendar','Calendar'],['ba','Before / After']].map(([k,l])=>`
        <button data-act="gtab:${k}" aria-selected="${state.growthTab===k}">${l}</button>`).join('')}
    </div>

    <div style="margin-top:16px">${tabBody}</div>
  `;
}
/* headline: best club-head speed on a half-circle gauge */
function speedGauge(g){
  const sp=g.speed;
  const pct=Math.max(0,Math.min(1,(sp.best-sp.floor)/(sp.ceil-sp.floor)));
  const LEN=263.9;                       // half-circle, r=84
  const d='M16 100 A84 84 0 0 1 184 100';
  const up=sp.best-sp.prev;
  return `
    <div class="card card-xl gauge-card" style="margin-top:6px">
      <div class="row between">
        <span class="h3">Max club speed</span>
        <button class="icon-btn sm" data-act="toast:Speed history — coming soon" aria-label="Speed history">${svgIco(I.chev)}</button>
      </div>
      <div class="gauge-wrap">
        <svg class="gauge" viewBox="0 0 200 112" aria-hidden="true">
          <defs>
            <linearGradient id="gaugeGrad" gradientUnits="userSpaceOnUse" x1="16" y1="104" x2="184" y2="40">
              <stop offset="0" stop-color="#22371F"/>
              <stop offset=".42" stop-color="#3F5F58"/>
              <stop offset=".78" stop-color="#5A8666"/>
              <stop offset="1" stop-color="#7DAE87"/>
            </linearGradient>
          </defs>
          <path class="g-track" d="${d}"/>
          <path class="g-fill" d="${d}" stroke-dasharray="${LEN}" stroke-dashoffset="${(LEN*(1-pct)).toFixed(1)}"/>
        </svg>
        <div class="gauge-num"><b>${sp.best}</b><span>${sp.unit}</span></div>
      </div>
      <div class="gauge-foot"><span>${sp.floor}</span><span>${sp.ceil}</span></div>
      <div class="row between" style="margin-top:12px">
        <span class="small dim">${sp.when}</span>
        ${deltaHTML('up',`+${up} ${sp.unit} vs last`)}
      </div>
    </div>`;
}
/* club speed over time — a thin line on a soft gradient wash, with the peak
   flagged by a point-colour tick (see the Temperature reference) */
const REC_RANGES=[['w','W',8],['m','M',16],['3m','3M',28],['6m','6M',42],['all','All',56]];
/* Catmull-Rom through the points, emitted as cubic Béziers — every corner rounds
   off, and the tension keeps the curve from overshooting past a peak */
function smoothPath(p, t=.82){
  if(p.length<3) return 'M'+p.map(q=>q.join(' ')).join(' L');
  let d=`M${p[0][0]} ${p[0][1]}`;
  for(let i=0;i<p.length-1;i++){
    const p0=p[i-1]||p[i], p1=p[i], p2=p[i+1], p3=p[i+2]||p2;
    const c1x=p1[0]+(p2[0]-p0[0])/6*t, c1y=p1[1]+(p2[1]-p0[1])/6*t;
    const c2x=p2[0]-(p3[0]-p1[0])/6*t, c2y=p2[1]-(p3[1]-p1[1])/6*t;
    d+=` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0]} ${p2[1]}`;
  }
  return d;
}
function recordBars(g){
  const rng=REC_RANGES.find(r=>r[0]===state.recRange)||REC_RANGES[4];
  const v=g.records.slice(-rng[2]), n=v.length;
  const W=340, H=150, padT=26, padB=10;
  const max=Math.max(...v), min=Math.min(...v), span=(max-min)||1;
  const X=i=>+(i/(n-1)*W).toFixed(1);
  const Y=val=>+(padT+(1-(val-min)/span)*(H-padT-padB)).toFixed(1);
  const pts=v.map((val,i)=>[X(i),Y(val)]);
  const line=smoothPath(pts);
  const area=`${line} L${W} ${H} L0 ${H} Z`;
  const gy=t=>+(padT+t*(H-padT-padB)).toFixed(1);
  const grid=[0,.33,.66,1].map(t=>`<line class="rc-grid" x1="0" y1="${gy(t)}" x2="${W}" y2="${gy(t)}"/>`).join('')
           + [.25,.5,.75].map(t=>`<line class="rc-grid" x1="${(t*W).toFixed(1)}" y1="${padT}" x2="${(t*W).toFixed(1)}" y2="${H}"/>`).join('');
  const pi=v.indexOf(max), px=Math.min(W-1.5,Math.max(1.5,X(pi))), py=Y(max);
  const lx=Math.min(W-22,Math.max(22,px));
  return `
    <div class="card card-xl" style="margin-top:12px">
      <div class="rc-range">
        ${REC_RANGES.map(([k,l])=>`<button data-act="rrange:${k}" aria-selected="${state.recRange===k}">${l}</button>`).join('')}
      </div>
      <div class="small dim" style="margin-top:16px">Club speed · peak</div>
      <div class="rc-big">${max}<span>${g.speed.unit}</span></div>
      <svg class="rc-svg" viewBox="0 0 ${W} ${H}" aria-hidden="true">
        <defs>
          <linearGradient id="recFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#3F5F58" stop-opacity=".26"/>
            <stop offset="1" stop-color="#3F5F58" stop-opacity="0"/>
          </linearGradient>
        </defs>
        ${grid}
        <path class="rc-area" d="${area}"/>
        <path class="rc-line" d="${line}"/>
        <line class="rc-tick" x1="${px}" y1="${(py-9).toFixed(1)}" x2="${px}" y2="${(py+9).toFixed(1)}"/>
        <text class="rc-lab" x="${lx}" y="${Math.max(11,py-16).toFixed(1)}" text-anchor="middle">${max} ${g.speed.unit}</text>
      </svg>
      <div class="rec-axis" style="margin-top:4px"><span>${n} swings</span><span>Now</span></div>
    </div>
    <div class="bento" style="margin-top:12px">
      ${[['Head Steadiness','92','+18'],['Weight Transfer','78','+14'],
         ['Tempo','3.0:1','+0.4'],['Wrist Release','On time','fixed']].map(([k,v,dl])=>`
        <div class="card metric">
          <div class="ml">${k}</div>
          <div class="mv" style="font-size:23px">${v}</div>
          ${deltaHTML('up', dl==='fixed'?'stabilized':dl+' vs base')}
        </div>`).join('')}
    </div>`;
}
/* the year as a dot grid: 12 month columns × 5 week rows, filled = you trained */
function calendarView(g){
  const L='JFMAMJJASOND'.split('');
  const trained=g.weeks.flat().filter(Boolean).length;
  const rows=g.weeks.map(row=>`<div class="dc-row">${
    row.map(v=>`<i class="${v===null?'fut':(v?'on':'')}"></i>`).join('')
  }</div>`).join('');
  return `
    <div class="card card-xl dotcal-card">
      <div class="small dim center">Training year</div>
      <div class="yr-head">
        <button class="yr-arrow" data-act="toast:${g.year-1} archive — coming soon" aria-label="Previous year">
          ${svgIco(I.chev,'style="transform:rotate(180deg)"')}</button>
        <div class="yr-title">${g.year}</div>
        <button class="yr-arrow ghost" data-act="toast:${g.year+1} hasn’t started yet" aria-label="Next year">
          ${svgIco(I.chev)}</button>
      </div>
      <div class="dotcal">
        ${rows}
        <div class="dc-axis">${L.map((c,m)=>`<span class="${m>g.curMonth?'fut':''}">${c}</span>`).join('')}</div>
      </div>
      <div class="small dim center dc-cap">You trained ${trained} weeks this year — ${g.done.length} days in ${g.monthName.split(' ')[0]} alone.</div>
    </div>`;
}
function beforeAfterView(g){
  return `
    <div class="card card-xl">
      <div class="row between">
        <span class="pill pill-ghost" style="border:1px solid var(--stroke)">Baseline · ${DATA.user.baselineDate}</span>
        <span class="pill pill-lime">Now</span>
      </div>
      <div class="row" style="gap:10px;margin-top:14px;align-items:stretch">
        <div class="grow" style="border-radius:16px;border:1px solid var(--stroke)">${buildSkeleton('ghost')}</div>
        <div class="grow" style="border-radius:16px;border:1px solid var(--stroke)">${buildSkeleton()}</div>
      </div>
      <div class="row between" style="margin-top:10px">
        <span class="small dim" style="width:50%;text-align:center">Then</span>
        <span class="small lime" style="width:50%;text-align:center;font-weight:700">Tonight</span>
      </div>
    </div>
    <div class="card" style="margin-top:12px">
      <span class="eyebrow">What moved</span>
      <div style="margin-top:6px">
        ${g.ba.map(s=>`
          <div class="row between" style="padding:13px 0;border-top:1px solid var(--stroke)">
            <div><div class="h3" style="font-size:14px;font-weight:600">${s.k}</div>
              <div class="small dim" style="margin-top:3px">${s.b} → <span class="lime" style="font-weight:700">${s.a}</span></div></div>
            <span class="pill pill-lime">${s.d}</span>
          </div>`).join('')}
      </div>
    </div>`;
}

/* ============================================================ MISSIONS === */
function renderMissions(){
  const u=DATA.user, rd=u.roundInDays, cat=state.missionCat, list=DATA.missions;
  const done=list.filter(m=>m.done).length;

  const missionCard=m=>`
    <button class="card mission-card ${m.done?'is-done':''}" data-act="mission:${m.id}">
      <div class="row between" style="align-items:flex-start;gap:12px">
        <div class="grow">
          <div class="h3" style="font-weight:700">${m.goal}</div>
          <div class="row gap-6 mt-10 wrap">
            <span class="pill pill-lime"><span class="dot"></span>${m.mode}</span>
            <span class="pill">${svgIco(I.clock,'stroke="var(--ink)" fill="none" stroke-width="1.9" style="width:13px;height:13px"')}${m.min} min</span>
            <span class="pill diff-${m.diff.toLowerCase()}">${m.diff}</span>
            ${m.rec?'<span class="pill pill-lime">Today’s pick</span>':''}
          </div>
        </div>
        <span class="mcheck ${m.done?'done':''}" aria-label="${m.done?'Completed':'Not done'}">
          ${m.done?svgIco(I.check,'stroke="var(--lime-ink)" fill="none" stroke-width="3" style="width:15px;height:15px"'):''}</span>
      </div>
    </button>`;

  const section=(title,arr)=> arr.length?`
    <div class="sec-title"><span class="h3">${title}</span><span class="small dim">${arr.length} missions</span></div>
    <div class="stack">${arr.map(missionCard).join('')}</div>`:'';

  let body;
  if(cat==='all')      body = section('Swing', list.filter(m=>m.cat==='swing')) + section('Putting', list.filter(m=>m.cat==='putt'));
  else if(cat==='rec') body = `<div class="small dim" style="margin:6px 2px 12px">Picked from your softest spots in recent sessions.</div>
                                <div class="stack">${list.filter(m=>m.rec).map(missionCard).join('')}</div>`;
  else                 body = `<div class="stack">${list.filter(m=>m.cat===cat).map(missionCard).join('')}</div>`;

  return `
    <div class="head">
      <div class="head-titles"><div class="eyebrow">Train with purpose</div>
        <div class="h1" style="margin-top:3px">Missions</div></div>
      <button class="icon-btn" data-act="toast:${done} of ${list.length} missions done" aria-label="Progress">${svgIco(I.check)}</button>
    </div>

    <div class="card card-xl rp-hero" style="margin-top:6px">
      <div class="row between">
        <span class="eyebrow">Round prep</span>
        <span class="pill pill-lime">${rd!=null?`D-${rd}`:'No round set'}</span>
      </div>
      <div class="h1" style="margin-top:12px">${rd!=null?`${rd} days to ${u.roundName}`:'Get round-ready'}</div>
      <p class="body dim" style="margin-top:8px">Match-ready focus training — one set built from your softest spots this month.</p>
      <button class="btn btn-primary" data-act="roundprep" style="margin-top:18px">
        ${svgIco(I.play,'fill="var(--lime-ink)" stroke="none" style="width:18px;height:18px"')} Start round prep</button>
    </div>

    <div class="chips" style="margin-top:18px">
      ${[['all','All'],['swing','Swing'],['putt','Putting'],['rec','Recommended']].map(([k,l])=>`
        <button class="chip" data-act="mcat:${k}" aria-pressed="${cat===k}">${l}</button>`).join('')}
    </div>

    <div style="margin-top:4px">${body}</div>
  `;
}

/* ============================================================= PROFILE === */
function renderProfile(){
  const u=DATA.user;
  const settingRow=(ic,t,s,act='toast:Setting — demo')=>`
    <button class="lrow" data-act="${act}" style="width:100%;text-align:left">
      <span class="ico">${svgIco(ic)}</span>
      <span class="lm"><span class="lt" style="display:block">${t}</span><span class="ls">${s}</span></span>
      <span class="chev">${svgIco(I.chev)}</span></button>`;
  const toggleRow=(ic,t,s,on)=>`
    <div class="lrow"><span class="ico">${svgIco(ic)}</span>
      <span class="lm"><span class="lt" style="display:block">${t}</span><span class="ls">${s}</span></span>
      <button class="sw" data-act="sw" aria-checked="${on}" aria-label="${t}"></button></div>`;

  return `
    <div class="head">
      <div class="head-titles"><div class="eyebrow">Account</div>
        <div class="h1" style="margin-top:3px">Profile</div></div>
      <button class="icon-btn" data-act="toast:Edit profile — demo" aria-label="Edit">${svgIco(I.edit)}</button>
    </div>

    <div class="card card-xl" style="margin-top:6px">
      <div class="row gap-12">
        <span class="avatar-badge" style="width:56px;height:56px;font-size:22px">${u.initial}</span>
        <div class="grow"><div class="h2">${u.name}</div>
          <div class="small dim" style="margin-top:2px">Member since ${u.baselineDate}</div></div>
      </div>
      <div class="bento gap-sm" style="margin-top:16px">
        <div class="card card-tight center"><div class="med">${u.handicap}</div><div class="small dim mt-6">Handicap</div></div>
        <div class="card card-tight center"><div class="med" style="font-size:22px;line-height:1.3">${u.goal}</div><div class="small dim mt-6">Goal</div></div>
      </div>
      <div class="card card-tight" style="margin-top:10px">
        <div class="row between"><span class="row gap-8"><span class="dot"></span><span class="small" style="font-weight:600">Next round</span></span>
          <span class="small dim">${u.roundName} · D-${u.roundInDays}</span></div>
      </div>
    </div>

    <div class="sec-title"><span class="h3">Device</span></div>
    <div class="list">
      ${settingRow(I.camera,'Camera','Joint tracking · 60 fps')}
      ${settingRow(I.laser,'Laser guide','Alignment line · medium')}
      ${settingRow(I.voice,'Voice coach','Voice: Calm — Ari')}
      ${settingRow(I.target,'Camera position','Set where the stand watches from','ob:restart')}
    </div>

    <div class="sec-title"><span class="h3">Data &amp; privacy</span></div>
    <div class="list">
      ${toggleRow(I.shield,'On-device processing','Swing video never leaves your phone',true)}
      ${toggleRow(I.bell,'Practice reminders','Weekday evenings · 8:00 PM',true)}
    </div>

    <button class="btn btn-ghost" data-act="ob:restart" style="margin-top:20px">Replay onboarding</button>
    <div class="small dim-2 center" style="margin-top:18px">ARVIA · Posture Coach — prototype</div>
  `;
}

/* ============================================================= TAB BAR === */
function renderTabbar(){
  const tab=(scr,ic,lab)=>`
    <button class="tab" data-act="nav:${scr}" ${state.screen===scr?'aria-current="page"':''}>
      ${svgIco(I[ic])}<span>${lab}</span></button>`;
  $('#tabbar').innerHTML =
    tab('home','home','Home') +
    tab('growth','growth','Growth') +
    `<div class="tab-start"><button class="start-btn" data-act="start" aria-label="Start session">
        ${svgIco(I.play,'fill="currentColor" stroke="none"')}</button></div>` +
    tab('missions','missions','Missions') +
    tab('profile','user','Profile');
}

/* ============================================================ RENDERING === */
const SCREENS={home:renderHome, report:renderReport, growth:renderGrowth, missions:renderMissions, profile:renderProfile};
/* keepScroll: for in-place switches (a tab, a chart range) where throwing the
   reader back to the top of the screen would be the wrong answer */
function render(keepScroll){
  hardCloseDetail(); hardCloseRecord(); stopZsTimer(); swingStop();
  curRecord=null;
  const scr=$('#screen');
  const was=scr.scrollTop, sb=scr.style.scrollBehavior;
  // an in-place switch keeps the reader where they are, so the entrance animation
  // would just read as the whole page blinking — suppress it before the swap
  scr.classList.toggle('no-anim', !!keepScroll);
  scr.innerHTML=SCREENS[state.screen]();
  scr.style.scrollBehavior='auto';                 // restore, don't animate back
  scr.scrollTop = keepScroll ? was : 0;
  scr.style.scrollBehavior = sb;
  scr.classList.toggle('on-photo', state.screen==='missions');   // dark-glass cards over the photo
  $('#phone').classList.toggle('on-white', state.screen==='home' || state.screen==='growth' || state.screen==='report');
  $('#phone').classList.toggle('on-home', state.screen==='home');   // home runs under the tab bar with no fade
  setScreenBg();
  renderTabbar();
  centreMissionPick();
  // the report opens with the swing already playing — it reads as footage, not a still
  if(state.screen==='report') swingStart(true);   // synchronous, so the button never flashes first
}
/* keep tonight's pick centred in the swipe rail after a re-render */
function centreMissionPick(){
  const rail=document.querySelector('.mpick'); if(!rail) return;
  const cards=[...rail.children];
  const card=rail.querySelector('.mp-card[aria-pressed="true"]');
  rail._i = Math.max(0, cards.indexOf(card));
  wireMissionSwipe(rail);
  // The first render can happen while the phone is still behind the launch screen
  // and the rail has no width yet — then scrollLeft clamps to 0 and the deck opens
  // off to one side. So re-centre as layout, fonts and images settle.
  mpSettle(rail);
  requestAnimationFrame(()=>mpSettle(rail));
  setTimeout(()=>mpSettle(rail), 60);
  setTimeout(()=>mpSettle(rail), 400);
  if(window.ResizeObserver && !rail._ro){
    rail._ro = new ResizeObserver(()=>mpSettle(rail));
    rail._ro.observe(rail);
  }
}
/* put the current card back in the middle, unless a drag or tween owns the rail */
function mpSettle(rail){
  if(!rail.isConnected || rail._tween || rail._drag) return;
  rail.scrollLeft = mpCentre(rail, rail._i);
  fanMissionPick();
}
/* scrollLeft that puts card i dead centre */
function mpCentre(rail, i){
  const c = rail.children[i]; if(!c) return rail.scrollLeft;
  return c.offsetLeft + c.offsetWidth/2 - rail.clientWidth/2;
}
/* One drag moves the deck by exactly one card. Native scrolling is off, so the
   rail is animated by hand: no momentum to coast past the middle, no rubber-band
   back, and the card always lands where the tween puts it. */
function wireMissionSwipe(rail){
  let sx=0, sy=0, from=0, drag=false, dx=0, t0=0, axis='';
  const onDown = e => {
    if(rail._tween){ cancelAnimationFrame(rail._tween); rail._tween=0; }
    drag=true; rail._drag=true; axis=''; dx=0; sx=e.clientX; sy=e.clientY; from=rail.scrollLeft; t0=performance.now();
  };
  const onMove = e => {
    if(!drag) return;
    dx = e.clientX - sx;
    if(!axis){                                   // let a vertical drag scroll the page
      if(Math.abs(dx) < 6 && Math.abs(e.clientY-sy) < 6) return;
      axis = Math.abs(dx) > Math.abs(e.clientY-sy) ? 'x' : 'y';
      if(axis==='x') rail.setPointerCapture(e.pointerId);
    }
    if(axis!=='x') return;
    e.preventDefault();
    rail.scrollLeft = from - dx;                 // 1:1 with the finger
    fanMissionPick();
  };
  const onUp = () => {
    if(!drag) return; drag=false; rail._drag=false;
    if(axis!=='x') return;
    rail._dragEnd = performance.now();                         // so the drag isn't read as a tap
    const v = dx / Math.max(1, performance.now()-t0);          // px per ms
    const step = (Math.abs(dx) > 46 || Math.abs(v) > .45) ? (dx<0 ? 1 : -1) : 0;
    mpGoTo(rail, rail._i + step);
  };
  rail.addEventListener('pointerdown', onDown);
  rail.addEventListener('pointermove', onMove);
  rail.addEventListener('pointerup', onUp);
  rail.addEventListener('pointercancel', onUp);
  rail.addEventListener('dragstart', e=>e.preventDefault());
}
/* animate the rail to card i and adopt it as tonight's mission */
function mpGoTo(rail, i){
  const n = rail.children.length;
  i = Math.max(0, Math.min(n-1, i));
  rail._i = i;
  const from = rail.scrollLeft, to = mpCentre(rail, i), t0 = performance.now(), D = 320;
  if(rail._tween) cancelAnimationFrame(rail._tween);
  const step = now => {
    const p = Math.min(1, (now-t0)/D);
    const e = 1 - Math.pow(1-p, 3);                            // ease-out, never overshoots
    rail.scrollLeft = from + (to-from)*e;
    fanMissionPick();
    rail._tween = p<1 ? requestAnimationFrame(step) : 0;
  };
  rail._tween = requestAnimationFrame(step);
  adoptMission(rail, rail.children[i]);
}
/* the card in the middle is the mission — reflect it in the header and the deck */
function adoptMission(rail, el){
  const id = (el.dataset.act||'').split(':')[1];
  [...rail.children].forEach(c=>c.setAttribute('aria-pressed', String(c===el)));
  if(!id || id===state.pickedMission) return;
  state.pickedMission = id;
  const m = DATA.missions.find(x=>x.id===id), sub=document.querySelector('.hm-sub');
  if(sub && m) sub.textContent = `${m.mode} · ${m.min} min`;
}
/* tapping a card starts that mission — swiping is how you browse */
function pickMission(id, el){
  const rail = el.closest('.mpick'); if(!rail) return;
  if(performance.now() - (rail._dragEnd||-1e9) < 260) return;   // that was a swipe, not a tap
  mpGoTo(rail, [...rail.children].indexOf(el));
  startMission(id);
}
/* the rail is a fan, not a row — cards tilt away from the middle and tuck behind it */
function fanMissionPick(){
  const rail=document.querySelector('.mpick'); if(!rail) return;
  const mid = rail.scrollLeft + rail.clientWidth/2;
  [...rail.children].forEach(c=>{
    const d = Math.max(-2, Math.min(2, (c.offsetLeft + c.offsetWidth/2 - mid) / c.offsetWidth));
    const a = Math.abs(d);
    const r = Math.max(-1.15, Math.min(1.15, d));   // far cards tilt no further than the neighbours
    c.style.transform = `translateY(${(a*9).toFixed(1)}px) rotate(${(r*26).toFixed(2)}deg) scale(${(1 - Math.min(.26, a*.19)).toFixed(3)})`;
    c.style.opacity = (1 - Math.min(.48, a*.36)).toFixed(3);
    c.style.zIndex  = String(20 - Math.round(a*10));
  });
}
function setScreenBg(){
  let bg=$('#screenBg');
  if(!bg){ bg=document.createElement('div'); bg.id='screenBg'; bg.className='screen-bg';
    const ph=$('#phone'); ph.insertBefore(bg, ph.firstChild); }
  bg.classList.toggle('show', state.screen==='missions');        // full-bleed photo only on Missions
}
function nav(scr){ if(scr!=='report') state.baselineJustSet=false; state.screen=scr; render(); }

/* ---- Report avatar: phase paint, replay, joint detail sheet -------------- */
function paintAvatar(){
  const w=$('#avatarWrap'); if(w) w.innerHTML=avatarSVG(state.reportPhase);
  syncPhaseStrip();
}
function syncPhaseStrip(){
  document.querySelectorAll('#phaseSwitch button').forEach(b=>
    b.setAttribute('aria-selected', String(b.dataset.act===`rphase:${state.reportPhase}`)));
}
/* Swap the visible still without rebuilding the stack — that keeps the CSS
   cross-fade alive, which is what makes the sequence read as footage. */
function showPhase(p, playing){
  const w=$('#avatarWrap'); if(!w) return;
  w.querySelectorAll('.glow-photo').forEach(i=>i.classList.toggle('on', i.dataset.ph===p));
  const known = PHASE_KEYS.includes(p);        // the follow-through frame has no joint table
  const svg=w.querySelector('.mk-layer');
  // the skeleton moves with the figure; the labelled hotspots would only clutter it
  if(svg) svg.innerHTML = known ? skeletonLayer(p) + (playing ? '' : markerLayer(p)) : '';
  // while it plays, the strip holds the phase the reader picked — a pill hopping
  // six times a loop is noise, and it would fight the footage for attention
  if(playing) return;
  if(known) state.reportPhase=p;
  syncPhaseStrip();
}
function setReportPhase(p){ swingStop(); showPhase(p, false); }

/* Swing playback — held at address and finish, quick through the strike, so the
   loop has the cadence of a real swing rather than an even slideshow. */
const SWING_STEPS=[['address',760],['takeaway',300],['top',480],
                   ['downswing',200],['impact',240],['finish',380],['through',760]];
let _swingT=0, _swingArm=0;
/* Plays through once, like a clip. The press is acknowledged first — the glyph
   flips to pause — and only then does the button fade out and the swing run. */
function swingStart(auto){
  if(_swingT || _swingArm) return;
  const stage=document.querySelector('.avatar-stage'); if(!stage) return;
  const begin=()=>{
    _swingArm=0;
    stage.classList.add('is-playing');
    let i=0;
    (function step(){
      const [p,ms]=SWING_STEPS[i++];
      showPhase(p, true);
      _swingT=setTimeout(i<SWING_STEPS.length ? step : swingStop, ms);
    })();
  };
  // the autoplay on entry runs with no control on screen at all; a press gets the
  // pause glyph first so the tap is acknowledged before the button clears away
  if(auto) return begin();
  const btn=stage.querySelector('.swing-play');
  if(btn) btn.classList.add('armed');
  _swingArm=setTimeout(begin, 320);
}
function swingStop(){
  if(!_swingT && !_swingArm) return;
  clearTimeout(_swingT); _swingT=0;
  clearTimeout(_swingArm); _swingArm=0;
  const stage=document.querySelector('.avatar-stage');
  if(stage){
    stage.classList.remove('is-playing');
    const btn=stage.querySelector('.swing-play'); if(btn) btn.classList.remove('armed');
  }
  showPhase(state.reportPhase, false);
}

function miniHotspot(phaseKey,h){
  const [x,y]=hsPoint(h.id), s=h.st[phaseKey];
  const col=s==='alert'?'var(--alert)':'var(--lime-deep)';
  return `<svg viewBox="${jointViewBox(h.id)}" class="skeleton">${photoImage()}
    <circle cx="${x}" cy="${y}" r="11" fill="none" stroke="${col}" stroke-width="2" opacity=".75"/>
    <circle cx="${x}" cy="${y}" r="4.5" fill="${col}"/></svg>`;
}
/* Anchor a scale-in card's transform-origin to the point that was tapped, so
   it appears to grow out of that spot. Measures the untransformed layout box. */
function growFrom(card, originEl){
  if(!card || !originEl) return;
  card.style.transition='none';
  const saved=card.style.transform;
  card.style.transform='none';                 // measure the full-size layout box
  const cr=card.getBoundingClientRect();
  card.style.transform=saved;                  // back to the CSS start state (scaled)
  const r=originEl.getBoundingClientRect();
  card.style.transformOrigin=`${(r.left+r.width/2-cr.left).toFixed(1)}px ${(r.top+r.height/2-cr.top).toFixed(1)}px`;
  void card.offsetWidth;                        // flush with transition off
  card.style.transition='';                     // restore the stylesheet transition
}

/* ---- Joint detail: card grows out of the tapped joint, close-up crop ----- */
let detail=null;

function jointViewBox(id,phase){
  const [x,y]=hsPoint(id,phase), half=JOINT_ZOOM[id]||62;
  return `${(x-half).toFixed(0)} ${(y-half).toFixed(0)} ${(half*2).toFixed(0)} ${(half*2).toFixed(0)}`;
}
function detailInfoHTML(h,phase){
  const st=h.st[phase], m=h.m[phase], coach=h.coach[phase]||h.coach._;
  return `<span class="pill ${st==='alert'?'pill-alert':'pill-lime'}" style="align-self:flex-start">
      ${st==='alert'?'Needs work':'On track'}</span>
    <div style="margin-top:12px"><div class="eyebrow">${h.name} · ${cap(phase)}</div>
      <div class="big" style="color:${st==='alert'?'var(--alert)':'var(--lime-deep)'};margin-top:7px">${m[0]}</div>
      <div class="small dim" style="margin-top:5px">${m[1]}</div></div>
    <div class="card card-tight" style="margin-top:14px"><span class="eyebrow">Coaching</span>
      <div class="body" style="margin-top:7px;font-weight:600">${coach}</div></div>`;
}
function detailThumbsHTML(h,phase){
  return PHASE_KEYS.map(p=>`
    <div class="frame ${p===phase?'cur':''} ${h.st[p]==='alert'?'warn':''}" data-act="dphase:${p}" role="button" tabindex="0" aria-label="${cap(p)}">
      <div class="mini">${miniHotspot(p,h)}</div><div class="fl">${cap(p)}</div></div>`).join('');
}
function openDetail(id, originEl){
  const h=HS().find(x=>x.id===id); if(!h) return;
  detail={id, phase:state.reportPhase};
  let o=$('#detail');
  if(!o){ o=document.createElement('div'); o.id='detail'; o.className='detail-overlay';
    $('#phone').appendChild(o);                          // mount inside the phone frame
    o.addEventListener('click',e=>{ if(e.target===o || e.target.classList.contains('detail-back')) closeDetail(); });
  }
  o.innerHTML=`<div class="detail-back"></div>
    <div class="detail-card" role="dialog" aria-label="${h.name} detail">
      <div class="row between" style="align-items:flex-start">
        <div class="eyebrow" style="padding-top:5px">Joint detail</div>
        <button class="icon-btn sm" data-act="hs-close" aria-label="Close">${svgIco(I.x)}</button>
      </div>
      <div class="detail-fig" id="detailFig">
        <svg class="glowfig" viewBox="${jointViewBox(id,detail.phase)}">${photoImage(phaseAvatarSrc(detail.phase),VBH)}</svg>
        <span class="pill pill-lime detail-loop"><span class="dot"></span>Close-up view</span>
      </div>
      <div id="detailInfo" style="margin-top:14px">${detailInfoHTML(h,detail.phase)}</div>
    </div>`;
  o.classList.add('show');
  growFrom(o.querySelector('.detail-card'), originEl);   // grow out of the tapped joint
  setTimeout(()=>o.classList.add('in'),20);              // reveal (fires even when rAF is throttled)
}

/* tap a hand-drawn dot → close-up crop of that phase photo centred on the dot,
   plus the coaching card when the dot lands on one of the 3 coached joints */
function jointZoomBox(pt){
  const [x,y]=pt||[100,100]; const half=30;
  return `${(x-half).toFixed(0)} ${(y-half).toFixed(0)} ${half*2} ${half*2}`;
}
function openJointZoom(idx, originEl){
  const phase=state.reportPhase;
  const pts=liveDots(phase)||PHASE_DOTS[phase]||[]; const pt=pts[+idx]||[100,100];
  const hsId=coachedJointAt(phase, pt);
  const h=hsId ? HS().find(x=>x.id===hsId) : null;
  const label=h ? `${h.name} · ${cap(phase)}` : `${cap(phase)} · joint close-up`;
  detail={id:hsId||null, idx:+idx, phase};
  let o=$('#detail');
  if(!o){ o=document.createElement('div'); o.id='detail'; o.className='detail-overlay';
    $('#phone').appendChild(o);
    o.addEventListener('click',e=>{ if(e.target===o || e.target.classList.contains('detail-back')) closeDetail(); });
  }
  o.innerHTML=`<div class="detail-back"></div>
    <div class="detail-card" role="dialog" aria-label="${label} close-up">
      <div class="row between" style="align-items:flex-start">
        <div class="eyebrow" style="padding-top:5px">${label}</div>
        <button class="icon-btn sm" data-act="hs-close" aria-label="Close">${svgIco(I.x)}</button>
      </div>
      <div class="detail-fig" id="detailFig">
        <svg class="glowfig" viewBox="${jointZoomBox(pt)}">${photoImage(phaseAvatarSrc(phase),VBH)}</svg>
        <span class="pill pill-lime detail-loop"><span class="dot"></span>Close-up view</span>
      </div>
      ${h ? `<div style="margin-top:14px">${detailInfoHTML(h,phase)}</div>` : ''}
    </div>`;
  o.classList.add('show');
  growFrom(o.querySelector('.detail-card'), originEl);
  setTimeout(()=>o.classList.add('in'),20);
}

function selectDetailPhase(p){
  if(!detail) return; detail.phase=p;
  const h=HS().find(x=>x.id===detail.id);
  const info=$('#detailInfo'); if(info) info.innerHTML=detailInfoHTML(h,p);
  document.querySelectorAll('#detailThumbs .frame').forEach(f=>
    f.classList.toggle('cur', f.getAttribute('data-act')===`dphase:${p}`));
}
function closeDetail(){
  const o=$('#detail'); if(!o || !o.classList.contains('show')) return;
  o.classList.remove('in'); o.classList.add('out');
  const done=()=>{ o.classList.remove('show','out'); detail=null; };
  const card=o.querySelector('.detail-card');
  if(card) card.addEventListener('transitionend',done,{once:true});
  setTimeout(done,420);                                   // fallback if transitionend misses
}
function hardCloseDetail(){ const o=$('#detail'); if(o){ o.className='detail-overlay'; o.innerHTML=''; } detail=null; }

/* ================================================================ EVENTS = */
function greeting(){ return 'Good evening'; }

function toast(msg){
  let t=$('#toast');
  if(!t){ t=document.createElement('div'); t.id='toast'; t.className='toast'; $('#phone').appendChild(t); }
  t.textContent=msg; requestAnimationFrame(()=>t.classList.add('show'));
  clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove('show'),1900);
}

document.addEventListener('click',e=>{
  const el=e.target.closest('[data-act]'); if(!el) return;
  const [act,arg]=el.dataset.act.split(':');

  switch(act){
    case 'nav': nav(arg); break;
    case 'start': if(state.pickedMission) startMission(state.pickedMission); else startSession(); break;
    case 'pickm': pickMission(arg, el); break;
    case 'toast': toast(el.dataset.act.slice(6)); break;

    case 'mood':
      state.mood=+arg;
      syncPressed('mood:', a=>+a===state.mood);           // highlight only the tapped emoji
      updateAdjust();
      break;
    case 'area':
      toggleArea(arg);
      syncPressed('area:', a=>state.areas.has(a));         // reflect the whole set (None exclusivity)
      updateAdjust();
      break;

    case 'gtab': state.growthTab=arg; render(true); break;
    case 'rrange': state.recRange=arg; render(true); break;
    case 'mcat': state.missionCat=arg; render(true); break;
    case 'roundprep': startSession(ROUND_PREP); break;
    case 'mission': startMission(arg); break;
    case 'day': openDayRecord(+arg, el); break;
    case 'record-close': closeDayRecord(); break;

    case 'rphase': setReportPhase(arg); break;
    case 'swingplay': swingStart(); break;
    case 'hs': openDetail(arg, el); break;
    case 'jz': openJointZoom(arg, el); break;
    case 'hs-close': closeDetail(); break;
    case 'dphase': selectDetailPhase(arg); break;
    case 'save-reflect': {
      const v=($('#reflect')?.value||'').trim();
      toast(v?'Reflection saved · session complete':'Session saved to your records');
      state.reflected=true; setTimeout(()=>nav('home'),700); break;
    }
    case 'sw': { const on=el.getAttribute('aria-checked')==='true'; el.setAttribute('aria-checked',String(!on)); break; }

    case 'ob':
      if(arg==='restart'){ state.ob=0; showOnboarding(); }
      break;
    case 'launch-start': state.ob=0; showOnboarding('launch');   // the camera page fades in over the cover; the cover leaves once it is covered
      setTimeout(hideLaunch, 700); break;
    case 'ob-next': obNext(); break;
    case 'ob-skip': hideOnboarding(); break;
    case 'ob-score': state.obScore=+arg; syncPressed('ob-score:', a=>+a===state.obScore); updateGoalCta(); break;
    case 'ob-round': state.obRound=+arg; syncPressed('ob-round:', a=>+a===state.obRound); updateGoalCta(); break;
    case 'zs-done': {
      stopZsTimer();
      const rec = window.Live ? Live.end(true) : null;
      state.liveRecord = rec && rec.type==='swing' ? rec : null;
      state.livePutt   = rec && rec.type==='putt'  ? rec.putt : null;
      if(rec){ state.sessionType = rec.type; state.reportPhase='address';
        if(rec.type==='swing') DATA.report.success = rec.success; }
      else if(window.Live) setTimeout(()=>toast('No swings tracked — showing your last session'),400);
      hideOverlay('#zs');
      if(!state.hasBaseline){ state.hasBaseline=true; state.baselineJustSet=true;
        DATA.user.baselineDate='Today'; }
      nav('report'); break; }
    case 'zs-cancel': stopZsTimer(); if(window.Live) Live.end(false); hideOverlay('#zs'); break;
  }
});

function toggleArea(a){
  if(a==='None'){ state.areas.clear(); state.areas.add('None'); return; }
  state.areas.delete('None');
  state.areas.has(a)? state.areas.delete(a) : state.areas.add(a);
}
function adjustNoteHTML(){
  return `<div class="row gap-8 mt-16" style="align-items:flex-start;padding-top:14px;border-top:1px solid rgba(12,13,9,.14)">
    ${svgIco(I.bolt,'fill="#08211D" stroke="none" style="width:16px;height:16px;flex:0 0 auto;margin-top:1px"')}
    <span class="small" style="color:rgba(12,13,9,.78);font-weight:600">${DATA.mission.adjusted}</span></div>`;
}
/* Update ONLY the mission card's auto-adjust note — no full re-render, no flicker */
function updateAdjust(){
  const box=$('#missionAdjust'); if(!box) return;      // absent for fresh-user card
  const show = state.mood===2 || state.areas.size>0;
  box.innerHTML = show ? adjustNoteHTML() : '';
}
/* Reflect a single-select group's state on its buttons via aria-pressed only */
function syncPressed(prefix, isOn){
  document.querySelectorAll(`[data-act^="${prefix}"]`).forEach(b=>
    b.setAttribute('aria-pressed', String(isOn(b.dataset.act.slice(prefix.length)))));
}

/* ---- In-session "Training in progress" screen (zero-screen philosophy) --- */
function guessSets(goal){
  const nums=(goal.match(/\d+/g)||[]).map(Number).filter(n=>n>=4 && n<=30);
  return nums.length?Math.max(...nums):10;
}
function startMission(id){
  const m=DATA.missions.find(x=>x.id===id); if(!m) return;
  startSession({title:m.goal, short:m.short, mode:m.mode, min:m.min, sets:guessSets(m.goal)});
}
const zsFmt=s=>`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
function stopZsTimer(){ if(state.zsTimer){ clearInterval(state.zsTimer); state.zsTimer=null; }
  if(state.zsCue){ state.zsCue.forEach(clearTimeout); state.zsCue=null; }
  if(_zsRAF){ cancelAnimationFrame(_zsRAF); _zsRAF=0; } }

/* radar-style ticked dial for the in-session tracking screen — matched to the
   reference: fine dotted outer ring, white radial tick ring on a thin circle,
   short inner tick arc, faint dashed spokes. The lime ticks sit on exactly the
   same radii as the white ones (nothing protrudes) and grow into a full ring as
   sets are completed — see zsSetProgress(). */
const ZS_CUES=['Ready!','5','4','3','2','1','Start!'];   // one beat a second before the clock runs
const ZS_TICKS=120, ZS_START=0;   // tick 0 sits at 12 o'clock — the arc starts on the vertical centreline
function zsDialSVG(){
  const C=150, rad=d=>d*Math.PI/180, P=(r,a)=>[(C+Math.cos(a)*r).toFixed(1),(C+Math.sin(a)*r).toFixed(1)];
  const N=ZS_TICKS, R0=104, R1=120;
  let ticks='', prog='';
  for(let i=0;i<N;i++){
    const a=(i/N)*Math.PI*2 - Math.PI/2;
    const [x0,y0]=P(R0,a), [x1,y1]=P(R1,a);
    ticks+=`<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".4"/>`;
    // lime twin on the identical radii — revealed as the session progresses
    prog+=`<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="#C6E74C" stroke-width="2" stroke-linecap="round" opacity="0"/>`;
  }
  // two dashed radial guides through the centre: one pinned at the arc's start,
  // one that travels with the arc's leading edge as the point colour grows
  const mk=(id,idx)=>{
    const a=(idx/N)*Math.PI*2 - Math.PI/2;
    const [gx1,gy1]=P(-24,a), [gx2,gy2]=P(140,a);
    return `<line id="${id}" x1="${gx1}" y1="${gy1}" x2="${gx2}" y2="${gy2}" stroke="#fff" stroke-width="1" stroke-dasharray="1.5 6" stroke-linecap="round" opacity=".4"/>`;
  };
  return `<svg viewBox="0 0 300 300" aria-hidden="true">
    <circle cx="150" cy="150" r="131" fill="none" stroke="#fff" stroke-width="1.4" stroke-dasharray="0.5 6" stroke-linecap="round" opacity=".55"/>
    <circle cx="150" cy="150" r="112" fill="none" stroke="#fff" stroke-width="1" opacity=".22"/>
    ${ticks}<g id="zsProg">${prog}</g>
    ${mk('zsMarkStart',ZS_START)}${mk('zsMarkHead',ZS_START)}</svg>`;
}
const ZS_MK=(id,idx)=>{                                // reposition a dashed guide to tick index `idx`
  const el=document.getElementById(id); if(!el) return;
  const a=(idx/ZS_TICKS)*Math.PI*2 - Math.PI/2;
  el.setAttribute('x1',(150+Math.cos(a)*-24).toFixed(1));
  el.setAttribute('y1',(150+Math.sin(a)*-24).toFixed(1));
  el.setAttribute('x2',(150+Math.cos(a)*140).toFixed(1));
  el.setAttribute('y2',(150+Math.sin(a)*140).toFixed(1));
};

/* The lime arc grows clockwise from ZS_START. `_zsK` is a fractional tick count
   that a persistent rAF loop nudges toward `_zsTargetK` at a *steady* flow rate,
   so the arc never jumps a chunk of ticks — it creeps forward continuously and
   each tick fades in as the soft leading edge sweeps across it, staying visually
   joined to the ticks already lit behind it. */
let _zsK=0, _zsTargetK=0, _zsRAF=0, _zsLast=0;
function zsRenderArc(k){
  const g=document.getElementById('zsProg'); if(!g) return;
  const n=ZS_TICKS;
  const FADE=Math.min(9, Math.max(1, k), Math.max(1, n-k));  // soft leading edge — but the first line is solid, not a ghost
  for(let j=0;j<n;j++){
    const d=(j - ZS_START + n) % n;
    let o;
    if(d>=k)            o=0;
    else if(d > k-FADE) o=.95*(k-d)/FADE;            // ramp: newest tick barely on, blends into the solid arc
    else               o=.95;
    g.children[j].setAttribute('opacity', o.toFixed(3));
  }
  g.children[ZS_START].setAttribute('opacity','.95');   // the start line never goes out
  // the travelling dashed guide follows the arc's leading edge; hide it once full
  const head=document.getElementById('zsMarkHead');
  if(head){
    ZS_MK('zsMarkHead', ZS_START + Math.min(k, n-0.001));
    head.setAttribute('opacity', k>=n-0.5 ? '0' : '.4');
  }
}
function _zsGrow(now){
  if(!document.getElementById('zsProg')){ _zsRAF=0; return; }
  const dt=Math.min(0.05, (now-_zsLast)/1000 || 0); _zsLast=now;
  const diff=_zsTargetK-_zsK;
  if(diff<=0.02){ _zsK=_zsTargetK; zsRenderArc(_zsK); _zsRAF=0; return; }
  const speed=Math.max(3.4, diff*2.4);              // ticks/sec — gentle constant flow, catches up if behind
  _zsK=Math.min(_zsTargetK, _zsK + speed*dt);
  zsRenderArc(_zsK);
  _zsRAF=requestAnimationFrame(_zsGrow);
}
/* aim the arc at `frac` (0…1); the loop flows it there. `snap` jumps instantly. */
function zsSetProgress(frac, snap=false){
  _zsTargetK=Math.min(ZS_TICKS, Math.max(0, frac)*ZS_TICKS);
  if(snap || !document.getElementById('zsProg') || _zsTargetK<=_zsK){
    _zsK=_zsTargetK; zsRenderArc(_zsK); return;
  }
  if(!_zsRAF){ _zsLast=performance.now(); _zsRAF=requestAnimationFrame(_zsGrow); }
}

/* Motion-camera view. The session clock hands over to it after ZS_CAM_AT seconds.
   There is no live feed yet — the pose below is a stand-in for what the tracker draws;
   .zc-feed is where the camera stream will go. */
const ZS_CAM_AT=3;
function zsPoseSVG(){
  const J={head:[100,56],neck:[100,92],ls:[74,104],rs:[126,104],le:[64,148],re:[120,152],lw:[93,186],rw:[105,186],
           lh:[86,208],rh:[114,208],lk:[78,272],rk:[122,270],la:[74,338],ra:[130,336]};
  const B=[['neck','head'],['ls','rs'],['neck','ls'],['neck','rs'],['ls','le'],['le','lw'],['rs','re'],['re','rw'],
           ['ls','lh'],['rs','rh'],['lh','rh'],['lh','lk'],['rh','rk'],['lk','la'],['rk','ra']];
  const bones=B.map(([a,b])=>`<line x1="${J[a][0]}" y1="${J[a][1]}" x2="${J[b][0]}" y2="${J[b][1]}"/>`).join('');
  const joints=Object.values(J).map(([x,y],i)=>`<circle class="zc-j" style="animation-delay:${(i*0.11).toFixed(2)}s" cx="${x}" cy="${y}" r="4.6"/>`).join('');
  return `<svg viewBox="0 0 200 380" aria-hidden="true">
    <line class="zc-ground" x1="20" y1="344" x2="180" y2="344"/>
    <line class="zc-club" x1="99" y1="186" x2="152" y2="341"/>
    <ellipse class="zc-club" cx="156" cy="343" rx="9" ry="3.6"/>
    <g class="zc-bones">${bones}</g><g class="zc-joints">${joints}</g></svg>`;
}
function zsCamHTML(N, first){
  // The camera opens out of the dial's centre: a dark window grows from the disc's size and fades in
  // while the dial rings fade. The sage field, title, X and End button stay as they are.
  return `<div class="zs-cam" id="zsCam">
    <div class="zc-window">
      <div class="zc-inner">
        <div class="zc-feed" aria-hidden="true"></div>
        <div class="zc-frame" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
        <div class="zc-pose">${zsPoseSVG()}</div>
        <span class="zc-chip"><i></i>Tracking</span>
        <p class="zc-hint">Keep your whole body inside the frame</p>
      </div>
    </div>
  </div>`;
}
function showZsCam(N, first){
  const zs=document.querySelector('#zs .zs');
  if(!zs || zs.querySelector('.zs-cam')) return;
  zs.insertAdjacentHTML('beforeend', zsCamHTML(N, first));
  zs.classList.add('cam-on');
  if(window.Live) Live.attachCam();                 // the real feed fills .zc-feed
  void zs.querySelector('.zs-cam').offsetWidth;   // commit the start state, so the window animates from the disc instead of jumping
  // a timeout, not rAF: frames stop in a backgrounded tab, and the view must still arrive
  setTimeout(()=>{ const c=zs.querySelector('.zs-cam'); if(c) c.classList.add('show'); }, 40);
}

function startSession(mission){
  stopZsTimer();
  let z=$('#zs');
  if(!z){ z=document.createElement('div'); z.id='zs'; z.className='overlay'; document.body.appendChild(z); }
  const m=mission||DATA.mission, first=!state.hasBaseline;
  state.sessionType = m.mode==='Putt' ? 'putt' : 'swing';   // decides the report layout
  const N=m.sets||10, name=first?'Baseline session':(m.title||'Practice');
  z.innerHTML=`<div class="zs">
    <div class="notch" aria-hidden="true"></div>
    ${statusbarHTML()}
    <button class="zs-x" data-act="zs-cancel" aria-label="Cancel — don’t save">${svgIco(I.x)}</button>
    <p class="zs-title">Put your phone down<br>and let it track your swing</p>
    <div class="zs-dial is-still">${zsDialSVG()}<div class="zs-puck"><img class="zs-prod" src="product-78.webp" alt="" draggable="false"></div></div>
    <div class="zs-live">
      <div class="zs-live-set is-off" id="zsLive">
        <div class="zs-live-col"><div class="zs-live-num" id="zsElapsed">00:00</div><div class="zs-live-lab">Elapsed</div></div>
        <div class="zs-live-div"></div>
        <div class="zs-live-col"><div class="zs-live-num" id="zsSets">1<span class="zs-sets-tot"> / ${N}</span></div><div class="zs-live-lab">Sets</div></div>
      </div>
    </div>
    <div class="zs-cue" id="zsCue">${ZS_CUES[0]}</div>
    <div class="zs-foot">
      <button class="zs-end" data-act="zs-done">End session${first?' — save baseline':''}</button>
    </div></div>`;
  z.classList.add('show');
  // the stand's camera + tracker ride along with the session (live.js)
  if(window.Live) Live.begin({mode:m.mode, sets:N, first, mission:m});
  // live, minimal progress (setInterval fires even in throttled tabs)
  state.zsElapsed=0;
  const el=$('#zsElapsed'), setsEl=$('#zsSets');
  const TOTAL=60, PER=TOTAL/N;              // whole session runs exactly 1 minute
  _zsK=0; zsSetProgress(0, true);   // at rest: just the start line, both guides on it

  // count the swinger in — a beat a second — before the clock appears
  const cue=$('#zsCue'), live=$('#zsLive');
  state.zsCue = ZS_CUES.slice(1).map((label,i)=>setTimeout(()=>{
    if(!cue) return;
    cue.textContent=label;
    cue.classList.toggle('num', /^\d+$/.test(label));
    cue.classList.remove('in'); void cue.offsetWidth; cue.classList.add('in');
  }, (i+1)*1000));
  state.zsCue.push(setTimeout(()=>{
    if(cue) cue.remove();
    if(live) live.classList.remove('is-off');
    const d=document.querySelector('.zs-dial'); if(d) d.classList.remove('is-still');
    tick();
  }, ZS_CUES.length*1000));

  function tick(){
    // Both the arc and the guide riding its edge are drawn from one clock-derived
    // position, so they always move together. The rAF gives it per-frame smoothness;
    // the interval repaints too, so the dial still advances if frames are throttled.
    const t0=performance.now();
    const paint=()=>{
      _zsK = Math.min(ZS_TICKS, (performance.now()-t0)/1000/TOTAL*ZS_TICKS);
      zsRenderArc(_zsK);
    };
    state.zsTimer=setInterval(()=>{
      state.zsElapsed++;
      if(el) el.textContent=zsFmt(state.zsElapsed);
      const set=Math.min(N, 1+Math.floor(state.zsElapsed/PER));
      const setHTML=`${set}<span class="zs-sets-tot"> / ${N}</span>`;
      if(setsEl && !(window.Live&&Live.active)) setsEl.innerHTML=setHTML;   // live: sets count real swings
      if(state.zsElapsed===ZS_CAM_AT) showZsCam(N, first);
      paint();
      if(state.zsElapsed>=TOTAL && !(window.Live&&Live.active)){ clearInterval(state.zsTimer); state.zsTimer=null; }
    },1000);
    const flow=()=>{
      if(!document.getElementById('zsProg')){ _zsRAF=0; return; }
      paint();
      _zsRAF = _zsK<ZS_TICKS ? requestAnimationFrame(flow) : 0;
    };
    _zsRAF=requestAnimationFrame(flow);
  }
}
function hideOverlay(sel){ const o=$(sel); if(o) o.classList.remove('show'); }

/* ---------------------------------------------------------- ONBOARDING --- */
/* Phone-only: concept → goal. No swing capture here —
   the first real session becomes the baseline automatically. */
const CP_READ=[['Height','118 cm'],['Distance','2.4 m'],['Tilt','0.5°']];
const OB=[
  /* Step 1 doubles as camera setup: the stand's own camera head is the hero, and
     the live readings underneath settle to "in frame". */
  { key:'campos', hero:()=>`<div class="cp-stage">
        <span class="cp-dots" aria-hidden="true"></span>
        <span class="cp-img">
          <img class="cp-shot" src="camera-stand.webp" alt="The ARVIA stand’s camera head">
          <span class="cp-ring" aria-hidden="true"></span>
        </span>
      </div>`,
    title:'<b>Aim</b> the camera<br>at your stance',
    sub:'',
    cta:'Get started' },
  { key:'goal', hero:null, title:'Set your goal',
    sub:'Your target score and next round shape each night’s mission. Change it anytime.',
    cta:'Finish setup' },
];
const SCORES=[['Break 100'],['Break 95'],['Break 90'],['Break 85']];
const ROUNDS=[['This weekend',3],['In 2 weeks',14],['In a month',30],['Not scheduled',null]];

function showOnboarding(from){ $('#onboarding').className='overlay show'+(from?' from-'+from:''); renderOnboarding(); }
function hideOnboarding(){ $('#onboarding').className='overlay'; }
const goalReady=()=> state.obScore!=null && state.obRound!=null;
/* Toggle the Finish button live (no full re-render) as goal options are picked */
function updateGoalCta(){
  const btn=$('#onboarding [data-act="ob-next"]');
  if(btn) btn.disabled=!goalReady();
}
function obNext(){ if(state.ob>=OB.length-1){ finishOnboarding(); } else { $('#onboarding').classList.remove('from-launch'); state.ob++; renderOnboarding(); } }
function finishOnboarding(){
  if(!goalReady()) return;          // need both a score and a round first
  DATA.user.goal=SCORES[state.obScore][0];
  const rd=ROUNDS[state.obRound][1];
  DATA.user.roundInDays = rd==null ? null : rd;
  state.hasBaseline=false;          // fresh user — first session becomes baseline
  state.baselineJustSet=false;
  hideOnboarding(); nav('home');
  toast('All set — your first session sets your baseline');
}

function renderOnboarding(){
  const s=OB[state.ob];
  const dots=OB.map((_,i)=>`<i class="${i===state.ob?'on':''}"></i>`).join('');
  const goalBody=`<div>
    <div class="eyebrow" style="margin-bottom:11px">Target score</div>
    <div class="chips">${SCORES.map((g,i)=>`<button class="chip" data-act="ob-score:${i}" aria-pressed="${state.obScore===i}">${g[0]}</button>`).join('')}</div>
    <div class="eyebrow" style="margin:20px 0 11px">Next round</div>
    <div class="chips">${ROUNDS.map((r,i)=>`<button class="chip" data-act="ob-round:${i}" aria-pressed="${state.obRound===i}">${r[0]}</button>`).join('')}</div>
  </div>`;

  $('#onboarding').innerHTML=`<div class="ob-inner">
    <div class="notch" aria-hidden="true"></div>
    ${statusbarHTML()}
    <div class="ob-top"><div class="ob-dots">${dots}</div>
      <button class="ob-skip" data-act="ob-skip">Skip</button></div>
    <div class="ob-body">
      ${s.key==='goal'?'':`<div class="ob-hero">${s.hero()}</div>`}
      <div class="ob-title">${s.title}</div>
      ${s.sub?`<p class="ob-sub">${s.sub}</p>`:''}
      ${s.key==='goal'?`<div style="margin-top:26px">${goalBody}</div>`:''}
    </div>
    <div class="ob-foot"><button class="btn btn-primary" data-act="ob-next" ${s.key==='goal'&&!goalReady()?'disabled':''}>${s.cta}</button></div>
  </div>`;
  if(s.key==='campos') cpReadout();
}
/* the three camera readings settle in, then the chip flips to "in frame" */
let _cpRAF=0;
function cpReadout(){
  if(_cpRAF) cancelAnimationFrame(_cpRAF);
  const t0=performance.now(), D=1500, chip=$('#cpChip');
  const nums=CP_READ.map(([,v])=>({dec:v.includes('.')?1:0, n:parseFloat(v), unit:v.replace(/[\d.]+\s*/,'')}));
  const tick=now=>{
    const p=Math.min(1,(now-t0)/D), e=1-Math.pow(1-p,3);
    nums.forEach((v,i)=>{
      const el=$('#cpV'+i); if(!el) return;
      const jitter = p<1 ? (1-e)*v.n*0.35*(Math.random()-.5) : 0;
      el.textContent = (v.n*e + jitter).toFixed(v.dec) + (v.unit==='°'?'':' ') + v.unit;
    });
    if(p<1) _cpRAF=requestAnimationFrame(tick);
    else { _cpRAF=0; if(chip){ chip.classList.add('ok'); chip.innerHTML='<i></i>You’re in frame'; } }
  };
  _cpRAF=requestAnimationFrame(tick);
}

/* ----------------------------------------------------------- LAUNCH ------ */
function renderLaunch(){
  $('#launch').innerHTML=`<div class="launch">
    <div class="notch" aria-hidden="true"></div>
    ${statusbarHTML()}
    <div class="launch-fallback"></div>
    <div class="launch-bg"></div>
    <div class="launch-bottom">
      <img class="launch-logo" src="logo-orvia-word.webp" alt="ORVIA — One club, every balance">
      <div class="launch-cta">
        <button class="btn btn-getstarted" data-act="launch-start">Get started</button>
      </div>
    </div>
  </div>`;
}
function showLaunch(){ $('#launch').className='overlay show'; renderLaunch(); }
function hideLaunch(){ $('#launch').className='overlay'; }

/* Desktop: scale the whole 432×912 device to fit the viewport height so it
   keeps its proportions and its internal layout on any screen. */
function fitPhone(){
  if(!window.matchMedia('(min-width:480px)').matches){
    document.documentElement.style.removeProperty('--pscale'); return;
  }
  const s=Math.min(1, (window.innerHeight - 24) / 932);
  document.documentElement.style.setProperty('--pscale', s.toFixed(4));
}
window.addEventListener('resize', fitPhone, {passive:true});
window.addEventListener('orientationchange', fitPhone);
fitPhone();

/* ================================================================= INIT === */
function init(){
  const q=new URLSearchParams(location.search);
  const scr=q.get('screen');
  if(scr && SCREENS[scr]) state.screen=scr;          // deep-link a screen
  if(q.get('tab')) state.growthTab=q.get('tab');
  renderTabbar();
  render();
  if(scr) return;                                    // deep-linked into the app — skip intro
  if(q.get('launch')==='0'){ if(q.get('ob')!=='0') showOnboarding(); }
  else showLaunch();                                 // first entry: launch screen
}
init();
