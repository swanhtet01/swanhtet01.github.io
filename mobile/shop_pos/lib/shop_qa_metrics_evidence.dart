import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart' as crypto;

import 'shop_database.dart';
import 'shop_runtime_scope.dart';

final class ShopQaMetricsObservation {
  const ShopQaMetricsObservation({
    required this.protocolVersion,
    required this.sessionNonce,
    required this.requestDigest,
    required this.targetId,
    required this.authorityDigest,
    required this.sequence,
    required this.step,
    required this.observedAtUtc,
    required this.counts,
    required this.schemaVersion,
    required this.storeIdentitySha256,
    required this.snapshotSha256,
    required this.observationSha256,
    required this.authoritySignature,
  });

  final int protocolVersion;
  final String sessionNonce;
  final String requestDigest;
  final String targetId;
  final String authorityDigest;
  final int sequence;
  final String step;
  final String observedAtUtc;
  final Map<String, int> counts;
  final int schemaVersion;
  final String storeIdentitySha256;
  final String snapshotSha256;
  final String observationSha256;
  final String authoritySignature;
}

/// Detached-signature boundary for the future platform-protected QA key.
///
/// The host must pin [authorityDigest] before accepting evidence. No concrete
/// key custody implementation is provided by this source-only prerequisite.
abstract interface class ShopQaMetricsEvidenceAuthority {
  String get authorityDigest;

  Future<String> sign(List<int> message);

  Future<bool> verify(List<int> message, String signature);
}

/// Redacted installed-QA observation store.
///
/// This contract is deliberately unavailable to production and network
/// printer profiles. It records only six integer counters and hashed database
/// identity, in the app-private synthetic evidence directory. It does not
/// implement ADB or any other transport.
final class ShopQaMetricsEvidenceStore {
  ShopQaMetricsEvidenceStore._(this._scope, this._authority);

  static const contract = 'supermega.shop.synthetic-qa-metrics.v1';
  static const protocolVersion = 1;
  static const _maximumObservations = 3;
  static const _steps = <String, int>{
    'observe_pre_sale': 4,
    'observe_post_sale': 8,
    'observe_restored_state': 23,
  };
  static const _countKeys = <String>{
    'sales',
    'stockMovements',
    'receipts',
    'outbox',
    'onHand',
    'shifts',
  };
  static final RegExp _digest = RegExp(r'^[a-f0-9]{64}$');
  static final RegExp _nonce = RegExp(r'^[a-f0-9]{32,64}$');
  static final RegExp _signature = RegExp(r'^[A-Za-z0-9+/]{86}==$');
  static final Map<String, Future<void>> _writeTails = {};

  final ShopRuntimeScope _scope;
  final ShopQaMetricsEvidenceAuthority _authority;

  String get authorityDigest => _authority.authorityDigest;

  factory ShopQaMetricsEvidenceStore.forRuntime(
    ShopRuntimeScope scope, {
    required ShopQaMetricsEvidenceAuthority authority,
  }) {
    _requireSyntheticLoopbackScope(scope);
    if (!_digest.hasMatch(authority.authorityDigest)) {
      throw StateError('shop_qa_metrics_authority_invalid');
    }
    return ShopQaMetricsEvidenceStore._(scope, authority);
  }

  File get evidenceFile => File(
    '${_scope.syntheticEvidenceRoot!.path}${Platform.pathSeparator}'
    '$shopQaMetricsEvidenceFileName',
  );

  void requireBoundTo(ShopRuntimeScope scope) {
    if (!identical(scope, _scope) ||
        scope.configuration.profileId != _scope.configuration.profileId ||
        scope.configuration.platformIdentity !=
            _scope.configuration.platformIdentity ||
        scope.syntheticEvidenceRoot?.absolute.path !=
            _scope.syntheticEvidenceRoot?.absolute.path) {
      throw StateError('shop_qa_metrics_scope_mismatch');
    }
    _requireSyntheticLoopbackScope(scope);
  }

