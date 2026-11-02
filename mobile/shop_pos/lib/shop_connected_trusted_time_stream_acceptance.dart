// The public constructor uses descriptive dependency names while retaining
// the injected capabilities in private fields.
// ignore_for_file: prefer_initializing_formals

import 'dart:convert';

import 'shop_connected_trusted_time_composition.dart';
import 'shop_connected_trusted_time_contract.dart';
import 'shop_connected_trusted_time_stream.dart';

/// Verifies one immutable stream entry with separately protected authority
/// custody. A digest or a syntactically valid signature is not sufficient.
abstract interface class ConnectedTrustedTimeStreamAuthorityVerifier {
  Future<bool> verify(ConnectedTrustedTimeStreamEntryV2 entry);
}

/// Signs and verifies the exact acknowledgement bytes with device custody.
///
/// Exposing identity here lets the acceptance boundary reject a substituted
/// signer before and after an asynchronous signing operation.
abstract interface class ConnectedTrustedTimeStreamDeviceAckSigner {
  String get clientDeviceId;
  String get clientFingerprint;
  String get clientSigningKeyId;

  Future<String> sign(List<int> canonicalSigningBytes);
  Future<bool> verify({
    required List<int> canonicalSigningBytes,
    required String signature,
  });
}

/// Expected identity of exactly one authority stream.
final class ConnectedTrustedTimeStreamAuthorityIdentity {
  ConnectedTrustedTimeStreamAuthorityIdentity({
    required this.authorityKeyId,
    required this.authorityKeyFingerprint,
    required this.authorityKeyGeneration,
    required this.authorityEpoch,
  }) {
    // Reuse the stream grammar rather than maintaining a second validator.
    ConnectedTrustedTimeStreamEntryV2(
      workspaceId: 'scope_validation',
      siteId: 'scope_validation',
      coordinatorDeviceId: 'scope_validation',
      clientDeviceId: 'scope_validation',
      clientFingerprint: '0' * 64,
      sessionGeneration: 1,
      coordinatorBindingDigest: '0' * 64,
      coordinatorBindingGeneration: 1,
      authorityKeyId: authorityKeyId,
      authorityKeyFingerprint: authorityKeyFingerprint,
      authorityKeyGeneration: authorityKeyGeneration,
      authorityEpoch: authorityEpoch,
      authoritySequence: 1,
      previousEntryDigest: null,
      kind: ConnectedTrustedTimeStreamEntryKind.continuity,
      observedAtMillis: 1,
      validUntilMillis: 1,
      authoritySignature: _placeholderSignature,
    );
  }

  final String authorityKeyId;
  final String authorityKeyFingerprint;
  final int authorityKeyGeneration;
  final int authorityEpoch;
}

/// One accepted entry and its exact device acknowledgement.
///
/// This is volatile evidence, not trusted-time authority. In particular,
/// [effectiveTimeMillis] is absent for continuity entries. This service has no
/// persistence or production composition; a restart therefore cannot resume
/// the stream until a durable, independently verified head is supplied by a
/// later integration.
final class ConnectedTrustedTimeStreamAcceptance {
  const ConnectedTrustedTimeStreamAcceptance({
    required this.entry,
    required this.acknowledgement,
    required this.effectiveTimeMillis,
    required this.validUntilMillis,
    required this.replayed,
  });

  final ConnectedTrustedTimeStreamEntryV2 entry;
  final ConnectedTrustedTimeStreamAckV1 acknowledgement;
  final int? effectiveTimeMillis;
  final int? validUntilMillis;
  final bool replayed;
}

/// Default-off, transport-neutral acceptance boundary for a V2 client stream.
///
/// It verifies exact scope, authority identity, chain continuity, local boot
/// and monotonic progress before acknowledging an entry. It does not issue
/// entries, mount a listener, store state, own keys, or advance authority.
final class ConnectedTrustedTimeStreamClientAcceptance {
  ConnectedTrustedTimeStreamClientAcceptance({
    this.enabled = false,
    required ConnectedTrustedTimeScope scope,
    required ConnectedTrustedTimeStreamAuthorityIdentity authority,
    required ConnectedTrustedTimePlatformClock clock,
    required ConnectedTrustedTimeStreamAuthorityVerifier authorityVerifier,
    required ConnectedTrustedTimeStreamDeviceAckSigner deviceAckSigner,
    required String clientSigningKeyId,
  }) : _scope = scope,
       _authority = authority,
       _clock = clock,
       _authorityVerifier = authorityVerifier,
       _deviceAckSigner = deviceAckSigner,
       _clientSigningKeyId = clientSigningKeyId {
    if (!_id.hasMatch(clientSigningKeyId)) {
      throw const FormatException('trusted-time stream client signing key id');
    }
  }

