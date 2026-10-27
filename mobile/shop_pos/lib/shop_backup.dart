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

enum _ShopSnapshotSchemaKind {
  legacy,
  correctionV11,
  profileV11,
  correctionWorkspaceV12,
  profileWorkspaceCollisionV12,
  unifiedV13,
  unifiedV14,
  unifiedV15,
  unifiedV16,
  unifiedV17,
}

enum _SnapshotColumnGroupState { none, partial, exact }

class _SnapshotSchemaObject {
  const _SnapshotSchemaObject({
    required this.type,
    required this.table,
    required this.sql,
  });

  final String type;
  final String table;
  final String sql;
}

/// An offline, password-encrypted export format for a single Shop device.
///
/// This is a storage primitive, not a cloud sync or backup UI. The SQLite
/// snapshot is briefly plaintext in the caller-provided scratch directory,
/// which must be app-private. Call [cleanupInterruptedStaging] before opening
/// the database so an interrupted export or restore cannot retain plaintext.
abstract final class ShopBackup {
  static const formatVersion = 1;
  static const supportedSchemaVersion = 17;
  static const oldestSupportedSchemaVersion = 6;
  static const oldestRuntimeStoreSchemaVersion = 5;
  static const maxSnapshotBytes = 64 * 1024 * 1024;

