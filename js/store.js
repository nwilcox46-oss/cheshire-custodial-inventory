/**
 * Reactive localStorage-backed state store for Cheshire Custodial Inventory.
 * Supports dependency-injected storage for headless unit testing.
 */

import {
  BUILDING_ACCENTS,
  MAX_LOG_ENTRIES,
  SCHEMA_VERSION,
  STARTER_ITEMS,
  STORAGE_KEY,
  SUPPLY_CATEGORIES,
} from './constants.js';

function createId(prefix) {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

function nowISO() {
  return new Date().toISOString();
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function toNonNegativeNumber(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return fallback;
  return Math.round(num * 100) / 100;
}

function toOptionalNonNegativeNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num * 100) / 100;
}

/**
 * Create a clean default state with the 7 starter custodial items and 0 buildings.
 */
export function createInitialState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    items: clone(STARTER_ITEMS),
    buildings: [],
    storageAreas: [],
    stock: {},
    buildingTargets: {},
    activityLog: [],
  };
}

/**
 * Create a memory-backed Storage fallback for Node tests or private browsing environments.
 */
export function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, val) => map.set(key, String(val)),
    removeItem: (key) => map.delete(key),
  };
}

function getDefaultStorage() {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
      const testKey = '__cheshire_test__';
      globalThis.localStorage.setItem(testKey, '1');
      globalThis.localStorage.removeItem(testKey);
      return globalThis.localStorage;
    }
  } catch {
    // Fall back to memory storage if localStorage is unavailable
  }
  return createMemoryStorage();
}

/**
 * Validate and normalize an imported or loaded state payload.
 */
