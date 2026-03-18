
// ════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════
let deployMode = 'client';
let manFlds = {};
let charts = {};
let lastC = {};
let shownAlerts = new Set();
let preAllocJobs = [];
let parallelJobs = [];
let jobPctOvr = {};
let paCounter = 0;
let customProps = [];
const COLORS = ['#00d4ff','#7c3aed','#10b981','#f59e0b','#ef4444','#ec4899','#06b6d4','#8b5cf6','#34d399','#fbbf24','#f87171','#22d3ee','#a78bfa'];

// ════════════════════════════════════════════
// TOOLTIP — hover shows (viewport-fixed), click pins
// ════════════════════════════════════════════
let _pinnedTT = null;
let _hoverTT = null; // currently hovered tooltip

function _positionTT(tt, triggerEl) {
  const GAP = 8;
  const TW = 300;
  tt.style.width = TW + 'px';
  tt.style.display = 'block';
  tt.style.visibility = 'hidden';
  const TH = tt.offsetHeight || 200;
  tt.style.visibility = '';

  const r = triggerEl.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Horizontal: prefer right of trigger, flip left if not enough room
  let left = r.right + GAP;
  if (left + TW > vw - GAP) {
    left = r.left - TW - GAP;
  }
  if (left < GAP) left = GAP;

  // Vertical: centre on trigger, clamp to viewport
  let top = r.top + r.height / 2 - TH / 2;
  if (top + TH > vh - GAP) top = vh - TH - GAP;
  if (top < GAP) top = GAP;

  tt.style.left = left + 'px';
  tt.style.top  = top  + 'px';
}

function _initTT(tt) {
  if (tt.dataset.ttInit) return;
  tt.dataset.ttInit = '1';
  const close = document.createElement('button');
  close.className = 'tt-close'; close.textContent = '✕';
  close.addEventListener('click', e => { e.stopPropagation(); _unpinTT(); });
  tt.insertBefore(close, tt.firstChild);
  const hint = document.createElement('div');
  hint.className = 'tt-pin-hint'; hint.textContent = '📌 Click ⓘ button to pin this open';
  tt.appendChild(hint);
}

function _unpinTT() {
  if (_pinnedTT) {
    _pinnedTT.style.display = 'none';
    _pinnedTT.classList.remove('pinned');
    const btn = document.querySelector('.ii.pinned');
    if (btn) btn.classList.remove('pinned');
    _pinnedTT = null;
  }
}

// Hover: show on mouseover, hide on mouseout (unless pinned or cursor moved into tooltip)
document.addEventListener('mouseover', e => {
  const ii = e.target.closest('.ii');
  if (ii) {
    const tt = ii.querySelector('.tt');
    if (!tt || tt === _pinnedTT) return;
    _initTT(tt);
    _hoverTT = tt;
    _positionTT(tt, ii);
    return;
  }
  // If moving INTO the tooltip itself while it's the hover tooltip, keep it visible
  const tt = e.target.closest('.tt');
  if (tt && tt === _hoverTT && tt !== _pinnedTT) {
    tt.style.display = 'block';
  }
});

document.addEventListener('mouseout', e => {
  const ii = e.target.closest('.ii');
  if (ii) {
    const tt = ii.querySelector('.tt');
    // Only hide if not pinned AND cursor isn't going into the tooltip
    if (tt && tt !== _pinnedTT) {
      const related = e.relatedTarget;
      // If cursor moves into the tooltip panel, don't hide
      if (related && tt.contains(related)) return;
      tt.style.display = 'none';
      _hoverTT = null;
    }
    return;
  }
  // If leaving the tooltip itself (not pinned), hide it
  const tt = e.target.closest('.tt');
  if (tt && tt === _hoverTT && tt !== _pinnedTT) {
    const related = e.relatedTarget;
    const parentII = tt.closest('.ii');
    if (related && (tt.contains(related) || related === parentII || parentII?.contains(related))) return;
    tt.style.display = 'none';
    _hoverTT = null;
  }
});

// Click: toggle pin
document.addEventListener('click', e => {
  const ii = e.target.closest('.ii');
  if (ii) {
    const tt = ii.querySelector('.tt');
    if (!tt) return;
    e.stopPropagation();
    if (_pinnedTT && _pinnedTT !== tt) _unpinTT();
    if (tt === _pinnedTT) { _unpinTT(); return; }
    _initTT(tt);
    _pinnedTT = tt;
    tt.classList.add('pinned');
    ii.classList.add('pinned');
    _positionTT(tt, ii);
    return;
  }
  if (_pinnedTT && !e.target.closest('.tt')) _unpinTT();
});

// ════════════════════════════════════════════
// TABS
// ════════════════════════════════════════════
function showTab(t, el) {
  document.querySelectorAll('.tsec').forEach(s => s.classList.remove('on'));
  document.querySelectorAll('.tbtn').forEach(b => b.classList.remove('on'));
  document.getElementById('tab-'+t).classList.add('on');
  if (el) el.classList.add('on');
  else { const b = document.getElementById('tbn-'+t); if(b) b.classList.add('on'); }
  if (t==='viz') setTimeout(renderCharts, 80);
  if (t==='jobs') setTimeout(updJobs, 80);
  if (t==='report') genReport();
}

// ════════════════════════════════════════════
// TEMPLATES
// ════════════════════════════════════════════
const TMPLS = {
  small:{nodes:4,cpn:8,rpn:32},medium:{nodes:10,cpn:16,rpn:64},
  large:{nodes:20,cpn:32,rpn:128},xlarge:{nodes:50,cpn:64,rpn:256},
  emr:{nodes:10,cpn:16,rpn:64},databricks:{nodes:8,cpn:16,rpn:56},
  hdp:{nodes:12,cpn:24,rpn:96}
};
function applyTmpl(t) {
  document.querySelectorAll('.ctc').forEach(c=>c.classList.remove('sel'));
  document.getElementById('tmpl-'+t).classList.add('sel');
  const tmpl = TMPLS[t];
  if (!tmpl) {
    // Custom template: auto-scroll to hardware spec and focus first field
    setTimeout(()=>{
      const hw = document.getElementById('hw-spec-card');
      if(hw){ hw.scrollIntoView({behavior:'smooth',block:'start'}); }
      setTimeout(()=>{ const n=document.getElementById('nodes'); if(n) n.focus(); },400);
    },80);
    return;
  }
  ['nodes','cpn','rpn'].forEach(k => { if(tmpl[k]) document.getElementById(k).value=tmpl[k]; });
  compute();
}

// ════════════════════════════════════════════
// MODE
// ════════════════════════════════════════════
function setMode(m) {
  deployMode = m;
  ['client','cluster'].forEach(x => {
    const btn = document.getElementById('btn-'+x);
    if (btn) btn.classList.toggle('active', x===m);
  });
  const tags = {client:'ℹ CLIENT',cluster:'ℹ CLUSTER'};
  const tag = document.getElementById('mode-desc-tag');
  if (tag) tag.textContent = tags[m]||'ℹ CLIENT';

  // Master node spec card — only relevant in CLIENT mode
  const masterCard = document.getElementById('master-node-card');
  if (masterCard) masterCard.style.display = (m === 'client') ? 'block' : 'none';

  // Update RM reserve label based on current RM type
  _updateRMReserveLabel();

  compute();
}

// ════════════════════════════════════════════
// RM RESERVE LABEL — adapts to Resource Manager type
// STANDALONE RM: Spark Worker daemon still needs reserve per worker node
//                Master node runs separately and is NOT part of this pool
// ════════════════════════════════════════════
function _updateRMReserveLabel() {
  const yarnInput = document.getElementById('yarnR');
  const yarnLabel = document.getElementById('yarnR-label');
  const yarnNote  = document.getElementById('yarnR-note');
  if (!yarnInput) return;

  const rm = document.getElementById('resMgr')?.value || 'yarn';
  const rmInfo = {
    yarn:       { lbl:'YARN NodeManager Reserve (GB/node)',      tip:'YARN NodeManager daemon per worker node. Handles container lifecycle and resource reporting.',      bp:'✦ Best practice: 1–2 GB per worker node.',     def:1, disabled:false },
    standalone: { lbl:'Spark Worker Daemon Reserve (GB/node)',   tip:'Spark Standalone Worker process runs on each worker node. The Master node runs separately and is NOT part of this worker pool — its resources are outside this calculator.',  bp:'✦ Best practice: 0.5–1 GB per worker. Master node is separate.', def:1, disabled:false },
    k8s:        { lbl:'K8s Kubelet + System Pods Reserve (GB)',  tip:'Kubernetes kubelet, system pods (coredns, metrics-server), and any sidecars per worker node.',    bp:'✦ Best practice: 2–4 GB. More if using Istio/Envoy sidecars.', def:2, disabled:false },
    mesos:      { lbl:'Mesos Agent Reserve (GB/node)',           tip:'Mesos agent process per worker node, plus framework overhead.',                                   bp:'✦ Best practice: 1–2 GB.',                     def:1, disabled:false },
    local:      { lbl:'Local Mode — No RM Reserve Needed',       tip:'Local mode runs driver and all executors in a single JVM. No resource manager daemon overhead.', bp:'✦ Set to 0 — no RM process running.',           def:0, disabled:true },
  };
  const info = rmInfo[rm] || rmInfo.yarn;

  yarnInput.disabled = info.disabled;
  yarnInput.style.opacity = info.disabled ? '0.4' : '1';
  yarnInput.style.cursor  = info.disabled ? 'not-allowed' : '';
  if (info.disabled) yarnInput.value = 0;
  else if (!yarnInput.value || parseFloat(yarnInput.value) === 0) yarnInput.value = info.def;

  if (yarnNote) {
    if (rm === 'standalone') {
      yarnNote.style.display = 'block';
      yarnNote.textContent = 'ℹ Standalone Master node runs separately — not counted in this worker pool. Reserve above is for the Worker daemon on each worker node only.';
    } else if (rm === 'local') {
      yarnNote.style.display = 'block';
      yarnNote.textContent = '✓ Local mode: no resource manager daemon — reserve set to 0.';
    } else {
      yarnNote.style.display = 'none';
    }
  }

  if (yarnLabel) {
    yarnLabel.innerHTML = `${info.lbl} <i class="ii">i<span class="tt"><div class="ttt">${info.lbl}</div>${info.tip}<div class="tbp">${info.bp}</div></span></i>`;
  }
}

function showModeHelp() {
  const info = {
    client:`<div style="margin-bottom:12px;padding:10px;background:rgba(0,212,255,.08);border-radius:7px;border-left:3px solid var(--ac);">
      <strong style="color:var(--ac);">CLIENT MODE</strong><br>
      The Spark driver runs on the machine that submits the job (master node, edge node, or your laptop). This node is OUTSIDE the worker cluster.<br><br>
      <strong>Resource implications:</strong><br>
      • Worker nodes: 100% available for executors (no deduction for driver)<br>
      • Master/submitting node: driver consumes its memory and CPU<br>
      • The tool tracks master node driver usage separately and warns on overload<br><br>
      <strong>When to use:</strong> Interactive Spark sessions, Jupyter notebooks, short ETL jobs where you want driver logs locally.
    </div>`,
    cluster:`<div style="margin-bottom:12px;padding:10px;background:rgba(124,58,237,.08);border-radius:7px;border-left:3px solid var(--ac2);">
      <strong style="color:var(--ac2);">CLUSTER MODE</strong><br>
      The Spark driver is deployed ON a worker node inside the cluster, managed by YARN/K8s.<br><br>
      <strong>Resource implications:</strong><br>
      • ONE worker node is reserved for the driver<br>
      • That node's cores and memory are consumed by driver — NOT available for executors<br>
      • The tool deducts (execNodes = totalNodes - 1) automatically<br><br>
      <strong>When to use:</strong> Production batch jobs, scheduled pipelines, jobs that must complete even if the client disconnects. Preferred for YARN/K8s environments.
    </div>`,
    standalone:`<div style="margin-bottom:12px;padding:10px;background:rgba(16,185,129,.08);border-radius:7px;border-left:3px solid var(--ac3);">
      <strong style="color:var(--ac3);">STANDALONE MODE</strong><br>
      Spark's built-in cluster manager. A dedicated Master process coordinates workers.<br><br>
      <strong>Resource implications:</strong><br>
      • Master process is lightweight (coordinator only) — does NOT run executors<br>
      • Master node memory/CPU is NOT deducted from executor pool<br>
      • All worker nodes are fully available for executors<br>
      • Driver can be client or cluster mode within standalone<br><br>
      <strong>When to use:</strong> On-prem clusters without YARN. Simple setup, direct Spark control. Not recommended for multi-tenant production (no resource isolation).
    </div>`
  };
  document.getElementById('mode-modal-body').innerHTML = info[deployMode]||'';
  document.getElementById('mode-modal').classList.add('on');
}

// ════════════════════════════════════════════
// TOGGLE TRACES
// ════════════════════════════════════════════
function togTrace() {
  const p = document.getElementById('tr-panel'), l = document.getElementById('tr-lbl');
  p.classList.toggle('on'); l.textContent = p.classList.contains('on') ? '▲ Hide':'▼ Show';
}
function togJobTrace() {
  const p = document.getElementById('jtr-panel'), l = document.getElementById('jtr-lbl');
  p.classList.toggle('on'); l.textContent = p.classList.contains('on') ? '▲ Hide':'▼ Show';
}

// ════════════════════════════════════════════
// MANUAL OVERRIDE
// ════════════════════════════════════════════
function manOvr(id) {
  manFlds[id] = true;
  const el=document.getElementById(id), b=document.getElementById('b-'+id), r=document.getElementById('r-'+id);
  if(el){el.classList.remove('iauto');el.classList.add('imanual');}
  if(b){b.textContent='✎M';b.className='fbadge fm';}
  if(r) r.style.display='flex';
  compute();
}
function rstFld(id) {
  delete manFlds[id];
  const el=document.getElementById(id), b=document.getElementById('b-'+id), r=document.getElementById('r-'+id);
  if(el){el.classList.remove('imanual');el.classList.add('iauto');}
  if(b){b.textContent='⚡A';b.className='fbadge fa';}
  if(r) r.style.display='none';
  compute();
}
function setAV(id, val) { const e=document.getElementById(id); if(e && !manFlds[id]) e.value=val; }
function gv(id) { return parseFloat(document.getElementById(id)?.value)||0; }
function gc(id) { return document.getElementById(id)?.checked||false; }
function gs2(id) { return document.getElementById(id)?.value||''; }

// ════════════════════════════════════════════
// POPUP TOGGLE
// ════════════════════════════════════════════


// ════════════════════════════════════════════
// ALERTS TOGGLE
// ════════════════════════════════════════════
function _onAlertsToggle(on) {
  document.getElementById('popup-lbl').textContent = on ? 'ON' : 'OFF';
  const desc = document.getElementById('popup-desc');
  if (desc) desc.textContent = on
    ? 'Modal alerts fire when CPU/RAM exceed 95% critical threshold or job pool is over-allocated. Toggle OFF to suppress modals (inline warnings remain).'
    : 'Alerts MUTED — modal pop-ups suppressed. Inline warnings in the Warnings panel remain visible.';
  if (!on) shownAlerts = new Set(); // reset so they re-fire if toggled back on
}

// Enforce toggle labels
['enfMinC','enfMinM','enfJE','enfJC'].forEach(id => {
  const el = document.getElementById(id);
  if(el) el.addEventListener('change', function(){
    const lbl = document.getElementById(id+'-lbl');
    if(lbl) lbl.textContent = this.checked ? 'ON':'OFF';
    compute();
  });
});

// ════════════════════════════════════════════
// CUSTOM PROPERTIES
// ════════════════════════════════════════════
function addCustomProp() {
  customProps.push({id: 'cp_'+Date.now(), key:'', val:''});
  renderCustomProps();
}
function removeCustomProp(id) {
  customProps = customProps.filter(p=>p.id!==id);
  renderCustomProps();
}
function renderCustomProps() {
  const c = document.getElementById('custom-props');
  if(!c) return;
  c.innerHTML = customProps.map((p,i)=>`
    <div class="cprop">
      <input type="text" value="${p.key}" placeholder="spark.property.name" oninput="customProps[${i}].key=this.value;compute()" style="flex:2;"/>
      <input type="text" value="${p.val}" placeholder="value" oninput="customProps[${i}].val=this.value;compute()" style="flex:1;"/>
      <button class="btn bd2 bsm" onclick="removeCustomProp('${p.id}')">✕</button>
    </div>`).join('');
}

// ════════════════════════════════════════════
// DEBOUNCED COMPUTE (performance — 55ms debounce)
// ════════════════════════════════════════════
let _computeTimer = null;
function compute() {
  clearTimeout(_computeTimer);
  _computeTimer = setTimeout(_doCompute, 55);
}
function computeNow() { clearTimeout(_computeTimer); _doCompute(); }

function _doCompute() {
  const nodes = Math.max(1, gv('nodes'));
  const cpn = Math.max(1, gv('cpn'));
  const rpn = Math.max(1, gv('rpn'));
  const osR = gv('osR');
  // Standalone has no resource manager daemon — no RM reserve needed
  const yarnR = gv('yarnR'); // read from field — _updateRMReserveLabel manages value/label per RM type
  const osCR = Math.max(0, gv('osCR'));
  const minEC = Math.max(1, gv('minExecC')), minEM = Math.max(1, gv('minExecM'));
  const enfC = gc('enfMinC'), enfM = gc('enfMinM');
  const mf = gv('memFrac')||0.6, sf = gv('stoFrac')||0.5;
  const wl = gs2('wlType')||'etl';
  const aqe = gc('aqeOn'), dynA = gc('dynAlloc'), py = gc('pysparkOn');
  const rm = gs2('resMgr')||'yarn', sv = gs2('sparkVer')||'3.5';
  const storage = gs2('storageType')||'hdfs';

  const totalCores = nodes * cpn;
  const totalRAM = nodes * rpn;
  const usableCPN = Math.max(1, cpn - osCR);
  const availRAM = Math.max(1, rpn - osR - yarnR);

  // EXECUTOR CORES
  let execC;
  if (manFlds['execC']) { execC = gv('execC'); }
  else {
    let ec = wl==='streaming'?2 : wl==='ml'?Math.min(8,usableCPN) : Math.min(5, Math.floor(usableCPN/Math.ceil(usableCPN/5)));
    if (enfC) ec = Math.max(minEC, ec); else if(ec < minEC) ec = ec; // warn but don't clamp
    execC = Math.max(1, ec);
    setAV('execC', execC);
  }

  // EXECUTORS / NODE
  let execPN;
  if (manFlds['execPN']) { execPN = gv('execPN'); }
  else { execPN = Math.max(1, Math.floor(usableCPN / execC)); setAV('execPN', execPN); }

  // EXECUTOR MEMORY
  let execM;
  if (manFlds['execM']) { execM = gv('execM'); }
  else {
    let em = Math.floor((availRAM / execPN) * 0.875);
    if (enfM) em = Math.max(minEM, em);
    execM = Math.max(1, em);
    setAV('execM', execM);
  }

  // OVERHEAD
  let execOH;
  if (manFlds['execOH']) { execOH = gv('execOH'); }
  else { execOH = Math.max(384, Math.ceil(execM*1024*0.1)) + (py?1024:0); setAV('execOH', execOH); }

  // DRIVER
  let drvM, drvC;
  if (manFlds['drvM']) { drvM = gv('drvM'); }
  else { drvM = deployMode==='cluster' ? Math.max(4,Math.min(execM,8)) : Math.max(4,Math.min(16,Math.round(totalRAM*0.02))); setAV('drvM', drvM); }
  if (manFlds['drvC']) { drvC = gv('drvC'); }
  else { drvC = deployMode==='cluster' ? 4 : 2; setAV('drvC', drvC); }

  // EXECUTOR NODES
  // CLIENT: all nodes free for executors. CLUSTER: 1 node for driver. STANDALONE: all nodes.
  const execNodes = deployMode==='cluster' ? Math.max(1, nodes-1) : nodes;
  const totalExec = execNodes * execPN;
  const totalEC = totalExec * execC;

  // PARALLELISM
  let para;
  if (manFlds['para']) { para = gv('para'); }
  else { const pf = wl==='streaming'?2:wl==='ml'?3:2; para = totalEC*pf; setAV('para', para); }
  let shufP;
  if (manFlds['shufP']) { shufP = gv('shufP'); }
  else { shufP = para; setAV('shufP', shufP); }

  // DYNAMIC ALLOCATION
  if (manFlds['dynMax']) {} else { setAV('dynMax', totalExec); }

  // UTILIZATION — against USABLE resources (after OS+RM reserves), not total cluster
  // This gives a true picture: 100% = all reserved-for-Spark capacity consumed
  const usableTotalCores = nodes * usableCPN;
  const usableTotalRAM = nodes * availRAM;
  const clusterUsedCores = deployMode==='cluster' ? totalEC + drvC : totalEC;
  const coreUtil = Math.round((clusterUsedCores / Math.max(1, usableTotalCores)) * 100);

  const totalExecMemGB = totalExec * (execM + execOH/1024);
  const reserveRAM = nodes * (osR + yarnR);
  // In cluster mode driver RAM counts against cluster. In client mode it's on master (not a worker).
  const clusterUsedRAM = deployMode==='cluster'
    ? totalExecMemGB + (drvM + drvC*0.25) + reserveRAM  // cluster: driver on worker
    : totalExecMemGB + reserveRAM;                         // client/standalone: driver on master, not counted
  // RAM util based on usable (executor-reserved) RAM only — OS+RM reserves excluded from denominator
  const usableExecRAM = totalExec * (execM + execOH/1024); // what executors actually use
  const memUtil = Math.round((usableExecRAM / Math.max(1, usableTotalRAM)) * 100);

  // Driver on master node (CLIENT mode) — utilisation and risk calculation
  const masterRam   = deployMode==='client' ? Math.max(1, gv('masterRam'))   : 0;
  const masterCores = deployMode==='client' ? Math.max(1, gv('masterCores')) : 0;
  const drvOH       = Math.max(384, Math.round(drvM * 1024 * 0.1));
  const masterRamUsed   = deployMode==='client' ? drvM + drvOH/1024 : 0;
  const masterCoresUsed = deployMode==='client' ? drvC : 0;
  const masterRamUtil   = (masterRam > 0 && deployMode==='client') ? Math.round((masterRamUsed / masterRam) * 100) : 0;
  const masterCoreUtil  = (masterCores > 0 && deployMode==='client') ? Math.round((masterCoresUsed / masterCores) * 100) : 0;
  const masterRamFree   = deployMode==='client' ? Math.max(0, masterRam - masterRamUsed)     : 0;
  const masterCoresFree = deployMode==='client' ? Math.max(0, masterCores - masterCoresUsed) : 0;

  lastC = {
    nodes,cpn,rpn,osR,yarnR,osCR,minEC,minEM,enfC,enfM,
    execC,execPN,execM,execOH,drvM,drvC,execNodes,totalExec,totalEC,
    para,shufP,coreUtil,memUtil,totalCores,totalRAM,
    mf,sf,wl,aqe,dynA,py,rm,sv,storage,deployMode,
    availRAM,totalExecMemGB,clusterUsedRAM,clusterUsedCores,reserveRAM,
    usableExecRAM,usableTotalCores,usableTotalRAM,
    unusedCores: Math.max(0,usableTotalCores-clusterUsedCores),
    unusedRAM: Math.max(0,totalRAM-clusterUsedRAM),
    masterRam, masterCores, masterRamUsed, masterCoresUsed,
    masterRamUtil, masterCoreUtil, masterRamFree, masterCoresFree,
    drvOH, usableCPN
  };

  updateSetupMetrics(lastC);
  updateMetrics(lastC);
  updateUtilBars(lastC);
  updateTrace(lastC);
  updateWarnings(lastC);
  updateConfigOut(lastC);
  updateTags(lastC);
  updateDriverInfoBox(lastC);
  updateMasterNodePanel(lastC);
  updateDynAllocPanel(lastC);

  if (document.getElementById('tab-viz').classList.contains('on')) renderCharts();
  if (document.getElementById('tab-jobs').classList.contains('on')) updJobs();
}

