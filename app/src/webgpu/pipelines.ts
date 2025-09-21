/// <reference types="@webgpu/types" />
import lifeStepWGSL from '@sim_kernels/life_step.wgsl?raw'
import messagingWGSL from '@sim_kernels/messaging.wgsl?raw'
import movementWGSL from '@sim_kernels/movement.wgsl?raw'
import energyWGSL from '@sim_kernels/energy.wgsl?raw'
import type { Pipelines } from './types'

export function createPipelines(device: GPUDevice): Pipelines {
    const messagingModule = device.createShaderModule({ label: 'messaging-shader', code: messagingWGSL });
    const movementModule  = device.createShaderModule({ label: 'movement-shader',  code: movementWGSL  });
    const energyModule    = device.createShaderModule({ label: 'energy-shader',    code: energyWGSL    });
    const lifeModule      = device.createShaderModule({ label: 'life-shader',      code: lifeStepWGSL  });

    const msgStage1Pipeline = device.createComputePipeline({
        label: 'msg-stage1',
        layout: 'auto',
        compute: { module: messagingModule, entryPoint: 'msg_stage1_broadcast' }
    });
    const msgStage2Pipeline = device.createComputePipeline({
        label: 'msg-stage2',
        layout: 'auto',
        compute: { module: messagingModule, entryPoint: 'msg_stage2_receive' }
    });
    const msgStage3aPipeline = device.createComputePipeline({
        label: 'msg-stage3a',
        layout: 'auto',
        compute: { module: messagingModule, entryPoint: 'msg_stage3a_respond' }
    });
    const msgStage3bPipeline = device.createComputePipeline({
        label: 'msg-stage3b',
        layout: 'auto',
        compute: { module: messagingModule, entryPoint: 'msg_stage3b_pack' }
    });

    const moveClearPipeline = device.createComputePipeline({
        label: 'move-clear',
        layout: 'auto',
        compute: { module: movementModule, entryPoint: 'move_clear_intents' }
    });
    const moveProposePipeline = device.createComputePipeline({
        label: 'move-propose',
        layout: 'auto',
        compute: { module: movementModule, entryPoint: 'move_propose' }
    });
    const moveApplyPipeline = device.createComputePipeline({
        label: 'move-apply',
        layout: 'auto',
        compute: { module: movementModule, entryPoint: 'move_apply' }
    });

    const energyDiffusePipeline = device.createComputePipeline({
        label: 'energy-diffuse',
        layout: 'auto',
        compute: { module: energyModule, entryPoint: 'energy_diffuse' }
    });
    const energyPostPipeline = device.createComputePipeline({
        label: 'energy-post-life',
        layout: 'auto',
        compute: { module: energyModule, entryPoint: 'energy_post_life' }
    });

    const lifePipeline = device.createComputePipeline({
        label: 'life-step',
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


