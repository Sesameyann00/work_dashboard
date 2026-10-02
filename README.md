# 千姿薇会员管理系统

React + Vite + TypeScript + Supabase 的会员服务管理系统。已实现 `plan.md` 中的 V1 页面、数据库迁移、固定角色权限、关键事务函数、定时任务、Excel 预检和验证底座。未配置 Supabase 时自动进入本地演示模式。

## 本地运行

```bash
npm install
npm run dev
```

默认访问：<http://127.0.0.1:5173/>

## 验证命令

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run db:verify
npm run build
```

端到端测试默认调用本机已安装的 Google Chrome。

## 生产接入

```bash
cp .env.example .env.local
```

填写 Supabase URL 与 publishable key 后重启开发服务器。生产部署、账号创建、Cron 和恢复步骤见 `docs/operations.md`，上线验收见 `docs/acceptance-checklist.md`。

## Supabase 数据库

- 配置：`supabase/config.toml`
- 迁移：`supabase/migrations/`
- 演示数据：`supabase/seed.sql`

`npm run db:verify` 会在一次性的本地 PostgreSQL 兼容数据库中，从零执行全部迁移和 seed，并验证表、唯一约束、跨表约束、视图与到诊统计触发器。
