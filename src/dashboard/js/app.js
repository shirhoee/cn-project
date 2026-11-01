/**
 * App: SDN Telemetry & Dashboard Controller
 * Polls REST endpoints, updates UI panels, and handles user interactions.
 */
class DashboardApp {
  constructor() {
    this.pollInterval = 800; // ms
    this.pollTimer = null;
    this.currentDpid = 1; // Default active tab is Core Switch (s1)
    this.flowsData = {};
    this.lastEventCount = 0;

    // Initialize visualizer and chart
    this.topoCanvas = new TopologyCanvas('topoCanvas');
    this.metricsChart = new MetricsChart('metricsChart');

    this.bindDomEvents();
    this.startPolling();
  }

  bindDomEvents() {
    // Switch tabs
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(btn => {
      btn.addEventListener('click', () => {
        tabs.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentDpid = parseInt(btn.getAttribute('data-dpid'));
        this.renderFlowTable();
      });
    });

    // Poll rate selector
    const pollSelect = document.getElementById('pollRate');
    pollSelect.addEventListener('change', (e) => {
      this.pollInterval = parseInt(e.target.value);
      this.startPolling();
    });

    // Toggle packet particles
    const btnTogglePackets = document.getElementById('btnTogglePackets');
    btnTogglePackets.addEventListener('click', () => {
      this.topoCanvas.animationRunning = !this.topoCanvas.animationRunning;
      btnTogglePackets.classList.toggle('active', this.topoCanvas.animationRunning);
      btnTogglePackets.textContent = `Packet Stream: ${this.topoCanvas.animationRunning ? 'ON' : 'OFF'}`;
    });

    // Clear log button
    document.getElementById('btnClearLog').addEventListener('click', () => {
      document.getElementById('terminalLog').innerHTML = '';
      this.lastEventCount = 0;
    });

    // Reset System to Baseline Healthy
    const resetBtn = document.getElementById('btnResetSystem') || document.getElementById('btnResetView');
    if (resetBtn) {
      resetBtn.addEventListener('click', async () => {
        try {
          resetBtn.disabled = true;
          const origText = resetBtn.textContent;
          resetBtn.textContent = 'Resetting...';
          await fetch('/api/reset', { method: 'POST' });
          this.topoCanvas.particles = [];
          await this.fetchTelemetry();
          setTimeout(() => {
            resetBtn.disabled = false;
            resetBtn.textContent = origText;
          }, 400);
        } catch (e) {
          console.error('Reset failed:', e);
          resetBtn.disabled = false;
        }
      });
    }

    // Simulation: Trigger Overload
    document.getElementById('btnTriggerOverloadSim').addEventListener('click', async () => {
      try {
        const resp = await fetch('/api/overload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ server_ip: '10.0.0.11', active_connections: 3 })
        });
        const data = await resp.json();
        console.log('Overload simulation triggered:', data);
        this.fetchTelemetry();
      } catch (e) {
        console.error('Failed to trigger overload:', e);
      }
    });

