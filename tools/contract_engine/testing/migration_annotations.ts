import {AnnotationsPlugin,BasicOutputPlugin,BASIC,setOutputFormat} from '@hyperjump/json-schema/experimental';
import {evaluateSchemas} from '../src/schema_evaluation';

/** Prepared regression oracle: the production evaluator and the pinned public
 * annotation plugin share this bundle. Production output/validation is not
 * changed, and the normal diagnostic handler is restored after every capture. */
export async function evaluateMigrationAnnotations(input:Parameters<typeof evaluateSchemas>[0]){
    const captures:AnnotationsPlugin[]=[];
    setOutputFormat(BASIC,()=>{
        const errors=new BasicOutputPlugin(),annotations=new AnnotationsPlugin();captures.push(annotations);
        const plugin={id:'urn:busyapi:test:migration-annotations',
            beforeSchema(...args:any[]){(annotations.beforeSchema as any)(...args);},
            afterKeyword(...args:any[]){(errors.afterKeyword as any)(...args);(annotations.afterKeyword as any)(...args);},
            afterSchema(...args:any[]){(errors.afterSchema as any)(...args);(annotations.afterSchema as any)(...args);},
        };
        return {plugin,getErrors:()=>errors.errors};
    });
    try {
        const checked=await evaluateSchemas(input),count=input.runtimeInstances?.length??0;
        const annotations=(count?captures.slice(-count):[]).map((plugin,index)=>checked.runtimeEvaluations[index]?.valid!==true?[]:plugin.annotations
            .filter(value=>/\/(description|title|default|examples)$/.test(value.keyword))
            .map(value=>JSON.stringify([value.keyword,new URL(value.instanceLocation).hash,value.annotation])).sort());
        return {checked,annotations};
    }finally{
        setOutputFormat(BASIC,()=>{const plugin=new BasicOutputPlugin();return {plugin,getErrors:()=>plugin.errors};});
    }
}
