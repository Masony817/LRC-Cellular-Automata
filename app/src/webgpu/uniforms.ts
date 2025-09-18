/// <reference types="@webgpu/types" />

export interface SimUniformParams {
    width: number;
    height: number;
    generation: number;
    msg_k_bits: number;
    msg_cost_milli: number;
    msg_mode_stage1: number;
    msg_mode_stage3: number;
    move_cost_milli: number;
    move_mode: number;
    energy_leak_milli: number;
    energy_diff_milli: number;
    energy_decay_milli: number;
}

export function writeUniforms(device: GPUDevice, buffers: {
    messagingUniformBuffer: GPUBuffer;
    movementUniformBuffer: GPUBuffer;
    energyUniformBuffer: GPUBuffer;
    lifeUniformBuffer: GPUBuffer;
}, params: SimUniformParams): void {
    const msgU = new Uint32Array([
        params.width, params.height, params.generation,
        params.msg_k_bits,
        params.msg_cost_milli,
        params.msg_mode_stage1,
        params.msg_mode_stage3,
        0,
    ]);
    device.queue.writeBuffer(buffers.messagingUniformBuffer, 0, msgU);

    const moveU = new Uint32Array([
        params.width, params.height, params.generation,
        params.move_cost_milli, params.move_mode, 0,
    ]);
    device.queue.writeBuffer(buffers.movementUniformBuffer, 0, moveU);

    const eneU = new Uint32Array([
        params.width, params.height, params.generation,
        params.energy_leak_milli, params.energy_diff_milli, params.energy_decay_milli,
    ]);
    device.queue.writeBuffer(buffers.energyUniformBuffer, 0, eneU);

    const lifeU = new Uint32Array([
        params.width, params.height, params.generation, 0,
    ]);
    device.queue.writeBuffer(buffers.lifeUniformBuffer, 0, lifeU);
}


