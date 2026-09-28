<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { Lock } from '@element-plus/icons-vue';
import StatBadge from '../components/common/StatBadge.vue';
import ProcessTimeline from '../components/common/ProcessTimeline.vue';
import FilterBar from '../components/common/FilterBar.vue';
import { useStageProgress, STAGE_LABELS, type StageKey } from '../hooks/useStageProgress';
import { useBoardStore } from '../stores/boardStore';
import { useChamberStore } from '../stores/chamberStore';
import { useJoinStore } from '../stores/joinStore';
import { useLacquerStore } from '../stores/lacquerStore';
import { useStringingStore } from '../stores/stringingStore';
import { formatDate } from '../utils/layer';
import { joinStatus } from '../utils/join';
import { WOOD_SPECIES } from '../types/wood-board';
import type { TimelineEvent } from '../types/ui';

const route = useRoute();
const boardStore = useBoardStore();
const chamberStore = useChamberStore();
const joinStore = useJoinStore();
const lacquerStore = useLacquerStore();
const stringingStore = useStringingStore();
const { progressList, summary } = useStageProgress();

const stageParam = computed(() => (typeof route.query.stage === 'string' ? route.query.stage : ''));
const speciesParam = computed(() => (typeof route.query.species === 'string' ? route.query.species : ''));

const visible = computed(() =>
  progressList.value.filter((item) => {
    if (speciesParam.value && item.species !== speciesParam.value) return false;
    if (stageParam.value) {
      const stage = item.stages.find((s) => s.label === stageParam.value);
      if (!stage || !stage.done) return false;
    }
    return true;
  }),
);

const stageBadges = computed(() =>
  (Object.keys(STAGE_LABELS) as StageKey[]).map((key) => ({
    key,
    label: STAGE_LABELS[key],
    count: summary.value.counts[key],
  })),
);

const pendingString = computed(() => progressList.value.filter((item) => !item.stages.find((s) => s.key === 'string')?.done).length);
const curingCount = computed(() => joinStore.joins.filter((j) => joinStatus(j).state === 'curing').length);

const events = computed<TimelineEvent[]>(() => {
  const list: TimelineEvent[] = [];
  chamberStore.chambers.forEach((chamber) => {
    list.push({
      label: `掏膛完成 · ${chamber.guqinNo}`,
      at: formatDate(chamber.carvedAt),
      text: `槽腹深度 ${chamber.chamberDepth}mm，纳音 ${chamber.nayinThickness}mm，天地柱 ${chamber.postPos}，掏膛人 ${chamber.carver}`,
      type: 'primary',
    });
  });
  joinStore.joins.forEach((join) => {
    const status = joinStatus(join);
    list.push({
      label: `合琴 · ${join.guqinNo}`,
      at: formatDate(join.joinedAt),
      text: `${join.pressMethod}，操作人 ${join.operator}，压实 ${join.compacted ? '是' : '否'} / 无离缝 ${join.noGap ? '是' : '否'}；${status.label}`,
      type: 'primary',
    });
    join.reworks.forEach((rework) => {
      list.push({
        label: `合琴返工重压 · ${join.guqinNo}`,
        at: formatDate(rework.repressedAt),
        text: `复查离缝：${rework.reason}；${rework.pressMethod}重压，操作人 ${rework.operator}，养护自该日重新起算`,
        type: 'danger',
      });
    });
  });
  lacquerStore.layers.forEach((layer) => {
    list.push({
      label: `髹漆第 ${layer.seq} 遍 · ${layer.guqinNo}`,
      at: formatDate(layer.appliedAt),
      text: `配比 ${layer.mixRatio}，本遍 ${layer.layerThickness}mm，累计 ${layer.totalThickness}mm，荫房 ${layer.curingTemp}℃ / ${layer.curingHumidity}%，${layer.polishGrit} 目`,
      type: 'warning',
    });
  });
  stringingStore.stringings.forEach((stringing) => {
    list.push({
      label: `上弦 · ${stringing.guqinNo}`,
      at: formatDate(stringing.strungAt),
      text: `${stringing.stringType}，弦距 ${stringing.stringGap}mm，缺陷 ${stringing.defects.join('/')}，九德：${stringing.nineVirtues}`,
      type: 'success',
    });
  });
  return list.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 10);
});
</script>

