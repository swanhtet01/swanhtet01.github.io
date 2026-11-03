import 'package:sqlite3/sqlite3.dart' as sqlite;
import 'package:supermega_shop/shop_database.dart';

const historicalShopFixtureSupportedSchemaVersion = 41;

Set<String> historicalShopPostV15SchemaObjectNames() => <String>{
  ...shopConnectedCloudFeedSchemaDefinitionsV41().keys,
  ...shopConnectedCloudFeedSchemaDefinitionsV40().keys,
  ...shopConnectedTrustedTimeClientSchemaDefinitionsV39().keys,
  ...shopConnectedTrustedTimeIssuerSchemaDefinitionsV38().keys,
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

void dropHistoricalShopSchemaDefinitionGroup(
  sqlite.Database connection,
  Map<String, String> definitions,
) {
  if (definitions.keys.toSet().containsAll(
        shopConnectedCloudFeedSchemaDefinitionsV40().keys,
      ) &&
      definitions.length ==
          shopConnectedCloudFeedSchemaDefinitionsV40().length) {
    dropHistoricalShopSchemaDefinitionGroup(
      connection,
      shopConnectedCloudFeedSchemaDefinitionsV41(),
    );
  }
  if (definitions.keys.toSet().containsAll(
        shopConnectedTrustedTimeClientSchemaDefinitionsV39().keys,
      ) &&
      definitions.length ==
          shopConnectedTrustedTimeClientSchemaDefinitionsV39().length) {
    dropHistoricalShopSchemaDefinitionGroup(
      connection,
      shopConnectedCloudFeedSchemaDefinitionsV40(),
    );
  }
  if (definitions.keys.toSet().containsAll(
        shopConnectedTrustedTimeIssuerSchemaDefinitionsV38().keys,
      ) &&
      definitions.length ==
          shopConnectedTrustedTimeIssuerSchemaDefinitionsV38().length) {
    dropHistoricalShopSchemaDefinitionGroup(
      connection,
      shopConnectedCloudFeedSchemaDefinitionsV40(),
    );
    dropHistoricalShopSchemaDefinitionGroup(
      connection,
      shopConnectedTrustedTimeClientSchemaDefinitionsV39(),
    );
  }
  for (final definition in definitions.entries.toList().reversed) {
    final type = shopSchemaObjectTypeForDefinition(definition.value);
    connection.execute(
      'DROP ${type == 'table'
          ? 'TABLE'
          : type == 'index'
          ? 'INDEX'
          : 'TRIGGER'} IF EXISTS ${definition.key}',
    );
  }
}

Future<void> dropHistoricalShopSchemaDefinitionGroupInDatabase(
  ShopDatabase database,
  Map<String, String> definitions,
) async {
  if (definitions.keys.toSet().containsAll(
        shopConnectedCloudFeedSchemaDefinitionsV40().keys,
      ) &&
      definitions.length ==
          shopConnectedCloudFeedSchemaDefinitionsV40().length) {
    await dropHistoricalShopSchemaDefinitionGroupInDatabase(
      database,
      shopConnectedCloudFeedSchemaDefinitionsV41(),
    );
  }
  if (definitions.keys.toSet().containsAll(
        shopConnectedTrustedTimeClientSchemaDefinitionsV39().keys,
      ) &&
      definitions.length ==
          shopConnectedTrustedTimeClientSchemaDefinitionsV39().length) {
    await dropHistoricalShopSchemaDefinitionGroupInDatabase(
      database,
      shopConnectedCloudFeedSchemaDefinitionsV40(),
    );
  }
  if (definitions.keys.toSet().containsAll(
        shopConnectedTrustedTimeIssuerSchemaDefinitionsV38().keys,
      ) &&
      definitions.length ==
          shopConnectedTrustedTimeIssuerSchemaDefinitionsV38().length) {
    await dropHistoricalShopSchemaDefinitionGroupInDatabase(
      database,
      shopConnectedCloudFeedSchemaDefinitionsV40(),
    );
    await dropHistoricalShopSchemaDefinitionGroupInDatabase(
      database,
      shopConnectedTrustedTimeClientSchemaDefinitionsV39(),
    );
  }
  for (final definition in definitions.entries.toList().reversed) {
    final type = shopSchemaObjectTypeForDefinition(definition.value);
    await database.customStatement(
      'DROP ${type == 'table'
          ? 'TABLE'
          : type == 'index'
          ? 'INDEX'
          : 'TRIGGER'} IF EXISTS ${definition.key}',
    );
  }
}

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
