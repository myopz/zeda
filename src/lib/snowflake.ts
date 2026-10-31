/**
 * Snowflake ID (64-bit layout):
 * - 41 bits: ms since custom epoch
 * - 10 bits: worker id
 * - 12 bits: sequence
 *
 * Returned as decimal string for IndexedDB primary keys.
 */

const EPOCH_MS = 1_704_067_200_000 // 2024-01-01T00:00:00Z
const WORKER_BITS = 10n
const SEQUENCE_BITS = 12n
const TIMESTAMP_SHIFT = WORKER_BITS + SEQUENCE_BITS
const MAX_SEQUENCE = (1n << SEQUENCE_BITS) - 1n
const MAX_WORKER = (1n << WORKER_BITS) - 1n

const WORKER_KEY = 'zeda.snowflake.worker'

function resolveWorkerId(): bigint {
  try {
    const stored = localStorage.getItem(WORKER_KEY)
    if (stored && /^\d+$/.test(stored)) {
      const n = BigInt(stored)
      if (n >= 0n && n <= MAX_WORKER) return n
    }
    const generated = BigInt(crypto.getRandomValues(new Uint16Array(1))[0]! & Number(MAX_WORKER))
    localStorage.setItem(WORKER_KEY, generated.toString())
    return generated
  } catch {
    return 1n
  }
}

class Snowflake {
  private workerId = resolveWorkerId()
  private sequence = 0n
  private lastTimestamp = -1n

  /** Deterministic id for seed data (worker=0, sequence=0, timestamp=offset). */
  fixed(offsetMs: number): string {
    if (offsetMs < 0) throw new Error('Snowflake offset must be >= 0')
    return ((BigInt(offsetMs) << TIMESTAMP_SHIFT) | (0n << SEQUENCE_BITS) | 0n).toString()
  }

  next(): string {
    let timestamp = BigInt(Date.now() - EPOCH_MS)
    if (timestamp < 0n) timestamp = 0n

    if (timestamp === this.lastTimestamp) {
      this.sequence = (this.sequence + 1n) & MAX_SEQUENCE
      if (this.sequence === 0n) {
        timestamp = this.waitNextMillis(this.lastTimestamp)
      }
    } else {
      this.sequence = 0n
    }

    this.lastTimestamp = timestamp
    return (
      (timestamp << TIMESTAMP_SHIFT) |
      (this.workerId << SEQUENCE_BITS) |
      this.sequence
    ).toString()
  }

  private waitNextMillis(last: bigint): bigint {
    let timestamp = BigInt(Date.now() - EPOCH_MS)
    while (timestamp <= last) {
      timestamp = BigInt(Date.now() - EPOCH_MS)
    }
    return timestamp
  }
}

export const snowflake = new Snowflake()
