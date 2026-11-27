/**
 * Pure selectors and rollup aggregation engine for Cheshire Custodial Inventory.
 * Aggregates storage area stock into building rollups, campus totals, and restock sheets.
 */

import { STATUS_META } from './constants.js';

/**
 * Safely retrieve a storage area's stock entry for an item.
 */
export function getStockEntry(state, storageAreaId, itemId) {
  const entry = state.stock?.[storageAreaId]?.[itemId];
  const notApplicable = Boolean(entry?.notApplicable);
  return {
    quantity: notApplicable
      ? 0
      : Number.isFinite(entry?.quantity)
        ? Math.max(0, entry.quantity)
        : 0,
    lowThresholdOverride:
      entry?.lowThresholdOverride === null || entry?.lowThresholdOverride === undefined
        ? null
        : Math.max(0, Number(entry.lowThresholdOverride)),
    parLevelOverride:
      entry?.parLevelOverride === null || entry?.parLevelOverride === undefined
        ? null
        : Math.max(0, Number(entry.parLevelOverride)),
    notApplicable,
    updatedAt: entry?.updatedAt || null,
  };
}

/**
 * Determine inventory health status for a quantity against low threshold and par level.
 */
export function getStockStatus(quantity, lowThreshold = 0, parLevel = 0) {
  const qty = Math.max(0, Number(quantity) || 0);
  const low = lowThreshold === null || lowThreshold === undefined ? 0 : Math.max(0, Number(lowThreshold) || 0);
  const par = parLevel === null || parLevel === undefined ? 0 : Math.max(0, Number(parLevel) || 0);

  if (qty <= 0) {
    return 'vanished';
  }
  if (low > 0 && qty <= low) {
    return 'low';
  }
  if (par > 0 && qty < par) {
    return 'below-par';
  }
  return 'healthy';
}

/**
 * Return all storage areas belonging to a specific building.
 */
export function getBuildingAreas(state, buildingId) {
  return state.storageAreas.filter((area) => area.buildingId === buildingId);
}

/**
 * Build itemized inventory rows for a single storage area.
 */
export function getAreaInventory(state, storageAreaId) {
  const area = state.storageAreas.find((a) => a.id === storageAreaId) || null;
  if (!area) return null;

  const items = state.items.map((item) => {
    const entry = getStockEntry(state, storageAreaId, item.id);
    const hasAreaLow = !entry.notApplicable && entry.lowThresholdOverride !== null;
    const hasAreaPar = !entry.notApplicable && entry.parLevelOverride !== null;
    const effectiveLow = hasAreaLow ? entry.lowThresholdOverride : null;
    const effectivePar = hasAreaPar ? entry.parLevelOverride : null;

    // Area-level status marks N/A explicitly when excluded from this storage location,
    // otherwise flags low/below-par when targets exist or vanished at 0.
    let status = 'healthy';
    if (entry.notApplicable) {
      status = 'na';
    } else if (hasAreaLow || hasAreaPar) {
      status = getStockStatus(entry.quantity, effectiveLow ?? 0, effectivePar ?? 0);
    } else if (entry.quantity === 0) {
      status = 'vanished';
    }

    const restockNeeded =
      !entry.notApplicable && hasAreaPar ? Math.max(0, effectivePar - entry.quantity) : 0;

    return {
      item,
      quantity: entry.quantity,
      lowThresholdOverride: entry.lowThresholdOverride,
      parLevelOverride: entry.parLevelOverride,
      notApplicable: entry.notApplicable,
      hasAreaTargets: hasAreaLow || hasAreaPar,
      status,
      restockNeeded,
      updatedAt: entry.updatedAt,
    };
  });

  const totalUnits = items.reduce((sum, row) => sum + (row.notApplicable ? 0 : row.quantity), 0);
  const stockedItemCount = items.filter((row) => !row.notApplicable && row.quantity > 0).length;
  const naCount = items.filter((row) => row.notApplicable).length;
  const lowAlertCount = items.filter(
    (row) => !row.notApplicable && row.hasAreaTargets && (row.status === 'vanished' || row.status === 'low')
  ).length;

  return {
    area,
    items,
    totalUnits,
    stockedItemCount,
    naCount,
    lowAlertCount,
  };
}

