/// <reference types="@webgpu/types" />

export interface CoreBuffers {
    aliveInBuffer: GPUBuffer;
    aliveMidBuffer: GPUBuffer;
    aliveNextBuffer: GPUBuffer;
    energySrcBuffer: GPUBuffer;
    energyDstBuffer: GPUBuffer;
    sourceMapBuffer: GPUBuffer;
    deadEnergyBuffer: GPUBuffer;
    ageInBuffer: GPUBuffer;
    ageOutBuffer: GPUBuffer;
    msgOutBuffer: GPUBuffer;
    msgLastBuffer: GPUBuffer;
    inbox0Buffer: GPUBuffer;
    inbox1Buffer: GPUBuffer;
    energyScentBuffer: GPUBuffer;
    learnedMsgStage1Buffer: GPUBuffer;
    learnedMsgStage3Buffer: GPUBuffer;
    lastPosBuffer: GPUBuffer;
    intentHashBuffer: GPUBuffer;
    ppoActionsBuffer: GPUBuffer;
    singleCellReadBuffer: GPUBuffer;
    gridReadBuffer: GPUBuffer;
}

export interface UniformBuffers {
    messagingUniformBuffer: GPUBuffer;
    movementUniformBuffer: GPUBuffer;
    energyUniformBuffer: GPUBuffer;
    lifeUniformBuffer: GPUBuffer;
}

export function createBuffers(device: GPUDevice, width: number, height: number): CoreBuffers & UniformBuffers {
    const cells = width * height;
    const bytesU32 = cells * 4;
    const bytesF32 = cells * 4;

    const aliveInBuffer = device.createBuffer({ size: bytesU32, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
    const aliveMidBuffer = device.createBuffer({ size: bytesU32, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
    const aliveNextBuffer = device.createBuffer({ size: bytesU32, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });

    const energySrcBuffer = device.createBuffer({ size: bytesF32, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
    const energyDstBuffer = device.createBuffer({ size: bytesF32, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });

    const msgOutBuffer = device.createBuffer({ size: bytesU32, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC });
    const msgLastBuffer = device.createBuffer({ size: bytesU32, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC });
    const inbox0Buffer = device.createBuffer({ size: bytesU32, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC });
    const inbox1Buffer = device.createBuffer({ size: bytesU32, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC });
    const energyScentBuffer = device.createBuffer({ size: bytesU32, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC });
    const learnedMsgStage1Buffer = device.createBuffer({ size: bytesU32, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    const learnedMsgStage3Buffer = device.createBuffer({ size: bytesU32, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });

    const lastPosBuffer = device.createBuffer({ size: bytesU32, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC });
    const intentHashBuffer = device.createBuffer({ size: bytesU32, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC });
    const ppoActionsBuffer = device.createBuffer({ size: bytesU32, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });

    const sourceMapBuffer = device.createBuffer({ size: bytesF32, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    const deadEnergyBuffer = device.createBuffer({ size: bytesF32, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC });
    const ageInBuffer = device.createBuffer({ size: bytesU32, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC });
    const ageOutBuffer = device.createBuffer({ size: bytesU32, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC });

    const messagingUniformBuffer = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const movementUniformBuffer = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const energyUniformBuffer = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const lifeUniformBuffer = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

    const singleCellReadBuffer = device.createBuffer({ size: 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const gridReadBuffer = device.createBuffer({ size: bytesU32, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });

    // initialize zeros for select buffers
    const zeroU32 = new Uint32Array(cells);
    const zeroF32 = new Float32Array(cells);
    device.queue.writeBuffer(ppoActionsBuffer, 0, zeroU32);
    device.queue.writeBuffer(learnedMsgStage1Buffer, 0, zeroU32);
    device.queue.writeBuffer(learnedMsgStage3Buffer, 0, zeroU32);
    device.queue.writeBuffer(sourceMapBuffer, 0, zeroF32);
    device.queue.writeBuffer(deadEnergyBuffer, 0, zeroF32);
    device.queue.writeBuffer(ageInBuffer, 0, zeroU32);
    device.queue.writeBuffer(ageOutBuffer, 0, zeroU32);

    return {
        aliveInBuffer,
        aliveMidBuffer,
        aliveNextBuffer,
        energySrcBuffer,
        energyDstBuffer,
        sourceMapBuffer,
        deadEnergyBuffer,
        ageInBuffer,
        ageOutBuffer,
        msgOutBuffer,
        msgLastBuffer,
        inbox0Buffer,
        inbox1Buffer,
        energyScentBuffer,
        learnedMsgStage1Buffer,
        learnedMsgStage3Buffer,
        lastPosBuffer,
        intentHashBuffer,
        ppoActionsBuffer,
        singleCellReadBuffer,
        gridReadBuffer,
        messagingUniformBuffer,
        movementUniformBuffer,
        energyUniformBuffer,
        lifeUniformBuffer,
    };
}


