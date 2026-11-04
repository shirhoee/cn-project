/**
 * DeepDiveController: Interactive Static vs. Dynamic SDN Comparison Engine
 * Featuring interactive Before/After split drag slider, dual animated simulation canvases,
 * packet loss dissipation effects, and detailed architectural feature comparison.
 */

class DeepDiveController {
  constructor() {
    this.container = document.getElementById('deepDiveView');
    this.activeScenario = 'link_fail'; // 'link_fail' | 'overload'
    this.splitPercent = 50; // 0 to 100%
    this.isDragging = false;
    this.animTime = 0;
    this.animRunning = true;

    this.staticCanvas = document.getElementById('deepDiveStaticCanvas');
    this.dynamicCanvas = document.getElementById('deepDiveDynamicCanvas');

    if (this.staticCanvas && this.dynamicCanvas) {
      this.staticCtx = this.staticCanvas.getContext('2d');
      this.dynamicCtx = this.dynamicCanvas.getContext('2d');
    }

    this.bindEvents();
    this.initSlider();
    this.startLoop();
  }

  bindEvents() {
    // Scenario tabs
    const scenButtons = document.querySelectorAll('.scenario-tab-btn');
    scenButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        scenButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeScenario = btn.dataset.scenario || 'link_fail';
        this.animTime = 0;
        this.updateScenarioText();
      });
    });

    // Handle window resize for canvases
    window.addEventListener('resize', () => {
      this.resizeCanvases();
    });
    this.resizeCanvases();
  }

  resizeCanvases() {
    if (!this.staticCanvas || !this.dynamicCanvas) return;
    const parent = this.staticCanvas.parentElement;
    if (!parent) return;

    const rect = parent.getBoundingClientRect();
    const w = Math.max(300, Math.floor(rect.width));
    const h = 340;
    const dpr = window.devicePixelRatio || 1;

    [this.staticCanvas, this.dynamicCanvas].forEach(can => {
      can.width = w * dpr;
      can.height = h * dpr;
      can.style.width = w + 'px';
      can.style.height = h + 'px';
      const ctx = can.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    });
  }

  initSlider() {
    const sliderContainer = document.getElementById('splitCompareContainer');
    const divider = document.getElementById('splitDivider');
    const staticPane = document.getElementById('splitStaticPane');
    if (!sliderContainer || !divider || !staticPane) return;

    const updateSplit = (clientX) => {
      const rect = sliderContainer.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const pct = Math.max(15, Math.min(85, (x / rect.width) * 100));
      this.splitPercent = pct;
      divider.style.left = `${pct}%`;
      staticPane.style.width = `${pct}%`;
    };

    divider.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      updateSplit(e.clientX);
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    // Touch events for mobile/tablet
    divider.addEventListener('touchstart', (e) => {
      this.isDragging = true;
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (!this.isDragging || !e.touches[0]) return;
      updateSplit(e.touches[0].clientX);
    }, { passive: true });

    window.addEventListener('touchend', () => {
      this.isDragging = false;
    });
  }

  updateScenarioText() {
    const titleEl = document.getElementById('deepDiveScenarioTitle');
    const descEl = document.getElementById('deepDiveScenarioDesc');
    const staticBanner = document.getElementById('staticResultBanner');
    const dynamicBanner = document.getElementById('dynamicResultBanner');

    if (this.activeScenario === 'link_fail') {
      if (titleEl) titleEl.textContent = 'Scenario 1: Primary Link Failure (s1-s2 Severed)';
      if (descEl) descEl.textContent = 'Demonstrates behavior when the core aggregation link s1-s2 is pulled down. Static networks stall indefinitely, whereas Dynamic SDN recalculates and installs OpenFlow Priority-20 backup routes in < 2.5ms.';
      if (staticBanner) staticBanner.innerHTML = '<span class="status-badge badge-err">❌ 100% PACKET LOSS</span> Primary link drops. Static forwarding tables lack alternate routes. TCP SYN times out (2002ms).';
      if (dynamicBanner) dynamicBanner.innerHTML = '<span class="status-badge badge-ok">✅ 0% PACKET LOSS</span> PortStatus event triggers Priority-20 flow mods over backup corridor s2-s3 in &lt; 2.5ms.';
    } else {
      if (titleEl) titleEl.textContent = 'Scenario 2: Server 1 Concurrency Overload (Traffic Surge)';
      if (descEl) descEl.textContent = 'Demonstrates behavior when Server 1 active TCP connections reach threshold. Static networks continue flooding Server 1 causing connection resets, whereas Dynamic SDN executes wire-speed NAT header rewriting to replica Server 2.';
      if (staticBanner) staticBanner.innerHTML = '<span class="status-badge badge-err">❌ SERVICE CRASH / REFUSED</span> Server 1 connection queue overflows. Client connections stall or throw ECONNREFUSED.';
      if (dynamicBanner) dynamicBanner.innerHTML = '<span class="status-badge badge-ok">✅ ZERO DOWNTIME NAT</span> Northbound REST alert installs Priority-20 NAT flow mod on s1, transparently proxying requests to Server 2.';
    }
  }

  startLoop() {
    const loop = (timestamp) => {
      if (this.container && !this.container.classList.contains('hidden')) {
        this.animTime += 0.016;
        this.renderSimulations();
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  renderSimulations() {
    this.renderStaticPane();
    this.renderDynamicPane();
  }

  renderStaticPane() {
    if (!this.staticCtx || !this.staticCanvas) return;
    const ctx = this.staticCtx;
    const w = parseFloat(this.staticCanvas.style.width) || 450;
    const h = parseFloat(this.staticCanvas.style.height) || 340;
    ctx.clearRect(0, 0, w, h);

    // Common nodes relative positioning
    const s1 = { x: w * 0.50, y: h * 0.22, name: 's1 (Core)' };
    const s2 = { x: w * 0.25, y: h * 0.55, name: 's2 (Server)' };
    const s3 = { x: w * 0.75, y: h * 0.55, name: 's3 (Client)' };
    const srv1 = { x: w * 0.16, y: h * 0.84, name: 'server1' };
    const cli1 = { x: w * 0.84, y: h * 0.84, name: 'client1' };

    // Draw conduits
    this.drawConduit(ctx, s1, s3, '#0a84ff', 2);
    this.drawConduit(ctx, s2, srv1, 'rgba(235, 235, 245, 0.3)', 1.5);
    this.drawConduit(ctx, s3, cli1, 'rgba(235, 235, 245, 0.3)', 1.5);

    // Link s1-s2: Severed in link_fail scenario, normal in overload
    if (this.activeScenario === 'link_fail') {
      this.drawSeveredLink(ctx, s1, s2);
    } else {
      this.drawConduit(ctx, s1, s2, '#0a84ff', 2);
    }

    // Backup link in Static is dead/unconfigured
    this.drawDashedLine(ctx, s2, s3, 'rgba(142, 142, 147, 0.35)');
    this.drawTinyBadge(ctx, (s2.x + s3.x) / 2, s2.y - 10, 'UNCONFIGURED', '#8e8e93');

    // Draw packets
    const cycle = (this.animTime % 2.5) / 2.5; // 0 to 1
    if (this.activeScenario === 'link_fail') {
      // Packet travels s3 -> s1, then drops at s1 because s1-s2 is dead
      if (cycle < 0.45) {
        // Traveling cli1 -> s3 -> s1
        const t = cycle / 0.45;
        const px = cli1.x + (s1.x - cli1.x) * t;
        const py = cli1.y + (s1.y - cli1.y) * t;
        this.drawPacket(ctx, px, py, '#64d2ff', 4);
      } else {
        // Drop explosion at s1
        const dropT = (cycle - 0.45) / 0.55;
        const dropRadius = 6 + dropT * 26;
        const alpha = Math.max(0, 1 - dropT);
        ctx.save();
        ctx.strokeStyle = `rgba(255, 69, 58, ${alpha})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(s1.x - 12, s1.y + 12, dropRadius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = `rgba(255, 69, 58, ${alpha})`;
        ctx.font = '700 9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('❌ DROPPED (TIMEOUT)', s1.x - 20, s1.y + 40 + dropT * 10);
        ctx.restore();
      }
    } else {
      // Overload scenario: All traffic sent to Server 1 blindly, Server 1 overflows
      const t = cycle;
      let px, py;
      if (t < 0.4) {
        px = cli1.x + (s1.x - cli1.x) * (t / 0.4);
        py = cli1.y + (s1.y - cli1.y) * (t / 0.4);
      } else if (t < 0.75) {
        px = s1.x + (s2.x - s1.x) * ((t - 0.4) / 0.35);
        py = s1.y + (s2.y - s1.y) * ((t - 0.4) / 0.35);
      } else {
        px = s2.x + (srv1.x - s2.x) * ((t - 0.75) / 0.25);
        py = s2.y + (srv1.y - s2.y) * ((t - 0.75) / 0.25);
      }
      this.drawPacket(ctx, px, py, '#ff453a', 4);
    }

    // Draw switch and host nodes
    [s1, s2, s3].forEach(sw => this.drawSimSwitch(ctx, sw));
    this.drawSimHost(ctx, srv1, this.activeScenario === 'overload' ? '#ff453a' : '#30d158', this.activeScenario === 'overload' ? 'OVERFLOW' : '.11');
    this.drawSimHost(ctx, cli1, '#ff9f0a', '.21');
  }

  renderDynamicPane() {
    if (!this.dynamicCtx || !this.dynamicCanvas) return;
    const ctx = this.dynamicCtx;
    const w = parseFloat(this.dynamicCanvas.style.width) || 450;
    const h = parseFloat(this.dynamicCanvas.style.height) || 340;
    ctx.clearRect(0, 0, w, h);

    const s1 = { x: w * 0.50, y: h * 0.22, name: 's1 (Core)' };
    const s2 = { x: w * 0.25, y: h * 0.55, name: 's2 (Server)' };
    const s3 = { x: w * 0.75, y: h * 0.55, name: 's3 (Client)' };
    const srv1 = { x: w * 0.16, y: h * 0.84, name: 'server1' };
    const srv2 = { x: w * 0.34, y: h * 0.84, name: 'server2' };
    const cli1 = { x: w * 0.84, y: h * 0.84, name: 'client1' };

    this.drawConduit(ctx, s1, s3, '#0a84ff', 2);
    this.drawConduit(ctx, s2, srv1, 'rgba(235, 235, 245, 0.3)', 1.5);
    this.drawConduit(ctx, s2, srv2, 'rgba(235, 235, 245, 0.3)', 1.5);
    this.drawConduit(ctx, s3, cli1, 'rgba(235, 235, 245, 0.3)', 1.5);

    const cycle = (this.animTime % 2.0) / 2.0;

    if (this.activeScenario === 'link_fail') {
      // Primary link severed
      this.drawSeveredLink(ctx, s1, s2);

      // Active Dynamic Backup Corridor glowing cyan
      this.drawConduit(ctx, s2, s3, '#64d2ff', 3.5);
      this.drawTinyBadge(ctx, (s2.x + s3.x) / 2, s2.y - 12, 'ACTIVE FAILOVER', '#64d2ff');

      // Packet flows cli1 -> s3 -> s2 (via backup) -> srv1
      let px, py;
      if (cycle < 0.25) {
        px = cli1.x + (s3.x - cli1.x) * (cycle / 0.25);
        py = cli1.y + (s3.y - cli1.y) * (cycle / 0.25);
      } else if (cycle < 0.70) {
        px = s3.x + (s2.x - s3.x) * ((cycle - 0.25) / 0.45);
        py = s3.y + (s2.y - s3.y) * ((cycle - 0.25) / 0.45);
      } else {
        px = s2.x + (srv1.x - s2.x) * ((cycle - 0.70) / 0.30);
        py = s2.y + (srv1.y - s2.y) * ((cycle - 0.70) / 0.30);
      }
      this.drawPacket(ctx, px, py, '#64d2ff', 4.5);

    } else {
      // Overload Scenario: Core s1 rewrites headers and redirects amber packets to Server 2
      this.drawConduit(ctx, s1, s2, '#0a84ff', 2);
      this.drawDashedLine(ctx, s2, s3, 'rgba(142, 142, 147, 0.3)');

      let px, py;
      let pColor = '#64d2ff';
      if (cycle < 0.35) {
        px = cli1.x + (s1.x - cli1.x) * (cycle / 0.35);
        py = cli1.y + (s1.y - cli1.y) * (cycle / 0.35);
      } else if (cycle < 0.70) {
        // Rewritten on s1 to amber NAT packet
        pColor = '#ff9f0a';
        px = s1.x + (s2.x - s1.x) * ((cycle - 0.35) / 0.35);
        py = s1.y + (s2.y - s1.y) * ((cycle - 0.35) / 0.35);
      } else {
        pColor = '#ff9f0a';
        px = s2.x + (srv2.x - s2.x) * ((cycle - 0.70) / 0.30);
        py = s2.y + (srv2.y - s2.y) * ((cycle - 0.70) / 0.30);
      }
      this.drawPacket(ctx, px, py, pColor, 4.5);

      // NAT Callout Badge on s1
      this.drawTinyBadge(ctx, s1.x, s1.y - 18, 'NAT REDIRECT (PRI 20)', '#ff9f0a');
    }

    [s1, s2, s3].forEach(sw => this.drawSimSwitch(ctx, sw));
    this.drawSimHost(ctx, srv1, '#30d158', '.11');
    this.drawSimHost(ctx, srv2, '#5e5ce6', '.12 (Replica)');
    this.drawSimHost(ctx, cli1, '#ff9f0a', '.21');
  }

  drawConduit(ctx, from, to, color, width) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.restore();
  }

  drawDashedLine(ctx, from, to, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.restore();
  }

  drawSeveredLink(ctx, from, to) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 69, 58, 0.7)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    ctx.lineTo(midX - 10, midY - 6);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(midX + 10, midY + 6);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();

    // Red X severed marker
    ctx.strokeStyle = '#ff453a';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(midX - 7, midY - 7);
    ctx.lineTo(midX + 7, midY + 7);
    ctx.moveTo(midX + 7, midY - 7);
    ctx.lineTo(midX - 7, midY + 7);
    ctx.stroke();
    ctx.restore();
  }

  drawPacket(ctx, x, y, color, radius) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawSimSwitch(ctx, sw) {
    ctx.save();
    const size = 30;
    ctx.fillStyle = '#1c1c1e';
    ctx.strokeStyle = '#0a84ff';
    ctx.lineWidth = 1.5;
    this.roundRect(ctx, sw.x - size / 2, sw.y - size / 2, size, size, 7, true, true);

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 9px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(sw.name.split(' ')[0], sw.x, sw.y);
    ctx.restore();
  }

  drawSimHost(ctx, h, color, sub) {
    ctx.save();
    ctx.fillStyle = '#1c1c1e';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(h.x, h.y, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(h.x, h.y, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(235, 235, 245, 0.8)';
    ctx.font = '600 8.5px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(h.name, h.x, h.y + 22);

    ctx.fillStyle = 'rgba(235, 235, 245, 0.5)';
    ctx.font = '500 7.5px monospace';
    ctx.fillText(sub, h.x, h.y + 31);
    ctx.restore();
  }

  drawTinyBadge(ctx, x, y, text, color) {
    ctx.save();
    ctx.font = '700 7.5px -apple-system, sans-serif';
    const bw = ctx.measureText(text).width + 8;
    ctx.fillStyle = 'rgba(20, 20, 24, 0.9)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.8;
    this.roundRect(ctx, x - bw / 2, y - 7, bw, 14, 4, true, true);

    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  roundRect(ctx, x, y, width, height, radius, fill = true, stroke = false) {
    if (height < radius) radius = Math.max(0, height);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height);
    ctx.lineTo(x, y + height);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }
}

// Instantiate on load
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', () => {
    window.deepDiveController = new DeepDiveController();
  });
} else {
  window.deepDiveController = new DeepDiveController();
}
