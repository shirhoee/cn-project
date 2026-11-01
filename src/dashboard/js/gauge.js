/**
 * ConnectionGauge: Apple Watch Activity Ring Concentric Visualizer
 * Dual concentric circular rings rendering Server 1 Connection Load (Outer)
 * and Failover Corridor Capacity (Inner) with luminous rounded caps and drop shadows.
 */
class ConnectionGauge {
  constructor(canvasId = 'connGauge') {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.container = this.canvas.parentElement;
    this.ctx = this.canvas.getContext('2d');
    this.dpr = window.devicePixelRatio || 1;
    this.currentValue = 0;
    this.targetValue = 0;
    this.threshold = 2;
    this.maxVal = 3.5;
    this.corridorActive = false;

    this._appliedW = 0;
    this._appliedH = 0;
    this._appliedDpr = 0;
    this._resizePending = false;

    // Initial resize from wrapper
    const rect = this.container.getBoundingClientRect();
    this.handleResize(rect.width || 90, rect.height || 54, true);

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

  setValue(val, corridorActive = false) {
    const num = Math.max(0, val);
    this.corridorActive = !!corridorActive;
    if (num !== this.targetValue) {
      this.targetValue = num;
      this.step();
    } else {
      this.render();
    }
  }

  step() {
    const diff = this.targetValue - this.currentValue;
    if (Math.abs(diff) > 0.01) {
      this.currentValue += diff * 0.18;
      this.render();
    } else if (this.currentValue !== this.targetValue) {
      this.currentValue = this.targetValue;
      this.render();
    }
  }

  render() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2 + 1;

    // Apple Watch Activity Ring Dimensions
    const outerRadius = Math.min(cx, cy) - 5;
    const outerStroke = 5.5;
    const innerRadius = outerRadius - outerStroke - 3;
    const innerStroke = 4;

    // 1. Outer Ring: Server 1 Connection Load
    let outerColor = '#30d158'; // Apple Green
    if (this.currentValue >= 3) {
      outerColor = '#ff453a'; // Apple Red (Overload)
    } else if (this.currentValue >= 1.5) {
      outerColor = '#ff9f0a'; // Apple Orange (Elevated)
    }

    const outerRatio = Math.min(1.0, this.currentValue / this.maxVal);
    this.renderActivityRing(ctx, cx, cy, outerRadius, outerStroke, outerRatio, outerColor);

    // 2. Inner Ring: Corridor Capacity / Failover Health
    const innerColor = this.corridorActive ? '#64d2ff' : '#48484a';
    const innerRatio = this.corridorActive ? 1.0 : 0.45;
    this.renderActivityRing(ctx, cx, cy, innerRadius, innerStroke, innerRatio, innerColor);

    // 3. Central Tabular Readout
    ctx.save();
    ctx.font = '700 12px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
    ctx.fontVariantNumeric = 'tabular-nums slashed-zero';
    ctx.fillStyle = '#f5f5f7';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.round(this.currentValue)}/2`, cx, cy - 2);

    ctx.font = '600 7px "SF Mono", ui-monospace, monospace';
    ctx.letterSpacing = '0.06em';
    ctx.fillStyle = outerColor;
    const statusText = this.currentValue >= 3 ? 'OVERLOAD' : (this.currentValue > 0 ? 'ACTIVE' : 'IDLE');
    ctx.fillText(statusText, cx, cy + 9);
    ctx.restore();
  }

  renderActivityRing(ctx, cx, cy, radius, strokeWidth, ratio, color) {
    if (radius <= 0) return;
    const startAngle = -Math.PI / 2; // 12 o'clock start
    const totalAngle = Math.PI * 2;
    const activeAngle = startAngle + totalAngle * ratio;

    // Deep 15% opacity background track
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.16;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();

    // Luminous foreground arc with rounded caps (halo pass + core pass, zero software shadowBlur)
    if (ratio > 0.01) {
      ctx.save();
      // Translucent halo pass
      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle, activeAngle);
      ctx.strokeStyle = color;
      ctx.lineWidth = strokeWidth + 3.5;
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.25;
      ctx.stroke();

      // Sharp core pass
      ctx.globalAlpha = 1.0;
      ctx.lineWidth = strokeWidth;
      ctx.stroke();
      ctx.restore();
    }
  }
}
