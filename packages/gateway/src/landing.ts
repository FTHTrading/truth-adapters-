/**
 * The genesis402.com & troptionsmint.com landing page, served by the gateway at `/` for browsers.
 * Copy is drawn from ADR-0002 approved phrases only and is scanned by the
 * claims gate on every test run and on every verify-served pass.
 */
import type { AdapterSpec } from "../../adapters/src/types.ts";
import { formatAtomic, LIMITATIONS, type GatewayConfig, type Labels } from "./config.ts";

const RAIL_ORIGIN = "https://twin.unykorn.org";

const PERIMETER =
  "UnyKorn LLC is a technology and administration service provider. It is not a bank, broker-dealer, exchange, custodian, trustee, transfer agent, appraiser, auditor, investment adviser, money transmitter, or issuer.";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function landingHtml(origin: string, cfg: GatewayConfig, labels: Labels, adapters: Readonly<Record<string, AdapterSpec>>, publicKeyHex: string, head: { seq: number; hash: string } | null): string {
  const decimals = cfg.x402?.network.decimals ?? 6;
  // The surface says nothing about a brand: it names its host and serves its labels. (Operator direction 2026-09-16.)
  let host = "gateway";
  try { host = new URL(origin).hostname.toLowerCase(); } catch { /* keep default */ }
  const brandTitle = `${host} — x402 truth gateway`;
  const brandHud = `${host} // machine runtime`;
  const brandSub = "X402 TRUTH GATEWAY · APPEND-ONLY WITNESS LEDGER";
  const adapterNames = Object.values(adapters).map((a) => a.name);

  const rows = Object.values(adapters)
    .map(
      (a) => `<tr><td><code>${esc(a.name)}</code></td><td>${esc(a.observation)}</td><td>${esc(a.description)}</td><td class="num">${esc(formatAtomic(a.price.atomic, decimals))}</td></tr>`,
    )
    .join("\n");
  const rail = cfg.x402 ? `${esc(cfg.x402.network.network)} · USDC · pay-to ${esc(cfg.x402.payTo)}` : "no rail configured";
  const modeLine =
    labels.mode === "live"
      ? "Settlement live on Base mainnet."
      : "Settlement active on Base Sepolia testnet.";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>${esc(brandTitle)}</title>
<meta name="description" content="Machine endpoints for x402-paid witness attestations, operated by UnyKorn LLC. Append-only signed ledger. Mode, status and anchoring labels are served live and never hard-coded.">
<meta name="keywords" content="x402, agent payments, Base USDC, truth gateway, witness attestation, append-only ledger">
<meta name="author" content="UnyKorn LLC">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
<meta name="theme-color" content="#030504">

<!-- Geo Meta Tags -->
<meta name="geo.region" content="US-WY">
<meta name="geo.placename" content="Cheyenne">
<meta name="geo.position" content="41.1400;-104.8202">
<meta name="ICBM" content="41.1400, -104.8202">

<!-- Open Graph & Social Cards -->
<meta property="og:title" content="${esc(brandTitle)}">
<meta property="og:description" content="Machine endpoints for x402-paid witness attestations. Append-only signed ledger. Labels served live.">
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(origin)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(brandTitle)}">
<meta name="twitter:description" content="Machine endpoints for x402-paid witness attestations. Append-only signed ledger. Labels served live.">

<!-- AI Agent & Machine Discovery -->
<link rel="payment" href="${esc(origin)}/.well-known/x402" title="x402 Payment Spec">
<link rel="service" href="${esc(origin)}/.well-known/agent.json" title="AI Agent Manifest">
<link rel="alternate" type="application/json" href="${esc(origin)}/.well-known/truth.json" title="Truth Manifest">
<link rel="api" type="application/json" href="${esc(origin)}/openapi.json" title="OpenAPI 3.1">
<link rel="sitemap" type="application/xml" href="${esc(origin)}/sitemap.xml">

<!-- Structured Data (JSON-LD) -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": "${esc(origin)}/#website",
      "url": "${esc(origin)}",
      "name": "${esc(brandTitle)}",
      "description": "Machine endpoints for x402-paid witness attestations. Append-only signed ledger.",
      "inLanguage": "en-US",
      "publisher": {
        "@type": "Organization",
        "name": "UnyKorn LLC",
        "url": "https://unykorn.org",
        "address": {
          "@type": "PostalAddress",
          "addressLocality": "Cheyenne",
          "addressRegion": "WY",
          "addressCountry": "US"
        }
      }
    },
    {
      "@type": "SoftwareApplication",
      "@id": "${esc(origin)}/#software",
      "name": "${esc(brandTitle)}",
      "applicationCategory": "BusinessApplication",
      "operatingSystem": "Cloudflare Workers Edge",
      "offers": {
        "@type": "Offer",
        "price": "0.25",
        "priceCurrency": "USD",
        "description": "One witness attestation, paid per call over x402 (mode label served live)"
      }
    },
    {
      "@type": "WebAPI",
      "@id": "${esc(origin)}/#api",
      "name": "${esc(host)} x402 witness API",
      "documentation": "${esc(origin)}/openapi.json"
    }
  ]
}
</script>

