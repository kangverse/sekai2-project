const MEDIA_V='?v=202608070145';   // bump when the video assets are re-encoded
const types=[
  {name:'Drone',group:'Aerial',desc:'Ascending, orbiting, and long-range flight',a:'#7298a8',b:'#254e54',media:'drone',wide:true,featured:true},
  {name:'Walking',group:'Ground',desc:'First-person paths through real places',a:'#8caf8e',b:'#315b50',media:'walking',featured:true},
  {name:'Boat',group:'Vehicle',desc:'Waterborne motion at multiple scales',a:'#79aebd',b:'#24526a',media:'boat',wide:true,featured:true},
  {name:'Cable Car',group:'Aerial',desc:'Vertical motion and distant vistas',a:'#c1a86a',b:'#725a55',media:'cable-car'},
  {name:'Driving',group:'Vehicle',desc:'Urban roads and long-distance travel',a:'#c68f72',b:'#424f57',media:'driving',featured:true},
  {name:'Train',group:'Vehicle',desc:'Extended rail journeys and landscapes',a:'#9c8a72',b:'#39474b',media:'train',featured:true},
  {name:'Cycling',group:'Ground',desc:'Fast egocentric motion on winding roads',a:'#88ad77',b:'#174d43',media:'cycling',featured:true},
  {name:'Static & Pan',group:'Ground',desc:'Stable observation with local rotation',a:'#9b91a8',b:'#464256',media:'static-pan',featured:true},
  {name:'Skiing',group:'Ground',desc:'Dynamic descent through snowy terrain',a:'#93aec5',b:'#405c77',media:'skiing',featured:true},
  {name:'Escalator',group:'Ground',desc:'Mechanically constrained vertical travel',a:'#c9a477',b:'#704e43',media:'escalator'},
  {name:'Straight Walk',group:'Ground',desc:'Long, steady pedestrian translation',a:'#77a78a',b:'#234d43',media:'walking-straight'},
  {name:'Curved Walk',group:'Ground',desc:'A smooth pedestrian arc through a real scene',a:'#84a779',b:'#315748',media:'walking-curve'},
  {name:'L-turn Walk',group:'Ground',desc:'A clear right-angle pedestrian turn',a:'#6e9f8b',b:'#274a48',media:'walking-lturn'},
  {name:'S-curve Walk',group:'Ground',desc:'A continuous two-direction ground trajectory',a:'#799c87',b:'#304d45',media:'walking-scurve'},
  {name:'Winding Walk',group:'Ground',desc:'Repeated turns along a complex path',a:'#8aaa76',b:'#365245',media:'walking-winding'},
  {name:'Loop Drive',group:'Vehicle',desc:'Vehicle motion with a return trajectory',a:'#ba846e',b:'#4d4546',media:'driving-loop'},
  {name:'Ridge Flight',group:'Aerial',desc:'Aerial traversal over large-scale terrain',a:'#6f98ac',b:'#294d59',media:'drone-ridge'},
  {name:'Alpine Cable Car',group:'Aerial',desc:'Constrained elevated motion across a vista',a:'#b5a269',b:'#67564d',media:'cable-car-alpine'},
  {name:'Static Landscape',group:'Ground',desc:'Long observation with subtle camera motion',a:'#958da1',b:'#45434f',media:'static-landscape'}
];
const wallColors=[['#496b70','#172f35'],['#9e8068','#3b433f'],['#6f9279','#21453c'],['#7d7590','#35344a'],['#b18b66','#4d443d']];
document.querySelectorAll('.wall-column').forEach((col,ci)=>{const cards=[...types,...types];cards.forEach((t,i)=>{const d=document.createElement('div');d.className='wall-card';d.style.setProperty('--a',wallColors[(i+ci)%wallColors.length][0]);d.style.setProperty('--b',wallColors[(i+ci)%wallColors.length][1]);d.innerHTML=`<video src="assets/videos/${t.media}.mp4${MEDIA_V}" poster="assets/images/${t.media}.jpg${MEDIA_V}" autoplay muted loop playsinline preload="metadata"></video><span>${t.name} · Sekai2</span>`;col.appendChild(d)})});
const MOTION_REGIMES=10;
if(document.querySelector('#motion-pills'))document.querySelector('#motion-pills').innerHTML=types.map((x,i)=>`${i===MOTION_REGIMES?'<i class="pill-break" aria-hidden="true"></i>':''}<span class="pill">${x.name}</span>`).join('');
const groups=['All','Aerial','Ground','Vehicle'];
const filters=document.querySelector('#filters');
filters.innerHTML=groups.map((x,i)=>`<button class="filter ${i===0?'active':''}" data-filter="${x}">${x}</button>`).join('');
const grid=document.querySelector('#dataset-grid');
// Partition N cards so EVERY row is exactly full (12 columns) — a lone card on the
// final row looked abrupt. Two-card rows are pushed to the FRONT as an 8+4 hero row
// so the wide card reads as a deliberate lead, never as a leftover at the bottom.
//   n%3==0 -> all rows of 3      n%3==2 -> hero 8+4, then rows of 3
//   n%3==1 -> hero 8+4, rows of 3, and one balanced 6+6 row at the end
function rowPlan(n){
  if(n<=0)return[];
  if(n===1)return[[12]];
  if(n===2)return[[8,4]];
  const r=n%3;
  if(r===0)return Array.from({length:n/3},()=>[4,4,4]);
  if(r===2)return [[8,4],...Array.from({length:(n-2)/3},()=>[4,4,4])];
  return [[8,4],...Array.from({length:(n-4)/3},()=>[4,4,4]),[6,6]];   // r===1
}
function renderCards(group='All'){
  const list=types.filter(x=>group==='All'?x.featured:x.group===group);
  const spans=rowPlan(list.length).flat();
  grid.innerHTML=list.map((x,i)=>{const s=spans[i]||4;return `<article class="data-card reveal visible" data-case="${x.media}" data-span="${s}" style="grid-column:span ${s}" tabindex="0" role="button" aria-label="Open ${x.name} case study"><div class="card-media" style="--ca:${x.a};--cb:${x.b}"><video src="assets/videos/${x.media}.mp4${MEDIA_V}" poster="assets/images/${x.media}.jpg${MEDIA_V}" autoplay muted loop playsinline preload="metadata"></video><span class="media-type">${x.group}</span><span class="inspect">View case ↗</span></div><div class="card-body"><div><h3>${x.name}</h3><small>Video · Pose · Caption</small></div><p>${x.desc}</p></div></article>`}).join('')
}
renderCards();filters.addEventListener('click',e=>{if(!e.target.matches('.filter'))return;filters.querySelectorAll('.filter').forEach(x=>x.classList.remove('active'));e.target.classList.add('active');renderCards(e.target.dataset.filter)});
// Structured-semantics demo — driven from a real case (coastal-highway drive):
// global attributes + five clip-level fields + a proportional segment strip.
const SEG_PALETTE=['#315B7D','#438C8C','#6DAA72','#D49A45','#C7674F','#7C5AA6','#476A9F','#609B76'];
// Readers pick the clip, and the ten offered here appear NOWHERE else on the page: the
// demo used to reuse explore-grid and trajectory clips, so switching tabs showed the same
// few scenes again. assets/data/annotation_cases.json holds one clip per (scene, camera
// motion) pair, cut fresh from the release.
let annotationCases={},annotationCase=null;
function renderAnnotationDemo(key){
  const keys=Object.keys(annotationCases);
  if(!keys.length)return;
  if(key&&annotationCases[key])annotationCase=key;
  if(!annotationCase||!annotationCases[annotationCase])annotationCase=keys[0];
  const item=annotationCases[annotationCase];
  const tabsEl=document.querySelector('#annotation-tabs');
  if(tabsEl&&!tabsEl.dataset.ready){
    tabsEl.innerHTML=keys.map(k=>
      `<button class="annotation-tab${k===annotationCase?' active':''}" data-case="${k}" role="tab" aria-selected="${k===annotationCase}">${annotationCases[k].label}</button>`).join('');
    tabsEl.addEventListener('click',e=>{const b=e.target.closest('button');if(b)renderAnnotationDemo(b.dataset.case)});
    tabsEl.dataset.ready='1';
  }
  if(tabsEl)tabsEl.querySelectorAll('button').forEach(b=>{
    const on=b.dataset.case===annotationCase;b.classList.toggle('active',on);b.setAttribute('aria-selected',on);
    // Keep the active tab inside the sideways-scrolling row. Never scrollIntoView: the
    // section sits below the fold, so on first render that drags the whole PAGE down to it.
    if(on&&tabsEl.scrollWidth>tabsEl.clientWidth){
      const l=b.offsetLeft,r=l+b.offsetWidth,vl=tabsEl.scrollLeft,vr=vl+tabsEl.clientWidth;
      if(l<vl)tabsEl.scrollLeft=l-12;else if(r>vr)tabsEl.scrollLeft=r-tabsEl.clientWidth+12;
    }});
  const chip=document.querySelector('#annotation-chip');
  const total=item.duration||120;
  if(chip)chip.textContent=`${item.label}${item.sub?' · '+item.sub:''} · ${Math.round(total)} s · ${(item.segments||[]).length} segments`;
  const video=document.querySelector('#annotation-video');
  if(video&&!video.src.includes(item.video)){video.src=item.video+MEDIA_V;video.poster=item.poster+MEDIA_V;video.play().catch(()=>{});}
  const controlled=document.querySelector('#annotation-controlled');
  if(controlled)controlled.innerHTML=Object.values(item.attributes||{}).filter(Boolean).map(v=>`<span>${String(v).replaceAll('_',' ')}</span>`).join('');
  const order=['subject_motion','environment_motion','static_scene','camera_description','full_prompt'];
  const entries=order.filter(k=>item.overall&&item.overall[k]).map(k=>[k,item.overall[k]]);
  document.querySelector('#field-list').innerHTML=entries.map(x=>`<div class="field"><b>${x[0]}</b><p>${x[1]}</p></div>`).join('');
  const segs=item.segments||[];
  document.querySelector('#segment-strip').innerHTML=segs.map((s,i)=>{const w=s.time?((s.time[1]-s.time[0])/total*100):100/segs.length;return `<span class="segment" style="background:${SEG_PALETTE[i%SEG_PALETTE.length]};flex:${w.toFixed(2)} 1 0" title="Segment ${i+1} · ${s.time?s.time.join('–')+'s':''}"></span>`;}).join('');
}
const trajectoryChoices=[['Drone','drone'],['L-turn walk','walking'],['Turning drive','driving'],['Cycling','cycling'],['Cable car','cable-car']];
const trajectoryPoseSources={walking:'walking-lturn',driving:'driving-loop','cable-car':'cable-car-alpine'};
const tabs=document.querySelector('#trajectory-tabs');if(tabs)tabs.innerHTML=trajectoryChoices.map(([name,key],i)=>`<button class="trajectory-tab ${i===0?'active':''}" data-case="${key}">${name}</button>`).join('');
let homepagePoseViewer=null;
function poseFrameAtTime(item,sourceTime){const pose=item.pose3d,count=pose.num_frames||pose.positions.length;return Math.max(0,Math.min(count-1,Math.round(sourceTime/pose.duration*(count-1))))}
function loadHomepageTrajectory(key){const item=caseData[trajectoryPoseSources[key]||key];if(!item?.pose3d)return;document.querySelector('#trajectory-case-name').textContent=trajectoryChoices.find(x=>x[1]===key)?.[0]||key;const video=document.querySelector('#trajectory-video');video.src=item.video+MEDIA_V;video.poster=item.poster+MEDIA_V;video.play().catch(()=>{});if(!homepagePoseViewer){homepagePoseViewer=new PoseViewer(document.querySelector('#trajectory-viewer'));homepagePoseViewer.init()}homepagePoseViewer.loadTrajectory(item.pose3d,poseFrameAtTime(item,item.preview_start_s));homepagePoseViewer.setShowFrustums(false);homepagePoseViewer.setFollowMode(false);homepagePoseViewer.setProgressHighlight(false);homepagePoseViewer.setShowDirection(false);homepagePoseViewer.setCurrentFrame(poseFrameAtTime(item,item.preview_start_s));homepagePoseViewer._onResize()}
tabs&&tabs.addEventListener('click',e=>{if(!e.target.matches('button'))return;tabs.querySelectorAll('button').forEach(x=>x.classList.remove('active'));e.target.classList.add('active');loadHomepageTrajectory(e.target.dataset.case)});
document.querySelector('#trajectory-video')?.addEventListener('timeupdate',e=>{const active=tabs.querySelector('.active')?.dataset.case,item=caseData[trajectoryPoseSources[active]||active];if(!homepagePoseViewer||!item)return;homepagePoseViewer.setCurrentFrame(poseFrameAtTime(item,item.preview_start_s+e.target.currentTime))});
const observer=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting)e.target.classList.add('visible')}),{threshold:.12});document.querySelectorAll('.reveal').forEach(x=>observer.observe(x));
const captionCaseTabs=document.querySelector('#caption-case-tabs'),captionCaseExplorer=document.querySelector('#caption-case-explorer');let captionCases=[];
function escapeHTML(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}
function captionMarkup(value){return escapeHTML(value).replaceAll('&lt;camera&gt;','<mark>&lt;camera&gt;</mark>').replaceAll('&lt;/camera&gt;','<mark>&lt;/camera&gt;</mark>')}
function renderCaptionCase(id){const item=captionCases.find(x=>x.id===id)||captionCases[0];if(!item)return;captionCaseTabs.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x.dataset.case===item.id));const points=item.trajectory.map(([x,y])=>`${8+x*84},${8+y*84}`).join(' '),fields=Object.entries(item.overall).map(([key,value])=>`<div class="web-caption-field"><b>${key}</b><p>${captionMarkup(value)}</p></div>`).join(''),segments=item.segments.map((segment,index)=>{const color=['#315B7D','#438C8C','#6DAA72','#D49A45','#C7674F','#7C5AA6','#476A9F','#609B76'][index%8];return `<div class="web-caption-segment" style="--segment-color:${color}"><b>S${index} · ${segment.time.join('–')}s · ${escapeHTML(segment.path||'continuous')}</b><p>${escapeHTML(segment.text)}</p></div>`}).join(''),timeline=item.segments.map((segment,index)=>{const color=['#315B7D','#438C8C','#6DAA72','#D49A45','#C7674F','#7C5AA6','#476A9F','#609B76'][index%8],width=(segment.time[1]-segment.time[0])/item.duration*100;return `<span style="width:${width}%;background:${color}">${segment.time.join('–')}s</span>`}).join('');captionCaseExplorer.innerHTML=`<div class="web-case-head"><div><span>Case ${item.id}</span><h3>${escapeHTML(item.shape)}</h3></div><p>${escapeHTML(item.dataset)} · ${Math.round(item.duration)} s · ${item.segments.length} segments</p></div><div class="web-case-frames">${item.frames.map((src,index)=>`<figure><img src="${src}" alt="Case ${item.id} at ${item.frame_times[index]} seconds" loading="lazy"><figcaption>t=${item.frame_times[index]}s</figcaption></figure>`).join('')}</div><div class="web-case-main"><div class="web-pose-card"><div class="web-card-title"><b>ViPE trajectory</b><span>bird's-eye view · color encodes time</span></div><svg viewBox="0 0 100 100" role="img" aria-label="Camera trajectory"><defs><linearGradient id="web-pose-gradient"><stop offset="0" stop-color="#315B7D"/><stop offset=".35" stop-color="#438C8C"/><stop offset=".7" stop-color="#D49A45"/><stop offset="1" stop-color="#7C5AA6"/></linearGradient></defs><polyline points="${points}"/><circle cx="${8+item.trajectory[0][0]*84}" cy="${8+item.trajectory[0][1]*84}" r="2.2"/><text x="${8+item.trajectory.at(-1)[0]*84}" y="${8+item.trajectory.at(-1)[1]*84}" class="web-pose-star">★</text></svg><div class="web-pose-legend"><span>● start</span><span>★ end</span></div></div><div class="web-global-card"><div class="web-card-title"><b>Global annotation</b><span>structured clip-level semantics</span></div><div class="web-controlled">${Object.values(item.attributes).filter(Boolean).map(x=>`<span>${escapeHTML(String(x).replaceAll('_',' '))}</span>`).join('')}</div><div class="web-caption-fields">${fields}</div></div></div><div class="web-temporal"><div class="web-card-title"><b>Temporally grounded annotations</b><span>segments[*].short_prompt · camera_path</span></div><div class="web-segment-timeline">${timeline}</div><div>${segments}</div></div>`}
fetch('assets/data/caption_cases.json?v=202608070145').then(r=>r.json()).then(data=>{captionCases=data;captionCaseTabs.innerHTML=data.map((item,index)=>`<button class="caption-case-tab ${index===0?'active':''}" data-case="${item.id}"><span>${item.dataset}</span>${escapeHTML(item.shape)}</button>`).join('');renderCaptionCase(data[0]?.id)});captionCaseTabs&&captionCaseTabs.addEventListener('click',e=>{const button=e.target.closest('button');if(button)renderCaptionCase(button.dataset.case)});
let panoramicCases=[],panoramicExpanded=false,panoramicFilter='All';
const reconstructionGrid=document.querySelector('#reconstruction-grid'),reconstructionFilters=document.querySelector('#reconstruction-filters'),reconstructionMore=document.querySelector('#reconstruction-more');
function renderPanoramicCases(){const filtered=panoramicCases.filter(x=>panoramicFilter==='All'||x.motion===panoramicFilter),shown=panoramicExpanded?filtered:filtered.slice(0,12);reconstructionGrid.innerHTML=shown.map(x=>`<a class="reconstruction-card" href="${x.image}" target="_blank" rel="noreferrer"><div class="reconstruction-media"><img src="${x.image}" alt="${x.scene}, ${x.motion} panoramic reconstruction" loading="lazy"></div><div><b>${x.scene}</b><span>${x.motion.replaceAll('-',' ')}</span></div></a>`).join('');reconstructionMore.hidden=filtered.length<=12;reconstructionMore.textContent=panoramicExpanded?'Show selected cases only':`Show all ${filtered.length} reconstructions`}
fetch('assets/data/panoramic_cases.json?v=202608070145').then(r=>r.json()).then(data=>{panoramicCases=data;const motions=['All',...new Set(data.map(x=>x.motion))];reconstructionFilters.innerHTML=motions.map((x,i)=>`<button class="recon-filter ${i===0?'active':''}" data-motion="${x}">${x.replaceAll('-',' ')}</button>`).join('');renderPanoramicCases()});
reconstructionFilters&&reconstructionFilters.addEventListener('click',e=>{if(!e.target.matches('button'))return;reconstructionFilters.querySelectorAll('button').forEach(x=>x.classList.remove('active'));e.target.classList.add('active');panoramicFilter=e.target.dataset.motion;panoramicExpanded=false;renderPanoramicCases()});reconstructionMore&&reconstructionMore.addEventListener('click',()=>{panoramicExpanded=!panoramicExpanded;renderPanoramicCases()});

