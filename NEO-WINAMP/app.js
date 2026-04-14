/**
 * RADIO-PAVI — Broadcasting System v2026
 * Audio Engine · P2P WebRTC · ON AIR Mic Ducking · EQ · Visualizer
 */

// ═══════════════════════════ STATE ═══════════════════════════
const audioParams = {
    audioContext: null, analyser: null, source: null, panner: null,
    audioElement: (() => { const a = new Audio(); a.crossOrigin = "anonymous"; return a; })(),
    isPlaying: false, streamDest: null
};

let playlist = [], currentIndex = -1, selectedIndex = -1;
let isShuffle = false, isRepeat = false;
let eqFilters = [], db = null, animFrame = null;

// P2P & BROADCAST
let peer = null;
let p2pConnections = []; 
let lastTrackName = 'RADIO-PAVI >> READY';
let isAdmin = false;
let isTuningIn = false;
let listenerAudioCtx = null;

// ON AIR
let micStream = null, micSource = null, micGain = null, musicGain = null;
let micAnalyser = null, isOnAir = false, micMeterFrame = null;

// Skin
let currentTheme = 'matrix', vizMode = 'bars', scanlinesOn = true, glowLevel = 40, bgMode = 'void';
let themeColor = '#00ff41';

const EQ_BANDS  = [32,64,125,250,500,1000,2000,4000,8000,16000];
const EQ_LABELS = ['32','64','125','250','500','1K','2K','4K','8K','16K'];
const EQ_PRESETS = { flat:[0,0,0,0,0,0,0,0,0,0], bass:[8,6,4,2,0,-1,-1,-1,-1,-2], rock:[5,4,3,0,-1,-1,2,3,4,4], electronic:[6,5,0,-2,-4,0,4,4,5,6], vocal:[-2,-3,-2,2,5,5,3,1,-1,-2] };
const THEMES = { matrix:{color:'#00ff41',name:'MATRIX'}, amber:{color:'#ffa500',name:'AMBER'}, cyber:{color:'#00d4ff',name:'CYBER'}, neon:{color:'#bf40ff',name:'NEON'}, rose:{color:'#ff1493',name:'ROSE'}, blood:{color:'#ff3333',name:'BLOOD'}, ice:{color:'#b0c4ff',name:'ICE'} };

// ═══════════════════════════ DOM ═══════════════════════════
let DOM = {};
function queryDOM() {
    DOM = {
        player:document.getElementById('player'), splash:document.getElementById('splash'),
        fileInput:document.getElementById('file-input'), folderInput:document.getElementById('folder-input'),
        btnPlay:document.getElementById('btn-play'), btnPause:document.getElementById('btn-pause'),
        btnStop:document.getElementById('btn-stop'), btnNext:document.getElementById('btn-next'),
        btnPrev:document.getElementById('btn-prev'), btnEject:document.getElementById('btn-eject'),
        btnMin:document.getElementById('btn-min'), btnClose:document.getElementById('btn-close'), btnCfg:document.getElementById('btn-cfg'),
        volSlider:document.getElementById('volume-slider'), balSlider:document.getElementById('balance-slider'), progSlider:document.getElementById('progress-slider'),
        timeDisplay:document.getElementById('time-display'), trackName:document.getElementById('track-name'),
        playlistEl:document.getElementById('playlist'), dropZone:document.getElementById('drop-zone'), statsEl:document.getElementById('playlist-stats'), ambientGlow:document.getElementById('ambient-glow'),
        btnAdd:document.getElementById('btn-add'), btnAddFolder:document.getElementById('btn-add-folder'), btnRem:document.getElementById('btn-rem'), btnClear:document.getElementById('btn-clear'),
        navTabs:document.querySelectorAll('.tab'), viewLocal:document.getElementById('view-local'), viewCloud:document.getElementById('view-cloud'), viewBroadcast:document.getElementById('view-broadcast'),
        apiInput:document.getElementById('api-search-input'), btnApiSearch:document.getElementById('btn-api-search'), btnAddUrl:document.getElementById('btn-add-url'), apiResults:document.getElementById('api-results'), urlStatus:document.getElementById('url-status'),
        btnEq:document.getElementById('btn-eq'), btnPl:document.getElementById('btn-pl'), btnShuf:document.getElementById('btn-shuf'), btnRep:document.getElementById('btn-rep'),
        eqDeck:document.getElementById('eq-deck'), cfgDeck:document.getElementById('cfg-deck'), playlistDeck:document.getElementById('playlist-deck'),
        indPlay:document.getElementById('ind-play'), indPause:document.getElementById('ind-pause'), indAir:document.getElementById('ind-air'),
        canvas:document.getElementById('visualizer'), nCanvas:document.getElementById('neural-overlay'), scanlineOverlay:document.getElementById('scanline-overlay'), bgEffect:document.getElementById('bg-effect'),
        cfgScanlines:document.getElementById('cfg-scanlines'), cfgGlow:document.getElementById('cfg-glow'), swatchRow:document.getElementById('swatch-row'), vizModes:document.getElementById('viz-modes'), bgModes:document.getElementById('bg-modes'),
        
        // BROADCAST & ROLES
        tuneStatus:document.getElementById('tune-status'), btnTuneIn:document.getElementById('btn-tune-in'),
        adminPwd:document.getElementById('admin-pwd'), btnLoginSubmit:document.getElementById('btn-login-submit'), loginError:document.getElementById('login-error'),
        bdListener:document.getElementById('bd-listener'), bdAdmin:document.getElementById('bd-admin'), listenerCount:document.getElementById('listener-count'),

        // ON AIR
        btnOnAir:document.getElementById('btn-on-air'), airLabel:document.getElementById('air-label'), airDot:document.getElementById('air-dot'), micLevel:document.getElementById('mic-level'), duckSlider:document.getElementById('duck-slider'), duckVal:document.getElementById('duck-val')
    };
}
function flash(btn){if(!btn)return;btn.classList.remove('flash');void btn.offsetWidth;btn.classList.add('flash');setTimeout(()=>btn.classList.remove('flash'),250);}

