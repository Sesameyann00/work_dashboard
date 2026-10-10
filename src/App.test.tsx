import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import App from './App'

afterEach(cleanup)

describe('Dashboard', () => {
  it('renders the primary operating sections', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: '登录系统' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('登录名'), { target: { value: '002' } })
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'Demo123!' } })
    fireEvent.change(screen.getByLabelText('演示角色'), { target: { value: 'management' } })
    fireEvent.click(screen.getByRole('button', { name: '登录' }))
    expect(screen.getByRole('heading', { name: '经营概览' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '今日执行中心' })).toBeInTheDocument()
    expect(screen.getByText('D0 护理确认')).toBeInTheDocument()
  })

  it('hides the operating dashboard from non-management roles', () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('登录名'), { target: { value: 'vip001' } })
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'Demo123!' } })
    fireEvent.click(screen.getByRole('button', { name: '登录' }))
    expect(screen.queryByRole('button', { name: '经营首页' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '今日待办', level: 2 })).toBeInTheDocument()
  })

  it('hides the operating dashboard from management account 004', () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('登录名'), { target: { value: '004' } })
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'Demo123!' } })
    fireEvent.change(screen.getByLabelText('演示角色'), { target: { value: 'management' } })
    fireEvent.click(screen.getByRole('button', { name: '登录' }))
    expect(screen.queryByRole('button', { name: '经营首页' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '数据导入' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '今日待办', level: 2 })).toBeInTheDocument()
  })

  it('gives account 001 read-only navigation', () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('登录名'), { target: { value: '001' } })
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'Demo123!' } })
    fireEvent.change(screen.getByLabelText('演示角色'), { target: { value: 'readonly' } })
    fireEvent.click(screen.getByRole('button', { name: '登录' }))
    expect(screen.queryByRole('button', { name: '经营首页' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '数据导入' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '批量处理所选' })).not.toBeInTheDocument()
  })

  it('filters the member list by creation time', () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('登录名'), { target: { value: '002' } })
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'Demo123!' } })
    fireEvent.change(screen.getByLabelText('演示角色'), { target: { value: 'management' } })
    fireEvent.click(screen.getByRole('button', { name: '登录' }))
    fireEvent.click(screen.getByRole('button', { name: '会员管理' }))
    fireEvent.change(screen.getByLabelText('按新增时间筛选'), { target: { value: 'month' } })
    expect(screen.getByText('林女士')).toBeInTheDocument()
    expect(screen.getByText('陈女士')).toBeInTheDocument()
    expect(screen.queryByText('王女士')).not.toBeInTheDocument()
  })

  it('shows full member phones only to accounts 002 and 004', () => {
    const { unmount } = render(<App />)
    fireEvent.change(screen.getByLabelText('登录名'), { target: { value: '002' } })
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'Demo123!' } })
    fireEvent.change(screen.getByLabelText('演示角色'), { target: { value: 'management' } })
    fireEvent.click(screen.getByRole('button', { name: '登录' }))
    fireEvent.click(screen.getByRole('button', { name: '会员管理' }))
    fireEvent.click(screen.getByRole('button', { name: /林女士/ }))
    expect(screen.getByText('13800000001')).toBeInTheDocument()
    unmount()

    render(<App />)
    fireEvent.change(screen.getByLabelText('登录名'), { target: { value: '001' } })
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'Demo123!' } })
    fireEvent.change(screen.getByLabelText('演示角色'), { target: { value: 'readonly' } })
    fireEvent.click(screen.getByRole('button', { name: '登录' }))
    fireEvent.click(screen.getByRole('button', { name: '会员管理' }))
    fireEvent.click(screen.getByRole('button', { name: /林女士/ }))
    expect(screen.getByText('138****0001')).toBeInTheDocument()
    expect(screen.queryByText('13800000001')).not.toBeInTheDocument()
  })

  it('lets account 002 edit every service task status', () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('登录名'), { target: { value: '002' } })
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'Demo123!' } })
    fireEvent.change(screen.getByLabelText('演示角色'), { target: { value: 'management' } })
    fireEvent.click(screen.getByRole('button', { name: '登录' }))
    fireEvent.click(screen.getByRole('button', { name: /^服务任务/ }))
    expect(screen.getByLabelText('完成 林女士 D3 回访')).toBeInTheDocument()
    expect(screen.getByLabelText('归档 林女士 D3 回访')).toBeInTheDocument()
    expect(screen.getByLabelText('取消 林女士 D3 回访')).toBeInTheDocument()
    expect(screen.getAllByRole('option', { name: '已取消' }).length).toBeGreaterThan(0)
  })

  it('shows the operation time for processed tasks', () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('登录名'), { target: { value: '002' } })
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'Demo123!' } })
    fireEvent.change(screen.getByLabelText('演示角色'), { target: { value: 'management' } })
    fireEvent.click(screen.getByRole('button', { name: '登录' }))
    fireEvent.click(screen.getByRole('button', { name: /^服务任务/ }))
    fireEvent.click(screen.getByRole('button', { name: '已完成' }))
    expect(screen.getByText('操作时间 2026-10-02 14:30')).toBeInTheDocument()
    expect(screen.getAllByText(/操作时间/)[0]).toHaveTextContent('操作时间 2026-10-05 09:15')
    expect(screen.queryByLabelText('完成 林女士 D1 回访')).not.toBeInTheDocument()
  })
})