  final bool enabled;
  final ConnectedTrustedTimeScope _scope;
  final ConnectedTrustedTimeStreamAuthorityIdentity _authority;
  final ConnectedTrustedTimePlatformClock _clock;
  final ConnectedTrustedTimeStreamAuthorityVerifier _authorityVerifier;
  final ConnectedTrustedTimeStreamDeviceAckSigner _deviceAckSigner;
  final String _clientSigningKeyId;

  _AcceptedState? _state;
  _TimeAnchor? _lastTime;
  bool _accepting = false;

  Future<ConnectedTrustedTimeStreamAcceptance> accept(
    ConnectedTrustedTimeStreamEntryV2 candidate,
  ) async {
    if (!enabled) {
      throw StateError('connected_trusted_time_stream_acceptance_disabled');
    }
    final replay = _state;
    if (replay != null && candidate.entryDigest == replay.entry.entryDigest) {
      if (candidate.canonicalJson != replay.entry.canonicalJson) {
        throw StateError('connected_trusted_time_stream_replay_substituted');
      }
      final boot = await _clock.bootSessionId();
      final monotonic = await _clock.monotonicMillis();
      if (boot != replay.ack.bootSessionId ||
          monotonic < replay.ack.acknowledgedAtMonotonicMillis) {
        throw StateError('connected_trusted_time_stream_clock_stale');
      }
      if (replay.entry.kind == ConnectedTrustedTimeStreamEntryKind.time) {
        final effective =
            replay.entry.observedAtMillis +
            (monotonic - replay.ack.acknowledgedAtMonotonicMillis);
        if (effective > replay.entry.validUntilMillis) {
          return _result(
            replay,
            replayed: true,
            effectiveTimeMillis: null,
            validUntilMillis: null,
            overrideTime: true,
          );
        }
        return _result(
          replay,
          replayed: true,
          effectiveTimeMillis: effective,
          validUntilMillis: replay.entry.validUntilMillis,
          overrideTime: true,
        );
      }
      return _result(replay, replayed: true);
    }
    if (_accepting) {
      throw StateError('connected_trusted_time_stream_acceptance_busy');
    }
    _accepting = true;
    try {
      final entry = ConnectedTrustedTimeStreamEntryV2.fromCanonicalBytes(
        candidate.canonicalBytes,
      );
      _requireScope(entry);
      _requireAuthority(entry);
      _requireChain(entry);
      if (!await _authorityVerifier.verify(entry)) {
        throw StateError('connected_trusted_time_stream_signature_rejected');
      }

      final boot = await _clock.bootSessionId();
      final monotonic = await _clock.monotonicMillis();
      if (!_digest.hasMatch(boot) || monotonic < 0) {
        throw StateError('connected_trusted_time_stream_clock_invalid');
      }
      final previous = _state;
      if (previous != null &&
          (boot != previous.ack.bootSessionId ||
              monotonic <= previous.ack.acknowledgedAtMonotonicMillis)) {
        throw StateError('connected_trusted_time_stream_clock_stale');
      }
      _requireSignerIdentity();

      int? effective;
      int? validUntil;
      if (entry.kind == ConnectedTrustedTimeStreamEntryKind.time) {
        final prior = _lastTime;
        if (prior != null) {
          final projected =
              prior.observedAtMillis + (monotonic - prior.monotonicMillis);
          if (entry.observedAtMillis < projected) {
            throw StateError('connected_trusted_time_stream_time_rollback');
          }
        }
        effective = entry.observedAtMillis;
        validUntil = entry.validUntilMillis;
      }

      final unsigned = _ack(
        entry: entry,
        boot: boot,
        monotonic: monotonic,
        signature: _placeholderSignature,
      );
      final signingBytes = List<int>.unmodifiable(
        utf8.encode(unsigned.canonicalSigningPayload),
      );
      final signature = await _deviceAckSigner.sign(signingBytes);
      _requireSignerIdentity();
      final ack = _ack(
        entry: entry,
        boot: boot,
        monotonic: monotonic,
        signature: signature,
      );
      if (!await _deviceAckSigner.verify(
        canonicalSigningBytes: signingBytes,
        signature: signature,
      )) {
        throw StateError(
          'connected_trusted_time_stream_ack_signature_rejected',
        );
      }
      _requireSignerIdentity();

      final accepted = _AcceptedState(
        entry: entry,
        ack: ack,
        effectiveTimeMillis: effective,
        validUntilMillis: validUntil,
      );
      _state = accepted;
      if (effective != null) {
        _lastTime = _TimeAnchor(
          observedAtMillis: effective,
          monotonicMillis: monotonic,
        );
      }
      return _result(accepted, replayed: false);
    } finally {
      _accepting = false;
    }
  }

