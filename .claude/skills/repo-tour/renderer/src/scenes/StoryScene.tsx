import React from 'react';
import {
  AbsoluteFill,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
} from 'remotion';
import {COLORS} from '../theme';
import type {KenBurns, StoryVisual} from '../types';

// Ken Burns プリセット。静止画にゆっくりした動きを与え、物語の時間経過を演出する。
const kenBurnsTransform = (kind: KenBurns, progress: number): string => {
  switch (kind) {
    case 'zoom-in':
      return `scale(${1 + 0.08 * progress})`;
    case 'zoom-out':
      return `scale(${1.08 - 0.08 * progress})`;
    case 'pan-left':
      return `scale(1.1) translateX(${3 - 6 * progress}%)`;
    case 'pan-right':
      return `scale(1.1) translateX(${-3 + 6 * progress}%)`;
  }
};

export const StoryScene: React.FC<{
  visual: StoryVisual;
  durationInFrames: number;
}> = ({visual, durationInFrames}) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill>
      {visual.imageFile ? (
        <Img
          src={staticFile(visual.imageFile)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: kenBurnsTransform(visual.kenBurns, progress),
          }}
        />
      ) : (
        // 画像未生成時のプレースホルダ。生成前のプレビュー(絵コンテ確認)に使う。
        <AbsoluteFill
          style={{
            background: `linear-gradient(135deg, ${COLORS.panel}, ${COLORS.bg})`,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              color: COLORS.sub,
              fontSize: 36,
              maxWidth: '70%',
              textAlign: 'center',
            }}
          >
            {visual.imagePrompt ?? '(画像プレースホルダ)'}
          </div>
        </AbsoluteFill>
      )}
      {visual.caption ? (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            padding: '28px 64px',
            background: 'rgba(15, 23, 42, 0.72)',
            fontSize: 44,
          }}
        >
          {visual.caption}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
