<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import EmptyPanel from '../components/common/EmptyPanel.vue';
import { useAssemblyStore } from '../stores/assemblyStore';
import { useBoardStore } from '../stores/boardStore';
import { useChamberStore } from '../stores/chamberStore';
import { formatDate } from '../utils/layer';
import { WET_PRESS_CURING_DAYS, ASSEMBLY_PRESS_METHODS, type AssemblyKind, type AssemblyPressMethod, type AssemblyRecord } from '../types/assembly';

const assemblyStore = useAssemblyStore();
const boardStore = useBoardStore();
const chamberStore = useChamberStore();
const selectedGuqin = ref('');

const dialogVisible = ref(false);
const formRef = ref<FormInstance>();
const dialogMode = ref<AssemblyKind>('初合');

interface AssemblyForm {
  guqinNo: string;
  joinedAt: string;
  pressMethod: AssemblyPressMethod;
  operator: string;
  reworkReason: string;
}

const form = ref<AssemblyForm>({
  guqinNo: '',
  joinedAt: new Date().toISOString().slice(0, 10),
  pressMethod: '湿压',
  operator: '周砚秋',
  reworkReason: '',
});

const rules = computed<FormRules>(() => ({
  guqinNo: [{ required: true, message: '请选择琴号', trigger: 'change' }],
  joinedAt: [{ required: true, message: '请选择日期', trigger: 'change' }],
  operator: [{ required: true, message: '请填写操作人', trigger: 'blur' }],
  ...(dialogMode.value === '重压'
    ? { reworkReason: [{ required: true, message: '请登记离缝返工原因', trigger: 'blur' }] }
    : {}),
}));

const candidateNos = computed(() => {
  const set = new Set<string>();
  chamberStore.chambers.forEach((c) => set.add(c.guqinNo));
  assemblyStore.records.forEach((r) => set.add(r.guqinNo));
  return Array.from(set).sort();
});

const initialOptions = computed(() =>
  candidateNos.value.filter((no) => {
    const boards = boardStore.boards.filter((b) => b.guqinNo === no);
    return boards.some((b) => b.part === '面板') && boards.some((b) => b.part === '底板') && !assemblyStore.latestOf(no);
  }),
);

interface CurrentRow {
  guqinNo: string;
  paired: boolean;
  latest?: AssemblyRecord;
  ready: boolean;
  readyAt?: string;
  status: string;
  tagType: 'success' | 'warning' | 'danger' | 'info';
}

const currentRows = computed<CurrentRow[]>(() =>
  candidateNos.value.map((guqinNo) => {
    const boards = boardStore.boards.filter((b) => b.guqinNo === guqinNo);
    const paired = boards.some((b) => b.part === '面板') && boards.some((b) => b.part === '底板');
    const latest = assemblyStore.latestOf(guqinNo);
    const status = assemblyStore.statusOf(guqinNo);
    if (!paired) {
      return { guqinNo, paired, ready: false, status: '面板或底板缺失', tagType: 'danger' };
    }
    if (!latest || !status) {
      return { guqinNo, paired, ready: false, status: '尚未合琴', tagType: 'warning' };
    }
    return {
      guqinNo,
      paired,
      latest,
      ready: status.ready,
      readyAt: status.readyAt,
      status: status.reason,
      tagType: status.ready ? 'success' : 'warning',
    };
  }),
);

const historyRows = computed(() =>
  assemblyStore.records
    .slice()
    .sort((a, b) => b.guqinNo.localeCompare(a.guqinNo) || b.seq - a.seq || b.joinedAt.localeCompare(a.joinedAt)),
);

function openCreate(guqinNo = '') {
  const no = guqinNo || selectedGuqin.value || initialOptions.value[0] || '';
  if (!no) {
    ElMessage.warning('暂无满足“面板/底板齐备、槽腹已完成、尚未合琴”的琴');
    return;
  }
  dialogMode.value = '初合';
  form.value = {
    guqinNo: no,
    joinedAt: new Date().toISOString().slice(0, 10),
    pressMethod: '湿压',
    operator: '周砚秋',
    reworkReason: '',
  };
  dialogVisible.value = true;
}

