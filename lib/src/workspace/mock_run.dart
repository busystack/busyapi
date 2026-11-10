import 'dart:async';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:flutter/material.dart';

import '../app/busyapi_design.dart';
import '../app/busyapi_glyphs.dart';
import '../app/localization.dart';
import 'workspace_controller.dart';
import 'tool_surface.dart';

class MockRunController extends ChangeNotifier {
  MockRunController(this.workspace,{this.nodeExecutable,this.helper}) {
    workspace.addListener(_observe);
  }
  final WorkspaceController workspace;
  final String? nodeExecutable,helper;
  BusyProject? owner;
  String? _root;
  MockPlan? plan;
  MockRun? run;
  String phase = 'idle';
  String? failure;
  bool expanded = true, _disposed = false;
  int _epoch = 0;
  RunCancellation? cancellation;
  StreamSubscription<Map<String,Object?>>? _tunnels;
  final tunnelResults=<Map<String,Object?>>[];
  bool get busy =>
      phase == 'preparing' || phase == 'starting' || phase == 'stopping';
  bool get outdated => run?.outdated ?? plan?.outdated ?? false;
  void _notify() {
    if (!_disposed) notifyListeners();
  }

  void _observe() {
    if (owner != null &&
        (!identical(owner, workspace.project) || _root != workspace.root)) {
      clear();
    }
    if (run != null) _notify();
  }

  Future<void> prepare() async {
    final project = workspace.project, root = workspace.root;
    if (project == null || root == null || busy) return;
    final epoch = ++_epoch;
    owner = project;
    _root = root;
    phase = 'preparing';
    tunnelResults.clear();
    failure = null;
    expanded = true;
    plan?.close();
    plan = null;
    _notify();
    try {
      final captured = await project.prepareMock(
        root,
        requestId: 'native-mock-$epoch',
        cancelled: () => _disposed || epoch != _epoch,
      );
      if (_disposed ||
          epoch != _epoch ||
          !identical(project, workspace.project) ||
          workspace.root != root) {
        captured.close();
        return;
      }
      plan = captured;
      phase = 'ready';
    } on Object catch (error) {
      if (_disposed || epoch != _epoch) return;
      phase = error is CoreFailure && error.code == 'cancelled'
          ? 'cancelled'
          : 'failed';
      failure = error is CoreFailure ? error.code : 'mock.prepare';
    } finally {
      if (epoch == _epoch) _notify();
    }
  }

  Future<void> start({bool proxy = false}) async {
    final captured = plan;
    if (captured == null || busy || outdated || run != null) return;
    phase = 'starting';
    final epoch = ++_epoch, token = RunCancellation();
    cancellation = token;
    _notify();
    try {
      final started = await captured.start(
        nodeExecutable:nodeExecutable,helper:helper,
        proxyTarget: proxy ? captured.configuredProxyTarget() : null,
        cancellation: token,
      );
      if (_disposed || epoch != _epoch || !identical(captured, plan)) {
        await started.stop();
        return;
      }
      await _tunnels?.cancel();
      if(_disposed||epoch!=_epoch||!identical(captured,plan)){await started.stop();return;}
      run = started;
      tunnelResults.addAll(started.recentTunnels);while(tunnelResults.length>64){tunnelResults.removeAt(0);}
      _tunnels=started.tunnelEvents.listen((event){
        if(_disposed||epoch!=_epoch||!identical(captured,plan))return;
        tunnelResults.add(event);if(tunnelResults.length>64)tunnelResults.removeAt(0);_notify();
      });
      phase = 'running';
      unawaited(
        started.exitCode.then((code) {
          if (_disposed || epoch != _epoch || !identical(started, run)) return;
          run = null;
          phase = code == 0 ? 'stopped' : 'failed';
          if (code != 0) failure = 'mock.exited.$code';
          _notify();
        }),
      );
    } on Object catch (error) {
      if (_disposed || epoch != _epoch) return;
      phase = error is CoreFailure && error.code == 'cancelled'
          ? 'cancelled'
          : 'failed';
      failure = error is CoreFailure ? error.code : 'mock.start';
    } finally {
      if (epoch == _epoch) {
        cancellation = null;
        _notify();
      }
    }
  }

  Future<void> stop() async {
    final active = run;
    if (active == null) return;
    phase = 'stopping';
    _notify();
    await active.stop();
    if (identical(active, run)) {
      run = null;
      phase = 'stopped';
      _notify();
    }
  }