let caseData={},panoPoseViewer=null,activePanoCase=null;
const panoShowcases=[
  ['Serpentine','panorama-serpentine','A winding campus route demonstrates continuous 360° context through repeated changes of heading.','Winding campus route · repeated changes of heading'],
  ['Switchback','panorama-switchback','A residential route repeatedly turns back on itself while preserving surrounding spatial evidence.','Residential route · repeatedly turns back on itself'],
  ['Meander','panorama-meander','A long mall-side traversal combines gentle bends with revisitation and broad peripheral coverage.','Long mall-side traversal · gentle bends and revisitation']
];
function loadPanoShowcase(key){const item=caseData[key];if(!item)return;activePanoCase=item;const choice=panoShowcases.find(x=>x[1]===key);document.querySelector('#pano-case-title').textContent=choice[0];document.querySelector('#pano-case-copy').textContent=choice[3]||choice[2];document.querySelectorAll('#pano-case-tabs button').forEach(x=>x.classList.toggle('active',x.dataset.case===key));const video=document.querySelector('#pano-case-video');video.src=item.video;video.poster=item.poster;video.load();video.play().catch(()=>{});if(!panoPoseViewer){panoPoseViewer=new PoseViewer(document.querySelector('#pano-pose-viewer'));panoPoseViewer.init()}panoPoseViewer.loadTrajectory(item.pose3d,poseFrameAtTime(item,item.preview_start_s));panoPoseViewer.setShowFrustums(false);panoPoseViewer.setFollowMode(false);panoPoseViewer.setProgressHighlight(false);panoPoseViewer.setShowDirection(false);panoPoseViewer.setCurrentFrame(poseFrameAtTime(item,item.preview_start_s));panoPoseViewer._onResize()}
if(document.querySelector('#pano-case-tabs'))document.querySelector('#pano-case-tabs').innerHTML=panoShowcases.map((x,i)=>`<button class="${i===0?'active':''}" data-case="${x[1]}">${x[0]}</button>`).join('');
document.querySelector('#pano-case-tabs')?.addEventListener('click',e=>{if(e.target.matches('button'))loadPanoShowcase(e.target.dataset.case)});
document.querySelector('#pano-case-video')?.addEventListener('timeupdate',e=>{if(panoPoseViewer&&activePanoCase)panoPoseViewer.setCurrentFrame(poseFrameAtTime(activePanoCase,activePanoCase.preview_start_s+e.target.currentTime))});
fetch('assets/data/cases.json?v=202608070145').then(r=>r.json()).then(data=>{caseData=data;loadHomepageTrajectory('drone');loadPanoShowcase('panorama-serpentine')});
const modal=document.querySelector('#case-modal'),modalVideo=document.querySelector('#modal-video');
let modalPoseViewer=null,activeCase=null;
function openCase(key){const item=caseData[key];if(!item)return;activeCase=item;const type=types.find(x=>x.media===key);document.querySelector('#modal-title').textContent=type?.name||key;document.querySelector('#modal-meta').textContent=`${item.dataset} · ${item.clip} · preview from t=${item.preview_start_s}s`;modalVideo.src=item.video;modalVideo.poster=item.poster;document.querySelector('#modal-attributes').innerHTML=Object.entries(item.attributes).filter(([,v])=>v).map(([k,v])=>`<span><small>${k.replaceAll('_',' ')}</small>${String(v).replaceAll('_',' ')}</span>`).join('');document.querySelector('#modal-fields').innerHTML=Object.entries(item.overall).filter(([,v])=>v).map(([k,v])=>`<div class="modal-field"><b>${k}</b><p>${v}</p></div>`).join('');document.querySelector('#modal-segments').innerHTML=item.segments.map((s,i)=>`<div class="modal-segment"><b>S${i} · ${s.time?.join('–')}s${s.path?' · '+s.path.replaceAll('_',' '):''}</b><p>${s.text}</p></div>`).join('');modal.showModal();requestAnimationFrame(()=>{if(!modalPoseViewer){modalPoseViewer=new PoseViewer(document.querySelector('#modal-pose-3d'));modalPoseViewer.init()}modalPoseViewer.loadTrajectory(item.pose3d,poseFrameAtTime(item,item.preview_start_s));modalPoseViewer.setShowFrustums(document.querySelector('#pose-frustums').checked);modalPoseViewer._onResize()});modalVideo.play().catch(()=>{})}
grid&&grid.addEventListener('click',e=>{const card=e.target.closest('.data-card');if(card)openCase(card.dataset.case)});grid.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('.data-card'))openCase(e.target.dataset.case)});document.querySelector('#modal-close')?.addEventListener('click',()=>modal.close());modal.addEventListener('close',()=>{modalVideo.pause();modalVideo.removeAttribute('src');modalVideo.load()});modal.addEventListener('click',e=>{if(e.target===modal)modal.close()});
modalVideo&&modalVideo.addEventListener('timeupdate',()=>{if(!modalPoseViewer||!activeCase)return;modalPoseViewer.setCurrentFrame(poseFrameAtTime(activeCase,activeCase.preview_start_s+modalVideo.currentTime))});document.querySelector('#pose-frustums')?.addEventListener('change',e=>modalPoseViewer?.setShowFrustums(e.target.checked));document.querySelector('#pose-follow')?.addEventListener('change',e=>modalPoseViewer?.setFollowMode(e.target.checked));document.querySelector('#pose-reset')?.addEventListener('click',()=>modalPoseViewer?.resetCamera());

