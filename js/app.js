/**
 * Main controller & bootstrap for Cheshire Custodial Inventory PWA.
 */

import {
  generateRestockCSV,
  generateRestockPlainText,
  getCampusRollup,
  getRestockSummary,
} from './selectors.js';
import { store } from './store.js';
import { cheshireEmblemSvg, ICONS } from './ui/icons.js';
import { createModalController } from './ui/modals.js';
import {
  renderBuildingDetail,
  renderBuildingsOverview,
  renderCatalogView,
  renderHistoryView,
  renderRestockView,
} from './ui/views.js';

const uiState = {
  route: 'buildings', // 'buildings' | 'building-detail' | 'catalog' | 'restock' | 'history'
  selectedBuildingId: null,
  selectedAreaTab: 'rollup',
  buildingSearch: '',
  areaItemSearch: '',
  areaItemFilter: 'all',
  catalogSearch: '',
  catalogCategory: 'All',
  restockMode: 'by-building',
  restockUrgency: 'all',
  historyType: 'all',
  historyBuildingId: 'all',
};

const appMain = document.getElementById('app-main');
const sidebarNav = document.getElementById('sidebar-nav');
const mobileNav = document.getElementById('mobile-bottom-nav');
const modalDialog = document.getElementById('cheshire-modal');
const toastRegion = document.getElementById('toast-region');

// Populate Cheshire emblem icons in shell
document.querySelectorAll('[data-cheshire-emblem]').forEach((el) => {
  const size = Number(el.dataset.cheshireEmblem) || 32;
  el.innerHTML = cheshireEmblemSvg(size);
});

function showToast(message, variant = 'default') {
  while (toastRegion.children.length >= 2) {
    toastRegion.firstElementChild.remove();
  }
  const toast = document.createElement('div');
  toast.className = `toast ${variant === 'error' ? 'is-error' : variant === 'gold' ? 'is-gold' : ''}`;
  toast.setAttribute('role', 'status');
  toast.textContent = message;
  toastRegion.appendChild(toast);

  window.setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    toast.style.transition = 'opacity 180ms ease, transform 180ms ease';
    window.setTimeout(() => toast.remove(), 200);
  }, 3000);
}

