import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Series,
  interpolate,
  staticFile,
  useCurrentFrame,
} from 'remotion';
import {loadFont} from '@remotion/google-fonts/NotoSansJP';
import {COLORS} from './theme';
import {sceneDuration} from './types';
import type {Meta, RepoTourProps, Scene} from './types';
import {TitleScene} from './scenes/TitleScene';
import {DiagramScene} from './scenes/DiagramScene';
import {StoryScene} from './scenes/StoryScene';
import {CreditsScene} from './scenes/CreditsScene';

const {fontFamily} = loadFont('normal', {
  weights: ['400', '700'],
  subsets: ['latin', 'japanese'],
});

const FadeIn: React.FC<{children: React.ReactNode}> = ({children}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 8], [0, 1], {
    extrapolateRight: 'clamp',
  });
  return <AbsoluteFill style={{opacity}}>{children}</AbsoluteFill>;
};

const SceneView: React.FC<{
  scene: Scene;
  meta: Meta;
  durationInFrames: number;
}> = ({scene, meta, durationInFrames}) => {
  switch (scene.type) {
    case 'title':
      return <TitleScene visual={scene.visual} />;
    case 'diagram':
      return (
        <DiagramScene visual={scene.visual} durationInFrames={durationInFrames} />
      );
    case 'story':
      return (
        <StoryScene visual={scene.visual} durationInFrames={durationInFrames} />
      );
    case 'credits':
      return <CreditsScene visual={scene.visual} meta={meta} />;
  }
};

export const RepoTour: React.FC<RepoTourProps> = ({meta, scenes}) => {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.bg,
        color: COLORS.text,
        fontFamily: `'${fontFamily}', 'Hiragino Sans', sans-serif`,
      }}
    >
      <Series>
        {scenes.map((scene) => {
          const duration = sceneDuration(scene, meta.fps);
          return (
            <Series.Sequence key={scene.id} durationInFrames={duration}>
              <FadeIn>
                <SceneView
                  scene={scene}
                  meta={meta}
                  durationInFrames={duration}
                />
              </FadeIn>
              {scene.audioFile ? (
                <Audio src={staticFile(scene.audioFile)} />
              ) : null}
            </Series.Sequence>
          );
        })}
      </Series>
    </AbsoluteFill>
  );
};
