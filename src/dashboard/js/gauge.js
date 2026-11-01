/**
 * ConnectionGauge: High-Performance Radial Arc Gauge
 * Renders active connections vs. server threshold (0 -> 2 limit -> 3+ overload).
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

  setValue(val) {
    const num = Math.max(0, val);
    if (num !== this.targetValue) {
      this.targetValue = num;
      this.step();
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
    const cy = h - 10;
    const radius = Math.min(cx - 10, cy - 8);

    const startAngle = Math.PI * 0.85;
    const endAngle = Math.PI * 2.15;
    const totalAngle = endAngle - startAngle;

    // 1. Background Track
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, endAngle);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.stroke();

    // 2. Value Arc with Dynamic Color
    const ratio = Math.min(1.0, this.currentValue / this.maxVal);
    const activeAngle = startAngle + totalAngle * ratio;

    let arcColor = '#10b981';
    if (this.currentValue >= 3) arcColor = '#ef4444';
    else if (this.currentValue >= 1) arcColor = '#f59e0b';

    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, activeAngle);
    ctx.strokeStyle = arcColor;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.shadowColor = arcColor;
    ctx.shadowBlur = 10;
    ctx.stroke();

    // 3. Central Value & Subtitle
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 13px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.round(this.currentValue)} / 2`, cx, cy - radius / 2 + 2);

    ctx.font = '600 8.5px ui-monospace, monospace';
    ctx.fillStyle = arcColor;
    ctx.fillText(this.currentValue >= 3 ? 'OVERLOAD' : (this.currentValue > 0 ? 'ACTIVE' : 'IDLE'), cx, cy - 2);

    ctx.restore();
  }
}
