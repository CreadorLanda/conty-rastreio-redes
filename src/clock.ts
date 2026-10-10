export type Clock = () => Date;

export type Sleep = (ms: number) => Promise<void>;

export const systemClock: Clock = () => new Date();

export const systemSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
