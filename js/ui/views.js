/**
 * View renderers for Cheshire Custodial Inventory.
 * Produces accessible, semantic HTML templates driven by pure rollup selectors.
 */

import { BUILDING_ACCENTS, STATUS_META, SUPPLY_CATEGORIES } from '../constants.js';
import {
  getAreaInventory,
  getBuildingRollup,
  getCampusRollup,
  getRestockSummary,
} from '../selectors.js';
import { cheshireEmblemSvg, ICONS } from './icons.js';

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getAccentHex(accentId) {
  return BUILDING_ACCENTS.find((a) => a.id === accentId)?.hex || '#EC4899';
}

function formatQty(num) {
  if (!Number.isFinite(num)) return '0';
  return Number.isInteger(num) ? String(num) : num.toFixed(2).replace(/\.?0+$/, '');
}

function formatRelativeTime(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 45) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function renderStatusPill(status) {
  const meta = STATUS_META[status] || STATUS_META.healthy;
  return `<span class="status-pill status-${escapeHtml(status)}" title="${escapeHtml(meta.description)}">${escapeHtml(meta.label)}</span>`;
}

function renderParMeter(current, par, status) {
  const pct = par > 0 ? Math.min(100, Math.round((current / par) * 100)) : current > 0 ? 100 : 0;
  return `
    <div class="par-meter" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
      <div class="par-meter-fill status-${escapeHtml(status)}" style="width: ${pct}%"></div>
    </div>
  `;
}

/* ============================================================================
   1. Buildings & Campus Rollup Overview
   ============================================================================ */

export function renderBuildingsOverview(state, uiState) {
  const campus = getCampusRollup(state);
  const query = (uiState.buildingSearch || '').trim().toLowerCase();

  const filteredBuildings = campus.buildingRollups.filter((bRollup) => {
    if (!query) return true;
    const matchName = bRollup.building.name.toLowerCase().includes(query);
    const matchCode = (bRollup.building.code || '').toLowerCase().includes(query);
    const matchArea = bRollup.areas.some((a) => a.name.toLowerCase().includes(query));
    return matchName || matchCode || matchArea;
  });

  const canTransfer = state.storageAreas.length >= 2;

  const headerHtml = `
    <header class="page-header">
      <div class="page-header-text">
        <div class="page-eyebrow">${ICONS.sparkles} Multi-Building Rollup</div>
        <h1 class="page-title">Buildings &amp; Storage Overview</h1>
        <p class="page-subtitle">Storage closet counts automatically aggregate into each building's total inventory and campus-wide restock alerts.</p>
      </div>
      <div class="action-group">
        <button id="btn-overview-transfer" class="btn" data-action="open-transfer" ${canTransfer ? '' : 'disabled title="Add at least 2 storage areas to transfer stock"'}>
          ${ICONS.transfer} Transfer Stock
        </button>
        <button id="btn-overview-add-building" class="btn btn-primary" data-action="open-add-building">
          ${ICONS.plus} Add Building
        </button>
      </div>
    </header>
  `;

  if (state.buildings.length === 0) {
    const starterChips = state.items
      .map((item) => `<span class="starter-chip">${escapeHtml(item.name)} (${escapeHtml(item.unit)})</span>`)
      .join('');

    return `
      ${headerHtml}
      <section class="empty-state" aria-label="Getting started">
        <div class="empty-state-emblem">${cheshireEmblemSvg(48)}</div>
        <h2>Nothing in the Looking Glass Yet</h2>
        <p>Your <strong>${state.items.length} custodial supplies</strong> are pre-loaded and ready. Add your first building and its storage areas to start tracking and rolling up inventory.</p>
        <div class="starter-chips" aria-label="Pre-loaded starter items">${starterChips}</div>
        <div class="action-group" style="justify-content: center;">
          <button id="btn-empty-add-building" class="btn btn-primary" data-action="open-add-building">
            ${ICONS.plus} Add Your First Building
          </button>
          <button id="btn-empty-view-catalog" class="btn" data-action="navigate" data-route="catalog">
            ${ICONS.catalog} Customize Supply Catalog
          </button>
        </div>
      </section>
    `;
  }

  const kpiHtml = `
    <section class="kpi-grid" aria-label="Campus summary metrics">
      <article class="kpi-card">
        <span class="kpi-label">Locations</span>
        <span class="kpi-value">${campus.buildingCount}</span>
        <span class="kpi-meta">${campus.storageAreaCount} storage area${campus.storageAreaCount === 1 ? '' : 's'} tracked</span>
      </article>
      <article class="kpi-card">
        <span class="kpi-label">Total Stock On Hand</span>
        <span class="kpi-value is-rose">${formatQty(campus.totalUnitsOnHand)}</span>
        <span class="kpi-meta">Across ${campus.catalogItemCount} catalog supplies</span>
      </article>
      <article class="kpi-card">
        <span class="kpi-label">Active Alerts</span>
        <span class="kpi-value ${campus.alertCount > 0 ? 'is-alert' : ''}">${campus.alertCount}</span>
        <span class="kpi-meta">${campus.vanishedCount} vanished · ${campus.lowCount} fading fast</span>
      </article>
      <article class="kpi-card">
        <span class="kpi-label">Needs Restock</span>
        <span class="kpi-value ${campus.totalRestockUnits > 0 ? 'is-gold' : ''}">${formatQty(campus.totalRestockUnits)}</span>
        <span class="kpi-meta">${campus.restockItemCount} building item${campus.restockItemCount === 1 ? '' : 's'} below par</span>
      </article>
    </section>
  `;

  const toolbarHtml = `
    <div class="toolbar">
      <div class="search-wrap">
        ${ICONS.search}
        <input
          id="input-building-search"
          type="search"
          class="input search-input"
          placeholder="Search buildings or storage areas..."
          value="${escapeHtml(uiState.buildingSearch || '')}"
          data-filter-input="buildingSearch"
        />
      </div>
      <div class="action-group">
        ${
          campus.restockItemCount > 0
            ? `<button id="btn-overview-restock" class="btn btn-gold btn-sm" data-action="navigate" data-route="restock">
                ${ICONS.restock} View Restock List (${campus.restockItemCount})
              </button>`
            : ''
        }
      </div>
    </div>
  `;

  const cardsHtml =
    filteredBuildings.length === 0
      ? `<div class="panel-card" style="padding: 36px; text-align: center; color: var(--ink-secondary);">No buildings or storage areas match "${escapeHtml(uiState.buildingSearch)}".</div>`
      : `<section class="buildings-grid" aria-label="Buildings list">
          ${filteredBuildings.map((bRollup) => renderBuildingCard(bRollup)).join('')}
        </section>`;

  return `${headerHtml}${kpiHtml}${toolbarHtml}${cardsHtml}`;
}

