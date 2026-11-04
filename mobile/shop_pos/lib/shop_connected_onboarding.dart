import 'package:flutter/material.dart';

/// The connected-site wizard is intentionally not wired into the application
/// until its identity, coordinator, and installed-device release gates pass.
const connectedOnboardingDefaultEnabled = false;

enum ConnectedOnboardingMode { selfService, guided, whiteGlove }

enum ConnectedShopTemplate { retail, cafe }

enum ConnectedOnboardingStep {
  ownerEnrollment,
  shopTemplate,
  catalog,
  staffRoles,
  coordinator,
  pairing,
  testSale,
  printerCheck,
  backupConfirmation,
}

extension ConnectedOnboardingStepPolicy on ConnectedOnboardingStep {
  bool get requiresInternet => this == ConnectedOnboardingStep.ownerEnrollment;

  String get evidenceKind => switch (this) {
    ConnectedOnboardingStep.ownerEnrollment => 'owner_enrollment',
    ConnectedOnboardingStep.shopTemplate => 'shop_template_selection',
    ConnectedOnboardingStep.catalog => 'catalog_configuration',
    ConnectedOnboardingStep.staffRoles => 'staff_role_assignment',
    ConnectedOnboardingStep.coordinator => 'coordinator_selection',
    ConnectedOnboardingStep.pairing => 'device_pairing',
    ConnectedOnboardingStep.testSale => 'practice_sale',
    ConnectedOnboardingStep.printerCheck => 'named_printer_check',
    ConnectedOnboardingStep.backupConfirmation =>
      'encrypted_backup_confirmation',
  };
}

class ConnectedOnboardingEvidenceContext {
  ConnectedOnboardingEvidenceContext({
    required String tenantId,
    required String siteId,
    required String deviceId,
    required String artifactDigest,
    required String protocolVersion,
  }) : tenantId = _validatedContextId(tenantId, 'tenant_id'),
       siteId = _validatedContextId(siteId, 'site_id'),
       deviceId = _validatedContextId(deviceId, 'device_id'),
       artifactDigest = _validatedDigest(artifactDigest),
       protocolVersion = _validatedContextId(
         protocolVersion,
         'protocol_version',
       );

  final String tenantId;
  final String siteId;
  final String deviceId;
  final String artifactDigest;
  final String protocolVersion;
}

class ConnectedOnboardingEvidence {
  const ConnectedOnboardingEvidence({
    required this.step,
    required this.evidenceKind,
    required this.evidenceId,
    required this.subjectDigest,
    required this.tenantId,
    required this.siteId,
    required this.deviceId,
    required this.artifactDigest,
    required this.protocolVersion,
    required this.template,
    required this.completedAt,
  });

  final ConnectedOnboardingStep step;
  final String evidenceKind;
  final String evidenceId;
  final String subjectDigest;
  final String tenantId;
  final String siteId;
  final String deviceId;
  final String artifactDigest;
  final String protocolVersion;
  final ConnectedShopTemplate? template;
  final DateTime completedAt;

  Map<String, Object?> toJson() => <String, Object?>{
    'step': step.name,
    'evidenceKind': evidenceKind,
    'evidenceId': evidenceId,
    'subjectDigest': subjectDigest,
    'tenantId': tenantId,
    'siteId': siteId,
    'deviceId': deviceId,
    'artifactDigest': artifactDigest,
    'protocolVersion': protocolVersion,
    'template': template?.name,
    'completedAt': completedAt.toUtc().toIso8601String(),
  };

