import {SourceError,type Range} from './document';
import {relocateSharedMarkdownLinks,type MarkdownContext} from './markdown_relocation';

/** Maintenance uses the same source-span/AST proof as migration. Preserve a
 * source-located refactoring failure rather than exposing another operation's
 * diagnostic namespace or claiming an incomplete mapping succeeded. */
export function relocateRefactoringMarkdown(value:string,from:string,to:string,source:{resource:string;pointer:string;range:Range},contexts:readonly MarkdownContext[]=[{from,to}]):string {
    try{return relocateSharedMarkdownLinks(value,contexts);}
    catch(error){
        if(!(error instanceof SourceError))throw error;
        throw new SourceError(error.code.startsWith('limit.')?'limit.refactor.markdown':error.code==='migration.description.shared-context'?'refactor.markdown.context':'refactor.markdown.mapping',error.message,source.range,'unsupported',source);
    }
}

/** Accumulate original interpretations, never repairs of already repaired text.
 * Each accepted spelling re-proves all earlier roots as well as the new root. */
export class RefactoringMarkdownOwners {
    private readonly owners=new Map<string,{value:string;contexts:MarkdownContext[]}>();
    relocate(key:string,value:string,from:string,to:string,source:{resource:string;pointer:string;range:Range}):string {
        let owner=this.owners.get(key);
        if(!owner){owner={value,contexts:[]};this.owners.set(key,owner);}
        if(owner.value!==value)throw new SourceError('refactor.markdown.ownership','One destination has different original Markdown values',source.range,'unsupported',source);
        if(!owner.contexts.some(context=>context.from===from&&context.to===to))owner.contexts.push({from,to});
        return relocateRefactoringMarkdown(value,from,to,source,owner.contexts);
    }
}
