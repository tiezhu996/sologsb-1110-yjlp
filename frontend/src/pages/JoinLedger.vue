<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import StatBadge from '../components/common/StatBadge.vue';
import EmptyPanel from '../components/common/EmptyPanel.vue';
import { useJoinStore, type JoinInput, type ReworkInput } from '../stores/joinStore';
import { useBoardStore } from '../stores/boardStore';
import { useChamberStore } from '../stores/chamberStore';
import { joinStatus } from '../utils/join';
import { formatDate } from '../utils/layer';
import { PRESS_METHODS, type JoinRecord, type PressMethod } from '../types/join';

const joinStore = useJoinStore();
const boardStore = useBoardStore();
const chamberStore = useChamberStore();

/** 已知琴号（板材 + 槽腹 + 已有合琴记录），录入时也允许手填新琴号 */
const guqinOptions = computed(() =>
  Array.from(new Set([
    ...boardStore.guqinNos,
    ...chamberStore.chambers.map((c) => c.guqinNo),
    ...joinStore.guqinNos,
  ])).sort(),
);

const dialogVisible = ref(false);
const editingGuqin = ref('');
const formRef = ref<FormInstance>();

interface JoinForm {
  guqinNo: string;
  joinedAt: string;
  pressMethod: PressMethod;
  operator: string;
  compacted: boolean;
  noGap: boolean;
  remark: string;
}

const form = ref<JoinForm>(emptyForm());

function emptyForm(): JoinForm {
  return {
    guqinNo: '',
    joinedAt: new Date().toISOString().slice(0, 10),
    pressMethod: '湿压',
    operator: '周砚秋',
    compacted: true,
    noGap: true,
    remark: '',
  };
}

const rules: FormRules = {
  guqinNo: [{ required: true, message: '请输入或选择琴号', trigger: 'change' }],
  operator: [{ required: true, message: '请输入合琴操作人', trigger: 'blur' }],
};

const reworkVisible = ref(false);
const reworkGuqin = ref('');
const reworkFormRef = ref<FormInstance>();
const reworkForm = ref<ReworkForm>(emptyReworkForm());

interface ReworkForm {
  reason: string;
  pressMethod: PressMethod;
  repressedAt: string;
  operator: string;
  remark: string;
}

function emptyReworkForm(): ReworkForm {
  return {
    reason: '',
    pressMethod: '湿压',
    repressedAt: new Date().toISOString().slice(0, 10),
    operator: '周砚秋',
    remark: '',
  };
}

const reworkRules: FormRules = {
  reason: [{ required: true, message: '请填写复查发现的离缝/返工原因', trigger: 'blur' }],
  operator: [{ required: true, message: '请输入重压操作人', trigger: 'blur' }],
};

/** 台账按合琴日期倒序 */
const rows = computed(() =>
  [...joinStore.joins].sort((a, b) => new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime()),
);

function statusOf(record: JoinRecord) {
  return joinStatus(record);
}

const curingCount = computed(() => joinStore.joins.filter((j) => joinStatus(j).state === 'curing').length);
const reworkCount = computed(() => joinStore.joins.reduce((sum, j) => sum + j.reworks.length, 0));
const readyCount = computed(() => joinStore.joins.filter((j) => joinStatus(j).readyForLacquer).length);

function statusTagType(record: JoinRecord): 'success' | 'warning' | 'danger' | 'info' {
  const state = joinStatus(record).state;
  if (state === 'ready' || state === 'ready-dry') return 'success';
  if (state === 'curing') return 'warning';
  if (state === 'rework-needed') return 'danger';
  return 'info';
}

function openCreate() {
  editingGuqin.value = '';
  form.value = { ...emptyForm(), guqinNo: guqinOptions.value[0] ?? '' };
  dialogVisible.value = true;
}

function openEdit(record: JoinRecord) {
  editingGuqin.value = record.guqinNo;
  form.value = {
    guqinNo: record.guqinNo,
    joinedAt: record.joinedAt.slice(0, 10),
    pressMethod: record.pressMethod,
    operator: record.operator,
    compacted: record.compacted,
    noGap: record.noGap,
    remark: record.remark ?? '',
  };
  dialogVisible.value = true;
}

async function submit() {
  const ok = await formRef.value?.validate().catch(() => false);
  if (!ok) return;
  const payload: JoinInput = {
    guqinNo: form.value.guqinNo,
    joinedAt: new Date(`${form.value.joinedAt}T09:00:00`).toISOString(),
    pressMethod: form.value.pressMethod,
    operator: form.value.operator,
    compacted: form.value.compacted,
    noGap: form.value.noGap,
    remark: form.value.remark,
  };
  const saved = await joinStore.saveJoin(payload);
  ElMessage.success(editingGuqin.value ? `已更新 ${saved.guqinNo} 的合琴记录（返工记录保留）` : `已登记 ${saved.guqinNo} 合琴`);
  dialogVisible.value = false;
}

