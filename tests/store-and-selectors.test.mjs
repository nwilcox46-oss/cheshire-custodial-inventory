import assert from 'node:assert/strict';
import test from 'node:test';

import { STARTER_ITEMS } from '../js/constants.js';
import {
  generateRestockCSV,
  generateRestockPlainText,
  getAreaInventory,
  getBuildingRollup,
  getCampusRollup,
  getRestockSummary,
  getStockStatus,
} from '../js/selectors.js';
import { createMemoryStorage, createStore } from '../js/store.js';

function makeStore() {
  return createStore(createMemoryStorage(), 'test_cheshire_store');
}

test('initial state pre-loads the 7 starter custodial items and 0 buildings', () => {
  const store = makeStore();
  const state = store.getState();

  assert.equal(state.items.length, 7);
  assert.equal(state.buildings.length, 0);
  assert.equal(state.storageAreas.length, 0);

  const names = state.items.map((i) => i.name);
  for (const expected of [
    'Lysol Jugs',
    'Mop Heads',
    'Toilet Bowl Cleaner',
    'Toilet Paper',
    'Tri-Fold Paper Towels',
    'Microfiber Cloths',
    'Bowl Acid',
  ]) {
    assert.ok(names.includes(expected), `Missing starter item: ${expected}`);
  }
});

test('storage area quantities roll up and aggregate accurately into building and campus totals', () => {
  const store = makeStore();

  const north = store.addBuilding({ name: 'North Wing', code: 'NW' });
  const south = store.addBuilding({ name: 'South Wing', code: 'SW' });

  const northBasement = store.addStorageArea({ buildingId: north.id, name: 'Basement Supply' });
  const northFloor2 = store.addStorageArea({ buildingId: north.id, name: '2nd Floor Closet' });
  const southMain = store.addStorageArea({ buildingId: south.id, name: 'Main Custodial Room' });

  const lysolId = STARTER_ITEMS[0].id; // defaultLow: 2, defaultPar: 6
  const tpId = 'item_toilet_paper'; // defaultLow: 3, defaultPar: 10

  store.setStock({ storageAreaId: northBasement.id, itemId: lysolId, quantity: 5 });
  store.setStock({ storageAreaId: northFloor2.id, itemId: lysolId, quantity: 3 });
  store.setStock({ storageAreaId: northBasement.id, itemId: tpId, quantity: 2 });
  store.setStock({ storageAreaId: southMain.id, itemId: lysolId, quantity: 1 });

  const northRollup = getBuildingRollup(store.getState(), north.id);
  const northLysol = northRollup.items.find((r) => r.item.id === lysolId);
  const northTp = northRollup.items.find((r) => r.item.id === tpId);

  // 5 + 3 = 8 jugs >= par 6 => healthy, 0 restock needed
  assert.equal(northLysol.totalQuantity, 8);
  assert.equal(northLysol.status, 'healthy');
  assert.equal(northLysol.restockNeeded, 0);
  assert.equal(northLysol.areaBreakdown.length, 2);

  // 2 + 0 = 2 cases <= low 3 => low, needs 10 - 2 = 8
  assert.equal(northTp.totalQuantity, 2);
  assert.equal(northTp.status, 'low');
  assert.equal(northTp.restockNeeded, 8);

  // Campus total for Lysol: North (8) + South (1) = 9
  const campus = getCampusRollup(store.getState());
  const campusLysol = campus.itemTotals.find((r) => r.item.id === lysolId);
  assert.equal(campusLysol.totalQuantity, 9);
  assert.equal(campus.buildingCount, 2);
  assert.equal(campus.storageAreaCount, 3);
});

test('custom items can be added and tracked across buildings', () => {
  const store = makeStore();
  const bldg = store.addBuilding({ name: 'Gymnasium' });
  const closet = store.addStorageArea({ buildingId: bldg.id, name: 'Locker Closet' });

  const liners = store.addItem({
    name: '55-Gal Trash Liners',
    category: 'Trash & Liners',
    unit: 'boxes',
    defaultLowThreshold: 2,
    defaultParLevel: 8,
  });

  store.adjustStock({ storageAreaId: closet.id, itemId: liners.id, delta: 3 });
  const areaInv = getAreaInventory(store.getState(), closet.id);
  const linerRow = areaInv.items.find((r) => r.item.id === liners.id);
  assert.equal(linerRow.quantity, 3);

  const bldgRollup = getBuildingRollup(store.getState(), bldg.id);
  const rollupRow = bldgRollup.items.find((r) => r.item.id === liners.id);
  assert.equal(rollupRow.totalQuantity, 3);
  assert.equal(rollupRow.status, 'below-par');
  assert.equal(rollupRow.restockNeeded, 5);

  // Duplicate names rejected
  assert.throws(() => store.addItem({ name: '55-gal trash liners', unit: 'boxes' }));
});

