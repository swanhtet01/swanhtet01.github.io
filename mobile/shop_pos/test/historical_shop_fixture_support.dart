import 'package:sqlite3/sqlite3.dart' as sqlite;
import 'package:supermega_shop/shop_database.dart';

const historicalShopFixtureSupportedSchemaVersion = 37;

Set<String> historicalShopPostV15SchemaObjectNames() => <String>{
  ...shopMemberSchemaDefinitionsV16().keys,
  ...shopCorrectionConsumptionSchemaDefinitionsV17().keys,
  ...shopCashMovementSchemaDefinitionsV18().keys,
  ...shopCafeOrderSchemaDefinitionsV19().keys,
  ...shopCafeCancellationSchemaDefinitionsV20().keys,
  ...shopPendingCashCheckoutSchemaDefinitionsV21().keys,
  ...shopConnectedAuthorityCheckpointSchemaDefinitionsV36().keys,
  ...shopConnectedTrustedTimeSchemaDefinitionsV37().keys,
  ...shopConnectedSiteSchemaDefinitionsV28().keys,
  ...shopConnectedEnvelopeSchemaDefinitionsV29().keys,
  ...shopConnectedAuthorityPayloadSchemaDefinitionsV30().keys,
  ...shopConnectedReservationSessionSchemaDefinitionsV31().keys,
  ...shopConnectedReplicaSchemaDefinitionsV32().keys,
  ...shopConnectedReplicaSchemaDefinitionsV33().keys,
  ...shopConnectedCloudProofSchemaDefinitionsV35().keys,
};

void requireNoPostV15SchemaObjects(sqlite.Database connection) {
  final forbidden = historicalShopPostV15SchemaObjectNames();
  final retained = connection
      .select(
        "SELECT type, name FROM sqlite_master "
        "WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name",
      )
      .where(
        (row) =>
            row['type'] == 'view' || forbidden.contains(row['name'] as String),
      )
      .map((row) => '${row['type']}:${row['name']}')
      .toList(growable: false);
  if (retained.isNotEmpty) {
    throw StateError(
      'Historical Shop v15 fixture retained post-v15 schema objects: '
      '${retained.join(', ')}',
    );
  }
}

Future<void> requireNoPostV15SchemaObjectsInShopDatabase(
  ShopDatabase database,
) async {
  final forbidden = historicalShopPostV15SchemaObjectNames();
  final rows = await database
      .customSelect(
        "SELECT type, name FROM sqlite_master "
        "WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name",
      )
      .get();
  final retained = rows
      .where(
        (row) =>
            row.read<String>('type') == 'view' ||
            forbidden.contains(row.read<String>('name')),
      )
      .map((row) => '${row.read<String>('type')}:${row.read<String>('name')}')
      .toList(growable: false);
  if (retained.isNotEmpty) {
    throw StateError(
      'Historical Shop fixture retained post-v15 schema objects: '
      '${retained.join(', ')}',
    );
  }
}
