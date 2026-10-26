const SVG_NS = 'http://www.w3.org/2000/svg';
const svg = document.querySelector('#topology-svg');
const sourceSelect = document.querySelector('#source');
const destinationSelect = document.querySelector('#destination');
const protocolSelect = document.querySelector('#protocol');
const portRow = document.querySelector('#port-row');
const portInput = document.querySelector('#port');
const runButton = document.querySelector('#run-button');
const toast = document.querySelector('#toast');

let network = null;
let currentTrace = null;
let traceTimer = null;
let traceSessionCount = 0;
let selectionTarget = 'source';
let toastTimer = null;

function svgElement(tag, attributes = {}, content = '') {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  if (content) element.textContent = content;
  return element;
}

function clientDevices() {
  return network.devices.filter(device => !['R1', 'SW1'].includes(device.id));
}

function populateDevices() {
  for (const select of [sourceSelect, destinationSelect]) {
    const keep = select.value;
    select.replaceChildren();
    for (const device of clientDevices()) {
      const option = document.createElement('option');
      option.value = device.id;
      option.textContent = `${device.name} · ${device.ip}`;
      select.append(option);
    }
    if ([...select.options].some(option => option.value === keep)) select.value = keep;
  }
  if (!sourceSelect.value) sourceSelect.value = 'A1';
  if (!destinationSelect.value || destinationSelect.value === sourceSelect.value) destinationSelect.value = 'SERVER';
}

function deviceBox(device) {
  if (device.id === 'R1') return { w: 176, h: 63 };
  if (device.id === 'SW1') return { w: 184, h: 62 };
  if (device.id === 'SERVER') return { w: 178, h: 62 };
  return { w: 90, h: 62 };
}

