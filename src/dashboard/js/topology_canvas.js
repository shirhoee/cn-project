/**
 * TopologyCanvas: Presentation-Grade 60 FPS HTML5 Canvas SDN Topology & Packet Flow Engine
 * Supports DPR crispness, dynamic proportional layout, port badges, and particle streams.
 */
class TopologyCanvas {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.container = this.canvas.parentElement;
    this.ctx = this.canvas.getContext('2d');
    this.animationRunning = true;
    this.particles = [];
    this.pulseAngle = 0;
    this.dpr = window.devicePixelRatio || 1;
    this.width = 920;
    this.height = 580;

    // Node definitions using normalized relative coordinates (nx, ny in [0, 1])
    this.nodeDefs = {
      s1: { id: 's1', dpid: 1, type: 'switch', label: 's1 (Core)', role: 'Core Switch', nx: 0.50, ny: 0.16, radius: 28, color: '#38bdf8' },
      s2: { id: 's2', dpid: 2, type: 'switch', label: 's2 (Servers)', role: 'Server Switch', nx: 0.24, ny: 0.44, radius: 26, color: '#38bdf8' },
      s3: { id: 's3', dpid: 3, type: 'switch', label: 's3 (Clients)', role: 'Client Switch', nx: 0.76, ny: 0.44, radius: 26, color: '#38bdf8' },
      server1: { id: 'server1', ip: '10.0.0.11', mac: '00:00:00:00:00:0b', type: 'server', label: 'server1', sub: '10.0.0.11', nx: 0.14, ny: 0.80, radius: 22, color: '#10b981' },
      server2: { id: 'server2', ip: '10.0.0.12', mac: '00:00:00:00:00:0c', type: 'server', label: 'server2', sub: '10.0.0.12 (Replica)', nx: 0.34, ny: 0.80, radius: 22, color: '#818cf8' },
      client1: { id: 'client1', ip: '10.0.0.21', mac: '00:00:00:00:00:15', type: 'client', label: 'client1', sub: '10.0.0.21', nx: 0.62, ny: 0.80, radius: 20, color: '#f59e0b' },
      client2: { id: 'client2', ip: '10.0.0.22', mac: '00:00:00:00:00:16', type: 'client', label: 'client2', sub: '10.0.0.22', nx: 0.76, ny: 0.80, radius: 20, color: '#f59e0b' },
      client3: { id: 'client3', ip: '10.0.0.23', mac: '00:00:00:00:00:17', type: 'client', label: 'client3', sub: '10.0.0.23', nx: 0.90, ny: 0.80, radius: 20, color: '#f59e0b' }
    };

    this.nodes = {};

    // Telemetry state
    this.state = {
      failoverActive: false,
      natRedirectActive: false,
      linkS1S2Down: false,
      server1Overload: false,
      servers: {},
      hoveredNode: null,
      flowTotals: {}
    };

    // Animation & transition states
    this.ripples = [];
    this.dashOffset = 0;
    this.linkTransitionS1S2 = 0.0; // 0 = UP, 1 = DOWN
    this.lastFlowTotals = {};
    this.lastFailover = false;
    this.lastOverload = false;
    this.traceSource = null;
    this.traceTarget = null;

