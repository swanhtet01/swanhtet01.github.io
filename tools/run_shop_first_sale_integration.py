#!/usr/bin/env python3
"""Guarded, one-shot first-sale integration runner; not release evidence."""
import argparse, hashlib, json, math, os, platform, re, selectors, shutil, signal, socket, stat, subprocess, sys, tempfile, time, uuid, zipfile
from pathlib import Path
import xml.etree.ElementTree as ET

BASE="13332897b3a62caed1000c3eff9b6a45b9660513"
BASE_TREE="0aaf1cbb3c35364c037eec2df0ea4ed1458b53fe"
BASE_NATIVE_TREE="3401cfa0ba36f3ae06d0105fa4d0a04e200bb4fc"
BASE_REF="codex/shop-main-integration-20261022"
BASE_SHA="4977d4caafa6921e83c97c950a154d3bd8aaf584"
APP=Path("mobile/shop_pos")
TEST=APP/"integration_test/first_sale_persistence_test.dart"
TEST_SHA="9967990406149a9cb09e5710ed55f1407b4cc9636e2c572358e52a74c22302fb"
PUB=APP/"pubspec.yaml"
PUB_SHA="228f2c2b2d1478d0546a80dbedf4c4393dd8d6700f01ff350b6ebe58a68c1f8a"
LOCK=APP/"pubspec.lock"
LOCK_SHA="772540b8f7fee17c0e7a9f0185c0366775ce5d61f7c94a5ab894beeb69605ccb"
IMAGE="system-images;android-35;default;x86_64"
TABLET_DEVICE_ID="medium_tablet"
TABLET_DEVICE_NAME="Medium Tablet"
TABLET_DEVICE_OEM="Generic"
IMAGE_REVISION="2"
IMAGE_ABI="x86_64"
IMAGE_API_LEVEL="35"
IMAGE_EXTENSION_LEVEL="13"
IMAGE_LICENSE="android-sdk-license"
IMAGE_ARCHIVE="x86_64-35_r02.zip"
IMAGE_ARCHIVE_SIZE=782404023
IMAGE_ARCHIVE_SHA1="2d857d170c0d1b827149565da34b3383e5306f7f"
IMAGE_MANIFEST_URL="https://dl.google.com/android/repository/sys-img/android/sys-img2-4.xml"
IMAGE_MANIFEST_SIZE=190717
IMAGE_MANIFEST_SHA256="3dcfa09ffd6f970ab344815e2d88020b31679fbfbcddb19bafa1821a5e16df08"
IMAGE_ARCHIVE_URL="https://dl.google.com/android/repository/sys-img/android/x86_64-35_r02.zip"
IMAGE_ARCHIVE_SHA256="6dd7de33e63ef105cf2fabea6badda1dbe7665c96d8908e5f6e1407e63ff4556"
IMAGE_EXPANDED_BYTES=1777735194
IMAGE_SHA256="8d7b29ad96c15adb663a5a8ced7f3ea40552019626f6a4420c54dc061f569970"
IMAGE_FILES = {
    "x86_64/NOTICE.txt": (5269365, "419fee21ab241b843823ff203d47485b72e2bbe65a1bc45049755918036b232d"),
    "x86_64/VerifiedBootParams.textproto": (356, "23273bc0eb2cf7b9f0792a14e9c6e9dcdf8a0111c0cab4c64c9b20633fec6cb6"),
    "x86_64/advancedFeatures.ini": (758, "b293a499caf9a3a2b0ba8e95fbc3d9113c8d3c33da27af59c6284e5f81119e5e"),
    "x86_64/build.prop": (4757, "ca6377120f658498f4e230829dfc862ece90dd6fd26ce608cc2d5e63830e16c8"),
    "x86_64/encryptionkey.img": (18874368, "522bd0b6a2c92e37de465059bb9487bb9597a9aae032b469a8ebe0b38146d8c3"),
    "x86_64/kernel-ranchu": (19137536, "a204606cf2f458540c5437e9ba804b5012acf0a2916d00f099a03e1e553e697e"),
    "x86_64/kernel_cmdline.txt": (32, "ec34f1f155caa37116a3396e454beefab1eed40b66d95027450a1e4dbb95b2ff"),
    "x86_64/ramdisk.img": (2141835, "60eb16b9c894514f3792c5bef9f58ea478bd1356f6e0fdb8045dca01ab903a30"),
    "x86_64/source.properties": (320, "98d57aac1a56bdff21e948a44332774d7f2127dc28fa413a85ad96bfb81cb7cb"),
    "x86_64/system.img": (1622147072, "8d7b29ad96c15adb663a5a8ced7f3ea40552019626f6a4420c54dc061f569970"),
    "x86_64/vendor.img": (110100480, "07a890bca988a65cd651edf340f1498d8ee3c2d0fe91659bc81425bcdd284750"),
    "x86_64/data/empty_data_disk": (107, "e4dc7c33a83013f3d9eb9b5a5693c912e83a9c7f978933b5c7600039dbfde903"),
    "x86_64/data/local.prop": (46, "49b05d093a46d35d85df01fb99133f077fcc725cc49efe1a1bedae884d24e20b"),
    "x86_64/data/misc/apns/apns-conf.xml": (6575, "c35b899f2b6296aee4a9742302651cce9eb64622669d4d8fe8d276ca11060eb6"),
    "x86_64/data/misc/emulator/version.txt": (112, "2f4ecb211f6b497d6011a75390fb0469ceaec4b816c10209198e43bafa57c695"),
    "x86_64/data/misc/emulator/config/radioconfig.xml": (1433, "534a81b662ad62fc70ec0ea22715670524a05a066afc9fdac8e7c0f5a7789cd7"),
    "x86_64/data/misc/modem_simulator/iccprofile_for_carrierapitests.xml": (16537, "dc4b5f5344f084fc44f89250bbcf2b12e452eb98c104e4ef3ec115366eb6ce32"),
    "x86_64/data/misc/modem_simulator/iccprofile_for_sim0.xml": (14647, "a2744726a306b18d7547251026201aa5c6a9e120aa1555992eeb8b0a3b4aa6d9"),
    "x86_64/data/misc/modem_simulator/iccprofile_for_sim_tel_alaska.xml": (14474, "462cc26ddaa9d6c470a2d9415771c80e323b526b1863f099accb298955b14db3"),
    "x86_64/data/misc/modem_simulator/etc/modem_simulator/files/numeric_operator.xml": (297, "c2557e604beea20b67642cdbb14ae7b792f804e4476b3f6cf47035690234f436"),
    "x86_64/data/misc/pixel_fold/display_settings.xml": (303, "2adca8f98a2c8ee0f780e10ca16587ac92641df5e93ab4437c3c47ad41b0041d"),
    "x86_64/data/misc/pixel_fold/extra_feature.xml": (829, "ba27b7a61457027e2a77917f8b07d716d3e918097901a14833749252b15aa38f"),
    "x86_64/data/misc/pixel_fold/devicestate/device_state_configuration.xml": (1644, "8bebf4943ed3fc50973ac428ab8c8c0d71700af81419f44fc95a59f52f873838"),
    "x86_64/data/misc/pixel_fold/displayconfig/display_layout_configuration.xml": (1311, "a64e2eca65bc2f9196215fb72a88c9035a584319f8b3da3606fff161be642be8"),
}
REPORT_PREFIX="SUPERMEGA_FIRST_SALE_REPORT:"
OUTPUT_LIMIT=8*1024*1024
REPORT_KEYS={
 "scenario","locale","productSeeded","explicitTestTapCalls","textEntryCalls",
 "appMainToSaleCompletionMilliseconds","appMainToFinalDatabaseAssertionsMilliseconds",
 "appMainToSavedReceiptAssertionsMilliseconds","savedReceiptUiBoundToPersistedSale",
 "newConnectionSameOsProcess","osProcessRestartProven","merchantAcceptance","promotionEligible",
 "tabletEvidence"
}
ALLOWED_CHANGED={
  ".github/workflows/shop-native-ci.yml",
  "tools/run_shop_first_sale_integration.py",
}
EMU_URL="https://dl.google.com/android/repository/emulator-linux_x64-16970787.zip"
EMU_SIZE=350068887
EMU_SHA="a4405349d8a9c52136ab7861e5331dc40e85574bd91cb8889a298a2ff4c52e26"
EMU_VERSION="37.3.10"
EMU_BUILD_ID="16970787"
EMU_METADATA_PATH="source.properties"
EMU_METADATA_SIZE=103
EMU_METADATA_LIMIT=4096
EMU_METADATA_SHA256="399a3ad857aa3ba1d2983745f82d6c438221481c220c3bba0aec577adb313a03"
EMU_METADATA_FIELDS={
    "Pkg.UserSrc":"false",
    "Pkg.Revision":"37.3.10",
    "Pkg.Path":"emulator",
    "Pkg.Desc":"Android Emulator",
    "Pkg.BuildId":"16970787",
}
EMU_SOURCE_PROPERTIES=(
    b"Pkg.UserSrc=false\n"
    b"Pkg.Revision=37.3.10\n"
    b"Pkg.Path=emulator\n"
    b"Pkg.Desc=Android Emulator\n"
    b"Pkg.BuildId=16970787"
)
PULSE="1:16.1+dfsg1-2ubuntu10.1"
PULSE_QUERY_FORMAT="-f="+"$"+"{db:Status-Abbrev}\t"+"$"+"{Version}"
RUN_PROGRESS={"currentLocale":None,"phase":"not_started","attemptedLocales":[],"completedLocales":[],"cleanupProven":True}
CANCEL_PENDING=False

INTERNAL_FAILURE_PHASES=frozenset((
 "not_started","host_preflight","capacity_preflight","task_create","task_environment",
 "flutter_version","dependency_resolution","identity_prepare","identity_generate",
 "android_toolchain_validation","libpulse_query","libpulse_install","emulator_install",
 "emulator_sdk_registration",
 "image_manifest","image_license","image_install","image_validation","post_sdk_capacity",
 "kvm_admission","acceleration_check","avd_prepare","test_running","locale_complete",
))
def set_phase(value):
    RUN_PROGRESS["phase"]=value if value in INTERNAL_FAILURE_PHASES else "unknown"

def internal_failure_evidence(error,phase=None):
    phase=RUN_PROGRESS.get("phase") if phase is None else phase
    if type(phase) is not str or phase not in INTERNAL_FAILURE_PHASES:
        phase="unknown"
    categories=(
        (OSError,"OSError"),(UnicodeError,"UnicodeError"),(ValueError,"ValueError"),
        (TypeError,"TypeError"),(KeyError,"KeyError"),(IndexError,"IndexError"),
        (AttributeError,"AttributeError"),(RuntimeError,"RuntimeError"),
        (ImportError,"ImportError"),(MemoryError,"MemoryError"),
        (OverflowError,"OverflowError"),(AssertionError,"AssertionError"),
        (EOFError,"EOFError"),(StopIteration,"StopIteration"),
    )
    category=next((label for cls,label in categories if isinstance(error,cls)),"Other")
    code=getattr(error,"errno",None) if isinstance(error,OSError) else None
    if type(code) is not int or not 1<=code<=4095:
        code=None
    return {"phase":phase,"exceptionCategory":category,"errno":code}
FALSE={"authority":False,"fullReleaseCandidate":False,"installedQa":False,"osProcessRestartProven":False,
       "pgAcceptance":False,"hardwareAcceptance":False,"merchantAcceptance":False,
       "promotionEligible":False}

CHILD_DIAGNOSTIC_OPERATIONS=frozenset((
    "sdkmanager_install_emulator","avdmanager_list_devices","avd_create","adb_start_server",
    "adb_wait_for_device","adb_boot_probe","adb_devices",
    "adb_set_font_scale","adb_read_display_size","adb_read_display_density",
    "adb_read_font_scale",
))
class Refuse(Exception):
    def __init__(self, reason, *, child_failure=None):
        super().__init__(reason)
        self.child_failure=child_failure
def need(ok, reason):
    if not ok: raise Refuse(reason)
def child_failure_record(operation, exit_code):
    need(type(operation) is str and operation in CHILD_DIAGNOSTIC_OPERATIONS,
         "child_operation_invalid")
    need(type(exit_code) is int and -255<=exit_code<=255,
         "child_exit_code_invalid")
    return {"operation":operation,"exitCode":exit_code}
def avd_create_diagnostics(stdout,stderr):
    # Hints only: never serialize SDK output, local paths, argv, or environment.
    need(type(stdout) is bytes and type(stderr) is bytes and
         len(stdout)+len(stderr)<=OUTPUT_LIMIT,"avd_diagnostic_output_invalid")
    combined=(stdout+b"\n"+stderr).lower()
    signals=[]
    for label,marker in (
        ("userdata_source_missing",b"unable to find a 'userdata.img' file for abi"),
        ("userdata_copy_failed",b"userdata.img' file in the avd folder"),
        ("image_path_setup_failed",b"failed to set image path properties in the avd folder"),
        ("sd_card_create_failed",b"failed to create the sd card"),
        ("sd_card_create_failed",b"failed to create sdcard in the avd folder"),
        ("sd_card_size_invalid",b"sd card size must be in the range"),
        ("sd_card_size_invalid",b"unable to parse sd card size"),
        ("base_device_incomplete",b"base device information incomplete or missing"),
        ("avd_initialization_exception",b"exception during avdmanager initialization"),
        ("avd_initialization_exception",b"an error occurred while creating avd"),
        ("avd_system_image_missing",b"system image not found in"),
        ("avd_system_image_outside_sdk",b"is not inside the sdk"),
        ("unsupported_image_abi",b"is not supported by this version of the sdk tools"),
        ("avd_cleanup_failed",b"failed to delete"),
        ("avd_cow_flag_warning",b"failed 'chattr'"),
        ("filesystem_access_denied",b"accessdeniedexception"),
        ("filesystem_access_denied",b"permission denied"),
        ("filesystem_path_missing",b"nosuchfileexception"),
        ("filesystem_path_missing",b"filenotfoundexception"),
        ("filesystem_io_exception",b"java.io.ioexception"),
        ("filesystem_space_exhausted",b"no space left on device"),
        ("android_location_exception",b"androidlocationsexception"),
        ("package_path_not_valid",b"package path is not valid"),
        ("package_has_no_system_images",b"contains no system images. valid system image paths are:"),
        ("device_not_found",b"no device found matching --device"),
        ("avd_not_created",b"avd not created."),
        ("emulator_package_missing",b'"emulator" package must be installed'),
        ("emulator_package_missing",b"the android emulator is not installed."),
        ("multiple_abis",b"this package has more than one abi."),
        ("invalid_abi",b"invalid --abi "),
        ("invalid_tag",b"invalid --tag "),
        ("tools_directory_missing",b"the tools directory property is not set"),
        ("working_directory_invalid",b"the working directory does not seem to be valid"),
    ):
        if marker in combined and label not in signals: signals.append(label)
    return {"schema":"supermega.avd_create_diagnostic.v1",
            "stdoutBytes":len(stdout),"stderrBytes":len(stderr),
            "signals":signals or ["unclassified"],"rawOutputIncluded":False}

