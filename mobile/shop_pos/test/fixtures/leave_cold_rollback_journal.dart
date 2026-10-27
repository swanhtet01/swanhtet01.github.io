import 'dart:io';

import 'package:sqlite3/sqlite3.dart';

void main(List<String> arguments) {
  if (arguments.length != 1) {
    stderr.writeln('Expected one SQLite database path.');
    exit(64);
  }
  final database = sqlite3.open(arguments.single, mode: OpenMode.readWrite);
  database.execute('PRAGMA journal_mode = DELETE');
  database.execute('PRAGMA synchronous = FULL');
  database.execute('BEGIN IMMEDIATE');
  database.execute("UPDATE shop_products SET on_hand = 0 WHERE id = 'tea'");

  // Deliberately terminate without closing or rolling back. This models the
  // operating system ending Shop before SQLite syncs the journal header.
  exit(19);
}