  factory ConnectedOnboardingEvidence.fromJson(Map<String, Object?> json) {
    final step = _enumByName(ConnectedOnboardingStep.values, json['step']);
    final evidenceKind = _boundedString(
      json['evidenceKind'],
      'evidence_kind',
      64,
    );
    final evidenceId = _boundedString(json['evidenceId'], 'evidenceId', 128);
    final digest = _boundedString(json['subjectDigest'], 'subjectDigest', 64);
    if (!RegExp(r'^[a-f0-9]{64}$').hasMatch(digest)) {
      throw const FormatException('connected_onboarding_digest_invalid');
    }
    final completedAt = DateTime.tryParse(
      _boundedString(json['completedAt'], 'completedAt', 64),
    );
    if (completedAt == null || !completedAt.isUtc) {
      throw const FormatException('connected_onboarding_time_invalid');
    }
    final templateValue = json['template'];
    final template = templateValue == null
        ? null
        : _enumByName(ConnectedShopTemplate.values, templateValue);
    return ConnectedOnboardingEvidence(
      step: step,
      evidenceKind: evidenceKind,
      evidenceId: evidenceId,
      subjectDigest: digest,
      tenantId: _validatedContextId(
        _boundedString(json['tenantId'], 'tenant_id', 128),
        'tenant_id',
      ),
      siteId: _validatedContextId(
        _boundedString(json['siteId'], 'site_id', 128),
        'site_id',
      ),
      deviceId: _validatedContextId(
        _boundedString(json['deviceId'], 'device_id', 128),
        'device_id',
      ),
      artifactDigest: _validatedDigest(
        _boundedString(json['artifactDigest'], 'artifact_digest', 64),
      ),
      protocolVersion: _validatedContextId(
        _boundedString(json['protocolVersion'], 'protocol_version', 128),
        'protocol_version',
      ),
      template: template,
      completedAt: completedAt,
    );
  }
}

class ConnectedOnboardingResumeContext
    extends ConnectedOnboardingEvidenceContext {
  ConnectedOnboardingResumeContext({
    required super.tenantId,
    required super.siteId,
    required super.deviceId,
    required super.artifactDigest,
    required super.protocolVersion,
  });
}

class ConnectedOnboardingResumeBinding {
  const ConnectedOnboardingResumeBinding({
    required this.progressId,
    required this.mode,
    required this.template,
    required this.evidence,
    required this.deviceId,
    required this.artifactDigest,
    required this.tenantId,
    required this.siteId,
    required this.protocolVersion,
  });

  final String progressId;
  final ConnectedOnboardingMode mode;
  final ConnectedShopTemplate? template;
  final ConnectedOnboardingEvidence evidence;
  final String deviceId;
  final String artifactDigest;
  final String tenantId;
  final String siteId;
  final String protocolVersion;
}

abstract interface class ConnectedOnboardingResumeVerifier {
  Future<bool> verify(ConnectedOnboardingResumeBinding binding);
}

/// Safe default when no issuer-backed resume verifier has been integrated.
class UnavailableConnectedOnboardingResumeVerifier
    implements ConnectedOnboardingResumeVerifier {
  const UnavailableConnectedOnboardingResumeVerifier();

  @override
  Future<bool> verify(ConnectedOnboardingResumeBinding binding) async => false;
}

class CallbackConnectedOnboardingResumeVerifier
    implements ConnectedOnboardingResumeVerifier {
  const CallbackConnectedOnboardingResumeVerifier(this.callback);

  final Future<bool> Function(ConnectedOnboardingResumeBinding binding)
  callback;

  @override
  Future<bool> verify(ConnectedOnboardingResumeBinding binding) =>
      callback(binding);
}

class ConnectedOnboardingProgress {
  const ConnectedOnboardingProgress._({
    required this.progressId,
    required this.mode,
    required this.template,
    required this.evidence,
    required this._unverifiedResumeEvidence,
  });

  static const schema = 'supermega.connected-onboarding.v2';

  factory ConnectedOnboardingProgress.start({
    required String progressId,
    ConnectedOnboardingMode mode = ConnectedOnboardingMode.guided,
  }) => ConnectedOnboardingProgress._(
    progressId: _validatedProgressId(progressId),
    mode: mode,
    template: null,
    evidence: const <ConnectedOnboardingStep, ConnectedOnboardingEvidence>{},
    unverifiedResumeEvidence:
        const <ConnectedOnboardingStep, ConnectedOnboardingEvidence>{},
  );

  final String progressId;
  final ConnectedOnboardingMode mode;
  final ConnectedShopTemplate? template;
  final Map<ConnectedOnboardingStep, ConnectedOnboardingEvidence> evidence;
  final Map<ConnectedOnboardingStep, ConnectedOnboardingEvidence>
  _unverifiedResumeEvidence;

  bool get hasUnverifiedResumeEvidence => _unverifiedResumeEvidence.isNotEmpty;

  ConnectedOnboardingStep? get currentStep {
    for (final step in ConnectedOnboardingStep.values) {
      if (!evidence.containsKey(step)) return step;
    }
    return null;
  }

  bool get isComplete => currentStep == null;