function renderBuildingCard(bRollup) {
  const { building, areas, items, totalUnits, alertCount, restockItemCount } = bRollup;
  const accentHex = getAccentHex(building.accent);

  // Show top 4 items prioritized by severity so urgent shortages surface right away
  const topItems = [...items]
    .sort((a, b) => {
      const sevDiff = (STATUS_META[b.status]?.severity ?? 0) - (STATUS_META[a.status]?.severity ?? 0);
      if (sevDiff !== 0) return sevDiff;
      return b.totalQuantity - a.totalQuantity;
    })
    .slice(0, 4);

  const areaChips =
    areas.length === 0
      ? `<span class="field-hint">No storage areas yet — add a closet to count supplies.</span>`
      : areas
          .map(
            (area) => `
          <button
            class="area-chip-btn"
            data-action="open-building-area"
            data-building-id="${escapeHtml(building.id)}"
            data-area-id="${escapeHtml(area.id)}"
            title="Jump straight to ${escapeHtml(area.name)}"
          >
            ${ICONS.closet} ${escapeHtml(area.name)}
          </button>`
          )
          .join('');

  return `
    <article class="building-card" style="--bldg-accent: ${accentHex}" data-building-card="${escapeHtml(building.id)}">
      <div class="building-card-head">
        <div>
          <div class="building-name-row">
            <h2 class="building-card-title">${escapeHtml(building.name)}</h2>
            ${building.code ? `<span class="code-badge">${escapeHtml(building.code)}</span>` : ''}
          </div>
          <p class="building-meta">
            ${areas.length} storage area${areas.length === 1 ? '' : 's'}${building.notes ? ` · ${escapeHtml(building.notes)}` : ''}
          </p>
        </div>
        <button
          class="btn btn-ghost btn-icon"
          data-action="open-edit-building"
          data-building-id="${escapeHtml(building.id)}"
          aria-label="Edit ${escapeHtml(building.name)}"
          title="Edit building"
        >
          ${ICONS.edit}
        </button>
      </div>

      <div class="building-stats-row">
        <div class="mini-stat">
          <span class="mini-stat-label">Total Qty</span>
          <span class="mini-stat-val">${formatQty(totalUnits)}</span>
        </div>
        <div class="mini-stat">
          <span class="mini-stat-label">Alerts</span>
          <span class="mini-stat-val ${alertCount > 0 ? 'is-alert' : ''}">${alertCount}</span>
        </div>
        <div class="mini-stat">
          <span class="mini-stat-label">Below Par</span>
          <span class="mini-stat-val ${restockItemCount > 0 ? 'is-gold' : ''}">${restockItemCount}</span>
        </div>
      </div>

      <div>
        <div class="field-label" style="margin-bottom: 8px;">Storage Areas</div>
        <div class="area-chips-row">
          ${areaChips}
          <button
            class="area-chip-btn"
            style="border-style: dashed; color: var(--cheshire-rose-bright);"
            data-action="open-add-area"
            data-building-id="${escapeHtml(building.id)}"
          >
            + Add Area
          </button>
        </div>
      </div>

      <div>
        <div class="field-label" style="margin-bottom: 8px;">Aggregated Building Rollup</div>
        <div class="rollup-preview-list">
          ${topItems
            .map(
              (row) => `
            <div class="rollup-preview-row">
              <span class="rollup-preview-name">${escapeHtml(row.item.name)}</span>
              <span class="rollup-preview-qty">
                <span>${formatQty(row.totalQuantity)} / ${formatQty(row.effectiveParLevel)} ${escapeHtml(row.item.unit)}</span>
                ${renderStatusPill(row.status)}
              </span>
            </div>`
            )
            .join('')}
        </div>
      </div>

      <div class="building-card-foot">
        <span class="field-hint">${items.length} tracked supply types</span>
        <button
          class="btn btn-primary btn-sm"
          data-action="open-building"
          data-building-id="${escapeHtml(building.id)}"
        >
          Open Building Rollup
        </button>
      </div>
    </article>
  `;
}

