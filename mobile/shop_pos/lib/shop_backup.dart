import 'dart:convert';
import 'dart:ffi';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:crypto/crypto.dart' as crypto;
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
  static const supportedSchemaVersion = 11;
  static const oldestSupportedSchemaVersion = 6;
  static const maxSnapshotBytes = 64 * 1024 * 1024;

  static const _saltLength = 16;
  static const _nonceLength = 12;
  static const _macLength = 16;
  static const _headerLength = 4 + 1 + 1 + _saltLength + _nonceLength;
  static const _magic = [0x53, 0x4d, 0x42, 0x4b]; // SMBK
  static const _requiredTables = {
    'menu_import_drafts',
    'merchant_wallet_profiles',
    'shop_products',
    'shop_sales',
    'shop_sale_lines',
    'shop_stock_movements',
    'shop_sync_outbox',
    'shop_wallet_checkout_intents',
    'shop_cash_shifts',
    'shop_cash_shift_sales',
  };
  static const _requiredColumns = <String, Set<String>>{
    'menu_import_drafts': {
      'id',
      'batch_id',
      'category',
      'name',
      'description',
      'price_mmk',
      'sku',
      'barcode',
      'opening_stock',
      'review_state',
      'created_at_millis',
    },
    'merchant_wallet_profiles': {
      'provider',
      'merchant_phone',
      'official_qr_payload',
      'issuer_confirmed',
      'updated_at_millis',
    },
    'shop_products': {
      'id',
      'name',
      'category',
      'description',
      'sku',
      'barcode',
      'price_mmk',
      'on_hand',
      'updated_at_millis',
      'archived',
    },
    'shop_sales': {
      'id',
      'operation_id',
      'request_fingerprint',
      'total_mmk',
      'payment_method',
      'created_at_millis',
    },
    'shop_sale_lines': {
      'id',
      'sale_id',
      'product_id',
      'product_name',
      'unit_price_mmk',
      'quantity',
      'line_total_mmk',
    },
    'shop_stock_movements': {
      'id',
      'sale_id',
      'product_id',
      'quantity_delta',
      'reason',
      'created_at_millis',
    },
    'shop_sync_outbox': {
      'operation_id',
      'event_type',
      'payload_json',
      'state',
      'created_at_millis',
    },
    'shop_wallet_checkout_intents': {
      'operation_id',
      'payment_method',
      'request_fingerprint',
      'total_mmk',
      'merchant_phone',
      'merchant_qr_payload',
      'basket_json',
      'state',
      'created_at_millis',
    },
    'shop_cash_shifts': {
      'id',
      'open_operation_id',
      'operator_label',
      'opening_float_mmk',
      'opened_at_millis',
      'state',
      'close_operation_id',
      'closed_at_millis',
      'cash_sales_count',
      'cash_sales_total_mmk',
      'wallet_sales_count',
      'wallet_sales_total_mmk',
      'expected_cash_mmk',
      'counted_cash_mmk',
      'difference_mmk',
      'review_sale_count',
      'review_cash_total_mmk',
    },
    'shop_cash_shift_sales': {'sale_id', 'shift_id'},
  };
  static const _v11RequiredColumns = <String, Set<String>>{
    'shop_sale_reversals': {
      'id',
      'operation_id',
      'request_fingerprint',
      'sale_snapshot_digest',
      'sale_id',
      'original_total_mmk',
      'original_payment_method',
      'original_created_at_millis',
      'original_line_count',
      'restock_items',
      'reason',
      'payment_resolution',
      'cash_drawer_delta_mmk',
      'shift_id',
      'authorization_receipt_id',
      'authorization_receipt_digest',
      'authorization_command_digest',
      'authorization_workspace_id',
      'authorized_actor_id',
      'authorized_actor_label',
      'authorized_actor_role',
      'authorization_capability',
      'authorization_source',
      'authorization_issued_at_millis',
      'authorization_verified_at_millis',
      'authorization_expires_at_millis',
      'created_at_millis',
    },
    'shop_sale_reversal_lines': {
      'id',
      'reversal_id',
      'sale_line_id',
      'product_id',
      'product_name',
      'unit_price_mmk',
      'quantity',
      'line_total_mmk',
      'restock_quantity',
      'stock_movement_id',
    },
    'shop_wallet_reversal_reconciliations': {
      'id',
      'operation_id',
      'request_fingerprint',
      'reversal_id',
      'outcome',
      'evidence_reference',
      'authorization_receipt_id',
      'authorization_receipt_digest',
      'authorization_command_digest',
      'authorization_workspace_id',
      'authorized_actor_id',
      'authorized_actor_label',
      'authorized_actor_role',
      'authorization_capability',
      'authorization_source',
      'authorization_issued_at_millis',
      'authorization_verified_at_millis',
      'authorization_expires_at_millis',
      'created_at_millis',
    },
  };
  static const _v11CashShiftColumns = {
    'cash_reversal_count',
    'cash_reversal_total_mmk',
    'cash_drawer_outflow_mmk',
    'review_cash_reversal_count',
    'review_cash_drawer_outflow_mmk',
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
  /// or SQLite rollback/WAL sidecars. An OS file lock serializes cooperating
  /// callers. A same-volume hard link publishes the verified file without
  /// replacing a target
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

  /// A published DB with this marker may have raced a SQLite sidecar writer.
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
      await FileSystemEntity.type(
            '${target.path}-journal',
            followLinks: false,
          ) !=
          FileSystemEntityType.notFound ||
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
      final legacyHasReservedV11Objects =
          schemaVersion >= oldestSupportedSchemaVersion &&
          schemaVersion < 11 &&
          !_legacyV11ObjectsAbsent(connection, tables);
      final baseSchemaValid = _requiredColumns.entries.every(
        (entry) =>
            tables.contains(entry.key) &&
            _tableHasColumns(connection, entry.key, entry.value),
      );
      final schemaValid =
          baseSchemaValid &&
          (schemaVersion < 7 ||
              (tables.contains('shop_product_images') &&
                  _tableHasColumns(connection, 'shop_product_images', const {
                    'product_id',
                    'image_png',
                    'updated_at_millis',
                  }))) &&
          (schemaVersion < 8 ||
              (tables.contains('shop_counter_drafts') &&
                  _tableHasColumns(connection, 'shop_counter_drafts', const {
                    'slot',
                    'operation_id',
                    'basket_json',
                    'updated_at_millis',
                  }))) &&
          (schemaVersion < 10 ||
              (tables.contains('shop_held_sales') &&
                  _tableHasColumns(connection, 'shop_held_sales', const {
                    'id',
                    'name',
                    'operation_id',
                    'basket_json',
                    'created_at_millis',
                    'updated_at_millis',
                  }))) &&
          (schemaVersion < 11 ||
              (_v11RequiredColumns.entries.every(
                    (entry) =>
                        tables.contains(entry.key) &&
                        _tableHasColumns(connection, entry.key, entry.value),
                  ) &&
                  _tableHasColumns(
                    connection,
                    'shop_cash_shifts',
                    _v11CashShiftColumns,
                  ) &&
                  _v11CashShiftColumnDefinitionsValid(connection)));
      final walletIntents = schemaValid
          ? connection.select(
              'SELECT operation_id, payment_method, request_fingerprint, '
              'total_mmk, merchant_phone, merchant_qr_payload, basket_json, '
              'state, created_at_millis '
              'FROM shop_wallet_checkout_intents',
            )
          : const <Row>[];
      final pendingWallets = walletIntents
          .where((row) => row['state'] == 'pending')
          .toList(growable: false);
      final walletInvalid =
          walletIntents.any((row) => !_validWalletIntent(row)) ||
          pendingWallets.length > 1 ||
          pendingWallets.any(
            (row) => connection.select(
              'SELECT 1 FROM shop_sales WHERE operation_id = ? LIMIT 1',
              [row['operation_id']],
            ).isNotEmpty,
          );
      final images = schemaValid && schemaVersion >= 7
          ? connection.select('SELECT image_png FROM shop_product_images')
          : const <Row>[];
      final imageTotal = images.fold<int>(0, (total, row) {
        final image = row['image_png'];
        return total +
            (image is Uint8List
                ? image.length
                : ShopDatabase.maxProductThumbnailsTotalBytes + 1);
      });
      final drafts = schemaValid && schemaVersion >= 8
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
      final heldSales = schemaValid && schemaVersion >= 10
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
      final reversalAuditInvalid =
          schemaVersion >= 11 &&
          (!schemaValid ||
              !_v11ReversalAuditValid(connection) ||
              !_v11SchemaDefinitionsValid(connection));
      if (version.length != 1 ||
          schemaVersion < oldestSupportedSchemaVersion ||
          schemaVersion > supportedSchemaVersion ||
          (expectedSchemaVersion != null &&
              schemaVersion != expectedSchemaVersion) ||
          integrity.length != 1 ||
          integrity.single['integrity_check'] != 'ok' ||
          brokenReferences.isNotEmpty ||
          !tables.containsAll(_requiredTables) ||
          !schemaValid ||
          legacyHasReservedV11Objects ||
          walletInvalid ||
          (schemaVersion >= 7 && !tables.contains('shop_product_images')) ||
          (schemaVersion >= 8 && !tables.contains('shop_counter_drafts')) ||
          (schemaVersion >= 9 && !hasReorderLevel) ||
          (schemaVersion >= 10 && !tables.contains('shop_held_sales')) ||
          (schemaVersion >= 11 && reversalAuditInvalid) ||
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

  static bool _tableHasColumns(
    Database connection,
    String table,
    Set<String> required,
  ) {
    final columns = connection
        .select('PRAGMA table_info($table)')
        .map((row) => row['name'])
        .whereType<String>()
        .toSet();
    return columns.containsAll(required);
  }

  static bool _v11CashShiftColumnDefinitionsValid(Database connection) {
    final columns = <String, Row>{
      for (final row in connection.select('PRAGMA table_info(shop_cash_shifts)'))
        if (row['name'] is String) (row['name'] as String).toLowerCase(): row,
    };
    return _v11CashShiftColumns.every((name) {
      final column = columns[name];
      return column != null &&
          (column['type'] as String?)?.toUpperCase() == 'INTEGER' &&
          column['notnull'] == 0 &&
          column['dflt_value'] == null &&
          column['pk'] == 0;
    });
  }

  static Map<String, String> get _v11SchemaDefinitions {
    final definitions = <String, String>{
      'shop_sale_reversals': shopSaleReversalsV11Sql,
      'shop_sale_reversal_lines': shopSaleReversalLinesV11Sql,
      'shop_wallet_reversal_reconciliations':
          shopWalletReversalReconciliationsV11Sql,
    };
    for (final table in const [
      'shop_sale_reversals',
      'shop_sale_reversal_lines',
      'shop_wallet_reversal_reconciliations',
      'shop_sales',
      'shop_sale_lines',
      'shop_stock_movements',
    ]) {
      final message = table == 'shop_stock_movements'
          ? 'Completed Shop stock movements are immutable'
          : table == 'shop_sales' || table == 'shop_sale_lines'
          ? 'Completed Shop sales are immutable'
          : 'Shop reversal audit records are immutable';
      for (final operation in const ['update', 'delete']) {
        definitions['${table}_no_$operation'] = shopImmutableTriggerV11Sql(
          table: table,
          operation: operation,
          message: message,
        );
      }
    }
    return definitions;
  }

  static const _v11AuditTableNames = {
    'shop_sale_reversals',
    'shop_sale_reversal_lines',
    'shop_wallet_reversal_reconciliations',
  };

  static bool _legacyV11ObjectsAbsent(Database connection, Set<String> tables) {
    final reservedNames = _v11SchemaDefinitions.keys
        .map((name) => name.toLowerCase())
        .toSet();
    final existingNames = connection
        .select('SELECT name FROM sqlite_master')
        .map((row) => row['name'])
        .whereType<String>()
        .map((name) => name.toLowerCase())
        .toSet();
    if (existingNames.intersection(reservedNames).isNotEmpty) return false;
    final lowerTables = tables.map((name) => name.toLowerCase()).toSet();
    if (!lowerTables.contains('shop_cash_shifts')) return true;
    final columns = connection
        .select('PRAGMA table_info(shop_cash_shifts)')
        .map((row) => row['name'])
        .whereType<String>()
        .map((name) => name.toLowerCase())
        .toSet();
    return columns.intersection(_v11CashShiftColumns).isEmpty;
  }

  static bool _v11SchemaDefinitionsValid(Database connection) {
    final actualSql = <String, String>{};
    final actualTypes = <String, String>{};
    final triggerTables = <String, String>{};
    for (final row in connection.select(
      "SELECT type, name, tbl_name, sql FROM sqlite_master "
      "WHERE type IN ('table', 'trigger')",
    )) {
      final type = row['type'];
      final name = row['name'];
      final sql = row['sql'];
      if (type is! String || name is! String || sql is! String) continue;
      final lowerName = name.toLowerCase();
      if (actualSql.containsKey(lowerName)) return false;
      actualSql[lowerName] = sql;
      actualTypes[lowerName] = type.toLowerCase();
      final table = row['tbl_name'];
      if (type.toLowerCase() == 'trigger' && table is String) {
        triggerTables[lowerName] = table.toLowerCase();
      }
    }

    final definitions = _v11SchemaDefinitions;
    for (final entry in definitions.entries) {
      final name = entry.key.toLowerCase();
      final expectedType = _v11AuditTableNames.contains(name)
          ? 'table'
          : 'trigger';
      if (actualTypes[name] != expectedType ||
          actualSql[name] == null ||
          _canonicalSchemaSql(actualSql[name]!) !=
              _canonicalSchemaSql(entry.value)) {
        return false;
      }
    }

    final expectedTriggerNames = definitions.keys
        .map((name) => name.toLowerCase())
        .where((name) => !_v11AuditTableNames.contains(name))
        .toSet();
    final actualTriggerNames = triggerTables.keys.toSet();
    return actualTriggerNames.length == expectedTriggerNames.length &&
        actualTriggerNames.containsAll(expectedTriggerNames);
  }

  static String _canonicalSchemaSql(String value) {
    final output = StringBuffer();
    final ifNotExists = RegExp(
      r'if\s+not\s+exists\b',
      caseSensitive: false,
    );
    var index = 0;
    var pendingSpace = false;
    while (index < value.length) {
      final character = value[index];
      if (character == "'" ||
          character == '"' ||
          character == '`' ||
          character == '[') {
        if (pendingSpace && output.length > 0) output.write(' ');
        pendingSpace = false;
        final closing = character == '[' ? ']' : character;
        output.write(character);
        index++;
        while (index < value.length) {
          final quoted = value[index];
          output.write(quoted);
          index++;
          if (quoted != closing) continue;
          if (closing != ']' &&
              index < value.length &&
              value[index] == closing) {
            output.write(value[index]);
            index++;
            continue;
          }
          break;
        }
        continue;
      }

      final optionalClause = ifNotExists.matchAsPrefix(value, index);
      final hasWordBefore = index > 0 &&
          RegExp(r'[A-Za-z0-9_]').hasMatch(value[index - 1]);
      if (!hasWordBefore && optionalClause != null) {
        index = optionalClause.end;
        pendingSpace = true;
        continue;
      }
      if (RegExp(r'\s').hasMatch(character)) {
        pendingSpace = true;
        index++;
        continue;
      }
      if (pendingSpace && output.length > 0) output.write(' ');
      pendingSpace = false;
      output.write(character.toLowerCase());
      index++;
    }
    return output.toString().trim();
  }

  static String _sha256Hex(String value) =>
      crypto.sha256.convert(utf8.encode(value)).toString();

  static bool _jsonObjectMatches(Object? encoded, Map<String, Object?> expected) {
    if (encoded is! String) return false;
    try {
      return _jsonDeepEquals(jsonDecode(encoded), expected);
    } on FormatException {
      return false;
    }
  }

  static bool _jsonDeepEquals(Object? actual, Object? expected) {
    if (actual is Map && expected is Map) {
      if (actual.length != expected.length) return false;
      for (final entry in expected.entries) {
        if (!actual.containsKey(entry.key) ||
            !_jsonDeepEquals(actual[entry.key], entry.value)) {
          return false;
        }
      }
      return true;
    }
    if (actual is List && expected is List) {
      if (actual.length != expected.length) return false;
      for (var index = 0; index < actual.length; index++) {
        if (!_jsonDeepEquals(actual[index], expected[index])) return false;
      }
      return true;
    }
    if (actual == null || expected == null) return actual == expected;
    return actual.runtimeType == expected.runtimeType && actual == expected;
  }

  static bool _v11DigestsAndEventsValid(Database connection) {
    try {
      final reversals = connection.select(
        'SELECT * FROM shop_sale_reversals ORDER BY id',
      );
      for (final reversal in reversals) {
        final reversalId = reversal['id'];
        final operationId = reversal['operation_id'];
        final saleId = reversal['sale_id'];
        final originalTotalMmk = reversal['original_total_mmk'];
        final originalPaymentMethod = reversal['original_payment_method'];
        final restockValue = reversal['restock_items'];
        final reason = reversal['reason'];
        final paymentResolution = reversal['payment_resolution'];
        final drawerDelta = reversal['cash_drawer_delta_mmk'];
        final shiftId = reversal['shift_id'];
        final authorizationReceiptId = reversal['authorization_receipt_id'];
        final authorizedActorId = reversal['authorized_actor_id'];
        final createdAtMillis = reversal['created_at_millis'];
        if (reversalId is! String ||
            operationId is! String ||
            reversalId != operationId ||
            saleId is! String ||
            originalTotalMmk is! int ||
            originalPaymentMethod is! String ||
            restockValue is! int ||
            reason is! String ||
            paymentResolution is! String ||
            drawerDelta is! int ||
            authorizationReceiptId is! String ||
            authorizedActorId is! String ||
            createdAtMillis is! int) {
          return false;
        }
        final isCash = originalPaymentMethod == 'cash';
        if ((isCash && shiftId is! String) || (!isCash && shiftId != null)) {
          return false;
        }

        final sales = connection.select(
          'SELECT * FROM shop_sales WHERE id = ?',
          [saleId],
        );
        if (sales.length != 1) return false;
        final sale = sales.single;
        final totalMmk = sale['total_mmk'];
        final paymentMethod = sale['payment_method'];
        final saleCreatedAtMillis = sale['created_at_millis'];
        if (totalMmk is! int ||
            paymentMethod is! String ||
            saleCreatedAtMillis is! int) {
          return false;
        }
        final saleLines = connection.select(
          'SELECT * FROM shop_sale_lines WHERE sale_id = ? ORDER BY id',
          [saleId],
        );
        final saleSnapshot = jsonEncode(<String, Object?>{
          'saleId': saleId,
          'totalMmk': totalMmk,
          'paymentMethod': paymentMethod,
          'createdAtMillis': saleCreatedAtMillis,
          'lines': <Map<String, Object?>>[
            for (final line in saleLines)
              <String, Object?>{
                'id': line['id'],
                'productId': line['product_id'],
                'productName': line['product_name'],
                'unitPriceMmk': line['unit_price_mmk'],
                'quantity': line['quantity'],
                'lineTotalMmk': line['line_total_mmk'],
              },
          ],
        });
        final snapshotDigest = _sha256Hex(saleSnapshot);
        if (reversal['sale_snapshot_digest'] != snapshotDigest) return false;

        final requestFingerprint = jsonEncode(<String, Object?>{
          'operationId': operationId,
          'saleId': saleId,
          'saleSnapshotDigest': snapshotDigest,
          'restockItems': restockValue == 1,
          'reason': reason,
          'cashReturnConfirmed': isCash,
          'expectedCashShiftId': shiftId,
          'paymentResolution': paymentResolution,
        });
        if (reversal['request_fingerprint'] != requestFingerprint ||
            reversal['authorization_command_digest'] !=
                _sha256Hex(requestFingerprint)) {
          return false;
        }

        final reversalLines = connection.select(
          'SELECT * FROM shop_sale_reversal_lines '
          'WHERE reversal_id = ? ORDER BY sale_line_id',
          [reversalId],
        );
        final events = connection.select(
          'SELECT event_type, payload_json, created_at_millis '
          'FROM shop_sync_outbox WHERE operation_id = ?',
          [operationId],
        );
        if (events.length != 1 ||
            events.single['event_type'] !=
                'shop.sale.reversal_recorded.v1' ||
            events.single['created_at_millis'] != createdAtMillis) {
          return false;
        }
        final expectedPayload = <String, Object?>{
          'reversalId': reversalId,
          'saleId': saleId,
          'originalTotalMmk': originalTotalMmk,
          'originalPaymentMethod': originalPaymentMethod,
          'restockItems': restockValue == 1,
          'reason': reason,
          'paymentResolution': paymentResolution,
          'cashReturnConfirmed': isCash,
          'cashDrawerDeltaMmk': drawerDelta,
          if (isCash) 'shiftId': shiftId,
          'externalReconciliationState': isCash
              ? 'not_applicable'
              : 'pending',
          'moneyReturned': isCash,
          'authorizationReceiptId': authorizationReceiptId,
          'authorizedActorId': authorizedActorId,
          'createdAtMillis': createdAtMillis,
          'lines': <Map<String, Object?>>[
            for (final line in reversalLines)
              <String, Object?>{
                'saleLineId': line['sale_line_id'],
                'productId': line['product_id'],
                'productName': line['product_name'],
                'unitPriceMmk': line['unit_price_mmk'],
                'quantity': line['quantity'],
                'lineTotalMmk': line['line_total_mmk'],
                'restockQuantity': line['restock_quantity'],
              },
          ],
        };
        if (!_jsonObjectMatches(
          events.single['payload_json'],
          expectedPayload,
        )) {
          return false;
        }
      }

      final reconciliations = connection.select(
        'SELECT * FROM shop_wallet_reversal_reconciliations ORDER BY id',
      );
      for (final reconciliation in reconciliations) {
        final id = reconciliation['id'];
        final operationId = reconciliation['operation_id'];
        final reversalId = reconciliation['reversal_id'];
        final outcome = reconciliation['outcome'];
        final evidenceReference = reconciliation['evidence_reference'];
        final authorizationReceiptId =
            reconciliation['authorization_receipt_id'];
        final authorizedActorId = reconciliation['authorized_actor_id'];
        final createdAtMillis = reconciliation['created_at_millis'];
        if (id is! String ||
            operationId is! String ||
            id != operationId ||
            reversalId is! String ||
            outcome is! String ||
            evidenceReference is! String ||
            authorizationReceiptId is! String ||
            authorizedActorId is! String ||
            createdAtMillis is! int) {
          return false;
        }
        final requestFingerprint = jsonEncode(<String, Object?>{
          'operationId': operationId,
          'reversalId': reversalId,
          'outcome': outcome,
          'evidenceReference': evidenceReference,
        });
        if (reconciliation['request_fingerprint'] != requestFingerprint ||
            reconciliation['authorization_command_digest'] !=
                _sha256Hex(requestFingerprint)) {
          return false;
        }
        final reversal = connection.select(
          'SELECT created_at_millis FROM shop_sale_reversals WHERE id = ?',
          [reversalId],
        );
        if (reversal.length != 1 ||
            reversal.single['created_at_millis'] is! int ||
            createdAtMillis < (reversal.single['created_at_millis'] as int)) {
          return false;
        }
        final events = connection.select(
          'SELECT event_type, payload_json, created_at_millis '
          'FROM shop_sync_outbox WHERE operation_id = ?',
          [operationId],
        );
        if (events.length != 1 ||
            events.single['event_type'] !=
                'shop.mobile_money.reversal_reconciled.v1' ||
            events.single['created_at_millis'] != createdAtMillis ||
            !_jsonObjectMatches(
              events.single['payload_json'],
              <String, Object?>{
                'reversalId': reversalId,
                'outcome': outcome,
                'evidenceReference': evidenceReference,
                'externalReconciliationState': 'confirmed',
                'moneyReturned': outcome == 'money_returned',
                'authorizationReceiptId': authorizationReceiptId,
                'authorizedActorId': authorizedActorId,
                'createdAtMillis': createdAtMillis,
              },
            )) {
          return false;
        }
      }
      return true;
    } on Object {
      return false;
    }
  }

  static bool _v11CashShiftsValid(Database connection) {
    try {
      for (final shift in connection.select('SELECT * FROM shop_cash_shifts')) {
        final shiftId = shift['id'];
        final openingFloatMmk = shift['opening_float_mmk'];
        final openedAtMillis = shift['opened_at_millis'];
        final state = shift['state'];
        if (shiftId is! String ||
            openingFloatMmk is! int ||
            openingFloatMmk < 0 ||
            openingFloatMmk > 200000000000000 ||
            openedAtMillis is! int ||
            (state != 'open' && state != 'closed')) {
          return false;
        }
        final sales = connection.select('''
          SELECT
            COALESCE(SUM(CASE WHEN s.payment_method = 'cash' THEN 1 ELSE 0 END), 0) AS cash_count,
            COALESCE(SUM(CASE WHEN s.payment_method = 'cash' THEN s.total_mmk ELSE 0 END), 0) AS cash_total,
            COALESCE(SUM(CASE WHEN s.payment_method IN ('kbzpay', 'wavepay') THEN 1 ELSE 0 END), 0) AS wallet_count,
            COALESCE(SUM(CASE WHEN s.payment_method IN ('kbzpay', 'wavepay') THEN s.total_mmk ELSE 0 END), 0) AS wallet_total,
            COALESCE(SUM(CASE WHEN s.payment_method NOT IN ('cash', 'kbzpay', 'wavepay') THEN 1 ELSE 0 END), 0) AS unknown_count
          FROM shop_cash_shift_sales link
          JOIN shop_sales s ON s.id = link.sale_id
          WHERE link.shift_id = ?
        ''', [shiftId]).single;
        final cashCount = sales['cash_count'];
        final cashTotal = sales['cash_total'];
        final walletCount = sales['wallet_count'];
        final walletTotal = sales['wallet_total'];
        if (cashCount is! int ||
            cashTotal is! int ||
            walletCount is! int ||
            walletTotal is! int ||
            sales['unknown_count'] != 0) {
          return false;
        }
        final reversals = connection.select('''
          SELECT COUNT(*) AS reversal_count,
            COALESCE(SUM(original_total_mmk), 0) AS reversal_total,
            COALESCE(SUM(-cash_drawer_delta_mmk), 0) AS drawer_outflow,
            COALESCE(MAX(created_at_millis), 0) AS latest_reversal_at
          FROM shop_sale_reversals
          WHERE shift_id = ? AND original_payment_method = 'cash'
        ''', [shiftId]).single;
        final reversalCount = reversals['reversal_count'];
        final reversalTotal = reversals['reversal_total'];
        final drawerOutflow = reversals['drawer_outflow'];
        final latestReversalAt = reversals['latest_reversal_at'];
        if (reversalCount is! int ||
            reversalTotal is! int ||
            drawerOutflow is! int ||
            latestReversalAt is! int ||
            cashTotal > 200000000000000 - openingFloatMmk ||
            drawerOutflow > openingFloatMmk + cashTotal) {
          return false;
        }
        final expectedCashMmk = openingFloatMmk + cashTotal - drawerOutflow;

        const closeFields = <String>[
          'close_operation_id',
          'closed_at_millis',
          'cash_sales_count',
          'cash_sales_total_mmk',
          'wallet_sales_count',
          'wallet_sales_total_mmk',
          'expected_cash_mmk',
          'counted_cash_mmk',
          'difference_mmk',
          'review_sale_count',
          'review_cash_total_mmk',
          'cash_reversal_count',
          'cash_reversal_total_mmk',
          'cash_drawer_outflow_mmk',
          'review_cash_reversal_count',
          'review_cash_drawer_outflow_mmk',
        ];
        if (state == 'open') {
          if (closeFields.any((field) => shift[field] != null)) return false;
          continue;
        }

        final closeOperationId = shift['close_operation_id'];
        final closedAtMillis = shift['closed_at_millis'];
        final countedCashMmk = shift['counted_cash_mmk'];
        if (closeOperationId is! String ||
            closeOperationId.isEmpty ||
            closeOperationId.length > 120 ||
            closedAtMillis is! int ||
            closedAtMillis < openedAtMillis ||
            countedCashMmk is! int ||
            countedCashMmk < 0 ||
            countedCashMmk > 200000000000000 ||
            latestReversalAt > closedAtMillis ||
            shift['cash_sales_count'] != cashCount ||
            shift['cash_sales_total_mmk'] != cashTotal ||
            shift['wallet_sales_count'] != walletCount ||
            shift['wallet_sales_total_mmk'] != walletTotal ||
            shift['expected_cash_mmk'] != expectedCashMmk ||
            shift['difference_mmk'] != countedCashMmk - expectedCashMmk ||
            shift['review_sale_count'] != cashCount + walletCount ||
            shift['review_cash_total_mmk'] != cashTotal) {
          return false;
        }

        const reversalFields = <String>[
          'cash_reversal_count',
          'cash_reversal_total_mmk',
          'cash_drawer_outflow_mmk',
          'review_cash_reversal_count',
          'review_cash_drawer_outflow_mmk',
        ];
        final legacyClose = reversalFields.every(
          (field) => shift[field] == null,
        );
        if (!legacyClose &&
            reversalFields.any((field) => shift[field] is! int)) {
          return false;
        }
        if ((legacyClose &&
                (reversalCount != 0 ||
                    reversalTotal != 0 ||
                    drawerOutflow != 0)) ||
            (!legacyClose &&
                (shift['cash_reversal_count'] != reversalCount ||
                    shift['cash_reversal_total_mmk'] != reversalTotal ||
                    shift['cash_drawer_outflow_mmk'] != drawerOutflow ||
                    shift['review_cash_reversal_count'] != reversalCount ||
                    shift['review_cash_drawer_outflow_mmk'] != drawerOutflow))) {
          return false;
        }

        final expectedPayload = <String, Object?>{
          'shiftId': shiftId,
          'cashSalesCount': cashCount,
          'cashSalesTotalMmk': cashTotal,
          'walletSalesCount': walletCount,
          'walletSalesTotalMmk': walletTotal,
          if (!legacyClose) ...<String, Object?>{
            'cashReversalCount': reversalCount,
            'cashReversalTotalMmk': reversalTotal,
            'cashDrawerOutflowMmk': drawerOutflow,
          },
          'expectedCashMmk': expectedCashMmk,
          'countedCashMmk': countedCashMmk,
          'differenceMmk': countedCashMmk - expectedCashMmk,
          'closedAtMillis': closedAtMillis,
        };
        final events = connection.select(
          'SELECT event_type, payload_json, created_at_millis '
          'FROM shop_sync_outbox WHERE operation_id = ?',
          [closeOperationId],
        );
        if (events.length != 1 ||
            events.single['event_type'] != 'shop.cash_shift.closed.v1' ||
            events.single['created_at_millis'] != closedAtMillis ||
            !_jsonObjectMatches(
              events.single['payload_json'],
              expectedPayload,
            )) {
          return false;
        }
      }
      return true;
    } on Object {
      return false;
    }
  }

  static bool _v11ReversalAuditValid(Database connection) {
    final invalidReversal = connection.select('''
      SELECT 1
      FROM shop_sale_reversals r
      JOIN shop_sales s ON s.id = r.sale_id
      WHERE r.original_total_mmk != s.total_mmk
         OR r.original_payment_method != s.payment_method
         OR r.original_created_at_millis != s.created_at_millis
         OR r.original_line_count != (
              SELECT COUNT(*) FROM shop_sale_lines sl WHERE sl.sale_id = s.id
            )
         OR r.original_line_count != (
              SELECT COUNT(*) FROM shop_sale_reversal_lines rl
              WHERE rl.reversal_id = r.id
            )
         OR r.original_total_mmk != COALESCE((
              SELECT SUM(rl.line_total_mmk)
              FROM shop_sale_reversal_lines rl WHERE rl.reversal_id = r.id
            ), -1)
         OR length(r.sale_snapshot_digest) != 64
         OR r.sale_snapshot_digest GLOB '*[^0-9a-f]*'
         OR length(r.authorization_receipt_digest) != 64
         OR r.authorization_receipt_digest GLOB '*[^0-9a-f]*'
         OR length(r.authorization_command_digest) != 64
         OR r.authorization_command_digest GLOB '*[^0-9a-f]*'
         OR r.authorized_actor_role != 'owner'
         OR r.authorization_capability != 'shop.sale.reverse'
         OR r.authorization_source != 'managed_membership_receipt_v1'
         OR r.authorization_issued_at_millis <= 0
         OR r.authorization_verified_at_millis < r.authorization_issued_at_millis
         OR r.authorization_expires_at_millis < r.authorization_verified_at_millis
         OR r.authorization_expires_at_millis - r.authorization_issued_at_millis > 600000
         OR (r.original_payment_method = 'cash' AND (
              r.payment_resolution != 'cash_returned_now'
              OR r.shift_id IS NULL
              OR r.cash_drawer_delta_mmk != -r.original_total_mmk
            ))
         OR (r.original_payment_method IN ('kbzpay', 'wavepay') AND (
              r.payment_resolution != 'external_pending'
              OR r.shift_id IS NOT NULL
              OR r.cash_drawer_delta_mmk != 0
            ))
         OR NOT EXISTS (
              SELECT 1 FROM shop_sync_outbox o
              WHERE o.operation_id = r.operation_id
                AND o.event_type = 'shop.sale.reversal_recorded.v1'
            )
      LIMIT 1
    ''').isNotEmpty;
    final invalidLine = connection.select('''
      SELECT 1
      FROM shop_sale_reversal_lines rl
      JOIN shop_sale_reversals r ON r.id = rl.reversal_id
      JOIN shop_sale_lines sl ON sl.id = rl.sale_line_id
      LEFT JOIN shop_stock_movements m ON m.id = rl.stock_movement_id
      WHERE sl.sale_id != r.sale_id
         OR rl.product_id != sl.product_id
         OR rl.product_name != sl.product_name
         OR rl.unit_price_mmk != sl.unit_price_mmk
         OR rl.quantity != sl.quantity
         OR rl.line_total_mmk != sl.line_total_mmk
         OR rl.line_total_mmk != rl.unit_price_mmk * rl.quantity
         OR (r.restock_items = 0 AND (
              rl.restock_quantity != 0 OR rl.stock_movement_id IS NOT NULL
            ))
         OR (r.restock_items = 1 AND (
              rl.restock_quantity != rl.quantity
              OR rl.stock_movement_id IS NULL
              OR m.id IS NULL
              OR m.sale_id != r.sale_id
              OR m.product_id != rl.product_id
              OR m.quantity_delta != rl.quantity
              OR m.reason != 'sale_reversal_restock'
              OR m.created_at_millis != r.created_at_millis
            ))
      LIMIT 1
    ''').isNotEmpty;
    final invalidRestockMovement = connection.select('''
      SELECT 1
      FROM shop_stock_movements m
      WHERE m.reason = 'sale_reversal_restock'
        AND (
          SELECT COUNT(*) FROM shop_sale_reversal_lines rl
          WHERE rl.stock_movement_id = m.id
        ) != 1
      LIMIT 1
    ''').isNotEmpty;
    final missingLine = connection.select('''
      SELECT 1
      FROM shop_sale_reversals r
      JOIN shop_sale_lines sl ON sl.sale_id = r.sale_id
      LEFT JOIN shop_sale_reversal_lines rl
        ON rl.reversal_id = r.id AND rl.sale_line_id = sl.id
      WHERE rl.id IS NULL
      LIMIT 1
    ''').isNotEmpty;
    final duplicateAuditIdentity = connection.select('''
      SELECT 1 FROM (
        SELECT sale_id AS value FROM shop_sale_reversals
        GROUP BY sale_id HAVING COUNT(*) != 1
        UNION ALL
        SELECT authorization_receipt_id AS value FROM shop_sale_reversals
        GROUP BY authorization_receipt_id HAVING COUNT(*) != 1
        UNION ALL
        SELECT reversal_id AS value FROM shop_wallet_reversal_reconciliations
        GROUP BY reversal_id HAVING COUNT(*) != 1
        UNION ALL
        SELECT authorization_receipt_id AS value
        FROM shop_wallet_reversal_reconciliations
        GROUP BY authorization_receipt_id HAVING COUNT(*) != 1
      ) LIMIT 1
    ''').isNotEmpty;
    final reusedAuthorizationReceipt = connection.select('''
      SELECT 1
      FROM shop_sale_reversals r
      JOIN shop_wallet_reversal_reconciliations w
        ON w.authorization_receipt_id = r.authorization_receipt_id
      LIMIT 1
    ''').isNotEmpty;
    final invalidReconciliation = connection.select('''
      SELECT 1
      FROM shop_wallet_reversal_reconciliations w
      JOIN shop_sale_reversals r ON r.id = w.reversal_id
      WHERE r.original_payment_method = 'cash'
         OR length(w.evidence_reference) NOT BETWEEN 1 AND 160
         OR length(w.authorization_receipt_digest) != 64
         OR w.authorization_receipt_digest GLOB '*[^0-9a-f]*'
         OR length(w.authorization_command_digest) != 64
         OR w.authorization_command_digest GLOB '*[^0-9a-f]*'
         OR w.authorized_actor_role != 'owner'
         OR w.authorization_capability != 'shop.sale.reconcile_wallet'
         OR w.authorization_source != 'managed_membership_receipt_v1'
         OR w.authorization_issued_at_millis <= 0
         OR w.authorization_verified_at_millis < w.authorization_issued_at_millis
         OR w.authorization_expires_at_millis < w.authorization_verified_at_millis
         OR w.authorization_expires_at_millis - w.authorization_issued_at_millis > 600000
         OR NOT EXISTS (
              SELECT 1 FROM shop_sync_outbox o
              WHERE o.operation_id = w.operation_id
                AND o.event_type = 'shop.mobile_money.reversal_reconciled.v1'
            )
      LIMIT 1
    ''').isNotEmpty;
    return !invalidReversal &&
        !invalidLine &&
        !missingLine &&
        !invalidRestockMovement &&
        !duplicateAuditIdentity &&
        !reusedAuthorizationReceipt &&
        !invalidReconciliation &&
        _v11DigestsAndEventsValid(connection) &&
        _v11CashShiftsValid(connection);
  }

  static bool _validWalletIntent(Row row) {
    try {
      final operationId = row['operation_id'];
      final paymentMethod = row['payment_method'];
      final requestFingerprint = row['request_fingerprint'];
      final totalMmk = row['total_mmk'];
      final merchantPhone = row['merchant_phone'];
      final merchantQrPayload = row['merchant_qr_payload'];
      final state = row['state'];
      if (operationId is! String ||
          operationId.trim().isEmpty ||
          operationId.length > 120 ||
          !const {'kbzpay', 'wavepay'}.contains(paymentMethod) ||
          requestFingerprint is! String ||
          requestFingerprint.isEmpty ||
          totalMmk is! int ||
          totalMmk < 0 ||
          totalMmk > 200000000000000 ||
          merchantPhone is! String ||
          merchantPhone.length > 40 ||
          merchantQrPayload is! String ||
          !const {'pending', 'completed', 'cancelled'}.contains(state) ||
          row['created_at_millis'] is! int) {
        return false;
      }
      final rawLines = jsonDecode(row['basket_json'] as String);
      if (rawLines is! List || rawLines.isEmpty || rawLines.length > 100) {
        return false;
      }
      final seen = <String>{};
      var calculatedTotal = 0;
      for (final rawLine in rawLines) {
        if (rawLine is! Map<String, dynamic>) return false;
        final line = WalletCheckoutLineSnapshot.fromJson(rawLine);
        if (line.productId.length > 100 ||
            line.productName.length > 160 ||
            line.unitPriceMmk > 2000000000 ||
            line.quantity > 1000 ||
            line.lineTotalMmk > 2000000000000 ||
            !seen.add(line.productId) ||
            calculatedTotal > 200000000000000 - line.lineTotalMmk) {
          return false;
        }
        calculatedTotal += line.lineTotalMmk;
      }
      return calculatedTotal == totalMmk;
    } catch (_) {
      return false;
    }
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