  ConnectedOnboardingProgress chooseMode(ConnectedOnboardingMode value) {
    if (evidence.isNotEmpty || _unverifiedResumeEvidence.isNotEmpty) {
      throw StateError('connected_onboarding_mode_locked');
    }
    return _copy(mode: value);
  }

  ConnectedOnboardingProgress chooseTemplate(ConnectedShopTemplate value) {
    if (currentStep != ConnectedOnboardingStep.shopTemplate) {
      throw StateError('connected_onboarding_template_not_current');
    }
    return _copy(template: value);
  }

  ConnectedOnboardingProgress record(
    ConnectedOnboardingEvidence value, {
    required ConnectedOnboardingEvidenceContext context,
  }) {
    final expected = currentStep;
    if (expected == null) {
      throw StateError('connected_onboarding_already_complete');
    }
    if (value.step != expected) {
      throw StateError('connected_onboarding_step_out_of_order');
    }
    if (expected == ConnectedOnboardingStep.shopTemplate && template == null) {
      throw StateError('connected_onboarding_template_required');
    }
    _validateEvidence(value, context: context, expectedTemplate: template);
    return _copy(
      evidence: <ConnectedOnboardingStep, ConnectedOnboardingEvidence>{
        ...evidence,
        expected: value,
      },
    );
  }

  /// Verifies a deserialized UX draft before any persisted step is allowed to
  /// skip operational work. This is still onboarding progress, not release,
  /// merchant-acceptance, signing, hardware, or production evidence.
  Future<ConnectedOnboardingProgress> verifyResume({
    ConnectedOnboardingResumeVerifier verifier =
        const UnavailableConnectedOnboardingResumeVerifier(),
    required ConnectedOnboardingResumeContext context,
  }) async {
    if (_unverifiedResumeEvidence.isEmpty) return this;
    final verified = <ConnectedOnboardingStep, ConnectedOnboardingEvidence>{};
    for (final step in ConnectedOnboardingStep.values) {
      final item = _unverifiedResumeEvidence[step];
      if (item == null) break;
      try {
        _validateEvidence(
          item,
          context: context,
          expectedTemplate: step == ConnectedOnboardingStep.ownerEnrollment
              ? null
              : template,
        );
      } on FormatException {
        throw StateError('connected_onboarding_resume_unverified');
      }
      final accepted = await verifier.verify(
        ConnectedOnboardingResumeBinding(
          progressId: progressId,
          mode: mode,
          template: template,
          evidence: item,
          deviceId: context.deviceId,
          artifactDigest: context.artifactDigest,
          tenantId: context.tenantId,
          siteId: context.siteId,
          protocolVersion: context.protocolVersion,
        ),
      );
      if (!accepted) {
        throw StateError('connected_onboarding_resume_unverified');
      }
      verified[step] = item;
    }
    return ConnectedOnboardingProgress._(
      progressId: progressId,
      mode: mode,
      template: template,
      evidence: Map.unmodifiable(verified),
      unverifiedResumeEvidence:
          const <ConnectedOnboardingStep, ConnectedOnboardingEvidence>{},
    );
  }

  Map<String, Object?> toJson() => <String, Object?>{
    'schema': schema,
    'progressId': progressId,
    'mode': mode.name,
    'template': template?.name,
    'evidence': ConnectedOnboardingStep.values
        .where(_serializedEvidence.containsKey)
        .map((step) => _serializedEvidence[step]!.toJson())
        .toList(growable: false),
  };

