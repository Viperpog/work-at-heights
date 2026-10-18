// Renderer-only presentation. No IPC, HTML interpolation, or privileged access.
(() => {
  const dialog = document.getElementById('wahDialog');
  const byId = id => document.getElementById(id);
  const queue = [];
  let active = null;
  function showNext() {
    if (active || !queue.length) return;
    active = queue.shift();
    const options = active.options;
    dialog.className = `wahDialog wahDialog--${options.variant === 'dark' ? 'dark' : 'light'}`;
    dialog.dataset.kind = options.kind;
    dialog.setAttribute('role', options.kind === 'notice' ? 'dialog' : 'alertdialog');
    for (const [id, value] of Object.entries({
      wahDialogTitle: options.title, wahDialogBody: options.message,
      wahDialogEyebrow: options.eyebrow || (options.variant === 'dark' ? 'Confirm your decision' : 'Training notice'),
      wahDialogIcon: options.icon || (options.variant === 'dark' ? '!' : 'i'),
      wahDialogDetailLabel: options.detailLabel, wahDialogDetail: options.detail,
      wahDialogPrimary: options.primaryLabel || 'OK', wahDialogSecondary: options.secondaryLabel || ''
    })) byId(id).textContent = value || '';
    byId('wahDialogDetails').hidden = !options.detail;
    byId('wahDialogDetails').classList.toggle('warning', Boolean(options.destructive));
    byId('wahDialogDetailLabel').hidden = !options.detailLabel;
    byId('wahDialogSecondary').hidden = !options.secondaryLabel;
    byId('wahDialogSecondary').classList.toggle('destructive', Boolean(options.destructive));
    dialog.showModal(); // Top layer makes the rest of the application inert.
    dialog.scrollTop = 0;
    byId('wahDialogPrimary').focus({ preventScroll: true });
  }
  function finish(value) {
    if (!active) return;
    const entry = active;
    active = null;
    if (dialog.open) dialog.close();
    entry.resolve(value);
    queueMicrotask(() => {
      if (active) return;
      if (queue.length) { showNext(); return; }
      const trigger = entry.trigger;
      if (trigger?.isConnected && !trigger.disabled && trigger.getClientRects().length) trigger.focus({ preventScroll: true });
      else document.querySelector('.tabs button.active:not(:disabled)')?.focus({ preventScroll: true });
    });
  }
  function enqueue(options) {
    return new Promise(resolve => {
      const trigger = options.returnFocus instanceof HTMLElement ? options.returnFocus
        : active && dialog.contains(document.activeElement) ? active.trigger : document.activeElement;
      queue.push({ options, resolve, trigger });
      showNext();
    });
  }
  // One listener set for the lifetime of this single shared dialog, not per open.
  byId('wahDialogPrimary').addEventListener('click', () => finish('primary'));
  byId('wahDialogSecondary').addEventListener('click', () => finish('secondary'));
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    if (active?.options.dismissible !== false) finish('dismiss');
  });
  dialog.addEventListener('close', () => {
    // Also settle a programmatic close. An old close event cannot dismiss a
    // newly opened queued dialog because that dialog is already open again.
    if (!dialog.open && active) finish('dismiss');
  });
  dialog.addEventListener('click', event => {
    if (event.target === dialog) event.preventDefault(); // Backdrop never chooses.
  });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.isComposing && !event.target.closest('button')) {
      event.preventDefault();
      byId('wahDialogPrimary').click();
      return;
    }
    if (event.key !== 'Tab') return;
    const buttons = [...dialog.querySelectorAll('button')].filter(button => !button.hidden && !button.disabled);
    const first = buttons[0], last = buttons.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  window.wahDialogs = Object.freeze({
    showInfo: options => enqueue({ ...options, kind: 'notice', variant: 'light' }),
    showConfirm: options => enqueue({ ...options, kind: 'confirm', variant: 'dark' }),
    showSessionRecovery: options => enqueue({ ...options, kind: 'recovery', variant: 'dark', dismissible: false })
  });
})();
