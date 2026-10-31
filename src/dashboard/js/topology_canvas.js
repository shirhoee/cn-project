/**
 * TopologyCanvas: 60 FPS HTML5 Canvas SDN Topology & Packet Flow Engine
 * Renders switches, hosts, dynamic links, and particle animations.
 */
class TopologyCanvas {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.animationRunning = true;
    this.particles = [];
    this.pulseAngle = 0;

    // Fixed logical coordinates mapped to canvas dimensions
    this.nodes = {
      s1: { id: 's1', dpid: 1, type: 'switch', label: 's1 (Core)', x: 460, y: 80, radius: 26, color: '#38bdf8' },
      s2: { id: 's2', dpid: 2, type: 'switch', label: 's2 (Servers)', x: 230, y: 230, radius: 26, color: '#38bdf8' },
      s3: { id: 's3', dpid: 3, type: 'switch', label: 's3 (Clients)', x: 690, y: 230, radius: 26, color: '#38bdf8' },
      server1: { id: 'server1', ip: '10.0.0.11', type: 'server', label: 'server1 (.11)', x: 140, y: 460, radius: 20, color: '#10b981' },
      server2: { id: 'server2', ip: '10.0.0.12', type: 'server', label: 'server2 (.12)', x: 320, y: 460, radius: 20, color: '#6366f1' },
      client1: { id: 'client1', ip: '10.0.0.21', type: 'client', label: 'client1 (.21)', x: 570, y: 460, radius: 18, color: '#f59e0b' },
      client2: { id: 'client2', ip: '10.0.0.22', type: 'client', label: 'client2 (.22)', x: 690, y: 460, radius: 18, color: '#f59e0b' },
      client3: { id: 'client3', ip: '10.0.0.23', type: 'client', label: 'client3 (.23)', x: 810, y: 460, radius: 18, color: '#f59e0b' }
    };

    // Telemetry state
    this.state = {
      failoverActive: false,
      natRedirectActive: false,
      linkS1S2Down: false,
      server1Overload: false,
      servers: {},
      hoveredNode: null
    };