export function validateAndNormalizeState(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Backup data must be a valid JSON object.');
  }
  if (!Array.isArray(raw.items)) {
    throw new Error('Backup is missing a valid "items" array.');
  }
  if (!Array.isArray(raw.buildings)) {
    throw new Error('Backup is missing a valid "buildings" array.');
  }
  if (!Array.isArray(raw.storageAreas)) {
    throw new Error('Backup is missing a valid "storageAreas" array.');
  }

  const normalizedItems = raw.items
    .filter((it) => it && typeof it.name === 'string' && it.name.trim().length > 0)
    .map((it) => ({
      id: typeof it.id === 'string' && it.id ? it.id : createId('item'),
      name: it.name.trim(),
      category:
        typeof it.category === 'string' && it.category.trim()
          ? it.category.trim()
          : 'Other',
      unit: typeof it.unit === 'string' && it.unit.trim() ? it.unit.trim() : 'each',
      defaultLowThreshold: toNonNegativeNumber(it.defaultLowThreshold, 0),
      defaultParLevel: toNonNegativeNumber(it.defaultParLevel, 0),
      notes: typeof it.notes === 'string' ? it.notes.trim() : '',
    }));

  const normalizedBuildings = raw.buildings
    .filter((b) => b && typeof b.name === 'string' && b.name.trim().length > 0)
    .map((b, idx) => ({
      id: typeof b.id === 'string' && b.id ? b.id : createId('bldg'),
      name: b.name.trim(),
      code: typeof b.code === 'string' ? b.code.trim() : '',
      accent:
        typeof b.accent === 'string' && b.accent
          ? b.accent
          : BUILDING_ACCENTS[idx % BUILDING_ACCENTS.length].id,
      notes: typeof b.notes === 'string' ? b.notes.trim() : '',
      createdAt: typeof b.createdAt === 'string' ? b.createdAt : nowISO(),
    }));

  const validBuildingIds = new Set(normalizedBuildings.map((b) => b.id));
  const normalizedAreas = raw.storageAreas
    .filter(
      (a) =>
        a &&
        typeof a.name === 'string' &&
        a.name.trim().length > 0 &&
        validBuildingIds.has(a.buildingId)
    )
    .map((a) => ({
      id: typeof a.id === 'string' && a.id ? a.id : createId('area'),
      buildingId: a.buildingId,
      name: a.name.trim(),
      floorOrZone: typeof a.floorOrZone === 'string' ? a.floorOrZone.trim() : '',
      notes: typeof a.notes === 'string' ? a.notes.trim() : '',
      createdAt: typeof a.createdAt === 'string' ? a.createdAt : nowISO(),
    }));

  const validAreaIds = new Set(normalizedAreas.map((a) => a.id));
  const validItemIds = new Set(normalizedItems.map((i) => i.id));

  const normalizedStock = {};
  if (raw.stock && typeof raw.stock === 'object') {
    for (const [areaId, itemMap] of Object.entries(raw.stock)) {
      if (!validAreaIds.has(areaId) || !itemMap || typeof itemMap !== 'object') continue;
      normalizedStock[areaId] = {};
      for (const [itemId, entry] of Object.entries(itemMap)) {
        if (!validItemIds.has(itemId) || !entry || typeof entry !== 'object') continue;
        normalizedStock[areaId][itemId] = {
          quantity: toNonNegativeNumber(entry.quantity, 0),
          lowThresholdOverride: toOptionalNonNegativeNumber(entry.lowThresholdOverride),
          parLevelOverride: toOptionalNonNegativeNumber(entry.parLevelOverride),
          updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : nowISO(),
        };
      }
    }
  }

  const normalizedBuildingTargets = {};
  if (raw.buildingTargets && typeof raw.buildingTargets === 'object') {
    for (const [buildingId, itemMap] of Object.entries(raw.buildingTargets)) {
      if (!validBuildingIds.has(buildingId) || !itemMap || typeof itemMap !== 'object') continue;
      normalizedBuildingTargets[buildingId] = {};
      for (const [itemId, entry] of Object.entries(itemMap)) {
        if (!validItemIds.has(itemId) || !entry || typeof entry !== 'object') continue;
        normalizedBuildingTargets[buildingId][itemId] = {
          lowThresholdOverride: toOptionalNonNegativeNumber(entry.lowThresholdOverride),
          parLevelOverride: toOptionalNonNegativeNumber(entry.parLevelOverride),
        };
      }
    }
  }

  const normalizedLog = Array.isArray(raw.activityLog)
    ? raw.activityLog
        .filter((e) => e && typeof e.type === 'string' && typeof e.summary === 'string')
        .slice(0, MAX_LOG_ENTRIES)
    : [];

  return {
    schemaVersion: SCHEMA_VERSION,
    items: normalizedItems,
    buildings: normalizedBuildings,
    storageAreas: normalizedAreas,
    stock: normalizedStock,
    buildingTargets: normalizedBuildingTargets,
    activityLog: normalizedLog,
  };
}

/**
 * Factory to create a store instance backed by the provided storage adapter.
 */
