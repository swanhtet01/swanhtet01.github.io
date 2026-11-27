import 'shop_connected_site_client.dart';
import 'shop_connected_trusted_time_authority.dart';
import 'shop_connected_trusted_time_composition.dart';
import 'shop_connected_trusted_time_contract.dart';

/// Default-off LAN exchange adapter for one retained trusted-time challenge.
///
/// Only the approval digest and canonical challenge cross the LAN. The raw
/// owner approval and every bearer credential remain outside the wire body.
final class SiteCoordinatorTrustedTimeObservationExchange
    implements ConnectedTrustedTimeObservationExchange {
  const SiteCoordinatorTrustedTimeObservationExchange({required this.client});

  final SiteCoordinatorClient client;

  @override
  Future<ConnectedTrustedTimeObservationV1> observe({
    required ConnectedTrustedTimeAuthorityApprovalV1 approval,
    required ConnectedTrustedTimeChallengeV1 challenge,
  }) => client.requestTrustedTime(
    ConnectedTrustedTimeWireRequestV2(
      request: ConnectedTrustedTimeObservationRequestV1(
        approvalDigest: approval.approvalDigest,
        challenge: challenge,
      ),
    ),
  );
}
