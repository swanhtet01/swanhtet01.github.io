import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';
import 'package:sqlite3/sqlite3.dart';

import 'shop_database.dart';

/// An offline, password-encrypted export format for a single Shop device.
///
/// This is a storage primitive, not a cloud sync or backup UI. The SQLite
/// snapshot is briefly plaintext in the app's private temporary directory;
/// a production export flow must handle interrupted-process cleanup before it
/// offers the archive to a merchant.
abstract final class ShopBackup {
  static const formatVersion = 1;
  static const supportedSchemaVersion = 6;
  static const maxSnapshotBytes = 64 * 1024 * 1024;

  static const _saltLength = 16;
  static const _nonceLength = 12;
  static const _macLength = 16;
  static const _headerLength = 4 + 1 + 1 + _saltLength + _nonceLength;
  static const _magic = [0x53, 0x4d, 0x42, 0x4b]; // SMBK
  static const _requiredTables = {
    'shop_products',
    'shop_sales',
    'shop_stock_movements',
    'shop_sync_outbox',
    'shop_wallet_checkout_intents',
    'shop_cash_shifts',
  };

  static final _cipher = AesGcm.with256bits();
  static final _kdf = Argon2id(
    memory: 19 * 1024,
    parallelism: 1,
    iterations: 2,
    hashLength: 32,
  );

  /// Creates an archive only at a path which did not exist before the call.
  /// The caller must store the password separately; it is not recoverable.
  static Future<void> exportEncrypted({
    required ShopDatabase database,
    required File archive,
    required String password,
    Directory? scratchRoot,
  }) async {
    _checkPassword(password);
    if (database.schemaVersion != supportedSchemaVersion) {
      throw StateError('This Shop schema is not supported for backup.');
    }
    if (await archive.exists()) {
      throw StateError('The backup destination already exists.');
    }
    final scratch = await (scratchRoot ?? Directory.systemTemp).createTemp(
      'supermega-shop-backup-',
    );
    var createdArchive = false;
    try {
      final snapshot = File(
        '${scratch.path}${Platform.pathSeparator}shop.sqlite',
      );
      await database.exportVerifiedLocalSnapshot(snapshot);
      verifySnapshot(snapshot);
      if (await snapshot.length() > maxSnapshotBytes) {
        throw StateError(
          'The local Shop database exceeds the backup size limit.',
        );
      }
      final cleartext = await snapshot.readAsBytes();
      final salt = _randomBytes(_saltLength);
      final nonce = _cipher.newNonce();
      final header = Uint8List.fromList([
        ..._magic,
        formatVersion,
        supportedSchemaVersion,
        ...salt,
        ...nonce,
      ]);
      final key = await _kdf.deriveKeyFromPassword(
        password: password,
        nonce: salt,
      );
      final box = await _cipher.encrypt(
        cleartext,
        secretKey: key,
        nonce: nonce,
        aad: header,
      );
      final bytes = Uint8List.fromList([
        ...header,
        ...box.cipherText,
        ...box.mac.bytes,
      ]);
      await archive.create(exclusive: true);
      createdArchive = true;
      await archive.writeAsBytes(bytes, flush: true);
      final readback = await _decrypt(await archive.readAsBytes(), password);
      if (!_sameBytes(cleartext, readback)) {
        throw StateError('The encrypted backup failed readback verification.');
      }
    } catch (_) {
      if (createdArchive && await archive.exists()) await archive.delete();
      rethrow;
    } finally {
      try {
        await scratch.delete(recursive: true);
      } catch (_) {
        if (createdArchive && await archive.exists()) await archive.delete();
        throw StateError('Could not remove the plaintext backup snapshot.');
      }
    }
  }