    this.bindEvents();
    this.startLoop();
  }

  bindEvents() {
    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;
      const mouseX = (e.clientX - rect.left) * scaleX;
      const mouseY = (e.clientY - rect.top) * scaleY;

      let hovered = null;
      for (const key in this.nodes) {
        const n = this.nodes[key];
        const dist = Math.hypot(mouseX - n.x, mouseY - n.y);
        if (dist <= n.radius + 8) {
          hovered = n;
          break;
        }
      }
      this.state.hoveredNode = hovered;
      this.canvas.style.cursor = hovered ? 'pointer' : 'default';
    });

    this.canvas.addEventListener('click', () => {
      if (this.state.hoveredNode && this.state.hoveredNode.dpid) {
        // Trigger tab change in UI
        if (window.app && window.app.selectSwitchTab) {
          window.app.selectSwitchTab(this.state.hoveredNode.dpid);
        }
      }
    });
  }

  updateState(telemetry) {
    if (!telemetry) return;
    this.state.failoverActive = !!telemetry.controller?.failover_active;
    this.state.natRedirectActive = !!telemetry.controller?.nat_redirect_active;
    this.state.linkS1S2Down = telemetry.links?.['s1-s2']?.status === 'DOWN';
    this.state.servers = telemetry.servers || {};
    this.state.server1Overload = telemetry.servers?.['10.0.0.11']?.status === 'OVERLOAD';
  }

  startLoop() {
    let lastSpawn = 0;
    const animate = (timestamp) => {
      this.pulseAngle += 0.05;

      // Spawn animated packet particles every 400ms
      if (this.animationRunning && timestamp - lastSpawn > 350) {
        this.spawnPacket();
        lastSpawn = timestamp;
      }

      this.updateParticles();
      this.render();
      requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }

  spawnPacket() {
    // Choose random client
    const clients = ['client1', 'client2', 'client3'];
    const client = clients[Math.floor(Math.random() * clients.length)];

    // Target server: if NAT active, redirect to server2
    const targetServer = (this.state.natRedirectActive || this.state.server1Overload) ? 'server2' : 'server1';
    const isRerouted = targetServer === 'server2';

    // Waypoints sequence
    let path = [];
    if (this.state.failoverActive || this.state.linkS1S2Down) {
      // Failover path: client -> s3 -> s2 -> server
      path = [this.nodes[client], this.nodes['s3'], this.nodes['s2'], this.nodes[targetServer]];
    } else {
      // Normal primary path: client -> s3 -> s1 -> s2 -> server
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
          // Packet reached destination
          this.particles.splice(i, 1);
        }
      }
    }
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // 1. Draw Network Links
    this.drawLinks(ctx);

    // 2. Draw Packet Particles
    if (this.animationRunning) {
      this.drawParticles(ctx);
    }

    // 3. Draw Nodes (Switches, Servers, Clients)
    this.drawNodes(ctx);

    // 4. Draw Tooltips
    if (this.state.hoveredNode) {
      this.drawTooltip(ctx, this.state.hoveredNode);
    }
  }

  drawLinks(ctx) {
    const s1 = this.nodes.s1;
    const s2 = this.nodes.s2;
    const s3 = this.nodes.s3;

    // Link s1-s2 (Primary)
    if (this.state.linkS1S2Down || this.state.failoverActive) {
      // Severed link: dashed pulsing red
      const alpha = 0.4 + 0.6 * Math.abs(Math.sin(this.pulseAngle));
      this.drawLinkLine(ctx, s1, s2, `rgba(239, 68, 68, ${alpha})`, 3, [8, 8]);
      // Severed badge in center
      this.drawLinkBadge(ctx, (s1.x + s2.x) / 2, (s1.y + s2.y) / 2 - 10, 'SEVERED', '#ef4444');
    } else {
      // Healthy primary: solid cyan with glow
      this.drawLinkLine(ctx, s1, s2, 'rgba(56, 189, 248, 0.75)', 3);
    }

    // Link s1-s3 (Primary)
    this.drawLinkLine(ctx, s1, s3, 'rgba(56, 189, 248, 0.75)', 3);

    // Link s2-s3 (Backup Corridor)
    if (this.state.failoverActive || this.state.linkS1S2Down) {
      // Active failover: thick glowing electric blue with energy pulses
      const pulseWidth = 3.5 + 1.5 * Math.abs(Math.sin(this.pulseAngle * 1.5));
      this.drawGlowLine(ctx, s2, s3, '#06b6d4', pulseWidth);
      this.drawLinkBadge(ctx, (s2.x + s3.x) / 2, s2.y - 18, 'FAILOVER ACTIVE', '#06b6d4');
    } else {
      // Standby link: dim dashed gray
      this.drawLinkLine(ctx, s2, s3, 'rgba(100, 116, 139, 0.35)', 2, [6, 6]);
      this.drawLinkBadge(ctx, (s2.x + s3.x) / 2, s2.y - 15, 'STANDBY', '#64748b');
    }

    // Server Links to s2
    this.drawLinkLine(ctx, s2, this.nodes.server1, 'rgba(148, 163, 184, 0.5)', 2);
    this.drawLinkLine(ctx, s2, this.nodes.server2, 'rgba(148, 163, 184, 0.5)', 2);

    // Client Links to s3
    this.drawLinkLine(ctx, s3, this.nodes.client1, 'rgba(148, 163, 184, 0.5)', 2);
    this.drawLinkLine(ctx, s3, this.nodes.client2, 'rgba(148, 163, 184, 0.5)', 2);
    this.drawLinkLine(ctx, s3, this.nodes.client3, 'rgba(148, 163, 184, 0.5)', 2);
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
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.restore();
  }

  drawLinkBadge(ctx, x, y, text, color) {
    ctx.save();
    ctx.font = 'bold 9px ' + 'system-ui, monospace';
    const textWidth = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.fillRect(x - textWidth / 2 - 5, y - 8, textWidth + 10, 16);
    ctx.strokeRect(x - textWidth / 2 - 5, y - 8, textWidth + 10, 16);
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

      if (n.type === 'switch') {
        // Draw Switch Node (Hexagonal or Rounded Rect)
        const size = n.radius * 2;
        ctx.fillStyle = '#0f172a';
        ctx.strokeStyle = isHovered ? '#fff' : n.color;
        ctx.lineWidth = isHovered ? 3 : 2;
        ctx.shadowColor = n.color;
        ctx.shadowBlur = isHovered ? 20 : 10;

        // Rounded rect
        this.roundRect(ctx, n.x - size / 2, n.y - size / 2, size, size, 8, true, true);

        // Switch icon / label
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(n.id.toUpperCase(), n.x, n.y - 3);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.font = '8px system-ui';
        ctx.fillText('OF1.3', n.x, n.y + 8);

      } else if (n.type === 'server') {
        // Draw Server Node
        const isOverload = n.id === 'server1' && this.state.server1Overload;
        const color = isOverload ? '#ef4444' : n.color;

        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#0f172a';
        ctx.fill();
        ctx.strokeStyle = isHovered ? '#fff' : color;
        ctx.lineWidth = isHovered ? 3 : 2;
        ctx.shadowColor = color;
        ctx.shadowBlur = isOverload ? 20 : 8;
        ctx.stroke();

        ctx.fillStyle = color;
        ctx.font = 'bold 10px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('SRV', n.x, n.y);

        // Overload badge
        if (isOverload) {
          this.drawMiniBadge(ctx, n.x, n.y - n.radius - 8, 'OVERLOAD', '#ef4444');
        } else if (n.id === 'server2' && this.state.natRedirectActive) {
          this.drawMiniBadge(ctx, n.x, n.y - n.radius - 8, 'ACTIVE TARGET', '#38bdf8');
        }

      } else if (n.type === 'client') {
        // Draw Client Node
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#0f172a';
        ctx.fill();
        ctx.strokeStyle = isHovered ? '#fff' : n.color;
        ctx.lineWidth = isHovered ? 2.5 : 1.5;
        ctx.shadowColor = n.color;
        ctx.shadowBlur = 6;
        ctx.stroke();

        ctx.fillStyle = n.color;
        ctx.font = 'bold 9px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('CLI', n.x, n.y);
      }

      // Node text label below
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '500 10.5px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.shadowBlur = 0;
      ctx.fillText(n.label, n.x, n.y + n.radius + 6);

      ctx.restore();
    }
  }

  drawMiniBadge(ctx, x, y, text, color) {
    ctx.save();
    ctx.font = 'bold 8px system-ui';
    const w = ctx.measureText(text).width + 8;
    ctx.fillStyle = color;
    ctx.fillRect(x - w / 2, y - 6, w, 12);
    ctx.fillStyle = '#000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  drawTooltip(ctx, node) {
    ctx.save();
    const pad = 8;
    const lines = [
      `Node: ${node.label}`,
      node.ip ? `IP: ${node.ip}` : `OpenFlow DPID: ${node.dpid}`,
      node.type === 'switch' ? 'Click to inspect Flow Table' : 'Status: ACTIVE'
    ];
    ctx.font = '10px system-ui';
    let maxW = 0;
    lines.forEach(l => { maxW = Math.max(maxW, ctx.measureText(l).width); });

    const tx = Math.min(this.canvas.width - maxW - 20, Math.max(10, node.x + 25));
    const ty = Math.min(this.canvas.height - 70, Math.max(10, node.y - 20));

    ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1;
    ctx.fillRect(tx, ty, maxW + pad * 2, lines.length * 16 + pad);
    ctx.strokeRect(tx, ty, maxW + pad * 2, lines.length * 16 + pad);

    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    lines.forEach((l, idx) => {
      ctx.fillText(l, tx + pad, ty + pad / 2 + idx * 16);
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