// ═══════════════════════════ INITIALIZATION ═══════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
    try {
        queryDOM(); resizeCanvases(); drawIdleScreen(); renderSwatches(); loadSettings();
        
        // Hide admin-only elements safely
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
        
        DOM.splash.style.display = 'flex';
        runSplash();
        await openDB();
        await loadPersistedPlaylist();
        renderEQBands();
        setupEvents();
        
        // Default: Initialize as a regular client (Listener capability)
        initClientPeer();
    } catch (e) {
        alert("CRASH: " + e.message + "\nLine: " + e.lineNumber);
        console.error(e);
        // Fallback to remove splash
        setTimeout(() => { document.getElementById('splash').remove(); document.getElementById('player').style.opacity = '1'; }, 1000);
    }
});

function grantAdminPrivileges() {
    isAdmin = true;
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = ''); // removes inline block to restore default/css
    DOM.bdListener.style.display = 'none';
    DOM.bdAdmin.style.display = 'flex';
    
    // Destroy client peer and rebuild as host
    if(peer) peer.destroy();
    initAdminPeer();
}

// ═══════════════════════════ P2P LOGIC ═══════════════════════════
function setBroadcastTrackName(name) {
    lastTrackName = name;
    DOM.trackName.textContent = name;
    if(isAdmin) {
        p2pConnections.forEach(c => {
            if(c.conn && c.conn.open) c.conn.send({type: 'metadata', track: name});
        });
    }
}

function updateAdminListenerCount() {
    const active = p2pConnections.filter(c => c.conn && c.conn.open).length;
    DOM.listenerCount.textContent = active + ' OYENTES';
    DOM.listenerCount.style.display = active > 0 ? 'inline-block' : 'none';
    p2pConnections.forEach(c => {
        if(c.conn && c.conn.open) c.conn.send({type: 'stats', listeners: active});
    });
}

function initAdminPeer() {
    peer = new Peer('radiopavi-admin');
    peer.on('open', id => console.log('Admin Peer Online:', id));
    
    peer.on('connection', conn => {
        const connectionObj = { conn, call: null };
        p2pConnections.push(connectionObj);
        
        conn.on('open', () => {
            updateAdminListenerCount();
            conn.send({type: 'metadata', track: lastTrackName});
            
            initAudio(); // ensure streamDest exists
            if (audioParams.streamDest) {
                const call = peer.call(conn.peer, audioParams.streamDest.stream);
                connectionObj.call = call;
            }
        });
        
        conn.on('close', () => {
            p2pConnections = p2pConnections.filter(c => c.conn.peer !== conn.peer);
            updateAdminListenerCount();
        });
    });
    peer.on('error', err => console.error('Admin Peer error:', err));
}

function initClientPeer() {
    peer = new Peer();
    peer.on('open', id => {
        DOM.tuneStatus.textContent = 'SEÑAL ENCONTRADA';
        DOM.tuneStatus.style.color = 'var(--green)';
        DOM.btnTuneIn.style.display = 'inline-block';
    });

    peer.on('error', err => {
        DOM.tuneStatus.textContent = 'SEÑAL NO ENCONTRADA (Offline)';
        DOM.tuneStatus.style.color = 'var(--red)';
        DOM.btnTuneIn.style.display = 'none';
    });

    peer.on('call', call => {
        call.answer(); 
        call.on('stream', remoteStream => {
            console.log('Received Live Stream');
            startListenerWebAudio(remoteStream);
        });
    });
}

function stopListenerWebAudio() {
    isTuningIn = false;
    if(listenerAudioCtx) {
        listenerAudioCtx.close();
        listenerAudioCtx = null;
    }
    // Restore normal viz
    initAudio(); // recreates context if needed
    document.getElementById('net-badge').textContent = 'ST';
    DOM.timeDisplay.textContent = '00:00';
    DOM.btnTuneIn.textContent = 'SINTONIZAR TRANSMISIÓN';
    DOM.btnTuneIn.style.background = 'var(--green)';
    DOM.trackName.textContent = 'SEÑAL DESCONECTADA';
}

function startListenerWebAudio(stream) {
    if(audioParams.isPlaying) stopAudio(); // pause local player
    isTuningIn = true;
    
    listenerAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    listenerAudioCtx.resume(); 

    const source = listenerAudioCtx.createMediaStreamSource(stream);
    const analyser = listenerAudioCtx.createAnalyser();
    analyser.fftSize = 256;

    source.connect(analyser);
    analyser.connect(listenerAudioCtx.destination);

    // Swap visualizer target
    audioParams.analyser = analyser; 
    
    document.getElementById('net-badge').textContent = 'NET';
    DOM.timeDisplay.textContent = 'LIVE';
    startVisualizer(); // Will pull from listenerAudioCtx's analyser
}

