# One-shot patch, 2026-09-16: landing says nothing beyond host + labels; opt-in camera tracking; live agents panel.
# Idempotent: refuses to run twice (RAIL_ORIGIN marker). Kept in tools/ as the record of the change.
import io, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
p = os.path.join(HERE, '..', 'src', 'landing.ts')
s = io.open(p, encoding='utf-8').read()
if 'RAIL_ORIGIN' in s:
    print('already patched'); sys.exit(0)

def rep(old, new, label):
    global s
    assert s.count(old) == 1, 'anchor: ' + label
    s = s.replace(old, new, 1)

rep('''  const isTroptions = origin.includes("troptionsmint");
  const brandTitle = isTroptions ? "TroptionsMint — Autonomous Asset Mint & Agent Settlement" : "Genesis402 — Autonomous Agent Runtime & Settlement";
  const brandHud = isTroptions ? "TROPTIONSMINT // AUTONOMOUS ASSET ENGINE" : "GENESIS402 // MACHINE RUNTIME";
  const brandSub = isTroptions ? "DUAL-CHAIN NAMESPACE ANCHORS · X402 RAILS" : "CRYPTOGRAPHIC WITNESS GATEWAY · X402 PROTOCOL";
''', '''  // The surface says nothing about a brand: it names its host and serves its labels. (Operator direction 2026-09-16.)
  let host = "gateway";
  try { host = new URL(origin).hostname.toLowerCase(); } catch { /* keep default */ }
  const brandTitle = `${host} — x402 truth gateway`;
  const brandHud = `${host} // machine runtime`;
  const brandSub = "X402 TRUTH GATEWAY · APPEND-ONLY WITNESS LEDGER";
  const adapterNames = Object.values(adapters).map((a) => a.name);
''', 'brand')

rep('''<meta name="description" content="Autonomous AI Agent settlement and cryptographic truth witness gateway. Base USDC micro-settlement over x402 protocol. Append-only, tamper-evident verifiable ledger powered by Cloudflare Anycast edge.">
<meta name="keywords" content="x402, AI agent payments, Base USDC, Coinbase CDP, truth gateway, cryptographic attestation, troptionsmint, autonomous agent settlement, verifiable machine ledger, Wyoming LLC">''',
'''<meta name="description" content="Machine endpoints for x402-paid witness attestations, operated by UnyKorn LLC. Append-only signed ledger. Mode, status and anchoring labels are served live and never hard-coded.">
<meta name="keywords" content="x402, agent payments, Base USDC, truth gateway, witness attestation, append-only ledger">''', 'meta')
rep('''<meta property="og:description" content="Autonomous AI Agent settlement and cryptographic truth witness gateway. Base USDC micro-settlement over x402.">''',
    '''<meta property="og:description" content="Machine endpoints for x402-paid witness attestations. Append-only signed ledger. Labels served live.">''', 'og')
rep('''<meta name="twitter:description" content="Autonomous AI Agent settlement and cryptographic truth witness gateway. Base USDC micro-settlement over x402.">''',
    '''<meta name="twitter:description" content="Machine endpoints for x402-paid witness attestations. Append-only signed ledger. Labels served live.">''', 'tw')
rep('''      "description": "Autonomous AI Agent settlement and cryptographic truth witness gateway over x402 on Base USDC.",''',
    '''      "description": "Machine endpoints for x402-paid witness attestations. Append-only signed ledger.",''', 'ld')
rep('''        "description": "Cryptographic witness attestation settled via Base USDC x402"''',
    '''        "description": "One witness attestation, paid per call over x402 (mode label served live)"''', 'ld2')
rep('''      "name": "Genesis402 x402 Witness API",''', '''      "name": "${esc(host)} x402 witness API",''', 'ld3')
rep('''  <div class="hud-meta">OPERATED BY UNYKORN LLC (WYOMING)</div>
  <div class="hud-sub">APPEND-ONLY CRYPTOGRAPHIC WITNESS · ZERO INTERMEDIARIES</div>''',
    '''  <div class="hud-meta">OPERATED BY UNYKORN LLC (WYOMING)</div>
  <div class="hud-sub">APPEND-ONLY WITNESS LEDGER · ED25519 SIGNED</div>''', 'bl')
