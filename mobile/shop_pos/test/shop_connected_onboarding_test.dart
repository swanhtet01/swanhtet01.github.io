import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/shop_connected_onboarding.dart';

void main() {
  test('guided mode is the safe default and progress is sequential', () {
    var progress = ConnectedOnboardingProgress.start(
      progressId: 'shop-setup-1',
    );
    expect(progress.mode, ConnectedOnboardingMode.guided);
    expect(progress.currentStep, ConnectedOnboardingStep.ownerEnrollment);
    expect(
      () => progress.chooseTemplate(ConnectedShopTemplate.retail),
      throwsStateError,
    );

    progress = progress.record(
      _evidence(ConnectedOnboardingStep.ownerEnrollment),
      context: _evidenceContext,
    );
    expect(progress.currentStep, ConnectedOnboardingStep.shopTemplate);
    expect(
      () => progress.record(
        _evidence(ConnectedOnboardingStep.catalog),
        context: _evidenceContext,
      ),
      throwsStateError,
    );
    expect(
      () => progress.record(
        _evidence(ConnectedOnboardingStep.shopTemplate),
        context: _evidenceContext,
      ),
      throwsStateError,
    );
  });

  test(
    'serialized progress is an untrusted draft until independently verified',
    () async {
      var progress = ConnectedOnboardingProgress.start(
        progressId: 'shop-setup-2',
        mode: ConnectedOnboardingMode.whiteGlove,
      );
      progress = progress.record(
        _evidence(ConnectedOnboardingStep.ownerEnrollment),
        context: _evidenceContext,
      );
      progress = progress.chooseTemplate(ConnectedShopTemplate.cafe);
      progress = progress.record(
        _evidence(
          ConnectedOnboardingStep.shopTemplate,
          template: ConnectedShopTemplate.cafe,
        ),
        context: _evidenceContext,
      );

      final resumed = ConnectedOnboardingProgress.fromJson(progress.toJson());
      expect(resumed.mode, ConnectedOnboardingMode.whiteGlove);
      expect(resumed.template, ConnectedShopTemplate.cafe);
      expect(resumed.hasUnverifiedResumeEvidence, isTrue);
      expect(resumed.currentStep, ConnectedOnboardingStep.ownerEnrollment);
      await expectLater(
        resumed.verifyResume(context: _context()),
        throwsStateError,
      );

      final verified = await resumed.verifyResume(
        context: _context(),
        verifier: CallbackConnectedOnboardingResumeVerifier((binding) async {
          return binding.progressId == 'shop-setup-2' &&
              binding.mode == ConnectedOnboardingMode.whiteGlove &&
              binding.template == ConnectedShopTemplate.cafe &&
              binding.deviceId == 'counter-device-1' &&
              binding.artifactDigest == _artifactDigest &&
              binding.tenantId == _tenantId &&
              binding.siteId == _siteId &&
              binding.protocolVersion == _protocolVersion &&
              binding.evidence.evidenceId ==
                  'evidence-${binding.evidence.step.name}' &&
              binding.evidence.subjectDigest == _subjectDigest &&
              binding.evidence.completedAt == DateTime.utc(2026, 10, 31, 12);
        }),
      );
      expect(verified.hasUnverifiedResumeEvidence, isFalse);
      expect(verified.currentStep, ConnectedOnboardingStep.catalog);

      final malformed = Map<String, Object?>.from(progress.toJson());
      malformed['evidence'] = <Object?>[
        _evidence(ConnectedOnboardingStep.ownerEnrollment).toJson(),
        _evidence(ConnectedOnboardingStep.catalog).toJson(),
      ];
      expect(
        () => ConnectedOnboardingProgress.fromJson(malformed),
        throwsFormatException,
      );
    },
  );

  test('resume rejects context substitution and tampered evidence', () async {
    var progress =
        ConnectedOnboardingProgress.start(progressId: 'shop-setup-context')
            .record(
              _evidence(ConnectedOnboardingStep.ownerEnrollment),
              context: _evidenceContext,
            );
    final serialized = progress.toJson();
    final draft = ConnectedOnboardingProgress.fromJson(serialized);
    final verifier = CallbackConnectedOnboardingResumeVerifier((binding) async {
      return binding.deviceId == 'counter-device-1' &&
          binding.artifactDigest == _artifactDigest &&
          binding.evidence.subjectDigest == _subjectDigest;
    });

    await expectLater(
      draft.verifyResume(
        context: ConnectedOnboardingResumeContext(
          tenantId: _tenantId,
          siteId: _siteId,
          deviceId: 'substituted-device',
          artifactDigest: _artifactDigest,
          protocolVersion: _protocolVersion,
        ),
        verifier: verifier,
      ),
      throwsStateError,
    );

    final evidence = (serialized['evidence']! as List<Object?>)
        .cast<Map<String, Object?>>();
    final tampered = Map<String, Object?>.from(serialized)
      ..['evidence'] = <Object?>[
        <String, Object?>{
          ...evidence.single,
          'subjectDigest': List<String>.filled(64, 'b').join(),
        },
      ];
    final tamperedDraft = ConnectedOnboardingProgress.fromJson(tampered);
    await expectLater(
      tamperedDraft.verifyResume(context: _context(), verifier: verifier),
      throwsStateError,
    );
  });

  test('controller requires internet and attributable evidence', () async {
    var online = false;
    var calls = 0;
    final controller = ConnectedOnboardingController(
      progress: ConnectedOnboardingProgress.start(progressId: 'shop-setup-3'),
      evidenceContext: _evidenceContext,
      internetAvailable: () => online,
      stepHandler: (step, progress) async {
        calls++;
        return null;
      },
    );

    await controller.runCurrentStep();
    expect(calls, 0);
    expect(controller.error, 'connected_onboarding_internet_required');
    expect(
      controller.progress.currentStep,
      ConnectedOnboardingStep.ownerEnrollment,
    );

    online = true;
    await controller.runCurrentStep();
    expect(calls, 1);
    expect(controller.error, 'connected_onboarding_evidence_required');
    expect(
      controller.progress.currentStep,
      ConnectedOnboardingStep.ownerEnrollment,
    );
  });

  test(
    'generic callback evidence cannot cross context or evidence kind',
    () async {
      final wrongContext = ConnectedOnboardingController(
        progress: ConnectedOnboardingProgress.start(
          progressId: 'shop-setup-wrong-context',
        ),
        evidenceContext: _evidenceContext,
        internetAvailable: () => true,
        stepHandler: (step, progress) async => ConnectedOnboardingEvidence(
          step: step,
          evidenceKind: step.evidenceKind,
          evidenceId: 'wrong-context',
          subjectDigest: _subjectDigest,
          tenantId: _tenantId,
          siteId: 'other-site',
          deviceId: 'counter-device-1',
          artifactDigest: _artifactDigest,
          protocolVersion: _protocolVersion,
          template: null,
          completedAt: DateTime.utc(2026, 10, 31, 12),
        ),
      );
      await wrongContext.runCurrentStep();
      expect(wrongContext.error, 'connected_onboarding_step_failed');
      expect(
        wrongContext.progress.currentStep,
        ConnectedOnboardingStep.ownerEnrollment,
      );

      final wrongKind = ConnectedOnboardingController(
        progress: ConnectedOnboardingProgress.start(
          progressId: 'shop-setup-wrong-kind',
        ),
        evidenceContext: _evidenceContext,
        internetAvailable: () => true,
        stepHandler: (step, progress) async => ConnectedOnboardingEvidence(
          step: step,
          evidenceKind: ConnectedOnboardingStep.catalog.evidenceKind,
          evidenceId: 'wrong-kind',
          subjectDigest: _subjectDigest,
          tenantId: _tenantId,
          siteId: _siteId,
          deviceId: 'counter-device-1',
          artifactDigest: _artifactDigest,
          protocolVersion: _protocolVersion,
          template: null,
          completedAt: DateTime.utc(2026, 10, 31, 12),
        ),
      );
      await wrongKind.runCurrentStep();
      expect(wrongKind.error, 'connected_onboarding_step_failed');
      expect(
        wrongKind.progress.currentStep,
        ConnectedOnboardingStep.ownerEnrollment,
      );
    },
  );

  test('mode cannot be relabelled after evidence is recorded', () {
    final progress =
        ConnectedOnboardingProgress.start(progressId: 'shop-setup-4').record(
          _evidence(ConnectedOnboardingStep.ownerEnrollment),
          context: _evidenceContext,
        );
    expect(
      () => progress.chooseMode(ConnectedOnboardingMode.selfService),
      throwsStateError,
    );
  });

  testWidgets('screen is fail-closed and unavailable by default', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: ConnectedOnboardingScreen(
          initialProgress: ConnectedOnboardingProgress.start(
            progressId: 'shop-setup-5',
          ),
          evidenceContext: _evidenceContext,
          internetAvailable: () => true,
          stepHandler: (step, progress) async => _evidence(step),
        ),
      ),
    );

    expect(
      find.text('Connected setup is not available in this build.'),
      findsOneWidget,
    );
    expect(find.byType(FilledButton), findsNothing);
  });

  testWidgets('enabled Myanmar screen discloses pilot boundaries', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: ConnectedOnboardingScreen(
          enabled: true,
          myanmar: true,
          initialProgress: ConnectedOnboardingProgress.start(
            progressId: 'shop-setup-6',
          ),
          evidenceContext: _evidenceContext,
          internetAvailable: () => false,
          stepHandler: (step, progress) async => _evidence(step),
        ),
      ),
    );

    expect(find.text('ဆိုင် စတင်ပြင်ဆင်ခြင်း'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.textContaining('အလိုအလျောက် အစားထိုးစက်'),
      300,
    );
    expect(find.textContaining('အလိုအလျောက် အစားထိုးစက်'), findsOneWidget);
    expect(
      find.textContaining('တစ်စိတ်တစ်ပိုင်း ငွေပြန်ခြင်း'),
      findsOneWidget,
    );

    await tester.scrollUntilVisible(find.byType(FilledButton), -300);
    await tester.tap(find.byType(FilledButton));
    await tester.pump();
    expect(find.byKey(const Key('connected-onboarding-error')), findsOneWidget);
    expect(find.textContaining('အင်တာနက်'), findsWidgets);

    await tester.scrollUntilVisible(find.textContaining('ခုနစ်ရက်'), 300);
    expect(find.textContaining('ခုနစ်ရက်'), findsOneWidget);
    expect(find.textContaining('တစ်ကြိမ်'), findsOneWidget);
  });

  testWidgets('enabled English screen discloses enrollment and lease limits', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: ConnectedOnboardingScreen(
          enabled: true,
          initialProgress: ConnectedOnboardingProgress.start(
            progressId: 'shop-setup-en-boundaries',
          ),
          evidenceContext: _evidenceContext,
          internetAvailable: () => true,
          stepHandler: (step, progress) async => _evidence(step),
        ),
      ),
    );

    await tester.scrollUntilVisible(find.textContaining('seven days'), 300);
    expect(find.textContaining('seven days'), findsOneWidget);
    expect(find.textContaining('require internet once'), findsOneWidget);
    expect(find.textContaining('does not fall back'), findsOneWidget);
  });

  for (final myanmar in <bool>[false, true]) {
    testWidgets(
      'unverified ${myanmar ? 'Myanmar' : 'English'} resume disables all setup actions',
      (tester) async {
        final saved =
            ConnectedOnboardingProgress.start(
              progressId: 'shop-setup-resume-${myanmar ? 'my' : 'en'}',
            ).record(
              _evidence(ConnectedOnboardingStep.ownerEnrollment),
              context: _evidenceContext,
            );
        final draft = ConnectedOnboardingProgress.fromJson(saved.toJson());

        await tester.pumpWidget(
          MaterialApp(
            home: ConnectedOnboardingScreen(
              enabled: true,
              myanmar: myanmar,
              initialProgress: draft,
              evidenceContext: _evidenceContext,
              internetAvailable: () => true,
              stepHandler: (step, progress) async => _evidence(step),
            ),
          ),
        );

        expect(
          find.byKey(const Key('connected-onboarding-resume-verification')),
          findsOneWidget,
        );
        final mode = tester
            .widget<DropdownButtonFormField<ConnectedOnboardingMode>>(
              find.byType(DropdownButtonFormField<ConnectedOnboardingMode>),
            );
        expect(mode.onChanged, isNull);
        expect(
          find.textContaining(myanmar ? 'စစ်ဆေးအတည်ပြု' : 'must be verified'),
          findsWidgets,
        );
        await tester.scrollUntilVisible(find.byType(FilledButton), 300);
        final action = tester.widget<FilledButton>(find.byType(FilledButton));
        expect(action.onPressed, isNull);
      },
    );
  }
}

