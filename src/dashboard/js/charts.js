/**
 * MetricsChart: High-Performance Presentation-Grade Time-Series Visualizer
 * Supports DPR crispness, smooth bezier curves, gradient fills, hover crosshair tooltips,
 * and robust median calculations.
 */
class MetricsChart {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.container = this.canvas.parentElement;
    this.ctx = this.canvas.getContext('2d');
    this.dataPoints = []; // [{latency, throughput, timestamp}]
    this.maxPoints = 28;
    this.dpr = window.devicePixelRatio || 1;
    this.width = 480;
    this.height = 120;
    this.hoverIndex = -1;

    // Resize observer
    this.resize();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);

    this.bindHoverEvents();
    this.initDefaultData();
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);

    if (w === this._lastW && h === this._lastH && dpr === this._lastDpr) return;
    this._lastW = w;
    this._lastH = h;
    this._lastDpr = dpr;

    this.dpr = dpr;
    this.width = w || 480;
    this.height = h || 120;

    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;

    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.render();
  }

  bindHoverEvents() {
    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const padLeft = 45;
      const padRight = 15;
      const chartW = this.width - padLeft - padRight;

      if (this.dataPoints.length >= 2 && mouseX >= padLeft && mouseX <= this.width - padRight) {
        const stepX = chartW / (this.dataPoints.length - 1);
        const idx = Math.round((mouseX - padLeft) / stepX);
        this.hoverIndex = Math.max(0, Math.min(this.dataPoints.length - 1, idx));
      } else {
        this.hoverIndex = -1;
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
    for (let i = 12; i >= 0; i--) {
      this.dataPoints.push({
        latency: parseFloat((0.65 + Math.random() * 0.35).toFixed(2)),
        throughput: Math.round(10200 + Math.random() * 1200),
        timestamp: new Date(now - i * 1000).toLocaleTimeString()
      });
    }
    this.render();
  }

  addDataPoint(latency, throughput, timestamp) {
    this.dataPoints.push({
      latency: Math.max(0, parseFloat(Number(latency).toFixed(2))),
      throughput: Math.max(0, Math.round(Number(throughput))),
      timestamp: timestamp || new Date().toLocaleTimeString()
    });

    if (this.dataPoints.length > this.maxPoints) {
      this.dataPoints.shift();
    }
    this.render();
  }

  updateFromMetrics(metricsList) {
    if (Array.isArray(metricsList) && metricsList.length > 0) {
      this.dataPoints = metricsList.slice(-this.maxPoints).map(m => ({
        latency: parseFloat((m.latency_ms || 0).toFixed(2)),
        throughput: Math.round(m.throughput_kbps || 0),
        timestamp: m.timestamp?.split(' ')[1] || new Date().toLocaleTimeString()
      }));
      this.render();
    }
  }

  getMedianLatency() {
    if (this.dataPoints.length === 0) return 0;
    const sorted = this.dataPoints.map(d => d.latency).filter(v => v > 0).sort((a, b) => a - b);
    if (sorted.length === 0) return 0;
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  render() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    ctx.clearRect(0, 0, w, h);

    if (this.dataPoints.length < 2) return;

    const padLeft = 45;
    const padRight = 15;
    const padTop = 18;
    const padBottom = 22;

    const chartW = w - padLeft - padRight;
    const chartH = h - padTop - padBottom;

    // Clean rounded max ceiling for Y-axis (no weird 002.3ms)
    const rawMax = Math.max(...this.dataPoints.map(d => d.latency), 1.5);
    const maxLat = Math.max(1.0, Math.ceil(rawMax * 2) / 2);

    // 1. Draw Grid Lines & Rounded Tick Values
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);

    const numTicks = 3;
    for (let i = 0; i <= numTicks; i++) {
      const y = padTop + (chartH / numTicks) * i;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(w - padRight, y);
      ctx.stroke();

      // Rounded tick label
      ctx.fillStyle = '#64748b';
      ctx.font = '600 9.5px ui-monospace, SFMono-Regular, monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const tickVal = maxLat * (1 - i / numTicks);
      const formatted = tickVal >= 10 ? tickVal.toFixed(0) : tickVal.toFixed(1);
      ctx.fillText(`${formatted} ms`, padLeft - 6, y);
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
    ctx.font = '600 10px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'right';
    ctx.fillText('● RTT Latency (ms)', w - padRight, 12);
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
    grad.addColorStop(0, 'rgba(56, 189, 248, 0.28)');
    grad.addColorStop(0.7, 'rgba(56, 189, 248, 0.06)');
    grad.addColorStop(1, 'rgba(56, 189, 248, 0)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Stroke Smooth Curve
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const midX = (p0.x + p1.x) / 2;
      ctx.bezierCurveTo(midX, p0.y, midX, p1.y, p1.x, p1.y);
    }
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.2;
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 8;
    ctx.stroke();

    // End point pulsing dot
    ctx.beginPath();
    ctx.arc(last.x, last.y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 10;
    ctx.fill();

    ctx.restore();
  }

  drawCrosshair(ctx, pt, padTop, chartH) {
    ctx.save();

    // Vertical dashed crosshair line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(pt.x, padTop);
    ctx.lineTo(pt.x, padTop + chartH);
    ctx.stroke();

    // Crosshair active dot
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#38bdf8';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();

    // Tooltip Bubble
    const label = `${pt.raw.latency.toFixed(2)} ms`;
    const sub = pt.raw.timestamp || '';
    ctx.font = '700 11px system-ui, -apple-system, sans-serif';
    const textW = Math.max(ctx.measureText(label).width, ctx.measureText(sub).width);
    const boxW = textW + 16;
    const boxH = 34;

    let bx = pt.x - boxW / 2;
    if (bx < 45) bx = 45;
    if (bx + boxW > this.width - 10) bx = this.width - boxW - 10;
    const by = Math.max(5, pt.y - boxH - 8);

    ctx.fillStyle = 'rgba(11, 19, 38, 0.96)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 8;

    // Draw rounded rect
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(bx, by, boxW, boxH, 5);
    } else {
      ctx.rect(bx, by, boxW, boxH);
    }
    ctx.fill();
    ctx.stroke();

    // Tooltip texts
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(label, bx + boxW / 2, by + 4);

    ctx.font = '500 9px ui-monospace, monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(sub, bx + boxW / 2, by + 19);

    ctx.restore();
  }
}