// ═══════════════════════════ EVENTS ═══════════════════════════
function setupEvents() {
    // Auth & Tune In
    DOM.btnLoginSubmit.addEventListener('click', () => {
        if(DOM.adminPwd.value === 'admin123') grantAdminPrivileges();
        else DOM.loginError.textContent = 'Acceso Denegado';
    });

    DOM.btnTuneIn.addEventListener('click', () => {
        if(isTuningIn) {
            stopListenerWebAudio();
            return;
        }
        DOM.tuneStatus.textContent = 'SINTONIZANDO...';
        DOM.btnTuneIn.textContent = 'DESCONECTAR';
        DOM.btnTuneIn.style.background = 'var(--red)';
        
        const conn = peer.connect('radiopavi-admin');
        conn.on('open', () => console.log('Data link to admin open'));
        conn.on('data', data => {
            if(data.type === 'metadata') {
                DOM.trackName.textContent = data.track.toUpperCase() + ' (LIVE)';
            }
        });
        conn.on('close', () => stopListenerWebAudio());
    });

    // Transport
    DOM.btnPlay.addEventListener('click',()=>{flash(DOM.btnPlay);if(isTuningIn) stopListenerWebAudio(); if(playlist.length===0)DOM.fileInput.click();else if(!audioParams.isPlaying){if(currentIndex===-1)loadTrack(0);else playAudio();}});
    DOM.btnPause.addEventListener('click',()=>{flash(DOM.btnPause);if(isTuningIn) stopListenerWebAudio(); if(audioParams.isPlaying)pauseAudio();else if(currentIndex>=0)playAudio();});
    DOM.btnStop.addEventListener('click',()=>{flash(DOM.btnStop);if(isTuningIn) stopListenerWebAudio(); stopAudio();});
    DOM.btnNext.addEventListener('click',()=>{flash(DOM.btnNext);if(isTuningIn) stopListenerWebAudio(); if(!playlist.length)return;if(isShuffle)loadTrack(Math.floor(Math.random()*playlist.length));else if(currentIndex<playlist.length-1)loadTrack(currentIndex+1);else loadTrack(0);});
    DOM.btnPrev.addEventListener('click',()=>{flash(DOM.btnPrev);if(isTuningIn) stopListenerWebAudio(); if(!playlist.length)return;if(audioParams.audioElement.currentTime>3)audioParams.audioElement.currentTime=0;else if(currentIndex>0)loadTrack(currentIndex-1);else audioParams.audioElement.currentTime=0;});
    DOM.btnEject.addEventListener('click',()=>{flash(DOM.btnEject);DOM.fileInput.click();});

    // Window
    DOM.btnMin.addEventListener('click',()=>DOM.player.classList.toggle('minimized'));
    DOM.btnClose.addEventListener('click',()=>{stopAudio();if(isOnAir)goOffAir();DOM.player.style.transition='opacity .3s,transform .3s';DOM.player.style.opacity='0';DOM.player.style.transform='scale(0.95)';setTimeout(()=>DOM.player.style.display='none',300);});
    if(DOM.btnCfg) DOM.btnCfg.addEventListener('click',()=>DOM.cfgDeck.classList.toggle('cfg-open'));

    // ON AIR
    if(DOM.btnOnAir) DOM.btnOnAir.addEventListener('click', () => { if(isOnAir) goOffAir(); else goOnAir(); });
    if(DOM.duckSlider) DOM.duckSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value); DOM.duckVal.textContent = val + '%';
        if (isOnAir && musicGain && audioParams.audioContext) {
            const now = audioParams.audioContext.currentTime;
            musicGain.gain.cancelScheduledValues(now); musicGain.gain.setValueAtTime(musicGain.gain.value, now); musicGain.gain.linearRampToValueAtTime(val / 100, now + 0.1);
        }
    });

    // Sliders
    DOM.volSlider.addEventListener('input',e=>{audioParams.audioElement.volume=e.target.value;});
    DOM.balSlider.addEventListener('input',e=>{if(audioParams.panner)audioParams.panner.pan.value=parseFloat(e.target.value);});
    DOM.progSlider.addEventListener('input',e=>{if(audioParams.audioElement.duration)audioParams.audioElement.currentTime=(e.target.value/100)*audioParams.audioElement.duration;});

    // Toggles
    DOM.btnEq.addEventListener('click',()=>{DOM.btnEq.classList.toggle('active');DOM.eqDeck.classList.toggle('eq-open',DOM.btnEq.classList.contains('active'));});
    DOM.btnPl.addEventListener('click',()=>{DOM.btnPl.classList.toggle('active');DOM.playlistDeck.style.display=DOM.btnPl.classList.contains('active')?'flex':'none';});
    DOM.btnShuf.addEventListener('click',()=>{DOM.btnShuf.classList.toggle('active');isShuffle=DOM.btnShuf.classList.contains('active');});
    DOM.btnRep.addEventListener('click',()=>{DOM.btnRep.classList.toggle('active');isRepeat=DOM.btnRep.classList.contains('active');});

    // Time + ended 
    audioParams.audioElement.addEventListener('timeupdate',()=>{const c=audioParams.audioElement.currentTime,d=audioParams.audioElement.duration;if(d)DOM.progSlider.value=(c/d)*100;DOM.timeDisplay.textContent=`${String(Math.floor(c/60)).padStart(2,'0')}:${String(Math.floor(c%60)).padStart(2,'0')}`;});
    audioParams.audioElement.addEventListener('ended',()=>{if(isRepeat)loadTrack(currentIndex);else if(isShuffle)loadTrack(Math.floor(Math.random()*playlist.length));else if(currentIndex<playlist.length-1)loadTrack(currentIndex+1);else stopAudio();});

    // Files & Drag Drop
    DOM.fileInput.addEventListener('change',e=>{handleFiles(e.target.files);e.target.value='';});
    if(DOM.folderInput)DOM.folderInput.addEventListener('change',e=>{handleFiles(e.target.files);e.target.value='';});
    DOM.dropZone.addEventListener('dragover',e=>{e.preventDefault();DOM.dropZone.style.borderColor='var(--green)';DOM.dropZone.style.boxShadow='inset 0 0 15px var(--green-glow)';});
    DOM.dropZone.addEventListener('dragleave',e=>{e.preventDefault();DOM.dropZone.style.borderColor='';DOM.dropZone.style.boxShadow='';});
    DOM.dropZone.addEventListener('drop',e=>{e.preventDefault();DOM.dropZone.style.borderColor='';DOM.dropZone.style.boxShadow='';handleFiles(e.dataTransfer.files);});

    // Playlist buttons
    DOM.btnAdd.addEventListener('click',()=>DOM.fileInput.click());
    DOM.btnAddFolder.addEventListener('click',()=>DOM.folderInput&&DOM.folderInput.click());
    DOM.btnRem.addEventListener('click',()=>{const i=selectedIndex>=0?selectedIndex:currentIndex;if(i<0||i>=playlist.length)return;const w=i===currentIndex;const t=playlist[i];playlist.splice(i,1);selectedIndex=-1;if(w){stopAudio();currentIndex=-1;}else if(currentIndex>i)currentIndex--;if(t.dbId)dbDelete(t.dbId);renderPlaylist();updateStats();saveURLPlaylist();});
    DOM.btnClear.addEventListener('click',async()=>{playlist=[];currentIndex=-1;selectedIndex=-1;stopAudio();await dbClear();localStorage.removeItem('radio_pavi_urls');renderPlaylist();updateStats();});

    // Tabs
    DOM.navTabs.forEach(tab=>{
        tab.addEventListener('click',()=>{
            DOM.navTabs.forEach(t=>t.classList.remove('active'));tab.classList.add('active');
            DOM.viewLocal.style.display=tab.dataset.target==='local'?'flex':'none';
            DOM.viewCloud.style.display=tab.dataset.target==='cloud'?'flex':'none';
            DOM.viewBroadcast.style.display=tab.dataset.target==='broadcast'?'flex':'none';
        });
    });

    // Net Terminal
    DOM.apiInput.addEventListener('input',()=>{const v=DOM.apiInput.value.trim();if(v.startsWith('http'))DOM.btnAddUrl.classList.add('url-hot');else DOM.btnAddUrl.classList.remove('url-hot');});
    DOM.btnAddUrl.addEventListener('click',()=>testAndAddURL());
    DOM.btnApiSearch.addEventListener('click',()=>{const v=DOM.apiInput.value.trim();if(!v)return;if(v.startsWith('http'))testAndAddURL();else searchiTunes(v);});
    DOM.apiInput.addEventListener('keypress',e=>{if(e.key==='Enter'){const v=DOM.apiInput.value.trim();if(v.startsWith('http'))testAndAddURL();else if(v)searchiTunes(v);}});
}