// ─── Interactive geographic map: hover/tap any shaded country → real stats + previews ───
// Clip counts come from the caption corpus; previews prefer footage actually recorded
// in that country and otherwise show a clearly-labelled representative selection.
(function(){
  const hostEl=document.querySelector('#geo-svg-host'),pop=document.querySelector('#geo-pop'),map=document.querySelector('#geo-canvas');
  if(!hostEl||!pop||!map)return;
  let data={},svg=null,openName=null,hideT=null,current=null;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  Promise.all([
    fetch('assets/data/world.svg?v=202608070145').then(r=>r.text()),
    fetch('assets/data/geo_countries.json?v=202608070145').then(r=>r.json())
  ]).then(([svgText,payload])=>{
    data=payload;hostEl.innerHTML=svgText;svg=hostEl.querySelector('svg');
    const n=Object.keys(data).length;
    const detail=document.querySelector('#geo-hint-detail');
    if(detail)detail.textContent=`${n} countries are interactive`;
    svg.addEventListener('mouseover',e=>{const p=e.target.closest('path.on');if(p)show(p);});
    svg.addEventListener('mousemove',e=>{if(current)place(e);});
    svg.addEventListener('mouseleave',hide);
    svg.addEventListener('click',e=>{const p=e.target.closest('path.on');if(!p)return;
      if(openName===p.dataset.n)hide();else{show(p);place(e);}});
  }).catch(()=>{hostEl.innerHTML='<p class="geo-fallback">Coverage map unavailable.</p>';});
  function show(path){
    clearTimeout(hideT);
    const name=path.dataset.n,item=data[name];
    if(!item)return;
    current=path;
    if(openName!==name){
      openName=name;
      const vids=(item.videos||[]).map(v=>`<div class="geo-vid"><video src="${v.v}" poster="${v.p}" muted loop autoplay playsinline preload="auto"></video><em>${esc(v.motion||'')}</em></div>`).join('');
      const places=[...new Set((item.videos||[]).map(v=>v.place).filter(Boolean))].slice(0,3);
      const scenes=[...new Set((item.videos||[]).map(v=>v.scene).filter(Boolean))].slice(0,3);
      const foot=vids
        ? `recorded here${places.length?' · '+esc(places.join(' · ')):''}${scenes.length?' · '+esc(scenes.join(' / ')):''}`
        : 'source footage not mirrored for preview';
      pop.innerHTML=`<div class="geo-pop-head"><b>${esc(name)}</b><span>${item.clips.toLocaleString()} clips · ${item.share}% of corpus</span></div>${vids?`<div class="geo-pop-vids">${vids}</div>`:''}<p class="geo-pop-foot">${foot}</p>`;
    }
    svg.querySelectorAll('path.hot').forEach(p=>p.classList.remove('hot'));
    path.classList.add('hot');
    pop.classList.add('show');pop.setAttribute('aria-hidden','false');
  }
  function place(e){
    const mr=map.getBoundingClientRect();
    const px=e.clientX-mr.left,py=e.clientY-mr.top;
    const pw=pop.offsetWidth,ph=pop.offsetHeight,pad=10;
    let left=px+16,top=py-ph-14;
    if(top<pad)top=py+18;
    if(left+pw>mr.width-pad)left=px-pw-16;
    left=Math.max(pad,Math.min(left,mr.width-pw-pad));
    top=Math.max(pad,Math.min(top,mr.height-ph-pad));
    pop.style.left=left+'px';pop.style.top=top+'px';
  }
  function hide(){hideT=setTimeout(()=>{
    pop.classList.remove('show');pop.setAttribute('aria-hidden','true');
    svg&&svg.querySelectorAll('path.hot').forEach(p=>p.classList.remove('hot'));
    pop.querySelectorAll('video').forEach(v=>{v.pause();v.removeAttribute('src');v.load();});
    openName=null;current=null;
  },140);}
})();

