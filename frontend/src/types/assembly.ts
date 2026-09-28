/** 压合方式：湿压需养护满 3 天，干压可接续髹漆 */
export type AssemblyPressMethod = '湿压' | '干压';

/** 合琴记录类型：初合或复查离缝后的重压 */
export type AssemblyKind = '初合' | '重压';

/** 合琴 / 重压记录；重压只追加新记录，不覆盖旧记录 */
export interface AssemblyRecord {
  id: string;
  /** 琴号 */
  guqinNo: string;
  /** 同一琴合琴履历序号，从 1 开始 */
  seq: number;
  /** 初合 / 重压 */
  kind: AssemblyKind;
  /** 合琴日期或重压日期 ISO；湿压从该日起重新计养护 */
  joinedAt: string;
  /** 压合方式 */
  pressMethod: AssemblyPressMethod;
  /** 操作人 */
  operator: string;
  /** 重压返工原因，如复查发现面底板离缝 */
  reworkReason?: string;
}

export const ASSEMBLY_PRESS_METHODS: AssemblyPressMethod[] = ['湿压', '干压'];

/** 湿压养护天数，满 3 天后才能开始髹漆 */
export const WET_PRESS_CURING_DAYS = 3;