function drawTopology(activePath = [], currentIndex = -1) {
  if (!network) return;
  svg.replaceChildren();
  const zones = [
    { id: 10, x: 23, w: 210, color: '#60cfdb' },
    { id: 20, x: 255, w: 210, color: '#91a5ff' },
    { id: 30, x: 487, w: 210, color: '#efa869' },
    { id: 40, x: 719, w: 258, color: '#b49aff' },
  ];
  for (const [index, zone] of zones.entries()) {
    const vlan = network.vlans.find(item => item.id === zone.id);
    const rect = svgElement('rect', { class: `vlan-zone${index % 2 ? ' alt' : ''}`, x: zone.x, y: 330, width: zone.w, height: 205, rx: 12 });
    svg.append(rect);
    const title = svgElement('text', { x: zone.x + 13, y: 352, class: 'vlan-title', fill: zone.color }, `VLAN ${zone.id} · ${vlan.name.toUpperCase()}`);
    svg.append(title);
    svg.append(svgElement('text', { x: zone.x + 13, y: 370, class: 'vlan-subtitle' }, vlan.network));
  }

  const deviceById = Object.fromEntries(network.devices.map(device => [device.id, device]));
  const points = {};
  for (const device of network.devices) {
    const box = deviceBox(device);
    points[device.id] = { x: device.x, y: device.y, ...box };
  }

  const hotEdges = new Set();
  for (let i = 0; i < activePath.length - 1; i++) {
    const pair = [activePath[i], activePath[i + 1]].sort().join('|');
    hotEdges.add(pair);
  }
  for (const link of network.links) {
    const source = points[link.source];
    const target = points[link.target];
    const pair = [link.source, link.target].sort().join('|');
    const active = hotEdges.has(pair);
    const classes = ['edge', link.kind === 'trunk' ? 'trunk' : '', link.kind === 'server' ? 'server-edge' : '', active ? 'active' : ''].filter(Boolean).join(' ');
    const x1 = source.x;
    const y1 = source.y + (source.y < target.y ? source.h / 2 : 0);
    const x2 = target.x;
    const y2 = target.y - (source.y < target.y ? target.h / 2 : 0);
    const line = svgElement('line', { x1, y1, x2, y2, class: classes, 'data-pair': pair });
    svg.append(line);
    if (link.kind === 'trunk') {
      svg.append(svgElement('text', { x: 510, y: 143, class: 'vlan-subtitle', 'text-anchor': 'start' }, link.port));
    } else if (link.kind === 'access') {
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      svg.append(svgElement('text', { x: midX + 5, y: midY + 2, class: 'vlan-subtitle' }, `V${link.vlan}`));
    }
  }

  for (const device of network.devices) {
    const { x, y, w, h } = points[device.id];
    const group = svgElement('g', { class: `node-group ${device.id === 'R1' ? 'router' : ''} ${device.id === 'SW1' ? 'switch' : ''} ${device.id === 'SERVER' ? 'server' : ''}`, 'data-node': device.id, tabindex: '0', role: 'button', 'aria-label': `${device.name}, ${device.role}, ${device.ip}` });
    const card = svgElement('rect', { class: 'node-card', x: x - w / 2, y: y - h / 2, width: w, height: h, rx: 10 });
    group.append(card);
    const isInfra = ['R1', 'SW1'].includes(device.id);
    group.append(svgElement('text', { class: 'node-name', x, y: y - 8, 'text-anchor': 'middle' }, device.name));
    group.append(svgElement('text', { class: 'node-role', x, y: y + 7, 'text-anchor': 'middle' }, device.role));
    group.append(svgElement('text', { class: 'node-ip', x, y: y + 22, 'text-anchor': 'middle' }, isInfra ? device.ip : device.ip));
    if (device.vlan) {
      group.append(svgElement('rect', { class: 'node-chip', x: x + w / 2 - 32, y: y - h / 2 - 6, width: 36, height: 15, rx: 6 }));
      group.append(svgElement('text', { class: 'node-chip-text', x: x + w / 2 - 14, y: y - h / 2 + 4, 'text-anchor': 'middle' }, `V${device.vlan}`));
    }
    const selectedSource = sourceSelect.value === device.id;
    const selectedDestination = destinationSelect.value === device.id;
    if (selectedSource) group.classList.add('selected-source');
    if (selectedDestination) group.classList.add('selected-destination');
    if (activePath[currentIndex] === device.id) group.classList.add('trace-active');
    group.addEventListener('click', () => chooseEndpoint(device.id));
    group.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        chooseEndpoint(device.id);
      }
    });
    svg.append(group);
  }

  if (activePath.length > 1 && currentIndex >= 0) {
    const current = deviceById[activePath[currentIndex]];
    if (current) {
      const point = points[current.id];
      svg.append(svgElement('circle', { class: 'packet-dot', cx: point.x, cy: point.y, r: 6 }));
    }
  }
}

function chooseEndpoint(deviceId) {
  if (!clientDevices().some(device => device.id === deviceId)) return;
  if (selectionTarget === 'source') {
    sourceSelect.value = deviceId;
    if (destinationSelect.value === deviceId) destinationSelect.value = sourceSelect.options[[...sourceSelect.options].findIndex(option => option.value !== deviceId)]?.value || 'SERVER';
    selectionTarget = 'destination';
  } else {
    if (sourceSelect.value === deviceId) {
      showToast('Pick a different destination device.');
      selectionTarget = 'source';
      return;
    }
    destinationSelect.value = deviceId;
    selectionTarget = 'source';
  }
  drawTopology();
}

function renderVlans() {
  const list = document.querySelector('#vlan-list');
  list.replaceChildren();
  for (const vlan of network.vlans) {
    const count = network.devices.filter(device => device.vlan === vlan.id).length;
    const card = document.createElement('article');
    card.className = 'vlan-card';
    card.innerHTML = `<div class="vlan-top"><span class="vlan-id">VLAN ${vlan.id}</span><span class="vlan-count">${count} nodes</span></div><h3></h3><div class="vlan-network"></div>`;
    card.querySelector('h3').textContent = vlan.name;
    card.querySelector('.vlan-network').textContent = vlan.network;
    list.append(card);
  }
}

