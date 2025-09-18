/// <reference types="@webgpu/types" />
import type { Pipelines } from './types'
import type { CoreBuffers, UniformBuffers } from './buffers'

export interface BindGroups {
    bgMsg1: GPUBindGroup;
    bgMsg2: GPUBindGroup;
    bgMsg3a: GPUBindGroup;
    bgMsg3b: GPUBindGroup;
    bgMoveClear: GPUBindGroup;
    bgMovePropose: GPUBindGroup;
    bgMoveApply: GPUBindGroup;
    bgEnergyDiffuse: GPUBindGroup;
    bgEnergyPost: GPUBindGroup;
    bgLife: GPUBindGroup;
}

export function createBindGroups(
    device: GPUDevice,
    pipelines: Pipelines,
    buffers: CoreBuffers & UniformBuffers,
): BindGroups {
    const {
        messagingUniformBuffer, movementUniformBuffer, energyUniformBuffer, lifeUniformBuffer,
        aliveInBuffer, aliveMidBuffer, aliveNextBuffer,
        energySrcBuffer, energyDstBuffer, sourceMapBuffer,
        msgOutBuffer, msgLastBuffer, inbox0Buffer, inbox1Buffer, energyScentBuffer,
        learnedMsgStage1Buffer, learnedMsgStage3Buffer,
        lastPosBuffer, intentHashBuffer, ppoActionsBuffer,
        deadEnergyBuffer, ageInBuffer, ageOutBuffer,
    } = buffers;

    const bgMsg1 = device.createBindGroup({
        layout: pipelines.msgStage1Pipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: messagingUniformBuffer } },
            { binding: 1, resource: { buffer: aliveInBuffer } },
            { binding: 2, resource: { buffer: energySrcBuffer } },
            { binding: 3, resource: { buffer: msgOutBuffer } },
            { binding: 4, resource: { buffer: msgLastBuffer } },
            { binding: 8, resource: { buffer: learnedMsgStage1Buffer } },
        ],
    });

    const bgMsg2 = device.createBindGroup({
        layout: pipelines.msgStage2Pipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: messagingUniformBuffer } },
            { binding: 3, resource: { buffer: msgOutBuffer } },
            { binding: 5, resource: { buffer: inbox0Buffer } },
            { binding: 7, resource: { buffer: energyScentBuffer } },
            { binding: 10, resource: { buffer: deadEnergyBuffer } },
        ],
    });

    const bgMsg3a = device.createBindGroup({
        layout: pipelines.msgStage3aPipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: messagingUniformBuffer } },
            { binding: 1, resource: { buffer: aliveInBuffer } },
            { binding: 2, resource: { buffer: energySrcBuffer } },
            { binding: 3, resource: { buffer: msgOutBuffer } },
            { binding: 9, resource: { buffer: learnedMsgStage3Buffer } },
        ],
    });

    const bgMsg3b = device.createBindGroup({
        layout: pipelines.msgStage3bPipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: messagingUniformBuffer } },
            { binding: 3, resource: { buffer: msgOutBuffer } },
            { binding: 6, resource: { buffer: inbox1Buffer } },
        ],
    });

    const bgMoveClear = device.createBindGroup({
        layout: pipelines.moveClearPipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: movementUniformBuffer } },
            { binding: 7, resource: { buffer: intentHashBuffer } },
        ],
    });

    const bgMovePropose = device.createBindGroup({
        layout: pipelines.moveProposePipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: movementUniformBuffer } },
            { binding: 1, resource: { buffer: aliveInBuffer } },
            { binding: 3, resource: { buffer: energySrcBuffer } },
            { binding: 4, resource: { buffer: inbox1Buffer } },
            { binding: 5, resource: { buffer: energyScentBuffer } },
            { binding: 7, resource: { buffer: intentHashBuffer } },
            { binding: 8, resource: { buffer: ppoActionsBuffer } },
        ],
    });

    const bgMoveApply = device.createBindGroup({
        layout: pipelines.moveApplyPipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: movementUniformBuffer } },
            { binding: 1, resource: { buffer: aliveInBuffer } },
            { binding: 2, resource: { buffer: aliveMidBuffer } },
            { binding: 3, resource: { buffer: energySrcBuffer } },
            { binding: 6, resource: { buffer: lastPosBuffer } },
            { binding: 7, resource: { buffer: intentHashBuffer } },
            { binding: 8, resource: { buffer: ppoActionsBuffer } },
        ],
    });

    const bgEnergyDiffuse = device.createBindGroup({
        layout: pipelines.energyDiffusePipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: energyUniformBuffer } },
            { binding: 1, resource: { buffer: energySrcBuffer } },
            { binding: 2, resource: { buffer: energyDstBuffer } },
            { binding: 3, resource: { buffer: sourceMapBuffer } },
        ],
    });

    const bgEnergyPost = device.createBindGroup({
        layout: pipelines.energyPostPipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: energyUniformBuffer } },
            { binding: 2, resource: { buffer: energyDstBuffer } },
            { binding: 4, resource: { buffer: aliveMidBuffer } },
            { binding: 5, resource: { buffer: aliveNextBuffer } },
            { binding: 6, resource: { buffer: ageInBuffer } },
            { binding: 7, resource: { buffer: ageOutBuffer } },
            { binding: 10, resource: { buffer: deadEnergyBuffer } },
        ],
    });

    const bgLife = device.createBindGroup({
        layout: pipelines.lifePipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: aliveMidBuffer } },
            { binding: 1, resource: { buffer: aliveNextBuffer } },
            { binding: 2, resource: { buffer: lifeUniformBuffer } },
        ],
    });

    return {
        bgMsg1,
        bgMsg2,
        bgMsg3a,
        bgMsg3b,
        bgMoveClear,
        bgMovePropose,
        bgMoveApply,
        bgEnergyDiffuse,
        bgEnergyPost,
        bgLife,
    };
}


