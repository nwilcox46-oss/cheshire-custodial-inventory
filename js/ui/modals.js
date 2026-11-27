/**
 * Accessible <dialog> modal renderers and form handlers for Cheshire Custodial Inventory.
 */

import { BUILDING_ACCENTS, SUPPLY_CATEGORIES, UNIT_SUGGESTIONS } from '../constants.js';
import { getBuildingRollup, getStockEntry } from '../selectors.js';
import { ICONS } from './icons.js';
import { escapeHtml } from './views.js';

export function createModalController(dialogEl, store, { onToast, onNavigate }) {
  function closeModal() {
    if (dialogEl.open) dialogEl.close();
    dialogEl.innerHTML = '';
  }

  function showError(msg) {
    const errBox = dialogEl.querySelector('[data-modal-error]');
    if (errBox) {
      errBox.textContent = msg;
      errBox.hidden = false;
    } else {
      onToast(msg, 'error');
    }
  }

  function openDialog(html, onBind) {
    dialogEl.innerHTML = html;
    dialogEl.showModal();

    dialogEl.querySelectorAll('[data-close-modal]').forEach((btn) => {
      btn.addEventListener('click', closeModal);
    });

    if (onBind) onBind(dialogEl);
  }

  // Close when clicking the backdrop outside the modal content
  dialogEl.addEventListener('click', (e) => {
    if (e.target === dialogEl) closeModal();
  });

  /* ---------------- 1. Add / Edit Building ---------------- */

  function openBuildingModal(buildingId = null) {
    const state = store.getState();
    const existing = buildingId ? state.buildings.find((b) => b.id === buildingId) : null;
    const selectedAccent =
      existing?.accent || BUILDING_ACCENTS[state.buildings.length % BUILDING_ACCENTS.length].id;

    openDialog(
      `
      <form class="modal-form" id="form-building" novalidate>
        <div class="modal-header">
          <h2 class="modal-title">${existing ? 'Edit Building' : 'Add Building'}</h2>
          <button type="button" class="btn btn-ghost btn-icon" data-close-modal aria-label="Close">${ICONS.close}</button>
        </div>
        <div class="modal-body">
          <div class="field-error" data-modal-error hidden></div>

          <div class="field-group">
            <label class="field-label" for="bldg-name">Building Name *</label>
            <input id="bldg-name" name="name" class="input" required placeholder="e.g. North Wing, Main High School, Admin Building" value="${escapeHtml(existing?.name || '')}" />
          </div>

          <div class="field-row">
            <div class="field-group">
              <label class="field-label" for="bldg-code">Short Code (optional)</label>
              <input id="bldg-code" name="code" class="input" maxlength="12" placeholder="e.g. BLDG-A" value="${escapeHtml(existing?.code || '')}" />
            </div>
            <div class="field-group">
              <label class="field-label">Card Accent</label>
              <div class="swatch-row">
                ${BUILDING_ACCENTS.map(
                  (sw) => `
                  <label class="swatch-option" title="${escapeHtml(sw.label)}">
                    <input type="radio" name="accent" value="${escapeHtml(sw.id)}" ${sw.id === selectedAccent ? 'checked' : ''} />
                    <span class="swatch-dot" style="background: ${sw.hex};"></span>
                  </label>`
                ).join('')}
              </div>
            </div>
          </div>

          <div class="field-group">
            <label class="field-label" for="bldg-notes">Notes (optional)</label>
            <textarea id="bldg-notes" name="notes" class="textarea" rows="2" placeholder="Floor count, lead custodian, delivery dock info...">${escapeHtml(existing?.notes || '')}</textarea>
          </div>
        </div>
        <div class="modal-footer">
          ${
            existing
              ? `<button type="button" id="btn-delete-building" class="btn btn-danger btn-sm">${ICONS.trash} Delete</button>`
              : '<span></span>'
          }
          <div class="modal-footer-right">
            <button type="button" class="btn btn-ghost" data-close-modal>Cancel</button>
            <button type="submit" class="btn btn-primary">${existing ? 'Save Changes' : 'Add Building'}</button>
          </div>
        </div>
      </form>
      `,
      (root) => {
        const form = root.querySelector('#form-building');
        root.querySelector('#bldg-name')?.focus();

        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const fd = new FormData(form);
          try {
            if (existing) {
              store.updateBuilding(existing.id, {
                name: fd.get('name'),
                code: fd.get('code'),
                accent: fd.get('accent'),
                notes: fd.get('notes'),
              });
              onToast(`Updated "${fd.get('name')}".`);
              closeModal();
            } else {
              const created = store.addBuilding({
                name: fd.get('name'),
                code: fd.get('code'),
                accent: fd.get('accent'),
                notes: fd.get('notes'),
              });
              onToast(`Added building "${created.name}" — now add a storage area!`, 'gold');
              closeModal();
              onNavigate('building-detail', { buildingId: created.id, areaTab: 'rollup' });
            }
          } catch (err) {
            showError(err.message);
          }
        });

        root.querySelector('#btn-delete-building')?.addEventListener('click', () => {
          const areaCount = store
            .getState()
            .storageAreas.filter((a) => a.buildingId === existing.id).length;
          if (
            confirm(
              `Delete "${existing.name}" and its ${areaCount} storage area(s)? All stock counts in this building will be removed.`
            )
          ) {
            store.deleteBuilding(existing.id);
            onToast(`Deleted "${existing.name}".`);
            closeModal();
            onNavigate('buildings');
          }
        });
      }
    );
  }

  /* ---------------- 2. Add / Edit Storage Area ---------------- */

  function openStorageAreaModal({ buildingId = null, areaId = null }) {
    const state = store.getState();
    const existing = areaId ? state.storageAreas.find((a) => a.id === areaId) : null;
    const targetBuildingId = existing?.buildingId || buildingId || state.buildings[0]?.id;
    const building = state.buildings.find((b) => b.id === targetBuildingId);

    if (!building) {
      onToast('Add a building before creating a storage area.', 'error');
      return;
    }

    openDialog(
      `
      <form class="modal-form" id="form-area" novalidate>
        <div class="modal-header">
          <h2 class="modal-title">${existing ? 'Edit Storage Area' : `Add Storage Area — ${escapeHtml(building.name)}`}</h2>
          <button type="button" class="btn btn-ghost btn-icon" data-close-modal aria-label="Close">${ICONS.close}</button>
        </div>
        <div class="modal-body">
          <div class="field-error" data-modal-error hidden></div>

          <div class="field-group">
            <label class="field-label" for="area-name">Storage Area Name *</label>
            <input id="area-name" name="name" class="input" required placeholder="e.g. Basement Main Supply, 1st Floor Closet, Gym Room" value="${escapeHtml(existing?.name || '')}" />
          </div>

          <div class="field-group">
            <label class="field-label" for="area-zone">Floor / Zone / Room # (optional)</label>
            <input id="area-zone" name="floorOrZone" class="input" placeholder="e.g. Floor 2, East Hallway, Room 104B" value="${escapeHtml(existing?.floorOrZone || '')}" />
          </div>

          <div class="field-group">
            <label class="field-label" for="area-notes">Notes (optional)</label>
            <textarea id="area-notes" name="notes" class="textarea" rows="2" placeholder="Key code reminder, shelf layout, chemical cabinet...">${escapeHtml(existing?.notes || '')}</textarea>
          </div>
        </div>
        <div class="modal-footer">
          ${
            existing
              ? `<button type="button" id="btn-delete-area" class="btn btn-danger btn-sm">${ICONS.trash} Delete</button>`
              : '<span></span>'
          }
          <div class="modal-footer-right">
            <button type="button" class="btn btn-ghost" data-close-modal>Cancel</button>
            <button type="submit" class="btn btn-primary">${existing ? 'Save Changes' : 'Add Storage Area'}</button>
          </div>
        </div>
      </form>
      `,
      (root) => {
        const form = root.querySelector('#form-area');
        root.querySelector('#area-name')?.focus();

        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const fd = new FormData(form);
          try {
            if (existing) {
              store.updateStorageArea(existing.id, {
                name: fd.get('name'),
                floorOrZone: fd.get('floorOrZone'),
                notes: fd.get('notes'),
              });
              onToast(`Updated storage area "${fd.get('name')}".`);
              closeModal();
            } else {
              const created = store.addStorageArea({
                buildingId: building.id,
                name: fd.get('name'),
                floorOrZone: fd.get('floorOrZone'),
                notes: fd.get('notes'),
              });
              onToast(`Added "${created.name}" to ${building.name}.`);
              closeModal();
              onNavigate('building-detail', { buildingId: building.id, areaTab: created.id });
            }
          } catch (err) {
            showError(err.message);
          }
        });

        root.querySelector('#btn-delete-area')?.addEventListener('click', () => {
          if (confirm(`Delete storage area "${existing.name}"? Stock counts inside it will be removed.`)) {
            store.deleteStorageArea(existing.id);
            onToast(`Removed "${existing.name}".`);
            closeModal();
            onNavigate('building-detail', { buildingId: building.id, areaTab: 'rollup' });
          }
        });
      }
    );
  }

  /* ---------------- 3. Add / Edit Supply Item ---------------- */

  function openItemModal(itemId = null) {
    const state = store.getState();
    const existing = itemId ? state.items.find((i) => i.id === itemId) : null;

    openDialog(
      `
      <form class="modal-form" id="form-item" novalidate>
        <div class="modal-header">
          <h2 class="modal-title">${existing ? 'Edit Supply Item' : 'Add New Supply Item'}</h2>
          <button type="button" class="btn btn-ghost btn-icon" data-close-modal aria-label="Close">${ICONS.close}</button>
        </div>
        <div class="modal-body">
          <div class="field-error" data-modal-error hidden></div>

          <div class="field-group">
            <label class="field-label" for="item-name">Item Name *</label>
            <input id="item-name" name="name" class="input" required placeholder="e.g. Glass Cleaner, Trash Liners (55 gal), Hand Soap" value="${escapeHtml(existing?.name || '')}" />
          </div>

          <div class="field-row">
            <div class="field-group">
              <label class="field-label" for="item-category">Category</label>
              <select id="item-category" name="category" class="select">
                ${SUPPLY_CATEGORIES.map(
                  (cat) =>
                    `<option value="${escapeHtml(cat)}" ${(existing?.category || 'Chemicals') === cat ? 'selected' : ''}>${escapeHtml(cat)}</option>`
                ).join('')}
              </select>
            </div>
            <div class="field-group">
              <label class="field-label" for="item-unit">Unit of Measure *</label>
              <input id="item-unit" name="unit" class="input" list="unit-suggestions" required placeholder="e.g. jugs, cases, rolls, packs" value="${escapeHtml(existing?.unit || '')}" />
              <datalist id="unit-suggestions">
                ${UNIT_SUGGESTIONS.map((u) => `<option value="${escapeHtml(u)}"></option>`).join('')}
              </datalist>
            </div>
          </div>

          <div class="field-row">
            <div class="field-group">
              <label class="field-label" for="item-low">Default Low-Stock Alert</label>
              <input id="item-low" name="defaultLowThreshold" type="number" min="0" step="any" class="input" value="${existing?.defaultLowThreshold ?? 2}" />
              <span class="field-hint">Flags "Fading Fast" at or below this count</span>
            </div>
            <div class="field-group">
              <label class="field-label" for="item-par">Default Building Par Target</label>
              <input id="item-par" name="defaultParLevel" type="number" min="0" step="any" class="input" value="${existing?.defaultParLevel ?? 6}" />
              <span class="field-hint">Ideal stock level for restock calculation</span>
            </div>
          </div>

          <div class="field-group">
            <label class="field-label" for="item-notes">Notes / Brand / SKU (optional)</label>
            <textarea id="item-notes" name="notes" class="textarea" rows="2" placeholder="Dilution ratio, preferred vendor, reorder code...">${escapeHtml(existing?.notes || '')}</textarea>
          </div>
        </div>
        <div class="modal-footer">
          ${
            existing
              ? `<button type="button" id="btn-delete-item" class="btn btn-danger btn-sm">${ICONS.trash} Delete</button>`
              : '<span></span>'
          }
          <div class="modal-footer-right">
            <button type="button" class="btn btn-ghost" data-close-modal>Cancel</button>
            <button type="submit" class="btn btn-primary">${existing ? 'Save Changes' : 'Add to Catalog'}</button>
          </div>
        </div>
      </form>
      `,
      (root) => {
        const form = root.querySelector('#form-item');
        root.querySelector('#item-name')?.focus();

        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const fd = new FormData(form);
          try {
            const payload = {
              name: fd.get('name'),
              category: fd.get('category'),
              unit: fd.get('unit') || 'each',
              defaultLowThreshold: fd.get('defaultLowThreshold'),
              defaultParLevel: fd.get('defaultParLevel'),
              notes: fd.get('notes'),
            };
            if (existing) {
              store.updateItem(existing.id, payload);
              onToast(`Updated "${payload.name}".`);
            } else {
              store.addItem(payload);
              onToast(`Added "${payload.name}" to the supply catalog!`, 'gold');
            }
            closeModal();
          } catch (err) {
            showError(err.message);
          }
        });

        root.querySelector('#btn-delete-item')?.addEventListener('click', () => {
          if (
            confirm(
              `Remove "${existing.name}" from the catalog? Existing stock counts for this item across all storage areas will also be cleared.`
            )
          ) {
            store.deleteItem(existing.id);
            onToast(`Removed "${existing.name}".`);
            closeModal();
          }
        });
      }
    );
  }

  /* ---------------- 4. Transfer Stock Between Storage Areas ---------------- */

  function openTransferModal({ fromAreaId = null, itemId = null, buildingId = null } = {}) {
    const state = store.getState();
    if (state.storageAreas.length < 2) {
      onToast('You need at least 2 storage areas to transfer supplies.', 'error');
      return;
    }

    const buildingMap = new Map(state.buildings.map((b) => [b.id, b.name]));
    const areaOptions = state.storageAreas.map((area) => ({
      id: area.id,
      buildingId: area.buildingId,
      label: `${buildingMap.get(area.buildingId) || 'Building'} — ${area.name}`,
    }));

    const initialFrom =
      fromAreaId ||
      (buildingId ? areaOptions.find((a) => a.buildingId === buildingId)?.id : null) ||
      areaOptions[0].id;
    const initialTo =
      areaOptions.find((a) => a.id !== initialFrom)?.id || areaOptions[0].id;
    const initialItem = itemId || state.items[0]?.id;

    openDialog(
      `
      <form class="modal-form" id="form-transfer" novalidate>
        <div class="modal-header">
          <h2 class="modal-title">${ICONS.transfer} Transfer Supplies</h2>
          <button type="button" class="btn btn-ghost btn-icon" data-close-modal aria-label="Close">${ICONS.close}</button>
        </div>
        <div class="modal-body">
          <div class="field-error" data-modal-error hidden></div>

          <div class="field-group">
            <label class="field-label" for="xfer-from">From Storage Area *</label>
            <select id="xfer-from" name="fromAreaId" class="select">
              ${areaOptions
                .map(
                  (a) =>
                    `<option value="${escapeHtml(a.id)}" ${a.id === initialFrom ? 'selected' : ''}>${escapeHtml(a.label)}</option>`
                )
                .join('')}
            </select>
          </div>

          <div class="field-group">
            <label class="field-label" for="xfer-to">To Storage Area *</label>
            <select id="xfer-to" name="toAreaId" class="select">
              ${areaOptions
                .map(
                  (a) =>
                    `<option value="${escapeHtml(a.id)}" ${a.id === initialTo ? 'selected' : ''}>${escapeHtml(a.label)}</option>`
                )
                .join('')}
            </select>
          </div>

          <div class="field-row">
            <div class="field-group">
              <label class="field-label" for="xfer-item">Supply Item *</label>
              <select id="xfer-item" name="itemId" class="select">
                ${state.items
                  .map(
                    (it) =>
                      `<option value="${escapeHtml(it.id)}" ${it.id === initialItem ? 'selected' : ''}>${escapeHtml(it.name)} (${escapeHtml(it.unit)})</option>`
                  )
                  .join('')}
              </select>
            </div>
            <div class="field-group">
              <label class="field-label" for="xfer-qty">Quantity *</label>
              <input id="xfer-qty" name="quantity" type="number" min="0.01" step="any" class="input" value="1" required />
              <span class="field-hint" id="xfer-avail-hint"></span>
            </div>
          </div>

          <div class="field-group">
            <label class="field-label" for="xfer-note">Note (optional)</label>
            <input id="xfer-note" name="note" class="input" placeholder="e.g. Restocking 2nd floor before evening shift" />
          </div>
        </div>
        <div class="modal-footer">
          <span></span>
          <div class="modal-footer-right">
            <button type="button" class="btn btn-ghost" data-close-modal>Cancel</button>
            <button type="submit" class="btn btn-primary">Complete Transfer</button>
          </div>
        </div>
      </form>
      `,
      (root) => {
        const form = root.querySelector('#form-transfer');
        const fromSel = root.querySelector('#xfer-from');
        const itemSel = root.querySelector('#xfer-item');
        const availHint = root.querySelector('#xfer-avail-hint');

        const refreshAvail = () => {
          const curState = store.getState();
          const entry = getStockEntry(curState, fromSel.value, itemSel.value);
          const item = curState.items.find((i) => i.id === itemSel.value);
          availHint.textContent = `Available in source: ${entry.quantity} ${item?.unit || 'units'}`;
          availHint.style.color = entry.quantity > 0 ? 'var(--status-healthy)' : 'var(--status-vanished)';
        };

        fromSel.addEventListener('change', refreshAvail);
        itemSel.addEventListener('change', refreshAvail);
        refreshAvail();

        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const fd = new FormData(form);
          try {
            store.transferStock({
              fromAreaId: fd.get('fromAreaId'),
              toAreaId: fd.get('toAreaId'),
              itemId: fd.get('itemId'),
              quantity: fd.get('quantity'),
              note: fd.get('note'),
            });
            onToast('Stock transfer recorded — building rollups updated!', 'gold');
            closeModal();
          } catch (err) {
            showError(err.message);
          }
        });
      }
    );
  }

  /* ---------------- 5. Building Target Override Modal ---------------- */

  function openBuildingTargetsModal(buildingId, itemId) {
    const state = store.getState();
    const rollup = getBuildingRollup(state, buildingId);
    const row = rollup?.items.find((r) => r.item.id === itemId);
    if (!rollup || !row) return;

    const existingOverride = state.buildingTargets?.[buildingId]?.[itemId] || {};

    openDialog(
      `
      <form class="modal-form" id="form-bldg-targets" novalidate>
        <div class="modal-header">
          <h2 class="modal-title">Building Targets — ${escapeHtml(row.item.name)}</h2>
          <button type="button" class="btn btn-ghost btn-icon" data-close-modal aria-label="Close">${ICONS.close}</button>
        </div>
        <div class="modal-body">
          <p class="field-hint" style="margin: 0;">
            Customize low-stock and par targets specifically for <strong>${escapeHtml(rollup.building.name)}</strong>. Leave blank to inherit the catalog default (Low ${row.item.defaultLowThreshold} / Par ${row.item.defaultParLevel}).
          </p>
          <div class="field-row">
            <div class="field-group">
              <label class="field-label" for="bt-low">Building Low Alert (${escapeHtml(row.item.unit)})</label>
              <input id="bt-low" name="lowThresholdOverride" type="number" min="0" step="any" class="input" placeholder="Default: ${row.item.defaultLowThreshold}" value="${existingOverride.lowThresholdOverride ?? ''}" />
            </div>
            <div class="field-group">
              <label class="field-label" for="bt-par">Building Par Target (${escapeHtml(row.item.unit)})</label>
              <input id="bt-par" name="parLevelOverride" type="number" min="0" step="any" class="input" placeholder="Default: ${row.item.defaultParLevel}" value="${existingOverride.parLevelOverride ?? ''}" />
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" id="btn-clear-bldg-targets" class="btn btn-ghost btn-sm">Use Defaults</button>
          <div class="modal-footer-right">
            <button type="button" class="btn btn-ghost" data-close-modal>Cancel</button>
            <button type="submit" class="btn btn-primary">Save Targets</button>
          </div>
        </div>
      </form>
      `,
      (root) => {
        const form = root.querySelector('#form-bldg-targets');
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const fd = new FormData(form);
          store.setBuildingTargets({
            buildingId,
            itemId,
            lowThresholdOverride: fd.get('lowThresholdOverride'),
            parLevelOverride: fd.get('parLevelOverride'),
          });
          onToast(`Updated targets for ${row.item.name} in ${rollup.building.name}.`);
          closeModal();
        });
        root.querySelector('#btn-clear-bldg-targets')?.addEventListener('click', () => {
          store.setBuildingTargets({
            buildingId,
            itemId,
            lowThresholdOverride: null,
            parLevelOverride: null,
          });
          onToast('Reverted to default targets.');
          closeModal();
        });
      }
    );
  }

  /* ---------------- 6. Storage Area Stock Note & Target Override Modal ---------------- */

  function openAreaTargetsModal(storageAreaId, itemId) {
    const state = store.getState();
    const area = state.storageAreas.find((a) => a.id === storageAreaId);
    const item = state.items.find((i) => i.id === itemId);
    if (!area || !item) return;

    const entry = getStockEntry(state, storageAreaId, itemId);

    openDialog(
      `
      <form class="modal-form" id="form-area-targets" novalidate>
        <div class="modal-header">
          <h2 class="modal-title">${escapeHtml(item.name)} — ${escapeHtml(area.name)}</h2>
          <button type="button" class="btn btn-ghost btn-icon" data-close-modal aria-label="Close">${ICONS.close}</button>
        </div>
        <div class="modal-body">
          <div class="field-group">
            <label class="field-label" for="at-qty">Exact Quantity (${escapeHtml(item.unit)})</label>
            <input id="at-qty" name="quantity" type="number" min="0" step="any" class="input" value="${entry.quantity}" required />
          </div>
          <div class="field-group">
            <label class="field-label" for="at-note">Adjustment Note (optional)</label>
            <input id="at-note" name="note" class="input" placeholder="e.g. Monthly delivery received, damaged bottle removed" />
          </div>
          <hr style="border: 0; border-top: 1px solid var(--border-subtle); width: 100%;" />
          <p class="field-hint" style="margin: 0;">Optional closet-specific targets (leave blank if you only track targets at the building level):</p>
          <div class="field-row">
            <div class="field-group">
              <label class="field-label" for="at-low">Closet Low Alert</label>
              <input id="at-low" name="lowThresholdOverride" type="number" min="0" step="any" class="input" placeholder="Optional" value="${entry.lowThresholdOverride ?? ''}" />
            </div>
            <div class="field-group">
              <label class="field-label" for="at-par">Closet Par Target</label>
              <input id="at-par" name="parLevelOverride" type="number" min="0" step="any" class="input" placeholder="Optional" value="${entry.parLevelOverride ?? ''}" />
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <span></span>
          <div class="modal-footer-right">
            <button type="button" class="btn btn-ghost" data-close-modal>Cancel</button>
            <button type="submit" class="btn btn-primary">Save Entry</button>
          </div>
        </div>
      </form>
      `,
      (root) => {
        const form = root.querySelector('#form-area-targets');
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const fd = new FormData(form);
          store.setStock({
            storageAreaId,
            itemId,
            quantity: fd.get('quantity'),
            note: fd.get('note'),
          });
          store.setAreaTargets({
            storageAreaId,
            itemId,
            lowThresholdOverride: fd.get('lowThresholdOverride'),
            parLevelOverride: fd.get('parLevelOverride'),
          });
          onToast(`Saved ${item.name} in ${area.name}.`);
          closeModal();
        });
      }
    );
  }

  /* ---------------- 7. Quick Restock from Restock List ---------------- */

  function openQuickRestockModal({ buildingId, itemId, suggestedQty }) {
    const state = store.getState();
    const building = state.buildings.find((b) => b.id === buildingId);
    const item = state.items.find((i) => i.id === itemId);
    const areas = state.storageAreas.filter((a) => a.buildingId === buildingId);
    if (!building || !item || areas.length === 0) return;

    openDialog(
      `
      <form class="modal-form" id="form-quick-restock" novalidate>
        <div class="modal-header">
          <h2 class="modal-title">Restock ${escapeHtml(item.name)}</h2>
          <button type="button" class="btn btn-ghost btn-icon" data-close-modal aria-label="Close">${ICONS.close}</button>
        </div>
        <div class="modal-body">
          <p class="field-hint" style="margin: 0;">Choose which storage area in <strong>${escapeHtml(building.name)}</strong> received this delivery:</p>
          <div class="field-group">
            <label class="field-label" for="qr-area">Destination Storage Area *</label>
            <select id="qr-area" name="storageAreaId" class="select">
              ${areas.map((a) => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)}</option>`).join('')}
            </select>
          </div>
          <div class="field-row">
            <div class="field-group">
              <label class="field-label" for="qr-qty">Quantity Added (${escapeHtml(item.unit)}) *</label>
              <input id="qr-qty" name="delta" type="number" min="0.01" step="any" class="input" value="${escapeHtml(suggestedQty)}" required />
            </div>
            <div class="field-group">
              <label class="field-label" for="qr-note">Note (optional)</label>
              <input id="qr-note" name="note" class="input" value="Restocked from supply order" />
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <span></span>
          <div class="modal-footer-right">
            <button type="button" class="btn btn-ghost" data-close-modal>Cancel</button>
            <button type="submit" class="btn btn-primary">Add Stock</button>
          </div>
        </div>
      </form>
      `,
      (root) => {
        const form = root.querySelector('#form-quick-restock');
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const fd = new FormData(form);
          const delta = Number(fd.get('delta'));
          if (!Number.isFinite(delta) || delta <= 0) {
            showError('Enter a quantity greater than zero.');
            return;
          }
          store.adjustStock({
            storageAreaId: fd.get('storageAreaId'),
            itemId,
            delta,
            note: fd.get('note'),
          });
          onToast(`Restocked +${delta} ${item.unit} of ${item.name}!`, 'gold');
          closeModal();
        });
      }
    );
  }

  /* ---------------- 8. Workspace Reset Confirmation ---------------- */

  function openResetConfirmModal() {
    openDialog(
      `
      <div class="modal-form">
        <div class="modal-header">
          <h2 class="modal-title">Reset Workspace?</h2>
          <button type="button" class="btn btn-ghost btn-icon" data-close-modal aria-label="Close">${ICONS.close}</button>
        </div>
        <div class="modal-body">
          <p style="margin: 0; color: var(--ink-secondary);">
            This will remove all buildings, storage areas, stock counts, and activity history, restoring the original 7 starter custodial items. Download a JSON backup first if you want to keep a copy.
          </p>
        </div>
        <div class="modal-footer">
          <span></span>
          <div class="modal-footer-right">
            <button type="button" class="btn btn-ghost" data-close-modal>Cancel</button>
            <button type="button" id="btn-confirm-reset" class="btn btn-danger">Reset Everything</button>
          </div>
        </div>
      </div>
      `,
      (root) => {
        root.querySelector('#btn-confirm-reset')?.addEventListener('click', () => {
          store.resetWorkspace();
          onToast('Workspace reset to the 7 starter custodial items.');
          closeModal();
          onNavigate('buildings');
        });
      }
    );
  }

  return {
    openBuildingModal,
    openStorageAreaModal,
    openItemModal,
    openTransferModal,
    openBuildingTargetsModal,
    openAreaTargetsModal,
    openQuickRestockModal,
    openResetConfirmModal,
    closeModal,
  };
}