<style>
:root{--bg:#030504;--fg:#e6f3ee;--acc:#10b981;--cyan:#00f3ff;--mut:#5c7066;--line:#16241e;--panel:rgba(5,11,9,0.85)}
*{box-sizing:border-box;margin:0;padding:0;-webkit-user-select:none;user-select:none}
html,body{width:100%;height:100%;overflow:hidden;background:var(--bg);color:var(--fg);font:13px/1.4 Consolas,"SFMono-Regular",Menlo,monospace;letter-spacing:0.04em}
#stage{position:absolute;inset:0;width:100%;height:100%;display:block;cursor:crosshair;z-index:1}
.hud{position:absolute;z-index:10;pointer-events:none}
.hud-tl{top:20px;left:24px}
.hud-tr{top:20px;right:24px;text-align:right}
.hud-bl{bottom:20px;left:24px}
.hud-br{bottom:20px;right:24px;text-align:right}
.hud-ml{top:50%;left:24px;transform:translateY(-50%);max-width:24vw;opacity:0.85}
.brand-title{font-size:0.88rem;font-weight:700;color:var(--cyan);text-shadow:0 0 12px rgba(0,243,255,0.4);display:flex;align-items:center;gap:8px}
.dot{width:7px;height:7px;border-radius:50%;background:var(--acc);box-shadow:0 0 8px var(--acc);animation:pulse 2s infinite}
.hud-sub{font-size:0.72rem;color:var(--mut);margin-top:4px}
.hud-meta{font-size:0.75rem;color:var(--fg);margin-top:2px}
.hud-link{pointer-events:auto;background:rgba(0,0,0,0.6);border:1px solid var(--line);color:var(--cyan);padding:6px 12px;border-radius:4px;font-size:0.72rem;text-decoration:none;display:inline-block;transition:all 0.2s;cursor:pointer}
.hud-link:hover{background:rgba(0,243,255,0.15);border-color:var(--cyan);color:#fff}
.drawer{position:fixed;inset:0;background:rgba(3,5,4,0.92);backdrop-filter:blur(10px);z-index:100;display:none;align-items:center;justify-content:center;padding:20px;pointer-events:auto}
.drawer.open{display:flex}
.drawer-card{width:100%;max-width:740px;max-height:85vh;overflow-y:auto;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:24px;box-shadow:0 20px 50px rgba(0,0,0,0.8)}
.drawer-header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--line);padding-bottom:12px;margin-bottom:16px}
.drawer-title{color:var(--cyan);font-size:1rem;font-weight:700}
.close-btn{background:transparent;border:1px solid var(--line);color:var(--mut);padding:4px 10px;border-radius:4px;cursor:pointer;font-family:inherit}
.close-btn:hover{color:#fff;border-color:var(--cyan)}
.drawer-body h3{font-size:0.85rem;color:var(--acc);margin:16px 0 8px;text-transform:uppercase}
.drawer-body p, .drawer-body li{font-size:0.78rem;color:#b2c5bc;line-height:1.6;margin:4px 0}
.drawer-body code{background:rgba(255,255,255,0.06);padding:2px 6px;border-radius:3px;color:var(--cyan)}
.drawer-body pre{background:rgba(0,0,0,0.6);border:1px solid var(--line);padding:10px;border-radius:6px;font-size:0.75rem;overflow-x:auto;margin:8px 0;color:var(--fg)}
.drawer-body a{color:var(--cyan);text-decoration:none}
.drawer-body a:hover{text-decoration:underline}
table{border-collapse:collapse;width:100%;font-size:0.75rem;margin:8px 0}
th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line)}
th{color:var(--mut);text-transform:uppercase}
.num{text-align:right}
.dock{position:absolute;z-index:12;left:50%;transform:translateX(-50%);bottom:96px;display:flex;gap:6px;width:min(720px,92vw);pointer-events:auto}
.dock input{flex:1;min-width:0;background:rgba(0,0,0,0.6);border:1px solid var(--line);color:var(--fg);padding:8px 10px;border-radius:4px;font:inherit;font-size:0.8rem;outline:none;-webkit-user-select:text;user-select:text}
.dock input:focus{border-color:var(--cyan)}
.dock input::placeholder{color:var(--mut)}
.dock .hud-link{white-space:nowrap}
.dock .hud-link:disabled{opacity:0.45;cursor:default}
.camview{position:absolute;right:0;bottom:calc(100% + 8px);width:148px;height:111px;border:1px solid var(--line);border-radius:4px;overflow:hidden;background:#000;opacity:0;visibility:hidden;transition:opacity 0.3s}
.camview.on{opacity:0.9;visibility:visible}
.camview video{width:100%;height:100%;object-fit:cover;transform:scaleX(-1);display:block}
.camdot{position:absolute;width:8px;height:8px;margin:-4px 0 0 -4px;border-radius:50%;background:var(--cyan);box-shadow:0 0 8px var(--cyan);display:none}
.camtag{position:absolute;left:4px;bottom:3px;font-size:0.55rem;color:var(--mut);letter-spacing:0.08em}
.chips{position:absolute;z-index:12;left:50%;transform:translateX(-50%);bottom:34px;display:flex;gap:6px;flex-wrap:wrap;justify-content:center;width:min(600px,92vw);pointer-events:auto}
.chip{background:transparent;border:1px solid var(--line);color:var(--mut);padding:3px 9px;border-radius:12px;font:inherit;font-size:0.66rem;cursor:pointer}
.chip:hover{color:#fff;border-color:var(--cyan)}
.caption{position:absolute;z-index:11;left:50%;transform:translateX(-50%);bottom:146px;width:min(760px,92vw);text-align:center;font-size:0.92rem;line-height:1.5;color:#fff;text-shadow:0 0 12px rgba(0,243,255,0.5),0 1px 2px #000;pointer-events:none}
.caption .you{display:block;font-size:0.72rem;color:var(--mut);margin-bottom:4px;text-shadow:none}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.25}}
@media(max-width:640px){.chips{display:none}.camview{width:96px;height:72px}.dock{bottom:96px}.caption{bottom:144px;font-size:0.82rem}#voiceBtn{display:none}.hud-tl,.hud-tr,.hud-bl,.hud-br{font-size:0.68rem;padding:10px}.hud-tr,.hud-bl,.hud-ml{display:none}}
</style>
</head>
<body>

<canvas id="stage"></canvas>

<div class="hud hud-tl">
  <div class="brand-title"><span class="dot"></span>${esc(brandHud)}</div>
  <div class="hud-sub">${esc(brandSub)}</div>
  <div class="hud-meta">STATUS: ONLINE · EDGE: GLOBAL ANYCAST</div>
</div>

<div class="hud hud-tr">
  <div class="hud-meta">RAIL: ${esc(rail)}</div>
  <div class="hud-sub">${esc(modeLine)}</div>
  <div id="vectorTelemetry" class="hud-sub">VECTOR [ YAW: +0.000 · PITCH: +0.000 ]</div>
</div>

<div class="hud hud-bl">
  <div class="hud-meta">OPERATED BY UNYKORN LLC (WYOMING)</div>
  <div class="hud-sub">APPEND-ONLY WITNESS LEDGER · ED25519 SIGNED</div>
  <div class="hud-sub"><span>mode: ${esc(labels.mode)}</span> · <span>anchoring: ${esc(labels.anchoring)}</span></div>
</div>

<div class="hud hud-ml" id="agents" data-rail="${esc(RAIL_ORIGIN)}" data-adapters="${esc(adapterNames.join(","))}">
  <div class="hud-meta">AGENTS &amp; SYSTEMS (live, from each source)</div>
  <div class="hud-sub">this gateway · ${adapterNames.length} adapter(s): ${esc(adapterNames.join(", ") || "none")}</div>
  <div class="hud-sub" id="agRail">task rail · reading ${esc(RAIL_ORIGIN.replace(/^https?:\/\//, ""))}/health …</div>
  <div class="hud-sub" id="agProve">proof receipts · reading …</div>
  <div class="hud-sub" id="agSku">launch sku · reading …</div>
  <div class="hud-sub" id="agSelf">this gateway · mode ${esc(labels.mode)} · status ${esc(labels.status)} · anchoring ${esc(labels.anchoring)}</div>
</div>

<div class="hud hud-br">
  <div id="avState" class="hud-sub">AVATAR: IDLE</div>
  <div id="trackState" class="hud-sub" style="margin-bottom:6px">TRACK: POINTER</div>
  <button id="camBtn" class="hud-link" title="Uses your camera on this device only. Frames are never uploaded.">[ TRACK WITH CAMERA ]</button>
  <button id="openDrawer" class="hud-link">[ INSPECT MACHINE RUNTIME ]</button>
  <div id="camView" class="camview" title="Your camera, shown only to you. Frames are never uploaded."><video id="cam" playsinline muted autoplay></video><span id="camDot" class="camdot"></span><span class="camtag">LOCAL ONLY</span></div>
</div>

<div id="caption" class="caption" aria-live="polite"></div>
<form id="chatDock" class="dock" autocomplete="off">
  <button type="button" id="talkBtn" class="hud-link" title="Speech recognition is done by your browser. Some browsers send the audio to their own speech service to do it; this site never receives audio.">[ TALK ]</button>
  <input id="chatIn" type="text" maxlength="400" placeholder="ask the gateway: what is this, what does it cost, what are we building" aria-label="Ask the gateway">
  <button type="submit" class="hud-link">[ SEND ]</button>
  <button type="button" id="voiceBtn" class="hud-link">[ VOICE ON ]</button>
</form>
<div id="chips" class="chips">
  <button type="button" class="chip">What is x402?</button>
  <button type="button" class="chip">What can an agent buy from you?</button>
  <button type="button" class="chip">What does it cost?</button>
  <button type="button" class="chip">What is UnyKorn building?</button>
  <button type="button" class="chip">How do I verify an entry?</button>
</div>

<div id="drawer" class="drawer">
  <div class="drawer-card">
    <div class="drawer-header">
      <div class="drawer-title">${esc(brandHud)} // RUNTIME SPECIFICATION</div>
      <button id="closeDrawer" class="close-btn">[ ESC / CLOSE ]</button>
    </div>
    <div class="drawer-body">
      <p>Machine endpoints only. Agents pay per call over x402. The ledger records what happened, who paid, and when, and anyone can verify an entry without trusting the operator. The labels below are served live from the gateway, never typed into this page.</p>
      
      <div style="display:flex;gap:8px;margin:8px 0">
        <code>mode: ${esc(labels.mode)}</code>
        <code>status: ${esc(labels.status)}</code>
        <code>anchoring: ${esc(labels.anchoring)}</code>
        <code>review: ${esc(labels.review)}</code>
      </div>
      
      <h3>Machine Endpoints</h3>
      <ul>
        <li>x402 Discovery: <a href="${esc(origin)}/.well-known/x402">${esc(origin)}/.well-known/x402</a></li>
        <li>Agent Card: <a href="${esc(origin)}/.well-known/agent.json">${esc(origin)}/.well-known/agent.json</a></li>
        <li>Truth Manifest: <a href="${esc(origin)}/.well-known/truth.json">${esc(origin)}/.well-known/truth.json</a></li>
        <li>OpenAPI Spec: <a href="${esc(origin)}/openapi.json">${esc(origin)}/openapi.json</a></li>
        <li>Pricing Matrix: <a href="${esc(origin)}/pricing.json">${esc(origin)}/pricing.json</a></li>
        <li>Runtime Status: <a href="${esc(origin)}/status.json">${esc(origin)}/status.json</a></li>
        <li>Robots Rulebook: <a href="${esc(origin)}/robots.txt">${esc(origin)}/robots.txt</a></li>
        <li>Sitemap: <a href="${esc(origin)}/sitemap.xml">${esc(origin)}/sitemap.xml</a></li>
      </ul>

      <h3>Cryptographic Identity</h3>
      <p>Witness Public Key (Ed25519): <code>${esc(publicKeyHex)}</code></p>
      <p>Ledger Head: ${head ? `seq ${head.seq}, <code>${esc(head.hash)}</code>` : "empty"}</p>

      <h3>Settlement &amp; Adapters</h3>
      <div style="overflow-x:auto">
        <table>
          <thead><tr><th>Adapter</th><th>Observation</th><th>Description</th><th class="num">Price (USDC)</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>

      <h3>Agent Execution Pattern</h3>
      <pre>GET  ${esc(origin)}/.well-known/x402        # Discover network, pay-to &amp; assets
POST ${esc(origin)}/witness/document                # &rarr; 402 Payment Required with x402 challenge
POST ${esc(origin)}/witness/document  X-PAYMENT: &hellip;  # &rarr; 200 Signed Attestation &amp; Ledger Entry
GET  ${esc(origin)}/verify/&lt;entry_hash&gt;             # &rarr; Inclusion proof &amp; signature check</pre>

      <h3>Talking To The Gateway</h3>
      <p>The head answers from a fact sheet assembled live from this gateway and the task rail: labels, adapters, prices, ledger head, rail health. The sheet is public at <a href="${esc(origin)}/avatar/context">${esc(origin)}/avatar/context</a>, and every answer passes the same phrase gate as this page. It is a language model, so it can still be wrong; the endpoints above are the record.</p>
      <p>Camera tracking runs in your browser only and frames are never uploaded. The words you type or speak are sent to <code>POST /avatar/chat</code> to get an answer and are not written to the ledger. Speech recognition and the voice are your browser's own.</p>

      <h3>Statutory Perimeter &amp; Limitations</h3>
      <p>${esc(LIMITATIONS)}</p>
      <p>${esc(PERIMETER)}</p>
    </div>
  </div>
</div>

<script>
(function(){
  // NOTE FOR EDITORS: this script lives inside a TypeScript template literal. Do not use backslashes,
  // backticks or dollar-brace in it; a regex with escaped slashes once broke the whole page. A test compiles it.
  const canvas = document.getElementById('stage');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  const vectorTelemetry = document.getElementById('vectorTelemetry');
  let w = 0, h = 0;

  function resize(){
    const dpr = window.devicePixelRatio || 1;
    w = canvas.width = window.innerWidth * dpr;
    h = canvas.height = window.innerHeight * dpr;
  }
  window.addEventListener('resize', resize);
  resize();

  let mouseX = 0, mouseY = 0;
  let targetRotX = 0, targetRotY = 0, targetRotZ = 0, targetLean = 1;
  let rotX = 0, rotY = 0, rotZ = 0, lean = 1;
  let pulseRadius = 0;
  let pulseMax = 0;

  // ---- avatar state: everything the face does is driven from these ---------------------------------------
  let mode = 'idle';                 // idle | listening | thinking | speaking
  let mouthOpen = 0, mouthOpenT = 0; // 0 closed .. 1 wide open
  let mouthWide = 0, mouthWideT = 0; // -1 rounded (o, u, w) .. 1 spread (e, i)
  let smile = 0, smileT = 0;
  let brow = 0, browT = 0;
  let blink = 0, blinkUntil = 0, nextBlink = 1500;
  let visemes = [];                  // [{ t, open, wide }] absolute ms on performance.now()
  let speakingSince = 0;

  function onPointerMove(x, y){
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const dx = (x - cx) / cx;
    const dy = (y - cy) / cy;
    targetRotY = Math.max(-0.75, Math.min(0.75, dx * 0.85));
    targetRotX = Math.max(-0.55, Math.min(0.55, -dy * 0.65));
    mouseX = dx;
    mouseY = dy;
    if(vectorTelemetry){
      const signY = targetRotY >= 0 ? '+' : '';
      const signX = targetRotX >= 0 ? '+' : '';
      vectorTelemetry.textContent = 'VECTOR [ YAW: ' + signY + targetRotY.toFixed(3) + ' · PITCH: ' + signX + targetRotX.toFixed(3) + ' ]';
    }
  }

  // Camera tracking is opt-in. Everything runs on the viewer's device; no frame leaves the page.
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
  // A person at a laptop only moves a few percent of the frame, so camera input is amplified; the pointer path is not.
  function setLook(yaw, pitch){
    targetRotY = Math.max(-0.8, Math.min(0.8, yaw));
    targetRotX = Math.max(-0.55, Math.min(0.55, pitch));
    mouseX = Math.max(-1, Math.min(1, targetRotY / 0.8));
    mouseY = Math.max(-1, Math.min(1, -targetRotX / 0.55));
    if(vectorTelemetry) vectorTelemetry.textContent = 'VECTOR [ YAW: ' + (targetRotY >= 0 ? '+' : '') + targetRotY.toFixed(3) + ' · PITCH: ' + (targetRotX >= 0 ? '+' : '') + targetRotX.toFixed(3) + ' ]';
  }
  // However the visitor happens to sit is "straight ahead": a slow baseline is subtracted, so the head faces them
  // at rest and moves when they move, wherever the camera is mounted.
  let baseYaw = null, basePitch = null;
  function onFace(nx, ny, turn, nod){
    const dx = ((1 - nx) - 0.5) * 2, dy = (ny - 0.5) * 2;
    const rawYaw = dx * 1.9 - (turn || 0) * 0.9, rawPitch = -dy * 1.5 - (nod || 0) * 0.9;
    if(baseYaw === null){ baseYaw = rawYaw; basePitch = rawPitch; }
    baseYaw += (rawYaw - baseYaw) * 0.004; basePitch += (rawPitch - basePitch) * 0.004;
    setLook(rawYaw - baseYaw, rawPitch - basePitch);
  }

  // What the camera tells the avatar. Computed in this browser only; none of it is sent anywhere.
  let faceSeenAt = 0, faceLostAt = 0, facePresent = false, lastGreetAt = 0, smileSince = 0, lastSmileLineAt = 0;
  function blend(cats, name){
    for(let i = 0; i < cats.length; i++){ if(cats[i].categoryName === name) return cats[i].score; }
    return 0;
  }
  function onFaceResult(r){
    const now = performance.now();
    const f = r && r.faceLandmarks && r.faceLandmarks[0];
    if(!f || !f[1]){
      const dot0 = document.getElementById('camDot'); if(dot0) dot0.style.display = 'none';
      if(facePresent && now - faceSeenAt > 2500){ facePresent = false; faceLostAt = now; targetRotZ = 0; targetLean = 1; smileT = 0; setTrack(camMode + ' · no face'); }
      return;
    }
    faceSeenAt = now;
    // Where the face is in frame, plus which way the visitor's own head is turned (nose against the eye line), mirrored.
    let turn = 0, nod = 0;
    if(f[33] && f[263]){
      const mx = (f[33].x + f[263].x) / 2, my = (f[33].y + f[263].y) / 2;
      const ed = Math.hypot(f[263].x - f[33].x, f[263].y - f[33].y) || 1;
      turn = Math.max(-0.6, Math.min(0.6, (f[1].x - mx) / ed));
      nod = Math.max(-0.5, Math.min(0.5, (f[1].y - my) / ed - 0.42));
    }
    onFace(f[1].x, f[1].y, turn, nod);
    const dot = document.getElementById('camDot');
    if(dot){ dot.style.left = ((1 - f[1].x) * 100) + '%'; dot.style.top = (f[1].y * 100) + '%'; dot.style.display = 'block'; }
    // Head roll from the outer eye corners, mirrored; distance from how wide the face is in frame.
    if(f[33] && f[263]){
      const ang = Math.atan2(f[263].y - f[33].y, f[263].x - f[33].x);
      targetRotZ = Math.max(-0.45, Math.min(0.45, -ang));
      const fw = Math.hypot(f[263].x - f[33].x, f[263].y - f[33].y);
      targetLean = Math.max(0.88, Math.min(1.22, 0.9 + (fw - 0.16) * 1.3));
    }
    const bs = r.faceBlendshapes && r.faceBlendshapes[0] && r.faceBlendshapes[0].categories;
    let smiling = false;
    if(bs){
      const s = (blend(bs, 'mouthSmileLeft') + blend(bs, 'mouthSmileRight')) / 2;
      smiling = s > 0.5;
      smileT = Math.max(0, Math.min(1, (s - 0.2) * 1.6));          // the head mirrors a smile
      browT = Math.max(modeBrow, Math.min(1, blend(bs, 'browInnerUp') * 1.4));
    }
    if(!facePresent){
      facePresent = true;
      setTrack(camMode + ' · face locked');
      if(mode === 'idle' && now - lastGreetAt > 60000){
        lastGreetAt = now;
        say(faceLostAt ? 'There you are again.' : 'I can see you now. I am following your face, and the picture stays on your device. Ask me what we are building.');
      }
    }
    if(smiling){ if(!smileSince) smileSince = now; } else smileSince = 0;
    if(smileSince && now - smileSince > 900 && mode === 'idle' && now - lastSmileLineAt > 90000){
      lastSmileLineAt = now;
      say('You are smiling. I will take that as a good sign.');
    }
  }

  async function startFaceLandmarker(){
    const mod = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs');
    const fileset = await mod.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm');
    const lm = await mod.FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task' },
      runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true
    });
    camMode = 'CAMERA (face)'; setTrack(camMode);
    let last = -1;
    function loop(){
      if(!camOn) return;
      const t = performance.now();
      if(video.readyState >= 2 && t !== last){
        last = t;
        let r = null;
        try { r = lm.detectForVideo(video, t); } catch(e){ r = null; }
        onFaceResult(r);
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
    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){ setTrack('POINTER (no camera API)'); caption('', 'This browser will not give a page a camera. Open genesis402.com in Chrome, Edge or Safari and I can follow you.'); return; }
    try {
      camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
    } catch(e){
      const why = e && e.name === 'NotAllowedError' ? 'The camera is blocked for this page. Click the camera or lock icon in the address bar, allow it, and press the button again.' : e && e.name === 'NotFoundError' ? 'I cannot find a camera on this device.' : e && e.name === 'NotReadableError' ? 'Another app is holding the camera. Close it and press the button again.' : 'The camera did not start.';
      setTrack('POINTER (camera: ' + ((e && e.name) || 'failed') + ')'); caption('', why); return;
    }
    video.srcObject = camStream; camOn = true;
    const view = document.getElementById('camView'); if(view) view.classList.add('on');
    if(camBtn) camBtn.textContent = '[ STOP CAMERA ]';
    setTrack('CAMERA (loading tracker)');
    try { await startFaceLandmarker(); } catch(e){ startMotionCentroid(); }
  }
  function stopCam(){
    camOn = false; if(camRaf) cancelAnimationFrame(camRaf);
    if(camStream){ camStream.getTracks().forEach(function(t){ t.stop(); }); camStream = null; }
    const view = document.getElementById('camView'); if(view) view.classList.remove('on');
    video.srcObject = null; camMode = ''; facePresent = false; baseYaw = null; basePitch = null; targetRotZ = 0; targetLean = 1; smileT = 0;
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
    function bare(u){ const s = String(u || ''); const i = s.indexOf('://'); return i < 0 ? s : s.slice(i + 3); }
    const host = bare(rail);
    function txt(el, t){ if(el) el.textContent = t; }
    fetch(rail + '/health', { headers: { accept: 'application/json' } }).then(function(r){ return r.json(); }).then(function(h){
      const lanes = (h.payable_lanes || []).join(', ') || 'none';
      const led = (h.replay_protection && h.replay_protection.ledger) || {};
      const st = h.settlement || {};
      const tasks = h.tasks || [];
      const shown = tasks.slice(0, 6).join(', ') + (tasks.length > 6 ? ' +' + (tasks.length - 6) + ' more' : '');
      const split = led.external_receipts != null ? ' (' + led.external_receipts + ' external, ' + (led.internal_receipts || 0) + ' internal tests)' : '';
      txt(elRail, 'task rail ' + host + ' · ' + tasks.length + ' paid endpoints: ' + shown + ' · payable: ' + lanes + ' · paid calls: ' + (led.receipts != null ? led.receipts : '?') + split + ' · settlement: cdp ' + (st.cdp || '?') + ', self ' + (st.self_settle || '?'));
    }).catch(function(){ txt(elRail, 'task rail ' + host + ' · unreachable'); });
    const elSku = document.getElementById('agSku');
    fetch(rail + '/.well-known/x402', { headers: { accept: 'application/json' } }).then(function(r){ return r.json(); }).then(function(d){
      const k = d && d.launch_sku;
      if (!k) { txt(elSku, 'launch sku · none advertised'); return; }
      txt(elSku, 'launch sku · ' + k.name + ' · ' + bare(k.endpoint) + ' · $' + k.price_usd + ' per call · receipts: ' + host + '/receipts');
    }).catch(function(){ txt(elSku, 'launch sku · unreachable'); });
    fetch(rail + '/prove/stats', { headers: { accept: 'application/json' } }).then(function(r){ return r.json(); }).then(function(p){
      txt(elProve, 'proof receipts (' + host + '/prove) · sold: ' + (p.receipts != null ? p.receipts : '?') + ' · anchor: ' + (p.anchor || '?') + ' · key ' + String(p.keyId || '').slice(0, 24));
    }).catch(function(){ txt(elProve, 'proof receipts · unreachable'); });
  })();
  window.addEventListener('touchmove', function(e){
    if(e.touches.length > 0 && !camOn){
      onPointerMove(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, {passive: true});

  window.addEventListener('pointerdown', function(){
    pulseRadius = 1;
    pulseMax = Math.min(w, h) * 0.45;
  });

  // ---- voice: speech out (with lip-sync), speech in, and the chat round trip -------------------------------
  const elCaption = document.getElementById('caption');
  const elState = document.getElementById('avState');
  const dock = document.getElementById('chatDock');
  const chatIn = document.getElementById('chatIn');
  const talkBtn = document.getElementById('talkBtn');
  const voiceBtn = document.getElementById('voiceBtn');
  const synth = window.speechSynthesis || null;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  let voiceOn = !!synth, voice = null, handsFree = false, rec = null, recTries = 0, sayQueue = [], sayGen = 0, modeBrow = 0, history = [];

  function setMode(m){
    mode = m;
    if(elState) elState.textContent = 'AVATAR: ' + m.toUpperCase() + (handsFree ? ' · MIC OPEN' : '');
    modeBrow = m === 'listening' ? 0.8 : m === 'thinking' ? 0.35 : 0;
    browT = modeBrow;
  }
  function caption(you, me){
    if(!elCaption) return;
    elCaption.textContent = '';
    if(you){ const y = document.createElement('span'); y.className = 'you'; y.textContent = 'YOU · ' + you; elCaption.appendChild(y); }
    if(me){ const m = document.createElement('span'); m.textContent = me; elCaption.appendChild(m); }
  }
  let lastYou = '';
  let uiHover = false;
  if(dock){ dock.addEventListener('pointerenter', function(){ uiHover = true; }); dock.addEventListener('pointerleave', function(){ uiHover = false; }); }

  function pickVoice(){
    if(!synth) return;
    const all = synth.getVoices() || [];
    const want = ['Andrew Online', 'Guy Online', 'Christopher Online', 'Brian Online', 'Google UK English Male', 'Daniel', 'Microsoft David', 'Microsoft Mark', 'Alex', 'Google US English', 'Samantha'];
    for(let i = 0; i < want.length && !voice; i++){
      for(let j = 0; j < all.length; j++){ if(all[j].name.indexOf(want[i]) >= 0 && String(all[j].lang).indexOf('en') === 0){ voice = all[j]; break; } }
    }
    if(!voice){ for(let j = 0; j < all.length; j++){ if(String(all[j].lang).indexOf('en') === 0){ voice = all[j]; break; } } }
  }
  if(synth){ pickVoice(); if(synth.addEventListener) synth.addEventListener('voiceschanged', function(){ voice = null; pickVoice(); }); }

  // Text -> mouth shapes. open: how far the jaw drops; wide: spread (+) or rounded (-).
  const SHAPES = { a:[1,0.25], e:[0.55,0.75], i:[0.35,0.9], o:[0.8,-0.7], u:[0.45,-0.85], y:[0.35,0.6], w:[0.3,-0.8], m:[0,0], b:[0,0], p:[0,0], f:[0.14,0.3], v:[0.14,0.3], l:[0.35,0.2], r:[0.3,-0.2], s:[0.18,0.5], z:[0.18,0.5], t:[0.22,0.3], d:[0.22,0.3], n:[0.22,0.2], k:[0.3,0.1], g:[0.3,0.1], h:[0.45,0.1], c:[0.25,0.3], j:[0.3,-0.2], q:[0.3,-0.5], x:[0.25,0.4] };
  function schedule(text, fromMs, rate){
    const per = 68 / rate;
    let t = fromMs;
    const out = [];
    for(let i = 0; i < text.length; i++){
      const c = text.charAt(i).toLowerCase();
      const s = SHAPES[c];
      if(s){ out.push({ t: t, open: s[0], wide: s[1] }); t += per; }
      else if(c === ' '){ out.push({ t: t, open: 0.08, wide: 0 }); t += per * 0.6; }
      else if(c === '.' || c === ',' || c === '?' || c === '!' || c === ';' || c === ':'){ out.push({ t: t, open: 0, wide: 0 }); t += per * 4; }
      else { t += per * 0.5; }
    }
    out.push({ t: t, open: 0, wide: 0 });
    return out;
  }
  function splitSentences(text){
    const parts = String(text).split(/([.!?]+ )/);
    const out = [];
    for(let i = 0; i < parts.length; i += 2){ const s = (parts[i] + (parts[i + 1] || '')).trim(); if(s) out.push(s); }
    return out;
  }
  function speakNext(){
    if(!sayQueue.length){ visemes = []; mouthOpenT = 0; mouthWideT = 0; setMode('idle'); if(handsFree) listen(); return; }
    const text = sayQueue.shift();
    const gen = ++sayGen;
    setMode('speaking');
    speakingSince = performance.now();
    if(!voiceOn || !synth){
      // Muted: still move the mouth through the sentence so the head visibly answers.
      visemes = schedule(text, performance.now(), 1);
      setTimeout(function(){ if(gen === sayGen) speakNext(); }, Math.min(9000, 400 + text.length * 62));
      return;
    }
    const u = new SpeechSynthesisUtterance(text.split('https://').join('').split('http://').join(''));
    if(voice) u.voice = voice;
    u.lang = (voice && voice.lang) || 'en-US';
    u.rate = 1.0; u.pitch = 0.85; u.volume = 1;
    let done = false;
    function finish(){ if(done) return; done = true; if(gen === sayGen) speakNext(); }
    u.onstart = function(){ visemes = schedule(text, performance.now() + 60, u.rate); };
    u.onboundary = function(ev){
      // Re-sync the mouth to the word the synthesiser is actually on (not every voice reports this).
      if(ev && typeof ev.charIndex === 'number' && ev.charIndex >= 0 && (!ev.name || ev.name === 'word')) visemes = schedule(text.slice(ev.charIndex), performance.now(), u.rate);
    };
    u.onend = finish; u.onerror = finish;
    setTimeout(finish, 1500 + text.length * 110);           // some engines never fire onend
    synth.speak(u);
  }
  function say(text){
    if(!text) return;
    stopListening();
    caption(lastYou, text);
    const parts = splitSentences(text);
    for(let i = 0; i < parts.length; i++) sayQueue.push(parts[i]);
    if(mode !== 'speaking') speakNext();
  }
  function hush(){ sayGen++; sayQueue = []; visemes = []; if(synth) synth.cancel(); if(mode === 'speaking') setMode('idle'); }

  function ask(text){
    text = String(text || '').trim().slice(0, 400);
    if(!text || mode === 'thinking') return;
    hush();
    lastYou = text;
    caption(text, '…');
    history.push({ role: 'user', content: text });
    if(history.length > 8) history = history.slice(-8);
    setMode('thinking');
    fetch('/avatar/chat', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ messages: history }) })
      .then(function(r){ return r.json().then(function(j){ return { s: r.status, j: j }; }, function(){ return { s: r.status, j: null }; }); })
      .then(function(o){
        let reply = o.j && o.j.reply;
        if(o.s === 200 && reply){ history.push({ role: 'assistant', content: reply }); }
        else {
          history.pop();
          reply = o.s === 429 ? 'I answer a few questions a minute for each visitor. Give me a moment and ask again.'
                : o.s === 503 ? 'My language model is not connected on this deployment, so I can track you but not answer yet.'
                : 'I could not reach my language model just now. The paid endpoints are unaffected. Ask me again shortly.';
        }
        setMode('idle');
        say(reply);
      })
      .catch(function(){ history.pop(); setMode('idle'); say('The network dropped my answer. Ask me again.'); });
  }

  function stopListening(){ if(rec){ const r = rec; rec = null; try { r.onend = null; r.abort(); } catch(e){} } }
  function listen(){
    if(!SR || rec || mode === 'speaking' || mode === 'thinking') return;
    const r = new SR();
    rec = r; r.lang = 'en-US'; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
    let finalText = '';
    r.onresult = function(ev){
      let interim = '';
      for(let i = ev.resultIndex; i < ev.results.length; i++){
        const t = ev.results[i][0].transcript;
        if(ev.results[i].isFinal) finalText += t; else interim += t;
      }
      if(chatIn) chatIn.value = finalText || interim;
    };
    r.onerror = function(ev){ if(ev && (ev.error === 'not-allowed' || ev.error === 'service-not-allowed')){ handsFree = false; if(talkBtn) talkBtn.textContent = '[ TALK ]'; caption('', 'The microphone is blocked for this page. You can type to me instead.'); } };
    r.onend = function(){
      if(rec === r) rec = null;
      const said = finalText.trim();
      if(chatIn) chatIn.value = '';
      if(said){ recTries = 0; ask(said); return; }
      if(mode === 'listening') setMode('idle');
      if(handsFree && ++recTries < 4) setTimeout(listen, 250);
      else if(handsFree){ handsFree = false; recTries = 0; if(talkBtn) talkBtn.textContent = '[ TALK ]'; setMode('idle'); }
    };
    try { r.start(); setMode('listening'); } catch(e){ rec = null; }
  }
  if(talkBtn){
    if(!SR){ talkBtn.textContent = '[ TALK: NOT IN THIS BROWSER ]'; talkBtn.disabled = true; }
    talkBtn.addEventListener('click', function(){
      if(handsFree){ handsFree = false; stopListening(); talkBtn.textContent = '[ TALK ]'; setMode(mode === 'listening' ? 'idle' : mode); return; }
      handsFree = true; recTries = 0; talkBtn.textContent = '[ STOP LISTENING ]';
      hush();
      listen();
    });
  }
  if(voiceBtn){
    if(!synth){ voiceBtn.textContent = '[ NO VOICE IN THIS BROWSER ]'; voiceBtn.disabled = true; }
    voiceBtn.addEventListener('click', function(){ voiceOn = !voiceOn; voiceBtn.textContent = voiceOn ? '[ VOICE ON ]' : '[ VOICE OFF ]'; if(!voiceOn && synth) synth.cancel(); });
  }
  const chipBox = document.getElementById('chips');
  if(chipBox) chipBox.addEventListener('click', function(e){ const t = e.target; if(t && t.className === 'chip') ask(t.textContent); });
  if(dock){
    dock.addEventListener('submit', function(e){ e.preventDefault(); const v = chatIn ? chatIn.value : ''; if(chatIn) chatIn.value = ''; ask(v); });
  }
  window.addEventListener('pagehide', function(){ hush(); stopListening(); });
  setMode('idle');
  caption('', 'I am the gateway. Ask me what this is, what it costs, or what we are building. Press TALK to speak, or type.');

  const nodes = [
    [-45, -75, 10], [0, -92, 20], [45, -75, 10], [0, -65, 48],
    [-52, -32, 30], [-20, -35, 48], [20, -35, 48], [52, -32, 30],
    [-30, -16, 40], [-13, -16, 43], [13, -16, 43], [30, -16, 40],
    [0, -28, 52], [0, 0, 60],
    [-60, 0, 16], [-38, 12, 38], [38, 12, 38], [60, 0, 16],
    [-24, 38, 38], [0, 40, 46], [24, 38, 38],
    [-22, 64, 28], [0, 68, 33], [22, 64, 28],
    [-52, 34, -12], [52, 34, -12],
    [-30, -85, -20], [30, -85, -20], [0, -100, -10],
    [-55, -45, -25], [55, -45, -25],
    [-40, 20, -35], [40, 20, -35],
    [0, 60, -20]
  ];
  const JAW = { 21: 1, 22: 1, 23: 1, 33: 0.6 };   // nodes that drop with the jaw
  const BROW = { 5: 1, 6: 1, 4: 0.4, 7: 0.4 };    // nodes that lift with the brows

  const edges = [
    [0,1],[1,2],[0,3],[1,3],[2,3],
    [3,12],[12,13],[4,5],[5,6],[6,7],
    [4,8],[5,9],[8,9],[6,10],[7,11],[10,11],
    [8,14],[11,17],[14,15],[17,16],[15,13],[16,13],
    [15,18],[16,20],[18,19],[19,20],
    [18,21],[19,22],[20,23],[21,22],[22,23],
    [14,24],[24,21],[17,25],[25,23],
    [26,28],[28,27],[0,26],[2,27],[1,28],
    [26,29],[27,30],[4,29],[7,30],
    [29,31],[30,32],[24,31],[25,32],
    [21,33],[23,33],[31,33],[32,33]
  ];

  const particles = [];
  for(let i=0; i<64; i++){
    particles.push({
      x: (Math.random() - 0.5) * 440,
      y: (Math.random() - 0.5) * 380,
      z: (Math.random() - 0.5) * 320,
      phase: Math.random() * Math.PI * 2,
      speed: 0.4 + Math.random() * 0.8
    });
  }

  function project(p, rx, ry, scale, cx, cy, rz){
    let px = p[0], py = p[1];
    if(rz){ const cz = Math.cos(rz), sz = Math.sin(rz); const tx = px * cz - py * sz; py = px * sz + py * cz; px = tx; }
    const cosY = Math.cos(ry), sinY = Math.sin(ry);
    const x1 = px * cosY + p[2] * sinY;
    const z1 = -px * sinY + p[2] * cosY;
    const cosX = Math.cos(rx), sinX = Math.sin(rx);
    const y1 = py * cosX - z1 * sinX;
    const z2 = py * sinX + z1 * cosX;
    const fov = 480;
    const pers = fov / (fov + z2);
    return [cx + x1 * pers * scale, cy + y1 * pers * scale, z2, pers];
  }

  // A smooth curve from a to b that passes through mid.
  function arcThrough(a, mid, b){
    ctx.moveTo(a[0], a[1]);
    ctx.quadraticCurveTo(2 * mid[0] - (a[0] + b[0]) / 2, 2 * mid[1] - (a[1] + b[1]) / 2, b[0], b[1]);
  }

  let time = 0;
  function animate(){
    time += 0.016;
    const now = performance.now();
    // In conversation (or with the pointer down on the controls) the head turns back to face the visitor.
    const att = camOn ? 1 : ((mode === 'idle' && !uiHover) ? 1 : 0.28);
    rotX += (targetRotX * att - rotX) * 0.055;
    rotY += (targetRotY * att - rotY) * 0.055;
    rotZ += (targetRotZ - rotZ) * 0.08;
    lean += (targetLean - lean) * 0.05;

    // Mouth target: the scheduled shape for this instant; if a voice gives us nothing to sync to, keep talking anyway.
    if(mode === 'speaking'){
      let cur = null;
      while(visemes.length > 1 && visemes[1].t <= now) visemes.shift();
      if(visemes.length && visemes[0].t <= now) cur = visemes[0];
      if(cur && visemes.length > 1){ mouthOpenT = cur.open; mouthWideT = cur.wide; }
      else { mouthOpenT = 0.18 + 0.4 * Math.abs(Math.sin(now * 0.011) * Math.sin(now * 0.0047 + 1.3)); mouthWideT = 0.3 * Math.sin(now * 0.006); }
    } else { mouthOpenT = 0; mouthWideT = 0; }
    mouthOpen += (mouthOpenT - mouthOpen) * 0.38;
    mouthWide += (mouthWideT - mouthWide) * 0.3;
    smile += (smileT - smile) * 0.08;
    brow += (browT - brow) * 0.1;

    // Blink on a loose human rhythm; hold the eyes a little narrower while thinking.
    if(now > nextBlink){ blinkUntil = now + 130; nextBlink = now + 2200 + Math.random() * 3800; }
    const blinkT = now < blinkUntil ? 1 : (mode === 'thinking' ? 0.25 : 0);
    blink += (blinkT - blink) * 0.45;

    ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2 + Math.sin(time * 0.7) * 6;
    const scale = Math.min(w, h) / 240 * lean;

    // Outer Gyroscope Ring 1
    ctx.strokeStyle = 'rgba(0, 243, 255, 0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for(let a=0; a<=Math.PI*2+0.1; a+=0.15){
      const rx = Math.cos(a + time * 0.25) * 135;
      const rz = Math.sin(a + time * 0.25) * 135;
      const pt = project([rx, 0, rz], rotX * 0.4, rotY * 0.4 + time * 0.1, scale, cx, cy);
      if(a === 0) ctx.moveTo(pt[0], pt[1]); else ctx.lineTo(pt[0], pt[1]);
    }
    ctx.stroke();

    // Outer Gyroscope Ring 2 (Counter-rotating pitch)
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.12)';
    ctx.beginPath();
    for(let a=0; a<=Math.PI*2+0.1; a+=0.15){
      const ry = Math.cos(a - time * 0.2) * 125;
      const rz = Math.sin(a - time * 0.2) * 125;
      const pt = project([0, ry, rz], rotX * 0.4 + time * 0.08, rotY * 0.4, scale, cx, cy);
      if(a === 0) ctx.moveTo(pt[0], pt[1]); else ctx.lineTo(pt[0], pt[1]);
    }
    ctx.stroke();

    // State halo: green and breathing while listening, a turning arc while thinking, driven by the mouth while speaking.
    if(mode !== 'idle'){
      const R = 116 * scale;
      ctx.lineWidth = 2;
      if(mode === 'listening'){
        ctx.strokeStyle = 'rgba(16, 185, 129, ' + (0.35 + 0.3 * Math.sin(time * 5)) + ')';
        ctx.beginPath(); ctx.arc(cx, cy, R * (1 + 0.02 * Math.sin(time * 5)), 0, Math.PI * 2); ctx.stroke();
      } else if(mode === 'thinking'){
        ctx.strokeStyle = 'rgba(0, 243, 255, 0.55)';
        for(let k = 0; k < 3; k++){ ctx.beginPath(); ctx.arc(cx, cy, R, time * 3 + k * 2.1, time * 3 + k * 2.1 + 0.9); ctx.stroke(); }
      } else {
        ctx.strokeStyle = 'rgba(0, 243, 255, ' + (0.15 + mouthOpen * 0.5) + ')';
        ctx.beginPath(); ctx.arc(cx, cy, R * (1 + mouthOpen * 0.035), 0, Math.PI * 2); ctx.stroke();
      }
    }

    // Ambient floating particles
    for(let i=0; i<particles.length; i++){
      const pt = particles[i];
      const pz = pt.z + Math.sin(time * pt.speed + pt.phase) * 20;
      const pp = project([pt.x, pt.y, pz], rotX * 0.25, rotY * 0.25, scale, cx, cy);
      ctx.fillStyle = 'rgba(127, 214, 189, 0.25)';
      ctx.beginPath();
      ctx.arc(pp[0], pp[1], 1.2 * pp[3], 0, Math.PI * 2);
      ctx.fill();
    }

    const jawDrop = mouthOpen * 10;
    const proj = nodes.map(function(n, i){
      const dy = (JAW[i] ? JAW[i] * jawDrop : 0) - (BROW[i] ? BROW[i] * brow * 5 : 0);
      return project(dy ? [n[0], n[1] + dy, n[2]] : n, rotX, rotY, scale, cx, cy, rotZ);
    });

    // Wireframe edges
    ctx.strokeStyle = 'rgba(127, 214, 189, 0.48)';
    ctx.lineWidth = 1.35;
    for(let i=0; i<edges.length; i++){
      const a = proj[edges[i][0]], b = proj[edges[i][1]];
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    }

    // Vertex nodes
    for(let i=0; i<proj.length; i++){
      const p = proj[i];
      const alpha = Math.max(0.18, (p[2] + 80) / 160);
      ctx.fillStyle = 'rgba(0, 243, 255, ' + alpha + ')';
      ctx.beginPath();
      ctx.arc(p[0], p[1], 1.9 * p[3], 0, Math.PI * 2);
      ctx.fill();
    }

    // Mouth: two lips between the corners. Corners pull in when rounded, out and up when spread or smiling.
    const half = 15 + mouthWide * 4 + smile * 3;
    const cornerY = 50 - smile * 4.5 + mouthOpen * 2;
    const mL = project([-half, cornerY, 41], rotX, rotY, scale, cx, cy, rotZ);
    const mR = project([half, cornerY, 41], rotX, rotY, scale, cx, cy, rotZ);
    const mU = project([0, 49 - mouthOpen * 2 + smile * 1.5, 47], rotX, rotY, scale, cx, cy, rotZ);
    const mD = project([0, 51 + mouthOpen * 11 + smile * 2.5, 46], rotX, rotY, scale, cx, cy, rotZ);
    ctx.beginPath();
    arcThrough(mL, mU, mR);
    ctx.quadraticCurveTo(2 * mD[0] - (mL[0] + mR[0]) / 2, 2 * mD[1] - (mL[1] + mR[1]) / 2, mL[0], mL[1]);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0, 243, 255, ' + (0.05 + mouthOpen * 0.3) + ')';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 243, 255, ' + (0.7 + mouthOpen * 0.3) + ')';
    ctx.lineWidth = 1.6;
    ctx.shadowColor = '#00f3ff';
    ctx.shadowBlur = 4 + mouthOpen * 14;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Ocular cybernetic eyes, lids & dynamic pupil tracking
    const eyeL = project([-22, -16, 40], rotX, rotY, scale, cx, cy, rotZ);
    const eyeR = project([22, -16, 40], rotX, rotY, scale, cx, cy, rotZ);
    const pupilShiftX = mouseX * 6 * scale;
    const pupilShiftY = mouseY * 4 * scale;
    const lid = Math.max(0.06, 1 - blink);

    [eyeL, eyeR].forEach(function(e){
      // Sclera socket ring, squeezed by the lid
      ctx.strokeStyle = 'rgba(0, 243, 255, 0.75)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(e[0], e[1], 6.5 * scale * e[3], 6.5 * scale * e[3] * lid, rotZ, 0, Math.PI * 2);
      ctx.stroke();

      // Glowing pupil locking onto the viewer
      if(lid > 0.35){
        ctx.fillStyle = '#00f3ff';
        ctx.shadowColor = '#00f3ff';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(e[0] + pupilShiftX, e[1] + pupilShiftY * lid, 2.8 * scale * e[3], 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    });

    // Expanding shockwave pulse on click
    if(pulseRadius > 0){
      pulseRadius += 8;
      const pAlpha = Math.max(0, 1 - pulseRadius / pulseMax);
      ctx.strokeStyle = 'rgba(0, 243, 255, ' + pAlpha + ')';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy, pulseRadius, 0, Math.PI * 2);
      ctx.stroke();
      if(pulseRadius >= pulseMax) pulseRadius = 0;
    }

    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);

  // Drawer interaction
  const drawer = document.getElementById('drawer');
  const openBtn = document.getElementById('openDrawer');
  const closeBtn = document.getElementById('closeDrawer');
  if(openBtn && drawer){
    openBtn.addEventListener('click', function(){ drawer.classList.add('open'); });
  }
  if(closeBtn && drawer){
    closeBtn.addEventListener('click', function(){ drawer.classList.remove('open'); });
  }
  window.addEventListener('keydown', function(e){
    if(e.key === 'Escape' && drawer) drawer.classList.remove('open');
  });
})();
</script>
</body>
</html>
`;
}

export function agentCard(origin: string, cfg: GatewayConfig, labels: Labels, adapters: Readonly<Record<string, AdapterSpec>>, publicKeyHex: string): unknown {
  const decimals = cfg.x402?.network.decimals ?? 6;
  return {
    schemaVersion: "truth-agent-card-1",
    name: `${(() => { try { return new URL(origin).hostname.toLowerCase(); } catch { return "gateway"; } })()} truth gateway`,
    operator: "UnyKorn LLC (Wyoming)",
    description: "A cryptographically witnessed, append-only ledger that records what happened, who paid, and when. Pay per observation over x402. Independently verifiable by anyone, without trusting the operator.",
    url: origin,
    labels,
    paymentProtocols: ["x402"],
    discovery: {
      manifest: `${origin}/.well-known/truth.json`,
      x402: `${origin}/.well-known/x402`,
      openapi: `${origin}/openapi.json`,
      status: `${origin}/status.json`,
      pricing: `${origin}/pricing.json`,
      security: `${origin}/.well-known/security.txt`,
      schemas: [`${origin}/schema/truth-record-v1.schema.json`, `${origin}/schema/truth-attestation-v1.schema.json`],
      source: "https://github.com/FTHTrading/truth-adapters-",
    },
    witness_public_key: publicKeyHex,
    tools: Object.values(adapters).map((a) => ({
      id: a.name,
      kind: "x402-paid-http",
      method: "POST",
      url: `${origin}/witness/${a.name}`,
      observation: a.observation,
      price: cfg.x402 ? { atomic: a.price.atomic, display: formatAtomic(a.price.atomic, decimals), asset: cfg.x402.network.asset, network: cfg.x402.network.network } : { atomic: a.price.atomic },
      input_example: a.inputExample,
      output: "truth-attestation-v1: outcome, signed event, entry hash, finalization, cost, verify URL",
    })),
    verify: `${origin}/verify/{entry_hash}`,
    does_not: ["judge intent", "interpret meaning", "decide fairness", "resolve disputes", "explain outcomes", "grant exceptions", "edit or delete history", "hold or move client funds"],
    limitations: [LIMITATIONS, PERIMETER],
  };
}

export { PERIMETER };