def child_failed_refusal(operation, exit_code, *, stdout=None, stderr=None):
    if operation is None: return Refuse("child_failed")
    child=child_failure_record(operation,exit_code)
    if operation=="avd_create" and stdout is not None and stderr is not None:
        child["avdDiagnostics"]=avd_create_diagnostics(stdout,stderr)
    return Refuse("child_failed",child_failure=child)

def libpulse_query_state(raw):
    expected=("ii \t"+PULSE).encode("ascii")
    if raw==expected: return "installed_exact"
    if raw in (b"",b"un \t"): return "absent"
    return "invalid"
def output(status, **facts):
    print(json.dumps({"schema":"supermega.first_sale_instrumented_qa.v2",
      "status":status, **FALSE, **facts}, sort_keys=True, separators=(",",":")))
def file_sha(path):
    h=hashlib.sha256()
    with open(path,"rb") as f:
        for b in iter(lambda:f.read(1024*1024),b""): h.update(b)
    return h.hexdigest()
def stop_group(p):
    pg=p.pid
    try: os.killpg(pg,signal.SIGTERM)
    except ProcessLookupError: pass
    try: p.wait(timeout=5)
    except subprocess.TimeoutExpired:
        try: os.killpg(pg,signal.SIGKILL)
        except ProcessLookupError: pass
        p.wait(timeout=5)
    end=time.monotonic()+5
    while True:
        try: os.killpg(pg,0)
        except ProcessLookupError: return
        except PermissionError: pass
        if time.monotonic()>=end: break
        try: os.killpg(pg,signal.SIGKILL)
        except ProcessLookupError: return
        time.sleep(.05)
    raise Refuse("owned_process_group_remains")
def run(argv,cwd,env,timeout=60,capture=False,input_data=None,accepted=(0,),capture_pair=False,operation=None):
    if operation is not None:
        need(type(operation) is str and operation in CHILD_DIAGNOSTIC_OPERATIONS,
             "child_operation_invalid")
    capture=capture or operation=="avd_create"
    p=subprocess.Popen(argv,cwd=str(cwd),env=env,
      stdin=subprocess.PIPE if input_data is not None else subprocess.DEVNULL,
      stdout=subprocess.PIPE if capture else subprocess.DEVNULL,
      stderr=subprocess.PIPE if capture else subprocess.DEVNULL,
      start_new_session=True,close_fds=True)
    out=bytearray(); err=bytearray(); total=0; deadline=time.monotonic()+timeout
    stopped=False
    def cleanup():
        nonlocal stopped
        if stopped: return
        stopped=True
        try: stop_group(p)
        except BaseException:
            RUN_PROGRESS["cleanupProven"]=False
            RUN_PROGRESS["ownedChildCleanupUncertain"]=True
            raise
    try:
        if input_data is not None:
            try:
                p.stdin.write(input_data); p.stdin.flush()
            except BrokenPipeError:
                pass
            finally:
                p.stdin.close()
        if capture:
            with selectors.DefaultSelector() as sel:
                for stream,target in ((p.stdout,out),(p.stderr,err)):
                    os.set_blocking(stream.fileno(),False)
                    sel.register(stream,selectors.EVENT_READ,target)
                while sel.get_map() or p.poll() is None:
                    remaining=deadline-time.monotonic()
                    if remaining<=0: raise subprocess.TimeoutExpired(argv,timeout)
                    for key,_ in sel.select(min(remaining,0.2)):
                        try: chunk=os.read(key.fd,65536)
                        except BlockingIOError: continue
                        if not chunk:
                            sel.unregister(key.fileobj); key.fileobj.close(); continue
                        total+=len(chunk)
                        if total>OUTPUT_LIMIT:
                            cleanup()
                            raise Refuse("child_output_limit")
                        key.data.extend(chunk)
            p.wait(timeout=max(0.1,deadline-time.monotonic()))
        else:
            p.wait(timeout=max(0.1,deadline-time.monotonic()))
        cleanup()
    except subprocess.TimeoutExpired:
        try: cleanup()
        except Exception: raise Refuse("owned_cleanup_unproven") from None
        raise Refuse("child_timeout") from None
    except BaseException:
        try: cleanup()
        except Exception: raise Refuse("owned_cleanup_unproven") from None
        raise
    finally:
        for stream in (p.stdin,p.stdout,p.stderr):
            if stream is not None and not stream.closed: stream.close()
    if p.returncode not in accepted:
        raise child_failed_refusal(operation,p.returncode,stdout=bytes(out),stderr=bytes(err))
    if capture_pair: return bytes(out),bytes(err)
    return bytes(out) if capture else b""

def run_child_diagnostic_process_tests():
    # Disposable Python children only; no SDK/AVD/app/network invocation.
    cases=0
    fixtures=(
        ("stderr", "Error: No device found matching --device private-device.","device_not_found"),
        ("stdout", "Error: Package path is not valid. private-path", "package_path_not_valid"),
        ("stderr", "unknown private diagnostic", "unclassified"),
    )
    for channel,message,expected in fixtures:
        child_source="import sys;sys."+channel+".write("+repr(message)+");sys.exit(7)"
        try:
            run([sys.executable,"-I","-S","-c",child_source],Path.cwd(),{},5,
                operation="avd_create")
        except Refuse as error:
            evidence=error.child_failure
            need(str(error)=="child_failed" and evidence is not None and
                 evidence["exitCode"]==7 and
                 evidence["avdDiagnostics"]["signals"]==[expected] and
                 evidence["avdDiagnostics"][channel+"Bytes"]==len(message.encode("ascii")) and
                 "private" not in json.dumps(evidence),
                 "offline_child_capture_refusal_invalid")
        else: raise Refuse("offline_child_capture_expected_refusal")
        cases+=1
    result=run([sys.executable,"-I","-S","-c","print('synthetic-success')"],
               Path.cwd(),{},5,operation="avd_create")
    need(result==b"synthetic-success\n","offline_child_capture_success_changed")
    return cases+1

def git(root,*args):
    return run(["git",*args],root,os.environ,10,True).decode("ascii").strip()
def source_identity_facts(root,head):
    need(type(head) is str and re.fullmatch(r"[0-9a-f]{40}",head) is not None,
         "source_current_head_invalid")
    current_tree=git(root,"rev-parse",head+"^{tree}")
    current_native=git(root,"rev-parse",head+":mobile/shop_pos")
    need(all(type(value) is str and re.fullmatch(r"[0-9a-f]{40}",value) is not None
             for value in (current_tree,current_native)),"source_current_tree_invalid")
    return {"sourceCommit":head,"sourceTree":current_tree,
            "nativeSourceTree":current_native,"sourceParent":BASE,
            "sourceParentTree":BASE_TREE,"sourceParentNativeTree":BASE_NATIVE_TREE}

def check_context(root):
    fixed={"QA_EVENT":"pull_request","QA_ACTION":"synchronize",
      "QA_REPOSITORY":"swanhtet01/swanhtet01.github.io","QA_REPOSITORY_ID":"1034056731",
      "QA_PR_NUMBER":"752","QA_BASE_REF":BASE_REF,"QA_BASE_SHA":BASE_SHA,
      "QA_HEAD_REF":"codex/postgres17-provenance-integration-20261031",
      "QA_BASE_REPOSITORY_ID":"1034056731","QA_HEAD_REPOSITORY_ID":"1034056731",
      "QA_DRAFT":"true","QA_ACTOR_ID":"98728123","QA_SENDER_ID":"98728123",
      "QA_SENDER_TYPE":"User","QA_ATTEMPT":"1"}
    need(all(os.environ.get(k)==v for k,v in fixed.items()),"context_invalid")
    head=os.environ.get("QA_HEAD_SHA","")
    need(re.fullmatch("[0-9a-f]{40}",head) is not None,"head_invalid")
    need(git(root,"rev-parse","HEAD")==head and git(root,"rev-parse","HEAD^")==BASE,
         "source_binding_invalid")
    need(git(root,"rev-parse",BASE+"^{tree}")==BASE_TREE and
         git(root,"rev-parse",BASE+":mobile/shop_pos")==BASE_NATIVE_TREE,
         "source_tree_binding_invalid")
    names=git(root,"diff-tree","--no-commit-id","--name-only","-r","HEAD").splitlines()
    need(len(names)==len(set(names)) and set(names)==ALLOWED_CHANGED,"changed_paths_invalid")
    need(git(root,"status","--porcelain","--untracked-files=all")=="","checkout_dirty")
    return head

def valid_sha(value):
    return type(value) is str and re.fullmatch("[0-9a-f]{64}",value) is not None

def check_source(root):
    need(all(valid_sha(v) for v in (TEST_SHA,PUB_SHA,LOCK_SHA,IMAGE_SHA256,
         IMAGE_ARCHIVE_SHA256,IMAGE_MANIFEST_SHA256)),"source_bindings_pending")
    for path,digest in ((TEST,TEST_SHA),(PUB,PUB_SHA),(LOCK,LOCK_SHA)):
        full=root/path
        need(full.is_file() and not full.is_symlink(),"source_file_invalid")
        run(["git","ls-files","--error-unmatch",str(path)],root,os.environ,10)
        need(file_sha(full)==digest,"source_digest_mismatch")
    test_text=(root/TEST).read_text("utf-8")
    required=("binding.reportData",*sorted(REPORT_KEYS))
    need(all(token in test_text for token in required)
         and "SHOP_AVD_PROFILE_ID" in test_text,"test_report_contract_invalid")
    pub_text=(root/PUB).read_text("utf-8")
    need(re.search(r"(?m)^dev_dependencies:\s*$",pub_text)
         and re.search(r"(?m)^  integration_test:\s*\n    sdk: flutter\s*$",pub_text),
         "integration_test_pubspec_invalid")
    lock_text=(root/LOCK).read_text("utf-8")
    match=re.search(r"(?m)^  integration_test:\r?\n((?:^    [^\n]*\r?\n)+)",lock_text)
    need(match is not None
         and re.search(r"(?m)^    source: sdk\r?$",match.group(1))
         and re.search(r"(?m)^    dependency: [\"']?direct dev[\"']?\r?$",match.group(1)),
         "integration_test_lock_invalid")
    need(len(IMAGE_FILES)==24 and len(set(IMAGE_FILES))==24
         and sum(item[0] for item in IMAGE_FILES.values())==IMAGE_EXPANDED_BYTES
         and IMAGE_ARCHIVE_URL.endswith("/"+IMAGE_ARCHIVE)
         and IMAGE_FILES.get("x86_64/system.img")==
             (1622147072,IMAGE_SHA256),"image_member_manifest_invalid")
    return LOCK_SHA
DRIVER_SOURCE = """import 'dart:convert';
import 'dart:io';
import 'package:integration_test/integration_test_driver.dart';

const reportPrefix = 'SUPERMEGA_FIRST_SALE_REPORT:';
const reportKeys = <String>{
  'scenario',
  'locale',
  'productSeeded',
  'explicitTestTapCalls',
  'textEntryCalls',
  'appMainToSaleCompletionMilliseconds',
  'appMainToFinalDatabaseAssertionsMilliseconds',
  'appMainToSavedReceiptAssertionsMilliseconds',
  'savedReceiptUiBoundToPersistedSale',
  'newConnectionSameOsProcess',
  'osProcessRestartProven',
  'merchantAcceptance',
  'promotionEligible',
  'tabletEvidence',
};

const tabletEvidenceKeys = <String>{
  'profileId',
  'portrait',
  'landscape',
  'basketPreservedOnRotation',
  'basketLayoutBeforeRotation',
  'basketLayoutAfterRotation',
  'crossLayoutTransferObserved',
  'basketContentsBeforeRotation',
  'basketContentsAfterRotation',
  'salesBeforeRotation',
  'salesAfterRotation',
  'receiptsBeforeRotation',
  'receiptsAfterRotation',
  'stockBeforeRotation',
  'stockAfterRotation',
  'reviewTargetMinDpBeforeRotation',
  'reviewTargetMinDpAfterRotation',
  'cashTargetMinDpBeforeRotation',
  'cashTargetMinDpAfterRotation',
  'confirmTargetMinDp',
  'receiptTargetMinDp',
  'imeStatus',
  'imeViewInsetsBottom',
  'dialogReachable',
  'primaryCtaReachable',
};

Future<void> main() => integrationDriver(
  timeout: const Duration(minutes: 6),
  responseDataCallback: (Map<String, dynamic>? data) async {
    if (data == null ||
        data.keys.toSet().length != reportKeys.length ||
        !data.keys.toSet().containsAll(reportKeys)) {
      throw StateError('integration report shape invalid');
    }
    if (data['scenario'] != 'first_product_and_cash_sale' ||
        data['locale'] is! String ||
        data['productSeeded'] != false ||
        data['explicitTestTapCalls'] is! int ||
        data['textEntryCalls'] is! int ||
        data['appMainToSaleCompletionMilliseconds'] is! int ||
        data['appMainToFinalDatabaseAssertionsMilliseconds'] is! int ||
        data['appMainToSavedReceiptAssertionsMilliseconds'] is! int ||
        data['savedReceiptUiBoundToPersistedSale'] != true ||
        data['newConnectionSameOsProcess'] != true ||
        data['osProcessRestartProven'] != false ||
        data['merchantAcceptance'] != 'NOT_RUN' ||
        data['promotionEligible'] != false ||
        data['tabletEvidence'] is! Map) {
      throw StateError('integration report values invalid');
    }
    final tablet = data['tabletEvidence'] as Map;
    final beforeLayout = tablet['basketLayoutBeforeRotation'];
    final afterLayout = tablet['basketLayoutAfterRotation'];
    if (tablet.keys.toSet().length != tabletEvidenceKeys.length ||
        !tablet.keys.toSet().containsAll(tabletEvidenceKeys) ||
        tablet['profileId'] != 'medium_tablet' ||
        !const {'compact', 'split'}.contains(beforeLayout) ||
        !const {'compact', 'split'}.contains(afterLayout) ||
        tablet['crossLayoutTransferObserved'] != (beforeLayout != afterLayout)) {
      throw StateError('tablet report shape invalid');
    }
    stdout.writeln(reportPrefix + jsonEncode(<String, dynamic>{
      for (final String key in reportKeys) key: data[key],
    }));
  },
);
"""