test('atomic stock transfers update both areas, recalculate building rollups, and log the move', () => {
  const store = makeStore();
  const b1 = store.addBuilding({ name: 'Building A' });
  const b2 = store.addBuilding({ name: 'Building B' });
  const a1 = store.addStorageArea({ buildingId: b1.id, name: 'Central Cage' });
  const a2 = store.addStorageArea({ buildingId: b2.id, name: 'East Closet' });

  const mopId = 'item_mop_heads';
  store.setStock({ storageAreaId: a1.id, itemId: mopId, quantity: 10 });

  // Reject over-transfer
  assert.throws(() =>
    store.transferStock({ fromAreaId: a1.id, toAreaId: a2.id, itemId: mopId, quantity: 12 })
  );

  // Valid transfer of 4 mop heads
  const res = store.transferStock({
    fromAreaId: a1.id,
    toAreaId: a2.id,
    itemId: mopId,
    quantity: 4,
    note: 'Morning shift restock',
  });

  assert.equal(res.fromQuantity, 6);
  assert.equal(res.toQuantity, 4);

  const b1Mops = getBuildingRollup(store.getState(), b1.id).items.find((r) => r.item.id === mopId);
  const b2Mops = getBuildingRollup(store.getState(), b2.id).items.find((r) => r.item.id === mopId);
  assert.equal(b1Mops.totalQuantity, 6);
  assert.equal(b2Mops.totalQuantity, 4);

  const latestLog = store.getState().activityLog[0];
  assert.equal(latestLog.type, 'transfer');
  assert.match(latestLog.summary, /Transferred 4 heads of Mop Heads/);
});

test('restock summary computes building deficits, consolidated master order sheet, CSV, and text', () => {
  const store = makeStore();
  const b1 = store.addBuilding({ name: 'Main Hall' });
  const b2 = store.addBuilding({ name: 'Annex' });
  const a1 = store.addStorageArea({ buildingId: b1.id, name: '1st Fl' });
  const a2 = store.addStorageArea({ buildingId: b2.id, name: 'Utility' });

  // Bowl Acid default par = 6, low = 2
  store.setStock({ storageAreaId: a1.id, itemId: 'item_bowl_acid', quantity: 1 }); // needs 5 (low)
  store.setStock({ storageAreaId: a2.id, itemId: 'item_bowl_acid', quantity: 0 }); // needs 6 (vanished)

  // Override building target for Main Hall Lysol Jugs to par=20, low=5
  store.setBuildingTargets({
    buildingId: b1.id,
    itemId: 'item_lysol_jugs',
    lowThresholdOverride: 5,
    parLevelOverride: 20,
  });
  store.setStock({ storageAreaId: a1.id, itemId: 'item_lysol_jugs', quantity: 4 }); // needs 16 (low)

  const summary = getRestockSummary(store.getState(), 'all');
  const bowlMaster = summary.masterOrderSheet.find((r) => r.item.id === 'item_bowl_acid');
  assert.equal(bowlMaster.totalNeeded, 11);
  assert.equal(bowlMaster.worstStatus, 'vanished');

  const lysolMaster = summary.masterOrderSheet.find((r) => r.item.id === 'item_lysol_jugs');
  // Main Hall needs 16 (override par 20 - 4) + Annex needs 6 (default par 6 - 0) = 22
  assert.equal(lysolMaster.totalNeeded, 22);

  const csv = generateRestockCSV(summary);
  assert.match(csv, /Main Hall,Bowl Acid,Chemicals,bottles,1,6,5,Fading Fast/);

  const text = generateRestockPlainText(summary);
  assert.match(text, /MASTER ORDER TOTALS/);
  assert.match(text, /Bowl Acid: order 11 bottles/);
});

