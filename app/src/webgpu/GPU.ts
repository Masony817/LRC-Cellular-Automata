/// <reference types="@webgpu/types" />
import { createPipelines } from './pipelines'
import { createBuffers, type CoreBuffers, type UniformBuffers } from './buffers'
import { createBindGroups, type BindGroups } from './bindGroups'
import { writeUniforms } from './uniforms'
import type { Stats, Pipelines } from './types'

export class GPU {
    private device: GPUDevice;

    // pipelines
    private pipelines!: Pipelines;

    // bind groups per pass
    private bindGroups!: BindGroups;

    // uniform and core state buffers
    private buffers!: CoreBuffers & UniformBuffers;

    // readback utilities
    private gridReadInFlight: Promise<Uint32Array> | null = null;

    // sim params
    private width: number;
    private height: number;
    private generation: number = 0;
    private isRunning: boolean = false;
    private animationId: number | null = null;
    private lastUpdateTime: number = 0;
    private speed: number = 200; // ms/tick

    // debug/default uniforms
    private msg_k_bits: number = 2;
    private msg_cost_milli: number = 50;
    private msg_mode_stage1: number = 1; // debug hash
    private msg_mode_stage3: number = 1; // debug hash

    private move_cost_milli: number = 10;
    private move_mode: number = 0; // 0=random debug, 1=ppo

    private energy_leak_milli: number = 20;
    private energy_diff_milli: number = 300;
    private energy_decay_milli: number = 20;

    // mode: 'LCR' (full multi-pass) or 'Conway' (classic Life only)
    private mode: 'LCR' | 'Conway' = 'LCR';

    private onUpdate: (stats: Stats) => void;

    constructor(
        device: GPUDevice,
        width: number,
        height: number,
        onUpdate?: (stats: Stats) => void
    ){
        this.device = device;
        this.width = width;
        this.height = height;
        this.onUpdate = onUpdate || (() => {});
    }

    setMode(mode: 'LCR' | 'Conway'): void {
        if (this.mode !== mode){
            this.mode = mode;
            console.log('Mode set', { mode });
            // no reset; next tick adapts automatically
            this.notifyUpdate();
        }
    }

    async init(): Promise<void> {
        this.pipelines = createPipelines(this.device);
        this.buffers = createBuffers(this.device, this.width, this.height);
        this.bindGroups = createBindGroups(this.device, this.pipelines, this.buffers);
        this.updateUniforms();
        console.log('GPU sim initialized', { width: this.width, height: this.height });
    }

    private updateUniforms(): void {
        writeUniforms(this.device, this.buffers, {
            width: this.width,
            height: this.height,
            generation: this.generation,
            msg_k_bits: this.msg_k_bits,
            msg_cost_milli: this.msg_cost_milli,
            msg_mode_stage1: this.msg_mode_stage1,
            msg_mode_stage3: this.msg_mode_stage3,
            move_cost_milli: this.move_cost_milli,
            move_mode: this.move_mode,
            energy_leak_milli: this.energy_leak_milli,
            energy_diff_milli: this.energy_diff_milli,
            energy_decay_milli: this.energy_decay_milli,
        });
    }

    // grid io
    setGridData(data: Uint32Array): void {
        if (data.length !== this.width * this.height){
            throw new Error(`Data length mismatch for grid size ${this.width}x${this.height}`);
        }
        this.device.queue.writeBuffer(this.buffers.aliveInBuffer, 0, data.buffer as ArrayBuffer);
    }