  Future<ShopQaMetricsObservation> observe({
    required ShopDatabase database,
    required int protocolVersion,
    required String sessionNonce,
    required String requestDigest,
    required String targetId,
    required String authorityDigest,
    required int sequence,
    required String step,
    DateTime? now,
  }) async {
    requireBoundTo(_scope);
    await _validateRoot();
    _validateBinding(
      protocolVersion: protocolVersion,
      sessionNonce: sessionNonce,
      requestDigest: requestDigest,
      targetId: targetId,
      authorityDigest: authorityDigest,
      sequence: sequence,
      step: step,
    );
    if (authorityDigest != _authority.authorityDigest) {
      throw StateError('shop_qa_metrics_authority_mismatch');
    }
    final lockKey = evidenceFile.absolute.path;
    final previous = _writeTails[lockKey] ?? Future<void>.value();
    final released = Completer<void>();
    final tail = previous.then((_) => released.future);
    _writeTails[lockKey] = tail;
    await previous;
    try {
      final records = await _readRecords();
      if (records.length >= _maximumObservations ||
          records.any((record) => record.requestDigest == requestDigest)) {
        throw StateError('shop_qa_metrics_replay');
      }
      if ((records.isEmpty &&
              step != 'observe_pre_sale' &&
              step != 'observe_restored_state') ||
          (records.isNotEmpty &&
              (records.first.step != 'observe_pre_sale' ||
                  records.last.step != 'observe_pre_sale' ||
                  step != 'observe_post_sale'))) {
        throw StateError('shop_qa_metrics_sequence_invalid');
      }
      if (records.isNotEmpty &&
          (records.first.sessionNonce != sessionNonce ||
              records.first.targetId != targetId ||
              sequence <= records.last.sequence)) {
        throw StateError('shop_qa_metrics_binding_changed');
      }
      final snapshot = await database.readQaMetricsSnapshot();
      final unsigned = <String, Object>{
        'protocolVersion': protocolVersion,
        'sessionNonce': sessionNonce,
        'requestDigest': requestDigest,
        'targetId': targetId,
        'authorityDigest': authorityDigest,
        'sequence': sequence,
        'step': step,
        'observedAtUtc': (now ?? DateTime.now()).toUtc().toIso8601String(),
        'counts': snapshot.counts,
        'database': <String, Object>{
          'schemaVersion': snapshot.schemaVersion,
          'storeIdentitySha256': snapshot.storeIdentitySha256,
          'snapshotSha256': snapshot.snapshotSha256,
        },
      };
      final observationSha256 = _observationDigest(unsigned);
      final observation = await _decodeRecord(<String, dynamic>{
        ...unsigned,
        'observationSha256': observationSha256,
        'authoritySignature': await _authority.sign(
          utf8.encode(observationSha256),
        ),
      });
      records.add(observation);
      await _writeRecords(records);
      return observation;
    } finally {
      released.complete();
      if (identical(_writeTails[lockKey], tail)) _writeTails.remove(lockKey);
    }
  }

  Future<List<ShopQaMetricsObservation>> read() async {
    requireBoundTo(_scope);
    await _validateRoot();
    return List.unmodifiable(await _readRecords());
  }

  Future<void> _validateRoot() async {
    final root = _scope.syntheticEvidenceRoot!;
    if (await FileSystemEntity.type(root.path, followLinks: false) !=
        FileSystemEntityType.directory) {
      throw StateError('shop_qa_metrics_root_invalid');
    }
    final documents = await _scope.documentsRoot.resolveSymbolicLinks();
    final resolved = await root.resolveSymbolicLinks();
    if (resolved != '$documents${Platform.pathSeparator}synthetic-evidence') {
      throw StateError('shop_qa_metrics_root_escape');
    }
  }

