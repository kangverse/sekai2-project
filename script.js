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
document.querySelectorAll('.wall-column').forEach((col,ci)=>{const cards=[...types,...types];cards.forEach((t,i)=>{const d=document.createElement('div');d.className='wall-card';d.style.setProperty('--a',wallColors[(i+ci)%wallColors.length][0]);d.style.setProperty('--b',wallColors[(i+ci)%wallColors.length][1]);d.innerHTML=`<video src="assets/videos/${t.media}.mp4" poster="assets/images/${t.media}.jpg" autoplay muted loop playsinline preload="metadata"></video><span>${t.name} · Sekai2</span>`;col.appendChild(d)})});
document.querySelector('#motion-pills').innerHTML=types.map(x=>`<span class="pill">${x.name}</span>`).join('');
const groups=['All','Aerial','Ground','Vehicle'];
const filters=document.querySelector('#filters');
filters.innerHTML=groups.map((x,i)=>`<button class="filter ${i===0?'active':''}" data-filter="${x}">${x}</button>`).join('');
const grid=document.querySelector('#dataset-grid');
function renderCards(group='All'){
  grid.innerHTML=types.filter(x=>group==='All'?x.featured:x.group===group).map((x,i)=>`<article class="data-card ${x.wide?'wide':''} reveal visible" data-case="${x.media}" tabindex="0" role="button" aria-label="Open ${x.name} case study"><div class="card-media" style="--ca:${x.a};--cb:${x.b}"><video src="assets/videos/${x.media}.mp4" poster="assets/images/${x.media}.jpg" autoplay muted loop playsinline preload="metadata"></video><span class="media-type">${x.group}</span><span class="inspect">View case ↗</span></div><div class="card-body"><div><h3>${x.name}</h3><small>Video · Pose · Caption</small></div><p>${x.desc}</p></div></article>`).join('')
}
renderCards();filters.addEventListener('click',e=>{if(!e.target.matches('.filter'))return;filters.querySelectorAll('.filter').forEach(x=>x.classList.remove('active'));e.target.classList.add('active');renderCards(e.target.dataset.filter)});
// Structured-semantics demo — driven from a real case (coastal-highway drive):
// global attributes + five clip-level fields + a proportional segment strip.
const SEG_PALETTE=['#315B7D','#438C8C','#6DAA72','#D49A45','#C7674F','#7C5AA6','#476A9F','#609B76'];
function renderAnnotationDemo(){
  const item=caseData['driving'];if(!item)return;
  const chip=document.querySelector('#annotation-chip');
  const total=item.pose3d?.duration||item.duration||120;
  if(chip)chip.textContent=`Coastal highway · ${Math.round(total)} s`;
  const video=document.querySelector('#annotation-video');
  if(video&&video.src!==new URL(item.video,location.href).href){video.src=item.video;video.poster=item.poster;video.play().catch(()=>{});}
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
const tabs=document.querySelector('#trajectory-tabs');tabs.innerHTML=trajectoryChoices.map(([name,key],i)=>`<button class="trajectory-tab ${i===0?'active':''}" data-case="${key}">${name}</button>`).join('');
let homepagePoseViewer=null;
function poseFrameAtTime(item,sourceTime){const pose=item.pose3d,count=pose.num_frames||pose.positions.length;return Math.max(0,Math.min(count-1,Math.round(sourceTime/pose.duration*(count-1))))}
function loadHomepageTrajectory(key){const item=caseData[trajectoryPoseSources[key]||key];if(!item?.pose3d)return;document.querySelector('#trajectory-case-name').textContent=trajectoryChoices.find(x=>x[1]===key)?.[0]||key;const video=document.querySelector('#trajectory-video');video.src=`assets/videos/pose-overlay-${key}.webm`;video.poster=`assets/images/pose-overlay-${key}.jpg`;video.play().catch(()=>{});if(!homepagePoseViewer){homepagePoseViewer=new PoseViewer(document.querySelector('#trajectory-viewer'));homepagePoseViewer.init()}homepagePoseViewer.loadTrajectory(item.pose3d);homepagePoseViewer.setShowFrustums(false);homepagePoseViewer.setFollowMode(false);homepagePoseViewer.setProgressHighlight(false);homepagePoseViewer.setShowDirection(false);homepagePoseViewer.setCurrentFrame(poseFrameAtTime(item,item.preview_start_s));homepagePoseViewer._onResize()}
tabs.addEventListener('click',e=>{if(!e.target.matches('button'))return;tabs.querySelectorAll('button').forEach(x=>x.classList.remove('active'));e.target.classList.add('active');loadHomepageTrajectory(e.target.dataset.case)});
document.querySelector('#trajectory-video').addEventListener('timeupdate',e=>{const active=tabs.querySelector('.active')?.dataset.case,item=caseData[trajectoryPoseSources[active]||active];if(!homepagePoseViewer||!item)return;homepagePoseViewer.setCurrentFrame(poseFrameAtTime(item,item.preview_start_s+e.target.currentTime))});
const observer=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting)e.target.classList.add('visible')}),{threshold:.12});document.querySelectorAll('.reveal').forEach(x=>observer.observe(x));
const captionCaseTabs=document.querySelector('#caption-case-tabs'),captionCaseExplorer=document.querySelector('#caption-case-explorer');let captionCases=[];
function escapeHTML(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}
function captionMarkup(value){return escapeHTML(value).replaceAll('&lt;camera&gt;','<mark>&lt;camera&gt;</mark>').replaceAll('&lt;/camera&gt;','<mark>&lt;/camera&gt;</mark>')}
function renderCaptionCase(id){const item=captionCases.find(x=>x.id===id)||captionCases[0];if(!item)return;captionCaseTabs.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x.dataset.case===item.id));const points=item.trajectory.map(([x,y])=>`${8+x*84},${8+y*84}`).join(' '),fields=Object.entries(item.overall).map(([key,value])=>`<div class="web-caption-field"><b>${key}</b><p>${captionMarkup(value)}</p></div>`).join(''),segments=item.segments.map((segment,index)=>{const color=['#315B7D','#438C8C','#6DAA72','#D49A45','#C7674F','#7C5AA6','#476A9F','#609B76'][index%8];return `<div class="web-caption-segment" style="--segment-color:${color}"><b>S${index} · ${segment.time.join('–')}s · ${escapeHTML(segment.path||'continuous')}</b><p>${escapeHTML(segment.text)}</p></div>`}).join(''),timeline=item.segments.map((segment,index)=>{const color=['#315B7D','#438C8C','#6DAA72','#D49A45','#C7674F','#7C5AA6','#476A9F','#609B76'][index%8],width=(segment.time[1]-segment.time[0])/item.duration*100;return `<span style="width:${width}%;background:${color}">${segment.time.join('–')}s</span>`}).join('');captionCaseExplorer.innerHTML=`<div class="web-case-head"><div><span>Case ${item.id}</span><h3>${escapeHTML(item.shape)}</h3></div><p>${escapeHTML(item.dataset)} · ${Math.round(item.duration)} s · ${item.segments.length} segments</p></div><div class="web-case-frames">${item.frames.map((src,index)=>`<figure><img src="${src}" alt="Case ${item.id} at ${item.frame_times[index]} seconds" loading="lazy"><figcaption>t=${item.frame_times[index]}s</figcaption></figure>`).join('')}</div><div class="web-case-main"><div class="web-pose-card"><div class="web-card-title"><b>ViPE trajectory</b><span>bird's-eye view · color encodes time</span></div><svg viewBox="0 0 100 100" role="img" aria-label="Camera trajectory"><defs><linearGradient id="web-pose-gradient"><stop offset="0" stop-color="#315B7D"/><stop offset=".35" stop-color="#438C8C"/><stop offset=".7" stop-color="#D49A45"/><stop offset="1" stop-color="#7C5AA6"/></linearGradient></defs><polyline points="${points}"/><circle cx="${8+item.trajectory[0][0]*84}" cy="${8+item.trajectory[0][1]*84}" r="2.2"/><text x="${8+item.trajectory.at(-1)[0]*84}" y="${8+item.trajectory.at(-1)[1]*84}" class="web-pose-star">★</text></svg><div class="web-pose-legend"><span>● start</span><span>★ end</span></div></div><div class="web-global-card"><div class="web-card-title"><b>Global annotation</b><span>structured clip-level semantics</span></div><div class="web-controlled">${Object.values(item.attributes).filter(Boolean).map(x=>`<span>${escapeHTML(String(x).replaceAll('_',' '))}</span>`).join('')}</div><div class="web-caption-fields">${fields}</div></div></div><div class="web-temporal"><div class="web-card-title"><b>Temporally grounded annotations</b><span>segments[*].short_prompt · camera_path</span></div><div class="web-segment-timeline">${timeline}</div><div>${segments}</div></div>`}
fetch('assets/data/caption_cases.json').then(r=>r.json()).then(data=>{captionCases=data;captionCaseTabs.innerHTML=data.map((item,index)=>`<button class="caption-case-tab ${index===0?'active':''}" data-case="${item.id}"><span>${item.dataset}</span>${escapeHTML(item.shape)}</button>`).join('');renderCaptionCase(data[0]?.id)});captionCaseTabs.addEventListener('click',e=>{const button=e.target.closest('button');if(button)renderCaptionCase(button.dataset.case)});
let panoramicCases=[],panoramicExpanded=false,panoramicFilter='All';
const reconstructionGrid=document.querySelector('#reconstruction-grid'),reconstructionFilters=document.querySelector('#reconstruction-filters'),reconstructionMore=document.querySelector('#reconstruction-more');
function renderPanoramicCases(){const filtered=panoramicCases.filter(x=>panoramicFilter==='All'||x.motion===panoramicFilter),shown=panoramicExpanded?filtered:filtered.slice(0,12);reconstructionGrid.innerHTML=shown.map(x=>`<a class="reconstruction-card" href="${x.image}" target="_blank" rel="noreferrer"><div class="reconstruction-media"><img src="${x.image}" alt="${x.scene}, ${x.motion} panoramic reconstruction" loading="lazy"></div><div><b>${x.scene}</b><span>${x.motion.replaceAll('-',' ')}</span></div></a>`).join('');reconstructionMore.hidden=filtered.length<=12;reconstructionMore.textContent=panoramicExpanded?'Show selected cases only':`Show all ${filtered.length} reconstructions`}
fetch('assets/data/panoramic_cases.json').then(r=>r.json()).then(data=>{panoramicCases=data;const motions=['All',...new Set(data.map(x=>x.motion))];reconstructionFilters.innerHTML=motions.map((x,i)=>`<button class="recon-filter ${i===0?'active':''}" data-motion="${x}">${x.replaceAll('-',' ')}</button>`).join('');renderPanoramicCases()});
reconstructionFilters.addEventListener('click',e=>{if(!e.target.matches('button'))return;reconstructionFilters.querySelectorAll('button').forEach(x=>x.classList.remove('active'));e.target.classList.add('active');panoramicFilter=e.target.dataset.motion;panoramicExpanded=false;renderPanoramicCases()});reconstructionMore.addEventListener('click',()=>{panoramicExpanded=!panoramicExpanded;renderPanoramicCases()});

