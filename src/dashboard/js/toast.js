/**
 * ToastManager: iOS Dynamic Island Floating Pill Notifications
 * Apple Human Interface design with spring physics, specular smoked glass,
 * and glowing progress hairlines.
 */
class ToastManager {
  constructor(containerId = 'toastContainer') {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = containerId;
      this.container.className = 'toast-container';
      this.container.setAttribute('aria-live', 'polite');
      document.body.appendChild(this.container);
    }
  }

  show(title, message, type = 'info', durationMs = 4500) {
    const toast = document.createElement('div');
    toast.className = `toast-card toast-${type}`;

    let iconSvg = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0a84ff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="16" x2="12" y2="12"></line>
        <line x1="12" y1="8" x2="12.01" y2="8"></line>
      </svg>
    `;

    if (type === 'danger') {
      iconSvg = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff453a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="15" y1="9" x2="9" y2="15"></line>
          <line x1="9" y1="9" x2="15" y2="15"></line>
        </svg>
      `;
    } else if (type === 'warning') {
      iconSvg = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff9f0a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
          <line x1="12" y1="9" x2="12" y2="13"></line>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
      `;
    } else if (type === 'success') {
      iconSvg = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#30d158" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
          <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
      `;
    }

    toast.innerHTML = `
      <span class="toast-icon">${iconSvg}</span>
      <div class="toast-content">
        <strong class="toast-title">${title}</strong>
        <div class="toast-body">${message}</div>
      </div>
      <button class="toast-close" aria-label="Close notification">&times;</button>
      <div class="toast-progress-bar"><div class="toast-progress-fill"></div></div>
    `;

    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => this.dismiss(toast));

    this.container.appendChild(toast);

    // Trigger Dynamic Island spring expansion
    requestAnimationFrame(() => {
      toast.classList.add('toast-visible');
    });

    // Auto dismiss with glowing progress bar
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