def _unique_json_pairs(pairs):
    result={}
    for key,value in pairs:
        need(key not in result,"report_json_duplicate_key")
        result[key]=value
    return result

TABLET_VIEWPORT_KEYS=frozenset((
 "physicalWidth","physicalHeight","logicalWidth","logicalHeight","devicePixelRatio",
 "paddingLeft","paddingTop","paddingRight","paddingBottom",
 "viewPaddingLeft","viewPaddingTop","viewPaddingRight","viewPaddingBottom",
 "viewInsetsLeft","viewInsetsTop","viewInsetsRight","viewInsetsBottom","textScaleAt14"))
TABLET_BASKET_CONTENT_KEYS=frozenset(("productName","quantity","totalMmk"))
TABLET_EVIDENCE_KEYS=frozenset((
 "profileId","portrait","landscape","basketPreservedOnRotation",
 "basketLayoutBeforeRotation","basketLayoutAfterRotation","crossLayoutTransferObserved",
 "basketContentsBeforeRotation","basketContentsAfterRotation",
 "salesBeforeRotation","salesAfterRotation","receiptsBeforeRotation","receiptsAfterRotation",
 "stockBeforeRotation","stockAfterRotation",
 "reviewTargetMinDpBeforeRotation","reviewTargetMinDpAfterRotation",
 "cashTargetMinDpBeforeRotation","cashTargetMinDpAfterRotation",
 "confirmTargetMinDp","receiptTargetMinDp","imeStatus","imeViewInsetsBottom",
 "dialogReachable","primaryCtaReachable"))
def _finite_number(value):
 return type(value) in (int,float) and math.isfinite(value)
def validate_tablet_evidence(value):
 need(type(value) is dict and set(value)==TABLET_EVIDENCE_KEYS and
      value.get("profileId")==TABLET_DEVICE_ID and
      value.get("basketPreservedOnRotation") is True and
      value.get("dialogReachable") is True and
      value.get("primaryCtaReachable") is True,
      "test_tablet_evidence_invalid")
 for orientation,landscape in (("portrait",False),("landscape",True)):
  view=value.get(orientation)
  need(type(view) is dict and set(view)==TABLET_VIEWPORT_KEYS and
       type(view.get("physicalWidth")) is int and view["physicalWidth"]>0 and
       type(view.get("physicalHeight")) is int and view["physicalHeight"]>0,
       "test_tablet_evidence_invalid")
  numbers=[view[k] for k in TABLET_VIEWPORT_KEYS-{"physicalWidth","physicalHeight"}]
  need(all(_finite_number(x) for x in numbers) and
       view["logicalWidth"]>0 and view["logicalHeight"]>0 and
       view["devicePixelRatio"]>0 and
       abs(view["physicalWidth"]-view["logicalWidth"]*view["devicePixelRatio"])<=1.0 and
       abs(view["physicalHeight"]-view["logicalHeight"]*view["devicePixelRatio"])<=1.0 and
       all(view[k]>=0 for k in TABLET_VIEWPORT_KEYS if k.startswith(("padding","viewPadding","viewInsets"))) and
       view["textScaleAt14"]>=16 and
       ((view["logicalWidth"]>view["logicalHeight"]) is landscape) and
       min(view["logicalWidth"],view["logicalHeight"])>=600 and
       max(view["logicalWidth"],view["logicalHeight"])>=700,
       "test_tablet_evidence_invalid")
 for key in ("salesBeforeRotation","salesAfterRotation","receiptsBeforeRotation",
             "receiptsAfterRotation","stockBeforeRotation","stockAfterRotation"):
  need(type(value.get(key)) is int,"test_tablet_evidence_invalid")
 need(value["salesBeforeRotation"]==value["salesAfterRotation"]==0 and
      value["receiptsBeforeRotation"]==value["receiptsAfterRotation"]==0 and
      value["stockBeforeRotation"]==value["stockAfterRotation"]==3,
      "test_tablet_rotation_effect_invalid")
 before_layout=value.get("basketLayoutBeforeRotation")
 after_layout=value.get("basketLayoutAfterRotation")
 need(before_layout in ("compact","split") and after_layout in ("compact","split") and
      type(value.get("crossLayoutTransferObserved")) is bool and
      value["crossLayoutTransferObserved"] is (before_layout != after_layout),
      "test_tablet_layout_invalid")
 expected_contents={"productName":"Tea","quantity":1,"totalMmk":2500}
 for key in ("basketContentsBeforeRotation","basketContentsAfterRotation"):
  contents=value.get(key)
  need(type(contents) is dict and set(contents)==TABLET_BASKET_CONTENT_KEYS and
       type(contents.get("productName")) is str and
       type(contents.get("quantity")) is int and type(contents.get("totalMmk")) is int and
       contents==expected_contents,
       "test_tablet_basket_contents_invalid")
 need(value["basketContentsBeforeRotation"]==value["basketContentsAfterRotation"],
      "test_tablet_basket_contents_invalid")
 for key,layout in (("reviewTargetMinDpBeforeRotation",before_layout),
                    ("reviewTargetMinDpAfterRotation",after_layout)):
  target=value.get(key)
  if layout=="compact":
   need(_finite_number(target) and target>=48,"test_tablet_target_invalid")
  else:
   need(target is None,"test_tablet_target_invalid")
 for key in ("cashTargetMinDpBeforeRotation","cashTargetMinDpAfterRotation",
             "confirmTargetMinDp","receiptTargetMinDp"):
  need(_finite_number(value.get(key)) and value[key]>=48,"test_tablet_target_invalid")
 need(value.get("imeStatus") in ("observed","NOT_RUN") and
      _finite_number(value.get("imeViewInsetsBottom")) and value["imeViewInsetsBottom"]>=0 and
      ((value["imeStatus"]=="observed" and value["imeViewInsetsBottom"]>0) or
       (value["imeStatus"]=="NOT_RUN" and value["imeViewInsetsBottom"]==0)),
      "test_tablet_ime_invalid")

def parse_report(stdout_bytes,stderr_bytes,locale):
    marker=REPORT_PREFIX.encode("ascii")
    found=[]
    for raw in (stdout_bytes,stderr_bytes):
        for line in raw.splitlines():
            if line.startswith(marker):
                found.append(line[len(marker):])
    need(len(found)==1,"test_report_missing_or_ambiguous")
    try:
        report=json.loads(found[0].decode("utf-8","strict"),
                          object_pairs_hook=_unique_json_pairs)
    except Refuse: raise
    except Exception: raise Refuse("test_report_invalid") from None
    need(type(report) is dict and set(report)==REPORT_KEYS,
         "test_report_shape_invalid")
    validate_tablet_evidence(report.get("tabletEvidence"))
    need(report.get("scenario")=="first_product_and_cash_sale"
         and report.get("locale")==locale and locale in ("en","my")
         and report.get("productSeeded") is False
         and report.get("savedReceiptUiBoundToPersistedSale") is True
         and report.get("newConnectionSameOsProcess") is True
         and report.get("osProcessRestartProven") is False
         and report.get("merchantAcceptance")=="NOT_RUN"
         and report.get("promotionEligible") is False,
         "test_report_values_invalid")
    for key in ("explicitTestTapCalls","textEntryCalls",
                "appMainToSaleCompletionMilliseconds",
                "appMainToFinalDatabaseAssertionsMilliseconds",
                "appMainToSavedReceiptAssertionsMilliseconds"):
        need(type(report.get(key)) is int and 0<=report[key]<=15*60*1000,
             "test_report_metric_invalid")
    need(1<=report["explicitTestTapCalls"]<=128
         and 1<=report["textEntryCalls"]<=128
         and report["appMainToSaleCompletionMilliseconds"]<=
             report["appMainToFinalDatabaseAssertionsMilliseconds"]<=
             report["appMainToSavedReceiptAssertionsMilliseconds"],
         "test_report_metric_invalid")
    return {key:report[key] for key in sorted(REPORT_KEYS)}

