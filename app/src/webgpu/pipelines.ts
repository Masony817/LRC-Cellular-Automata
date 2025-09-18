/// <reference types="@webgpu/types" />
import lifeStepWGSL from '@sim_kernels/life_step.wgsl?raw'
import messagingWGSL from '@sim_kernels/messaging.wgsl?raw'
import movementWGSL from '@sim_kernels/movement.wgsl?raw'
import energyWGSL from '@sim_kernels/energy.wgsl?raw'
import type { Pipelines } from './types'

export function createPipelines(device: GPUDevice): Pipelines {
    const messagingModule = device.createShaderModule({ code: messagingWGSL });
    const movementModule  = device.createShaderModule({ code: movementWGSL  });
    const energyModule    = device.createShaderModule({ code: energyWGSL    });
    const lifeModule      = device.createShaderModule({ code: lifeStepWGSL  });

    const msgStage1Pipeline = device.createComputePipeline({
        layout: 'auto',
        compute: { module: messagingModule, entryPoint: 'msg_stage1_broadcast' }
    });
    const msgStage2Pipeline = device.createComputePipeline({
        layout: 'auto',
        compute: { module: messagingModule, entryPoint: 'msg_stage2_receive' }
    });
    const msgStage3aPipeline = device.createComputePipeline({
        layout: 'auto',
        compute: { module: messagingModule, entryPoint: 'msg_stage3a_respond' }
    });
    const msgStage3bPipeline = device.createComputePipeline({
        layout: 'auto',
        compute: { module: messagingModule, entryPoint: 'msg_stage3b_pack' }
    });

    const moveClearPipeline = device.createComputePipeline({
        layout: 'auto',
        compute: { module: movementModule, entryPoint: 'move_clear_intents' }
    });
    const moveProposePipeline = device.createComputePipeline({
        layout: 'auto',
        compute: { module: movementModule, entryPoint: 'move_propose' }
    });
    const moveApplyPipeline = device.createComputePipeline({
        layout: 'auto',
        compute: { module: movementModule, entryPoint: 'move_apply' }
    });

    const energyDiffusePipeline = device.createComputePipeline({
        layout: 'auto',
        compute: { module: energyModule, entryPoint: 'energy_diffuse' }
    });
    const energyPostPipeline = device.createComputePipeline({
        layout: 'auto',
        compute: { module: energyModule, entryPoint: 'energy_post_life' }
    });

    const lifePipeline = device.createComputePipeline({
        layout: 'auto',
        compute: { module: lifeModule, entryPoint: 'main' }
    });

    return {
        msgStage1Pipeline,
        msgStage2Pipeline,
        msgStage3aPipeline,
        msgStage3bPipeline,
        moveClearPipeline,
        moveProposePipeline,
        moveApplyPipeline,
        energyDiffusePipeline,
        energyPostPipeline,
        lifePipeline,
    };
}