/**
 * Roll up and aggregate all storage areas inside a building into the building's overall inventory.
 */
export function getBuildingRollup(state, buildingId) {
  const building = state.buildings.find((b) => b.id === buildingId) || null;
  if (!building) return null;

  const areas = getBuildingAreas(state, buildingId);
  const buildingTargetMap = state.buildingTargets?.[buildingId] || {};

  const items = state.items.map((item) => {
    let totalQuantity = 0;
    let areaLowSum = 0;
    let areaParSum = 0;
    let anyAreaLowOverride = false;
    let anyAreaParOverride = false;
    let naAreaCount = 0;

    const areaBreakdown = areas.map((area) => {
      const entry = getStockEntry(state, area.id, item.id);
      if (entry.notApplicable) {
        naAreaCount += 1;
      } else {
        totalQuantity += entry.quantity;
        if (entry.lowThresholdOverride !== null) {
          areaLowSum += entry.lowThresholdOverride;
          anyAreaLowOverride = true;
        }
        if (entry.parLevelOverride !== null) {
          areaParSum += entry.parLevelOverride;
          anyAreaParOverride = true;
        }
      }

      return {
        areaId: area.id,
        areaName: area.name,
        floorOrZone: area.floorOrZone || '',
        quantity: entry.quantity,
        lowThresholdOverride: entry.lowThresholdOverride,
        parLevelOverride: entry.parLevelOverride,
        notApplicable: entry.notApplicable,
        updatedAt: entry.updatedAt,
      };
    });

    const allAreasNA = areas.length > 0 && naAreaCount === areas.length;
    const buildingOverride = buildingTargetMap[item.id] || {};
    const hasBuildingLow =
      buildingOverride.lowThresholdOverride !== null &&
      buildingOverride.lowThresholdOverride !== undefined;
    const hasBuildingPar =
      buildingOverride.parLevelOverride !== null &&
      buildingOverride.parLevelOverride !== undefined;

    let effectiveLowThreshold;
    let lowSource;
    if (hasBuildingLow) {
      effectiveLowThreshold = Math.max(0, Number(buildingOverride.lowThresholdOverride));
      lowSource = 'building';
    } else if (anyAreaLowOverride) {
      effectiveLowThreshold = areaLowSum;
      lowSource = 'areas';
    } else {
      effectiveLowThreshold = Math.max(0, Number(item.defaultLowThreshold) || 0);
      lowSource = 'catalog';
    }

    let effectiveParLevel;
    let parSource;
    if (hasBuildingPar) {
      effectiveParLevel = Math.max(0, Number(buildingOverride.parLevelOverride));
      parSource = 'building';
    } else if (anyAreaParOverride) {
      effectiveParLevel = areaParSum;
      parSource = 'areas';
    } else {
      effectiveParLevel = Math.max(0, Number(item.defaultParLevel) || 0);
      parSource = 'catalog';
    }

    const status = allAreasNA
      ? 'na'
      : getStockStatus(totalQuantity, effectiveLowThreshold, effectiveParLevel);
    const restockNeeded = allAreasNA ? 0 : Math.max(0, effectiveParLevel - totalQuantity);

    return {
      item,
      totalQuantity,
      effectiveLowThreshold: allAreasNA ? 0 : effectiveLowThreshold,
      effectiveParLevel: allAreasNA ? 0 : effectiveParLevel,
      lowSource,
      parSource,
      hasBuildingOverride: hasBuildingLow || hasBuildingPar,
      allAreasNA,
      status,
      restockNeeded,
      areaBreakdown,
    };
  });

  const totalUnits = items.reduce((sum, row) => sum + row.totalQuantity, 0);
  const stockedItemCount = items.filter((row) => !row.allAreasNA && row.totalQuantity > 0).length;
  const vanishedCount = items.filter((row) => row.status === 'vanished').length;
  const lowCount = items.filter((row) => row.status === 'low').length;
  const belowParCount = items.filter((row) => row.status === 'below-par').length;
  const healthyCount = items.filter((row) => row.status === 'healthy').length;
  const naCount = items.filter((row) => row.status === 'na').length;
  const restockItemCount = items.filter((row) => row.restockNeeded > 0).length;
  const totalRestockUnits = items.reduce((sum, row) => sum + row.restockNeeded, 0);

  return {
    building,
    areas,
    areaCount: areas.length,
    items,
    totalUnits,
    stockedItemCount,
    vanishedCount,
    lowCount,
    belowParCount,
    healthyCount,
    naCount,
    alertCount: vanishedCount + lowCount,
    restockItemCount,
    totalRestockUnits,
  };
}