  /// Restores only into a nonexistent database path, before ShopDatabase opens.
  /// It never merges records or overwrites an existing database or WAL files.
  static Future<void> restoreIntoEmptyDatabase({
    required File archive,
    required File target,
    required String password,
  }) async {
    _checkPassword(password);
    if (await target.exists() ||
        await File('${target.path}-wal').exists() ||
        await File('${target.path}-shm').exists()) {
      throw StateError('The restore destination is not empty.');
    }
    if (await archive.length() >
        maxSnapshotBytes + _headerLength + _macLength) {
      throw const FormatException('The backup is too large.');
    }
    final cleartext = await _decrypt(await archive.readAsBytes(), password);
    if (cleartext.length > maxSnapshotBytes || !_hasSqliteHeader(cleartext)) {
      throw const FormatException('The backup is not a Shop database.');
    }
    await target.create(exclusive: true);
    try {
      await target.writeAsBytes(cleartext, flush: true);
      verifySnapshot(target);
    } catch (_) {
      if (await target.exists()) await target.delete();
      for (final suffix in ['-wal', '-shm']) {
        final sidecar = File('${target.path}$suffix');
        if (await sidecar.exists()) await sidecar.delete();
      }
      rethrow;
    }
  }

  /// Read-only verification without Drift's automatic schema migrations.
  static void verifySnapshot(File file) {
    final connection = sqlite3.open(file.path, mode: OpenMode.readOnly);
    try {
      final version = connection.select('PRAGMA user_version');
      final integrity = connection.select('PRAGMA integrity_check');
      final brokenReferences = connection.select('PRAGMA foreign_key_check');
      final tables = connection
          .select("SELECT name FROM sqlite_master WHERE type = 'table'")
          .map((row) => row['name'] as String)
          .toSet();
      if (version.length != 1 ||
          version.single['user_version'] != supportedSchemaVersion ||
          integrity.length != 1 ||
          integrity.single['integrity_check'] != 'ok' ||
          brokenReferences.isNotEmpty ||
          !tables.containsAll(_requiredTables)) {
        throw const FormatException(
          'The Shop snapshot failed database checks.',
        );
      }
    } finally {
      connection.close();
    }
  }

  static Future<Uint8List> _decrypt(List<int> bytes, String password) async {
    if (bytes.length < _headerLength + _macLength + 16 ||
        bytes.length > maxSnapshotBytes + _headerLength + _macLength ||
        !_sameBytes(bytes.sublist(0, 4), _magic) ||
        bytes[4] != formatVersion ||
        bytes[5] != supportedSchemaVersion) {
      throw const FormatException('Invalid or unsupported Shop backup.');
    }
    final header = bytes.sublist(0, _headerLength);
    final salt = header.sublist(6, 6 + _saltLength);
    final nonce = header.sublist(6 + _saltLength);
    final box = SecretBox(
      bytes.sublist(_headerLength, bytes.length - _macLength),
      nonce: nonce,
      mac: Mac(bytes.sublist(bytes.length - _macLength)),
    );
    try {
      final key = await _kdf.deriveKeyFromPassword(
        password: password,
        nonce: salt,
      );
      return Uint8List.fromList(
        await _cipher.decrypt(box, secretKey: key, aad: header),
      );
    } on SecretBoxAuthenticationError {
      throw const FormatException('Could not authenticate the Shop backup.');
    }
  }

  static void _checkPassword(String password) {
    if (password.runes.length < 12) {
      throw ArgumentError.value(
        password.length,
        'password',
        'Use at least 12 characters.',
      );
    }
  }

  static Uint8List _randomBytes(int length) {
    final random = Random.secure();
    return Uint8List.fromList(
      List<int>.generate(length, (_) => random.nextInt(256)),
    );
  }

  static bool _sameBytes(List<int> left, List<int> right) {
    if (left.length != right.length) return false;
    for (var index = 0; index < left.length; index++) {
      if (left[index] != right[index]) return false;
    }
    return true;
  }

  static bool _hasSqliteHeader(List<int> bytes) {
    const signature = 'SQLite format 3\u0000';
    return bytes.length >= 16 &&
        _sameBytes(bytes.sublist(0, 16), ascii.encode(signature));
  }
}
