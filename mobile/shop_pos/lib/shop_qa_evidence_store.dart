import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart' as crypto;
import 'package:uuid/uuid.dart';

import 'shop_backup.dart';
import 'shop_database.dart';
import 'shop_runtime_scope.dart';

/// Android synthetic-QA-only transport for encrypted recovery evidence.
///
/// The files remain inside the QA application's private support directory. A
/// test operator may copy them with Android's debug-only `run-as` boundary;
/// Shop never requests broad storage access or opens a system file picker.
/// The integrity tag uses a public synthetic-test key and only detects an
/// accidental profile/build mismatch. It is not production authentication.
final class ShopQaEvidenceStore {
  ShopQaEvidenceStore._(
    this.runtimeScope, {
    required bool allowNonAndroidForTest,
  }) : _allowNonAndroidForTest = allowNonAndroidForTest {
    if (!runtimeScope.configuration.isSyntheticQa ||
        !runtimeScope.capabilities.syntheticEvidence ||
        runtimeScope.syntheticEvidenceRoot == null) {
      throw StateError('shop_qa_evidence_scope_required');
    }
    if (!Platform.isAndroid && !allowNonAndroidForTest) {
      throw UnsupportedError('shop_qa_evidence_android_only');
    }
  }

  factory ShopQaEvidenceStore.forRuntime(ShopRuntimeScope runtimeScope) =>
      ShopQaEvidenceStore._(runtimeScope, allowNonAndroidForTest: false);

  /// Explicit source-test seam. Application code must use [forRuntime].
  factory ShopQaEvidenceStore.forTest(ShopRuntimeScope runtimeScope) =>
      ShopQaEvidenceStore._(runtimeScope, allowNonAndroidForTest: true);

  static const contract = 'supermega.shop.synthetic-qa-evidence.v1';
  static const formatVersion = 1;
  static const fileExtension = '.smqa';
  static const _magic = <int>[0x53, 0x4d, 0x51, 0x41]; // SMQA
  static const _maxHeaderBytes = 4096;
  static const _testIntegrityKey =
      'SuperMega-Shop-public-synthetic-QA-integrity-v1';
  static final RegExp _fileNamePattern = RegExp(
    r'^SuperMega-Shop-SYNTHETIC-QA-[0-9]{8}-[0-9]{6}-[a-f0-9]{12}\.smqa$',
  );

  final ShopRuntimeScope runtimeScope;
  final bool _allowNonAndroidForTest;

  Directory get _root => runtimeScope.syntheticEvidenceRoot!;

  bool isBoundTo(ShopRuntimeScope candidate) =>
      identical(runtimeScope, candidate) &&
      runtimeScope.configuration.profileId ==
          candidate.configuration.profileId &&
      runtimeScope.configuration.platformIdentity ==
          candidate.configuration.platformIdentity &&
      _samePath(
        runtimeScope.documentsRoot.absolute.path,
        candidate.documentsRoot.absolute.path,
      ) &&
      _samePath(
        _root.absolute.path,
        candidate.syntheticEvidenceRoot!.absolute.path,
      );

  void requireBoundTo(ShopRuntimeScope candidate) {
    if (!isBoundTo(candidate)) {
      throw StateError('shop_qa_evidence_scope_mismatch');
    }
  }

  Future<File> exportEncryptedBackup({
    required ShopDatabase database,
    required String password,
    DateTime? now,
  }) async {
    _requireSupportedRuntime();
    await _validateRoot();
    final temporary = File(
      '${runtimeScope.temporaryRoot.path}${Platform.pathSeparator}'
      'supermega-shop-qa-export-${const Uuid().v4()}.smbak',
    );
    try {
      await ShopBackup.exportEncrypted(
        database: database,
        archive: temporary,
        password: password,
        scratchRoot: runtimeScope.documentsRoot,
      );
      final payload = await temporary.readAsBytes();
      final instant = (now ?? DateTime.now()).toUtc();
      final fileName = _fileName(instant);
      final target = File('${_root.path}${Platform.pathSeparator}$fileName');
      final bytes = _encode(payload, instant, fileName);
      await _writeNewFile(target, bytes);
      return target;
    } finally {
      if (await temporary.exists()) await temporary.delete();
    }
  }

