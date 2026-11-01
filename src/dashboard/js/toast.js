/**
 * ToastManager: Presentation-grade animated slide-down notifications
 * with auto-dismiss and elapsed progress indicators.
 */
class ToastManager {
  constructor(containerId = 'toastContainer') {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = containerId;
      this.container.className = 'toast-container';
      document.body.appendChild(this.container);
    }
  }

  show(title, message, type = 'info', durationMs = 4500) {
    const toast = document.createElement('div');
    toast.className = `toast-card toast-${type}`;

    let icon = '⚡';
    if (type === 'danger') icon = '🚨';
    else if (type === 'warning') icon = '⚠️';
    else if (type === 'success') icon = '✅';

    toast.innerHTML = `
      <div class="toast-header">
        <span class="toast-icon">${icon}</span>
        <strong class="toast-title">${title}</strong>
        <button class="toast-close" aria-label="Close">&times;</button>
      </div>
      <div class="toast-body">${message}</div>
      <div class="toast-progress-bar"><div class="toast-progress-fill"></div></div>
    `;

    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => this.dismiss(toast));

    this.container.appendChild(toast);

    // Trigger entrance animation
    requestAnimationFrame(() => {
      toast.classList.add('toast-visible');
    });

    // Auto dismiss with progress bar
    const fill = toast.querySelector('.toast-progress-fill');
    if (fill) {
      fill.style.transition = `width ${durationMs}ms linear`;
      requestAnimationFrame(() => {
        fill.style.width = '100%';
      });
    }

    const timer = setTimeout(() => {
      this.dismiss(toast);
    }, durationMs);

    toast._timer = timer;
    return toast;
  }

  dismiss(toast) {
    if (!toast || toast._dismissed) return;
    toast._dismissed = true;
    if (toast._timer) clearTimeout(toast._timer);
    toast.classList.remove('toast-visible');
    toast.classList.add('toast-hiding');
    setTimeout(() => {
      if (toast.parentElement) {
        toast.parentElement.removeChild(toast);
      }
    }, 350);
  }
}

// Global instance
window.toasts = new ToastManager();