  static const _saltLength = 16;
  static const _nonceLength = 12;
  static const _macLength = 16;
  static const _headerLength = 4 + 1 + 1 + _saltLength + _nonceLength;
  static const _magic = [0x53, 0x4d, 0x42, 0x4b]; // SMBK
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
  static const _v12RequiredColumns = <String, Set<String>>{
    'shop_managed_workspace_binding': {
      'singleton',
      'workspace_id',
      'discovery_contract',
      'attached_actor_id',
      'attached_at_millis',
    },
  };
  static const _profileRequiredColumns = <String>{
    'singleton_key',
    'schema_id',
    'template_id',
    'template_version',
    'updated_at_millis',
  };
  static const _v14AuthorizationProofColumns = <String>{
    'receipt_id',
    'proof_kind',
    'local_operation_id',
    'receipt_digest',
    'key_id',
    'signature',
    'workspace_id',
    'actor_id',
    'actor_label',
    'actor_role',
    'capability',
    'source',
    'command_digest',
    'issued_at_millis',
    'expires_at_millis',
    'verified_at_millis',
  };
  static const _v15AuthorizationProofColumns = <String>{
    ..._v14AuthorizationProofColumns,
    'finalization_request_id',
    'finalized_at_millis',
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
    ShopCorrectionReceiptVerifier? correctionReceiptVerifier,
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
        await ShopDatabase.migrateAndVerifyRestoreFile(
          stagedFile,
          correctionReceiptVerifier: correctionReceiptVerifier,
        );
        await _requireNoSidecars(stagedFile);
        if (await stagedFile.length() > maxSnapshotBytes) {
          throw StateError(
            'The migrated Shop database exceeds the size limit.',
          );
        }
        final migratedBytes = await stagedFile.readAsBytes();
        // Recheck sidecars immediately before the atomic no-replace link. The
        // link itself closes the target-creation race that rename leaves open.
        await _requireEmptyRestoreDestination(target);
        await marker.writeAsString(_committingMarker, flush: true);
        if (beforePublishForTest != null) await beforePublishForTest();
        _publishVerifiedFileNoReplace(stagedFile, target);
        published = true;
        if (afterPublishForTest != null) await afterPublishForTest();
        await _requireNoSidecars(target);
        if (!await _sameFileBytes(target, migratedBytes)) {
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
    () => _inspectStoreLocked(target, recoverHotJournal: false),
  );

  /// Prepares an installed runtime store for startup under the restore lock.
  ///
  /// A genuine SQLite hot rollback journal is resolved by SQLite itself before
  /// the normal read-only and semantic verification runs. A structurally and
  /// checksum-valid cold journal is preserved and accepted only when its page
  /// metadata matches an intact database. Unknown journals, WAL/SHM state,
  /// links, restore markers, and failed recovery remain closed and are
  /// preserved for support inspection.
  static Future<ShopStorePresence> prepareRuntimeStore(File target) =>
      _withRootLock(
        target.parent,
        () => _inspectStoreLocked(target, recoverHotJournal: true),
      );

  static Future<ShopStorePresence> _inspectStoreLocked(
    File target, {
    required bool recoverHotJournal,
  }) async {
    if (await FileSystemEntity.type(
          restoreMarkerFor(target).path,
          followLinks: false,
        ) !=
        FileSystemEntityType.notFound) {
      return ShopStorePresence.interrupted;
    }
    final type = await FileSystemEntity.type(target.path, followLinks: false);
    if (type == FileSystemEntityType.file) {
      if (!recoverHotJournal) return ShopStorePresence.existing;
      final walType = await FileSystemEntity.type(
        '${target.path}-wal',
        followLinks: false,
      );
      final shmType = await FileSystemEntity.type(
        '${target.path}-shm',
        followLinks: false,
      );
      if (walType != FileSystemEntityType.notFound ||
          shmType != FileSystemEntityType.notFound) {
        return ShopStorePresence.unsafe;
      }
      final journal = File('${target.path}-journal');
      final journalType = await FileSystemEntity.type(
        journal.path,
        followLinks: false,
      );
      if (journalType == FileSystemEntityType.notFound) {
        return ShopStorePresence.existing;
      }
      if (journalType != FileSystemEntityType.file) {
        return ShopStorePresence.unsafe;
      }
      if (!await _looksLikeHotRollbackJournal(journal)) {
        if (!await _looksLikeColdRollbackJournal(journal, target)) {
          return ShopStorePresence.unsafe;
        }
        return ShopStorePresence.existing;
      }
      Database? recovery;
      try {
        recovery = sqlite3.open(target.path, mode: OpenMode.readWrite);
        recovery.select('SELECT COUNT(*) FROM sqlite_master');
      } catch (_) {
        return ShopStorePresence.unsafe;
      } finally {
        recovery?.close();
      }
      if (await FileSystemEntity.type(target.path, followLinks: false) !=
              FileSystemEntityType.file ||
          await _hasSidecars(target)) {
        return ShopStorePresence.unsafe;
      }
      return ShopStorePresence.existing;
    }
    if (type != FileSystemEntityType.notFound || await _hasSidecars(target)) {
      return ShopStorePresence.unsafe;
    }
    return ShopStorePresence.empty;
  }

  static Future<bool> _looksLikeHotRollbackJournal(File journal) async {
    const sqliteJournalMagic = <int>[
      0xd9,
      0xd5,
      0x05,
      0xf9,
      0x20,
      0xa1,
      0x63,
      0xd7,
    ];
    final length = await journal.length();
    if (length <= 512) return false;
    final handle = await journal.open(mode: FileMode.read);
    late Uint8List header;
    try {
      header = await handle.read(28);
    } finally {
      await handle.close();
    }
    if (header.length != 28) return false;
    for (var index = 0; index < sqliteJournalMagic.length; index++) {
      if (header[index] != sqliteJournalMagic[index]) return false;
    }
    final fields = ByteData.sublistView(header);
    final recordCount = fields.getUint32(8, Endian.big);
    final initialPageCount = fields.getUint32(16, Endian.big);
    final sectorSize = fields.getUint32(20, Endian.big);
    final encodedPageSize = fields.getUint32(24, Endian.big);
    final pageSize = encodedPageSize == 1 ? 65536 : encodedPageSize;
    final sectorValid =
        sectorSize >= 512 &&
        sectorSize <= 65536 &&
        (sectorSize & (sectorSize - 1)) == 0;
    final pageValid =
        pageSize >= 512 &&
        pageSize <= 65536 &&
        (pageSize & (pageSize - 1)) == 0;
    if (recordCount == 0 ||
        initialPageCount == 0 ||
        !sectorValid ||
        !pageValid ||
        length < sectorSize + pageSize + 4) {
      return false;
    }
    if (recordCount != 0xffffffff) {
      final requiredBytes = sectorSize + recordCount * (pageSize + 4);
      if (requiredBytes > length) return false;
    }
    return true;
  }

  static Future<bool> _looksLikeColdRollbackJournal(
    File journal,
    File target,
  ) async {
    final length = await journal.length();
    if (length <= 512) return false;
    final handle = await journal.open(mode: FileMode.read);
    try {
      final header = await handle.read(28);
      if (header.length != 28 || header.take(8).any((byte) => byte != 0)) {
        return false;
      }
      final fields = ByteData.sublistView(header);
      final recordCount = fields.getUint32(8, Endian.big);
      final nonce = fields.getUint32(12, Endian.big);
      final initialPageCount = fields.getUint32(16, Endian.big);
      final sectorSize = fields.getUint32(20, Endian.big);
      final encodedPageSize = fields.getUint32(24, Endian.big);
      final pageSize = encodedPageSize == 1 ? 65536 : encodedPageSize;
      final sectorValid =
          sectorSize >= 512 &&
          sectorSize <= 65536 &&
          (sectorSize & (sectorSize - 1)) == 0;
      final pageValid =
          pageSize >= 512 &&
          pageSize <= 65536 &&
          (pageSize & (pageSize - 1)) == 0;
      final recordSize = pageSize + 8;
      if (recordCount != 0 ||
          initialPageCount == 0 ||
          !sectorValid ||
          !pageValid ||
          length < sectorSize + recordSize ||
          length > sectorSize + initialPageCount * recordSize ||
          (length - sectorSize) % recordSize != 0) {
        return false;
      }

      final seenPages = <int>{};
      final databaseHandle = await target.open(mode: FileMode.read);
      var offset = sectorSize;
      try {
        while (offset < length) {
          await handle.setPosition(offset);
          final encodedPageNumber = await handle.read(4);
          final page = await handle.read(pageSize);
          final encodedChecksum = await handle.read(4);
          if (encodedPageNumber.length != 4 ||
              page.length != pageSize ||
              encodedChecksum.length != 4) {
            return false;
          }
          final pageNumber = ByteData.sublistView(encodedPageNumber)
              .getUint32(0, Endian.big);
          if (pageNumber == 0 ||
              pageNumber > initialPageCount ||
              !seenPages.add(pageNumber)) {
            return false;
          }
          var checksum = nonce;
          for (var index = pageSize - 200; index > 0; index -= 200) {
            checksum = (checksum + page[index]) & 0xffffffff;
          }
          if (ByteData.sublistView(encodedChecksum).getUint32(0, Endian.big) !=
              checksum) {
            return false;
          }
          await databaseHandle.setPosition((pageNumber - 1) * pageSize);
          final committedPage = await databaseHandle.read(pageSize);
          if (committedPage.length != pageSize) return false;
          for (var index = 0; index < pageSize; index++) {
            if (committedPage[index] != page[index]) return false;
          }
          offset += recordSize;
        }
      } finally {
        await databaseHandle.close();
      }

      Database? database;
      try {
        database = sqlite3.open(target.path, mode: OpenMode.readOnly);
        final databasePageSize =
            database.select('PRAGMA page_size').single.values.single as int;
        final databasePageCount =
            database.select('PRAGMA page_count').single.values.single as int;
        final integrity = database
            .select('PRAGMA integrity_check')
            .single
            .values
            .single;
        return databasePageSize == pageSize &&
            databasePageCount == initialPageCount &&
            integrity == 'ok';
      } catch (_) {
        return false;
      } finally {
        database?.close();
      }
    } finally {
      await handle.close();
    }
  }

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
  ///
  /// Backup/export callers keep the strict default. Startup may opt into
  /// legacy unbound correction history only so a known v11/v12 origin or an
  /// exact unified provenance marker can be validated before the first DDL.
  static void verifySnapshot(
    File file, {
    int? expectedSchemaVersion,
    bool allowRuntimeUnboundCorrectionHistory = false,
  }) => _verifySnapshot(
    file,
    minimumSchemaVersion: oldestSupportedSchemaVersion,
    expectedSchemaVersion: expectedSchemaVersion,
    allowRuntimeUnboundCorrectionHistory: allowRuntimeUnboundCorrectionHistory,
  );

  /// Verifies an already-installed Shop store before Drift may migrate it.
  ///
  /// Runtime stores retain one older migration origin than portable backups.
  /// This does not relax the encrypted backup/import contract.
  static void verifyRuntimeStore(File file) => _verifySnapshot(
    file,
    minimumSchemaVersion: oldestRuntimeStoreSchemaVersion,
    allowRuntimeUnboundCorrectionHistory: true,
  );

  static void _verifySnapshot(
    File file, {
    required int minimumSchemaVersion,
    int? expectedSchemaVersion,
    required bool allowRuntimeUnboundCorrectionHistory,
  }) {
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
      final schemaKind = _classifySnapshotSchema(
        connection,
        schemaVersion,
        minimumSchemaVersion: minimumSchemaVersion,
        allowRuntimeUnboundCorrectionHistory:
            allowRuntimeUnboundCorrectionHistory,
      );
      final hasCorrectionSchema =
          schemaKind == _ShopSnapshotSchemaKind.correctionV11 ||
          schemaKind == _ShopSnapshotSchemaKind.correctionWorkspaceV12 ||
          schemaKind == _ShopSnapshotSchemaKind.unifiedV13 ||
          schemaKind == _ShopSnapshotSchemaKind.unifiedV14 ||
          schemaKind == _ShopSnapshotSchemaKind.unifiedV15 ||
          schemaKind == _ShopSnapshotSchemaKind.unifiedV16 ||
          schemaKind == _ShopSnapshotSchemaKind.unifiedV17;
      final hasWorkspaceSchema =
          schemaKind == _ShopSnapshotSchemaKind.correctionWorkspaceV12 ||
          schemaKind == _ShopSnapshotSchemaKind.profileWorkspaceCollisionV12 ||
          schemaKind == _ShopSnapshotSchemaKind.unifiedV13 ||
          schemaKind == _ShopSnapshotSchemaKind.unifiedV14 ||
          schemaKind == _ShopSnapshotSchemaKind.unifiedV15 ||
          schemaKind == _ShopSnapshotSchemaKind.unifiedV16 ||
          schemaKind == _ShopSnapshotSchemaKind.unifiedV17;
      final hasProfileSchema =
          schemaKind == _ShopSnapshotSchemaKind.profileV11 ||
          schemaKind == _ShopSnapshotSchemaKind.profileWorkspaceCollisionV12 ||
          schemaKind == _ShopSnapshotSchemaKind.unifiedV13 ||
          schemaKind == _ShopSnapshotSchemaKind.unifiedV14 ||
          schemaKind == _ShopSnapshotSchemaKind.unifiedV15 ||
          schemaKind == _ShopSnapshotSchemaKind.unifiedV16 ||
          schemaKind == _ShopSnapshotSchemaKind.unifiedV17;
      final hasAuthorizationProofSchema =
          schemaKind == _ShopSnapshotSchemaKind.unifiedV14 ||
          schemaKind == _ShopSnapshotSchemaKind.unifiedV15 ||
          schemaKind == _ShopSnapshotSchemaKind.unifiedV16 ||
          schemaKind == _ShopSnapshotSchemaKind.unifiedV17;
      final hasMemberSchema =
          schemaKind == _ShopSnapshotSchemaKind.unifiedV16 ||
          schemaKind == _ShopSnapshotSchemaKind.unifiedV17;
      final hasConsumptionSchema =
          schemaKind == _ShopSnapshotSchemaKind.unifiedV17;
      final objects = _readSnapshotSchemaObjects(connection);
      final baseSchemaValid =
          objects != null &&
          _snapshotBaseSchemaExact(connection, schemaVersion, objects);
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
          (!hasCorrectionSchema ||
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
                  _v11CashShiftColumnDefinitionsValid(connection))) &&
          (!hasWorkspaceSchema ||
              _v12RequiredColumns.entries.every(
                (entry) =>
                    tables.contains(entry.key) &&
                    _tableHasColumns(connection, entry.key, entry.value),
              )) &&
          (!hasProfileSchema ||
              (tables.contains('shop_business_profile') &&
                  _tableHasColumns(
                    connection,
                    'shop_business_profile',
                    _profileRequiredColumns,
                  ))) &&
          (!hasAuthorizationProofSchema ||
              (tables.contains('shop_correction_authorization_proofs') &&
                  _tableHasColumns(
                    connection,
                    'shop_correction_authorization_proofs',
                    schemaVersion >= 15
                        ? _v15AuthorizationProofColumns
                        : _v14AuthorizationProofColumns,
                  ))) &&
          (!hasMemberSchema || _v16MemberRowsValid(connection)) &&
          (!hasConsumptionSchema || _v17CorrectionRowsValid(connection));
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
          hasCorrectionSchema &&
          (!schemaValid ||
              !_v11ReversalAuditValid(
                connection,
                hasAuthorizationProofs: hasAuthorizationProofSchema,
              ) ||
              !_correctionDefinitionsValid(connection));
      final authorizationProofInvalid =
          hasAuthorizationProofSchema &&
          (!schemaValid || !_v14AuthorizationProofsValid(connection));
      final workspaceBindingInvalid =
          hasWorkspaceSchema &&
          (!schemaValid ||
              (schemaKind ==
                      _ShopSnapshotSchemaKind.profileWorkspaceCollisionV12
                  ? !_collisionWorkspaceBindingValid(connection)
                  : !_v12WorkspaceBindingValid(
                      connection,
                      allowUnboundHistory: allowRuntimeUnboundCorrectionHistory,
                    )));
      final profileInvalid =
          hasProfileSchema &&
          (!schemaValid || !_businessProfileRowsValid(connection));
      if (version.length != 1 ||
          schemaVersion < minimumSchemaVersion ||
          schemaVersion > supportedSchemaVersion ||
          (expectedSchemaVersion != null &&
              schemaVersion != expectedSchemaVersion) ||
          integrity.length != 1 ||
          integrity.single['integrity_check'] != 'ok' ||
          brokenReferences.isNotEmpty ||
          schemaKind == null ||
          !schemaValid ||
          walletInvalid ||
          (schemaVersion >= 7 && !tables.contains('shop_product_images')) ||
          (schemaVersion >= 8 && !tables.contains('shop_counter_drafts')) ||
          (schemaVersion >= 9 && !hasReorderLevel) ||
          (schemaVersion >= 10 && !tables.contains('shop_held_sales')) ||
          reversalAuditInvalid ||
          authorizationProofInvalid ||
          workspaceBindingInvalid ||
          profileInvalid ||
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

  static bool _tableHasExactBaseColumns(
    Database connection,
    String table,
    Set<String> expected,
  ) {
    final columns = connection
        .select('PRAGMA table_info($table)')
        .map((row) => row['name'])
        .whereType<String>()
        .map((name) => name.toLowerCase())
        .toSet();
    if (table == 'shop_cash_shifts') {
      columns.removeAll(_v11CashShiftColumns);
    }
    return columns.length == expected.length && columns.containsAll(expected);
  }

  static bool _v11CashShiftColumnDefinitionsValid(Database connection) {
    final columns = <String, Row>{
      for (final row in connection.select(
        'PRAGMA table_info(shop_cash_shifts)',
      ))
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

  static Map<String, String> get _v11SchemaDefinitions =>
      shopReversalSchemaDefinitionsV11();

  static Map<String, String> get _v12SchemaDefinitions =>
      shopWorkspaceSchemaDefinitionsV12();

  static Map<String, String> get _v14AuthorizationProofDefinitions =>
      shopAuthorizationProofSchemaDefinitionsV14();

  static Map<String, String> get _v15AuthorizationProofDefinitions =>
      shopAuthorizationProofSchemaDefinitionsV15();

  static Map<String, String> get _v16MemberDefinitions =>
      shopMemberSchemaDefinitionsV16();

  static Map<String, String> get _v17CorrectionDefinitions =>
      shopCorrectionConsumptionSchemaDefinitionsV17();

  static _ShopSnapshotSchemaKind? _classifySnapshotSchema(
    Database connection,
    int schemaVersion, {
    required int minimumSchemaVersion,
    required bool allowRuntimeUnboundCorrectionHistory,
  }) {
    if (schemaVersion < minimumSchemaVersion ||
        schemaVersion > supportedSchemaVersion) {
      return null;
    }
    final objects = _readSnapshotSchemaObjects(connection);
    if (objects == null ||
        objects.values.any((object) => object.type == 'view')) {
      return null;
    }
    if (!_snapshotBaseSchemaExact(connection, schemaVersion, objects)) {
      return null;
    }
    final auditDefinitions = _v11SchemaDefinitions;
    final workspaceDefinitions = _v12SchemaDefinitions;
    final proofDefinitions = schemaVersion >= 15
        ? _v15AuthorizationProofDefinitions
        : _v14AuthorizationProofDefinitions;
    final memberDefinitions = _v16MemberDefinitions;
    final consumptionDefinitions = _v17CorrectionDefinitions;
    final collisionDefinitions = shopWorkspaceCollisionPrefixDefinitionsV12();
    final auditNames = auditDefinitions.keys.toSet();
    final workspaceNames = workspaceDefinitions.keys.toSet();
    final proofNames = proofDefinitions.keys.toSet();
    final memberNames = memberDefinitions.keys.toSet();
    final consumptionNames = consumptionDefinitions.keys.toSet();
    const profileNames = {'shop_business_profile'};
    final presentNames = objects.keys.toSet();
    final cashState = _reversalCashColumnState(connection);
    final hasAnyAudit =
        presentNames.intersection(auditNames).isNotEmpty ||
        cashState != _SnapshotColumnGroupState.none;
    final hasAnyWorkspace = presentNames
        .intersection(workspaceNames)
        .isNotEmpty;
    final hasAnyProof = presentNames.intersection(proofNames).isNotEmpty;
    final hasProfile = presentNames.intersection(profileNames).isNotEmpty;
    final auditExact =
        cashState == _SnapshotColumnGroupState.exact &&
        _snapshotDefinitionGroupExact(objects, auditDefinitions, auditNames);
    final workspaceExact = _snapshotDefinitionGroupExact(
      objects,
      workspaceDefinitions,
      workspaceNames,
    );
    final collisionWorkspaceExact = _snapshotDefinitionGroupExact(
      objects,
      collisionDefinitions,
      workspaceNames,
    );
    final proofExact = _snapshotDefinitionGroupExact(
      objects,
      proofDefinitions,
      proofNames,
    );
    final memberExact = _snapshotDefinitionGroupExact(
      objects,
      memberDefinitions,
      memberNames,
    );
    final consumptionExact = _snapshotDefinitionGroupExact(
      objects,
      consumptionDefinitions,
      consumptionNames,
    );
    final profileExact =
        _snapshotDefinitionGroupExact(objects, const {
          'shop_business_profile': shopBusinessProfileV11Sql,
        }, profileNames) &&
        _businessProfileRowsValid(connection);

    bool triggersMatch(Iterable<Map<String, String>> groups) {
      final expected = <String>{
        for (final group in groups)
          for (final entry in group.entries)
            if (!canonicalShopSchemaSql(entry.value).startsWith('create table'))
              entry.key,
      };
      final actual = objects.entries
          .where((entry) => entry.value.type == 'trigger')
          .map((entry) => entry.key)
          .toSet();
      return actual.length == expected.length && actual.containsAll(expected);
    }

    if (schemaVersion < 11 &&
        !hasAnyAudit &&
        !hasAnyWorkspace &&
        !hasAnyProof &&
        !hasProfile &&
        triggersMatch(const []) &&
        _snapshotObjectNamesExact(
          objects,
          _snapshotExpectedBaseObjectNames(schemaVersion),
        )) {
      return _ShopSnapshotSchemaKind.legacy;
    }
    if (schemaVersion == 11) {
      if (auditExact &&
          !hasAnyWorkspace &&
          !hasAnyProof &&
          !hasProfile &&
          triggersMatch([auditDefinitions]) &&
          _snapshotObjectNamesExact(objects, {
            ..._snapshotExpectedBaseObjectNames(schemaVersion),
            ...auditDefinitions.keys,
          })) {
        return _ShopSnapshotSchemaKind.correctionV11;
      }
      if (profileExact &&
          !hasAnyAudit &&
          !hasAnyWorkspace &&
          !hasAnyProof &&
          triggersMatch(const []) &&
          _snapshotObjectNamesExact(objects, {
            ..._snapshotExpectedBaseObjectNames(schemaVersion),
            'shop_business_profile',
          })) {
        return _ShopSnapshotSchemaKind.profileV11;
      }
    }
    if (schemaVersion == 12) {
      if (auditExact &&
          workspaceExact &&
          !hasAnyProof &&
          !hasProfile &&
          triggersMatch([auditDefinitions, workspaceDefinitions]) &&
          _snapshotObjectNamesExact(objects, {
            ..._snapshotExpectedBaseObjectNames(schemaVersion),
            ...auditDefinitions.keys,
            ...workspaceDefinitions.keys,
          })) {
        return _ShopSnapshotSchemaKind.correctionWorkspaceV12;
      }
      if (profileExact &&
          !hasAnyAudit &&
          collisionWorkspaceExact &&
          !hasAnyProof &&
          _collisionWorkspaceBindingValid(connection) &&
          triggersMatch([collisionDefinitions]) &&
          _snapshotObjectNamesExact(objects, {
            ..._snapshotExpectedBaseObjectNames(schemaVersion),
            ...collisionDefinitions.keys,
            'shop_business_profile',
          })) {
        return _ShopSnapshotSchemaKind.profileWorkspaceCollisionV12;
      }
    }
    if (schemaVersion == 13 &&
        auditExact &&
        workspaceExact &&
        profileExact &&
        _snapshotDefinitionGroupExact(
          objects,
          const {
            'shop_v13_migration_provenance': shopMigrationProvenanceV13Sql,
          },
          const {'shop_v13_migration_provenance'},
        ) &&
        _migrationProvenanceValid(
          connection,
          allowRuntimeUnboundCorrectionHistory:
              allowRuntimeUnboundCorrectionHistory,
          hasAuthorizationProofs: false,
        ) &&
        !hasAnyProof &&
        triggersMatch([auditDefinitions, workspaceDefinitions]) &&
        _snapshotObjectNamesExact(objects, {
          ..._snapshotExpectedBaseObjectNames(schemaVersion),
          ...auditDefinitions.keys,
          ...workspaceDefinitions.keys,
          'shop_business_profile',
          'shop_v13_migration_provenance',
        })) {
      return _ShopSnapshotSchemaKind.unifiedV13;
    }
    if (schemaVersion == 14 &&
        auditExact &&
        workspaceExact &&
        profileExact &&
        proofExact &&
        _snapshotDefinitionGroupExact(
          objects,
          const {
            'shop_v13_migration_provenance': shopMigrationProvenanceV13Sql,
          },
          const {'shop_v13_migration_provenance'},
        ) &&
        _migrationProvenanceValid(
          connection,
          allowRuntimeUnboundCorrectionHistory:
              allowRuntimeUnboundCorrectionHistory,
          hasAuthorizationProofs: true,
        ) &&
        triggersMatch([
          auditDefinitions,
          workspaceDefinitions,
          proofDefinitions,
        ]) &&
        _snapshotObjectNamesExact(objects, {
          ..._snapshotExpectedBaseObjectNames(schemaVersion),
          ...auditDefinitions.keys,
          ...workspaceDefinitions.keys,
          ...proofDefinitions.keys,
          'shop_business_profile',
          'shop_v13_migration_provenance',
        })) {
      return _ShopSnapshotSchemaKind.unifiedV14;
    }
    if (schemaVersion == 15 &&
        auditExact &&
        workspaceExact &&
        profileExact &&
        proofExact &&
        _snapshotDefinitionGroupExact(
          objects,
          const {
            'shop_v13_migration_provenance': shopMigrationProvenanceV13Sql,
          },
          const {'shop_v13_migration_provenance'},
        ) &&
        _migrationProvenanceValid(
          connection,
          allowRuntimeUnboundCorrectionHistory:
              allowRuntimeUnboundCorrectionHistory,
          hasAuthorizationProofs: true,
        ) &&
        triggersMatch([
          auditDefinitions,
          workspaceDefinitions,
          proofDefinitions,
        ]) &&
        _snapshotObjectNamesExact(objects, {
          ..._snapshotExpectedBaseObjectNames(schemaVersion),
          ...auditDefinitions.keys,
          ...workspaceDefinitions.keys,
          ...proofDefinitions.keys,
          'shop_business_profile',
          'shop_v13_migration_provenance',
        })) {
      return _ShopSnapshotSchemaKind.unifiedV15;
    }
    if (schemaVersion == 16 &&
        auditExact &&
        workspaceExact &&
        profileExact &&
        proofExact &&
        memberExact &&
        _v16MemberRowsValid(connection) &&
        _snapshotDefinitionGroupExact(
          objects,
          const {
            'shop_v13_migration_provenance': shopMigrationProvenanceV13Sql,
          },
          const {'shop_v13_migration_provenance'},
        ) &&
        _migrationProvenanceValid(
          connection,
          allowRuntimeUnboundCorrectionHistory:
              allowRuntimeUnboundCorrectionHistory,
          hasAuthorizationProofs: true,
        ) &&
        triggersMatch([
          auditDefinitions,
          workspaceDefinitions,
          proofDefinitions,
          memberDefinitions,
        ]) &&
        _snapshotObjectNamesExact(objects, {
          ..._snapshotExpectedBaseObjectNames(schemaVersion),
          ...auditDefinitions.keys,
          ...workspaceDefinitions.keys,
          ...proofDefinitions.keys,
          ...memberDefinitions.keys,
          'shop_business_profile',
          'shop_v13_migration_provenance',
        })) {
      return _ShopSnapshotSchemaKind.unifiedV16;
    }
    if (schemaVersion == 17 &&
        auditExact &&
        workspaceExact &&
        profileExact &&
        proofExact &&
        memberExact &&
        consumptionExact &&
        _v16MemberRowsValid(connection) &&
        _v17CorrectionRowsValid(connection) &&
        _snapshotDefinitionGroupExact(
          objects,
          const {
            'shop_v13_migration_provenance': shopMigrationProvenanceV13Sql,
          },
          const {'shop_v13_migration_provenance'},
        ) &&
        _migrationProvenanceValid(
          connection,
          allowRuntimeUnboundCorrectionHistory:
              allowRuntimeUnboundCorrectionHistory,
          hasAuthorizationProofs: true,
        ) &&
        triggersMatch([
          auditDefinitions,
          workspaceDefinitions,
          proofDefinitions,
          memberDefinitions,
          consumptionDefinitions,
        ]) &&
        _snapshotObjectNamesExact(objects, {
          ..._snapshotExpectedBaseObjectNames(schemaVersion),
          ...auditDefinitions.keys,
          ...workspaceDefinitions.keys,
          ...proofDefinitions.keys,
          ...memberDefinitions.keys,
          ...consumptionDefinitions.keys,
          'shop_business_profile',
          'shop_v13_migration_provenance',
        })) {
      return _ShopSnapshotSchemaKind.unifiedV17;
    }
    return null;
  }

  static Map<String, _SnapshotSchemaObject>? _readSnapshotSchemaObjects(
    Database connection,
  ) {
    final objects = <String, _SnapshotSchemaObject>{};
    for (final row in connection.select(
      "SELECT type, name, tbl_name, sql FROM sqlite_master "
      "WHERE name NOT LIKE 'sqlite_%' "
      "AND type IN ('table', 'trigger', 'view', 'index')",
    )) {
      final type = row['type'];
      final name = row['name'];
      final table = row['tbl_name'];
      final sql = row['sql'];
      if (type is! String ||
          name is! String ||
          table is! String ||
          sql is! String) {
        return null;
      }
      final lowerName = name.toLowerCase();
      if (objects.containsKey(lowerName)) return null;
      objects[lowerName] = _SnapshotSchemaObject(
        type: type.toLowerCase(),
        table: table.toLowerCase(),
        sql: sql,
      );
    }
    return objects;
  }

  static bool _snapshotDefinitionGroupExact(
    Map<String, _SnapshotSchemaObject> objects,
    Map<String, String> expected,
    Set<String> reservedNames,
  ) {
    final present = objects.keys.toSet().intersection(reservedNames);
    if (present.length != expected.length ||
        !present.containsAll(expected.keys)) {
      return false;
    }
    for (final entry in expected.entries) {
      final object = objects[entry.key];
      final expectedSql = canonicalShopSchemaSql(entry.value);
      final expectedType = shopSchemaObjectTypeForDefinition(entry.value);
      if (object == null ||
          object.type != expectedType ||
          canonicalShopSchemaSql(object.sql) != expectedSql) {
        return false;
      }
      if (expectedType == 'trigger' || expectedType == 'index') {
        final target = RegExp(r'\bon\s+([a-z0-9_]+)').firstMatch(expectedSql);
        if (target == null || object.table != target.group(1)) return false;
      }
    }
    return true;
  }

  static Set<String> _snapshotExpectedBaseObjectNames(int schemaVersion) => {
    ...shopBaseTableColumnsForVersion(schemaVersion).keys,
    ...shopCriticalIndexDefinitions(schemaVersion).keys,
  };

  static bool _snapshotObjectNamesExact(
    Map<String, _SnapshotSchemaObject> objects,
    Set<String> expected,
  ) =>
      objects.length == expected.length &&
      objects.keys.toSet().containsAll(expected);

  static bool _snapshotBaseSchemaExact(
    Database connection,
    int schemaVersion,
    Map<String, _SnapshotSchemaObject> objects,
  ) {
    final columns = shopBaseTableColumnsForVersion(schemaVersion);
    if (columns.isEmpty) return false;
    for (final entry in columns.entries) {
      if (objects[entry.key]?.type != 'table' ||
          !_tableHasExactBaseColumns(connection, entry.key, entry.value)) {
        return false;
      }
    }
    final indexes = shopCriticalIndexDefinitions(schemaVersion);
    return _snapshotDefinitionGroupExact(
      objects,
      indexes,
      indexes.keys.toSet(),
    );
  }

  static _SnapshotColumnGroupState _reversalCashColumnState(
    Database connection,
  ) {
    const ordered = [
      'cash_reversal_count',
      'cash_reversal_total_mmk',
      'cash_drawer_outflow_mmk',
      'review_cash_reversal_count',
      'review_cash_drawer_outflow_mmk',
    ];
    final rows = connection.select('PRAGMA table_info(shop_cash_shifts)');
    final byName = <String, Row>{
      for (final row in rows)
        if (row['name'] is String) (row['name'] as String).toLowerCase(): row,
    };
    final present = ordered.where(byName.containsKey).toList(growable: false);
    if (present.isEmpty) return _SnapshotColumnGroupState.none;
    if (present.length != ordered.length) {
      return _SnapshotColumnGroupState.partial;
    }
    final names = rows
        .map((row) => row['name'])
        .whereType<String>()
        .map((name) => name.toLowerCase())
        .toList(growable: false);
    if (names.length < ordered.length ||
        !_sameOrderedStrings(
          names.sublist(names.length - ordered.length),
          ordered,
        )) {
      return _SnapshotColumnGroupState.partial;
    }
    for (final name in ordered) {
      final row = byName[name]!;
      if ((row['type'] as String?)?.toUpperCase() != 'INTEGER' ||
          row['notnull'] != 0 ||
          row['dflt_value'] != null ||
          row['pk'] != 0) {
        return _SnapshotColumnGroupState.partial;
      }
    }
    return _SnapshotColumnGroupState.exact;
  }

  static bool _sameOrderedStrings(List<String> actual, List<String> expected) {
    if (actual.length != expected.length) return false;
    for (var index = 0; index < actual.length; index++) {
      if (actual[index] != expected[index]) return false;
    }
    return true;
  }

  static bool _businessProfileRowsValid(Database connection) {
    try {
      final rows = connection.select(
        'SELECT singleton_key, schema_id, template_id, template_version, '
        'updated_at_millis FROM shop_business_profile',
      );
      if (rows.length > 1) return false;
      if (rows.isEmpty) return true;
      const templates = {
        'mini-mart',
        'cafe-takeaway',
        'fashion-accessories',
        'beauty-household',
        'custom',
      };
      final row = rows.single;
      final updatedAt = row['updated_at_millis'];
      return row['singleton_key'] == 1 &&
          row['schema_id'] == 'supermega.shop.business_profile.v1' &&
          templates.contains(row['template_id']) &&
          row['template_version'] == 1 &&
          updatedAt is int &&
          updatedAt >= 0;
    } on Object {
      return false;
    }
  }

  static bool _v16MemberRowsValid(Database connection) {
    try {
      final stores = connection.select(
        'SELECT singleton, store_ref, created_at_millis '
        'FROM shop_store_identity',
      );
      if (stores.length != 1) return false;
      final storeRef = stores.single['store_ref'];
      if (stores.single['singleton'] != 1 ||
          storeRef is! String ||
          !RegExp(r'^[0-9a-f]{64}$').hasMatch(storeRef) ||
          stores.single['created_at_millis'] is! int ||
          (stores.single['created_at_millis'] as int) <= 0) {
        return false;
      }
      if (connection.select(
        'SELECT 1 FROM shop_members WHERE store_ref != ? '
        "OR id NOT GLOB 'mem_[0-9a-f]*' OR length(id) != 36 "
        "OR display_code GLOB '*[^0-9]*' "
        'OR length(display_code) < 6 OR length(display_code) > 20 '
        "OR status NOT IN ('active', 'revoked') "
        'OR created_at_millis <= 0 OR updated_at_millis < created_at_millis '
        'LIMIT 1',
        [storeRef],
      ).isNotEmpty) {
        return false;
      }
      if (connection
          .select(
            'SELECT 1 FROM shop_member_cards AS card '
            'LEFT JOIN shop_members AS member ON member.id = card.member_id '
            'WHERE member.id IS NULL OR length(card.token_digest) != 64 '
            "OR card.token_digest GLOB '*[^0-9a-f]*' "
            'OR card.revision < 1 OR card.issued_at_millis <= 0 '
            "OR card.state NOT IN ('active', 'retired', 'revoked') "
            "OR (card.state = 'active' AND card.retired_at_millis IS NOT NULL) "
            "OR (card.state != 'active' AND card.retired_at_millis IS NULL) "
            "OR (card.state = 'active' AND member.status != 'active') "
            "OR (card.state = 'active' AND card.revision != (SELECT MAX(latest.revision) "
            'FROM shop_member_cards AS latest '
            'WHERE latest.member_id = card.member_id) '
            ') '
            'LIMIT 1',
          )
          .isNotEmpty) {
        return false;
      }
      if (connection
          .select(
            "SELECT 1 FROM shop_products WHERE upper(COALESCE(barcode, '')) LIKE 'SMC1.%' "
            "OR upper(COALESCE(sku, '')) LIKE 'SMC1.%' LIMIT 1",
          )
          .isNotEmpty) {
        return false;
      }
      if (connection
          .select(
            "SELECT 1 FROM shop_member_cards WHERE state = 'active' "
            'GROUP BY member_id HAVING COUNT(*) > 1 LIMIT 1',
          )
          .isNotEmpty) {
        return false;
      }
      if (connection
          .select(
            'SELECT 1 FROM shop_member_cards AS card '
            'WHERE card.revision != (SELECT COUNT(*) '
            'FROM shop_member_cards AS prior '
            'WHERE prior.member_id = card.member_id '
            'AND prior.revision <= card.revision) '
            'OR EXISTS (SELECT 1 FROM shop_member_cards AS earlier '
            'WHERE earlier.member_id = card.member_id '
            'AND earlier.revision < card.revision '
            'AND earlier.issued_at_millis >= card.issued_at_millis) '
            'LIMIT 1',
          )
          .isNotEmpty) {
        return false;
      }
      if (connection
          .select(
            'SELECT 1 FROM shop_sale_member_links AS link '
            'LEFT JOIN shop_sales AS sale ON sale.id = link.sale_id '
            'LEFT JOIN shop_sync_outbox AS event '
            'ON event.operation_id = sale.operation_id '
            'LEFT JOIN shop_members AS member ON member.id = link.member_id '
            'LEFT JOIN shop_member_cards AS card '
            'ON card.member_id = link.member_id '
            'AND card.revision = link.card_revision '
            'WHERE sale.id IS NULL OR member.id IS NULL OR card.member_id IS NULL '
            'OR member.display_code != link.display_code '
            'OR link.associated_at_millis != sale.created_at_millis '
            "OR json_extract(sale.request_fingerprint, '\$.memberId') IS NOT link.member_id "
            "OR json_extract(sale.request_fingerprint, '\$.memberCardRevision') IS NOT link.card_revision "
            'OR event.operation_id IS NULL '
            "OR json_extract(event.payload_json, '\$.memberId') IS NOT link.member_id "
            "OR json_extract(event.payload_json, '\$.memberCardRevision') IS NOT link.card_revision "
            "OR (sale.payment_method != 'cash' AND NOT EXISTS ("
            'SELECT 1 FROM shop_wallet_checkout_member_links AS wallet_link '
            'WHERE wallet_link.operation_id = sale.operation_id '
            'AND wallet_link.member_id = link.member_id '
            'AND wallet_link.card_revision = link.card_revision '
            'AND wallet_link.display_code = link.display_code)) '
            'LIMIT 1',
          )
          .isNotEmpty) {
        return false;
      }
      if (connection
          .select(
            'SELECT 1 FROM shop_sales AS sale '
            'LEFT JOIN shop_sync_outbox AS event '
            'ON event.operation_id = sale.operation_id '
            'LEFT JOIN shop_sale_member_links AS link ON link.sale_id = sale.id '
            'WHERE link.sale_id IS NULL AND ('
            "(json_valid(sale.request_fingerprint) AND ("
            "json_type(sale.request_fingerprint, '\$.memberId') IS NOT NULL "
            "OR json_type(sale.request_fingerprint, '\$.memberCardRevision') IS NOT NULL)) "
            "OR (json_valid(event.payload_json) AND ("
            "json_type(event.payload_json, '\$.memberId') IS NOT NULL "
            "OR json_type(event.payload_json, '\$.memberCardRevision') IS NOT NULL))) "
            'LIMIT 1',
          )
          .isNotEmpty) {
        return false;
      }
      if (connection
          .select(
            'SELECT 1 FROM shop_wallet_checkout_member_links AS link '
            'LEFT JOIN shop_wallet_checkout_intents AS intent '
            'ON intent.operation_id = link.operation_id '
            'LEFT JOIN shop_members AS member ON member.id = link.member_id '
            'LEFT JOIN shop_member_cards AS card '
            'ON card.member_id = link.member_id '
            'AND card.revision = link.card_revision '
            'WHERE intent.operation_id IS NULL OR member.id IS NULL '
            'OR card.member_id IS NULL '
            'OR member.display_code != link.display_code '
            'OR link.associated_at_millis != intent.created_at_millis '
            "OR json_extract(intent.request_fingerprint, '\$.memberId') IS NOT link.member_id "
            "OR json_extract(intent.request_fingerprint, '\$.memberCardRevision') IS NOT link.card_revision "
            'LIMIT 1',
          )
          .isNotEmpty) {
        return false;
      }
      return connection
          .select(
            'SELECT 1 FROM shop_wallet_checkout_intents AS intent '
            'LEFT JOIN shop_wallet_checkout_member_links AS link '
            'ON link.operation_id = intent.operation_id '
            'WHERE link.operation_id IS NULL '
            'AND json_valid(intent.request_fingerprint) AND ('
            "json_type(intent.request_fingerprint, '\$.memberId') IS NOT NULL "
            "OR json_type(intent.request_fingerprint, '\$.memberCardRevision') IS NOT NULL) "
            'LIMIT 1',
          )
          .isEmpty;
    } on SqliteException {
      return false;
    }
  }

  static bool _v17CorrectionRowsValid(Database connection) {
    try {
      final lineages = connection.select(
        'SELECT * FROM shop_correction_lineage_state',
      );
      final intentCount = connection
          .select(
            'SELECT COUNT(*) AS total FROM shop_correction_consumption_intents',
          )
          .single['total'];
      final proofs = connection.select(
        'SELECT * FROM shop_correction_consumptions ORDER BY consumption_ordinal',
      );
      if (lineages.isEmpty) return intentCount == 0 && proofs.isEmpty;
      if (lineages.length != 1) return false;
      final lineage = lineages.single;
      final ordinal = lineage['consumption_ordinal'];
      final digest = lineage['consumption_digest'];
      if (lineage['singleton'] != 1 ||
          ordinal is! int ||
          ordinal < 0 ||
          proofs.length != ordinal ||
          !const {
            'active',
            'restore_pending',
            'reconciliation_required',
          }.contains(lineage['lifecycle_state']) ||
          (ordinal == 0
              ? digest != null
              : digest is! String ||
                    !RegExp(r'^[0-9a-f]{64}$').hasMatch(digest))) {
        return false;
      }
      final allIntents = connection.select(
        'SELECT * FROM shop_correction_consumption_intents',
      );
      for (final intent in allIntents) {
        final capability = intent['capability'];
        if (capability == 'shop.sale.reverse' &&
            shopFullSaleRecoveryAuthorization(
                  intent['recovery_envelope_json'] as String?,
                  localOperationId: intent['local_operation_id'] as String,
                  authorizationReceiptId:
                      intent['authorization_receipt_id'] as String,
                  authorizationReceiptDigest:
                      intent['authorization_receipt_digest'] as String,
                  workspaceId: intent['workspace_id'] as String,
                  actorId: intent['actor_id'] as String,
                  capability: capability as String,
                  semanticTargetId: intent['semantic_target_id'] as String,
                  commandDigest: intent['command_digest'] as String,
                ) ==
                null) {
          return false;
        }
      }
      String? previous;
      for (var index = 0; index < proofs.length; index++) {
        final proof = proofs[index];
        final history = proof['history_digest'];
        if (proof['consumption_ordinal'] != index + 1 ||
            proof['previous_consumption_digest'] != previous ||
            proof['workspace_id'] != lineage['workspace_id'] ||
            proof['actor_id'] != lineage['actor_id'] ||
            proof['lineage_epoch'] is! int ||
            (proof['lineage_epoch'] as int) > lineage['lineage_epoch'] ||
            history is! String ||
            !RegExp(r'^[0-9a-f]{64}$').hasMatch(history)) {
          return false;
        }
        final intents = connection.select(
          'SELECT local_operation_id FROM shop_correction_consumption_intents '
          'WHERE consumption_request_id = ? '
          'AND authorization_receipt_id = ? '
          'AND authorization_receipt_digest = ? '
          'AND workspace_id = ? AND actor_id = ? AND capability = ? '
          'AND semantic_target_id = ? AND command_digest = ? '
          'AND lineage_id = ? AND lineage_epoch = ?',
          [
            proof['consumption_request_id'],
            proof['authorization_receipt_id'],
            proof['authorization_receipt_digest'],
            proof['workspace_id'],
            proof['actor_id'],
            proof['capability'],
            proof['semantic_target_id'],
            proof['command_digest'],
            proof['lineage_id'],
            proof['lineage_epoch'],
          ],
        );
        if (intents.length != 1 ||
            intents.single['local_operation_id'] !=
                proof['local_operation_id']) {
          return false;
        }
        final table = proof['capability'] == 'shop.sale.reverse'
            ? 'shop_sale_reversals'
            : proof['capability'] == 'shop.sale.reconcile_wallet'
            ? 'shop_wallet_reversal_reconciliations'
            : null;
        if (table == null) return false;
        final targetColumn = proof['capability'] == 'shop.sale.reverse'
            ? 'sale_id'
            : 'reversal_id';
        final effects = connection.select(
          'SELECT authorization_receipt_digest, '
          'authorization_workspace_id, authorized_actor_id, '
          'authorization_capability, $targetColumn AS semantic_target_id, '
          'authorization_command_digest FROM $table WHERE operation_id = ? '
          'AND authorization_receipt_id = ? LIMIT 1',
          [proof['local_operation_id'], proof['authorization_receipt_id']],
        );
        if (effects.length != 1 ||
            effects.single['authorization_receipt_digest'] !=
                proof['authorization_receipt_digest'] ||
            effects.single['authorization_workspace_id'] !=
                proof['workspace_id'] ||
            effects.single['authorized_actor_id'] != proof['actor_id'] ||
            effects.single['authorization_capability'] != proof['capability'] ||
            effects.single['semantic_target_id'] !=
                proof['semantic_target_id'] ||
            effects.single['authorization_command_digest'] !=
                proof['command_digest']) {
          return false;
        }
        previous = history;
      }
      return previous == digest;
    } on Object {
      return false;
    }
  }

  static bool _collisionWorkspaceBindingValid(Database connection) {
    try {
      return connection
          .select('SELECT 1 FROM shop_managed_workspace_binding LIMIT 1')
          .isEmpty;
    } on Object {
      return false;
    }
  }

  static bool _migrationProvenanceValid(
    Database connection, {
    required bool allowRuntimeUnboundCorrectionHistory,
    required bool hasAuthorizationProofs,
  }) {
    try {
      final provenance = connection.select(
        'SELECT singleton, reason FROM shop_v13_migration_provenance',
      );
      if (provenance.length > 1 ||
          provenance.any(
            (row) =>
                row['singleton'] != 1 ||
                row['reason'] != 'legacy_unbound_correction_history',
          )) {
        return false;
      }
      if (!allowRuntimeUnboundCorrectionHistory) return provenance.isEmpty;

      final binding = connection.select(
        'SELECT 1 FROM shop_managed_workspace_binding LIMIT 2',
      );
      final corrections = connection.select(
        'SELECT authorization_receipt_id FROM shop_sale_reversals UNION ALL '
        'SELECT authorization_receipt_id '
        'FROM shop_wallet_reversal_reconciliations',
      );
      if (binding.length > 1) return false;
      if (binding.isNotEmpty || corrections.isEmpty) {
        return provenance.isEmpty;
      }
      if (provenance.length != 1) return false;
      if (!hasAuthorizationProofs) return true;

      final proofs = connection.select(
        'SELECT proof_kind FROM shop_correction_authorization_proofs',
      );
      return proofs.length == corrections.length &&
          proofs.every(
            (row) =>
                row['proof_kind'] ==
                shopCorrectionAuthorizationProofKindLegacyV1,
          );
    } on Object {
      return false;
    }
  }

  static bool _correctionDefinitionsValid(Database connection) {
    final objects = _readSnapshotSchemaObjects(connection);
    if (objects == null) return false;
    final definitions = _v11SchemaDefinitions;
    return _snapshotDefinitionGroupExact(
          objects,
          definitions,
          definitions.keys.toSet(),
        ) &&
        _reversalCashColumnState(connection) == _SnapshotColumnGroupState.exact;
  }

  static String _sha256Hex(String value) =>
      crypto.sha256.convert(utf8.encode(value)).toString();

  static bool _v12WorkspaceBindingValid(
    Database connection, {
    required bool allowUnboundHistory,
  }) {
    try {
      final bindings = connection.select(
        'SELECT singleton, workspace_id, discovery_contract, '
        'attached_actor_id, attached_at_millis '
        'FROM shop_managed_workspace_binding',
      );
      if (bindings.length > 1) return false;

      final corrections = connection.select(
        'SELECT authorization_workspace_id AS workspace_id, '
        'authorized_actor_id AS actor_id FROM shop_sale_reversals UNION '
        'SELECT authorization_workspace_id AS workspace_id, '
        'authorized_actor_id AS actor_id '
        'FROM shop_wallet_reversal_reconciliations',
      );
      final id = RegExp(r'^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$');
      if (corrections.any(
        (row) =>
            row['workspace_id'] is! String ||
            !id.hasMatch(row['workspace_id'] as String) ||
            row['actor_id'] is! String ||
            !id.hasMatch(row['actor_id'] as String),
      )) {
        return false;
      }
      if (bindings.isEmpty) {
        // Runtime preflight may preserve a known legacy-unbound migration
        // shape without inventing attach authority. Backup verification stays
        // strict until a matching authenticated selection is attached.
        return corrections.isEmpty || allowUnboundHistory;
      }

      final binding = bindings.single;
      final workspaceId = binding['workspace_id'];
      final actorId = binding['attached_actor_id'];
      final attachedAtMillis = binding['attached_at_millis'];
      return binding['singleton'] == 1 &&
          workspaceId is String &&
          id.hasMatch(workspaceId) &&
          binding['discovery_contract'] ==
              shopManagedWorkspaceDirectoryContract &&
          actorId is String &&
          id.hasMatch(actorId) &&
          attachedAtMillis is int &&
          attachedAtMillis > 0 &&
          corrections.every(
            (row) =>
                row['workspace_id'] == workspaceId &&
                row['actor_id'] == actorId,
          );
    } on Object {
      return false;
    }
  }

  static bool _jsonObjectMatches(
    Object? encoded,
    Map<String, Object?> expected,
  ) {
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

  static bool _authorizationReceiptValid({
    required Database connection,
    required bool hasAuthorizationProofs,
    required String localOperationId,
    required String receiptDigest,
    required String source,
    required String receiptId,
    required String workspaceId,
    required String actorId,
    required String actorLabel,
    required String actorRole,
    required String capability,
    required String commandDigest,
    required int issuedAtMillis,
    required int verifiedAtMillis,
    required int expiresAtMillis,
  }) {
    if (!hasAuthorizationProofs) {
      return shopLegacyCorrectionAuthorizationReceiptDigestMatchesV1(
        receiptDigest: receiptDigest,
        source: source,
        receiptId: receiptId,
        workspaceId: workspaceId,
        actorId: actorId,
        actorLabel: actorLabel,
        actorRole: actorRole,
        capability: capability,
        commandDigest: commandDigest,
        issuedAtMillis: issuedAtMillis,
        expiresAtMillis: expiresAtMillis,
      );
    }
    final proofs = connection.select(
      'SELECT * FROM shop_correction_authorization_proofs '
      'WHERE receipt_id = ? AND local_operation_id = ?',
      [receiptId, localOperationId],
    );
    if (proofs.length != 1) return false;
    final proof = proofs.single;
    return _v14AuthorizationProofRowValid(proof) &&
        proof['receipt_digest'] == receiptDigest &&
        proof['source'] == source &&
        proof['workspace_id'] == workspaceId &&
        proof['actor_id'] == actorId &&
        proof['actor_label'] == actorLabel &&
        proof['actor_role'] == actorRole &&
        proof['capability'] == capability &&
        proof['command_digest'] == commandDigest &&
        proof['issued_at_millis'] == issuedAtMillis &&
        proof['verified_at_millis'] == verifiedAtMillis &&
        proof['expires_at_millis'] == expiresAtMillis;
  }

  static bool _v14AuthorizationProofsValid(Database connection) {
    try {
      final proofs = connection.select(
        'SELECT * FROM shop_correction_authorization_proofs '
        'ORDER BY receipt_id',
      );
      if (proofs.any((proof) => !_v14AuthorizationProofRowValid(proof))) {
        return false;
      }
      final actions = connection.select('''
        SELECT operation_id, authorization_receipt_id
        FROM shop_sale_reversals
        UNION ALL
        SELECT operation_id, authorization_receipt_id
        FROM shop_wallet_reversal_reconciliations
      ''');
      if (proofs.length != actions.length) return false;
      final proofKeys = <String>{
        for (final proof in proofs)
          jsonEncode([proof['receipt_id'], proof['local_operation_id']]),
      };
      final actionKeys = <String>{};
      for (final action in actions) {
        final operationId = action['operation_id'];
        final receiptId = action['authorization_receipt_id'];
        if (operationId is! String || receiptId is! String) return false;
        actionKeys.add(jsonEncode([receiptId, operationId]));
      }
      return proofKeys.length == proofs.length &&
          actionKeys.length == actions.length &&
          proofKeys.length == actionKeys.length &&
          proofKeys.containsAll(actionKeys);
    } on Object {
      return false;
    }
  }

  static bool _v14AuthorizationProofRowValid(Row proof) {
    // This synchronous sqlite3 pass validates the canonical fields and signed
    // envelope shape. The staged ShopDatabase open performs the Ed25519 check
    // with the configured pinned-key verifier before restore publication.
    final receiptId = proof['receipt_id'];
    final proofKind = proof['proof_kind'];
    final localOperationId = proof['local_operation_id'];
    final receiptDigest = proof['receipt_digest'];
    final keyId = proof['key_id'];
    final signature = proof['signature'];
    final hasFinalization = proof.keys.contains('finalization_request_id');
    final finalizationRequestId = hasFinalization
        ? proof['finalization_request_id']
        : null;
    final finalizedAtMillis = hasFinalization
        ? proof['finalized_at_millis']
        : null;
    final workspaceId = proof['workspace_id'];
    final actorId = proof['actor_id'];
    final actorLabel = proof['actor_label'];
    final actorRole = proof['actor_role'];
    final capability = proof['capability'];
    final source = proof['source'];
    final commandDigest = proof['command_digest'];
    final issuedAtMillis = proof['issued_at_millis'];
    final expiresAtMillis = proof['expires_at_millis'];
    final verifiedAtMillis = proof['verified_at_millis'];
    final id = RegExp(r'^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$');
    final digest = RegExp(r'^[0-9a-f]{64}$');
    final boundedText = RegExp(r'^[^\x00-\x1f\x7f]{1,160}$');
    if (receiptId is! String ||
        !boundedText.hasMatch(receiptId) ||
        receiptId != receiptId.trim() ||
        localOperationId is! String ||
        !boundedText.hasMatch(localOperationId) ||
        localOperationId != localOperationId.trim() ||
        receiptDigest is! String ||
        !digest.hasMatch(receiptDigest) ||
        workspaceId is! String ||
        !id.hasMatch(workspaceId) ||
        actorId is! String ||
        !id.hasMatch(actorId) ||
        actorLabel is! String ||
        !boundedText.hasMatch(actorLabel) ||
        actorLabel != actorLabel.trim() ||
        actorRole is! String ||
        actorRole != 'owner' ||
        capability is! String ||
        !const {
          'shop.sale.reverse',
          'shop.sale.reconcile_wallet',
        }.contains(capability) ||
        source is! String ||
        commandDigest is! String ||
        !digest.hasMatch(commandDigest) ||
        issuedAtMillis is! int ||
        issuedAtMillis <= 0 ||
        expiresAtMillis is! int ||
        verifiedAtMillis is! int ||
        verifiedAtMillis < issuedAtMillis ||
        expiresAtMillis < verifiedAtMillis ||
        expiresAtMillis - issuedAtMillis != 300000) {
      return false;
    }
    if (proofKind == 'signed_v2') {
      return keyId is String &&
          RegExp(r'^[a-z0-9][a-z0-9._-]{0,31}$').hasMatch(keyId) &&
          signature is String &&
          RegExp(r'^[A-Za-z0-9_-]{86}$').hasMatch(signature) &&
          finalizationRequestId == null &&
          finalizedAtMillis == null &&
          source == 'managed_membership_receipt_v1' &&
          shopHistoricalCorrectionAuthorizationReceiptDigestV2(
                source: source,
                receiptId: receiptId,
                workspaceId: workspaceId,
                actorId: actorId,
                actorLabel: actorLabel,
                actorRole: actorRole,
                capability: capability,
                commandDigest: commandDigest,
                issuedAtMillis: issuedAtMillis,
                expiresAtMillis: expiresAtMillis,
              ) ==
              receiptDigest;
    }
    if (proofKind == 'signed_v3') {
      return keyId is String &&
          RegExp(r'^[a-z0-9][a-z0-9._-]{0,31}$').hasMatch(keyId) &&
          signature is String &&
          RegExp(r'^[A-Za-z0-9_-]{86}$').hasMatch(signature) &&
          finalizationRequestId is String &&
          RegExp(
            r'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
          ).hasMatch(finalizationRequestId) &&
          finalizedAtMillis is int &&
          finalizedAtMillis == verifiedAtMillis &&
          issuedAtMillis == finalizedAtMillis &&
          finalizedAtMillis <= expiresAtMillis &&
          source == 'managed_membership_receipt_v1' &&
          shopCorrectionAuthorizationReceiptDigestMatches(
            receiptDigest: receiptDigest,
            source: source,
            receiptId: receiptId,
            workspaceId: workspaceId,
            actorId: actorId,
            actorLabel: actorLabel,
            actorRole: actorRole,
            capability: capability,
            commandDigest: commandDigest,
            finalizationRequestId: finalizationRequestId,
            finalizedAtMillis: finalizedAtMillis,
            issuedAtMillis: issuedAtMillis,
            expiresAtMillis: expiresAtMillis,
          );
    }
    if (proofKind == 'legacy_unverified_v1') {
      return keyId == null &&
          signature == null &&
          finalizationRequestId == null &&
          finalizedAtMillis == null &&
          source == 'managed_membership_receipt_v1' &&
          shopLegacyCorrectionAuthorizationReceiptDigestMatchesV1(
            receiptDigest: receiptDigest,
            source: source,
            receiptId: receiptId,
            workspaceId: workspaceId,
            actorId: actorId,
            actorLabel: actorLabel,
            actorRole: actorRole,
            capability: capability,
            commandDigest: commandDigest,
            issuedAtMillis: issuedAtMillis,
            expiresAtMillis: expiresAtMillis,
          );
    }
    return false;
  }

  static bool _v11DigestsAndEventsValid(
    Database connection, {
    required bool hasAuthorizationProofs,
  }) {
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
        final authorizationReceiptDigest =
            reversal['authorization_receipt_digest'];
        final authorizationCommandDigest =
            reversal['authorization_command_digest'];
        final authorizationWorkspaceId = reversal['authorization_workspace_id'];
        final authorizedActorId = reversal['authorized_actor_id'];
        final authorizedActorLabel = reversal['authorized_actor_label'];
        final authorizedActorRole = reversal['authorized_actor_role'];
        final authorizationCapability = reversal['authorization_capability'];
        final authorizationSource = reversal['authorization_source'];
        final authorizationIssuedAtMillis =
            reversal['authorization_issued_at_millis'];
        final authorizationVerifiedAtMillis =
            reversal['authorization_verified_at_millis'];
        final authorizationExpiresAtMillis =
            reversal['authorization_expires_at_millis'];
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
            authorizationReceiptDigest is! String ||
            authorizationCommandDigest is! String ||
            authorizationWorkspaceId is! String ||
            authorizedActorId is! String ||
            authorizedActorLabel is! String ||
            authorizedActorRole is! String ||
            authorizationCapability is! String ||
            authorizationSource is! String ||
            authorizationIssuedAtMillis is! int ||
            authorizationVerifiedAtMillis is! int ||
            authorizationExpiresAtMillis is! int ||
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
            authorizationCommandDigest != _sha256Hex(requestFingerprint) ||
            !_authorizationReceiptValid(
              connection: connection,
              hasAuthorizationProofs: hasAuthorizationProofs,
              localOperationId: operationId,
              receiptDigest: authorizationReceiptDigest,
              source: authorizationSource,
              receiptId: authorizationReceiptId,
              workspaceId: authorizationWorkspaceId,
              actorId: authorizedActorId,
              actorLabel: authorizedActorLabel,
              actorRole: authorizedActorRole,
              capability: authorizationCapability,
              commandDigest: authorizationCommandDigest,
              issuedAtMillis: authorizationIssuedAtMillis,
              verifiedAtMillis: authorizationVerifiedAtMillis,
              expiresAtMillis: authorizationExpiresAtMillis,
            )) {
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
            events.single['event_type'] != 'shop.sale.reversal_recorded.v1' ||
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
          'externalReconciliationState': isCash ? 'not_applicable' : 'pending',
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
        final authorizationReceiptDigest =
            reconciliation['authorization_receipt_digest'];
        final authorizationCommandDigest =
            reconciliation['authorization_command_digest'];
        final authorizationWorkspaceId =
            reconciliation['authorization_workspace_id'];
        final authorizedActorId = reconciliation['authorized_actor_id'];
        final authorizedActorLabel = reconciliation['authorized_actor_label'];
        final authorizedActorRole = reconciliation['authorized_actor_role'];
        final authorizationCapability =
            reconciliation['authorization_capability'];
        final authorizationSource = reconciliation['authorization_source'];
        final authorizationIssuedAtMillis =
            reconciliation['authorization_issued_at_millis'];
        final authorizationVerifiedAtMillis =
            reconciliation['authorization_verified_at_millis'];
        final authorizationExpiresAtMillis =
            reconciliation['authorization_expires_at_millis'];
        final createdAtMillis = reconciliation['created_at_millis'];
        if (id is! String ||
            operationId is! String ||
            id != operationId ||
            reversalId is! String ||
            outcome is! String ||
            evidenceReference is! String ||
            authorizationReceiptId is! String ||
            authorizationReceiptDigest is! String ||
            authorizationCommandDigest is! String ||
            authorizationWorkspaceId is! String ||
            authorizedActorId is! String ||
            authorizedActorLabel is! String ||
            authorizedActorRole is! String ||
            authorizationCapability is! String ||
            authorizationSource is! String ||
            authorizationIssuedAtMillis is! int ||
            authorizationVerifiedAtMillis is! int ||
            authorizationExpiresAtMillis is! int ||
            createdAtMillis is! int) {
          return false;
        }
        final linkedReversals = connection.select(
          'SELECT original_payment_method, original_total_mmk, '
          'created_at_millis FROM shop_sale_reversals WHERE id = ?',
          [reversalId],
        );
        if (linkedReversals.length != 1) return false;
        final reversal = linkedReversals.single;
        final originalPaymentMethod = reversal['original_payment_method'];
        final originalTotalMmk = reversal['original_total_mmk'];
        final reversalCreatedAtMillis = reversal['created_at_millis'];
        if (originalPaymentMethod is! String ||
            originalTotalMmk is! int ||
            reversalCreatedAtMillis is! int ||
            createdAtMillis < reversalCreatedAtMillis) {
          return false;
        }
        // Rebuild the current cross-runtime command contract from immutable
        // evidence. Historical v11 rows predate the payment fields. Preserve
        // that exact digest only as legacy-unverified audit history; a signed
        // v2 proof must always use the current six-key contract.
        final requestFingerprint = jsonEncode(<String, Object>{
          'operationId': operationId,
          'reversalId': reversalId,
          'originalPaymentMethod': originalPaymentMethod,
          'originalTotalMmk': originalTotalMmk,
          'outcome': outcome,
          'evidenceReference': evidenceReference,
        });
        final legacyRequestFingerprint = jsonEncode(<String, Object>{
          'operationId': operationId,
          'reversalId': reversalId,
          'outcome': outcome,
          'evidenceReference': evidenceReference,
        });
        final storedRequestFingerprint = reconciliation['request_fingerprint'];
        final currentFingerprintValid =
            storedRequestFingerprint == requestFingerprint &&
            authorizationCommandDigest == _sha256Hex(requestFingerprint);
        var legacyFingerprintValid =
            storedRequestFingerprint == legacyRequestFingerprint &&
            authorizationCommandDigest == _sha256Hex(legacyRequestFingerprint);
        if (legacyFingerprintValid && hasAuthorizationProofs) {
          final proofs = connection.select(
            'SELECT proof_kind FROM shop_correction_authorization_proofs '
            'WHERE receipt_id = ? AND local_operation_id = ?',
            [authorizationReceiptId, operationId],
          );
          legacyFingerprintValid =
              proofs.length == 1 &&
              proofs.single['proof_kind'] == 'legacy_unverified_v1';
        }
        if ((!currentFingerprintValid && !legacyFingerprintValid) ||
            !_authorizationReceiptValid(
              connection: connection,
              hasAuthorizationProofs: hasAuthorizationProofs,
              localOperationId: operationId,
              receiptDigest: authorizationReceiptDigest,
              source: authorizationSource,
              receiptId: authorizationReceiptId,
              workspaceId: authorizationWorkspaceId,
              actorId: authorizedActorId,
              actorLabel: authorizedActorLabel,
              actorRole: authorizedActorRole,
              capability: authorizationCapability,
              commandDigest: authorizationCommandDigest,
              issuedAtMillis: authorizationIssuedAtMillis,
              verifiedAtMillis: authorizationVerifiedAtMillis,
              expiresAtMillis: authorizationExpiresAtMillis,
            )) {
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
        final sales = connection
            .select(
              '''
          SELECT
            COALESCE(SUM(CASE WHEN s.payment_method = 'cash' THEN 1 ELSE 0 END), 0) AS cash_count,
            COALESCE(SUM(CASE WHEN s.payment_method = 'cash' THEN s.total_mmk ELSE 0 END), 0) AS cash_total,
            COALESCE(SUM(CASE WHEN s.payment_method IN ('kbzpay', 'wavepay') THEN 1 ELSE 0 END), 0) AS wallet_count,
            COALESCE(SUM(CASE WHEN s.payment_method IN ('kbzpay', 'wavepay') THEN s.total_mmk ELSE 0 END), 0) AS wallet_total,
            COALESCE(SUM(CASE WHEN s.payment_method NOT IN ('cash', 'kbzpay', 'wavepay') THEN 1 ELSE 0 END), 0) AS unknown_count
          FROM shop_cash_shift_sales link
          JOIN shop_sales s ON s.id = link.sale_id
          WHERE link.shift_id = ?
        ''',
              [shiftId],
            )
            .single;
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
        final reversals = connection
            .select(
              '''
          SELECT COUNT(*) AS reversal_count,
            COALESCE(SUM(original_total_mmk), 0) AS reversal_total,
            COALESCE(SUM(-cash_drawer_delta_mmk), 0) AS drawer_outflow,
            COALESCE(MAX(created_at_millis), 0) AS latest_reversal_at
          FROM shop_sale_reversals
          WHERE shift_id = ? AND original_payment_method = 'cash'
        ''',
              [shiftId],
            )
            .single;
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
                    shift['review_cash_drawer_outflow_mmk'] !=
                        drawerOutflow))) {
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

  static bool _v11ReversalAuditValid(
    Database connection, {
    required bool hasAuthorizationProofs,
  }) {
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
         OR w.authorization_workspace_id != r.authorization_workspace_id
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
        _v11DigestsAndEventsValid(
          connection,
          hasAuthorizationProofs: hasAuthorizationProofs,
        ) &&
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
