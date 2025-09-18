/// <reference types="@webgpu/types" />

export class WebGPUManager {
    private static instance: WebGPUManager;
    private adapter: GPUAdapter | null = null;
    private device: GPUDevice | null = null;

    private constructor() {}

    static getInstance(): WebGPUManager {
        if (!WebGPUManager.instance){
            WebGPUManager.instance = new WebGPUManager();
        }
        return WebGPUManager.instance;
    }

    async init(): Promise<boolean> {
        if (!navigator.gpu){
            console.error('WebGPU not supported');
            return false;
        }
        try {
            this.adapter = await navigator.gpu.requestAdapter();
            if (!this.adapter){
                console.error('No appropriate adapter found');
                return false;
            }
            console.log('WebGPU adapter acquired');

            this.device = await this.adapter.requestDevice();
            console.log('WebGPU device acquired');
            return true;
        } catch (error){
            console.error('Failed to initialize WebGPU:', error);
            return false;
        }
    }

    getDevice(): GPUDevice {
        if (!this.device){
            throw new Error('WebGPU device not initialized');
        }
        return this.device;
    }

    isSupported(): boolean {
        return !!navigator.gpu;
    }
}