  factory ConnectedOnboardingProgress.fromJson(Map<String, Object?> json) {
    if (json['schema'] != schema) {
      throw const FormatException('connected_onboarding_schema_unknown');
    }
    final mode = _enumByName(ConnectedOnboardingMode.values, json['mode']);
    final templateValue = json['template'];
    final template = templateValue == null
        ? null
        : _enumByName(ConnectedShopTemplate.values, templateValue);
    final rawEvidence = json['evidence'];
    if (rawEvidence is! List<Object?>) {
      throw const FormatException('connected_onboarding_evidence_invalid');
    }
    final parsed = <ConnectedOnboardingStep, ConnectedOnboardingEvidence>{};
    for (var index = 0; index < rawEvidence.length; index++) {
      final raw = rawEvidence[index];
      if (raw is! Map) {
        throw const FormatException('connected_onboarding_evidence_invalid');
      }
      final item = ConnectedOnboardingEvidence.fromJson(
        raw.map((key, value) => MapEntry(key.toString(), value)),
      );
      if (index >= ConnectedOnboardingStep.values.length ||
          item.step != ConnectedOnboardingStep.values[index] ||
          parsed.containsKey(item.step)) {
        throw const FormatException('connected_onboarding_order_invalid');
      }
      _validateEvidence(
        item,
        context: ConnectedOnboardingEvidenceContext(
          tenantId: item.tenantId,
          siteId: item.siteId,
          deviceId: item.deviceId,
          artifactDigest: item.artifactDigest,
          protocolVersion: item.protocolVersion,
        ),
        expectedTemplate: item.step == ConnectedOnboardingStep.ownerEnrollment
            ? null
            : template,
      );
      parsed[item.step] = item;
    }
    if (parsed.containsKey(ConnectedOnboardingStep.shopTemplate) &&
        template == null) {
      throw const FormatException('connected_onboarding_template_missing');
    }
    return ConnectedOnboardingProgress._(
      progressId: _validatedProgressId(
        _boundedString(json['progressId'], 'progressId', 128),
      ),
      mode: mode,
      template: template,
      evidence: const <ConnectedOnboardingStep, ConnectedOnboardingEvidence>{},
      unverifiedResumeEvidence: Map.unmodifiable(parsed),
    );
  }

  Map<ConnectedOnboardingStep, ConnectedOnboardingEvidence>
  get _serializedEvidence =>
      evidence.isNotEmpty ? evidence : _unverifiedResumeEvidence;

  ConnectedOnboardingProgress _copy({
    ConnectedOnboardingMode? mode,
    ConnectedShopTemplate? template,
    Map<ConnectedOnboardingStep, ConnectedOnboardingEvidence>? evidence,
  }) => ConnectedOnboardingProgress._(
    progressId: progressId,
    mode: mode ?? this.mode,
    template: template ?? this.template,
    evidence: Map.unmodifiable(evidence ?? this.evidence),
    unverifiedResumeEvidence: _unverifiedResumeEvidence,
  );
}

typedef ConnectedOnboardingStepHandler =
    Future<ConnectedOnboardingEvidence?> Function(
      ConnectedOnboardingStep step,
      ConnectedOnboardingProgress progress,
    );

class ConnectedOnboardingController extends ChangeNotifier {
  factory ConnectedOnboardingController({
    required ConnectedOnboardingProgress progress,
    required ConnectedOnboardingEvidenceContext evidenceContext,
    required ConnectedOnboardingStepHandler stepHandler,
    required bool Function() internetAvailable,
  }) => ConnectedOnboardingController._(
    progress,
    evidenceContext,
    stepHandler,
    internetAvailable,
  );

  ConnectedOnboardingController._(
    this._progress,
    this._evidenceContext,
    this._stepHandler,
    this._internetAvailable,
  );

  ConnectedOnboardingProgress _progress;
  final ConnectedOnboardingEvidenceContext _evidenceContext;
  final ConnectedOnboardingStepHandler _stepHandler;
  final bool Function() _internetAvailable;
  bool _busy = false;
  String? _error;

  ConnectedOnboardingProgress get progress => _progress;
  bool get busy => _busy;
  String? get error => _error;

  void chooseMode(ConnectedOnboardingMode value) {
    _progress = _progress.chooseMode(value);
    notifyListeners();
  }

  void chooseTemplate(ConnectedShopTemplate value) {
    _progress = _progress.chooseTemplate(value);
    notifyListeners();
  }

  Future<void> runCurrentStep() async {
    if (_busy) return;
    if (_progress.hasUnverifiedResumeEvidence) {
      _error = 'connected_onboarding_resume_unverified';
      notifyListeners();
      return;
    }
    final step = _progress.currentStep;
    if (step == null) return;
    if (step.requiresInternet && !_internetAvailable()) {
      _error = 'connected_onboarding_internet_required';
      notifyListeners();
      return;
    }
    if (step == ConnectedOnboardingStep.shopTemplate &&
        _progress.template == null) {
      _error = 'connected_onboarding_template_required';
      notifyListeners();
      return;
    }
    _busy = true;
    _error = null;
    notifyListeners();
    try {
      final evidence = await _stepHandler(step, _progress);
      if (evidence == null) {
        _error = 'connected_onboarding_evidence_required';
        return;
      }
      _progress = _progress.record(evidence, context: _evidenceContext);
    } on Object {
      _error = 'connected_onboarding_step_failed';
    } finally {
      _busy = false;
      notifyListeners();
    }
  }
}

