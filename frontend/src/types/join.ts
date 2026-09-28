/** 合琴压合方式：湿压需带压养护满 3 天，干压检查合格后可接着做 */
export type PressMethod = '湿压' | '干压';

export const PRESS_METHODS: PressMethod[] = ['湿压', '干压'];

/** 湿压养护天数：满 3 天方可开始髹漆 */
export const WET_PRESS_CURING_DAYS = 3;

/** 合琴返工记录：复查发现离缝时登记，重压之日起重新计算养护；旧记录保留 */
export interface JoinRework {
  id: string;
  /** 返工原因（如：龙池左侧离缝） */
  reason: string;
  /** 重压方式 */
  pressMethod: PressMethod;
  /** 重压日期 ISO（养护从此日期重新起算） */
  repressedAt: string;
  /** 重压操作人 */
  operator: string;
  /** 备注 */
  remark?: string;
}

/** 合琴记录：每张琴一份，返工以子记录追加留档 */
export interface JoinRecord {
  id: string;
  /** 琴号 */
  guqinNo: string;
  /** 合琴日期 ISO */
  joinedAt: string;
  /** 压合方式 */
  pressMethod: PressMethod;
  /** 合琴操作人 */
  operator: string;
  /** 压合时已压实（口头交代之外的现场复核项） */
  compacted: boolean;
  /** 面底板无离缝（口头交代之外的现场复核项） */
  noGap: boolean;
  /** 备注 */
  remark?: string;
  /** 复查离缝返工记录，按时间先后保留 */
  reworks: JoinRework[];
}