let caseData={},panoPoseViewer=null,activePanoCase=null;
const panoShowcases=[
  ['Serpentine','panorama-serpentine','A winding campus route demonstrates continuous 360° context through repeated changes of heading.'],
  ['Switchback','panorama-switchback','A residential route repeatedly turns back on itself while preserving surrounding spatial evidence.'],
  ['Meander','panorama-meander','A long mall-side traversal combines gentle bends with revisitation and broad peripheral coverage.']
];
function loadPanoShowcase(key){const item=caseData[key];if(!item)return;activePanoCase=item;const choice=panoShowcases.find(x=>x[1]===key);document.querySelector('#pano-case-title').textContent=choice[0]+' through a complete 360° field';document.querySelector('#pano-case-copy').textContent=choice[2];document.querySelectorAll('#pano-case-tabs button').forEach(x=>x.classList.toggle('active',x.dataset.case===key));const video=document.querySelector('#pano-case-video');video.src=item.video;video.poster=item.poster;video.load();video.play().catch(()=>{});if(!panoPoseViewer){panoPoseViewer=new PoseViewer(document.querySelector('#pano-pose-viewer'));panoPoseViewer.init()}panoPoseViewer.loadTrajectory(item.pose3d);panoPoseViewer.setShowFrustums(false);panoPoseViewer.setFollowMode(false);panoPoseViewer.setProgressHighlight(false);panoPoseViewer.setShowDirection(false);panoPoseViewer.setCurrentFrame(poseFrameAtTime(item,item.preview_start_s));panoPoseViewer._onResize()}
document.querySelector('#pano-case-tabs').innerHTML=panoShowcases.map((x,i)=>`<button class="${i===0?'active':''}" data-case="${x[1]}">${x[0]}</button>`).join('');
document.querySelector('#pano-case-tabs').addEventListener('click',e=>{if(e.target.matches('button'))loadPanoShowcase(e.target.dataset.case)});
document.querySelector('#pano-case-video').addEventListener('timeupdate',e=>{if(panoPoseViewer&&activePanoCase)panoPoseViewer.setCurrentFrame(poseFrameAtTime(activePanoCase,activePanoCase.preview_start_s+e.target.currentTime))});
fetch('assets/data/cases.json').then(r=>r.json()).then(data=>{caseData=data;renderAnnotationDemo();loadHomepageTrajectory('drone');loadPanoShowcase('panorama-serpentine')});
const modal=document.querySelector('#case-modal'),modalVideo=document.querySelector('#modal-video');
let modalPoseViewer=null,activeCase=null;
function openCase(key){const item=caseData[key];if(!item)return;activeCase=item;const type=types.find(x=>x.media===key);document.querySelector('#modal-title').textContent=type?.name||key;document.querySelector('#modal-meta').textContent=`${item.dataset} · ${item.clip} · preview from t=${item.preview_start_s}s`;modalVideo.src=item.video;modalVideo.poster=item.poster;document.querySelector('#modal-attributes').innerHTML=Object.entries(item.attributes).filter(([,v])=>v).map(([k,v])=>`<span><small>${k.replaceAll('_',' ')}</small>${String(v).replaceAll('_',' ')}</span>`).join('');document.querySelector('#modal-fields').innerHTML=Object.entries(item.overall).filter(([,v])=>v).map(([k,v])=>`<div class="modal-field"><b>${k}</b><p>${v}</p></div>`).join('');document.querySelector('#modal-segments').innerHTML=item.segments.map((s,i)=>`<div class="modal-segment"><b>S${i} · ${s.time?.join('–')}s${s.path?' · '+s.path.replaceAll('_',' '):''}</b><p>${s.text}</p></div>`).join('');modal.showModal();requestAnimationFrame(()=>{if(!modalPoseViewer){modalPoseViewer=new PoseViewer(document.querySelector('#modal-pose-3d'));modalPoseViewer.init()}modalPoseViewer.loadTrajectory(item.pose3d);modalPoseViewer.setShowFrustums(document.querySelector('#pose-frustums').checked);modalPoseViewer._onResize()});modalVideo.play().catch(()=>{})}
grid.addEventListener('click',e=>{const card=e.target.closest('.data-card');if(card)openCase(card.dataset.case)});grid.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('.data-card'))openCase(e.target.dataset.case)});document.querySelector('#modal-close').addEventListener('click',()=>modal.close());modal.addEventListener('close',()=>{modalVideo.pause();modalVideo.removeAttribute('src');modalVideo.load()});modal.addEventListener('click',e=>{if(e.target===modal)modal.close()});
modalVideo.addEventListener('timeupdate',()=>{if(!modalPoseViewer||!activeCase)return;modalPoseViewer.setCurrentFrame(poseFrameAtTime(activeCase,activeCase.preview_start_s+modalVideo.currentTime))});document.querySelector('#pose-frustums').addEventListener('change',e=>modalPoseViewer?.setShowFrustums(e.target.checked));document.querySelector('#pose-follow').addEventListener('change',e=>modalPoseViewer?.setFollowMode(e.target.checked));document.querySelector('#pose-reset').addEventListener('click',()=>modalPoseViewer?.resetCamera());

