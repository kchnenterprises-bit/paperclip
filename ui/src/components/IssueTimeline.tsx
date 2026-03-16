/**
 * Issue Timeline Component
 * Displays a chronological timeline of all company issues
 * Shows active issues, dependencies, and status progression
 * variant=horizontal: dashboard strip — needs-attention prominent, done muted
 */

import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { Link } from '@/lib/router'
import type { Issue } from '@paperclipai/shared'
import { PriorityIcon } from './PriorityIcon'
import { cn } from '@/lib/utils'
import './IssueTimeline.css'

interface TimelineProps {
  issues: Issue[]
  isLoading?: boolean
  /** 'vertical' = full page timeline; 'horizontal' = dashboard strip; 'gantt' = scrollable E-W timeline by hour */
  variant?: 'vertical' | 'horizontal' | 'gantt'
}

const STATUS_COLORS: Record<string, string> = {
  'todo': '#3b82f6',        // blue
  'in_progress': '#f59e0b', // amber
  'blocked': '#ef4444',     // red
  'done': '#10b981',        // green
  'in_review': '#8b5cf6',   // purple
  'backlog': '#6b7280',     // gray
  'cancelled': '#9ca3af'    // light gray
}

const STATUS_LABELS: Record<string, string> = {
  'todo': 'To Do',
  'in_progress': 'In Progress',
  'blocked': 'Blocked',
  'done': 'Done',
  'in_review': 'In Review',
  'backlog': 'Backlog',
  'cancelled': 'Cancelled'
}

/**
 * Timeline Item Component
 */