// ═══════════════════════════ PLAYLIST & DATA MANAGER ═══════════════════════════
async function loadPersistedPlaylist() {
    try { const s=localStorage.getItem('radio_pavi_urls'); if(s) JSON.parse(s).forEach(t=>playlist.push({...t,source:'url'})); } catch(e){}
    const dbT = await dbLoadAll(); dbT.forEach(t=>{ playlist.push({name:t.name,blob:new Blob([t.data],{type:t.type}),duration:t.duration||'00:00',dbId:t.id,source:'local'}); });
    renderPlaylist(); updateStats();
}
function saveURLPlaylist(){ localStorage.setItem('radio_pavi_urls',JSON.stringify(playlist.filter(t=>t.source==='url').map(t=>({name:t.name,url:t.url,artwork:t.artwork,duration:t.duration})))); }

async function handleFiles(fileList){
    const files=Array.from(fileList).filter(f=>f.type.startsWith('audio/'));if(!files.length)return;
    const startIdx=playlist.length;
    for(const f of files){const name=f.name.replace(/\.[^/.]+$/,'');const obj={name,file:f,duration:'00:00',source:'local'};playlist.push(obj);const tmp=new Audio();tmp.src=URL.createObjectURL(f);tmp.addEventListener('loadedmetadata',function(){obj.duration=`${String(Math.floor(tmp.duration/60)).padStart(2,'0')}:${String(Math.floor(tmp.duration%60)).padStart(2,'0')}`;renderPlaylist();dbSave(name,f,obj.duration);URL.revokeObjectURL(tmp.src);},{once:true});}
    renderPlaylist();updateStats();if(currentIndex===-1)loadTrack(startIdx);
}
function renderPlaylist(){DOM.playlistEl.innerHTML='';if(!playlist.length){DOM.playlistEl.innerHTML='<li class="pl-empty">Drop audio files or click + ADD...</li>';return;}playlist.forEach((t,i)=>{const li=document.createElement('li');li.innerHTML=`<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">${i+1}. ${t.name}</span><span style="flex-shrink:0;opacity:.6;margin-left:8px;">${t.duration}</span>`;li.addEventListener('click',()=>{selectedIndex=i;updatePlaylistHighlight();});li.addEventListener('dblclick',()=>loadTrack(i));DOM.playlistEl.appendChild(li);});updatePlaylistHighlight();}
function updatePlaylistHighlight(){const items=DOM.playlistEl.querySelectorAll('li');items.forEach(li=>{li.classList.remove('playing','selected');});if(currentIndex>=0&&currentIndex<items.length){items[currentIndex].classList.add('playing');items[currentIndex].scrollIntoView({behavior:'smooth',block:'nearest'});}if(selectedIndex>=0&&selectedIndex<items.length&&selectedIndex!==currentIndex)items[selectedIndex].classList.add('selected');}
function updateStats(){DOM.statsEl.textContent=`${playlist.length} TRACKS`;}