    async getGridData(): Promise<Uint32Array> {
        if (this.gridReadInFlight) return this.gridReadInFlight;

        const run = async () => {
            // Capture current dimensions and buffers to avoid races if resize occurs during await
            const widthSnapshot = this.width;
            const heightSnapshot = this.height;
            const aliveInBuffer = this.buffers.aliveInBuffer;
            const gridReadBuffer = this.buffers.gridReadBuffer;

            const copyBytes = widthSnapshot * heightSnapshot * 4;
            const commandEncoder = this.device.createCommandEncoder();
            commandEncoder.copyBufferToBuffer(
                aliveInBuffer, 0,
                gridReadBuffer, 0,
                copyBytes
            );
            this.device.queue.submit([commandEncoder.finish()]);

            if (gridReadBuffer.mapState === 'mapped'){
                gridReadBuffer.unmap();
            }
            await gridReadBuffer.mapAsync(GPUMapMode.READ, 0, copyBytes);
            const mapped = gridReadBuffer.getMappedRange(0, copyBytes);
            const data = new Uint32Array(mapped.slice(0));
            gridReadBuffer.unmap();
            return data;
        };

        this.gridReadInFlight = run().finally(() => {
            this.gridReadInFlight = null;
        });
        return this.gridReadInFlight;
    }

    private wrapCoordinate(n: number, max: number): number {
        const r = n % max;
        return r < 0 ? r + max : r;
    }

    private cellOffset(col: number, row: number): number {
        const wrappedCol = this.wrapCoordinate(col, this.width);
        const wrappedRow = this.wrapCoordinate(row, this.height);
        return (wrappedRow * this.width + wrappedCol) * 4;
    }

    async getCell(col: number, row: number): Promise<number> {
        // Capture dimensions and buffers to avoid races across await when resizing
        const widthSnapshot = this.width;
        const heightSnapshot = this.height;
        const aliveInBuffer = this.buffers.aliveInBuffer;
        const singleCellReadBuffer = this.buffers.singleCellReadBuffer;

        const wrapCoordinate = (n: number, max: number) => {
            const r = n % max;
            return r < 0 ? r + max : r;
        };
        const wrappedCol = wrapCoordinate(col, widthSnapshot);
        const wrappedRow = wrapCoordinate(row, heightSnapshot);
        const offset = (wrappedRow * widthSnapshot + wrappedCol) * 4;

        const encoder = this.device.createCommandEncoder();
        encoder.copyBufferToBuffer(aliveInBuffer, offset, singleCellReadBuffer, 0, 4);
        this.device.queue.submit([encoder.finish()]);

        if (singleCellReadBuffer.mapState === 'mapped'){
            singleCellReadBuffer.unmap();
        }
        await singleCellReadBuffer.mapAsync(GPUMapMode.READ, 0, 4);
        const view = new Uint32Array(singleCellReadBuffer.getMappedRange(0, 4));
        const value = view[0];
        singleCellReadBuffer.unmap();
        return value;
    }

    setCell(col: number, row: number, state: 0 | 1): void {
        const offset = this.cellOffset(col, row);
        const one = new Uint32Array([state]);
        this.device.queue.writeBuffer(this.buffers.aliveInBuffer, offset, one);
        if (state === 1) {
            const f = new Float32Array([1.0]);
            this.device.queue.writeBuffer(this.buffers.energySrcBuffer, offset, f);
        } else {
            const z = new Float32Array([0.0]);
            this.device.queue.writeBuffer(this.buffers.energySrcBuffer, offset, z);
        }
    }

    async toggleCell(col: number, row: number): Promise<void> {
        const current = await this.getCell(col, row);
        const next = current === 1 ? 0 : 1;
        this.setCell(col, row, next as 0 | 1);
        console.log('Cell toggled', { col, row, next });
        this.notifyUpdate();
    }

    placePattern(cells: number[][], startCol: number, startRow: number): boolean {
        if (!cells || cells.length === 0) return false;
        let placed = false;
        let placedCount = 0;
        for (let r = 0; r < cells.length; r++){
            const rowArr = cells[r];
            for (let c = 0; c < rowArr.length; c++){
                if (rowArr[c] === 1){
                    const col = startCol + c;
                    const row = startRow + r;
                    this.setCell(col, row, 1);
                    placed = true;
                    placedCount++;
                }
            }
        }
        if (placed) {
            console.log('Pattern placed', { startCol, startRow, placedCount });
            this.notifyUpdate();
        }
        return placed;
    }

