# 古琴斫制工序记录台（gbguqin）

面向斫琴师与琴坊档案员：把面板底板材、槽腹尺寸、合琴压合（含湿压养护与离缝返工）、灰胎髹漆遍次与上弦记录串成可回溯的工序档案；音色评价只用文字填写，不做音频文件与波形处理。纯前端单页应用，数据全部保存在浏览器本地，不依赖任何后端服务或外部接口。

## Docker 一键启动

```bash
cp .env.example .env
docker compose up -d --build
```

启动后访问：<http://localhost:21810>

停止并清理：

```bash
docker compose down
```

## 技术栈

| 层次 | 选型 |
| --- | --- |
| 框架 | Vue 3 + TypeScript（`<script setup>`） |
| 构建 | Vite 6（`npm run build` 含 `vue-tsc --noEmit` 类型检查） |
| UI | Element Plus 2 |
| 路由 | Vue Router 4（6 条业务路由 + 404） |
| 状态 | Pinia（boardStore / chamberStore / joinStore / lacquerStore / stringingStore） |
| 存储 | IndexedDB（Dexie，库名 `gbguqin-db`） |
| 托管 | nginx:alpine（多阶段构建，SPA try_files + gzip） |

## 本地开发

```bash
cd frontend
npm install
npm run dev      # http://localhost:21810
npm run build    # 类型检查 + 生产构建
```

## 目录结构

```
.
├── docker-compose.yml         # 顶层 name / COMPOSE_PROJECT_NAME 容器名 / 端口映射
├── .env.example               # COMPOSE_PROJECT_NAME、FRONTEND_PORT
├── frontend/
│   ├── Dockerfile             # node:20-alpine 构建 → nginx:alpine 托管
│   ├── nginx.conf             # try_files SPA 回退 + gzip
│   ├── public/favicon.svg
│   └── src/
│       ├── types/             # wood-board / sound-chamber / join / lacquer-layer / stringing（+ ui.ts）
│       ├── stores/            # boardStore / chamberStore / joinStore / lacquerStore / stringingStore
│       ├── components/common/ # DimensionChart / LayerStack / ToneTextEditor / FilterBar / StatBadge / ProcessTimeline / EmptyPanel
│       ├── hooks/             # useGuqinFilter / useStageProgress
│       ├── pages/             # WorkshopBoard / BoardList / ChamberEditor / JoinLedger / LacquerLedger / StringingLog（+ NotFound）
│       ├── router/index.ts    # 路由表
│       └── utils/             # layer.ts / join.ts / db.ts / export.ts（+ wood.ts / seed.ts / id.ts）
```

## 功能与路由

| 路由 | 页面 | 说明 |
| --- | --- | --- |
| `/` | 琴坯进度 | 选材/掏膛/合琴/灰胎/上弦五阶段统计、推进比、缺失项与工序动态；未合琴或湿压养护未满 3 天时后续工序不显示完成 |
| `/boards` | 板材登记与配对 | 面板底板配对、含水率回显、厚度差、槽腹剖面标注 |
| `/chambers` | 槽腹尺寸记录 | 纳音/龙池/凤沼三处厚度、槽腹深度、天地柱与龙池凤沼尺寸，SVG 剖面标注 |
| `/joins` | 合琴记录 | 合琴日期、湿压/干压与操作人，压实与离缝复核；湿压养护满 3 天放行髹漆，复查离缝登记重压返工（旧记录保留、养护重算） |
| `/lacquer` | 灰胎髹漆遍次 | 按遍次累加厚度、荫房温湿度窗口校验、层积条与养护天数；合琴未放行时禁止追加遍次 |
| `/stringing` | 上弦与音色评价 | 散音/按音/泛音三段纯文本评语、九德简述、缺陷标记与版本对照 |

## 数据存储说明

- 全部数据存于浏览器 IndexedDB（Dexie，库名 `gbguqin-db`），表：`boards`、`chambers`、`joins`、`lacquers`、`stringings`、`meta`。
- `db.version(1)` 建表声明索引；`db.version(2).upgrade(...)` 为髹漆表增加 `[guqinNo+seq]` 复合索引并回填历史厚度；`db.version(3)` 新增 `joins` 合琴记录表。升级前可用顶栏「导出备份」导出全量 JSON。
- 合琴工艺规则：湿压带压养护满 3 天方可开始髹漆，干压复核合格当天即可；返工重压后养护自重压日期重新起算，初次合琴与历次返工记录均保留。
- 首次打开且表为空时写入一批示例工序档案（`src/utils/seed.ts`）。
- 容器无状态：不使用数据库服务、不挂载命名卷，`docker compose down` 后数据仍留在浏览器中。
