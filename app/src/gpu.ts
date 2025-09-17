/// <reference types="@webgpu/types" />
import lifeStepWGSL from '@sim_kernels/life_step.wgsl?raw'

export interface Stats {
    generation: number;
    isRunning: boolean;
    speed: number;
    width: number;
    height: number;
    liveCells: number;
}

export class GPU {
    private device: GPUDevice;
    private computePipeline!: GPUComputePipeline;
    private bindGroup!: GPUBindGroup;
    private uniformBuffer!: GPUBuffer;
    private currentStateBuffer!: GPUBuffer;
    private nextStateBuffer!: GPUBuffer;
    private singleCellReadBuffer!: GPUBuffer;
    private gridReadBuffer!: GPUBuffer;

    // readback coordination
    private gridReadInFlight: Promise<Uint32Array> | null = null;

    private width: number;
    private height: number;
    private generation: number = 0;
    private isRunning: boolean = false;
    private animationId: number | null = null;
    private lastUpdateTime: number = 0;
    private speed: number = 200; // ms between updates/ generations

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
        // compile compute shader(s)
        const shaderModule = this.device.createShaderModule({
            code: lifeStepWGSL,
        });

        // compute pipeline gen
        this.computePipeline = this.device.createComputePipeline({
            layout: 'auto',
            compute: {
                module: shaderModule,
                entryPoint: 'main',
            },
        });