def run_self_tests():
    need(len(IMAGE_FILES)==24 and sum(item[0] for item in IMAGE_FILES.values())==IMAGE_EXPANDED_BYTES
         and IMAGE_FILES["x86_64/system.img"]==(1622147072,IMAGE_SHA256),
         "offline_image_manifest_fixture")
    common_view={"devicePixelRatio":1.0,"paddingLeft":0.0,"paddingTop":24.0,
       "paddingRight":0.0,"paddingBottom":0.0,"viewPaddingLeft":0.0,
       "viewPaddingTop":24.0,"viewPaddingRight":0.0,"viewPaddingBottom":0.0,
       "viewInsetsLeft":0.0,"viewInsetsTop":0.0,"viewInsetsRight":0.0,
       "viewInsetsBottom":0.0,"textScaleAt14":18.2}
    tablet_fixture={"profileId":TABLET_DEVICE_ID,
       "portrait":{**common_view,"physicalWidth":800,"physicalHeight":1280,
                   "logicalWidth":800.0,"logicalHeight":1280.0},
       "landscape":{**common_view,"physicalWidth":1280,"physicalHeight":800,
                    "logicalWidth":1280.0,"logicalHeight":800.0},
       "basketPreservedOnRotation":True,
       "basketLayoutBeforeRotation":"split","basketLayoutAfterRotation":"split",
       "crossLayoutTransferObserved":False,
       "basketContentsBeforeRotation":{"productName":"Tea","quantity":1,"totalMmk":2500},
       "basketContentsAfterRotation":{"productName":"Tea","quantity":1,"totalMmk":2500},
       "salesBeforeRotation":0,"salesAfterRotation":0,
       "receiptsBeforeRotation":0,"receiptsAfterRotation":0,"stockBeforeRotation":3,
       "stockAfterRotation":3,"reviewTargetMinDpBeforeRotation":None,
       "reviewTargetMinDpAfterRotation":None,"cashTargetMinDpBeforeRotation":48.0,
       "cashTargetMinDpAfterRotation":48.0,"confirmTargetMinDp":48.0,
       "receiptTargetMinDp":48.0,"imeStatus":"observed","imeViewInsetsBottom":300.0,
       "dialogReachable":True,"primaryCtaReachable":True}
    valid={"scenario":"first_product_and_cash_sale","locale":"en","productSeeded":False,
       "explicitTestTapCalls":8,"textEntryCalls":5,
       "appMainToSaleCompletionMilliseconds":1000,
       "appMainToFinalDatabaseAssertionsMilliseconds":2000,
       "appMainToSavedReceiptAssertionsMilliseconds":2500,
       "savedReceiptUiBoundToPersistedSale":True,"newConnectionSameOsProcess":True,
       "osProcessRestartProven":False,"merchantAcceptance":"NOT_RUN",
       "promotionEligible":False,"tabletEvidence":tablet_fixture}
    encoded=json.dumps(valid,separators=(",",":")).encode()
    parse_report(REPORT_PREFIX.encode()+encoded+b"\n",b"","en")
    cases=2
    saved_git=git
    fixture_head="1"*40
    fixture_tree="2"*40
    fixture_native="3"*40
    def fixture_git(_root,*args):
        if args==("rev-parse",fixture_head+"^{tree}"): return fixture_tree
        if args==("rev-parse",fixture_head+":mobile/shop_pos"): return fixture_native
        raise Refuse("offline_source_identity_unexpected_query")
    try:
        globals()["git"]=fixture_git
        identity=source_identity_facts(Path("."),fixture_head)
        need(identity=={"sourceCommit":fixture_head,"sourceTree":fixture_tree,
             "nativeSourceTree":fixture_native,"sourceParent":BASE,
             "sourceParentTree":BASE_TREE,"sourceParentNativeTree":BASE_NATIVE_TREE}
             and identity["sourceTree"]!=BASE_TREE
             and identity["nativeSourceTree"]!=BASE_NATIVE_TREE,
             "offline_source_identity_current_parent_confused")
        cases+=1
        for action,reason in (
          (lambda:source_identity_facts(Path("."),"invalid"),"source_current_head_invalid"),
          (lambda:(globals().__setitem__("git",lambda *_args:"invalid"),
                   source_identity_facts(Path("."),fixture_head)),"source_current_tree_invalid")):
            try: action()
            except Refuse as error: need(str(error)==reason,"offline_source_identity_wrong_reason")
            else: raise Refuse("offline_source_identity_expected_refusal")
            cases+=1
    finally:
        globals()["git"]=saved_git
    compact_fixture={**tablet_fixture,
       "basketLayoutBeforeRotation":"compact","basketLayoutAfterRotation":"compact",
       "reviewTargetMinDpBeforeRotation":48.0,"reviewTargetMinDpAfterRotation":48.0}
    validate_tablet_evidence(compact_fixture)
    cases+=1
    transfer_fixture={**tablet_fixture,
       "basketLayoutBeforeRotation":"compact","basketLayoutAfterRotation":"split",
       "crossLayoutTransferObserved":True,"reviewTargetMinDpBeforeRotation":48.0,
       "reviewTargetMinDpAfterRotation":None}
    validate_tablet_evidence(transfer_fixture)
    cases+=1
    profile_listing=(b"---------\n"
      b"id: 14 or \"medium_tablet\"\nName: Medium Tablet\nOEM : Generic\n"
      b"Tag : default\n---------\n")
    need(parse_tablet_profile_listing(profile_listing)=={
      "profileId":"medium_tablet","name":"Medium Tablet","oem":"Generic"},
      "offline_tablet_profile_positive")
    cases+=1
    invalid_profiles=(
      (b"", "tablet_profile_listing_invalid"),
      (b"id: 1 or \"pixel_2\"\nName: Pixel 2\nOEM : Google", "tablet_profile_unavailable"),
      (profile_listing+profile_listing, "tablet_profile_unavailable"),
      (b"x"*(1024*1024+1), "tablet_profile_listing_invalid"),
      (b"\xff", "tablet_profile_listing_invalid"),
    )
    for raw,reason in invalid_profiles:
        try: parse_tablet_profile_listing(raw)
        except Refuse as error: need(str(error)==reason,"offline_tablet_profile_wrong_reason")
        else: raise Refuse("offline_tablet_profile_expected_refusal")
        cases+=1
    display=parse_tablet_display(b"Physical size: 1280x800\n",
      b"Physical density: 160\n",b"1.3\n")
    need(display=={"physicalWidth":1280,"physicalHeight":800,
      "densityDpi":160,"fontScale":1.3},"offline_tablet_display_positive")
    cases+=1
    invalid_displays=(
      (b"Override size: 1280x800",b"Physical density: 160",b"1.3","tablet_display_invalid"),
      (b"Physical size: 1280x800",b"Physical density: 160",b"1.0","tablet_display_invalid"),
      (b"Physical size: 1280x800",b"Physical density: 160",b"nan","tablet_display_invalid"),
      (b"Physical size: 1280x800",b"Physical density: 0",b"1.3","tablet_display_invalid"),
    )
    for size_raw,density_raw,scale_raw,reason in invalid_displays:
        try: parse_tablet_display(size_raw,density_raw,scale_raw)
        except Refuse as error: need(str(error)==reason,"offline_tablet_display_wrong_reason")
        else: raise Refuse("offline_tablet_display_expected_refusal")
        cases+=1
    cases+=1
    need(PULSE_QUERY_FORMAT=="-f="+"$"+"{db:Status-Abbrev}\t"+"$"+"{Version}",
         "offline_libpulse_format_fixture")
    cases+=1
    pulse_cases=(
        (("ii \t"+PULSE).encode("ascii"),"installed_exact"),
        (b"","absent"),
        (b"un \t","absent"),
        (("ii  "+PULSE).encode("ascii"),"invalid"),
        (("ii \t"+PULSE+"\n").encode("ascii"),"invalid"),
        (("ii \t"+PULSE+"\textra").encode("ascii"),"invalid"),
        (("ii \t1:16.1+dfsg1-2ubuntu10.0").encode("ascii"),"invalid"),
        (("iF \t"+PULSE).encode("ascii"),"invalid"),
    )
    for raw,expected in pulse_cases:
        need(libpulse_query_state(raw)==expected,"offline_libpulse_query_fixture")
        cases+=1
    # Diagnostics use a fixed phase/category schema and never serialize exception text.
    evidence=internal_failure_evidence(OSError(13,"synthetic-secret-path"),"image_install")
    need(evidence=={"phase":"image_install","exceptionCategory":"OSError","errno":13}
         and "synthetic-secret-path" not in json.dumps(evidence),
         "offline_internal_failure_os_fixture")
    cases+=1
    evidence=internal_failure_evidence(ValueError("synthetic-secret-message"),"flutter_version")
    need(evidence=={"phase":"flutter_version","exceptionCategory":"ValueError","errno":None}
         and "synthetic-secret-message" not in json.dumps(evidence),
         "offline_internal_failure_builtin_fixture")
    cases+=1
    evidence=internal_failure_evidence(TypeError("secret"),"not_a_phase")
    need(evidence=={"phase":"unknown","exceptionCategory":"TypeError","errno":None}
         and "secret" not in json.dumps(evidence),
         "offline_internal_failure_phase_fixture")
    cases+=1
    diagnostic=avd_create_diagnostics(b"private-stdout-path",b"Error: Package path is not valid. private-stderr-path")
    need(diagnostic=={"schema":"supermega.avd_create_diagnostic.v1",
         "stdoutBytes":19,"stderrBytes":53,"signals":["package_path_not_valid"],
         "rawOutputIncluded":False} and "private-" not in json.dumps(diagnostic),
         "offline_avd_diagnostic_redacted")
    cases+=1
    markers=(
        (b"CONTAINS NO SYSTEM IMAGES. VALID SYSTEM IMAGE PATHS ARE:","package_has_no_system_images"),
        (b"No device found matching --device medium_tablet.","device_not_found"),
        (b"AVD not created.","avd_not_created"),
        (b'Error: "emulator" package must be installed!',"emulator_package_missing"),
        (b"The Android Emulator is not installed.","emulator_package_missing"),
        (b"This package has more than one ABI.","multiple_abis"),
        (b"Invalid --abi x86_64 for the selected package.","invalid_abi"),
        (b"Invalid --tag default for the selected package.","invalid_tag"),
        (b"The tools directory property is not set", "tools_directory_missing"),
        (b"The working directory does not seem to be valid: 'private-path'","working_directory_invalid"),
        (b"unknown-private-error-value","unclassified"),
        (b"", "unclassified"),
    )
    for raw,expected in markers:
        need(avd_create_diagnostics(b"",raw)["signals"]==[expected],
             "offline_avd_diagnostic_classification")
        cases+=1
    sdk_failure_fixtures=(
        (b"Unable to find a 'userdata.img' file for ABI x86_64 to copy into the AVD folder.","userdata_source_missing"),
        (b"Unable to create 'userdata.img' file in the AVD folder.","userdata_copy_failed"),
        (b"Unable to create '/private/path/userdata.img' file in the AVD folder.","userdata_copy_failed"),
        (b"Failed to set image path properties in the AVD folder.","image_path_setup_failed"),
        (b"Failed to create the SD card.","sd_card_create_failed"),
        (b"Failed to create sdcard in the AVD folder.","sd_card_create_failed"),
        (b"SD Card size must be in the range 9 MiB..1023 GiB.","sd_card_size_invalid"),
        (b"Unable to parse SD Card size", "sd_card_size_invalid"),
        (b"Base device information incomplete or missing.","base_device_incomplete"),
        (b"Exception during AvdManager initialization: private-exception", "avd_initialization_exception"),
        (b"An error occurred while creating AVD: private-exception", "avd_initialization_exception"),
        (b"System image not found in /private/path.","avd_system_image_missing"),
        (b"The selected system image (/private/path) is not inside the SDK.","avd_system_image_outside_sdk"),
        (b"ABI private-abi is not supported by this version of the SDK Tools", "unsupported_image_abi"),
        (b"Failed to delete /private/path: private-exception", "avd_cleanup_failed"),
        (b"Failed 'chattr' for /private/path:", "avd_cow_flag_warning"),
        (b"java.nio.file.AccessDeniedException: /private/path", "filesystem_access_denied"),
        (b"Permission denied: /private/path", "filesystem_access_denied"),
        (b"java.nio.file.NoSuchFileException: /private/path", "filesystem_path_missing"),
        (b"java.io.FileNotFoundException: /private/path", "filesystem_path_missing"),
        (b"java.io.IOException: private-reason", "filesystem_io_exception"),
        (b"No space left on device /private/path", "filesystem_space_exhausted"),
        (b"AndroidLocationsException: private-location", "android_location_exception"),
    )
    for raw,expected in sdk_failure_fixtures:
        diagnostic=avd_create_diagnostics(raw,b"Error: AVD not created.")
        need(diagnostic["signals"]==[expected,"avd_not_created"] and
             set(diagnostic)=={"schema","stdoutBytes","stderrBytes","signals","rawOutputIncluded"} and
             not diagnostic["rawOutputIncluded"] and "private-" not in json.dumps(diagnostic),
             "offline_sdk_fixed_error_family")
        cases+=1
    for raw in (b"Error: access_token=unknown-value",b"Error: client_secret=unknown-value",
                b"Error: /unrecognized path/ unknown-value",b"Error: unknown-value\x00\xff"):
        diagnostic=avd_create_diagnostics(raw,b"")
        need(diagnostic["signals"]==["unclassified"] and
             "unknown-value" not in json.dumps(diagnostic) and
             set(diagnostic)=={"schema","stdoutBytes","stderrBytes","signals","rawOutputIncluded"},
             "offline_unknown_sdk_text_never_emitted")
        cases+=1
    combined=avd_create_diagnostics(b"AVD not created.",b"Package path is not valid.")
    need(combined["signals"]==["package_path_not_valid","avd_not_created"],
         "offline_avd_diagnostic_multiple_signals")
    cases+=1
    for stdout,stderr in (("text",b""),(b"",bytearray()),(b"x"*(OUTPUT_LIMIT+1),b"")):
        try: avd_create_diagnostics(stdout,stderr)
        except Refuse as error: need(str(error)=="avd_diagnostic_output_invalid",
                                     "offline_avd_diagnostic_wrong_reason")
        else: raise Refuse("offline_avd_diagnostic_expected_refusal")
        cases+=1
    enriched=child_failed_refusal("avd_create",1,stdout=b"",stderr=b"AVD not created.")
    need(enriched.child_failure["avdDiagnostics"]["signals"]==["avd_not_created"]
         and str(enriched)=="child_failed","offline_avd_diagnostic_refusal")
    cases+=1
    ordinary=child_failed_refusal("adb_start_server",1,stdout=b"private",stderr=b"private")
    need(ordinary.child_failure=={"operation":"adb_start_server","exitCode":1},
         "offline_avd_diagnostic_operation_scope")
    cases+=1
    saved_progress=dict(RUN_PROGRESS)
    saved_popen=subprocess.Popen
    saved_stop_group=stop_group
    class CleanupFixtureProcess:
        stdin=None; stdout=None; stderr=None; returncode=1
        def wait(self,timeout=None): return self.returncode
    def uncertain_stop(_process): raise RuntimeError("private-cleanup-detail")
    try:
        globals()["RUN_PROGRESS"]={**saved_progress,"cleanupProven":True}
        subprocess.Popen=lambda *_args,**_kwargs:CleanupFixtureProcess()
        globals()["stop_group"]=uncertain_stop
        try: run(["source-only-fixture"],Path("."),{},operation="adb_start_server")
        except RuntimeError: pass
        else: raise Refuse("offline_uncertain_cleanup_expected_failure")
        need(RUN_PROGRESS.get("cleanupProven") is False and
             RUN_PROGRESS.get("ownedChildCleanupUncertain") is True,
             "offline_uncertain_cleanup_false_pass")
        globals()["stop_group"]=lambda _process:None
        CleanupFixtureProcess.returncode=0
        run(["source-only-fixture"],Path("."),{},operation="adb_start_server")
        need(RUN_PROGRESS.get("cleanupProven") is False and
             RUN_PROGRESS.get("ownedChildCleanupUncertain") is True,
             "offline_uncertain_cleanup_cleared_by_later_child")
    finally:
        subprocess.Popen=saved_popen
        globals()["stop_group"]=saved_stop_group
        globals()["RUN_PROGRESS"]=saved_progress
    cases+=1
    # Synthetic registration XML is a test fixture, never written by runtime setup.
    metadata_fixture=(b'<repository xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
      b'<localPackage path="emulator"><type-details xsi:type="generic:genericDetailsType"/>'
      b'<revision><major>37</major><minor>3</minor><micro>10</micro></revision>'
      b'</localPackage></repository>')
    need(parse_registered_emulator_metadata(metadata_fixture)=={
      "package":"emulator","revision":EMU_VERSION,
      "metadataScope":"sdkmanager_generated_registration_only"},
      "offline_registered_metadata_positive")
    cases+=1
    invalid_registered_metadata=(
      (b"","emulator_sdk_metadata_invalid"),
      (None,"emulator_sdk_metadata_invalid"),
      ("text","emulator_sdk_metadata_invalid"),
      (b"<broken>","emulator_sdk_metadata_invalid"),
      (metadata_fixture.replace(b'path="emulator"',b'path="platform-tools"'),"emulator_sdk_package_identity"),
      (metadata_fixture.replace(b"<micro>10</micro>",b"<micro>9</micro>"),"emulator_sdk_package_identity"),
      (metadata_fixture.replace(b"genericDetailsType",b"otherDetailsType"),"emulator_sdk_package_identity"),
      (metadata_fixture.replace(b"</localPackage>",b"</localPackage><localPackage path='emulator'/>"),"emulator_sdk_package_identity"),
      (b'<!DOCTYPE repository>'+metadata_fixture,"emulator_sdk_metadata_invalid"),
      (b"x"*262145,"emulator_sdk_metadata_invalid"),
    )
    for raw,reason in invalid_registered_metadata:
        try: parse_registered_emulator_metadata(raw)
        except Refuse as error: need(str(error)==reason,"offline_registered_metadata_wrong_reason")
        else: raise Refuse("offline_registered_metadata_expected_refusal")
        cases+=1
    child=child_failure_record("avd_create",17)
    refusal=child_failed_refusal("avd_create",17)
    ordinary=child_failed_refusal(None,17)
    need(child=={"operation":"avd_create","exitCode":17}
         and str(refusal)=="child_failed" and refusal.child_failure==child
         and str(ordinary)=="child_failed" and ordinary.child_failure is None
         and "secret-path" not in json.dumps(child),
         "offline_child_failure_detail_fixture")
    cases+=1
    for operation,code,reason in (("avd_create /secret-path",17,"child_operation_invalid"),
                                  ("adb_start_server",True,"child_exit_code_invalid"),
                                  ("adb_boot_probe",256,"child_exit_code_invalid")):
        try: child_failure_record(operation,code)
        except Refuse as error: need(str(error)==reason,"offline_child_failure_wrong_reason")
        else: raise Refuse("offline_child_failure_expected_refusal")
        cases+=1
    class SyntheticUnexpected(Exception): pass
    evidence=internal_failure_evidence(SyntheticUnexpected("secret"),"identity_prepare")
    need(evidence=={"phase":"identity_prepare","exceptionCategory":"Other","errno":None}
         and "SyntheticUnexpected" not in json.dumps(evidence)
         and "secret" not in json.dumps(evidence),
         "offline_internal_failure_other_fixture")
    cases+=1
    # These pins are the exact vendor source.properties member bytes, not a synthesized file.
    metadata=parse_emulator_source_properties(EMU_SOURCE_PROPERTIES)
    need(len(EMU_SOURCE_PROPERTIES)==103 and
         hashlib.sha256(EMU_SOURCE_PROPERTIES).hexdigest()==EMU_METADATA_SHA256 and
         metadata==EMU_METADATA_FIELDS,
         "offline_emulator_metadata_positive")
    cases+=1
    metadata_cases=(
        (EMU_SOURCE_PROPERTIES.replace(b"37.3.10",b"37.2.12"),"emulator_revision_invalid"),
        (EMU_SOURCE_PROPERTIES.replace(b"16970787",b"16740728"),"emulator_revision_invalid"),
        (b"\n".join(line for line in EMU_SOURCE_PROPERTIES.splitlines()
                      if not line.startswith(b"Pkg.BuildId=")),"emulator_revision_invalid"),
        (EMU_SOURCE_PROPERTIES+b"\nPkg.Path=emulator","emulator_metadata_duplicate"),
        (EMU_SOURCE_PROPERTIES+b"\n","emulator_metadata_digest_invalid"),
        (b"", "emulator_metadata_size_invalid"),
        (b"x"*(EMU_METADATA_LIMIT+1),"emulator_metadata_size_invalid"),
    )
    for raw,reason in metadata_cases:
        try:
            parse_emulator_source_properties(raw)
        except Refuse as error:
            need(str(error)==reason,"offline_emulator_metadata_wrong_reason")
        else:
            raise Refuse("offline_emulator_metadata_expected_refusal")
        cases+=1
    invalid=[]
    invalid.append((b"no report",b"","test_report_missing_or_ambiguous","en"))
    invalid.append((REPORT_PREFIX.encode()+encoded+b"\n"+REPORT_PREFIX.encode()+encoded,b"",
                    "test_report_missing_or_ambiguous","en"))
    invalid.append((REPORT_PREFIX.encode()+json.dumps({**valid,"locale":"my"}).encode(),b"",
                    "test_report_values_invalid","en"))
    bad_portrait={**tablet_fixture["portrait"],"logicalWidth":411.0}
    bad_profile={**tablet_fixture,"profileId":"medium_phone"}
    bad_viewport={**tablet_fixture,"portrait":bad_portrait}
    short_viewports=[]
    for logical_width in (480.0,533.0):
        short_viewports.append({**tablet_fixture["portrait"],
          "logicalWidth":logical_width,"devicePixelRatio":2.0,
          "physicalWidth":int(logical_width*2),"physicalHeight":2560})
    bad_effect={**tablet_fixture,"salesAfterRotation":1}
    bad_target={**tablet_fixture,"confirmTargetMinDp":47.0}
    bad_layout_claim={**tablet_fixture,"basketLayoutBeforeRotation":"compact"}
    bad_contents={**tablet_fixture,"basketContentsAfterRotation":
                  {"productName":"Tea","quantity":2,"totalMmk":5000}}
    bad_split_review={**tablet_fixture,"reviewTargetMinDpBeforeRotation":48.0}
    bad_compact_review={**compact_fixture,"reviewTargetMinDpBeforeRotation":None}
    bad_ime={**tablet_fixture,"imeViewInsetsBottom":0.0}
    for tablet,reason in ((bad_profile,"test_tablet_evidence_invalid"),
                          (bad_viewport,"test_tablet_evidence_invalid"),
                          *[( {**tablet_fixture,"portrait":view},
                              "test_tablet_evidence_invalid") for view in short_viewports],
                          (bad_effect,"test_tablet_rotation_effect_invalid"),
                          (bad_target,"test_tablet_target_invalid"),
                          (bad_layout_claim,"test_tablet_layout_invalid"),
                          (bad_contents,"test_tablet_basket_contents_invalid"),
                          (bad_split_review,"test_tablet_target_invalid"),
                          (bad_compact_review,"test_tablet_target_invalid"),
                          (bad_ime,"test_tablet_ime_invalid")):
        invalid.append((REPORT_PREFIX.encode()+json.dumps({**valid,"tabletEvidence":tablet}).encode(),
                        b"",reason,"en"))
    invalid.append((REPORT_PREFIX.encode()+json.dumps({**valid,"extra":"x"}).encode(),b"",
                    "test_report_shape_invalid","en"))
    invalid.append((REPORT_PREFIX.encode()+json.dumps({**valid,"explicitTestTapCalls":True}).encode(),b"",
                    "test_report_metric_invalid","en"))
    invalid.append((REPORT_PREFIX.encode()+json.dumps({**valid,
                    "appMainToFinalDatabaseAssertionsMilliseconds":500}).encode(),b"",
                    "test_report_metric_invalid","en"))
    invalid.append((REPORT_PREFIX.encode()+b'{"scenario":"x","scenario":"y"}',b"",
                    "report_json_duplicate_key","en"))
    invalid.append((REPORT_PREFIX.encode()+encoded,b"","test_report_values_invalid","my"))
    for out,err,reason,locale in invalid:
        try: parse_report(out,err,locale)
        except Refuse as error: need(str(error)==reason,"offline_fixture_wrong_reason")
        else: raise Refuse("offline_fixture_expected_refusal")
        cases+=1
    fs_cases=run_emulator_metadata_filesystem_tests()
    need(fs_cases==6,"offline_emulator_metadata_fs_case_count")
    cases+=fs_cases
    process_cases=run_child_diagnostic_process_tests()
    need(process_cases==4,"offline_child_process_case_count")
    cases+=process_cases
    registered_fs_cases=run_registered_emulator_filesystem_tests()
    need(registered_fs_cases==12,"offline_registered_fs_case_count")
    cases+=registered_fs_cases
    print(json.dumps({"schema":"supermega.first_sale_runner_offline.v1",
                      "status":"passed","cases":cases},sort_keys=True,
                     separators=(",",":")))

