import { WET_PRESS_CURING_DAYS, type AssemblyRecord } from '../types/assembly';

const DAY_MS = 86_400_000;

/** 按合琴 / 重压顺序排序 */
export function sortAssemblyRecords(records: AssemblyRecord[]): AssemblyRecord[] {
  return [...records].sort((a, b) => a.seq - b.seq || a.joinedAt.localeCompare(b.joinedAt));
}

/** 取当前生效的合琴记录；重压记录会覆盖养护计算，但旧记录保留 */
export function latestAssembly(records: AssemblyRecord[]): AssemblyRecord | undefined {
  return sortAssemblyRecords(records).at(-1);
}

function localDay(value: string | Date): number {
  const d = typeof value === 'string' ? new Date(value) : value;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** 湿压满 3 个自然日后可开始髹漆；干压当日即可 */
export function assemblyReadyAt(record: AssemblyRecord): string {
  const d = new Date(record.joinedAt);
  if (record.pressMethod === '湿压') {
    d.setDate(d.getDate() + WET_PRESS_CURING_DAYS);
  }
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

export interface AssemblyStatus {
  record: AssemblyRecord;
  ready: boolean;
  readyAt: string;
  remainingDays: number;
  reason: string;
}

export function assemblyStatusOf(records: AssemblyRecord[], now: Date = new Date()): AssemblyStatus | undefined {
  const record = latestAssembly(records);
  if (!record) return undefined;

  const readyAt = assemblyReadyAt(record);
  const remaining = Math.max(0, Math.ceil((localDay(readyAt) - localDay(now)) / DAY_MS));
  const ready = localDay(now) >= localDay(readyAt);

  let reason: string;
  if (record.pressMethod === '干压') {
    reason = '干压，可接续髹漆';
  } else if (ready) {
    reason = `湿压已养护满 ${WET_PRESS_CURING_DAYS} 天`;
  } else {
    reason = `湿压需养护满 ${WET_PRESS_CURING_DAYS} 天，还差 ${remaining} 天`;
  }

  return { record, ready, readyAt, remainingDays: remaining, reason };
}