// ════════════════════════════════════════════
// SETUP METRICS
// ════════════════════════════════════════════
function updateSetupMetrics(c) {
  const el = id => document.getElementById(id);
  el('sm-nodes').textContent = c.nodes;
  el('sm-cores').textContent = c.totalCores;
  el('sm-ram').textContent = c.totalRAM+' GB';
  const usableC = c.nodes*(c.cpn-c.osCR);
  const usableR = Math.round(c.nodes*c.availRAM);
  el('sm-uc').textContent = usableC;
  el('sm-ur').textContent = usableR+' GB';
  // Derivation subtitles
  const ucD = el('sm-uc-detail');
  const urD = el('sm-ur-detail');
  if(ucD) ucD.textContent = `${c.nodes}×(${c.cpn}−${c.osCR} OS)=${usableC}`;
  if(urD) urD.textContent = `${c.nodes}×(${c.rpn}−${c.osR}OS−${c.yarnR}RM)=${usableR}GB`;
  // Update mc title tooltips
  const ucCard = el('sm-uc-card');
  const urCard = el('sm-ur-card');
  if(ucCard) ucCard.title = `Derivation: ${c.nodes} nodes × (${c.cpn} cores − ${c.osCR} OS reserve) = ${usableC} usable cores`;
  if(urCard) urCard.title = `Derivation: ${c.nodes} nodes × (${c.rpn}GB − ${c.osR}GB OS − ${c.yarnR}GB RM) = ${usableR}GB usable RAM`;
}

// ════════════════════════════════════════════
// METRICS
// ════════════════════════════════════════════
function updateMetrics(c) {
  const el = id => document.getElementById(id);
  el('m-exec').textContent = c.totalExec;
  el('m-exec-u').textContent = `${c.execPN}/node × ${c.execNodes} nodes`;
  el('m-slots').textContent = c.totalEC;
  el('m-slots-u').textContent = `${c.totalExec} exec × ${c.execC} cores`;
  el('m-emem').textContent = Math.round(c.totalExecMemGB)+' GB';
  el('m-emem-u').textContent = `${c.execM}GB × ${c.totalExec} exec`;
  el('m-cu').textContent = c.coreUtil+'%';
  el('m-cu-u').textContent = `${c.clusterUsedCores} / ${c.totalCores} cores`;
  el('m-mu').textContent = c.memUtil+'%';
  el('m-mu-u').textContent = `${Math.round(c.clusterUsedRAM)} / ${c.totalRAM} GB`;
  el('m-para').textContent = c.para;

  const cCol = c.coreUtil>95?'var(--da)':c.coreUtil>80?'var(--wa)':'var(--ac3)';
  const mCol = c.memUtil>95?'var(--da)':c.memUtil>80?'var(--wa)':'var(--ac3)';
  el('m-cu').style.color = cCol;
  el('m-mu').style.color = mCol;

  setBar('mb-exec', Math.min(100,(c.totalExec/(c.nodes*8))*100), 'fc');
  setBar('mb-slots', Math.min(100,c.coreUtil), c.coreUtil>95?'fd':c.coreUtil>80?'fw':'fp');
  setBar('mb-emem', Math.min(100,c.memUtil), c.memUtil>95?'fd':c.memUtil>80?'fw':'fg2');
  setBar('mb-cu', Math.min(100,c.coreUtil), c.coreUtil>95?'fd':c.coreUtil>80?'fw':'fc');
  setBar('mb-mu', Math.min(100,c.memUtil), c.memUtil>95?'fd':c.memUtil>80?'fw':'fp');
}
function setBar(id, pct, cls) {
  const el = document.getElementById(id);
  if(!el) return;
  el.style.width = pct+'%';
  el.className = 'mbf '+cls;
}

let _driverBoxOpen = false;
function _togDriverBox() {
  _driverBoxOpen = !_driverBoxOpen;
  const body = document.getElementById('driver-box-body');
  const tog  = document.getElementById('driver-box-tog');
  if(body) body.style.display = _driverBoxOpen ? 'block' : 'none';
  if(tog)  tog.textContent = _driverBoxOpen ? '▲ Hide' : '▼ Show';
}

// ════════════════════════════════════════════
// DRIVER INFO BOX
// ════════════════════════════════════════════
function updateDriverInfoBox(c) {
  const box  = document.getElementById('driver-info-box');
  const body = document.getElementById('driver-box-body');
  const title= document.getElementById('driver-box-title');
  if(!box || !body) return;
  const ohMB = Math.max(384, Math.round(c.drvM*1024*0.1));
  let inner = '';
  if (c.deployMode === 'client') {
    const risk = c.drvM >= 16 ? 'sba' : c.drvM >= 8 ? 'swn' : 'sok';
    const riskTxt = c.drvM >= 16 ? '⚠ High driver memory — ensure master has enough RAM' : c.drvM >= 8 ? '△ Moderate — acceptable for most master nodes' : '✓ Low driver footprint';
    if(title) title.innerHTML = `🔵 CLIENT MODE — Driver on Master Node &nbsp;<span class="sp ${risk}" style="font-size:9px;">${riskTxt}</span>`;
    inner = `<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin-bottom:8px;">
        <div style="background:var(--sf2);border-radius:7px;padding:9px;text-align:center;"><div style="font-size:9px;color:var(--tx3);">Driver Heap</div><div style="font-size:16px;font-weight:800;color:var(--ac);font-family:'JetBrains Mono',monospace;">${c.drvM}GB</div></div>
        <div style="background:var(--sf2);border-radius:7px;padding:9px;text-align:center;"><div style="font-size:9px;color:var(--tx3);">Driver Overhead</div><div style="font-size:16px;font-weight:800;color:#a78bfa;font-family:'JetBrains Mono',monospace;">${ohMB}MB</div></div>
        <div style="background:var(--sf2);border-radius:7px;padding:9px;text-align:center;"><div style="font-size:9px;color:var(--tx3);">Driver Cores</div><div style="font-size:16px;font-weight:800;color:var(--wa);font-family:'JetBrains Mono',monospace;">${c.drvC}</div></div>
        <div style="background:var(--sf2);border-radius:7px;padding:9px;text-align:center;"><div style="font-size:9px;color:var(--tx3);">Worker Nodes</div><div style="font-size:16px;font-weight:800;color:var(--ac3);font-family:'JetBrains Mono',monospace;">${c.nodes}</div><div style="font-size:8px;color:var(--tx3);">fully for executors</div></div>
      </div>
      <div style="font-size:10px;color:var(--tx3);margin-top:5px;">ℹ Driver resources are on master — NOT deducted from cluster executor pool. All ${c.totalCores} worker cores available for executors.</div>`;
  } else if (c.deployMode === 'cluster') {
    if(title) title.innerHTML = `🟣 CLUSTER MODE — Driver on Worker Node`;
    inner = `<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin-bottom:8px;">
        <div style="background:var(--sf2);border-radius:7px;padding:9px;text-align:center;"><div style="font-size:9px;color:var(--tx3);">Reserved Node</div><div style="font-size:16px;font-weight:800;color:var(--da);font-family:'JetBrains Mono',monospace;">1</div><div style="font-size:8px;color:var(--tx3);">for driver</div></div>
        <div style="background:var(--sf2);border-radius:7px;padding:9px;text-align:center;"><div style="font-size:9px;color:var(--tx3);">Driver Heap</div><div style="font-size:16px;font-weight:800;color:var(--ac);font-family:'JetBrains Mono',monospace;">${c.drvM}GB</div></div>
        <div style="background:var(--sf2);border-radius:7px;padding:9px;text-align:center;"><div style="font-size:9px;color:var(--tx3);">Driver Cores</div><div style="font-size:16px;font-weight:800;color:var(--wa);font-family:'JetBrains Mono',monospace;">${c.drvC}</div></div>
        <div style="background:var(--sf2);border-radius:7px;padding:9px;text-align:center;"><div style="font-size:9px;color:var(--tx3);">Exec Nodes</div><div style="font-size:16px;font-weight:800;color:var(--ac3);font-family:'JetBrains Mono',monospace;">${c.execNodes}</div><div style="font-size:8px;color:var(--tx3);">${c.nodes}-1 deducted</div></div>
      </div>
      <div style="font-size:10px;color:var(--tx3);">⚠ 1 worker node reserved for driver. Executor pool = ${c.execNodes} nodes × ${c.execPN} exec/node = ${c.totalExec} executors.</div>`;
  } else {
    if(title) title.innerHTML = `🟢 STANDALONE MODE — Master is Coordinator Only`;
    inner = `<div style="font-size:10px;color:var(--tx2);">Standalone: Master is coordinator — no executors on master. All ${c.nodes} worker nodes available. Driver can be client or cluster within standalone.</div>`;
  }
  body.innerHTML = inner;
  box.style.display = 'block';
}

// ════════════════════════════════════════════
// UTIL BARS
// ════════════════════════════════════════════
function updateUtilBars(c) {
  // Utilization denominator = USABLE capacity (OS+RM reserves excluded).
  // This gives true executor pressure: 100% = you've allocated everything Spark can use.
  const execHeapTotal   = Math.round(c.totalExec * c.execM);
  const execOHTotal     = Math.round(c.totalExec * c.execOH / 1024);
  const drvRAM          = c.deployMode==='cluster' ? c.drvM + Math.max(384,Math.round(c.drvM*1024*0.1))/1024 : 0;
  const bars = [
    {lbl:'Worker CPU — Executor Cores vs Usable Cores',
     used:c.clusterUsedCores, total:c.usableTotalCores, unit:'cores',
     detail:`${c.totalEC} executor cores${c.deployMode==='cluster'?' + '+c.drvC+' driver cores':' (driver on master — excluded)'}. Denominator = ${c.nodes}×(${c.cpn}−${c.osCR} OS reserve) = ${c.usableTotalCores} usable cores. OS reserve excluded.`,
     avail:Math.max(0,c.usableTotalCores-c.clusterUsedCores), col:c.coreUtil>95?'var(--da)':c.coreUtil>80?'var(--wa)':'var(--ac)'},
    {lbl:'Worker Memory — Executor RAM vs Usable RAM (OS+RM reserves excluded)',
     used:Math.round(c.usableExecRAM), total:Math.round(c.usableTotalRAM), unit:'GB',
     detail:`Exec heap: ${execHeapTotal}GB + OH: ${execOHTotal}GB = ${Math.round(c.usableExecRAM)}GB. Denominator = ${c.nodes}×(${c.rpn}−${c.osR}OS−${c.yarnR}RM) = ${Math.round(c.usableTotalRAM)}GB usable. OS+RM reserves excluded.${c.py?' Includes +'+Math.round(c.totalExec*1024/1024)+'GB PySpark overhead.':''}`,
     avail:Math.max(0,Math.round(c.usableTotalRAM-c.usableExecRAM)), col:c.memUtil>95?'var(--da)':c.memUtil>80?'var(--wa)':'var(--ac2)'},
    {lbl:'Executor Heap (spark.executor.memory × count)',
     used:execHeapTotal, total:Math.round(c.usableTotalRAM), unit:'GB',
     detail:`${c.totalExec} executors × ${c.execM}GB heap = ${execHeapTotal}GB  [spark.executor.memory=${c.execM}g]`,
     avail:Math.round(c.usableTotalRAM - execHeapTotal), col:'var(--ac3)'},
    {lbl:'Executor Overhead (memoryOverhead × count)'+( c.py?' incl. PySpark +1GB/exec':''),
     used:execOHTotal, total:Math.round(c.usableTotalRAM), unit:'GB',
     detail:`${c.totalExec} executors × ${c.execOH}MB overhead = ${execOHTotal}GB off-heap  [spark.executor.memoryOverhead=${c.execOH}m].${c.py?' Includes +1024MB PySpark worker per executor.':''} JVM metaspace, native code, Python workers.`,
     avail:Math.round(c.usableTotalRAM - execOHTotal), col:'var(--wa)'},
    {lbl:'System Reserves (OS + RM daemon per node) — informational only',
     used:Math.round(c.reserveRAM), total:c.totalRAM, unit:'GB',
     detail: c.yarnR === 0
       ? `${c.nodes} nodes × ${c.osR}GB OS = ${Math.round(c.reserveRAM)}GB. These are EXCLUDED from the usable pool above and from utilization % calculations.`
       : `${c.nodes} nodes × (${c.osR}GB OS + ${c.yarnR}GB ${c.rm==='standalone'?'Spark Worker daemon':c.rm==='k8s'?'K8s kubelet':'RM daemon'}) = ${Math.round(c.reserveRAM)}GB. EXCLUDED from usable pool and from utilization %.`,
     avail:Math.round(c.totalRAM-c.reserveRAM), col:'#475569'},
  ];
  const container = document.getElementById('util-bars');
  container.innerHTML = bars.map(b=>{
    const pct = Math.min(100,Math.round((b.used/b.total)*100));
    return `<div class="ub">
      <div class="ubl"><span>${b.lbl}</span>
        <span>${b.used} <span style="color:var(--tx3);">/</span> <strong>${b.total}</strong> ${b.unit} &nbsp;<span class="tag ${pct>95?'td':pct>80?'tw':'tc'}">${pct}%</span> &nbsp;Available: <span style="color:var(--ac3)">${b.avail} ${b.unit}</span></span>
      </div>
      <div class="ubd">${b.detail}</div>
      <div class="ubtr"><div class="ubf" style="width:${pct}%;background:${b.col};"></div></div>
    </div>`;
  }).join('');

  const bw = document.getElementById('util-badges');
  bw.innerHTML = '';
  const ab = (l,c2)=>bw.innerHTML+=`<span class="sp ${c2}">${l}</span>`;
  if(c.coreUtil>95)ab('🔥 CPU CRITICAL','sba'); else if(c.coreUtil>80)ab('⚠ CPU WARNING','swn'); else if(c.coreUtil<50)ab('↓ CPU UNDER','slo'); else ab('✓ CPU OPTIMAL','sok');
  if(c.memUtil>95)ab('🔥 MEM CRITICAL','sba'); else if(c.memUtil>80)ab('⚠ MEM WARNING','swn'); else if(c.memUtil<50)ab('↓ MEM UNDER','slo'); else ab('✓ MEM OPTIMAL','sok');

  const pill=document.getElementById('st-pill'), msg=document.getElementById('st-msg');
  if(c.coreUtil>95||c.memUtil>95){pill.className='sp sba';pill.textContent='● CRITICAL';msg.textContent='Over-allocation detected — risk of OOM and starvation.';}
  else if(c.coreUtil>80||c.memUtil>80){pill.className='sp swn';pill.textContent='● WARNING';msg.textContent='Approaching limits. Monitor closely in production.';}
  else if(c.coreUtil<50&&c.memUtil<50){pill.className='sp slo';pill.textContent='● UNDER-UTILIZED';msg.textContent='Cluster under-used. Consider more jobs or smaller cluster.';}
  else{pill.className='sp sok';pill.textContent='● OPTIMAL';msg.textContent='Configuration within best-practice thresholds.';}

  // Popup alerts — thresholds based on usable (post-reserve) capacity
  const popupsOn = gc('popupsEnabled');
  [['cpu-crit', c.coreUtil>95, '🔥','CPU Critical Over-Allocation',
    `Worker cluster is ${c.coreUtil}% CPU utilized of usable capacity.\n${c.clusterUsedCores} executor cores used out of ${c.usableTotalCores} usable cores (${c.nodes} nodes × (${c.cpn}−${c.osCR} OS reserve)). OS/system reserves are excluded from this percentage.`,
    `How to fix:\n1) Reduce spark.executor.cores (currently ${c.execC}) → try ${Math.max(2,c.execC-1)}\n2) Reduce executors per node (currently ${c.execPN}) → try ${Math.max(1,c.execPN-1)}\n3) Reduce total nodes allocated to this job`],
   ['mem-crit', c.memUtil>95, '💥','Memory Critical Over-Allocation',
    `Worker cluster is ${c.memUtil}% memory utilized of usable capacity.\n${Math.round(c.usableExecRAM)}GB executor RAM (heap+overhead) out of ${Math.round(c.usableTotalRAM)}GB usable (${c.nodes} nodes × (${c.rpn}GB − ${c.osR}GB OS − ${c.yarnR}GB RM)). OS+RM reserves are excluded from this percentage.`,
    `How to fix:\n1) Reduce spark.executor.memory (currently ${c.execM}GB) → try ${Math.max(1,c.execM-2)}GB\n2) Reduce executors per node (currently ${c.execPN})\n3) Increase OS/RM reserve to reflect actual system usage\n4) Check memoryOverhead (${c.execOH}MB) — PySpark overhead: ${c.py?'+1024MB included':'not applicable'}`]
  ].forEach(([key,cond,icon,title,body,fix])=>{
    if(cond && !shownAlerts.has(key) && popupsOn){shownAlerts.add(key);showAlert(icon,title,body,fix);}
    if(!cond) shownAlerts.delete(key);
  });
}

