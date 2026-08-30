import assert from 'node:assert/strict';
import { calculateInviteEligibility } from '../dist/index.js';

console.log('Testing calculateInviteEligibility...');
const now = new Date('2026-08-27T00:00:00Z').getTime();
const userCreatedAt = new Date('2026-08-01T00:00:00Z').toISOString();

const result = calculateInviteEligibility(userCreatedAt, true, 0, now);
assert.equal(result.can_generate, true);
assert.ok(result.total_eligible >= 1);

console.log('Invite eligibility tests passed!');