def child_env(task,port,locale="setup"):
    name=locale or "setup"
    tmp=task/"tmp"/name
    avdhome=task/"avd-home"/name
    for path in (tmp,avdhome,task/"pub-cache",task/"gradle",task/"android-user"/name):
        path.mkdir(parents=True,exist_ok=True,mode=0o700)
    keys=("PATH","HOME","RUNNER_TEMP","ANDROID_HOME","ANDROID_SDK_ROOT","JAVA_HOME",
          "FLUTTER_ROOT","HTTP_PROXY","HTTPS_PROXY","NO_PROXY","ALL_PROXY",
          "SSL_CERT_FILE","SSL_CERT_DIR","CURL_CA_BUNDLE")
    e={k:os.environ[k] for k in keys if k in os.environ}
    sdk=os.environ.get("ANDROID_SDK_ROOT") or os.environ.get("ANDROID_HOME")
    need(sdk and Path(sdk).is_dir() and not Path(sdk).is_symlink(),"android_sdk_missing")
    e.update({"ANDROID_HOME":sdk,"ANDROID_SDK_ROOT":sdk,
      "ANDROID_SDK_HOME":str(task/"android-user"/name),
      "ANDROID_USER_HOME":str(task/"android-user"/name),
      "ANDROID_AVD_HOME":str(avdhome),"GRADLE_USER_HOME":str(task/"gradle"),
      "PUB_CACHE":str(task/"pub-cache"),"TMPDIR":str(tmp),
      "ANDROID_ADB_SERVER_PORT":str(port),"CI":"true",
      "SHOP_CONNECTED_ORDERS_ENABLED":"","SUPABASE_URL":"",
      "SUPABASE_PUBLISHABLE_KEY":"","SHOP_API_BASE_URL":"",
      "ORG_GRADLE_PROJECT_SHOP_ANDROID_KEYSTORE_PATH":"",
      "ORG_GRADLE_PROJECT_SHOP_ANDROID_KEY_ALIAS":"",
      "ORG_GRADLE_PROJECT_SHOP_ANDROID_STORE_PASSWORD":"",
      "ORG_GRADLE_PROJECT_SHOP_ANDROID_KEY_PASSWORD":""})
    return e
def extract_checked(archive,dest,deadline):
    base=Path(dest).resolve()
    with zipfile.ZipFile(archive) as z:
        items=z.infolist(); seen=set(); expanded=0
        need(0<len(items)<=12000,"emulator_archive_entries")
        for i in items:
            n=i.filename; parts=n.rstrip("/").split("/")
            need(n and not n.startswith("/") and "\\" not in n and "\0" not in n
                 and all(p not in ("",".","..") for p in parts),"emulator_archive_path")
            key="/".join(parts).casefold()
            need(key not in seen,"emulator_archive_alias"); seen.add(key)
            mode=(i.external_attr>>16)&0xffff; kind=stat.S_IFMT(mode)
            need(kind in (0,stat.S_IFREG,stat.S_IFDIR)
                 and not(i.is_dir() and kind==stat.S_IFREG)
                 and not(not i.is_dir() and kind==stat.S_IFDIR),"emulator_archive_type")
            expanded+=i.file_size; need(expanded<=2*1024**3,"emulator_archive_expansion")
        for i in items:
            need(time.monotonic()<deadline,"job_budget")
            target=base.joinpath(*i.filename.rstrip("/").split("/"))
            need(target.resolve(strict=False).is_relative_to(base),"emulator_archive_path")
            if i.is_dir():
                target.mkdir(parents=True,exist_ok=True,mode=0o700); os.chmod(target,0o700)
            else:
                target.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
                fd=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
                try:
                    with os.fdopen(fd,"wb",closefd=False) as dst,z.open(i) as src:
                        while True:
                            need(time.monotonic()<deadline,"job_budget")
                            chunk=src.read(1024*1024)
                            if not chunk: break
                            dst.write(chunk)
                    mode=(i.external_attr>>16)&0o111
                    os.fchmod(fd,0o700 if mode else 0o600)
                finally: os.close(fd)
def parse_emulator_source_properties(raw):
    need(type(raw) is bytes and 0<len(raw)<=EMU_METADATA_LIMIT,
         "emulator_metadata_size_invalid")
    try:
        text=raw.decode("ascii","strict")
    except UnicodeDecodeError:
        raise Refuse("emulator_metadata_invalid") from None
    fields={}
    for line in text.splitlines():
        need(line and "=" in line,"emulator_metadata_invalid")
        key,value=line.split("=",1)
        need(key and key not in fields,"emulator_metadata_duplicate")
        fields[key]=value
    need(fields==EMU_METADATA_FIELDS,"emulator_revision_invalid")
    need(len(raw)==EMU_METADATA_SIZE and
         hashlib.sha256(raw).hexdigest()==EMU_METADATA_SHA256,
         "emulator_metadata_digest_invalid")
    return fields

def read_emulator_source_properties(path,deadline):
    fd=None
    try:
        before_path=os.stat(path,follow_symlinks=False)
        need(stat.S_ISREG(before_path.st_mode) and
             0<before_path.st_size<=EMU_METADATA_LIMIT,
             "emulator_metadata_file_invalid")
        fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
        before=os.fstat(fd)
        need(stat.S_ISREG(before.st_mode) and
             (before.st_dev,before.st_ino,before.st_size)==
             (before_path.st_dev,before_path.st_ino,before_path.st_size),
             "emulator_metadata_identity_invalid")
        raw=bytearray()
        while True:
            need(time.monotonic()<deadline,"job_budget")
            chunk=os.read(fd,min(1024,EMU_METADATA_LIMIT+1-len(raw)))
            if not chunk: break
            raw.extend(chunk)
            need(len(raw)<=EMU_METADATA_LIMIT,"emulator_metadata_size_invalid")
        after=os.fstat(fd)
        after_path=os.stat(path,follow_symlinks=False)
        need(len(raw)==before.st_size and
             (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns,before.st_ctime_ns)==
             (after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns) and
             (after.st_dev,after.st_ino,after.st_size)==
             (after_path.st_dev,after_path.st_ino,after_path.st_size),
             "emulator_metadata_identity_changed")
        return parse_emulator_source_properties(bytes(raw))
    except Refuse:
        raise
    except OSError:
        raise Refuse("emulator_metadata_file_invalid") from None
    finally:
        if fd is not None: os.close(fd)

def expect_metadata_refusal(action,reason):
    try:
        action()
    except Refuse as error:
        need(str(error)==reason,"offline_emulator_metadata_fs_wrong_reason")
    else:
        raise Refuse("offline_emulator_metadata_fs_expected_refusal")

def run_emulator_metadata_filesystem_tests():
    count=0
    with tempfile.TemporaryDirectory(prefix="shop-emulator-metadata-") as temporary:
        root=Path(temporary)
        regular=root/"source.properties"
        regular.write_bytes(EMU_SOURCE_PROPERTIES)
        need(read_emulator_source_properties(regular,time.monotonic()+5)==EMU_METADATA_FIELDS,
             "offline_emulator_metadata_fs_regular")
        count+=1
        symlink=root/"source-link.properties"
        symlink.symlink_to(regular.name)
        expect_metadata_refusal(
            lambda:read_emulator_source_properties(symlink,time.monotonic()+5),
            "emulator_metadata_file_invalid")
        count+=1
        expect_metadata_refusal(
            lambda:read_emulator_source_properties(root/"missing.properties",time.monotonic()+5),
            "emulator_metadata_file_invalid")
        count+=1
        directory=root/"directory.properties"
        directory.mkdir()
        expect_metadata_refusal(
            lambda:read_emulator_source_properties(directory,time.monotonic()+5),
            "emulator_metadata_file_invalid")
        count+=1
        oversized=root/"oversized.properties"
        oversized.write_bytes(b"x"*(EMU_METADATA_LIMIT+1))
        expect_metadata_refusal(
            lambda:read_emulator_source_properties(oversized,time.monotonic()+5),
            "emulator_metadata_file_invalid")
        count+=1
        expect_metadata_refusal(
            lambda:read_emulator_source_properties(regular,time.monotonic()-1),
            "job_budget")
        count+=1
    return count