// ════════════════════════════════════════════
// TRACE
// ════════════════════════════════════════════
function updateTrace(c) {
  const steps = [
    ['Usable CPU Cores per Node', `${c.cpn} physical cores − ${c.osCR} OS reserve`, `${c.cpn-c.osCR} usable cores per node`],
    ['Executor Cores Formula', `Workload: ${c.wl} → ${c.wl==='streaming'?'streaming=2':c.wl==='ml'?'ml=min(8,usable)':'general=min(5,floor(usable÷ceil(usable÷5)))'}, enforce_min=${c.enfC} (threshold=${c.minEC})`, `${c.execC} cores per executor`],
    ['Executors per Node', `floor(${c.cpn-c.osCR} usable cores ÷ ${c.execC} exec cores)`, `${c.execPN} executors per node`],
    ['Available RAM per Node', 
      c.rm==='local' 
        ? `${c.rpn}GB total − ${c.osR}GB OS (local mode: no RM reserve)`
        : `${c.rpn}GB total − ${c.osR}GB OS − ${c.yarnR}GB ${c.rm==='standalone'?'Worker daemon':c.rm==='k8s'?'K8s kubelet':'RM'} reserve`, `${c.availRAM}GB available per node`],
    ['Executor Memory', `floor(${c.availRAM}GB avail/node ÷ ${c.execPN} exec/node × 0.875) = floor(${(c.availRAM/c.execPN*0.875).toFixed(2)}GB)${c.enfM?' → raised to min('+c.minEM+'GB, computed)':''} — 0.875 leaves 12.5% headroom for OS buffers`, `${c.execM}GB heap per executor  [spark.executor.memory=${c.execM}g]`],
    ['Memory Overhead', `max(384MB, ceil(10% × ${c.execM}GB heap = ${Math.round(c.execM*1024*0.1)}MB))${c.py?' + 1024MB PySpark worker':''}`, `${c.execOH}MB off-heap overhead  [spark.executor.memoryOverhead=${c.execOH}m]`],
    ['Executor Nodes', c.deployMode==='cluster' ? `${c.nodes} nodes − 1 driver node (CLUSTER mode)` : `${c.nodes} nodes (${c.deployMode.toUpperCase()} mode — no deduction)`, `${c.execNodes} executor nodes`],
    ['Total Executors', `${c.execNodes} nodes × ${c.execPN} executors per node`, `${c.totalExec} total executors`],
    ['Total Task Slots', `${c.totalExec} executors × ${c.execC} cores per executor`, `${c.totalEC} concurrent task slots`],
    ['Default Parallelism', `${c.totalEC} task slots × ${c.wl==='ml'?3:2} factor (workload: ${c.wl})`, `${c.para} partitions`],
    ['Shuffle Partitions', `= parallelism${c.aqe?' — AQE will auto-tune this at runtime':''}`, `${c.shufP} shuffle partitions`],
    ['Cluster CPU Utilization', `${c.clusterUsedCores} executor cores ÷ ${Math.round(c.nodes*c.usableCPN)} usable cores (${c.nodes}×(${c.cpn}−${c.osCR} OS)) = ${c.coreUtil}%${c.deployMode==='client'?' (driver excluded — runs on master)':''}`, `${c.coreUtil}% — ${c.coreUtil>95?'CRITICAL':c.coreUtil>80?'WARNING':c.coreUtil<50?'UNDER-UTILIZED':'OPTIMAL'}`],
    ['Cluster RAM Utilization', `${Math.round(c.usableExecRAM)}GB executor RAM ÷ ${Math.round(c.nodes*c.availRAM)}GB usable RAM (OS+RM reserves excluded from denominator) = ${c.memUtil}%${c.deployMode==='client'?' (driver excluded)':''}`, `${c.memUtil}% — ${c.memUtil>95?'CRITICAL':c.memUtil>80?'WARNING':c.memUtil<50?'UNDER-UTILIZED':'OPTIMAL'}`],
    ['Available (Unused)', `CPU: ${c.usableTotalCores} usable − ${c.clusterUsedCores} used   RAM: ${Math.round(c.usableTotalRAM)}GB usable − ${Math.round(c.usableExecRAM)}GB exec`, `${Math.max(0,c.usableTotalCores-c.clusterUsedCores)} cores, ${Math.round(Math.max(0,c.usableTotalRAM-c.usableExecRAM))}GB unused executor capacity`],
  ];
  document.getElementById('tr-content').innerHTML = steps.map((s,i)=>
    `<div class="trl"><span class="trk">STEP ${String(i+1).padStart(2,'0')} — ${s[0]}:</span>&nbsp;<span class="trf">${s[1]}</span>&nbsp;<span style="color:var(--tx3);">→</span>&nbsp;<span class="trr">${s[2]}</span></div>`
  ).join('');
}

// ════════════════════════════════════════════
// WARNINGS
// ════════════════════════════════════════════
function updateWarnings(c) {
  const ws = [];
  // Threshold violations
  if (!c.enfC && gv('execC') < c.minEC) ws.push({t:'wiw',m:`⚠ Executor cores (${c.execC}) is below threshold (${c.minEC}). Enforcement is OFF — this is a warning only. Enable enforcement in Cluster Setup to clamp.`});
  if (!c.enfM && c.execM < c.minEM) ws.push({t:'wiw',m:`⚠ Executor memory (${c.execM}GB) below threshold (${c.minEM}GB). Enforcement is OFF — warning only.`});
  if (c.enfC && c.execC === c.minEC) ws.push({t:'wii',m:`ℹ Executor cores clamped to minimum threshold (${c.minEC}). Computed value was lower. Consider reducing minExecCores or increasing cores per node.`});
  if (c.enfM && c.execM === c.minEM) ws.push({t:'wii',m:`ℹ Executor memory clamped to minimum threshold (${c.minEM}GB). Computed value was lower. Consider adding more RAM per node or reducing OS/YARN reserves.`});
  // Over-allocation — based on usable (post-reserve) percentage
  if(c.coreUtil>95) ws.push({t:'wie wia',m:`🔥 CPU ${c.coreUtil}% of usable cores (${c.clusterUsedCores}/${c.usableTotalCores} usable — OS/system cores excluded from denominator): CRITICAL. Fix: reduce exec cores to ${Math.max(2,c.execC-1)} or executors/node to ${Math.max(1,c.execPN-1)}.`});
  if(c.memUtil>95) ws.push({t:'wie wia',m:`🔥 RAM ${c.memUtil}% of usable RAM (executor heap+OH vs ${Math.round(c.usableTotalRAM)}GB usable — OS+RM reserves excluded): CRITICAL. Fix: reduce executor memory to ${Math.max(1,c.execM-2)}GB or add more RAM to nodes.`});
  if(c.coreUtil>80&&c.coreUtil<=95) ws.push({t:'wiw',m:`⚠ CPU at ${c.coreUtil}% of usable cores (${c.clusterUsedCores}/${c.usableTotalCores}). Approaching limit. GC pauses or failing tasks may consume the remaining headroom.`});
  if(c.memUtil>80&&c.memUtil<=95) ws.push({t:'wiw',m:`⚠ RAM at ${c.memUtil}% of usable executor RAM. Near limit. OS+RM reserves already excluded — this is pure executor allocation pressure.`});
  // Best practices
  if(c.execC>5&&c.wl!=='ml') ws.push({t:'wiw',m:`⚠ ${c.execC} cores/executor reduces HDFS throughput. HDFS performs best with ≤5 concurrent streams per executor. For ML workloads this is acceptable.`});
  if(c.execM>64) ws.push({t:'wiw',m:`⚠ Large executor (${c.execM}GB). Enable G1GC or ZGC. Large heaps increase GC stop-the-world pauses. Consider splitting into more, smaller executors.`});
  if(c.execOH<512) ws.push({t:'wiw',m:`⚠ Low memoryOverhead (${c.execOH}MB). Native off-heap use (Python, JVM strings, broadcast) may exceed this. Recommended: ≥512MB for JVM, ≥1.5GB for PySpark.`});
  if(c.para < c.totalEC) ws.push({t:'wiw',m:`⚠ Parallelism (${c.para}) < task slots (${c.totalEC}). Some executor cores will idle. Increase spark.default.parallelism to at least ${c.totalEC}.`});
  if(c.coreUtil<50&&c.memUtil<50) ws.push({t:'wii',m:`ℹ Under-utilized (CPU: ${c.coreUtil}%, RAM: ${c.memUtil}%). You could run more parallel jobs (use Parallel Jobs tab) or reduce cluster size to save cost.`});
  if(c.execPN===1) ws.push({t:'wii',m:`ℹ Only 1 executor per node. Node resources are used as one large JVM. Consider reducing exec cores for more executors with better fault isolation.`});
  if(c.aqe) ws.push({t:'wis',m:`✓ AQE enabled: Spark 3.x will auto-tune shuffle partitions, handle data skew, and coalesce empty partitions at runtime.`});
  if(c.dynA) ws.push({t:'wii',m:`ℹ Dynamic Allocation: add spark.shuffle.service.enabled=true (YARN), or use spark.dynamicAllocation.shuffleTracking.enabled=true (K8s/Standalone, Spark 3.x).`});
  if(c.py) ws.push({t:'wii',m:`ℹ PySpark: overhead raised by +1GB for Python worker. If using many UDFs concurrently, also set spark.python.worker.memory=${Math.max(512, c.execOH-1024)}m.`});
  if(c.deployMode==='client'&&c.masterRam>0){
    if(c.masterRamUtil>90) ws.push({t:'wie',m:`🔥 CLIENT MODE — Master node RAM critical (${c.masterRamUtil}%): driver uses ${c.masterRamUsed.toFixed(1)}GB of ${c.masterRam}GB. Reduce spark.driver.memory or increase master RAM.`});
    else if(c.masterRamUtil>70) ws.push({t:'wiw',m:`⚠ CLIENT MODE — Master node RAM at ${c.masterRamUtil}%: ${c.masterRamFree.toFixed(1)}GB free after driver (${c.drvM}GB heap + ${c.drvOH}MB overhead). Monitor for large broadcast variables.`});
    if(c.masterCoreUtil>80) ws.push({t:'wiw',m:`⚠ CLIENT MODE — Master node CPU at ${c.masterCoreUtil}%: ${c.drvC} driver cores of ${c.masterCores} total. Other processes may starve.`});
  }
  if(c.deployMode==='client'&&c.drvM>=16) ws.push({t:'wiw',m:`⚠ Client mode: driver heap ${c.drvM}GB on master. Set master node RAM ≥${c.drvM+4}GB to leave OS headroom.`});
  if(ws.length===0) ws.push({t:'wis',m:`✓ All checks passed. Configuration within best-practice thresholds.`});
  document.getElementById('warnings').innerHTML = ws.map(w=>`<div class="wi ${w.t}">${w.m}</div>`).join('');
}

// ════════════════════════════════════════════
// DYNAMIC ALLOC PANEL
// ════════════════════════════════════════════
// ════════════════════════════════════════════
// MASTER NODE PANEL (CLIENT MODE)
// ════════════════════════════════════════════
function updateMasterNodePanel(c) {
  const panel = document.getElementById('master-util-panel');
  if (!panel || c.deployMode !== 'client') return;
  if (!c.masterRam) return;

  const ramColor  = c.masterRamUtil  > 90 ? 'var(--da)' : c.masterRamUtil  > 70 ? 'var(--wa)' : 'var(--ac3)';
  const coreColor = c.masterCoreUtil > 90 ? 'var(--da)' : c.masterCoreUtil > 70 ? 'var(--wa)' : 'var(--ac3)';

  const warnings = [];
  if (c.masterRamUtil > 90)  warnings.push(`<div class="wi wie" style="font-size:9px;padding:5px 8px;">🔥 Master RAM at ${c.masterRamUtil}% — driver may cause OOM. Increase master RAM or reduce driver memory (currently ${c.drvM}GB).</div>`);
  else if (c.masterRamUtil > 70) warnings.push(`<div class="wi wiw" style="font-size:9px;padding:5px 8px;">⚠ Master RAM at ${c.masterRamUtil}% — monitor for OOM under large broadcasts or collect() calls. Free: ${c.masterRamFree.toFixed(1)}GB.</div>`);
  if (c.masterCoreUtil > 90) warnings.push(`<div class="wi wie" style="font-size:9px;padding:5px 8px;">🔥 Master CPU at ${c.masterCoreUtil}% — driver cores (${c.drvC}) nearly exhaust master capacity. Reduce spark.driver.cores.</div>`);
  if (c.drvM + c.drvOH/1024 > c.masterRam * 0.85) warnings.push(`<div class="wi wie" style="font-size:9px;padding:5px 8px;">❌ Driver memory (${c.drvM}GB heap + ${c.drvOH}MB overhead = ${(c.drvM+c.drvOH/1024).toFixed(1)}GB) exceeds 85% of master RAM (${c.masterRam}GB). Very high OOM risk.</div>`);
  if (c.masterRamUtil <= 70 && c.masterCoreUtil <= 70) warnings.push(`<div class="wi wis" style="font-size:9px;padding:5px 8px;">✓ Master node has sufficient resources. ${c.masterRamFree.toFixed(1)}GB RAM and ${c.masterCoresFree} CPU cores free after driver.</div>`);

  // Best-practice guidance
  const tips = [];
  if (c.masterRam < 8) tips.push('Master has <8GB RAM — upgrade to ≥16GB for production CLIENT mode.');
  if (c.masterCores < 4) tips.push('Master has <4 cores — allocate spark.driver.cores=2 max.');
  if (c.drvM > c.masterRam * 0.5) tips.push(`Driver heap (${c.drvM}GB) > 50% of master RAM — leave headroom for OS and other processes.`);

  // Only render the full utilisation panel in the config page (master-util-config)
  // The setup page just shows input fields — no utilisation tiles there
  if (configPanel) {
    configPanel.style.display = c.deployMode === 'client' && c.masterRam > 0 ? 'block' : 'none';
    if (c.deployMode === 'client' && c.masterRam > 0) {
      configPanel.innerHTML = `<div class="ctit" style="margin-bottom:8px;font-size:10px;">
        <span class="dot dpk"></span> CLIENT MODE — Master Node Utilisation
        <span class="tag tc" style="font-size:8px;">${c.masterRam}GB RAM · ${c.masterCores} cores</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:6px;">
        <div>
          <div class="ubl"><span style="font-size:9px;">Master RAM: ${c.masterRamUsed.toFixed(1)}GB of ${c.masterRam}GB</span><span class="tag ${c.masterRamUtil>90?'td':c.masterRamUtil>70?'tw':'tg'}">${c.masterRamUtil}%</span></div>
          <div class="ubtr"><div class="ubf" style="width:${Math.min(c.masterRamUtil,100)}%;background:${ramColor};"></div></div>
          <div style="font-size:9px;color:var(--tx3);">${c.drvM}GB heap + ${c.drvOH}MB OH = ${c.masterRamUsed.toFixed(1)}GB · free: ${c.masterRamFree.toFixed(1)}GB</div>
        </div>
        <div>
          <div class="ubl"><span style="font-size:9px;">Master CPU: ${c.masterCoresUsed} of ${c.masterCores} cores</span><span class="tag ${c.masterCoreUtil>90?'td':c.masterCoreUtil>70?'tw':'tg'}">${c.masterCoreUtil}%</span></div>
          <div class="ubtr"><div class="ubf" style="width:${Math.min(c.masterCoreUtil,100)}%;background:${coreColor};"></div></div>
          <div style="font-size:9px;color:var(--tx3);">spark.driver.cores=${c.drvC} · free: ${c.masterCoresFree}</div>
        </div>
      </div>
      ${warnings.join('')}
      ${tips.length ? `<div style="font-size:9px;color:var(--tx3);margin-top:5px;padding:5px 7px;background:var(--sf2);border-radius:4px;border-left:2px solid var(--bd);">💡 ${tips.join('<br>💡 ')}</div>` : ''}`;
    }
  }

  // Setup page panel intentionally hidden — specs are input-only there
  if (panel) panel.innerHTML = '';
}

function updateDynAllocPanel(c) {
  const panel = document.getElementById('dyn-alloc-panel');
  const off = document.getElementById('dyn-off-msg');
  if (!panel||!off) return;
  if (c.dynA) {
    panel.style.display='block'; off.style.display='none';
    if (!manFlds['dynMax']) setAV('dynMax', c.totalExec);
    const min=gv('dynMin'), max=gv('dynMax')||c.totalExec, init=gv('dynInit'), idle=gv('dynIdle')||60;
    const conf = document.getElementById('dyn-conf');
    const rm = gs2('resMgr');
    if(conf) conf.innerHTML = `<span class="ck">spark.dynamicAllocation.enabled</span>         <span class="cv">true</span>
<span class="ck">spark.dynamicAllocation.minExecutors</span>       <span class="cv">${min}</span>
<span class="ck">spark.dynamicAllocation.maxExecutors</span>       <span class="cv">${max}</span>
<span class="ck">spark.dynamicAllocation.initialExecutors</span>   <span class="cv">${init}</span>
<span class="ck">spark.dynamicAllocation.executorIdleTimeout</span> <span class="cv">${idle}s</span>
${rm==='yarn'?`<span class="ck">spark.shuffle.service.enabled</span>              <span class="cv">true</span>`:`<span class="ck">spark.dynamicAllocation.shuffleTracking.enabled</span> <span class="cv">true</span>  # Spark 3.x`}`;
  } else {
    panel.style.display='none'; off.style.display='block';
  }
}

// ════════════════════════════════════════════
// TAGS
// ════════════════════════════════════════════
function updateTags(c) {
  const wls={etl:'ETL',ml:'ML/AI',streaming:'STREAM',interactive:'ADHOC',graph:'GRAPH'};
  document.getElementById('tag-mode').textContent = c.deployMode.toUpperCase();
  document.getElementById('tag-wl').textContent = wls[c.wl]||c.wl;
  document.getElementById('tag-rm').textContent = c.rm.toUpperCase();
  document.getElementById('tag-spark').textContent = 'Spark '+c.sv;
}

// ════════════════════════════════════════════
// SCHEDULER CONF BLOCK
// ════════════════════════════════════════════
function renderSchedConf() {
  const sched = gs2('scheduler'), numJ = gv('numJobs')||2;
  const el = document.getElementById('sched-conf-block');
  const tag = document.getElementById('sched-tag');
  if(!el) return;
  const schedMap = {fair:'FAIR',fifo:'FIFO',capacity:'CAPACITY'};
  if(tag) tag.textContent = schedMap[sched]||'FAIR';
  const conf = {
    fair: `<span class="ck">spark.scheduler.mode</span>                    <span class="cv">FAIR</span>
<span class="ck">spark.scheduler.allocation.file</span>          <span class="cv">fairscheduler.xml</span>
# Pool for each job: spark.scheduler.pool=&lt;poolName&gt;`,
    fifo: `<span class="ck">spark.scheduler.mode</span>                    <span class="cv">FIFO</span>
# FIFO: first job gets all resources until completion. No configuration needed.`,
    capacity: `<span class="ck">spark.scheduler.mode</span>                    <span class="cv">FAIR</span>
<span class="ck">yarn.scheduler.capacity.root.queues</span>      <span class="cv">default,${Array.from({length:numJ},(_,i)=>'q'+(i+1)).join(',')}</span>
<span class="ck">yarn.scheduler.capacity.root.default.capacity</span> <span class="cv">${Math.max(10,Math.round(100/numJ))}</span>%`,
  };
  el.innerHTML = conf[sched]||conf.fair;
}

// ════════════════════════════════════════════
// CONFIG OUTPUT
// ════════════════════════════════════════════
function updateConfigOut(c) {
  const dynBlock = c.dynA ? [
    '',`# ── Dynamic Allocation ──`,
    `spark.dynamicAllocation.enabled             true`,
    `spark.dynamicAllocation.minExecutors         ${gv('dynMin')||1}`,
    `spark.dynamicAllocation.maxExecutors         ${gv('dynMax')||c.totalExec}`,
    `spark.dynamicAllocation.initialExecutors     ${gv('dynInit')||4}`,
    `spark.dynamicAllocation.executorIdleTimeout  ${gv('dynIdle')||60}s`,
    c.rm==='yarn' ? `spark.shuffle.service.enabled                true` : `spark.dynamicAllocation.shuffleTracking.enabled  true`,
  ] : [``,`# spark.dynamicAllocation.enabled             false`];

  const customBlock = customProps.filter(p=>p.key&&p.val).map(p=>`${p.key.padEnd(45)}${p.val}`);

  const lines = [
    `# ⚡ Spark Config Architect v12 — Generated spark-defaults.conf`,
    `# Mode: ${c.deployMode.toUpperCase()} | Workload: ${c.wl.toUpperCase()} | Resource Mgr: ${c.rm.toUpperCase()} | Spark: ${c.sv}`,
    `# Cluster: ${c.nodes} nodes × ${c.cpn} cores × ${c.rpn}GB RAM = ${c.totalCores} cores, ${c.totalRAM}GB RAM`,
    `# CPU Util: ${c.coreUtil}% (${c.clusterUsedCores}/${c.totalCores} cores${c.deployMode==='client'?', driver on master (excluded)':''})` +
    ` | RAM Util: ${c.memUtil}% (${Math.round(c.clusterUsedRAM)}/${c.totalRAM}GB)`,
    ``,`# ── Executor Configuration ──`,
    `spark.executor.cores                         ${c.execC}`,
    `spark.executor.memory                        ${c.execM}g`,
    `spark.executor.memoryOverhead                ${c.execOH}m`,
    `# note: memoryOverhead(${c.execOH}MB) = max(384MB, 10% × ${c.execM}GB heap) — off-heap, NOT deducted from heap`,
    `spark.executor.instances                     ${c.totalExec}`,
    ``,`# ── Driver Configuration ──`,
    `spark.driver.memory                          ${c.drvM}g`,
    `spark.driver.cores                           ${c.drvC}`,
    `spark.driver.memoryOverhead                  ${Math.max(384,Math.round(c.drvM*1024*0.1))}m`,
    c.deployMode==='client' ? `# CLIENT mode: driver runs on master/submit node, NOT on worker cluster` : `# CLUSTER mode: driver on worker node (1 node reserved)`,
    ``,`# ── Parallelism & Shuffle ──`,
    `spark.default.parallelism                    ${c.para}`,
    `spark.sql.shuffle.partitions                 ${c.shufP}`,
    ``,`# ── Memory Management ──`,
    `spark.memory.fraction                        ${c.mf}`,
    `spark.memory.storageFraction                 ${c.sf}`,
    ``,`# ── AQE (Spark 3.x) ──`,
    `spark.sql.adaptive.enabled                   ${c.aqe}`,
    `spark.sql.adaptive.coalescePartitions.enabled  ${c.aqe}`,
    `spark.sql.adaptive.skewJoin.enabled          ${c.aqe}`,
    ...dynBlock,
    ``,`# ── Serialization & Network ──`,
    `spark.serializer                             org.apache.spark.serializer.KryoSerializer`,
    `spark.kryoserializer.buffer.max              512m`,
    `spark.network.timeout                        120s`,
    `spark.rpc.askTimeout                         120s`,
    ...(customBlock.length ? [``,`# ── Custom Properties (${customBlock.length}) ──`, ...customBlock] : []),
  ];
  document.getElementById('conf-out').textContent = lines.join('\n');
}

