/**
 * MetricsChart: Apple Health / Activity Monitor Telemetry Waveform Visualizer
 * Continuous monotone cubic spline curves, breathing endpoint halos,
 * outlier-resistant rolling median scaling, and macOS smoked glass crosshair tooltips.
 */

class GlowSpriteCache {
  constructor() {
    this._cache = new Map();
  }

  getGlow(color, radius, blur) {
    const key = `${color}_${Math.round(radius)}_${Math.round(blur)}`;
    let sprite = this._cache.get(key);
    if (!sprite) {
      const padding = Math.ceil(blur * 1.5) + 4;
      const size = Math.ceil((radius + padding) * 2);
      const offscreen = document.createElement('canvas');
      offscreen.width = size;
      offscreen.height = size;
      const octx = offscreen.getContext('2d');
      const center = size / 2;

      octx.shadowColor = color;
      octx.shadowBlur = blur;
      octx.fillStyle = color;
      octx.beginPath();
      octx.arc(center, center, radius, 0, Math.PI * 2);
      octx.fill();

      sprite = { canvas: offscreen, size, center };
      this._cache.set(key, sprite);
    }
    return sprite;
  }

  drawGlow(ctx, x, y, color, radius, blur) {
    const s = this.getGlow(color, radius, blur);
    ctx.drawImage(s.canvas, x - s.center, y - s.center);
  }
}
window.glowCache = window.glowCache || new GlowSpriteCache();

class MetricsChart {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.container = this.canvas.parentElement;
    this.ctx = this.canvas.getContext('2d');
    this.dataPoints = []; // [{latency, throughput, timestamp}]
    this.maxPoints = 60; // Rolling window of last 60 samples
    this.dpr = window.devicePixelRatio || 1;
    this.width = 480;
    this.height = 140;
    this.hoverIndex = -1;
    this.pulsePhase = 0;

    this._appliedW = 0;
    this._appliedH = 0;
    this._appliedDpr = 0;
    this._resizePending = false;

    // Initial sizing from container
    const rect = this.container.getBoundingClientRect();
    this.handleResize(rect.width || 480, rect.height || 140, true);

    this.resizeObserver = new ResizeObserver((entries) => {
      if (window._debugObserverFires !== undefined) window._debugObserverFires++;
      const entry = entries && entries[0];
      if (!entry) return;
      const cssW = entry.contentRect ? entry.contentRect.width : this.container.clientWidth;
      const cssH = entry.contentRect ? entry.contentRect.height : this.container.clientHeight;
      this.handleResize(cssW, cssH);
    });
    this.resizeObserver.observe(this.container);

