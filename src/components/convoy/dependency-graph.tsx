'use client'

import { useMemo, useCallback } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  type NodeTypes,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import dagre from '@dagrejs/dagre'

const STATUS_COLORS: Record<string, string> = {
  pending: '#52525b',
  ready: '#1e40af',
  dispatched: '#4338ca',
  running: '#ca8a04',
  completed: '#16a34a',
  failed: '#dc2626',
  cancelled: '#71717a',
  stalled: '#ea580c',
}

const EDGE_COLORS: Record<string, string> = {
  pending: '#52525b',
  ready: '#3b82f6',
  dispatched: '#6366f1',
  running: '#eab308',
  completed: '#22c55e',
  failed: '#ef4444',
  cancelled: '#71717a',
  stalled: '#f97316',
}

interface SubtaskNode {
  id: number
  title: string
  status: string
  assigned_agent_name?: string | null
  port_allocated?: number | null
}

interface DepEdge {
  from_subtask_id: number
  to_subtask_id: number
}

interface DependencyGraphProps {
  subtasks: SubtaskNode[]
  edges: DepEdge[]
}

// Custom node component
function SubtaskNodeComponent({ data }: { data: { label: string; status: string; agent: string | null; port: number | null } }) {
  const borderColor = STATUS_COLORS[data.status] || STATUS_COLORS.pending

  return (
    <div
      className="rounded-lg border-2 bg-card px-3 py-2 min-w-[140px] max-w-[200px]"
      style={{ borderColor }}
    >
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-zinc-500" />
      <div className="text-xs font-medium truncate">{data.label}</div>
      <div className="flex items-center gap-1.5 mt-1">
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{ backgroundColor: borderColor }}
        />
        <span className="text-2xs text-muted-foreground capitalize">{data.status}</span>
      </div>
      {data.agent && (
        <div className="text-2xs text-muted-foreground mt-0.5 truncate">{data.agent}</div>
      )}
      {data.port && (
        <div className="text-2xs text-muted-foreground">:{data.port}</div>
      )}
      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-zinc-500" />
    </div>
  )
}

const nodeTypes: NodeTypes = {
  subtask: SubtaskNodeComponent,
}

function layoutWithDagre(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', ranksep: 60, nodesep: 40 })

  for (const node of nodes) {
    g.setNode(node.id, { width: 180, height: 70 })
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target)
  }

  dagre.layout(g)

  return nodes.map(node => {
    const pos = g.node(node.id)
    return {
      ...node,
      position: { x: pos.x - 90, y: pos.y - 35 },
    }
  })
}

export function DependencyGraph({ subtasks, edges: depEdges }: DependencyGraphProps) {
  const { initialNodes, initialEdges } = useMemo(() => {
    const rfNodes: Node[] = subtasks.map(s => ({
      id: String(s.id),
      type: 'subtask',
      position: { x: 0, y: 0 },
      data: {
        label: s.title,
        status: s.status,
        agent: s.assigned_agent_name ?? null,
        port: s.port_allocated ?? null,
      },
    }))

    const rfEdges: Edge[] = depEdges.map((e, i) => ({
      id: `e-${i}`,
      source: String(e.from_subtask_id),
      target: String(e.to_subtask_id),
      style: {
        stroke: EDGE_COLORS[
          subtasks.find(s => s.id === e.from_subtask_id)?.status || 'pending'
        ],
        strokeWidth: 2,
      },
      animated: subtasks.find(s => s.id === e.from_subtask_id)?.status === 'running',
    }))

    const laid = layoutWithDagre(rfNodes, rfEdges)
    return { initialNodes: laid, initialEdges: rfEdges }
  }, [subtasks, depEdges])

  const [nodes, , onNodesChange] = useNodesState(initialNodes)
  const [flowEdges, , onEdgesChange] = useEdgesState(initialEdges)

  if (subtasks.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
        No subtasks to display
      </div>
    )
  }

  return (
    <div className="h-[400px] border border-border rounded-lg overflow-hidden bg-background">
      <ReactFlow
        nodes={nodes}
        edges={flowEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.3}
        maxZoom={1.5}
      >
        <Background gap={16} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