  /// Validates the newest complete QA envelope and stages only its still-
  /// encrypted SMBK payload under the private temporary root for ShopBackup.
  Future<File?> stageLatestEncryptedBackup() async {
    _requireSupportedRuntime();
    await _validateRoot();
    final candidates = <File>[];
    await for (final entity in _root.list(followLinks: false)) {
      if (entity is! File) {
        throw StateError('shop_qa_evidence_entry_invalid');
      }
      final name = _basename(entity.path);
      if (!_fileNamePattern.hasMatch(name)) {
        throw StateError('shop_qa_evidence_filename_invalid');
      }
      if (await FileSystemEntity.type(entity.path, followLinks: false) !=
          FileSystemEntityType.file) {
        throw StateError('shop_qa_evidence_entry_invalid');
      }
      candidates.add(entity);
    }
    if (candidates.isEmpty) return null;
    if (candidates.length != 1) {
      throw StateError('shop_qa_evidence_multiple_files');
    }

    final candidate = candidates.first;
    if (await candidate.length() >
        ShopBackup.maxSnapshotBytes + _maxHeaderBytes + 8 + 256) {
      throw const FormatException('The QA evidence envelope is too large.');
    }
    final payload = await _decode(
      await candidate.readAsBytes(),
      _basename(candidate.path),
    );
    final staged = File(
      '${runtimeScope.temporaryRoot.path}${Platform.pathSeparator}'
      'supermega-shop-qa-restore-${const Uuid().v4()}.smbak',
    );
    await _writeNewFile(staged, payload);
    return staged;
  }

  void _requireSupportedRuntime() {
    if (!runtimeScope.configuration.isSyntheticQa ||
        !runtimeScope.capabilities.syntheticEvidence ||
        runtimeScope.capabilities.externalFileSaving) {
      throw StateError('shop_qa_evidence_scope_required');
    }
    if (!Platform.isAndroid && !_allowNonAndroidForTest) {
      throw UnsupportedError('shop_qa_evidence_android_only');
    }
  }

  Future<void> _validateRoot() async {
    final root = _root;
    if (await FileSystemEntity.type(root.path, followLinks: false) !=
        FileSystemEntityType.directory) {
      throw StateError('shop_qa_evidence_root_invalid');
    }
    final documents = await runtimeScope.documentsRoot.resolveSymbolicLinks();
    final resolved = await root.resolveSymbolicLinks();
    final separator = Platform.pathSeparator;
    if (!_samePath(resolved, '$documents${separator}synthetic-evidence')) {
      throw StateError('shop_qa_evidence_root_escape');
    }
  }

  Uint8List _encode(
    Uint8List payload,
    DateTime generatedAt,
    String evidenceFileName,
  ) {
    if (payload.length > ShopBackup.maxSnapshotBytes + 256) {
      throw const FormatException('The QA backup is too large.');
    }
    final payloadDigest = crypto.sha256.convert(payload).toString();
    final unsigned = <String, Object>{
      'contract': contract,
      'formatVersion': formatVersion,
      'profileId': runtimeScope.configuration.profileId,
      'platformIdentity': runtimeScope.configuration.platformIdentity,
      'isolationContractVersion': ShopRuntimeScope.isolationContractVersion,
      'generatedAtUtc': generatedAt.toIso8601String(),
      'evidenceFileName': evidenceFileName,
      'payloadLength': payload.length,
      'payloadSha256': payloadDigest,
    };
    final integrity = _integrity(unsigned, payload);
    final header = Uint8List.fromList(
      utf8.encode(
        jsonEncode({...unsigned, 'testIntegrityHmacSha256': integrity}),
      ),
    );
    if (header.length > _maxHeaderBytes) {
      throw const FormatException('The QA evidence header is too large.');
    }
    final result = BytesBuilder(copy: false)
      ..add(_magic)
      ..add(_uint32(header.length))
      ..add(header)
      ..add(payload);
    return result.takeBytes();
  }