/**
 * Roll up every building into campus-wide totals and KPI summary metrics.
 */
export function getCampusRollup(state) {
  const buildingRollups = state.buildings.map((building) =>
    getBuildingRollup(state, building.id)
  );

  const itemTotals = state.items.map((item) => {
    let totalQuantity = 0;
    let totalPar = 0;
    let totalRestockNeeded = 0;
    let buildingsVanished = 0;
    let buildingsLow = 0;

    const buildingBreakdown = buildingRollups.map((bRollup) => {
      const row = bRollup.items.find((r) => r.item.id === item.id);
      const qty = row ? row.totalQuantity : 0;
      const par = row ? row.effectiveParLevel : item.defaultParLevel;
      const needed = row ? row.restockNeeded : 0;
      const status = row ? row.status : 'vanished';

      totalQuantity += qty;
      if (status !== 'na') {
        totalPar += par;
      }
      totalRestockNeeded += needed;
      if (status === 'vanished') buildingsVanished += 1;
      if (status === 'low') buildingsLow += 1;

      return {
        buildingId: bRollup.building.id,
        buildingName: bRollup.building.name,
        quantity: qty,
        parLevel: par,
        restockNeeded: needed,
        status,
      };
    });

    return {
      item,
      totalQuantity,
      totalPar,
      totalRestockNeeded,
      buildingsVanished,
      buildingsLow,
      buildingBreakdown,
    };
  });

  const totalUnitsOnHand = buildingRollups.reduce((sum, b) => sum + b.totalUnits, 0);
  const vanishedCount = buildingRollups.reduce((sum, b) => sum + b.vanishedCount, 0);
  const lowCount = buildingRollups.reduce((sum, b) => sum + b.lowCount, 0);
  const restockItemCount = buildingRollups.reduce((sum, b) => sum + b.restockItemCount, 0);
  const totalRestockUnits = buildingRollups.reduce((sum, b) => sum + b.totalRestockUnits, 0);

  return {
    buildingRollups,
    itemTotals,
    buildingCount: state.buildings.length,
    storageAreaCount: state.storageAreas.length,
    catalogItemCount: state.items.length,
    totalUnitsOnHand,
    vanishedCount,
    lowCount,
    alertCount: vanishedCount + lowCount,
    restockItemCount,
    totalRestockUnits,
  };
}

/**
 * Compute actionable restock lists both by building and as a consolidated master order sheet.
 */
