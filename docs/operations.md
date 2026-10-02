# 生产运维与恢复手册

## 环境

- 开发与生产必须使用两个独立 Supabase 项目。
- 前端只配置 `VITE_SUPABASE_URL` 与 publishable key；禁止把 service-role key 放进浏览器环境、Git 或截图。
- 业务日期按 `Asia/Shanghai`，数据库时间戳保存 UTC。

## 首次部署

1. 在生产 Supabase 项目中按文件名顺序执行 `supabase/migrations/`。
2. 不要在生产环境执行 `supabase/seed.sql`。
3. 在 Supabase Auth 创建内部用户，认证邮箱使用 `<登录名>@auth.charmsway.internal`。
4. 在 `profiles` 写入相同用户 ID、登录名、显示姓名和固定角色。
5. 配置前端环境变量并执行 `npm run build`。
6. 用三类账号分别完成权限验收，再导入真实数据。

## 账号停用

同时将 `profiles.is_enabled` 设为 `false`，并在 Supabase Auth 后台封禁或删除对应会话。只隐藏前端入口不算停用。

## 定时任务

- 上海时间每日 00:05：`generate_daily_tasks`。
- 上海时间每日 00:20：`refresh_daily_metrics`。
- Supabase Cron 使用 UTC，因此迁移中的时间为前一日 16:05 和 16:20 UTC。
- 每天检查 Cron Job Run History；失败时可在 SQL Editor 以目标业务日期手动调用同一幂等函数。

## 备份与恢复演练

1. 确认生产套餐已启用符合机构要求的自动备份/PITR。
2. 每季度恢复最近备份到一个临时 Supabase 项目，不能覆盖生产项目。
3. 依次核对会员数、治疗数、任务数、最近到诊和当日 Dashboard 指标。
4. 使用三类测试账号执行只读、会员中心写入和护士长 D0 确认。
5. 记录恢复时间、数据截至点、差异和负责人，随后删除临时项目中的真实数据。

## 故障处理

- 页面无法读取：先确认 Supabase 状态、环境变量和 RLS，而不是临时开放表权限。
- 自动任务缺失：检查 Cron 日志，随后按缺失日期补跑；函数幂等，不会重复生成。
- Excel 部分失败：修正 `import_rows` 中的错误行后重试批次，不回滚已成功会员。
- 误新增治疗：不要直接删除关联行；将错误任务取消并通过审计记录修正原因。
