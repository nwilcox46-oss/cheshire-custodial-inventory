/**
 * Core constants, starter custodial catalog, and defaults for Cheshire Custodial Inventory.
 */

export const STORAGE_KEY = 'cheshire_custodial_inventory_v1';
export const SCHEMA_VERSION = 1;
export const MAX_LOG_ENTRIES = 500;

export const SUPPLY_CATEGORIES = [
  'Chemicals',
  'Paper Goods',
  'Tools & Cloths',
  'Trash & Liners',
  'Equipment',
  'Other',
];

export const UNIT_SUGGESTIONS = [
  'jugs',
  'bottles',
  'cases',
  'rolls',
  'packs',
  'heads',
  'boxes',
  'bags',
  'cans',
  'each',
];

export const BUILDING_ACCENTS = [
  { id: 'magenta', label: 'Cheshire Rose', hex: '#EC4899' },
  { id: 'plum', label: 'Wonderland Plum', hex: '#A855F7' },
  { id: 'gold', label: 'Cheshire Gold', hex: '#FACC15' },
  { id: 'teal', label: 'Looking Glass Teal', hex: '#2DD4BF' },
  { id: 'coral', label: 'Queen Coral', hex: '#FB7185' },
  { id: 'indigo', label: 'Midnight Indigo', hex: '#818CF8' },
];

export const STARTER_ITEMS = [
  {
    id: 'item_lysol_jugs',
    name: 'Lysol Jugs',
    category: 'Chemicals',
    unit: 'jugs',
    defaultLowThreshold: 2,
    defaultParLevel: 6,
    notes: 'Concentrated disinfectant jugs',
  },
  {
    id: 'item_mop_heads',
    name: 'Mop Heads',
    category: 'Tools & Cloths',
    unit: 'heads',
    defaultLowThreshold: 4,
    defaultParLevel: 12,
    notes: 'Replacement wet and dry mop heads',
  },
  {
    id: 'item_toilet_bowl_cleaner',
    name: 'Toilet Bowl Cleaner',
    category: 'Chemicals',
    unit: 'bottles',
    defaultLowThreshold: 4,
    defaultParLevel: 12,
    notes: 'Daily restroom bowl cleaner',
  },
  {
    id: 'item_toilet_paper',
    name: 'Toilet Paper',
    category: 'Paper Goods',
    unit: 'cases',
    defaultLowThreshold: 3,
    defaultParLevel: 10,
    notes: 'Commercial bath tissue cases',
  },
  {
    id: 'item_tri_folds',
    name: 'Tri-Fold Paper Towels',
    category: 'Paper Goods',
    unit: 'cases',
    defaultLowThreshold: 3,
    defaultParLevel: 10,
    notes: 'Tri-fold hand towel dispenser cases',
  },
  {
    id: 'item_micro_fibers',
    name: 'Microfiber Cloths',
    category: 'Tools & Cloths',
    unit: 'packs',
    defaultLowThreshold: 3,
    defaultParLevel: 10,
    notes: 'Reusable microfiber cleaning cloth packs',
  },
  {
    id: 'item_bowl_acid',
    name: 'Bowl Acid',
    category: 'Chemicals',
    unit: 'bottles',
    defaultLowThreshold: 2,
    defaultParLevel: 6,
    notes: 'Heavy-duty acid bowl descaler',
  },
];

export const STATUS_META = {
  vanished: {
    label: 'Vanished',
    shortLabel: 'Out',
    severity: 3,
    description: 'Zero stock on hand',
  },
  low: {
    label: 'Fading Fast',
    shortLabel: 'Low',
    severity: 2,
    description: 'At or below low-stock threshold',
  },
  'below-par': {
    label: 'Below Par',
    shortLabel: 'Restock',
    severity: 1,
    description: 'Below target par level',
  },
  healthy: {
    label: 'Well Stocked',
    shortLabel: 'OK',
    severity: 0,
    description: 'At or above par level',
  },
  na: {
    label: 'N/A',
    shortLabel: 'N/A',
    severity: -1,
    description: 'Not applicable in this storage location',
  },
};
