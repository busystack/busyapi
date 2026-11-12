import {protocol} from './engine';
export const MAX = 64 * 1024 * 1024;
export const encode = (message: any) => {
    // TextEncoder owns this ArrayBuffer; pooled Buffer allocations cannot safely
    // be transferred. Serialize once in the worker, keeping the control loop free.
    const payload = new TextEncoder().encode(JSON.stringify({ protocol, ...message }));
    if (payload.byteLength > MAX)
        throw Object.assign(Error('Response exceeds the bounded IPC frame size'), { code: 'limit.response' });
    return payload;
};