    // Auto-resize with DPR scaling
    this.resize();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);

    this.bindEvents();
    this.startLoop();
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.width = rect.width || 920;
    this.height = Math.max(rect.height || 580, 520);

    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;

    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.updateNodePositions();
  }

  updateNodePositions() {
    for (const key in this.nodeDefs) {
      const def = this.nodeDefs[key];
      this.nodes[key] = {
        ...def,
        x: def.nx * this.width,
        y: def.ny * this.height
      };
    }
  }

  bindEvents() {
    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      let hovered = null;
      for (const key in this.nodes) {
        const n = this.nodes[key];
        const dist = Math.hypot(mouseX - n.x, mouseY - n.y);
        if (dist <= n.radius + 12) {
          hovered = n;
          break;
        }
      }
      this.state.hoveredNode = hovered;
      this.canvas.style.cursor = hovered ? 'pointer' : 'default';
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.state.hoveredNode = null;
    });

    this.canvas.addEventListener('click', () => {
      const h = this.state.hoveredNode;
      if (h) {
        if (h.dpid) {
          if (window.app && window.app.selectSwitchTab) {
            window.app.selectSwitchTab(h.dpid);
          }
        } else if (h.type === 'client') {
          this.traceSource = h;
          if (window.toasts) window.toasts.show('Trace Hop Mode', `Selected ${h.label}. Now click a destination server to trace path!`, 'info', 3000);
        } else if (h.type === 'server' && this.traceSource) {
          this.traceTarget = h;
          if (window.toasts) window.toasts.show('Path Traced', `Showing active forwarding path: ${this.traceSource.label} ➔ ${h.label}`, 'success', 4000);
        }
      } else {
        // Clear trace on background click
        this.traceSource = null;
        this.traceTarget = null;
      }
    });
  }

  triggerRipple(x, y, color = '#38bdf8') {
    this.ripples.push({
      x,
      y,
      radius: 24,
      maxRadius: 65,
      color,
      alpha: 0.85
    });
  }

  updateState(telemetry) {
    if (!telemetry) return;
    const prevFailover = this.state.failoverActive;
    const prevOverload = this.state.natRedirectActive || this.state.server1Overload;
    const prevLinkDown = this.state.linkS1S2Down;

    this.state.failoverActive = !!telemetry.controller?.failover_active;
    this.state.natRedirectActive = !!telemetry.controller?.nat_redirect_active;
    this.state.linkS1S2Down = telemetry.links?.['s1-s2']?.status === 'DOWN';
    this.state.servers = telemetry.servers || {};
    this.state.server1Overload = telemetry.servers?.['10.0.0.11']?.status === 'OVERLOAD';
    this.state.flowTotals = telemetry.flow_totals || {};

    // Trigger ripple rings on state changes
    if (!prevFailover && this.state.failoverActive) {
      if (this.nodes.s2) this.triggerRipple(this.nodes.s2.x, this.nodes.s2.y, '#06b6d4');
      if (this.nodes.s3) this.triggerRipple(this.nodes.s3.x, this.nodes.s3.y, '#06b6d4');
    }
    if (!prevOverload && (this.state.natRedirectActive || this.state.server1Overload)) {
      if (this.nodes.s1) this.triggerRipple(this.nodes.s1.x, this.nodes.s1.y, '#f59e0b');
      if (this.nodes.server1) this.triggerRipple(this.nodes.server1.x, this.nodes.server1.y, '#ef4444');
    }
    if (!prevLinkDown && this.state.linkS1S2Down) {
      if (this.nodes.s1) this.triggerRipple(this.nodes.s1.x, this.nodes.s1.y, '#ef4444');
      if (this.nodes.s2) this.triggerRipple(this.nodes.s2.x, this.nodes.s2.y, '#ef4444');
    }

    // Check if flow rules increased on any switch
    for (const dpid in this.state.flowTotals) {
      const cur = this.state.flowTotals[dpid] || 0;
      const last = this.lastFlowTotals[dpid] || 0;
      if (cur > last && last > 0) {
        const sw = this.nodes[`s${dpid}`];
        if (sw) this.triggerRipple(sw.x, sw.y, cur > 5 ? '#f59e0b' : '#38bdf8');
      }
      this.lastFlowTotals[dpid] = cur;
    }
  }

  startLoop() {
    if (this.loopRunning) return;
    this.loopRunning = true;
    let lastSpawn = 0;
    const animate = (timestamp) => {
      if (!this.loopRunning) return;
      this.pulseAngle += 0.05;
      this.dashOffset = (this.dashOffset - 0.45) % 16;

      // Smooth link transition lerp (0 = UP, 1 = DOWN)
      const targetLink = (this.state.linkS1S2Down || this.state.failoverActive) ? 1.0 : 0.0;
      this.linkTransitionS1S2 += (targetLink - this.linkTransitionS1S2) * 0.12;

      // Spawn animated packet particles every 380ms
      if (this.animationRunning && timestamp - lastSpawn > 380) {
        this.spawnPacket();
        lastSpawn = timestamp;
      }

      this.updateParticles();
      this.render();
      requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }

  stopLoop() {
    this.loopRunning = false;
  }
    };
    requestAnimationFrame(animate);
  }

  spawnPacket() {
    const clients = ['client1', 'client2', 'client3'];
    const client = clients[Math.floor(Math.random() * clients.length)];

    const targetServer = (this.state.natRedirectActive || this.state.server1Overload) ? 'server2' : 'server1';
    const isRerouted = targetServer === 'server2';

    let path = [];
    if (this.state.failoverActive || this.state.linkS1S2Down) {
      path = [this.nodes[client], this.nodes['s3'], this.nodes['s2'], this.nodes[targetServer]];
    } else {
      path = [this.nodes[client], this.nodes['s3'], this.nodes['s1'], this.nodes['s2'], this.nodes[targetServer]];
    }

    this.particles.push({
      path,
      legIndex: 0,
      progress: 0.0,
      speed: 0.018 + Math.random() * 0.006,
      color: isRerouted ? '#f59e0b' : '#38bdf8',
      radius: isRerouted ? 4.5 : 3.8
    });
  }

  updateParticles() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.progress += p.speed;

      if (p.progress >= 1.0) {
        p.progress = 0.0;
        p.legIndex++;
        if (p.legIndex >= p.path.length - 1) {
          this.particles.splice(i, 1);
        }
      }
    }
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    // 1. Subtle Background Topology Grid & Ambient Glow
    this.drawBackground(ctx);

    // 2. Draw Network Links with Port Badges
    this.drawLinks(ctx);

    // 2.5 Draw Interactive Path Trace if Active
    this.drawPathTrace(ctx);

    // 3. Draw Packet Particles
    if (this.animationRunning) {
      this.drawParticles(ctx);
    }

    // 4. Draw Nodes (Switches, Servers, Clients)
    this.drawNodes(ctx);

    // 5. Draw Active Ripple Rings
    this.drawRipples(ctx);

    // 6. Draw Tooltips
    if (this.state.hoveredNode) {
      this.drawTooltip(ctx, this.state.hoveredNode);
    }
  }

  drawRipples(ctx) {
    if (this.ripples.length === 0) return;
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.radius += 1.3;
      r.alpha -= 0.022;

      if (r.alpha <= 0 || r.radius >= r.maxRadius) {
        this.ripples.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 2.2;
      ctx.globalAlpha = Math.max(0, r.alpha);
      ctx.shadowColor = r.color;
      ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.restore();
    }
  }

  drawPathTrace(ctx) {
    if (!this.traceSource || !this.traceTarget) return;
    let hops = [];
    if (this.state.failoverActive || this.state.linkS1S2Down) {
      hops = [this.traceSource, this.nodes.s3, this.nodes.s2, this.traceTarget];
    } else {
      hops = [this.traceSource, this.nodes.s3, this.nodes.s1, this.nodes.s2, this.traceTarget];
    }

    ctx.save();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 4.5;
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 18;
    ctx.setLineDash([8, 8]);
    ctx.lineDashOffset = this.dashOffset * 2.2;
    ctx.beginPath();
    ctx.moveTo(hops[0].x, hops[0].y);
    for (let i = 1; i < hops.length; i++) {
      if (hops[i]) ctx.lineTo(hops[i].x, hops[i].y);
    }
    ctx.stroke();

    // Draw active source & target highlight rings
    for (const ep of [this.traceSource, this.traceTarget]) {
      if (ep) {
        ctx.beginPath();
        ctx.arc(ep.x, ep.y, ep.radius + 6, 0, Math.PI * 2);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawBackground(ctx) {
    // Soft radial glow behind core switch s1
    const s1 = this.nodes.s1;
    if (s1) {
      const grad = ctx.createRadialGradient(s1.x, s1.y, 10, s1.x, s1.y, 220);
      grad.addColorStop(0, 'rgba(56, 189, 248, 0.08)');
      grad.addColorStop(0.6, 'rgba(56, 189, 248, 0.02)');
      grad.addColorStop(1, 'rgba(7, 10, 18, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, this.width, this.height);
    }
  }

  drawLinks(ctx) {
    const s1 = this.nodes.s1;
    const s2 = this.nodes.s2;
    const s3 = this.nodes.s3;
    if (!s1 || !s2 || !s3) return;

    // Link s1-s2 (Primary with smooth transition lerp)
    if (this.linkTransitionS1S2 > 0.1) {
      const alpha = 0.35 + 0.65 * Math.abs(Math.sin(this.pulseAngle));
      this.drawLinkLine(ctx, s1, s2, `rgba(239, 68, 68, ${alpha})`, 3, [8, 8]);
      this.drawLinkBadge(ctx, (s1.x + s2.x) / 2, (s1.y + s2.y) / 2 - 12, 'SEVERED', '#ef4444');
    } else {
      this.drawLinkLine(ctx, s1, s2, 'rgba(56, 189, 248, 0.75)', 3);
    }
    // Port badges for s1-s2
    this.drawPortBadgeAlong(ctx, s1, s2, 0.28, 's1:1');
    this.drawPortBadgeAlong(ctx, s1, s2, 0.72, 's2:1');

    // Link s1-s3 (Primary)
    this.drawLinkLine(ctx, s1, s3, 'rgba(56, 189, 248, 0.75)', 3);
    this.drawPortBadgeAlong(ctx, s1, s3, 0.28, 's1:2');
    this.drawPortBadgeAlong(ctx, s1, s3, 0.72, 's3:1');

    // Link s2-s3 (Backup Corridor with Marching Dashes & Travelling Glow)
    if (this.state.failoverActive || this.state.linkS1S2Down) {
      const pulseWidth = 3.5 + 1.5 * Math.abs(Math.sin(this.pulseAngle * 1.5));
      this.drawGlowLine(ctx, s2, s3, '#06b6d4', pulseWidth);
      
      // Travelling photon pulse along active corridor
      const sweepT = (Math.sin(this.pulseAngle * 1.8) + 1) / 2;
      const sweepX = s2.x + (s3.x - s2.x) * sweepT;
      const sweepY = s2.y + (s3.y - s2.y) * sweepT;
      ctx.save();
      ctx.beginPath();
      ctx.arc(sweepX, sweepY, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#06b6d4';
      ctx.shadowBlur = 18;
      ctx.fill();
      ctx.restore();

      this.drawLinkBadge(ctx, (s2.x + s3.x) / 2, s2.y - 20, 'FAILOVER ACTIVE', '#06b6d4');
    } else {
      // Marching dashes when on standby
      ctx.save();
      ctx.lineDashOffset = this.dashOffset;
      this.drawLinkLine(ctx, s2, s3, 'rgba(100, 116, 139, 0.45)', 2, [6, 6]);
      ctx.restore();
      this.drawLinkBadge(ctx, (s2.x + s3.x) / 2, s2.y - 18, 'STANDBY', '#64748b');
    }
    this.drawPortBadgeAlong(ctx, s2, s3, 0.24, 's2:4');
    this.drawPortBadgeAlong(ctx, s2, s3, 0.76, 's3:5');

    // Server Links to s2
    this.drawLinkLine(ctx, s2, this.nodes.server1, 'rgba(148, 163, 184, 0.5)', 2);
    this.drawPortBadgeAlong(ctx, s2, this.nodes.server1, 0.42, 's2:2');

    this.drawLinkLine(ctx, s2, this.nodes.server2, 'rgba(148, 163, 184, 0.5)', 2);
    this.drawPortBadgeAlong(ctx, s2, this.nodes.server2, 0.42, 's2:3');

    // Client Links to s3
    this.drawLinkLine(ctx, s3, this.nodes.client1, 'rgba(148, 163, 184, 0.5)', 2);
    this.drawPortBadgeAlong(ctx, s3, this.nodes.client1, 0.42, 's3:2');

    this.drawLinkLine(ctx, s3, this.nodes.client2, 'rgba(148, 163, 184, 0.5)', 2);
    this.drawPortBadgeAlong(ctx, s3, this.nodes.client2, 0.42, 's3:3');

    this.drawLinkLine(ctx, s3, this.nodes.client3, 'rgba(148, 163, 184, 0.5)', 2);
    this.drawPortBadgeAlong(ctx, s3, this.nodes.client3, 0.42, 's3:4');
  }

  drawPortBadgeAlong(ctx, from, to, t, label) {
    if (!from || !to) return;
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t;

    ctx.save();
    ctx.font = '600 9.5px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    const textW = ctx.measureText(label).width;
    const padX = 5;
    const h = 14;

    ctx.fillStyle = 'rgba(8, 13, 25, 0.88)';
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.lineWidth = 1;
    this.roundRect(ctx, x - textW / 2 - padX, y - h / 2, textW + padX * 2, h, 4, true, true);

    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y);
    ctx.restore();
  }

  drawLinkLine(ctx, from, to, color, width, dash = []) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.restore();
  }

  drawGlowLine(ctx, from, to, color, width) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.restore();
  }

  drawLinkBadge(ctx, x, y, text, color) {
    ctx.save();
    ctx.font = '700 9.5px system-ui, -apple-system, sans-serif';
    const textWidth = ctx.measureText(text).width;
    const w = textWidth + 12;
    const h = 17;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    this.roundRect(ctx, x - w / 2, y - h / 2, w, h, 4, true, true);

    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  drawParticles(ctx) {
    ctx.save();
    for (const p of this.particles) {
      const from = p.path[p.legIndex];
      const to = p.path[p.legIndex + 1];
      if (!from || !to) continue;

      const curX = from.x + (to.x - from.x) * p.progress;
      const curY = from.y + (to.y - from.y) * p.progress;

      // Draw 2 trailing sub-particles for glowing tail
      for (let t = 2; t >= 1; t--) {
        const trailProg = Math.max(0, p.progress - t * 0.024);
        const tx = from.x + (to.x - from.x) * trailProg;
        const ty = from.y + (to.y - from.y) * trailProg;
        ctx.beginPath();
        ctx.arc(tx, ty, p.radius * (1 - t * 0.28), 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = 0.35 / t;
        ctx.fill();
        ctx.globalAlpha = 1.0;
      }

      // Outer glow
      ctx.beginPath();
      ctx.arc(curX, curY, p.radius * 2, 0, Math.PI * 2);
      ctx.fillStyle = p.color === '#f59e0b' ? 'rgba(245, 158, 11, 0.35)' : 'rgba(56, 189, 248, 0.35)';
      ctx.fill();

      // Core particle
      ctx.beginPath();
      ctx.arc(curX, curY, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.fill();
    }
    ctx.restore();
  }

  drawNodes(ctx) {
    for (const key in this.nodes) {
      const n = this.nodes[key];
      const isHovered = this.state.hoveredNode === n;

      ctx.save();
      if (this.state.hoveredNode && !isHovered) {
        ctx.globalAlpha = 0.55;
      }

      if (n.type === 'switch') {
        const size = n.radius * 2;
        ctx.fillStyle = '#0b1329';
        ctx.strokeStyle = isHovered ? '#ffffff' : n.color;
        ctx.lineWidth = isHovered ? 3 : 2;
        ctx.shadowColor = n.color;
        ctx.shadowBlur = isHovered ? 22 : 12;

        this.roundRect(ctx, n.x - size / 2, n.y - size / 2, size, size, 8, true, true);

        ctx.fillStyle = '#ffffff';
        ctx.font = '700 12px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(n.id.toUpperCase(), n.x, n.y - 3);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
        ctx.font = '600 8.5px ui-monospace, monospace';
        ctx.fillText('OF1.3', n.x, n.y + 9);

      } else if (n.type === 'server') {
        const isOverload = n.id === 'server1' && this.state.server1Overload;
        const color = isOverload ? '#ef4444' : n.color;

        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#0b1329';
        ctx.fill();
        ctx.strokeStyle = isHovered ? '#ffffff' : color;
        ctx.lineWidth = isHovered ? 3 : 2;
        ctx.shadowColor = color;
        ctx.shadowBlur = isOverload ? 22 : 10;
        ctx.stroke();

        ctx.fillStyle = color;
        ctx.font = '700 11px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('SRV', n.x, n.y);

        if (isOverload) {
          this.drawMiniBadge(ctx, n.x, n.y - n.radius - 10, 'OVERLOAD', '#ef4444');
        } else if (n.id === 'server2' && this.state.natRedirectActive) {
          this.drawMiniBadge(ctx, n.x, n.y - n.radius - 10, 'ACTIVE TARGET', '#38bdf8');
        }

      } else if (n.type === 'client') {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#0b1329';
        ctx.fill();
        ctx.strokeStyle = isHovered ? '#ffffff' : n.color;
        ctx.lineWidth = isHovered ? 2.8 : 1.8;
        ctx.shadowColor = n.color;
        ctx.shadowBlur = 8;
        ctx.stroke();

        ctx.fillStyle = n.color;
        ctx.font = '700 10px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('CLI', n.x, n.y);
      }

      // Enhanced Node Label Pill (>= 13px font with rounded pill backdrop & shadow)
      ctx.save();
      ctx.font = '600 13px system-ui, -apple-system, sans-serif';
      const labelText = n.label;
      const nameW = ctx.measureText(labelText).width;
      const subText = n.sub;
      let subW = 0;
      if (subText) {
        ctx.font = '500 10.5px ui-monospace, monospace';
        subW = ctx.measureText(subText).width;
      }
      const pillW = Math.max(nameW, subW) + 18;
      const pillH = subText ? 33 : 22;
      const pillX = n.x - pillW / 2;
      const pillY = n.y + n.radius + 7;

      ctx.fillStyle = 'rgba(10, 16, 31, 0.88)';
      ctx.strokeStyle = isHovered ? n.color : 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 1;
      this.roundRect(ctx, pillX, pillY, pillW, pillH, 6, true, true);

      // Primary label text
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.font = '600 13px system-ui, -apple-system, sans-serif';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
      ctx.shadowBlur = 3;
      ctx.fillText(labelText, n.x, pillY + (subText ? 3 : 4));

      // IP / Role subtitle text
      if (subText) {
        ctx.shadowBlur = 0;
        ctx.font = '500 10.5px ui-monospace, SFMono-Regular, Consolas, monospace';
        ctx.fillStyle = (n.id === 'server1' && this.state.server1Overload) ? '#f87171' : '#94a3b8';
        ctx.fillText(subText, n.x, pillY + 18);
      }
      ctx.restore();

      ctx.restore();
    }
  }

  drawMiniBadge(ctx, x, y, text, color) {
    ctx.save();
    ctx.font = '700 8.5px system-ui, -apple-system, sans-serif';
    const w = ctx.measureText(text).width + 10;
    const h = 14;
    ctx.fillStyle = color;
    this.roundRect(ctx, x - w / 2, y - h / 2, w, h, 3, true, false);
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  drawTooltip(ctx, node) {
    ctx.save();
    const pad = 10;
    const lines = [
      `Node: ${node.label} (${node.type.toUpperCase()})`,
      node.ip ? `IP Address: ${node.ip}` : `OpenFlow Switch DPID: ${node.dpid}`,
      node.mac ? `MAC: ${node.mac}` : `Rules: ${this.state.flowTotals[node.dpid] || 'Active'} flows`,
      node.type === 'switch' ? 'Click to inspect Hardware Flow Table' : `Status: ${node.id === 'server1' && this.state.server1Overload ? 'OVERLOAD' : 'ACTIVE'}`
    ];
    ctx.font = '500 11px system-ui, -apple-system, sans-serif';
    let maxW = 0;
    lines.forEach(l => { maxW = Math.max(maxW, ctx.measureText(l).width); });

    const tw = maxW + pad * 2;
    const th = lines.length * 18 + pad;
    const tx = Math.min(this.width - tw - 15, Math.max(15, node.x + 25));
    const ty = Math.min(this.height - th - 15, Math.max(15, node.y - 20));

    ctx.fillStyle = 'rgba(11, 19, 38, 0.96)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.2;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 12;
    this.roundRect(ctx, tx, ty, tw, th, 8, true, true);

    ctx.shadowBlur = 0;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    lines.forEach((l, idx) => {
      ctx.fillStyle = idx === 0 ? '#38bdf8' : (idx === lines.length - 1 ? '#10b981' : '#f8fafc');
      ctx.font = idx === 0 ? '700 11.5px system-ui, -apple-system, sans-serif' : '500 11px system-ui, -apple-system, sans-serif';
      ctx.fillText(l, tx + pad, ty + pad / 2 + idx * 18);
    });
    ctx.restore();
  }

  roundRect(ctx, x, y, width, height, radius, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }
}
