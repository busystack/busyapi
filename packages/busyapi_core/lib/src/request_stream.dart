part of 'request.dart';

/// Stop retains the owned capture and proved items. Cancellation keeps its
/// separate project/request ownership semantics.
class ContractStreamControl {
  ContractStreamControl({this.stopAfterRecords}) {if(stopAfterRecords!=null&&(stopAfterRecords! < 1 || stopAfterRecords! > 1000000000))throw CoreFailure('request.stream.stop','Choose a positive bounded stop record count.');}
  final int? stopAfterRecords;
  final _stopped = Completer<void>();
  bool get stopped => _stopped.isCompleted;
  Future<void> get whenStopped => _stopped.future;
  void stop() { if (!stopped) _stopped.complete(); }
}

class ContractStreamSnapshot {
  const ContractStreamSnapshot({required this.runId,required this.status,required this.receivedBytes,required this.decodedBytes,
    required this.records,required this.validRecords,required this.invalidRecords,required this.uncheckedRecords,
    required this.evidence,required this.findings,required this.complete,required this.valid,required this.wholeAvailable,
    required this.terminal,this.wholeResolvableRecords=0,this.itemProofAvailable=false,this.itemsComplete=false,this.framingComplete=false,this.schemaProducerName='',this.schemaProducerVersion='',this.schemaConfiguration='',this.reason,this.bodyFile});
  final String runId,status,schemaProducerName,schemaProducerVersion,schemaConfiguration;
  final String? reason,bodyFile;
  final int receivedBytes,decodedBytes,records,validRecords,invalidRecords,uncheckedRecords,wholeResolvableRecords;
  final List<Map<String,Object?>> evidence,findings;
  final bool complete,valid,wholeAvailable,terminal,itemsComplete,framingComplete,itemProofAvailable;
  ContractStreamSnapshot withWholeResult(bool checked,bool wholeValid,{bool bodyChecked=false}) {
    final resolved=valid&&bodyChecked&&checked&&wholeValid&&terminal&&reason==null&&framingComplete;
    final discharged=resolved?wholeResolvableRecords:0;
    final remaining=uncheckedRecords-discharged;
    final allItems=itemsComplete||itemProofAvailable&&remaining==0&&terminal&&reason==null&&framingComplete;
    return ContractStreamSnapshot(runId:runId,
      status:reason=='stopped'?'stopped':!valid||checked&&!wholeValid?'invalid':allItems&&checked?'complete':'incomplete',
      receivedBytes:receivedBytes,decodedBytes:decodedBytes,records:records,validRecords:validRecords+discharged,invalidRecords:invalidRecords,uncheckedRecords:remaining,
      wholeResolvableRecords:resolved?0:wholeResolvableRecords,itemProofAvailable:itemProofAvailable,
      evidence:[for(final item in evidence) resolved&&item['wholeResolvable']==true?{...item,'complete':true,'valid':true,'resolvedBy':'complete-content-evaluation'}:item],
      findings:[for(final finding in findings) resolved&&finding['wholeResolvable']==true?{...finding,'severity':'information','provisional':true,'resolvedBy':'complete-content-evaluation'}:finding],
      complete:allItems&&checked,valid:valid&&(!checked||wholeValid),wholeAvailable:checked,terminal:terminal,itemsComplete:allItems,framingComplete:framingComplete,
      schemaProducerName:schemaProducerName,schemaProducerVersion:schemaProducerVersion,schemaConfiguration:schemaConfiguration,reason:reason,bodyFile:bodyFile);
  }

