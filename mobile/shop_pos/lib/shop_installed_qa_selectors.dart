import 'package:flutter/widgets.dart';

/// Stable locale-independent identifiers for black-box installed QA.
///
/// These add accessibility metadata only. They do not enable a QA profile,
/// grant authority, expose state, or change the wrapped control's behavior.
extension ShopInstalledQaSelector on Widget {
  Widget withInstalledQaIdentifier(String identifier) =>
      Semantics(identifier: identifier, child: this);
}
