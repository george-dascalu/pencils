// Shared by native import, HTTP transport and vault validation.
export const BOARD_LIMITS = Object.freeze({ nodes: 100_000, edges: 200_000, frames: 500,
  coordinate: 1_000_000, requestBytes: 128_000_000, importBytes: 64_000_000 });
