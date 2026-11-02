import {SourceError} from './document';

/** Combination is a property of a field's definition, not its absence from a
 * singleton denylist. RFC 9110 Appendix A supplies these list productions;
 * Cache-Control/Pragma are RFC 9111 5.2/5.4, Transfer-Encoding RFC 9112 6.1 and Link
 * RFC 8288 3. Set-Cookie retains RFC 6265's separate field lines. */
const listFields=new Set([
    'accept','accept-charset','accept-encoding','accept-language','accept-ranges','allow',
    'authentication-info','connection','content-encoding','content-language','expect',
    'if-match','if-none-match','proxy-authenticate','proxy-authentication-info',
    'te','trailer','upgrade','vary','via','www-authenticate',
    'cache-control','pragma','transfer-encoding','link',
]);
const singletonFields=new Set([
    'authorization','content-length','content-location','content-range','content-type',
    'date','etag','from','host','if-modified-since','if-range','if-unmodified-since',
    'last-modified','location','max-forwards','proxy-authorization','range','referer',
    'retry-after','server','user-agent',
    // RFC 9111 5.1/5.3, RFC 2045, RFC 7578 4.2 and RFC 6265 4.2.1.
    'age','expires','mime-version','content-transfer-encoding','content-disposition','cookie',
]);

/** A private decoding view only. Callers retain the original ordered lines
 * and bytes. Unknown repeated extensions cannot establish either a valid
 * comma combination or an invalid message without their field definition. */
export function httpFieldLines(name:string,values:readonly string[]):readonly string[] {
    if(values.length<=1)return values;
    const lower=name.toLowerCase();
    if(lower==='set-cookie')return values;
    if(listFields.has(lower)){
        if(['if-match','if-none-match'].includes(lower)&&values.some(value=>value.trim()==='*'))
            throw new SourceError('runtime.header.repeated','A wildcard conditional field cannot be combined with another field line');
        return [values.map(value=>value.replace(/^[ \t]+|[ \t]+$/gu,'')).join(', ')];
    }
    if(singletonFields.has(lower))throw new SourceError('runtime.header.repeated',
        'This field definition does not permit repeated field lines');
    throw new SourceError('runtime.header.unchecked',
        'Repeated field lines are retained; their field definition does not establish a supported combination',[0,0],'unsupported');
}
