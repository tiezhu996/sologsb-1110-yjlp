import { defineStore } from 'pinia';
import { db } from '../utils/db';
import { uid } from '../utils/id';
import { toPlain } from '../utils/plain';
import type { JoinRecord, JoinRework, PressMethod } from '../types/join';

export interface JoinInput {
  guqinNo: string;
  joinedAt?: string;
  pressMethod: PressMethod;
  operator: string;
  compacted: boolean;
  noGap: boolean;
  remark?: string;
}

export interface ReworkInput {
  reason: string;
  pressMethod: PressMethod;
  repressedAt?: string;
  operator: string;
  remark?: string;
}

interface JoinState {
  joins: JoinRecord[];
  hydrated: boolean;
}

/** 合琴记录与离缝返工：每张琴一份，返工追加留档，重压后养护重新起算 */
export const useJoinStore = defineStore('join', {
  state: (): JoinState => ({ joins: [], hydrated: false }),

  getters: {
    byGuqin(state) {
      return (guqinNo: string): JoinRecord | undefined => state.joins.find((j) => j.guqinNo === guqinNo);
    },
    guqinNos(state): string[] {
      return Array.from(new Set(state.joins.map((j) => j.guqinNo))).sort();
    },
  },

  actions: {
    async hydrate() {
      this.joins = await db.joins.orderBy('joinedAt').toArray();
      this.hydrated = true;
    },

    /** 每张琴一份合琴记录：存在则更新，不存在则新增（返工记录保留） */
    async saveJoin(input: JoinInput): Promise<JoinRecord> {
      const existed = this.joins.find((j) => j.guqinNo === input.guqinNo);
      const record: JoinRecord = {
        id: existed?.id ?? uid('join'),
        guqinNo: input.guqinNo.trim(),
        joinedAt: input.joinedAt ?? existed?.joinedAt ?? new Date().toISOString(),
        pressMethod: input.pressMethod,
        operator: input.operator.trim(),
        compacted: input.compacted,
        noGap: input.noGap,
        remark: input.remark?.trim() || undefined,
        reworks: existed?.reworks ?? [],
      };
      await db.joins.put(toPlain(record));
      this.joins = existed ? this.joins.map((j) => (j.id === record.id ? record : j)) : [record, ...this.joins];
      return record;
    },

    /** 登记离缝返工：追加一条返工记录，重压之日起重新计算养护，旧记录不动 */
    async addRework(guqinNo: string, input: ReworkInput): Promise<JoinRecord | undefined> {
      const current = this.joins.find((j) => j.guqinNo === guqinNo);
      if (!current) return undefined;
      const rework: JoinRework = {
        id: uid('rework'),
        reason: input.reason.trim(),
        pressMethod: input.pressMethod,
        repressedAt: input.repressedAt ?? new Date().toISOString(),
        operator: input.operator.trim(),
        remark: input.remark?.trim() || undefined,
      };
      const updated: JoinRecord = { ...current, reworks: [...current.reworks, rework] };
      await db.joins.put(toPlain(updated));
      this.joins = this.joins.map((j) => (j.id === updated.id ? updated : j));
      return updated;
    },

    async removeJoin(id: string) {
      await db.joins.delete(id);
      this.joins = this.joins.filter((j) => j.id !== id);
    },
  },
});