function openRework(rowOrNo?: CurrentRow | string) {
  const no = typeof rowOrNo === 'string' ? rowOrNo : rowOrNo?.guqinNo ?? selectedGuqin.value;
  const latest = no ? assemblyStore.latestOf(no) : undefined;
  if (!no || !latest) {
    ElMessage.warning('请选择已有合琴记录的琴');
    return;
  }
  dialogMode.value = '重压';
  form.value = {
    guqinNo: no,
    joinedAt: new Date().toISOString().slice(0, 10),
    pressMethod: latest.pressMethod,
    operator: latest.operator,
    reworkReason: '',
  };
  dialogVisible.value = true;
}

async function submit() {
  const ok = await formRef.value?.validate().catch(() => false);
  if (!ok) return;
  const payload = {
    guqinNo: form.value.guqinNo,
    joinedAt: new Date(`${form.value.joinedAt}T09:00:00`).toISOString(),
    pressMethod: form.value.pressMethod,
    operator: form.value.operator,
  };
  try {
    const saved = dialogMode.value === '重压'
      ? await assemblyStore.addRework({ ...payload, reworkReason: form.value.reworkReason })
      : await assemblyStore.addAssembly(payload);
    selectedGuqin.value = saved.guqinNo;
    ElMessage.success(dialogMode.value === '重压' ? '已登记重压返工，养护从重压日期重新计算' : '已登记合琴记录');
    dialogVisible.value = false;
  } catch (error) {
    ElMessage.error((error as Error).message);
  }
}
</script>

