/**
 * ConnectionGauge: High-Performance Radial Arc Gauge
 * Renders active connections vs. server threshold (0 -> 2 limit -> 3+ overload).
 */
class ConnectionGauge {
  constructor(canvasId = 'connGauge') {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.dpr = window.devicePixelRatio || 1;
    this.currentValue = 0;
    this.targetValue = 0;
    this.threshold = 2;
    this.maxVal = 3.5;

    this.resize();
    this.animate();
  }

  resize() {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width || 100;
    this.height = rect.height || 65;
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  setValue(val) {
    this.targetValue = Math.max(0, val);
  }

  animate() {
    const step = () => {
      const diff = this.targetValue - this.currentValue;
      if (Math.abs(diff) > 0.01) {
        this.currentValue += diff * 0.15;
      } else {
        this.currentValue = this.targetValue;
      }
      this.render();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
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
