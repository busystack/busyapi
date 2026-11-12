import {SourceDocument,SourceError} from './document';
import {SourcePlan} from './source_plan';

type Specialization=Readonly<{document:SourceDocument;changed:readonly string[]}>;

/** Rendered strings use the same captured YAML token owner as schema/native
 * specialization and reviewed refactoring. Ordinary source writes retain their
 * guards. The complete exact-value projection permits only requested logical
 * strings to change, including independently interpreted alias occurrences. */
export function specializeMigrationText(doc:SourceDocument,requested:ReadonlyMap<string,string>):Specialization {
    const desired=new Map([...requested].filter(([pointer,value])=>doc.dataNode(pointer)?.value!==value));
    if(!desired.size)return {document:doc,changed:[]};
    const fail=(pointer:string,message:string):never=>{
        const range=doc.dataNode(pointer)?.range??doc.root.range;
        throw new SourceError('migration.text.ownership',message,range,'unsupported',{resource:doc.id,pointer,range});
    };
    if(desired.size>4096)throw new SourceError('limit.migration.text','Shared documentation needs more than 4096 localized replacements');
    let bytes=0,work=0;
    for(const [pointer]of desired){
        if(typeof doc.dataNode(pointer)?.value!=='string'||!doc.dataSyntaxSafe(pointer))
            fail(pointer,'The documentation specialization has no unambiguous captured string occurrence');
    }
    const expected=doc.dataJson('',(_node,occurrence)=>desired.has(occurrence)?JSON.stringify(desired.get(occurrence)):undefined);
    const source=new SourcePlan(doc),changed=new Set<string>();
    for(const [pointer,value]of desired){
        if((work+=source.doc.text.length*2)>128*1024*1024)
            throw new SourceError('limit.migration.text','Shared documentation exceeds its bounded CST edit work');
        const previous=source.presentationChanges.length,before=source.doc;
        source.own(pointer,false);
        for(const at of source.presentationChanges.slice(previous))if(before.nodes.get(at)?.alias)
            bytes+=Buffer.byteLength(before.dataJson(at));
        const node=source.doc.node(pointer);
        bytes+=Buffer.byteLength(source.doc.emit(value,node,node.flow));
        if(bytes>8*1024*1024)throw new SourceError('limit.migration.text','Shared documentation replacements exceed 8 MiB');
        source.set(pointer,value);
        for(const at of source.presentationChanges.slice(previous))changed.add(at);
        changed.add(pointer);
        if(changed.size>4096)throw new SourceError('limit.migration.text','Shared documentation needs more than 4096 localized replacements');
    }
    if(source.doc.issues.length||source.doc.dataJson('')!==expected)
        fail(desired.keys().next().value!,'The shared documentation mapping changed another exact data value');
    return {document:source.doc,changed:[...changed]};
}