function openRework(record: JoinRecord) {
  reworkGuqin.value = record.guqinNo;
  // 默认沿用最近一次重压（或初压）的方式与操作人
  const latest = record.reworks.length ? record.reworks[record.reworks.length - 1] : undefined;
  reworkForm.value = {
    ...emptyReworkForm(),
    pressMethod: latest?.pressMethod ?? record.pressMethod,
    operator: latest?.operator ?? record.operator,
  };
  reworkVisible.value = true;
}

async function submitRework() {
  const ok = await reworkFormRef.value?.validate().catch(() => false);
  if (!ok) return;
  const payload: ReworkInput = {
    reason: reworkForm.value.reason,
    pressMethod: reworkForm.value.pressMethod,
    repressedAt: new Date(`${reworkForm.value.repressedAt}T09:00:00`).toISOString(),
    operator: reworkForm.value.operator,
    remark: reworkForm.value.remark,
  };
  const updated = await joinStore.addRework(reworkGuqin.value, payload);
  if (!updated) {
    ElMessage.error('未找到该琴的合琴记录');
    return;
  }
  ElMessage.success(`已登记返工重压，养护自 ${formatDate(payload.repressedAt!)} 重新起算（旧记录保留）`);
  reworkVisible.value = false;
}

async function remove(record: JoinRecord) {
  const confirmed = await ElMessageBox.confirm(
    `确认删除 ${record.guqinNo} 的合琴记录${record.reworks.length ? `（含 ${record.reworks.length} 条返工留档）` : ''}？删除后进度将回到掏膛。`,
    '删除确认',
    { type: 'warning' },
  )
    .then(() => true)
    .catch(() => false);
  if (!confirmed) return;
  await joinStore.removeJoin(record.id);
  ElMessage.success('已删除合琴记录');
}
</script>