// ════════════════════════════════════════════
// PRE-ALLOC JOBS
// ════════════════════════════════════════════
function addPAJob() {
  const c = lastC;
  const id = 'pa_'+(++paCounter);
  const defExec = Math.max(1, Math.round((c.totalExec||10) * 0.1));
  preAllocJobs.push({id, name:`Reserved Job ${paCounter}`, execCount:defExec, execCores:c.execC||4, execMem:c.execM||8});
  renderPAJobs();
  updJobs();
}
function removePAJob(id) {
  preAllocJobs = preAllocJobs.filter(j=>j.id!==id);
  renderPAJobs(); updJobs();
}
function renderPAJobs() {
  const c = lastC;
  const container = document.getElementById('pa-list');
  if(preAllocJobs.length===0){
    container.innerHTML='<div style="color:var(--tx3);font-size:10px;text-align:center;padding:14px;border:1px dashed var(--bd);border-radius:7px;">No pre-allocated jobs. All resources available for parallel job planner.<br><strong style="color:var(--ac3);">+ Add Job</strong> to reserve resources for fixed/SLA pipelines.</div>';
    document.getElementById('pa-summary').style.display='none';
    return;
  }
  container.innerHTML = preAllocJobs.map((j,i)=>{
    const col = COLORS[i%COLORS.length];
    const jobCores = j.execCount * j.execCores;
    const jobMem = j.execCount * j.execMem;
    const totExec = c.totalExec||1;
    const execPct = Math.round((j.execCount/totExec)*100);
    return `<div class="paj" style="border-left:3px solid ${col};margin-bottom:10px;">
      <div class="pajt">
        <div style="display:flex;align-items:center;gap:7px;">
          <div style="width:9px;height:9px;border-radius:2px;background:${col};"></div>
          <input type="text" value="${j.name}" oninput="preAllocJobs[${i}].name=this.value;updJobs()" style="background:transparent;border:none;color:var(--tx);font-weight:700;font-size:12px;outline:none;padding:0;width:170px;border-bottom:1px dashed var(--bd);"/>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <span class="tag" style="background:${col}22;color:${col};border:1px solid ${col}44;">PRE-ALLOC</span>
          <button class="btn bd2 bsm" onclick="removePAJob('${j.id}')">✕</button>
        </div>
      </div>
      <!-- EXECUTOR COUNT -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px;">
        <div>
          <div style="font-size:9px;color:var(--tx3);margin-bottom:3px;text-transform:uppercase;letter-spacing:.5px;">Executors <i class="ii" style="font-size:8px;">i<span class="tt"><div class="ttt">Executors for this job</div>Number of executor JVMs reserved exclusively for this job. These are subtracted from total pool first.<div class="tbp">✦ Set to a fixed number for predictable SLA-bound jobs.</div></span></i></div>
          <div style="display:flex;align-items:center;gap:6px;">
            <input type="range" min="1" max="${Math.max(1,c.totalExec||10)}" value="${j.execCount}" oninput="preAllocJobs[${i}].execCount=+this.value;this.nextElementSibling.textContent=this.value;updJobs()" style="flex:1;margin-top:0;"/>
            <span style="font-family:'JetBrains Mono',monospace;font-size:12px;color:${col};font-weight:700;min-width:28px;">${j.execCount}</span>
          </div>
        </div>
        <div>
          <div style="font-size:9px;color:var(--tx3);margin-bottom:3px;text-transform:uppercase;letter-spacing:.5px;">Cores/Executor <i class="ii" style="font-size:8px;">i<span class="tt"><div class="ttt">spark.executor.cores for this job</div>CPU cores per executor for this specific job. May differ from global config if this job is lighter or heavier than average.<div class="tbp">✦ Inherit global value unless this job has different CPU requirements.</div></span></i></div>
          <input type="number" min="1" max="64" value="${j.execCores}" oninput="preAllocJobs[${i}].execCores=+this.value;updJobs()" style="height:32px;padding:5px 8px;font-size:11px;"/>
        </div>
        <div>
          <div style="font-size:9px;color:var(--tx3);margin-bottom:3px;text-transform:uppercase;letter-spacing:.5px;">Memory/Executor (GB) <i class="ii" style="font-size:8px;">i<span class="tt"><div class="ttt">spark.executor.memory for this job</div>Heap memory per executor for this specific job.<div class="tbp">✦ ML inference may need more; simple ETL can use less.</div></span></i></div>
          <input type="number" min="1" max="512" value="${j.execMem}" oninput="preAllocJobs[${i}].execMem=+this.value;updJobs()" style="height:32px;padding:5px 8px;font-size:11px;"/>
        </div>
      </div>
      <!-- ALLOCATION SUMMARY -->
      <div style="background:var(--sf3);border-radius:6px;padding:8px;display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;margin-bottom:8px;">
        <div style="text-align:center;"><div style="font-size:9px;color:var(--tx3);">Total Cores</div><div style="font-size:15px;font-weight:800;color:${col};font-family:'JetBrains Mono',monospace;">${jobCores}</div></div>
        <div style="text-align:center;"><div style="font-size:9px;color:var(--tx3);">Total Memory</div><div style="font-size:15px;font-weight:800;color:${col};font-family:'JetBrains Mono',monospace;">${jobMem}GB</div></div>
        <div style="text-align:center;"><div style="font-size:9px;color:var(--tx3);">Pool Share</div><div style="font-size:15px;font-weight:800;color:${col};font-family:'JetBrains Mono',monospace;">${execPct}%</div></div>
        <div style="text-align:center;"><div style="font-size:9px;color:var(--tx3);">Parallelism</div><div style="font-size:15px;font-weight:800;color:${col};font-family:'JetBrains Mono',monospace;">${jobCores*2}</div></div>
      </div>
      <!-- SPARK CONF FOR THIS JOB -->
      <div style="cursor:pointer;font-size:10px;color:var(--tx3);margin-bottom:4px;" onclick="const nb=this.nextElementSibling;const shown=nb.style.display!=='none';nb.style.display=shown?'none':'block';this.textContent=(shown?'▶ Show':'▼ Hide')+' spark-submit config'">▼ Hide spark-submit config</div>
      <div class="confblock" style="display:block;">
<span class="ck">--num-executors</span>  <span class="cv">${j.execCount}</span>
<span class="ck">--executor-cores</span> <span class="cv">${j.execCores}</span>
<span class="ck">--executor-memory</span> <span class="cv">${j.execMem}g</span>
<span class="ck">--conf spark.default.parallelism</span>=<span class="cv">${jobCores*2}</span>
<span class="ck">--conf spark.sql.shuffle.partitions</span>=<span class="cv">${jobCores*2}</span></div>
    </div>`;
  }).join('');

  // Summary
  const totExec = preAllocJobs.reduce((s,j)=>s+j.execCount,0);
  const totCores = preAllocJobs.reduce((s,j)=>s+j.execCount*j.execCores,0);
  const totMem = preAllocJobs.reduce((s,j)=>s+j.execCount*j.execMem,0);
  const pct = c.totalExec ? Math.round((totExec/c.totalExec)*100) : 0;
  document.getElementById('pa-summary').style.display='block';
  document.getElementById('pa-summary').innerHTML = `<hr><div class="sl">Pre-Allocation Summary</div>
    <div class="g3" style="margin-top:6px;gap:8px;">
      <div class="mc"><div class="ml">Executors Reserved</div><div class="mv cw2">${totExec}</div><div class="mu">${pct}% of pool</div></div>
      <div class="mc"><div class="ml">Cores Reserved</div><div class="mv cw2">${totCores}</div><div class="mu">task slots</div></div>
      <div class="mc"><div class="ml">Memory Reserved</div><div class="mv cw2">${totMem}GB</div><div class="mu">executor heap</div></div>
    </div>`;
}

// ════════════════════════════════════════════
// PARALLEL JOBS
// ════════════════════════════════════════════
function updJobs() {
  const c = lastC;
  if(!c.totalExec){ _doCompute(); return; }
  renderPAJobs();
  renderSchedConf();

  const numJ = parseInt(document.getElementById('numJobs')?.value)||2;
  document.getElementById('nj-val').textContent = numJ;

  // Pool totals — based on ACTUAL executor allocation (execM × count, NOT percentage)
  // poolMem = executor heap only (spark.executor.memory × total executors)
  // poolOH  = total overhead (memoryOverhead × total executors) — tracked separately
  const poolExec  = c.totalExec;
  const poolCores = c.totalEC;
  const poolMem   = Math.round(c.totalExec * c.execM);          // execM × executors
  const poolOH    = Math.round(c.totalExec * c.execOH / 1024);  // overhead pool
  const poolTotal = poolMem + poolOH;                            // total JVM memory

  // Pre-alloc deductions (absolute)
  const paDedExec = preAllocJobs.reduce((s,j)=>s+j.execCount,0);
  const paDedCores = preAllocJobs.reduce((s,j)=>s+j.execCount*j.execCores,0);
  const paDedMem = preAllocJobs.reduce((s,j)=>s+j.execCount*j.execMem,0);

  const remExec = Math.max(0, poolExec - paDedExec);
  const remCores = Math.max(0, poolCores - paDedCores);
  const remMem = Math.max(0, poolMem - paDedMem);

  // Update header metrics
  document.getElementById('jp-pexec').textContent = poolExec;
  document.getElementById('jp-pcores').textContent = poolCores;
  document.getElementById('jp-pmem').textContent = poolMem+' GB';
  document.getElementById('jp-poh').textContent = poolOH+' GB';
  const ptotal = document.getElementById('jp-ptotal');
  if(ptotal) ptotal.textContent = poolTotal+' GB';
  const pmd = document.getElementById('jp-pmem-detail');
  if(pmd) pmd.textContent = `${poolExec}×${c.execM}GB = ${poolMem}GB`;
  const pohd = document.getElementById('jp-poh-detail');
  if(pohd) pohd.textContent = `${poolExec}×${c.execOH}MB = ${poolOH}GB`;
  document.getElementById('jp-100c').textContent = remCores;
  document.getElementById('jp-100m').textContent = remMem;
  const ohTotalEl = document.getElementById('jp-oh-total');
  if(ohTotalEl) ohTotalEl.textContent = poolOH+' GB';
  const pacOHEl = document.getElementById('jp-pac-oh');
  if(pacOHEl) pacOHEl.textContent = Math.round(paDedExec * c.execOH / 1024)+' GB';
  const pjOHEl = document.getElementById('jp-pj-oh');
  if(pjOHEl) pjOHEl.textContent = '—';

  // Ensure parallelJobs matches numJ
  while(parallelJobs.length < numJ){ const id='pj_'+parallelJobs.length; parallelJobs.push({id,name:`Job ${parallelJobs.length+1}`,pct:Math.round(100/numJ)}); }
  while(parallelJobs.length > numJ) parallelJobs.pop();

  // Auto-balance non-manual pcts
  let manPctSum=0, manCnt=0;
  parallelJobs.forEach(j=>{if(jobPctOvr[j.id]){manPctSum+=j.pct;manCnt++;}});
  const autoTotal = Math.max(0, 100-manPctSum);
  const autoCnt = numJ - manCnt;
  parallelJobs.forEach(j=>{ if(!jobPctOvr[j.id]) j.pct = autoCnt>0 ? Math.round(autoTotal/autoCnt) : 0; });

  // Job overrides
  const jEC = gv('jExecC'), mpc = gv('memPerC');
  const enfJE = gc('enfJE'), enfJC = gc('enfJC');
  const minJE = Math.max(1, gv('minJE')), minJC = Math.max(1, gv('minJC'));

  // Compute allocs from remaining pool
  // EXECUTOR-FIRST: compute each job's floor share, then distribute leftover executors
  // round-robin to avoid wasting any executor when division is unequal.
  const execCoresForJob = jEC > 0 ? jEC : c.execC;

  // Base allocation — floor of each job's share
  const baseAllocs = parallelJobs.map(j => {
    const pct = j.pct / 100;
    let jobExec = Math.max(1, Math.floor(remExec * pct));
    if(enfJE) jobExec = Math.max(minJE, jobExec);
    return jobExec;
  });

  // Remainder distribution: leftover executors assigned one-by-one to jobs with largest fractional remainder
  const usedByBase = baseAllocs.reduce((s,v)=>s+v, 0);
  let leftover = Math.max(0, remExec - usedByBase);

  // Sort by fractional remainder descending to give extras to jobs that "deserved" more
  const fractions = parallelJobs.map((j,i) => ({
    i, frac: (remExec * j.pct/100) - Math.floor(remExec * j.pct/100)
  })).sort((a,b) => b.frac - a.frac);

  const finalExecs = [...baseAllocs];
  for(let k = 0; k < fractions.length && leftover > 0; k++) {
    finalExecs[fractions[k].i]++;
    leftover--;
  }

  const allocs = parallelJobs.map((j, idx) => {
    const pct = j.pct / 100;
    let jobExec = finalExecs[idx];

    // Concurrent tasks = executors × cores/executor (exact, no rounding error)
    let jobCores = jobExec * execCoresForJob;

    // Enforce min concurrent tasks if enabled
    if(enfJC && jobCores < minJC) {
      jobExec = Math.ceil(minJC / execCoresForJob);
      jobCores = jobExec * execCoresForJob;
    }

    // Memory — ALWAYS based on executor count × memory per executor (not pool %)
    // This ensures memory is predictable and derived from actual executor config.
    // mpc (memory per core) overrides execM; otherwise use global execM.
    let jobMemPerExec, jobMem;
    if(mpc > 0) {
      // Ratio mode: execMem = coresPerExec × GB-per-core
      jobMemPerExec = Math.round(execCoresForJob * mpc);
    } else {
      // Default: use global spark.executor.memory (execM) as-is
      jobMemPerExec = c.execM;
    }
    jobMem = jobExec * jobMemPerExec; // total heap = executors × heap/exec

    // Overhead — includes PySpark +1024MB if PySpark is enabled globally
    const jobOHPerExec = Math.max(384, Math.round(jobMemPerExec * 1024 * 0.1)) + (c.py ? 1024 : 0);
    const jobTotalMemPerExec = jobMemPerExec + Math.round(jobOHPerExec / 1024 * 10) / 10;
    const jobParallelism = jobCores * 2;
    const jobShuf = jobCores * 2;

    return {
      ...j,
      jobExec, jobCores, jobMem, jobMemPerExec,
      jobOHPerExec, jobTotalMemPerExec,
      execCoresForJob, jobParallelism, jobShuf, pct: j.pct,
      _rawExecFromPool: Math.floor(remExec * pct),
      _pct: pct
    };
  });

  // Validation
  const totalJobExec = allocs.reduce((s,j)=>s+j.jobExec,0);
  const totalJobCores = allocs.reduce((s,j)=>s+j.jobCores,0);
  const totalJobMem = allocs.reduce((s,j)=>s+j.jobMem,0);
  const remAfterJobs = {exec:remExec-totalJobExec, cores:remCores-totalJobCores, mem:remMem-totalJobMem};

  // Pct used
  const cUsedPct = remCores>0?Math.round((totalJobCores/remCores)*100):0;
  const mUsedPct = remMem>0?Math.round((totalJobMem/remMem)*100):0;
  const paCPct = poolCores>0?Math.round((paDedCores/poolCores)*100):0;
  const paMPct = poolMem>0?Math.round((paDedMem/poolMem)*100):0;

  document.getElementById('jp-pac-pct').textContent = paCPct+'%';
  document.getElementById('jp-pj-pct').textContent = cUsedPct+'% of remaining';
  document.getElementById('jp-rem-pct').textContent = Math.max(0,100-paCPct-cUsedPct)+'%';
  document.getElementById('jp-pac-mpct').textContent = paMPct+'%';
  document.getElementById('jp-pj-mpct').textContent = mUsedPct+'% of remaining';

  // Pool bars
  renderPoolBar('pb-cores','pl-cores', poolCores, paDedCores, allocs.map((j,i)=>({name:j.name,val:j.jobCores,col:COLORS[i%COLORS.length]})));
  renderPoolBar('pb-mem','pl-mem', poolMem, paDedMem, allocs.map((j,i)=>({name:j.name,val:j.jobMem,col:COLORS[i%COLORS.length]})));

  // Status message
  const st = document.getElementById('jp-status');
  const deficitParts = [];
  if(remAfterJobs.exec < 0) deficitParts.push(`${Math.abs(remAfterJobs.exec)} executor(s) short`);
  if(remAfterJobs.cores < 0) deficitParts.push(`${Math.abs(remAfterJobs.cores)} concurrent task slots short`);
  if(remAfterJobs.mem < 0) deficitParts.push(`${Math.abs(remAfterJobs.mem)}GB memory short`);

  if(deficitParts.length > 0){
    const fixSteps = [];
    if(enfJE && remAfterJobs.exec < 0) fixSteps.push(`• Lower "Min Executors per Job" to ${Math.max(1, Math.floor(remExec/numJ))} (pool ÷ jobs)`);
    if(remAfterJobs.cores < 0) fixSteps.push(`• Reduce job allocation sliders so total equals 100%`);
    fixSteps.push(`• Remove a pre-allocated job to free more resources`);
    fixSteps.push(`• Reduce concurrent job count from ${numJ} to ${Math.max(1,numJ-1)}`);
    st.innerHTML = `<div class="wi wie">
      ❌ <strong>Over-allocated: ${deficitParts.join(', ')}.</strong><br>
      The remaining pool cannot satisfy all jobs simultaneously.<br>
      <strong>Steps to fix:</strong><br>${fixSteps.join('<br>')}
    </div>`;
  } else if(remAfterJobs.exec > remExec*0.25 && remExec > 0){
    const unusedPct = Math.round((remAfterJobs.exec/remExec)*100);
    st.innerHTML = `<div class="wi wii">ℹ <strong>${unusedPct}% of the remaining pool is unallocated</strong> — ${remAfterJobs.exec} executors, ${remAfterJobs.cores} concurrent task slots, ${remAfterJobs.mem}GB heap.<br>Consider adding more parallel jobs or increasing the % sliders above to fully utilise the cluster.</div>`;
  } else {
    st.innerHTML = `<div class="wi wis">✓ Pool well-utilised. ${cUsedPct}% of remaining concurrent task capacity assigned across ${numJ} jobs.</div>`;
  }

  // Threshold check — plain English, no variable names
  if(enfJE){
    allocs.forEach(j=>{
      if(j.jobExec < minJE) {
        st.innerHTML += `<div class="wi wie">⚠ <strong>${j.name}</strong> received ${j.jobExec} executor${j.jobExec===1?'':'s'} but the minimum is ${minJE}. With ${j.jobExec} executor${j.jobExec===1?'':'s'}, the job has no fault tolerance. Either reduce the minimum or increase this job's % allocation.</div>`;
      }
    });
  }

  renderJobPctSliders(parallelJobs, allocs, remCores, remMem);
  renderJobCards(allocs, remCores, remMem);
  renderJobTrace(c, poolCores, poolMem, paDedCores, paDedMem, remCores, remMem, allocs);
  renderJobCharts(poolCores, poolMem, paDedCores, paDedMem, remCores, remMem, allocs);
  // Update jobs overhead total
  const jobOHTotalGB = allocs.reduce((s,j)=>s+Math.round(j.jobExec*j.jobOHPerExec/1024*10)/10,0);
  const pjOHEl2 = document.getElementById('jp-pj-oh');
  if(pjOHEl2) pjOHEl2.textContent = Math.round(jobOHTotalGB*10)/10+' GB';
  renderCapacitySummary(poolCores, poolMem, paDedCores, paDedMem, remCores, remMem, allocs, remExec);
  renderJobsConfBlocks();
  updateFieldHints();
  checkJobAlerts(allocs, remExec, remCores, remMem, minJE, minJC, enfJE, enfJC, numJ);
}

