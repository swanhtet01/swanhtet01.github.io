import 'dart:convert';
import 'dart:ffi';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';
import 'package:ffi/ffi.dart';
import 'package:sqlite3/sqlite3.dart';

import 'shop_database.dart';

enum ShopStorePresence { empty, existing, interrupted, unsafe }

/// An offline, password-encrypted export format for a single Shop device.
///
/// This is a storage primitive, not a cloud sync or backup UI. The SQLite
/// snapshot is briefly plaintext in the caller-provided scratch directory,
/// which must be app-private. Call [cleanupInterruptedStaging] before opening
/// the database so an interrupted export or restore cannot retain plaintext.
abstract final class ShopBackup {
  static const formatVersion = 1;
  static const supportedSchemaVersion = 10;
  static const oldestSupportedSchemaVersion = 6;
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
  static final Set<String> _activeRoots = <String>{};
  static const _lockName = '.supermega-shop-backup.lock';
  static const _exportPrefix = 'supermega-shop-backup-';
  static const _restorePrefix = '.supermega-shop-restore-';
  static const _preparingMarker = 'preparing-v1\n';
  static const _committingMarker = 'committing-v1\n';
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
    required Directory scratchRoot,
  }) async {
    _checkPassword(password);
    if (database.schemaVersion != supportedSchemaVersion) {
      throw StateError('This Shop schema is not supported for backup.');
    }
    if (await archive.exists()) {
      throw StateError('The backup destination already exists.');
    }
    await _withRootLock(scratchRoot, () async {
      await _removeInterruptedStaging(scratchRoot);
      final scratch = await scratchRoot.createTemp(_exportPrefix);
      var createdArchive = false;
      try {
        final snapshot = File(
          '${scratch.path}${Platform.pathSeparator}shop.sqlite',
        );
        await database.exportVerifiedLocalSnapshot(snapshot);
        verifySnapshot(snapshot, expectedSchemaVersion: database.schemaVersion);
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
          database.schemaVersion,
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
          throw StateError(
            'The encrypted backup failed readback verification.',
          );
        }
      } catch (_) {
        if (createdArchive && await archive.exists()) await archive.delete();
        rethrow;
      } finally {
        try {
          await _deleteScratchDirectory(scratchRoot, scratch);
        } catch (_) {
          if (createdArchive && await archive.exists()) await archive.delete();
          throw StateError('Could not remove the plaintext backup snapshot.');
        }
      }
    });
  }

  /// Restores only into a nonexistent database path, before ShopDatabase opens.
  /// It never merges records or intentionally overwrites an existing database
  /// or WAL files. An OS file lock serializes cooperating callers. A same-
  /// volume hard link publishes the verified file without replacing a target
  /// created by another process after the empty-path check. Startup must call
  /// [cleanupInterruptedStaging] and honor [restoreMarkerFor] before opening
  /// the database. A marker left after publication blocks a mixed DB/sidecar.
  static Future<void> restoreIntoEmptyDatabase({
    required File archive,
    required File target,
    required String password,
    Future<void> Function()? beforePublishForTest,
    Future<void> Function()? afterPublishForTest,
  }) async {
    _checkPassword(password);
    await _requireEmptyRestoreDestination(target);
    if (await archive.length() >
        maxSnapshotBytes + _headerLength + _macLength) {
      throw const FormatException('The backup is too large.');
    }
    final archiveBytes = await archive.readAsBytes();
    final cleartext = await _decrypt(archiveBytes, password);
    if (cleartext.length > maxSnapshotBytes || !_hasSqliteHeader(cleartext)) {
      throw const FormatException('The backup is not a Shop database.');
    }
    await _withRootLock(target.parent, () async {
      await _removeInterruptedStaging(target.parent);
      await _requireEmptyRestoreDestination(target);
      final marker = restoreMarkerFor(target);
      if (await FileSystemEntity.type(marker.path, followLinks: false) !=
          FileSystemEntityType.notFound) {
        throw StateError('An interrupted Shop restore needs recovery.');
      }
      await marker.create(exclusive: true);
      Directory? staging;
      var published = false;
      var verifiedPublication = false;
      var cleaned = false;
      try {
        await marker.writeAsString(_preparingMarker, flush: true);
        staging = await target.parent.createTemp(_restorePrefix);
        final stagedFile = File(
          '${staging.path}${Platform.pathSeparator}shop.sqlite',
        );
        await stagedFile.writeAsBytes(cleartext, flush: true);
        verifySnapshot(stagedFile, expectedSchemaVersion: archiveBytes[5]);
        // Recheck sidecars immediately before the atomic no-replace link. The
        // link itself closes the target-creation race that rename leaves open.
        await _requireEmptyRestoreDestination(target);
        await marker.writeAsString(_committingMarker, flush: true);
        if (beforePublishForTest != null) await beforePublishForTest();
        _publishVerifiedFileNoReplace(stagedFile, target);
        published = true;
        if (afterPublishForTest != null) await afterPublishForTest();
        await _requireNoSidecars(target);
        verifySnapshot(target, expectedSchemaVersion: archiveBytes[5]);
        await _requireNoSidecars(target);
        if (!await _sameFileBytes(target, cleartext)) {
          throw StateError('The Shop database changed during restore.');
        }
        verifiedPublication = true;
      } finally {
        try {
          if (staging != null) {
            await _deleteScratchDirectory(target.parent, staging);
          }
          cleaned = true;
        } finally {
          final targetPresent =
              await FileSystemEntity.type(target.path, followLinks: false) !=
              FileSystemEntityType.notFound;
          final sidecarPresent = await _hasSidecars(target);
          if (cleaned &&
              ((verifiedPublication && !sidecarPresent) ||
                  (!published && !targetPresent && !sidecarPresent))) {
            await marker.delete();
          }
        }
      }
    });
  }

  /// A published DB with this marker may have raced a WAL/SHM writer. Startup
  /// must not open it until a separate recovery has checked the bytes.
  static File restoreMarkerFor(File target) =>
      File('${target.path}.restore-in-progress');

  /// Inspect under the same lock as restore. An existing DB is never offered
  /// for overwrite; sidecars without a DB and interrupted commits stay closed.
  static Future<ShopStorePresence> inspectStore(File target) => _withRootLock(
    target.parent,
    () async {
      if (await FileSystemEntity.type(
            restoreMarkerFor(target).path,
            followLinks: false,
          ) !=
          FileSystemEntityType.notFound) {
        return ShopStorePresence.interrupted;
      }
      final type = await FileSystemEntity.type(target.path, followLinks: false);
      if (type == FileSystemEntityType.file) {
        return ShopStorePresence.existing;
      }
      if (type != FileSystemEntityType.notFound || await _hasSidecars(target)) {
        return ShopStorePresence.unsafe;
      }
      return ShopStorePresence.empty;
    },
  );

  /// Reserve a new DB pathname under the restore lock. Drift initializes the
  /// empty SQLite file when Shop opens it; a concurrent restore must then fail.
  static Future<void> reserveNewStore(File target) =>
      _withRootLock(target.parent, () async {
        if (await FileSystemEntity.type(
              restoreMarkerFor(target).path,
              followLinks: false,
            ) !=
            FileSystemEntityType.notFound) {
          throw StateError('An interrupted Shop restore needs recovery.');
        }
        await _requireEmptyRestoreDestination(target);
        await target.create(exclusive: true);
      });

  /// Removes only Shop's recognized plaintext staging directories in an
  /// app-private parent. Safe to call before opening the database on startup.
  static Future<void> cleanupInterruptedStaging(
    Directory privateRoot, {
    File? restoreTarget,
  }) => _withRootLock(privateRoot, () async {
    await _removeInterruptedStaging(privateRoot);
    if (restoreTarget == null) return;
    if (_pathKey(restoreTarget.parent.absolute.path) !=
        _pathKey(privateRoot.absolute.path)) {
      throw StateError('Shop restore target escaped its private directory.');
    }
    final marker = restoreMarkerFor(restoreTarget);
    final markerType = await FileSystemEntity.type(
      marker.path,
      followLinks: false,
    );
    if (markerType == FileSystemEntityType.notFound) return;
    if (markerType != FileSystemEntityType.file) {
      throw StateError('Shop restore marker is not a regular file.');
    }
    // Only a complete preparing marker with no DB or sidecars is safe to
    // retry. A committing marker might have crashed just after publication.
    if (await FileSystemEntity.type(restoreTarget.path, followLinks: false) ==
            FileSystemEntityType.notFound &&
        !await _hasSidecars(restoreTarget) &&
        await marker.readAsString() == _preparingMarker) {
      await marker.delete();
    }
  });

  static Future<T> _withRootLock<T>(
    Directory root,
    Future<T> Function() operation,
  ) async {
    final rootPath = _pathKey(root.absolute.path);
    if (!_activeRoots.add(rootPath)) {
      throw StateError('Another Shop backup or restore is in progress.');
    }
    RandomAccessFile? handle;
    var locked = false;
    try {
      await _requireRealDirectory(root);
      final lock = File('${root.path}${Platform.pathSeparator}$_lockName');
      final lockType = await FileSystemEntity.type(
        lock.path,
        followLinks: false,
      );
      if (lockType != FileSystemEntityType.notFound &&
          lockType != FileSystemEntityType.file) {
        throw StateError('The Shop backup lock path is not a regular file.');
      }
      handle = await lock.open(mode: FileMode.append);
      try {
        // FileLock.exclusive fails immediately; blockingExclusive can freeze
        // startup behind a stalled backup process.
        await handle.lock(FileLock.exclusive);
        locked = true;
      } on FileSystemException {
        throw StateError('Another Shop backup or restore is in progress.');
      }
      return await operation();
    } finally {
      try {
        if (locked) await handle!.unlock();
      } finally {
        try {
          await handle?.close();
        } finally {
          _activeRoots.remove(rootPath);
        }
      }
    }
  }

  static Future<void> _requireRealDirectory(Directory root) async {
    final type = await FileSystemEntity.type(root.path, followLinks: false);
    if (type == FileSystemEntityType.notFound) {
      await root.create(recursive: true);
    } else if (type != FileSystemEntityType.directory) {
      throw StateError('The Shop staging root must be a real directory.');
    }
    if (await FileSystemEntity.type(root.path, followLinks: false) !=
        FileSystemEntityType.directory) {
      throw StateError('The Shop staging root must be a real directory.');
    }
  }

  static Future<void> _removeInterruptedStaging(Directory root) async {
    await for (final entity in root.list(followLinks: false)) {
      final name = entity.path.split(Platform.pathSeparator).last;
      if (!name.startsWith(_exportPrefix) && !name.startsWith(_restorePrefix)) {
        continue;
      }
      if (_pathKey(File(entity.path).parent.absolute.path) !=
          _pathKey(root.absolute.path)) {
        throw StateError('Shop staging escaped its private directory.');
      }
      final type = await FileSystemEntity.type(entity.path, followLinks: false);
      if (type == FileSystemEntityType.file) continue;
      if (type != FileSystemEntityType.directory) {
        throw StateError('Shop staging contains an unexpected path.');
      }
      await _deleteScratchDirectory(root, Directory(entity.path));
    }
  }

  static Future<void> _deleteScratchDirectory(
    Directory root,
    Directory scratch,
  ) async {
    final name = scratch.path.split(Platform.pathSeparator).last;
    if (_pathKey(scratch.parent.absolute.path) !=
            _pathKey(root.absolute.path) ||
        (!name.startsWith(_exportPrefix) && !name.startsWith(_restorePrefix))) {
      throw StateError('Refusing to remove an unexpected Shop staging path.');
    }
    if (await FileSystemEntity.type(scratch.path, followLinks: false) ==
        FileSystemEntityType.notFound) {
      return;
    }
    await _deleteVerifiedTree(scratch);
  }

  static Future<void> _deleteVerifiedTree(Directory directory) async {
    if (await FileSystemEntity.type(directory.path, followLinks: false) !=
        FileSystemEntityType.directory) {
      throw StateError('Shop staging contains an unexpected path.');
    }
    await for (final entry in directory.list(followLinks: false)) {
      final type = await FileSystemEntity.type(entry.path, followLinks: false);
      if (type == FileSystemEntityType.directory) {
        await _deleteVerifiedTree(Directory(entry.path));
      } else if (type == FileSystemEntityType.file) {
        await File(entry.path).delete();
      } else {
        throw StateError('Shop staging contains an unexpected path.');
      }
    }
    await directory.delete();
  }

  static String _pathKey(String path) =>
      Platform.isWindows ? path.toLowerCase() : path;

  /// Hard links fail when the destination already exists. Staging and target
  /// share a private directory, so a crash after linking leaves the complete
  /// verified SQLite file; startup may safely remove only the staging link.
  static void _publishVerifiedFileNoReplace(File staged, File target) {
    if (Platform.isWindows) {
      final createHardLink = DynamicLibrary.open('kernel32.dll')
          .lookupFunction<
            Int32 Function(Pointer<Utf16>, Pointer<Utf16>, Pointer<Void>),
            int Function(Pointer<Utf16>, Pointer<Utf16>, Pointer<Void>)
          >('CreateHardLinkW');
      final destination = target.path.toNativeUtf16();
      final source = staged.path.toNativeUtf16();
      try {
        if (createHardLink(destination, source, nullptr) == 0) {
          throw FileSystemException(
            'Could not publish the verified Shop backup without replacement.',
            target.path,
          );
        }
      } finally {
        calloc.free(destination);
        calloc.free(source);
      }
      return;
    }
    if (Platform.isAndroid || Platform.isIOS || Platform.isLinux) {
      final libc = Platform.isAndroid
          ? DynamicLibrary.open('libc.so')
          : DynamicLibrary.process();
      final link = libc
          .lookupFunction<
            Int32 Function(Pointer<Utf8>, Pointer<Utf8>),
            int Function(Pointer<Utf8>, Pointer<Utf8>)
          >('link');
      final source = staged.path.toNativeUtf8();
      final destination = target.path.toNativeUtf8();
      try {
        if (link(source, destination) != 0) {
          throw FileSystemException(
            'Could not publish the verified Shop backup without replacement.',
            target.path,
          );
        }
      } finally {
        calloc.free(source);
        calloc.free(destination);
      }
      return;
    }
    throw UnsupportedError('Shop restore is unsupported on this device.');
  }

  static Future<void> _requireEmptyRestoreDestination(File target) async {
    if (await FileSystemEntity.type(target.path, followLinks: false) !=
            FileSystemEntityType.notFound ||
        await _hasSidecars(target)) {
      throw StateError('The restore destination is not empty.');
    }
  }

  static Future<bool> _hasSidecars(File target) async =>
      await FileSystemEntity.type('${target.path}-wal', followLinks: false) !=
          FileSystemEntityType.notFound ||
      await FileSystemEntity.type('${target.path}-shm', followLinks: false) !=
          FileSystemEntityType.notFound;

  static Future<void> _requireNoSidecars(File target) async {
    if (await _hasSidecars(target)) {
      throw StateError('Shop restore found a database sidecar during commit.');
    }
  }

  /// Read-only verification without Drift's automatic schema migrations.
  static void verifySnapshot(File file, {int? expectedSchemaVersion}) {
    final connection = sqlite3.open(file.path, mode: OpenMode.readOnly);
    try {
      final version = connection.select('PRAGMA user_version');
      final integrity = connection.select('PRAGMA integrity_check');
      final brokenReferences = connection.select('PRAGMA foreign_key_check');
      final tables = connection
          .select("SELECT name FROM sqlite_master WHERE type = 'table'")
          .map((row) => row['name'] as String)
          .toSet();
      final schemaVersion = version.length == 1
          ? version.single['user_version'] as int
          : -1;
      final images =
          schemaVersion >= 7 && tables.contains('shop_product_images')
          ? connection.select('SELECT image_png FROM shop_product_images')
          : const <Row>[];
      final imageTotal = images.fold<int>(0, (total, row) {
        final image = row['image_png'];
        return total +
            (image is Uint8List
                ? image.length
                : ShopDatabase.maxProductThumbnailsTotalBytes + 1);
      });
      final drafts =
          schemaVersion >= 8 && tables.contains('shop_counter_drafts')
          ? connection.select(
              'SELECT slot, operation_id, basket_json, updated_at_millis '
              'FROM shop_counter_drafts',
            )
          : const <Row>[];
      final draftInvalid =
          drafts.length > 1 ||
          drafts.any((row) => !_validCounterDraft(row)) ||
          (drafts.isNotEmpty &&
              connection.select(
                'SELECT 1 FROM shop_sales WHERE operation_id = ? LIMIT 1',
                [drafts.single['operation_id']],
              ).isNotEmpty);
      final heldSales =
          schemaVersion >= 10 && tables.contains('shop_held_sales')
          ? connection.select(
              'SELECT id, name, operation_id, basket_json, '
              'created_at_millis, updated_at_millis FROM shop_held_sales',
            )
          : const <Row>[];
      final heldInvalid =
          heldSales.length > 30 ||
          heldSales.any((row) {
            final id = row['id'];
            final name = row['name'];
            final operationId = row['operation_id'];
            if (id is! String ||
                id.isEmpty ||
                id.length > 120 ||
                name is! String ||
                name.trim().isEmpty ||
                name.runes.length > 80 ||
                RegExp(r'[\x00-\x1f\x7f]').hasMatch(name) ||
                operationId is! String ||
                operationId.isEmpty ||
                operationId.length > 120 ||
                row['created_at_millis'] is! int ||
                row['updated_at_millis'] is! int ||
                !_validBasketJson(row['basket_json'])) {
              return true;
            }
            return connection.select(
                  'SELECT 1 FROM shop_sales WHERE operation_id = ? LIMIT 1',
                  [operationId],
                ).isNotEmpty ||
                drafts.any((draft) => draft['operation_id'] == operationId);
          });
      final hasReorderLevel =
          schemaVersion >= 9 &&
          tables.contains('shop_products') &&
          connection
              .select('PRAGMA table_info(shop_products)')
              .any((row) => row['name'] == 'reorder_level');
      final invalidReorderLevel =
          hasReorderLevel &&
          connection.select(
            'SELECT 1 FROM shop_products WHERE reorder_level IS NOT NULL '
            'AND (typeof(reorder_level) != ? OR reorder_level < 0 '
            'OR reorder_level > 2000000000) LIMIT 1',
            ['integer'],
          ).isNotEmpty;
      if (version.length != 1 ||
          schemaVersion < oldestSupportedSchemaVersion ||
          schemaVersion > supportedSchemaVersion ||
          (expectedSchemaVersion != null &&
              schemaVersion != expectedSchemaVersion) ||
          integrity.length != 1 ||
          integrity.single['integrity_check'] != 'ok' ||
          brokenReferences.isNotEmpty ||
          !tables.containsAll(_requiredTables) ||
          (schemaVersion >= 7 && !tables.contains('shop_product_images')) ||
          (schemaVersion >= 8 && !tables.contains('shop_counter_drafts')) ||
          (schemaVersion >= 9 && !hasReorderLevel) ||
          (schemaVersion >= 10 && !tables.contains('shop_held_sales')) ||
          invalidReorderLevel ||
          draftInvalid ||
          heldInvalid ||
          images.any((row) {
            final image = row['image_png'];
            return image is! Uint8List ||
                !ShopDatabase.isValidProductThumbnail(image);
          }) ||
          imageTotal > ShopDatabase.maxProductThumbnailsTotalBytes) {
        throw const FormatException(
          'The Shop snapshot failed database checks.',
        );
      }
    } finally {
      connection.close();
    }
  }

  static bool _validCounterDraft(Row row) {
    final operationId = row['operation_id'];
    if (row['slot'] != 1 ||
        operationId is! String ||
        operationId.isEmpty ||
        operationId.length > 120 ||
        row['updated_at_millis'] is! int) {
      return false;
    }
    return _validBasketJson(row['basket_json']);
  }

  static bool _validBasketJson(Object? value) {
    if (value is! String) return false;
    try {
      final raw = jsonDecode(value);
      if (raw is! List || raw.isEmpty || raw.length > 100) return false;
      final seen = <String>{};
      for (final value in raw) {
        if (value is! Map<String, dynamic>) return false;
        final id = value['productId'];
        final quantity = value['quantity'];
        final price = value['unitPriceMmk'];
        if (id is! String ||
            id.isEmpty ||
            id.length > 100 ||
            !seen.add(id) ||
            quantity is! int ||
            quantity < 1 ||
            quantity > 1000 ||
            price is! int ||
            price < 0 ||
            price > 2000000000) {
          return false;
        }
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  static Future<Uint8List> _decrypt(List<int> bytes, String password) async {
    if (bytes.length < _headerLength + _macLength + 16 ||
        bytes.length > maxSnapshotBytes + _headerLength + _macLength ||
        !_sameBytes(bytes.sublist(0, 4), _magic) ||
        bytes[4] != formatVersion ||
        (bytes[5] < oldestSupportedSchemaVersion ||
            bytes[5] > supportedSchemaVersion)) {
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

  static Future<bool> _sameFileBytes(File file, List<int> expected) async {
    var offset = 0;
    await for (final chunk in file.openRead()) {
      if (offset + chunk.length > expected.length) return false;
      for (var index = 0; index < chunk.length; index++) {
        if (chunk[index] != expected[offset + index]) return false;
      }
      offset += chunk.length;
    }
    return offset == expected.length;
  }

  static bool _hasSqliteHeader(List<int> bytes) {
    const signature = 'SQLite format 3\u0000';
    return bytes.length >= 16 &&
        _sameBytes(bytes.sublist(0, 16), ascii.encode(signature));
  }
}