    // simulation step
    async step(): Promise<void> {
        try {
            this.updateUniforms();

            // begin validation error scope (best-effort; optional in some impls)
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (this.device as any).pushErrorScope?.('validation');
            } catch (_) { /* noop */ }

            const commandEncoder = this.device.createCommandEncoder();
            const workgroupsX = Math.ceil(this.width / 16);
            const workgroupsY = Math.ceil(this.height / 16);

            if (this.mode === 'LCR'){
                const pass = commandEncoder.beginComputePass();

                console.log('dispatch msg-stage1', { gen: this.generation });
                pass.setPipeline(this.pipelines.msgStage1Pipeline);
                pass.setBindGroup(0, this.bindGroups.bgMsg1);
                pass.dispatchWorkgroups(workgroupsX, workgroupsY);

                console.log('dispatch msg-stage2', { gen: this.generation });
                pass.setPipeline(this.pipelines.msgStage2Pipeline);
                pass.setBindGroup(0, this.bindGroups.bgMsg2);
                pass.dispatchWorkgroups(workgroupsX, workgroupsY);

                console.log('dispatch msg-stage3a', { gen: this.generation });
                pass.setPipeline(this.pipelines.msgStage3aPipeline);
                pass.setBindGroup(0, this.bindGroups.bgMsg3a);
                pass.dispatchWorkgroups(workgroupsX, workgroupsY);

                console.log('dispatch msg-stage3b', { gen: this.generation });
                pass.setPipeline(this.pipelines.msgStage3bPipeline);
                pass.setBindGroup(0, this.bindGroups.bgMsg3b);
                pass.dispatchWorkgroups(workgroupsX, workgroupsY);

                console.log('dispatch move-clear', { gen: this.generation });
                pass.setPipeline(this.pipelines.moveClearPipeline);
                pass.setBindGroup(0, this.bindGroups.bgMoveClear);
                pass.dispatchWorkgroups(workgroupsX, workgroupsY);

                console.log('dispatch move-propose', { gen: this.generation });
                pass.setPipeline(this.pipelines.moveProposePipeline);
                pass.setBindGroup(0, this.bindGroups.bgMovePropose);
                pass.dispatchWorkgroups(workgroupsX, workgroupsY);

                console.log('dispatch move-apply', { gen: this.generation });
                pass.setPipeline(this.pipelines.moveApplyPipeline);
                pass.setBindGroup(0, this.bindGroups.bgMoveApply);
                pass.dispatchWorkgroups(workgroupsX, workgroupsY);

                console.log('dispatch energy-diffuse', { gen: this.generation });
                pass.setPipeline(this.pipelines.energyDiffusePipeline);
                pass.setBindGroup(0, this.bindGroups.bgEnergyDiffuse);
                pass.dispatchWorkgroups(workgroupsX, workgroupsY);

                console.log('dispatch life-step', { gen: this.generation });
                pass.setPipeline(this.pipelines.lifePipeline);
                pass.setBindGroup(0, this.bindGroups.bgLife);
                pass.dispatchWorkgroups(workgroupsX, workgroupsY);

                console.log('dispatch energy-post-life', { gen: this.generation });
                pass.setPipeline(this.pipelines.energyPostPipeline);
                pass.setBindGroup(0, this.bindGroups.bgEnergyPost);
                pass.dispatchWorkgroups(workgroupsX, workgroupsY);

                pass.end();
                this.device.queue.submit([commandEncoder.finish()]);
            } else {
                // Conway mode: copy aliveIn -> aliveMid, then run Life only
                const copyBytes = this.width * this.height * 4;
                commandEncoder.copyBufferToBuffer(
                    this.buffers.aliveInBuffer, 0,
                    this.buffers.aliveMidBuffer, 0,
                    copyBytes
                );

                const pass = commandEncoder.beginComputePass();
                console.log('dispatch life-step (Conway)', { gen: this.generation });
                pass.setPipeline(this.pipelines.lifePipeline);
                pass.setBindGroup(0, this.bindGroups.bgLife);
                pass.dispatchWorkgroups(workgroupsX, workgroupsY);
                pass.end();
                this.device.queue.submit([commandEncoder.finish()]);
            }

            try {
                // wait for GPU work to complete
                if (this.device.queue.onSubmittedWorkDone) {
                    await this.device.queue.onSubmittedWorkDone();
                }
            } catch (e) {
                console.error('Queue completion error', e);
            }

            // resolve validation scope if present
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const err = (this.device as any).popErrorScope ? await (this.device as any).popErrorScope() : null;
                if (err) {
                    console.error('Validation error during step', err);
                } else {
                    console.log('step ok', { gen: this.generation });
                }
            } catch (_) {
                // ignore scope pop issues
            }