  void _requireScope(ConnectedTrustedTimeStreamEntryV2 entry) {
    if (entry.workspaceId != _scope.workspaceId ||
        entry.siteId != _scope.siteId ||
        entry.coordinatorDeviceId != _scope.coordinatorDeviceId ||
        entry.clientDeviceId != _scope.clientDeviceId ||
        entry.clientFingerprint != _scope.clientFingerprint ||
        entry.sessionGeneration != _scope.sessionGeneration ||
        entry.coordinatorBindingDigest != _scope.coordinatorBindingDigest ||
        entry.coordinatorBindingGeneration !=
            _scope.coordinatorBindingGeneration) {
      throw StateError('connected_trusted_time_stream_scope_mismatch');
    }
  }

  void _requireAuthority(ConnectedTrustedTimeStreamEntryV2 entry) {
    if (entry.authorityKeyId != _authority.authorityKeyId ||
        entry.authorityKeyFingerprint != _authority.authorityKeyFingerprint ||
        entry.authorityKeyGeneration != _authority.authorityKeyGeneration ||
        entry.authorityEpoch != _authority.authorityEpoch) {
      throw StateError('connected_trusted_time_stream_authority_mismatch');
    }
  }

  void _requireChain(ConnectedTrustedTimeStreamEntryV2 entry) {
    final previous = _state?.entry;
    if (previous == null) {
      if (entry.authoritySequence != 1 || entry.previousEntryDigest != null) {
        throw StateError('connected_trusted_time_stream_genesis_mismatch');
      }
      return;
    }
    if (entry.authoritySequence != previous.authoritySequence + 1 ||
        entry.previousEntryDigest != previous.entryDigest) {
      throw StateError('connected_trusted_time_stream_chain_mismatch');
    }
  }

  void _requireSignerIdentity() {
    if (_deviceAckSigner.clientDeviceId != _scope.clientDeviceId ||
        _deviceAckSigner.clientFingerprint != _scope.clientFingerprint ||
        _deviceAckSigner.clientSigningKeyId != _clientSigningKeyId) {
      throw StateError('connected_trusted_time_stream_ack_signer_mismatch');
    }
  }

  ConnectedTrustedTimeStreamAckV1 _ack({
    required ConnectedTrustedTimeStreamEntryV2 entry,
    required String boot,
    required int monotonic,
    required String signature,
  }) => ConnectedTrustedTimeStreamAckV1(
    workspaceId: entry.workspaceId,
    siteId: entry.siteId,
    coordinatorDeviceId: entry.coordinatorDeviceId,
    clientDeviceId: entry.clientDeviceId,
    clientFingerprint: entry.clientFingerprint,
    clientSigningKeyId: _clientSigningKeyId,
    sessionGeneration: entry.sessionGeneration,
    coordinatorBindingDigest: entry.coordinatorBindingDigest,
    coordinatorBindingGeneration: entry.coordinatorBindingGeneration,
    authorityKeyGeneration: entry.authorityKeyGeneration,
    authorityEpoch: entry.authorityEpoch,
    authoritySequence: entry.authoritySequence,
    entryDigest: entry.entryDigest,
    resultingHeadDigest: entry.entryDigest,
    bootSessionId: boot,
    acknowledgedAtMonotonicMillis: monotonic,
    clientSignature: signature,
  );
}

ConnectedTrustedTimeStreamAcceptance _result(
  _AcceptedState state, {
  required bool replayed,
  int? effectiveTimeMillis,
  int? validUntilMillis,
  bool overrideTime = false,
}) => ConnectedTrustedTimeStreamAcceptance(
  entry: state.entry,
  acknowledgement: state.ack,
  effectiveTimeMillis: overrideTime
      ? effectiveTimeMillis
      : state.effectiveTimeMillis,
  validUntilMillis: overrideTime ? validUntilMillis : state.validUntilMillis,
  replayed: replayed,
);

final class _AcceptedState {
  const _AcceptedState({
    required this.entry,
    required this.ack,
    required this.effectiveTimeMillis,
    required this.validUntilMillis,
  });
  final ConnectedTrustedTimeStreamEntryV2 entry;
  final ConnectedTrustedTimeStreamAckV1 ack;
  final int? effectiveTimeMillis;
  final int? validUntilMillis;
}

final class _TimeAnchor {
  const _TimeAnchor({
    required this.observedAtMillis,
    required this.monotonicMillis,
  });
  final int observedAtMillis;
  final int monotonicMillis;
}

final _digest = RegExp(r'^[0-9a-f]{64}$');
final _id = RegExp(r'^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$');
const _placeholderSignature =
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
