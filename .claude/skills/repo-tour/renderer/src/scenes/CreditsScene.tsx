import React from 'react';
import {AbsoluteFill} from 'remotion';
import {COLORS} from '../theme';
import type {CreditsVisual, Meta} from '../types';

export const CreditsScene: React.FC<{
  visual: CreditsVisual;
  meta: Meta;
}> = ({visual, meta}) => {
  return (
    <AbsoluteFill
      style={{justifyContent: 'center', alignItems: 'center', gap: 28}}
    >
      <div style={{fontSize: 56, fontWeight: 700}}>
        ご視聴ありがとうございました
      </div>
      {/* クレジット表記。meta から自動描画し、消し忘れを構造的に防ぐ */}
      {meta.tts.credit ? (
        <div style={{fontSize: 36, color: COLORS.sub}}>{meta.tts.credit}</div>
      ) : null}
      {(visual.extraLines ?? []).map((line) => (
        <div key={line} style={{fontSize: 30, color: COLORS.sub}}>
          {line}
        </div>
      ))}
    </AbsoluteFill>
  );
};