function renderCapacitySummary(poolC, poolM, paC, paM, remC, remM, allocs, remExec) {
  const c = lastC;
  const summary = document.getElementById('jp-capacity-summary');
  const grid = document.getElementById('jp-cap-grid');
  const bars = document.getElementById('jp-cap-bars');
  if(!summary||!grid||!bars) return;

  const usedExec  = allocs.reduce((s,j)=>s+j.jobExec ,0);
  const usedCores = allocs.reduce((s,j)=>s+j.jobCores,0);
  const usedMem   = allocs.reduce((s,j)=>s+j.jobMem  ,0);
  const usedOH    = allocs.reduce((s,j)=>s+Math.round(j.jobExec*j.jobOHPerExec/1024*10)/10, 0);

  const paExec = preAllocJobs.reduce((s,j)=>s+j.execCount,0);
  const unallExec  = Math.max(0, remExec  - usedExec );
  const unallCores = Math.max(0, remC     - usedCores);
  const unallMem   = Math.max(0, remM     - usedMem  );

  const execUtilPct  = remExec >0 ? Math.round(usedExec /remExec *100) : 0;
  const coreUtilPct  = remC    >0 ? Math.round(usedCores/remC    *100) : 0;
  const memUtilPct   = remM    >0 ? Math.round(usedMem  /remM    *100) : 0;

  summary.style.display = 'block';

  const statColor = pct => pct > 95 ? 'var(--da)' : pct > 80 ? 'var(--wa)' : pct < 40 ? '#a78bfa' : 'var(--ac3)';

  grid.innerHTML = [
    {lbl:'Parallel Job Executors', val:usedExec, sub:`of ${remExec} available`, pct:execUtilPct, col:statColor(execUtilPct)},
    {lbl:'Concurrent Tasks (all jobs)', val:usedCores, sub:`of ${remC} available`, pct:coreUtilPct, col:statColor(coreUtilPct)},
    {lbl:'Heap Allocated', val:usedMem+'GB', sub:`of ${remM}GB available`, pct:memUtilPct, col:statColor(memUtilPct)},
    {lbl:'Total Overhead', val:usedOH+'GB', sub:`off-heap all jobs`, pct:null, col:'var(--wa)'},
    {lbl:'Unallocated Tasks', val:unallCores, sub:`${unallExec} exec · ${unallMem}GB heap`, pct:null, col:'#1c2b4a' in []?'':'#a78bfa'},
    {lbl:'Pre-Alloc Reserved', val:paExec+' exec', sub:`${paC} tasks · ${paM}GB heap`, pct:null, col:'var(--wa)'},
  ].map(m=>`<div class="mc"><div class="ml">${m.lbl}</div><div class="mv" style="color:${m.col};">${m.val}</div><div class="mu">${m.sub}${m.pct!==null?` · <strong style="color:${m.col};">${m.pct}%</strong>`:''}</div></div>`).join('');

  // Capacity bars with absolute values
  bars.innerHTML = [
    {lbl:'Executors: Jobs vs Pre-Alloc vs Free', segs:[
      {lbl:`Jobs (${usedExec})`, val:usedExec, col:'var(--ac3)'},
      {lbl:`Pre-Alloc (${paExec})`, val:paExec, col:'#7c3aed'},
      {lbl:`Free (${unallExec})`, val:unallExec, col:'#1c2b4a'},
    ], total:c.totalExec},
    {lbl:'Concurrent Tasks: Jobs vs Pre-Alloc vs Free', segs:[
      {lbl:`Jobs (${usedCores})`, val:usedCores, col:'var(--ac3)'},
      {lbl:`Pre-Alloc (${paC})`, val:paC, col:'#7c3aed'},
      {lbl:`Free (${unallCores})`, val:unallCores, col:'#1c2b4a'},
    ], total:poolC},
    {lbl:'Memory (Heap): Jobs vs Pre-Alloc vs Free', segs:[
      {lbl:`Jobs (${usedMem}GB)`, val:usedMem, col:'var(--ac3)'},
      {lbl:`Pre-Alloc (${paM}GB)`, val:paM, col:'#7c3aed'},
      {lbl:`Free (${unallMem}GB)`, val:unallMem, col:'#1c2b4a'},
    ], total:poolM},
  ].map(bar=>{
    const segs = bar.segs.filter(s=>s.val>0).map(s=>{
      const pct = bar.total>0 ? Math.round(s.val/bar.total*100) : 0;
      return `<div class="pseg" style="width:${pct}%;background:${s.col};" title="${s.lbl} (${pct}%)">${pct>8?s.lbl:''}  </div>`;
    }).join('');
    const legend = bar.segs.map(s=>{
      const pct = bar.total>0?Math.round(s.val/bar.total*100):0;
      return `<div class="plgi"><div class="plgd" style="background:${s.col};"></div><span>${s.lbl} = ${pct}% of ${bar.total}</span></div>`;
    }).join('');
    return `<div class="ub" style="margin-bottom:10px;">
      <div class="ubl"><span>${bar.lbl}</span><span style="font-size:9px;">total: ${bar.total}</span></div>
      <div class="poolbar" style="margin-bottom:4px;">${segs}</div>
      <div class="pleg">${legend}</div>
    </div>`;
  }).join('');
}

function renderPoolBar(barId, legId, total, preAlloc, jobs) {
  const bar=document.getElementById(barId), leg=document.getElementById(legId);
  if(!bar||!leg) return;
  const segs = [];
  if(preAlloc>0) segs.push({lbl:'Pre-Alloc',val:preAlloc,col:'#475569'});
  jobs.forEach(j=>segs.push({lbl:j.name,val:j.val,col:j.col}));
  const used = segs.reduce((s,x)=>s+x.val,0);
  const avail = Math.max(0,total-used);
  if(avail>0) segs.push({lbl:'Available',val:avail,col:'#1c2b4a'});
  bar.innerHTML = segs.map(s=>{const p=Math.round((s.val/total)*100);return `<div class="pseg" style="width:${p}%;background:${s.col};" title="${s.lbl}: ${s.val} (${p}%)">${p>5?s.lbl+' '+p+'%':''}</div>`;}).join('');
  leg.innerHTML = segs.map(s=>{const p=Math.round((s.val/total)*100);return `<div class="plgi"><div class="plgd" style="background:${s.col};"></div><span>${s.lbl}: ${s.val} (${p}%)</span></div>`;}).join('');
}

function renderJobPctSliders(jobs, allocs, remCores, remMem) {
  const c = document.getElementById('job-pct-sliders');
  c.innerHTML = jobs.map((j,i)=>{
    const a=allocs[i], col=COLORS[i%COLORS.length];
    return `<div style="margin-bottom:9px;padding:9px;background:var(--sf2);border-radius:7px;border-left:3px solid ${col};">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;flex-wrap:wrap;gap:4px;">
        <span style="font-size:11px;font-weight:700;color:${col};">${j.name}</span>
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <span style="font-size:9px;color:var(--tx3);font-family:'JetBrains Mono',monospace;">${a.jobExec} exec · ${a.jobCores} cores · ${a.jobMem}GB</span>
          <span class="tag" style="background:${col}22;color:${col};border:1px solid ${col}44;">${j.pct}%</span>
          ${jobPctOvr[j.id]?`<button class="btn bo bsm" onclick="rstJobPct('${j.id}')" title="Reset to auto-balance">↺</button>`:''}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <input type="range" min="0" max="100" value="${j.pct}" oninput="setJobPct(${i},+this.value);this.nextElementSibling.textContent=this.value+'%'" style="flex:1;"/>
        <span style="min-width:32px;font-family:'JetBrains Mono',monospace;font-size:11px;color:${col};font-weight:700;">${j.pct}%</span>
      </div>
    </div>`;
  }).join('');
}

function setJobPct(idx,val) { const j=parallelJobs[idx]; jobPctOvr[j.id]=true; j.pct=val; updJobs(); }
function rstJobPct(id) { delete jobPctOvr[id]; updJobs(); }

function renderJobCards(allocs, remCores, remMem) {
  const mpc = gv('memPerC');
  const jEC = gv('jExecC');
  const remExecPool = Math.max(0, lastC.totalExec - preAllocJobs.reduce((s,j)=>s+j.execCount,0));
  const c = document.getElementById('job-cards');
  c.innerHTML = allocs.map((j,i)=>{
    const col=COLORS[i%COLORS.length];
    const execPct = remExecPool>0?Math.round((j.jobExec/remExecPool)*100):0;
    const corePct = remCores>0?Math.round((j.jobCores/remCores)*100):0;
    const memPct  = remMem>0 ?Math.round((j.jobMem /remMem )*100):0;
    const memSrc  = mpc>0 ? `ratio: ${j.execCoresForJob}c × ${mpc}GB/core` : `pool%: ${remMem}GB × ${j.pct}%`;
    const memMode = mpc>0
      ? `<span class="tag tw" style="font-size:8px;">ratio mode</span>`
      : `<span class="tag tc" style="font-size:8px;">pool % mode</span>`;
    const threshWarn = j.jobExec < (gv('minJE')||0) && gc('enfJE')
      ? `<div class="wi wie" style="margin-top:5px;font-size:9px;padding:5px 7px;">⚠ Below min executor threshold (${gv('minJE')})</div>` : '';
    const totalIncOH = Math.round((j.jobMem + j.jobExec*j.jobOHPerExec/1024)*10)/10;

    return `<div class="jpc" style="border-left-color:${col};margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px;flex-wrap:wrap;gap:4px;">
        <div style="display:flex;align-items:center;gap:6px;"><div style="width:8px;height:8px;border-radius:2px;background:${col};"></div><strong style="color:${col};font-size:11px;">${j.name}</strong></div>
        <div style="display:flex;align-items:center;gap:4px;">${memMode}<span class="sp sok" style="font-size:9px;">${j.pct}% of remaining</span></div>
      </div>

      <!-- PRIMARY METRICS ROW -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;margin-bottom:6px;">
        <div style="background:var(--sf3);border-radius:5px;padding:7px;text-align:center;" title="spark.executor.instances=${j.jobExec}">
          <div style="font-size:8px;color:var(--tx3);margin-bottom:2px;">Executors</div>
          <div style="font-size:16px;font-weight:800;color:${col};font-family:'JetBrains Mono',monospace;">${j.jobExec}</div>
          <div style="font-size:8px;color:var(--tx3);">${execPct}% of pool</div>
        </div>
        <div style="background:var(--sf3);border-radius:5px;padding:7px;text-align:center;" title="Concurrent Tasks = ${j.jobExec} executors × ${j.execCoresForJob} cores/executor = ${j.jobCores}">
          <div style="font-size:8px;color:var(--tx3);margin-bottom:2px;">Concurrent Tasks</div>
          <div style="font-size:16px;font-weight:800;color:${col};font-family:'JetBrains Mono',monospace;">${j.jobCores}</div>
          <div style="font-size:8px;color:var(--tx3);">${j.jobExec}×${j.execCoresForJob} cores/exec</div>
        </div>
        <div style="background:var(--sf3);border-radius:5px;padding:7px;text-align:center;" title="spark.executor.memory=${j.jobMemPerExec}g per executor">
          <div style="font-size:8px;color:var(--tx3);margin-bottom:2px;">Heap / Executor</div>
          <div style="font-size:16px;font-weight:800;color:${col};font-family:'JetBrains Mono',monospace;">${j.jobMemPerExec}<span style="font-size:8px;">GB</span></div>
          <div style="font-size:8px;color:var(--tx3);">spark.executor.memory</div>
        </div>
      </div>

      <!-- MEMORY BREAKDOWN ROW — with inline computation formulas -->
      <div style="background:var(--sf3);border-radius:5px;padding:8px;margin-bottom:6px;">
        <div style="font-size:9px;color:var(--tx2);margin-bottom:6px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;">Memory Breakdown <span style="color:var(--tx3);font-weight:400;text-transform:none;letter-spacing:0;">(heap = spark.executor.memory · overhead = off-heap, not in pool)</span></div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:5px;text-align:center;">
          <div style="background:rgba(0,212,255,.07);border:1px solid rgba(0,212,255,.2);border-radius:4px;padding:6px;">
            <div style="font-size:8px;color:var(--tx3);">Heap / Executor</div>
            <div style="font-size:15px;font-weight:800;color:var(--ac);font-family:'JetBrains Mono',monospace;">${j.jobMemPerExec}<span style="font-size:8px;">GB</span></div>
            <div style="font-size:8px;color:var(--tx3);margin-top:2px;">${mpc>0?`${j.execCoresForJob}c×${mpc}GB/c`:`global execMem`}</div>
          </div>
          <div style="background:rgba(245,158,11,.07);border:1px solid rgba(245,158,11,.2);border-radius:4px;padding:6px;">
            <div style="font-size:8px;color:var(--tx3);">Overhead / Exec</div>
            <div style="font-size:15px;font-weight:800;color:var(--wa);font-family:'JetBrains Mono',monospace;">${j.jobOHPerExec}<span style="font-size:8px;">MB</span></div>
            <div style="font-size:8px;color:var(--tx3);margin-top:2px;">max(384,10%×${j.jobMemPerExec}GB)</div>
          </div>
          <div style="background:rgba(0,212,255,.04);border:1px solid var(--bd);border-radius:4px;padding:6px;">
            <div style="font-size:8px;color:var(--tx3);">Total Heap</div>
            <div style="font-size:15px;font-weight:800;color:var(--ac);font-family:'JetBrains Mono',monospace;">${j.jobMem}<span style="font-size:8px;">GB</span></div>
            <div style="font-size:8px;color:var(--tx3);margin-top:2px;">${j.jobExec} exec × ${j.jobMemPerExec}GB</div>
          </div>
          <div style="background:rgba(16,185,129,.07);border:1px solid rgba(16,185,129,.2);border-radius:4px;padding:6px;">
            <div style="font-size:8px;color:var(--ac3);">Total incl. OH</div>
            <div style="font-size:15px;font-weight:800;color:var(--ac3);font-family:'JetBrains Mono',monospace;">${totalIncOH}<span style="font-size:8px;">GB</span></div>
            <div style="font-size:8px;color:var(--tx3);margin-top:2px;">${j.jobMem}GB + ${Math.round(j.jobExec*j.jobOHPerExec/1024*10)/10}GB OH</div>
          </div>
        </div>
      </div>

      <!-- SPARK CONF INLINE -->
      <div style="font-size:9px;font-family:'JetBrains Mono',monospace;background:rgba(0,0,0,.3);border:1px solid var(--bd);border-radius:5px;padding:7px;margin-bottom:6px;line-height:1.9;">
        <span style="color:var(--ac2);">spark.executor.instances</span>=<span style="color:var(--ac3);">${j.jobExec}</span> &nbsp;
        <span style="color:var(--ac2);">spark.executor.cores</span>=<span style="color:var(--ac3);">${j.execCoresForJob}</span><br>
        <span style="color:var(--ac2);">spark.executor.memory</span>=<span style="color:var(--ac3);">${j.jobMemPerExec}g</span> &nbsp;
        <span style="color:var(--ac2);">spark.executor.memoryOverhead</span>=<span style="color:var(--ac3);">${j.jobOHPerExec}m</span><br>
        <span style="color:var(--ac2);">spark.default.parallelism</span>=<span style="color:var(--ac3);">${j.jobParallelism}</span> &nbsp;
        <span style="color:var(--ac2);">spark.sql.shuffle.partitions</span>=<span style="color:var(--ac3);">${j.jobShuf}</span>
      </div>

      <!-- POOL SHARE BARS -->
      <div style="margin-bottom:3px;">
        <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--tx3);margin-bottom:2px;">
          <span>Executors: ${j.jobExec} of ${remExecPool} available</span><span>${execPct}% of pool</span>
        </div>
        <div class="ubtr"><div class="ubf" style="width:${execPct}%;background:${col};"></div></div>
      </div>
      <div style="margin-bottom:3px;">
        <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--tx3);margin-bottom:2px;">
          <span>Concurrent Tasks: ${j.jobCores} of ${remCores} cores</span><span>${corePct}% of remaining</span>
        </div>
        <div class="ubtr"><div class="ubf" style="width:${corePct}%;background:${col}cc;"></div></div>
      </div>
      <div>
        <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--tx3);margin-bottom:2px;">
          <span>Heap Memory: ${j.jobMem}GB of ${remMem}GB remaining (${memSrc})</span><span>${memPct}%</span>
        </div>
        <div class="ubtr"><div class="ubf" style="width:${memPct}%;background:${col}66;"></div></div>
      </div>
      ${threshWarn}
    </div>`;
  }).join('');
}

function renderJobTrace(c, poolC, poolM, paC, paM, remC, remM, allocs) {
  const mpc = gv('memPerC'), jEC = gv('jExecC');
  const remExecPool = Math.max(0, c.totalExec - preAllocJobs.reduce((s,j)=>s+j.execCount,0));

  // Fixed header steps
  const headerSteps = [
    {k:'Pool — Total Executors',    f:`${c.totalExec} total executors in cluster`,                    r:`${c.totalExec} executors available`},
    {k:'Pool — Total Cores',        f:`${c.totalExec} exec × ${c.execC} cores/exec`,                  r:`${poolC} concurrent tasks total`},
    {k:'Pool — Total Memory (heap)',f:`${c.totalExec} exec × ${c.execM}GB/exec`,                      r:`${poolM}GB total executor heap`},
    {k:'Pre-Alloc Deduction (Exec)',f: preAllocJobs.length ? preAllocJobs.map(j=>`${j.name}: ${j.execCount} exec`).join(' + ') : 'None', r:`−${preAllocJobs.reduce((s,j)=>s+j.execCount,0)} executors reserved`},
    {k:'Pre-Alloc Deduction (Cores)',f: preAllocJobs.length ? preAllocJobs.map(j=>`${j.name}: ${j.execCount}×${j.execCores}=${j.execCount*j.execCores}`).join(' + ') : 'None', r:`−${paC} cores reserved`},
    {k:'Pre-Alloc Deduction (Mem)', f: preAllocJobs.length ? preAllocJobs.map(j=>`${j.name}: ${j.execCount}×${j.execMem}GB=${j.execCount*j.execMem}GB`).join(' + ') : 'None', r:`−${paM}GB reserved`},
    {k:'Remaining Pool = 100% Baseline', f:`${c.totalExec} − ${preAllocJobs.reduce((s,j)=>s+j.execCount,0)} pre-alloc`, r:`${remExecPool} executors · ${remC} cores · ${remM}GB — this is 100% for job sliders`},
  ];

  // Per-job steps grouped
  const jobSteps = allocs.flatMap((j,i)=>{
    const rawExec = j._rawExecFromPool;
    const enfJEOn = gc('enfJE'), enfJCOn = gc('enfJC');
    const minJEVal = Math.max(1,gv('minJE')), minJCVal = Math.max(1,gv('minJC'));
    const wasRaisedExec = enfJEOn && rawExec < minJEVal;
    const totalOH = j.jobExec * j.jobOHPerExec;

    return [
      {k:`[${j.name}] STEP 1 — Executor Allocation`,
       f:`floor(${remExecPool} pool × ${j.pct}%) = ${rawExec} base` +
         (j.jobExec > rawExec && wasRaisedExec ? ` → raised to min-floor ${minJEVal}` :
          j.jobExec > rawExec ? ` + 1 remainder (fractional share ≥ others)` : '') +
         (j.jobExec === rawExec && !wasRaisedExec ? ` (no remainder assigned)` : ''),
       r:`${j.jobExec} executors`},
      {k:`[${j.name}] STEP 2 — Concurrent Tasks`,
       f:`${j.jobExec} executors × ${j.execCoresForJob} cores/executor${jEC>0?' (override)':' (global config)'}`,
       r:`${j.jobCores} concurrent tasks (this is the max tasks running at once)`},
      {k:`[${j.name}] STEP 3 — Memory per Executor`,
       f: mpc>0
         ? `${j.execCoresForJob} cores/exec × ${mpc}GB/core (ratio mode)`
         : `floor(${remM}GB × ${j.pct}%) = ${Math.floor(remM*j._pct)}GB total ÷ ${j.jobExec} exec`,
       r:`${j.jobMemPerExec}GB heap per executor  [spark.executor.memory=${j.jobMemPerExec}g]`},
      {k:`[${j.name}] STEP 4 — Memory Overhead`,
       f:`max(384MB, 10% × ${j.jobMemPerExec}GB = ${Math.round(j.jobMemPerExec*1024*0.1)}MB)${c.py?' + 1024MB PySpark worker process':''}`,
       r:`${j.jobOHPerExec}MB off-heap per executor  [spark.executor.memoryOverhead=${j.jobOHPerExec}m]${c.py?' ← includes PySpark overhead':''}`},
      {k:`[${j.name}] STEP 5 — Total Heap (all executors)`,
       f:`${j.jobExec} exec × ${j.jobMemPerExec}GB/exec`,
       r:`${j.jobMem}GB executor heap  (excl. overhead)`},
      {k:`[${j.name}] STEP 6 — Total Memory incl. Overhead`,
       f:`${j.jobMem}GB heap + ${Math.round(totalOH/1024*10)/10}GB overhead`,
       r:`${Math.round((j.jobMem + totalOH/1024)*10)/10}GB total JVM memory for this job`},
      {k:`[${j.name}] STEP 7 — Parallelism`,
       f:`${j.jobCores} concurrent tasks × 2 (standard factor)`,
       r:`${j.jobParallelism} spark.default.parallelism · ${j.jobShuf} spark.sql.shuffle.partitions`},
    ];
  });

  const steps = [...headerSteps, ...jobSteps];
  const colors = {header:'var(--tx3)', job:'var(--ac3)'};

  document.getElementById('jtr-content').innerHTML = steps.map((s,i)=>{
    const isJob = s.k.startsWith('[');
    const stepColor = isJob ? 'var(--ac3)' : 'var(--tx3)';
    return `<div class="trl">
      <span style="color:${stepColor};font-weight:700;">STEP ${String(i+1).padStart(2,'0')}</span>
      <span class="trk"> — ${s.k}:</span>&nbsp;
      <span class="trf">${s.f}</span>&nbsp;
      <span style="color:var(--tx3);">→</span>&nbsp;
      <span class="trr">${s.r}</span>
    </div>`;
  }).join('');
}

