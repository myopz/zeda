/** Re-exports shared sequential evaluation helpers for this feature. */
export {
  endpointKey,
  SeqSimError,
  type FfSimState,
  type SeqEvalResult,
  type GateResolver,
} from '@/features/flip-flops/lib/seq-sim'

export {
  evaluateSequentialCircuit,
  createInitialSeqSimState,
  runSeqWaveform,
  makeGateResolver,
  type CircuitResolver,
} from './evaluate'
