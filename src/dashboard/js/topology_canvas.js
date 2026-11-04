/**
 * TopologyCanvas: Apple Presentation-Grade 60 FPS HTML5 Canvas SDN Topology & Packet Flow Engine
 * Milled squircle switches, multi-layer luminous conduits, photonic comet particles,
 * and macOS Quick Look glass popovers.
 */
class TopologyCanvas {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.container = this.canvas.parentElement;
    this.ctx = this.canvas.getContext('2d');

    // Static canvas layer (links, nodes, badges, labels - drawn only on change/resize)
    this.staticCanvas = document.getElementById('topoStaticCanvas');
    this.staticCtx = this.staticCanvas ? this.staticCanvas.getContext('2d') : null;
    this.cachedGradients = {};

    this.animationRunning = true;
    this.particles = [];
    this.pulseAngle = 0;
    this.dpr = window.devicePixelRatio || 1;
    this.width = 920;
    this.height = 580;

    // Node definitions using normalized relative coordinates (nx, ny in [0, 1])
    this.nodeDefs = {
      s1: { id: 's1', dpid: 1, type: 'switch', label: 's1 (Core)', role: 'Core Switch', nx: 0.50, ny: 0.16, radius: 28, color: '#0a84ff' },
      s2: { id: 's2', dpid: 2, type: 'switch', label: 's2 (Servers)', role: 'Server Switch', nx: 0.24, ny: 0.44, radius: 26, color: '#0a84ff' },
      s3: { id: 's3', dpid: 3, type: 'switch', label: 's3 (Clients)', role: 'Client Switch', nx: 0.76, ny: 0.44, radius: 26, color: '#0a84ff' },
      server1: { id: 'server1', ip: '10.0.0.11', mac: '00:00:00:00:00:0b', type: 'server', label: 'server1', sub: '10.0.0.11', nx: 0.14, ny: 0.80, radius: 22, color: '#30d158' },
      server2: { id: 'server2', ip: '10.0.0.12', mac: '00:00:00:00:00:0c', type: 'server', label: 'server2', sub: '10.0.0.12 (Replica)', nx: 0.34, ny: 0.80, radius: 22, color: '#5e5ce6' },
      client1: { id: 'client1', ip: '10.0.0.21', mac: '00:00:00:00:00:15', type: 'client', label: 'client1', sub: '10.0.0.21', nx: 0.62, ny: 0.80, radius: 20, color: '#ff9f0a' },
      client2: { id: 'client2', ip: '10.0.0.22', mac: '00:00:00:00:00:16', type: 'client', label: 'client2', sub: '10.0.0.22', nx: 0.76, ny: 0.80, radius: 20, color: '#ff9f0a' },
      client3: { id: 'client3', ip: '10.0.0.23', mac: '00:00:00:00:00:17', type: 'client', label: 'client3', sub: '10.0.0.23', nx: 0.90, ny: 0.80, radius: 20, color: '#ff9f0a' }
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
      flowTotals: {},
      memberSpotlight: null // 'shashidhar', 'shreyansh', 'shaun'
    };

    // Animation & transition states
    this.ripples = [];
    this.dashOffset = 0;
    this.linkTransitionS1S2 = 0.0; // 0 = UP, 1 = DOWN
    this.failoverTransition = 0.0;
    this.overloadTransition = 0.0;
    this.natTransition = 0.0;
    this.lastFlowTotals = {};
    this.lastFailover = false;
    this.lastOverload = false;
    this.traceSource = null;
    this.traceTarget = null;

    // Auto-resize with DPR scaling (observing CSS wrapper)
    this._appliedW = 0;
    this._appliedH = 0;
    this._appliedDpr = 0;
    this._resizePending = false;

    const rect = this.container.getBoundingClientRect();
    this.handleResize(rect.width || 920, rect.height || 580, true);

    this.resizeObserver = new ResizeObserver((entries) => {
      if (window._debugObserverFires !== undefined) window._debugObserverFires++;
      const entry = entries && entries[0];
      if (!entry) return;
      const cssW = entry.contentRect ? entry.contentRect.width : this.container.clientWidth;
      const cssH = entry.contentRect ? entry.contentRect.height : this.container.clientHeight;
      this.handleResize(cssW, cssH);
    });
    this.resizeObserver.observe(this.container);