rep('''      <p>Autonomous AI agents interact directly with machine endpoints. No human website is required. It records what happened, who paid, and when in an append-only verifiable ledger.</p>''',
    '''      <p>Machine endpoints only. Agents pay per call over x402. The ledger records what happened, who paid, and when, and anyone can verify an entry without trusting the operator. The labels below are served live from the gateway, never typed into this page.</p>''', 'intro')

rep('''<div class="hud hud-br">
  <button id="openDrawer" class="hud-link">[ INSPECT MACHINE RUNTIME ]</button>
</div>''',
'''<div class="hud hud-ml" id="agents" data-rail="${esc(RAIL_ORIGIN)}" data-adapters="${esc(adapterNames.join(","))}">
  <div class="hud-meta">AGENTS &amp; SYSTEMS (live, from each source)</div>
  <div class="hud-sub">this gateway · ${adapterNames.length} adapter(s): ${esc(adapterNames.join(", ") || "none")}</div>
  <div class="hud-sub" id="agRail">task rail · reading ${esc(RAIL_ORIGIN.replace(/^https?:\\/\\//, ""))}/health …</div>
  <div class="hud-sub" id="agProve">proof receipts · reading …</div>
  <div class="hud-sub" id="agSelf">this gateway · mode ${esc(labels.mode)} · status ${esc(labels.status)} · anchoring ${esc(labels.anchoring)}</div>
</div>

<div class="hud hud-br">
  <div id="trackState" class="hud-sub" style="margin-bottom:6px">TRACK: POINTER</div>
  <button id="camBtn" class="hud-link" title="Uses your camera on this device only. Frames are never uploaded.">[ TRACK WITH CAMERA ]</button>
  <button id="openDrawer" class="hud-link">[ INSPECT MACHINE RUNTIME ]</button>
  <video id="cam" playsinline muted autoplay style="position:absolute;width:1px;height:1px;opacity:0;pointer-events:none"></video>
</div>''', 'hud')
rep('''.hud-br{bottom:20px;right:24px;text-align:right}''',
    '''.hud-br{bottom:20px;right:24px;text-align:right}
.hud-ml{top:50%;left:24px;transform:translateY(-50%);max-width:46vw}''', 'css')
rep('''@media(max-width:640px){.hud-tl,.hud-tr,.hud-bl,.hud-br{font-size:0.68rem;padding:10px}.hud-tr,.hud-bl{display:none}}''',
    '''@media(max-width:640px){.hud-tl,.hud-tr,.hud-bl,.hud-br{font-size:0.68rem;padding:10px}.hud-tr,.hud-bl,.hud-ml{display:none}}''', 'css2')
rep('''const PERIMETER =''', '''const RAIL_ORIGIN = "https://twin.unykorn.org";

const PERIMETER =''', 'rail')