  Future<List<ShopQaMetricsObservation>> _readRecords() async {
    final file = evidenceFile;
    final type = await FileSystemEntity.type(file.path, followLinks: false);
    if (type == FileSystemEntityType.notFound) return [];
    if (type != FileSystemEntityType.file) {
      throw StateError('shop_qa_metrics_inventory_invalid');
    }
    final dynamic decoded;
    try {
      decoded = jsonDecode(await file.readAsString());
    } catch (_) {
      throw StateError('shop_qa_metrics_inventory_invalid');
    }
    const rootKeys = <String>{
      'contract',
      'profileId',
      'platformIdentity',
      'observations',
      'inventorySha256',
    };
    if (decoded is! Map<String, dynamic> ||
        decoded.keys.toSet().difference(rootKeys).isNotEmpty ||
        rootKeys.difference(decoded.keys.toSet()).isNotEmpty ||
        decoded['contract'] != contract ||
        decoded['profileId'] != _scope.configuration.profileId ||
        decoded['platformIdentity'] != _scope.configuration.platformIdentity ||
        decoded['observations'] is! List<dynamic> ||
        decoded['inventorySha256'] is! String) {
      throw StateError('shop_qa_metrics_inventory_invalid');
    }
    final raw = decoded['observations'] as List<dynamic>;
    if (raw.length > _maximumObservations ||
        decoded['inventorySha256'] != _sha256(raw)) {
      throw StateError('shop_qa_metrics_inventory_invalid');
    }
    final records = <ShopQaMetricsObservation>[];
    for (final value in raw) {
      if (value is! Map<String, dynamic>) {
        throw StateError('shop_qa_metrics_inventory_invalid');
      }
      final record = await _decodeRecord(value);
      if (records.any((prior) => prior.requestDigest == record.requestDigest) ||
          (records.isNotEmpty &&
              (records.first.sessionNonce != record.sessionNonce ||
                  records.first.targetId != record.targetId ||
                  record.sequence <= records.last.sequence))) {
        throw StateError('shop_qa_metrics_inventory_invalid');
      }
      records.add(record);
    }
    final validProtocolShape =
        (records.length == 1 &&
            (records.single.step == 'observe_pre_sale' ||
                records.single.step == 'observe_restored_state')) ||
        (records.length == 2 &&
            records.first.step == 'observe_pre_sale' &&
            records.last.step == 'observe_post_sale');
    if (records.isNotEmpty && !validProtocolShape) {
      throw StateError('shop_qa_metrics_inventory_invalid');
    }
    return records;
  }

  Future<void> _writeRecords(List<ShopQaMetricsObservation> records) async {
    final observations = records.map(_recordJson).toList(growable: false);
    final encoded = jsonEncode(<String, Object>{
      'contract': contract,
      'profileId': _scope.configuration.profileId,
      'platformIdentity': _scope.configuration.platformIdentity,
      'observations': observations,
      'inventorySha256': _sha256(observations),
    });
    final file = evidenceFile;
    final temporary = File('${file.path}.tmp');
    for (final candidate in <File>[file, temporary]) {
      final type = await FileSystemEntity.type(
        candidate.path,
        followLinks: false,
      );
      if (type != FileSystemEntityType.notFound &&
          type != FileSystemEntityType.file) {
        throw StateError('shop_qa_metrics_inventory_invalid');
      }
    }
    if (await temporary.exists()) await temporary.delete();
    await temporary.writeAsString(encoded, flush: true);
    await temporary.rename(file.path);
  }