// ════════════════════════════════════════════
// CHARTS
// ════════════════════════════════════════════
function dk(id){if(charts[id]){charts[id].destroy();delete charts[id];}}
const CD={responsive:true,maintainAspectRatio:true,plugins:{legend:{labels:{color:'#94a3b8',font:{family:'JetBrains Mono',size:10}}},tooltip:{backgroundColor:'#040a14',borderColor:'#1e3a5f',borderWidth:1,titleColor:'#00d4ff',bodyColor:'#e2e8f0',padding:10}}};

function renderCharts() {
  const c = lastC;
  if(!c.nodes) return;
  document.getElementById('vz-tmem').textContent = c.totalRAM+'GB';
  document.getElementById('vz-tcores').textContent = c.totalCores;

  // Memory doughnut
  dk('ch-mem');
  const execHeap=Math.round(c.totalExec*c.execM), execOHGB=Math.round(c.totalExec*c.execOH/1024);
  const drvMem=c.deployMode==='cluster'?c.drvM:0, res=Math.round(c.reserveRAM), unused=Math.max(0,Math.round(c.unusedRAM));
  charts['ch-mem']=new Chart(document.getElementById('ch-mem'),{type:'doughnut',data:{labels:['Executor Heap','Mem Overhead','Driver (cluster)','OS+RM Reserves','Unused'],datasets:[{data:[execHeap,execOHGB,drvMem,res,unused],backgroundColor:['#00d4ff','#7c3aed','#f59e0b','#1c2b4a','#0f1825'],borderColor:'#0f1824',borderWidth:2}]},options:{...CD,cutout:'62%',plugins:{...CD.plugins,tooltip:{...CD.plugins.tooltip,callbacks:{label:x=>`${x.label}: ${x.raw}GB (${Math.round(x.raw/c.totalRAM*100)}% of ${c.totalRAM}GB total)`}}}}});

  // Cores bar
  dk('ch-cores');
  const execCoresUsed=c.totalEC, drvCores=c.deployMode==='cluster'?c.drvC:0, osRes=c.nodes*c.osCR, unused2=Math.max(0,c.unusedCores);
  charts['ch-cores']=new Chart(document.getElementById('ch-cores'),{type:'bar',data:{labels:['Executor Cores','Driver (cluster)','OS Reserved','Unused'],datasets:[{label:'Cores',data:[execCoresUsed,drvCores,osRes,unused2],backgroundColor:['#00d4ff','#f59e0b','#1c2b4a','#0f1825'],borderRadius:5}]},options:{...CD,scales:{x:{ticks:{color:'#475569'},grid:{color:'#1c2b4a'}},y:{ticks:{color:'#475569'},grid:{color:'#1c2b4a'}}},plugins:{...CD.plugins,tooltip:{...CD.plugins.tooltip,callbacks:{label:x=>`${x.label}: ${x.raw} cores (${Math.round(x.raw/c.totalCores*100)}% of ${c.totalCores} total)`}}}}});

  // Util detail block
  document.getElementById('vz-util-nums').innerHTML=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;"><div class="mc"><div class="ml">CPU: Used vs Total</div><div class="mv" style="color:${c.coreUtil>95?'var(--da)':c.coreUtil>80?'var(--wa)':'var(--ac)'};">${c.clusterUsedCores} / ${c.totalCores}</div><div class="mu">${c.coreUtil}% utilization · ${c.unusedCores} cores unused</div></div><div class="mc"><div class="ml">RAM: Used vs Total</div><div class="mv" style="color:${c.memUtil>95?'var(--da)':c.memUtil>80?'var(--wa)':'var(--ac2)'};">${Math.round(c.clusterUsedRAM)} / ${c.totalRAM}GB</div><div class="mu">${c.memUtil}% utilization · ${Math.round(c.unusedRAM)}GB unused</div></div></div>`;

  // Util stacked horizontal
  dk('ch-util');
  const cu=c.coreUtil>95?'#ef4444':c.coreUtil>80?'#f59e0b':'#00d4ff';
  const mu=c.memUtil>95?'#ef4444':c.memUtil>80?'#f59e0b':'#7c3aed';
  charts['ch-util']=new Chart(document.getElementById('ch-util'),{type:'bar',data:{labels:['CPU Cores','Memory (GB)'],datasets:[{label:'Used',data:[c.clusterUsedCores,Math.round(c.clusterUsedRAM)],backgroundColor:[cu,mu],borderRadius:4},{label:'Available',data:[c.unusedCores,Math.round(c.unusedRAM)],backgroundColor:['#1c2b4a','#162038'],borderRadius:4}]},options:{...CD,indexAxis:'y',scales:{x:{stacked:true,ticks:{color:'#475569'},grid:{color:'#1c2b4a'}},y:{stacked:true,ticks:{color:'#475569'},grid:{display:false}}},plugins:{...CD.plugins,tooltip:{...CD.plugins.tooltip,callbacks:{label:x=>`${x.dataset.label}: ${x.raw} ${x.label==='CPU Cores'?'cores':'GB'} (${Math.round(x.raw/(x.label==='CPU Cores'?c.totalCores:c.totalRAM)*100)}%)`}}}}});

  // Exec mem stack — enriched with formula context; PySpark overhead shown separately
  dk('ch-execmem');
  const baseOH = Math.max(384, Math.round(c.execM*1024*0.1)) / 1024; // base JVM overhead GB
  const pyOH = c.py ? 1.0 : 0; // PySpark adds +1GB overhead
  const execTotal = c.execM + Math.round(c.execOH/1024*10)/10;
  const execHeapMemFrac = Math.round(c.execM*c.mf*(1-c.sf));
  const execStorageFrac = Math.round(c.execM*c.mf*c.sf);
  const execUserFrac = Math.round(c.execM*(1-c.mf));
  const execDatasets = [
    {label:`Execution Mem (${execHeapMemFrac}GB) — shuffle/sort/aggregations · spills to disk if exceeded`,data:[execHeapMemFrac],backgroundColor:'#00d4ff',borderRadius:4},
    {label:`Storage Mem (${execStorageFrac}GB) — cached RDDs/DataFrames · evicted by execution when needed`,data:[execStorageFrac],backgroundColor:'#7c3aed',borderRadius:4},
    {label:`User Mem (${execUserFrac}GB) — UDFs, broadcast vars, Spark internal metadata`,data:[execUserFrac],backgroundColor:'#1c2b4a',borderRadius:4},
    {label:`JVM Overhead (${baseOH.toFixed(2)}GB) — metaspace, native libs, JVM strings · off-heap`,data:[Math.round(baseOH*100)/100],backgroundColor:'#f59e0b',borderRadius:4},
  ];
  if (c.py) {
    execDatasets.push({label:`PySpark Overhead (+${pyOH}GB) — Python worker process memory · off-heap · not in JVM heap`,data:[pyOH],backgroundColor:'#ec4899',borderRadius:4});
  }
  charts['ch-execmem']=new Chart(document.getElementById('ch-execmem'),{type:'bar',data:{labels:[`Per Executor — Total JVM: ${execTotal.toFixed(1)}GB${c.py?' (incl. '+pyOH+'GB PySpark OH)':''}`],datasets:execDatasets},options:{...CD,scales:{x:{stacked:true,ticks:{color:'#475569'},grid:{display:false}},y:{stacked:true,ticks:{color:'#475569'},grid:{color:'#1c2b4a'},title:{display:true,text:'GB',color:'#475569'}}},plugins:{...CD.plugins,tooltip:{...CD.plugins.tooltip,callbacks:{label:x=>`${x.dataset.label.split('—')[0].trim()}: ${x.raw}GB (${Math.round(x.raw/execTotal*100)}% of total JVM)`}}}}});

  // Scaling
  dk('ch-scale');
  const nr=Array.from({length:Math.min(20,c.nodes)},(_,i)=>i+1);
  charts['ch-scale']=new Chart(document.getElementById('ch-scale'),{type:'line',data:{labels:nr.map(n=>n+'n'),datasets:[{label:'Executors',data:nr.map(n=>(c.deployMode==='cluster'?Math.max(1,n-1):n)*c.execPN),borderColor:'#00d4ff',backgroundColor:'rgba(0,212,255,.1)',tension:.4,fill:true},{label:'Concurrent Tasks',data:nr.map(n=>(c.deployMode==='cluster'?Math.max(1,n-1):n)*c.execPN*c.execC),borderColor:'#7c3aed',tension:.4,fill:false},{label:'Parallelism÷10 (= concTasks×2÷10, scaled for readability)',data:nr.map(n=>Math.round((c.deployMode==='cluster'?Math.max(1,n-1):n)*c.execPN*c.execC*2/10)),borderColor:'#f59e0b',tension:.4,fill:false,borderDash:[4,4]}]},options:{...CD,scales:{x:{ticks:{color:'#475569'},grid:{color:'#1c2b4a'}},y:{ticks:{color:'#475569'},grid:{color:'#1c2b4a'}}},plugins:{...CD.plugins,tooltip:{...CD.plugins.tooltip,callbacks:{label:x=>`${x.dataset.label.split('(')[0].trim()}: ${x.raw}${x.datasetIndex===2?' (×10 = '+x.raw*10+' real parallelism)':''}`}}}}});

  // Full breakdown
  const bd={eh:Math.round(c.totalExec*c.execM),oh:Math.round(c.totalExec*c.execOH/1024),dr:c.deployMode==='cluster'?c.drvM:0,rs:Math.round(c.reserveRAM),un:Math.max(0,Math.round(c.unusedRAM))};
  document.getElementById('vz-breakdown').innerHTML=`<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;font-size:10px;">${[['Exec Heap','#00d4ff',bd.eh],['Overhead','#7c3aed',bd.oh],['Driver (cluster)','#f59e0b',bd.dr],['Reserves','#1c2b4a',bd.rs],['Unused','#0f1825',bd.un]].map(([l,col,v])=>`<div style="background:${col}18;border:1px solid ${col}33;border-radius:5px;padding:7px;text-align:center;"><div style="color:${col};font-weight:800;font-size:14px;font-family:'JetBrains Mono',monospace;">${v}GB</div><div style="color:var(--tx3);margin-top:2px;">${l}</div><div style="color:var(--tx2);">${Math.round(v/c.totalRAM*100)}%</div></div>`).join('')}</div>`;
  dk('ch-full');
  charts['ch-full']=new Chart(document.getElementById('ch-full'),{type:'bar',data:{labels:['Cluster Memory (GB)'],datasets:[{label:`Exec Heap (${bd.eh}GB)`,data:[bd.eh],backgroundColor:'#00d4ff',borderRadius:3},{label:`Overhead (${bd.oh}GB)`,data:[bd.oh],backgroundColor:'#7c3aed',borderRadius:3},{label:`Driver (${bd.dr}GB)`,data:[bd.dr],backgroundColor:'#f59e0b',borderRadius:3},{label:`Reserves (${bd.rs}GB)`,data:[bd.rs],backgroundColor:'#264878',borderRadius:3},{label:`Unused (${bd.un}GB)`,data:[bd.un],backgroundColor:'#0f1825',borderRadius:3}]},options:{...CD,indexAxis:'y',scales:{x:{stacked:true,ticks:{color:'#475569'},grid:{color:'#1c2b4a'}},y:{stacked:true,ticks:{color:'#475569'},grid:{display:false}}},plugins:{...CD.plugins,tooltip:{...CD.plugins.tooltip,callbacks:{label:x=>`${x.dataset.label}: ${x.raw}GB (${Math.round(x.raw/lastC.totalRAM*100)}%)`}}}}});

  // Dev insights panel
  const ins = document.getElementById('vz-dev-insights');
  if(ins) {
    const execMem = c.execM, mf = c.mf, sf = c.sf;
    const usedHeap = Math.round(execMem*mf);
    const execGB = Math.round(execMem*mf*(1-sf)), storGB = Math.round(execMem*mf*sf), userGB = Math.round(execMem*(1-mf));
    const memRatio = c.execC > 0 ? (execMem/c.execC).toFixed(1) : '—';
    ins.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
        <div style="background:var(--sf2);border-radius:7px;padding:10px;">
          <div class="sl" style="margin:0 0 6px;">Memory Fraction — Step-by-Step</div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:10px;line-height:2;">
            <span style="color:var(--tx3);">① heap = spark.executor.memory</span> = <span style="color:var(--ac);">${execMem}GB</span><br>
            <span style="color:var(--tx3);">② managed = heap × memFraction</span> = ${execMem} × ${mf} = <span style="color:var(--ac3);">${usedHeap}GB</span><br>
            <span style="color:var(--tx3);">③ execution = managed × (1−storageFrac)</span> = ${usedHeap} × ${(1-sf).toFixed(2)} = <span style="color:var(--ac);">${execGB}GB</span><br>
            <span style="color:var(--tx3);">④ storage = managed × storageFrac</span> = ${usedHeap} × ${sf} = <span style="color:var(--ac2);">${storGB}GB</span><br>
            <span style="color:var(--tx3);">⑤ user = heap × (1−memFraction)</span> = ${execMem} × ${(1-mf).toFixed(2)} = <span style="color:var(--tx2);">${userGB}GB</span><br>
            <span style="color:var(--tx3);">⑥ overhead = max(384MB, 10%×heap)</span> = <span style="color:var(--wa);">${c.execOH}MB</span>${c.py?' <span style="color:var(--pk);">+1024MB PySpark</span>':''}
          </div>
        </div>
        <div style="background:var(--sf2);border-radius:7px;padding:10px;">
          <div class="sl" style="margin:0 0 6px;">Key Ratios</div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:10px;line-height:2;">
            Memory / Core  = <span style="color:var(--wa);">${memRatio} GB/core</span><br>
            Executors/Node = <span style="color:var(--ac3);">${c.execPN}</span><br>
            Concur. Tasks  = <span style="color:var(--ac);">${c.totalEC}</span><br>
            Parallelism    = <span style="color:var(--ac);">${c.para}</span> (${(c.para/Math.max(1,c.totalEC)).toFixed(1)}× tasks)<br>
            Core Util      = <span style="${c.coreUtil>80?'color:var(--wa)':'color:var(--ac3);'}">${c.coreUtil}%</span><br>
            RAM Util       = <span style="${c.memUtil>80?'color:var(--wa)':'color:var(--ac3);'}">${c.memUtil}%</span>
          </div>
        </div>
        <div style="background:var(--sf2);border-radius:7px;padding:10px;">
          <div class="sl" style="margin:0 0 6px;">Spark UI Tuning Hints</div>
          <div style="font-size:10px;line-height:1.9;">
            <span style="color:var(--tx3);">Stages → Task Summary:</span><br>
            GC &gt;10% → ↓ executor memory<br>
            Spill &gt;0 → ↑ execution memory<br>
            Skew tasks → enable AQE<br>
            <span style="color:var(--tx3);">Storage tab:</span><br>
            Cache evictions → ↑ storageFraction<br>
            Low cache hit → ↑ executor memory<br>
            <span style="color:var(--tx3);">Executors tab:</span><br>
            GC% column → tune heap size
          </div>
        </div>
      </div>`;
  }
}

function renderJobCharts(pC, pM, paC, paM, remC, remM, allocs) {
  const labels = allocs.map(j=>j.name);
  const cols = allocs.map((_,i)=>COLORS[i%COLORS.length]);
  const c = lastC;

  dk('ch-jobs');
  // Build datasets: pre-alloc, per-job cores+mem, plus PySpark OH if enabled
  const jobDatasets = allocs.map((j,i)=>({
    label:`${j.name} (${j.jobCores} tasks · ${j.jobMem}GB heap · ${Math.round(j.jobExec*j.jobOHPerExec/1024*10)/10}GB OH)`,
    data:[j.jobCores, j.jobMem, Math.round(j.jobExec*j.jobOHPerExec/1024*10)/10],
    backgroundColor:COLORS[i%COLORS.length],borderRadius:3
  }));
  const chartLabels = c.py
    ? ['Cores (task slots)','Heap Memory (GB)','Overhead GB (JVM+PySpark)']
    : ['Cores (task slots)','Heap Memory (GB)','Overhead (GB)'];

  charts['ch-jobs']=new Chart(document.getElementById('ch-jobs'),{type:'bar',data:{labels:chartLabels,datasets:[
    {label:`Pre-Allocated (${paC} cores · ${paM}GB heap)`,data:[paC,paM,Math.round(preAllocJobs.reduce((s,j)=>s+(Math.max(384,Math.round(j.execMem*1024*0.1))+(c.py?1024:0))*j.execCount/1024,0)*10)/10],backgroundColor:'#47556988',borderRadius:3},
    ...allocs.map((j,i)=>({label:`${j.name} (${j.jobExec} exec)`,data:[j.jobCores,j.jobMem,Math.round(j.jobExec*j.jobOHPerExec/1024*10)/10],backgroundColor:COLORS[i%COLORS.length],borderRadius:3})),
    {label:'Remaining Unused',data:[Math.max(0,remC-allocs.reduce((s,j)=>s+j.jobCores,0)),Math.max(0,remM-allocs.reduce((s,j)=>s+j.jobMem,0)),0],backgroundColor:'#1c2b4a',borderRadius:3},
  ]},options:{...CD,scales:{x:{stacked:true,ticks:{color:'#475569'},grid:{display:false}},y:{stacked:true,ticks:{color:'#475569'},grid:{color:'#1c2b4a'}}},plugins:{...CD.plugins,tooltip:{...CD.plugins.tooltip,callbacks:{title:ctx=>`${ctx[0].label}`,label:x=>`${x.dataset.label}: ${x.raw}${x.label.includes('Cores')?'':' GB'} (${Math.round(x.raw/(x.label.includes('Cores')?pC:pM)*100)}%)`}}}}});

  dk('ch-jobs2');
  charts['ch-jobs2']=new Chart(document.getElementById('ch-jobs2'),{type:'bar',data:{labels,datasets:[
    {label:'Concurrent Tasks (= exec × cores)',data:allocs.map(j=>j.jobCores),backgroundColor:cols.map(c=>c+'cc'),borderRadius:4,yAxisID:'y'},
    {label:'Memory (GB)',data:allocs.map(j=>j.jobMem),backgroundColor:cols.map(c=>c+'55'),borderRadius:4,yAxisID:'y1'},
    {label:'Executors',data:allocs.map(j=>j.jobExec),type:'line',borderColor:'#00d4ff',backgroundColor:'transparent',tension:.3,pointBackgroundColor:cols,pointRadius:5,yAxisID:'y'},
  ]},options:{...CD,scales:{x:{ticks:{color:'#475569'},grid:{display:false}},y:{position:'left',ticks:{color:'#475569'},grid:{color:'#1c2b4a'},title:{display:true,text:'Cores / Executors',color:'#475569'}},y1:{position:'right',ticks:{color:'#475569'},grid:{display:false},title:{display:true,text:'Memory (GB)',color:'#475569'}}},plugins:{...CD.plugins,tooltip:{...CD.plugins.tooltip,callbacks:{label:x=>`${x.dataset.label}: ${x.raw}${x.dataset.label.includes('Memory')?' GB':x.dataset.label.includes('Cores')?' cores':' executors'}`}}}}});
}

// ════════════════════════════════════════════
// AUTO-COMPUTE JOB THRESHOLDS
// ════════════════════════════════════════════
function autoComputeJobThresholds() {
  const c = lastC;
  if(!c.totalExec) return;
  const numJ = parseInt(document.getElementById('numJobs')?.value)||2;
  const paDedExec = preAllocJobs.reduce((s,j)=>s+j.execCount,0);
  const remExec = Math.max(1, c.totalExec - paDedExec);
  const jEC = gv('jExecC') || c.execC || 4;

  // Recommended: half of fair-share per job (ensures all jobs can run simultaneously)
  const fairShareExec = Math.floor(remExec / numJ);
  const suggestedMinExec = Math.max(1, Math.floor(fairShareExec / 2));
  const suggestedMinCores = Math.max(1, suggestedMinExec * jEC);

  // Update fields
  const minJEEl = document.getElementById('minJE');
  const minJCEl = document.getElementById('minJC');
  if(minJEEl) { minJEEl.value = suggestedMinExec; minJEEl.classList.add('iauto'); }
  if(minJCEl) { minJCEl.value = suggestedMinCores; minJCEl.classList.add('iauto'); }

  // Show what was computed
  const hint = `Auto-computed: ${remExec} rem. executors ÷ ${numJ} jobs ÷ 2 = ${suggestedMinExec} min executors, ${suggestedMinCores} min tasks`;
  showAlert('⚡','Auto-Compute Applied',hint,`Min executors set to ${suggestedMinExec} (half of fair-share ${fairShareExec})\nMin concurrent tasks set to ${suggestedMinCores} (${suggestedMinExec} exec × ${jEC} cores/exec)\n\nAdjust manually if your jobs have different priority levels.`);
  updJobs();
}

// ════════════════════════════════════════════
// JOB OVERLOAD POPUP LOGIC
// ════════════════════════════════════════════
let _lastJobAlertKey = '';
function checkJobAlerts(allocs, remExec, remCores, remMem, minJE, minJC, enfJE, enfJC, numJ) {
  if(!gc('popupsEnabled')) return;
  const violations = [];
  if(enfJE) allocs.forEach(j=>{ if(j.jobExec < minJE) violations.push(`${j.name}: only ${j.jobExec} executor${j.jobExec===1?'':'s'} (needs ${minJE})`); });
  if(enfJC) allocs.forEach(j=>{ if(j.jobCores < minJC) violations.push(`${j.name}: only ${j.jobCores} concurrent tasks (needs ${minJC})`); });
  const totalNeedExec = numJ * minJE;
  const overloadExec = enfJE && remExec < totalNeedExec;
  const overloadCores = enfJC && remCores < numJ * minJC;

  let alertKey = violations.join('|')+(overloadExec?'OE':'')+(overloadCores?'OC':'');
  if(alertKey === _lastJobAlertKey) return;
  _lastJobAlertKey = alertKey;

  if(overloadExec) {
    showAlert('⚠️','Pool Too Small for Minimum Executor Settings',
      `${numJ} concurrent jobs × ${minJE} minimum executors each = ${totalNeedExec} executors needed, but only ${remExec} executors remain in the pool after pre-allocated jobs.`,
      `Option 1: Lower "Min Executors per Job" to ${Math.floor(remExec/numJ)} (= available ÷ jobs)\nOption 2: Reduce concurrent job count from ${numJ} to ${Math.floor(remExec/minJE)}\nOption 3: Remove a pre-allocated job to release more executors\nOption 4: Turn OFF the min executor enforcement toggle`);
  } else if(violations.length > 0) {
    showAlert('⚠️','Minimum Executor Threshold Breached',
      `${violations.length} job(s) received fewer executors than the minimum:\n${violations.join('\n')}`,
      `Option 1: Click "⚡ Auto-compute Minimums" for feasible thresholds\nOption 2: Lower "Min Executors per Job"\nOption 3: Increase that job's % allocation slider\nOption 4: Turn OFF the enforcement toggle — jobs get what's available without errors`);
  } else {
    _lastJobAlertKey = '';
  }
}

// ════════════════════════════════════════════
// MEMORY PER CORE HINTS
// ════════════════════════════════════════════
function updateFieldHints() {
  const mpc = gv('memPerC');
  const jEC = gv('jExecC');
  const c = lastC;

  const mpcHint = document.getElementById('memPerC-hint');
  if(mpcHint) {
    if(mpc > 0) {
      const ec = jEC > 0 ? jEC : (c.execC||4);
      mpcHint.innerHTML = `<span style="color:var(--ac3);">✓ Override active: ${ec} cores × ${mpc}GB = <strong>${(ec*mpc).toFixed(1)}GB</strong>/executor</span>`;
    } else {
      mpcHint.innerHTML = `<span style="color:var(--tx3);">Default: using global spark.executor.memory = <strong>${c.execM||'—'}GB</strong>/executor</span>`;
    }
  }
  const jECHint = document.getElementById('jExecC-hint');
  if(jECHint) {
    if(jEC > 0) {
      jECHint.innerHTML = `<span style="color:var(--wa);">Override active: ${jEC} cores/executor (global: ${c.execC||'—'})</span>`;
    } else {
      jECHint.innerHTML = `<span style="color:var(--tx3);">Inheriting global: ${c.execC||'—'} cores/executor</span>`;
    }
  }
}

// ════════════════════════════════════════════
// EXPORT JOB CONFIGS
// ════════════════════════════════════════════
function _getLastJobAllocs() {
  const c = lastC;
  if(!c.totalExec) return [];
  const paDedExec=preAllocJobs.reduce((s,j)=>s+j.execCount,0);
  const paDedMem=preAllocJobs.reduce((s,j)=>s+j.execCount*j.execMem,0);
  const remExec=Math.max(0,c.totalExec-paDedExec);
  const remMem=Math.max(0, Math.round(c.totalExec*c.execM) - paDedMem); // heap-only pool
  const jEC=gv('jExecC'), mpc=gv('memPerC'), enfJE=gc('enfJE'), enfJC=gc('enfJC');
  const minJE=Math.max(1,gv('minJE')), minJC=Math.max(1,gv('minJC'));
  const execCoresForJob=jEC>0?jEC:c.execC;
  // Base + remainder distribution (same logic as updJobs)
  const base=parallelJobs.map(j=>{let e=Math.max(1,Math.floor(remExec*j.pct/100));if(enfJE)e=Math.max(minJE,e);return e;});
  let lo=Math.max(0,remExec-base.reduce((s,v)=>s+v,0));
  const fr=parallelJobs.map((j,i)=>({i,f:(remExec*j.pct/100)-Math.floor(remExec*j.pct/100)})).sort((a,b)=>b.f-a.f);
  const fin=[...base];
  for(let k=0;k<fr.length&&lo>0;k++){fin[fr[k].i]++;lo--;}
  return parallelJobs.map((j,idx)=>{
    const pct=j.pct/100;
    let jobExec=fin[idx];
    let jobCores=jobExec*execCoresForJob;
    if(enfJC&&jobCores<minJC){jobExec=Math.ceil(minJC/execCoresForJob);jobCores=jobExec*execCoresForJob;}
    let jobMemPerExec, jobMem;
    if(mpc>0){jobMemPerExec=Math.round(execCoresForJob*mpc);}
    else{jobMemPerExec=c.execM;}
    jobMem=jobExec*jobMemPerExec;
    const jobOHPerExec=Math.max(384,Math.round(jobMemPerExec*1024*0.1))+(c.py?1024:0);
    const jobTotalMemPerExec=jobMemPerExec+Math.round(jobOHPerExec/1024*10)/10;
    return {...j,jobExec,jobCores,jobMem,jobMemPerExec,jobOHPerExec,jobTotalMemPerExec,
      execCoresForJob,jobParallelism:jobCores*2,jobShuf:jobCores*2,_rawExecFromPool:Math.floor(remExec*pct),_pct:pct};
  });
}

// ════════════════════════════════════════════
// PER-JOB spark-defaults.conf GENERATION
// ════════════════════════════════════════════
function _buildJobConf(j, c, idx) {
  const customLines = customProps.filter(p=>p.key).map(p=>`${p.key.padEnd(42)}${p.val}`);
  const lines = [
    `# ── ${j.name} — spark-defaults.conf ──`,
    `# Pool allocation: ${j.pct}% of remaining pool`,
    `# Concurrent tasks: ${j.jobCores} (${j.jobExec} exec × ${j.execCoresForJob} cores/exec)`,
    ``,
    `# Executor`,
    `spark.executor.instances             ${j.jobExec}`,
    `spark.executor.cores                 ${j.execCoresForJob}`,
    `spark.executor.memory                ${j.jobMemPerExec}g`,
    `spark.executor.memoryOverhead        ${j.jobOHPerExec}m`,
    ``,
    `# Driver (inherited from global config)`,
    `spark.driver.memory                  ${c.drvM}g`,
    `spark.driver.cores                   ${c.drvC}`,
    `spark.driver.memoryOverhead          ${Math.max(384,Math.round(c.drvM*1024*0.1))}m`,
    ``,
    `# Parallelism`,
    `spark.default.parallelism            ${j.jobParallelism}`,
    `spark.sql.shuffle.partitions         ${j.jobShuf}`,
    ``,
    `# Memory management (inherited from global)`,
    `spark.memory.fraction                ${c.mf}`,
    `spark.memory.storageFraction         ${c.sf}`,
    ``,
    `# AQE`,
    `spark.sql.adaptive.enabled           ${c.aqe}`,
    `spark.sql.adaptive.coalescePartitions.enabled  ${c.aqe}`,
    `spark.sql.adaptive.skewJoin.enabled  ${c.aqe}`,
    ``,
    `# Serialization`,
    `spark.serializer                     org.apache.spark.serializer.KryoSerializer`,
    `spark.kryoserializer.buffer.max      512m`,
    ...(customLines.length ? [``, `# Custom Properties`, ...customLines] : []),
  ];
  return lines.join('\n');
}

