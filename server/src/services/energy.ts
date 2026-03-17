import { stmts } from '../db/index'

interface InputEvents {
  keyboard: number
  mouse: number
}

export function accumulateEnergy(
  deviceId: string,
  inputEvents?: InputEvents,
): void {
  if (!inputEvents) return
  const kb = Number(inputEvents.keyboard) || 0
  const ms = Number(inputEvents.mouse) || 0
  const total = Math.max(0, Math.floor(kb + ms))
  if (total <= 0) return

  const row = stmts.getUserIdByDevice.get({ device_id: deviceId }) as { user_id: string | null } | undefined
  if (!row?.user_id) return

  stmts.upsertEnergy.run({ user_id: row.user_id, energy: total })
}
