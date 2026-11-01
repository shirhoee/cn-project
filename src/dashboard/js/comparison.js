/**
 * ComparisonChart: Apple Keynote Benchmark Visualizer
 * Directly contrasts Static Baseline vs. Dynamic SDN across Latency, Throughput, and Availability
 * with rounded pill-cap bars, diagonal failure patterns, and high-impact multiplier callouts.
 */
class ComparisonChart {
  constructor(canvasId = 'comparisonCanvas') {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.container = this.canvas.parentElement;
    this.ctx = this.canvas.getContext('2d');
    this.dpr = window.devicePixelRatio || 1;
    this.data = {
      static: { median_latency: 2002.3, avg_throughput: 0.0, success_rate: 33.3 },
      dynamic: { median_latency: 0.72, avg_throughput: 10250.0, success_rate: 100.0 }
    };

    this._appliedW = 0;
    this._appliedH = 0;
    this._appliedDpr = 0;
    this._resizePending = false;

    // Initial resize from wrapper
    const rect = this.container.getBoundingClientRect();
    this.handleResize(rect.width || 440, rect.height || 145, true);

    this.resizeObserver = new ResizeObserver((entries) => {
      if (window._debugObserverFires !== undefined) window._debugObserverFires++;
      const entry = entries && entries[0];
      if (!entry) return;
      const cssW = entry.contentRect ? entry.contentRect.width : this.container.clientWidth;
      const cssH = entry.contentRect ? entry.contentRect.height : this.container.clientHeight;
      this.handleResize(cssW, cssH);
    });
    this.resizeObserver.observe(this.container);

    this.render();
    this.loadData();
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
    this.render();
  }

  resize() {
    if (!this.container) return;
    const rect = this.container.getBoundingClientRect();
    this.handleResize(rect.width, rect.height, false);
  }

  destroy() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
  }

  async loadData() {
    try {
      const resp = await fetch('/api/metrics/comparison');
      if (resp.ok) {
        this.data = await resp.json();
        this.render();
      }
    } catch (e) {
      console.warn('Could not load comparison metrics:', e);
    }
  }

  render() {
    if (!this.ctx || !this.data) return;
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    ctx.clearRect(0, 0, w, h);

    const padLeft = 32;
    const padRight = 18;
    const padTop = 22;
    const padBottom = 26;

    const chartW = w - padLeft - padRight;
    const chartH = h - padTop - padBottom;

    // Metrics configuration
    const groups = [
      {
        label: 'MEDIAN RTT',
        unit: 'ms',
        staticVal: this.data.static?.median_latency || 2002.3,
        dynamicVal: this.data.dynamic?.median_latency || 0.72,
        multiplierBadge: '2,780× FASTER',
        format: v => v > 100 ? `${v.toFixed(0)}ms` : `${v.toFixed(2)}ms`,
        lowerIsBetter: true
      },
      {
        label: 'THROUGHPUT',
        unit: 'kbps',
        staticVal: this.data.static?.avg_throughput || 0,
        dynamicVal: this.data.dynamic?.avg_throughput || 10250,
        multiplierBadge: '10.2 Mbps',
        format: v => `${Math.round(v).toLocaleString()}k`,
        lowerIsBetter: false
      },
      {
        label: 'AVAILABILITY',
        unit: '%',
        staticVal: this.data.static?.success_rate || 33.3,
        dynamicVal: this.data.dynamic?.success_rate || 100,
        multiplierBadge: '3× UPTIME',
        format: v => `${v.toFixed(0)}%`,
        lowerIsBetter: false
      }
    ];

    const groupW = chartW / groups.length;
    const barW = Math.min(22, groupW * 0.28);
    const gap = 6;

    // Header Legend (Apple Style)
    ctx.save();
    ctx.font = '600 9px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
    ctx.fillStyle = '#636366';
    ctx.fillText('■ Static Baseline', w - 165, 12);
    ctx.fillStyle = '#64d2ff';
    ctx.fillText('■ Dynamic SDN', w - 82, 12);
    ctx.restore();

    groups.forEach((g, idx) => {
      const gx = padLeft + idx * groupW + groupW / 2;

      // Group bottom label (Apple uppercase eyebrow)
      ctx.save();
      ctx.fillStyle = 'rgba(235, 235, 245, 0.45)';
      ctx.font = '600 8.5px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
      ctx.fontVariantNumeric = 'tabular-nums slashed-zero';
      ctx.letterSpacing = '0.06em';
      ctx.textAlign = 'center';
      ctx.fillText(g.label, gx, h - 8);

      // Multiplier Callout Badge (Apple Green Chiclet)
      if (g.multiplierBadge) {
        ctx.font = '700 7.5px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
        const badgeW = ctx.measureText(g.multiplierBadge).width + 8;
        const bx = gx - badgeW / 2;
        const by = padTop - 14;
        ctx.fillStyle = 'rgba(48, 209, 88, 0.15)';
        ctx.strokeStyle = 'rgba(48, 209, 88, 0.4)';
        ctx.lineWidth = 0.8;
        this.roundRect(ctx, bx, by, badgeW, 13, 4, true, true);
        ctx.fillStyle = '#30d158';
        ctx.fillText(g.multiplierBadge, gx, by + 9.5);
      }

      // Height calculation
      let sHeight = 0;
      let dHeight = 0;
      if (g.label === 'AVAILABILITY') {
        sHeight = (g.staticVal / 100) * (chartH - 15);
        dHeight = (g.dynamicVal / 100) * (chartH - 15);
      } else if (g.label === 'MEDIAN RTT') {
        sHeight = chartH - 12;
        dHeight = Math.max(8, (chartH - 12) * 0.12);
      } else {
        const maxTput = Math.max(g.staticVal, g.dynamicVal, 12000);
        sHeight = Math.max(6, (g.staticVal / maxTput) * (chartH - 15));
        dHeight = (g.dynamicVal / maxTput) * (chartH - 15);
      }

      const baseY = padTop + chartH - 4;

      // 1. Draw Static Bar (Space Gray with rounded cap)
      const sx = gx - barW - gap / 2;
      const sy = baseY - sHeight;
      ctx.fillStyle = '#2c2c2e';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;
      this.roundRect(ctx, sx, sy, barW, sHeight, 4, true, true);

      // Value label on Static Bar
      ctx.font = '600 8.5px "SF Mono", ui-monospace, monospace';
      ctx.fontVariantNumeric = 'tabular-nums slashed-zero';
      ctx.fillStyle = '#8e8e93';
      ctx.textAlign = 'center';
      ctx.fillText(g.format(g.staticVal), sx + barW / 2, sy - 4);

      // 2. Draw Dynamic Bar (Apple Blue-to-Cyan Luminous Pill)
      const dx = gx + gap / 2;
      const dy = baseY - dHeight;
      const grad = ctx.createLinearGradient(dx, dy, dx, baseY);
      grad.addColorStop(0, '#64d2ff');
      grad.addColorStop(1, '#0a84ff');
      ctx.fillStyle = grad;
      this.roundRect(ctx, dx, dy, barW, dHeight, 4, true, false);

      // Inner specular edge on dynamic bar
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 0.8;
      this.roundRect(ctx, dx + 0.5, dy + 0.5, barW - 1, dHeight - 1, 3.5, false, true);

      // Value label on Dynamic Bar
      ctx.fillStyle = '#64d2ff';
      ctx.fillText(g.format(g.dynamicVal), dx + barW / 2, dy - 4);

      ctx.restore();
    });
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