  ContractStreamSnapshot redacted(Set<String> secrets) {
    Object? clean(Object? value) {
      if (value is String) {
        var text = value;
        for (final secret in secrets) {
          if (secret.isNotEmpty) text = text.replaceAll(secret, '[REDACTED]');
        }
        return text;
      }
      if (value is List) return value.map(clean).toList();
      if (value is Map) {
        return {for (final entry in value.entries) entry.key: clean(entry.value)};
      }
      return value;
    }
    return ContractStreamSnapshot(runId:runId,status:status,receivedBytes:receivedBytes,decodedBytes:decodedBytes,records:records,validRecords:validRecords,invalidRecords:invalidRecords,uncheckedRecords:uncheckedRecords,wholeResolvableRecords:wholeResolvableRecords,itemProofAvailable:itemProofAvailable,
      evidence:[for(final item in evidence) Map<String,Object?>.from(clean(item) as Map)],findings:[for(final item in findings) Map<String,Object?>.from(clean(item) as Map)],complete:complete,valid:valid,wholeAvailable:wholeAvailable,terminal:terminal,itemsComplete:itemsComplete,framingComplete:framingComplete,schemaProducerName:schemaProducerName,schemaProducerVersion:schemaProducerVersion,schemaConfiguration:schemaConfiguration,reason:reason,bodyFile:bodyFile);
  }
  Map<String,Object?> toJson() => {'producer':'busyapi-incremental-stream','producerVersion':'1','status':status,'terminal':terminal,
    'schemaProducer':{'name':schemaProducerName,'version':schemaProducerVersion,'configuration':schemaConfiguration},
    'complete':complete,'framingComplete':framingComplete,'valid':complete&&valid,'observedInvalid':!valid,'receivedBytes':receivedBytes,'decodedBytes':decodedBytes,'records':records,
    'validRecords':validRecords,'invalidRecords':invalidRecords,'uncheckedRecords':uncheckedRecords,
    'wholeContent':wholeAvailable?'available':'requires-complete-content',if(reason!=null)'reason':reason,
    'items':[for(final item in evidence) {for(final entry in item.entries) if(entry.key!='data') entry.key:entry.value}],
    'findings':findings};
}

class _StreamOutputSink implements Sink<List<int>> {
  final chunks=<List<int>>[];
  int queued=0;
  @override
  void add(List<int> bytes) {
    queued+=bytes.length;
    if(queued>2*1024*1024) throw CoreFailure('limit.stream.decoder.queue','A decoder burst exceeds the 2 MiB output queue.');
    chunks.add(Uint8List.fromList(bytes));
  }
  @override
  void close() {}
  List<List<int>> take() {final result=List<List<int>>.of(chunks);chunks.clear();queued=0;return result;}
}
class _StreamGzipLayer {
  _StreamGzipLayer() {input=gzip.decoder.startChunkedConversion(output);}
  final output=_StreamOutputSink();
  late final Sink<List<int>> input;
  List<int> tail=[];
  int decoded=0;
}

class _StreamEvaluationLease {
  final token=RunCancellation();
  bool retired=false;
  void Function()? unsubscribe;
  void retire() {if(retired)return;retired=true;unsubscribe?.call();unsubscribe=null;token.cancel();}
}

/// Uses the existing SDK codecs and the transport's one awaited storage slot.
/// Only framing continuations and bounded evidence cross the Engine boundary.
class _LiveResponseStream {
  _LiveResponseStream(this.request,this.status,this.mediaType,this.control,this.observer,this.cancellation,this.maximumDecodedBytes,this.layers,this.deadline) {
    final lease=_lease;
    lease.unsubscribe=cancellation?.listen(() {if(!lease.retired)lease.token.cancel();});
    control?.whenStopped.then((_) {if(!lease.retired)lease.token.cancel();});
    deadline.stopped.future.then((_) {if(!lease.retired)lease.token.cancel();});
  }
  final PreparedContractRequest request;
  final int status,maximumDecodedBytes;
  final String mediaType;
  final ContractStreamControl? control;
  final FutureOr<void> Function(ContractStreamSnapshot)? observer;
  final RunCancellation? cancellation;
  final List<_StreamGzipLayer> layers;
  final _HttpDeadline deadline;
  final _lease=_StreamEvaluationLease();
  RunCancellation get evaluation=>_lease.token;
  void retire()=>_lease.retire();
  Map<String,dynamic>? state;
  final evidence=<Map<String,Object?>>[],findings=<Map<String,Object?>>[];
  int received=0,decoded=0,records=0,validRecords=0,invalidRecords=0,uncheckedRecords=0,wholeResolvableRecords=0,evidenceBytes=0,findingBytes=0;
  bool observedInvalid=false,terminal=false,framingComplete=false,wholeAvailable=false,binaryComplete=true,binaryValid=true;
  String? failure,terminalReason;
  String schemaProducerName='busyapi-runtime',schemaProducerVersion='1',schemaConfiguration='stream-proof-unavailable';
  bool get valid => invalidRecords==0&&binaryValid&&!observedInvalid;
  bool get itemsComplete => terminal&&terminalReason==null&&failure==null&&framingComplete&&uncheckedRecords==0&&binaryComplete;
  ContractStreamSnapshot get snapshot => ContractStreamSnapshot(runId:request.runId,status:!terminal?(valid?'active':'invalid'):terminalReason=='stopped'?'stopped':!valid?'invalid':'incomplete',
    receivedBytes:received,decodedBytes:decoded,records:records,validRecords:validRecords,invalidRecords:invalidRecords,uncheckedRecords:uncheckedRecords,wholeResolvableRecords:wholeResolvableRecords,itemProofAvailable:binaryComplete,
    evidence:List.unmodifiable(evidence),findings:List.unmodifiable(findings),complete:false,valid:valid,wholeAvailable:wholeAvailable,
    terminal:terminal,itemsComplete:itemsComplete,framingComplete:framingComplete,schemaProducerName:schemaProducerName,schemaProducerVersion:schemaProducerVersion,schemaConfiguration:schemaConfiguration,reason:terminalReason??failure);

