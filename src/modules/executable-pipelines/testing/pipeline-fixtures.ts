import type { ExecutablePipelineDefinition } from '../contracts/pipeline-contracts';

export function createTextPipelineFixture(): ExecutablePipelineDefinition {
  return {
    schemaVersion: 1,
    inputs: {
      topic: {
        kind: 'text',
        required: true,
      },
    },
    nodes: [
      {
        id: 'normalize',
        handlerType: 'text.normalize',
        handlerVersion: '1',
        config: {},
        inputs: {
          text: {
            source: 'pipeline-input',
            inputKey: 'topic',
          },
        },
      },
      {
        id: 'suffix',
        handlerType: 'text.affix',
        handlerVersion: '1',
        config: {
          affix: '!',
          position: 'suffix',
        },
        inputs: {
          text: {
            source: 'node-output',
            nodeId: 'normalize',
            outputKey: 'text',
          },
        },
      },
      {
        id: 'prefix',
        handlerType: 'text.affix',
        handlerVersion: '1',
        config: {
          affix: 'Topic: ',
          position: 'prefix',
        },
        inputs: {
          text: {
            source: 'node-output',
            nodeId: 'normalize',
            outputKey: 'text',
          },
        },
      },
      {
        id: 'join',
        handlerType: 'text.join',
        handlerVersion: '1',
        config: {
          separator: ' | ',
        },
        inputs: {
          left: {
            source: 'node-output',
            nodeId: 'prefix',
            outputKey: 'text',
          },
          right: {
            source: 'node-output',
            nodeId: 'suffix',
            outputKey: 'text',
          },
        },
      },
    ],
    outputs: {
      text: {
        nodeId: 'join',
        outputKey: 'text',
      },
    },
  };
}

export function createPipelineRunFixture() {
  return {
    id: 'run-1',
    workspaceId: 'workspace-1',
    pipelineId: 'pipeline-1',
    pipelineVersion: 1,
    sourceApplication: 'test-app',
    idempotencyKey: 'request-1',
    requestFingerprint: 'fingerprint-1',
    input: { topic: 'pipelines' },
    maxAttempts: 3,
  };
}
