/**
 * MetricsChart: Lightweight Zero-Dependency HTML5 Canvas Time-Series Graph
 * Plots RTT Latency (ms) and Socket Throughput (kbps) over time.
 */
class MetricsChart {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.dataPoints = []; // [{latency, throughput, timestamp}]
    this.maxPoints = 25;
    this.initDefaultData();
  }

  initDefaultData() {
    // Initial baseline points
    const now = Date.now();
    for (let i = 10; i >= 0; i--) {
      this.dataPoints.push({
        latency: 0.6 + Math.random() * 0.4,
        throughput: 10000 + Math.random() * 1500,
        timestamp: new Date(now - i * 1000).toLocaleTimeString()
      });
    }
    this.render();
  }

  addDataPoint(latency, throughput, timestamp) {
    this.dataPoints.push({
      latency: Math.max(0, latency),
      throughput: Math.max(0, throughput),
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
        latency: m.latency_ms || 0,
        throughput: m.throughput_kbps || 0,
        timestamp: m.timestamp?.split(' ')[1] || ''
      }));
      this.render();
    }
  }

  render() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (this.dataPoints.length < 2) return;

    const padLeft = 35;
    const padRight = 10;
    const padTop = 15;
    const padBottom = 20;

    const chartW = w - padLeft - padRight;
    const chartH = h - padTop - padBottom;

    // Determine max values for scaling
    let maxLat = Math.max(...this.dataPoints.map(d => d.latency), 2.0);
    let maxTput = Math.max(...this.dataPoints.map(d => d.throughput), 12000);

    // 1. Draw Grid lines
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);

    for (let i = 0; i <= 3; i++) {
      const y = padTop + (chartH / 3) * i;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(w - padRight, y);
      ctx.stroke();

      // Latency scale label (left)
      ctx.fillStyle = '#64748b';
      ctx.font = '8px monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const val = (maxLat * (1 - i / 3)).toFixed(1);
      ctx.fillText(`${val}ms`, padLeft - 4, y);
    }
    ctx.restore();

    // 2. Draw Latency Line & Area (Cyan)
    this.drawLineSeries(ctx, this.dataPoints.map(d => d.latency), maxLat, padLeft, padTop, chartW, chartH, '#38bdf8', 'rgba(56, 189, 248, 0.12)');

    // 3. Draw Legend in top right
    ctx.save();
    ctx.font = '8.5px system-ui';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('● RTT Latency', w - 75, 10);
    ctx.restore();
  }

  drawLineSeries(ctx, values, maxVal, left, top, width, height, lineColor, fillColor) {
    if (values.length < 2) return;
    const stepX = width / (values.length - 1);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(left, top + height - (values[0] / maxVal) * height);

    for (let i = 1; i < values.length; i++) {
      const x = left + i * stepX;
      const y = top + height - (values[i] / maxVal) * height;
      ctx.lineTo(x, y);
    }

    // Stroke line
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Fill area below
    ctx.lineTo(left + (values.length - 1) * stepX, top + height);
    ctx.lineTo(left, top + height);
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();

    // Draw last point dot
    const lastX = left + (values.length - 1) * stepX;
    const lastY = top + height - (values[values.length - 1] / maxVal) * height;
    ctx.beginPath();
    ctx.arc(lastX, lastY, 3, 0, Math.PI * 2);
    ctx.fillStyle = lineColor;
    ctx.shadowColor = lineColor;
    ctx.shadowBlur = 6;
    ctx.fill();

    ctx.restore();
  }
}