export function getRestockSummary(state, urgencyFilter = 'all') {
  const campus = getCampusRollup(state);

  const matchesFilter = (row) => {
    const needsAction = row.restockNeeded > 0 || row.status === 'vanished' || row.status === 'low';
    if (!needsAction) return false;
    if (urgencyFilter === 'vanished') return row.status === 'vanished';
    if (urgencyFilter === 'low') return row.status === 'vanished' || row.status === 'low';
    return true;
  };

  const byBuilding = campus.buildingRollups
    .map((bRollup) => {
      const neededItems = bRollup.items
        .filter(matchesFilter)
        .sort((a, b) => {
          const sevDiff =
            (STATUS_META[b.status]?.severity ?? 0) - (STATUS_META[a.status]?.severity ?? 0);
          if (sevDiff !== 0) return sevDiff;
          return b.restockNeeded - a.restockNeeded;
        });

      return {
        building: bRollup.building,
        areas: bRollup.areas,
        items: neededItems,
        totalUnitsNeeded: neededItems.reduce((sum, r) => sum + r.restockNeeded, 0),
      };
    })
    .filter((group) => group.items.length > 0);

  const consolidatedMap = new Map();

  for (const group of byBuilding) {
    for (const row of group.items) {
      if (!consolidatedMap.has(row.item.id)) {
        consolidatedMap.set(row.item.id, {
          item: row.item,
          totalCurrent: 0,
          totalPar: 0,
          totalNeeded: 0,
          worstStatus: row.status,
          buildings: [],
        });
      }
      const agg = consolidatedMap.get(row.item.id);
      agg.totalCurrent += row.totalQuantity;
      agg.totalPar += row.effectiveParLevel;
      agg.totalNeeded += row.restockNeeded;
      if (
        (STATUS_META[row.status]?.severity ?? 0) >
        (STATUS_META[agg.worstStatus]?.severity ?? 0)
      ) {
        agg.worstStatus = row.status;
      }
      agg.buildings.push({
        buildingId: group.building.id,
        buildingName: group.building.name,
        currentQuantity: row.totalQuantity,
        parLevel: row.effectiveParLevel,
        restockNeeded: row.restockNeeded,
        status: row.status,
      });
    }
  }

  const masterOrderSheet = Array.from(consolidatedMap.values()).sort((a, b) => {
    const sevDiff =
      (STATUS_META[b.worstStatus]?.severity ?? 0) - (STATUS_META[a.worstStatus]?.severity ?? 0);
    if (sevDiff !== 0) return sevDiff;
    return b.totalNeeded - a.totalNeeded;
  });

  const totalLineItems = byBuilding.reduce((sum, g) => sum + g.items.length, 0);
  const totalUnitsNeeded = masterOrderSheet.reduce((sum, r) => sum + r.totalNeeded, 0);

  return {
    byBuilding,
    masterOrderSheet,
    totalLineItems,
    totalUnitsNeeded,
  };
}

/**
 * Format restock summary as a CSV string for spreadsheets/ordering.
 */
export function generateRestockCSV(summary) {
  const escapeCsv = (val) => {
    const str = String(val ?? '');
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headers = [
    'Building',
    'Item',
    'Category',
    'Unit',
    'Current Qty',
    'Par Target',
    'Qty To Order',
    'Status',
  ];

  const lines = [headers.map(escapeCsv).join(',')];

  for (const group of summary.byBuilding) {
    for (const row of group.items) {
      lines.push(
        [
          group.building.name,
          row.item.name,
          row.item.category,
          row.item.unit,
          row.totalQuantity,
          row.effectiveParLevel,
          row.restockNeeded,
          STATUS_META[row.status]?.label || row.status,
        ]
          .map(escapeCsv)
          .join(',')
      );
    }
  }

  return lines.join('\n');
}

/**
 * Format restock summary as clean plain text for copying into email/SMS/requisitions.
 */
export function generateRestockPlainText(summary) {
  if (summary.masterOrderSheet.length === 0) {
    return 'Cheshire Custodial Restock List — All buildings are at or above par!';
  }

  const dateStr = new Date().toLocaleDateString();
  const lines = [`Cheshire Custodial Restock List (${dateStr})`, ''];

  lines.push('=== MASTER ORDER TOTALS ===');
  for (const row of summary.masterOrderSheet) {
    lines.push(
      `- ${row.item.name}: order ${row.totalNeeded} ${row.item.unit} (on hand: ${row.totalCurrent}, par: ${row.totalPar})`
    );
  }

  lines.push('', '=== BY BUILDING ===');
  for (const group of summary.byBuilding) {
    lines.push(`\n[${group.building.name}]`);
    for (const row of group.items) {
      const tag = STATUS_META[row.status]?.label || row.status;
      lines.push(
        `  • ${row.item.name}: need ${row.restockNeeded} ${row.item.unit} (have ${row.totalQuantity} / par ${row.effectiveParLevel}) — ${tag}`
      );
    }
  }

  return lines.join('\n');
}