def install_emulator(root,sdk,task,e,deadline):
    archive=task/"emulator.zip"
    import urllib.request
    try:
        req=urllib.request.Request(EMU_URL,headers={"User-Agent":"shop-first-sale-qa/1"})
        with urllib.request.urlopen(req,timeout=30) as r,archive.open("xb") as f:
            need(r.geturl()==EMU_URL,"emulator_redirect")
            size=0; h=hashlib.sha256()
            while True:
                need(time.monotonic()<deadline,"job_budget")
                b=r.read(1024*1024)
                if not b: break
                size+=len(b); need(size<=EMU_SIZE,"emulator_size")
                h.update(b); f.write(b)
        need(size==EMU_SIZE and h.hexdigest()==EMU_SHA,"emulator_digest")
    except Refuse: raise
    except Exception: raise Refuse("emulator_unavailable") from None
    # AVD Manager reads default hardware definitions from the registered SDK package.
    # Do not invent package.xml or execute a different/unverified installed emulator.
    target=Path(sdk)/"emulator"
    license_file=Path(sdk)/"licenses/android-sdk-license"
    need(license_file.is_file() and not license_file.is_symlink(),
         "android_license_not_preaccepted")
    set_phase("emulator_sdk_registration")
    if target.exists() or target.is_symlink():
        need(target.is_dir() and not target.is_symlink(),"emulator_sdk_root_invalid")
    else:
        manager=Path(sdk)/"cmdline-tools/latest/bin/sdkmanager"
        run([str(manager),"--sdk_root="+str(sdk),"--channel=0","--install","emulator"],
            root,e,bounded_time(deadline,300),operation="sdkmanager_install_emulator")
    registered=verify_registered_emulator(archive,target,deadline)
    need(registered["verifiedVendorFiles"]==398 and
         registered["verifiedVendorBytes"]==892942977,"emulator_sdk_archive_invalid")
    metadata=read_emulator_source_properties(target/EMU_METADATA_PATH,deadline)
    binary=target/"emulator"
    need(metadata["Pkg.Path"]=="emulator" and
         metadata["Pkg.Revision"]==EMU_VERSION and
         metadata["Pkg.BuildId"]==EMU_BUILD_ID and
         binary.is_file() and not binary.is_symlink() and os.access(binary,os.X_OK),
         "emulator_revision_invalid")
    return binary
def xml_name(element):
    return element.tag.rsplit("}",1)[-1]
def xml_child(element,name):
    return next((child for child in list(element) if xml_name(child)==name),None)
def xml_text(element,name,default=""):
    child=xml_child(element,name)
    return (child.text or "").strip() if child is not None else default

def parse_registered_emulator_metadata(raw):
    need(type(raw) is bytes and 0<len(raw)<=262144 and
         b"<!DOCTYPE" not in raw.upper() and b"<!ENTITY" not in raw.upper(),
         "emulator_sdk_metadata_invalid")
    try: root=ET.fromstring(raw)
    except ET.ParseError: raise Refuse("emulator_sdk_metadata_invalid") from None
    local=[node for node in root.iter() if xml_name(node)=="localPackage"]
    need(len(local)==1 and local[0].get("path")=="emulator",
         "emulator_sdk_package_identity")
    revision=xml_child(local[0],"revision")
    details=xml_child(local[0],"type-details")
    kind=details.get("{http://www.w3.org/2001/XMLSchema-instance}type","") if details is not None else ""
    need(revision is not None and
         tuple(xml_text(revision,key,"0") for key in ("major","minor","micro"))==
             tuple(EMU_VERSION.split(".")) and
         kind.split(":")[-1]=="genericDetailsType",
         "emulator_sdk_package_identity")
    return {"package":"emulator","revision":EMU_VERSION,
            "metadataScope":"sdkmanager_generated_registration_only"}

def read_registered_emulator_metadata(path):
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
    try:
        before=os.fstat(fd)
        need(stat.S_ISREG(before.st_mode) and 0<before.st_size<=262144,
             "emulator_sdk_metadata_invalid")
        raw=bytearray()
        while len(raw)<=262144:
            chunk=os.read(fd,65536)
            if not chunk: break
            raw.extend(chunk)
        after=os.fstat(fd)
        need((before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns)==
             (after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns) and
             len(raw)==before.st_size,"emulator_sdk_metadata_changed")
    finally: os.close(fd)
    return parse_registered_emulator_metadata(bytes(raw))

def verify_registered_emulator(archive,target,deadline):
    # This proves a byte comparison only. The caller separately pins the full archive.
    need(target.is_dir() and not target.is_symlink(),"emulator_sdk_root_invalid")
    root_info=os.stat(target,follow_symlinks=False)
    with zipfile.ZipFile(archive) as z:
        expected={}; seen=set(); expected_dirs={"."}; expanded=0
        entries=z.infolist()
        need(0<len(entries)<=12000,"emulator_sdk_archive_invalid")
        for entry in entries:
            name=entry.filename
            parts=name.rstrip("/").split("/")
            mode=(entry.external_attr>>16)&0xffff
            need(not name.startswith("/") and "\\" not in name and ":" not in name
                 and "\0" not in name and parts[0]=="emulator"
                 and all(part not in ("",".","..") for part in parts)
                 and stat.S_IFMT(mode) in (0,stat.S_IFREG,stat.S_IFDIR),
                 "emulator_sdk_archive_invalid")
            alias="/".join(parts).casefold()
            need(alias not in seen,"emulator_sdk_archive_invalid"); seen.add(alias)
            if entry.is_dir():
                for count in range(2,len(parts)+1):
                    expected_dirs.add("/".join(parts[1:count]))
                continue
            need(len(parts)>1,"emulator_sdk_archive_invalid")
            rel="/".join(parts[1:]); expected[rel]=entry
            expanded+=entry.file_size
            need(expanded<=2*1024**3,"emulator_sdk_archive_invalid")
            for count in range(2,len(parts)):
                expected_dirs.add("/".join(parts[1:count]))
        need({"emulator","source.properties","lib/hardware-properties.ini"}<=set(expected)
             and "package.xml" not in expected,"emulator_sdk_archive_invalid")
        files=set()
        def walk_error(_error): raise Refuse("emulator_sdk_tree_unreadable")
        for current,dirs,names in os.walk(target,topdown=True,followlinks=False,onerror=walk_error):
            current_path=Path(current)
            rel_dir="." if current_path==target else current_path.relative_to(target).as_posix()
            need(rel_dir in expected_dirs,"emulator_sdk_unexpected_directory")
            for dirname in dirs:
                info=os.stat(current_path/dirname,follow_symlinks=False)
                need(stat.S_ISDIR(info.st_mode) and info.st_dev==root_info.st_dev,
                     "emulator_sdk_directory_invalid")
            for filename in names:
                path=current_path/filename
                rel=path.relative_to(target).as_posix()
                info=os.stat(path,follow_symlinks=False)
                need(stat.S_ISREG(info.st_mode) and info.st_dev==root_info.st_dev,
                     "emulator_sdk_file_invalid")
                need(rel in expected or rel=="package.xml","emulator_sdk_unexpected_file")
                need(rel not in files,"emulator_sdk_unexpected_file"); files.add(rel)
        need(files==set(expected)|{"package.xml"},"emulator_sdk_member_set_incomplete")
        for rel,entry in expected.items():
            need(time.monotonic()<deadline,"job_budget")
            digest=hashlib.sha256(); size=0
            with z.open(entry) as source:
                while True:
                    need(time.monotonic()<deadline,"job_budget")
                    chunk=source.read(1024*1024)
                    if not chunk: break
                    size+=len(chunk); need(size<=entry.file_size,"emulator_sdk_archive_invalid")
                    digest.update(chunk)
            need(size==entry.file_size and
                 stable_file_digest(target/rel,size,deadline)==digest.hexdigest(),
                 "emulator_sdk_vendor_file_mismatch")
        metadata=read_registered_emulator_metadata(target/"package.xml")
    return {**metadata,"verifiedVendorFiles":len(expected),"verifiedVendorBytes":expanded}

def run_registered_emulator_filesystem_tests():
    # Tiny synthetic ZIP/SDK trees only; no SDK Manager, emulator, AVD or network.
    cases=0
    fixture_xml=(b'<repository xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
      b'<localPackage path="emulator"><type-details xsi:type="generic:genericDetailsType"/>'
      b'<revision><major>37</major><minor>3</minor><micro>10</micro></revision>'
      b'</localPackage></repository>')
    variants=("valid","tamper","extra","missing_vendor","wrong_revision",
              "missing_metadata","root_link","file_link","extra_directory",
              "oversize_metadata","foreign_archive_path","vendor_package_xml")
    for variant in variants:
        with tempfile.TemporaryDirectory(prefix="shop-sdk-emulator-fixture-") as temp:
            fixture=Path(temp); target=fixture/"sdk-emulator"; target.mkdir()
            (target/"lib").mkdir()
            vendor={"emulator":b"SYNTHETIC_EMULATOR_BYTES\n",
                    "source.properties":EMU_SOURCE_PROPERTIES,
                    "lib/hardware-properties.ini":b"SYNTHETIC_HARDWARE_DEFINITIONS\n"}
            for rel,data in vendor.items(): (target/rel).write_bytes(data)
            (target/"package.xml").write_bytes(fixture_xml)
            archive=fixture/"vendor.zip"
            with zipfile.ZipFile(archive,"w") as z:
                for rel,data in vendor.items(): z.writestr("emulator/"+rel,data)
                if variant=="foreign_archive_path": z.writestr("other/file",b"x")
                if variant=="vendor_package_xml": z.writestr("emulator/package.xml",fixture_xml)
            expected=None; checked_target=target
            if variant=="tamper":
                (target/"emulator").write_bytes(b"synthetic_emulator_bytes\n")
                expected="emulator_sdk_vendor_file_mismatch"
            elif variant=="extra":
                (target/"unexpected.bin").write_bytes(b"x"); expected="emulator_sdk_unexpected_file"
            elif variant=="missing_vendor":
                (target/"emulator").unlink(); expected="emulator_sdk_member_set_incomplete"
            elif variant=="wrong_revision":
                (target/"package.xml").write_bytes(fixture_xml.replace(b"<micro>10</micro>",b"<micro>9</micro>"))
                expected="emulator_sdk_package_identity"
            elif variant=="missing_metadata":
                (target/"package.xml").unlink(); expected="emulator_sdk_member_set_incomplete"
            elif variant=="root_link":
                checked_target=fixture/"root-link"; checked_target.symlink_to(target,target_is_directory=True)
                expected="emulator_sdk_root_invalid"
            elif variant=="file_link":
                outside=fixture/"outside"; outside.write_bytes(vendor["emulator"])
                (target/"emulator").unlink(); (target/"emulator").symlink_to(outside)
                expected="emulator_sdk_file_invalid"
            elif variant=="extra_directory":
                (target/"unexpected-dir").mkdir(); expected="emulator_sdk_unexpected_directory"
            elif variant=="oversize_metadata":
                (target/"package.xml").write_bytes(b"x"*262145); expected="emulator_sdk_metadata_invalid"
            elif variant in ("foreign_archive_path","vendor_package_xml"):
                expected="emulator_sdk_archive_invalid"
            try:
                result=verify_registered_emulator(archive,checked_target,time.monotonic()+10)
            except Refuse as error:
                need(expected is not None and str(error)==expected,
                     "offline_registered_fs_wrong_reason")
            else:
                need(expected is None and result["verifiedVendorFiles"]==3 and
                     result["revision"]==EMU_VERSION,"offline_registered_fs_false_pass")
            cases+=1
    return cases

def verify_official_image_manifest(deadline):
    import urllib.request
    request=urllib.request.Request(IMAGE_MANIFEST_URL,
       headers={"User-Agent":"shop-first-sale-qa/1"})
    try:
        chunks=[]; total=0
        with urllib.request.urlopen(request,timeout=min(15,max(1,deadline-time.monotonic()))) as response:
            need(response.geturl()==IMAGE_MANIFEST_URL,"image_manifest_redirect")
            while True:
                need(time.monotonic()<deadline,"job_budget")
                chunk=response.read(min(65536,IMAGE_MANIFEST_SIZE+1-total))
                if not chunk: break
                total+=len(chunk); need(total<=IMAGE_MANIFEST_SIZE,"image_manifest_size_limit")
                chunks.append(chunk)
        data=b"".join(chunks)
    except Refuse: raise
    except Exception: raise Refuse("image_manifest_unavailable") from None
    need(len(data)==IMAGE_MANIFEST_SIZE and
         hashlib.sha256(data).hexdigest()==IMAGE_MANIFEST_SHA256,
         "image_manifest_digest_mismatch")
    try: root=ET.fromstring(data)
    except ET.ParseError: raise Refuse("image_manifest_invalid") from None
    packages=[node for node in root.iter()
              if xml_name(node)=="remotePackage" and node.get("path")==IMAGE]
    need(len(packages)==1,"image_manifest_package_missing")
    package=packages[0]
    revision=xml_child(package,"revision")
    details=xml_child(package,"type-details")
    tag=xml_child(details,"tag") if details is not None else None
    abi=xml_text(details,"abi") if details is not None else ""
    licenses=[node.get("ref") for node in list(package)
              if xml_name(node)=="uses-license"]
    archive_nodes=[node for node in package.iter() if xml_name(node)=="archive"]
    complete=[xml_child(node,"complete") for node in archive_nodes]
    complete=[node for node in complete if node is not None]
    need(revision is not None and
         (xml_text(revision,"major","0"),xml_text(revision,"minor","0"),
          xml_text(revision,"micro","0"))==("2","0","0")
         and details is not None and xml_text(details,"api-level")==IMAGE_API_LEVEL
         and xml_text(details,"extension-level")==IMAGE_EXTENSION_LEVEL
         and abi==IMAGE_ABI and tag is not None and xml_text(tag,"id")=="default"
         and licenses==[IMAGE_LICENSE] and len(complete)==1,
         "image_manifest_identity_mismatch")
    record=complete[0]
    checksums=[node for node in list(record)
               if xml_name(node)=="checksum" and node.get("type")=="sha1"]
    need(xml_text(record,"url")==IMAGE_ARCHIVE and
         IMAGE_ARCHIVE_URL=="https://dl.google.com/android/repository/sys-img/android/"+IMAGE_ARCHIVE and
         xml_text(record,"size")==str(IMAGE_ARCHIVE_SIZE) and
         len(checksums)==1 and (checksums[0].text or "").strip()==IMAGE_ARCHIVE_SHA1,
         "image_manifest_archive_mismatch")
    return {"manifestSha256":IMAGE_MANIFEST_SHA256,
            "archiveSha256StaticPin":IMAGE_ARCHIVE_SHA256,
            "archiveBytes":IMAGE_ARCHIVE_SIZE,"archiveSha1":IMAGE_ARCHIVE_SHA1}