ConnectedOnboardingEvidence _evidence(
  ConnectedOnboardingStep step, {
  ConnectedShopTemplate? template,
}) => ConnectedOnboardingEvidence(
  step: step,
  evidenceKind: step.evidenceKind,
  evidenceId: 'evidence-${step.name}',
  subjectDigest: _subjectDigest,
  tenantId: _tenantId,
  siteId: _siteId,
  deviceId: 'counter-device-1',
  artifactDigest: _artifactDigest,
  protocolVersion: _protocolVersion,
  template: template,
  completedAt: DateTime.utc(2026, 10, 31, 12),
);

final _subjectDigest = List<String>.filled(64, 'a').join();
final _artifactDigest = List<String>.filled(64, 'c').join();
const _tenantId = 'tenant-1';
const _siteId = 'site-1';
const _protocolVersion = 'v1';

final _evidenceContext = ConnectedOnboardingEvidenceContext(
  tenantId: _tenantId,
  siteId: _siteId,
  deviceId: 'counter-device-1',
  artifactDigest: _artifactDigest,
  protocolVersion: _protocolVersion,
);

ConnectedOnboardingResumeContext _context() => ConnectedOnboardingResumeContext(
  tenantId: _tenantId,
  siteId: _siteId,
  deviceId: 'counter-device-1',
  artifactDigest: _artifactDigest,
  protocolVersion: _protocolVersion,
);