            // swaps for next tick
            [this.buffers.aliveInBuffer, this.buffers.aliveNextBuffer] = [this.buffers.aliveNextBuffer, this.buffers.aliveInBuffer];
            if (this.mode === 'LCR'){
                [this.buffers.energySrcBuffer, this.buffers.energyDstBuffer] = [this.buffers.energyDstBuffer, this.buffers.energySrcBuffer];
                [this.buffers.ageInBuffer, this.buffers.ageOutBuffer] = [this.buffers.ageOutBuffer, this.buffers.ageInBuffer];
            }

            // re-bind with swapped buffers
            this.bindGroups = createBindGroups(this.device, this.pipelines, this.buffers);

            this.generation++;
            this.notifyUpdate();
        } catch (err) {
            console.error('step failed', err);
        }
    }

    // animation loop
    start(): void {
        if (this.isRunning) return;
        this.isRunning = true;
        this.lastUpdateTime = performance.now();
        this.animate();
        console.log('Sim started');
        this.notifyUpdate();
    }

    stop(): void {
        if (!this.isRunning) return;
        this.isRunning = false;
        if (this.animationId){
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        console.log('Sim stopped');
        this.notifyUpdate();
    }

    private animate(): void {
        if (!this.isRunning) return;

        const currentTime = performance.now();
        if (currentTime - this.lastUpdateTime >= this.speed){
            this.step();
            this.lastUpdateTime = currentTime;
        }
        this.animationId = requestAnimationFrame(() => this.animate());
    }

    // controls
    reset(): void {
        this.stop();
        this.generation = 0;

        const cells = this.width * this.height;
        const zU32 = new Uint32Array(cells);
        const zF32 = new Float32Array(cells);

        this.device.queue.writeBuffer(this.buffers.aliveInBuffer, 0, zU32);
        this.device.queue.writeBuffer(this.buffers.aliveMidBuffer, 0, zU32);
        this.device.queue.writeBuffer(this.buffers.aliveNextBuffer, 0, zU32);

        this.device.queue.writeBuffer(this.buffers.energySrcBuffer, 0, zF32);
        this.device.queue.writeBuffer(this.buffers.energyDstBuffer, 0, zF32);

        this.device.queue.writeBuffer(this.buffers.msgOutBuffer, 0, zU32);
        this.device.queue.writeBuffer(this.buffers.msgLastBuffer, 0, zU32);
        this.device.queue.writeBuffer(this.buffers.inbox0Buffer, 0, zU32);
        this.device.queue.writeBuffer(this.buffers.inbox1Buffer, 0, zU32);
        this.device.queue.writeBuffer(this.buffers.energyScentBuffer, 0, zU32);

        this.device.queue.writeBuffer(this.buffers.lastPosBuffer, 0, zU32);
        this.device.queue.writeBuffer(this.buffers.intentHashBuffer, 0, zU32);

        this.device.queue.writeBuffer(this.buffers.deadEnergyBuffer, 0, zF32);
        this.device.queue.writeBuffer(this.buffers.ageInBuffer, 0, zU32);
        this.device.queue.writeBuffer(this.buffers.ageOutBuffer, 0, zU32);

        console.log('Grid cleared');
        this.notifyUpdate();
    }

    randomize(density: number = 0.3): void {
        const cells = this.width * this.height;
        const alive = new Uint32Array(cells);
        const energy = new Float32Array(cells);
        for (let i = 0; i < cells; i++) {
            const v = Math.random() < density ? 1 : 0;
            alive[i] = v;
            energy[i] = v ? 1.0 : 0.0;
        }
        this.generation = 0;
        this.device.queue.writeBuffer(this.buffers.aliveInBuffer, 0, alive);
        this.device.queue.writeBuffer(this.buffers.energySrcBuffer, 0, energy);

        const zU32 = new Uint32Array(cells);
        const zF32 = new Float32Array(cells);
        this.device.queue.writeBuffer(this.buffers.aliveMidBuffer, 0, zU32);
        this.device.queue.writeBuffer(this.buffers.aliveNextBuffer, 0, zU32);
        this.device.queue.writeBuffer(this.buffers.msgOutBuffer, 0, zU32);
        this.device.queue.writeBuffer(this.buffers.msgLastBuffer, 0, zU32);
        this.device.queue.writeBuffer(this.buffers.inbox0Buffer, 0, zU32);
        this.device.queue.writeBuffer(this.buffers.inbox1Buffer, 0, zU32);
        this.device.queue.writeBuffer(this.buffers.energyScentBuffer, 0, zU32);
        this.device.queue.writeBuffer(this.buffers.lastPosBuffer, 0, zU32);
        this.device.queue.writeBuffer(this.buffers.intentHashBuffer, 0, zU32);
        this.device.queue.writeBuffer(this.buffers.energyDstBuffer, 0, zF32);
        this.device.queue.writeBuffer(this.buffers.deadEnergyBuffer, 0, zF32);
        this.device.queue.writeBuffer(this.buffers.ageInBuffer, 0, zU32);
        this.device.queue.writeBuffer(this.buffers.ageOutBuffer, 0, zU32);

        console.log('Grid randomized', { density });
        this.notifyUpdate();
    }

    setSpeed(speed: number): void {
        this.speed = Math.max(50, Math.min(1000, speed));
        console.log('Speed set', { speed: this.speed });
        this.notifyUpdate();
    }

    resize(newWidth: number, newHeight: number): void {
        this.stop();
        this.width = newWidth;
        this.height = newHeight;

        this.buffers = createBuffers(this.device, this.width, this.height);
        this.bindGroups = createBindGroups(this.device, this.pipelines, this.buffers);
        this.updateUniforms();
        console.log('Grid resized', { width: this.width, height: this.height });
        this.notifyUpdate();
    }

    private notifyUpdate(): void {
        if (this.onUpdate) {
            this.onUpdate({
                generation: this.generation,
                isRunning: this.isRunning,
                speed: this.speed,
                width: this.width,
                height: this.height,
                liveCells: 0,
            });
        }
    }

    destroy(): void {
        this.stop();
        const b = this.buffers;
        b?.aliveInBuffer?.destroy();
        b?.aliveMidBuffer?.destroy();
        b?.aliveNextBuffer?.destroy();
        b?.energySrcBuffer?.destroy();
        b?.energyDstBuffer?.destroy();
        b?.sourceMapBuffer?.destroy();
        b?.deadEnergyBuffer?.destroy();
        b?.ageInBuffer?.destroy();
        b?.ageOutBuffer?.destroy();
        b?.msgOutBuffer?.destroy();
        b?.msgLastBuffer?.destroy();
        b?.inbox0Buffer?.destroy();
        b?.inbox1Buffer?.destroy();
        b?.energyScentBuffer?.destroy();
        b?.learnedMsgStage1Buffer?.destroy();
        b?.learnedMsgStage3Buffer?.destroy();
        b?.lastPosBuffer?.destroy();
        b?.intentHashBuffer?.destroy();
        b?.ppoActionsBuffer?.destroy();
        b?.messagingUniformBuffer?.destroy();
        b?.movementUniformBuffer?.destroy();
        b?.energyUniformBuffer?.destroy();
        b?.lifeUniformBuffer?.destroy();
        b?.singleCellReadBuffer?.destroy();
        b?.gridReadBuffer?.destroy();
    }
}


