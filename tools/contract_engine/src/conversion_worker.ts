import {parentPort} from 'node:worker_threads';
import {SourceError} from './document';
import {planMigration} from './migration';
import {encode} from './worker_response';

// A fixed worker entry shares the ordinary protocol, dispatcher and CST model.
// The editing worker never imports the conversion algorithms.
parentPort!.on('message', async (request: {id: string; method: string; params: any}) => {
    const reply = (message: object): void => {
        const payload = encode({id: request.id, snapshot: request.params?.snapshot, ...message});
        parentPort!.postMessage(payload, [payload.buffer as ArrayBuffer]);
    };
    try {
        if (request.method !== 'planMigration') throw new SourceError('engine.method', 'Unknown conversion method');
        reply({ok: true, result: await planMigration(request.params)});
    } catch (error: any) {
        reply({ok: false, error: {
            code: error.code ?? 'engine.failure', message: error.message ?? 'Engine failure', range: error.range,
            ...(error instanceof SourceError ? {kind: error.kind, source: error.source} : {}),
        }});
    }
});