<template>
  <div>
    <h2 class="page-title">琴坯进度</h2>
    <p class="page-desc">
      按选材 / 掏膛 / 合琴 / 灰胎 / 上弦五阶段统计在制琴坯；湿压合琴须养护满 3 天才能开始髹漆，干压复核合格可接着做，没合琴或养护没走完时进度停在合琴。音色只用文字评语记录，不做音频文件与波形处理。数据保存在浏览器
      IndexedDB（gbguqin-db）。
    </p>

    <el-row :gutter="12" class="stat-row">
      <el-col :xs="12" :md="6">
        <StatBadge label="在制琴坯" :value="progressList.length" unit="张" />
      </el-col>
      <el-col :xs="12" :md="6">
        <StatBadge label="五阶段完成" :value="summary.completed" unit="张" status="success" />
      </el-col>
      <el-col :xs="12" :md="6">
        <StatBadge label="湿压养护中" :value="curingCount" unit="张" :status="curingCount ? 'warning' : 'success'" />
      </el-col>
      <el-col :xs="12" :md="6">
        <StatBadge label="待上弦" :value="pendingString" unit="张" :status="pendingString ? 'danger' : 'success'" />
      </el-col>
    </el-row>

    <el-card shadow="never" class="block">
      <template #header>
        <div class="card-head">
          <span>阶段统计（已完成琴坯数）</span>
          <span class="card-note">
            板材 {{ boardStore.boards.length }} 块（可用 {{ boardStore.usableCount }} 块）· 合琴 {{ joinStore.joins.length }} 张（养护中 {{ curingCount }}）· 髹漆 {{ lacquerStore.layers.length }} 遍 · 荫房异常 {{ lacquerStore.outOfRangeCount }} 遍
          </span>
        </div>
      </template>
      <el-row :gutter="12">
        <el-col v-for="badge in stageBadges" :key="badge.key" :xs="12" :sm="8" :md="24 / 5" class="stage-badge-col">
          <StatBadge :label="`${badge.label} 完成`" :value="badge.count" unit="张" />
        </el-col>
      </el-row>
    </el-card>

    <el-card shadow="never" class="block">
      <template #header>
        <div class="card-head">
          <span>琴坯阶段明细</span>
          <span class="card-note">
            <el-icon class="lock-inline"><Lock /></el-icon>
            表示被合琴养护卡住：未合琴或湿压未满 3 天时，灰胎 / 上弦不显示完成
          </span>
        </div>
      </template>
      <FilterBar
        :fields="[
          { key: 'stage', label: '工序阶段', options: ['选材', '掏膛', '合琴', '灰胎', '上弦'], width: 120 },
          { key: 'species', label: '树种', options: WOOD_SPECIES, width: 110 },
        ]"
        keyword-placeholder="搜索琴号（本页按阶段/树种筛选）"
        :result-count="visible.length"
        :total-count="progressList.length"
      />
      <el-table :data="visible" size="small" border>
        <el-table-column prop="guqinNo" label="琴号" width="110" />
        <el-table-column prop="species" label="树种" width="90" />
        <el-table-column label="五阶段" min-width="360">
          <template #default="scope">
            <el-tooltip
              v-for="stage in scope.row.stages"
              :key="stage.key"
              :content="stage.detail"
              placement="top"
              :show-after="200"
            >
              <el-tag
                class="stage-tag"
                :type="stage.done ? 'success' : stage.blocked ? 'warning' : 'info'"
                effect="plain"
              >
                <el-icon v-if="stage.blocked && !stage.done" class="lock-icon"><Lock /></el-icon>
                {{ stage.label }}{{ stage.done ? '✓' : '…' }}
              </el-tag>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column label="推进比" width="160">
          <template #default="scope">
            <el-progress :percentage="scope.row.ratio" :status="scope.row.ratio === 100 ? 'success' : undefined" />
          </template>
        </el-table-column>
        <el-table-column label="缺失项" min-width="180">
          <template #default="scope">
            <span v-if="scope.row.missing.length" class="missing">{{ scope.row.missing.join('、') }}</span>
            <el-tag v-else type="success" size="small">齐备</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="累计灰胎(mm)" width="120">
          <template #default="scope">{{ scope.row.cumulativeMm.toFixed(2) }}</template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card shadow="never" class="block">
      <template #header>最近工序动态</template>
      <ProcessTimeline :events="events" />
    </el-card>
  </div>
</template>

<style scoped>
.page-title {
  margin: 0 0 4px;
  font-size: 20px;
  color: #4a3728;
}
.page-desc {
  margin: 0 0 14px;
  color: #8a7a68;
  font-size: 13px;
}
.stat-row {
  margin-bottom: 12px;
}
.stat-row .el-col {
  margin-bottom: 12px;
}
.block {
  margin-bottom: 16px;
  border-radius: 8px;
}
.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.card-note {
  font-size: 12px;
  color: #8a7a68;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.stage-badge-col {
  margin-bottom: 12px;
}
.stage-tag {
  margin-right: 6px;
  margin-bottom: 4px;
  cursor: default;
}
.lock-icon,
.lock-inline {
  color: #c77700;
  vertical-align: middle;
}
.missing {
  color: #c62828;
  font-size: 13px;
}
</style>
