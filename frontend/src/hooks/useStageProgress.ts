import { computed } from 'vue';
import { useBoardStore } from '../stores/boardStore';
import { useChamberStore } from '../stores/chamberStore';
import { useAssemblyStore } from '../stores/assemblyStore';
import { useLacquerStore } from '../stores/lacquerStore';
import { useStringingStore } from '../stores/stringingStore';
import { cumulativeThickness, formatDate } from '../utils/layer';

export type StageKey = 'select' | 'carve' | 'assemble' | 'lacquer' | 'string';

export interface StageItem {
  key: StageKey;
  label: string;
  done: boolean;
  detail: string;
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
  assemble: '合琴',
  lacquer: '灰胎',
  string: '上弦',
};

/** 灰胎完工目标累计厚度（mm） */
const TARGET_MM = 1.0;

/**
 * 按选材/掏膛/合琴/灰胎/上弦计算每张琴的阶段推进比与缺失项。
 * 选材：面板与底板配对齐全；掏膛：有槽腹记录；合琴：已登记且湿压养护完成；灰胎：累计厚度达标；上弦：有上弦记录。
 */
export function useStageProgress() {
  const boardStore = useBoardStore();
  const chamberStore = useChamberStore();
  const assemblyStore = useAssemblyStore();
  const lacquerStore = useLacquerStore();
  const stringingStore = useStringingStore();

  const guqinNos = computed(() => {
    const set = new Set<string>();
    boardStore.boards.forEach((b) => set.add(b.guqinNo));
    chamberStore.chambers.forEach((c) => set.add(c.guqinNo));
    assemblyStore.records.forEach((r) => set.add(r.guqinNo));
    lacquerStore.layers.forEach((l) => set.add(l.guqinNo));
    stringingStore.stringings.forEach((s) => set.add(s.guqinNo));
    return Array.from(set).sort();
  });

  const progressList = computed<StageProgress[]>(() =>
    guqinNos.value.map((guqinNo) => {
      const boards = boardStore.boards.filter((b) => b.guqinNo === guqinNo);
      const panel = boards.find((b) => b.part === '面板');
      const base = boards.find((b) => b.part === '底板');
      const chamber = chamberStore.chambers.find((c) => c.guqinNo === guqinNo);
      const assemblyStatus = assemblyStore.statusOf(guqinNo);
      const assembly = assemblyStatus?.record;
      const assemblyReady = Boolean(assemblyStatus?.ready);
      const layers = lacquerStore.layers.filter((l) => l.guqinNo === guqinNo);
      const total = cumulativeThickness(layers);
      const stringing = stringingStore.stringings.find((s) => s.guqinNo === guqinNo);
      const species = panel?.species ?? base?.species ?? '';

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
          done: Boolean(panel && base && chamber),
          detail: chamber
            ? `槽腹 ${chamber.chamberDepth}mm，纳音 ${chamber.nayinThickness}mm`
            : panel && base
              ? '尚未掏膛'
              : '面板或底板缺失，不能掏膛',
        },
        {
          key: 'assemble',
          label: STAGE_LABELS.assemble,
          done: Boolean(panel && base && chamber && assemblyReady),
          detail: !panel || !base
            ? '面板或底板缺失，不能合琴'
            : !chamber
              ? '槽腹未完成，不能合琴'
              : assemblyStatus
                ? `${assembly?.kind} · ${assembly?.pressMethod} · ${formatDate(assembly?.joinedAt ?? '')}，${formatDate(assemblyStatus.readyAt)} 可髹漆；${assemblyStatus.reason}`
                : '尚未合琴',
        },
        {
          key: 'lacquer',
          label: STAGE_LABELS.lacquer,
          done: Boolean(assemblyReady && total >= TARGET_MM),
          detail: !assemblyStatus
            ? '未合琴，不能髹漆'
            : !assemblyReady
              ? assemblyStatus.reason
              : layers.length
                ? `${layers.length} 遍，累计 ${total.toFixed(2)}mm / 目标 ${TARGET_MM}mm`
                : '尚未髹漆',
        },
        {
          key: 'string',
          label: STAGE_LABELS.string,
          done: Boolean(assemblyReady && stringing),
          detail: !assemblyStatus
            ? '未合琴，不能上弦'
            : !assemblyReady
              ? assemblyStatus.reason
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
    const base: Record<StageKey, number> = { select: 0, carve: 0, assemble: 0, lacquer: 0, string: 0 };
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

  return { progressList, summary, guqinNos };
}