    this.bindHoverEvents();
    this.initDefaultData();
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
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.render();
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    this.handleResize(rect.width, rect.height, false);
  }

  destroy() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
  }

  bindHoverEvents() {
    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const padLeft = 45;
      const padRight = 15;
      const chartW = this.width - padLeft - padRight;

      if (mouseX < padLeft || mouseX > this.width - padRight || this.dataPoints.length < 2) {
        this.hoverIndex = -1;
      } else {
        const stepX = chartW / (this.dataPoints.length - 1);
        const idx = Math.round((mouseX - padLeft) / stepX);
        this.hoverIndex = Math.max(0, Math.min(this.dataPoints.length - 1, idx));
      }
      this.render();
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.hoverIndex = -1;
      this.render();
    });
  }

  initDefaultData() {
    const now = Date.now();
    for (let i = 24; i >= 0; i--) {
      const t = new Date(now - i * 1000).toLocaleTimeString();
      this.dataPoints.push({
        latency: 0.72 + (Math.random() * 0.2 - 0.1),
        throughput: 10200 + Math.random() * 800,
        timestamp: t
      });
    }
    this.render();
  }

  addPoint(latency, throughput, timestamp) {
    this.dataPoints.push({
      latency: Math.max(0.01, latency),
      throughput: Math.max(0, throughput),
      timestamp: timestamp || new Date().toLocaleTimeString()
    });

    if (this.dataPoints.length > this.maxPoints) {
      this.dataPoints.shift();
    }
    this.render();
  }

  updateFromMetrics(metricsList) {
    if (!Array.isArray(metricsList) || metricsList.length === 0) return;
    this.dataPoints = metricsList.map(m => ({
      latency: Math.max(0.01, m.latency_ms || 0.72),
      throughput: Math.max(0, m.throughput_kbps || 0),
      timestamp: m.timestamp || ''
    }));

    if (this.dataPoints.length > this.maxPoints) {
      this.dataPoints = this.dataPoints.slice(this.dataPoints.length - this.maxPoints);
    }
    this.render();
  }

  render() {
    if (!this.ctx || this.canvas?._isIntersecting === false || document.hidden) return;
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    ctx.clearRect(0, 0, w, h);

    if (this.dataPoints.length < 2) return;

    const padLeft = 46;
    const padRight = 14;
    const padTop = 18;
    const padBottom = 22;

    const chartW = w - padLeft - padRight;
    const chartH = h - padTop - padBottom;

    // Outlier-resistant rolling Y-axis max:
    // Prevents an isolated handshake/timeout spike (e.g. 2605ms) from flattening healthy ~1ms waves
    const validLats = this.dataPoints.map(d => d.latency).filter(v => v > 0);
    let maxLat = 2.0;
    if (validLats.length > 0) {
      const sorted = [...validLats].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

      // Filter out isolated timeout/handshake outliers (> 4.5x median and > 8ms)
      const normalPoints = sorted.filter(v => v <= Math.max(median * 4.5, 8.0));
      const peak = normalPoints.length > 0 ? normalPoints[normalPoints.length - 1] : Math.max(median * 2.5, 2.0);

      maxLat = Math.max(2.0, Math.ceil(peak * 1.35 * 2) / 2);
      if (maxLat > 10) maxLat = Math.ceil(maxLat / 5) * 5;
    }

    // 1. Apple Hairline Grid & Tabular Ticks (Crisp integer snapping & high contrast)
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;

    const numTicks = 3;
    for (let i = 0; i <= numTicks; i++) {
      const y = Math.round(padTop + (chartH / numTicks) * i);
      ctx.beginPath();
      ctx.moveTo(padLeft, y + 0.5);
      ctx.lineTo(w - padRight, y + 0.5);
      ctx.stroke();

      // Rounded tick label (Crisp, high-contrast typography)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.font = '500 11px -apple-system, BlinkMacSystemFont, "Segoe UI Variable Text", "SF Pro Text", sans-serif';
      ctx.fontVariantNumeric = 'tabular-nums slashed-zero';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const tickVal = maxLat * (1 - i / numTicks);
      const formatted = tickVal >= 10 ? tickVal.toFixed(0) : tickVal.toFixed(1);
      ctx.fillText(`${formatted} ms`, padLeft - 8, y);
    }
    ctx.restore();

    // 2. Compute Coordinate Points
    const stepX = chartW / (this.dataPoints.length - 1);
    const points = this.dataPoints.map((d, i) => {
      const clampedLat = Math.min(d.latency, maxLat);
      return {
        x: padLeft + i * stepX,
        y: padTop + chartH - (clampedLat / maxLat) * chartH,
        raw: d
      };
    });

    // 3. Draw Smooth Monotone Curve & Gradient Fill
    this.drawSmoothSeries(ctx, points, padLeft, padTop, chartW, chartH);

    // 4. Header Legend
    ctx.save();
    ctx.font = '600 9.5px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
    ctx.fillStyle = '#64d2ff';
    ctx.textAlign = 'right';
    ctx.fillText('● RTT Latency', w - padRight, 11);
    ctx.restore();

    // 5. Draw Hover Crosshair & Tooltip
    if (this.hoverIndex >= 0 && this.hoverIndex < points.length) {
      this.drawCrosshair(ctx, points[this.hoverIndex], padTop, chartH);
    }
  }

  drawSmoothSeries(ctx, points, padLeft, padTop, chartW, chartH) {
    if (points.length < 2) return;

    ctx.save();

    // Fill Path with smooth curve
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const midX = (p0.x + p1.x) / 2;
      ctx.bezierCurveTo(midX, p0.y, midX, p1.y, p1.x, p1.y);
    }

    // Connect to bottom for area fill
    const last = points[points.length - 1];
    ctx.lineTo(last.x, padTop + chartH);
    ctx.lineTo(points[0].x, padTop + chartH);
    ctx.closePath();

    const grad = ctx.createLinearGradient(0, padTop, 0, padTop + chartH);
    grad.addColorStop(0, 'rgba(10, 132, 255, 0.28)');
    grad.addColorStop(0.65, 'rgba(100, 210, 255, 0.06)');
    grad.addColorStop(1, 'rgba(10, 132, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Two-pass Luminous Curve (wide halo + core line, zero software shadowBlur)
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const midX = (p0.x + p1.x) / 2;
      ctx.bezierCurveTo(midX, p0.y, midX, p1.y, p1.x, p1.y);
    }
    // Wide luminous halo pass
    ctx.strokeStyle = 'rgba(10, 132, 255, 0.35)';
    ctx.lineWidth = 5.5;
    ctx.stroke();

    // Sharp core line pass
    ctx.strokeStyle = '#0a84ff';
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // Secondary inner highlight line
    ctx.strokeStyle = 'rgba(100, 210, 255, 0.7)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // End point pulsing dot (pre-rendered glow sprite + crisp core)
    this.pulsePhase = (this.pulsePhase + 0.08) % (Math.PI * 2);
    const pulseRadius = 3.5 + 1.2 * Math.sin(this.pulsePhase);
    window.glowCache.drawGlow(ctx, last.x, last.y, '#64d2ff', pulseRadius, 10);
    ctx.beginPath();
    ctx.arc(last.x, last.y, pulseRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.restore();
  }

  drawCrosshair(ctx, pt, padTop, chartH) {
    ctx.save();

    // Vertical dashed crosshair line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(pt.x, padTop);
    ctx.lineTo(pt.x, padTop + chartH);
    ctx.stroke();

    // Crosshair active dot with glow sprite
    window.glowCache.drawGlow(ctx, pt.x, pt.y, '#0a84ff', 4, 8);
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#0a84ff';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();

    // Apple Smoked Glass Tooltip Pill
    const label = `${pt.raw.latency.toFixed(2)} ms`;
    const sub = pt.raw.timestamp || '';
    ctx.font = '700 11px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
    ctx.fontVariantNumeric = 'tabular-nums slashed-zero';
    const textW = Math.max(ctx.measureText(label).width, ctx.measureText(sub).width);
    const boxW = textW + 18;
    const boxH = 34;

    let bx = pt.x - boxW / 2;
    if (bx < 45) bx = 45;
    if (bx + boxW > this.width - 10) bx = this.width - boxW - 10;
    const by = Math.max(5, pt.y - boxH - 8);

    ctx.fillStyle = 'rgba(20, 20, 24, 0.95)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 1;

    // Rounded rectangle with specular chamfer (clean border without software blur)
    this.roundRect(ctx, bx, by, boxW, boxH, 8, true, true);

    // Tooltip texts
    ctx.fillStyle = '#64d2ff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(label, bx + boxW / 2, by + 4);

    ctx.font = '500 8.5px "SF Mono", ui-monospace, monospace';
    ctx.fillStyle = 'rgba(235, 235, 245, 0.6)';
    ctx.fillText(sub, bx + boxW / 2, by + 19);

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
