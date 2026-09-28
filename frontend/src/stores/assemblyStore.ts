import { defineStore } from 'pinia';
import { db } from '../utils/db';
import { uid } from '../utils/id';
import { toPlain } from '../utils/plain';
import { assemblyStatusOf, latestAssembly, sortAssemblyRecords } from '../utils/assembly';
import { useBoardStore } from './boardStore';
import { useChamberStore } from './chamberStore';
import type { AssemblyKind, AssemblyPressMethod, AssemblyRecord } from '../types/assembly';

export interface AssemblyInput {
  guqinNo: string;
  joinedAt?: string;
  pressMethod: AssemblyPressMethod;
  operator: string;
}

export interface AssemblyReworkInput extends AssemblyInput {
  reworkReason: string;
}

interface AssemblyState {
  records: AssemblyRecord[];
  hydrated: boolean;
}

/** 合琴记录与湿压养护门禁 */
export const useAssemblyStore = defineStore('assembly', {
  state: (): AssemblyState => ({ records: [], hydrated: false }),

  getters: {
    recordsOf(state) {
      return (guqinNo: string): AssemblyRecord[] => sortAssemblyRecords(state.records.filter((r) => r.guqinNo === guqinNo));
    },
    latestOf(state) {
      return (guqinNo: string): AssemblyRecord | undefined => latestAssembly(state.records.filter((r) => r.guqinNo === guqinNo));
    },
    statusOf(state) {
      return (guqinNo: string) => assemblyStatusOf(state.records.filter((r) => r.guqinNo === guqinNo));
    },
    guqinNos(state): string[] {
      return Array.from(new Set(state.records.map((r) => r.guqinNo))).sort();
    },
  },

  actions: {
    async hydrate() {
      this.records = await db.assemblies.toArray();
      this.hydrated = true;
    },

    assertCanJoin(guqinNo: string) {
      const boardStore = useBoardStore();
      const chamberStore = useChamberStore();
      const boards = boardStore.boards.filter((b) => b.guqinNo === guqinNo);
      if (!boards.some((b) => b.part === '面板') || !boards.some((b) => b.part === '底板')) {
        throw new Error('面板、底板齐备后才能登记合琴');
      }
      if (!chamberStore.byGuqin(guqinNo)) {
        throw new Error('槽腹完成后才能登记合琴');
      }
    },

    async persist(record: AssemblyRecord) {
      await db.assemblies.put(toPlain(record));
      const others = this.records.filter((r) => r.guqinNo !== record.guqinNo);
      const oldSiblings = sortAssemblyRecords(this.records.filter((r) => r.guqinNo === record.guqinNo));
      const siblings = oldSiblings.some((r) => r.id === record.id)
        ? oldSiblings.map((r) => (r.id === record.id ? record : r))
        : [...oldSiblings, record];
      this.records = [...others, ...sortAssemblyRecords(siblings)];
    },

    /** 初合登记：每张琴只能追加一次；离缝复查请走重压返工 */
    async addAssembly(input: AssemblyInput): Promise<AssemblyRecord> {
      const guqinNo = input.guqinNo.trim();
      this.assertCanJoin(guqinNo);
      if (this.latestOf(guqinNo)) {
        throw new Error('该琴已有合琴记录；复查离缝请登记重压返工');
      }
      const record: AssemblyRecord = {
        id: uid('assembly'),
        guqinNo,
        seq: 1,
        kind: '初合',
        joinedAt: input.joinedAt ?? new Date().toISOString(),
        pressMethod: input.pressMethod,
        operator: input.operator.trim(),
      };
      if (!record.operator) {
        throw new Error('请填写操作人');
      }
      await this.persist(record);
      return record;
    },

    /** 重压返工：追加新记录，湿压养护从重压日期重新计算，旧记录保留 */
    async addRework(input: AssemblyReworkInput): Promise<AssemblyRecord> {
      const guqinNo = input.guqinNo.trim();
      const reason = input.reworkReason.trim();
      const previous = this.recordsOf(guqinNo);
      if (!previous.length) {
        throw new Error('请先登记初合记录');
      }
      if (!reason) {
        throw new Error('请填写离缝返工原因');
      }
      const record: AssemblyRecord = {
        id: uid('assembly'),
        guqinNo,
        seq: previous.length + 1,
        kind: '重压',
        joinedAt: input.joinedAt ?? new Date().toISOString(),
        pressMethod: input.pressMethod,
        operator: input.operator.trim(),
        reworkReason: reason,
      };
      if (!record.operator) {
        throw new Error('请填写操作人');
      }
      await this.persist(record);
      return record;
    },
  },
});

export function assemblyBlocker(guqinNo: string, kind?: AssemblyKind): string | undefined {
  const boardStore = useBoardStore();
  const chamberStore = useChamberStore();
  const assemblyStore = useAssemblyStore();
  const boards = boardStore.boards.filter((b) => b.guqinNo === guqinNo);

  if (!boards.some((b) => b.part === '面板') || !boards.some((b) => b.part === '底板')) {
    return '面板、底板齐备后才能合琴';
  }
  if (!chamberStore.byGuqin(guqinNo)) {
    return '槽腹完成后才能合琴';
  }
  if (kind === '初合' && assemblyStore.latestOf(guqinNo)) {
    return '该琴已合琴；复查离缝请登记重压返工';
  }
  if (!assemblyStore.latestOf(guqinNo)) {
    return '请先登记合琴记录';
  }
  return assemblyStore.statusOf(guqinNo)?.ready ? undefined : assemblyStore.statusOf(guqinNo)?.reason;
}
