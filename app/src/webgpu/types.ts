/// <reference types="@webgpu/types" />

export interface Stats {
    generation: number;
    isRunning: boolean;
    speed: number;
    width: number;
    height: number;
    liveCells: number;
}

export interface Pipelines {
    msgStage1Pipeline: GPUComputePipeline;
    msgStage2Pipeline: GPUComputePipeline;
    msgStage3aPipeline: GPUComputePipeline;
    msgStage3bPipeline: GPUComputePipeline;
    moveClearPipeline: GPUComputePipeline;
    moveProposePipeline: GPUComputePipeline;
    moveApplyPipeline: GPUComputePipeline;
    energyDiffusePipeline: GPUComputePipeline;
    energyPostPipeline: GPUComputePipeline;
    lifePipeline: GPUComputePipeline;
}