// ─── Global media throttle: only decode video that is actually on screen. ───
// The hero wall alone mounts ~38 looping clips; leaving them all decoding starved
// the panoramic previews and the WebGL pose viewers of GPU/CPU time.
(function(){
  if(!('IntersectionObserver' in window))return;
  const throttled=new WeakSet();          // paused by us, safe to resume
  const io=new IntersectionObserver(entries=>{
    entries.forEach(en=>{
      const v=en.target;
      // Never resume a clip the reader paused themselves (the trajectory pane has
      // native controls); only resume what this observer paused.
      if(en.isIntersecting){
        if(v.paused&&throttled.has(v)){throttled.delete(v);v.play().catch(()=>{});}
        else if(v.paused&&!v.dataset.userPaused)v.play().catch(()=>{});
      }
      else if(!v.paused){throttled.add(v);v.pause();}
    });
  },{rootMargin:'120px',threshold:0.01});
  const seen=new WeakSet();
  function scan(){document.querySelectorAll('video').forEach(v=>{
    if(seen.has(v))return;
    seen.add(v);
    // A pause we did not initiate is the reader's own; remember it.
    v.addEventListener('pause',()=>{if(!throttled.has(v))v.dataset.userPaused='1';});
    v.addEventListener('play',()=>{delete v.dataset.userPaused;});
    io.observe(v);
  });}
  scan();
  new MutationObserver(scan).observe(document.body,{childList:true,subtree:true});
})();