  static Future<_LiveResponseStream?> open(PreparedContractRequest request,int status,List<(String,String)> headers,ContractStreamControl? control,FutureOr<void> Function(ContractStreamSnapshot)? observer,RunCancellation? cancellation,int maximum,_HttpDeadline deadline) async {
    if(!_responseBodyPermitted(request.method,status))return null;
    final types=headers.where((field)=>field.$1.toLowerCase()=='content-type').toList();if(types.length!=1)return null;
    final type=types.single.$2;
    final responses=(request.plan.result['responses'] as List).whereType<Map>();
    final declaration=responses.where((value)=>value['status']=='$status').firstOrNull??responses.where((value)=>value['status']=='${status~/100}XX').firstOrNull??responses.where((value)=>value['status']=='default').firstOrNull;
    final media=selectDeclaredMedia((declaration?['content'] as List? ?? const []).whereType<Map>(),type);
    if(media?['incremental']!=true)return null;
    final encodings=headers.where((field)=>field.$1.toLowerCase()=='content-encoding').expand((field)=>field.$2.split(',')).map((value)=>value.trim().toLowerCase()).where((value)=>value!='identity').toList();
    if(encodings.length>8||encodings.any((value)=>value!='gzip'))return null;
    final live=_LiveResponseStream(request,status,type,control,observer,cancellation,maximum,[],deadline);
    try {final initial=await request.plan.responseStreamChunk(status,type,const [],null,runId:request.runId,cancellation:live.evaluation);
      if(initial['supported']!=true){live.retire();return null;}
      live.accept(initial);live.layers.addAll([for(final _ in encodings) _StreamGzipLayer()]);await live.publish();return live;
    } on CoreFailure catch(error) {
      if(error.code=='cancelled'&&control?.stopped==true){live.terminalReason='stopped';return live;}
      if(error.code=='cancelled'){live.retire();if(deadline.reason!=null)deadline.failure();rethrow;}
      live.failure=error.code;live.note({'code':error.code,'message':error.message,'severity':'warning','subject':'response-body',if(error.source!=null)'source':{'resource':error.source!.resource,'pointer':error.source!.pointer,'range':[error.source!.range.start,error.source!.range.end]}});await live.publish();return live;
    }
  }
  void accept(Map<String,dynamic> value) {
    schemaProducerName=value['producer'] as String;schemaProducerVersion=value['producerVersion'] as String;schemaConfiguration=value['configuration'] as String;
    state=Map<String,dynamic>.from(value['state'] as Map);framingComplete=value['framingComplete']==true;
    wholeAvailable=value['wholeAvailable']==true;binaryComplete=value['binaryComplete']==true;binaryValid=value['binaryValid']==true;
    for(final raw in value['records'] as List){
      final item=Map<String,Object?>.from(raw as Map);if(item['index']!=records)throw CoreFailure('runtime.stream.protocol','A stream item was omitted, repeated or reordered.');records++;
      if(item['complete']!=true){uncheckedRecords++;if(item['wholeResolvable']==true)wholeResolvableRecords++;}else if(item['valid']==true)validRecords++;else invalidRecords++;
      final size=jsonEncode(item).length*2;
      if(size<=1024*1024){evidence.add(item);evidenceBytes+=size;while(evidence.length>128||evidenceBytes>1024*1024){evidenceBytes-=jsonEncode(evidence.removeAt(0)).length*2;}}
      for(final finding in item['findings'] as List) note(Map<String,Object?>.from(finding as Map));
    }
    for(final finding in value['findings'] as List? ?? const []) note(Map<String,Object?>.from(finding as Map));
    if(value['failure'] case final Map problem){failure=problem['code'] as String;note({'code':failure,'message':problem['message'],'severity':problem['kind']=='unsupported'||failure!.startsWith('limit.')?'warning':'error','subject':'response-body'});}
    if(control?.stopAfterRecords case final int limit) {if(records>=limit)control!.stop();}
  }
  void note(Map<String,Object?> value) {
    if(value['severity']=='error')observedInvalid=true;
    final bytes=jsonEncode(value).length*2;
    if(findings.length<200&&findingBytes+bytes<=1024*1024){findingBytes+=bytes;findings.add(Map.unmodifiable(value));}
  }
  Future<void> publish() async {await observer?.call(snapshot);}
  Future<void> evaluate(List<int> bytes,{bool end=false}) async {
    final remaining=control?.stopAfterRecords;
    int maximum() => remaining==null?128:min(128,max(1,remaining-records));
    var result=await request.plan.responseStreamChunk(status,mediaType,bytes,state,end:end,maximumRecords:maximum(),runId:request.runId,cancellation:evaluation);accept(result);
    while(result['pending']==true&&failure==null&&control?.stopped!=true){result=await request.plan.responseStreamChunk(status,mediaType,const [],state,end:end,maximumRecords:maximum(),runId:request.runId,cancellation:evaluation);accept(result);}
  }
  Future<void> leaf(List<int> bytes) async {
    for(var offset=0;offset<bytes.length;offset+=65536){
      cancellation?.throwIfCancelled();if(control?.stopped==true||failure!=null)return;
      final chunk=bytes.sublist(offset,min(offset+65536,bytes.length));decoded+=chunk.length;
      if(decoded>maximumDecodedBytes){failure='decoded-size-limit';return;}
      await evaluate(chunk);
    }
  }
  Future<void> drainLayer(int index) async {
    final layer=layers[index];
    for(final chunk in layer.output.take()){
      layer.decoded+=chunk.length;if(layer.decoded>maximumDecodedBytes)throw CoreFailure('decoded-size-limit','A decoded stream layer exceeds its byte bound.');
      await feed(index+1,chunk);
    }
  }
  Future<void> feed(int index,List<int> bytes) async {
    if(index==layers.length){await leaf(bytes);return;}
    final layer=layers[index];
    for(var offset=0;offset<bytes.length;offset+=1024){
      if(control?.stopped==true||failure!=null)return;
      final value=[...layer.tail,...bytes.sublist(offset,min(offset+1024,bytes.length))],end=max(0,value.length-2);var start=0;
      // Same received-only member boundary workaround as _gzipMemberChunks.
      for(var at=0;at+2<value.length;at++)if(value[at]==31&&value[at+1]==139&&value[at+2]==8){if(at>start){layer.input.add(value.sublist(start,at));await drainLayer(index);}start=at;}
      if(start<end){layer.input.add(value.sublist(start,end));await drainLayer(index);}layer.tail=value.sublist(end);
    }
  }
  Future<void> add(List<int> bytes,int receivedCount) async {
    received=receivedCount;
    try{await feed(0,bytes);}
    on CoreFailure catch(error){if(error.code=='cancelled'){terminalReason=control?.stopped==true?'stopped':deadline.reason??'cancelled';return;}failure=error.code;note({'code':error.code,'message':error.message,'severity':'warning','subject':'response-body'});}
    on Object {failure='malformed-content-encoding';note({'code':failure,'message':'Incremental content decoding failed. Original bytes remain retained.','severity':'error','subject':'response-body'});}
    await publish();
  }
  Future<void> finish(bool ended,String? reason) async {
    terminalReason=reason??terminalReason;
    if(ended&&failure==null&&cancellation?.cancelled!=true&&control?.stopped!=true){
      try {
        for(var index=0;index<layers.length;index++){final layer=layers[index];if(layer.tail.isNotEmpty)layer.input.add(layer.tail);layer.input.close();await drainLayer(index);}
        if(failure==null&&control?.stopped!=true)await evaluate(const [],end:true);
      } on CoreFailure catch(error) {
        if(error.code=='cancelled')terminalReason=control?.stopped==true?'stopped':deadline.reason??'cancelled';
        else {failure=error.code;note({'code':error.code,'message':error.message,'severity':'warning','subject':'response-body'});}
      } on Object {failure='runtime.stream.finalization';note({'code':failure,'message':'Stream framing or content decoding did not finish.','severity':'error','subject':'response-body'});}
    }
    if(control?.stopped==true)terminalReason='stopped';
    if(!ended&&terminalReason==null)terminalReason='incomplete-receipt';
    if(!ended&&terminalReason!=null)note({'code':'runtime.stream.incomplete','severity':'warning','subject':'response-body','reason':terminalReason,'message':terminalReason=='stopped'?'The user stopped this stream. Completed items remain checked; full-body conformance is unavailable.':'Streaming receipt was interrupted: $terminalReason. Completed item results remain retained.'});
    terminal=true;retire();await publish();
  }
}
