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
        this.device.queue.writeBuffer(this.buffers.aliveInBuffer, 0, data);
    }

    async getGridData(): Promise<Uint32Array> {
        if (this.gridReadInFlight) return this.gridReadInFlight;

        const run = async () => {
            const commandEncoder = this.device.createCommandEncoder();
            commandEncoder.copyBufferToBuffer(
                this.buffers.aliveInBuffer, 0,
                this.buffers.gridReadBuffer, 0,
                this.width * this.height * 4
            );
            this.device.queue.submit([commandEncoder.finish()]);

            if (this.buffers.gridReadBuffer.mapState === 'mapped'){
                this.buffers.gridReadBuffer.unmap();
            }
            await this.buffers.gridReadBuffer.mapAsync(GPUMapMode.READ);
            const data = new Uint32Array(this.buffers.gridReadBuffer.getMappedRange().slice(0));
            this.buffers.gridReadBuffer.unmap();
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
        const offset = this.cellOffset(col, row);
        const encoder = this.device.createCommandEncoder();
        encoder.copyBufferToBuffer(this.buffers.aliveInBuffer, offset, this.buffers.singleCellReadBuffer, 0, 4);
        this.device.queue.submit([encoder.finish()]);

        if (this.buffers.singleCellReadBuffer.mapState === 'mapped'){
            this.buffers.singleCellReadBuffer.unmap();
        }
        await this.buffers.singleCellReadBuffer.mapAsync(GPUMapMode.READ);
        const view = new Uint32Array(this.buffers.singleCellReadBuffer.getMappedRange());
        const value = view[0];
        this.buffers.singleCellReadBuffer.unmap();
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
        this.updateUniforms();

        const commandEncoder = this.device.createCommandEncoder();
        const pass = commandEncoder.beginComputePass();

        const workgroupsX = Math.ceil(this.width / 16);
        const workgroupsY = Math.ceil(this.height / 16);

        pass.setPipeline(this.pipelines.msgStage1Pipeline);
        pass.setBindGroup(0, this.bindGroups.bgMsg1);
        pass.dispatchWorkgroups(workgroupsX, workgroupsY);

        pass.setPipeline(this.pipelines.msgStage2Pipeline);
        pass.setBindGroup(0, this.bindGroups.bgMsg2);
        pass.dispatchWorkgroups(workgroupsX, workgroupsY);

        pass.setPipeline(this.pipelines.msgStage3aPipeline);
        pass.setBindGroup(0, this.bindGroups.bgMsg3a);
        pass.dispatchWorkgroups(workgroupsX, workgroupsY);

        pass.setPipeline(this.pipelines.msgStage3bPipeline);
        pass.setBindGroup(0, this.bindGroups.bgMsg3b);
        pass.dispatchWorkgroups(workgroupsX, workgroupsY);

        pass.setPipeline(this.pipelines.moveClearPipeline);
        pass.setBindGroup(0, this.bindGroups.bgMoveClear);
        pass.dispatchWorkgroups(workgroupsX, workgroupsY);

        pass.setPipeline(this.pipelines.moveProposePipeline);
        pass.setBindGroup(0, this.bindGroups.bgMovePropose);
        pass.dispatchWorkgroups(workgroupsX, workgroupsY);

        pass.setPipeline(this.pipelines.moveApplyPipeline);
        pass.setBindGroup(0, this.bindGroups.bgMoveApply);
        pass.dispatchWorkgroups(workgroupsX, workgroupsY);

        pass.setPipeline(this.pipelines.energyDiffusePipeline);
        pass.setBindGroup(0, this.bindGroups.bgEnergyDiffuse);
        pass.dispatchWorkgroups(workgroupsX, workgroupsY);

        pass.setPipeline(this.pipelines.lifePipeline);
        pass.setBindGroup(0, this.bindGroups.bgLife);
        pass.dispatchWorkgroups(workgroupsX, workgroupsY);

        pass.setPipeline(this.pipelines.energyPostPipeline);
        pass.setBindGroup(0, this.bindGroups.bgEnergyPost);
        pass.dispatchWorkgroups(workgroupsX, workgroupsY);

        pass.end();
        this.device.queue.submit([commandEncoder.finish()]);

        // swaps for next tick
        [this.buffers.aliveInBuffer, this.buffers.aliveNextBuffer] = [this.buffers.aliveNextBuffer, this.buffers.aliveInBuffer];
        [this.buffers.energySrcBuffer, this.buffers.energyDstBuffer] = [this.buffers.energyDstBuffer, this.buffers.energySrcBuffer];
        [this.buffers.ageInBuffer, this.buffers.ageOutBuffer] = [this.buffers.ageOutBuffer, this.buffers.ageInBuffer];

        // re-bind with swapped buffers
        this.bindGroups = createBindGroups(this.device, this.pipelines, this.buffers);

        this.generation++;
        this.notifyUpdate();
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


