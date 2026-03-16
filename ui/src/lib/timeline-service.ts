/**
 * Timeline Data Service
 * Fetches and processes issue data for timeline visualization
 */

export interface TimelineIssue {
  id: string
  identifier: string
  title: string
  status: 'todo' | 'in_progress' | 'done' | 'blocked' | 'in_review' | 'backlog' | 'cancelled'
  priority: 'critical' | 'high' | 'medium' | 'low'
  createdAt: string
  updatedAt: string
  parentId?: string
  assigneeAgentId?: string
  project?: {
    id: string
    name: string
  }
}

export interface DependencyNode {
  issueId: string
  parentId?: string
  childIds: string[]
  blockedByIds: string[]
}

export interface TimelineData {
  issues: TimelineIssue[]
  dependencyMap: Map<string, DependencyNode>
  activeIssues: TimelineIssue[]
  timelineMetrics: {
    totalIssues: number
    activeIssueCount: number
    completedIssueCount: number
    blockedIssueCount: number
    dateRange: {
      start: string
      end: string
    }
  }
}

/**
 * Fetch all issues from Paperclip API
 */
export async function fetchAllIssues(companyId: string, apiUrl: string, apiKey: string): Promise<TimelineIssue[]> {
  const response = await fetch(`${apiUrl}/api/companies/${companyId}/issues`, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch issues: ${response.statusText}`)
  }

  const issues = await response.json()
  return issues as TimelineIssue[]
}

/**
 * Build dependency graph from issues
 */
export function buildDependencyMap(issues: TimelineIssue[]): Map<string, DependencyNode> {
  const dependencyMap = new Map<string, DependencyNode>()

  issues.forEach(issue => {
    if (!dependencyMap.has(issue.id)) {
      dependencyMap.set(issue.id, {
        issueId: issue.id,
        parentId: issue.parentId,
        childIds: [],
        blockedByIds: []
      })
    }
  })

  issues.forEach(issue => {
    if (issue.parentId) {
      const parent = dependencyMap.get(issue.parentId)
      if (parent) {
        parent.childIds.push(issue.id)
      }
    }
  })

  return dependencyMap
}

/**
 * Filter active issues (in progress, to-do, blocked)
 */
export function getActiveIssues(issues: TimelineIssue[]): TimelineIssue[] {
  return issues.filter(issue =>
    ['todo', 'in_progress', 'blocked'].includes(issue.status)
  )
}

/**
 * Calculate timeline metrics
 */
export function calculateMetrics(issues: TimelineIssue[]) {
  const activeIssues = getActiveIssues(issues)
  const completedIssues = issues.filter(i => i.status === 'done')
  const blockedIssues = issues.filter(i => i.status === 'blocked')

  const dates = issues
    .map(i => new Date(i.createdAt).getTime())
    .filter(d => !isNaN(d))

  return {
    totalIssues: issues.length,
    activeIssueCount: activeIssues.length,
    completedIssueCount: completedIssues.length,
    blockedIssueCount: blockedIssues.length,
    dateRange: {
      start: dates.length > 0 ? new Date(Math.min(...dates)).toISOString() : new Date().toISOString(),
      end: dates.length > 0 ? new Date(Math.max(...dates)).toISOString() : new Date().toISOString()
    }
  }
}

/**
 * Process and prepare timeline data
 */
export async function prepareTimelineData(
  companyId: string,
  apiUrl: string,
  apiKey: string
): Promise<TimelineData> {
  const issues = await fetchAllIssues(companyId, apiUrl, apiKey)

  const sortedIssues = [...issues].sort((a, b) =>
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  )

  const dependencyMap = buildDependencyMap(sortedIssues)
  const activeIssues = getActiveIssues(sortedIssues)
  const metrics = calculateMetrics(sortedIssues)

  return {
    issues: sortedIssues,
    dependencyMap,
    activeIssues,
    timelineMetrics: metrics
  }
}

/**
 * Get issue hierarchy level (depth in parent chain)
 */
export function getIssueHierarchyLevel(
  issueId: string,
  dependencyMap: Map<string, DependencyNode>
): number {
  let level = 0
  let current = dependencyMap.get(issueId)

  while (current?.parentId) {
    level++
    current = dependencyMap.get(current.parentId)
  }

  return level
}

/**
 * Get all descendant issues
 */
export function getDescendants(
  issueId: string,
  dependencyMap: Map<string, DependencyNode>
): string[] {
  const descendants: string[] = []
  const queue = [issueId]

  while (queue.length > 0) {
    const currentId = queue.shift()!
    const node = dependencyMap.get(currentId)

    if (node) {
      descendants.push(...node.childIds)
      queue.push(...node.childIds)
    }
  }

  return descendants
}
