# 光伏电站设计与校核工作台

一个前后端一体的光伏电站设计辅助工具：组串电气校核、直流电缆选型与压降校核、阵列排布与阴影间距计算、
发电量估算，配上可扩展的组件库与逆变器库。

项目**不依赖任何第三方 npm 包**，全部使用 Node 内置能力（`node:http`、`node:fs`、`node:test`），
clone 后即可直接运行和测试。

## 运行

```bash
npm start
```

打开 `http://localhost:5174`。前端通过 HTTP API 与后端交互，页面右上角会显示接口在线状态。
端口可通过环境变量覆盖，例如 `PORT=8080 npm start`。

## 测试

```bash
npm test
```

测试分四层：

- `test/pv-math.test.js`：温度修正、串联数区间、每路并联上限、八项电气校核判定
- `test/cable.test.js`：回路电阻、直流压降与线损、2%/3% 两档判定、截面反推与标准规格上靠
- `test/layout.test.js`：冬至日太阳高度角、阴影长度、排距、场地排布与容量
- `test/yield.test.js`：首年发电量、逐年衰减、总发电量与等效利用小时
- `test/catalog.test.js`：自定义库读写、组件与逆变器字段校验
- `test/api.test.js`：启动真实 HTTP 服务，验证健康检查、目录增删、四类设计计算与错误处理

## 目录结构

```text
server.mjs              HTTP 服务：静态资源 + JSON API
index.html              工作台页面
styles/main.css         页面样式
src/pv-math.js          组串电气校核核心计算
src/cable.js            直流电缆压降、线损与截面反推
src/layout.js           阵列排布与阴影间距
src/yield.js            发电量估算
src/catalogs.js         内置组件库与逆变器库
src/catalog-schema.js   自定义条目的字段口径
src/store.js            自定义库持久化
src/validate.js         参数取值校验
src/format.js           数值与单位格式化
src/api.js              前端接口封装
src/state.js            前端运行时状态
src/components/         结果面板与排布示意图
data/catalog.json       用户新增的组件/逆变器
test/                   单元测试与接口测试
```

## API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 服务健康检查 |
| GET | `/api/catalog` | 返回内置与自定义的组件、逆变器 |
| POST | `/api/catalog/modules` | 新增自定义组件，body 为组件参数字段 |
| DELETE | `/api/catalog/modules/:id` | 删除自定义组件；内置组件不可删除 |
| POST | `/api/catalog/inverters` | 新增自定义逆变器 |
| DELETE | `/api/catalog/inverters/:id` | 删除自定义逆变器；内置条目不可删除 |
| POST | `/api/design/electric` | 组串电气校核，body 为 `{ moduleId, inverterId, seriesPerString, stringsPerMppt, mpptUsed, minCellTemp, maxCellTemp }` |
| POST | `/api/design/layout` | 阵列排布与阴影间距，body 为 `{ moduleId, latitude, tiltDeg, siteWidthMm, siteDepthMm, gapMm }` |
| POST | `/api/design/energy` | 发电量估算，body 为 `{ capacityKw, peakSunHours, performanceRatio, years, firstYearDegradation, annualDegradation }` |
| POST | `/api/design/cable` | 直流电缆选型，body 为 `{ cableLengthM, stringVoltage, stringCurrent, conductorMaterial, conductorArea, allowedDropPercent }`，材质取 `cu`/`al`，缺省铜芯 |

所有 POST 接口在参数缺失时按默认值处理，参数越界、组件或逆变器不存在、使用路数超过 MPPT 路数等情况返回 `400` 与中文错误说明。

## 计算口径

**温度修正**采用线性温度系数模型：`X(T) = X_stc × (1 + k/100 × (T − 25))`。
工作电流的温度修正沿用短路电流温度系数，量级偏保守。

**组串电气校核**共八项判定，分为错误级与提示级：

1. 极端低温开路电压 ≤ 逆变器最大直流输入电压
2. 极端高温工作电压 ≥ MPPT 下限电压
3. 极端低温工作电压 ≤ MPPT 上限电压
4. 每路工作电流（工作电流 × 每路组串数）≤ 每路最大工作电流
5. 每路短路电流（短路电流 × 每路组串数）≤ 每路最大短路电流
6. 直流侧装机容量 ≤ 逆变器最大直流输入功率
7. 容配比 ≤ 1.5（提示级）
8. 容配比 ≥ 1.0（提示级）

前六项任一不通过即为不通过；后两项只给提示。建议串联数区间由第 1–3 项共同决定。

**直流电缆选型**按组串到逆变器的两极回路建模，回路长度取单程长度的 2 倍：

```text
回路电阻 R = ρ × 2L / A
直流压降 ΔV = I × R
压降百分比 = ΔV / V × 100%
线损功率 P = I² × R = ΔV × I
反推截面 A ≥ ρ × 2L × I / (V × 允许压降比例)
```

电阻率按导体 90℃ 工作温度取值（铜 0.0225、铝 0.0360 Ω·mm²/m，含绞合与接触裕量），
比 20℃ 铭牌电阻率略高，选型偏保守。压降低于 2% 判合格，2%–3% 给提示，超过 3% 判不通过；
按允许压降反推时给出理论最小截面，并上靠到 1.5–400 mm² 的标准规格，标准系列内无解时
提示缩短路径或提高工作电压。

**排布与阴影**采用「冬至日正午不遮挡」口径：

```text
太阳高度角 α = 90° − |纬度| − 23.45°
阵列顶端高度 h = 组件长度 × sin(倾角)
阴影长度 s = h / tan(α)
排距 D = 组件长度 × cos(倾角) + s
排数 = floor((场地进深 − 单排水平投影) / 排距) + 1
```

**发电量**按首年发电量扣减首年衰减，此后按固定衰减率逐年递减：

```text
E1 = 装机容量 × 峰值日照小时数 × 365 × PR × (1 − 首年衰减)
En = E1 × (1 − 逐年衰减)^(n−1)
```

## 自定义库

页面下拉框里的条目来自内置库加 `data/catalog.json`。通过 `POST /api/catalog/modules`
或 `POST /api/catalog/inverters` 新增的条目会写入该文件，重启后仍然存在。

组件字段范围：峰值功率 100–1000 W、开路电压 20–80 V、工作电压 15–70 V、短路/工作电流 5–30 A、
电压温度系数 −0.6–−0.05 %/℃、电流温度系数 0–0.15 %/℃、峰值功率温度系数 −0.6–−0.05 %/℃、
长度 500–3000 mm、宽度 400–2000 mm、效率 10–30%。

逆变器字段范围：额定交流输出 0.5–500 kW、最大直流输入功率 0.5–1000 kW、最大直流输入电压
100–1500 V、MPPT 上下限与启动电压 50–1500 V、MPPT 路数 1–24 路、每路最大工作电流 5–100 A、
每路最大短路电流 5–200 A。

## 已知边界

- 阴影计算只覆盖冬至日正午时刻，尚未支持 9:00–15:00 时段不遮挡、地形起伏与周边遮挡物。
- 发电量估算使用单一峰值日照小时数与系统效率，不区分逐时辐照、温度损失与光谱修正。
- 电气校核按「一台逆变器 + 若干路 MPPT」建模，暂不支持多台逆变器并联拓扑。
- 排布按矩形规则阵列计算，不处理异形场地、避让区与多朝向混合布置。
- 电缆校核按单路组串到逆变器的两极回路建模，不含汇流箱后的主干线、交流侧电缆与载流量/短路热稳定校核；电阻率统一按 90℃ 取值，未按实际环境温度逐档修正。