// ─── Interactive geographic map: hover a glowing marker → floating video preview ───
const GEO_SPOTS=[
  {x:16.9,y:34.5,place:'California · USA',tag:'Coastal & urban driving',vids:['driving','cycling','drone-ridge']},
  {x:29.4,y:30.5,place:'New York · USA',tag:'On-foot city capture',vids:['walking','escalator','static-pan']},
  {x:36.9,y:73.2,place:'Brazil',tag:'Tropical trails',vids:['walking-winding','walking-curve']},
  {x:49.7,y:25.4,place:'Western Europe',tag:'Streets & loops',vids:['walking-curve','driving-loop']},
  {x:52.8,y:26.4,place:'Alpine Europe',tag:'Mountain transit',vids:['cable-car','skiing','train']},
  {x:53.9,y:30.3,place:'Mediterranean',tag:'Waterways & vistas',vids:['boat','static-landscape']},
  {x:65.0,y:42.2,place:'United Arab Emirates',tag:'Aerial cityscapes',vids:['drone','driving']},
  {x:88.3,y:33.8,place:'Japan',tag:'Rail & pedestrian',vids:['train','walking-lturn','escalator']},
  {x:82.8,y:36.6,place:'Shanghai · China · 360°',tag:'Panoramic capture',vids:['panorama-serpentine','panorama-switchback']},
  {x:90.3,y:82.4,place:'Australia',tag:'Open-road motion',vids:['cycling','drone','cable-car-alpine']}
];
(function(){
  const host=document.querySelector('#geo-hotspots'),pop=document.querySelector('#geo-pop'),map=document.querySelector('#geo-canvas');
  if(!host||!pop||!map)return;
  host.innerHTML=GEO_SPOTS.map((s,i)=>`<button class="geo-hotspot" data-i="${i}" style="left:${s.x}%;top:${s.y}%" aria-label="Preview footage from ${s.place}"><i></i></button>`).join('');
  let openI=-1,hideT=null;
  function buildPop(s){
    const cards=s.vids.map(v=>`<div class="geo-vid"><video src="assets/videos/${v}.mp4" poster="assets/images/${v}.jpg" muted loop autoplay playsinline preload="auto"></video></div>`).join('');
    pop.innerHTML=`<div class="geo-pop-head"><b>${s.place}</b><span>${s.tag}</span></div><div class="geo-pop-vids">${cards}</div>`;
  }
  function showPop(i,btn){
    clearTimeout(hideT);
    if(openI!==i){openI=i;buildPop(GEO_SPOTS[i]);}
    pop.classList.add('show');pop.setAttribute('aria-hidden','false');
    const mr=map.getBoundingClientRect(),br=btn.getBoundingClientRect();
    const px=br.left-mr.left+br.width/2,py=br.top-mr.top;
    const pw=pop.offsetWidth,ph=pop.offsetHeight,pad=10;
    let left=px+14,top=py-ph-12;
    if(top<pad)top=py+br.height+12;                 // flip below when no room above
    if(left+pw>mr.width-pad)left=px-pw-14;           // flip left when overflowing right
    left=Math.max(pad,Math.min(left,mr.width-pw-pad));
    top=Math.max(pad,Math.min(top,mr.height-ph-pad));
    pop.style.left=left+'px';pop.style.top=top+'px';
    host.querySelectorAll('.geo-hotspot').forEach(b=>b.classList.toggle('active',+b.dataset.i===i));
  }
  function hidePop(){hideT=setTimeout(()=>{
    pop.classList.remove('show');pop.setAttribute('aria-hidden','true');
    host.querySelectorAll('.geo-hotspot').forEach(b=>b.classList.remove('active'));
    pop.querySelectorAll('video').forEach(v=>{v.pause();v.removeAttribute('src');v.load();});
    openI=-1;
  },130);}
  host.addEventListener('mouseover',e=>{const b=e.target.closest('.geo-hotspot');if(b)showPop(+b.dataset.i,b);});
  host.addEventListener('mouseout',e=>{if(e.target.closest('.geo-hotspot'))hidePop();});
  host.addEventListener('focusin',e=>{const b=e.target.closest('.geo-hotspot');if(b)showPop(+b.dataset.i,b);});
  host.addEventListener('focusout',hidePop);
  host.addEventListener('click',e=>{const b=e.target.closest('.geo-hotspot');if(!b)return;const i=+b.dataset.i;if(openI===i)hidePop();else showPop(i,b);});
})();