        //buffers
        this.createBuffers();
        this.createBindGroup();
        console.log('GPU sim initialized', { width: this.width, height: this.height });
    }

    private createBuffers(): void {
        const bufferSize = this.width * this.height * 4; // 4 bytes per u32

        //current state buffer -- read and write
        this.currentStateBuffer = this.device.createBuffer({
            size: bufferSize, 
            usage: GPUBufferUsage.STORAGE |  GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
        });

        //next state buffer - mirrors current state buffer
        this.nextStateBuffer = this.device.createBuffer({
            size: bufferSize, 
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
        });

        // single cell read buffer (4 bytes) for targeted reads
        this.singleCellReadBuffer = this.device.createBuffer({
            size: 4,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
        })

        // grid read buffer for full grid access
        this.gridReadBuffer = this.device.createBuffer({
            size: bufferSize,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
        })

        //grid dimensions
        this.uniformBuffer = this.device.createBuffer({
            size: 16, 
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        //init uniforms
        this.updateUniforms();
    }


    private createBindGroup(): void {
        this.bindGroup = this.device.createBindGroup({
            layout: this.computePipeline.getBindGroupLayout(0),
            entries: [
                 {
                    binding: 0,
                    resource: { buffer: this.currentStateBuffer },
                 },
                 {
                    binding: 1,
                    resource: { buffer: this.nextStateBuffer },
                 },
                 {
                    binding: 2,
                    resource: { buffer: this.uniformBuffer },
                 },
            ]
        })
    }

    private updateUniforms(): void {
        const uniformData = new Uint32Array([
            this.width,
            this.height,
            this.generation,
            0,//padding
        ]);
        this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformData);
    }

    //grid init with pattern or noise
    setGridData(data: Uint32Array): void {
        if(data.length !== this.width * this.height){
            throw new Error(`Data length mismatch for grid size ${this.width}x${this.height}`);
        }

        this.device.queue.writeBuffer(this.currentStateBuffer, 0, data);
        // keep it light, but confirm write
        // console.debug('Grid data written');
    }

    //get current grid state (async)
    async getGridData(): Promise<Uint32Array> {

        //check if read is in flight
        if(this.gridReadInFlight) return this.gridReadInFlight;

        //copy current state to grid read buffer
        const run = async () =>{
            const commandEncoder = this.device.createCommandEncoder();
            commandEncoder.copyBufferToBuffer(
                this.currentStateBuffer,
                0,
                this.gridReadBuffer,
                0,
                this.width * this.height * 4,
            );

            this.device.queue.submit([commandEncoder.finish()]);

            //map and read buffer
            if (this.gridReadBuffer.mapState === 'mapped'){
                this.gridReadBuffer.unmap();
            }

            await this.gridReadBuffer.mapAsync(GPUMapMode.READ);
            const data = new Uint32Array(this.gridReadBuffer.getMappedRange().slice(0));
            this.gridReadBuffer.unmap();

            return data;
        };

        this.gridReadInFlight = run().finally(()=> {
            this.gridReadInFlight = null;
        });

        return this.gridReadInFlight;

    }

    private cellOffset(col: number, row: number): number {
        return (row * this.width + col) * 4;
    }

    async getCell(col: number, row: number): Promise<number> {
        //if cell is out of bounds, return 0
        if (col < 0 || col >= this.width || row < 0 || row >= this.height) return 0;

        const offset = this.cellOffset(col, row);
        const encoder = this.device.createCommandEncoder();
        encoder.copyBufferToBuffer(this.currentStateBuffer, offset, this.singleCellReadBuffer, 0, 4);
        this.device.queue.submit([encoder.finish()]);

        //unmap if already mapped
        if(this.singleCellReadBuffer.mapState === 'mapped'){
            this.singleCellReadBuffer.unmap();
        }
        await this.singleCellReadBuffer.mapAsync(GPUMapMode.READ);

        //read value
        const view = new Uint32Array(this.singleCellReadBuffer.getMappedRange());
        const value = view[0];
        this.singleCellReadBuffer.unmap();
        return value;
    }

    setCell(col: number, row: number, state: 0 | 1): void {
        if (col < 0 || col >= this.width || row < 0 || row >= this.height) return;
        const offset = this.cellOffset(col, row);
        const one = new Uint32Array([state]);
        this.device.queue.writeBuffer(this.currentStateBuffer, offset, one);
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
                    if (col >= 0 && col < this.width && row >= 0 && row < this.height){
                        this.setCell(col, row, 1);
                        placed = true;
                        placedCount++;
                    }
                }
            }
        }
        if (placed) {
            console.log('Pattern placed', { startCol, startRow, placedCount });
            this.notifyUpdate();
        }
        return placed;
    }

    //single step sim
    async step(): Promise<void> {
        this.updateUniforms();

        const commandEncoder = this.device.createCommandEncoder();
        const passEncoder = commandEncoder.beginComputePass();

        passEncoder.setPipeline(this.computePipeline);
        passEncoder.setBindGroup(0, this.bindGroup);

        //dispatch
        const workgroupsX = Math.ceil(this.width / 16);
        const workgroupsY = Math.ceil(this.height / 16);
        passEncoder.dispatchWorkgroups(workgroupsX, workgroupsY,);

        passEncoder.end();
        this.device.queue.submit([commandEncoder.finish()]);

        //buffer swap
        [this.currentStateBuffer, this.nextStateBuffer] = [this.nextStateBuffer, this.currentStateBuffer];

        //update bind group
        this.createBindGroup();

        //increment generation
        this.generation++;
        // mild tick log at low volume
        // console.debug('Generation advanced', this.generation);
        this.notifyUpdate();
    }

    //animation loop
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
        if(this.animationId){
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

    // control methods
   // Control methods
  reset(): void {
    this.stop();
    this.generation = 0;
    
    // Clear grid
    const emptyData = new Uint32Array(this.width * this.height);
    this.setGridData(emptyData);
    console.log('Grid cleared');
    this.notifyUpdate();
  }

  randomize(density: number = 0.3): void {
    const data = new Uint32Array(this.width * this.height);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() < density ? 1 : 0;
    }
    
    this.generation = 0;
    this.setGridData(data);
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
    
    // TODO: Implement grid resizing with data preservation
    this.width = newWidth;
    this.height = newHeight;
    
    // Recreate buffers and bind group
    this.createBuffers();
    this.createBindGroup();
    console.log('Grid resized', { width: this.width, height: this.height });
    
    this.notifyUpdate();
  }

  // Pattern placement implemented here later

  private notifyUpdate(): void {
    if (this.onUpdate) {
      this.onUpdate({
        generation: this.generation,
        isRunning: this.isRunning,
        speed: this.speed,
        width: this.width,
        height: this.height,
        liveCells: 0, // Would need to compute this
      });
    }
  }

  // Cleanup
  destroy(): void {
    this.stop();
    
    this.currentStateBuffer?.destroy();
    this.nextStateBuffer?.destroy();
    this.uniformBuffer?.destroy();
  }

}