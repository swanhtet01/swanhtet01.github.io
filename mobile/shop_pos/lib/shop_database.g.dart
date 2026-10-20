// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'shop_database.dart';

// ignore_for_file: type=lint
class $MenuImportDraftsTable extends MenuImportDrafts
    with TableInfo<$MenuImportDraftsTable, MenuImportDraft> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $MenuImportDraftsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _batchIdMeta = const VerificationMeta(
    'batchId',
  );
  @override
  late final GeneratedColumn<String> batchId = GeneratedColumn<String>(
    'batch_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _categoryMeta = const VerificationMeta(
    'category',
  );
  @override
  late final GeneratedColumn<String> category = GeneratedColumn<String>(
    'category',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _nameMeta = const VerificationMeta('name');
  @override
  late final GeneratedColumn<String> name = GeneratedColumn<String>(
    'name',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _descriptionMeta = const VerificationMeta(
    'description',
  );
  @override
  late final GeneratedColumn<String> description = GeneratedColumn<String>(
    'description',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant(''),
  );
  static const VerificationMeta _priceMmkMeta = const VerificationMeta(
    'priceMmk',
  );
  @override
  late final GeneratedColumn<int> priceMmk = GeneratedColumn<int>(
    'price_mmk',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _skuMeta = const VerificationMeta('sku');
  @override
  late final GeneratedColumn<String> sku = GeneratedColumn<String>(
    'sku',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _barcodeMeta = const VerificationMeta(
    'barcode',
  );
  @override
  late final GeneratedColumn<String> barcode = GeneratedColumn<String>(
    'barcode',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _openingStockMeta = const VerificationMeta(
    'openingStock',
  );
  @override
  late final GeneratedColumn<int> openingStock = GeneratedColumn<int>(
    'opening_stock',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _reviewStateMeta = const VerificationMeta(
    'reviewState',
  );
  @override
  late final GeneratedColumn<String> reviewState = GeneratedColumn<String>(
    'review_state',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('needs_review'),
  );
  static const VerificationMeta _createdAtMillisMeta = const VerificationMeta(
    'createdAtMillis',
  );
  @override
  late final GeneratedColumn<int> createdAtMillis = GeneratedColumn<int>(
    'created_at_millis',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    batchId,
    category,
    name,
    description,
    priceMmk,
    sku,
    barcode,
    openingStock,
    reviewState,
    createdAtMillis,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'menu_import_drafts';
  @override
  VerificationContext validateIntegrity(
    Insertable<MenuImportDraft> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('batch_id')) {
      context.handle(
        _batchIdMeta,
        batchId.isAcceptableOrUnknown(data['batch_id']!, _batchIdMeta),
      );
    } else if (isInserting) {
      context.missing(_batchIdMeta);
    }
    if (data.containsKey('category')) {
      context.handle(
        _categoryMeta,
        category.isAcceptableOrUnknown(data['category']!, _categoryMeta),
      );
    } else if (isInserting) {
      context.missing(_categoryMeta);
    }
    if (data.containsKey('name')) {
      context.handle(
        _nameMeta,
        name.isAcceptableOrUnknown(data['name']!, _nameMeta),
      );
    } else if (isInserting) {
      context.missing(_nameMeta);
    }
    if (data.containsKey('description')) {
      context.handle(
        _descriptionMeta,
        description.isAcceptableOrUnknown(
          data['description']!,
          _descriptionMeta,
        ),
      );
    }
    if (data.containsKey('price_mmk')) {
      context.handle(
        _priceMmkMeta,
        priceMmk.isAcceptableOrUnknown(data['price_mmk']!, _priceMmkMeta),
      );
    }
    if (data.containsKey('sku')) {
      context.handle(
        _skuMeta,
        sku.isAcceptableOrUnknown(data['sku']!, _skuMeta),
      );
    }
    if (data.containsKey('barcode')) {
      context.handle(
        _barcodeMeta,
        barcode.isAcceptableOrUnknown(data['barcode']!, _barcodeMeta),
      );
    }
    if (data.containsKey('opening_stock')) {
      context.handle(
        _openingStockMeta,
        openingStock.isAcceptableOrUnknown(
          data['opening_stock']!,
          _openingStockMeta,
        ),
      );
    }
    if (data.containsKey('review_state')) {
      context.handle(
        _reviewStateMeta,
        reviewState.isAcceptableOrUnknown(
          data['review_state']!,
          _reviewStateMeta,
        ),
      );
    }
    if (data.containsKey('created_at_millis')) {
      context.handle(
        _createdAtMillisMeta,
        createdAtMillis.isAcceptableOrUnknown(
          data['created_at_millis']!,
          _createdAtMillisMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_createdAtMillisMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  MenuImportDraft map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return MenuImportDraft(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      batchId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}batch_id'],
      )!,
      category: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}category'],
      )!,
      name: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}name'],
      )!,
      description: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}description'],
      )!,
      priceMmk: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}price_mmk'],
      ),
      sku: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}sku'],
      ),
      barcode: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}barcode'],
      ),
      openingStock: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}opening_stock'],
      ),
      reviewState: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}review_state'],
      )!,
      createdAtMillis: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}created_at_millis'],
      )!,
    );
  }

  @override
  $MenuImportDraftsTable createAlias(String alias) {
    return $MenuImportDraftsTable(attachedDatabase, alias);
  }
}

