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
    this.lastError = null;
    this.sseActive = false;

    // Initialize visualizers with individual try/catch boundaries
    try {
      this.topoCanvas = new TopologyCanvas('topoCanvas');
    } catch (err) {
      console.error('[DashboardApp] Failed to initialize TopologyCanvas:', err);
      this.recordError('TopologyCanvas: ' + err.message);
    }

    try {
      this.metricsChart = new MetricsChart('metricsChart');
    } catch (err) {
      console.error('[DashboardApp] Failed to initialize MetricsChart:', err);
      this.recordError('MetricsChart: ' + err.message);
    }

    try {
      this.connGauge = new ConnectionGauge('connGauge');
    } catch (err) {
      console.error('[DashboardApp] Failed to initialize ConnectionGauge:', err);
      this.recordError('ConnectionGauge: ' + err.message);
    }

    try {
      this.comparisonChart = new ComparisonChart('comparisonCanvas');
    } catch (err) {
      console.error('[DashboardApp] Failed to initialize ComparisonChart:', err);
      this.recordError('ComparisonChart: ' + err.message);
    }

    // Historical tracking for tweens and toasts
    this.lastFailover = false;
    this.lastOverload = false;
    this.lastConns = 0;
    this.prevLatency = 0;
    this.prevThroughput = 0;
    this.eventsCache = [];
    this.lastDataTimestamp = Date.now();
    this.reconnectBackoff = 1000;
    this.activeLogFilter = 'ALL';
    this.lastFlowCount = {};

    this.initDebugBar();
    this.bindDomEvents();
    this.initWatchdog();

    // Render initial state from immediate fetch so "--" and "Loading..." never persist
    this.fetchTelemetry();

    // Start SSE stream as the sole real-time path (fallback REST polling only on disconnect)
    this.fallbackPollTimer = null;
    this.initSSE();
    this.initIntersectionObservers();
    this.startSharedAnimationLoop();
  }

  initDebugBar() {
    window._debugObserverFires = 0;
    if (window.location.search.includes('debug=1')) {
      const db = document.getElementById('debugBar');
      if (db) db.classList.remove('hidden');
    }

    const closeBtn = document.getElementById('btnCloseErrorBanner');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        document.getElementById('appErrorBanner')?.classList.add('hidden');
      });
    }

    window.addEventListener('error', (e) => {
      const detail = e.filename ? `${e.message} (${e.filename.split('/').pop()}:${e.lineno})` : (e.message || 'Script error');
      this.recordError(detail);
    });

    window.addEventListener('unhandledrejection', (e) => {
      this.recordError(`Unhandled Promise: ${e.reason?.message || e.reason}`);
    });
  }

  recordError(msg) {
    this.lastError = msg;
    const errEl = document.getElementById('debugLastError');
    if (errEl) {
      errEl.textContent = msg;
      errEl.className = 'debug-val state-err';
    }

    // In-app floating error banner (Choice 2A)
    const banner = document.getElementById('appErrorBanner');
    const msgEl = document.getElementById('appErrorMessage');
    if (banner && msgEl) {
      msgEl.textContent = msg;
      banner.classList.remove('hidden');
    }
  }

  updateDebugSse(state, cssClass = '') {
    const sseEl = document.getElementById('debugSseState');
    if (sseEl) {
      sseEl.textContent = state;
      sseEl.className = `debug-val ${cssClass}`;
    }
  }

  updateDebugBarMetrics() {
    if (!window.location.search.includes('debug=1') && document.getElementById('debugBar')?.classList.contains('hidden')) return;

    const frameEl = document.getElementById('debugFrameTime');
    if (frameEl && this._frameDeltas && this._frameDeltas.length > 0) {
      const sorted = [...this._frameDeltas].sort((a, b) => a - b);
      const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
      const mean = sorted.reduce((sum, v) => sum + v, 0) / sorted.length;
      const fps = Math.round(1000 / (mean || 16.6));
      frameEl.textContent = `${p95.toFixed(1)} ms (${fps} fps)`;
      frameEl.className = `debug-val ${p95 > 25 ? 'state-warn' : (p95 > 50 ? 'state-err' : 'state-ok')}`;
    }

    const roEl = document.getElementById('debugRoFires');
    if (roEl) {
      const fires = this._observerFiresPerSec || 0;
      roEl.textContent = `${fires} /s`;
      roEl.className = `debug-val ${fires > 2 ? 'state-warn' : 'state-ok'}`;
    }

    const sizeEl = document.getElementById('debugCanvasSizes');
    if (sizeEl) {
      const tW = this.topoCanvas ? this.topoCanvas.width : 0;
      const tH = this.topoCanvas ? this.topoCanvas.height : 0;
      const cW = this.metricsChart ? this.metricsChart.width : 0;
      const cH = this.metricsChart ? this.metricsChart.height : 0;
      sizeEl.textContent = `T:${tW}x${tH} | C:${cW}x${cH}`;
    }
  }

  startSharedAnimationLoop() {
    if (this._animRunning) return;
    this._animRunning = true;
    let lastTime = performance.now();
    let frameCount = 0;
    let lastSecTime = lastTime;
    this._frameDeltas = [];

    const tick = (now) => {
      if (!this._animRunning) return;

      const delta = now - lastTime;
      lastTime = now;
      this._lastFrameTimeMs = delta;

      // Maintain rolling buffer of 60 frames for p95 computation
      this._frameDeltas.push(delta);
      if (this._frameDeltas.length > 60) this._frameDeltas.shift();

      // Rate tracking for debug readout
      frameCount++;
      if (now - lastSecTime >= 250) {
        this._observerFiresPerSec = window._debugObserverFires || 0;
        window._debugObserverFires = 0;
        frameCount = 0;
        lastSecTime = now;
        this.updateDebugBarMetrics();
      }

      // Step Topology Canvas only when visible in viewport
      if (this.topoCanvas && this.topoCanvas.step) {
        const topoEl = document.getElementById('topoCanvas');
        if (!topoEl || topoEl._isIntersecting !== false) {
          this.topoCanvas.step(now, delta);
        }
      }

      // Step Connection Gauge if animating and visible
      if (this.connGauge && this.connGauge.step) {
        const gaugeEl = document.getElementById('connGauge');
        if (!gaugeEl || gaugeEl._isIntersecting !== false) {
          this.connGauge.step();
        }
      }

      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }

  stopSharedAnimationLoop() {
    this._animRunning = false;
  }

  initWatchdog() {
    setInterval(async () => {
      const elapsed = Date.now() - this.lastDataTimestamp;
      if (elapsed > 4500) {
        // Proactively probe controller before alarming to prevent false disconnects
        try {
          const res = await fetch('/api/telemetry');
          if (res.ok) {
            const data = await res.json();
            this.markDataReceived();
            this.updateHeaderStatus(data);
            return;
          }
        } catch (e) {
          // Genuinely disconnected
        }
        this.showOfflineOverlay(true);
        this.markControllerOffline();
      } else {
        this.showOfflineOverlay(false);
      }
    }, 1000);
  }

  markDataReceived() {
    this.lastDataTimestamp = Date.now();
    this.showOfflineOverlay(false);
    this.markControllerOnline();

    const tsEl = document.getElementById('debugLastTimestamp');
    if (tsEl) {
      tsEl.textContent = new Date().toLocaleTimeString();
    }
  }

  showOfflineOverlay(show) {
    const el = document.getElementById('offlineOverlay');
    if (el) {
      el.classList.toggle('hidden', !show);
    }
  }

  markControllerOnline() {
    const ctrlText = document.getElementById('controllerText');
    if (ctrlText) ctrlText.textContent = 'ONLINE';
    const ctrlStatus = document.getElementById('controllerStatus');
    if (ctrlStatus) {
      const dot = ctrlStatus.querySelector('.status-dot');
      if (dot) dot.className = 'status-dot pulse-green';
    }
  }

  initSSE() {
    if (!window.EventSource) {
      this.updateDebugSse('UNSUPPORTED', 'state-warn');
      return;
    }
    if (this.eventSource) {
      this.eventSource.close();
    }

    this.updateDebugSse('CONNECTING...', 'state-warn');

    // Watchdog: if SSE doesn't deliver initial data within 2.5s, engage fallback polling
    let sseReceivedInitial = false;
    setTimeout(() => {
      if (!sseReceivedInitial && !this.sseActive) {
        console.warn('[DashboardApp] SSE stream did not yield initial data, activating fallback polling.');
        this.startFallbackPolling();
      }
    }, 2500);

    try {
      this.eventSource = new EventSource('/api/stream');

      this.eventSource.addEventListener('open', () => {
        this.markDataReceived();
        this.reconnectBackoff = 1000;
        this.sseActive = true;
        this.stopFallbackPolling();
        this.updateDebugSse('STREAMING (LIVE)', 'state-ok');
      });

      this.eventSource.addEventListener('ping', () => {
        this.markDataReceived();
      });

      this.eventSource.addEventListener('telemetry', (e) => {
        try {
          const data = JSON.parse(e.data);
          sseReceivedInitial = true;
          this.markDataReceived();
          this.updateHeaderStatus(data);
          if (this.topoCanvas) this.topoCanvas.updateState(data);
        } catch (err) {
          this.recordError('SSE telemetry parse: ' + err.message);
        }
      });

      this.eventSource.addEventListener('flows', (e) => {
        try {
          const data = JSON.parse(e.data);
          sseReceivedInitial = true;
          this.markDataReceived();
          this.flowsData = data;
          this.renderFlowTable();
        } catch (err) {
          this.recordError('SSE flows parse: ' + err.message);
        }
      });

      this.eventSource.addEventListener('event', (e) => {
        try {
          const ev = JSON.parse(e.data);
          sseReceivedInitial = true;
          this.markDataReceived();
          this.eventsCache.unshift(ev);
          this.updateEventLog(this.eventsCache);
        } catch (err) {
          this.recordError('SSE event parse: ' + err.message);
        }
      });

      this.eventSource.onerror = () => {
        this.sseActive = false;
        this.updateDebugSse('DISCONNECTED (FALLBACK)', 'state-err');
        if (this.eventSource) this.eventSource.close();
        this.startFallbackPolling();
        setTimeout(() => {
          this.reconnectBackoff = Math.min(8000, (this.reconnectBackoff || 1000) * 1.5);
          this.initSSE();
        }, this.reconnectBackoff || 1000);
      };
    } catch (err) {
      console.warn('SSE initialization failed, fallback polling active.', err);
      this.updateDebugSse('FAILED (FALLBACK)', 'state-err');
      this.recordError('SSE init: ' + err.message);
      this.startFallbackPolling();
    }
  }

  startFallbackPolling() {
    if (this.fallbackPollTimer || this.sseActive) return;
    const interval = Math.max(1500, this.reconnectBackoff || 2000);
    this.fallbackPollTimer = setInterval(() => {
      if (this.sseActive) {
        this.stopFallbackPolling();
        return;
      }
      this.fetchTelemetry();
    }, interval);
  }

  stopFallbackPolling() {
    if (this.fallbackPollTimer) {
      clearInterval(this.fallbackPollTimer);
      this.fallbackPollTimer = null;
    }
  }

  startPolling() {
    // If SSE is alive, do not run redundant interval polling
    if (this.sseActive) {
      this.stopFallbackPolling();
      return;
    }
    this.startFallbackPolling();
  }

  bindDomEvents() {
    // 1. Top-Level View Switcher (Live Operations vs Deep-Dive)
    const viewButtons = document.querySelectorAll('#mainViewSwitch .view-tab-btn');
    const liveView = document.getElementById('liveView');
    const deepDiveView = document.getElementById('deepDiveView');

    viewButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        viewButtons.forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-selected', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
        const view = btn.dataset.view;

        if (view === 'deepdive') {
          liveView?.classList.add('hidden');
          liveView?.classList.remove('active');
          deepDiveView?.classList.remove('hidden');
          deepDiveView?.classList.add('active');
          if (window.deepDiveController) {
            window.deepDiveController.resizeCanvases();
          }
        } else {
          deepDiveView?.classList.add('hidden');
          deepDiveView?.classList.remove('active');
          liveView?.classList.remove('hidden');
          liveView?.classList.add('active');
          if (this.topoCanvas) this.topoCanvas.resize();
          if (this.metricsChart) this.metricsChart.resize();
          if (this.comparisonChart) this.comparisonChart.resize();
        }
      });
    });

    // 2. Member Avatar Hover & Canvas Spotlight Glow
    const memberChips = document.querySelectorAll('.member-chip');
    memberChips.forEach(chip => {
      const member = chip.dataset.member;
      chip.addEventListener('mouseenter', () => {
        if (this.topoCanvas && this.topoCanvas.setMemberSpotlight) {
          this.topoCanvas.setMemberSpotlight(member);
        }
      });
      chip.addEventListener('mouseleave', () => {
        if (this.topoCanvas && this.topoCanvas.clearMemberSpotlight) {
          this.topoCanvas.clearMemberSpotlight();
        }
      });
      chip.addEventListener('focus', () => {
        if (this.topoCanvas && this.topoCanvas.setMemberSpotlight) {
          this.topoCanvas.setMemberSpotlight(member);
        }
      });
      chip.addEventListener('blur', () => {
        if (this.topoCanvas && this.topoCanvas.clearMemberSpotlight) {
          this.topoCanvas.clearMemberSpotlight();
        }
      });
    });

    // 3. Problem Statement Dossier Accordion
    const btnToggleProblem = document.getElementById('btnToggleProblemStatement');
    const problemDossier = document.getElementById('problemStatementDossier');
    if (btnToggleProblem && problemDossier) {
      btnToggleProblem.addEventListener('click', () => {
        problemDossier.classList.toggle('hidden');
        btnToggleProblem.classList.toggle('active');
      });
    }

    // 4. Viva Quick Guide Tabs
    const guideTabs = document.querySelectorAll('.guide-tab-btn');
    const guidePanes = document.querySelectorAll('.guide-pane');
    guideTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        guideTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const targetTab = tab.dataset.tab;
        guidePanes.forEach(pane => {
          if (pane.id === `pane${targetTab.charAt(0).toUpperCase() + targetTab.slice(1)}`) {
            pane.classList.remove('hidden');
            pane.classList.add('active');
          } else {
            pane.classList.add('hidden');
            pane.classList.remove('active');
          }
        });
      });
    });

    // 5. Diagnostics Deck Switcher (Eliminates vertical squishing)
    const deckButtons = document.querySelectorAll('#diagnosticsDeckSwitch .deck-tab-btn');
    const deckPanes = document.querySelectorAll('.diagnostics-column .deck-pane');
    deckButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        deckButtons.forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-selected', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
        const deck = btn.dataset.deck;

        deckPanes.forEach(pane => {
          if (pane.id === `deckPane${deck.charAt(0).toUpperCase() + deck.slice(1)}`) {
            pane.classList.remove('hidden');
            pane.classList.add('active');
          } else {
            pane.classList.add('hidden');
            pane.classList.remove('active');
          }
        });

        if (deck === 'metrics') {
          if (this.metricsChart) this.metricsChart.resize();
          if (this.comparisonChart) this.comparisonChart.resize();
        } else if (deck === 'flows') {
          this.renderFlowTable();
        }
      });
    });

    // Switch tabs inside Flow Table
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(btn => {
      btn.addEventListener('click', () => {
        tabs.forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-selected', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
        this.currentDpid = parseInt(btn.getAttribute('data-dpid'));
        this.renderFlowTable();
        this.updateSegmentedPill();
      });
    });
    this.updateSegmentedPill();
    window.addEventListener('resize', () => this.updateSegmentedPill());

    // Poll rate selector
    const pollSelect = document.getElementById('pollRate');
    pollSelect.addEventListener('change', (e) => {
      this.pollInterval = parseInt(e.target.value);
      this.startPolling();
    });

    // Toggle packet particles
    const btnTogglePackets = document.getElementById('btnTogglePackets');
    if (btnTogglePackets) {
      btnTogglePackets.addEventListener('click', () => {
        this.topoCanvas.animationRunning = !this.topoCanvas.animationRunning;
        const isRunning = this.topoCanvas.animationRunning;
        btnTogglePackets.classList.toggle('active', isRunning);
        btnTogglePackets.setAttribute('aria-checked', isRunning ? 'true' : 'false');
        const label = btnTogglePackets.querySelector('.switch-label');
        if (label) {
          label.textContent = `Packet Stream: ${isRunning ? 'ON' : 'OFF'}`;
        } else {
          btnTogglePackets.textContent = `Packet Stream: ${isRunning ? 'ON' : 'OFF'}`;
        }
      });
    }

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
          await fetch('/api/demo/reset', { method: 'POST' }).catch(() => fetch('/api/reset', { method: 'POST' }));
          this.topoCanvas.particles = [];
          if (window.toasts) window.toasts.show('System Reset', 'All dynamic flows cleared. Healthy baseline restored.', 'success');
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
    const btnOverload = document.getElementById('btnTriggerOverloadSim');
    if (btnOverload) {
      btnOverload.addEventListener('click', async () => {
        try {
          const resp = await fetch('/api/demo/overload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ server_ip: '10.0.0.11', active_connections: 3 })
          });
          const data = await resp.json();
          if (window.toasts) window.toasts.show('Overload Simulated', 'Injected 3 active connections on server1. NAT redirected.', 'warning');
          this.fetchTelemetry();
        } catch (e) {
          console.error('Failed to trigger overload:', e);
        }
      });
    }

    // Simulation: Simulate Link Down info
    const btnFailover = document.getElementById('btnTriggerFailoverSim');
    if (btnFailover) {
      btnFailover.addEventListener('click', async () => {
        try {
          const resp = await fetch('/api/demo/link_down', { method: 'POST' });
          const data = await resp.json();
          if (window.toasts) window.toasts.show('Failover Triggered', 'Simulated Link Down on primary corridor s1-s2. Failover route installed.', 'warning');
          this.fetchTelemetry();
        } catch (e) {
          console.error('Failed to simulate link down:', e);
        }
      });
    }

    // Presenter Mode Toggle
    const btnPresenter = document.getElementById('btnPresenterMode');
    if (btnPresenter) {
      btnPresenter.addEventListener('click', () => {
        document.body.classList.toggle('presenter-mode');
        const isPres = document.body.classList.contains('presenter-mode');
        btnPresenter.classList.toggle('active', isPres);
        if (window.toasts) window.toasts.show('Presenter Mode', isPres ? 'Enabled high-contrast presentation mode.' : 'Disabled presenter mode.', 'info');
      });
    }

    // Shortcuts Modal
    const shortcutsModal = document.getElementById('shortcutsModal');
    const btnShortcuts = document.getElementById('btnShortcutsHelp');
    const btnCloseShortcuts = document.getElementById('btnCloseShortcuts');
    if (btnShortcuts && shortcutsModal) {
      btnShortcuts.addEventListener('click', () => shortcutsModal.classList.remove('hidden'));
    }
    if (btnCloseShortcuts && shortcutsModal) {
      btnCloseShortcuts.addEventListener('click', () => shortcutsModal.classList.add('hidden'));
    }
    if (shortcutsModal) {
      shortcutsModal.addEventListener('click', (e) => {
        if (e.target === shortcutsModal) shortcutsModal.classList.add('hidden');
      });
    }

    // Keyboard Shortcuts Listener
    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
      const key = e.key.toLowerCase();
      if (key === '1') {
        document.getElementById('btnTriggerOverloadSim')?.click();
      } else if (key === '2') {
        document.getElementById('btnTriggerFailoverSim')?.click();
      } else if (key === 'r') {
        document.getElementById('btnResetSystem')?.click();
      } else if (key === 'p') {
        document.getElementById('btnPresenterMode')?.click();
      } else if (key === 's') {
        document.getElementById('btnTogglePackets')?.click();
      } else if (key === 'd') {
        const db = document.getElementById('debugBar');
        if (db) db.classList.toggle('hidden');
      } else if (key === '?') {
        const m = document.getElementById('shortcutsModal');
        if (m) m.classList.toggle('hidden');
      } else if (e.key === 'Escape') {
        document.getElementById('shortcutsModal')?.classList.add('hidden');
      }
    });

    // Filter Chips for Live Terminal Log
    const chipBtns = document.querySelectorAll('#logFilterChips .chip-btn');
    chipBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        chipBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeLogFilter = btn.getAttribute('data-filter') || 'ALL';
        this.updateEventLog(this.eventsCache, true);
      });
    });

    // Export Event Log to JSON
    const btnExport = document.getElementById('btnExportLog');
    if (btnExport) {
      btnExport.addEventListener('click', () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.eventsCache, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `sdn_telemetry_events_${Date.now()}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        if (window.toasts) window.toasts.show('Export Complete', 'Saved telemetry event log to JSON file.', 'success');
      });
    }

    // Refresh Static vs Dynamic Comparison Chart
    const btnRefreshComp = document.getElementById('btnRefreshComparison');
    if (btnRefreshComp && this.comparisonChart) {
      btnRefreshComp.addEventListener('click', () => {
        this.comparisonChart.loadData();
        if (window.toasts) window.toasts.show('Comparison Updated', 'Reloaded Static vs Dynamic metrics from performance log.', 'info');
      });
    }

    // Tab Visibility Optimization
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.stopSharedAnimationLoop();
        this.stopFallbackPolling();
      } else {
        this.startSharedAnimationLoop();
        if (!this.sseActive) {
          this.startFallbackPolling();
        }
        if (this.topoCanvas) {
          this.topoCanvas.renderStatic();
          this.topoCanvas.render();
        }
        if (this.metricsChart) this.metricsChart.render();
        if (this.connGauge) this.connGauge.render();
        if (this.comparisonChart) this.comparisonChart.render();
      }
    });
  }

  initIntersectionObservers() {
    if (!('IntersectionObserver' in window)) return;

    this.canvasObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        entry.target._isIntersecting = entry.isIntersecting;
        if (entry.isIntersecting) {
          // If canvas scrolled into view, trigger one render pass
          if (entry.target.id === 'topoCanvas' && this.topoCanvas) {
            this.topoCanvas.renderStatic();
            this.topoCanvas.render();
          } else if (entry.target.id === 'metricsChart' && this.metricsChart) {
            this.metricsChart.render();
          } else if (entry.target.id === 'connGauge' && this.connGauge) {
            this.connGauge.render();
          } else if (entry.target.id === 'comparisonCanvas' && this.comparisonChart) {
            this.comparisonChart.render();
          }
        }
      }
    }, { threshold: 0.05 });

    const canvasIds = ['topoCanvas', 'metricsChart', 'connGauge', 'comparisonCanvas'];
    for (const id of canvasIds) {
      const el = document.getElementById(id);
      if (el) {
        el._isIntersecting = true;
        this.canvasObserver.observe(el);
      }
    }
  }

  selectSwitchTab(dpid) {
    this.currentDpid = dpid;
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(b => {
      const isSelected = parseInt(b.getAttribute('data-dpid')) === dpid;
      b.classList.toggle('active', isSelected);
      b.setAttribute('aria-selected', isSelected ? 'true' : 'false');
    });
    this.renderFlowTable();
    this.updateSegmentedPill();
  }

  updateSegmentedPill() {
    const container = document.getElementById('switchTabs');
    const pill = document.getElementById('segmentedPill');
    if (!container || !pill) return;
    const activeTab = container.querySelector('.tab-btn.active');
    if (activeTab) {
      const containerRect = container.getBoundingClientRect();
      const activeRect = activeTab.getBoundingClientRect();
      const leftOffset = activeRect.left - containerRect.left;
      pill.style.width = `${activeRect.width}px`;
      pill.style.transform = `translateX(${leftOffset}px)`;
      pill.style.opacity = '1';
    } else {
      pill.style.opacity = '0';
    }
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
        this.markDataReceived();
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

  tweenNumber(element, startVal, endVal, durationMs = 400, formatFn = (v) => v.toFixed(2)) {
    if (!element) return;
    const startTime = performance.now();
    const diff = endVal - startVal;
    if (Math.abs(diff) < 0.001) {
      const formatted = formatFn(endVal);
      if (element.textContent !== formatted) element.textContent = formatted;
      return;
    }

    const step = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(1.0, elapsed / durationMs);
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = startVal + diff * ease;
      const formatted = formatFn(current);
      if (element.textContent !== formatted) element.textContent = formatted;

      if (progress < 1.0) {
        requestAnimationFrame(step);
      } else {
        const finalFormatted = formatFn(endVal);
        if (element.textContent !== finalFormatted) element.textContent = finalFormatted;
      }
    };
    requestAnimationFrame(step);
  }

  updateHeaderStatus(data) {
    const ctrlText = document.getElementById('controllerText');
    const targetStatus = data.controller?.status || 'ONLINE';
    if (ctrlText && ctrlText.textContent !== targetStatus) ctrlText.textContent = targetStatus;

    // Failover status
    const failoverPill = document.getElementById('failoverStatus');
    const failoverDot = document.getElementById('failoverDot');
    const failoverText = document.getElementById('failoverText');
    const isFailover = !!data.controller?.failover_active;

    if (isFailover !== this.lastFailover) {
      if (isFailover) {
        if (window.toasts) window.toasts.show('Failover Corridor Activated', 'Primary link severed. Priority-20 backup corridor installed on s2-s3.', 'warning');
        if (failoverPill) {
          failoverPill.classList.add('pill-pulse-ring');
          setTimeout(() => failoverPill.classList.remove('pill-pulse-ring'), 700);
        }
      } else {
        if (window.toasts) window.toasts.show('Corridor Normal', 'Primary link s1-s2 restored to service.', 'success');
      }
      this.lastFailover = isFailover;
    }

    if (isFailover) {
      if (failoverDot && failoverDot.className !== 'status-dot dot-cyan') failoverDot.className = 'status-dot dot-cyan';
      if (failoverText && failoverText.textContent !== 'FAILOVER ACTIVE') failoverText.textContent = 'FAILOVER ACTIVE';
      if (failoverPill && failoverPill.style.borderColor !== 'rgba(100, 210, 255, 0.5)') failoverPill.style.borderColor = 'rgba(100, 210, 255, 0.5)';
    } else {
      if (failoverDot && failoverDot.className !== 'status-dot dot-gray') failoverDot.className = 'status-dot dot-gray';
      if (failoverText && failoverText.textContent !== 'NORMAL') failoverText.textContent = 'NORMAL';
      if (failoverPill && failoverPill.style.borderColor !== '') failoverPill.style.borderColor = '';
    }

    // Server 1 overload status
    const serverPill = document.getElementById('serverLoadStatus');
    const serverDot = document.getElementById('serverLoadDot');
    const serverText = document.getElementById('serverLoadText');
    const s1State = data.servers?.['10.0.0.11']?.status;
    const isOverload = s1State === 'OVERLOAD' || data.controller?.nat_redirect_active;

    if (isOverload !== this.lastOverload) {
      if (isOverload) {
        if (window.toasts) window.toasts.show('Server 1 Overload Detected', 'Connection threshold exceeded! Priority-20 NAT rerouting traffic to replica server2.', 'danger');
        if (serverPill) {
          serverPill.classList.add('pill-pulse-ring');
          setTimeout(() => serverPill.classList.remove('pill-pulse-ring'), 700);
        }
      } else {
        if (window.toasts) window.toasts.show('Servers Healthy', 'All traffic routes to primary server1.', 'success');
      }
      this.lastOverload = isOverload;
    }

    if (isOverload) {
      if (serverDot && serverDot.className !== 'status-dot dot-red') serverDot.className = 'status-dot dot-red';
      if (serverText && serverText.textContent !== 'OVERLOAD') serverText.textContent = 'OVERLOAD';
      if (serverPill && serverPill.style.borderColor !== 'rgba(255, 69, 58, 0.5)') serverPill.style.borderColor = 'rgba(255, 69, 58, 0.5)';
    } else {
      if (serverDot && serverDot.className !== 'status-dot dot-green') serverDot.className = 'status-dot dot-green';
      if (serverText && serverText.textContent !== 'HEALTHY') serverText.textContent = 'HEALTHY';
      if (serverPill && serverPill.style.borderColor !== '') serverPill.style.borderColor = '';
    }

    // Active connections counter tween
    const s1Conns = data.servers?.['10.0.0.11']?.active_conns || 0;
    const connsEl = document.getElementById('metricConns');
    if (connsEl && s1Conns !== this.lastConns) {
      this.tweenNumber(connsEl, this.lastConns, s1Conns, 350, v => Math.round(v).toString());
      this.lastConns = s1Conns;
    }

    if (this.connGauge) {
      this.connGauge.setValue(s1Conns, !!data.controller?.failover_active);
    }

    // Failover recovery speed
    const recEl = document.getElementById('metricRecovery');
    if (recEl && data.last_recovery_ms !== undefined && data.last_recovery_ms !== null) {
      const recVal = parseFloat(data.last_recovery_ms);
      const targetText = recVal > 0 ? `${recVal.toFixed(2)}` : '--';
      if (recEl.textContent !== targetText) recEl.textContent = targetText;
    }
  }

  markControllerOnline() {
    const ctrlText = document.getElementById('controllerText');
    if (ctrlText && ctrlText.textContent === 'OFFLINE') ctrlText.textContent = 'ONLINE';
    const ctrlStatus = document.getElementById('controllerStatus');
    if (ctrlStatus) {
      const dot = ctrlStatus.querySelector('.status-dot');
      if (dot && dot.classList.contains('dot-red')) dot.className = 'status-dot dot-green';
    }
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
    const container = document.querySelector('.table-container');
    const prevScroll = container ? container.scrollTop : 0;
    const tbody = document.getElementById('flowTableBody');
    if (!tbody) return;
    const flows = this.flowsData[this.currentDpid] || [];

    // Track flow rule changes & display diff chip
    const diffBadge = document.getElementById('flowDiffBadge');
    if (this.lastFlowCount[this.currentDpid] !== undefined && this.lastFlowCount[this.currentDpid] !== flows.length) {
      const diff = flows.length - this.lastFlowCount[this.currentDpid];
      if (diff !== 0 && diffBadge) {
        diffBadge.textContent = diff > 0 ? `+${diff} rules` : `${diff} rules`;
        diffBadge.className = `flow-diff-chip ${diff > 0 ? 'diff-added' : 'diff-removed'}`;
        diffBadge.classList.remove('hidden');
        clearTimeout(this._flowDiffTimer);
        this._flowDiffTimer = setTimeout(() => {
          diffBadge.classList.add('hidden');
        }, 3500);
      }
    }
    this.lastFlowCount[this.currentDpid] = flows.length;

    if (flows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty-state">No active flow rules recorded for Switch ${this.currentDpid} yet.</td></tr>`;
      return;
    }

    // Keyed DOM diff: reuse existing <tr> rows, avoid innerHTML rebuild
    const existingRows = new Map();
    for (const row of Array.from(tbody.querySelectorAll('tr[data-flow-key]'))) {
      existingRows.set(row.dataset.flowKey, row);
    }

    const fragment = document.createDocumentFragment();
    const activeKeys = new Set();

    for (const f of flows) {
      const key = `${f.priority}_${f.match}_${f.actions}`;
      activeKeys.add(key);

      let row = existingRows.get(key);
      if (!row) {
        row = document.createElement('tr');
        row.dataset.flowKey = key;

        let badgeClass = 'flow-static';
        if (f.type === 'DYNAMIC_NAT') {
          badgeClass = 'flow-nat';
          row.style.background = 'rgba(245, 158, 11, 0.08)';
        } else if (f.type === 'DYNAMIC_FAILOVER') {
          badgeClass = 'flow-failover';
          row.style.background = 'rgba(6, 182, 212, 0.08)';
        } else if (f.type === 'LOOP_GUARD') {
          badgeClass = 'flow-guard';
        } else if (f.type === 'TABLE_MISS') {
          badgeClass = 'flow-miss';
        }

        row.innerHTML = `
          <td><strong>${f.priority}</strong></td>
          <td><span class="flow-badge ${badgeClass}">${f.type}</span></td>
          <td><code>${this.escapeHtml(f.match)}</code></td>
          <td><code>${this.escapeHtml(f.actions)}</code></td>
          <td style="color: #94a3b8;">${this.escapeHtml(f.desc || '')}</td>
        `;
      } else {
        const descCell = row.cells[4];
        if (descCell && descCell.textContent !== (f.desc || '')) {
          descCell.textContent = f.desc || '';
        }
      }
      fragment.appendChild(row);
    }

    // Remove obsolete rows or empty-state row
    for (const child of Array.from(tbody.children)) {
      if (!child.dataset.flowKey || !activeKeys.has(child.dataset.flowKey)) {
        tbody.removeChild(child);
      }
    }

    tbody.appendChild(fragment);

    if (container) {
      container.scrollTop = prevScroll;
    }
  }

  updateEventLog(events, forceRender = false) {
    if (!Array.isArray(events)) return;
    this.eventsCache = events;
    // Cap log at 200 entries to prevent memory and DOM bloating
    if (this.eventsCache.length > 200) {
      this.eventsCache.length = 200;
    }

    const logContainer = document.getElementById('terminalLog');
    if (!logContainer) return;
    const autoScroll = document.getElementById('chkAutoScroll')?.checked;

    // Deduplicate consecutive identical events on client side
    const deduped = [];
    for (const e of this.eventsCache) {
      if (deduped.length > 0) {
        const prev = deduped[deduped.length - 1];
        if (prev.badge === e.badge && prev.text === e.text) {
          prev.count = (prev.count || 1) + (e.count || 1);
          continue;
        }
      }
      deduped.push({ ...e, count: e.count || 1 });
      if (deduped.length >= 200) break;
    }

    if (!forceRender && deduped.length === this.lastEventCount && deduped[0]?.count === this.lastFirstEventCount) return;
    this.lastEventCount = deduped.length;
    this.lastFirstEventCount = deduped[0]?.count;

    let filtered = deduped;
    if (this.activeLogFilter && this.activeLogFilter !== 'ALL') {
      filtered = deduped.filter(e => {
        const b = (e.badge || '').toUpperCase();
        if (this.activeLogFilter === 'LINK') return b.includes('LINK') || b.includes('PORT');
        if (this.activeLogFilter === 'FAILOVER') return b.includes('FAILOVER');
        if (this.activeLogFilter === 'OVERLOAD') return b.includes('OVERLOAD');
        if (this.activeLogFilter === 'NAT') return b.includes('NAT');
        return true;
      });
    }

    if (filtered.length === 0) {
      logContainer.innerHTML = `<div class="empty-state" style="padding: 1rem; color: #64748b; font-style: italic;">No events matching filter "${this.activeLogFilter}".</div>`;
      return;
    }

    // Keyed DOM diff for live event terminal (reuse existing .log-entry nodes)
    const existingEntries = new Map();
    for (const el of Array.from(logContainer.querySelectorAll('.log-entry[data-log-key]'))) {
      existingEntries.set(el.dataset.logKey, el);
    }

    const fragment = document.createDocumentFragment();
    const activeKeys = new Set();

    for (const e of filtered) {
      const key = `${e.timestamp}_${e.badge}_${e.text}`;
      activeKeys.add(key);

      let el = existingEntries.get(key);
      if (!el) {
        el = document.createElement('div');
        el.className = 'log-entry';
        el.dataset.logKey = key;
        el.innerHTML = `
          <span class="log-time">[${e.timestamp}]</span>
          <span class="log-badge badge-${e.badge}">
            ${e.badge}${e.count > 1 ? `<span class="badge-count">x${e.count}</span>` : ''}
          </span>
          <span class="log-text">${this.escapeHtml(e.text)}</span>
        `;
      } else {
        const badgeEl = el.querySelector('.log-badge');
        if (badgeEl) {
          const countSpan = badgeEl.querySelector('.badge-count');
          if (e.count > 1) {
            if (countSpan) {
              if (countSpan.textContent !== `x${e.count}`) countSpan.textContent = `x${e.count}`;
            } else {
              const span = document.createElement('span');
              span.className = 'badge-count';
              span.textContent = `x${e.count}`;
              badgeEl.appendChild(span);
            }
          } else if (countSpan) {
            countSpan.remove();
          }
        }
      }
      fragment.appendChild(el);
    }

    // Remove elements that are no longer in the active window
    for (const child of Array.from(logContainer.children)) {
      if (!child.dataset?.logKey || !activeKeys.has(child.dataset.logKey)) {
        logContainer.removeChild(child);
      }
    }

    logContainer.appendChild(fragment);

    if (autoScroll) {
      logContainer.scrollTop = 0; // Column reverse: 0 is the bottom
    }
  }

  updateMetricsPanel(metricsList) {
    if (!metricsList || metricsList.length === 0) return;
    const latest = metricsList[metricsList.length - 1];

    const latEl = document.getElementById('metricLatency');
    const latMedianEl = document.getElementById('metricLatencyMedian') || document.getElementById('metricLatencyAvg');
    const tputEl = document.getElementById('metricThroughput');
    const tputPeakEl = document.getElementById('metricThroughputPeak');

    const curLat = latest.latency_ms;
    const curTput = latest.throughput_kbps;

    // Tween and flash latency
    if (latEl && Math.abs(curLat - this.prevLatency) > 0.01) {
      this.tweenNumber(latEl, this.prevLatency, curLat, 400, v => v.toFixed(2));
      const box = latEl.closest('.metric-box');
      if (box && this.prevLatency > 0) {
        const flashClass = curLat < this.prevLatency ? 'metric-flash-up' : 'metric-flash-down';
        box.classList.add(flashClass);
        setTimeout(() => box.classList.remove(flashClass), 500);
      }
      this.prevLatency = curLat;
    }

    // Tween throughput with adaptive unit formatting (Mbps >= 10,000 kbps to prevent card border collisions)
    if (tputEl && Math.abs(curTput - this.prevThroughput) > 10) {
      const isMbps = curTput >= 10000;
      const unitEl = tputEl.parentElement?.querySelector('small');
      if (unitEl) unitEl.textContent = isMbps ? 'Mbps' : 'kbps';

      this.tweenNumber(tputEl, this.prevThroughput, curTput, 400, v => {
        return v >= 10000 ? (v / 1000).toFixed(2) : Math.round(v).toLocaleString();
      });
      this.prevThroughput = curTput;
    }

    // Compute rolling median latency
    const validLat = metricsList.map(m => m.latency_ms).filter(v => v > 0).sort((a, b) => a - b);
    if (validLat.length > 0 && latMedianEl) {
      const mid = Math.floor(validLat.length / 2);
      const median = validLat.length % 2 !== 0 ? validLat[mid] : (validLat[mid - 1] + validLat[mid]) / 2;
      latMedianEl.textContent = `Median: ${median.toFixed(2)} ms`;
    }

    const validTput = metricsList.map(m => m.throughput_kbps);
    if (validTput.length > 0 && tputPeakEl) {
      const peak = Math.max(...validTput);
      if (peak >= 10000) {
        tputPeakEl.textContent = `Peak: ${(peak / 1000).toFixed(2)} Mbps`;
      } else {
        tputPeakEl.textContent = `Peak: ${Math.round(peak).toLocaleString()} kbps`;
      }
    }
  }

  escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}

// Resilient bootstrap on DOM load or immediate if already interactive
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', () => {
    window.app = new DashboardApp();
  });
} else {
  window.app = new DashboardApp();
}
