import 'dart:convert';

class MenuCandidate {
  const MenuCandidate({
    required this.category,
    required this.name,
    required this.description,
    required this.priceMmk,
  });

  final String category;
  final String name;
  final String description;
  final int? priceMmk;

  factory MenuCandidate.fromJson(Object? value) {
    if (value is! Map<String, dynamic>) {
      throw const FormatException('Menu item must be an object.');
    }
    const expected = {'category', 'description', 'name', 'price'};
    if (value.keys.toSet().difference(expected).isNotEmpty ||
        expected.difference(value.keys.toSet()).isNotEmpty) {
      throw const FormatException('Menu item fields do not match v1.');
    }
    final category = value['category'];
    final name = value['name'];
    final description = value['description'];
    final price = value['price'];
    if (category is! String ||
        name is! String ||
        description is! String ||
        category.trim().isEmpty ||
        name.trim().isEmpty ||
        category.length > 80 ||
        name.length > 160 ||
        description.length > 800 ||
        (price != null && price is! int) ||
        (price is int && (price < 0 || price > 2000000000))) {
      throw const FormatException('Menu item values are invalid.');
    }
    return MenuCandidate(
      category: category.trim(),
      name: name.trim(),
      description: description.trim(),
      priceMmk: price as int?,
    );
  }
}

class MenuDraftInput {
  const MenuDraftInput({
    required this.id,
    required this.batchId,
    required this.category,
    required this.name,
    required this.description,
    required this.priceMmk,
    required this.sku,
    required this.barcode,
    required this.openingStock,
  });

  final String id;
  final String batchId;
  final String category;
  final String name;
  final String description;
  final int? priceMmk;
  final String? sku;
  final String? barcode;
  final int? openingStock;
}

class MerchantWalletSetup {
  const MerchantWalletSetup({
    required this.provider,
    required this.merchantPhone,
    required this.officialQrPayload,
    required this.issuerConfirmed,
  });

  final String provider;
  final String? merchantPhone;
  final String? officialQrPayload;
  final bool issuerConfirmed;
}

String? qrPayloadForDisplay(
  String? payload, {
  required bool confirmedAsProviderIssued,
}) {
  final value = payload?.trim();
  if (!confirmedAsProviderIssued ||
      value == null ||
      !isValidStaticMyanmarMmqr(value)) {
    return null;
  }
  // This checks payload structure and checksum, not issuer identity or settlement.
  return value;
}

bool isValidStaticMyanmarMmqr(String payload) {
  try {
    final bytes = utf8.encode(payload);
    if (bytes.length > 512 || bytes.length < 8) return false;
    final fields = _parseEmvco(bytes);
    if (fields == null || fields.isEmpty || fields.first.$1 != '00') {
      return false;
    }
    final values = _uniqueTlvValues(fields);
    if (values == null ||
        fields.last.$1 != '63' ||
        !RegExp(r'^[0-9A-F]{4}$').hasMatch(values['63'] ?? '') ||
        values['63'] != _mmqrCrc16(bytes.sublist(0, bytes.length - 4)) ||
        values['00'] != '01' ||
        values['01'] != '11' ||
        values.containsKey('54') ||
        !RegExp(r'^[0-9]{4}$').hasMatch(values['52'] ?? '') ||
        values['53'] != '104' ||
        values['58'] != 'MM' ||
        !RegExp(r'^[\x20-\x7E]{1,25}$').hasMatch(values['59'] ?? '') ||
        !RegExp(r'^[\x20-\x7E]{1,15}$').hasMatch(values['60'] ?? '') ||
        !_validAdditionalData(values['62']) ||
        !_validFeeFields(values)) {
      return false;
    }

    final merchantFields = values['26'] == null
        ? null
        : _parseEmvco(utf8.encode(values['26']!));
    if (merchantFields == null) return false;
    final merchant = _uniqueTlvValues(merchantFields);
    if (merchant == null ||
        merchant['00']?.toUpperCase() != 'MM.COM.MMQR' ||
        !RegExp(r'^[0-9]{15}$').hasMatch(merchant['01'] ?? '') ||
        !RegExp(r'^[0-9]{1,25}$').hasMatch(merchant['02'] ?? '')) {
      return false;
    }

    final languageFields = values['64'] == null
        ? null
        : _parseEmvco(utf8.encode(values['64']!));
    if (languageFields == null) return false;
    final language = _uniqueTlvValues(languageFields);
    final burmeseName = language?['01'] ?? '';
    return language != null &&
        language.keys.every((id) => const {'00', '01', '02'}.contains(id)) &&
        language['00'] == 'my' &&
        burmeseName.isNotEmpty &&
        utf8.encode(burmeseName).length <= 25 &&
        RegExp(r'[\u1000-\u109F]').hasMatch(burmeseName) &&
        (language['02'] == null ||
            (language['02']!.isNotEmpty &&
                utf8.encode(language['02']!).length <= 15));
  } on FormatException {
    return false;
  } on RangeError {
    return false;
  }
}

