/* ORVIA motion tracking — iPad portrait page.
   Same engine and drawing as the app (live.js). This file only fits the fixed
   834×1194 screen into the viewport, shapes the camera window to the camera's own
   picture, and runs start / stop / results. */
(function(){
  'use strict';
  const $=s=>document.querySelector(s);
  const W=834, H=1194, BOX_TOP=132, BOX_H=800, BOX_W=730, STRIP=64, DEF_R=640/(800-64);
  let running=false, t0=0, timer=0;
  const fmt=s=>`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;

  /* ---- fit the whole screen inside the viewport, white all around ---- */
  function fit(){
    const vw=window.innerWidth, vh=window.innerHeight;
    const m=Math.round(Math.max(14, Math.min(vw,vh)*0.035));
    const s=Math.min((vw-2*m)/W, (vh-2*m)/H);
    const fitEl=$('#ipadFit'), scr=$('#ipadScreen');
    fitEl.style.width=(W*s)+'px'; fitEl.style.height=(H*s)+'px';
    scr.style.transform=`scale(${s})`;
  }
  window.addEventListener('resize', fit); window.addEventListener('orientationchange', ()=>setTimeout(fit,250));
  fit();

  /* ---- camera window takes the camera's shape (whole body always visible) ---- */
  function shape(r){
    r = r || DEF_R;
    let w=BOX_W, h=w/r;
    if(h > BOX_H-STRIP){ h=BOX_H-STRIP; w=h*r; }
    const win=$('.zc-window');
    win.style.setProperty('--cw', Math.round(w)+'px');
    win.style.setProperty('--ch', Math.round(h+STRIP)+'px');
  }
  function watchVideo(){
    const v=$('.zc-video'); if(!v) return;
    const go=()=>{ if(v.videoWidth&&v.videoHeight) shape(v.videoWidth/v.videoHeight); };
    v.addEventListener('loadedmetadata', go); v.addEventListener('resize', go);
  }
  shape();
  // whenever the demo golfer takes over, the window goes back to its own portrait shape
  new MutationObserver(()=>{ const i=$('.zc-inner'); if(i&&i.classList.contains('is-demo')) shape(); })
    .observe($('.zc-inner'), {attributes:true, attributeFilter:['class']});

  /* ---- balance mode in the top bar follows the dial ---- */
  function modeLabel(){
    const b=$('.zc-modes button[aria-checked="true"]'); if(!b||!window.Live) return;
    const m=Live._MODES[b.dataset.mode]; if(m) $('#ipMode').textContent=`${b.dataset.mode} · ${m.mm} mm`;
  }
  new MutationObserver(modeLabel).observe($('#zsCam'), {subtree:true, attributes:true, attributeFilter:['aria-checked']});

  /* ---- say up front whether this page can open the camera ---- */
  function camCheck(){
    let framed=false; try{ framed=window.top!==window.self; }catch(_){ framed=true; }
    const ok=!framed && window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
    const h=$('.zc-hint'); if(!h) return;
    h.classList.remove('off'); h.classList.toggle('warn',!ok);
    h.textContent = ok ? 'Stand 2.5–3 m back · the iPad will ask to use the camera'
      : framed ? 'Claude’s preview can’t use the camera — open the site link'
      : window.isSecureContext ? 'This browser has no camera access here'
      : 'Camera needs an https address — open the site link';
  }

  function start(demo){
    $('#mcSheet').hidden=true; $('#mcDemo').hidden=true;
    const zs=$('#zs .zs');
    zs.querySelectorAll('.zc-video,.zc-canvas,.zc-modes,.zc-note,.zc-debug,.zc-log,.zc-camon,.zc-camcard').forEach(e=>e.remove());
    zs.querySelector('.zc-inner').classList.remove('is-live','is-demo');
    zs.querySelector('.zs-title').textContent='Prop the iPad up, step back and swing';
    const set=zs.querySelector('#zsLive'); set.classList.remove('has-tempo');
    set.querySelectorAll('.zs-live-col').forEach((c,i)=>{ if(i>1) c.remove(); });
    set.querySelectorAll('.zs-live-div').forEach((d,i)=>{ if(i>0) d.remove(); });
    shape();
    Live.begin({mode:'Mid Iron', sets:10, demo:!!demo, ratio:4/3, mission:{title:'Motion tracking', short:'Motion tracking'}});
    zs.classList.add('cam-on');
    Live.attachCam(); watchVideo(); modeLabel();
    running=true; t0=Date.now(); $('#mcEnd').textContent='End session';
    $('#zsElapsed').textContent='00:00';
    clearInterval(timer); timer=setInterval(()=>{ $('#zsElapsed').textContent=fmt(Math.floor((Date.now()-t0)/1000)); },1000);
  }
  function stop(){
    running=false; clearInterval(timer);
    Live.end(false);
    $('#mcEnd').textContent='Start with camera'; $('#mcDemo').hidden=false;
    showResults();
  }
  function showResults(){
    const log=Live.lastLog, sw=(log&&log.swings)||[];
    const dur=log&&log.frames.length?log.frames[log.frames.length-1][0]/1000:0;
    const noPose=log?log.frames.filter(f=>f.length<2).length:0;
    $('#mcTitle').textContent=sw.length?`${sw.length} swing${sw.length>1?'s':''} tracked`:'No swings tracked';
    $('#mcSub').textContent=log?`${(log.source||'').replace(/^demo:.*/,'demo golfer')}${log.model?` · ${log.model.delegate}`:''} · ${log.frames.length} frames in ${dur.toFixed(0)} s (${(log.frames.length/Math.max(1,dur)).toFixed(0)} fps) · no-pose frames ${noPose}`:'';
    const lab={tempo:'Tempo',shoulder:'Shoulder turn',hip:'Hip turn',leadArm:'Lead arm',head:'Head',wTop:'Weight · top',wImp:'Weight · impact',tilt:'Spine tilt',wFin:'Finish',sway:'Sway',rock:'Rock',wrist:'Wrist'};
    const unit={tempo:':1',shoulder:'°',hip:'°',leadArm:'°',head:' cm',wTop:'%',wImp:'%',tilt:'°',wFin:'%',sway:' cm',rock:'°',wrist:'°'};
    $('#mcList').innerHTML=sw.map(s=>`
      <div class="mc-swing">
        <div class="row between"><b>#${s.n} · ${s.mode}</b><span class="pill ${s.score>=85?'pill-lime':''}">${s.score}</span></div>
        <div class="small dim" style="margin-top:4px">back ${s.tempo.back.toFixed(2)} s · down ${s.tempo.down.toFixed(2)} s · release ${s.releaseMs} ms · hands ${s.peakSpeed} m/s</div>
        <div class="mc-grid">${Object.entries(s.checks).map(([k,c])=>`<div class="${c.st}"><span>${lab[k]||k}</span><b>${c.v}${unit[k]||''}</b></div>`).join('')}</div>
        <div class="small" style="margin-top:10px;font-weight:600">“${s.coach||''}”</div>
      </div>`).join('') || '<p class="small dim" style="margin-top:14px">Stand 2.5–3 m away with your whole body in frame, hold your address for a beat, then swing.</p>';
    $('#mcSheet').hidden=false;
  }
  function backToReady(){
    $('#mcSheet').hidden=true;
    const zs=$('#zs .zs');
    zs.querySelectorAll('.zc-video,.zc-canvas,.zc-modes,.zc-note,.zc-debug,.zc-log,.zc-camon,.zc-camcard').forEach(e=>e.remove());
    zs.querySelector('.zc-inner').classList.remove('is-live','is-demo');
    const chip=zs.querySelector('.zc-chip'); if(chip) chip.innerHTML='<i></i>Ready';
    shape(); camCheck();
  }

  // ten swings in: give the last read a moment on screen, then the results
  window.addEventListener('orvia:setdone', ()=>{ setTimeout(()=>{ if(running) stop(); }, 4500); });

  camCheck();
  $('#mcEnd').addEventListener('click',()=>running?stop():start(false));
  $('#mcDemo').addEventListener('click',()=>start(true));
  $('#mcClose').addEventListener('click',backToReady);
  $('#mcAgain').addEventListener('click',()=>start(false));
  $('#mcExport').addEventListener('click',()=>Live.exportLog());
})();
