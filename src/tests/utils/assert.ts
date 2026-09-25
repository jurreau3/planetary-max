import { expect } from 'vitest';
import type { KernelStatus, StateRead, UmbrellaStatus, PhaseStatus, PlanetaryMode, VersionRead } from '../../schema';

export function assertKernel(json: unknown): asserts json is KernelStatus {
  expect(json).toMatchObject({ status: expect.any(String), tick: expect.any(Number), signals: expect.any(Object), kernelMode: expect.any(String) });
}
export function assertState(json: unknown): asserts json is StateRead {
  expect(json).toMatchObject({ state: { identity: expect.any(Object), runtime: expect.any(Object), planetary: expect.any(Object), phase: expect.any(Number) } });
}
export function assertUmbrella(json: unknown): asserts json is UmbrellaStatus {
  expect(json).toMatchObject({ rules: expect.any(Array), active: expect.any(Boolean), lastUpdate: expect.any(Number) });
}
export function assertPhase(json: unknown): asserts json is PhaseStatus {
  expect(json).toMatchObject({ phase: expect.any(Number), coherence: expect.any(Number), signals: expect.any(Object) });
}
export function assertPlanetary(json: unknown): asserts json is PlanetaryMode {
  expect(json).toMatchObject({ mode: expect.any(String) });
}
export function assertVersion(json: unknown): asserts json is VersionRead {
  expect(json).toMatchObject({ version: expect.any(String), build: expect.any(String), commit: expect.any(String) });
}