def stable_file_digest(path,expected_size,deadline):
    fd=None
    try:
        before_path=os.stat(path,follow_symlinks=False)
        need(stat.S_ISREG(before_path.st_mode),"image_file_kind_invalid")
        need(before_path.st_size==expected_size,"image_file_size_mismatch")
        fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
        before=os.fstat(fd)
        need(stat.S_ISREG(before.st_mode) and
             (before.st_dev,before.st_ino,before.st_size)==
             (before_path.st_dev,before_path.st_ino,expected_size),
             "image_file_identity_invalid")
        h=hashlib.sha256(); total=0
        while True:
            need(time.monotonic()<deadline,"job_budget")
            chunk=os.read(fd,1024*1024)
            if not chunk: break
            total+=len(chunk)
            need(total<=expected_size,"image_file_size_changed")
            h.update(chunk)
        after=os.fstat(fd); after_path=os.stat(path,follow_symlinks=False)
        need(total==expected_size and
             (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns,before.st_ctime_ns)==
             (after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns) and
             (after.st_dev,after.st_ino,after.st_size)==
             (after_path.st_dev,after_path.st_ino,after_path.st_size),
             "image_file_changed_during_hash")
        return h.hexdigest()
    except Refuse: raise
    except OSError: raise Refuse("image_file_unavailable") from None
    finally:
        if fd is not None: os.close(fd)

def verify_installed_image(image,deadline):
    need(image.is_dir() and not image.is_symlink(),"image_root_invalid")
    root_info=os.stat(image,follow_symlinks=False)
    expected_files={}
    for vendor_path,pin in IMAGE_FILES.items():
        need(vendor_path.startswith("x86_64/") and len(vendor_path)>len("x86_64/"),
             "image_manifest_path_invalid")
        expected_files[vendor_path[len("x86_64/"):]]=pin
    expected_dirs={"."}
    for rel in expected_files:
        parts=Path(rel).parts
        for count in range(1,len(parts)):
            expected_dirs.add(Path(*parts[:count]).as_posix())
    verified=set(); package_metadata=None; package_count=0
    def onerror(_error):
        raise Refuse("image_tree_unreadable")
    for current,dirs,files in os.walk(image,topdown=True,followlinks=False,onerror=onerror):
        current_path=Path(current)
        relative_dir="." if current_path==image else current_path.relative_to(image).as_posix()
        need(relative_dir in expected_dirs,"image_unexpected_directory")
        for dirname in list(dirs):
            path=current_path/dirname
            info=os.stat(path,follow_symlinks=False)
            need(stat.S_ISDIR(info.st_mode) and info.st_dev==root_info.st_dev,
                 "image_directory_kind_or_device_invalid")
        for filename in files:
            path=current_path/filename
            rel=path.relative_to(image).as_posix()
            info=os.stat(path,follow_symlinks=False)
            need(stat.S_ISREG(info.st_mode) and info.st_dev==root_info.st_dev,
                 "image_file_kind_or_device_invalid")
            if rel=="package.xml":
                package_count+=1
                need(package_count==1 and info.st_size<=262144,
                     "image_package_metadata_invalid")
                raw=bytearray()
                fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
                try:
                    while len(raw)<=262144:
                        chunk=os.read(fd,65536)
                        if not chunk: break
                        raw.extend(chunk)
                finally: os.close(fd)
                need(len(raw)<=262144,"image_package_metadata_oversize")
                try: package_metadata=ET.fromstring(bytes(raw))
                except ET.ParseError: raise Refuse("image_package_metadata_invalid") from None
                continue
            need(rel in expected_files and rel not in verified,"image_unexpected_file")
            size,digest=expected_files[rel]
            need(info.st_size==size and stable_file_digest(path,size,deadline)==digest,
                 "image_member_pin_mismatch")
            verified.add(rel)
    need(verified==set(expected_files) and package_count==1 and
         package_metadata is not None,"image_member_set_incomplete")
    local=[node for node in package_metadata.iter() if xml_name(node)=="localPackage"]
    need(len(local)==1 and local[0].get("path")==IMAGE,
         "image_installed_package_identity")
    revision=xml_child(local[0],"revision")
    details=xml_child(local[0],"type-details")
    tag=xml_child(details,"tag") if details is not None else None
    need(revision is not None and
         (xml_text(revision,"major","0"),xml_text(revision,"minor","0"),
          xml_text(revision,"micro","0"))==("2","0","0")
         and details is not None and xml_text(details,"api-level")==IMAGE_API_LEVEL
         and xml_text(details,"extension-level")==IMAGE_EXTENSION_LEVEL
         and xml_text(details,"abi")==IMAGE_ABI and tag is not None
         and xml_text(tag,"id")=="default",
         "image_installed_package_identity")
    return {"verifiedVendorFiles":len(verified),"packageMetadataOnly":True,
            "systemImageBytes":IMAGE_FILES["x86_64/system.img"][0],
            "systemImageSha256":IMAGE_SHA256}

class ScopedKvm:
    def __init__(self,root,task,e): self.root=root; self.task=task; self.e=e; self.changed=False
    def open(self):
        need(stat.S_ISCHR(os.stat("/dev/kvm",follow_symlinks=False).st_mode),"kvm_device_invalid")
        self.before=run(["getfacl","-p","--","/dev/kvm"],self.root,self.e,10,True)
        need(b"# file: /dev/kvm" in self.before,"kvm_acl_unknown")
        self.backup=self.task/"kvm.acl"; self.backup.write_bytes(self.before); os.chmod(self.backup,0o600)
        self.changed=True
        run(["sudo","-n","setfacl","-m","u:"+str(os.getuid())+":rw","--","/dev/kvm"],
            self.root,self.e,10)
        need(os.access("/dev/kvm",os.R_OK|os.W_OK),"kvm_acl_denied")
    def close(self):
        if self.changed:
            run(["sudo","-n","setfacl","--restore="+str(self.backup)],self.root,self.e,10)
            after=run(["getfacl","-p","--","/dev/kvm"],self.root,self.e,10,True)
            need(after==self.before,"kvm_acl_restore_unproven"); self.changed=False
def parse_tablet_profile_listing(raw):
    need(type(raw) is bytes and 0<len(raw)<=1024*1024,"tablet_profile_listing_invalid")
    try: text=raw.decode("utf-8","strict")
    except UnicodeError: raise Refuse("tablet_profile_listing_invalid") from None
    blocks=re.split(r"(?m)^-{3,}\s*$",text)
    matches=[block for block in blocks if
       re.search(r'(?m)^\s*id:\s*[^\r\n]*"medium_tablet"\s*$',block) and
       re.search(r"(?m)^\s*Name:\s*Medium Tablet\s*$",block) and
       re.search(r"(?m)^\s*OEM\s*:\s*Generic\s*$",block)]
    need(len(matches)==1,"tablet_profile_unavailable")
    return {"profileId":TABLET_DEVICE_ID,"name":TABLET_DEVICE_NAME,
            "oem":TABLET_DEVICE_OEM}
def verify_tablet_profile(manager,root,e,deadline):
    raw=run([str(manager),"list","device"],root,e,
            bounded_time(deadline,15),True,operation="avdmanager_list_devices")
    return parse_tablet_profile_listing(raw)

def parse_tablet_display(size_raw,density_raw,font_scale_raw):
    try:
        size_text=size_raw.decode("ascii","strict").strip()
        density_text=density_raw.decode("ascii","strict").strip()
        font_text=font_scale_raw.decode("ascii","strict").strip()
    except (AttributeError,UnicodeError):
        raise Refuse("tablet_display_invalid") from None
    size=re.fullmatch(r"Physical size: ([1-9][0-9]{2,4})x([1-9][0-9]{2,4})",size_text)
    density=re.fullmatch(r"Physical density: ([1-9][0-9]{2,3})",density_text)
    try: scale=float(font_text)
    except ValueError: raise Refuse("tablet_display_invalid") from None
    need(size is not None and density is not None and math.isfinite(scale) and
         math.isclose(scale,1.3,rel_tol=0,abs_tol=0.001),"tablet_display_invalid")
    return {"physicalWidth":int(size.group(1)),"physicalHeight":int(size.group(2)),
            "densityDpi":int(density.group(1)),"fontScale":scale}
def read_tablet_display(adb,serial,root,e,deadline):
    size=run([str(adb),"-s",serial,"shell","wm","size"],root,e,
             bounded_time(deadline,10),True,operation="adb_read_display_size")
    density=run([str(adb),"-s",serial,"shell","wm","density"],root,e,
                bounded_time(deadline,10),True,operation="adb_read_display_density")
    scale=run([str(adb),"-s",serial,"shell","settings","get","system","font_scale"],
              root,e,bounded_time(deadline,10),True,operation="adb_read_font_scale")
    return parse_tablet_display(size,density,scale)

def run_locale(root,task,sdk,emulator,adb,locale,deadline):
    RUN_PROGRESS["currentLocale"]=locale
    set_phase("avd_prepare")
    name="shopqa"+uuid.uuid4().hex[:12]
    avd=task/"avds"/locale
    need(not avd.exists() and not avd.is_symlink(),"avd_target_exists")
    port=15000+int(os.environ["QA_RUN_ID"])%10000
    e=child_env(task,port,locale)
    with socket.socket() as sock: sock.bind(("127.0.0.1",port))
    avd.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    manager=Path(sdk)/"cmdline-tools/latest/bin/avdmanager"
    tablet_profile=verify_tablet_profile(manager,root,e,deadline)
    run([str(manager),"create","avd","-n",name,"-k",IMAGE,"-p",str(avd),
         "-d",TABLET_DEVICE_ID],
        root,e,min(60,max(1,deadline-time.monotonic())),input_data=b"no\n",
        operation="avd_create")
    need(avd.is_dir() and not avd.is_symlink() and
         (avd/"config.ini").is_file() and not (avd/"config.ini").is_symlink(),
         "avd_creation_invalid")
    driver_dir=task/("driver-"+locale)
    driver_dir.mkdir(mode=0o700)
    driver=driver_dir/"first_sale_persistence_test.dart"
    need(not driver.exists() and not driver.is_symlink(),"driver_path_conflict")
    driver.write_text(DRIVER_SOURCE,encoding="utf-8")
    os.chmod(driver,0o600)
    proc=None; adb_started=False; start=time.monotonic()
    try:
        RUN_PROGRESS["cleanupProven"]=False
        adb_started=True
        run([str(adb),"start-server"],root,e,bounded_time(deadline,15),
            operation="adb_start_server")
        proc=subprocess.Popen([str(emulator),"-avd",name,"-port","5554","-wipe-data",
          "-no-snapshot","-no-window","-no-audio","-no-boot-anim",
          "-gpu","swiftshader_indirect","-accel","on"],
          cwd=str(task),env=e,stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,
          stderr=subprocess.DEVNULL,start_new_session=True,close_fds=True)
        serial="emulator-5554"
        run([str(adb),"-s",serial,"wait-for-device"],root,e,
            min(90,max(1,deadline-time.monotonic())),
            operation="adb_wait_for_device")
        boot=min(deadline,time.monotonic()+150)
        while time.monotonic()<boot:
            need(proc.poll() is None,"emulator_exited")
            if run([str(adb),"-s",serial,"shell","getprop","sys.boot_completed"],
                   root,e,bounded_time(deadline,10),True,
                   operation="adb_boot_probe").decode("ascii","replace").strip()=="1": break
            time.sleep(2)
        else: raise Refuse("emulator_boot_timeout")
        lines=run([str(adb),"devices"],root,e,bounded_time(deadline,10),True,
                  operation="adb_devices").decode("ascii","replace").splitlines()[1:]
        need([line.split() for line in lines if line.strip()]==[[serial,"device"]],
             "adb_device_set")
        run([str(adb),"-s",serial,"shell","settings","put","system","font_scale","1.3"],
            root,e,bounded_time(deadline,10),operation="adb_set_font_scale")
        tablet_display=read_tablet_display(adb,serial,root,e,deadline)
        need(shutil.disk_usage(os.environ["RUNNER_TEMP"]).free>=4*1024**3,
             "capacity_before_test")
        set_phase("test_running")
        RUN_PROGRESS["attemptedLocales"].append(locale)
        stdout_bytes,stderr_bytes=run(["flutter","drive","--no-pub",
          "--device-id="+serial,"--driver="+str(driver),
          "--target="+str(TEST.relative_to(APP)),"--flavor=qa",
          "--dart-define=SHOP_RUNTIME_PROFILE=synthetic_qa_v1",
          "--dart-define=SHOP_QA_PROFILE_ID=synthetic-qa-v1",
          "--dart-define=SHOP_AVD_PROFILE_ID="+TABLET_DEVICE_ID,
          "--dart-define=SHOP_FIRST_SALE_LOCALE="+locale],
          root/APP,e,min(6*60,max(1,deadline-time.monotonic())),
          capture=True,capture_pair=True)
        report=parse_report(stdout_bytes,stderr_bytes,locale)
        RUN_PROGRESS["completedLocales"].append(locale)
        RUN_PROGRESS["currentLocale"]=None
        set_phase("locale_complete")
        need(shutil.disk_usage(os.environ["RUNNER_TEMP"]).free>=2*1024**3,
             "capacity_after_test")
        return {"locale":locale,"result":"passed",
                "elapsedMs":int((time.monotonic()-start)*1000),
                "tabletEnvironment":{"avdProfile":tablet_profile,
                                     "hostDisplay":tablet_display},
                "reportData":report}
    finally:
        cleanup_ok=True
        if proc is not None:
            try: stop_group(proc)
            except Exception: cleanup_ok=False
        if adb_started:
            try: run([str(adb),"kill-server"],root,e,10)
            except Exception: cleanup_ok=False
            try:
                with socket.create_connection(("127.0.0.1",port),timeout=.5):
                    cleanup_ok=False
            except OSError: pass
        if RUN_PROGRESS.get("ownedChildCleanupUncertain") is True:
            cleanup_ok=False
        if not cleanup_ok:
            RUN_PROGRESS["cleanupProven"]=False
            raise Refuse("owned_cleanup_unproven")
        RUN_PROGRESS["cleanupProven"]=True