function renderJobsConfBlocks() {
  const container = document.getElementById('jobs-conf-panels');
  if (!container) return;
  const allocs = _getLastJobAllocs();
  const c = lastC;
  if (!allocs.length || !c.execC) {
    container.innerHTML = '<p style="color:var(--tx3);font-size:11px;">Configure parallel jobs above to generate per-job conf files.</p>';
    return;
  }
  container.innerHTML = allocs.map((j,i) => {
    const col = COLORS[i % COLORS.length];
    const confText = _buildJobConf(j, c, i);
    const safeId = 'jconf_' + i;
    return `<div style="margin-bottom:14px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;flex-wrap:wrap;gap:6px;">
        <div style="display:flex;align-items:center;gap:7px;">
          <div style="width:9px;height:9px;border-radius:2px;background:${col};"></div>
          <strong style="color:${col};font-size:11px;">${j.name}</strong>
          <span class="tag tc" style="font-size:9px;">${j.pct}% pool</span>
          <span style="font-size:9px;color:var(--tx3);">${j.jobExec} exec · ${j.jobCores} tasks · ${j.jobMemPerExec}GB heap</span>
        </div>
        <div style="display:flex;gap:5px;">
          <button class="btn bo bsm" onclick="navigator.clipboard.writeText(document.getElementById('${safeId}').textContent).then(()=>this.textContent='✓ Copied!');setTimeout(()=>this.textContent='📋 Copy',2000)">📋 Copy</button>
          <button class="btn bo bsm" onclick="dl('${j.name.replace(/\s+/g,'-').toLowerCase()}-spark-defaults.conf',document.getElementById('${safeId}').textContent)">⬇ Download</button>
        </div>
      </div>
      <pre id="${safeId}" class="cout" style="max-height:240px;font-size:10px;line-height:1.7;">${confText}</pre>
    </div>`;
  }).join('');

  // Also render pre-alloc job confs if any
  if (preAllocJobs.length) {
    const paHeader = `<div class="sl" style="margin-top:14px;">Pre-Allocated Job Configurations</div>`;
    const paBlocks = preAllocJobs.map((j,i) => {
      const oh = Math.max(384, Math.round(j.execMem * 1024 * 0.1));
      const conc = j.execCount * j.execCores;
      const confText = [
        `# ── ${j.name} — Pre-Allocated — spark-defaults.conf ──`,
        `spark.executor.instances             ${j.execCount}`,
        `spark.executor.cores                 ${j.execCores}`,
        `spark.executor.memory                ${j.execMem}g`,
        `spark.executor.memoryOverhead        ${oh}m`,
        `spark.default.parallelism            ${conc*2}`,
        `spark.sql.shuffle.partitions         ${conc*2}`,
        `spark.serializer                     org.apache.spark.serializer.KryoSerializer`,
        ...(customProps.filter(p=>p.key).length ? [``, `# Custom Properties`, ...customProps.filter(p=>p.key).map(p=>`${p.key.padEnd(42)}${p.val}`)] : []),
      ].join('\n');
      const sid = 'pajconf_' + i;
      return `<div style="margin-bottom:10px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;flex-wrap:wrap;gap:5px;">
          <strong style="color:#a78bfa;font-size:11px;">📌 ${j.name}</strong>
          <div style="display:flex;gap:5px;">
            <button class="btn bo bsm" onclick="navigator.clipboard.writeText(document.getElementById('${sid}').textContent)">📋 Copy</button>
            <button class="btn bo bsm" onclick="dl('${j.name.replace(/\s+/g,'-').toLowerCase()}-prealloc.conf',document.getElementById('${sid}').textContent)">⬇ Download</button>
          </div>
        </div>
        <pre id="${sid}" class="cout" style="max-height:180px;font-size:10px;line-height:1.7;">${confText}</pre>
      </div>`;
    }).join('');
    container.innerHTML += paHeader + paBlocks;
  }
}

function copyJobsConf() {
  const allocs = _getLastJobAllocs();
  const c = lastC;
  const all = allocs.map(j => _buildJobConf(j, c)).join('\n\n' + '='.repeat(60) + '\n\n');
  navigator.clipboard.writeText(all).then(() => alert('All job configurations copied to clipboard!'));
}

function downloadJobsConf() {
  const allocs = _getLastJobAllocs();
  const c = lastC;
  allocs.forEach((j, i) => {
    dl(`${j.name.replace(/\s+/g,'-').toLowerCase()}-spark-defaults.conf`, _buildJobConf(j, c, i));
  });
}

function copyJobConf(i) {
  const el = document.getElementById('jconf_'+i) || document.getElementById('job-conf-'+i);
  if(el) navigator.clipboard.writeText(el.textContent).then(()=>alert(`Conf for job ${i+1} copied!`));
}

function downloadJobConf(i) {
  const allocs = _getLastJobAllocs();
  const j = allocs[i];
  if(!j) return;
  const el = document.getElementById('jconf_'+i) || document.getElementById('job-conf-'+i);
  if(el) dl(`spark-${j.name.toLowerCase().replace(/\s+/g,'-')}-defaults.conf`, el.textContent);
}

function exportJobsConf() {
  const allocs = _getLastJobAllocs();
  if(!allocs.length){ alert('No parallel jobs configured.'); return; }
  allocs.forEach((_,i) => setTimeout(()=>downloadJobConf(i), i*200));
}

function exportJobsJSON() {
  const c = lastC;
  const allocs = _getLastJobAllocs();
  const out = {
    generatedAt: new Date().toISOString(),
    clusterMode: c.deployMode,
    totalCluster: {nodes:c.nodes, coresPerNode:c.cpn, ramPerNode:c.rpn, totalCores:c.totalCores, totalRAM:c.totalRAM},
    globalExecutorConfig: {
      execCores:c.execC, execMemGB:c.execM, execOverheadMB:c.execOH,
      totalExecutors:c.totalExec, totalConcurrentTasks:c.totalEC
    },
    preAllocatedJobs: preAllocJobs.map(j=>({
      name:j.name, executors:j.execCount, coresPerExecutor:j.execCores, memPerExecutorGB:j.execMem,
      overheadPerExecutorMB: Math.max(384, Math.round(j.execMem*1024*0.1)),
      totalConcurrentTasks: j.execCount*j.execCores,
      totalHeapGB: j.execCount*j.execMem,
      sparkConf: {
        'spark.executor.instances': j.execCount,
        'spark.executor.cores': j.execCores,
        'spark.executor.memory': j.execMem+'g',
        'spark.executor.memoryOverhead': Math.max(384, Math.round(j.execMem*1024*0.1))+'m',
        'spark.default.parallelism': j.execCount*j.execCores*2,
        'spark.sql.shuffle.partitions': j.execCount*j.execCores*2,
      },
      sparkSubmit: `spark-submit --num-executors ${j.execCount} --executor-cores ${j.execCores} --executor-memory ${j.execMem}g --conf spark.executor.memoryOverhead=${Math.max(384,Math.round(j.execMem*1024*0.1))}m`
    })),
    parallelJobs: allocs.map(j=>({
      name:j.name, allocationPct:j.pct, executors:j.jobExec,
      concurrentTasks:j.jobCores,
      coresPerExecutor:j.execCoresForJob,
      heapPerExecutorGB:j.jobMemPerExec,
      overheadPerExecutorMB:j.jobOHPerExec,
      totalJVMMemPerExecutorGB:j.jobTotalMemPerExec,
      totalHeapGB:j.jobMem,
      totalHeapPlusOverheadGB:Math.round((j.jobMem + j.jobExec*j.jobOHPerExec/1024)*10)/10,
      defaultParallelism:j.jobParallelism, shufflePartitions:j.jobShuf,
      memPerCoreGB: j.execCoresForJob>0?Math.round(j.jobMemPerExec/j.execCoresForJob*10)/10:0,
      sparkConf: {
        'spark.executor.instances': j.jobExec,
        'spark.executor.cores': j.execCoresForJob,
        'spark.executor.memory': j.jobMemPerExec+'g',
        'spark.executor.memoryOverhead': j.jobOHPerExec+'m',
        'spark.default.parallelism': j.jobParallelism,
        'spark.sql.shuffle.partitions': j.jobShuf,
      }
    }))
  };
  dl('spark-parallel-jobs.json', JSON.stringify(out, null, 2), 'application/json');
}

function copyJobsSparkConf() {
  const allocs = _getLastJobAllocs();
  if(!allocs.length){ alert('No parallel jobs configured.'); return; }
  const lines = [];
  // Pre-alloc jobs
  if(preAllocJobs.length) {
    lines.push('# ── Pre-Allocated Jobs ──');
    preAllocJobs.forEach(j=>{
      lines.push(`\n# ${j.name}`);
      lines.push(`spark-submit \\\n  --num-executors ${j.execCount} \\\n  --executor-cores ${j.execCores} \\\n  --executor-memory ${j.execMem}g \\\n  your-${j.name.toLowerCase().replace(/\s+/g,'-')}-app.jar`);
    });
    lines.push('');
  }
  lines.push('# ── Parallel Jobs (from remaining pool) ──');
  allocs.forEach(j=>{
    lines.push(`\n# ${j.name} — ${j.pct}% of remaining pool`);
    lines.push(`spark-submit \\\n  --num-executors ${j.jobExec} \\\n  --executor-cores ${j.execCoresForJob} \\\n  --executor-memory ${j.jobMemPerExec}g \\\n  --conf spark.default.parallelism=${j.jobParallelism} \\\n  --conf spark.sql.shuffle.partitions=${j.jobShuf} \\\n  your-${j.name.toLowerCase().replace(/\s+/g,'-')}-app.jar`);
  });
  navigator.clipboard.writeText(lines.join('\n')).then(()=>alert('All job spark-submit commands copied to clipboard!'));
}

function exportJobChartsPNG() {
  ['ch-jobs','ch-jobs2'].forEach((id,i)=>{
    const cv=document.getElementById(id); if(!cv) return;
    const a=document.createElement('a'); a.download=`spark-jobs-chart-${i+1}.png`; a.href=cv.toDataURL();
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  });
}
function showAlert(icon, title, body, fix) {
  document.getElementById('am-icon').textContent=icon;
  document.getElementById('am-title').textContent=title;
  document.getElementById('am-body').textContent=body;
  document.getElementById('am-fix').innerHTML='<strong style="color:var(--ac);">How to fix:</strong><br>'+fix.replace(/\n/g,'<br>');
  document.getElementById('alert-modal').classList.add('on');
}
function closeAlertModal() { document.getElementById('alert-modal').classList.remove('on'); }

