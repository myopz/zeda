import type { Bit, CircuitPin, PinDrive } from '../types'

export const PIN_DRIVES: PinDrive[] = ['signal', 'clk', 'vcc', 'gnd']

export function inferPinDrive(name: string): PinDrive {
  const n = name.trim().toUpperCase()
  if (n === 'VCC' || n === 'VDD') return 'vcc'
  if (n === 'GND' || n === 'VSS') return 'gnd'
  // EN / enable is a level signal, not a clock (timing diagram toggles all clk drives).
  if (n === 'CLK' || n.endsWith('CLK')) return 'clk'
  return 'signal'
}

export function resolvePinDrive(pin: CircuitPin): PinDrive {
  return pin.drive ?? inferPinDrive(pin.name)
}

export function isFixedDrive(drive: PinDrive): boolean {
  return drive === 'vcc' || drive === 'gnd'
}

export function isClockDrive(drive: PinDrive): boolean {
  return drive === 'clk'
}

export function defaultBitForDrive(drive: PinDrive, pinName: string): Bit {
  if (drive === 'vcc') return 1
  if (drive === 'gnd') return 0
  if (
    pinName.includes('nPRE') ||
    pinName.includes('nCLR') ||
    pinName.includes('nLOAD') ||
    pinName.includes('nR0')
  ) {
    return 1
  }
  return 0
}

export function defaultBitForPin(pin: CircuitPin): Bit {
  return defaultBitForDrive(resolvePinDrive(pin), pin.name)
}

export function applyFixedInputDrives(
  circuitInputs: CircuitPin[],
  inputs: Record<string, Bit>,
): Record<string, Bit> {
  const next = { ...inputs }
  for (const pin of circuitInputs) {
    const drive = resolvePinDrive(pin)
    if (drive === 'vcc') next[pin.id] = 1
    else if (drive === 'gnd') next[pin.id] = 0
    else if (next[pin.id] === undefined) next[pin.id] = defaultBitForPin(pin)
  }
  return next
}

export function normalizeCircuitPin(pin: CircuitPin): CircuitPin {
  const name =
    typeof pin.name === 'string' && pin.name.trim() ? pin.name.trim() : 'X'
  const drive =
    pin.drive && PIN_DRIVES.includes(pin.drive) ? pin.drive : inferPinDrive(name)
  return { id: pin.id, name, drive }
}

export function defaultNameForDrive(drive: PinDrive, index: number): string {
  if (drive === 'clk') return index === 0 ? 'CLK' : `CLK${index + 1}`
  if (drive === 'vcc') return 'VCC'
  if (drive === 'gnd') return 'GND'
  return String.fromCharCode(65 + (index % 26))
}