class ConnectedOnboardingScreen extends StatefulWidget {
  const ConnectedOnboardingScreen({
    super.key,
    required this.initialProgress,
    required this.stepHandler,
    required this.internetAvailable,
    required this.evidenceContext,
    this.enabled = connectedOnboardingDefaultEnabled,
    this.myanmar = false,
    this.onProgressChanged,
  });

  final ConnectedOnboardingProgress initialProgress;
  final ConnectedOnboardingStepHandler stepHandler;
  final bool Function() internetAvailable;
  final ConnectedOnboardingEvidenceContext evidenceContext;
  final bool enabled;
  final bool myanmar;
  final ValueChanged<ConnectedOnboardingProgress>? onProgressChanged;

  @override
  State<ConnectedOnboardingScreen> createState() =>
      _ConnectedOnboardingScreenState();
}

class _ConnectedOnboardingScreenState extends State<ConnectedOnboardingScreen> {
  late final ConnectedOnboardingController _controller;

  @override
  void initState() {
    super.initState();
    _controller = ConnectedOnboardingController(
      progress: widget.initialProgress,
      evidenceContext: widget.evidenceContext,
      stepHandler: widget.stepHandler,
      internetAvailable: widget.internetAvailable,
    )..addListener(_changed);
  }

  @override
  void dispose() {
    _controller
      ..removeListener(_changed)
      ..dispose();
    super.dispose();
  }

  void _changed() {
    if (mounted) setState(() {});
    widget.onProgressChanged?.call(_controller.progress);
  }

