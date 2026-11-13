#!/usr/bin/python3
"""Run the plain two-field fixture through the existing owned-window driver.

Build tools/repro_two_fields.dart with the official editor profile first.
BUSYAPI_PLAIN_BINARY selects that executable; BUSYAPI_PLAIN_EVIDENCE must name a
new private output directory. Optional BUSYAPI_PLAIN_PRELOAD and
BUSYAPI_PLAIN_SYNC_MODE affect only the diagnostic application, never the user
session. Default native behavior remains the acceptance authority.
"""
import ast
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
from native_focus import private_session_command, private_session_environment, restore_native_environment, validate_private_accessibility_address, wait_for_initial_focus
from test_openapi_application import NativeInput, Gdk, tree, field_matches, letters
if '--session' not in sys.argv:
    with tempfile.TemporaryDirectory(prefix='busyapi-input-probe-bus-') as runtime:
        env=dict(os.environ,BUSYAPI_NATIVE_DESKTOP_BUS=os.environ['DBUS_SESSION_BUS_ADDRESS'])
        result=subprocess.run([*private_session_command(runtime),sys.executable,__file__,'--session'],env=private_session_environment(env,runtime),timeout=40)
        sys.exit(result.returncode)
response=subprocess.run(['gdbus','call','--session','--dest','org.a11y.Bus','--object-path','/org/a11y/bus','--method','org.a11y.Bus.GetAddress'],capture_output=True,text=True,check=True,timeout=10)
address=ast.literal_eval(response.stdout)[0]
validate_private_accessibility_address(address,os.environ)
restore_native_environment(os.environ)
os.environ['AT_SPI_BUS_ADDRESS']=address
assert Gdk.init_check([])[0]
root=Path(__file__).resolve().parent.parent
binary=os.environ.get('BUSYAPI_PLAIN_BINARY',str(root/'build/linux/x64/debug/bundle/busyapi-desktop'))
evidence=Path(os.environ['BUSYAPI_PLAIN_EVIDENCE']).resolve()
if not evidence.is_absolute() or evidence.exists():raise RuntimeError('Choose a new absolute private evidence directory')
evidence.mkdir(mode=0o700,parents=True)
stream=(evidence/'application.log').open('w')
environment=dict(os.environ)
if os.environ.get('BUSYAPI_PLAIN_PRELOAD'):environment['LD_PRELOAD']=os.environ['BUSYAPI_PLAIN_PRELOAD']
if os.environ.get('BUSYAPI_PLAIN_SYNC_MODE'):environment['IBUS_ENABLE_SYNC_MODE']=os.environ['BUSYAPI_PLAIN_SYNC_MODE']
with subprocess.Popen([binary],start_new_session=True,stdout=stream,stderr=subprocess.STDOUT,env=environment) as process:
    native=None
    try:
        native=NativeInput(process.pid)
        wait_for_initial_focus(native.ready,timeout=8)
        deadline=time.monotonic()+8
        while not field_matches(tree(process.pid,True),'Title',focused=True):
            native.ready()
            if time.monotonic()>deadline:raise RuntimeError('Probe title did not acquire focus')
            time.sleep(.05)
        native.perform({'kind':'keys','chords':['Control_L+a']+letters('edited 3.2.1')+['Tab']})
        time.sleep(1)
        nodes=tree(process.pid,True)
        controls=[v for v in nodes if v.get('name') in ['Title','API version']]
        import hashlib
        report={'expected':'edited 3.2.1','controls':controls,'correct':field_matches(nodes,'Title',value='edited 3.2.1'),
                'binary':binary,'compiledArtifacts':{name:hashlib.sha256((Path(binary).parent/name).read_bytes()).hexdigest() for name in ['busyapi-desktop','data/flutter_assets/kernel_blob.bin','lib/libapp.so'] if (Path(binary).parent/name).is_file()},
                'sequence':['Control_L+a']+letters('edited 3.2.1')+['Tab'],
                'environment':{key:environment.get(key) for key in ['GTK_IM_MODULE','IBUS_ADDRESS','IBUS_ENABLE_SYNC_MODE','XMODIFIERS','DISPLAY','XDG_SESSION_TYPE']}}
        (evidence/'result.json').write_text(json.dumps(report,indent=2)+'\n')
        (evidence/'maps.txt').write_text(Path(f'/proc/{process.pid}/maps').read_text())
        print(json.dumps(report),flush=True)
        assert field_matches(nodes,'Title',value='edited 3.2.1'), 'Plain official-SDK TextFormField lost input'
    finally:
        if native:native.close()
        process.terminate()
        try:process.wait(timeout=5)
        except subprocess.TimeoutExpired:process.kill();process.wait(timeout=5)