// ════════════════════════════════════════════
// REPORT
// ════════════════════════════════════════════
function genReport() {
  const c = lastC;
  if(!c.nodes) return;
  const ts = new Date().toLocaleString();
  const allocs = _getLastJobAllocs();
  const poolMem = Math.round(c.totalExec * c.execM);
  const poolOH  = Math.round(c.totalExec * c.execOH / 1024);
  const paDedExec = preAllocJobs.reduce((s,j)=>s+j.execCount,0);
  const paDedCores = preAllocJobs.reduce((s,j)=>s+j.execCount*j.execCores,0);
  const paDedMem = preAllocJobs.reduce((s,j)=>s+j.execCount*j.execMem,0);
  const remExec = Math.max(0, c.totalExec - paDedExec);
  const remCores = Math.max(0, c.totalEC - paDedCores);
  const remMem  = Math.max(0, poolMem - paDedMem);

  const sect = (title, col, content) =>
    `<div style="margin-bottom:10px;border-radius:8px;overflow:hidden;border:1px solid var(--bd);">
      <div style="padding:7px 12px;background:${col}18;border-bottom:1px solid ${col}33;font-size:11px;font-weight:700;color:${col};">${title}</div>
      <div style="padding:10px 12px;font-size:11px;line-height:1.8;color:var(--tx2);font-family:'JetBrains Mono',monospace;">${content}</div>
    </div>`;

  const row = (k,v,d='') => `<div style="display:flex;gap:8px;margin-bottom:2px;"><span style="color:var(--tx3);min-width:200px;">${k}</span><span style="color:var(--tx);">${v}</span>${d?`<span style="color:var(--tx3);font-size:10px;"> ← ${d}</span>`:''}</div>`;

  // Computation derivation table
  const derivation = [
    row('Usable cores/node',`${c.cpn} − ${c.osCR} OS = ${c.cpn-c.osCR}`,`cpn − osCR`),
    row('Executor cores',`${c.execC}`,`workload=${c.wl}, min=${c.minEC}`),
    row('Executors/node',`${c.execPN}`,`floor(${c.cpn-c.osCR} ÷ ${c.execC})`),
    row('Avail RAM/node',`${c.availRAM}GB`,`${c.rpn} − ${c.osR}OS − ${c.yarnR}RM`),
    row('Executor memory',`${c.execM}GB`,`floor(${c.availRAM} ÷ ${c.execPN} × 0.875)`),
    row('Mem overhead',`${c.execOH}MB`,`max(384, 10% × ${c.execM}GB)`),
    row('Executor nodes',`${c.execNodes}`,c.deployMode==='cluster'?`${c.nodes} − 1 driver`:`all ${c.nodes} (client mode)`),
    row('Total executors',`${c.totalExec}`,`${c.execNodes} × ${c.execPN}`),
    row('Concurrent tasks',`${c.totalEC}`,`${c.totalExec} × ${c.execC}`),
    row('Default parallelism',`${c.para}`,`${c.totalEC} × ${c.wl==='ml'?3:2}`),
  ].join('');

  // Parallel jobs section
  let paRows='', pjRows='', poolSummary='';
  if(preAllocJobs.length || allocs.length) {
    poolSummary = [
      row('Total executor pool',`${c.totalExec} exec · ${c.totalEC} tasks · ${poolMem}GB heap · ${poolOH}GB OH`,`execCount × execM`),
      row('Pre-alloc reserved',`${paDedExec} exec · ${paDedCores} tasks · ${paDedMem}GB heap`,`${preAllocJobs.length} job(s)`),
      row('Remaining pool (=100%)',`${remExec} exec · ${remCores} tasks · ${remMem}GB heap`,`total − pre-alloc`),
    ].join('');
    if(preAllocJobs.length) paRows = preAllocJobs.map(j=>{
      const oh=Math.max(384,Math.round(j.execMem*1024*0.1));
      return row(j.name,`${j.execCount} exec · ${j.execCount*j.execCores} tasks · ${j.execCount*j.execMem}GB heap · ${Math.round(j.execCount*oh/1024*10)/10}GB OH`,
        `${j.execCount}×${j.execCores}c×${j.execMem}GB`);
    }).join('');
    if(allocs.length) pjRows = allocs.map(j=>
      row(j.name,`${j.jobExec} exec · ${j.jobCores} tasks · ${j.jobMem}GB heap · ${Math.round(j.jobExec*j.jobOHPerExec/1024*10)/10}GB OH`,
        `${j.pct}% of pool → ${j.jobExec}×${j.execCoresForJob}c×${j.jobMemPerExec}GB`)
    ).join('');
  }

  // Memory accounting summary
  const memAcct = [
    row('Executor heap (total)',`${Math.round(c.totalExec*c.execM)}GB`,`${c.totalExec}×${c.execM}GB`),
    row('Executor overhead (total)',`${Math.round(c.totalExec*c.execOH/1024)}GB`,`${c.totalExec}×${c.execOH}MB`),
    row('Driver',c.deployMode==='cluster'?`${c.drvM}GB heap + ${Math.max(384,Math.round(c.drvM*1024*0.1))}MB OH`:'On master — not in cluster pool',c.deployMode==='cluster'?'1 worker node reserved':''),
    row('OS + RM reserves',`${Math.round(c.reserveRAM)}GB`,`${c.nodes}×(${c.osR}+${c.yarnR})GB`),
    row('Unused / free',`${Math.round(c.unusedRAM)}GB RAM · ${c.unusedCores} cores`,'cluster headroom'),
  ].join('');

  document.getElementById('report-body').innerHTML = `
    ${sect('🏗 Cluster Specification','#00d4ff',
      row('Hardware',`${c.nodes} nodes × ${c.cpn} cores × ${c.rpn}GB RAM`)+
      row('Total',`${c.totalCores} cores · ${c.totalRAM}GB RAM`)+
      row('Deploy mode',c.deployMode.toUpperCase()+' mode')+
      row('Resource Manager',c.rm.toUpperCase())+
      row('Spark version',c.sv)+
      row('Workload profile',c.wl.toUpperCase())
    )}
    ${sect('⚙ Computation Derivation (How Values Were Calculated)','#7c3aed',derivation)}
    ${sect('📊 Utilization Summary','#10b981',
      row('CPU',`${c.clusterUsedCores} / ${c.totalCores} cores (${c.coreUtil}%)`,c.coreUtil>90?'🔴 CRITICAL':c.coreUtil>80?'🟡 WARNING':'🟢 OPTIMAL')+
      row('RAM',`${Math.round(c.clusterUsedRAM)} / ${c.totalRAM}GB (${c.memUtil}%)`,c.memUtil>90?'🔴 CRITICAL':c.memUtil>80?'🟡 WARNING':'🟢 OPTIMAL')+
      row('Concurrent tasks',`${c.totalEC} max`)+
      row('Parallelism',`${c.para} partitions · ${c.shufP} shuffle`)+
      row('Features',`AQE:${c.aqe?'✅':'❌'} DynAlloc:${c.dynA?'✅':'❌'} PySpark:${c.py?'✅':'❌'}`)
    )}
    ${sect('💾 Memory Accounting','#f59e0b',memAcct)}
    ${preAllocJobs.length||allocs.length ? sect('⚡ Parallel Jobs Plan','#10b981',
      poolSummary +
      (preAllocJobs.length?`<div style="color:var(--ac2);font-weight:700;margin:6px 0 2px;">Pre-Allocated Jobs</div>`+paRows:'') +
      (allocs.length?`<div style="color:var(--ac3);font-weight:700;margin:6px 0 2px;">Parallel Jobs (${gs2('scheduler').toUpperCase()} scheduler)</div>`+pjRows:'')
    ) : ''}
    <p style="color:var(--tx3);font-size:9px;margin-top:10px;">Generated: ${ts} · Spark Config Architect v12</p>`;
}

// ════════════════════════════════════════════
// EXPORT FUNCTIONS (fixed — all work)
// ════════════════════════════════════════════
function dl(name, text, mime='text/plain') {
  const a = document.createElement('a');
  a.href = 'data:'+mime+';charset=utf-8,'+encodeURIComponent(text);
  a.download = name; document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

function getConfText() { return document.getElementById('conf-out')?.textContent || ''; }

function doExportConfig() {
  const t = getConfText();
  if(t.includes('-- Configure')) { alert('Please enter cluster specs and wait for configuration to generate first.'); return; }
  dl('spark-defaults.conf', t);
}

function doExportReport() {
  genReport();
  const body = document.getElementById('report-body')?.innerHTML || '';
  const conf = getConfText();
  // Inject light theme CSS for exported HTML
  const exportStyle = `body{font-family:sans-serif;max-width:960px;margin:32px auto;padding:24px;background:#f8fafc;color:#1e293b;}
    h1{color:#0ea5e9;font-size:20px;margin-bottom:4px;}
    .sub{color:#64748b;font-size:12px;margin-bottom:20px;}
    pre{background:#1e293b;color:#94a3b8;padding:16px;border-radius:8px;font-size:11px;line-height:1.8;overflow:auto;white-space:pre-wrap;}
    table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px;}
    th,td{text-align:left;padding:6px 10px;border:1px solid #e2e8f0;}
    th{background:#f1f5f9;}
    [style*="background:var(--sf2)"]{background:#f1f5f9!important;color:#334155!important;}
    [style*="background:var(--sf3)"]{background:#e2e8f0!important;}
    [style*="color:var(--tx3)"]{color:#64748b!important;}
    [style*="color:var(--tx2)"]{color:#475569!important;}
    [style*="color:var(--tx)"]{color:#1e293b!important;}
    [style*="color:var(--ac)"]{color:#0ea5e9!important;}
    [style*="color:var(--ac3)"]{color:#059669!important;}
    [style*="color:var(--ac2)"]{color:#7c3aed!important;}
    [style*="color:var(--wa)"]{color:#d97706!important;}`;
  const allocs = _getLastJobAllocs();
  const pyNote = lastC.py ? ` · PySpark overhead included (+1GB/executor)` : '';
  const jobsTable = allocs.length ? `
    <h2>⚡ Parallel Job Allocations${pyNote}</h2>
    <table border="1" cellpadding="8" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead style="background:#1e293b;color:#94a3b8;">
        <tr>
          <th>Job Name</th><th>Pool %</th><th>Executors<br>(spark.executor.instances)</th>
          <th>Concurrent Tasks<br>(exec × cores/exec)</th><th>Cores/Exec<br>(spark.executor.cores)</th>
          <th>Heap/Exec<br>(spark.executor.memory)</th>
          <th>Overhead/Exec<br>(spark.executor.memoryOverhead${lastC.py?' incl. +1GB PySpark':''})</th>
          <th>Total Heap<br>(exec × heap/exec)</th><th>Total incl. OH<br>(heap+OH × exec)</th>
          <th>Parallelism<br>(spark.default.parallelism)</th>
        </tr>
      </thead><tbody>
        ${allocs.map(j=>{
          const totalOH = Math.round(j.jobExec*j.jobOHPerExec/1024*10)/10;
          return `<tr>
            <td><strong>${j.name}</strong></td><td>${j.pct}%</td><td>${j.jobExec}</td>
            <td>${j.jobCores}<br><small>(${j.jobExec}×${j.execCoresForJob})</small></td>
            <td>${j.execCoresForJob}</td><td>${j.jobMemPerExec}GB</td>
            <td>${j.jobOHPerExec}MB${lastC.py?' <em>(base '+(j.jobOHPerExec-1024)+'MB + 1024MB PySpark)</em>':''}</td>
            <td>${j.jobMem}GB</td><td>${Math.round((j.jobMem+totalOH)*10)/10}GB</td>
            <td>${j.jobParallelism}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>` : '';
  const paTable = preAllocJobs.length ? `
    <h2>📌 Pre-Allocated Jobs (Fixed Reservations)</h2>
    <table border="1" cellpadding="8" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead style="background:#1e293b;color:#94a3b8;">
        <tr><th>Job Name</th><th>Executors</th><th>Cores/Exec</th><th>Heap/Exec</th><th>Overhead/Exec</th><th>Concurrent Tasks</th><th>Total Heap</th><th>Total incl. OH</th></tr>
      </thead><tbody>
        ${preAllocJobs.map(j=>{
          const oh = Math.max(384,Math.round(j.execMem*1024*0.1))+(lastC.py?1024:0);
          const totalHeap = j.execCount*j.execMem;
          const totalOH = Math.round(j.execCount*oh/1024*10)/10;
          return `<tr><td><strong>${j.name}</strong></td><td>${j.execCount}</td><td>${j.execCores}</td><td>${j.execMem}GB</td><td>${oh}MB</td><td>${j.execCount*j.execCores}</td><td>${totalHeap}GB</td><td>${Math.round((totalHeap+totalOH)*10)/10}GB</td></tr>`;
        }).join('')}
      </tbody>
    </table>` : '';
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Spark Config Report</title>
<style>${exportStyle}</style></head>
<body>
<h1>⚡ Spark Config Architect v12 — Configuration Report</h1>
<div class="sub">Generated: ${new Date().toLocaleString()} · ${lastC.deployMode?.toUpperCase()||''} mode · ${lastC.nodes||'—'} nodes × ${lastC.cpn||'—'} cores × ${lastC.rpn||'—'}GB RAM · Spark ${lastC.sv||'—'} · ${lastC.rm?.toUpperCase()||''}${lastC.py?' · PySpark ON':''}</div>
<h2>Cluster Resource Summary</h2>
<table border="1" cellpadding="8" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px;">
  <thead style="background:#1e293b;color:#94a3b8;"><tr><th>Metric</th><th>Value</th><th>Formula / Notes</th></tr></thead>
  <tbody>
    <tr><td>Total Nodes</td><td>${lastC.nodes}</td><td>Worker nodes in cluster</td></tr>
    <tr><td>Cores/Node</td><td>${lastC.cpn}</td><td>Physical CPU cores</td></tr>
    <tr><td>RAM/Node</td><td>${lastC.rpn}GB</td><td>Total per worker</td></tr>
    <tr><td>OS Reserve/Node</td><td>${lastC.osR}GB</td><td>Linux OS + daemons</td></tr>
    <tr><td>RM Reserve/Node</td><td>${lastC.yarnR}GB</td><td>YARN/K8s/Standalone daemon</td></tr>
    <tr><td>OS CPU Reserve/Node</td><td>${lastC.osCR} cores</td><td>Reserved for OS scheduling</td></tr>
    <tr><td>Usable Cores/Node</td><td>${lastC.cpn-lastC.osCR}</td><td>${lastC.cpn} − ${lastC.osCR} OS reserve</td></tr>
    <tr><td>Usable RAM/Node</td><td>${lastC.availRAM}GB</td><td>${lastC.rpn} − ${lastC.osR} OS − ${lastC.yarnR} RM</td></tr>
    <tr><td>Executor Cores</td><td>${lastC.execC}</td><td>spark.executor.cores</td></tr>
    <tr><td>Executors/Node</td><td>${lastC.execPN}</td><td>floor(usable cores ÷ exec cores)</td></tr>
    <tr><td>Executor Memory</td><td>${lastC.execM}GB</td><td>spark.executor.memory</td></tr>
    <tr><td>Mem Overhead</td><td>${lastC.execOH}MB</td><td>spark.executor.memoryOverhead${lastC.py?' (incl. +1024MB PySpark)':''}</td></tr>
    <tr><td>Executor Nodes</td><td>${lastC.execNodes}</td><td>${lastC.deployMode==='cluster'?lastC.nodes+' − 1 driver node':lastC.nodes+' (all nodes — '+lastC.deployMode+' mode)'}</td></tr>
    <tr><td>Total Executors</td><td>${lastC.totalExec}</td><td>${lastC.execNodes} nodes × ${lastC.execPN} exec/node</td></tr>
    <tr><td>Concurrent Tasks</td><td>${lastC.totalEC}</td><td>${lastC.totalExec} exec × ${lastC.execC} cores</td></tr>
    <tr><td>Parallelism</td><td>${lastC.para}</td><td>${lastC.totalEC} tasks × ${lastC.wl==='ml'?3:2} factor</td></tr>
    <tr><td>CPU Utilization</td><td><strong>${lastC.coreUtil}%</strong></td><td>${lastC.clusterUsedCores} executor cores ÷ ${lastC.usableTotalCores} usable cores (OS reserves excluded)</td></tr>
    <tr><td>RAM Utilization</td><td><strong>${lastC.memUtil}%</strong></td><td>${Math.round(lastC.usableExecRAM)}GB executor RAM ÷ ${Math.round(lastC.usableTotalRAM)}GB usable (OS+RM reserves excluded)</td></tr>
    <tr><td>Driver Memory</td><td>${lastC.drvM}GB</td><td>spark.driver.memory${lastC.deployMode==='client'?' (on master — not in worker pool)':' (on worker node)'}</td></tr>
    <tr><td>Driver Cores</td><td>${lastC.drvC}</td><td>spark.driver.cores</td></tr>
  </tbody>
</table>
${body}${paTable}${jobsTable}
<h2>Generated spark-defaults.conf</h2>
<pre>${conf.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>
</body></html>`;
  dl('spark-config-report.html', html, 'text/html');
}

function doExportJSON() {
  dl('spark-config.json', JSON.stringify({config:lastC, preAllocJobs, parallelJobs, customProps}, null, 2), 'application/json');
}

function copyConf() {
  const t = getConfText();
  if(t.includes('-- Configure')){ alert('Generate configuration first.'); return; }
  navigator.clipboard.writeText(t).then(()=>alert('Configuration copied to clipboard!'));
}

function copySubmit() {
  const c = lastC;
  if(!c.execC){ alert('Generate configuration first.'); return; }
  const cmd = [`spark-submit \\`,`  --master ${c.rm==='standalone'?'spark://<master>:7077':c.rm==='yarn'?'yarn':'k8s://https://<k8s-api>'} \\`,`  --deploy-mode ${c.deployMode} \\`,`  --num-executors ${c.totalExec} \\`,`  --executor-cores ${c.execC} \\`,`  --executor-memory ${c.execM}g \\`,`  --driver-memory ${c.drvM}g \\`,`  --driver-cores ${c.drvC} \\`,`  --conf spark.executor.memoryOverhead=${c.execOH}m \\`,`  --conf spark.default.parallelism=${c.para} \\`,`  --conf spark.sql.shuffle.partitions=${c.shufP} \\`,`  --conf spark.sql.adaptive.enabled=${c.aqe} \\`,`  --conf spark.serializer=org.apache.spark.serializer.KryoSerializer \\`,`  your-app.jar`].join('\n');
  navigator.clipboard.writeText(cmd).then(()=>alert('spark-submit command copied!'));
}

function exportCharts() {
  ['ch-mem','ch-cores','ch-util','ch-execmem','ch-scale','ch-full','ch-jobs','ch-jobs2'].forEach((id,i)=>{
    const cv=document.getElementById(id); if(!cv) return;
    const a=document.createElement('a'); a.download=`spark-chart-${i+1}-${id}.png`; a.href=cv.toDataURL(); document.body.appendChild(a); a.click(); document.body.removeChild(a);
  });
}

function genShareURL() {
  const c = lastC;
  const p = new URLSearchParams({n:c.nodes,c:c.cpn,r:c.rpn,m:c.deployMode,w:c.wl});
  const url = window.location.href.split('?')[0]+'?'+p.toString();
  document.getElementById('share-url').value = url;
  navigator.clipboard.writeText(url).then(()=>{});
}

// ════════════════════════════════════════════
// RESET
// ════════════════════════════════════════════
function resetAll() {
  if(!confirm('Reset all fields to defaults?\nThis will clear:\n• Cluster specs and overrides\n• Pre-allocated jobs\n• Parallel job plan\n• Custom Spark properties\n\nContinue?')) return;
  _doResetAll();
}
function _doResetAll() {
  manFlds={}; shownAlerts=new Set(); preAllocJobs=[]; parallelJobs=[]; jobPctOvr={}; paCounter=0; customProps=[];
  ['execC','execPN','execM','execOH','drvM','drvC','para','shufP','dynMax'].forEach(f=>rstFld(f));
  [{id:'nodes',v:10},{id:'cpn',v:16},{id:'rpn',v:64},{id:'osR',v:2},{id:'yarnR',v:1},{id:'osCR',v:1},{id:'minExecC',v:4},{id:'minExecM',v:8},{id:'memFrac',v:0.6},{id:'stoFrac',v:0.5},{id:'numJobs',v:2},{id:'masterRam',v:16},{id:'masterCores',v:4}]
    .forEach(x=>{const e=document.getElementById(x.id);if(e){e.value=x.v;e.disabled=false;e.style.opacity='1';}});
  document.getElementById('nj-val').textContent='2';
  setMode('client');
  _updateRMReserveLabel();
  renderPAJobs();
  renderCustomProps();
  _doCompute();
}

// ════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════
(function init(){
  const p = new URLSearchParams(window.location.search);
  if(p.get('n')) document.getElementById('nodes').value=p.get('n');
  if(p.get('c')) document.getElementById('cpn').value=p.get('c');
  if(p.get('r')) document.getElementById('rpn').value=p.get('r');
  if(p.get('m')) setMode(p.get('m')); else setMode('client');
  if(p.get('w')) { const e=document.getElementById('wlType'); if(e) e.value=p.get('w'); }
  _updateRMReserveLabel();
  renderPAJobs();
  renderCustomProps();
  _doCompute();
  // Always land on Cluster Setup tab
  showTab('setup', document.getElementById('tbn-setup'));
})();