  Future<void> restart() async {
    final proxy = run?.upstreamForwarding ?? false;
    await stop();
    plan?.close();
    plan = null;
    await prepare();
    if (plan != null && !outdated) await start(proxy: proxy);
  }

  void cancel() => cancellation?.cancel();
  void toggle() {
    expanded = !expanded;
    _notify();
  }

  void clear() {
    ++_epoch;
    unawaited(_tunnels?.cancel());_tunnels=null;
    cancellation?.cancel();
    final active = run;
    run = null;
    if (active != null) unawaited(active.stop());
    plan?.close();
    plan = null;
    owner = null;
    _root = null;
    phase = 'idle';
    tunnelResults.clear();
    failure = null;
    _notify();
  }

  @override
  void dispose() {
    if (_disposed) return;
    _disposed = true;
    unawaited(_tunnels?.cancel());_tunnels=null;
    workspace.removeListener(_observe);
    cancellation?.cancel();
    final active = run;
    run = null;
    if (active != null) unawaited(active.stop());
    plan?.close();
    super.dispose();
  }
}

class MockRunPanel extends StatelessWidget {
  const MockRunPanel({super.key, required this.controller});
  final MockRunController controller;
  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: Listenable.merge([controller, controller.workspace]),
    builder: (context, _) {
      if (controller.phase == 'idle') return const SizedBox.shrink();
      final run = controller.run;
      final l = context.l10n;
      final canStart =
          controller.plan != null &&
          run == null &&
          !controller.busy &&
          !controller.outdated;
      final status = switch (controller.phase) {
        'preparing' => l.mockPreparing,
        'ready' => l.mockReady,
        'starting' => l.mockStarting,
        'running' => l.mockRunning,
        'stopping' => l.mockStopping,
        'stopped' => l.mockStopped,
        'cancelled' => l.requestCancelled,
        _ => l.mockFailed(controller.failure ?? 'mock.failure'),
      };
      return BusyApiToolSurface(
        title: l.mockRun,
        status: controller.outdated ? l.requestOutdated : status,
        expanded: controller.expanded,
        onToggle: controller.toggle,
        kind: controller.failure == null
            ? BusyApiStatusKind.information
            : BusyApiStatusKind.error,
        actions: [
          if (run != null)
            BusyApiCompactIconButton(
              tooltip: l.stopMock,
              icon: BusyApiGlyphs.clear,
              onPressed: controller.stop,
            ),
          if (controller.busy)
            BusyApiCompactIconButton(
              tooltip: l.cancel,
              icon: BusyApiGlyphs.clear,
              onPressed: controller.cancel,
            ),
        ],
        child: BusyApiGroupedList(
          children: [
            if (run != null)
              BusyApiActionRow(
                title: run.baseUri.toString(),
                subtitle: l.mockDetails(
                  run.toolVersion,
                  run.operations,
                  run.upstreamForwarding ? l.mockValidationProxy : l.mockRun,
                ),
              ),
            BusyApiActionRow(
              title: l.startMock,
              leading: const Icon(BusyApiGlyphs.play),
              enabled: canStart,
              onTap: canStart ? controller.start : null,
            ),
            BusyApiActionRow(
              title: l.startValidationProxy,
              enabled: canStart,
              onTap: canStart ? () => controller.start(proxy: true) : null,
            ),
            BusyApiActionRow(
              title: l.restartMock,
              enabled: !controller.busy,
              onTap: controller.busy ? null : controller.restart,
            ),
            if (controller.tunnelResults.isNotEmpty)
              BusyApiStatusBox(message:'CONNECT · ${switch(controller.tunnelResults.last['event']){'tunnel-established'=>'Established','tunnel-refused'=>'Refused',_=>'Ended'}} · ${controller.tunnelResults.last['reason']?.toString().replaceAll('-', ' ') ?? controller.tunnelResults.last['status'] ?? ''}',kind:controller.tunnelResults.last['event']=='tunnel-refused'?BusyApiStatusKind.warning:BusyApiStatusKind.information),
            if (run != null && run.errors.isNotEmpty)
              BusyApiStatusBox(
                message: run.errors,
                kind: controller.failure == null
                    ? BusyApiStatusKind.warning
                    : BusyApiStatusKind.error,
              ),
          ],
        ),
      );
    },
  );
}