  @override
  Widget build(BuildContext context) {
    final my = widget.myanmar;
    if (!widget.enabled) {
      return Scaffold(
        appBar: AppBar(
          title: Text(
            _copy(my, 'Connected setup', 'ချိတ်ဆက်စနစ် ပြင်ဆင်ခြင်း'),
          ),
        ),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              _copy(
                my,
                'Connected setup is not available in this build.',
                'ဤဗားရှင်းတွင် ချိတ်ဆက်စနစ် ပြင်ဆင်ခြင်းကို အသုံးမပြုနိုင်သေးပါ။',
              ),
              textAlign: TextAlign.center,
            ),
          ),
        ),
      );
    }

    final progress = _controller.progress;
    final current = progress.currentStep;
    final resumeLocked = progress.hasUnverifiedResumeEvidence;
    return Scaffold(
      appBar: AppBar(
        title: Text(_copy(my, 'Shop setup', 'ဆိုင် စတင်ပြင်ဆင်ခြင်း')),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: <Widget>[
          Text(
            _copy(
              my,
              'Guided setup is recommended. You can also complete the same verified steps yourself or with white-glove help.',
              'လမ်းညွှန်ဖြင့် ပြင်ဆင်ခြင်းကို အကြံပြုပါသည်။ တူညီသော စစ်ဆေးထားသည့် အဆင့်များကို ကိုယ်တိုင် သို့မဟုတ် အကူအညီအပြည့်ဖြင့်လည်း ပြီးစီးနိုင်ပါသည်။',
            ),
          ),
          const SizedBox(height: 16),
          DropdownButtonFormField<ConnectedOnboardingMode>(
            initialValue: progress.mode,
            decoration: InputDecoration(
              labelText: _copy(my, 'Setup style', 'ပြင်ဆင်မှုပုံစံ'),
            ),
            items: ConnectedOnboardingMode.values
                .map(
                  (mode) => DropdownMenuItem(
                    value: mode,
                    child: Text(_modeLabel(mode, my)),
                  ),
                )
                .toList(growable: false),
            onChanged: progress.evidence.isEmpty && !resumeLocked
                ? (value) {
                    if (value != null) _controller.chooseMode(value);
                  }
                : null,
          ),
          if (current == ConnectedOnboardingStep.shopTemplate) ...<Widget>[
            const SizedBox(height: 12),
            DropdownButtonFormField<ConnectedShopTemplate>(
              initialValue: progress.template,
              decoration: InputDecoration(
                labelText: _copy(my, 'Shop type', 'ဆိုင်အမျိုးအစား'),
              ),
              items: ConnectedShopTemplate.values
                  .map(
                    (template) => DropdownMenuItem(
                      value: template,
                      child: Text(_templateLabel(template, my)),
                    ),
                  )
                  .toList(growable: false),
              onChanged: resumeLocked
                  ? null
                  : (value) {
                      if (value != null) _controller.chooseTemplate(value);
                    },
            ),
          ],
          if (resumeLocked) ...<Widget>[
            const SizedBox(height: 12),
            Text(
              _copy(
                my,
                'Saved setup evidence must be verified for this shop, device, app artifact and protocol before setup can continue. No step has been accepted yet.',
                'သိမ်းထားသော ပြင်ဆင်မှုအထောက်အထားကို ဤဆိုင်၊ စက်၊ အက်ပ်ဗားရှင်းနှင့် ချိတ်ဆက်စနစ်အတွက် စစ်ဆေးအတည်ပြုပြီးမှ ဆက်လုပ်နိုင်ပါသည်။ မည်သည့်အဆင့်ကိုမျှ အတည်မပြုရသေးပါ။',
              ),
              key: const Key('connected-onboarding-resume-verification'),
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ],
          const SizedBox(height: 16),
          for (final step in ConnectedOnboardingStep.values)
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Icon(
                progress.evidence.containsKey(step)
                    ? Icons.check_circle
                    : step == current
                    ? Icons.radio_button_checked
                    : Icons.radio_button_unchecked,
              ),
              title: Text(_stepLabel(step, my)),
              subtitle: step.requiresInternet
                  ? Text(_copy(my, 'Internet required', 'အင်တာနက် လိုအပ်သည်'))
                  : null,
            ),
          if (_controller.error != null)
            Text(
              _errorLabel(_controller.error!, my),
              key: const Key('connected-onboarding-error'),
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          if (current != null)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: FilledButton(
                onPressed: _controller.busy || resumeLocked
                    ? null
                    : _controller.runCurrentStep,
                child: Text(
                  _controller.busy
                      ? _copy(my, 'Checking…', 'စစ်ဆေးနေသည်…')
                      : _copy(
                          my,
                          'Complete verified step',
                          'စစ်ဆေးထားသည့်အဆင့်ကို ပြီးစီးမည်',
                        ),
                ),
              ),
            )
          else
            Text(
              _copy(
                my,
                'Setup evidence is complete for this device. This does not approve production release.',
                'ဤစက်အတွက် ပြင်ဆင်မှုအထောက်အထား ပြည့်စုံပါသည်။ ထုတ်လုပ်အသုံးပြုရန် အတည်ပြုခြင်း မဟုတ်ပါ။',
              ),
              key: const Key('connected-onboarding-complete'),
            ),
          const Divider(height: 32),
          Text(
            _copy(my, 'Current boundaries', 'လက်ရှိ ကန့်သတ်ချက်များ'),
            style: Theme.of(context).textTheme.titleMedium,
          ),
          Semantics(
            container: true,
            label: _boundaries(my).join(' '),
            child: Column(
              key: const Key('connected-onboarding-boundaries'),
              children: <Widget>[
                for (final boundary in _boundaries(my))
                  ListTile(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.info_outline),
                    title: Text(boundary),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

String _copy(bool myanmar, String english, String burmese) =>
    myanmar ? burmese : english;

String _modeLabel(ConnectedOnboardingMode mode, bool myanmar) => switch (mode) {
  ConnectedOnboardingMode.selfService => _copy(
    myanmar,
    'Self-service',
    'ကိုယ်တိုင် ပြင်ဆင်မည်',
  ),
  ConnectedOnboardingMode.guided => _copy(
    myanmar,
    'Guided (recommended)',
    'လမ်းညွှန်ဖြင့် (အကြံပြု)',
  ),
  ConnectedOnboardingMode.whiteGlove => _copy(
    myanmar,
    'White-glove help',
    'အကူအညီအပြည့်',
  ),
};

String _templateLabel(ConnectedShopTemplate template, bool myanmar) =>
    switch (template) {
      ConnectedShopTemplate.retail => _copy(
        myanmar,
        'Retail shop',
        'လက်လီဆိုင်',
      ),
      ConnectedShopTemplate.cafe => _copy(
        myanmar,
        'Café / restaurant',
        'ကဖေး / စားသောက်ဆိုင်',
      ),
    };

String _stepLabel(ConnectedOnboardingStep step, bool myanmar) => switch (step) {
  ConnectedOnboardingStep.ownerEnrollment => _copy(
    myanmar,
    'Enroll the owner and device',
    'ဆိုင်ရှင်နှင့် စက်ကို စာရင်းသွင်းမည်',
  ),
  ConnectedOnboardingStep.shopTemplate => _copy(
    myanmar,
    'Choose the shop template',
    'ဆိုင်ပုံစံ ရွေးမည်',
  ),
  ConnectedOnboardingStep.catalog => _copy(
    myanmar,
    'Prepare the catalog',
    'ကုန်ပစ္စည်းစာရင်း ပြင်ဆင်မည်',
  ),
  ConnectedOnboardingStep.staffRoles => _copy(
    myanmar,
    'Assign staff roles',
    'ဝန်ထမ်း တာဝန်များ သတ်မှတ်မည်',
  ),
  ConnectedOnboardingStep.coordinator => _copy(
    myanmar,
    'Choose the coordinator device',
    'အဓိက ချိတ်ဆက်စက် ရွေးမည်',
  ),
  ConnectedOnboardingStep.pairing => _copy(
    myanmar,
    'Pair shop devices',
    'ဆိုင်သုံးစက်များ ချိတ်ဆက်မည်',
  ),
  ConnectedOnboardingStep.testSale => _copy(
    myanmar,
    'Complete a practice sale',
    'အစမ်းအရောင်း ပြုလုပ်မည်',
  ),
  ConnectedOnboardingStep.printerCheck => _copy(
    myanmar,
    'Check the named printer',
    'သတ်မှတ်ပရင်တာ စစ်ဆေးမည်',
  ),
  ConnectedOnboardingStep.backupConfirmation => _copy(
    myanmar,
    'Confirm encrypted backup',
    'စာဝှက်ထားသည့် အရန်သိမ်းမှု အတည်ပြုမည်',
  ),
};

String _errorLabel(String error, bool myanmar) => switch (error) {
  'connected_onboarding_resume_unverified' => _copy(
    myanmar,
    'Verify the saved setup evidence for this shop and device before continuing.',
    'ဆက်မလုပ်မီ ဤဆိုင်နှင့် စက်အတွက် သိမ်းထားသော ပြင်ဆင်မှုအထောက်အထားကို စစ်ဆေးအတည်ပြုပါ။',
  ),
  'connected_onboarding_internet_required' => _copy(
    myanmar,
    'Connect to the internet to enroll the owner and this device.',
    'ဆိုင်ရှင်နှင့် ဤစက်ကို စာရင်းသွင်းရန် အင်တာနက် ချိတ်ဆက်ပါ။',
  ),
  'connected_onboarding_template_required' => _copy(
    myanmar,
    'Choose a shop type before continuing.',
    'ဆက်မလုပ်မီ ဆိုင်အမျိုးအစား ရွေးပါ။',
  ),
  'connected_onboarding_evidence_required' => _copy(
    myanmar,
    'The step was not marked complete because no verification evidence was returned.',
    'စစ်ဆေးမှုအထောက်အထား မရရှိသဖြင့် ဤအဆင့်ကို မပြီးစီးသေးပါ။',
  ),
  _ => _copy(
    myanmar,
    'The step could not be verified. Nothing was marked complete.',
    'ဤအဆင့်ကို စစ်ဆေးအတည်မပြုနိုင်သဖြင့် ပြီးစီးကြောင်း မမှတ်သားပါ။',
  ),
};

List<String> _boundaries(bool myanmar) => <String>[
  _copy(
    myanmar,
    'Owner enrollment, tenant membership, device registration and the first offline staff lease require internet once.',
    'ဆိုင်ရှင်စာရင်းသွင်းခြင်း၊ လုပ်ငန်းအဖွဲ့ဝင်ဖြစ်ခြင်း၊ စက်မှတ်ပုံတင်ခြင်းနှင့် ပထမဆုံး အော့ဖ်လိုင်းဝန်ထမ်းခွင့်အတွက် အင်တာနက်ကို တစ်ကြိမ် လိုအပ်သည်။',
  ),
  _copy(
    myanmar,
    'Managed offline staff leases last seven days. After expiry, shared writes pause until the lease is renewed online; the app does not fall back to an unmanaged role.',
    'စီမံထားသော အော့ဖ်လိုင်းဝန်ထမ်းခွင့်သည် ခုနစ်ရက် သက်တမ်းရှိသည်။ သက်တမ်းကုန်လျှင် အွန်လိုင်းမှ သက်တမ်းတိုးမချင်း မျှဝေရေးသားမှု ရပ်ထားမည်ဖြစ်ပြီး စီမံမထားသော တာဝန်သို့ အလိုအလျောက် မပြောင်းပါ။',
  ),
  _copy(
    myanmar,
    'The coordinator must remain available for shared writes; there is no automatic failover.',
    'မျှဝေရေးသားမှုအတွက် အဓိကစက် ရှိနေရမည်။ အလိုအလျောက် အစားထိုးစက် မရှိသေးပါ။',
  ),
  _copy(
    myanmar,
    'Full-sale correction requires internet and owner authorization.',
    'အရောင်းတစ်ခုလုံး ပြင်ဆင်ရန် အင်တာနက်နှင့် ဆိုင်ရှင် အတည်ပြုချက် လိုအပ်သည်။',
  ),
  _copy(
    myanmar,
    'Partial refunds and exchanges are not supported in this pilot.',
    'တစ်စိတ်တစ်ပိုင်း ငွေပြန်ခြင်းနှင့် လဲလှယ်ခြင်းကို ဤစမ်းသပ်ကာလတွင် မပံ့ပိုးပါ။',
  ),
  _copy(
    myanmar,
    'Bluetooth is for approved peripherals, not shop data synchronization.',
    'Bluetooth ကို အတည်ပြုထားသည့် အပိုပစ္စည်းများအတွက်သာ သုံးပြီး ဆိုင်ဒေတာ ချိတ်ဆက်ရန် မသုံးပါ။',
  ),
];

T _enumByName<T extends Enum>(List<T> values, Object? name) {
  if (name is! String) {
    throw const FormatException('connected_onboarding_enum_invalid');
  }
  for (final value in values) {
    if (value.name == name) return value;
  }
  throw const FormatException('connected_onboarding_enum_invalid');
}

String _boundedString(Object? value, String field, int maxLength) {
  if (value is! String || value.isEmpty || value.length > maxLength) {
    throw FormatException('connected_onboarding_$field-invalid');
  }
  return value;
}

String _validatedProgressId(String value) {
  if (!RegExp(r'^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$').hasMatch(value)) {
    throw const FormatException('connected_onboarding_progress_id_invalid');
  }
  return value;
}

String _validatedContextId(String value, String field) {
  if (!RegExp(r'^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$').hasMatch(value)) {
    throw FormatException('connected_onboarding_${field}_invalid');
  }
  return value;
}

String _validatedDigest(String value) {
  if (!RegExp(r'^[a-f0-9]{64}$').hasMatch(value)) {
    throw const FormatException('connected_onboarding_artifact_digest_invalid');
  }
  return value;
}

void _validateEvidence(
  ConnectedOnboardingEvidence evidence, {
  required ConnectedOnboardingEvidenceContext context,
  required ConnectedShopTemplate? expectedTemplate,
}) {
  if (evidence.evidenceKind != evidence.step.evidenceKind) {
    throw const FormatException('connected_onboarding_evidence_kind_invalid');
  }
  if (evidence.evidenceId.isEmpty || evidence.evidenceId.length > 128) {
    throw const FormatException('connected_onboarding_evidence_id_invalid');
  }
  if (!RegExp(r'^[a-f0-9]{64}$').hasMatch(evidence.subjectDigest)) {
    throw const FormatException('connected_onboarding_digest_invalid');
  }
  if (!evidence.completedAt.isUtc) {
    throw const FormatException('connected_onboarding_time_invalid');
  }
  if (evidence.tenantId != context.tenantId ||
      evidence.siteId != context.siteId ||
      evidence.deviceId != context.deviceId ||
      evidence.artifactDigest != context.artifactDigest ||
      evidence.protocolVersion != context.protocolVersion) {
    throw const FormatException('connected_onboarding_context_mismatch');
  }
  if (evidence.template != expectedTemplate) {
    throw const FormatException('connected_onboarding_template_mismatch');
  }
}