/* ============================================================================
   2. Building Detail & Storage Area Counting View
   ============================================================================ */

export function renderBuildingDetail(state, uiState) {
  const bRollup = getBuildingRollup(state, uiState.selectedBuildingId);
  if (!bRollup) {
    return renderBuildingsOverview(state, uiState);
  }

  const { building, areas } = bRollup;
  const activeTab =
    uiState.selectedAreaTab &&
    (uiState.selectedAreaTab === 'rollup' ||
      areas.some((a) => a.id === uiState.selectedAreaTab))
      ? uiState.selectedAreaTab
      : 'rollup';

  const canTransfer = state.storageAreas.length >= 2;

  const headerHtml = `
    <div class="breadcrumb-bar">
      <button id="btn-back-buildings" class="breadcrumb-btn" data-action="navigate" data-route="buildings">
        ${ICONS.back} All Buildings
      </button>
      <span>/</span>
      <span style="color: var(--ink-primary); font-weight: 600;">${escapeHtml(building.name)}</span>
    </div>

    <header class="page-header">
      <div class="page-header-text">
        <div class="page-eyebrow" style="color: ${getAccentHex(building.accent)};">
          ${ICONS.building} Building Inventory ${building.code ? `· ${escapeHtml(building.code)}` : ''}
        </div>
        <h1 class="page-title">${escapeHtml(building.name)}</h1>
        <p class="page-subtitle">
          ${escapeHtml(building.notes || 'Count supplies inside any storage area below — totals automatically roll up to this building.')}
        </p>
      </div>
      <div class="action-group">
        <button id="btn-bldg-transfer" class="btn" data-action="open-transfer" data-building-id="${escapeHtml(building.id)}" ${canTransfer ? '' : 'disabled'}>
          ${ICONS.transfer} Transfer
        </button>
        <button id="btn-bldg-add-area" class="btn btn-primary" data-action="open-add-area" data-building-id="${escapeHtml(building.id)}">
          ${ICONS.plus} Add Storage Area
        </button>
        <button id="btn-bldg-edit" class="btn btn-icon" data-action="open-edit-building" data-building-id="${escapeHtml(building.id)}" title="Edit building" aria-label="Edit building">
          ${ICONS.edit}
        </button>
      </div>
    </header>
  `;

  const areaTabsHtml = `
    <nav class="area-switcher" aria-label="Storage areas in ${escapeHtml(building.name)}">
      <button
        id="tab-area-rollup"
        class="area-tab ${activeTab === 'rollup' ? 'is-active' : ''}"
        data-action="select-area-tab"
        data-area-tab="rollup"
      >
        ${ICONS.building}
        <span>Building Rollup</span>
        <span class="area-tab-count">${formatQty(bRollup.totalUnits)}</span>
      </button>

      ${areas
        .map((area) => {
          const areaInv = getAreaInventory(state, area.id);
          return `
          <button
            class="area-tab ${activeTab === area.id ? 'is-active' : ''}"
            data-action="select-area-tab"
            data-area-tab="${escapeHtml(area.id)}"
          >
            ${ICONS.closet}
            <span>${escapeHtml(area.name)}</span>
            <span class="area-tab-count">${formatQty(areaInv?.totalUnits || 0)}</span>
          </button>`;
        })
        .join('')}
    </nav>
  `;

  const bodyHtml =
    activeTab === 'rollup'
      ? renderBuildingRollupPanel(bRollup, uiState)
      : renderStorageAreaPanel(state, building, activeTab, uiState);

  return `${headerHtml}${areaTabsHtml}${bodyHtml}`;
}

