import 'dart:ffi';
import 'dart:io';

import 'package:ffi/ffi.dart';
import 'package:sqlite3/sqlite3.dart';

typedef _SqliteOpenV2Native = Int32 Function(
  Pointer<Utf8>,
  Pointer<Pointer<Void>>,
  Int32,
  Pointer<Utf8>,
);
typedef _SqliteOpenV2Dart = int Function(
  Pointer<Utf8>,
  Pointer<Pointer<Void>>,
  int,
  Pointer<Utf8>,
);
typedef _SqliteExecNative = Int32 Function(
  Pointer<Void>,
  Pointer<Utf8>,
  Pointer<Void>,
  Pointer<Void>,
  Pointer<Pointer<Utf8>>,
);
typedef _SqliteExecDart = int Function(
  Pointer<Void>,
  Pointer<Utf8>,
  Pointer<Void>,
  Pointer<Void>,
  Pointer<Pointer<Utf8>>,
);
typedef _SqliteFreeNative = Void Function(Pointer<Void>);
typedef _SqliteFreeDart = void Function(Pointer<Void>);

void main(List<String> arguments) {
  final expectedArguments = Platform.isWindows ? 2 : 1;
  if (arguments.length != expectedArguments) {
    stderr.writeln(
      Platform.isWindows
          ? 'Expected a SQLite database path and built sqlite3.dll path.'
          : 'Expected one SQLite database path.',
    );
    exit(64);
  }
  if (Platform.isWindows) {
    final sqliteAsset = File(arguments[1]);
    if (!sqliteAsset.isAbsolute ||
        sqliteAsset.uri.pathSegments.last.toLowerCase() != 'sqlite3.dll' ||
        FileSystemEntity.typeSync(sqliteAsset.path, followLinks: false) !=
            FileSystemEntityType.file) {
      stderr.writeln(
        'The built SQLite asset must be an absolute sqlite3.dll regular '
        'file.',
      );
      exit(64);
    }
    final library = DynamicLibrary.open(sqliteAsset.path);
    _leaveColdRollbackJournalWithLibrary(arguments.first, library);
  } else {
    final database = sqlite3.open(arguments.first, mode: OpenMode.readWrite);
    database.execute('PRAGMA journal_mode = DELETE');
    database.execute('PRAGMA synchronous = FULL');
    database.execute('BEGIN IMMEDIATE');
    database.execute("UPDATE shop_products SET on_hand = 0 WHERE id = 'tea'");
  }

  // Deliberately terminate without closing or rolling back. This models the
  // operating system ending Shop before SQLite syncs the journal header.
  exit(19);
}

void _leaveColdRollbackJournalWithLibrary(
  String databasePath,
  DynamicLibrary library,
) {
  final open = library.lookupFunction<_SqliteOpenV2Native, _SqliteOpenV2Dart>(
    'sqlite3_open_v2',
  );
  final execute = library.lookupFunction<_SqliteExecNative, _SqliteExecDart>(
    'sqlite3_exec',
  );
  final free = library.lookupFunction<_SqliteFreeNative, _SqliteFreeDart>(
    'sqlite3_free',
  );
  final databaseOut = calloc<Pointer<Void>>();
  final encodedPath = databasePath.toNativeUtf8();
  try {
    const sqliteOpenReadWrite = 0x00000002;
    final openResult = open(
      encodedPath,
      databaseOut,
      sqliteOpenReadWrite,
      nullptr,
    );
    if (openResult != 0 || databaseOut.value == nullptr) {
      stderr.writeln('sqlite3_open_v2 failed with result $openResult.');
      exit(70);
    }

    for (final statement in const [
      'PRAGMA journal_mode = DELETE',
      'PRAGMA synchronous = FULL',
      'BEGIN IMMEDIATE',
      "UPDATE shop_products SET on_hand = 0 WHERE id = 'tea'",
    ]) {
      final encodedStatement = statement.toNativeUtf8();
      final errorOut = calloc<Pointer<Utf8>>();
      try {
        final result = execute(
          databaseOut.value,
          encodedStatement,
          nullptr,
          nullptr,
          errorOut,
        );
        if (result != 0) {
          final detail = errorOut.value == nullptr
              ? ''
              : ' ${errorOut.value.toDartString()}';
          stderr.writeln('sqlite3_exec failed with result $result.$detail');
          exit(70);
        }
      } finally {
        if (errorOut.value != nullptr) {
          free(errorOut.value.cast());
        }
        calloc.free(errorOut);
        calloc.free(encodedStatement);
      }
    }
  } finally {
    calloc.free(encodedPath);
    calloc.free(databaseOut);
  }
}
