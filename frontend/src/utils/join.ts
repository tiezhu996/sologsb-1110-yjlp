import { WET_PRESS_CURING_DAYS, type JoinRecord, type JoinRework, type PressMethod } from '../types/join';
import { formatDate } from './layer';

const DAY_MS = 86_400_000;

/** 最近一次返工记录（没有则 undefined） */
export function latestRework(record: JoinRecord | undefined): JoinRework | undefined {
  if (!record || record.reworks.length === 0) return undefined;
  return [...record.reworks].sort((a, b) => new Date(b.repressedAt).getTime() - new Date(a.repressedAt).getTime())[0];
}

export interface EffectivePress {
  /** 实际生效的压合方式：有重压取最近一次重压，否则取初次合琴 */
  pressMethod: PressMethod;
  /** 养护起算日期：重压日（重压重新起算）或初次合琴日 */
  since: string;
  rework: JoinRework | undefined;
}

/** 当前生效的压合信息（登记返工后以最近一次重压为准） */
export function effectivePress(record: JoinRecord | undefined): EffectivePress | undefined {
  if (!record) return undefined;
  const rework = latestRework(record);
  if (rework) {
    return { pressMethod: rework.pressMethod, since: rework.repressedAt, rework };
  }
  return { pressMethod: record.pressMethod, since: record.joinedAt, rework: undefined };
}

/** 已养护天数（自养护起算日的次日起算的整天数） */
export function pressCuringDays(record: JoinRecord | undefined, now: Date = new Date()): number {
  const press = effectivePress(record);
  if (!press) return 0;
  const elapsed = now.getTime() - new Date(press.since).getTime();
  return Math.max(0, Math.floor(elapsed / DAY_MS));
}

/** 是否可以开始髹漆：干压当天即可，湿压需养护满 3 天 */
export function joinReadyForLacquer(record: JoinRecord | undefined, now: Date = new Date()): boolean {
  if (!record || !record.compacted || !record.noGap) return false;
  const press = effectivePress(record);
  if (!press) return false;
  if (press.pressMethod === '干压') return true;
  return pressCuringDays(record, now) >= WET_PRESS_CURING_DAYS;
}

/** 湿压最早可髹漆日期（起算日 + 3 天，YYYY-MM-DD） */
export function lacquerReadyDate(record: JoinRecord | undefined): string {
  const press = effectivePress(record);
  if (!press) return '';
  const d = new Date(press.since);
  d.setDate(d.getDate() + WET_PRESS_CURING_DAYS);
  return formatDate(d);
}

/** 合琴工序整体状态（进度页 / 合琴台账共用） */
export type JoinState = 'none' | 'rework-needed' | 'curing' | 'ready' | 'ready-dry';

export interface JoinStatus {
  state: JoinState;
  label: string;
  /** 已养护天数（湿压时有意义） */
  curingDays: number;
  /** 湿压最早可髹漆日期 */
  readyDate: string;
  /** 当前生效压合信息 */
  press: EffectivePress | undefined;
  /** 是否允许开始髹漆 */
  readyForLacquer: boolean;
}

export function joinStatus(record: JoinRecord | undefined, now: Date = new Date()): JoinStatus {
  if (!record) {
    return { state: 'none', label: '尚未合琴', curingDays: 0, readyDate: '', press: undefined, readyForLacquer: false };
  }
  const press = effectivePress(record);
  const curingDays = pressCuringDays(record, now);
  const readyDate = lacquerReadyDate(record);
  const ready = joinReadyForLacquer(record, now);

  if (!record.compacted || !record.noGap) {
    return { state: 'rework-needed', label: '压实或离缝复核未过，需登记返工重压', curingDays, readyDate, press, readyForLacquer: false };
  }
  if (ready) {
    if (press?.pressMethod === '干压') {
      return { state: 'ready-dry', label: '干压已合格，可直接髹漆', curingDays, readyDate, press, readyForLacquer: true };
    }
    return { state: 'ready', label: `湿压养护已满 ${WET_PRESS_CURING_DAYS} 天，可髹漆`, curingDays, readyDate, press, readyForLacquer: true };
  }
  return {
    state: 'curing',
    label: `湿压养护中（${curingDays}/${WET_PRESS_CURING_DAYS} 天），${readyDate} 后方可髹漆`,
    curingDays,
    readyDate,
    press,
    readyForLacquer: false,
  };
}
