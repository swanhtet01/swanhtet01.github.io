#!/usr/bin/env python3
"""Guarded, one-shot first-sale integration runner; not release evidence."""
import argparse, hashlib, json, os, platform, re, selectors, shutil, signal, socket, stat, subprocess, sys, tempfile, time, uuid, zipfile
from pathlib import Path
import xml.etree.ElementTree as ET

BASE="fcf8f3190b6245097c1b828633adbd05cce26814"
BASE_REF="codex/shop-main-integration-20261022"
BASE_SHA="4977d4caafa6921e83c97c950a154d3bd8aaf584"
APP=Path("mobile/shop_pos")
TEST=APP/"integration_test/first_sale_persistence_test.dart"
TEST_SHA="7955754807e56ec9cc3dbf8ff3a4da73a3c90039fcc037dbb97310c17df011e3"
PUB=APP/"pubspec.yaml"
PUB_SHA="228f2c2b2d1478d0546a80dbedf4c4393dd8d6700f01ff350b6ebe58a68c1f8a"
LOCK=APP/"pubspec.lock"
LOCK_SHA="772540b8f7fee17c0e7a9f0185c0366775ce5d61f7c94a5ab894beeb69605ccb"
IMAGE="system-images;android-35;default;x86_64"
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
 "newConnectionSameOsProcess","osProcessRestartProven","merchantAcceptance","promotionEligible"
}
ALLOWED_CHANGED={
  "tools/postgres17_toolchain_profile.mjs",
  "tools/postgres17_authenticode_transport.test.mjs",
  ".github/workflows/shop-native-ci.yml",
  ".gitattributes",
  "hq/research/postgres17-publisher-policy.json",
  "hq/research/postgres17-toolchain-profile.json",
  "hq/research/postgres17-edb-source-authenticode-observation.json",
  "tools/postgres17_publisher_policy_observation.test.mjs",
  "mobile/shop_pos/pubspec.yaml",
  "mobile/shop_pos/pubspec.lock",
  "mobile/shop_pos/integration_test/first_sale_persistence_test.dart",
  "mobile/shop_pos/lib/shop_today_screen.dart",
  "mobile/shop_pos/test/widget_test_support.dart",
  ".github/workflows/shop-first-sale-integration.yml",
  "tools/run_shop_first_sale_integration.py",
}
EMU_URL="https://dl.google.com/android/repository/emulator-linux_x64-16740729.zip"
EMU_SIZE=349658551
EMU_SHA="cbc7c3cfb83220b8a0f9c513fdab557712e74d339ec19ddffa43f23350ae9bdd"
EMU_VERSION="37.2.13"
PULSE="1:16.1+dfsg1-2ubuntu10.1"
RUN_PROGRESS={"currentLocale":None,"phase":"not_started","attemptedLocales":[],"completedLocales":[],"cleanupProven":True}
CANCEL_PENDING=False
FALSE={"authority":False,"fullReleaseCandidate":False,"installedQa":False,"osProcessRestartProven":False,
       "pgAcceptance":False,"hardwareAcceptance":False,"merchantAcceptance":False,
       "promotionEligible":False}

class Refuse(Exception): pass
def need(ok, reason):
    if not ok: raise Refuse(reason)
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
def run(argv,cwd,env,timeout=60,capture=False,input_data=None,accepted=(0,),capture_pair=False):
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
        stop_group(p)
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
    need(p.returncode in accepted,"child_failed")
    if capture_pair: return bytes(out),bytes(err)
    return bytes(out) if capture else b""

