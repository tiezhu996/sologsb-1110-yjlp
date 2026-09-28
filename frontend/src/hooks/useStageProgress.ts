import { computed } from 'vue';
import { useBoardStore } from '../stores/boardStore';
import { useChamberStore } from '../stores/chamberStore';
import { useJoinStore } from '../stores/joinStore';
import { useLacquerStore } from '../stores/lacquerStore';
import { useStringingStore } from '../stores/stringingStore';
import { cumulativeThickness } from '../utils/layer';
import { joinReadyForLacquer, joinStatus, pressCuringDays } from '../utils/join';
import type { JoinRecord } from '../types/join';

export type StageKey = 'select' | 'carve' | 'join' | 'lacquer' | 'string';

export interface StageItem {
  key: StageKey;
  label: string;
  done: boolean;
  detail: string;
  /** 被前置工序（合琴/养护）卡住，后面的工序不得显示完成 */
  blocked?: boolean;
}

export interface StageProgress {
  guqinNo: string;
  species: string;
  stages: StageItem[];
  /** 阶段推进比（0~100） */
  ratio: number;
  /** 缺失项 */
  missing: string[];
  cumulativeMm: number;
}

export const STAGE_LABELS: Record<StageKey, string> = {
  select: '选材',
  carve: '掏膛',
  join: '合琴',
  lacquer: '灰胎',
  string: '上弦',
};

/** 灰胎完工目标累计厚度（mm） */
const TARGET_MM = 1.0;

/**
 * 按选材/掏膛/合琴/灰胎/上弦计算每张琴的阶段推进比与缺失项。
 * 选材：面板与底板配对齐全；掏膛：有槽腹记录；合琴：有合琴记录且压实、无离缝复核通过；
 * 灰胎：累计厚度达标；上弦：有上弦记录。
 * 硬规则：没合琴或湿压养护未满 3 天（干压当天即可），灰胎及之后工序一律不显示完成。
 */
export function useStageProgress() {
  const boardStore = useBoardStore();
  const chamberStore = useChamberStore();
  const joinStore = useJoinStore();
  const lacquerStore = useLacquerStore();
  const stringingStore = useStringingStore();

  const guqinNos = computed(() => {
    const set = new Set<string>();
    boardStore.boards.forEach((b) => set.add(b.guqinNo));
    chamberStore.chambers.forEach((c) => set.add(c.guqinNo));
    joinStore.joins.forEach((j) => set.add(j.guqinNo));
    lacquerStore.layers.forEach((l) => set.add(l.guqinNo));
    stringingStore.stringings.forEach((s) => set.add(s.guqinNo));
    return Array.from(set).sort();
  });

  function joinStage(join: JoinRecord | undefined): { done: boolean; detail: string; blocked: boolean } {
    const status = joinStatus(join);
    if (!join) {
      return { done: false, detail: '尚未合琴', blocked: true };
    }
    // 合琴记录存在但压实/离缝复核未过：本工序不算完成，后续工序一并卡住，等登记返工重压
    if (!join.compacted || !join.noGap) {
      return { done: false, detail: status.label, blocked: true };
    }
    return { done: status.readyForLacquer, detail: status.label, blocked: !status.readyForLacquer };
  }

  const progressList = computed<StageProgress[]>(() =>
    guqinNos.value.map((guqinNo) => {
      const boards = boardStore.boards.filter((b) => b.guqinNo === guqinNo);
      const panel = boards.find((b) => b.part === '面板');
      const base = boards.find((b) => b.part === '底板');
      const chamber = chamberStore.chambers.find((c) => c.guqinNo === guqinNo);
      const join = joinStore.byGuqin(guqinNo);
      const layers = lacquerStore.layers.filter((l) => l.guqinNo === guqinNo);
      const total = cumulativeThickness(layers);
      const stringing = stringingStore.stringings.find((s) => s.guqinNo === guqinNo);
      const species = panel?.species ?? base?.species ?? '';

      const joinInfo = joinStage(join);
      // 合琴（含湿压养护）未走完前，灰胎及之后的工序一律不允许显示完成
      const gateOpen = joinInfo.done;
      const status = joinStatus(join);

      const stages: StageItem[] = [
        {
          key: 'select',
          label: STAGE_LABELS.select,
          done: Boolean(panel && base),
          detail: panel && base ? `${panel.species}面板 + ${base.species}底板，阴干 ${Math.max(panel.dryYears, base.dryYears)} 年` : '面板或底板缺失',
        },
        {
          key: 'carve',
          label: STAGE_LABELS.carve,
          done: Boolean(chamber),
          detail: chamber ? `槽腹 ${chamber.chamberDepth}mm，纳音 ${chamber.nayinThickness}mm` : '尚未掏膛',
        },
        {
          key: 'join',
          label: STAGE_LABELS.join,
          done: joinInfo.done,
          detail: joinInfo.detail,
          blocked: joinInfo.blocked,
        },
        {
          key: 'lacquer',
          label: STAGE_LABELS.lacquer,
          done: gateOpen && total >= TARGET_MM,
          blocked: !gateOpen,
          detail: !gateOpen
            ? join
              ? `合琴未放行（${status.label}），灰胎暂停显示完成`
              : '未合琴，不能开始髹漆'
            : layers.length
              ? `${layers.length} 遍，累计 ${total.toFixed(2)}mm / 目标 ${TARGET_MM}mm`
              : '尚未髹漆',
        },
        {
          key: 'string',
          label: STAGE_LABELS.string,
          done: gateOpen && Boolean(stringing),
          blocked: !gateOpen,
          detail: !gateOpen
            ? join
              ? `合琴未放行（${status.label}），上弦暂停显示完成`
              : '未合琴，不能进入上弦'
            : stringing
              ? `${stringing.stringType}，弦距 ${stringing.stringGap}mm`
              : '尚未上弦',
        },
      ];

      const doneCount = stages.filter((s) => s.done).length;
      return {
        guqinNo,
        species,
        stages,
        ratio: Math.round((doneCount / stages.length) * 100),
        missing: stages.filter((s) => !s.done).map((s) => s.label),
        cumulativeMm: Number(total.toFixed(2)),
      };
    }),
  );

  const summary = computed(() => {
    const base: Record<StageKey, number> = { select: 0, carve: 0, join: 0, lacquer: 0, string: 0 };
    progressList.value.forEach((item) => {
      item.stages.forEach((stage) => {
        if (stage.done) base[stage.key] += 1;
      });
    });
    const total = progressList.value.length || 1;
    return {
      counts: base,
      total: progressList.value.length,
      completed: progressList.value.filter((item) => item.ratio === 100).length,
      averageRatio: Math.round(progressList.value.reduce((sum, item) => sum + item.ratio, 0) / total),
    };
  });

  return { progressList, summary, guqinNos, joinReadyForLacquer, joinStatus, pressCuringDays };
}
