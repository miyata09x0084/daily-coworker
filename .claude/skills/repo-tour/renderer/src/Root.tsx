import React from 'react';
import {Composition} from 'remotion';
import {RepoTour} from './RepoTour';
import {sceneDuration} from './types';
import type {RepoTourProps} from './types';
import demoScenes from '../fixtures/demo-scenes.json';

export const Root: React.FC = () => {
  return (
    <Composition
      id="RepoTour"
      component={RepoTour}
      width={1920}
      height={1080}
      fps={30}
      durationInFrames={300}
      defaultProps={demoScenes as unknown as RepoTourProps}
      calculateMetadata={({props}) => ({
        fps: props.meta.fps,
        width: props.meta.width,
        height: props.meta.height,
        durationInFrames: props.scenes.reduce(
          (sum, scene) => sum + sceneDuration(scene, props.meta.fps),
          0,
        ),
      })}
    />
  );
};
