import React from 'react';
import {AbsoluteFill, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {COLORS} from '../theme';
import type {DiagramNode, DiagramVisual} from '../types';

const CANVAS = {w: 1920, h: 1080};
const AREA = {x: 160, y: 240, w: 1600, h: 680};
const NODE = {w: 360, h: 150};
const EDGE_PAD = 16;

type Point = {x: number; y: number};

// reveal グループ index → 出現開始フレーム。シーン尺の前半85%を等分して割り当てる。
const appearFrame = (
  groupIndex: number,
  groupCount: number,
  durationInFrames: number,
): number =>
  Math.round((durationInFrames * 0.85 * groupIndex) / Math.max(groupCount, 1));

// ノード境界(矩形+余白)と線分の交点。エッジをノード枠の外から描くために使う。
const boundaryPoint = (from: Point, to: Point): Point => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const tx = Math.abs(dx) / (NODE.w / 2 + EDGE_PAD);
  const ty = Math.abs(dy) / (NODE.h / 2 + EDGE_PAD);
  const t = 1 / Math.max(tx, ty, 0.0001);
  return {x: from.x + dx * t, y: from.y + dy * t};
};

export const DiagramScene: React.FC<{
  visual: DiagramVisual;
  durationInFrames: number;
}> = ({visual, durationInFrames}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const cols = Math.max(...visual.nodes.map((n) => n.col)) + 1;
  const rows = Math.max(...visual.nodes.map((n) => n.row)) + 1;
  const cellW = AREA.w / cols;
  const cellH = AREA.h / rows;

  const center = (n: DiagramNode): Point => ({
    x: AREA.x + n.col * cellW + cellW / 2,
    y: AREA.y + n.row * cellH + cellH / 2,
  });

  const nodeById = Object.fromEntries(visual.nodes.map((n) => [n.id, n]));

  // reveal に含まれない要素はグループ0(最初から)扱い
  const groupOf = (id: string): number => {
    const i = visual.reveal.findIndex((group) => group.includes(id));
    return i === -1 ? 0 : i;
  };

  const opacityOf = (id: string): number => {
    const start = appearFrame(
      groupOf(id),
      visual.reveal.length,
      durationInFrames,
    );
    return spring({
      frame: Math.max(0, frame - start),
      fps,
      config: {damping: 200},
    });
  };

  return (
    <AbsoluteFill>
      {visual.caption ? (
        <div
          style={{
            position: 'absolute',
            top: 90,
            left: 0,
            right: 0,
            textAlign: 'center',
            fontSize: 52,
            fontWeight: 700,
          }}
        >
          {visual.caption}
        </div>
      ) : null}
      <svg
        width={CANVAS.w}
        height={CANVAS.h}
        style={{position: 'absolute', inset: 0}}
      >
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="8"
            markerHeight="8"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L8,4 L0,8 z" fill={COLORS.sub} />
          </marker>
        </defs>
        {visual.edges.map((edge) => {
          const fromNode = nodeById[edge.from];
          const toNode = nodeById[edge.to];
          if (!fromNode || !toNode) {
            return null;
          }
          const a = center(fromNode);
          const b = center(toNode);
          const start = boundaryPoint(a, b);
          const end = boundaryPoint(b, a);
          const opacity = opacityOf(`${edge.from}-${edge.to}-edge`);
          return (
            <g key={`${edge.from}-${edge.to}`} opacity={opacity}>
              <line
                x1={start.x}
                y1={start.y}
                x2={end.x}
                y2={end.y}
                stroke={COLORS.sub}
                strokeWidth={5}
                markerEnd="url(#arrow)"
              />
              {edge.label ? (
                <text
                  x={(start.x + end.x) / 2}
                  y={(start.y + end.y) / 2 - 16}
                  fill={COLORS.sub}
                  fontSize={30}
                  textAnchor="middle"
                >
                  {edge.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      {visual.nodes.map((node) => {
        const c = center(node);
        const opacity = opacityOf(node.id);
        return (
          <div
            key={node.id}
            style={{
              position: 'absolute',
              left: c.x - NODE.w / 2,
              top: c.y - NODE.h / 2,
              width: NODE.w,
              height: NODE.h,
              background: COLORS.panel,
              border: `3px solid ${COLORS.accent}`,
              borderRadius: 20,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 6,
              opacity,
              transform: `scale(${0.9 + 0.1 * opacity})`,
            }}
          >
            {node.emoji ? <div style={{fontSize: 48}}>{node.emoji}</div> : null}
            <div style={{fontSize: 34, fontWeight: 700}}>{node.label}</div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