function renderBuildingRollupPanel(bRollup, uiState) {
  const { building, areas, items } = bRollup;
  const search = (uiState.areaItemSearch || '').trim().toLowerCase();
  const filter = uiState.areaItemFilter || 'all';

  const filteredItems = items.filter((row) => {
    if (search && !row.item.name.toLowerCase().includes(search) && !row.item.category.toLowerCase().includes(search)) {
      return false;
    }
    if (filter === 'stocked') return row.totalQuantity > 0;
    if (filter === 'alerts') return row.status === 'vanished' || row.status === 'low' || row.restockNeeded > 0;
    return true;
  });

  const noAreasBanner =
    areas.length === 0
      ? `
      <div class="empty-state" style="margin: 18px 20px;">
        <div class="empty-state-emblem">${cheshireEmblemSvg(42)}</div>
        <h2>Add a Storage Area in ${escapeHtml(building.name)}</h2>
        <p>Create custodial closets, supply rooms, or basement cages inside this building. Counts entered in each area will roll up right here.</p>
        <button id="btn-first-area" class="btn btn-primary" data-action="open-add-area" data-building-id="${escapeHtml(building.id)}">
          ${ICONS.plus} Add First Storage Area
        </button>
      </div>`
      : '';

  return `
    <section class="panel-card">
      <div class="panel-header">
        <div>
          <h2 class="panel-title">Overall Aggregated Inventory</h2>
          <p class="panel-subtitle">Live rollup across ${areas.length} storage area${areas.length === 1 ? '' : 's'} · ${bRollup.alertCount} alert${bRollup.alertCount === 1 ? '' : 's'} · ${formatQty(bRollup.totalRestockUnits)} total units below par</p>
        </div>
        <div class="action-group">
          <div class="pill-tabs" role="tablist">
            <button class="pill-tab ${filter === 'all' ? 'is-active' : ''}" data-action="set-area-filter" data-filter="all">All (${items.length})</button>
            <button class="pill-tab ${filter === 'stocked' ? 'is-active' : ''}" data-action="set-area-filter" data-filter="stocked">Stocked (${bRollup.stockedItemCount})</button>
            <button class="pill-tab ${filter === 'alerts' ? 'is-active' : ''}" data-action="set-area-filter" data-filter="alerts">Needs Attention (${bRollup.restockItemCount})</button>
          </div>
          <button class="btn btn-sm" data-action="open-add-item">${ICONS.plus} New Item</button>
        </div>
      </div>

      ${noAreasBanner}

      <div style="padding: 14px 20px 0;">
        <div class="search-wrap" style="max-width: 360px;">
          ${ICONS.search}
          <input
            id="input-rollup-search"
            type="search"
            class="input search-input"
            placeholder="Filter supplies in ${escapeHtml(building.name)}..."
            value="${escapeHtml(uiState.areaItemSearch || '')}"
            data-filter-input="areaItemSearch"
          />
        </div>
      </div>

      <div class="table-wrap" style="margin-top: 12px;">
        <table class="data-table">
          <thead>
            <tr>
              <th>Supply Item</th>
              <th>Building Total</th>
              <th>Storage Area Breakdown</th>
              <th>Low / Par</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${
              filteredItems.length === 0
                ? `<tr><td colspan="6" style="text-align:center; padding: 28px; color: var(--ink-muted);">No matching supplies found.</td></tr>`
                : filteredItems
                    .map((row) => {
                      const breakdownHtml =
                        row.areaBreakdown.length === 0
                          ? `<span class="field-hint">No areas yet</span>`
                          : `<div class="breakdown-pills">
                              ${row.areaBreakdown
                                .map(
                                  (ab) => `
                                <button
                                  class="breakdown-pill"
                                  data-action="select-area-tab"
                                  data-area-tab="${escapeHtml(ab.areaId)}"
                                  title="Open ${escapeHtml(ab.areaName)}"
                                >
                                  <span>${escapeHtml(ab.areaName)}:</span>
                                  <strong>${formatQty(ab.quantity)}</strong>
                                </button>`
                                )
                                .join('')}
                            </div>`;

                      const sourceTag =
                        row.parSource === 'building'
                          ? 'Custom'
                          : row.parSource === 'areas'
                            ? 'Areas Σ'
                            : 'Default';

                      return `
                      <tr>
                        <td>
                          <div class="item-cell-title">${escapeHtml(row.item.name)}</div>
                          <div class="item-cell-meta">${escapeHtml(row.item.category)} · ${escapeHtml(row.item.unit)}</div>
                        </td>
                        <td>
                          <div class="mono-num" style="font-size: 1.12rem; font-weight: 700;">
                            ${formatQty(row.totalQuantity)} <span style="font-size: 0.78rem; color: var(--ink-muted); font-weight: 500;">${escapeHtml(row.item.unit)}</span>
                          </div>
                          <div style="width: 96px; margin-top: 6px;">${renderParMeter(row.totalQuantity, row.effectiveParLevel, row.status)}</div>
                        </td>
                        <td>${breakdownHtml}</td>
                        <td>
                          <div class="mono-num" style="font-size: 0.85rem;">
                            Low ${formatQty(row.effectiveLowThreshold)} / Par ${formatQty(row.effectiveParLevel)}
                          </div>
                          <div class="item-cell-meta">${sourceTag}${row.restockNeeded > 0 ? ` · Need +${formatQty(row.restockNeeded)}` : ''}</div>
                        </td>
                        <td>${renderStatusPill(row.status)}</td>
                        <td>
                          <button
                            class="btn btn-sm"
                            data-action="open-building-targets"
                            data-building-id="${escapeHtml(building.id)}"
                            data-item-id="${escapeHtml(row.item.id)}"
                            title="Customize Low/Par targets for this building"
                          >
                            ${ICONS.sliders} Targets
                          </button>
                        </td>
                      </tr>`;
                    })
                    .join('')
            }
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderStorageAreaPanel(state, building, areaId, uiState) {
  const areaInv = getAreaInventory(state, areaId);
  if (!areaInv) return '';

  const { area, items } = areaInv;
  const search = (uiState.areaItemSearch || '').trim().toLowerCase();
  const filter = uiState.areaItemFilter || 'all';
  const canTransfer = state.storageAreas.length >= 2;

  const filteredItems = items.filter((row) => {
    if (search && !row.item.name.toLowerCase().includes(search) && !row.item.category.toLowerCase().includes(search)) {
      return false;
    }
    if (filter === 'stocked') return row.quantity > 0;
    if (filter === 'alerts') return row.quantity === 0 || row.status === 'low' || row.status === 'below-par';
    return true;
  });

  return `
    <section class="panel-card">
      <div class="panel-header">
        <div>
          <h2 class="panel-title">${escapeHtml(area.name)}</h2>
          <p class="panel-subtitle">
            ${area.floorOrZone ? `${escapeHtml(area.floorOrZone)} · ` : ''}${formatQty(areaInv.totalUnits)} total units · ${areaInv.stockedItemCount} stocked supply type${areaInv.stockedItemCount === 1 ? '' : 's'}${area.notes ? ` · ${escapeHtml(area.notes)}` : ''}
          </p>
        </div>
        <div class="action-group">
          <button class="btn btn-sm" data-action="open-edit-area" data-area-id="${escapeHtml(area.id)}">
            ${ICONS.edit} Edit Area
          </button>
          <button class="btn btn-sm" data-action="open-transfer" data-from-area-id="${escapeHtml(area.id)}" ${canTransfer ? '' : 'disabled'}>
            ${ICONS.transfer} Transfer From Here
          </button>
          <button class="btn btn-primary btn-sm" data-action="open-add-item">
            ${ICONS.plus} Add New Item
          </button>
        </div>
      </div>

      <div class="toolbar" style="padding: 14px 20px 0; margin-bottom: 0;">
        <div class="search-wrap" style="max-width: 340px;">
          ${ICONS.search}
          <input
            id="input-area-item-search"
            type="search"
            class="input search-input"
            placeholder="Find supply in ${escapeHtml(area.name)}..."
            value="${escapeHtml(uiState.areaItemSearch || '')}"
            data-filter-input="areaItemSearch"
          />
        </div>
        <div class="pill-tabs">
          <button class="pill-tab ${filter === 'all' ? 'is-active' : ''}" data-action="set-area-filter" data-filter="all">All (${items.length})</button>
          <button class="pill-tab ${filter === 'stocked' ? 'is-active' : ''}" data-action="set-area-filter" data-filter="stocked">Stocked (${areaInv.stockedItemCount})</button>
          <button class="pill-tab ${filter === 'alerts' ? 'is-active' : ''}" data-action="set-area-filter" data-filter="alerts">Empty / Low</button>
        </div>
      </div>

      <div class="closet-items-grid">
        ${
          filteredItems.length === 0
            ? `<div style="grid-column: 1 / -1; text-align:center; padding: 28px; color: var(--ink-muted);">No matching supplies in this filter.</div>`
            : filteredItems
                .map((row) => {
                  const targetHint = row.hasAreaTargets
                    ? `Closet Low ${row.lowThresholdOverride ?? '—'} / Par ${row.parLevelOverride ?? '—'}`
                    : `Unit: ${row.item.unit}`;

                  return `
                  <article class="closet-item-card" data-area-item="${escapeHtml(row.item.id)}">
                    <div class="closet-item-head">
                      <div>
                        <div class="item-cell-title">${escapeHtml(row.item.name)}</div>
                        <div class="item-cell-meta">${escapeHtml(row.item.category)} · ${escapeHtml(targetHint)}</div>
                      </div>
                      ${row.hasAreaTargets || row.quantity === 0 ? renderStatusPill(row.status) : `<span class="status-pill status-healthy">${escapeHtml(row.item.unit)}</span>`}
                    </div>

                    <div class="closet-stepper-row">
                      <button
                        class="stepper-btn"
                        data-action="step-stock"
                        data-area-id="${escapeHtml(area.id)}"
                        data-item-id="${escapeHtml(row.item.id)}"
                        data-delta="-1"
                        aria-label="Decrease ${escapeHtml(row.item.name)} by 1"
                        ${row.quantity <= 0 ? 'disabled' : ''}
                      >
                        −
                      </button>
                      <div class="stepper-input-wrap">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          class="stepper-input"
                          value="${formatQty(row.quantity)}"
                          aria-label="${escapeHtml(row.item.name)} quantity in ${escapeHtml(area.name)}"
                          data-stock-input="true"
                          data-area-id="${escapeHtml(area.id)}"
                          data-item-id="${escapeHtml(row.item.id)}"
                        />
                      </div>
                      <button
                        class="stepper-btn is-plus"
                        data-action="step-stock"
                        data-area-id="${escapeHtml(area.id)}"
                        data-item-id="${escapeHtml(row.item.id)}"
                        data-delta="1"
                        aria-label="Increase ${escapeHtml(row.item.name)} by 1"
                      >
                        +
                      </button>
                    </div>

                    <div class="closet-item-foot">
                      <span>${row.updatedAt ? `Updated ${formatRelativeTime(row.updatedAt)}` : 'Not counted yet'}</span>
                      <div class="action-group" style="gap: 4px;">
                        <button
                          class="btn btn-ghost btn-sm"
                          data-action="open-area-targets"
                          data-area-id="${escapeHtml(area.id)}"
                          data-item-id="${escapeHtml(row.item.id)}"
                          title="Set closet-specific note or low/par targets"
                        >
                          ${ICONS.sliders}
                        </button>
                        <button
                          class="btn btn-ghost btn-sm"
                          data-action="open-transfer"
                          data-from-area-id="${escapeHtml(area.id)}"
                          data-item-id="${escapeHtml(row.item.id)}"
                          title="Transfer ${escapeHtml(row.item.name)}"
                          ${canTransfer && row.quantity > 0 ? '' : 'disabled'}
                        >
                          ${ICONS.transfer}
                        </button>
                      </div>
                    </div>
                  </article>`;
                })
                .join('')
        }
      </div>
    </section>
  `;
}

/* ============================================================================
   3. Supply Catalog View
   ============================================================================ */

export function renderCatalogView(state, uiState) {
  const campus = getCampusRollup(state);
  const search = (uiState.catalogSearch || '').trim().toLowerCase();
  const category = uiState.catalogCategory || 'All';

  const categories = ['All', ...SUPPLY_CATEGORIES];
  const filtered = campus.itemTotals.filter((row) => {
    if (category !== 'All' && row.item.category !== category) return false;
    if (
      search &&
      !row.item.name.toLowerCase().includes(search) &&
      !row.item.unit.toLowerCase().includes(search) &&
      !(row.item.notes || '').toLowerCase().includes(search)
    ) {
      return false;
    }
    return true;
  });

  return `
    <header class="page-header">
      <div class="page-header-text">
        <div class="page-eyebrow">${ICONS.catalog} Master Supply List</div>
        <h1 class="page-title">Custodial Supply Catalog</h1>
        <p class="page-subtitle">Manage tracked supplies, custom units, and default low-stock &amp; par targets. Add any new custodial items whenever you need them.</p>
      </div>
      <div class="action-group">
        <button id="btn-catalog-add-item" class="btn btn-primary" data-action="open-add-item">
          ${ICONS.plus} Add Supply Item
        </button>
      </div>
    </header>

    <div class="toolbar">
      <div class="search-wrap">
        ${ICONS.search}
        <input
          id="input-catalog-search"
          type="search"
          class="input search-input"
          placeholder="Search supplies, units, or notes..."
          value="${escapeHtml(uiState.catalogSearch || '')}"
          data-filter-input="catalogSearch"
        />
      </div>
      <div class="pill-tabs">
        ${categories
          .map(
            (cat) => `
          <button class="pill-tab ${category === cat ? 'is-active' : ''}" data-action="set-catalog-category" data-category="${escapeHtml(cat)}">
            ${escapeHtml(cat)}
          </button>`
          )
          .join('')}
      </div>
    </div>

    <section class="panel-card">
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Item Name</th>
              <th>Category</th>
              <th>Unit</th>
              <th>Default Low / Par</th>
              <th>Campus Total</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${
              filtered.length === 0
                ? `<tr><td colspan="6" style="text-align:center; padding: 30px; color: var(--ink-muted);">No items match your filter. Click "Add Supply Item" to add one.</td></tr>`
                : filtered
                    .map((row) => {
                      const bldgPills =
                        row.buildingBreakdown.length === 0
                          ? `<span class="field-hint">No buildings added yet</span>`
                          : `<div class="breakdown-pills" style="margin-top: 4px;">
                              ${row.buildingBreakdown
                                .map(
                                  (b) => `
                                <span class="breakdown-pill">
                                  <span>${escapeHtml(b.buildingName)}:</span>
                                  <strong>${formatQty(b.quantity)}</strong>
                                </span>`
                                )
                                .join('')}
                            </div>`;

                      return `
                      <tr>
                        <td>
                          <div class="item-cell-title">${escapeHtml(row.item.name)}</div>
                          ${row.item.notes ? `<div class="item-cell-meta">${escapeHtml(row.item.notes)}</div>` : ''}
                        </td>
                        <td><span class="code-badge">${escapeHtml(row.item.category)}</span></td>
                        <td class="mono-num">${escapeHtml(row.item.unit)}</td>
                        <td class="mono-num">Low ${formatQty(row.item.defaultLowThreshold)} / Par ${formatQty(row.item.defaultParLevel)}</td>
                        <td>
                          <div class="mono-num" style="font-weight: 700;">${formatQty(row.totalQuantity)} ${escapeHtml(row.item.unit)}</div>
                          ${bldgPills}
                        </td>
                        <td>
                          <button
                            class="btn btn-sm"
                            data-action="open-edit-item"
                            data-item-id="${escapeHtml(row.item.id)}"
                          >
                            ${ICONS.edit} Edit
                          </button>
                        </td>
                      </tr>`;
                    })
                    .join('')
            }
          </tbody>
        </table>
      </div>
    </section>
  `;
}

/* ============================================================================
   4. Automatic Needs Restock & Master Order Sheet View
   ============================================================================ */

export function renderRestockView(state, uiState) {
  const mode = uiState.restockMode || 'by-building';
  const urgency = uiState.restockUrgency || 'all';
  const summary = getRestockSummary(state, urgency);

  const headerHtml = `
    <header class="page-header">
      <div class="page-header-text">
        <div class="page-eyebrow">${ICONS.restock} Par-Level Requisition</div>
        <h1 class="page-title">Needs Restock List</h1>
        <p class="page-subtitle">Automatically calculated from building rollups versus par targets. Switch to Master Order Sheet for combined purchasing totals.</p>
      </div>
      <div class="action-group">
        <button id="btn-copy-restock" class="btn" data-action="copy-restock" ${summary.masterOrderSheet.length === 0 ? 'disabled' : ''}>
          ${ICONS.copy} Copy List
        </button>
        <button id="btn-export-csv" class="btn" data-action="export-restock-csv" ${summary.masterOrderSheet.length === 0 ? 'disabled' : ''}>
          ${ICONS.download} Export CSV
        </button>
        <button id="btn-print-restock" class="btn btn-gold" data-action="print-page" ${summary.masterOrderSheet.length === 0 ? 'disabled' : ''}>
          ${ICONS.print} Print Sheet
        </button>
      </div>
    </header>
  `;

  if (state.buildings.length === 0) {
    return `
      ${headerHtml}
      <section class="empty-state">
        <div class="empty-state-emblem">${cheshireEmblemSvg(44)}</div>
        <h2>No Buildings to Check Yet</h2>
        <p>Add your buildings and storage areas first — Cheshire will automatically highlight anything running low or below par.</p>
        <button class="btn btn-primary" data-action="open-add-building">${ICONS.plus} Add Building</button>
      </section>
    `;
  }

  const toolbarHtml = `
    <div class="toolbar">
      <div class="pill-tabs" role="tablist">
        <button id="tab-restock-by-building" class="pill-tab ${mode === 'by-building' ? 'is-active' : ''}" data-action="set-restock-mode" data-mode="by-building">
          By Building (${summary.byBuilding.length})
        </button>
        <button id="tab-restock-master" class="pill-tab ${mode === 'master' ? 'is-active' : ''}" data-action="set-restock-mode" data-mode="master">
          Master Order Sheet (${summary.masterOrderSheet.length})
        </button>
      </div>

      <div class="pill-tabs">
        <button class="pill-tab ${urgency === 'all' ? 'is-active' : ''}" data-action="set-restock-urgency" data-urgency="all">All Below Par</button>
        <button class="pill-tab ${urgency === 'low' ? 'is-active' : ''}" data-action="set-restock-urgency" data-urgency="low">Low &amp; Vanished</button>
        <button class="pill-tab ${urgency === 'vanished' ? 'is-active' : ''}" data-action="set-restock-urgency" data-urgency="vanished">Vanished Only</button>
      </div>
    </div>
  `;

  if (summary.masterOrderSheet.length === 0) {
    return `
      ${headerHtml}
      ${toolbarHtml}
      <section class="empty-state">
        <div class="empty-state-emblem">${cheshireEmblemSvg(44)}</div>
        <h2>All Grins — Nothing Needed Here!</h2>
        <p>Every building matches or exceeds the selected stock criteria. All custodial supplies are accounted for.</p>
      </section>
    `;
  }

  if (mode === 'master') {
    return `
      ${headerHtml}
      ${toolbarHtml}
      <section class="panel-card">
        <div class="panel-header">
          <div>
            <h2 class="panel-title">Master Order Sheet (Campus Consolidated)</h2>
            <p class="panel-subtitle">${summary.masterOrderSheet.length} supply types · ${formatQty(summary.totalUnitsNeeded)} total units needed across all buildings</p>
          </div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Supply Item</th>
                <th>Total On Hand / Par</th>
                <th>Total To Order</th>
                <th>Building Breakdown</th>
                <th>Highest Urgency</th>
              </tr>
            </thead>
            <tbody>
              ${summary.masterOrderSheet
                .map(
                  (row) => `
                <tr>
                  <td>
                    <div class="item-cell-title">${escapeHtml(row.item.name)}</div>
                    <div class="item-cell-meta">${escapeHtml(row.item.category)}</div>
                  </td>
                  <td class="mono-num">${formatQty(row.totalCurrent)} / ${formatQty(row.totalPar)} ${escapeHtml(row.item.unit)}</td>
                  <td><span class="order-qty-badge">+${formatQty(row.totalNeeded)} ${escapeHtml(row.item.unit)}</span></td>
                  <td>
                    <div class="breakdown-pills">
                      ${row.buildings
                        .map(
                          (b) => `
                        <span class="breakdown-pill">
                          <span>${escapeHtml(b.buildingName)}:</span>
                          <strong>+${formatQty(b.restockNeeded)}</strong>
                        </span>`
                        )
                        .join('')}
                    </div>
                  </td>
                  <td>${renderStatusPill(row.worstStatus)}</td>
                </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  // By-Building Mode
  return `
    ${headerHtml}
    ${toolbarHtml}
    <div class="restock-groups">
      ${summary.byBuilding
        .map(
          (group) => `
        <section class="panel-card">
          <div class="panel-header">
            <div>
              <h2 class="panel-title">${escapeHtml(group.building.name)}</h2>
              <p class="panel-subtitle">${group.items.length} item${group.items.length === 1 ? '' : 's'} to restock · ${formatQty(group.totalUnitsNeeded)} total units needed</p>
            </div>
            <button class="btn btn-sm" data-action="open-building" data-building-id="${escapeHtml(group.building.id)}">
              Open Building
            </button>
          </div>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Supply Item</th>
                  <th>Building Qty / Par</th>
                  <th>Qty Needed</th>
                  <th>Urgency</th>
                  <th>Quick Restock</th>
                </tr>
              </thead>
              <tbody>
                ${group.items
                  .map(
                    (row) => `
                  <tr>
                    <td>
                      <div class="item-cell-title">${escapeHtml(row.item.name)}</div>
                      <div class="item-cell-meta">${escapeHtml(row.item.category)}</div>
                    </td>
                    <td class="mono-num">${formatQty(row.totalQuantity)} / ${formatQty(row.effectiveParLevel)} ${escapeHtml(row.item.unit)}</td>
                    <td><span class="order-qty-badge">+${formatQty(row.restockNeeded)} ${escapeHtml(row.item.unit)}</span></td>
                    <td>${renderStatusPill(row.status)}</td>
                    <td>
                      <button
                        class="btn btn-sm btn-primary"
                        data-action="open-quick-restock"
                        data-building-id="${escapeHtml(group.building.id)}"
                        data-item-id="${escapeHtml(row.item.id)}"
                        data-qty="${formatQty(row.restockNeeded)}"
                        ${group.areas.length === 0 ? 'disabled title="Add a storage area in this building first"' : ''}
                      >
                        ${ICONS.check} Restock
                      </button>
                    </td>
                  </tr>`
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </section>`
        )
        .join('')}
    </div>
  `;
}

/* ============================================================================
   5. Activity History Log & JSON Backup View
   ============================================================================ */

export function renderHistoryView(state, uiState) {
  const typeFilter = uiState.historyType || 'all';
  const buildingFilter = uiState.historyBuildingId || 'all';

  const filteredLogs = state.activityLog.filter((entry) => {
    if (typeFilter !== 'all' && entry.type !== typeFilter) return false;
    if (
      buildingFilter !== 'all' &&
      entry.buildingId !== buildingFilter &&
      entry.toBuildingId !== buildingFilter
    ) {
      return false;
    }
    return true;
  });

  const typeIcon = (type) => {
    if (type === 'transfer') return ICONS.transfer;
    if (type === 'stock') return ICONS.sliders;
    if (type === 'catalog') return ICONS.catalog;
    if (type === 'location') return ICONS.building;
    return ICONS.sparkles;
  };

  return `
    <header class="page-header">
      <div class="page-header-text">
        <div class="page-eyebrow">${ICONS.history} Audit Trail &amp; Portability</div>
        <h1 class="page-title">Activity Log &amp; Data Backup</h1>
        <p class="page-subtitle">Track every stock count change, transfer, and catalog edit. Export a JSON snapshot anytime to back up or move data between devices.</p>
      </div>
    </header>

    <div class="split-grid">
      <section class="panel-card">
        <div class="panel-header">
          <div>
            <h2 class="panel-title">Change History (${filteredLogs.length})</h2>
            <p class="panel-subtitle">Most recent custodial inventory activity</p>
          </div>
          <div class="action-group">
            ${
              state.activityLog.length > 0
                ? `<button id="btn-clear-log" class="btn btn-sm btn-ghost" data-action="clear-log">Clear Log</button>`
                : ''
            }
          </div>
        </div>

        <div class="toolbar" style="padding: 14px 18px 10px; margin-bottom: 0; border-bottom: 1px solid var(--border-subtle);">
          <div class="pill-tabs">
            <button class="pill-tab ${typeFilter === 'all' ? 'is-active' : ''}" data-action="set-history-type" data-type="all">All</button>
            <button class="pill-tab ${typeFilter === 'stock' ? 'is-active' : ''}" data-action="set-history-type" data-type="stock">Counts</button>
            <button class="pill-tab ${typeFilter === 'transfer' ? 'is-active' : ''}" data-action="set-history-type" data-type="transfer">Transfers</button>
            <button class="pill-tab ${typeFilter === 'catalog' ? 'is-active' : ''}" data-action="set-history-type" data-type="catalog">Catalog</button>
            <button class="pill-tab ${typeFilter === 'location' ? 'is-active' : ''}" data-action="set-history-type" data-type="location">Locations</button>
          </div>

          <select id="select-history-building" class="select" style="width: auto; min-width: 170px;" data-filter-select="historyBuildingId">
            <option value="all" ${buildingFilter === 'all' ? 'selected' : ''}>All Buildings</option>
            ${state.buildings
              .map(
                (b) =>
                  `<option value="${escapeHtml(b.id)}" ${buildingFilter === b.id ? 'selected' : ''}>${escapeHtml(b.name)}</option>`
              )
              .join('')}
          </select>
        </div>

        ${
          filteredLogs.length === 0
            ? `<div style="padding: 36px 20px; text-align: center; color: var(--ink-muted);">No activity recorded for this filter yet.</div>`
            : `<ul class="log-list">
                ${filteredLogs
                  .map(
                    (entry) => `
                  <li class="log-entry">
                    <div class="log-dot type-${escapeHtml(entry.type)}">${typeIcon(entry.type)}</div>
                    <div class="log-body">
                      <div class="log-summary">${escapeHtml(entry.summary)}</div>
                      ${entry.note ? `<div class="log-note">"${escapeHtml(entry.note)}"</div>` : ''}
                      <div class="log-time">${formatRelativeTime(entry.timestamp)}</div>
                    </div>
                  </li>`
                  )
                  .join('')}
              </ul>`
        }
      </section>

      <aside class="backup-stack">
        <section class="panel-card">
          <div class="panel-header">
            <h2 class="panel-title">JSON Backup &amp; Sync</h2>
          </div>
          <div class="backup-box">
            <p>All inventory data is stored locally on this device so it works offline in supply closets. Export a JSON file to back up or share with another phone/tablet.</p>
            <button id="btn-export-json" class="btn btn-primary" data-action="export-json">
              ${ICONS.download} Download JSON Backup
            </button>
            <label class="btn" for="input-import-json" style="cursor: pointer;">
              ${ICONS.upload} Import JSON Backup
            </label>
            <input id="input-import-json" type="file" accept="application/json,.json" class="sr-only" />
          </div>
        </section>

        <section class="panel-card">
          <div class="panel-header">
            <h2 class="panel-title">Workspace Reset</h2>
          </div>
          <div class="backup-box">
            <p>Clears all buildings, storage areas, counts, and history, restoring the clean 7-item custodial starter catalog.</p>
            <button id="btn-reset-workspace" class="btn btn-danger" data-action="open-reset-confirm">
              ${ICONS.trash} Reset Workspace
            </button>
          </div>
        </section>
      </aside>
    </div>
  `;
}