  Future<ShopQaMetricsObservation> _decodeRecord(
    Map<String, dynamic> value,
  ) async {
    const recordKeys = <String>{
      'protocolVersion',
      'sessionNonce',
      'requestDigest',
      'targetId',
      'authorityDigest',
      'sequence',
      'step',
      'observedAtUtc',
      'counts',
      'database',
      'observationSha256',
      'authoritySignature',
    };
    final counts = value['counts'];
    final database = value['database'];
    final unsigned = Map<String, dynamic>.from(value)
      ..remove('observationSha256')
      ..remove('authoritySignature');
    if (value.keys.toSet().difference(recordKeys).isNotEmpty ||
        recordKeys.difference(value.keys.toSet()).isNotEmpty ||
        value['protocolVersion'] != protocolVersion ||
        value['sessionNonce'] is! String ||
        !_nonce.hasMatch(value['sessionNonce'] as String) ||
        value['requestDigest'] is! String ||
        !_digest.hasMatch(value['requestDigest'] as String) ||
        value['targetId'] is! String ||
        !_digest.hasMatch(value['targetId'] as String) ||
        value['authorityDigest'] is! String ||
        !_digest.hasMatch(value['authorityDigest'] as String) ||
        value['authorityDigest'] != _authority.authorityDigest ||
        value['sequence'] is! int ||
        _steps[value['step']] != value['sequence'] ||
        value['observedAtUtc'] is! String ||
        DateTime.tryParse(value['observedAtUtc'] as String)?.isUtc != true ||
        counts is! Map<String, dynamic> ||
        counts.keys.toSet().difference(_countKeys).isNotEmpty ||
        _countKeys.difference(counts.keys.toSet()).isNotEmpty ||
        counts.values.any((count) => count is! int || count < 0) ||
        database is! Map<String, dynamic> ||
        database.keys.toSet().difference(const <String>{
          'schemaVersion',
          'storeIdentitySha256',
          'snapshotSha256',
        }).isNotEmpty ||
        database.length != 3 ||
        database['schemaVersion'] is! int ||
        database['storeIdentitySha256'] is! String ||
        !_digest.hasMatch(database['storeIdentitySha256'] as String) ||
        database['snapshotSha256'] is! String ||
        !_digest.hasMatch(database['snapshotSha256'] as String) ||
        value['observationSha256'] is! String ||
        value['observationSha256'] != _observationDigest(unsigned) ||
        value['authoritySignature'] is! String ||
        !_signature.hasMatch(value['authoritySignature'] as String) ||
        !await _authority.verify(
          utf8.encode(value['observationSha256'] as String),
          value['authoritySignature'] as String,
        )) {
      throw StateError('shop_qa_metrics_record_invalid');
    }
    return ShopQaMetricsObservation(
      protocolVersion: value['protocolVersion'] as int,
      sessionNonce: value['sessionNonce'] as String,
      requestDigest: value['requestDigest'] as String,
      targetId: value['targetId'] as String,
      authorityDigest: value['authorityDigest'] as String,
      sequence: value['sequence'] as int,
      step: value['step'] as String,
      observedAtUtc: value['observedAtUtc'] as String,
      counts: Map<String, int>.from(counts),
      schemaVersion: database['schemaVersion'] as int,
      storeIdentitySha256: database['storeIdentitySha256'] as String,
      snapshotSha256: database['snapshotSha256'] as String,
      observationSha256: value['observationSha256'] as String,
      authoritySignature: value['authoritySignature'] as String,
    );
  }

  static Map<String, Object> _recordJson(ShopQaMetricsObservation record) =>
      <String, Object>{
        'protocolVersion': record.protocolVersion,
        'sessionNonce': record.sessionNonce,
        'requestDigest': record.requestDigest,
        'targetId': record.targetId,
        'authorityDigest': record.authorityDigest,
        'sequence': record.sequence,
        'step': record.step,
        'observedAtUtc': record.observedAtUtc,
        'counts': record.counts,
        'database': <String, Object>{
          'schemaVersion': record.schemaVersion,
          'storeIdentitySha256': record.storeIdentitySha256,
          'snapshotSha256': record.snapshotSha256,
        },
        'observationSha256': record.observationSha256,
        'authoritySignature': record.authoritySignature,
      };

  String _observationDigest(Map<String, Object?> unsigned) =>
      _sha256(<String, Object>{
        'contract': contract,
        'profileId': _scope.configuration.profileId,
        'platformIdentity': _scope.configuration.platformIdentity,
        'observation': unsigned,
      });

  static void _validateBinding({
    required int protocolVersion,
    required String sessionNonce,
    required String requestDigest,
    required String targetId,
    required String authorityDigest,
    required int sequence,
    required String step,
  }) {
    if (protocolVersion != ShopQaMetricsEvidenceStore.protocolVersion ||
        !_nonce.hasMatch(sessionNonce) ||
        !_digest.hasMatch(requestDigest) ||
        !_digest.hasMatch(targetId) ||
        !_digest.hasMatch(authorityDigest) ||
        _steps[step] != sequence) {
      throw StateError('shop_qa_metrics_binding_invalid');
    }
  }

  static String _sha256(Object value) =>
      crypto.sha256.convert(utf8.encode(jsonEncode(value))).toString();

  static void _requireSyntheticLoopbackScope(ShopRuntimeScope scope) {
    final capabilities = scope.capabilities;
    if (!scope.configuration.isSyntheticQa ||
        !capabilities.syntheticEvidence ||
        !capabilities.loopbackPrinter ||
        capabilities.networkPrinter ||
        capabilities.externalFileSaving) {
      throw StateError('shop_qa_metrics_scope_required');
    }
  }
}
