/**
 * Validation script for BuildingConfig schema.
 *
 * Run with: npx tsx scripts/validateBuildingConfig.ts
 */

import { BuildingConfigSchema, defaultBuildingConfig, normalizeBuildingConfig } from '../lib/buildingConfig';

let passed = 0;
let failed = 0;

function assert(condition: boolean, description: string) {
  if (condition) {
    console.log(`  PASS: ${description}`);
    passed++;
  } else {
    console.error(`  FAIL: ${description}`);
    failed++;
  }
}

console.log('--- BuildingConfig Validation Tests ---\n');

// Test 1: Default config should pass validation
console.log('Test 1: Default config validates');
const defaultResult = BuildingConfigSchema.safeParse(defaultBuildingConfig);
assert(defaultResult.success, 'defaultBuildingConfig passes Zod validation');

// Test 2: Valid config should pass
console.log('\nTest 2: Custom valid config validates');
const validConfig = {
  floors: 10,
  width: 50,
  length: 30,
  heightPerFloor: 4,
  wallColor: 'blue',
  windowStyle: 'glass' as const,
  style: 'modern' as const,
  texture: 'concrete' as const,
  roofStyle: 'flat' as const,
  notes: 'A modern skyscraper',
};
const validResult = BuildingConfigSchema.safeParse(validConfig);
assert(validResult.success, 'Custom valid config passes validation');

// Test 3: Invalid floors (too high)
console.log('\nTest 3: Invalid values are rejected');
const invalidConfig = {
  ...validConfig,
  floors: 300,
};
const invalidResult = BuildingConfigSchema.safeParse(invalidConfig);
assert(!invalidResult.success, 'floors=300 is rejected (max 200)');

// Test 4: Invalid enum value
const badEnum = {
  ...validConfig,
  windowStyle: 'fancy',
};
const badEnumResult = BuildingConfigSchema.safeParse(badEnum);
assert(!badEnumResult.success, 'windowStyle="fancy" is rejected');

// Test 5: Missing required field
console.log('\nTest 4: Missing fields are rejected');
const { floors, ...missingFloors } = validConfig;
const missingResult = BuildingConfigSchema.safeParse(missingFloors);
assert(!missingResult.success, 'Missing "floors" field is rejected');

// Test 6: normalizeBuildingConfig clamps values
console.log('\nTest 5: normalizeBuildingConfig clamps out-of-range values');
const { config: normalized, clamped } = normalizeBuildingConfig({
  floors: 999,
  width: 0.1,
  length: 600,
  heightPerFloor: 1,
});
assert(normalized.floors === 200, `floors clamped to 200 (got ${normalized.floors})`);
assert(normalized.width === 0.5, `width clamped to 0.5 (got ${normalized.width})`);
assert(normalized.length === 500, `length clamped to 500 (got ${normalized.length})`);
assert(normalized.heightPerFloor === 2, `heightPerFloor clamped to 2 (got ${normalized.heightPerFloor})`);
assert(clamped.length === 4, `4 clamping messages generated (got ${clamped.length})`);

// Test 7: normalizeBuildingConfig fills defaults
console.log('\nTest 6: normalizeBuildingConfig fills defaults for missing fields');
const { config: filled } = normalizeBuildingConfig({});
assert(filled.floors === defaultBuildingConfig.floors, 'floors gets default');
assert(filled.width === defaultBuildingConfig.width, 'width gets default');
assert(filled.wallColor === defaultBuildingConfig.wallColor, 'wallColor gets default');
assert(filled.windowStyle === defaultBuildingConfig.windowStyle, 'windowStyle gets default');
assert(filled.roofStyle === defaultBuildingConfig.roofStyle, 'roofStyle gets default');

// Summary
console.log(`\n--- Results: ${passed} passed, ${failed} failed ---`);
process.exit(failed > 0 ? 1 : 0);