class MenuImportDraft extends DataClass implements Insertable<MenuImportDraft> {
  final String id;
  final String batchId;
  final String category;
  final String name;
  final String description;
  final int? priceMmk;
  final String? sku;
  final String? barcode;
  final int? openingStock;
  final String reviewState;
  final int createdAtMillis;
  const MenuImportDraft({
    required this.id,
    required this.batchId,
    required this.category,
    required this.name,
    required this.description,
    this.priceMmk,
    this.sku,
    this.barcode,
    this.openingStock,
    required this.reviewState,
    required this.createdAtMillis,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['batch_id'] = Variable<String>(batchId);
    map['category'] = Variable<String>(category);
    map['name'] = Variable<String>(name);
    map['description'] = Variable<String>(description);
    if (!nullToAbsent || priceMmk != null) {
      map['price_mmk'] = Variable<int>(priceMmk);
    }
    if (!nullToAbsent || sku != null) {
      map['sku'] = Variable<String>(sku);
    }
    if (!nullToAbsent || barcode != null) {
      map['barcode'] = Variable<String>(barcode);
    }
    if (!nullToAbsent || openingStock != null) {
      map['opening_stock'] = Variable<int>(openingStock);
    }
    map['review_state'] = Variable<String>(reviewState);
    map['created_at_millis'] = Variable<int>(createdAtMillis);
    return map;
  }

  MenuImportDraftsCompanion toCompanion(bool nullToAbsent) {
    return MenuImportDraftsCompanion(
      id: Value(id),
      batchId: Value(batchId),
      category: Value(category),
      name: Value(name),
      description: Value(description),
      priceMmk: priceMmk == null && nullToAbsent
          ? const Value.absent()
          : Value(priceMmk),
      sku: sku == null && nullToAbsent ? const Value.absent() : Value(sku),
      barcode: barcode == null && nullToAbsent
          ? const Value.absent()
          : Value(barcode),
      openingStock: openingStock == null && nullToAbsent
          ? const Value.absent()
          : Value(openingStock),
      reviewState: Value(reviewState),
      createdAtMillis: Value(createdAtMillis),
    );
  }

  factory MenuImportDraft.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return MenuImportDraft(
      id: serializer.fromJson<String>(json['id']),
      batchId: serializer.fromJson<String>(json['batchId']),
      category: serializer.fromJson<String>(json['category']),
      name: serializer.fromJson<String>(json['name']),
      description: serializer.fromJson<String>(json['description']),
      priceMmk: serializer.fromJson<int?>(json['priceMmk']),
      sku: serializer.fromJson<String?>(json['sku']),
      barcode: serializer.fromJson<String?>(json['barcode']),
      openingStock: serializer.fromJson<int?>(json['openingStock']),
      reviewState: serializer.fromJson<String>(json['reviewState']),
      createdAtMillis: serializer.fromJson<int>(json['createdAtMillis']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'batchId': serializer.toJson<String>(batchId),
      'category': serializer.toJson<String>(category),
      'name': serializer.toJson<String>(name),
      'description': serializer.toJson<String>(description),
      'priceMmk': serializer.toJson<int?>(priceMmk),
      'sku': serializer.toJson<String?>(sku),
      'barcode': serializer.toJson<String?>(barcode),
      'openingStock': serializer.toJson<int?>(openingStock),
      'reviewState': serializer.toJson<String>(reviewState),
      'createdAtMillis': serializer.toJson<int>(createdAtMillis),
    };
  }

  MenuImportDraft copyWith({
    String? id,
    String? batchId,
    String? category,
    String? name,
    String? description,
    Value<int?> priceMmk = const Value.absent(),
    Value<String?> sku = const Value.absent(),
    Value<String?> barcode = const Value.absent(),
    Value<int?> openingStock = const Value.absent(),
    String? reviewState,
    int? createdAtMillis,
  }) => MenuImportDraft(
    id: id ?? this.id,
    batchId: batchId ?? this.batchId,
    category: category ?? this.category,
    name: name ?? this.name,
    description: description ?? this.description,
    priceMmk: priceMmk.present ? priceMmk.value : this.priceMmk,
    sku: sku.present ? sku.value : this.sku,
    barcode: barcode.present ? barcode.value : this.barcode,
    openingStock: openingStock.present ? openingStock.value : this.openingStock,
    reviewState: reviewState ?? this.reviewState,
    createdAtMillis: createdAtMillis ?? this.createdAtMillis,
  );
  MenuImportDraft copyWithCompanion(MenuImportDraftsCompanion data) {
    return MenuImportDraft(
      id: data.id.present ? data.id.value : this.id,
      batchId: data.batchId.present ? data.batchId.value : this.batchId,
      category: data.category.present ? data.category.value : this.category,
      name: data.name.present ? data.name.value : this.name,
      description: data.description.present
          ? data.description.value
          : this.description,
      priceMmk: data.priceMmk.present ? data.priceMmk.value : this.priceMmk,
      sku: data.sku.present ? data.sku.value : this.sku,
      barcode: data.barcode.present ? data.barcode.value : this.barcode,
      openingStock: data.openingStock.present
          ? data.openingStock.value
          : this.openingStock,
      reviewState: data.reviewState.present
          ? data.reviewState.value
          : this.reviewState,
      createdAtMillis: data.createdAtMillis.present
          ? data.createdAtMillis.value
          : this.createdAtMillis,
    );
  }

  @override
  String toString() {
    return (StringBuffer('MenuImportDraft(')
          ..write('id: $id, ')
          ..write('batchId: $batchId, ')
          ..write('category: $category, ')
          ..write('name: $name, ')
          ..write('description: $description, ')
          ..write('priceMmk: $priceMmk, ')
          ..write('sku: $sku, ')
          ..write('barcode: $barcode, ')
          ..write('openingStock: $openingStock, ')
          ..write('reviewState: $reviewState, ')
          ..write('createdAtMillis: $createdAtMillis')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    batchId,
    category,
    name,
    description,
    priceMmk,
    sku,
    barcode,
    openingStock,
    reviewState,
    createdAtMillis,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is MenuImportDraft &&
          other.id == this.id &&
          other.batchId == this.batchId &&
          other.category == this.category &&
          other.name == this.name &&
          other.description == this.description &&
          other.priceMmk == this.priceMmk &&
          other.sku == this.sku &&
          other.barcode == this.barcode &&
          other.openingStock == this.openingStock &&
          other.reviewState == this.reviewState &&
          other.createdAtMillis == this.createdAtMillis);
}

class MenuImportDraftsCompanion extends UpdateCompanion<MenuImportDraft> {
  final Value<String> id;
  final Value<String> batchId;
  final Value<String> category;
  final Value<String> name;
  final Value<String> description;
  final Value<int?> priceMmk;
  final Value<String?> sku;
  final Value<String?> barcode;
  final Value<int?> openingStock;
  final Value<String> reviewState;
  final Value<int> createdAtMillis;
  final Value<int> rowid;
  const MenuImportDraftsCompanion({
    this.id = const Value.absent(),
    this.batchId = const Value.absent(),
    this.category = const Value.absent(),
    this.name = const Value.absent(),
    this.description = const Value.absent(),
    this.priceMmk = const Value.absent(),
    this.sku = const Value.absent(),
    this.barcode = const Value.absent(),
    this.openingStock = const Value.absent(),
    this.reviewState = const Value.absent(),
    this.createdAtMillis = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  MenuImportDraftsCompanion.insert({
    required String id,
    required String batchId,
    required String category,
    required String name,
    this.description = const Value.absent(),
    this.priceMmk = const Value.absent(),
    this.sku = const Value.absent(),
    this.barcode = const Value.absent(),
    this.openingStock = const Value.absent(),
    this.reviewState = const Value.absent(),
    required int createdAtMillis,
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       batchId = Value(batchId),
       category = Value(category),
       name = Value(name),
       createdAtMillis = Value(createdAtMillis);
  static Insertable<MenuImportDraft> custom({
    Expression<String>? id,
    Expression<String>? batchId,
    Expression<String>? category,
    Expression<String>? name,
    Expression<String>? description,
    Expression<int>? priceMmk,
    Expression<String>? sku,
    Expression<String>? barcode,
    Expression<int>? openingStock,
    Expression<String>? reviewState,
    Expression<int>? createdAtMillis,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (batchId != null) 'batch_id': batchId,
      if (category != null) 'category': category,
      if (name != null) 'name': name,
      if (description != null) 'description': description,
      if (priceMmk != null) 'price_mmk': priceMmk,
      if (sku != null) 'sku': sku,
      if (barcode != null) 'barcode': barcode,
      if (openingStock != null) 'opening_stock': openingStock,
      if (reviewState != null) 'review_state': reviewState,
      if (createdAtMillis != null) 'created_at_millis': createdAtMillis,
      if (rowid != null) 'rowid': rowid,
    });
  }

  MenuImportDraftsCompanion copyWith({
    Value<String>? id,
    Value<String>? batchId,
    Value<String>? category,
    Value<String>? name,
    Value<String>? description,
    Value<int?>? priceMmk,
    Value<String?>? sku,
    Value<String?>? barcode,
    Value<int?>? openingStock,
    Value<String>? reviewState,
    Value<int>? createdAtMillis,
    Value<int>? rowid,
  }) {
    return MenuImportDraftsCompanion(
      id: id ?? this.id,
      batchId: batchId ?? this.batchId,
      category: category ?? this.category,
      name: name ?? this.name,
      description: description ?? this.description,
      priceMmk: priceMmk ?? this.priceMmk,
      sku: sku ?? this.sku,
      barcode: barcode ?? this.barcode,
      openingStock: openingStock ?? this.openingStock,
      reviewState: reviewState ?? this.reviewState,
      createdAtMillis: createdAtMillis ?? this.createdAtMillis,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (batchId.present) {
      map['batch_id'] = Variable<String>(batchId.value);
    }
    if (category.present) {
      map['category'] = Variable<String>(category.value);
    }
    if (name.present) {
      map['name'] = Variable<String>(name.value);
    }
    if (description.present) {
      map['description'] = Variable<String>(description.value);
    }
    if (priceMmk.present) {
      map['price_mmk'] = Variable<int>(priceMmk.value);
    }
    if (sku.present) {
      map['sku'] = Variable<String>(sku.value);
    }
    if (barcode.present) {
      map['barcode'] = Variable<String>(barcode.value);
    }
    if (openingStock.present) {
      map['opening_stock'] = Variable<int>(openingStock.value);
    }
    if (reviewState.present) {
      map['review_state'] = Variable<String>(reviewState.value);
    }
    if (createdAtMillis.present) {
      map['created_at_millis'] = Variable<int>(createdAtMillis.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('MenuImportDraftsCompanion(')
          ..write('id: $id, ')
          ..write('batchId: $batchId, ')
          ..write('category: $category, ')
          ..write('name: $name, ')
          ..write('description: $description, ')
          ..write('priceMmk: $priceMmk, ')
          ..write('sku: $sku, ')
          ..write('barcode: $barcode, ')
          ..write('openingStock: $openingStock, ')
          ..write('reviewState: $reviewState, ')
          ..write('createdAtMillis: $createdAtMillis, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $MerchantWalletProfilesTable extends MerchantWalletProfiles
    with TableInfo<$MerchantWalletProfilesTable, MerchantWalletProfile> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $MerchantWalletProfilesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _providerMeta = const VerificationMeta(
    'provider',
  );
  @override
  late final GeneratedColumn<String> provider = GeneratedColumn<String>(
    'provider',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _merchantPhoneMeta = const VerificationMeta(
    'merchantPhone',
  );
  @override
  late final GeneratedColumn<String> merchantPhone = GeneratedColumn<String>(
    'merchant_phone',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _officialQrPayloadMeta = const VerificationMeta(
    'officialQrPayload',
  );
  @override
  late final GeneratedColumn<String> officialQrPayload =
      GeneratedColumn<String>(
        'official_qr_payload',
        aliasedName,
        true,
        type: DriftSqlType.string,
        requiredDuringInsert: false,
      );
  static const VerificationMeta _issuerConfirmedMeta = const VerificationMeta(
    'issuerConfirmed',
  );
  @override
  late final GeneratedColumn<bool> issuerConfirmed = GeneratedColumn<bool>(
    'issuer_confirmed',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("issuer_confirmed" IN (0, 1))',
    ),
    defaultValue: const Constant(false),
  );
  static const VerificationMeta _updatedAtMillisMeta = const VerificationMeta(
    'updatedAtMillis',
  );
  @override
  late final GeneratedColumn<int> updatedAtMillis = GeneratedColumn<int>(
    'updated_at_millis',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    provider,
    merchantPhone,
    officialQrPayload,
    issuerConfirmed,
    updatedAtMillis,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'merchant_wallet_profiles';
  @override
  VerificationContext validateIntegrity(
    Insertable<MerchantWalletProfile> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('provider')) {
      context.handle(
        _providerMeta,
        provider.isAcceptableOrUnknown(data['provider']!, _providerMeta),
      );
    } else if (isInserting) {
      context.missing(_providerMeta);
    }
    if (data.containsKey('merchant_phone')) {
      context.handle(
        _merchantPhoneMeta,
        merchantPhone.isAcceptableOrUnknown(
          data['merchant_phone']!,
          _merchantPhoneMeta,
        ),
      );
    }
    if (data.containsKey('official_qr_payload')) {
      context.handle(
        _officialQrPayloadMeta,
        officialQrPayload.isAcceptableOrUnknown(
          data['official_qr_payload']!,
          _officialQrPayloadMeta,
        ),
      );
    }
    if (data.containsKey('issuer_confirmed')) {
      context.handle(
        _issuerConfirmedMeta,
        issuerConfirmed.isAcceptableOrUnknown(
          data['issuer_confirmed']!,
          _issuerConfirmedMeta,
        ),
      );
    }
    if (data.containsKey('updated_at_millis')) {
      context.handle(
        _updatedAtMillisMeta,
        updatedAtMillis.isAcceptableOrUnknown(
          data['updated_at_millis']!,
          _updatedAtMillisMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_updatedAtMillisMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {provider};
  @override
  MerchantWalletProfile map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return MerchantWalletProfile(
      provider: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}provider'],
      )!,
      merchantPhone: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}merchant_phone'],
      ),
      officialQrPayload: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}official_qr_payload'],
      ),
      issuerConfirmed: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}issuer_confirmed'],
      )!,
      updatedAtMillis: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}updated_at_millis'],
      )!,
    );
  }

  @override
  $MerchantWalletProfilesTable createAlias(String alias) {
    return $MerchantWalletProfilesTable(attachedDatabase, alias);
  }
}

class MerchantWalletProfile extends DataClass
    implements Insertable<MerchantWalletProfile> {
  final String provider;
  final String? merchantPhone;
  final String? officialQrPayload;
  final bool issuerConfirmed;
  final int updatedAtMillis;
  const MerchantWalletProfile({
    required this.provider,
    this.merchantPhone,
    this.officialQrPayload,
    required this.issuerConfirmed,
    required this.updatedAtMillis,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['provider'] = Variable<String>(provider);
    if (!nullToAbsent || merchantPhone != null) {
      map['merchant_phone'] = Variable<String>(merchantPhone);
    }
    if (!nullToAbsent || officialQrPayload != null) {
      map['official_qr_payload'] = Variable<String>(officialQrPayload);
    }
    map['issuer_confirmed'] = Variable<bool>(issuerConfirmed);
    map['updated_at_millis'] = Variable<int>(updatedAtMillis);
    return map;
  }

  MerchantWalletProfilesCompanion toCompanion(bool nullToAbsent) {
    return MerchantWalletProfilesCompanion(
      provider: Value(provider),
      merchantPhone: merchantPhone == null && nullToAbsent
          ? const Value.absent()
          : Value(merchantPhone),
      officialQrPayload: officialQrPayload == null && nullToAbsent
          ? const Value.absent()
          : Value(officialQrPayload),
      issuerConfirmed: Value(issuerConfirmed),
      updatedAtMillis: Value(updatedAtMillis),
    );
  }

  factory MerchantWalletProfile.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return MerchantWalletProfile(
      provider: serializer.fromJson<String>(json['provider']),
      merchantPhone: serializer.fromJson<String?>(json['merchantPhone']),
      officialQrPayload: serializer.fromJson<String?>(
        json['officialQrPayload'],
      ),
      issuerConfirmed: serializer.fromJson<bool>(json['issuerConfirmed']),
      updatedAtMillis: serializer.fromJson<int>(json['updatedAtMillis']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'provider': serializer.toJson<String>(provider),
      'merchantPhone': serializer.toJson<String?>(merchantPhone),
      'officialQrPayload': serializer.toJson<String?>(officialQrPayload),
      'issuerConfirmed': serializer.toJson<bool>(issuerConfirmed),
      'updatedAtMillis': serializer.toJson<int>(updatedAtMillis),
    };
  }

  MerchantWalletProfile copyWith({
    String? provider,
    Value<String?> merchantPhone = const Value.absent(),
    Value<String?> officialQrPayload = const Value.absent(),
    bool? issuerConfirmed,
    int? updatedAtMillis,
  }) => MerchantWalletProfile(
    provider: provider ?? this.provider,
    merchantPhone: merchantPhone.present
        ? merchantPhone.value
        : this.merchantPhone,
    officialQrPayload: officialQrPayload.present
        ? officialQrPayload.value
        : this.officialQrPayload,
    issuerConfirmed: issuerConfirmed ?? this.issuerConfirmed,
    updatedAtMillis: updatedAtMillis ?? this.updatedAtMillis,
  );
  MerchantWalletProfile copyWithCompanion(
    MerchantWalletProfilesCompanion data,
  ) {
    return MerchantWalletProfile(
      provider: data.provider.present ? data.provider.value : this.provider,
      merchantPhone: data.merchantPhone.present
          ? data.merchantPhone.value
          : this.merchantPhone,
      officialQrPayload: data.officialQrPayload.present
          ? data.officialQrPayload.value
          : this.officialQrPayload,
      issuerConfirmed: data.issuerConfirmed.present
          ? data.issuerConfirmed.value
          : this.issuerConfirmed,
      updatedAtMillis: data.updatedAtMillis.present
          ? data.updatedAtMillis.value
          : this.updatedAtMillis,
    );
  }

  @override
  String toString() {
    return (StringBuffer('MerchantWalletProfile(')
          ..write('provider: $provider, ')
          ..write('merchantPhone: $merchantPhone, ')
          ..write('officialQrPayload: $officialQrPayload, ')
          ..write('issuerConfirmed: $issuerConfirmed, ')
          ..write('updatedAtMillis: $updatedAtMillis')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    provider,
    merchantPhone,
    officialQrPayload,
    issuerConfirmed,
    updatedAtMillis,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is MerchantWalletProfile &&
          other.provider == this.provider &&
          other.merchantPhone == this.merchantPhone &&
          other.officialQrPayload == this.officialQrPayload &&
          other.issuerConfirmed == this.issuerConfirmed &&
          other.updatedAtMillis == this.updatedAtMillis);
}

class MerchantWalletProfilesCompanion
    extends UpdateCompanion<MerchantWalletProfile> {
  final Value<String> provider;
  final Value<String?> merchantPhone;
  final Value<String?> officialQrPayload;
  final Value<bool> issuerConfirmed;
  final Value<int> updatedAtMillis;
  final Value<int> rowid;
  const MerchantWalletProfilesCompanion({
    this.provider = const Value.absent(),
    this.merchantPhone = const Value.absent(),
    this.officialQrPayload = const Value.absent(),
    this.issuerConfirmed = const Value.absent(),
    this.updatedAtMillis = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  MerchantWalletProfilesCompanion.insert({
    required String provider,
    this.merchantPhone = const Value.absent(),
    this.officialQrPayload = const Value.absent(),
    this.issuerConfirmed = const Value.absent(),
    required int updatedAtMillis,
    this.rowid = const Value.absent(),
  }) : provider = Value(provider),
       updatedAtMillis = Value(updatedAtMillis);
  static Insertable<MerchantWalletProfile> custom({
    Expression<String>? provider,
    Expression<String>? merchantPhone,
    Expression<String>? officialQrPayload,
    Expression<bool>? issuerConfirmed,
    Expression<int>? updatedAtMillis,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (provider != null) 'provider': provider,
      if (merchantPhone != null) 'merchant_phone': merchantPhone,
      if (officialQrPayload != null) 'official_qr_payload': officialQrPayload,
      if (issuerConfirmed != null) 'issuer_confirmed': issuerConfirmed,
      if (updatedAtMillis != null) 'updated_at_millis': updatedAtMillis,
      if (rowid != null) 'rowid': rowid,
    });
  }

  MerchantWalletProfilesCompanion copyWith({
    Value<String>? provider,
    Value<String?>? merchantPhone,
    Value<String?>? officialQrPayload,
    Value<bool>? issuerConfirmed,
    Value<int>? updatedAtMillis,
    Value<int>? rowid,
  }) {
    return MerchantWalletProfilesCompanion(
      provider: provider ?? this.provider,
      merchantPhone: merchantPhone ?? this.merchantPhone,
      officialQrPayload: officialQrPayload ?? this.officialQrPayload,
      issuerConfirmed: issuerConfirmed ?? this.issuerConfirmed,
      updatedAtMillis: updatedAtMillis ?? this.updatedAtMillis,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (provider.present) {
      map['provider'] = Variable<String>(provider.value);
    }
    if (merchantPhone.present) {
      map['merchant_phone'] = Variable<String>(merchantPhone.value);
    }
    if (officialQrPayload.present) {
      map['official_qr_payload'] = Variable<String>(officialQrPayload.value);
    }
    if (issuerConfirmed.present) {
      map['issuer_confirmed'] = Variable<bool>(issuerConfirmed.value);
    }
    if (updatedAtMillis.present) {
      map['updated_at_millis'] = Variable<int>(updatedAtMillis.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('MerchantWalletProfilesCompanion(')
          ..write('provider: $provider, ')
          ..write('merchantPhone: $merchantPhone, ')
          ..write('officialQrPayload: $officialQrPayload, ')
          ..write('issuerConfirmed: $issuerConfirmed, ')
          ..write('updatedAtMillis: $updatedAtMillis, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $ShopProductsTable extends ShopProducts
    with TableInfo<$ShopProductsTable, ShopProduct> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $ShopProductsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _nameMeta = const VerificationMeta('name');
  @override
  late final GeneratedColumn<String> name = GeneratedColumn<String>(
    'name',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _categoryMeta = const VerificationMeta(
    'category',
  );
  @override
  late final GeneratedColumn<String> category = GeneratedColumn<String>(
    'category',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant(''),
  );
  static const VerificationMeta _descriptionMeta = const VerificationMeta(
    'description',
  );
  @override
  late final GeneratedColumn<String> description = GeneratedColumn<String>(
    'description',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant(''),
  );
  static const VerificationMeta _skuMeta = const VerificationMeta('sku');
  @override
  late final GeneratedColumn<String> sku = GeneratedColumn<String>(
    'sku',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _barcodeMeta = const VerificationMeta(
    'barcode',
  );
  @override
  late final GeneratedColumn<String> barcode = GeneratedColumn<String>(
    'barcode',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _priceMmkMeta = const VerificationMeta(
    'priceMmk',
  );
  @override
  late final GeneratedColumn<int> priceMmk = GeneratedColumn<int>(
    'price_mmk',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _onHandMeta = const VerificationMeta('onHand');
  @override
  late final GeneratedColumn<int> onHand = GeneratedColumn<int>(
    'on_hand',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _updatedAtMillisMeta = const VerificationMeta(
    'updatedAtMillis',
  );
  @override
  late final GeneratedColumn<int> updatedAtMillis = GeneratedColumn<int>(
    'updated_at_millis',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _archivedMeta = const VerificationMeta(
    'archived',
  );
  @override
  late final GeneratedColumn<bool> archived = GeneratedColumn<bool>(
    'archived',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("archived" IN (0, 1))',
    ),
    defaultValue: const Constant(false),
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    name,
    category,
    description,
    sku,
    barcode,
    priceMmk,
    onHand,
    updatedAtMillis,
    archived,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'shop_products';
  @override
  VerificationContext validateIntegrity(
    Insertable<ShopProduct> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('name')) {
      context.handle(
        _nameMeta,
        name.isAcceptableOrUnknown(data['name']!, _nameMeta),
      );
    } else if (isInserting) {
      context.missing(_nameMeta);
    }
    if (data.containsKey('category')) {
      context.handle(
        _categoryMeta,
        category.isAcceptableOrUnknown(data['category']!, _categoryMeta),
      );
    }
    if (data.containsKey('description')) {
      context.handle(
        _descriptionMeta,
        description.isAcceptableOrUnknown(
          data['description']!,
          _descriptionMeta,
        ),
      );
    }
    if (data.containsKey('sku')) {
      context.handle(
        _skuMeta,
        sku.isAcceptableOrUnknown(data['sku']!, _skuMeta),
      );
    }
    if (data.containsKey('barcode')) {
      context.handle(
        _barcodeMeta,
        barcode.isAcceptableOrUnknown(data['barcode']!, _barcodeMeta),
      );
    }
    if (data.containsKey('price_mmk')) {
      context.handle(
        _priceMmkMeta,
        priceMmk.isAcceptableOrUnknown(data['price_mmk']!, _priceMmkMeta),
      );
    } else if (isInserting) {
      context.missing(_priceMmkMeta);
    }
    if (data.containsKey('on_hand')) {
      context.handle(
        _onHandMeta,
        onHand.isAcceptableOrUnknown(data['on_hand']!, _onHandMeta),
      );
    } else if (isInserting) {
      context.missing(_onHandMeta);
    }
    if (data.containsKey('updated_at_millis')) {
      context.handle(
        _updatedAtMillisMeta,
        updatedAtMillis.isAcceptableOrUnknown(
          data['updated_at_millis']!,
          _updatedAtMillisMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_updatedAtMillisMeta);
    }
    if (data.containsKey('archived')) {
      context.handle(
        _archivedMeta,
        archived.isAcceptableOrUnknown(data['archived']!, _archivedMeta),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  ShopProduct map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return ShopProduct(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      name: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}name'],
      )!,
      category: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}category'],
      )!,
      description: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}description'],
      )!,
      sku: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}sku'],
      ),
      barcode: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}barcode'],
      ),
      priceMmk: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}price_mmk'],
      )!,
      onHand: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}on_hand'],
      )!,
      updatedAtMillis: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}updated_at_millis'],
      )!,
      archived: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}archived'],
      )!,
    );
  }

  @override
  $ShopProductsTable createAlias(String alias) {
    return $ShopProductsTable(attachedDatabase, alias);
  }
}

class ShopProduct extends DataClass implements Insertable<ShopProduct> {
  final String id;
  final String name;
  final String category;
  final String description;
  final String? sku;
  final String? barcode;
  final int priceMmk;
  final int onHand;
  final int updatedAtMillis;
  final bool archived;
  const ShopProduct({
    required this.id,
    required this.name,
    required this.category,
    required this.description,
    this.sku,
    this.barcode,
    required this.priceMmk,
    required this.onHand,
    required this.updatedAtMillis,
    required this.archived,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['name'] = Variable<String>(name);
    map['category'] = Variable<String>(category);
    map['description'] = Variable<String>(description);
    if (!nullToAbsent || sku != null) {
      map['sku'] = Variable<String>(sku);
    }
    if (!nullToAbsent || barcode != null) {
      map['barcode'] = Variable<String>(barcode);
    }
    map['price_mmk'] = Variable<int>(priceMmk);
    map['on_hand'] = Variable<int>(onHand);
    map['updated_at_millis'] = Variable<int>(updatedAtMillis);
    map['archived'] = Variable<bool>(archived);
    return map;
  }

  ShopProductsCompanion toCompanion(bool nullToAbsent) {
    return ShopProductsCompanion(
      id: Value(id),
      name: Value(name),
      category: Value(category),
      description: Value(description),
      sku: sku == null && nullToAbsent ? const Value.absent() : Value(sku),
      barcode: barcode == null && nullToAbsent
          ? const Value.absent()
          : Value(barcode),
      priceMmk: Value(priceMmk),
      onHand: Value(onHand),
      updatedAtMillis: Value(updatedAtMillis),
      archived: Value(archived),
    );
  }

  factory ShopProduct.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return ShopProduct(
      id: serializer.fromJson<String>(json['id']),
      name: serializer.fromJson<String>(json['name']),
      category: serializer.fromJson<String>(json['category']),
      description: serializer.fromJson<String>(json['description']),
      sku: serializer.fromJson<String?>(json['sku']),
      barcode: serializer.fromJson<String?>(json['barcode']),
      priceMmk: serializer.fromJson<int>(json['priceMmk']),
      onHand: serializer.fromJson<int>(json['onHand']),
      updatedAtMillis: serializer.fromJson<int>(json['updatedAtMillis']),
      archived: serializer.fromJson<bool>(json['archived']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'name': serializer.toJson<String>(name),
      'category': serializer.toJson<String>(category),
      'description': serializer.toJson<String>(description),
      'sku': serializer.toJson<String?>(sku),
      'barcode': serializer.toJson<String?>(barcode),
      'priceMmk': serializer.toJson<int>(priceMmk),
      'onHand': serializer.toJson<int>(onHand),
      'updatedAtMillis': serializer.toJson<int>(updatedAtMillis),
      'archived': serializer.toJson<bool>(archived),
    };
  }

  ShopProduct copyWith({
    String? id,
    String? name,
    String? category,
    String? description,
    Value<String?> sku = const Value.absent(),
    Value<String?> barcode = const Value.absent(),
    int? priceMmk,
    int? onHand,
    int? updatedAtMillis,
    bool? archived,
  }) => ShopProduct(
    id: id ?? this.id,
    name: name ?? this.name,
    category: category ?? this.category,
    description: description ?? this.description,
    sku: sku.present ? sku.value : this.sku,
    barcode: barcode.present ? barcode.value : this.barcode,
    priceMmk: priceMmk ?? this.priceMmk,
    onHand: onHand ?? this.onHand,
    updatedAtMillis: updatedAtMillis ?? this.updatedAtMillis,
    archived: archived ?? this.archived,
  );
  ShopProduct copyWithCompanion(ShopProductsCompanion data) {
    return ShopProduct(
      id: data.id.present ? data.id.value : this.id,
      name: data.name.present ? data.name.value : this.name,
      category: data.category.present ? data.category.value : this.category,
      description: data.description.present
          ? data.description.value
          : this.description,
      sku: data.sku.present ? data.sku.value : this.sku,
      barcode: data.barcode.present ? data.barcode.value : this.barcode,
      priceMmk: data.priceMmk.present ? data.priceMmk.value : this.priceMmk,
      onHand: data.onHand.present ? data.onHand.value : this.onHand,
      updatedAtMillis: data.updatedAtMillis.present
          ? data.updatedAtMillis.value
          : this.updatedAtMillis,
      archived: data.archived.present ? data.archived.value : this.archived,
    );
  }

  @override
  String toString() {
    return (StringBuffer('ShopProduct(')
          ..write('id: $id, ')
          ..write('name: $name, ')
          ..write('category: $category, ')
          ..write('description: $description, ')
          ..write('sku: $sku, ')
          ..write('barcode: $barcode, ')
          ..write('priceMmk: $priceMmk, ')
          ..write('onHand: $onHand, ')
          ..write('updatedAtMillis: $updatedAtMillis, ')
          ..write('archived: $archived')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    name,
    category,
    description,
    sku,
    barcode,
    priceMmk,
    onHand,
    updatedAtMillis,
    archived,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is ShopProduct &&
          other.id == this.id &&
          other.name == this.name &&
          other.category == this.category &&
          other.description == this.description &&
          other.sku == this.sku &&
          other.barcode == this.barcode &&
          other.priceMmk == this.priceMmk &&
          other.onHand == this.onHand &&
          other.updatedAtMillis == this.updatedAtMillis &&
          other.archived == this.archived);
}

class ShopProductsCompanion extends UpdateCompanion<ShopProduct> {
  final Value<String> id;
  final Value<String> name;
  final Value<String> category;
  final Value<String> description;
  final Value<String?> sku;
  final Value<String?> barcode;
  final Value<int> priceMmk;
  final Value<int> onHand;
  final Value<int> updatedAtMillis;
  final Value<bool> archived;
  final Value<int> rowid;
  const ShopProductsCompanion({
    this.id = const Value.absent(),
    this.name = const Value.absent(),
    this.category = const Value.absent(),
    this.description = const Value.absent(),
    this.sku = const Value.absent(),
    this.barcode = const Value.absent(),
    this.priceMmk = const Value.absent(),
    this.onHand = const Value.absent(),
    this.updatedAtMillis = const Value.absent(),
    this.archived = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  ShopProductsCompanion.insert({
    required String id,
    required String name,
    this.category = const Value.absent(),
    this.description = const Value.absent(),
    this.sku = const Value.absent(),
    this.barcode = const Value.absent(),
    required int priceMmk,
    required int onHand,
    required int updatedAtMillis,
    this.archived = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       name = Value(name),
       priceMmk = Value(priceMmk),
       onHand = Value(onHand),
       updatedAtMillis = Value(updatedAtMillis);
  static Insertable<ShopProduct> custom({
    Expression<String>? id,
    Expression<String>? name,
    Expression<String>? category,
    Expression<String>? description,
    Expression<String>? sku,
    Expression<String>? barcode,
    Expression<int>? priceMmk,
    Expression<int>? onHand,
    Expression<int>? updatedAtMillis,
    Expression<bool>? archived,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (name != null) 'name': name,
      if (category != null) 'category': category,
      if (description != null) 'description': description,
      if (sku != null) 'sku': sku,
      if (barcode != null) 'barcode': barcode,
      if (priceMmk != null) 'price_mmk': priceMmk,
      if (onHand != null) 'on_hand': onHand,
      if (updatedAtMillis != null) 'updated_at_millis': updatedAtMillis,
      if (archived != null) 'archived': archived,
      if (rowid != null) 'rowid': rowid,
    });
  }

  ShopProductsCompanion copyWith({
    Value<String>? id,
    Value<String>? name,
    Value<String>? category,
    Value<String>? description,
    Value<String?>? sku,
    Value<String?>? barcode,
    Value<int>? priceMmk,
    Value<int>? onHand,
    Value<int>? updatedAtMillis,
    Value<bool>? archived,
    Value<int>? rowid,
  }) {
    return ShopProductsCompanion(
      id: id ?? this.id,
      name: name ?? this.name,
      category: category ?? this.category,
      description: description ?? this.description,
      sku: sku ?? this.sku,
      barcode: barcode ?? this.barcode,
      priceMmk: priceMmk ?? this.priceMmk,
      onHand: onHand ?? this.onHand,
      updatedAtMillis: updatedAtMillis ?? this.updatedAtMillis,
      archived: archived ?? this.archived,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (name.present) {
      map['name'] = Variable<String>(name.value);
    }
    if (category.present) {
      map['category'] = Variable<String>(category.value);
    }
    if (description.present) {
      map['description'] = Variable<String>(description.value);
    }
    if (sku.present) {
      map['sku'] = Variable<String>(sku.value);
    }
    if (barcode.present) {
      map['barcode'] = Variable<String>(barcode.value);
    }
    if (priceMmk.present) {
      map['price_mmk'] = Variable<int>(priceMmk.value);
    }
    if (onHand.present) {
      map['on_hand'] = Variable<int>(onHand.value);
    }
    if (updatedAtMillis.present) {
      map['updated_at_millis'] = Variable<int>(updatedAtMillis.value);
    }
    if (archived.present) {
      map['archived'] = Variable<bool>(archived.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('ShopProductsCompanion(')
          ..write('id: $id, ')
          ..write('name: $name, ')
          ..write('category: $category, ')
          ..write('description: $description, ')
          ..write('sku: $sku, ')
          ..write('barcode: $barcode, ')
          ..write('priceMmk: $priceMmk, ')
          ..write('onHand: $onHand, ')
          ..write('updatedAtMillis: $updatedAtMillis, ')
          ..write('archived: $archived, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $ShopSalesTable extends ShopSales
    with TableInfo<$ShopSalesTable, ShopSale> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $ShopSalesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _operationIdMeta = const VerificationMeta(
    'operationId',
  );
  @override
  late final GeneratedColumn<String> operationId = GeneratedColumn<String>(
    'operation_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
    defaultConstraints: GeneratedColumn.constraintIsAlways('UNIQUE'),
  );
  static const VerificationMeta _requestFingerprintMeta =
      const VerificationMeta('requestFingerprint');
  @override
  late final GeneratedColumn<String> requestFingerprint =
      GeneratedColumn<String>(
        'request_fingerprint',
        aliasedName,
        false,
        type: DriftSqlType.string,
        requiredDuringInsert: true,
      );
  static const VerificationMeta _totalMmkMeta = const VerificationMeta(
    'totalMmk',
  );
  @override
  late final GeneratedColumn<int> totalMmk = GeneratedColumn<int>(
    'total_mmk',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _paymentMethodMeta = const VerificationMeta(
    'paymentMethod',
  );
  @override
  late final GeneratedColumn<String> paymentMethod = GeneratedColumn<String>(
    'payment_method',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('cash'),
  );
  static const VerificationMeta _createdAtMillisMeta = const VerificationMeta(
    'createdAtMillis',
  );
  @override
  late final GeneratedColumn<int> createdAtMillis = GeneratedColumn<int>(
    'created_at_millis',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    operationId,
    requestFingerprint,
    totalMmk,
    paymentMethod,
    createdAtMillis,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'shop_sales';
  @override
  VerificationContext validateIntegrity(
    Insertable<ShopSale> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('operation_id')) {
      context.handle(
        _operationIdMeta,
        operationId.isAcceptableOrUnknown(
          data['operation_id']!,
          _operationIdMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_operationIdMeta);
    }
    if (data.containsKey('request_fingerprint')) {
      context.handle(
        _requestFingerprintMeta,
        requestFingerprint.isAcceptableOrUnknown(
          data['request_fingerprint']!,
          _requestFingerprintMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_requestFingerprintMeta);
    }
    if (data.containsKey('total_mmk')) {
      context.handle(
        _totalMmkMeta,
        totalMmk.isAcceptableOrUnknown(data['total_mmk']!, _totalMmkMeta),
      );
    } else if (isInserting) {
      context.missing(_totalMmkMeta);
    }
    if (data.containsKey('payment_method')) {
      context.handle(
        _paymentMethodMeta,
        paymentMethod.isAcceptableOrUnknown(
          data['payment_method']!,
          _paymentMethodMeta,
        ),
      );
    }
    if (data.containsKey('created_at_millis')) {
      context.handle(
        _createdAtMillisMeta,
        createdAtMillis.isAcceptableOrUnknown(
          data['created_at_millis']!,
          _createdAtMillisMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_createdAtMillisMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  ShopSale map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return ShopSale(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      operationId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}operation_id'],
      )!,
      requestFingerprint: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}request_fingerprint'],
      )!,
      totalMmk: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}total_mmk'],
      )!,
      paymentMethod: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}payment_method'],
      )!,
      createdAtMillis: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}created_at_millis'],
      )!,
    );
  }

  @override
  $ShopSalesTable createAlias(String alias) {
    return $ShopSalesTable(attachedDatabase, alias);
  }
}

class ShopSale extends DataClass implements Insertable<ShopSale> {
  final String id;
  final String operationId;
  final String requestFingerprint;
  final int totalMmk;
  final String paymentMethod;
  final int createdAtMillis;
  const ShopSale({
    required this.id,
    required this.operationId,
    required this.requestFingerprint,
    required this.totalMmk,
    required this.paymentMethod,
    required this.createdAtMillis,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['operation_id'] = Variable<String>(operationId);
    map['request_fingerprint'] = Variable<String>(requestFingerprint);
    map['total_mmk'] = Variable<int>(totalMmk);
    map['payment_method'] = Variable<String>(paymentMethod);
    map['created_at_millis'] = Variable<int>(createdAtMillis);
    return map;
  }

  ShopSalesCompanion toCompanion(bool nullToAbsent) {
    return ShopSalesCompanion(
      id: Value(id),
      operationId: Value(operationId),
      requestFingerprint: Value(requestFingerprint),
      totalMmk: Value(totalMmk),
      paymentMethod: Value(paymentMethod),
      createdAtMillis: Value(createdAtMillis),
    );
  }

  factory ShopSale.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return ShopSale(
      id: serializer.fromJson<String>(json['id']),
      operationId: serializer.fromJson<String>(json['operationId']),
      requestFingerprint: serializer.fromJson<String>(
        json['requestFingerprint'],
      ),
      totalMmk: serializer.fromJson<int>(json['totalMmk']),
      paymentMethod: serializer.fromJson<String>(json['paymentMethod']),
      createdAtMillis: serializer.fromJson<int>(json['createdAtMillis']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'operationId': serializer.toJson<String>(operationId),
      'requestFingerprint': serializer.toJson<String>(requestFingerprint),
      'totalMmk': serializer.toJson<int>(totalMmk),
      'paymentMethod': serializer.toJson<String>(paymentMethod),
      'createdAtMillis': serializer.toJson<int>(createdAtMillis),
    };
  }

  ShopSale copyWith({
    String? id,
    String? operationId,
    String? requestFingerprint,
    int? totalMmk,
    String? paymentMethod,
    int? createdAtMillis,
  }) => ShopSale(
    id: id ?? this.id,
    operationId: operationId ?? this.operationId,
    requestFingerprint: requestFingerprint ?? this.requestFingerprint,
    totalMmk: totalMmk ?? this.totalMmk,
    paymentMethod: paymentMethod ?? this.paymentMethod,
    createdAtMillis: createdAtMillis ?? this.createdAtMillis,
  );
  ShopSale copyWithCompanion(ShopSalesCompanion data) {
    return ShopSale(
      id: data.id.present ? data.id.value : this.id,
      operationId: data.operationId.present
          ? data.operationId.value
          : this.operationId,
      requestFingerprint: data.requestFingerprint.present
          ? data.requestFingerprint.value
          : this.requestFingerprint,
      totalMmk: data.totalMmk.present ? data.totalMmk.value : this.totalMmk,
      paymentMethod: data.paymentMethod.present
          ? data.paymentMethod.value
          : this.paymentMethod,
      createdAtMillis: data.createdAtMillis.present
          ? data.createdAtMillis.value
          : this.createdAtMillis,
    );
  }

  @override
  String toString() {
    return (StringBuffer('ShopSale(')
          ..write('id: $id, ')
          ..write('operationId: $operationId, ')
          ..write('requestFingerprint: $requestFingerprint, ')
          ..write('totalMmk: $totalMmk, ')
          ..write('paymentMethod: $paymentMethod, ')
          ..write('createdAtMillis: $createdAtMillis')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    operationId,
    requestFingerprint,
    totalMmk,
    paymentMethod,
    createdAtMillis,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is ShopSale &&
          other.id == this.id &&
          other.operationId == this.operationId &&
          other.requestFingerprint == this.requestFingerprint &&
          other.totalMmk == this.totalMmk &&
          other.paymentMethod == this.paymentMethod &&
          other.createdAtMillis == this.createdAtMillis);
}

class ShopSalesCompanion extends UpdateCompanion<ShopSale> {
  final Value<String> id;
  final Value<String> operationId;
  final Value<String> requestFingerprint;
  final Value<int> totalMmk;
  final Value<String> paymentMethod;
  final Value<int> createdAtMillis;
  final Value<int> rowid;
  const ShopSalesCompanion({
    this.id = const Value.absent(),
    this.operationId = const Value.absent(),
    this.requestFingerprint = const Value.absent(),
    this.totalMmk = const Value.absent(),
    this.paymentMethod = const Value.absent(),
    this.createdAtMillis = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  ShopSalesCompanion.insert({
    required String id,
    required String operationId,
    required String requestFingerprint,
    required int totalMmk,
    this.paymentMethod = const Value.absent(),
    required int createdAtMillis,
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       operationId = Value(operationId),
       requestFingerprint = Value(requestFingerprint),
       totalMmk = Value(totalMmk),
       createdAtMillis = Value(createdAtMillis);
  static Insertable<ShopSale> custom({
    Expression<String>? id,
    Expression<String>? operationId,
    Expression<String>? requestFingerprint,
    Expression<int>? totalMmk,
    Expression<String>? paymentMethod,
    Expression<int>? createdAtMillis,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (operationId != null) 'operation_id': operationId,
      if (requestFingerprint != null) 'request_fingerprint': requestFingerprint,
      if (totalMmk != null) 'total_mmk': totalMmk,
      if (paymentMethod != null) 'payment_method': paymentMethod,
      if (createdAtMillis != null) 'created_at_millis': createdAtMillis,
      if (rowid != null) 'rowid': rowid,
    });
  }

  ShopSalesCompanion copyWith({
    Value<String>? id,
    Value<String>? operationId,
    Value<String>? requestFingerprint,
    Value<int>? totalMmk,
    Value<String>? paymentMethod,
    Value<int>? createdAtMillis,
    Value<int>? rowid,
  }) {
    return ShopSalesCompanion(
      id: id ?? this.id,
      operationId: operationId ?? this.operationId,
      requestFingerprint: requestFingerprint ?? this.requestFingerprint,
      totalMmk: totalMmk ?? this.totalMmk,
      paymentMethod: paymentMethod ?? this.paymentMethod,
      createdAtMillis: createdAtMillis ?? this.createdAtMillis,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (operationId.present) {
      map['operation_id'] = Variable<String>(operationId.value);
    }
    if (requestFingerprint.present) {
      map['request_fingerprint'] = Variable<String>(requestFingerprint.value);
    }
    if (totalMmk.present) {
      map['total_mmk'] = Variable<int>(totalMmk.value);
    }
    if (paymentMethod.present) {
      map['payment_method'] = Variable<String>(paymentMethod.value);
    }
    if (createdAtMillis.present) {
      map['created_at_millis'] = Variable<int>(createdAtMillis.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('ShopSalesCompanion(')
          ..write('id: $id, ')
          ..write('operationId: $operationId, ')
          ..write('requestFingerprint: $requestFingerprint, ')
          ..write('totalMmk: $totalMmk, ')
          ..write('paymentMethod: $paymentMethod, ')
          ..write('createdAtMillis: $createdAtMillis, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $ShopSaleLinesTable extends ShopSaleLines
    with TableInfo<$ShopSaleLinesTable, ShopSaleLine> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $ShopSaleLinesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _saleIdMeta = const VerificationMeta('saleId');
  @override
  late final GeneratedColumn<String> saleId = GeneratedColumn<String>(
    'sale_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'REFERENCES shop_sales (id)',
    ),
  );
  static const VerificationMeta _productIdMeta = const VerificationMeta(
    'productId',
  );
  @override
  late final GeneratedColumn<String> productId = GeneratedColumn<String>(
    'product_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'REFERENCES shop_products (id)',
    ),
  );
  static const VerificationMeta _productNameMeta = const VerificationMeta(
    'productName',
  );
  @override
  late final GeneratedColumn<String> productName = GeneratedColumn<String>(
    'product_name',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _unitPriceMmkMeta = const VerificationMeta(
    'unitPriceMmk',
  );
  @override
  late final GeneratedColumn<int> unitPriceMmk = GeneratedColumn<int>(
    'unit_price_mmk',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _quantityMeta = const VerificationMeta(
    'quantity',
  );
  @override
  late final GeneratedColumn<int> quantity = GeneratedColumn<int>(
    'quantity',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _lineTotalMmkMeta = const VerificationMeta(
    'lineTotalMmk',
  );
  @override
  late final GeneratedColumn<int> lineTotalMmk = GeneratedColumn<int>(
    'line_total_mmk',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    saleId,
    productId,
    productName,
    unitPriceMmk,
    quantity,
    lineTotalMmk,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'shop_sale_lines';
  @override
  VerificationContext validateIntegrity(
    Insertable<ShopSaleLine> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('sale_id')) {
      context.handle(
        _saleIdMeta,
        saleId.isAcceptableOrUnknown(data['sale_id']!, _saleIdMeta),
      );
    } else if (isInserting) {
      context.missing(_saleIdMeta);
    }
    if (data.containsKey('product_id')) {
      context.handle(
        _productIdMeta,
        productId.isAcceptableOrUnknown(data['product_id']!, _productIdMeta),
      );
    } else if (isInserting) {
      context.missing(_productIdMeta);
    }
    if (data.containsKey('product_name')) {
      context.handle(
        _productNameMeta,
        productName.isAcceptableOrUnknown(
          data['product_name']!,
          _productNameMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_productNameMeta);
    }
    if (data.containsKey('unit_price_mmk')) {
      context.handle(
        _unitPriceMmkMeta,
        unitPriceMmk.isAcceptableOrUnknown(
          data['unit_price_mmk']!,
          _unitPriceMmkMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_unitPriceMmkMeta);
    }
    if (data.containsKey('quantity')) {
      context.handle(
        _quantityMeta,
        quantity.isAcceptableOrUnknown(data['quantity']!, _quantityMeta),
      );
    } else if (isInserting) {
      context.missing(_quantityMeta);
    }
    if (data.containsKey('line_total_mmk')) {
      context.handle(
        _lineTotalMmkMeta,
        lineTotalMmk.isAcceptableOrUnknown(
          data['line_total_mmk']!,
          _lineTotalMmkMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_lineTotalMmkMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  ShopSaleLine map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return ShopSaleLine(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      saleId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}sale_id'],
      )!,
      productId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}product_id'],
      )!,
      productName: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}product_name'],
      )!,
      unitPriceMmk: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}unit_price_mmk'],
      )!,
      quantity: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}quantity'],
      )!,
      lineTotalMmk: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}line_total_mmk'],
      )!,
    );
  }

  @override
  $ShopSaleLinesTable createAlias(String alias) {
    return $ShopSaleLinesTable(attachedDatabase, alias);
  }
}

class ShopSaleLine extends DataClass implements Insertable<ShopSaleLine> {
  final String id;
  final String saleId;
  final String productId;
  final String productName;
  final int unitPriceMmk;
  final int quantity;
  final int lineTotalMmk;
  const ShopSaleLine({
    required this.id,
    required this.saleId,
    required this.productId,
    required this.productName,
    required this.unitPriceMmk,
    required this.quantity,
    required this.lineTotalMmk,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['sale_id'] = Variable<String>(saleId);
    map['product_id'] = Variable<String>(productId);
    map['product_name'] = Variable<String>(productName);
    map['unit_price_mmk'] = Variable<int>(unitPriceMmk);
    map['quantity'] = Variable<int>(quantity);
    map['line_total_mmk'] = Variable<int>(lineTotalMmk);
    return map;
  }

  ShopSaleLinesCompanion toCompanion(bool nullToAbsent) {
    return ShopSaleLinesCompanion(
      id: Value(id),
      saleId: Value(saleId),
      productId: Value(productId),
      productName: Value(productName),
      unitPriceMmk: Value(unitPriceMmk),
      quantity: Value(quantity),
      lineTotalMmk: Value(lineTotalMmk),
    );
  }

  factory ShopSaleLine.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return ShopSaleLine(
      id: serializer.fromJson<String>(json['id']),
      saleId: serializer.fromJson<String>(json['saleId']),
      productId: serializer.fromJson<String>(json['productId']),
      productName: serializer.fromJson<String>(json['productName']),
      unitPriceMmk: serializer.fromJson<int>(json['unitPriceMmk']),
      quantity: serializer.fromJson<int>(json['quantity']),
      lineTotalMmk: serializer.fromJson<int>(json['lineTotalMmk']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'saleId': serializer.toJson<String>(saleId),
      'productId': serializer.toJson<String>(productId),
      'productName': serializer.toJson<String>(productName),
      'unitPriceMmk': serializer.toJson<int>(unitPriceMmk),
      'quantity': serializer.toJson<int>(quantity),
      'lineTotalMmk': serializer.toJson<int>(lineTotalMmk),
    };
  }

  ShopSaleLine copyWith({
    String? id,
    String? saleId,
    String? productId,
    String? productName,
    int? unitPriceMmk,
    int? quantity,
    int? lineTotalMmk,
  }) => ShopSaleLine(
    id: id ?? this.id,
    saleId: saleId ?? this.saleId,
    productId: productId ?? this.productId,
    productName: productName ?? this.productName,
    unitPriceMmk: unitPriceMmk ?? this.unitPriceMmk,
    quantity: quantity ?? this.quantity,
    lineTotalMmk: lineTotalMmk ?? this.lineTotalMmk,
  );
  ShopSaleLine copyWithCompanion(ShopSaleLinesCompanion data) {
    return ShopSaleLine(
      id: data.id.present ? data.id.value : this.id,
      saleId: data.saleId.present ? data.saleId.value : this.saleId,
      productId: data.productId.present ? data.productId.value : this.productId,
      productName: data.productName.present
          ? data.productName.value
          : this.productName,
      unitPriceMmk: data.unitPriceMmk.present
          ? data.unitPriceMmk.value
          : this.unitPriceMmk,
      quantity: data.quantity.present ? data.quantity.value : this.quantity,
      lineTotalMmk: data.lineTotalMmk.present
          ? data.lineTotalMmk.value
          : this.lineTotalMmk,
    );
  }

  @override
  String toString() {
    return (StringBuffer('ShopSaleLine(')
          ..write('id: $id, ')
          ..write('saleId: $saleId, ')
          ..write('productId: $productId, ')
          ..write('productName: $productName, ')
          ..write('unitPriceMmk: $unitPriceMmk, ')
          ..write('quantity: $quantity, ')
          ..write('lineTotalMmk: $lineTotalMmk')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    saleId,
    productId,
    productName,
    unitPriceMmk,
    quantity,
    lineTotalMmk,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is ShopSaleLine &&
          other.id == this.id &&
          other.saleId == this.saleId &&
          other.productId == this.productId &&
          other.productName == this.productName &&
          other.unitPriceMmk == this.unitPriceMmk &&
          other.quantity == this.quantity &&
          other.lineTotalMmk == this.lineTotalMmk);
}

class ShopSaleLinesCompanion extends UpdateCompanion<ShopSaleLine> {
  final Value<String> id;
  final Value<String> saleId;
  final Value<String> productId;
  final Value<String> productName;
  final Value<int> unitPriceMmk;
  final Value<int> quantity;
  final Value<int> lineTotalMmk;
  final Value<int> rowid;
  const ShopSaleLinesCompanion({
    this.id = const Value.absent(),
    this.saleId = const Value.absent(),
    this.productId = const Value.absent(),
    this.productName = const Value.absent(),
    this.unitPriceMmk = const Value.absent(),
    this.quantity = const Value.absent(),
    this.lineTotalMmk = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  ShopSaleLinesCompanion.insert({
    required String id,
    required String saleId,
    required String productId,
    required String productName,
    required int unitPriceMmk,
    required int quantity,
    required int lineTotalMmk,
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       saleId = Value(saleId),
       productId = Value(productId),
       productName = Value(productName),
       unitPriceMmk = Value(unitPriceMmk),
       quantity = Value(quantity),
       lineTotalMmk = Value(lineTotalMmk);
  static Insertable<ShopSaleLine> custom({
    Expression<String>? id,
    Expression<String>? saleId,
    Expression<String>? productId,
    Expression<String>? productName,
    Expression<int>? unitPriceMmk,
    Expression<int>? quantity,
    Expression<int>? lineTotalMmk,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (saleId != null) 'sale_id': saleId,
      if (productId != null) 'product_id': productId,
      if (productName != null) 'product_name': productName,
      if (unitPriceMmk != null) 'unit_price_mmk': unitPriceMmk,
      if (quantity != null) 'quantity': quantity,
      if (lineTotalMmk != null) 'line_total_mmk': lineTotalMmk,
      if (rowid != null) 'rowid': rowid,
    });
  }

  ShopSaleLinesCompanion copyWith({
    Value<String>? id,
    Value<String>? saleId,
    Value<String>? productId,
    Value<String>? productName,
    Value<int>? unitPriceMmk,
    Value<int>? quantity,
    Value<int>? lineTotalMmk,
    Value<int>? rowid,
  }) {
    return ShopSaleLinesCompanion(
      id: id ?? this.id,
      saleId: saleId ?? this.saleId,
      productId: productId ?? this.productId,
      productName: productName ?? this.productName,
      unitPriceMmk: unitPriceMmk ?? this.unitPriceMmk,
      quantity: quantity ?? this.quantity,
      lineTotalMmk: lineTotalMmk ?? this.lineTotalMmk,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (saleId.present) {
      map['sale_id'] = Variable<String>(saleId.value);
    }
    if (productId.present) {
      map['product_id'] = Variable<String>(productId.value);
    }
    if (productName.present) {
      map['product_name'] = Variable<String>(productName.value);
    }
    if (unitPriceMmk.present) {
      map['unit_price_mmk'] = Variable<int>(unitPriceMmk.value);
    }
    if (quantity.present) {
      map['quantity'] = Variable<int>(quantity.value);
    }
    if (lineTotalMmk.present) {
      map['line_total_mmk'] = Variable<int>(lineTotalMmk.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('ShopSaleLinesCompanion(')
          ..write('id: $id, ')
          ..write('saleId: $saleId, ')
          ..write('productId: $productId, ')
          ..write('productName: $productName, ')
          ..write('unitPriceMmk: $unitPriceMmk, ')
          ..write('quantity: $quantity, ')
          ..write('lineTotalMmk: $lineTotalMmk, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $ShopStockMovementsTable extends ShopStockMovements
    with TableInfo<$ShopStockMovementsTable, ShopStockMovement> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $ShopStockMovementsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _saleIdMeta = const VerificationMeta('saleId');
  @override
  late final GeneratedColumn<String> saleId = GeneratedColumn<String>(
    'sale_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'REFERENCES shop_sales (id)',
    ),
  );
  static const VerificationMeta _productIdMeta = const VerificationMeta(
    'productId',
  );
  @override
  late final GeneratedColumn<String> productId = GeneratedColumn<String>(
    'product_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'REFERENCES shop_products (id)',
    ),
  );
  static const VerificationMeta _quantityDeltaMeta = const VerificationMeta(
    'quantityDelta',
  );
  @override
  late final GeneratedColumn<int> quantityDelta = GeneratedColumn<int>(
    'quantity_delta',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _reasonMeta = const VerificationMeta('reason');
  @override
  late final GeneratedColumn<String> reason = GeneratedColumn<String>(
    'reason',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _createdAtMillisMeta = const VerificationMeta(
    'createdAtMillis',
  );
  @override
  late final GeneratedColumn<int> createdAtMillis = GeneratedColumn<int>(
    'created_at_millis',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    saleId,
    productId,
    quantityDelta,
    reason,
    createdAtMillis,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'shop_stock_movements';
  @override
  VerificationContext validateIntegrity(
    Insertable<ShopStockMovement> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('sale_id')) {
      context.handle(
        _saleIdMeta,
        saleId.isAcceptableOrUnknown(data['sale_id']!, _saleIdMeta),
      );
    }
    if (data.containsKey('product_id')) {
      context.handle(
        _productIdMeta,
        productId.isAcceptableOrUnknown(data['product_id']!, _productIdMeta),
      );
    } else if (isInserting) {
      context.missing(_productIdMeta);
    }
    if (data.containsKey('quantity_delta')) {
      context.handle(
        _quantityDeltaMeta,
        quantityDelta.isAcceptableOrUnknown(
          data['quantity_delta']!,
          _quantityDeltaMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_quantityDeltaMeta);
    }
    if (data.containsKey('reason')) {
      context.handle(
        _reasonMeta,
        reason.isAcceptableOrUnknown(data['reason']!, _reasonMeta),
      );
    } else if (isInserting) {
      context.missing(_reasonMeta);
    }
    if (data.containsKey('created_at_millis')) {
      context.handle(
        _createdAtMillisMeta,
        createdAtMillis.isAcceptableOrUnknown(
          data['created_at_millis']!,
          _createdAtMillisMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_createdAtMillisMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  ShopStockMovement map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return ShopStockMovement(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      saleId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}sale_id'],
      ),
      productId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}product_id'],
      )!,
      quantityDelta: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}quantity_delta'],
      )!,
      reason: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}reason'],
      )!,
      createdAtMillis: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}created_at_millis'],
      )!,
    );
  }

  @override
  $ShopStockMovementsTable createAlias(String alias) {
    return $ShopStockMovementsTable(attachedDatabase, alias);
  }
}

class ShopStockMovement extends DataClass
    implements Insertable<ShopStockMovement> {
  final String id;
  final String? saleId;
  final String productId;
  final int quantityDelta;
  final String reason;
  final int createdAtMillis;
  const ShopStockMovement({
    required this.id,
    this.saleId,
    required this.productId,
    required this.quantityDelta,
    required this.reason,
    required this.createdAtMillis,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    if (!nullToAbsent || saleId != null) {
      map['sale_id'] = Variable<String>(saleId);
    }
    map['product_id'] = Variable<String>(productId);
    map['quantity_delta'] = Variable<int>(quantityDelta);
    map['reason'] = Variable<String>(reason);
    map['created_at_millis'] = Variable<int>(createdAtMillis);
    return map;
  }

  ShopStockMovementsCompanion toCompanion(bool nullToAbsent) {
    return ShopStockMovementsCompanion(
      id: Value(id),
      saleId: saleId == null && nullToAbsent
          ? const Value.absent()
          : Value(saleId),
      productId: Value(productId),
      quantityDelta: Value(quantityDelta),
      reason: Value(reason),
      createdAtMillis: Value(createdAtMillis),
    );
  }

  factory ShopStockMovement.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return ShopStockMovement(
      id: serializer.fromJson<String>(json['id']),
      saleId: serializer.fromJson<String?>(json['saleId']),
      productId: serializer.fromJson<String>(json['productId']),
      quantityDelta: serializer.fromJson<int>(json['quantityDelta']),
      reason: serializer.fromJson<String>(json['reason']),
      createdAtMillis: serializer.fromJson<int>(json['createdAtMillis']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'saleId': serializer.toJson<String?>(saleId),
      'productId': serializer.toJson<String>(productId),
      'quantityDelta': serializer.toJson<int>(quantityDelta),
      'reason': serializer.toJson<String>(reason),
      'createdAtMillis': serializer.toJson<int>(createdAtMillis),
    };
  }

  ShopStockMovement copyWith({
    String? id,
    Value<String?> saleId = const Value.absent(),
    String? productId,
    int? quantityDelta,
    String? reason,
    int? createdAtMillis,
  }) => ShopStockMovement(
    id: id ?? this.id,
    saleId: saleId.present ? saleId.value : this.saleId,
    productId: productId ?? this.productId,
    quantityDelta: quantityDelta ?? this.quantityDelta,
    reason: reason ?? this.reason,
    createdAtMillis: createdAtMillis ?? this.createdAtMillis,
  );
  ShopStockMovement copyWithCompanion(ShopStockMovementsCompanion data) {
    return ShopStockMovement(
      id: data.id.present ? data.id.value : this.id,
      saleId: data.saleId.present ? data.saleId.value : this.saleId,
      productId: data.productId.present ? data.productId.value : this.productId,
      quantityDelta: data.quantityDelta.present
          ? data.quantityDelta.value
          : this.quantityDelta,
      reason: data.reason.present ? data.reason.value : this.reason,
      createdAtMillis: data.createdAtMillis.present
          ? data.createdAtMillis.value
          : this.createdAtMillis,
    );
  }

  @override
  String toString() {
    return (StringBuffer('ShopStockMovement(')
          ..write('id: $id, ')
          ..write('saleId: $saleId, ')
          ..write('productId: $productId, ')
          ..write('quantityDelta: $quantityDelta, ')
          ..write('reason: $reason, ')
          ..write('createdAtMillis: $createdAtMillis')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    saleId,
    productId,
    quantityDelta,
    reason,
    createdAtMillis,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is ShopStockMovement &&
          other.id == this.id &&
          other.saleId == this.saleId &&
          other.productId == this.productId &&
          other.quantityDelta == this.quantityDelta &&
          other.reason == this.reason &&
          other.createdAtMillis == this.createdAtMillis);
}

class ShopStockMovementsCompanion extends UpdateCompanion<ShopStockMovement> {
  final Value<String> id;
  final Value<String?> saleId;
  final Value<String> productId;
  final Value<int> quantityDelta;
  final Value<String> reason;
  final Value<int> createdAtMillis;
  final Value<int> rowid;
  const ShopStockMovementsCompanion({
    this.id = const Value.absent(),
    this.saleId = const Value.absent(),
    this.productId = const Value.absent(),
    this.quantityDelta = const Value.absent(),
    this.reason = const Value.absent(),
    this.createdAtMillis = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  ShopStockMovementsCompanion.insert({
    required String id,
    this.saleId = const Value.absent(),
    required String productId,
    required int quantityDelta,
    required String reason,
    required int createdAtMillis,
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       productId = Value(productId),
       quantityDelta = Value(quantityDelta),
       reason = Value(reason),
       createdAtMillis = Value(createdAtMillis);
  static Insertable<ShopStockMovement> custom({
    Expression<String>? id,
    Expression<String>? saleId,
    Expression<String>? productId,
    Expression<int>? quantityDelta,
    Expression<String>? reason,
    Expression<int>? createdAtMillis,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (saleId != null) 'sale_id': saleId,
      if (productId != null) 'product_id': productId,
      if (quantityDelta != null) 'quantity_delta': quantityDelta,
      if (reason != null) 'reason': reason,
      if (createdAtMillis != null) 'created_at_millis': createdAtMillis,
      if (rowid != null) 'rowid': rowid,
    });
  }

  ShopStockMovementsCompanion copyWith({
    Value<String>? id,
    Value<String?>? saleId,
    Value<String>? productId,
    Value<int>? quantityDelta,
    Value<String>? reason,
    Value<int>? createdAtMillis,
    Value<int>? rowid,
  }) {
    return ShopStockMovementsCompanion(
      id: id ?? this.id,
      saleId: saleId ?? this.saleId,
      productId: productId ?? this.productId,
      quantityDelta: quantityDelta ?? this.quantityDelta,
      reason: reason ?? this.reason,
      createdAtMillis: createdAtMillis ?? this.createdAtMillis,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (saleId.present) {
      map['sale_id'] = Variable<String>(saleId.value);
    }
    if (productId.present) {
      map['product_id'] = Variable<String>(productId.value);
    }
    if (quantityDelta.present) {
      map['quantity_delta'] = Variable<int>(quantityDelta.value);
    }
    if (reason.present) {
      map['reason'] = Variable<String>(reason.value);
    }
    if (createdAtMillis.present) {
      map['created_at_millis'] = Variable<int>(createdAtMillis.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('ShopStockMovementsCompanion(')
          ..write('id: $id, ')
          ..write('saleId: $saleId, ')
          ..write('productId: $productId, ')
          ..write('quantityDelta: $quantityDelta, ')
          ..write('reason: $reason, ')
          ..write('createdAtMillis: $createdAtMillis, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $ShopSyncOutboxTable extends ShopSyncOutbox
    with TableInfo<$ShopSyncOutboxTable, ShopSyncOutboxData> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $ShopSyncOutboxTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _operationIdMeta = const VerificationMeta(
    'operationId',
  );
  @override
  late final GeneratedColumn<String> operationId = GeneratedColumn<String>(
    'operation_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _eventTypeMeta = const VerificationMeta(
    'eventType',
  );
  @override
  late final GeneratedColumn<String> eventType = GeneratedColumn<String>(
    'event_type',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _payloadJsonMeta = const VerificationMeta(
    'payloadJson',
  );
  @override
  late final GeneratedColumn<String> payloadJson = GeneratedColumn<String>(
    'payload_json',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _stateMeta = const VerificationMeta('state');
  @override
  late final GeneratedColumn<String> state = GeneratedColumn<String>(
    'state',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('pending'),
  );
  static const VerificationMeta _createdAtMillisMeta = const VerificationMeta(
    'createdAtMillis',
  );
  @override
  late final GeneratedColumn<int> createdAtMillis = GeneratedColumn<int>(
    'created_at_millis',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    operationId,
    eventType,
    payloadJson,
    state,
    createdAtMillis,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'shop_sync_outbox';
  @override
  VerificationContext validateIntegrity(
    Insertable<ShopSyncOutboxData> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('operation_id')) {
      context.handle(
        _operationIdMeta,
        operationId.isAcceptableOrUnknown(
          data['operation_id']!,
          _operationIdMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_operationIdMeta);
    }
    if (data.containsKey('event_type')) {
      context.handle(
        _eventTypeMeta,
        eventType.isAcceptableOrUnknown(data['event_type']!, _eventTypeMeta),
      );
    } else if (isInserting) {
      context.missing(_eventTypeMeta);
    }
    if (data.containsKey('payload_json')) {
      context.handle(
        _payloadJsonMeta,
        payloadJson.isAcceptableOrUnknown(
          data['payload_json']!,
          _payloadJsonMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_payloadJsonMeta);
    }
    if (data.containsKey('state')) {
      context.handle(
        _stateMeta,
        state.isAcceptableOrUnknown(data['state']!, _stateMeta),
      );
    }
    if (data.containsKey('created_at_millis')) {
      context.handle(
        _createdAtMillisMeta,
        createdAtMillis.isAcceptableOrUnknown(
          data['created_at_millis']!,
          _createdAtMillisMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_createdAtMillisMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {operationId};
  @override
  ShopSyncOutboxData map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return ShopSyncOutboxData(
      operationId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}operation_id'],
      )!,
      eventType: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}event_type'],
      )!,
      payloadJson: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}payload_json'],
      )!,
      state: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}state'],
      )!,
      createdAtMillis: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}created_at_millis'],
      )!,
    );
  }

  @override
  $ShopSyncOutboxTable createAlias(String alias) {
    return $ShopSyncOutboxTable(attachedDatabase, alias);
  }
}

class ShopSyncOutboxData extends DataClass
    implements Insertable<ShopSyncOutboxData> {
  final String operationId;
  final String eventType;
  final String payloadJson;
  final String state;
  final int createdAtMillis;
  const ShopSyncOutboxData({
    required this.operationId,
    required this.eventType,
    required this.payloadJson,
    required this.state,
    required this.createdAtMillis,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['operation_id'] = Variable<String>(operationId);
    map['event_type'] = Variable<String>(eventType);
    map['payload_json'] = Variable<String>(payloadJson);
    map['state'] = Variable<String>(state);
    map['created_at_millis'] = Variable<int>(createdAtMillis);
    return map;
  }

  ShopSyncOutboxCompanion toCompanion(bool nullToAbsent) {
    return ShopSyncOutboxCompanion(
      operationId: Value(operationId),
      eventType: Value(eventType),
      payloadJson: Value(payloadJson),
      state: Value(state),
      createdAtMillis: Value(createdAtMillis),
    );
  }

  factory ShopSyncOutboxData.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return ShopSyncOutboxData(
      operationId: serializer.fromJson<String>(json['operationId']),
      eventType: serializer.fromJson<String>(json['eventType']),
      payloadJson: serializer.fromJson<String>(json['payloadJson']),
      state: serializer.fromJson<String>(json['state']),
      createdAtMillis: serializer.fromJson<int>(json['createdAtMillis']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'operationId': serializer.toJson<String>(operationId),
      'eventType': serializer.toJson<String>(eventType),
      'payloadJson': serializer.toJson<String>(payloadJson),
      'state': serializer.toJson<String>(state),
      'createdAtMillis': serializer.toJson<int>(createdAtMillis),
    };
  }

  ShopSyncOutboxData copyWith({
    String? operationId,
    String? eventType,
    String? payloadJson,
    String? state,
    int? createdAtMillis,
  }) => ShopSyncOutboxData(
    operationId: operationId ?? this.operationId,
    eventType: eventType ?? this.eventType,
    payloadJson: payloadJson ?? this.payloadJson,
    state: state ?? this.state,
    createdAtMillis: createdAtMillis ?? this.createdAtMillis,
  );
  ShopSyncOutboxData copyWithCompanion(ShopSyncOutboxCompanion data) {
    return ShopSyncOutboxData(
      operationId: data.operationId.present
          ? data.operationId.value
          : this.operationId,
      eventType: data.eventType.present ? data.eventType.value : this.eventType,
      payloadJson: data.payloadJson.present
          ? data.payloadJson.value
          : this.payloadJson,
      state: data.state.present ? data.state.value : this.state,
      createdAtMillis: data.createdAtMillis.present
          ? data.createdAtMillis.value
          : this.createdAtMillis,
    );
  }

  @override
  String toString() {
    return (StringBuffer('ShopSyncOutboxData(')
          ..write('operationId: $operationId, ')
          ..write('eventType: $eventType, ')
          ..write('payloadJson: $payloadJson, ')
          ..write('state: $state, ')
          ..write('createdAtMillis: $createdAtMillis')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode =>
      Object.hash(operationId, eventType, payloadJson, state, createdAtMillis);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is ShopSyncOutboxData &&
          other.operationId == this.operationId &&
          other.eventType == this.eventType &&
          other.payloadJson == this.payloadJson &&
          other.state == this.state &&
          other.createdAtMillis == this.createdAtMillis);
}

class ShopSyncOutboxCompanion extends UpdateCompanion<ShopSyncOutboxData> {
  final Value<String> operationId;
  final Value<String> eventType;
  final Value<String> payloadJson;
  final Value<String> state;
  final Value<int> createdAtMillis;
  final Value<int> rowid;
  const ShopSyncOutboxCompanion({
    this.operationId = const Value.absent(),
    this.eventType = const Value.absent(),
    this.payloadJson = const Value.absent(),
    this.state = const Value.absent(),
    this.createdAtMillis = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  ShopSyncOutboxCompanion.insert({
    required String operationId,
    required String eventType,
    required String payloadJson,
    this.state = const Value.absent(),
    required int createdAtMillis,
    this.rowid = const Value.absent(),
  }) : operationId = Value(operationId),
       eventType = Value(eventType),
       payloadJson = Value(payloadJson),
       createdAtMillis = Value(createdAtMillis);
  static Insertable<ShopSyncOutboxData> custom({
    Expression<String>? operationId,
    Expression<String>? eventType,
    Expression<String>? payloadJson,
    Expression<String>? state,
    Expression<int>? createdAtMillis,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (operationId != null) 'operation_id': operationId,
      if (eventType != null) 'event_type': eventType,
      if (payloadJson != null) 'payload_json': payloadJson,
      if (state != null) 'state': state,
      if (createdAtMillis != null) 'created_at_millis': createdAtMillis,
      if (rowid != null) 'rowid': rowid,
    });
  }

  ShopSyncOutboxCompanion copyWith({
    Value<String>? operationId,
    Value<String>? eventType,
    Value<String>? payloadJson,
    Value<String>? state,
    Value<int>? createdAtMillis,
    Value<int>? rowid,
  }) {
    return ShopSyncOutboxCompanion(
      operationId: operationId ?? this.operationId,
      eventType: eventType ?? this.eventType,
      payloadJson: payloadJson ?? this.payloadJson,
      state: state ?? this.state,
      createdAtMillis: createdAtMillis ?? this.createdAtMillis,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (operationId.present) {
      map['operation_id'] = Variable<String>(operationId.value);
    }
    if (eventType.present) {
      map['event_type'] = Variable<String>(eventType.value);
    }
    if (payloadJson.present) {
      map['payload_json'] = Variable<String>(payloadJson.value);
    }
    if (state.present) {
      map['state'] = Variable<String>(state.value);
    }
    if (createdAtMillis.present) {
      map['created_at_millis'] = Variable<int>(createdAtMillis.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('ShopSyncOutboxCompanion(')
          ..write('operationId: $operationId, ')
          ..write('eventType: $eventType, ')
          ..write('payloadJson: $payloadJson, ')
          ..write('state: $state, ')
          ..write('createdAtMillis: $createdAtMillis, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

abstract class _$ShopDatabase extends GeneratedDatabase {
  _$ShopDatabase(QueryExecutor e) : super(e);
  $ShopDatabaseManager get managers => $ShopDatabaseManager(this);
  late final $MenuImportDraftsTable menuImportDrafts = $MenuImportDraftsTable(
    this,
  );
  late final $MerchantWalletProfilesTable merchantWalletProfiles =
      $MerchantWalletProfilesTable(this);
  late final $ShopProductsTable shopProducts = $ShopProductsTable(this);
  late final $ShopSalesTable shopSales = $ShopSalesTable(this);
  late final $ShopSaleLinesTable shopSaleLines = $ShopSaleLinesTable(this);
  late final $ShopStockMovementsTable shopStockMovements =
      $ShopStockMovementsTable(this);
  late final $ShopSyncOutboxTable shopSyncOutbox = $ShopSyncOutboxTable(this);
  @override
  Iterable<TableInfo<Table, Object?>> get allTables =>
      allSchemaEntities.whereType<TableInfo<Table, Object?>>();
  @override
  List<DatabaseSchemaEntity> get allSchemaEntities => [
    menuImportDrafts,
    merchantWalletProfiles,
    shopProducts,
    shopSales,
    shopSaleLines,
    shopStockMovements,
    shopSyncOutbox,
  ];
}

typedef $$MenuImportDraftsTableCreateCompanionBuilder =
    MenuImportDraftsCompanion Function({
      required String id,
      required String batchId,
      required String category,
      required String name,
      Value<String> description,
      Value<int?> priceMmk,
      Value<String?> sku,
      Value<String?> barcode,
      Value<int?> openingStock,
      Value<String> reviewState,
      required int createdAtMillis,
      Value<int> rowid,
    });
typedef $$MenuImportDraftsTableUpdateCompanionBuilder =
    MenuImportDraftsCompanion Function({
      Value<String> id,
      Value<String> batchId,
      Value<String> category,
      Value<String> name,
      Value<String> description,
      Value<int?> priceMmk,
      Value<String?> sku,
      Value<String?> barcode,
      Value<int?> openingStock,
      Value<String> reviewState,
      Value<int> createdAtMillis,
      Value<int> rowid,
    });

class $$MenuImportDraftsTableFilterComposer
    extends Composer<_$ShopDatabase, $MenuImportDraftsTable> {
  $$MenuImportDraftsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get batchId => $composableBuilder(
    column: $table.batchId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get category => $composableBuilder(
    column: $table.category,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get name => $composableBuilder(
    column: $table.name,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get description => $composableBuilder(
    column: $table.description,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get priceMmk => $composableBuilder(
    column: $table.priceMmk,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get sku => $composableBuilder(
    column: $table.sku,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get barcode => $composableBuilder(
    column: $table.barcode,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get openingStock => $composableBuilder(
    column: $table.openingStock,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get reviewState => $composableBuilder(
    column: $table.reviewState,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get createdAtMillis => $composableBuilder(
    column: $table.createdAtMillis,
    builder: (column) => ColumnFilters(column),
  );
}

class $$MenuImportDraftsTableOrderingComposer
    extends Composer<_$ShopDatabase, $MenuImportDraftsTable> {
  $$MenuImportDraftsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get batchId => $composableBuilder(
    column: $table.batchId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get category => $composableBuilder(
    column: $table.category,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get name => $composableBuilder(
    column: $table.name,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get description => $composableBuilder(
    column: $table.description,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get priceMmk => $composableBuilder(
    column: $table.priceMmk,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get sku => $composableBuilder(
    column: $table.sku,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get barcode => $composableBuilder(
    column: $table.barcode,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get openingStock => $composableBuilder(
    column: $table.openingStock,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get reviewState => $composableBuilder(
    column: $table.reviewState,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get createdAtMillis => $composableBuilder(
    column: $table.createdAtMillis,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$MenuImportDraftsTableAnnotationComposer
    extends Composer<_$ShopDatabase, $MenuImportDraftsTable> {
  $$MenuImportDraftsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get batchId =>
      $composableBuilder(column: $table.batchId, builder: (column) => column);

  GeneratedColumn<String> get category =>
      $composableBuilder(column: $table.category, builder: (column) => column);

  GeneratedColumn<String> get name =>
      $composableBuilder(column: $table.name, builder: (column) => column);

  GeneratedColumn<String> get description => $composableBuilder(
    column: $table.description,
    builder: (column) => column,
  );

  GeneratedColumn<int> get priceMmk =>
      $composableBuilder(column: $table.priceMmk, builder: (column) => column);

  GeneratedColumn<String> get sku =>
      $composableBuilder(column: $table.sku, builder: (column) => column);

  GeneratedColumn<String> get barcode =>
      $composableBuilder(column: $table.barcode, builder: (column) => column);

  GeneratedColumn<int> get openingStock => $composableBuilder(
    column: $table.openingStock,
    builder: (column) => column,
  );

  GeneratedColumn<String> get reviewState => $composableBuilder(
    column: $table.reviewState,
    builder: (column) => column,
  );

  GeneratedColumn<int> get createdAtMillis => $composableBuilder(
    column: $table.createdAtMillis,
    builder: (column) => column,
  );
}

class $$MenuImportDraftsTableTableManager
    extends
        RootTableManager<
          _$ShopDatabase,
          $MenuImportDraftsTable,
          MenuImportDraft,
          $$MenuImportDraftsTableFilterComposer,
          $$MenuImportDraftsTableOrderingComposer,
          $$MenuImportDraftsTableAnnotationComposer,
          $$MenuImportDraftsTableCreateCompanionBuilder,
          $$MenuImportDraftsTableUpdateCompanionBuilder,
          (
            MenuImportDraft,
            BaseReferences<
              _$ShopDatabase,
              $MenuImportDraftsTable,
              MenuImportDraft
            >,
          ),
          MenuImportDraft,
          PrefetchHooks Function()
        > {
  $$MenuImportDraftsTableTableManager(
    _$ShopDatabase db,
    $MenuImportDraftsTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$MenuImportDraftsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$MenuImportDraftsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$MenuImportDraftsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> batchId = const Value.absent(),
                Value<String> category = const Value.absent(),
                Value<String> name = const Value.absent(),
                Value<String> description = const Value.absent(),
                Value<int?> priceMmk = const Value.absent(),
                Value<String?> sku = const Value.absent(),
                Value<String?> barcode = const Value.absent(),
                Value<int?> openingStock = const Value.absent(),
                Value<String> reviewState = const Value.absent(),
                Value<int> createdAtMillis = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => MenuImportDraftsCompanion(
                id: id,
                batchId: batchId,
                category: category,
                name: name,
                description: description,
                priceMmk: priceMmk,
                sku: sku,
                barcode: barcode,
                openingStock: openingStock,
                reviewState: reviewState,
                createdAtMillis: createdAtMillis,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String batchId,
                required String category,
                required String name,
                Value<String> description = const Value.absent(),
                Value<int?> priceMmk = const Value.absent(),
                Value<String?> sku = const Value.absent(),
                Value<String?> barcode = const Value.absent(),
                Value<int?> openingStock = const Value.absent(),
                Value<String> reviewState = const Value.absent(),
                required int createdAtMillis,
                Value<int> rowid = const Value.absent(),
              }) => MenuImportDraftsCompanion.insert(
                id: id,
                batchId: batchId,
                category: category,
                name: name,
                description: description,
                priceMmk: priceMmk,
                sku: sku,
                barcode: barcode,
                openingStock: openingStock,
                reviewState: reviewState,
                createdAtMillis: createdAtMillis,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$MenuImportDraftsTable, MenuImportDraft>(table),
                  BaseReferences<
                    _$ShopDatabase,
                    $MenuImportDraftsTable,
                    MenuImportDraft
                  >(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$MenuImportDraftsTableProcessedTableManager =
    ProcessedTableManager<
      _$ShopDatabase,
      $MenuImportDraftsTable,
      MenuImportDraft,
      $$MenuImportDraftsTableFilterComposer,
      $$MenuImportDraftsTableOrderingComposer,
      $$MenuImportDraftsTableAnnotationComposer,
      $$MenuImportDraftsTableCreateCompanionBuilder,
      $$MenuImportDraftsTableUpdateCompanionBuilder,
      (
        MenuImportDraft,
        BaseReferences<_$ShopDatabase, $MenuImportDraftsTable, MenuImportDraft>,
      ),
      MenuImportDraft,
      PrefetchHooks Function()
    >;
typedef $$MerchantWalletProfilesTableCreateCompanionBuilder =
    MerchantWalletProfilesCompanion Function({
      required String provider,
      Value<String?> merchantPhone,
      Value<String?> officialQrPayload,
      Value<bool> issuerConfirmed,
      required int updatedAtMillis,
      Value<int> rowid,
    });
typedef $$MerchantWalletProfilesTableUpdateCompanionBuilder =
    MerchantWalletProfilesCompanion Function({
      Value<String> provider,
      Value<String?> merchantPhone,
      Value<String?> officialQrPayload,
      Value<bool> issuerConfirmed,
      Value<int> updatedAtMillis,
      Value<int> rowid,
    });

class $$MerchantWalletProfilesTableFilterComposer
    extends Composer<_$ShopDatabase, $MerchantWalletProfilesTable> {
  $$MerchantWalletProfilesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get provider => $composableBuilder(
    column: $table.provider,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get merchantPhone => $composableBuilder(
    column: $table.merchantPhone,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get officialQrPayload => $composableBuilder(
    column: $table.officialQrPayload,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get issuerConfirmed => $composableBuilder(
    column: $table.issuerConfirmed,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get updatedAtMillis => $composableBuilder(
    column: $table.updatedAtMillis,
    builder: (column) => ColumnFilters(column),
  );
}

class $$MerchantWalletProfilesTableOrderingComposer
    extends Composer<_$ShopDatabase, $MerchantWalletProfilesTable> {
  $$MerchantWalletProfilesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get provider => $composableBuilder(
    column: $table.provider,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get merchantPhone => $composableBuilder(
    column: $table.merchantPhone,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get officialQrPayload => $composableBuilder(
    column: $table.officialQrPayload,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get issuerConfirmed => $composableBuilder(
    column: $table.issuerConfirmed,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get updatedAtMillis => $composableBuilder(
    column: $table.updatedAtMillis,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$MerchantWalletProfilesTableAnnotationComposer
    extends Composer<_$ShopDatabase, $MerchantWalletProfilesTable> {
  $$MerchantWalletProfilesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get provider =>
      $composableBuilder(column: $table.provider, builder: (column) => column);

  GeneratedColumn<String> get merchantPhone => $composableBuilder(
    column: $table.merchantPhone,
    builder: (column) => column,
  );

  GeneratedColumn<String> get officialQrPayload => $composableBuilder(
    column: $table.officialQrPayload,
    builder: (column) => column,
  );

  GeneratedColumn<bool> get issuerConfirmed => $composableBuilder(
    column: $table.issuerConfirmed,
    builder: (column) => column,
  );

  GeneratedColumn<int> get updatedAtMillis => $composableBuilder(
    column: $table.updatedAtMillis,
    builder: (column) => column,
  );
}

class $$MerchantWalletProfilesTableTableManager
    extends
        RootTableManager<
          _$ShopDatabase,
          $MerchantWalletProfilesTable,
          MerchantWalletProfile,
          $$MerchantWalletProfilesTableFilterComposer,
          $$MerchantWalletProfilesTableOrderingComposer,
          $$MerchantWalletProfilesTableAnnotationComposer,
          $$MerchantWalletProfilesTableCreateCompanionBuilder,
          $$MerchantWalletProfilesTableUpdateCompanionBuilder,
          (
            MerchantWalletProfile,
            BaseReferences<
              _$ShopDatabase,
              $MerchantWalletProfilesTable,
              MerchantWalletProfile
            >,
          ),
          MerchantWalletProfile,
          PrefetchHooks Function()
        > {
  $$MerchantWalletProfilesTableTableManager(
    _$ShopDatabase db,
    $MerchantWalletProfilesTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$MerchantWalletProfilesTableFilterComposer(
                $db: db,
                $table: table,
              ),
          createOrderingComposer: () =>
              $$MerchantWalletProfilesTableOrderingComposer(
                $db: db,
                $table: table,
              ),
          createComputedFieldComposer: () =>
              $$MerchantWalletProfilesTableAnnotationComposer(
                $db: db,
                $table: table,
              ),
          updateCompanionCallback:
              ({
                Value<String> provider = const Value.absent(),
                Value<String?> merchantPhone = const Value.absent(),
                Value<String?> officialQrPayload = const Value.absent(),
                Value<bool> issuerConfirmed = const Value.absent(),
                Value<int> updatedAtMillis = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => MerchantWalletProfilesCompanion(
                provider: provider,
                merchantPhone: merchantPhone,
                officialQrPayload: officialQrPayload,
                issuerConfirmed: issuerConfirmed,
                updatedAtMillis: updatedAtMillis,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String provider,
                Value<String?> merchantPhone = const Value.absent(),
                Value<String?> officialQrPayload = const Value.absent(),
                Value<bool> issuerConfirmed = const Value.absent(),
                required int updatedAtMillis,
                Value<int> rowid = const Value.absent(),
              }) => MerchantWalletProfilesCompanion.insert(
                provider: provider,
                merchantPhone: merchantPhone,
                officialQrPayload: officialQrPayload,
                issuerConfirmed: issuerConfirmed,
                updatedAtMillis: updatedAtMillis,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<
                    $MerchantWalletProfilesTable,
                    MerchantWalletProfile
                  >(table),
                  BaseReferences<
                    _$ShopDatabase,
                    $MerchantWalletProfilesTable,
                    MerchantWalletProfile
                  >(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$MerchantWalletProfilesTableProcessedTableManager =
    ProcessedTableManager<
      _$ShopDatabase,
      $MerchantWalletProfilesTable,
      MerchantWalletProfile,
      $$MerchantWalletProfilesTableFilterComposer,
      $$MerchantWalletProfilesTableOrderingComposer,
      $$MerchantWalletProfilesTableAnnotationComposer,
      $$MerchantWalletProfilesTableCreateCompanionBuilder,
      $$MerchantWalletProfilesTableUpdateCompanionBuilder,
      (
        MerchantWalletProfile,
        BaseReferences<
          _$ShopDatabase,
          $MerchantWalletProfilesTable,
          MerchantWalletProfile
        >,
      ),
      MerchantWalletProfile,
      PrefetchHooks Function()
    >;
typedef $$ShopProductsTableCreateCompanionBuilder =
    ShopProductsCompanion Function({
      required String id,
      required String name,
      Value<String> category,
      Value<String> description,
      Value<String?> sku,
      Value<String?> barcode,
      required int priceMmk,
      required int onHand,
      required int updatedAtMillis,
      Value<bool> archived,
      Value<int> rowid,
    });
typedef $$ShopProductsTableUpdateCompanionBuilder =
    ShopProductsCompanion Function({
      Value<String> id,
      Value<String> name,
      Value<String> category,
      Value<String> description,
      Value<String?> sku,
      Value<String?> barcode,
      Value<int> priceMmk,
      Value<int> onHand,
      Value<int> updatedAtMillis,
      Value<bool> archived,
      Value<int> rowid,
    });

final class $$ShopProductsTableReferences
    extends BaseReferences<_$ShopDatabase, $ShopProductsTable, ShopProduct> {
  $$ShopProductsTableReferences(super.$_db, super.$_table, super.$_typedResult);

  static MultiTypedResultKey<$ShopSaleLinesTable, List<ShopSaleLine>>
  _shopSaleLinesRefsTable(_$ShopDatabase db) => MultiTypedResultKey.fromTable(
    db.shopSaleLines,
    aliasName: 'shop_products__id__shop_sale_lines__product_id',
  );

  $$ShopSaleLinesTableProcessedTableManager get shopSaleLinesRefs {
    final manager = $$ShopSaleLinesTableTableManager(
      $_db,
      $_db.shopSaleLines,
    ).filter((f) => f.productId.id.sqlEquals($_itemColumn<String>('id')!));

    final cache = $_typedResult.readTableOrNull(_shopSaleLinesRefsTable($_db));
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: cache),
    );
  }

  static MultiTypedResultKey<$ShopStockMovementsTable, List<ShopStockMovement>>
  _shopStockMovementsRefsTable(_$ShopDatabase db) =>
      MultiTypedResultKey.fromTable(
        db.shopStockMovements,
        aliasName: 'shop_products__id__shop_stock_movements__product_id',
      );

  $$ShopStockMovementsTableProcessedTableManager get shopStockMovementsRefs {
    final manager = $$ShopStockMovementsTableTableManager(
      $_db,
      $_db.shopStockMovements,
    ).filter((f) => f.productId.id.sqlEquals($_itemColumn<String>('id')!));

    final cache = $_typedResult.readTableOrNull(
      _shopStockMovementsRefsTable($_db),
    );
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: cache),
    );
  }
}

class $$ShopProductsTableFilterComposer
    extends Composer<_$ShopDatabase, $ShopProductsTable> {
  $$ShopProductsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get name => $composableBuilder(
    column: $table.name,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get category => $composableBuilder(
    column: $table.category,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get description => $composableBuilder(
    column: $table.description,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get sku => $composableBuilder(
    column: $table.sku,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get barcode => $composableBuilder(
    column: $table.barcode,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get priceMmk => $composableBuilder(
    column: $table.priceMmk,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get onHand => $composableBuilder(
    column: $table.onHand,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get updatedAtMillis => $composableBuilder(
    column: $table.updatedAtMillis,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get archived => $composableBuilder(
    column: $table.archived,
    builder: (column) => ColumnFilters(column),
  );

  Expression<bool> shopSaleLinesRefs(
    Expression<bool> Function($$ShopSaleLinesTableFilterComposer f) f,
  ) {
    final $$ShopSaleLinesTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.shopSaleLines,
      getReferencedColumn: (t) => t.productId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ShopSaleLinesTableFilterComposer(
            $db: $db,
            $table: $db.shopSaleLines,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }

  Expression<bool> shopStockMovementsRefs(
    Expression<bool> Function($$ShopStockMovementsTableFilterComposer f) f,
  ) {
    final $$ShopStockMovementsTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.shopStockMovements,
      getReferencedColumn: (t) => t.productId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ShopStockMovementsTableFilterComposer(
            $db: $db,
            $table: $db.shopStockMovements,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }
}

class $$ShopProductsTableOrderingComposer
    extends Composer<_$ShopDatabase, $ShopProductsTable> {
  $$ShopProductsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get name => $composableBuilder(
    column: $table.name,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get category => $composableBuilder(
    column: $table.category,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get description => $composableBuilder(
    column: $table.description,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get sku => $composableBuilder(
    column: $table.sku,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get barcode => $composableBuilder(
    column: $table.barcode,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get priceMmk => $composableBuilder(
    column: $table.priceMmk,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get onHand => $composableBuilder(
    column: $table.onHand,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get updatedAtMillis => $composableBuilder(
    column: $table.updatedAtMillis,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get archived => $composableBuilder(
    column: $table.archived,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$ShopProductsTableAnnotationComposer
    extends Composer<_$ShopDatabase, $ShopProductsTable> {
  $$ShopProductsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get name =>
      $composableBuilder(column: $table.name, builder: (column) => column);

  GeneratedColumn<String> get category =>
      $composableBuilder(column: $table.category, builder: (column) => column);

  GeneratedColumn<String> get description => $composableBuilder(
    column: $table.description,
    builder: (column) => column,
  );

  GeneratedColumn<String> get sku =>
      $composableBuilder(column: $table.sku, builder: (column) => column);

  GeneratedColumn<String> get barcode =>
      $composableBuilder(column: $table.barcode, builder: (column) => column);

  GeneratedColumn<int> get priceMmk =>
      $composableBuilder(column: $table.priceMmk, builder: (column) => column);

  GeneratedColumn<int> get onHand =>
      $composableBuilder(column: $table.onHand, builder: (column) => column);

  GeneratedColumn<int> get updatedAtMillis => $composableBuilder(
    column: $table.updatedAtMillis,
    builder: (column) => column,
  );

  GeneratedColumn<bool> get archived =>
      $composableBuilder(column: $table.archived, builder: (column) => column);

  Expression<T> shopSaleLinesRefs<T extends Object>(
    Expression<T> Function($$ShopSaleLinesTableAnnotationComposer a) f,
  ) {
    final $$ShopSaleLinesTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.shopSaleLines,
      getReferencedColumn: (t) => t.productId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ShopSaleLinesTableAnnotationComposer(
            $db: $db,
            $table: $db.shopSaleLines,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }

  Expression<T> shopStockMovementsRefs<T extends Object>(
    Expression<T> Function($$ShopStockMovementsTableAnnotationComposer a) f,
  ) {
    final $$ShopStockMovementsTableAnnotationComposer composer =
        $composerBuilder(
          composer: this,
          getCurrentColumn: (t) => t.id,
          referencedTable: $db.shopStockMovements,
          getReferencedColumn: (t) => t.productId,
          builder:
              (
                joinBuilder, {
                $addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer,
              }) => $$ShopStockMovementsTableAnnotationComposer(
                $db: $db,
                $table: $db.shopStockMovements,
                $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
                joinBuilder: joinBuilder,
                $removeJoinBuilderFromRootComposer:
                    $removeJoinBuilderFromRootComposer,
              ),
        );
    return f(composer);
  }
}

class $$ShopProductsTableTableManager
    extends
        RootTableManager<
          _$ShopDatabase,
          $ShopProductsTable,
          ShopProduct,
          $$ShopProductsTableFilterComposer,
          $$ShopProductsTableOrderingComposer,
          $$ShopProductsTableAnnotationComposer,
          $$ShopProductsTableCreateCompanionBuilder,
          $$ShopProductsTableUpdateCompanionBuilder,
          (ShopProduct, $$ShopProductsTableReferences),
          ShopProduct,
          PrefetchHooks Function({
            bool shopSaleLinesRefs,
            bool shopStockMovementsRefs,
          })
        > {
  $$ShopProductsTableTableManager(_$ShopDatabase db, $ShopProductsTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$ShopProductsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$ShopProductsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$ShopProductsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> name = const Value.absent(),
                Value<String> category = const Value.absent(),
                Value<String> description = const Value.absent(),
                Value<String?> sku = const Value.absent(),
                Value<String?> barcode = const Value.absent(),
                Value<int> priceMmk = const Value.absent(),
                Value<int> onHand = const Value.absent(),
                Value<int> updatedAtMillis = const Value.absent(),
                Value<bool> archived = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => ShopProductsCompanion(
                id: id,
                name: name,
                category: category,
                description: description,
                sku: sku,
                barcode: barcode,
                priceMmk: priceMmk,
                onHand: onHand,
                updatedAtMillis: updatedAtMillis,
                archived: archived,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String name,
                Value<String> category = const Value.absent(),
                Value<String> description = const Value.absent(),
                Value<String?> sku = const Value.absent(),
                Value<String?> barcode = const Value.absent(),
                required int priceMmk,
                required int onHand,
                required int updatedAtMillis,
                Value<bool> archived = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => ShopProductsCompanion.insert(
                id: id,
                name: name,
                category: category,
                description: description,
                sku: sku,
                barcode: barcode,
                priceMmk: priceMmk,
                onHand: onHand,
                updatedAtMillis: updatedAtMillis,
                archived: archived,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$ShopProductsTable, ShopProduct>(table),
                  $$ShopProductsTableReferences(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback:
              ({shopSaleLinesRefs = false, shopStockMovementsRefs = false}) {
                return PrefetchHooks(
                  db: db,
                  explicitlyWatchedTables: [
                    if (shopSaleLinesRefs) db.shopSaleLines,
                    if (shopStockMovementsRefs) db.shopStockMovements,
                  ],
                  addJoins: null,
                  getPrefetchedDataCallback: (items) async {
                    return [
                      if (shopSaleLinesRefs)
                        await $_getPrefetchedData<
                          ShopProduct,
                          $ShopProductsTable,
                          ShopSaleLine
                        >(
                          currentTable: table,
                          referencedTable: $$ShopProductsTableReferences
                              ._shopSaleLinesRefsTable(db),
                          managerFromTypedResult: (p0) =>
                              $$ShopProductsTableReferences(
                                db,
                                table,
                                p0,
                              ).shopSaleLinesRefs,
                          referencedItemsForCurrentItem:
                              (item, referencedItems) => referencedItems.where(
                                (e) => e.productId == item.id,
                              ),
                          typedResults: items,
                        ),
                      if (shopStockMovementsRefs)
                        await $_getPrefetchedData<
                          ShopProduct,
                          $ShopProductsTable,
                          ShopStockMovement
                        >(
                          currentTable: table,
                          referencedTable: $$ShopProductsTableReferences
                              ._shopStockMovementsRefsTable(db),
                          managerFromTypedResult: (p0) =>
                              $$ShopProductsTableReferences(
                                db,
                                table,
                                p0,
                              ).shopStockMovementsRefs,
                          referencedItemsForCurrentItem:
                              (item, referencedItems) => referencedItems.where(
                                (e) => e.productId == item.id,
                              ),
                          typedResults: items,
                        ),
                    ];
                  },
                );
              },
        ),
      );
}

typedef $$ShopProductsTableProcessedTableManager =
    ProcessedTableManager<
      _$ShopDatabase,
      $ShopProductsTable,
      ShopProduct,
      $$ShopProductsTableFilterComposer,
      $$ShopProductsTableOrderingComposer,
      $$ShopProductsTableAnnotationComposer,
      $$ShopProductsTableCreateCompanionBuilder,
      $$ShopProductsTableUpdateCompanionBuilder,
      (ShopProduct, $$ShopProductsTableReferences),
      ShopProduct,
      PrefetchHooks Function({
        bool shopSaleLinesRefs,
        bool shopStockMovementsRefs,
      })
    >;
typedef $$ShopSalesTableCreateCompanionBuilder = ShopSalesCompanion Function({
  required String id,
  required String operationId,
  required String requestFingerprint,
  required int totalMmk,
  Value<String> paymentMethod,
  required int createdAtMillis,
  Value<int> rowid,
});
typedef $$ShopSalesTableUpdateCompanionBuilder = ShopSalesCompanion Function({
  Value<String> id,
  Value<String> operationId,
  Value<String> requestFingerprint,
  Value<int> totalMmk,
  Value<String> paymentMethod,
  Value<int> createdAtMillis,
  Value<int> rowid,
});

final class $$ShopSalesTableReferences
    extends BaseReferences<_$ShopDatabase, $ShopSalesTable, ShopSale> {
  $$ShopSalesTableReferences(super.$_db, super.$_table, super.$_typedResult);

  static MultiTypedResultKey<$ShopSaleLinesTable, List<ShopSaleLine>>
  _shopSaleLinesRefsTable(_$ShopDatabase db) => MultiTypedResultKey.fromTable(
    db.shopSaleLines,
    aliasName: 'shop_sales__id__shop_sale_lines__sale_id',
  );

  $$ShopSaleLinesTableProcessedTableManager get shopSaleLinesRefs {
    final manager = $$ShopSaleLinesTableTableManager(
      $_db,
      $_db.shopSaleLines,
    ).filter((f) => f.saleId.id.sqlEquals($_itemColumn<String>('id')!));

    final cache = $_typedResult.readTableOrNull(_shopSaleLinesRefsTable($_db));
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: cache),
    );
  }

  static MultiTypedResultKey<$ShopStockMovementsTable, List<ShopStockMovement>>
  _shopStockMovementsRefsTable(_$ShopDatabase db) =>
      MultiTypedResultKey.fromTable(
        db.shopStockMovements,
        aliasName: 'shop_sales__id__shop_stock_movements__sale_id',
      );

  $$ShopStockMovementsTableProcessedTableManager get shopStockMovementsRefs {
    final manager = $$ShopStockMovementsTableTableManager(
      $_db,
      $_db.shopStockMovements,
    ).filter((f) => f.saleId.id.sqlEquals($_itemColumn<String>('id')!));

    final cache = $_typedResult.readTableOrNull(
      _shopStockMovementsRefsTable($_db),
    );
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: cache),
    );
  }
}

class $$ShopSalesTableFilterComposer
    extends Composer<_$ShopDatabase, $ShopSalesTable> {
  $$ShopSalesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get operationId => $composableBuilder(
    column: $table.operationId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get requestFingerprint => $composableBuilder(
    column: $table.requestFingerprint,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get totalMmk => $composableBuilder(
    column: $table.totalMmk,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get paymentMethod => $composableBuilder(
    column: $table.paymentMethod,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get createdAtMillis => $composableBuilder(
    column: $table.createdAtMillis,
    builder: (column) => ColumnFilters(column),
  );

  Expression<bool> shopSaleLinesRefs(
    Expression<bool> Function($$ShopSaleLinesTableFilterComposer f) f,
  ) {
    final $$ShopSaleLinesTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.shopSaleLines,
      getReferencedColumn: (t) => t.saleId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ShopSaleLinesTableFilterComposer(
            $db: $db,
            $table: $db.shopSaleLines,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }

  Expression<bool> shopStockMovementsRefs(
    Expression<bool> Function($$ShopStockMovementsTableFilterComposer f) f,
  ) {
    final $$ShopStockMovementsTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.shopStockMovements,
      getReferencedColumn: (t) => t.saleId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ShopStockMovementsTableFilterComposer(
            $db: $db,
            $table: $db.shopStockMovements,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }
}

class $$ShopSalesTableOrderingComposer
    extends Composer<_$ShopDatabase, $ShopSalesTable> {
  $$ShopSalesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get operationId => $composableBuilder(
    column: $table.operationId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get requestFingerprint => $composableBuilder(
    column: $table.requestFingerprint,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get totalMmk => $composableBuilder(
    column: $table.totalMmk,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get paymentMethod => $composableBuilder(
    column: $table.paymentMethod,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get createdAtMillis => $composableBuilder(
    column: $table.createdAtMillis,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$ShopSalesTableAnnotationComposer
    extends Composer<_$ShopDatabase, $ShopSalesTable> {
  $$ShopSalesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get operationId => $composableBuilder(
    column: $table.operationId,
    builder: (column) => column,
  );

  GeneratedColumn<String> get requestFingerprint => $composableBuilder(
    column: $table.requestFingerprint,
    builder: (column) => column,
  );

  GeneratedColumn<int> get totalMmk =>
      $composableBuilder(column: $table.totalMmk, builder: (column) => column);

  GeneratedColumn<String> get paymentMethod => $composableBuilder(
    column: $table.paymentMethod,
    builder: (column) => column,
  );

  GeneratedColumn<int> get createdAtMillis => $composableBuilder(
    column: $table.createdAtMillis,
    builder: (column) => column,
  );

  Expression<T> shopSaleLinesRefs<T extends Object>(
    Expression<T> Function($$ShopSaleLinesTableAnnotationComposer a) f,
  ) {
    final $$ShopSaleLinesTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.shopSaleLines,
      getReferencedColumn: (t) => t.saleId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ShopSaleLinesTableAnnotationComposer(
            $db: $db,
            $table: $db.shopSaleLines,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }

  Expression<T> shopStockMovementsRefs<T extends Object>(
    Expression<T> Function($$ShopStockMovementsTableAnnotationComposer a) f,
  ) {
    final $$ShopStockMovementsTableAnnotationComposer composer =
        $composerBuilder(
          composer: this,
          getCurrentColumn: (t) => t.id,
          referencedTable: $db.shopStockMovements,
          getReferencedColumn: (t) => t.saleId,
          builder:
              (
                joinBuilder, {
                $addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer,
              }) => $$ShopStockMovementsTableAnnotationComposer(
                $db: $db,
                $table: $db.shopStockMovements,
                $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
                joinBuilder: joinBuilder,
                $removeJoinBuilderFromRootComposer:
                    $removeJoinBuilderFromRootComposer,
              ),
        );
    return f(composer);
  }
}

class $$ShopSalesTableTableManager
    extends
        RootTableManager<
          _$ShopDatabase,
          $ShopSalesTable,
          ShopSale,
          $$ShopSalesTableFilterComposer,
          $$ShopSalesTableOrderingComposer,
          $$ShopSalesTableAnnotationComposer,
          $$ShopSalesTableCreateCompanionBuilder,
          $$ShopSalesTableUpdateCompanionBuilder,
          (ShopSale, $$ShopSalesTableReferences),
          ShopSale,
          PrefetchHooks Function({
            bool shopSaleLinesRefs,
            bool shopStockMovementsRefs,
          })
        > {
  $$ShopSalesTableTableManager(_$ShopDatabase db, $ShopSalesTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$ShopSalesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$ShopSalesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$ShopSalesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> operationId = const Value.absent(),
                Value<String> requestFingerprint = const Value.absent(),
                Value<int> totalMmk = const Value.absent(),
                Value<String> paymentMethod = const Value.absent(),
                Value<int> createdAtMillis = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => ShopSalesCompanion(
                id: id,
                operationId: operationId,
                requestFingerprint: requestFingerprint,
                totalMmk: totalMmk,
                paymentMethod: paymentMethod,
                createdAtMillis: createdAtMillis,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String operationId,
                required String requestFingerprint,
                required int totalMmk,
                Value<String> paymentMethod = const Value.absent(),
                required int createdAtMillis,
                Value<int> rowid = const Value.absent(),
              }) => ShopSalesCompanion.insert(
                id: id,
                operationId: operationId,
                requestFingerprint: requestFingerprint,
                totalMmk: totalMmk,
                paymentMethod: paymentMethod,
                createdAtMillis: createdAtMillis,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$ShopSalesTable, ShopSale>(table),
                  $$ShopSalesTableReferences(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback:
              ({shopSaleLinesRefs = false, shopStockMovementsRefs = false}) {
                return PrefetchHooks(
                  db: db,
                  explicitlyWatchedTables: [
                    if (shopSaleLinesRefs) db.shopSaleLines,
                    if (shopStockMovementsRefs) db.shopStockMovements,
                  ],
                  addJoins: null,
                  getPrefetchedDataCallback: (items) async {
                    return [
                      if (shopSaleLinesRefs)
                        await $_getPrefetchedData<
                          ShopSale,
                          $ShopSalesTable,
                          ShopSaleLine
                        >(
                          currentTable: table,
                          referencedTable: $$ShopSalesTableReferences
                              ._shopSaleLinesRefsTable(db),
                          managerFromTypedResult: (p0) =>
                              $$ShopSalesTableReferences(
                                db,
                                table,
                                p0,
                              ).shopSaleLinesRefs,
                          referencedItemsForCurrentItem:
                              (item, referencedItems) => referencedItems.where(
                                (e) => e.saleId == item.id,
                              ),
                          typedResults: items,
                        ),
                      if (shopStockMovementsRefs)
                        await $_getPrefetchedData<
                          ShopSale,
                          $ShopSalesTable,
                          ShopStockMovement
                        >(
                          currentTable: table,
                          referencedTable: $$ShopSalesTableReferences
                              ._shopStockMovementsRefsTable(db),
                          managerFromTypedResult: (p0) =>
                              $$ShopSalesTableReferences(
                                db,
                                table,
                                p0,
                              ).shopStockMovementsRefs,
                          referencedItemsForCurrentItem:
                              (item, referencedItems) => referencedItems.where(
                                (e) => e.saleId == item.id,
                              ),
                          typedResults: items,
                        ),
                    ];
                  },
                );
              },
        ),
      );
}

typedef $$ShopSalesTableProcessedTableManager =
    ProcessedTableManager<
      _$ShopDatabase,
      $ShopSalesTable,
      ShopSale,
      $$ShopSalesTableFilterComposer,
      $$ShopSalesTableOrderingComposer,
      $$ShopSalesTableAnnotationComposer,
      $$ShopSalesTableCreateCompanionBuilder,
      $$ShopSalesTableUpdateCompanionBuilder,
      (ShopSale, $$ShopSalesTableReferences),
      ShopSale,
      PrefetchHooks Function({
        bool shopSaleLinesRefs,
        bool shopStockMovementsRefs,
      })
    >;
typedef $$ShopSaleLinesTableCreateCompanionBuilder =
    ShopSaleLinesCompanion Function({
      required String id,
      required String saleId,
      required String productId,
      required String productName,
      required int unitPriceMmk,
      required int quantity,
      required int lineTotalMmk,
      Value<int> rowid,
    });
typedef $$ShopSaleLinesTableUpdateCompanionBuilder =
    ShopSaleLinesCompanion Function({
      Value<String> id,
      Value<String> saleId,
      Value<String> productId,
      Value<String> productName,
      Value<int> unitPriceMmk,
      Value<int> quantity,
      Value<int> lineTotalMmk,
      Value<int> rowid,
    });

final class $$ShopSaleLinesTableReferences
    extends BaseReferences<_$ShopDatabase, $ShopSaleLinesTable, ShopSaleLine> {
  $$ShopSaleLinesTableReferences(
    super.$_db,
    super.$_table,
    super.$_typedResult,
  );

  static $ShopSalesTable _saleIdTable(_$ShopDatabase db) =>
      db.shopSales.createAlias('shop_sale_lines__sale_id__shop_sales__id');

  $$ShopSalesTableProcessedTableManager get saleId {
    final $_column = $_itemColumn<String>('sale_id')!;

    final manager = $$ShopSalesTableTableManager(
      $_db,
      $_db.shopSales,
    ).filter((f) => f.id.sqlEquals($_column));
    final item = $_typedResult.readTableOrNull(_saleIdTable($_db));
    if (item == null) return manager;
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: [item]),
    );
  }

  static $ShopProductsTable _productIdTable(_$ShopDatabase db) => db
      .shopProducts
      .createAlias('shop_sale_lines__product_id__shop_products__id');

  $$ShopProductsTableProcessedTableManager get productId {
    final $_column = $_itemColumn<String>('product_id')!;

    final manager = $$ShopProductsTableTableManager(
      $_db,
      $_db.shopProducts,
    ).filter((f) => f.id.sqlEquals($_column));
    final item = $_typedResult.readTableOrNull(_productIdTable($_db));
    if (item == null) return manager;
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: [item]),
    );
  }
}

class $$ShopSaleLinesTableFilterComposer
    extends Composer<_$ShopDatabase, $ShopSaleLinesTable> {
  $$ShopSaleLinesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get productName => $composableBuilder(
    column: $table.productName,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get unitPriceMmk => $composableBuilder(
    column: $table.unitPriceMmk,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get quantity => $composableBuilder(
    column: $table.quantity,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get lineTotalMmk => $composableBuilder(
    column: $table.lineTotalMmk,
    builder: (column) => ColumnFilters(column),
  );

  $$ShopSalesTableFilterComposer get saleId {
    final $$ShopSalesTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.saleId,
      referencedTable: $db.shopSales,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ShopSalesTableFilterComposer(
            $db: $db,
            $table: $db.shopSales,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }

  $$ShopProductsTableFilterComposer get productId {
    final $$ShopProductsTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.productId,
      referencedTable: $db.shopProducts,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ShopProductsTableFilterComposer(
            $db: $db,
            $table: $db.shopProducts,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$ShopSaleLinesTableOrderingComposer
    extends Composer<_$ShopDatabase, $ShopSaleLinesTable> {
  $$ShopSaleLinesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get productName => $composableBuilder(
    column: $table.productName,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get unitPriceMmk => $composableBuilder(
    column: $table.unitPriceMmk,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get quantity => $composableBuilder(
    column: $table.quantity,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get lineTotalMmk => $composableBuilder(
    column: $table.lineTotalMmk,
    builder: (column) => ColumnOrderings(column),
  );

  $$ShopSalesTableOrderingComposer get saleId {
    final $$ShopSalesTableOrderingComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.saleId,
      referencedTable: $db.shopSales,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ShopSalesTableOrderingComposer(
            $db: $db,
            $table: $db.shopSales,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }

  $$ShopProductsTableOrderingComposer get productId {
    final $$ShopProductsTableOrderingComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.productId,
      referencedTable: $db.shopProducts,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ShopProductsTableOrderingComposer(
            $db: $db,
            $table: $db.shopProducts,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$ShopSaleLinesTableAnnotationComposer
    extends Composer<_$ShopDatabase, $ShopSaleLinesTable> {
  $$ShopSaleLinesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get productName => $composableBuilder(
    column: $table.productName,
    builder: (column) => column,
  );

  GeneratedColumn<int> get unitPriceMmk => $composableBuilder(
    column: $table.unitPriceMmk,
    builder: (column) => column,
  );

  GeneratedColumn<int> get quantity =>
      $composableBuilder(column: $table.quantity, builder: (column) => column);

  GeneratedColumn<int> get lineTotalMmk => $composableBuilder(
    column: $table.lineTotalMmk,
    builder: (column) => column,
  );

  $$ShopSalesTableAnnotationComposer get saleId {
    final $$ShopSalesTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.saleId,
      referencedTable: $db.shopSales,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ShopSalesTableAnnotationComposer(
            $db: $db,
            $table: $db.shopSales,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }

  $$ShopProductsTableAnnotationComposer get productId {
    final $$ShopProductsTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.productId,
      referencedTable: $db.shopProducts,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ShopProductsTableAnnotationComposer(
            $db: $db,
            $table: $db.shopProducts,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$ShopSaleLinesTableTableManager
    extends
        RootTableManager<
          _$ShopDatabase,
          $ShopSaleLinesTable,
          ShopSaleLine,
          $$ShopSaleLinesTableFilterComposer,
          $$ShopSaleLinesTableOrderingComposer,
          $$ShopSaleLinesTableAnnotationComposer,
          $$ShopSaleLinesTableCreateCompanionBuilder,
          $$ShopSaleLinesTableUpdateCompanionBuilder,
          (ShopSaleLine, $$ShopSaleLinesTableReferences),
          ShopSaleLine,
          PrefetchHooks Function({bool saleId, bool productId})
        > {
  $$ShopSaleLinesTableTableManager(_$ShopDatabase db, $ShopSaleLinesTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$ShopSaleLinesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$ShopSaleLinesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$ShopSaleLinesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> saleId = const Value.absent(),
                Value<String> productId = const Value.absent(),
                Value<String> productName = const Value.absent(),
                Value<int> unitPriceMmk = const Value.absent(),
                Value<int> quantity = const Value.absent(),
                Value<int> lineTotalMmk = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => ShopSaleLinesCompanion(
                id: id,
                saleId: saleId,
                productId: productId,
                productName: productName,
                unitPriceMmk: unitPriceMmk,
                quantity: quantity,
                lineTotalMmk: lineTotalMmk,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String saleId,
                required String productId,
                required String productName,
                required int unitPriceMmk,
                required int quantity,
                required int lineTotalMmk,
                Value<int> rowid = const Value.absent(),
              }) => ShopSaleLinesCompanion.insert(
                id: id,
                saleId: saleId,
                productId: productId,
                productName: productName,
                unitPriceMmk: unitPriceMmk,
                quantity: quantity,
                lineTotalMmk: lineTotalMmk,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$ShopSaleLinesTable, ShopSaleLine>(table),
                  $$ShopSaleLinesTableReferences(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: ({saleId = false, productId = false}) {
            return PrefetchHooks(
              db: db,
              explicitlyWatchedTables: [],
              addJoins:
                  <
                    T extends TableManagerState<
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic
                    >
                  >(state) {
                    if (saleId) {
                      state = state.withJoin(
                        currentTable: table,
                        currentColumn: table.saleId,
                        referencedTable: $$ShopSaleLinesTableReferences
                            ._saleIdTable(db),
                        referencedColumn: $$ShopSaleLinesTableReferences
                            ._saleIdTable(db)
                            .id,
                      ) as T;
                    }
                    if (productId) {
                      state = state.withJoin(
                        currentTable: table,
                        currentColumn: table.productId,
                        referencedTable: $$ShopSaleLinesTableReferences
                            ._productIdTable(db),
                        referencedColumn: $$ShopSaleLinesTableReferences
                            ._productIdTable(db)
                            .id,
                      ) as T;
                    }

                    return state;
                  },
              getPrefetchedDataCallback: (items) async {
                return [];
              },
            );
          },
        ),
      );
}

typedef $$ShopSaleLinesTableProcessedTableManager =
    ProcessedTableManager<
      _$ShopDatabase,
      $ShopSaleLinesTable,
      ShopSaleLine,
      $$ShopSaleLinesTableFilterComposer,
      $$ShopSaleLinesTableOrderingComposer,
      $$ShopSaleLinesTableAnnotationComposer,
      $$ShopSaleLinesTableCreateCompanionBuilder,
      $$ShopSaleLinesTableUpdateCompanionBuilder,
      (ShopSaleLine, $$ShopSaleLinesTableReferences),
      ShopSaleLine,
      PrefetchHooks Function({bool saleId, bool productId})
    >;
typedef $$ShopStockMovementsTableCreateCompanionBuilder =
    ShopStockMovementsCompanion Function({
      required String id,
      Value<String?> saleId,
      required String productId,
      required int quantityDelta,
      required String reason,
      required int createdAtMillis,
      Value<int> rowid,
    });
typedef $$ShopStockMovementsTableUpdateCompanionBuilder =
    ShopStockMovementsCompanion Function({
      Value<String> id,
      Value<String?> saleId,
      Value<String> productId,
      Value<int> quantityDelta,
      Value<String> reason,
      Value<int> createdAtMillis,
      Value<int> rowid,
    });

final class $$ShopStockMovementsTableReferences
    extends
        BaseReferences<
          _$ShopDatabase,
          $ShopStockMovementsTable,
          ShopStockMovement
        > {
  $$ShopStockMovementsTableReferences(
    super.$_db,
    super.$_table,
    super.$_typedResult,
  );

  static $ShopSalesTable _saleIdTable(_$ShopDatabase db) =>
      db.shopSales.createAlias('shop_stock_movements__sale_id__shop_sales__id');

  $$ShopSalesTableProcessedTableManager? get saleId {
    final $_column = $_itemColumn<String>('sale_id');
    if ($_column == null) return null;
    final manager = $$ShopSalesTableTableManager(
      $_db,
      $_db.shopSales,
    ).filter((f) => f.id.sqlEquals($_column));
    final item = $_typedResult.readTableOrNull(_saleIdTable($_db));
    if (item == null) return manager;
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: [item]),
    );
  }

  static $ShopProductsTable _productIdTable(_$ShopDatabase db) => db
      .shopProducts
      .createAlias('shop_stock_movements__product_id__shop_products__id');

  $$ShopProductsTableProcessedTableManager get productId {
    final $_column = $_itemColumn<String>('product_id')!;

    final manager = $$ShopProductsTableTableManager(
      $_db,
      $_db.shopProducts,
    ).filter((f) => f.id.sqlEquals($_column));
    final item = $_typedResult.readTableOrNull(_productIdTable($_db));
    if (item == null) return manager;
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: [item]),
    );
  }
}

class $$ShopStockMovementsTableFilterComposer
    extends Composer<_$ShopDatabase, $ShopStockMovementsTable> {
  $$ShopStockMovementsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get quantityDelta => $composableBuilder(
    column: $table.quantityDelta,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get reason => $composableBuilder(
    column: $table.reason,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get createdAtMillis => $composableBuilder(
    column: $table.createdAtMillis,
    builder: (column) => ColumnFilters(column),
  );

  $$ShopSalesTableFilterComposer get saleId {
    final $$ShopSalesTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.saleId,
      referencedTable: $db.shopSales,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ShopSalesTableFilterComposer(
            $db: $db,
            $table: $db.shopSales,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }

  $$ShopProductsTableFilterComposer get productId {
    final $$ShopProductsTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.productId,
      referencedTable: $db.shopProducts,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ShopProductsTableFilterComposer(
            $db: $db,
            $table: $db.shopProducts,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$ShopStockMovementsTableOrderingComposer
    extends Composer<_$ShopDatabase, $ShopStockMovementsTable> {
  $$ShopStockMovementsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get quantityDelta => $composableBuilder(
    column: $table.quantityDelta,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get reason => $composableBuilder(
    column: $table.reason,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get createdAtMillis => $composableBuilder(
    column: $table.createdAtMillis,
    builder: (column) => ColumnOrderings(column),
  );

  $$ShopSalesTableOrderingComposer get saleId {
    final $$ShopSalesTableOrderingComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.saleId,
      referencedTable: $db.shopSales,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ShopSalesTableOrderingComposer(
            $db: $db,
            $table: $db.shopSales,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }

  $$ShopProductsTableOrderingComposer get productId {
    final $$ShopProductsTableOrderingComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.productId,
      referencedTable: $db.shopProducts,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ShopProductsTableOrderingComposer(
            $db: $db,
            $table: $db.shopProducts,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$ShopStockMovementsTableAnnotationComposer
    extends Composer<_$ShopDatabase, $ShopStockMovementsTable> {
  $$ShopStockMovementsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<int> get quantityDelta => $composableBuilder(
    column: $table.quantityDelta,
    builder: (column) => column,
  );

  GeneratedColumn<String> get reason =>
      $composableBuilder(column: $table.reason, builder: (column) => column);

  GeneratedColumn<int> get createdAtMillis => $composableBuilder(
    column: $table.createdAtMillis,
    builder: (column) => column,
  );

  $$ShopSalesTableAnnotationComposer get saleId {
    final $$ShopSalesTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.saleId,
      referencedTable: $db.shopSales,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ShopSalesTableAnnotationComposer(
            $db: $db,
            $table: $db.shopSales,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }

  $$ShopProductsTableAnnotationComposer get productId {
    final $$ShopProductsTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.productId,
      referencedTable: $db.shopProducts,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ShopProductsTableAnnotationComposer(
            $db: $db,
            $table: $db.shopProducts,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$ShopStockMovementsTableTableManager
    extends
        RootTableManager<
          _$ShopDatabase,
          $ShopStockMovementsTable,
          ShopStockMovement,
          $$ShopStockMovementsTableFilterComposer,
          $$ShopStockMovementsTableOrderingComposer,
          $$ShopStockMovementsTableAnnotationComposer,
          $$ShopStockMovementsTableCreateCompanionBuilder,
          $$ShopStockMovementsTableUpdateCompanionBuilder,
          (ShopStockMovement, $$ShopStockMovementsTableReferences),
          ShopStockMovement,
          PrefetchHooks Function({bool saleId, bool productId})
        > {
  $$ShopStockMovementsTableTableManager(
    _$ShopDatabase db,
    $ShopStockMovementsTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$ShopStockMovementsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$ShopStockMovementsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$ShopStockMovementsTableAnnotationComposer(
                $db: db,
                $table: table,
              ),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String?> saleId = const Value.absent(),
                Value<String> productId = const Value.absent(),
                Value<int> quantityDelta = const Value.absent(),
                Value<String> reason = const Value.absent(),
                Value<int> createdAtMillis = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => ShopStockMovementsCompanion(
                id: id,
                saleId: saleId,
                productId: productId,
                quantityDelta: quantityDelta,
                reason: reason,
                createdAtMillis: createdAtMillis,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                Value<String?> saleId = const Value.absent(),
                required String productId,
                required int quantityDelta,
                required String reason,
                required int createdAtMillis,
                Value<int> rowid = const Value.absent(),
              }) => ShopStockMovementsCompanion.insert(
                id: id,
                saleId: saleId,
                productId: productId,
                quantityDelta: quantityDelta,
                reason: reason,
                createdAtMillis: createdAtMillis,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$ShopStockMovementsTable, ShopStockMovement>(
                    table,
                  ),
                  $$ShopStockMovementsTableReferences(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: ({saleId = false, productId = false}) {
            return PrefetchHooks(
              db: db,
              explicitlyWatchedTables: [],
              addJoins:
                  <
                    T extends TableManagerState<
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic
                    >
                  >(state) {
                    if (saleId) {
                      state = state.withJoin(
                        currentTable: table,
                        currentColumn: table.saleId,
                        referencedTable: $$ShopStockMovementsTableReferences
                            ._saleIdTable(db),
                        referencedColumn: $$ShopStockMovementsTableReferences
                            ._saleIdTable(db)
                            .id,
                      ) as T;
                    }
                    if (productId) {
                      state = state.withJoin(
                        currentTable: table,
                        currentColumn: table.productId,
                        referencedTable: $$ShopStockMovementsTableReferences
                            ._productIdTable(db),
                        referencedColumn: $$ShopStockMovementsTableReferences
                            ._productIdTable(db)
                            .id,
                      ) as T;
                    }

                    return state;
                  },
              getPrefetchedDataCallback: (items) async {
                return [];
              },
            );
          },
        ),
      );
}

typedef $$ShopStockMovementsTableProcessedTableManager =
    ProcessedTableManager<
      _$ShopDatabase,
      $ShopStockMovementsTable,
      ShopStockMovement,
      $$ShopStockMovementsTableFilterComposer,
      $$ShopStockMovementsTableOrderingComposer,
      $$ShopStockMovementsTableAnnotationComposer,
      $$ShopStockMovementsTableCreateCompanionBuilder,
      $$ShopStockMovementsTableUpdateCompanionBuilder,
      (ShopStockMovement, $$ShopStockMovementsTableReferences),
      ShopStockMovement,
      PrefetchHooks Function({bool saleId, bool productId})
    >;
typedef $$ShopSyncOutboxTableCreateCompanionBuilder =
    ShopSyncOutboxCompanion Function({
      required String operationId,
      required String eventType,
      required String payloadJson,
      Value<String> state,
      required int createdAtMillis,
      Value<int> rowid,
    });
typedef $$ShopSyncOutboxTableUpdateCompanionBuilder =
    ShopSyncOutboxCompanion Function({
      Value<String> operationId,
      Value<String> eventType,
      Value<String> payloadJson,
      Value<String> state,
      Value<int> createdAtMillis,
      Value<int> rowid,
    });

class $$ShopSyncOutboxTableFilterComposer
    extends Composer<_$ShopDatabase, $ShopSyncOutboxTable> {
  $$ShopSyncOutboxTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get operationId => $composableBuilder(
    column: $table.operationId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get eventType => $composableBuilder(
    column: $table.eventType,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get payloadJson => $composableBuilder(
    column: $table.payloadJson,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get state => $composableBuilder(
    column: $table.state,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get createdAtMillis => $composableBuilder(
    column: $table.createdAtMillis,
    builder: (column) => ColumnFilters(column),
  );
}

class $$ShopSyncOutboxTableOrderingComposer
    extends Composer<_$ShopDatabase, $ShopSyncOutboxTable> {
  $$ShopSyncOutboxTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get operationId => $composableBuilder(
    column: $table.operationId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get eventType => $composableBuilder(
    column: $table.eventType,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get payloadJson => $composableBuilder(
    column: $table.payloadJson,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get state => $composableBuilder(
    column: $table.state,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get createdAtMillis => $composableBuilder(
    column: $table.createdAtMillis,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$ShopSyncOutboxTableAnnotationComposer
    extends Composer<_$ShopDatabase, $ShopSyncOutboxTable> {
  $$ShopSyncOutboxTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get operationId => $composableBuilder(
    column: $table.operationId,
    builder: (column) => column,
  );

  GeneratedColumn<String> get eventType =>
      $composableBuilder(column: $table.eventType, builder: (column) => column);

  GeneratedColumn<String> get payloadJson => $composableBuilder(
    column: $table.payloadJson,
    builder: (column) => column,
  );

  GeneratedColumn<String> get state =>
      $composableBuilder(column: $table.state, builder: (column) => column);

  GeneratedColumn<int> get createdAtMillis => $composableBuilder(
    column: $table.createdAtMillis,
    builder: (column) => column,
  );
}

class $$ShopSyncOutboxTableTableManager
    extends
        RootTableManager<
          _$ShopDatabase,
          $ShopSyncOutboxTable,
          ShopSyncOutboxData,
          $$ShopSyncOutboxTableFilterComposer,
          $$ShopSyncOutboxTableOrderingComposer,
          $$ShopSyncOutboxTableAnnotationComposer,
          $$ShopSyncOutboxTableCreateCompanionBuilder,
          $$ShopSyncOutboxTableUpdateCompanionBuilder,
          (
            ShopSyncOutboxData,
            BaseReferences<
              _$ShopDatabase,
              $ShopSyncOutboxTable,
              ShopSyncOutboxData
            >,
          ),
          ShopSyncOutboxData,
          PrefetchHooks Function()
        > {
  $$ShopSyncOutboxTableTableManager(
    _$ShopDatabase db,
    $ShopSyncOutboxTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$ShopSyncOutboxTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$ShopSyncOutboxTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$ShopSyncOutboxTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> operationId = const Value.absent(),
                Value<String> eventType = const Value.absent(),
                Value<String> payloadJson = const Value.absent(),
                Value<String> state = const Value.absent(),
                Value<int> createdAtMillis = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => ShopSyncOutboxCompanion(
                operationId: operationId,
                eventType: eventType,
                payloadJson: payloadJson,
                state: state,
                createdAtMillis: createdAtMillis,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String operationId,
                required String eventType,
                required String payloadJson,
                Value<String> state = const Value.absent(),
                required int createdAtMillis,
                Value<int> rowid = const Value.absent(),
              }) => ShopSyncOutboxCompanion.insert(
                operationId: operationId,
                eventType: eventType,
                payloadJson: payloadJson,
                state: state,
                createdAtMillis: createdAtMillis,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$ShopSyncOutboxTable, ShopSyncOutboxData>(table),
                  BaseReferences<
                    _$ShopDatabase,
                    $ShopSyncOutboxTable,
                    ShopSyncOutboxData
                  >(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$ShopSyncOutboxTableProcessedTableManager =
    ProcessedTableManager<
      _$ShopDatabase,
      $ShopSyncOutboxTable,
      ShopSyncOutboxData,
      $$ShopSyncOutboxTableFilterComposer,
      $$ShopSyncOutboxTableOrderingComposer,
      $$ShopSyncOutboxTableAnnotationComposer,
      $$ShopSyncOutboxTableCreateCompanionBuilder,
      $$ShopSyncOutboxTableUpdateCompanionBuilder,
      (
        ShopSyncOutboxData,
        BaseReferences<
          _$ShopDatabase,
          $ShopSyncOutboxTable,
          ShopSyncOutboxData
        >,
      ),
      ShopSyncOutboxData,
      PrefetchHooks Function()
    >;

class $ShopDatabaseManager {
  final _$ShopDatabase _db;
  $ShopDatabaseManager(this._db);
  $$MenuImportDraftsTableTableManager get menuImportDrafts =>
      $$MenuImportDraftsTableTableManager(_db, _db.menuImportDrafts);
  $$MerchantWalletProfilesTableTableManager get merchantWalletProfiles =>
      $$MerchantWalletProfilesTableTableManager(
        _db,
        _db.merchantWalletProfiles,
      );
  $$ShopProductsTableTableManager get shopProducts =>
      $$ShopProductsTableTableManager(_db, _db.shopProducts);
  $$ShopSalesTableTableManager get shopSales =>
      $$ShopSalesTableTableManager(_db, _db.shopSales);
  $$ShopSaleLinesTableTableManager get shopSaleLines =>
      $$ShopSaleLinesTableTableManager(_db, _db.shopSaleLines);
  $$ShopStockMovementsTableTableManager get shopStockMovements =>
      $$ShopStockMovementsTableTableManager(_db, _db.shopStockMovements);
  $$ShopSyncOutboxTableTableManager get shopSyncOutbox =>
      $$ShopSyncOutboxTableTableManager(_db, _db.shopSyncOutbox);
}
