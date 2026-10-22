import 'dart:convert' show json;

import 'package:flutter/services.dart' show rootBundle;

List<Map<String, dynamic>> printProfiles = [];
Map<String, dynamic> printCapabilities = {};

/// A code page entry in a capability profile.
class CodePage {
  CodePage(this.id, this.name);

  final int id;
  final String name;
}

/// Describes printer capabilities loaded from capabilities.json.
///
/// Use [load] to create an instance for a named printer profile.
class CapabilityProfile {
  CapabilityProfile._internal(this.name, this.codePages);

  /// Load and cache capabilities.json.
  ///
  /// [path] overrides the default asset path (useful when embedding the
  /// package or running outside of a Flutter app context).
  /// [jsonString] bypasses asset loading entirely — pass raw JSON for unit
  /// tests or non-Flutter environments.
  static Future<void> ensureProfileLoaded({
    String? path,
    String? jsonString,
  }) async {
    if (printCapabilities.isNotEmpty) return;

    final String content = jsonString ??
        await rootBundle.loadString(
          path ??
              'packages/unified_esc_pos_printer/lib/resources/capabilities.json',
        );

    final dynamic decoded = json.decode(content);
    printCapabilities = Map<String, dynamic>.from(decoded as Map);

    (decoded['profiles'] as Map).forEach((k, v) {
      printProfiles.add({
        'key': k,
        'vendor': v['vendor'] is String ? v['vendor'] as String : '',
        'name': v['name'] is String ? v['name'] as String : '',
        'description':
            v['description'] is String ? v['description'] as String : '',
      });
    });

    assert(printCapabilities.isNotEmpty);
  }

  /// Create a [CapabilityProfile] for the named printer model.
  ///
  /// [name] must match a key in capabilities.json. Defaults to 'default'.
  /// Pass [jsonString] to load capabilities from a raw JSON string instead
  /// of the bundled asset (useful for unit tests).
  static Future<CapabilityProfile> load({
    String name = 'default',
    String? jsonString,
  }) async {
    await ensureProfileLoaded(jsonString: jsonString);

    final dynamic profile = printCapabilities['profiles'][name];
    if (profile == null) {
      throw ArgumentError("CapabilityProfile '$name' does not exist");
    }

    final List<CodePage> list = [];
    (profile['codePages'] as Map).forEach((k, v) {
      list.add(CodePage(int.parse(k as String), v as String));
    });

    return CapabilityProfile._internal(name, list);
  }

  /// Return metadata for all available profiles.
  static Future<List<Map<String, dynamic>>> getAvailableProfiles() async {
    await ensureProfileLoaded();

    final List<Map<String, dynamic>> res = [];

    (printCapabilities['profiles'] as Map).forEach((k, v) {
      res.add({
        'key': k,
        'vendor': v['vendor'] is String ? v['vendor'] as String : '',
        'name': v['name'] is String ? v['name'] as String : '',
        'description':
            v['description'] is String ? v['description'] as String : '',
      });
    });

    return res;
  }

  final String name;
  final List<CodePage> codePages;

  /// Returns a new [CapabilityProfile] with this profile's code pages augmented
  /// by [other]'s code pages. Entries from [other] take precedence when both
  /// profiles define the same numeric code page ID.
  CapabilityProfile merge(CapabilityProfile other) {
    final merged = Map<int, CodePage>.fromEntries(
      codePages.map((cp) => MapEntry(cp.id, cp)),
    )..addEntries(other.codePages.map((cp) => MapEntry(cp.id, cp)));

    return CapabilityProfile._internal(name, merged.values.toList());
  }

  /// Get the numeric ESC/POS code page ID for [codePage] (e.g. 'CP437').
  int getCodePageId(String? codePage) {
    if (codePages.isEmpty) {
      throw StateError("CapabilityProfile '$name' has no code pages");
    }

    try {
      return codePages.firstWhere((cp) => cp.name == codePage).id;
    } catch (_) {
      throw ArgumentError(
        "Code page '$codePage' is not defined in profile '$name'",
      );
    }
  }
}
