import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { WorkerDispatcher } from './worker_dispatcher';
import {PolicyProcessWorker} from './policy_process_worker';
import {join} from 'node:path';
import {MAX, encode, protocol, engineVersion} from './worker_response';
if (!isMainThread) {
    const {createGraph} = require('./source_capture') as typeof import('./source_capture');
    const {requestInputPreparation} = require('./request_preparation') as typeof import('./request_preparation');
    const {responseStreamOpen,responseStreamChunk,responseStreamClose,responseStreamOwned} = require('./stream_execution') as typeof import('./stream_execution');
    const {SourceError} = require('./document') as typeof import('./document');
    const { analyse, propose, discover, inspect, readDataValue } = require('./engine') as typeof import('./engine');
    const { planRename, planPropertyRename, planResponseRename, planSchemaDefinitionRename } = require('./refactoring') as typeof import('./refactoring');
    const { planDelete } = require('./refactoring_delete') as typeof import('./refactoring_delete');
    const {planYamlOwnership} = require('./refactoring_ownership') as typeof import('./refactoring_ownership');
    const {planExtract,planExtractToFile,planInline,planMoveDefinition,planOperationMove} = require('./refactoring_copy') as typeof import('./refactoring_copy');
    const {planFileMove,planFileDeletion,planRootRemoval} = require('./refactoring_file') as typeof import('./refactoring_file');
    const {normalizeResourceUris} = require('./reference_graph') as typeof import('./reference_graph');
    const { assistSource, sourceFolds, semanticSearch } = require('./source_assistance') as typeof import('./source_assistance');
    const { suggestSchema, planSchemaSuggestion } = require('./schema_suggestion') as typeof import('./schema_suggestion');
    const { referencePage, referenceDocument } = require('./reference_projection') as typeof import('./reference_projection');
    const { evaluateSchemas, standardResource } = require('./schema_evaluation') as typeof import('./schema_evaluation');
    const { deriveBundle } = require('./derived_bundle') as typeof import('./derived_bundle');
    const { referenceDisplayPacket } = require('./reference_display') as typeof import('./reference_display');
    const {describeResourcePackage} = require('./resource_package') as typeof import('./resource_package');
    const { schemaTree } = require('./schema_tree') as typeof import('./schema_tree');
    const { referenceChoices } = require('./reference_choices') as typeof import('./reference_choices');
    const { planReference } = require('./reference_selection') as typeof import('./reference_selection');
    const {planDiagnosticFix} = require('./diagnostic_fixes') as typeof import('./diagnostic_fixes');
    const {
        planResponseExample,requestOperation,requestParameterValues,requestFormDataValues,requestFormMediaTypes,requestMultipartEncoding,requestMimeTextBytes,executionCaseValues,inspectExecutionJson,planExecutionEnvironment,semanticDiffCoverage,
        mockFormBytes,mockMultipartBytes,requestFormBytes,requestRawMediaBytes,planExecutionCase,requestContentParameters,requestMediaBytes,requestMultipartPlan,requestMultipartAppend,
    } = require('./execution') as typeof import('./execution');
    const {discoverPolicy} = require('./governance_configuration') as typeof import('./governance_configuration');
    const {inspectPolicyCode} = require('./policy_code') as typeof import('./policy_code');
    const {policyRuntime} = require('./policy_runtime') as typeof import('./policy_runtime');
    // Native mock workers own one source capture. General desktop workers
    // continue to accept a distinct capture with each independent request.
    const capture=workerData?.capture;
    let context:ReturnType<typeof createGraph>|undefined;
    const capturedContext=()=>context??=createGraph(capture);
    const methods: any = { analyse, evaluateSchemas:capture?(params:any)=>evaluateSchemas({...params,...capture},undefined,capturedContext()):evaluateSchemas, standardResource, deriveBundle, referenceDisplay:referenceDisplayPacket, referenceDocument, requestOperation, semanticDiffCoverage, planResponseExample, propose, discover, inspect, readDataValue, schemaTree, referenceChoices, planReference, referencePage, planRename, planPropertyRename, planResponseRename, planSchemaDefinitionRename, planDelete, planExtract, planInline, planMoveDefinition, planFileMove, planFileDeletion, planDiagnosticFix, assistSource, sourceFolds, semanticSearch, suggestSchema, planSchemaSuggestion,
        discoverPolicy,inspectPolicyCode,policyRuntime,
        resolvePolicyCode:async(params:any)=>(await import('./policy_code_resolution')).resolvePolicyCode(params),
        reviewPolicyCode:async(params:any)=>(await import('./policy_code_review')).reviewPolicyCode(params),
        govern:async(params:any)=>(await import('./governance')).govern(params),
        normalizeResourceUris,
        requestParameterValues,
        requestFormDataValues,
        requestMimeTextBytes,
        requestFormMediaTypes,
        requestMultipartEncoding,
        requestFormBytes,
        requestInputPreparation,
        mockFormBytes:capture?(params:any)=>mockFormBytes({...params,...capture},capturedContext()):mockFormBytes,
        mockMultipartBytes:capture?(params:any)=>mockMultipartBytes({...params,...capture},capturedContext()):mockMultipartBytes,
        requestRawMediaBytes,
        planExecutionCase,
        requestContentParameters,
        requestMediaBytes,
        responseStreamOpen:capture?(params:any)=>responseStreamOpen({...params,...capture},capturedContext()):responseStreamOpen,
        responseStreamChunk,
        responseStreamClose,
        requestMultipartPlan,
        requestMultipartAppend,
        executionCaseValues,
        inspectExecutionJson,
        planExecutionEnvironment,
        describeResourcePackage,
        planOperationMove,
        planExtractToFile,
        planYamlOwnership,
        planRootRemoval,
    };
    parentPort!.on('message', async (request: any) => {
        const reply = (message: any) => {
            const payload = encode({ id: request.id, snapshot: capture?.snapshot??request.params?.snapshot, ...message });
            parentPort!.postMessage(workerData?.streaming?{id:request.id,payload,closed:!responseStreamOwned(request.params?.stream)}:payload, [payload.buffer as ArrayBuffer]);
        };
        try {
            const method = Object.hasOwn(methods, request.method) ? methods[request.method] : undefined;
            if (!method)
                throw Error('Unknown method');
            const result = await method(request.params);
            reply({ ok: true, result });
        }
        catch (e: any) {
            reply({ ok: false, error: { code: e.code ?? 'engine.failure', message: e.message ?? 'Engine failure', range: e.range,...(e instanceof SourceError?{kind:e.kind,source:e.source}:{}) } });
        }
    });
}
else {
    let bytes = Buffer.alloc(0);
    const write = (payload: Uint8Array) => { const header = Buffer.alloc(4); header.writeUInt32BE(payload.byteLength); process.stdout.write(header); process.stdout.write(payload); };
    const send = (message: any) => write(encode(message));
    const dispatcher = new WorkerDispatcher(
        request => request.method==='govern'&&request.params?.policy?.execution?
            new PolicyProcessWorker({launcher:join(__dirname,'policy-launcher'),node:process.execPath,helper:join(__dirname,'policy-worker.cjs')}):
            new Worker(request.method === 'planMigration' ? join(__dirname, 'conversion-worker.cjs') : __filename, {workerData:{streaming:request.method.startsWith('responseStream')},resourceLimits: {maxOldGenerationSizeMb:512,stackSizeMb:8}}),write,
        (id,code,message)=>send({id,ok:false,error:{code,message}}),MAX,
        request=>request.method==='govern'&&request.params?.policy?.execution?'isolated-policy':request.method==='planMigration'?'conversion':'standard');
    const controlFailure=(id:string)=>send({id,ok:false,error:{code:'worker.stop',message:'Cannot complete contract worker termination'}});
    process.stdin.on('data', (data) => {
        bytes = Buffer.concat([bytes, data]);
        if (bytes.length > MAX + 4) {
            process.exitCode = 3;
            process.stdin.destroy();
            return;
        }
        while (bytes.length >= 4) {
            const length = bytes.readUInt32BE();
            if (length > MAX || length < 2) {
                process.exitCode = 3;
                process.stdin.destroy();
                return;
            }
            if (bytes.length < length + 4)
                return;
            let request: any;
            try {
                request = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(4, 4 + length)));
            }
            catch {
                process.exitCode = 3;
                process.stdin.destroy();
                return;
            }
            bytes = bytes.subarray(4 + length);
            const { id, method, params } = request;
            if (request.protocol !== protocol || typeof id !== 'string') {
                send({ id, ok: false, error: { code: 'protocol.mismatch', message: 'IPC version or identity mismatch' } });
                continue;
            }
            if (method === 'hello') {
                send({ id, ok: true, result: { protocol, engineVersion, nodeVersion: process.versions.node, offsetUnit: 'utf16', range: 'half-open', lineBase: 1, columnBase: 1, bom: 'excluded', lineEndings: 'raw' } });
                continue;
            }
            if (method === 'cancel') {
                if(typeof params?.id!=='string') {send({id,ok:false,error:{code:'protocol.cancel',message:'Choose a request identity'}});continue;}
                dispatcher.stop(params.id).then(()=>send({ id, ok: true, result: { cancelled: params.id } }),()=>controlFailure(id));
                continue;
            }
            if (method === 'shutdown') {
                dispatcher.close().then(() => { send({ id, ok: true, result: { stopped: true } }); process.stdin.destroy(); },()=>controlFailure(id));
                continue;
            }
            dispatcher.submit({id,method,params});
        }
    });
    process.stdin.on('end', () => {
        if (bytes.length)
            process.exitCode = 3;
        void dispatcher.close().catch(()=>{process.exitCode=3;});
    });
    process.stdin.on('close', () => {
        void dispatcher.close().catch(()=>{process.exitCode=3;});
    });
}