test('JSON backup export and import roundtrip preserves all data and rejects malformed JSON', () => {
  const storeA = makeStore();
  const b = storeA.addBuilding({ name: 'Science Building', code: 'SCI' });
  const a = storeA.addStorageArea({ buildingId: b.id, name: 'Lab Closet' });
  storeA.setStock({ storageAreaId: a.id, itemId: 'item_micro_fibers', quantity: 9 });
  storeA.addItem({ name: 'Nitrile Gloves', category: 'Equipment', unit: 'boxes', defaultLowThreshold: 2, defaultParLevel: 8 });

  const exported = storeA.exportStateJSON();

  const storeB = makeStore();
  assert.throws(() => storeB.importStateJSON('{bad json'));
  assert.throws(() => storeB.importStateJSON('{"items":"not-an-array"}'));

  storeB.importStateJSON(exported);
  const stateB = storeB.getState();

  assert.equal(stateB.buildings.length, 1);
  assert.equal(stateB.buildings[0].name, 'Science Building');
  assert.equal(stateB.items.length, 8);
  const rollup = getBuildingRollup(stateB, b.id);
  const mf = rollup.items.find((r) => r.item.id === 'item_micro_fibers');
  assert.equal(mf.totalQuantity, 9);
});

test('getStockStatus returns accurate status levels across thresholds', () => {
  assert.equal(getStockStatus(0, 2, 6), 'vanished');
  assert.equal(getStockStatus(2, 2, 6), 'low');
  assert.equal(getStockStatus(4, 2, 6), 'below-par');
  assert.equal(getStockStatus(6, 2, 6), 'healthy');
  assert.equal(getStockStatus(10, 2, 6), 'healthy');
});

test('marking an item N/A in storage locations updates area inventory, building rollups, restock lists, and backups', () => {
  const store = makeStore();
  const bldg = store.addBuilding({ name: 'Annex' });
  const closetA = store.addStorageArea({ buildingId: bldg.id, name: 'Office Utility' });
  const closetB = store.addStorageArea({ buildingId: bldg.id, name: 'Basement Closet' });

  const bowlAcidId = 'item_bowl_acid';
  store.setStock({ storageAreaId: closetA.id, itemId: bowlAcidId, quantity: 3 });

  // Mark N/A in closet A: clears quantity, sets status to 'na', excludes from area alerts
  store.setAreaNotApplicable({ storageAreaId: closetA.id, itemId: bowlAcidId, notApplicable: true });
  let invA = getAreaInventory(store.getState(), closetA.id);
  let rowA = invA.items.find((r) => r.item.id === bowlAcidId);
  assert.equal(rowA.notApplicable, true);
  assert.equal(rowA.quantity, 0);
  assert.equal(rowA.status, 'na');
  assert.equal(invA.naCount, 1);

  // Building still tracks Bowl Acid because closetB is not N/A
  let rollup = getBuildingRollup(store.getState(), bldg.id);
  let bldgRow = rollup.items.find((r) => r.item.id === bowlAcidId);
  assert.equal(bldgRow.allAreasNA, false);
  assert.equal(bldgRow.areaBreakdown.find((a) => a.areaId === closetA.id).notApplicable, true);

  // Mark N/A in closet B as well: entire building becomes N/A and excluded from restock summary
  store.setAreaNotApplicable({ storageAreaId: closetB.id, itemId: bowlAcidId, notApplicable: true });
  rollup = getBuildingRollup(store.getState(), bldg.id);
  bldgRow = rollup.items.find((r) => r.item.id === bowlAcidId);
  assert.equal(bldgRow.allAreasNA, true);
  assert.equal(bldgRow.status, 'na');
  assert.equal(bldgRow.restockNeeded, 0);
  assert.equal(rollup.naCount, 1);

  const restock = getRestockSummary(store.getState(), 'all');
  assert.equal(
    restock.masterOrderSheet.some((r) => r.item.id === bowlAcidId),
    false
  );

  // JSON export/import roundtrip preserves notApplicable
  const exported = store.exportStateJSON();
  const store2 = makeStore();
  store2.importStateJSON(exported);
  const invA2 = getAreaInventory(store2.getState(), closetA.id);
  assert.equal(invA2.items.find((r) => r.item.id === bowlAcidId).notApplicable, true);

  // Restoring clears N/A flag
  store2.setAreaNotApplicable({ storageAreaId: closetA.id, itemId: bowlAcidId, notApplicable: false });
  const invA3 = getAreaInventory(store2.getState(), closetA.id);
  assert.equal(invA3.items.find((r) => r.item.id === bowlAcidId).notApplicable, false);
});