rep('''  window.addEventListener('pointermove', function(e){
    onPointerMove(e.clientX, e.clientY);
  });''', r'''  // Camera tracking is opt-in. Everything runs on the viewer's device; no frame leaves the page.
  let camOn = false;
  window.addEventListener('pointermove', function(e){
    if(!camOn) onPointerMove(e.clientX, e.clientY);
  });
  const trackState = document.getElementById('trackState');
  const camBtn = document.getElementById('camBtn');
  const video = document.getElementById('cam');
  let camStream = null, camRaf = 0, camMode = '';
  function setTrack(t){ if(trackState) trackState.textContent = 'TRACK: ' + t; }
  // normalised face position (nx, ny in 0..1, mirrored so the head follows the viewer) -> the same yaw/pitch as the pointer path
  function onFace(nx, ny){
    const x = (1 - nx) * window.innerWidth;
    const y = ny * window.innerHeight;
    onPointerMove(x, y);
  }
  async function startFaceLandmarker(){
    const mod = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs');
    const fileset = await mod.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm');
    const lm = await mod.FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task' },
      runningMode: 'VIDEO', numFaces: 1
    });
    camMode = 'CAMERA (face)'; setTrack(camMode);
    let last = -1;
    function loop(){
      if(!camOn) return;
      const t = performance.now();
      if(video.readyState >= 2 && t !== last){
        last = t;
        const r = lm.detectForVideo(video, t);
        const f = r && r.faceLandmarks && r.faceLandmarks[0];
        if(f && f[1]) onFace(f[1].x, f[1].y);
      }
      camRaf = requestAnimationFrame(loop);
    }
    loop();
  }
  function startMotionCentroid(){
    // Fallback with no model download: frame difference on a 64x48 sample, weighted centroid of change.
    camMode = 'CAMERA (motion)'; setTrack(camMode);
    const sw = 64, sh = 48;
    const sc = document.createElement('canvas'); sc.width = sw; sc.height = sh;
    const sctx = sc.getContext('2d', { willReadFrequently: true });
    let prev = null, ex = 0.5, ey = 0.5;
    function loop(){
      if(!camOn) return;
      if(video.readyState >= 2){
        sctx.drawImage(video, 0, 0, sw, sh);
        const d = sctx.getImageData(0, 0, sw, sh).data;
        if(prev){
          let sx = 0, sy = 0, sum = 0;
          for(let i = 0, px = 0; i < d.length; i += 4, px++){
            const diff = Math.abs(d[i] - prev[i]) + Math.abs(d[i+1] - prev[i+1]) + Math.abs(d[i+2] - prev[i+2]);
            if(diff > 60){ sx += (px % sw) * diff; sy += Math.floor(px / sw) * diff; sum += diff; }
          }
          if(sum > 2000){ ex += ((sx / sum) / sw - ex) * 0.25; ey += ((sy / sum) / sh - ey) * 0.25; onFace(ex, ey); }
        }
        prev = new Uint8ClampedArray(d);
      }
      camRaf = requestAnimationFrame(loop);
    }
    loop();
  }
  async function startCam(){
    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){ setTrack('POINTER (no camera API)'); return; }
    try {
      camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } }, audio: false });
    } catch(e){ setTrack('POINTER (camera denied)'); return; }
    video.srcObject = camStream; camOn = true;
    if(camBtn) camBtn.textContent = '[ STOP CAMERA ]';
    setTrack('CAMERA (loading tracker)');
    try { await startFaceLandmarker(); } catch(e){ startMotionCentroid(); }
  }
  function stopCam(){
    camOn = false; if(camRaf) cancelAnimationFrame(camRaf);
    if(camStream){ camStream.getTracks().forEach(function(t){ t.stop(); }); camStream = null; }
    video.srcObject = null; camMode = '';
    if(camBtn) camBtn.textContent = '[ TRACK WITH CAMERA ]';
    setTrack('POINTER');
  }
  if(camBtn) camBtn.addEventListener('click', function(){ if(camOn) stopCam(); else startCam(); });
  window.addEventListener('pagehide', stopCam);

  // Agents & systems panel: every line comes from the source it names; failures are shown, never hidden.
  (function agentsPanel(){
    const box = document.getElementById('agents'); if(!box) return;
    const rail = box.getAttribute('data-rail') || '';
    const elRail = document.getElementById('agRail'), elProve = document.getElementById('agProve');
    const host = rail.replace(/^https?:\/\//, '');
    function txt(el, t){ if(el) el.textContent = t; }
    fetch(rail + '/health', { headers: { accept: 'application/json' } }).then(function(r){ return r.json(); }).then(function(h){
      const lanes = (h.payable_lanes || []).join(', ') || 'none';
      const led = (h.replay_protection && h.replay_protection.ledger) || {};
      const st = h.settlement || {};
      txt(elRail, 'task rail ' + host + ' · ' + (h.tasks || []).join(', ') + ' · payable: ' + lanes + ' · paid calls: ' + (led.receipts != null ? led.receipts : '?') + ' · settlement: cdp ' + (st.cdp || '?') + ', self ' + (st.self_settle || '?'));
    }).catch(function(){ txt(elRail, 'task rail ' + host + ' · unreachable'); });
    fetch(rail + '/prove/stats', { headers: { accept: 'application/json' } }).then(function(r){ return r.json(); }).then(function(p){
      txt(elProve, 'proof receipts (' + host + '/prove) · sold: ' + (p.receipts != null ? p.receipts : '?') + ' · anchor: ' + (p.anchor || '?') + ' · key ' + String(p.keyId || '').slice(0, 24));
    }).catch(function(){ txt(elProve, 'proof receipts · unreachable'); });
  })();''', 'script')

rep('''    name: "Genesis402 truth gateway",''',
    '''    name: `${(() => { try { return new URL(origin).hostname.toLowerCase(); } catch { return "gateway"; } })()} truth gateway`,''', 'card')

io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('landing.ts patched')