bool _validAdditionalData(String? value) {
  if (value == null) return true;
  final fields = _parseEmvco(utf8.encode(value));
  if (fields == null || fields.isEmpty || _uniqueTlvValues(fields) == null) {
    return false;
  }
  for (final (id, fieldValue) in fields) {
    final numericId = int.parse(id);
    final byteLength = utf8.encode(fieldValue).length;
    if (numericId >= 1 && numericId <= 8) {
      if (byteLength > 25 || !RegExp(r'^[\x20-\x7E]+$').hasMatch(fieldValue)) {
        return false;
      }
    } else if (id == '09') {
      if (!RegExp(r'^[AME]{1,3}$').hasMatch(fieldValue) ||
          fieldValue.runes.toSet().length != fieldValue.runes.length) {
        return false;
      }
    } else if (id == '10') {
      if (byteLength > 20 || !RegExp(r'^[\x20-\x7E]+$').hasMatch(fieldValue)) {
        return false;
      }
    } else if (id == '11') {
      if (!RegExp(r'^[0-7][0-3][0-3]$').hasMatch(fieldValue)) return false;
    } else if (numericId >= 12 && numericId <= 49) {
      return false;
    } else if (numericId >= 50 && numericId <= 99) {
      final nested = _parseEmvco(utf8.encode(fieldValue));
      if (nested == null ||
          nested.isEmpty ||
          _uniqueTlvValues(nested) == null) {
        return false;
      }
    } else {
      return false;
    }
  }
  return true;
}

bool _validFeeFields(Map<String, String> values) {
  final indicator = values['55'];
  final fixed = values['56'];
  final percentage = values['57'];
  if (indicator == null) return fixed == null && percentage == null;
  if (indicator == '01') return fixed == null && percentage == null;
  if (indicator == '02') {
    return fixed != null &&
        percentage == null &&
        utf8.encode(fixed).length <= 13 &&
        RegExp(r'^\d+(?:\.\d{1,2})?$').hasMatch(fixed);
  }
  if (indicator == '03') {
    return percentage != null &&
        fixed == null &&
        RegExp(r'^[0-9]{1,5}$').hasMatch(percentage);
  }
  return false;
}

List<(String, String)>? _parseEmvco(List<int> bytes) {
  final fields = <(String, String)>[];
  var cursor = 0;
  while (cursor < bytes.length) {
    if (cursor + 4 > bytes.length) return null;
    final id = String.fromCharCodes(bytes.sublist(cursor, cursor + 2));
    final lengthText = String.fromCharCodes(
      bytes.sublist(cursor + 2, cursor + 4),
    );
    if (!RegExp(r'^[0-9]{2}$').hasMatch(id) ||
        !RegExp(r'^[0-9]{2}$').hasMatch(lengthText)) {
      return null;
    }
    final length = int.parse(lengthText);
    final start = cursor + 4;
    final end = start + length;
    if (end > bytes.length) return null;
    fields.add((id, utf8.decode(bytes.sublist(start, end))));
    cursor = end;
  }
  return fields;
}

Map<String, String>? _uniqueTlvValues(List<(String, String)> fields) {
  final values = <String, String>{};
  for (final (id, value) in fields) {
    if (values.containsKey(id)) return null;
    values[id] = value;
  }
  return values;
}

String _mmqrCrc16(List<int> bytes) {
  var crc = 0xffff;
  for (final byte in bytes) {
    crc ^= byte << 8;
    for (var bit = 0; bit < 8; bit++) {
      crc = (crc & 0x8000) != 0 ? ((crc << 1) ^ 0x1021) : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toRadixString(16).toUpperCase().padLeft(4, '0');
}
