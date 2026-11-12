# ADX每日榜单自动同步

## 入口

既有ADX每日10:30任务在采集后运行：

```sh
cd /Users/xiaoqiao/workbench
npx tsx scripts/sync-adx-daily.ts --owner <工作台所有者UUID> --root /Users/xiaoqiao/Desktop/ADX每日监测
```

统一入口先发布首页日报/采集状态，再发布原始日榜；即使第一步失败，也尝试第二步。检查退出码，非零表示有步骤失败。加`--dry-run`只预检，不写数据库。不使用独立新定时任务，不在客户端暴露服务端密钥。

## 用户使用

市场看板上方「ADX日榜自动同步」显示最近成功数据日、榜单数、原始记录数和Top50样本数；最近一次登录失败或同步失败单独提示，历史成功数据保留。「查看最新日榜」先更新目录，再切换日榜。状态在页面打开、回到页面及可见时每5分钟检查；不强制跳转或覆盖编辑中的笔记。

重点作品展开后默认展示每日记录，可选最近7/14/30天；月度记录可展开查看。日榜只与日榜比，月榜只与月榜比。作品名和剧场号一致才自动关联，新增数据不自动改变人工笔记或追踪状态，也不会把所有榜单作品强制加入重点名单。

## 输入约定

每次运行目录保留`采集清单.json`和`标准化数据.json`，结构沿用11月9日、10日已验证采集产物。

- 清单：`data_date`、实际总数`actual_records`、完成状态`status`、带时区时间或`generated_at_shanghai`、`boards`。
- 各榜：`name`、`actual`、`data_date`、`sort`、`status`（success或partial_source_shortfall）、`filters`（extra_filters、merge_same_drama、only_new_drama均false），可附`note`。
- 标准化数据：`data_date`、`rows`；每行有board、rank、title、tags、sort、channel、数值指标、source_url、captured_at及raw原始字段。排名从1连续，指标为有限非负数或null，0不改为空，缺失不补0。

已完成批次可以包含尚未发布的榜单：必须显式记录`status=awaiting_source_publication`、`actual=0`、`data_date/sort/filters=null`、正确的`requested_data_date`及非空原因。缺榜不能夹带任何标准化行，不能伪造空表或写入旧日数据；其余通过完整校验的榜单可同期发布，页面明确显示缺榜。全部榜单无数据时不作为成功批次发布。

日期、条数、排序、筛选、榜单身份或排名校验不通过时整批不写入；试跑只保留本地。原始行不先筛AI，保存采集时间、筛选、排序、备注、校验和及原始页面字段。分析按每榜Top50执行，不在榜外补齐AI条数；“待核验/异常”源表不产生确定跨期判断。

## 持久化与恢复

日榜保存在现有`market_data_imports`，来源`ADX自动日榜`，数据日期用ISO日。每个批次的榜单一次upsert，重复执行只写变化项；新批次不会删除旧批次，最新采集时间版本参与分析。

同步状态使用`ADX同步:run`专用来源，记录最新尝试和最近成功批次；读取接口继承市场模块工作区权限。无需改表或迁移已有项目数据。已有研判存档、重点作品笔记不由同步脚本写入。

任务仍依赖当前电脑和有效ADX登录；电脑未运行、源站日期未发布或登录失效时不产生新数据。恢复登录并完成采集后，任务执行统一同步入口即可，不需要人工上传Excel。未来定时运行是否成功，以任务退出码与页面同步状态为准。