<template>
  <div>
    <h2 class="page-title">合琴记录</h2>
    <p class="page-desc">
      槽腹完成、面板与底板齐备后登记合琴日期、压合方式和操作人。湿压须养护满 {{ WET_PRESS_CURING_DAYS }} 天才能开始髹漆，干压可接续施工；
      复查离缝只追加重压记录，旧合琴记录保留。
    </p>

    <div class="toolbar">
      <el-button type="primary" @click="openCreate()">登记合琴</el-button>
      <el-button type="warning" @click="openRework()">重压返工</el-button>
      <el-select v-model="selectedGuqin" clearable placeholder="选择琴号查看" style="width: 200px">
        <el-option v-for="no in candidateNos" :key="no" :label="no" :value="no" />
      </el-select>
      <el-tag type="info" effect="plain">湿压可髹漆日 = 合琴/重压日 + {{ WET_PRESS_CURING_DAYS }} 天</el-tag>
    </div>

    <el-card shadow="never" class="block">
      <template #header>当前合琴状态</template>
      <el-table :data="currentRows" size="small" border highlight-current-row @current-change="(row: CurrentRow) => (selectedGuqin = row?.guqinNo ?? '')">
        <el-table-column prop="guqinNo" label="琴号" width="100" />
        <el-table-column label="面底板" width="100">
          <template #default="scope">
            <el-tag :type="scope.row.paired ? 'success' : 'danger'" size="small">{{ scope.row.paired ? '齐备' : '缺失' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="当前记录" width="90">
          <template #default="scope">{{ scope.row.latest?.kind ?? '—' }}</template>
        </el-table-column>
        <el-table-column label="合琴/重压日期" width="130">
          <template #default="scope">{{ scope.row.latest ? formatDate(scope.row.latest.joinedAt) : '—' }}</template>
        </el-table-column>
        <el-table-column label="压合方式" width="100">
          <template #default="scope">{{ scope.row.latest?.pressMethod ?? '—' }}</template>
        </el-table-column>
        <el-table-column prop="latest.operator" label="操作人" width="100" />
        <el-table-column label="可开始髹漆" width="130">
          <template #default="scope">{{ scope.row.readyAt ? formatDate(scope.row.readyAt) : '—' }}</template>
        </el-table-column>
        <el-table-column label="状态" min-width="210">
          <template #default="scope">
            <el-tag :type="scope.row.tagType" size="small">{{ scope.row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="latest.reworkReason" label="返工原因" min-width="180" />
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="scope">
            <el-button v-if="!scope.row.latest" link type="primary" @click="openCreate(scope.row.guqinNo)">登记合琴</el-button>
            <el-button v-else link type="warning" @click="openRework(scope.row)">重压返工</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card shadow="never" class="block">
      <template #header>
        <div class="card-head">
          <span>合琴履历（重压追加，不覆盖旧记录）</span>
          <span class="card-note">共 {{ assemblyStore.records.length }} 条</span>
        </div>
      </template>
      <EmptyPanel v-if="historyRows.length === 0" description="暂无合琴记录" action-text="登记合琴" @action="openCreate()" />
      <el-table v-else :data="historyRows" size="small" border>
        <el-table-column prop="guqinNo" label="琴号" width="100" />
        <el-table-column prop="seq" label="次数" width="70" />
        <el-table-column prop="kind" label="类型" width="90" />
        <el-table-column label="日期" width="120">
          <template #default="scope">{{ formatDate(scope.row.joinedAt) }}</template>
        </el-table-column>
        <el-table-column prop="pressMethod" label="压合方式" width="100" />
        <el-table-column prop="operator" label="操作人" width="100" />
        <el-table-column prop="reworkReason" label="返工原因" min-width="220" />
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="dialogMode === '重压' ? '登记重压返工' : '登记合琴'" width="560px">
      <el-alert
        v-if="dialogMode === '重压'"
        title="重压会追加一条新记录；湿压养护从本次重压日期重新计算，旧合琴记录仍保留在履历中。"
        type="warning"
        :closable="false"
        class="form-alert"
      />
      <el-alert
        v-else
        :title="form.pressMethod === '湿压' ? `湿压需静置养护满 ${WET_PRESS_CURING_DAYS} 天，期间进度停在合琴。` : '干压无需等待，登记后可继续灰胎。'"
        :type="form.pressMethod === '湿压' ? 'info' : 'success'"
        :closable="false"
        class="form-alert"
      />
      <el-form ref="formRef" :model="form" :rules="rules" label-width="120px">
        <el-form-item label="琴号" prop="guqinNo">
          <el-select v-model="form.guqinNo" :disabled="dialogMode === '重压'" placeholder="选择琴号" style="width: 220px">
            <el-option v-for="no in candidateNos" :key="no" :label="no" :value="no" />
          </el-select>
        </el-form-item>
        <el-form-item :label="dialogMode === '重压' ? '重压日期' : '合琴日期'" prop="joinedAt">
          <el-date-picker v-model="form.joinedAt" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" />
        </el-form-item>
        <el-form-item label="压合方式" prop="pressMethod">
          <el-radio-group v-model="form.pressMethod">
            <el-radio v-for="method in ASSEMBLY_PRESS_METHODS" :key="method" :value="method">{{ method }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="操作人" prop="operator">
          <el-input v-model="form.operator" placeholder="如：周砚秋" maxlength="16" style="width: 220px" />
        </el-form-item>
        <el-form-item v-if="dialogMode === '重压'" label="返工原因" prop="reworkReason">
          <el-input v-model="form.reworkReason" type="textarea" :rows="2" maxlength="80" placeholder="如：复查发现龙池附近面底板离缝" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.page-title {
  margin: 0 0 4px;
  font-size: 20px;
  color: #4a3728;
}
.page-desc {
  margin: 0 0 12px;
  color: #8a7a68;
  font-size: 13px;
}
.toolbar {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 12px;
  flex-wrap: wrap;
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
}
.form-alert {
  margin-bottom: 14px;
}
</style>