function renderStats() {
  document.querySelector('#device-count').textContent = network.devices.length;
  document.querySelector('#vlan-count').textContent = network.vlans.length;
  document.querySelector('#link-count').textContent = network.links.length;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function metaCell(label, value) {
  const cell = document.createElement('div');
  cell.className = 'meta-item';
  const title = document.createElement('span');
  title.textContent = label;
  const content = document.createElement('strong');
  content.textContent = value;
  cell.append(title, content);
  return cell;
}

function renderTrace(trace, visibleHops = trace.hops.length) {
  document.querySelector('#trace-empty').classList.add('hidden');
  const result = document.querySelector('#trace-result');
  result.classList.remove('hidden');
  const summary = document.querySelector('#result-summary');
  summary.textContent = trace.summary;
  summary.classList.toggle('failed', trace.status !== 'delivered');
  const meta = document.querySelector('#packet-meta');
  meta.replaceChildren(
    metaCell('SOURCE IP', trace.packet.sourceIp),
    metaCell('DESTINATION IP', trace.packet.destinationIp),
    metaCell('PROTOCOL', trace.protocol + (trace.packet.destinationPort ? ` · ${trace.packet.destinationPort}` : '')),
    metaCell('VLAN PATH', trace.packet.vlanEntry === trace.packet.vlanExit ? `${trace.packet.vlanEntry} local` : `${trace.packet.vlanEntry} → ${trace.packet.vlanExit}`),
  );
  const hopList = document.querySelector('#hop-list');
  hopList.replaceChildren();
  const heading = document.createElement('div');
  heading.className = 'hop-heading';
  heading.textContent = `HOP SEQUENCE · TTL ${trace.packet.ttlStart} → ${trace.packet.ttlEnd}`;
  hopList.append(heading);
  for (const [index, hop] of trace.hops.slice(0, visibleHops).entries()) {
    const item = document.createElement('article');
    item.className = `hop-item${index === trace.hops.length - 1 ? ' destination' : ''}${index === visibleHops - 1 && visibleHops < trace.hops.length ? ' current' : ''}`;
    const marker = document.createElement('span');
    marker.className = 'hop-marker';
    marker.textContent = String(index + 1);
    const content = document.createElement('div');
    content.className = 'hop-content';
    const title = document.createElement('div');
    title.className = 'hop-title';
    const name = document.createElement('strong');
    name.textContent = hop.name;
    const ip = document.createElement('span');
    ip.textContent = hop.ip;
    title.append(name, ip);
    const event = document.createElement('div');
    event.className = 'hop-event';
    event.textContent = hop.event + (hop.vlan ? ` · VLAN ${hop.vlan}` : '');
    const detail = document.createElement('div');
    detail.className = 'hop-detail';
    detail.textContent = hop.detail;
    content.append(title, event, detail);
    item.append(marker, content);
    hopList.append(item);
  }
}

function renderHistory(traces) {
  const list = document.querySelector('#history-list');
  list.replaceChildren();
  document.querySelector('#history-count').textContent = traces.length ? `${traces.length} recent` : 'No traces yet';
  if (!traces.length) {
    const empty = document.createElement('div');
    empty.className = 'history-empty';
    empty.textContent = 'Your recent packet traces will appear here.';
    list.append(empty);
    return;
  }
  for (const trace of traces.slice(0, 5)) {
    const item = document.createElement('article');
    item.className = 'history-item';
    const icon = document.createElement('span');
    icon.className = 'history-icon';
    icon.textContent = '⇢';
    const copy = document.createElement('div');
    copy.className = 'history-copy';
    const title = document.createElement('strong');
    title.textContent = `${trace.source.id} → ${trace.destination.id}`;
    const subtitle = document.createElement('span');
    subtitle.textContent = `${trace.protocol} · ${trace.hops.length} hops · VLAN ${trace.packet.vlanEntry} → ${trace.packet.vlanExit}`;
    copy.append(title, subtitle);
    const time = document.createElement('span');
    time.className = 'history-time';
    time.textContent = new Date(trace.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    item.append(icon, copy, time);
    item.addEventListener('click', () => {
      sourceSelect.value = trace.source.id;
      destinationSelect.value = trace.destination.id;
      protocolSelect.value = trace.protocol;
      syncProtocol();
      currentTrace = trace;
      renderTrace(trace);
      drawTopology(trace.path, trace.path.length - 1);
    });
    list.append(item);
  }
}

function syncProtocol() {
  const protocol = protocolSelect.value;
  const hasPort = protocol === 'TCP' || protocol === 'UDP';
  portRow.classList.toggle('hidden', !hasPort);
  if (protocol === 'UDP' && portInput.value === '80') portInput.value = '53';
  if (protocol === 'TCP' && portInput.value === '53') portInput.value = '80';
}

async function runTrace(event) {
  event?.preventDefault();
  if (sourceSelect.value === destinationSelect.value) {
    showToast('Choose two different endpoint devices.');
    return;
  }
  clearInterval(traceTimer);
  runButton.disabled = true;
  document.querySelector('#run-label').textContent = 'Tracing packet…';
  try {
    const body = {
      source: sourceSelect.value,
      destination: destinationSelect.value,
      protocol: protocolSelect.value,
    };
    if (protocolSelect.value !== 'ICMP') body.destinationPort = Number(portInput.value);
    const response = await fetch('/api/trace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const trace = await response.json();
    if (!response.ok) throw new Error(trace.error || 'Packet trace failed.');
    currentTrace = trace;
    traceSessionCount += 1;
    document.querySelector('#trace-count').textContent = traceSessionCount;
    renderTrace(trace, 0);
    drawTopology(trace.path, 0);
    await playTrace(trace);
    fetchHistory();
  } catch (error) {
    showToast(error.message || 'Could not reach the packet tracing backend.');
  } finally {
    runButton.disabled = false;
    document.querySelector('#run-label').textContent = 'Run packet trace';
  }
}

async function playTrace(trace) {
  const steps = trace.hops.length;
  for (let index = 0; index <= steps; index++) {
    if (currentTrace?.id !== trace.id) return;
    const pathIndex = Math.min(index, trace.path.length - 1);
    drawTopology(trace.path, pathIndex);
    renderTrace(trace, index);
    await sleep(index === steps ? 250 : 720);
  }
}

async function fetchHistory() {
  try {
    const response = await fetch('/api/traces');
    const data = await response.json();
    renderHistory(data.traces || []);
  } catch {
    // A history refresh failure does not affect the packet trace already shown.
  }
}

async function loadLab() {
  try {
    const response = await fetch('/api/topology');
    if (!response.ok) throw new Error('Could not load the network topology.');
    network = await response.json();
    populateDevices();
    renderStats();
    renderVlans();
    drawTopology();
    await fetchHistory();
  } catch (error) {
    showToast(error.message || 'Could not load the lab backend.');
  }
}

document.querySelector('#trace-form').addEventListener('submit', runTrace);
document.querySelector('#swap-button').addEventListener('click', () => {
  const source = sourceSelect.value;
  sourceSelect.value = destinationSelect.value;
  destinationSelect.value = source;
  drawTopology();
});
protocolSelect.addEventListener('change', syncProtocol);
sourceSelect.addEventListener('change', drawTopology);
destinationSelect.addEventListener('change', drawTopology);
document.querySelectorAll('.quick-flow').forEach(button => {
  button.addEventListener('click', () => {
    sourceSelect.value = button.dataset.source;
    destinationSelect.value = button.dataset.destination;
    protocolSelect.value = button.dataset.protocol;
    if (button.dataset.port) portInput.value = button.dataset.port;
    syncProtocol();
    drawTopology();
    runTrace();
  });
});
document.querySelector('#clear-button').addEventListener('click', () => {
  clearInterval(traceTimer);
  currentTrace = null;
  document.querySelector('#trace-result').classList.add('hidden');
  document.querySelector('#trace-empty').classList.remove('hidden');
  drawTopology();
});
document.querySelector('#refresh-button').addEventListener('click', loadLab);
document.querySelector('#fit-button').addEventListener('click', () => {
  const map = document.querySelector('#map-wrap');
  map.scrollTo({ left: 0, top: 0, behavior: 'smooth' });
  svg.style.width = '100%';
});

loadLab();