def git(root,*args):
    return run(["git",*args],root,os.environ,10,True).decode("ascii").strip()
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
    need(all(token in test_text for token in required),"test_report_contract_invalid")
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
        data['promotionEligible'] != false) {
      throw StateError('integration report values invalid');
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
    valid={"scenario":"first_product_and_cash_sale","locale":"en","productSeeded":False,
       "explicitTestTapCalls":8,"textEntryCalls":5,
       "appMainToSaleCompletionMilliseconds":1000,
       "appMainToFinalDatabaseAssertionsMilliseconds":2000,
       "appMainToSavedReceiptAssertionsMilliseconds":2500,
       "savedReceiptUiBoundToPersistedSale":True,"newConnectionSameOsProcess":True,
       "osProcessRestartProven":False,"merchantAcceptance":"NOT_RUN",
       "promotionEligible":False}
    encoded=json.dumps(valid,separators=(",",":")).encode()
    parse_report(REPORT_PREFIX.encode()+encoded+b"\n",b"","en")
    cases=2
    invalid=[]
    invalid.append((b"no report",b"","test_report_missing_or_ambiguous","en"))
    invalid.append((REPORT_PREFIX.encode()+encoded+b"\n"+REPORT_PREFIX.encode()+encoded,b"",
                    "test_report_missing_or_ambiguous","en"))
    invalid.append((REPORT_PREFIX.encode()+json.dumps({**valid,"locale":"my"}).encode(),b"",
                    "test_report_values_invalid","en"))
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
def install_emulator(root,sdk,task,e,deadline):
    stage=task/"pinned-emulator-sdk"
    target=stage/"emulator"
    archive=task/"emulator.zip"
    need(not stage.exists() and not stage.is_symlink(),"emulator_stage_conflict")
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
        extract_checked(archive,stage,deadline)
    except Refuse: raise
    except Exception: raise Refuse("emulator_unavailable") from None
    pkg=ET.parse(target/"package.xml").getroot().find(".//localPackage")
    rev=pkg.find("revision") if pkg is not None else None
    version=".".join(rev.findtext(k,"0") for k in ("major","minor","micro")) if rev is not None else ""
    binary=target/"emulator"
    need(pkg is not None and pkg.get("path")=="emulator" and version==EMU_VERSION
         and binary.is_file() and os.access(binary,os.X_OK),"emulator_revision_invalid")
    return binary
def xml_name(element):
    return element.tag.rsplit("}",1)[-1]
def xml_child(element,name):
    return next((child for child in list(element) if xml_name(child)==name),None)
def xml_text(element,name,default=""):
    child=xml_child(element,name)
    return (child.text or "").strip() if child is not None else default

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
def run_locale(root,task,sdk,emulator,adb,locale,deadline):
    RUN_PROGRESS["currentLocale"]=locale
    RUN_PROGRESS["phase"]="avd_prepare"
    name="shopqa"+uuid.uuid4().hex[:12]
    avd=task/"avds"/locale
    need(not avd.exists() and not avd.is_symlink(),"avd_target_exists")
    port=15000+int(os.environ["QA_RUN_ID"])%10000
    e=child_env(task,port,locale)
    with socket.socket() as sock: sock.bind(("127.0.0.1",port))
    avd.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    manager=Path(sdk)/"cmdline-tools/latest/bin/avdmanager"
    run([str(manager),"create","avd","-n",name,"-k",IMAGE,"-p",str(avd),"-d","pixel_2"],
        root,e,min(60,max(1,deadline-time.monotonic())),input_data=b"no\n")
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
        run([str(adb),"start-server"],root,e,bounded_time(deadline,15))
        proc=subprocess.Popen([str(emulator),"-avd",name,"-port","5554","-wipe-data",
          "-no-snapshot","-no-window","-no-audio","-no-boot-anim",
          "-gpu","swiftshader_indirect","-accel","on"],
          cwd=str(task),env=e,stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,
          stderr=subprocess.DEVNULL,start_new_session=True,close_fds=True)
        serial="emulator-5554"
        run([str(adb),"-s",serial,"wait-for-device"],root,e,
            min(90,max(1,deadline-time.monotonic())))
        boot=min(deadline,time.monotonic()+150)
        while time.monotonic()<boot:
            need(proc.poll() is None,"emulator_exited")
            if run([str(adb),"-s",serial,"shell","getprop","sys.boot_completed"],
                   root,e,bounded_time(deadline,10),True).decode("ascii","replace").strip()=="1": break
            time.sleep(2)
        else: raise Refuse("emulator_boot_timeout")
        lines=run([str(adb),"devices"],root,e,bounded_time(deadline,10),True).decode("ascii","replace").splitlines()[1:]
        need([line.split() for line in lines if line.strip()]==[[serial,"device"]],
             "adb_device_set")
        need(shutil.disk_usage(os.environ["RUNNER_TEMP"]).free>=4*1024**3,
             "capacity_before_test")
        RUN_PROGRESS["phase"]="test_running"
        RUN_PROGRESS["attemptedLocales"].append(locale)
        stdout_bytes,stderr_bytes=run(["flutter","drive","--no-pub",
          "--device-id="+serial,"--driver="+str(driver),
          "--target="+str(TEST.relative_to(APP)),"--flavor=qa",
          "--dart-define=SHOP_RUNTIME_PROFILE=synthetic_qa_v1",
          "--dart-define=SHOP_QA_PROFILE_ID=synthetic-qa-v1",
          "--dart-define=SHOP_FIRST_SALE_LOCALE="+locale],
          root/APP,e,min(6*60,max(1,deadline-time.monotonic())),
          capture=True,capture_pair=True)
        report=parse_report(stdout_bytes,stderr_bytes,locale)
        RUN_PROGRESS["completedLocales"].append(locale)
        RUN_PROGRESS["currentLocale"]=None
        RUN_PROGRESS["phase"]="locale_complete"
        need(shutil.disk_usage(os.environ["RUNNER_TEMP"]).free>=2*1024**3,
             "capacity_after_test")
        return {"locale":locale,"result":"passed",
                "elapsedMs":int((time.monotonic()-start)*1000),
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
    temp=Path(os.environ.get("RUNNER_TEMP",""))
    sdk=os.environ.get("ANDROID_SDK_ROOT") or os.environ.get("ANDROID_HOME")
    need(os.environ.get("RUNNER_OS")=="Linux" and os.environ.get("RUNNER_ARCH")=="X64"
         and os.environ.get("RUNNER_ENVIRONMENT")=="github-hosted"
         and platform.system()=="Linux" and platform.machine().lower() in ("x86_64","amd64"),
         "host_context_invalid")
    need(temp.is_absolute() and temp.is_dir() and not temp.is_symlink()
         and sdk and Path(sdk).is_dir() and not Path(sdk).is_symlink(),
         "runner_paths_invalid")
    free=shutil.disk_usage(temp).free; sdkfree=shutil.disk_usage(sdk).free
    need(free>=16*1024**3 and sdkfree>=16*1024**3,"capacity_insufficient")
    need(temp.stat().st_dev==Path(sdk).stat().st_dev,"sdk_device_mismatch")
    task=Path(tempfile.mkdtemp(prefix="shop-first-sale-",dir=temp)); os.chmod(task,0o700)
    deadline=time.monotonic()+18*60; results=[]; acl=None; clean=True; result=None
    identity=root/APP/"lib/shop_build_identity.g.dart"
    identity_preimage=None; identity_identity=None; identity_digest=None
    try:
        e=child_env(task,15000+int(os.environ["QA_RUN_ID"])%10000)
        fv=json.loads(run(["flutter","--version","--machine"],root,e,
                          bounded_time(deadline,15),True))
        need(fv.get("frameworkVersion")=="3.47.8","flutter_version")
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
        identity_preimage=capture_tracked_identity(root,identity)
        run(["node","tools/generate_shop_build_identity.mjs","--platform","android",
             "--profile","synthetic_qa_v1"],root,e,bounded_time(deadline,30))
        need(identity.is_file() and not identity.is_symlink(),"qa_identity_missing")
        st=os.stat(identity,follow_symlinks=False)
        identity_identity=(st.st_dev,st.st_ino)
        identity_digest=file_sha(identity)
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
        fmt="-f="+"$"+"{db:Status-Abbrev} "+"$"+"{Version}"
        q=run(["dpkg-query","-W",fmt,"libpulse0:amd64"],root,e,
              bounded_time(deadline,10),True,accepted=(0,1)).decode("ascii","replace").strip()
        if q!="ii "+PULSE:
            need(q in ("","un "),"libpulse_state_invalid")
            run(["sudo","-n","apt-get","update"],root,e,bounded_time(deadline,180))
            run(["sudo","-n","apt-get","install","-y","--no-install-recommends",
                 "--no-upgrade","--no-remove","libpulse0:amd64="+PULSE],
                root,e,bounded_time(deadline,180))
            verified=run(["dpkg-query","-W",fmt,"libpulse0:amd64"],root,e,
                         bounded_time(deadline,10),True).decode("ascii","replace").strip()
            need(verified=="ii "+PULSE,"libpulse_postinstall_invalid")
        emu=install_emulator(root,sdk,task,e,deadline)
        official=verify_official_image_manifest(deadline)
        image=sdkroot/"system-images/android-35/default/x86_64"
        license_file=sdkroot/"licenses/android-sdk-license"
        need(license_file.is_file() and not license_file.is_symlink(),
             "android_license_not_preaccepted")
        if image.exists() or image.is_symlink():
            need(image.is_dir() and not image.is_symlink() and
                 (image/"package.xml").is_file(),
                 "android_image_partial_or_conflicting")
        else:
            run([str(manager),"--sdk_root="+str(sdk),"--channel=0","--install",IMAGE],
                root,e,bounded_time(deadline,300))
        installed=verify_installed_image(image,deadline)
        need(shutil.disk_usage(temp).free>=8*1024**3,"capacity_after_sdk_setup")
        acl=ScopedKvm(root,task,e); acl.open()
        run([str(emu),"-accel-check"],root,e,bounded_time(deadline,15))
        for locale in ("en","my"):
            need(time.monotonic()<deadline,"job_budget")
            need(shutil.disk_usage(temp).free>=4*1024**3,"capacity_before_avd")
            results.append(run_locale(root,task,sdk,emu,adb,locale,deadline))
        need(file_sha(root/LOCK)==lock,"lock_changed")
        result={"sourceCommit":head,"testSha256":TEST_SHA,"pubspecSha256":PUB_SHA,
          "lockSha256":lock,"flutterVersion":"3.47.8","dartVersion":fv.get("dartSdkVersion"),
          "sdkmanagerVersion":sdkmanager_version,"emulatorVersion":EMU_VERSION,
          "emulatorSha256":EMU_SHA,"systemImagePackage":IMAGE,
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
        if identity_preimage is not None:
            try:
                restore_tracked_identity(identity,identity_preimage,identity_identity,identity_digest)
            except Exception: clean=False
        if clean:
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
        facts={"sourceCommit":head,"testSha256":TEST_SHA,"pubspecSha256":PUB_SHA,
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
        progress["executionState"]=("not_started" if not progress["attemptedLocales"] else
          "completed" if progress["completedLocales"]==["en","my"] else
          "possible" if progress["phase"]=="test_running" else "partial")
        output("blocked_or_failed",reason=str(error),runProgress=progress,**facts); return 3
    except Exception:
        progress=dict(RUN_PROGRESS)
        facts["cleanupProven"]=progress.get("cleanupProven",False)
        progress["executionState"]=("not_started" if not progress["attemptedLocales"] else
          "completed" if progress["completedLocales"]==["en","my"] else
          "possible" if progress["phase"]=="test_running" else "partial")
        output("blocked_or_failed",reason="internal_failure",runProgress=progress,**facts); return 3
if __name__=="__main__": sys.exit(main())