export function createStore(storageAdapter = getDefaultStorage(), storageKey = STORAGE_KEY) {
  let state = loadState();
  const listeners = new Set();

  function loadState() {
    try {
      const rawStr = storageAdapter.getItem(storageKey);
      if (!rawStr) {
        const fresh = createInitialState();
        storageAdapter.setItem(storageKey, JSON.stringify(fresh));
        return fresh;
      }
      const parsed = JSON.parse(rawStr);
      return validateAndNormalizeState(parsed);
    } catch {
      const fresh = createInitialState();
      try {
        storageAdapter.setItem(storageKey, JSON.stringify(fresh));
      } catch {
        // Ignore storage quota errors
      }
      return fresh;
    }
  }

  function persistAndNotify() {
    try {
      storageAdapter.setItem(storageKey, JSON.stringify(state));
    } catch (err) {
      console.error('Failed to persist state:', err);
    }
    for (const listener of listeners) {
      listener(state);
    }
  }

  function pushLog(entry) {
    const record = {
      id: createId('log'),
      timestamp: nowISO(),
      ...entry,
    };
    state.activityLog = [record, ...state.activityLog].slice(0, MAX_LOG_ENTRIES);
  }

  function ensureStockCell(areaId, itemId) {
    if (!state.stock[areaId]) state.stock[areaId] = {};
    if (!state.stock[areaId][itemId]) {
      state.stock[areaId][itemId] = {
        quantity: 0,
        lowThresholdOverride: null,
        parLevelOverride: null,
        updatedAt: nowISO(),
      };
    }
    return state.stock[areaId][itemId];
  }

  return {
    getState() {
      return state;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /* ---------------- Buildings ---------------- */

    addBuilding({ name, code = '', accent = '', notes = '' }) {
      const trimmedName = String(name || '').trim();
      if (!trimmedName) throw new Error('Building name is required.');

      const building = {
        id: createId('bldg'),
        name: trimmedName,
        code: String(code || '').trim(),
        accent:
          accent || BUILDING_ACCENTS[state.buildings.length % BUILDING_ACCENTS.length].id,
        notes: String(notes || '').trim(),
        createdAt: nowISO(),
      };

      state.buildings = [...state.buildings, building];
      pushLog({
        type: 'location',
        action: 'add_building',
        buildingId: building.id,
        buildingName: building.name,
        summary: `Added building "${building.name}"`,
        note: building.notes,
      });
      persistAndNotify();
      return building;
    },

    updateBuilding(buildingId, { name, code, accent, notes }) {
      const idx = state.buildings.findIndex((b) => b.id === buildingId);
      if (idx === -1) throw new Error('Building not found.');
      const trimmedName = String(name ?? state.buildings[idx].name).trim();
      if (!trimmedName) throw new Error('Building name is required.');

      const prev = state.buildings[idx];
      const updated = {
        ...prev,
        name: trimmedName,
        code: code !== undefined ? String(code).trim() : prev.code,
        accent: accent || prev.accent,
        notes: notes !== undefined ? String(notes).trim() : prev.notes,
      };
      state.buildings = state.buildings.map((b) => (b.id === buildingId ? updated : b));
      pushLog({
        type: 'location',
        action: 'update_building',
        buildingId: updated.id,
        buildingName: updated.name,
        summary: `Updated building "${updated.name}"`,
      });
      persistAndNotify();
      return updated;
    },

    deleteBuilding(buildingId) {
      const building = state.buildings.find((b) => b.id === buildingId);
      if (!building) throw new Error('Building not found.');

      const removedAreas = state.storageAreas.filter((a) => a.buildingId === buildingId);
      const removedAreaIds = new Set(removedAreas.map((a) => a.id));

      state.buildings = state.buildings.filter((b) => b.id !== buildingId);
      state.storageAreas = state.storageAreas.filter((a) => a.buildingId !== buildingId);

      for (const areaId of removedAreaIds) {
        delete state.stock[areaId];
      }
      delete state.buildingTargets[buildingId];

      pushLog({
        type: 'location',
        action: 'delete_building',
        buildingId: building.id,
        buildingName: building.name,
        summary: `Removed building "${building.name}" and ${removedAreas.length} storage area(s)`,
      });
      persistAndNotify();
    },

    /* ---------------- Storage Areas ---------------- */

    addStorageArea({ buildingId, name, floorOrZone = '', notes = '' }) {
      const building = state.buildings.find((b) => b.id === buildingId);
      if (!building) throw new Error('Select a valid building first.');
      const trimmedName = String(name || '').trim();
      if (!trimmedName) throw new Error('Storage area name is required.');

      const area = {
        id: createId('area'),
        buildingId,
        name: trimmedName,
        floorOrZone: String(floorOrZone || '').trim(),
        notes: String(notes || '').trim(),
        createdAt: nowISO(),
      };

      state.storageAreas = [...state.storageAreas, area];
      state.stock[area.id] = {};
      pushLog({
        type: 'location',
        action: 'add_area',
        buildingId: building.id,
        buildingName: building.name,
        areaId: area.id,
        areaName: area.name,
        summary: `Added storage area "${area.name}" in ${building.name}`,
        note: area.notes,
      });
      persistAndNotify();
      return area;
    },

    updateStorageArea(areaId, { name, floorOrZone, notes }) {
      const area = state.storageAreas.find((a) => a.id === areaId);
      if (!area) throw new Error('Storage area not found.');
      const trimmedName = String(name ?? area.name).trim();
      if (!trimmedName) throw new Error('Storage area name is required.');

      const building = state.buildings.find((b) => b.id === area.buildingId);
      const updated = {
        ...area,
        name: trimmedName,
        floorOrZone: floorOrZone !== undefined ? String(floorOrZone).trim() : area.floorOrZone,
        notes: notes !== undefined ? String(notes).trim() : area.notes,
      };

      state.storageAreas = state.storageAreas.map((a) => (a.id === areaId ? updated : a));
      pushLog({
        type: 'location',
        action: 'update_area',
        buildingId: area.buildingId,
        buildingName: building?.name || '',
        areaId: updated.id,
        areaName: updated.name,
        summary: `Updated storage area "${updated.name}"`,
      });
      persistAndNotify();
      return updated;
    },

    deleteStorageArea(areaId) {
      const area = state.storageAreas.find((a) => a.id === areaId);
      if (!area) throw new Error('Storage area not found.');
      const building = state.buildings.find((b) => b.id === area.buildingId);

      state.storageAreas = state.storageAreas.filter((a) => a.id !== areaId);
      delete state.stock[areaId];

      pushLog({
        type: 'location',
        action: 'delete_area',
        buildingId: area.buildingId,
        buildingName: building?.name || '',
        areaId: area.id,
        areaName: area.name,
        summary: `Removed storage area "${area.name}" from ${building?.name || 'building'}`,
      });
      persistAndNotify();
    },

    /* ---------------- Supply Catalog Items ---------------- */

    addItem({
      name,
      category = SUPPLY_CATEGORIES[0],
      unit = 'each',
      defaultLowThreshold = 2,
      defaultParLevel = 6,
      notes = '',
    }) {
      const trimmedName = String(name || '').trim();
      if (!trimmedName) throw new Error('Item name is required.');
      const duplicate = state.items.some(
        (it) => it.name.toLowerCase() === trimmedName.toLowerCase()
      );
      if (duplicate) throw new Error(`"${trimmedName}" is already in the catalog.`);

      const item = {
        id: createId('item'),
        name: trimmedName,
        category: String(category || 'Other').trim(),
        unit: String(unit || 'each').trim(),
        defaultLowThreshold: toNonNegativeNumber(defaultLowThreshold, 0),
        defaultParLevel: toNonNegativeNumber(defaultParLevel, 0),
        notes: String(notes || '').trim(),
      };

      state.items = [...state.items, item];
      pushLog({
        type: 'catalog',
        action: 'add_item',
        itemId: item.id,
        itemName: item.name,
        summary: `Added "${item.name}" (${item.unit}) to supply catalog`,
        note: item.notes,
      });
      persistAndNotify();
      return item;
    },

    updateItem(itemId, { name, category, unit, defaultLowThreshold, defaultParLevel, notes }) {
      const prev = state.items.find((it) => it.id === itemId);
      if (!prev) throw new Error('Supply item not found.');
      const trimmedName = String(name ?? prev.name).trim();
      if (!trimmedName) throw new Error('Item name is required.');

      const duplicate = state.items.some(
        (it) => it.id !== itemId && it.name.toLowerCase() === trimmedName.toLowerCase()
      );
      if (duplicate) throw new Error(`Another item named "${trimmedName}" already exists.`);

      const updated = {
        ...prev,
        name: trimmedName,
        category: category !== undefined ? String(category).trim() || 'Other' : prev.category,
        unit: unit !== undefined ? String(unit).trim() || 'each' : prev.unit,
        defaultLowThreshold:
          defaultLowThreshold !== undefined
            ? toNonNegativeNumber(defaultLowThreshold, prev.defaultLowThreshold)
            : prev.defaultLowThreshold,
        defaultParLevel:
          defaultParLevel !== undefined
            ? toNonNegativeNumber(defaultParLevel, prev.defaultParLevel)
            : prev.defaultParLevel,
        notes: notes !== undefined ? String(notes).trim() : prev.notes,
      };

      state.items = state.items.map((it) => (it.id === itemId ? updated : it));
      pushLog({
        type: 'catalog',
        action: 'update_item',
        itemId: updated.id,
        itemName: updated.name,
        summary: `Updated catalog item "${updated.name}"`,
      });
      persistAndNotify();
      return updated;
    },

    deleteItem(itemId) {
      const item = state.items.find((it) => it.id === itemId);
      if (!item) throw new Error('Supply item not found.');

      state.items = state.items.filter((it) => it.id !== itemId);
      for (const areaId of Object.keys(state.stock)) {
        delete state.stock[areaId][itemId];
      }
      for (const buildingId of Object.keys(state.buildingTargets)) {
        delete state.buildingTargets[buildingId][itemId];
      }

      pushLog({
        type: 'catalog',
        action: 'delete_item',
        itemId: item.id,
        itemName: item.name,
        summary: `Removed "${item.name}" from supply catalog`,
      });
      persistAndNotify();
    },

    /* ---------------- Stock Adjustments & Targets ---------------- */

    setStock({ storageAreaId, itemId, quantity, note = '' }) {
      const area = state.storageAreas.find((a) => a.id === storageAreaId);
      const item = state.items.find((i) => i.id === itemId);
      if (!area) throw new Error('Storage area not found.');
      if (!item) throw new Error('Supply item not found.');

      const building = state.buildings.find((b) => b.id === area.buildingId);
      const cell = ensureStockCell(storageAreaId, itemId);
      const before = cell.quantity;
      const after = toNonNegativeNumber(quantity, 0);
      const delta = Math.round((after - before) * 100) / 100;

      if (delta === 0 && !note) return cell;

      cell.quantity = after;
      cell.updatedAt = nowISO();

      const sign = delta > 0 ? `+${delta}` : `${delta}`;
      pushLog({
        type: 'stock',
        action: 'set_stock',
        buildingId: area.buildingId,
        buildingName: building?.name || '',
        areaId: area.id,
        areaName: area.name,
        itemId: item.id,
        itemName: item.name,
        unit: item.unit,
        before,
        after,
        delta,
        summary: `${item.name} in ${building?.name || 'Building'} → ${area.name}: ${before} → ${after} ${item.unit} (${sign})`,
        note: String(note || '').trim(),
      });
      persistAndNotify();
      return cell;
    },

    adjustStock({ storageAreaId, itemId, delta, note = '' }) {
      const cell = state.stock?.[storageAreaId]?.[itemId];
      const current = cell ? cell.quantity : 0;
      const next = Math.max(0, Math.round((current + Number(delta)) * 100) / 100);
      return this.setStock({ storageAreaId, itemId, quantity: next, note });
    },

    setAreaTargets({ storageAreaId, itemId, lowThresholdOverride, parLevelOverride }) {
      const area = state.storageAreas.find((a) => a.id === storageAreaId);
      const item = state.items.find((i) => i.id === itemId);
      if (!area || !item) throw new Error('Invalid storage area or item.');

      const cell = ensureStockCell(storageAreaId, itemId);
      cell.lowThresholdOverride = toOptionalNonNegativeNumber(lowThresholdOverride);
      cell.parLevelOverride = toOptionalNonNegativeNumber(parLevelOverride);
      cell.updatedAt = nowISO();

      const building = state.buildings.find((b) => b.id === area.buildingId);
      pushLog({
        type: 'stock',
        action: 'set_area_targets',
        buildingId: area.buildingId,
        buildingName: building?.name || '',
        areaId: area.id,
        areaName: area.name,
        itemId: item.id,
        itemName: item.name,
        summary: `Updated area targets for ${item.name} in ${area.name}`,
      });
      persistAndNotify();
      return cell;
    },

    setBuildingTargets({ buildingId, itemId, lowThresholdOverride, parLevelOverride }) {
      const building = state.buildings.find((b) => b.id === buildingId);
      const item = state.items.find((i) => i.id === itemId);
      if (!building || !item) throw new Error('Invalid building or item.');

      if (!state.buildingTargets[buildingId]) state.buildingTargets[buildingId] = {};
      const low = toOptionalNonNegativeNumber(lowThresholdOverride);
      const par = toOptionalNonNegativeNumber(parLevelOverride);

      if (low === null && par === null) {
        delete state.buildingTargets[buildingId][itemId];
      } else {
        state.buildingTargets[buildingId][itemId] = {
          lowThresholdOverride: low,
          parLevelOverride: par,
        };
      }

      pushLog({
        type: 'stock',
        action: 'set_building_targets',
        buildingId: building.id,
        buildingName: building.name,
        itemId: item.id,
        itemName: item.name,
        summary: `Updated building targets for ${item.name} in ${building.name}`,
      });
      persistAndNotify();
    },

    /* ---------------- Atomic Stock Transfer ---------------- */

    transferStock({ fromAreaId, toAreaId, itemId, quantity, note = '' }) {
      if (fromAreaId === toAreaId) {
        throw new Error('Source and destination storage areas must be different.');
      }
      const fromArea = state.storageAreas.find((a) => a.id === fromAreaId);
      const toArea = state.storageAreas.find((a) => a.id === toAreaId);
      const item = state.items.find((i) => i.id === itemId);

      if (!fromArea) throw new Error('Source storage area not found.');
      if (!toArea) throw new Error('Destination storage area not found.');
      if (!item) throw new Error('Supply item not found.');

      const qty = toNonNegativeNumber(quantity, 0);
      if (qty <= 0) throw new Error('Transfer quantity must be greater than zero.');

      const fromCell = ensureStockCell(fromAreaId, itemId);
      if (qty > fromCell.quantity) {
        throw new Error(
          `Not enough ${item.name} in "${fromArea.name}" (only ${fromCell.quantity} ${item.unit} available).`
        );
      }

      const toCell = ensureStockCell(toAreaId, itemId);
      const fromBefore = fromCell.quantity;
      const toBefore = toCell.quantity;
      const ts = nowISO();

      fromCell.quantity = Math.round((fromBefore - qty) * 100) / 100;
      fromCell.updatedAt = ts;
      toCell.quantity = Math.round((toBefore + qty) * 100) / 100;
      toCell.updatedAt = ts;

      const fromBuilding = state.buildings.find((b) => b.id === fromArea.buildingId);
      const toBuilding = state.buildings.find((b) => b.id === toArea.buildingId);
      const sameBuilding = fromArea.buildingId === toArea.buildingId;

      const routeLabel = sameBuilding
        ? `${fromBuilding?.name || 'Building'}: ${fromArea.name} → ${toArea.name}`
        : `${fromBuilding?.name || 'Building'} (${fromArea.name}) → ${toBuilding?.name || 'Building'} (${toArea.name})`;

      pushLog({
        type: 'transfer',
        action: 'transfer_stock',
        buildingId: fromArea.buildingId,
        toBuildingId: toArea.buildingId,
        buildingName: fromBuilding?.name || '',
        toBuildingName: toBuilding?.name || '',
        fromAreaId,
        toAreaId,
        itemId: item.id,
        itemName: item.name,
        unit: item.unit,
        quantity: qty,
        summary: `Transferred ${qty} ${item.unit} of ${item.name} (${routeLabel})`,
        note: String(note || '').trim(),
      });

      persistAndNotify();
      return { fromQuantity: fromCell.quantity, toQuantity: toCell.quantity };
    },

    /* ---------------- Backup, Restore & Log Maintenance ---------------- */

    exportStateJSON() {
      return JSON.stringify(
        {
          exportedAt: nowISO(),
          app: 'Cheshire Custodial Inventory',
          ...state,
        },
        null,
        2
      );
    },

    importStateJSON(jsonString) {
      let parsed;
      try {
        parsed = JSON.parse(jsonString);
      } catch {
        throw new Error('File is not valid JSON.');
      }
      state = validateAndNormalizeState(parsed);
      pushLog({
        type: 'system',
        action: 'import_backup',
        summary: `Restored inventory backup (${state.buildings.length} buildings, ${state.storageAreas.length} areas, ${state.items.length} items)`,
      });
      persistAndNotify();
      return state;
    },

    clearActivityLog() {
      state.activityLog = [];
      persistAndNotify();
    },

    resetWorkspace() {
      state = createInitialState();
      persistAndNotify();
      return state;
    },
  };
}

export const store = createStore();
