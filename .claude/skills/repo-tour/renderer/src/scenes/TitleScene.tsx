import React from 'react';
import {AbsoluteFill, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {COLORS} from '../theme';
import type {TitleVisual} from '../types';

export const TitleScene: React.FC<{visual: TitleVisual}> = ({visual}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const appear = spring({frame, fps, config: {damping: 200}});

  return (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
      <div
        style={{
          opacity: appear,
          transform: `translateY(${(1 - appear) * 40}px)`,
          textAlign: 'center',
        }}
      >
        <div style={{fontSize: 96, fontWeight: 700}}>{visual.title}</div>
        {visual.subtitle ? (
          <div style={{fontSize: 40, marginTop: 24, color: COLORS.sub}}>
            {visual.subtitle}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