function navigate(route, opts = {}) {
  uiState.route = route;
  if (opts.buildingId !== undefined) {
    uiState.selectedBuildingId = opts.buildingId;
  }
  if (opts.areaTab !== undefined) {
    uiState.selectedAreaTab = opts.areaTab;
  }
  if (route === 'buildings') {
    uiState.areaItemSearch = '';
    uiState.areaItemFilter = 'all';
  }
  renderApp();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

const modals = createModalController(modalDialog, store, {
  onToast: showToast,
  onNavigate: navigate,
});

function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function renderNavigation(state) {
  const campus = getCampusRollup(state);
  const activeNav = uiState.route === 'building-detail' ? 'buildings' : uiState.route;

  const navItems = [
    {
      id: 'buildings',
      label: 'Buildings',
      icon: ICONS.building,
      badge: campus.buildingCount > 0 ? String(campus.buildingCount) : '',
      badgeClass: '',
    },
    {
      id: 'catalog',
      label: 'Catalog',
      icon: ICONS.catalog,
      badge: String(campus.catalogItemCount),
      badgeClass: '',
    },
    {
      id: 'restock',
      label: 'Restock',
      icon: ICONS.restock,
      badge: campus.restockItemCount > 0 ? String(campus.restockItemCount) : '',
      badgeClass: campus.alertCount > 0 ? 'is-alert' : 'is-gold',
    },
    {
      id: 'history',
      label: 'History & Backup',
      mobileLabel: 'History',
      icon: ICONS.history,
      badge: state.activityLog.length > 0 ? String(state.activityLog.length) : '',
      badgeClass: '',
    },
  ];

  sidebarNav.innerHTML = navItems
    .map(
      (item) => `
      <li>
        <button
          id="nav-${item.id}"
          class="nav-item-btn ${activeNav === item.id ? 'is-active' : ''}"
          data-action="navigate"
          data-route="${item.id}"
          aria-current="${activeNav === item.id ? 'page' : 'false'}"
        >
          ${item.icon}
          <span>${item.label}</span>
          ${item.badge ? `<span class="nav-badge ${item.badgeClass}">${item.badge}</span>` : ''}
        </button>
      </li>`
    )
    .join('');

  mobileNav.innerHTML = navItems
    .map(
      (item) => `
      <button
        class="mobile-nav-btn ${activeNav === item.id ? 'is-active' : ''}"
        data-action="navigate"
        data-route="${item.id}"
        aria-current="${activeNav === item.id ? 'page' : 'false'}"
      >
        ${item.icon}
        <span>${item.mobileLabel || item.label}</span>
        ${item.id === 'restock' && campus.restockItemCount > 0 ? `<span class="mobile-nav-dot">${campus.restockItemCount}</span>` : ''}
      </button>`
    )
    .join('');
}

function renderApp() {
  const state = store.getState();

  // Keep focused search input caret position stable across re-renders
  const activeEl = document.activeElement;
  const activeId = activeEl?.id || null;
  const activeSelStart =
    activeEl && typeof activeEl.selectionStart === 'number' ? activeEl.selectionStart : null;

  renderNavigation(state);

  let html = '';
  switch (uiState.route) {
    case 'building-detail':
      html = renderBuildingDetail(state, uiState);
      break;
    case 'catalog':
      html = renderCatalogView(state, uiState);
      break;
    case 'restock':
      html = renderRestockView(state, uiState);
      break;
    case 'history':
      html = renderHistoryView(state, uiState);
      break;
    case 'buildings':
    default:
      html = renderBuildingsOverview(state, uiState);
      break;
  }

  appMain.innerHTML = `<div class="workspace-inner">${html}</div>`;

  if (activeId && activeId.startsWith('input-')) {
    const restored = document.getElementById(activeId);
    if (restored) {
      restored.focus();
      if (activeSelStart !== null && typeof restored.setSelectionRange === 'function') {
        try {
          restored.setSelectionRange(activeSelStart, activeSelStart);
        } catch {
          // Ignore for input types that do not support selectionRange
        }
      }
    }
  }
}

/* ============================================================================
   Delegated Event Handling
   ============================================================================ */

document.addEventListener('click', async (event) => {
  const trigger = event.target.closest('[data-action]');
  if (!trigger || trigger.disabled) return;

  const { action } = trigger.dataset;

  switch (action) {
    case 'navigate':
      navigate(trigger.dataset.route);
      break;

    case 'open-building':
      navigate('building-detail', {
        buildingId: trigger.dataset.buildingId,
        areaTab: 'rollup',
      });
      break;

    case 'open-building-area':
      navigate('building-detail', {
        buildingId: trigger.dataset.buildingId,
        areaTab: trigger.dataset.areaId,
      });
      break;

    case 'select-area-tab':
      uiState.selectedAreaTab = trigger.dataset.areaTab;
      renderApp();
      break;

    case 'open-add-building':
      modals.openBuildingModal(null);
      break;

    case 'open-edit-building':
      modals.openBuildingModal(trigger.dataset.buildingId);
      break;

    case 'open-add-area':
      modals.openStorageAreaModal({ buildingId: trigger.dataset.buildingId });
      break;

    case 'open-edit-area':
      modals.openStorageAreaModal({ areaId: trigger.dataset.areaId });
      break;

    case 'open-add-item':
      modals.openItemModal(null);
      break;

    case 'open-edit-item':
      modals.openItemModal(trigger.dataset.itemId);
      break;

    case 'open-transfer':
      modals.openTransferModal({
        fromAreaId: trigger.dataset.fromAreaId || null,
        itemId: trigger.dataset.itemId || null,
        buildingId: trigger.dataset.buildingId || null,
      });
      break;

    case 'open-building-targets':
      modals.openBuildingTargetsModal(trigger.dataset.buildingId, trigger.dataset.itemId);
      break;

    case 'open-area-targets':
      modals.openAreaTargetsModal(trigger.dataset.areaId, trigger.dataset.itemId);
      break;

    case 'open-quick-restock':
      modals.openQuickRestockModal({
        buildingId: trigger.dataset.buildingId,
        itemId: trigger.dataset.itemId,
        suggestedQty: trigger.dataset.qty,
      });
      break;

    case 'step-stock': {
      const delta = Number(trigger.dataset.delta);
      store.adjustStock({
        storageAreaId: trigger.dataset.areaId,
        itemId: trigger.dataset.itemId,
        delta,
      });
      break;
    }

    case 'toggle-area-na': {
      const nextNA = trigger.dataset.nextNa === 'true';
      const state = store.getState();
      const item = state.items.find((i) => i.id === trigger.dataset.itemId);
      const area = state.storageAreas.find((a) => a.id === trigger.dataset.areaId);
      store.setAreaNotApplicable({
        storageAreaId: trigger.dataset.areaId,
        itemId: trigger.dataset.itemId,
        notApplicable: nextNA,
      });
      showToast(
        nextNA
          ? `Marked ${item?.name || 'item'} as N/A in ${area?.name || 'storage location'}.`
          : `Restored ${item?.name || 'item'} in ${area?.name || 'storage location'}.`
      );
      break;
    }

    case 'set-area-filter':
      uiState.areaItemFilter = trigger.dataset.filter;
      renderApp();
      break;

    case 'set-catalog-category':
      uiState.catalogCategory = trigger.dataset.category;
      renderApp();
      break;

    case 'set-restock-mode':
      uiState.restockMode = trigger.dataset.mode;
      renderApp();
      break;

    case 'set-restock-urgency':
      uiState.restockUrgency = trigger.dataset.urgency;
      renderApp();
      break;

    case 'set-history-type':
      uiState.historyType = trigger.dataset.type;
      renderApp();
      break;

    case 'copy-restock': {
      const summary = getRestockSummary(store.getState(), uiState.restockUrgency);
      const text = generateRestockPlainText(summary);
      try {
        await navigator.clipboard.writeText(text);
        showToast('Restock list copied to clipboard!', 'gold');
      } catch {
        showToast('Clipboard blocked — try Export CSV instead.', 'error');
      }
      break;
    }

    case 'export-restock-csv': {
      const summary = getRestockSummary(store.getState(), uiState.restockUrgency);
      const csv = generateRestockCSV(summary);
      const stamp = new Date().toISOString().slice(0, 10);
      downloadFile(`cheshire-restock-${stamp}.csv`, csv, 'text/csv;charset=utf-8');
      showToast('Downloaded restock CSV.');
      break;
    }

    case 'print-page':
      window.print();
      break;

    case 'export-json': {
      const json = store.exportStateJSON();
      const stamp = new Date().toISOString().slice(0, 10);
      downloadFile(`cheshire-custodial-backup-${stamp}.json`, json, 'application/json');
      showToast('JSON backup downloaded!', 'gold');
      break;
    }

    case 'clear-log':
      if (confirm('Clear all activity log entries? (Your inventory counts will not be affected.)')) {
        store.clearActivityLog();
        showToast('Activity log cleared.');
      }
      break;

    case 'open-reset-confirm':
      modals.openResetConfirmModal();
      break;

    default:
      break;
  }
});

// Live search inputs
document.addEventListener('input', (event) => {
  const input = event.target.closest('[data-filter-input]');
  if (!input) return;
  const key = input.dataset.filterInput;
  if (key in uiState) {
    uiState[key] = input.value;
    renderApp();
  }
});

// Select filters & JSON file import & direct numeric stock edits
document.addEventListener('change', async (event) => {
  const filterSelect = event.target.closest('[data-filter-select]');
  if (filterSelect) {
    const key = filterSelect.dataset.filterSelect;
    if (key in uiState) {
      uiState[key] = filterSelect.value;
      renderApp();
    }
    return;
  }

  const stockInput = event.target.closest('[data-stock-input]');
  if (stockInput) {
    const val = Number(stockInput.value);
    store.setStock({
      storageAreaId: stockInput.dataset.areaId,
      itemId: stockInput.dataset.itemId,
      quantity: Number.isFinite(val) && val >= 0 ? val : 0,
    });
    return;
  }

  if (event.target.id === 'input-import-json') {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      if (
        confirm(
          `Restore backup from "${file.name}"? This will replace your current buildings, storage areas, and counts.`
        )
      ) {
        store.importStateJSON(text);
        showToast('Backup restored successfully!', 'gold');
        navigate('buildings');
      }
    } catch (err) {
      showToast(err.message || 'Could not read backup file.', 'error');
    } finally {
      event.target.value = '';
    }
  }
});

// Subscribe to store updates
store.subscribe(() => {
  renderApp();
});

// Initial render
renderApp();

// Register offline Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('Service worker registration skipped:', err);
    });
  });
}