<template>
  <div>
    <h2 class="page-title">合琴记录</h2>
    <p class="page-desc">
      登记合琴日期、压合方式（湿压 / 干压）与操作人，并记录压实、面底板离缝复核结果。湿压须带压养护满 3 天方可开始髹漆，干压复核合格后可接着做；复查发现离缝请登记返工重压，养护自重压日重新起算，旧记录全部保留。
    </p>

    <div class="toolbar">
      <el-button type="primary" @click="openCreate">新增合琴记录</el-button>
      <el-tag type="info" effect="plain">湿压养护期 3 天，干压当天放行</el-tag>
    </div>

    <el-row :gutter="12" class="stat-row">
      <el-col :xs="12" :md="6">
        <StatBadge label="已合琴琴坯" :value="joinStore.joins.length" unit="张" />
      </el-col>
      <el-col :xs="12" :md="6">
        <StatBadge label="湿压养护中" :value="curingCount" unit="张" :status="curingCount ? 'warning' : 'success'" />
      </el-col>
      <el-col :xs="12" :md="6">
        <StatBadge label="已放行可髹漆" :value="readyCount" unit="张" status="success" />
      </el-col>
      <el-col :xs="12" :md="6">
        <StatBadge label="累计返工重压" :value="reworkCount" unit="次" :status="reworkCount ? 'danger' : 'success'" />
      </el-col>
    </el-row>

    <EmptyPanel v-if="joinStore.joins.length === 0" description="暂无合琴记录" action-text="新增合琴记录" @action="openCreate" />

    <el-card v-else shadow="never" class="block">
      <template #header>
        <div class="card-head">
          <span>合琴台账</span>
          <span class="card-note">点击行左侧箭头查看返工留档</span>
        </div>
      </template>
      <el-table :data="rows" size="small" border row-key="id">
        <el-table-column type="expand">
          <template #default="scope">
            <div class="rework-panel">
              <div v-if="!scope.row.reworks.length" class="rework-empty">暂无返工记录</div>
              <el-table v-else :data="scope.row.reworks" size="small" border>
                <el-table-column type="index" label="#" width="50" />
                <el-table-column prop="reason" label="返工原因（复查离缝）" min-width="220" />
                <el-table-column prop="pressMethod" label="重压方式" width="90" />
                <el-table-column label="重压日期（养护重算起）" width="190">
                  <template #default="r">{{ formatDate(r.row.repressedAt) }}</template>
                </el-table-column>
                <el-table-column prop="operator" label="重压操作人" width="100" />
                <el-table-column prop="remark" label="备注" min-width="160" />
              </el-table>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="guqinNo" label="琴号" width="100" />
        <el-table-column label="合琴日期" width="110">
          <template #default="scope">{{ formatDate(scope.row.joinedAt) }}</template>
        </el-table-column>
        <el-table-column prop="pressMethod" label="压合方式" width="90">
          <template #default="scope">
            <el-tag :type="scope.row.pressMethod === '湿压' ? 'warning' : 'success'" size="small" effect="plain">
              {{ scope.row.pressMethod }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="operator" label="操作人" width="90" />
        <el-table-column label="压实" width="70" align="center">
          <template #default="scope">
            <el-tag :type="scope.row.compacted ? 'success' : 'danger'" size="small">{{ scope.row.compacted ? '是' : '否' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="无离缝" width="80" align="center">
          <template #default="scope">
            <el-tag :type="scope.row.noGap ? 'success' : 'danger'" size="small">{{ scope.row.noGap ? '是' : '否' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="养护 / 放行状态" min-width="260">
          <template #default="scope">
            <el-tag :type="statusTagType(scope.row)" size="small">{{ statusOf(scope.row).label }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="返工" width="70" align="center">
          <template #default="scope">
            <el-badge v-if="scope.row.reworks.length" :value="scope.row.reworks.length" type="danger">
              <el-tag size="small" effect="plain">有</el-tag>
            </el-badge>
            <span v-else class="rework-empty">无</span>
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="120" />
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="scope">
            <el-button link type="warning" @click="openRework(scope.row)">登记返工</el-button>
            <el-button link type="primary" @click="openEdit(scope.row)">编辑</el-button>
            <el-button link type="danger" @click="remove(scope.row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新增 / 编辑合琴记录 -->
    <el-dialog v-model="dialogVisible" :title="editingGuqin ? `编辑合琴记录 · ${editingGuqin}` : '新增合琴记录'" width="620px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="150px">
        <el-form-item label="琴号" prop="guqinNo">
          <el-select
            v-model="form.guqinNo"
            filterable
            allow-create
            :disabled="Boolean(editingGuqin)"
            default-first-option
            placeholder="选择或输入琴号，如 Q-2506"
            style="width: 240px"
          >
            <el-option v-for="no in guqinOptions" :key="no" :label="no" :value="no" />
          </el-select>
        </el-form-item>
        <el-form-item label="合琴日期">
          <el-date-picker v-model="form.joinedAt" type="date" value-format="YYYY-MM-DD" placeholder="选择合琴日期" />
        </el-form-item>
        <el-form-item label="压合方式">
          <el-radio-group v-model="form.pressMethod">
            <el-radio v-for="m in PRESS_METHODS" :key="m" :value="m">{{ m }}</el-radio>
          </el-radio-group>
          <div class="field-hint">湿压带压养护满 3 天才能髹漆；干压复核合格当天可继续</div>
        </el-form-item>
        <el-form-item label="合琴操作人" prop="operator">
          <el-input v-model="form.operator" placeholder="如：周砚秋" maxlength="16" style="width: 200px" />
        </el-form-item>
        <el-form-item label="压合已压实">
          <el-switch v-model="form.compacted" active-text="已压实" inactive-text="未压实" />
        </el-form-item>
        <el-form-item label="面底板无离缝">
          <el-switch v-model="form.noGap" active-text="无离缝" inactive-text="有离缝" />
          <div v-if="!form.noGap" class="field-hint danger">复查离缝请保存后点「登记返工」填写重压日期，养护将重新起算</div>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" maxlength="60" placeholder="夹具、贴合情况等" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submit">保存</el-button>
      </template>
    </el-dialog>

    <!-- 登记返工重压（旧记录保留，养护自重压日重算） -->
    <el-dialog v-model="reworkVisible" :title="`登记返工重压 · ${reworkGuqin}`" width="560px">
      <el-form ref="reworkFormRef" :model="reworkForm" :rules="reworkRules" label-width="150px">
        <el-alert type="warning" :closable="false" show-icon class="rework-alert"
          title="提交后该琴回到合琴养护：湿压自重压日起重新计满 3 天才能髹漆；原有合琴与历次返工记录均保留。" />
        <el-form-item label="返工原因" prop="reason">
          <el-input
            v-model="reworkForm.reason"
            type="textarea"
            :rows="2"
            maxlength="80"
            show-word-limit
            placeholder="如：复查发现龙池左侧离缝约 0.3mm"
          />
        </el-form-item>
        <el-form-item label="重压方式">
          <el-radio-group v-model="reworkForm.pressMethod">
            <el-radio v-for="m in PRESS_METHODS" :key="m" :value="m">{{ m }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="重压日期">
          <el-date-picker v-model="reworkForm.repressedAt" type="date" value-format="YYYY-MM-DD" placeholder="选择重压日期" />
          <div class="field-hint">养护从此日期重新起算</div>
        </el-form-item>
        <el-form-item label="重压操作人" prop="operator">
          <el-input v-model="reworkForm.operator" placeholder="如：周砚秋" maxlength="16" style="width: 200px" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="reworkForm.remark" type="textarea" :rows="2" maxlength="60" placeholder="校平、加压情况等" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="reworkVisible = false">取消</el-button>
        <el-button type="warning" @click="submitRework">登记返工</el-button>
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
}
.field-hint {
  font-size: 12px;
  color: #8a7a68;
  line-height: 1.6;
}
.field-hint.danger {
  color: #c62828;
}
.rework-panel {
  padding: 8px 16px;
  background: #faf6ef;
}
.rework-empty {
  font-size: 12px;
  color: #a3968a;
  padding: 4px 0;
}
.rework-alert {
  margin-bottom: 12px;
}
</style>