function setStatus(msg,cls){DOM.urlStatus.textContent=msg;DOM.urlStatus.className='url-status '+(cls||'');if(cls==='success')setTimeout(()=>{DOM.urlStatus.textContent='';DOM.urlStatus.className='url-status';},4000);}
function testAndAddURL(){const url=DOM.apiInput.value.trim(); if(!url||(!url.startsWith('http://')&&!url.startsWith('https://'))){setStatus('⚠ Enter a valid URL','error');return;}setStatus('CONNECTING TO SIGNAL...','loading');const testAudio=new Audio();testAudio.crossOrigin='anonymous';let resolved=false;const timeout=setTimeout(()=>{if(resolved)return;resolved=true;addURLTrack(url);setStatus('✓ TRACK QUEUED (slow server)','success');},6000);testAudio.addEventListener('canplay',()=>{if(resolved)return;resolved=true;clearTimeout(timeout);addURLTrack(url,testAudio.duration?`${String(Math.floor(testAudio.duration/60)).padStart(2,'0')}:${String(Math.floor(testAudio.duration%60)).padStart(2,'0')}`:'LIVE');setStatus('✓ SIGNAL LOCKED — SAVED','success');},{once:true});testAudio.addEventListener('error',()=>{if(resolved)return;resolved=true;clearTimeout(timeout);addURLTrack(url);setStatus('⚠ WEAK SIGNAL — added anyway','error');},{once:true});testAudio.src=url;testAudio.load();}
function addURLTrack(url,duration){const name=decodeURIComponent(url.split('/').pop().split('?')[0]).replace(/\.[^/.]+$/,'')||'Audio Stream';playlist.push({name,url,duration:duration||'URL',source:'url'});renderPlaylist();updateStats();saveURLPlaylist();DOM.apiInput.value='';DOM.btnAddUrl.classList.remove('url-hot');if(currentIndex===-1)loadTrack(playlist.length-1);}
async function searchiTunes(query){DOM.apiResults.innerHTML='<li class="pl-empty" style="color:var(--amber)">SCANNING FREQUENCIES...</li>';try{const res=await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=20`); const data=await res.json();DOM.apiResults.innerHTML='';if(!data.results.length){DOM.apiResults.innerHTML='<li class="pl-empty" style="color:var(--red)">NO SIGNAL</li>';return;}data.results.forEach(track=>{if(!track.previewUrl)return;const li=document.createElement('li');li.innerHTML=`<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;display:flex;align-items:center;gap:6px;"><img src="${track.artworkUrl60||''}" style="width:22px;height:22px;border-radius:2px;flex-shrink:0;" onerror="this.style.display='none'">${track.trackName} — <span style="opacity:.6">${track.artistName}</span></span><button class="url-btn" style="padding:2px 8px;font-size:.55rem;">+ADD</button>`;li.querySelector('button').addEventListener('click',e=>{e.stopPropagation();playlist.push({name:`${track.trackName} — ${track.artistName}`,url:track.previewUrl,artwork:track.artworkUrl100,duration:'0:30',source:'url'});renderPlaylist();updateStats();saveURLPlaylist();e.target.textContent='✓';e.target.style.background='var(--green)';e.target.style.color='#000';});li.addEventListener('dblclick',()=>{playlist.push({name:`${track.trackName} — ${track.artistName}`,url:track.previewUrl,artwork:track.artworkUrl100,duration:'0:30',source:'url'});renderPlaylist();updateStats();saveURLPlaylist();loadTrack(playlist.length-1);});DOM.apiResults.appendChild(li);});}catch(e){DOM.apiResults.innerHTML='<li class="pl-empty" style="color:var(--red)">CONNECTION FAILED</li>';}}

// ═══════════════════════════ GLOBAL VISUALIZER ═══════════════════════════
let ctx,nCtx;
function resizeCanvases(){if(!DOM.canvas)return;ctx=DOM.canvas.getContext('2d');nCtx=DOM.nCanvas.getContext('2d');DOM.canvas.width=DOM.canvas.parentElement.clientWidth;DOM.canvas.height=DOM.canvas.parentElement.clientHeight;DOM.nCanvas.width=DOM.canvas.width;DOM.nCanvas.height=DOM.canvas.height;}
function startVisualizer(){
    if(animFrame)cancelAnimationFrame(animFrame); if(!audioParams.analyser)return;
    const bufLen=audioParams.analyser.frequencyBinCount, freqData=new Uint8Array(bufLen), timeData=new Uint8Array(bufLen);
    function draw(){
        if(!audioParams.isPlaying && !isOnAir && !isTuningIn) return;
        animFrame=requestAnimationFrame(draw);
        const color=themeColor;
        if(vizMode==='bars'){audioParams.analyser.getByteFrequencyData(freqData);drawBars(freqData,DOM.canvas.width,DOM.canvas.height,color);}
        else if(vizMode==='wave'){audioParams.analyser.getByteTimeDomainData(timeData);drawWave(timeData,DOM.canvas.width,DOM.canvas.height,color);}
        else if(vizMode==='ring'){audioParams.analyser.getByteFrequencyData(freqData);drawRing(freqData,DOM.canvas.width,DOM.canvas.height,color);}
    }
    draw();
}
function startMicVisualizer() { startVisualizer(); } 
function drawBars(data,w,h,color){ctx.fillStyle='rgb(0,6,0)';ctx.fillRect(0,0,w,h);const barW=(w/data.length)*2.5;let x=0;const cr=parseInt(color.slice(1,3),16)||0,cg=parseInt(color.slice(3,5),16)||255,cb=parseInt(color.slice(5,7),16)||65;for(let i=0;i<data.length;i++){const barH=(data[i]/255)*h;let r=cr,g=cg,b=cb;if(barH>h*.6){r=255;g=255;b=0;}if(barH>h*.8){r=255;g=50;b=0;}ctx.fillStyle=`rgb(${r},${g},${b})`;let y=h;while(y>h-barH){ctx.fillRect(x,y-3,barW-1,2.5);y-=4;}x+=barW;}nCtx.clearRect(0,0,w,h);nCtx.beginPath();x=0;for(let i=0;i<data.length;i++){const v=data[i]/255;const y=h-v*h+Math.sin(i*.1+performance.now()*.004)*4;if(i===0)nCtx.moveTo(x,y);else nCtx.lineTo(x,y);x+=barW;}nCtx.lineWidth=1;nCtx.strokeStyle='rgba(255,255,255,0.6)';nCtx.stroke();}
function drawWave(data,w,h,color){ctx.fillStyle='rgb(0,4,0)';ctx.fillRect(0,0,w,h);ctx.strokeStyle='rgba(0,255,65,0.06)';ctx.lineWidth=1;for(let y=0;y<h;y+=8){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}ctx.beginPath();const sliceW=w/data.length;for(let i=0;i<data.length;i++){const v=data[i]/128;const y=v*(h/2);if(i===0)ctx.moveTo(0,y);else ctx.lineTo(i*sliceW,y);}ctx.strokeStyle=color;ctx.lineWidth=2;ctx.shadowColor=color;ctx.shadowBlur=6;ctx.stroke();ctx.shadowBlur=0;ctx.beginPath();for(let i=0;i<data.length;i++){const v=data[i]/128;const y=v*(h/2);if(i===0)ctx.moveTo(0,y);else ctx.lineTo(i*sliceW,y);}ctx.strokeStyle='rgba(255,255,255,0.4)';ctx.lineWidth=.5;ctx.stroke();nCtx.clearRect(0,0,w,h);}
function drawRing(data,w,h,color){ctx.fillStyle='rgb(0,3,0)';ctx.fillRect(0,0,w,h);const cx=w/2,cy=h/2,radius=Math.min(w,h)*.3;const r=parseInt(color.slice(1,3),16)||0,g=parseInt(color.slice(3,5),16)||255,b=parseInt(color.slice(5,7),16)||65;ctx.beginPath();for(let i=0;i<data.length;i++){const a=(i/data.length)*Math.PI*2-Math.PI/2;const amp=(data[i]/255)*radius*.6;const x=cx+Math.cos(a)*(radius+amp);const y=cy+Math.sin(a)*(radius+amp);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.closePath();ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.shadowColor=color;ctx.shadowBlur=8;ctx.stroke();ctx.shadowBlur=0;ctx.beginPath();for(let i=0;i<data.length;i++){const a=(i/data.length)*Math.PI*2-Math.PI/2;const amp=(data[i]/255)*radius*.8;const x=cx+Math.cos(a)*(radius*.7+amp);const y=cy+Math.sin(a)*(radius*.7+amp);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.closePath();ctx.strokeStyle=`rgba(${r},${g},${b},0.3)`;ctx.lineWidth=1;ctx.stroke();ctx.beginPath();ctx.arc(cx,cy,3,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();nCtx.clearRect(0,0,w,h);}
function drawIdleScreen(){if(!ctx||!DOM.canvas)return;ctx.fillStyle='rgb(0,4,0)';ctx.fillRect(0,0,DOM.canvas.width,DOM.canvas.height);ctx.fillStyle='rgba(0,255,65,0.15)';ctx.font='9px "Share Tech Mono"';ctx.textAlign='center';ctx.fillText('AWAITING SIGNAL...',DOM.canvas.width/2,DOM.canvas.height/2+3);if(nCtx)nCtx.clearRect(0,0,DOM.canvas.width,DOM.canvas.height);}

// ═══════════════════════════ ADMIN AUDIO ENGINE ═══════════════════════════
function initAudio() {
    if (audioParams.audioContext) return;
    audioParams.audioContext = new (window.AudioContext||window.webkitAudioContext)();
    audioParams.analyser = audioParams.audioContext.createAnalyser();
    audioParams.analyser.fftSize = 256;
    audioParams.source = audioParams.audioContext.createMediaElementSource(audioParams.audioElement);
    audioParams.panner = audioParams.audioContext.createStereoPanner();

    // The destination for P2P Broadcast
    audioParams.streamDest = audioParams.audioContext.createMediaStreamDestination();

    musicGain = audioParams.audioContext.createGain();
    musicGain.gain.value = 1.0;

    eqFilters = EQ_BANDS.map((freq,i)=>{
        const f = audioParams.audioContext.createBiquadFilter();
        f.type = i===0?'lowshelf':i===EQ_BANDS.length-1?'highshelf':'peaking';
        f.frequency.value=freq; f.gain.value=0; f.Q.value=1.4; return f;
    });

    audioParams.source.connect(eqFilters[0]);
    for(let i=0;i<eqFilters.length-1;i++) eqFilters[i].connect(eqFilters[i+1]);
    
    eqFilters[eqFilters.length-1].connect(musicGain);
    musicGain.connect(audioParams.panner);
    audioParams.panner.connect(audioParams.analyser);
    audioParams.analyser.connect(audioParams.audioContext.destination);

    // Audio also routes to Broadcast Stream Destination
    musicGain.connect(audioParams.streamDest);
    EQ_BANDS.forEach((_,i)=>{const s=document.getElementById(`eq-${i}`);if(s&&eqFilters[i])eqFilters[i].gain.value=parseFloat(s.value);});
}

function loadTrack(index){
    if(index<0||index>=playlist.length)return;
    const apply=()=>{
        currentIndex=index; const t=playlist[index];
        if(t.blob) audioParams.audioElement.src=URL.createObjectURL(t.blob);
        else if(t.file) audioParams.audioElement.src=URL.createObjectURL(t.file);
        else if(t.url) audioParams.audioElement.src=t.url;
        try{if(t.blob||t.file)extractMetadata(t.blob||t.file);else if(t.artwork)getPredominantColor(t.artwork,rgb=>applyChameleonMode(rgb.r,rgb.g,rgb.b,t.artwork));else resetChameleon();}catch(e){resetChameleon();}
        setBroadcastTrackName(t.name);
        updatePlaylistHighlight();
        audioParams.audioElement.volume=parseFloat(DOM.volSlider.value)||0.8;
        playAudio();
    };
    if(audioParams.isPlaying){let f=setInterval(()=>{if(audioParams.audioElement.volume>0.05){audioParams.audioElement.volume=Math.max(0,audioParams.audioElement.volume-0.05);}else{clearInterval(f);audioParams.audioElement.pause();apply();}},25);}else{apply();}
}

function playAudio(){
    initAudio();
    audioParams.audioContext.resume().then(()=>{
        audioParams.audioElement.play().then(()=>{audioParams.isPlaying=true;updateTransportUI('play');startVisualizer();}).catch(e=>console.error('Play:',e));
    });
}
function pauseAudio(){if(!audioParams.isPlaying)return;audioParams.audioElement.pause();audioParams.isPlaying=false;updateTransportUI('pause');}
function stopAudio(){audioParams.audioElement.pause();audioParams.audioElement.currentTime=0;audioParams.isPlaying=false;updateTransportUI('stop');drawIdleScreen();setBroadcastTrackName('RADIO-PAVI >> COMPLETED');}
function updateTransportUI(state){
    DOM.btnPlay.classList.remove('active-green');DOM.btnPause.classList.remove('active-amber');
    if(DOM.indPlay)DOM.indPlay.classList.remove('on');if(DOM.indPause)DOM.indPause.classList.remove('on');
    if(state==='play'){DOM.btnPlay.classList.add('active-green');if(DOM.indPlay)DOM.indPlay.classList.add('on');}
    else if(state==='pause'){DOM.btnPause.classList.add('active-amber');if(DOM.indPause)DOM.indPause.classList.add('on');}
}

// ═══════════════════════════ ON AIR — LIVE MIC ═══════════════════════════
async function goOnAir() {
    initAudio();
    if (!micStream) {
        try {
            micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
            micSource = audioParams.audioContext.createMediaStreamSource(micStream);
            micGain = audioParams.audioContext.createGain();
            micGain.gain.value = 0;
            micAnalyser = audioParams.audioContext.createAnalyser();
            micAnalyser.fftSize = 256;
            
            micSource.connect(micAnalyser);
            micSource.connect(micGain);
            micGain.connect(audioParams.analyser); // To speakers
            micGain.connect(audioParams.streamDest); // To broadcast
        } catch(e) {
            console.error('Mic denied:', e);
            DOM.airLabel.textContent = 'DENIED';
            setTimeout(() => { DOM.airLabel.textContent = 'ON AIR'; }, 2000);
            return;
        }
    }
    isOnAir = true;
    const now = audioParams.audioContext.currentTime;
    const duckLevel = parseInt(DOM.duckSlider.value) / 100;
    
    // Duck music
    musicGain.gain.cancelScheduledValues(now);
    musicGain.gain.setValueAtTime(musicGain.gain.value, now);
    musicGain.gain.linearRampToValueAtTime(duckLevel, now + 0.5);
    
    // Fade in mic
    micGain.gain.cancelScheduledValues(now);
    micGain.gain.setValueAtTime(0, now);
    micGain.gain.linearRampToValueAtTime(1.0, now + 0.3);

    if(DOM.btnOnAir) DOM.btnOnAir.classList.add('active'); if(DOM.airLabel) DOM.airLabel.textContent = 'LIVE';
    if(DOM.indAir) DOM.indAir.classList.add('on');
    startMicMeter();
    if (!audioParams.isPlaying) startMicVisualizer();
}

function goOffAir() {
    isOnAir = false;
    if (audioParams.audioContext && musicGain && micGain) {
        const now = audioParams.audioContext.currentTime;
        micGain.gain.cancelScheduledValues(now); micGain.gain.setValueAtTime(micGain.gain.value, now); micGain.gain.linearRampToValueAtTime(0, now + 0.3);
        musicGain.gain.cancelScheduledValues(now); musicGain.gain.setValueAtTime(musicGain.gain.value, now); musicGain.gain.linearRampToValueAtTime(1.0, now + 0.8);
    }
    if(DOM.btnOnAir) DOM.btnOnAir.classList.remove('active'); if(DOM.airLabel) DOM.airLabel.textContent = 'ON AIR';
    if(DOM.indAir) DOM.indAir.classList.remove('on');
    stopMicMeter();
}

function startMicMeter() {
    if (!micAnalyser) return;
    const data = new Uint8Array(micAnalyser.frequencyBinCount);
    function update() {
        if (!isOnAir) return;
        micMeterFrame = requestAnimationFrame(update);
        micAnalyser.getByteFrequencyData(data);
        let sum = 0; for (let i = 0; i < data.length; i++) sum += data[i];
        if(DOM.micLevel) DOM.micLevel.style.width = Math.min(100, ((sum / data.length) / 100) * 100) + '%';
    }
    update();
}
function stopMicMeter() { if (micMeterFrame) cancelAnimationFrame(micMeterFrame); if(DOM.micLevel) DOM.micLevel.style.width = '0%'; }

// ═══════════════════════════ SKIN SYSTEM API ═══════════════════════════
function renderEQBands(){const c=document.getElementById('eq-bands');if(!c)return;c.innerHTML='';EQ_LABELS.forEach((l,i)=>{const d=document.createElement('div');d.className='eq-band';d.innerHTML=`<span class="eq-val" id="eq-val-${i}">0</span><input type="range" class="eq-slider" id="eq-${i}" orient="vertical" min="-12" max="12" value="0" step="1"><span class="eq-lbl">${l}</span>`;c.appendChild(d);d.querySelector('.eq-slider').addEventListener('input',function(){const g=parseFloat(this.value);document.getElementById(`eq-val-${i}`).textContent=(g>0?'+':'')+g;if(eqFilters[i])eqFilters[i].gain.value=g;});});document.querySelectorAll('.eq-preset').forEach(btn=>{btn.addEventListener('click',()=>applyEQPreset(btn.dataset.preset));});}
function applyEQPreset(name){const gains=EQ_PRESETS[name]||EQ_PRESETS.flat;gains.forEach((g,i)=>{const s=document.getElementById(`eq-${i}`),v=document.getElementById(`eq-val-${i}`);if(s)s.value=g;if(v)v.textContent=(g>0?'+':'')+g;if(eqFilters[i])eqFilters[i].gain.value=g;});}
function renderSwatches(){if(!DOM.swatchRow)return;DOM.swatchRow.innerHTML='';Object.entries(THEMES).forEach(([key,theme])=>{const el=document.createElement('div');el.className='swatch'+(key===currentTheme?' active':'');el.style.background=theme.color;el.title=theme.name;el.dataset.theme=key;el.innerHTML='<span class="check">✓</span>';el.addEventListener('click',()=>applyTheme(key));DOM.swatchRow.appendChild(el);});}
function applyTheme(key){const theme=THEMES[key];if(!theme)return;currentTheme=key;themeColor=theme.color;const r=parseInt(theme.color.slice(1,3),16),g=parseInt(theme.color.slice(3,5),16),b=parseInt(theme.color.slice(5,7),16);document.documentElement.style.setProperty('--green',theme.color);document.documentElement.style.setProperty('--green-glow',`rgba(${r},${g},${b},0.45)`);document.documentElement.style.setProperty('--green-dim',`rgba(${r},${g},${b},0.08)`);document.documentElement.style.setProperty('--led-off',`rgb(${Math.max(5,Math.floor(r*.04))},${Math.max(10,Math.floor(g*.04))},${Math.max(5,Math.floor(b*.04))})`);DOM.swatchRow.querySelectorAll('.swatch').forEach(s=>s.classList.toggle('active',s.dataset.theme===key));saveSettings();}
function setVizMode(mode){vizMode=mode;if(DOM.vizModes)DOM.vizModes.querySelectorAll('.cfg-opt').forEach(b=>b.classList.toggle('active',b.dataset.viz===mode));saveSettings();}
function setBgMode(mode){bgMode=mode;if(DOM.bgEffect){DOM.bgEffect.className='';if(mode==='grid')DOM.bgEffect.className='bg-grid';else if(mode==='stars')DOM.bgEffect.className='bg-stars';}if(DOM.bgModes)DOM.bgModes.querySelectorAll('.cfg-opt').forEach(b=>b.classList.toggle('active',b.dataset.bg===mode));saveSettings();}
function setScanlines(on){scanlinesOn=on;if(DOM.scanlineOverlay)DOM.scanlineOverlay.style.display=on?'':'none';if(DOM.cfgScanlines){DOM.cfgScanlines.textContent=on?'ON':'OFF';DOM.cfgScanlines.classList.toggle('on',on);DOM.cfgScanlines.classList.toggle('off',!on);}saveSettings();}
function setGlow(level){glowLevel=level;if(DOM.ambientGlow)DOM.ambientGlow.style.opacity=(level/100)*.3;if(DOM.cfgGlow)DOM.cfgGlow.value=level;saveSettings();}
function saveSettings(){localStorage.setItem('radio_pavi_skin',JSON.stringify({theme:currentTheme,vizMode,scanlinesOn,glowLevel,bgMode}));}
function loadSettings(){try{const s=JSON.parse(localStorage.getItem('radio_pavi_skin'));if(!s)return;if(s.theme&&THEMES[s.theme])applyTheme(s.theme);if(s.vizMode)setVizMode(s.vizMode);if(s.bgMode)setBgMode(s.bgMode);if(s.scanlinesOn!==undefined)setScanlines(s.scanlinesOn);if(s.glowLevel!==undefined)setGlow(s.glowLevel);}catch(e){}}

// GLOBAL CHAMELEON
function extractMetadata(fileOrBlob){if(!window.jsmediatags)return;window.jsmediatags.read(fileOrBlob,{onSuccess(tag){const t=tag.tags;if(t.title){ const name = t.title.toUpperCase()+(t.artist?' — '+t.artist.toUpperCase():''); setBroadcastTrackName(name); }if(t.picture){const d=t.picture.data;let b='';for(let i=0;i<d.length;i++)b+=String.fromCharCode(d[i]);const u=`data:${t.picture.format};base64,${btoa(b)}`;getPredominantColor(u,rgb=>applyChameleonMode(rgb.r,rgb.g,rgb.b,u));}else{resetChameleon();}},onError(){resetChameleon();}});}
function getPredominantColor(src,cb){const img=new Image();img.crossOrigin='Anonymous';img.onload=()=>{const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const cx=c.getContext('2d');cx.drawImage(img,0,0);const p=cx.getImageData(img.width/2,img.height/2,1,1).data;cb({r:p[0],g:p[1],b:p[2]});};img.onerror=()=>cb({r:0,g:255,b:65});img.src=src;}
function applyChameleonMode(r,g,b,imgUrl){r=Math.min(255,r+40);g=Math.min(255,g+40);b=Math.min(255,b+40);if(imgUrl)DOM.ambientGlow.style.background=`url('${imgUrl}') center/cover no-repeat`;else DOM.ambientGlow.style.background=`radial-gradient(circle,rgba(${r},${g},${b},.4) 0%,transparent 60%)`;}
function resetChameleon(){if(DOM.ambientGlow) DOM.ambientGlow.style.background='';}

window.addEventListener('resize',()=>resizeCanvases());

// SPLASH SCREEN
function runSplash() {
    const fill = document.getElementById('splash-fill'), status = document.getElementById('splash-status');
    const steps = [
        { pct:20, text:'LOADING AUDIO ENGINE...', delay:300 },
        { pct:45, text:'STARTING P2P BROADCASTER...', delay:700 },
        { pct:70, text:'CONNECTING TO MAINFRAME...', delay:1200 },
        { pct:90, text:'CALIBRATING FREQUENCIES...', delay:1800 },
        { pct:100, text:'ALL SYSTEMS ONLINE ✓', delay:2200 }
    ];
    steps.forEach(s => { setTimeout(()=>{ fill.style.width=s.pct+'%'; status.textContent=s.text; }, s.delay); });
    setTimeout(() => { DOM.splash.classList.add('done'); DOM.player.style.opacity = '1'; setTimeout(() => DOM.splash.remove(), 700); }, 2800);
}