  Future<Uint8List> _decode(Uint8List encoded, String expectedFileName) async {
    if (encoded.length < 8 || !_startsWith(encoded, _magic)) {
      throw const FormatException('The QA evidence envelope is invalid.');
    }
    final headerLength = ByteData.sublistView(encoded, 4, 8).getUint32(0);
    if (headerLength == 0 ||
        headerLength > _maxHeaderBytes ||
        8 + headerLength >= encoded.length) {
      throw const FormatException('The QA evidence header is invalid.');
    }
    final dynamic decoded;
    try {
      decoded = jsonDecode(utf8.decode(encoded.sublist(8, 8 + headerLength)));
    } catch (_) {
      throw const FormatException('The QA evidence header is invalid.');
    }
    if (decoded is! Map<String, dynamic>) {
      throw const FormatException('The QA evidence header is invalid.');
    }
    const expectedKeys = <String>{
      'contract',
      'formatVersion',
      'profileId',
      'platformIdentity',
      'isolationContractVersion',
      'generatedAtUtc',
      'evidenceFileName',
      'payloadLength',
      'payloadSha256',
      'testIntegrityHmacSha256',
    };
    if (decoded.keys.toSet().difference(expectedKeys).isNotEmpty ||
        expectedKeys.difference(decoded.keys.toSet()).isNotEmpty ||
        decoded['contract'] != contract ||
        decoded['formatVersion'] != formatVersion ||
        decoded['profileId'] != runtimeScope.configuration.profileId ||
        decoded['platformIdentity'] !=
            runtimeScope.configuration.platformIdentity ||
        decoded['isolationContractVersion'] !=
            ShopRuntimeScope.isolationContractVersion ||
        decoded['evidenceFileName'] != expectedFileName) {
      throw const FormatException('The QA evidence identity does not match.');
    }
    final payload = Uint8List.fromList(encoded.sublist(8 + headerLength));
    final generatedAt = decoded['generatedAtUtc'];
    final payloadLength = decoded['payloadLength'];
    final payloadDigest = decoded['payloadSha256'];
    final integrity = decoded['testIntegrityHmacSha256'];
    if (generatedAt is! String ||
        DateTime.tryParse(generatedAt)?.isUtc != true ||
        payloadLength is! int ||
        payloadDigest is! String ||
        !RegExp(r'^[a-f0-9]{64}$').hasMatch(payloadDigest) ||
        integrity is! String ||
        !RegExp(r'^[a-f0-9]{64}$').hasMatch(integrity) ||
        payloadLength != payload.length ||
        payloadDigest != crypto.sha256.convert(payload).toString() ||
        !_startsWith(payload, const [0x53, 0x4d, 0x42, 0x4b])) {
      throw const FormatException('The QA evidence payload is invalid.');
    }
    final unsigned = <String, Object>{
      for (final key in expectedKeys)
        if (key != 'testIntegrityHmacSha256') key: decoded[key] as Object,
    };
    if (integrity != _integrity(unsigned, payload)) {
      throw const FormatException('The QA evidence integrity tag is invalid.');
    }
    return payload;
  }

  String _integrity(Map<String, Object> unsigned, Uint8List payload) {
    final input = BytesBuilder(copy: false)
      ..add(utf8.encode(jsonEncode(unsigned)))
      ..addByte(0)
      ..add(payload);
    return crypto.Hmac(
      crypto.sha256,
      utf8.encode(_testIntegrityKey),
    ).convert(input.takeBytes()).toString();
  }

  Future<void> _writeNewFile(File target, Uint8List bytes) async {
    final name = _basename(target.path);
    if (!name.contains('SYNTHETIC-QA') &&
        !name.startsWith('supermega-shop-qa-')) {
      throw StateError('shop_qa_evidence_filename_invalid');
    }
    final parent = target.parent;
    final expectedParent = target.path.contains('SYNTHETIC-QA')
        ? _root
        : runtimeScope.temporaryRoot;
    if (!_samePath(parent.absolute.path, expectedParent.absolute.path)) {
      throw StateError('shop_qa_evidence_path_escape');
    }
    if (await FileSystemEntity.type(target.path, followLinks: false) !=
        FileSystemEntityType.notFound) {
      throw StateError('shop_qa_evidence_target_exists');
    }
    await target.create(exclusive: true);
    try {
      await target.writeAsBytes(bytes, flush: true);
    } catch (_) {
      if (await target.exists()) await target.delete();
      rethrow;
    }
  }

  String _fileName(DateTime instant) {
    String two(int value) => value.toString().padLeft(2, '0');
    final nonce = const Uuid().v4().replaceAll('-', '').substring(0, 12);
    return 'SuperMega-Shop-SYNTHETIC-QA-'
        '${instant.year}${two(instant.month)}${two(instant.day)}-'
        '${two(instant.hour)}${two(instant.minute)}${two(instant.second)}-'
        '$nonce$fileExtension';
  }

  static Uint8List _uint32(int value) {
    final bytes = Uint8List(4);
    ByteData.sublistView(bytes).setUint32(0, value);
    return bytes;
  }

  static bool _startsWith(Uint8List bytes, List<int> prefix) {
    if (bytes.length < prefix.length) return false;
    for (var index = 0; index < prefix.length; index++) {
      if (bytes[index] != prefix[index]) return false;
    }
    return true;
  }

  static String _basename(String path) =>
      path.split(Platform.pathSeparator).last;

  static bool _samePath(String left, String right) => Platform.isWindows
      ? left.toLowerCase() == right.toLowerCase()
      : left == right;
}