    // Simulation: Simulate Link Down info
    document.getElementById('btnTriggerFailoverSim').addEventListener('click', () => {
      alert("To trigger real Link Failure in Mininet:\nRun in Mininet CLI:\n  mininet> link s1 s2 down\n\nTo restore link:\n  mininet> link s1 s2 up");
    });
  }

  selectSwitchTab(dpid) {
    this.currentDpid = dpid;
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(b => {
      b.classList.toggle('active', parseInt(b.getAttribute('data-dpid')) === dpid);
    });
    this.renderFlowTable();
  }

  startPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.pollInterval <= 0) return; // Paused

    this.fetchTelemetry();
    this.pollTimer = setInterval(() => {
      this.fetchTelemetry();
    }, this.pollInterval);
  }

  async fetchTelemetry() {
    try {
      // 1. Fetch telemetry snapshot
      const [telRes, flowsRes, eventsRes, metricsRes] = await Promise.all([
        fetch('/api/telemetry').then(r => r.json()).catch(() => null),
        fetch('/api/flows').then(r => r.json()).catch(() => null),
        fetch('/api/events').then(r => r.json()).catch(() => null),
        fetch('/api/metrics').then(r => r.json()).catch(() => null)
      ]);

      if (telRes) {
        this.updateHeaderStatus(telRes);
        this.topoCanvas.updateState(telRes);
      }

      if (flowsRes) {
        this.flowsData = flowsRes;
        this.renderFlowTable();
      }

      if (eventsRes) {
        this.updateEventLog(eventsRes);
      }

      if (metricsRes && metricsRes.length > 0) {
        this.updateMetricsPanel(metricsRes);
        this.metricsChart.updateFromMetrics(metricsRes);
      }
    } catch (err) {
      this.markControllerOffline();
    }
  }

  updateHeaderStatus(data) {
    const ctrlText = document.getElementById('controllerText');
    ctrlText.textContent = data.controller?.status || 'ONLINE';

    // Failover status
    const failoverPill = document.getElementById('failoverStatus');
    const failoverDot = document.getElementById('failoverDot');
    const failoverText = document.getElementById('failoverText');
    const isFailover = !!data.controller?.failover_active;

    if (isFailover) {
      failoverDot.className = 'status-dot dot-cyan';
      failoverText.textContent = 'FAILOVER ACTIVE';
      failoverPill.style.borderColor = 'rgba(6, 182, 212, 0.4)';
    } else {
      failoverDot.className = 'status-dot dot-gray';
      failoverText.textContent = 'NORMAL';
      failoverPill.style.borderColor = '';
    }

    // Server 1 overload status
    const serverPill = document.getElementById('serverLoadStatus');
    const serverDot = document.getElementById('serverLoadDot');
    const serverText = document.getElementById('serverLoadText');
    const s1State = data.servers?.['10.0.0.11']?.status;
    const isOverload = s1State === 'OVERLOAD' || data.controller?.nat_redirect_active;

    if (isOverload) {
      serverDot.className = 'status-dot dot-red';
      serverText.textContent = 'OVERLOAD';
      serverPill.style.borderColor = 'rgba(239, 68, 68, 0.4)';
    } else {
      serverDot.className = 'status-dot dot-green';
      serverText.textContent = 'HEALTHY';
      serverPill.style.borderColor = '';
    }

    // Active connections counter
    const s1Conns = data.servers?.['10.0.0.11']?.active_conns || 0;
    const connsEl = document.getElementById('metricConns');
    if (connsEl) connsEl.textContent = s1Conns;
  }

  markControllerOffline() {
    const ctrlText = document.getElementById('controllerText');
    if (ctrlText) ctrlText.textContent = 'OFFLINE';
    const ctrlStatus = document.getElementById('controllerStatus');
    if (ctrlStatus) {
      const dot = ctrlStatus.querySelector('.status-dot');
      if (dot) dot.className = 'status-dot dot-red';
    }
  }

  renderFlowTable() {
    const tbody = document.getElementById('flowTableBody');
    const flows = this.flowsData[this.currentDpid] || [];

    if (flows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty-state">No active flow rules recorded for Switch ${this.currentDpid} yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = flows.map(f => {
      let badgeClass = 'flow-static';
      if (f.type === 'DYNAMIC_NAT') badgeClass = 'flow-nat';
      else if (f.type === 'DYNAMIC_FAILOVER') badgeClass = 'flow-failover';
      else if (f.type === 'LOOP_GUARD') badgeClass = 'flow-guard';
      else if (f.type === 'TABLE_MISS') badgeClass = 'flow-miss';

      return `
        <tr>
          <td><strong>${f.priority}</strong></td>
          <td><span class="flow-badge ${badgeClass}">${f.type}</span></td>
          <td><code>${this.escapeHtml(f.match)}</code></td>
          <td><code>${this.escapeHtml(f.actions)}</code></td>
          <td style="color: #94a3b8;">${this.escapeHtml(f.desc || '')}</td>
        </tr>
      `;
    }).join('');
  }

  updateEventLog(events) {
    if (!Array.isArray(events)) return;
    const logContainer = document.getElementById('terminalLog');
    const autoScroll = document.getElementById('chkAutoScroll').checked;

    // Only re-render if count or latest changed
    if (events.length === this.lastEventCount) return;
    this.lastEventCount = events.length;

    logContainer.innerHTML = events.map(e => `
      <div class="log-entry">
        <span class="log-time">[${e.timestamp}]</span>
        <span class="log-badge badge-${e.badge}">${e.badge}</span>
        <span class="log-text">${this.escapeHtml(e.text)}</span>
      </div>
    `).join('');

    if (autoScroll) {
      logContainer.scrollTop = 0; // Column reverse: 0 is the bottom
    }
  }

  updateMetricsPanel(metricsList) {
    if (!metricsList || metricsList.length === 0) return;
    const latest = metricsList[metricsList.length - 1];

    const latEl = document.getElementById('metricLatency');
    const latAvgEl = document.getElementById('metricLatencyAvg');
    const tputEl = document.getElementById('metricThroughput');
    const tputPeakEl = document.getElementById('metricThroughputPeak');

    if (latEl) latEl.textContent = latest.latency_ms.toFixed(2);
    if (tputEl) tputEl.textContent = Math.round(latest.throughput_kbps).toLocaleString();

    // Compute averages
    const validLat = metricsList.map(m => m.latency_ms).filter(v => v > 0);
    if (validLat.length > 0 && latAvgEl) {
      const avg = validLat.reduce((a, b) => a + b, 0) / validLat.length;
      latAvgEl.textContent = `Avg: ${avg.toFixed(2)} ms`;
    }

    const validTput = metricsList.map(m => m.throughput_kbps);
    if (validTput.length > 0 && tputPeakEl) {
      const peak = Math.max(...validTput);
      tputPeakEl.textContent = `Peak: ${Math.round(peak).toLocaleString()} kbps`;
    }
  }

  escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}

// Bootstrap on DOM load
window.addEventListener('DOMContentLoaded', () => {
  window.app = new DashboardApp();
});
