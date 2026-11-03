import 'dart:io';

import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqlite3/sqlite3.dart' as sqlite;
import 'package:supermega_shop/shop_backup.dart';
import 'package:supermega_shop/shop_database.dart';

import 'historical_shop_fixture_support.dart';

void main() {
  test(
    'fresh v40 has exact empty cloud-feed schema and backup proof',
    () async {
      final directory = await Directory.systemTemp.createTemp(
        'shop-v40-fresh-',
      );
      addTearDown(() => directory.delete(recursive: true));
      final file = File('${directory.path}/shop.sqlite');
      final database = ShopDatabase(NativeDatabase(file));
      await database.verifyReadyForUse();
      expect(database.schemaVersion, 40);
      await database.close();
      ShopBackup.verifySnapshot(file, expectedSchemaVersion: 40);
    },
  );

  test(
    'genuine empty v39 upgrades to v40 without inventing feed rows',
    () async {
      final directory = await Directory.systemTemp.createTemp(
        'shop-v40-upgrade-',
      );
      addTearDown(() => directory.delete(recursive: true));
      final file = File('${directory.path}/shop.sqlite');
      var database = ShopDatabase(NativeDatabase(file));
      await database.verifyReadyForUse();
      await dropHistoricalShopSchemaDefinitionGroupInDatabase(
        database,
        shopConnectedCloudFeedSchemaDefinitionsV40(),
      );
      await database.customStatement('PRAGMA user_version = 39');
      await database.close();
      ShopBackup.verifySnapshot(file, expectedSchemaVersion: 39);

      database = ShopDatabase(NativeDatabase(file));
      await database.verifyReadyForUse();
      expect(database.schemaVersion, 40);
      final rows = await database
          .customSelect(
            'SELECT COUNT(*) AS total FROM shop_connected_cloud_feed_streams',
          )
          .getSingle();
      expect(rows.read<int>('total'), 0);
      await database.close();
      ShopBackup.verifySnapshot(file, expectedSchemaVersion: 40);
    },
  );

  test(
    'unapproved cloud rows cannot open or cross backup verification',
    () async {
      final directory = await Directory.systemTemp.createTemp(
        'shop-v40-reject-',
      );
      addTearDown(() => directory.delete(recursive: true));
      final file = File('${directory.path}/shop.sqlite');
      var database = ShopDatabase(NativeDatabase(file));
      await database.verifyReadyForUse();
      await database.close();
      final raw = sqlite.sqlite3.open(file.path);
      try {
        raw.execute(
          '''
        INSERT INTO shop_connected_cloud_feed_streams
        (stream_digest, workspace_id, site_id, actor_id, device_id,
         actor_role, lease_digest, authority_payload_digest,
         authority_generation, revocation_generation)
        VALUES (?, 'workspace-a', 'site-a', 'actor-a', 'device-a',
                'manager', ?, ?, 1, 1)
      ''',
          ['a' * 64, 'b' * 64, 'c' * 64],
        );
      } finally {
        raw.close();
      }
      expect(
        () => ShopBackup.verifySnapshot(file, expectedSchemaVersion: 40),
        throwsFormatException,
      );
      database = ShopDatabase(NativeDatabase(file));
      await expectLater(database.verifyReadyForUse(), throwsStateError);
      await database.close();
    },
  );

  test('relabelling v40 as v39 cannot launder new schema', () async {
    final directory = await Directory.systemTemp.createTemp('shop-v40-branch-');
    addTearDown(() => directory.delete(recursive: true));
    final file = File('${directory.path}/shop.sqlite');
    var database = ShopDatabase(NativeDatabase(file));
    await database.verifyReadyForUse();
    await database.close();
    final raw = sqlite.sqlite3.open(file.path);
    try {
      raw.execute('PRAGMA user_version = 39');
    } finally {
      raw.close();
    }
    database = ShopDatabase(NativeDatabase(file));
    await expectLater(database.verifyReadyForUse(), throwsStateError);
    await database.close();
  });
}