const TimelineItem: React.FC<{
  issue: Issue
  isActive: boolean
  hasChildren: boolean
}> = ({ issue, isActive, hasChildren }) => {
  const [hovering, setHovering] = useState(false)

  const createdDate = new Date(issue.createdAt)
  const dateString = createdDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })

  return (
    <div
      className={`timeline-item ${isActive ? 'active' : ''} ${issue.status}`}
      style={{
        borderLeftColor: STATUS_COLORS[issue.status],
        opacity: isActive ? 1 : 0.7
      }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div className="timeline-item-header">
        <div className="timeline-item-identifier">
          <span className="timeline-item-priority-icon">
            <PriorityIcon priority={issue.priority} />
          </span>
          {issue.identifier}
        </div>
        <div className="timeline-item-date">{dateString}</div>
      </div>

      <div className="timeline-item-title">{issue.title}</div>

      <div className="timeline-item-footer">
        <span
          className="timeline-item-status"
          style={{ backgroundColor: STATUS_COLORS[issue.status] }}
        >
          {STATUS_LABELS[issue.status]}
        </span>
        {hasChildren && <span className="timeline-item-badge">+children</span>}
      </div>

      {hovering && (
        <div className="timeline-item-tooltip">
          <div className="tooltip-content">
            <div className="tooltip-title">{issue.identifier}</div>
            <div className="tooltip-subtitle">{issue.title}</div>
            <div className="tooltip-meta">
              Created: {dateString}
              <br />
              Status: {STATUS_LABELS[issue.status]}
              <br />
              Priority: {issue.priority}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const ACTIVE_STATUSES = ['todo', 'in_progress', 'blocked'] as const
function isActive(status: string): boolean {
  return ACTIVE_STATUSES.includes(status as (typeof ACTIVE_STATUSES)[number])
}

function briefTitle(title: string | null, maxWords = 3): string {
  if (!title?.trim()) return '—'
  return title.trim().split(/\s+/).slice(0, maxWords).join(' ')
}

const PX_PER_HOUR_BASE = 28
const GANTT_ROW_HEIGHT = 28
const HOURS_TICK = 6
const GANTT_VIEWPORT_MIN_HEIGHT = 400
const ZOOM_MIN = 0.25
const ZOOM_MAX = 3

/** Importance color: done/cancelled = faded gray; important = red; scale in between (for line/bar) */
function ganttStrokeClass(issue: Issue): string {
  const isFaded = issue.status === 'done' || issue.status === 'cancelled' || issue.completedAt != null
  if (isFaded) return 'bg-neutral-400 dark:bg-neutral-500 opacity-50'
  if (issue.status === 'blocked' || issue.priority === 'critical') return 'bg-destructive'
  if (issue.priority === 'high') return 'bg-orange-500 dark:bg-orange-400'
  if (issue.priority === 'medium' || issue.status === 'in_progress') return 'bg-amber-500 dark:bg-amber-400'
  return 'bg-chart-3'
}

/** Border class for dots (white center, colored ring) */
function ganttDotBorderClass(issue: Issue): string {
  const isFaded = issue.status === 'done' || issue.status === 'cancelled' || issue.completedAt != null
  if (isFaded) return 'border-neutral-400 dark:border-neutral-500'
  if (issue.status === 'blocked' || issue.priority === 'critical') return 'border-destructive'
  if (issue.priority === 'high') return 'border-orange-500 dark:border-orange-400'
  if (issue.priority === 'medium' || issue.status === 'in_progress') return 'border-amber-500 dark:border-amber-400'
  return 'border-chart-3'
}

/**
 * Main Timeline Component
 */
export const IssueTimeline: React.FC<TimelineProps> = ({ issues: issuesData, isLoading = false, variant = 'vertical' }) => {
  const [ganttStatusFilter, setGanttStatusFilter] = useState<string>('all')
  const [ganttPriorityFilter, setGanttPriorityFilter] = useState<string>('all')
  const [ganttZoom, setGanttZoom] = useState(1)
  const [ganttScrollTop, setGanttScrollTop] = useState(0)
  const [ganttViewportHeight, setGanttViewportHeight] = useState(GANTT_VIEWPORT_MIN_HEIGHT)
  const chartScrollRef = useRef<HTMLDivElement>(null)
  const labelsScrollRef = useRef<HTMLDivElement>(null)
  const ganttContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (variant !== 'gantt' || !ganttContainerRef.current) return
    const el = ganttContainerRef.current
    const ro = new ResizeObserver((entries) => {
      const height = entries[0]?.contentRect.height
      if (typeof height === 'number' && height > 0) setGanttViewportHeight(height)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [variant])

  const syncScroll = useCallback((source: 'chart' | 'labels') => {
    const chart = chartScrollRef.current
    const labels = labelsScrollRef.current
    if (!chart || !labels) return
    if (source === 'chart') labels.scrollTop = chart.scrollTop
    else chart.scrollTop = labels.scrollTop
    setGanttScrollTop(chart.scrollTop)
  }, [])

  // Sort and process issues using useMemo
  const { sorted, activeIssues, childrenMap, stats, needsAttention, done } = useMemo(() => {
    if (!issuesData) {
      return {
        sorted: [] as Issue[],
        activeIssues: new Set<string>(),
        childrenMap: new Map<string, string[]>(),
        stats: { total: 0, active: 0, completed: 0, blocked: 0 },
        needsAttention: [] as Issue[],
        done: [] as Issue[],
      }
    }

    // Sort by creation date
    const sortedList = [...issuesData].sort((a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    )

    const active = new Set<string>()
    const children = new Map<string, string[]>()
    const needs: Issue[] = []
    const doneList: Issue[] = []

    sortedList.forEach(issue => {
      if (isActive(issue.status)) {
        active.add(issue.id)
        needs.push(issue)
      } else {
        doneList.push(issue)
      }
      if (issue.parentId) {
        if (!children.has(issue.parentId)) children.set(issue.parentId, [])
        children.get(issue.parentId)!.push(issue.id)
      }
    })

    const stats = {
      total: sortedList.length,
      active: needs.length,
      completed: doneList.filter(i => i.status === 'done').length,
      blocked: needs.filter(i => i.status === 'blocked').length,
    }
    return {
      sorted: sortedList,
      activeIssues: active,
      childrenMap: children,
      stats,
      needsAttention: needs,
      done: doneList,
    }
  }, [issuesData])

  if (isLoading) {
    return <div className="timeline-container loading">Loading issues...</div>
  }

  if (!issuesData || issuesData.length === 0) {
    return (
      <div className="timeline-container">
        <div className="timeline-empty">No issues found</div>
      </div>
    )
  }

  // Dashboard: horizontal strip — needs attention prominent, done muted
  if (variant === 'horizontal') {
    return (
      <div className="w-full space-y-3">
        {needsAttention.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground mb-2">
              Needs attention ({needsAttention.length})
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-auto-hide">
              {needsAttention.map(issue => (
                <Link
                  key={issue.id}
                  to={`/issues/${issue.identifier ?? issue.id}`}
                  className={cn(
                    'shrink-0 w-52 rounded-lg border px-3 py-2.5 text-left no-underline text-inherit',
                    'transition-colors hover:bg-accent/50 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    issue.status === 'blocked' && 'border-destructive/50 bg-destructive/5',
                    issue.status === 'in_progress' && 'border-amber-500/50 dark:border-amber-400/50 bg-amber-500/10 dark:bg-amber-400/10',
                    issue.status === 'todo' && 'border-blue-500/50 dark:border-blue-400/50 bg-blue-500/5 dark:bg-blue-400/5'
                  )}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <PriorityIcon priority={issue.priority} />
                    <span className="text-xs font-mono text-muted-foreground">{issue.identifier}</span>
                  </div>
                  <p className="text-sm font-medium truncate">{issue.title}</p>
                  <span className="text-xs text-muted-foreground capitalize">{issue.status.replace('_', ' ')}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
        {done.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Done ({done.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {done.slice(0, 20).map(issue => (
                <Link
                  key={issue.id}
                  to={`/issues/${issue.identifier ?? issue.id}`}
                  className={cn(
                    'shrink-0 rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-xs no-underline text-inherit',
                    'opacity-80 hover:opacity-100 hover:bg-accent/30 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1'
                  )}
                >
                  <span className="font-mono text-muted-foreground">{issue.identifier}</span>
                  <span className="ml-1.5 truncate max-w-[120px] inline-block align-bottom">{issue.title}</span>
                </Link>
              ))}
              {done.length > 20 && (
                <span className="text-xs text-muted-foreground self-center">+{done.length - 20} more</span>
              )}
            </div>
          </div>
        )}
        {needsAttention.length === 0 && done.length === 0 && (
          <p className="text-sm text-muted-foreground">No issues</p>
        )}
      </div>
    )
  }

  // Gantt: scrollable E–W timeline; filters; wheel zoom; virtualized rows; lines with dots; done=faded gray, important=red
  if (variant === 'gantt') {
    const nowMs = Date.now()
    const pxPerHour = PX_PER_HOUR_BASE * ganttZoom
    let ganttList = [...(issuesData ?? [])].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    if (ganttStatusFilter !== 'all') ganttList = ganttList.filter(i => i.status === ganttStatusFilter)
    if (ganttPriorityFilter !== 'all') ganttList = ganttList.filter(i => i.priority === ganttPriorityFilter)
    const earliest = ganttList.length ? Math.min(...ganttList.map(i => new Date(i.createdAt).getTime())) : nowMs - 7 * 24 * 60 * 60 * 1000
    const rangeStart = new Date(earliest)
    rangeStart.setHours(0, 0, 0, 0)
    const rangeStartMs = rangeStart.getTime()
    const withEnd = ganttList.map(i => (i.completedAt ? new Date(i.completedAt).getTime() : i.cancelledAt ? new Date(i.cancelledAt).getTime() : nowMs))
    const latest = withEnd.length ? Math.max(nowMs, ...withEnd) : nowMs
    const rangeEnd = new Date(latest)
    rangeEnd.setHours(23, 59, 59, 999)
    const rangeEndMs = rangeEnd.getTime()
    const totalHours = (rangeEndMs - rangeStartMs) / (3600 * 1000)
    const totalWidth = Math.max(totalHours * pxPerHour, 800)
    const nowX = ((nowMs - rangeStartMs) / (3600 * 1000)) * pxPerHour
    const tickCount = Math.ceil(totalHours / HOURS_TICK)
    const ticks = Array.from({ length: tickCount }, (_, i) => {
      const t = rangeStartMs + i * HOURS_TICK * 60 * 60 * 1000
      const d = new Date(t)
      const day = d.toLocaleDateString('en-US', { weekday: 'short' })
      const hour = d.getHours()
      const ampm = hour === 0 ? '12am' : hour === 12 ? '12pm' : hour < 12 ? `${hour}am` : `${hour - 12}pm`
      return { x: i * HOURS_TICK * pxPerHour, label: `${day} ${ampm}` }
    })
    const totalRowsHeight = ganttList.length * GANTT_ROW_HEIGHT
    const visibleStart = Math.floor(ganttScrollTop / GANTT_ROW_HEIGHT)
    const visibleCount = Math.ceil(ganttViewportHeight / GANTT_ROW_HEIGHT) + 2
    const visibleEnd = Math.min(ganttList.length, visibleStart + visibleCount)
    const visibleIssues = ganttList.slice(visibleStart, visibleEnd)

    const handleWheel = (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        setGanttZoom(z => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z - e.deltaY * 0.002)))
      }
    }

    return (
      <div className="w-full flex flex-col gap-2 flex-1 min-h-0">
        {/* Filters + zoom hint */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</span>
          <div className="flex flex-wrap gap-1">
            {['all', 'todo', 'in_progress', 'blocked', 'done', 'cancelled'].map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setGanttStatusFilter(s)}
                className={cn(
                  'px-2 py-1 text-xs rounded-md border transition-colors',
                  ganttStatusFilter === s ? 'bg-accent border-border' : 'border-border bg-background hover:bg-accent/50'
                )}
              >
                {s === 'all' ? 'All' : s.replace('_', ' ')}
              </button>
            ))}
          </div>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide ml-2">Priority</span>
          <div className="flex flex-wrap gap-1">
            {['all', 'critical', 'high', 'medium', 'low'].map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setGanttPriorityFilter(p)}
                className={cn(
                  'px-2 py-1 text-xs rounded-md border transition-colors',
                  ganttPriorityFilter === p ? 'bg-accent border-border' : 'border-border bg-background hover:bg-accent/50'
                )}
              >
                {p === 'all' ? 'All' : p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
          <span className="text-[10px] text-muted-foreground ml-auto">Ctrl + scroll to zoom</span>
        </div>

        <div
          ref={ganttContainerRef}
          className="flex rounded-lg border border-border flex-1 min-h-[calc(100vh-14rem)] overflow-hidden"
          onWheel={handleWheel}
        >
          {/* Issue column - fixed, only scrolls vertically */}
          <div
            ref={labelsScrollRef}
            onScroll={() => syncScroll('labels')}
            className="shrink-0 w-[180px] h-full pr-2 border-r border-border bg-background overflow-y-auto overflow-x-hidden scrollbar-auto-hide"
          >
              <div className="h-8 flex items-center text-xs font-medium text-muted-foreground uppercase tracking-wide sticky top-0 bg-background z-10">
                Issue
              </div>
              <div className="relative" style={{ height: totalRowsHeight }}>
                {ganttList.slice(visibleStart, visibleEnd).map((issue, idx) => (
                  <Link
                    key={issue.id}
                    to={`/issues/${issue.identifier ?? issue.id}`}
                    className={cn(
                      'flex items-center gap-2 px-1 rounded text-xs no-underline text-inherit h-[28px]',
                      'hover:bg-accent/50 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'
                    )}
                    style={{ position: 'absolute', top: (visibleStart + idx) * GANTT_ROW_HEIGHT, left: 0, right: 0 }}
                    title={issue.title ?? ''}
                  >
                    <span className="font-mono text-muted-foreground shrink-0">{issue.identifier ?? issue.id.slice(0, 8)}</span>
                    <span className="truncate text-foreground">{briefTitle(issue.title)}</span>
                  </Link>
                ))}
              </div>
          </div>

          {/* Chart - scrolls horizontally and vertically; issue column stays fixed */}
          <div
            ref={chartScrollRef}
            onScroll={() => syncScroll('chart')}
            className="relative flex-1 min-w-0 h-full overflow-auto scrollbar-auto-hide"
          >
              <div className="relative" style={{ width: totalWidth, height: 32 + totalRowsHeight }}>
                <div className="sticky top-0 z-10 h-8 flex items-center border-b border-border bg-muted/30">
                  {ticks.map(({ x, label }) => (
                    <div key={label + x} className="absolute text-[10px] text-muted-foreground tabular-nums" style={{ left: x, transform: 'translateX(-50%)' }}>
                      {label}
                    </div>
                  ))}
                </div>
                {ticks.map(({ x }) => (
                  <div key={x} className="absolute top-8 bottom-0 w-px bg-border" style={{ left: x }} />
                ))}
                {nowX >= 0 && nowX <= totalWidth && (
                  <div className="absolute top-8 bottom-0 w-0.5 bg-primary z-20 pointer-events-none" style={{ left: nowX }}>
                    <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-medium text-primary whitespace-nowrap">Now</span>
                  </div>
                )}
                {/* Virtualized: only visible rows */}
                {visibleIssues.map((issue, idx) => {
                  const i = visibleStart + idx
                  const startMs = new Date(issue.createdAt).getTime()
                  const endMs = issue.completedAt ? new Date(issue.completedAt).getTime() : issue.cancelledAt ? new Date(issue.cancelledAt).getTime() : nowMs
                  const left = ((startMs - rangeStartMs) / (3600 * 1000)) * pxPerHour
                  const width = Math.max(8, ((endMs - startMs) / (3600 * 1000)) * pxPerHour)
                  const strokeClass = ganttStrokeClass(issue)
                  return (
                    <Link
                      key={issue.id}
                      to={`/issues/${issue.identifier ?? issue.id}`}
                      className="absolute block no-underline text-inherit outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 z-10"
                      style={{ top: 32 + i * GANTT_ROW_HEIGHT, left: 0, width: totalWidth, height: GANTT_ROW_HEIGHT }}
                      title={`${issue.identifier ?? ''} ${issue.title ?? ''} · ${issue.completedAt ? 'Closed ' + new Date(issue.completedAt).toLocaleString() : issue.cancelledAt ? 'Cancelled ' + new Date(issue.cancelledAt).toLocaleString() : 'Open'}`}
                    >
                      <div className="absolute top-1/2 -translate-y-1/2 flex items-center pointer-events-none" style={{ left, width }}>
                        <span className={cn('absolute left-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white border-2', ganttDotBorderClass(issue))} />
                        <span className={cn('absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white border-2', ganttDotBorderClass(issue))} />
                        <span className={cn('absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1.5', strokeClass)} />
                      </div>
                    </Link>
                  )
                })}
              </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="timeline-container">
      <div className="timeline-header">
        <h2>Issue Timeline</h2>
        <div className="timeline-stats">
          <span className="stat">
            <strong>{stats.total}</strong> Total
          </span>
          <span className="stat active">
            <strong>{stats.active}</strong> Active
          </span>
          <span className="stat completed">
            <strong>{stats.completed}</strong> Done
          </span>
          <span className="stat blocked">
            <strong>{stats.blocked}</strong> Blocked
          </span>
        </div>
      </div>

      <div className="timeline-legend">
        <div className="legend-item">
          <div className="legend-color" style={{ backgroundColor: STATUS_COLORS.todo }}></div>
          <span>To Do</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ backgroundColor: STATUS_COLORS.in_progress }}></div>
          <span>In Progress</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ backgroundColor: STATUS_COLORS.blocked }}></div>
          <span>Blocked</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ backgroundColor: STATUS_COLORS.done }}></div>
          <span>Done</span>
        </div>
        <div className="legend-item">
          <PriorityIcon priority="critical" />
          <span>Critical</span>
        </div>
        <div className="legend-item">
          <PriorityIcon priority="high" />
          <span>High</span>
        </div>
      </div>

      <div className="timeline">
        {sorted.map(issue => (
          <TimelineItem
            key={issue.id}
            issue={issue}
            isActive={activeIssues.has(issue.id)}
            hasChildren={childrenMap.has(issue.id)}
          />
        ))}
      </div>

      <div className="timeline-footer">
        <p>Timeline shows all issues chronologically from earliest to latest</p>
        <p>Active issues are highlighted with full opacity; completed issues are faded</p>
      </div>
    </div>
  )
}

export default IssueTimeline