    this.bindEvents();

    // Instant Baseline Paint (Choice 3A): Ensure static topology renders immediately on construction
    this.updateNodePositions();
    this.cacheGradients();
    this.renderStatic();
    this.render();
    // One shared rAF loop in app.js: do not self-start rAF here
  }

  handleResize(cssW, cssH, immediate = false) {
    const w = Math.round(cssW);
    const h = Math.round(cssH);
    const dpr = window.devicePixelRatio || 1;

    if (w <= 0 || h <= 0) return;
    if (w === this._appliedW && h === this._appliedH && dpr === this._appliedDpr) return;

    this._nextW = w;
    this._nextH = h;
    this._nextDpr = dpr;

    if (immediate) {
      this._applyResize();
      return;
    }

    if (this._resizePending) return;
    this._resizePending = true;

    requestAnimationFrame(() => {
      this._resizePending = false;
      this._applyResize();
    });
  }

  _applyResize() {
    const w = this._nextW;
    const h = this._nextH;
    const dpr = this._nextDpr;
    if (!w || !h) return;
    if (w === this._appliedW && h === this._appliedH && dpr === this._appliedDpr) return;

    this._appliedW = w;
    this._appliedH = h;
    this._appliedDpr = dpr;

    this.dpr = dpr;
    this.width = w;
    this.height = h;

    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (this.staticCanvas) {
      this.staticCanvas.width = Math.round(w * dpr);
      this.staticCanvas.height = Math.round(h * dpr);
      if (this.staticCtx) {
        this.staticCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    }

    this.updateNodePositions();
    this.cacheGradients();
    this.renderStatic();
    this.render();
  }

  cacheGradients() {
    const ctx = this.staticCtx || this.ctx;
    if (!ctx) return;
    this.cachedGradients = {};

    // Cached radial beacon centered behind core switch s1
    const s1 = this.nodes.s1;
    if (s1) {
      const grad = ctx.createRadialGradient(s1.x, s1.y, 10, s1.x, s1.y, 240);
      grad.addColorStop(0, 'rgba(10, 132, 255, 0.09)');
      grad.addColorStop(0.5, 'rgba(10, 132, 255, 0.02)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      this.cachedGradients.bg = grad;
    }

    // Cached node metallic gradients
    for (const key in this.nodes) {
      const n = this.nodes[key];
      if (n.type === 'switch') {
        const grad = ctx.createRadialGradient(n.x, n.y - 8, 2, n.x, n.y, n.radius * 1.5);
        grad.addColorStop(0, '#2c2c2e');
        grad.addColorStop(1, '#151518');
        this.cachedGradients[key] = grad;
      } else if (n.type === 'server') {
        const grad = ctx.createRadialGradient(n.x, n.y - 6, 2, n.x, n.y, n.radius * 1.4);
        grad.addColorStop(0, '#2c2c2e');
        grad.addColorStop(1, '#151518');
        this.cachedGradients[key] = grad;
      } else if (n.type === 'client') {
        const grad = ctx.createRadialGradient(n.x, n.y - 5, 2, n.x, n.y, n.radius * 1.4);
        grad.addColorStop(0, '#2c2c2e');
        grad.addColorStop(1, '#151518');
        this.cachedGradients[key] = grad;
      }
    }
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    this.handleResize(rect.width, rect.height, false);
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
          if (window.toasts) window.toasts.show('Hop Trace Active', `Selected ${h.label}. Click a server to trace the forwarding corridor.`, 'info', 3000);
        } else if (h.type === 'server' && this.traceSource) {
          this.traceTarget = h;
          if (window.toasts) window.toasts.show('Path Verified', `Active route: ${this.traceSource.label} ➔ ${h.label}`, 'success', 3500);
        }
      } else {
        this.traceSource = null;
        this.traceTarget = null;
      }
    });
  }

  triggerRipple(x, y, color = '#0a84ff') {
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
      if (this.nodes.s2) this.triggerRipple(this.nodes.s2.x, this.nodes.s2.y, '#64d2ff');
      if (this.nodes.s3) this.triggerRipple(this.nodes.s3.x, this.nodes.s3.y, '#64d2ff');
    }
    if (!prevOverload && (this.state.natRedirectActive || this.state.server1Overload)) {
      if (this.nodes.s1) this.triggerRipple(this.nodes.s1.x, this.nodes.s1.y, '#ff9f0a');
      if (this.nodes.server1) this.triggerRipple(this.nodes.server1.x, this.nodes.server1.y, '#ff453a');
    }
    if (!prevLinkDown && this.state.linkS1S2Down) {
      if (this.nodes.s1) this.triggerRipple(this.nodes.s1.x, this.nodes.s1.y, '#ff453a');
      if (this.nodes.s2) this.triggerRipple(this.nodes.s2.x, this.nodes.s2.y, '#ff453a');
    }

    // Re-render static layer if topological / corridor state shifted
    if (prevFailover !== this.state.failoverActive ||
        prevOverload !== (this.state.natRedirectActive || this.state.server1Overload) ||
        prevLinkDown !== this.state.linkS1S2Down) {
      this.renderStatic();
    }
  }

  startLoop() {
    // Stepped exclusively by app.js shared rAF loop
  }

  stopLoop() {
    // Stepped exclusively by app.js shared rAF loop
  }

  step(now, delta) {
    const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      if (this.particles.length > 0) {
        this.particles = [];
        this.render();
      }
      return;
    }

    this.pulseAngle += 0.05;
    this.dashOffset = (this.dashOffset - 0.55) % 32;

    // Smooth transition lerps for failover and overload states
    const targetLink = (this.state.linkS1S2Down || this.state.failoverActive) ? 1.0 : 0.0;
    this.failoverTransition += (targetLink - this.failoverTransition) * 0.12;

    const targetOverload = this.state.server1Overload ? 1.0 : 0.0;
    this.overloadTransition += (targetOverload - this.overloadTransition) * 0.12;

    const targetNat = this.state.natRedirectActive ? 1.0 : 0.0;
    this.natTransition += (targetNat - this.natTransition) * 0.12;

    const linkDiff = Math.abs(targetLink - this.linkTransitionS1S2);
    if (linkDiff > 0.005) {
      this.linkTransitionS1S2 += (targetLink - this.linkTransitionS1S2) * 0.12;
      this.renderStatic();
    }

    // Spawn animated packet particles every 380ms
    if (this.animationRunning && (!this._lastSpawn || now - this._lastSpawn > 380)) {
      this.spawnPacket();
      this._lastSpawn = now;
    }

    this.updateParticles();
    this.render();
  }

  destroy() {
    this.stopLoop();
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
  }

  spawnPacket() {
    if (this.particles.length >= 24) return;
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
      color: isRerouted ? '#ff9f0a' : '#64d2ff',
      isRerouted,
      radius: isRerouted ? 4.4 : 3.8
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

  renderStatic() {
    const sctx = this.staticCtx;
    if (!sctx) return;
    sctx.clearRect(0, 0, this.width, this.height);

    // 1. OLED Grounding & Radiant Beacon (cached gradient)
    this.drawBackground(sctx);

    // 2. Conduits & Frosted Port Badges
    this.drawLinks(sctx);

    // 3. Milled Squircle Nodes & IP Badges (cached gradients)
    this.drawNodes(sctx);
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    // 1. Failover Animation: severed link pulses red + backup path animated dashes + label easing in
    if (this.failoverTransition > 0.01) {
      this.drawFailoverEffects(ctx);
    }

    // 2. Active Path Hop Trace
    if (this.traceSource && this.traceTarget) {
      this.drawPathTrace(ctx);
    }

    // 3. Photonic Comet Particles (with distinct NAT reroute color trails)
    if (this.animationRunning) {
      this.drawParticles(ctx);
    }

    // 4. Dynamic Node Badges & Smooth State Transitions
    this.drawDynamicNodeBadges(ctx);

    // 5. Active Radiant Rings
    if (this.ripples.length > 0) {
      this.drawRipples(ctx);
    }

    // 6. Hover Highlight Halo & macOS Quick Look Tooltip
    if (this.state.hoveredNode) {
      const hn = this.state.hoveredNode;
      window.glowCache.drawGlow(ctx, hn.x, hn.y, hn.color || '#0a84ff', hn.radius, 14);
      this.drawTooltip(ctx, hn);
    }
  }

  drawFailoverEffects(ctx) {
    const s1 = this.nodes.s1;
    const s2 = this.nodes.s2;
    const s3 = this.nodes.s3;
    if (!s1 || !s2 || !s3) return;

    // 1. Severed link s1-s2: pulses red
    const redAlpha = (0.35 + 0.65 * Math.abs(Math.sin(this.pulseAngle * 2.5))) * this.failoverTransition;
    ctx.save();
    ctx.strokeStyle = `rgba(255, 69, 58, ${redAlpha})`;
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(s1.x, s1.y);
    ctx.lineTo(s2.x, s2.y);
    ctx.stroke();

    // Severed pulsing badge with soft halo
    ctx.globalAlpha = this.failoverTransition;
    window.glowCache.drawGlow(ctx, (s1.x + s2.x) / 2, (s1.y + s2.y) / 2 - 12, '#ff453a', 8, 12);
    this.drawLinkBadge(ctx, (s1.x + s2.x) / 2, (s1.y + s2.y) / 2 - 12, 'SEVERED', '#ff453a');
    ctx.restore();

    // 2. Backup path s2-s3: draws in as an animated dash
    ctx.save();
    // Ambient cyan glow
    ctx.strokeStyle = `rgba(100, 210, 255, ${0.35 * this.failoverTransition})`;
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(s2.x, s2.y);
    ctx.lineTo(s3.x, s3.y);
    ctx.stroke();

    // Animated marching dash
    ctx.strokeStyle = `rgba(100, 210, 255, ${0.95 * this.failoverTransition})`;
    ctx.lineWidth = 3.5;
    ctx.setLineDash([10, 6]);
    ctx.lineDashOffset = this.dashOffset;
    ctx.beginPath();
    ctx.moveTo(s2.x, s2.y);
    ctx.lineTo(s3.x, s3.y);
    ctx.stroke();

    // Photon sweep along backup corridor
    const sweepT = (Math.sin(this.pulseAngle * 1.8) + 1) / 2;
    const sweepX = s2.x + (s3.x - s2.x) * sweepT;
    const sweepY = s2.y + (s3.y - s2.y) * sweepT;
    window.glowCache.drawGlow(ctx, sweepX, sweepY, '#64d2ff', 4.5, 14);
    ctx.beginPath();
    ctx.arc(sweepX, sweepY, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // 3. "FAILOVER ACTIVE" label easing in
    ctx.globalAlpha = Math.min(1.0, this.failoverTransition * 1.2);
    this.drawLinkBadge(ctx, (s2.x + s3.x) / 2, s2.y - 18, 'FAILOVER ACTIVE', '#64d2ff');
    ctx.restore();
  }

  drawDynamicNodeBadges(ctx) {
    // Server 1 overload status chip with smooth transition lerp
    if (this.overloadTransition > 0.01 && this.nodes.server1) {
      const s1 = this.nodes.server1;
      ctx.save();
      ctx.globalAlpha = this.overloadTransition;
      window.glowCache.drawGlow(ctx, s1.x, s1.y, '#ff453a', s1.radius, 16);
      this.drawMiniBadge(ctx, s1.x, s1.y - s1.radius - 10, 'OVERLOAD', '#ff453a');
      ctx.restore();
    }

    // Server 2 NAT redirect target chip with smooth transition lerp
    if (this.natTransition > 0.01 && this.nodes.server2) {
      const s2 = this.nodes.server2;
      ctx.save();
      ctx.globalAlpha = this.natTransition;
      window.glowCache.drawGlow(ctx, s2.x, s2.y, '#ff9f0a', s2.radius, 14);
      this.drawMiniBadge(ctx, s2.x, s2.y - s2.radius - 10, 'TARGET (NAT)', '#ff9f0a');
      ctx.restore();
    }
  }

  drawBackground(ctx) {
    if (this.cachedGradients.bg) {
      ctx.fillStyle = this.cachedGradients.bg;
      ctx.fillRect(0, 0, this.width, this.height);
    }
  }

  drawLinks(ctx) {
    const s1 = this.nodes.s1;
    const s2 = this.nodes.s2;
    const s3 = this.nodes.s3;
    if (!s1 || !s2 || !s3) return;

    ctx.save();
    if (this.state.memberSpotlight === 'shashidhar') {
      ctx.globalAlpha = 0.2;
    } else if (this.state.memberSpotlight === 'shreyansh') {
      ctx.globalAlpha = 0.85;
    }

    // Link s1-s2 (Primary Corridor)
    if (!this.state.failoverActive && !this.state.linkS1S2Down) {
      this.drawConduit(ctx, s1, s2, '#0a84ff', 2.8);
    }
    // Port badges along s1-s2
    this.drawPortBadgeAlong(ctx, s1, s2, 0.28, 's1:1');
    this.drawPortBadgeAlong(ctx, s1, s2, 0.72, 's2:1');

    // Link s1-s3 (Primary Client Conduit)
    this.drawConduit(ctx, s1, s3, '#0a84ff', 2.8);
    this.drawPortBadgeAlong(ctx, s1, s3, 0.28, 's1:2');
    this.drawPortBadgeAlong(ctx, s1, s3, 0.72, 's3:1');

    // Link s2-s3 (Backup Corridor)
    if (!this.state.failoverActive && !this.state.linkS1S2Down) {
      this.drawLinkLine(ctx, s2, s3, 'rgba(99, 99, 102, 0.5)', 2, [6, 6]);
      this.drawLinkBadge(ctx, (s2.x + s3.x) / 2, s2.y - 18, 'STANDBY', '#8e8e93');
    }
    this.drawPortBadgeAlong(ctx, s2, s3, 0.24, 's2:4');
    this.drawPortBadgeAlong(ctx, s2, s3, 0.76, 's3:5');

    // Server Links to s2
    this.drawLinkLine(ctx, s2, this.nodes.server1, 'rgba(235, 235, 245, 0.25)', 2);
    this.drawPortBadgeAlong(ctx, s2, this.nodes.server1, 0.42, 's2:2');

    this.drawLinkLine(ctx, s2, this.nodes.server2, 'rgba(235, 235, 245, 0.25)', 2);
    this.drawPortBadgeAlong(ctx, s2, this.nodes.server2, 0.42, 's2:3');

    // Client Links to s3
    this.drawLinkLine(ctx, s3, this.nodes.client1, 'rgba(235, 235, 245, 0.25)', 2);
    this.drawPortBadgeAlong(ctx, s3, this.nodes.client1, 0.42, 's3:2');

    this.drawLinkLine(ctx, s3, this.nodes.client2, 'rgba(235, 235, 245, 0.25)', 2);
    this.drawPortBadgeAlong(ctx, s3, this.nodes.client2, 0.42, 's3:3');

    this.drawLinkLine(ctx, s3, this.nodes.client3, 'rgba(235, 235, 245, 0.25)', 2);
    this.drawPortBadgeAlong(ctx, s3, this.nodes.client3, 0.42, 's3:4');
    ctx.restore();
  }

  drawConduit(ctx, from, to, color, width) {
    // Multi-layer luminous conduit (two-pass rasterization without software shadowBlur)
    ctx.save();
    // Ambient wide glow
    ctx.strokeStyle = color;
    ctx.lineWidth = width + 5;
    ctx.globalAlpha = 0.2;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();

    // High-contrast core line
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.restore();
  }

  drawPortBadgeAlong(ctx, from, to, t, label) {
    if (!from || !to) return;
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t;

    ctx.save();
    ctx.font = '600 9.5px "SF Mono", ui-monospace, monospace';
    ctx.fontVariantNumeric = 'tabular-nums slashed-zero';
    const textW = ctx.measureText(label).width;
    const padX = 5.5;
    const h = 14;

    ctx.fillStyle = 'rgba(20, 20, 24, 0.92)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 0.8;
    this.roundRect(ctx, x - textW / 2 - padX, y - h / 2, textW + padX * 2, h, 4, true, true);

    ctx.fillStyle = '#8e8e93';
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
    // Ambient luminous glow pass
    ctx.strokeStyle = color;
    ctx.lineWidth = width + 7;
    ctx.globalAlpha = 0.28;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();

    // Sharp core line pass
    ctx.lineWidth = width;
    ctx.globalAlpha = 1.0;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.restore();
  }

  drawLinkBadge(ctx, x, y, text, color) {
    ctx.save();
    ctx.font = '700 9.5px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
    ctx.letterSpacing = '0.04em';
    const textWidth = ctx.measureText(text).width;
    const w = textWidth + 14;
    const h = 17;
    ctx.fillStyle = 'rgba(18, 18, 22, 0.96)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    this.roundRect(ctx, x - w / 2, y - h / 2, w, h, 5, true, true);

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

      // Exponential comet tail: NAT reroute packets get distinct extended amber-to-crimson trail
      const isRerouted = !!p.isRerouted;
      const tailSteps = isRerouted ? 11 : 7;
      const stepDist = isRerouted ? 0.022 : 0.015;

      for (let t = tailSteps; t >= 1; t--) {
        const trailProg = Math.max(0, p.progress - t * stepDist);
        const tx = from.x + (to.x - from.x) * trailProg;
        const ty = from.y + (to.y - from.y) * trailProg;
        const alpha = Math.pow(1 - (t / tailSteps), 2.2) * (isRerouted ? 0.65 : 0.45);
        ctx.beginPath();
        ctx.arc(tx, ty, p.radius * (1 - t * 0.06), 0, Math.PI * 2);
        // NAT reroute trail color fades from amber #ff9f0a to crimson #ff453a at tail tip
        ctx.fillStyle = isRerouted ? (t > 5 ? '#ff453a' : '#ff9f0a') : p.color;
        ctx.globalAlpha = alpha;
        ctx.fill();
      }

      // Luminous photon core via cached offscreen glow sprite + crisp core
      ctx.globalAlpha = 1.0;
      window.glowCache.drawGlow(ctx, curX, curY, p.color, p.radius, isRerouted ? 16 : 12);
      ctx.beginPath();
      ctx.arc(curX, curY, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
    ctx.restore();
  }

  isNodeInMemberSpotlight(key, n) {
    const sp = this.state.memberSpotlight;
    if (!sp) return true;
    if (sp === 'shashidhar') {
      return n.type === 'server' || n.type === 'client';
    }
    if (sp === 'shreyansh') {
      return n.id === 's1';
    }
    if (sp === 'shaun') {
      return n.type === 'switch';
    }
    return true;
  }

  setMemberSpotlight(name) {
    this.state.memberSpotlight = name ? name.toLowerCase() : null;
    this.render();
  }

  clearMemberSpotlight() {
    this.state.memberSpotlight = null;
    this.render();
  }

  drawNodes(ctx) {
    const isSpotlightActive = !!this.state.memberSpotlight;

    for (const key in this.nodes) {
      const n = this.nodes[key];
      const isHovered = this.state.hoveredNode === n;
      const isSpotlighted = this.isNodeInMemberSpotlight(key, n);

      ctx.save();
      if (isSpotlightActive) {
        ctx.globalAlpha = isSpotlighted ? 1.0 : 0.20;
      } else if (this.state.hoveredNode && !isHovered) {
        ctx.globalAlpha = 0.55;
      }

      // Draw pulsating spotlight halo around highlighted nodes
      if (isSpotlightActive && isSpotlighted) {
        const pulse = 1 + Math.sin(Date.now() / 180) * 0.15;
        const haloColor = this.state.memberSpotlight === 'shashidhar' ? '#30d158' : (this.state.memberSpotlight === 'shreyansh' ? '#0a84ff' : '#64d2ff');
        ctx.strokeStyle = haloColor;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(n.x, n.y, (n.radius + 7) * pulse, 0, Math.PI * 2);
        ctx.stroke();

        // Architectural ownership badge
        let badgeTxt = '';
        if (this.state.memberSpotlight === 'shashidhar') badgeTxt = 'Socket TCP: 9000';
        else if (this.state.memberSpotlight === 'shreyansh') badgeTxt = 'OF1.3 Core & REST';
        else if (this.state.memberSpotlight === 'shaun') badgeTxt = n.id === 's1' ? 'Core OVS' : (n.id === 's2' ? 'Server OVS' : 'Client OVS');

        if (badgeTxt) {
          ctx.font = '700 8.5px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
          const bw = ctx.measureText(badgeTxt).width + 8;
          ctx.fillStyle = 'rgba(20, 20, 25, 0.95)';
          ctx.strokeStyle = haloColor;
          ctx.lineWidth = 1;
          this.roundRect(ctx, n.x - bw / 2, n.y - n.radius - 18, bw, 14, 4, true, true);
          ctx.fillStyle = haloColor;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(badgeTxt, n.x, n.y - n.radius - 11);
        }
      }

      if (n.type === 'switch') {
        const size = n.radius * 2;
        const x = n.x - size / 2;
        const y = n.y - size / 2;

        // Milled Squircle Switch with cached metallic gradient
        ctx.fillStyle = this.cachedGradients[key] || '#151518';
        this.roundRect(ctx, x, y, size, size, 11, true, false);

        // Specular inner light edge (Top Chamfer)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
        ctx.lineWidth = 1;
        this.roundRect(ctx, x + 0.5, y + 0.5, size - 1, size - 1, 10.5, false, true);

        // Status pearl on switch
        const pearlColor = n.id === 's1' ? '#0a84ff' : '#64d2ff';
        window.glowCache.drawGlow(ctx, n.x, n.y - 8, pearlColor, 3.5, 8);
        ctx.beginPath();
        ctx.arc(n.x, n.y - 8, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = pearlColor;
        ctx.fill();

        // Switch ID & OpenFlow badge
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 12px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
        ctx.letterSpacing = '-0.01em';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(n.id.toUpperCase(), n.x, n.y + 4);

        ctx.fillStyle = 'rgba(235, 235, 245, 0.55)';
        ctx.font = '600 7.5px "SF Mono", monospace';
        ctx.fillText('OF1.3', n.x, n.y + 16);

      } else if (n.type === 'server') {
        const color = n.color;

        // Concentric circular node with cached gradient
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.cachedGradients[key] || '#151518';
        ctx.fill();

        ctx.strokeStyle = color;
        ctx.lineWidth = 1.8;
        ctx.stroke();

        ctx.fillStyle = color;
        ctx.font = '700 10.5px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('SRV', n.x, n.y);

      } else if (n.type === 'client') {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.cachedGradients[key] || '#151518';
        ctx.fill();

        ctx.strokeStyle = n.color;
        ctx.lineWidth = 1.8;
        ctx.stroke();

        ctx.fillStyle = n.color;
        ctx.font = '700 9.5px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('CLI', n.x, n.y);
      }

      // Node Label Glass Pill (SF Pro Text + SF Mono)
      ctx.save();
      ctx.font = '600 12.5px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
      const labelText = n.label;
      const nameW = ctx.measureText(labelText).width;
      const subText = n.sub;
      let subW = 0;
      if (subText) {
        ctx.font = '500 10px "SF Mono", ui-monospace, monospace';
        ctx.fontVariantNumeric = 'tabular-nums slashed-zero';
        subW = ctx.measureText(subText).width;
      }
      const pillW = Math.max(nameW, subW) + 18;
      const pillH = subText ? 32 : 22;
      const pillX = n.x - pillW / 2;
      const pillY = n.y + n.radius + 8;

      ctx.fillStyle = 'rgba(18, 18, 22, 0.92)';
      ctx.strokeStyle = isHovered ? n.color : 'rgba(255, 255, 255, 0.14)';
      ctx.lineWidth = 1;
      this.roundRect(ctx, pillX, pillY, pillW, pillH, 7, true, true);

      // Label text
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.font = '600 12px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
      ctx.fillText(labelText, n.x, pillY + (subText ? 3 : 4));

      // Subtitle IP
      if (subText) {
        ctx.font = '500 10px "SF Mono", ui-monospace, monospace';
        ctx.fontVariantNumeric = 'tabular-nums slashed-zero';
        ctx.fillStyle = (n.id === 'server1' && this.state.server1Overload) ? '#ff453a' : '#8e8e93';
        ctx.fillText(subText, n.x, pillY + 17);
      }
      ctx.restore();

      ctx.restore();
    }
  }

  drawMiniBadge(ctx, x, y, text, color) {
    ctx.save();
    ctx.font = '700 8.5px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
    ctx.letterSpacing = '0.04em';
    const w = ctx.measureText(text).width + 10;
    const h = 14;
    ctx.fillStyle = color;
    this.roundRect(ctx, x - w / 2, y - h / 2, w, h, 4, true, false);
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
    ctx.restore();
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
    ctx.setLineDash([8, 8]);
    ctx.lineDashOffset = this.dashOffset * 2.2;

    // Two-pass luminous path trace (halo pass + core pass)
    ctx.beginPath();
    ctx.moveTo(hops[0].x, hops[0].y);
    for (let i = 1; i < hops.length; i++) {
      if (hops[i]) ctx.lineTo(hops[i].x, hops[i].y);
    }
    ctx.strokeStyle = '#64d2ff';
    ctx.lineWidth = 8;
    ctx.globalAlpha = 0.3;
    ctx.stroke();

    ctx.lineWidth = 3.5;
    ctx.globalAlpha = 1.0;
    ctx.stroke();

    for (const ep of [this.traceSource, this.traceTarget]) {
      if (ep) {
        window.glowCache.drawGlow(ctx, ep.x, ep.y, '#64d2ff', ep.radius + 6, 10);
        ctx.beginPath();
        ctx.arc(ep.x, ep.y, ep.radius + 6, 0, Math.PI * 2);
        ctx.strokeStyle = '#64d2ff';
        ctx.lineWidth = 2.2;
        ctx.stroke();
      }
    }
    ctx.restore();
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
      // Two-pass luminous ripple ring
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 6;
      ctx.globalAlpha = Math.max(0, r.alpha * 0.35);
      ctx.stroke();

      ctx.lineWidth = 2;
      ctx.globalAlpha = Math.max(0, r.alpha);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawTooltip(ctx, node) {
    ctx.save();
    const pad = 12;
    const lines = [
      `Node: ${node.label} (${node.type.toUpperCase()})`,
      node.ip ? `IP Address: ${node.ip}` : `OpenFlow Switch DPID: ${node.dpid}`,
      node.mac ? `MAC: ${node.mac}` : `Rules: ${this.state.flowTotals[node.dpid] || 'Active'} flows`,
      node.type === 'switch' ? 'Click to inspect Hardware Flow Table' : `Status: ${node.id === 'server1' && this.state.server1Overload ? 'OVERLOAD' : 'ACTIVE'}`
    ];
    ctx.font = '500 11px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
    let maxW = 0;
    lines.forEach(l => { maxW = Math.max(maxW, ctx.measureText(l).width); });

    const tw = maxW + pad * 2;
    const th = lines.length * 18 + pad;
    const tx = Math.min(this.width - tw - 15, Math.max(15, node.x + 25));
    const ty = Math.min(this.height - th - 15, Math.max(15, node.y - 20));

    // macOS Quick Look smoked glass popover (clean border + dark material)
    ctx.fillStyle = 'rgba(22, 22, 26, 0.96)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    this.roundRect(ctx, tx, ty, tw, th, 9, true, true);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    lines.forEach((l, idx) => {
      ctx.fillStyle = idx === 0 ? '#64d2ff' : (idx === lines.length - 1 ? '#30d158' : '#f5f5f7');
      ctx.font = idx === 0 ? '700 11.5px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif' : '500 11px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
      ctx.fillText(l, tx + pad, ty + pad / 2 + idx * 18);
    });
    ctx.restore();
  }

  roundRect(ctx, x, y, width, height, radius, fill = true, stroke = false) {
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
