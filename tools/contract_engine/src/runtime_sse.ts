export type SseState={data:string[];event?:string;id?:string;retry?:string};
/** WHATWG dispatch state is shared with the finite decoder. IDs and retry
 * settings persist; a data/event buffer is reset at every empty line. */
export function sseLine(state:SseState,line:string):string|undefined {
 if(line===''){
  const value=state.data.length?'{"data":'+JSON.stringify(state.data.join('\n'))+(state.event!==undefined?',"event":'+JSON.stringify(state.event||'message'):'')+(state.id!==undefined?',"id":'+JSON.stringify(state.id):'')+(state.retry!==undefined?',"retry":'+state.retry:'')+'}':undefined;
  state.data=[];delete state.event;return value;
 }
 if(line.startsWith(':'))return;
 const colon=line.indexOf(':'),name=colon<0?line:line.slice(0,colon);let value=colon<0?'':line.slice(colon+1);if(value.startsWith(' '))value=value.slice(1);
 if(name==='data')state.data.push(value);else if(name==='event')state.event=value;
 else if(name==='id'&&!value.includes('\0'))state.id=value;
 else if(name==='retry'&&/^[0-9]+$/.test(value))state.retry=value.replace(/^0+(?=\d)/,'');
}