def bounded_time(deadline,limit):
    remaining=deadline-time.monotonic()
    need(remaining>0,"job_budget")
    return min(float(limit),remaining)

def capture_tracked_identity(root,identity):
    relative=identity.relative_to(root).as_posix()
    need(identity.is_file() and not identity.is_symlink()
         and git(root,"ls-files",relative)==relative,"identity_path_conflict")
    before=os.stat(identity,follow_symlinks=False)
    need(stat.S_ISREG(before.st_mode) and before.st_size<=1048576,
         "identity_preimage_invalid")
    data=identity.read_bytes()
    committed=run(["git","show","HEAD:"+relative],root,os.environ,10,True)
    need(data==committed and len(data)==before.st_size,"identity_preimage_not_committed")
    return {"bytes":data,"sha256":hashlib.sha256(data).hexdigest(),
            "identity":(before.st_dev,before.st_ino)}

def restore_tracked_identity(identity,preimage,generated_identity,generated_digest):
    need(identity.is_file() and not identity.is_symlink(),"generated_identity_cleanup_invalid")
    with identity.open("r+b") as stream:
        current=os.fstat(stream.fileno())
        expected=generated_identity if generated_identity is not None else preimage["identity"]
        need(stat.S_ISREG(current.st_mode) and (current.st_dev,current.st_ino)==expected
             and current.st_size<=1048576,"generated_identity_cleanup_invalid")
        observed=stream.read(1048577)
        expected_digest=generated_digest if generated_digest is not None else preimage["sha256"]
        need(hashlib.sha256(observed).hexdigest()==expected_digest,
             "generated_identity_changed_before_cleanup")
        stream.seek(0); stream.write(preimage["bytes"]); stream.truncate()
        stream.flush(); os.fsync(stream.fileno())
    need(identity.read_bytes()==preimage["bytes"],"identity_restore_mismatch")

def execute(root,head,lock):
    global RUN_PROGRESS
    RUN_PROGRESS={"currentLocale":None,"phase":"not_started","attemptedLocales":[],"completedLocales":[],"cleanupProven":True}
    set_phase("host_preflight")
    temp=Path(os.environ.get("RUNNER_TEMP",""))
    sdk=os.environ.get("ANDROID_SDK_ROOT") or os.environ.get("ANDROID_HOME")
    need(os.environ.get("RUNNER_OS")=="Linux" and os.environ.get("RUNNER_ARCH")=="X64"
         and os.environ.get("RUNNER_ENVIRONMENT")=="github-hosted"
         and platform.system()=="Linux" and platform.machine().lower() in ("x86_64","amd64"),
         "host_context_invalid")
    need(temp.is_absolute() and temp.is_dir() and not temp.is_symlink()
         and sdk and Path(sdk).is_dir() and not Path(sdk).is_symlink(),
         "runner_paths_invalid")
    set_phase("capacity_preflight")
    free=shutil.disk_usage(temp).free; sdkfree=shutil.disk_usage(sdk).free
    need(free>=16*1024**3 and sdkfree>=16*1024**3,"capacity_insufficient")
    need(temp.stat().st_dev==Path(sdk).stat().st_dev,"sdk_device_mismatch")
    task=None
    deadline=time.monotonic()+18*60; results=[]; acl=None; clean=True; result=None
    identity=root/APP/"lib/shop_build_identity.g.dart"
    identity_preimage=None; identity_identity=None; identity_digest=None
    try:
        set_phase("task_create")
        task=Path(tempfile.mkdtemp(prefix="shop-first-sale-",dir=temp)); os.chmod(task,0o700)
        set_phase("task_environment")
        e=child_env(task,15000+int(os.environ["QA_RUN_ID"])%10000)
        set_phase("flutter_version")
        fv=json.loads(run(["flutter","--version","--machine"],root,e,
                          bounded_time(deadline,15),True))
        need(fv.get("frameworkVersion")=="3.47.8","flutter_version")
        set_phase("dependency_resolution")
        before=file_sha(root/LOCK)
        run(["flutter","pub","get","--enforce-lockfile"],root/APP,e,
            bounded_time(deadline,180))
        deps=json.loads(run(["flutter","pub","deps","--json"],root/APP,e,
                            bounded_time(deadline,30),True))
        sdkdep=[p for p in deps.get("packages",[]) if p.get("name")=="integration_test"]
        need(len(sdkdep)==1 and sdkdep[0].get("source")=="sdk","integration_test_sdk")
        need(file_sha(root/LOCK)==before==lock,"lock_changed")
        forbidden=("SUPABASE_URL","SUPABASE_PUBLISHABLE_KEY","SHOP_API_BASE_URL",
          "SHOP_CONNECTED_ORDERS_ENABLED","ORG_GRADLE_PROJECT_SHOP_ANDROID_KEYSTORE_PATH",
          "ORG_GRADLE_PROJECT_SHOP_ANDROID_KEY_ALIAS","ORG_GRADLE_PROJECT_SHOP_ANDROID_STORE_PASSWORD",
          "ORG_GRADLE_PROJECT_SHOP_ANDROID_KEY_PASSWORD")
        need(not any(os.environ.get(k) for k in forbidden),"external_capability_env_present")
        set_phase("identity_prepare")
        identity_preimage=capture_tracked_identity(root,identity)
        set_phase("identity_generate")
        run(["node","tools/generate_shop_build_identity.mjs","--platform","android",
             "--profile","synthetic_qa_v1"],root,e,bounded_time(deadline,30))
        need(identity.is_file() and not identity.is_symlink(),"qa_identity_missing")
        st=os.stat(identity,follow_symlinks=False)
        identity_identity=(st.st_dev,st.st_ino)
        identity_digest=file_sha(identity)
        set_phase("android_toolchain_validation")
        sdkroot=Path(sdk); adb=sdkroot/"platform-tools/adb"
        manager=sdkroot/"cmdline-tools/latest/bin/sdkmanager"
        avdm=sdkroot/"cmdline-tools/latest/bin/avdmanager"
        for path in (adb,manager,avdm,sdkroot/"platforms/android-35/source.properties",
                     sdkroot/"build-tools/36.0.0/source.properties"):
            need(path.exists() and not path.is_symlink(),"android_tool_missing")
        sdkmanager_version=run([str(manager),"--version"],root,e,
                               bounded_time(deadline,15),True).decode("ascii","replace").strip()
        need(sdkmanager_version and len(sdkmanager_version)<=80,
             "android_sdkmanager_version_invalid")
        set_phase("libpulse_query")
        raw_query=run(["dpkg-query","-W",PULSE_QUERY_FORMAT,"libpulse0:amd64"],
                      root,e,bounded_time(deadline,10),True,accepted=(0,1))
        state=libpulse_query_state(raw_query)
        if state!="installed_exact":
            need(state=="absent","libpulse_state_invalid")
            set_phase("libpulse_install")
            run(["sudo","-n","apt-get","update"],root,e,bounded_time(deadline,180))
            run(["sudo","-n","apt-get","install","-y","--no-install-recommends",
                 "--no-upgrade","--no-remove","libpulse0:amd64="+PULSE],
                root,e,bounded_time(deadline,180))
            verified=run(["dpkg-query","-W",PULSE_QUERY_FORMAT,"libpulse0:amd64"],root,e,
                         bounded_time(deadline,10),True)
            need(libpulse_query_state(verified)=="installed_exact",
                 "libpulse_postinstall_invalid")
        set_phase("emulator_install")
        emu=install_emulator(root,sdk,task,e,deadline)
        set_phase("image_manifest")
        official=verify_official_image_manifest(deadline)
        image=sdkroot/"system-images/android-35/default/x86_64"
        license_file=sdkroot/"licenses/android-sdk-license"
        set_phase("image_license")
        need(license_file.is_file() and not license_file.is_symlink(),
             "android_license_not_preaccepted")
        if image.exists() or image.is_symlink():
            need(image.is_dir() and not image.is_symlink() and
                 (image/"package.xml").is_file(),
                 "android_image_partial_or_conflicting")
        else:
            set_phase("image_install")
            run([str(manager),"--sdk_root="+str(sdk),"--channel=0","--install",IMAGE],
                root,e,bounded_time(deadline,300))
        set_phase("image_validation")
        installed=verify_installed_image(image,deadline)
        set_phase("post_sdk_capacity")
        need(shutil.disk_usage(temp).free>=8*1024**3,"capacity_after_sdk_setup")
        set_phase("kvm_admission")
        acl=ScopedKvm(root,task,e); acl.open()
        set_phase("acceleration_check")
        run([str(emu),"-accel-check"],root,e,bounded_time(deadline,15))
        for locale in ("en","my"):
            need(time.monotonic()<deadline,"job_budget")
            need(shutil.disk_usage(temp).free>=4*1024**3,"capacity_before_avd")
            results.append(run_locale(root,task,sdk,emu,adb,locale,deadline))
        need(file_sha(root/LOCK)==lock,"lock_changed")
        result={**source_identity_facts(root,head),"testSha256":TEST_SHA,"pubspecSha256":PUB_SHA,
          "lockSha256":lock,"flutterVersion":"3.47.8","dartVersion":fv.get("dartSdkVersion"),
          "sdkmanagerVersion":sdkmanager_version,"emulatorVersion":EMU_VERSION,
          "emulatorSha256":EMU_SHA,"emulatorRegisteredSdkPackage":True,
          "emulatorVendorFilesVerified":398,"systemImagePackage":IMAGE,
          "systemImageRevision":"2.0.0","systemImageManifestSha256":official["manifestSha256"],
          "systemImageArchiveSha256StaticPin":official["archiveSha256StaticPin"],
          "systemImageArchiveBytesStaticPin":official["archiveBytes"],
          "systemImageExpandedBytesStaticPin":IMAGE_EXPANDED_BYTES,
          "systemImageVerifiedVendorFiles":installed["verifiedVendorFiles"],
          "systemImageSha256":installed["systemImageSha256"],
          "generatedIdentitySha256":identity_digest,"runnerImageOS":os.environ.get("ImageOS","unknown"),
          "runnerImageVersion":os.environ.get("ImageVersion","unknown"),
          "freeBytesBefore":free,"sdkFreeBytesBefore":sdkfree,"kvmAccessVerified":True,
          "accelerationCheckPassed":True,"locales":results,"runProgress":dict(RUN_PROGRESS),
          "instrumentedTestOnly":True}
    finally:
        try:
            if acl is not None: acl.close()
        except Exception: clean=False
        uncertain_child=RUN_PROGRESS.get("ownedChildCleanupUncertain") is True
        if uncertain_child: clean=False
        if identity_preimage is not None and not uncertain_child:
            try:
                restore_tracked_identity(identity,identity_preimage,identity_identity,identity_digest)
            except Exception: clean=False
        if clean and task is not None:
            try: shutil.rmtree(task)
            except OSError: clean=False
        if clean:
            try: need(git(root,"status","--porcelain","--untracked-files=all")=="",
                      "checkout_cleanup_unproven")
            except Exception: clean=False
        if not clean:
            RUN_PROGRESS["cleanupProven"]=False
            raise Refuse("owned_cleanup_unproven")
        if RUN_PROGRESS["cleanupProven"] is not False:
            RUN_PROGRESS["cleanupProven"]=True
    result["cleanupProven"]=RUN_PROGRESS["cleanupProven"]
    result["testExecutionState"]="completed"
    return result
def install_cancel_handlers():
    def cancel(signum,_frame):
        global CANCEL_PENDING
        if not CANCEL_PENDING:
            CANCEL_PENDING=True
            raise Refuse("runner_cancelled")
    signal.signal(signal.SIGTERM,cancel)
    signal.signal(signal.SIGINT,cancel)

def main():
    install_cancel_handlers()
    parser=argparse.ArgumentParser()
    group=parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--self-test",action="store_true")
    group.add_argument("--preflight-only",action="store_true")
    group.add_argument("--run",action="store_true")
    args=parser.parse_args()
    if args.self_test:
        try: run_self_tests(); return 0
        except Exception:
            print(json.dumps({"schema":"supermega.first_sale_runner_offline.v1",
                              "status":"failed"},sort_keys=True,separators=(",",":")))
            return 3
    facts={}
    try:
        root=Path(__file__).resolve().parents[1]
        head=check_context(root); lock=check_source(root)
        facts={**source_identity_facts(root,head),
               "testSha256":TEST_SHA,"pubspecSha256":PUB_SHA,
               "lockSha256":lock,"systemImagePackage":IMAGE,
               "systemImageManifestSha256":IMAGE_MANIFEST_SHA256,
               "systemImageArchiveSha256StaticPin":IMAGE_ARCHIVE_SHA256}
        if args.preflight_only:
            output("preflight_passed",**facts)
        else:
            output("instrumented_test_passed",**execute(root,head,lock))
        return 0
    except Refuse as error:
        progress=dict(RUN_PROGRESS)
        facts["cleanupProven"]=progress.get("cleanupProven",False)
        if error.child_failure is not None:
            facts["childFailure"]=error.child_failure
        progress["executionState"]=("not_started" if not progress["attemptedLocales"] else
          "completed" if progress["completedLocales"]==["en","my"] else
          "possible" if progress["phase"]=="test_running" else "partial")
        output("blocked_or_failed",reason=str(error),runProgress=progress,**facts); return 3
    except Exception as error:
        progress=dict(RUN_PROGRESS)
        facts["cleanupProven"]=progress.get("cleanupProven",False)
        facts["internalFailure"]=internal_failure_evidence(error)
        progress["executionState"]=("not_started" if not progress["attemptedLocales"] else
          "completed" if progress["completedLocales"]==["en","my"] else
          "possible" if progress["phase"]=="test_running" else "partial")
        output("blocked_or_failed",reason="internal_failure",runProgress=progress,**facts); return 3
if __name__=="__main__": sys.exit(main())