/* ---------------- attribute explorer ----------------
   Six controlled attributes, one bar chart each. Built from
   assets/data/attributes.json, which is generated from the same breakdown tables
   the technical report uses, so the page and the report cannot drift apart. */
(function(){
  const tabsEl=document.querySelector('#attr-tabs'),chartEl=document.querySelector('#attr-chart'),
        totalEl=document.querySelector('#attr-total');
  if(!tabsEl||!chartEl)return;
  // Camera motion is deliberately absent: at 83% walking the bar chart says nothing the
  // sentence above it does not already say, and a single full-width bar reads as a defect.
  const ORDER=[['scene','Scene'],['lighting','Lighting'],['time','Time of day'],
               ['weather','Weather'],['country','Country']];
  let data=null,active='scene';
  const fmt=n=>n.toLocaleString('en-US');
  function draw(key){
    const d=data[key];if(!d)return;
    active=key;
    tabsEl.querySelectorAll('button').forEach(b=>{
      const on=b.dataset.key===key;b.classList.toggle('active',on);b.setAttribute('aria-selected',on)});
    const max=Math.max(...d.items.map(i=>i.pct));
    chartEl.innerHTML=d.items.map((it,i)=>`
      <div class="attr-row${/^other/i.test(it.name)?' muted':''}" style="--i:${i}" title="${fmt(it.clips)} clips">
        <span class="attr-name">${it.name}</span>
        <span class="attr-track"><i style="--w:${(it.pct/max*100).toFixed(1)}%"></i></span>
        <span class="attr-val">${it.pct}%</span>
      </div>`).join('');
    totalEl.textContent=`${d.label} · ${d.total} distinct values`;
    // retrigger the width transition on every tab switch (rAF is absent in jsdom, and a
    // throw here used to be swallowed by the fetch catch below, blanking the chart)
    const paint=()=>chartEl.querySelectorAll('.attr-track i').forEach(b=>b.classList.add('go'));
    typeof requestAnimationFrame==='function'?requestAnimationFrame(paint):paint();
  }
  fetch('assets/data/attributes.json?v=202608070145')
    .then(r=>r.json())
    .catch(()=>null)                       // only a fetch/parse failure blanks the section
    .then(d=>{
      if(!d){chartEl.innerHTML='<p class="attr-empty">Attribute distributions unavailable.</p>';return}
      data=d;
      tabsEl.innerHTML=ORDER.filter(([k])=>d[k]).map(([k,label],i)=>
        `<button class="attr-tab${i===0?' active':''}" data-key="${k}" role="tab" aria-selected="${i===0}">${label}</button>`).join('');
      tabsEl.addEventListener('click',e=>{const b=e.target.closest('button');if(b)draw(b.dataset.key)});
      draw(ORDER.find(([k])=>d[k])[0]);
    });
})();

/* the annotation demo runs off its own set of clips (see build_annotation_cases.py) */
fetch('assets/data/annotation_cases.json?v=202608070145').then(r=>r.json())
  .then(d=>{annotationCases=d;renderAnnotationDemo();})
  .catch(()=>{});
