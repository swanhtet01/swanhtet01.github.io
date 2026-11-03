import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:drift/drift.dart' show Variable;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqlite3/sqlite3.dart' show sqlite3;
import 'package:supermega_shop/shop_backup.dart';
import 'package:supermega_shop/shop_cafe_order_contract.dart';
import 'package:supermega_shop/shop_cafe_order_store.dart';
import 'package:supermega_shop/shop_connected_site_contracts.dart';
import 'package:supermega_shop/shop_connected_site_attempt_store.dart';
import 'package:supermega_shop/shop_connected_site_reconciliation.dart';
import 'package:supermega_shop/shop_connected_stock_reservation.dart';
import 'package:supermega_shop/shop_database.dart';
import 'package:supermega_shop/shop_models.dart';
import 'package:supermega_shop/shop_staff_authorization.dart';

import 'historical_shop_fixture_support.dart';

const _now = 2000000000000;
const _tenant = 'tenant-1';
const _site = 'site-1';
const _actor = 'actor-1';
const _device = 'device-1';
final _leaseDigest = _leaseFor().payloadDigest;

void main() {
  test('connected-site persistence is default-off and schema is v39', () async {
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      expect(database.schemaVersion, 39);
      final tables =
          (await database
                  .customSelect(
                    "SELECT name FROM sqlite_master WHERE type = 'table' "
                    "AND (name LIKE 'shop_site_%' OR "
                    "name LIKE 'shop_connected_%')",
                  )
                  .get())
              .map((row) => row.read<String>('name'))
              .toSet();
      expect(
        tables,
        containsAll(const {
          'shop_site_devices',
          'shop_site_offline_leases',
          'shop_site_commands',
          'shop_site_events',
          'shop_site_aggregate_versions',
          'shop_site_command_acks',
          'shop_site_client_cursors',
          'shop_site_cloud_acks',
          'shop_site_conflicts',
          'shop_site_recovery_checkpoints',
          'shop_connected_stock_reservation_headers',
          'shop_connected_stock_reservation_lines',
          'shop_connected_stock_reservation_transitions',
          'shop_connected_trusted_time',
          'shop_connected_scope_binding',
          'shop_connected_tender_reservation_bindings',
          'shop_site_audit',
        }),
      );
      await expectLater(
        database.applyConnectedSiteCommandForTest(
          _command('disabled-command'),
          connectedSiteEnabled: false,
        ),
        throwsStateError,
      );
    } finally {
      await database.close();
    }
  });

  test(
    'command, event, reservation, audit and ack commit exactly once',
    () async {
      final database = ShopDatabase(NativeDatabase.memory());
      try {
        await _seedAuthority(database);
        await database.addProduct(
          id: 'rice',
          name: 'Rice',
          priceMmk: 1000,
          openingStock: 1,
        );
        final command = _command('reserve-rice', reservationProductId: 'rice');
        final accepted = await database.applyConnectedSiteCommandForTest(
          command,
          connectedSiteEnabled: true,
        );
        expect(accepted.status, ShopConnectedSiteCommandStatus.accepted);
        expect(accepted.canonicalVersion, 1);
        expect(accepted.eventSequence, isNotNull);

        final pending = await database.readConnectedSitePendingEvents(
          tenantId: _tenant,
          siteId: _site,
          afterSequence: 0,
        );
        expect(pending, hasLength(1));
        expect(pending.single.cursor, accepted.eventSequence);
        expect(pending.single.commandId, command.commandId);
        expect(pending.single.commandDigest, command.commandDigest);
        expect(pending.single.eventDigest, command.eventDigest);
        expect(pending.single.event, {
          'aggregateId': command.aggregateId,
          'aggregateType': command.aggregateType,
          'aggregateVersion': 1,
          'eventId': command.eventId,
          'eventType': command.eventType,
          'occurredAt': '2033-05-18T03:33:20.000Z',
          'payload': jsonDecode(command.eventPayloadJson),
          'siteId': _site,
          'workspaceId': _tenant,
        });
        expect(connectedSiteSha256(pending.single.event), command.eventDigest);
        final storedPayload = await database
            .customSelect(
              'SELECT payload_json FROM shop_site_events WHERE event_id = ?',
              variables: [Variable<String>(command.eventId)],
            )
            .getSingle();
        expect(
          jsonDecode(storedPayload.read<String>('payload_json')),
          jsonDecode(command.eventPayloadJson),
        );

        final replayed = await database.applyConnectedSiteCommandForTest(
          command,
          connectedSiteEnabled: true,
        );
        expect(replayed.status, ShopConnectedSiteCommandStatus.replayed);
        expect(replayed.eventSequence, accepted.eventSequence);
        expect(replayed.ackDigest, accepted.ackDigest);

        for (final table in const [
          'shop_site_commands',
          'shop_site_events',
          'shop_site_command_acks',
          'shop_site_audit',
          'shop_connected_stock_reservation_headers',
          'shop_connected_stock_reservation_lines',
        ]) {
          final count = await database
              .customSelect('SELECT COUNT(*) AS count FROM $table')
              .getSingle();
          expect(count.read<int>('count'), 1, reason: table);
        }
        await expectLater(
          database.applyConnectedSiteCommandForTest(
            _command(
              'reserve-rice',
              commandDigest: _digest('different-command'),
              reservationProductId: 'rice',
            ),
            connectedSiteEnabled: true,
          ),
          throwsFormatException,
        );
        await expectLater(
          database.applyConnectedSiteCommandForTest(
            _command(
              'invalid-event-digest',
              aggregateId: 'stock:invalid-digest',
              eventDigest: _digest('payload-only'),
            ),
            connectedSiteEnabled: true,
          ),
          throwsStateError,
        );
      } finally {
        await database.close();
      }
    },
  );

  test(
    'version and stock conflicts are durable without side effects',
    () async {
      final database = ShopDatabase(NativeDatabase.memory());
      try {
        await _seedAuthority(database);
        await database.addProduct(
          id: 'last-item',
          name: 'Last item',
          priceMmk: 1000,
          openingStock: 1,
        );
        final first = await database.applyConnectedSiteCommandForTest(
          _command('first', reservationProductId: 'last-item'),
          connectedSiteEnabled: true,
        );
        expect(first.status, ShopConnectedSiteCommandStatus.accepted);

        final otherAggregateType = await database
            .applyConnectedSiteCommandForTest(
              _command('same-id-different-type', aggregateType: 'cafeOrder'),
              connectedSiteEnabled: true,
            );
        expect(
          otherAggregateType.status,
          ShopConnectedSiteCommandStatus.accepted,
        );
        expect(otherAggregateType.canonicalVersion, 1);

        final versionConflict = await database.applyConnectedSiteCommandForTest(
          _command(
            'stale-version',
            aggregateType: 'cafeOrder',
            expectedVersion: 0,
          ),
          connectedSiteEnabled: true,
        );
        expect(versionConflict.status, ShopConnectedSiteCommandStatus.conflict);
        expect(versionConflict.canonicalVersion, 1);
        expect(versionConflict.eventSequence, isNull);

        final stockConflict = await database.applyConnectedSiteCommandForTest(
          _command(
            'second-reservation',
            aggregateType: ConnectedStockWorkflowType.retailCart.name,
            aggregateId: 'second-reservation',
            reservationProductId: 'last-item',
          ),
          connectedSiteEnabled: true,
        );
        expect(stockConflict.status, ShopConnectedSiteCommandStatus.conflict);
        expect(await database.countSales(), 0);
        expect((await database.readActiveProducts()).single.onHand, 1);
        final events = await database
            .customSelect('SELECT COUNT(*) AS count FROM shop_site_events')
            .getSingle();
        final conflicts = await database
            .customSelect('SELECT COUNT(*) AS count FROM shop_site_conflicts')
            .getSingle();
        expect(events.read<int>('count'), 2);
        expect(conflicts.read<int>('count'), 2);
      } finally {
        await database.close();
      }
    },
  );

  test(
    'multi-line holds are atomic and protect the last retail unit',
    () async {
      final database = ShopDatabase(NativeDatabase.memory());
      try {
        await _seedAuthority(database);
        await database.addProduct(
          id: 'multi-a',
          name: 'Multi A',
          priceMmk: 1000,
          openingStock: 1,
        );
        await database.addProduct(
          id: 'multi-b',
          name: 'Multi B',
          priceMmk: 1000,
          openingStock: 0,
        );

        ConnectedStockReservationV1 reservation(
          String id,
        ) => ConnectedStockReservationV1.held(
          reservationId: 'reservation:$id',
          workspaceId: _tenant,
          siteId: _site,
          actorId: _actor,
          deviceId: _device,
          workflowType: ConnectedStockWorkflowType.retailCart,
          subjectId: id,
          capability: ShopStaffCapability.counterSale,
          lines: [
            ConnectedStockReservationLineV1(productId: 'multi-a', quantity: 1),
            ConnectedStockReservationLineV1(productId: 'multi-b', quantity: 1),
          ],
          issuedAt: '2033-05-18T03:33:20.000Z',
          expiresAt: '2033-05-18T03:33:50.000Z',
        );

        final unavailable = await database.applyConnectedSiteCommandForTest(
          _command(
            'multi-unavailable',
            aggregateType: ConnectedStockWorkflowType.retailCart.name,
            aggregateId: 'multi-unavailable',
            stockReservation: reservation('multi-unavailable'),
          ),
          connectedSiteEnabled: true,
        );
        expect(unavailable.status, ShopConnectedSiteCommandStatus.conflict);
        expect(unavailable.conflictCode, 'stock_reservation_unavailable');
        expect(
          (await database
                  .customSelect(
                    'SELECT COUNT(*) AS total FROM '
                    'shop_connected_stock_reservation_headers',
                  )
                  .getSingle())
              .read<int>('total'),
          0,
        );

        await database.changeStock(
          operationId: 'receive-multi-b',
          productId: 'multi-b',
          kind: 'receive',
          quantity: 1,
          expectedOnHand: 0,
        );
        final held = reservation('multi-held');
        expect(
          (await database.applyConnectedSiteCommandForTest(
            _command(
              'multi-held',
              aggregateType: ConnectedStockWorkflowType.retailCart.name,
              aggregateId: 'multi-held',
              stockReservation: held,
            ),
            connectedSiteEnabled: true,
          )).status,
          ShopConnectedSiteCommandStatus.accepted,
        );
        expect(
          (await database
                  .customSelect(
                    'SELECT COUNT(*) AS total FROM '
                    'shop_connected_stock_reservation_lines',
                  )
                  .getSingle())
              .read<int>('total'),
          2,
        );
        await expectLater(
          database.recordCashSale(
            operationId: 'ordinary-last-unit',
            lines: const [ShopSaleLineInput(productId: 'multi-a', quantity: 1)],
          ),
          throwsStateError,
        );
        expect(await database.countSales(), 0);
      } finally {
        await database.close();
      }
    },
  );

  test('connected and pending cash holds compete and exact adoption keeps foreign holds', () async {
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await _seedAuthority(database);
      for (final values in const [
        ('connected-first', 1),
        ('cash-first', 1),
        ('shared-adoption', 3),
      ]) {
        await database.addProduct(
          id: values.$1,
          name: values.$1,
          priceMmk: 1000,
          openingStock: values.$2,
        );
      }

      Future<ConnectedStockReservationV1> hold(
        String commandId,
        String subjectId,
        String productId,
      ) async {
        final reservation = ConnectedStockReservationV1.held(
          reservationId: 'reservation:$commandId',
          workspaceId: _tenant,
          siteId: _site,
          actorId: _actor,
          deviceId: _device,
          workflowType: ConnectedStockWorkflowType.retailCart,
          subjectId: subjectId,
          capability: ShopStaffCapability.counterSale,
          lines: [
            ConnectedStockReservationLineV1(productId: productId, quantity: 1),
          ],
          issuedAt: '2033-05-18T03:33:30.000Z',
          expiresAt: '2033-05-18T03:33:50.000Z',
        );
        final result = await database.applyConnectedSiteCommandForTest(
          _command(
            commandId,
            aggregateType: ConnectedStockWorkflowType.retailCart.name,
            aggregateId: subjectId,
            createdAtMillis: _now + 10000,
            stockReservation: reservation,
          ),
          connectedSiteEnabled: true,
        );
        expect(result.status, ShopConnectedSiteCommandStatus.accepted);
        return reservation;
      }

      final connectedFirst = await hold(
        'connected-first-hold',
        'connected-first-sale',
        'connected-first',
      );
      await database.saveCounterSaleDraft(
        operationId: 'connected-first-sale',
        quantities: const {'connected-first': 1},
      );
      await database.beginPendingCashCheckout(
        operationId: 'connected-first-sale',
        checkoutKind: 'counter',
        subjectId: 'connected-first-sale',
        connectedStockReservation: connectedFirst,
        connectedTimeAuthority: const _FixedTime(_now + 10000),
      );
      expect(await database.readReservedStockQuantity('connected-first'), 1);
      await database.cancelPendingCashCheckout(
        checkoutKind: 'counter',
        subjectId: 'connected-first-sale',
      );
      final reopenedCash = await database.beginPendingCashCheckout(
        operationId: 'connected-first-sale',
        checkoutKind: 'counter',
        subjectId: 'connected-first-sale',
        connectedStockReservation: connectedFirst,
        connectedTimeAuthority: const _FixedTime(_now + 10000),
      );
      expect(reopenedCash.operationId, 'connected-first-sale');
      await database.cancelPendingCashCheckout(
        checkoutKind: 'counter',
        subjectId: 'connected-first-sale',
      );
      await database.clearCounterSaleDraft('connected-first-sale');

      await database.saveCounterSaleDraft(
        operationId: 'cash-first-sale',
        quantities: const {'cash-first': 1},
      );
      await database.beginPendingCashCheckout(
        operationId: 'cash-first-sale',
        checkoutKind: 'counter',
        subjectId: 'cash-first-sale',
      );
      final cashFirst = ConnectedStockReservationV1.held(
        reservationId: 'reservation:cash-first-hold',
        workspaceId: _tenant,
        siteId: _site,
        actorId: _actor,
        deviceId: _device,
        workflowType: ConnectedStockWorkflowType.retailCart,
        subjectId: 'cash-first-other',
        capability: ShopStaffCapability.counterSale,
        lines: [
          ConnectedStockReservationLineV1(productId: 'cash-first', quantity: 1),
        ],
        issuedAt: '2033-05-18T03:33:30.000Z',
        expiresAt: '2033-05-18T03:33:50.000Z',
      );
      final cashBlocksConnected = await database
          .applyConnectedSiteCommandForTest(
            _command(
              'cash-first-hold',
              aggregateType: ConnectedStockWorkflowType.retailCart.name,
              aggregateId: cashFirst.subjectId,
              createdAtMillis: _now + 10000,
              stockReservation: cashFirst,
            ),
            connectedSiteEnabled: true,
          );
      expect(cashBlocksConnected.conflictCode, 'stock_reservation_unavailable');
      await database.cancelPendingCashCheckout(
        checkoutKind: 'counter',
        subjectId: 'cash-first-sale',
      );
      await database.clearCounterSaleDraft('cash-first-sale');

      final own = await hold(
        'shared-own-hold',
        'shared-adoption-sale',
        'shared-adoption',
      );
      await hold(
        'shared-foreign-hold',
        'shared-foreign-sale',
        'shared-adoption',
      );
      await database.saveCounterSaleDraft(
        operationId: 'shared-adoption-sale',
        quantities: const {'shared-adoption': 1},
      );
      await database.beginPendingCashCheckout(
        operationId: 'shared-adoption-sale',
        checkoutKind: 'counter',
        subjectId: 'shared-adoption-sale',
        connectedStockReservation: own,
        connectedTimeAuthority: const _FixedTime(_now + 10000),
      );
      await expectLater(
        database.changeStock(
          operationId: 'count-below-combined-holds',
          productId: 'shared-adoption',
          kind: 'count',
          quantity: 1,
          expectedOnHand: 3,
        ),
        throwsStateError,
      );
      await database.recordCashSale(
        operationId: 'shared-adoption-sale',
        lines: [ShopSaleLineInput(productId: 'shared-adoption', quantity: 1)],
        requirePendingCashCheckout: true,
        connectedStockReservation: own,
        connectedTimeAuthority: const _FixedTime(_now + 10000),
      );
      expect(await database.readReservedStockQuantity('shared-adoption'), 1);
      final projection = await database.readConnectedReplicaProjectionV2(
        tenantId: _tenant,
        siteId: _site,
      );
      final committedProof = ConnectedStockReservationProjectionV1.fromJson(
        (projection['stockReservations']! as List).singleWhere(
          (value) => (value as Map)['reservationId'] == own.reservationId,
        ),
      );
      final committedReservation = committedProof.reservation;
      final committedRow = await database
          .customSelect(
            'SELECT transition_json FROM '
            'shop_connected_stock_reservation_transitions '
            'WHERE reservation_id = ?',
            variables: [Variable<String>(own.reservationId)],
          )
          .getSingle();
      final committedTransition =
          ConnectedStockReservationTransitionV1.fromJson(
            jsonDecode(committedRow.read<String>('transition_json')),
          );
      expect(
        committedReservation.state,
        ConnectedStockReservationState.committed,
      );
      expect(
        committedReservation.reservationDigest,
        committedTransition.after.reservationDigest,
      );
      expect(
        committedProof.terminalTransition!.transitionDigest,
        committedTransition.transitionDigest,
      );
      expect(
        committedProof.terminalTransition!.saleBinding?.saleId,
        committedTransition.saleBinding?.saleId,
      );
      expect(
        committedTransition.saleBinding?.saleCommandId,
        'shared-adoption-sale',
      );
      final retailStates = await database
          .customSelect(
            'SELECT header.reservation_id, transition.to_state '
            'FROM shop_connected_stock_reservation_headers header '
            'LEFT JOIN shop_connected_stock_reservation_transitions transition '
            'ON transition.reservation_id = header.reservation_id '
            'WHERE header.reservation_id IN (?, ?) ORDER BY header.reservation_id',
            variables: [
              Variable<String>(own.reservationId),
              const Variable<String>('reservation:shared-foreign-hold'),
            ],
          )
          .get();
      expect(retailStates, hasLength(2));
      expect(
        retailStates
            .singleWhere(
              (row) => row.read<String>('reservation_id') == own.reservationId,
            )
            .readNullable<String>('to_state'),
        ConnectedStockReservationState.committed.name,
      );
      expect(
        retailStates
            .singleWhere(
              (row) =>
                  row.read<String>('reservation_id') ==
                  'reservation:shared-foreign-hold',
            )
            .readNullable<String>('to_state'),
        isNull,
      );
    } finally {
      await database.close();
    }
  });

  test('connected and pending wallet holds block each other', () async {
    Future<ShopDatabase> createDatabase() async {
      final database = ShopDatabase(NativeDatabase.memory());
      await _seedAuthority(database);
      await database.addProduct(
        id: 'wallet-last',
        name: 'Wallet last',
        priceMmk: 1000,
        openingStock: 1,
      );
      return database;
    }

    final connectedFirst = await createDatabase();
    try {
      final command = _command(
        'wallet-connected-first',
        aggregateType: ConnectedStockWorkflowType.retailCart.name,
        aggregateId: 'wallet-connected-first',
        reservationProductId: 'wallet-last',
      );
      final reservation = command.stockReservation!;
      expect(
        (await connectedFirst.applyConnectedSiteCommandForTest(
          command,
          connectedSiteEnabled: true,
        )).status,
        ShopConnectedSiteCommandStatus.accepted,
      );
      await connectedFirst.createWalletCheckoutIntent(
        operationId: 'wallet-connected-first',
        merchant: _walletSetup(),
        lines: const [ShopSaleLineInput(productId: 'wallet-last', quantity: 1)],
        connectedStockReservation: reservation,
        connectedTimeAuthority: const _FixedTime(_now + 10000),
      );
      await expectLater(
        connectedFirst.cancelWalletCheckoutIntent(
          'wallet-connected-first',
          resumeOperationId: 'wallet-connected-replacement',
        ),
        throwsStateError,
      );
      expect(
        await connectedFirst.cancelWalletCheckoutIntent(
          'wallet-connected-first',
        ),
        isTrue,
      );
      final reopened = await connectedFirst.createWalletCheckoutIntent(
        operationId: 'wallet-connected-first',
        merchant: _walletSetup(),
        lines: const [ShopSaleLineInput(productId: 'wallet-last', quantity: 1)],
        connectedStockReservation: reservation,
        connectedTimeAuthority: const _FixedTime(_now + 10000),
      );
      expect(reopened.state, 'pending');
      final receipt = await connectedFirst.recordSale(
        operationId: 'wallet-connected-first',
        lines: const [ShopSaleLineInput(productId: 'wallet-last', quantity: 1)],
        paymentMethod: 'kbzpay',
        walletCheckoutOperationId: 'wallet-connected-first',
        connectedStockReservation: reservation,
        connectedTimeAuthority: const _FixedTime(_now + 10000),
      );
      expect(receipt.totalMmk, 1000);
      expect(await connectedFirst.readReservedStockQuantity('wallet-last'), 0);
    } finally {
      await connectedFirst.close();
    }

    final walletFirst = await createDatabase();
    try {
      await walletFirst.createWalletCheckoutIntent(
        operationId: 'wallet-first',
        merchant: _walletSetup(),
        lines: const [ShopSaleLineInput(productId: 'wallet-last', quantity: 1)],
      );
      final conflict = await walletFirst.applyConnectedSiteCommandForTest(
        _command(
          'connected-after-wallet',
          aggregateType: ConnectedStockWorkflowType.retailCart.name,
          aggregateId: 'connected-after-wallet',
          reservationProductId: 'wallet-last',
        ),
        connectedSiteEnabled: true,
      );
      expect(conflict.conflictCode, 'stock_reservation_unavailable');
    } finally {
      await walletFirst.close();
    }
  });

  test('cafe cash completion adopts only its exact connected hold', () async {
    final database = ShopDatabase(NativeDatabase.memory());
    final store = ShopCafeOrderStore(database);
    try {
      await _seedAuthority(database);
      await database.addProduct(
        id: 'cafe-connected-item',
        name: 'Connected café item',
        priceMmk: 2500,
        openingStock: 2,
      );
      final order = await store.applyCommand(
        CafeOrderCommand(
          id: 'cafe-connected-create',
          ticketId: 'cafe-connected-order',
          expectedVersion: 0,
          lines: [
            CafeOrderLine.local(
              id: 'cafe-connected-line',
              productId: 'cafe-connected-item',
              quantity: 1,
              baseUnitPriceMmk: 2500,
              remark: '',
              modifiers: const [],
            ),
          ],
        ),
        const {},
      );
      ConnectedStockReservationV1 cafeReservation({
        required String id,
        required String subjectId,
      }) => ConnectedStockReservationV1.held(
        reservationId: 'reservation:$id',
        workspaceId: _tenant,
        siteId: _site,
        actorId: _actor,
        deviceId: _device,
        workflowType: ConnectedStockWorkflowType.cafeOrder,
        subjectId: subjectId,
        capability: ShopStaffCapability.cafeOrderWrite,
        lines: [
          ConnectedStockReservationLineV1(
            productId: 'cafe-connected-item',
            quantity: 1,
          ),
        ],
        issuedAt: '2033-05-18T03:33:20.000Z',
        expiresAt: '2033-05-18T03:33:50.000Z',
      );

      final own = cafeReservation(
        id: 'cafe-connected-own',
        subjectId: order.ticket.id,
      );
      final foreign = cafeReservation(
        id: 'cafe-connected-foreign',
        subjectId: 'another-cafe-order',
      );
      for (final values in [
        ('cafe-connected-own', own),
        ('cafe-connected-foreign', foreign),
      ]) {
        expect(
          (await database.applyConnectedSiteCommandForTest(
            _command(
              values.$1,
              aggregateType: ConnectedStockWorkflowType.cafeOrder.name,
              aggregateId: values.$2.subjectId,
              capability: ShopStaffCapability.cafeOrderWrite,
              stockReservation: values.$2,
            ),
            connectedSiteEnabled: true,
          )).status,
          ShopConnectedSiteCommandStatus.accepted,
        );
      }
      await database.beginPendingCashCheckout(
        operationId: 'cafe-connected-sale',
        checkoutKind: 'cafe',
        subjectId: order.ticket.id,
        connectedStockReservation: own,
        connectedTimeAuthority: const _FixedTime(_now + 10000),
      );
      final receipt = await store.completeCash(
        orderId: order.ticket.id,
        operationId: 'cafe-connected-sale',
        expectedTicketVersion: order.ticket.version,
        expectedStateRevision: order.stateRevision,
        requirePendingCashCheckout: true,
        connectedStockReservation: own,
        connectedTimeAuthority: const _FixedTime(_now + 10000),
      );
      expect(receipt.totalMmk, 2500);
      expect(
        await database.readReservedStockQuantity('cafe-connected-item'),
        1,
      );
      expect((await database.readActiveProducts()).single.onHand, 1);
      final cafeStates = await database
          .customSelect(
            'SELECT header.reservation_id, transition.to_state '
            'FROM shop_connected_stock_reservation_headers header '
            'LEFT JOIN shop_connected_stock_reservation_transitions transition '
            'ON transition.reservation_id = header.reservation_id '
            'WHERE header.reservation_id IN (?, ?) ORDER BY header.reservation_id',
            variables: [
              Variable<String>(own.reservationId),
              Variable<String>(foreign.reservationId),
            ],
          )
          .get();
      expect(cafeStates, hasLength(2));
      expect(
        cafeStates
            .singleWhere(
              (row) => row.read<String>('reservation_id') == own.reservationId,
            )
            .readNullable<String>('to_state'),
        ConnectedStockReservationState.committed.name,
      );
      expect(
        cafeStates
            .singleWhere(
              (row) =>
                  row.read<String>('reservation_id') == foreign.reservationId,
            )
            .readNullable<String>('to_state'),
        isNull,
      );
      final replay = await store.completeCash(
        orderId: order.ticket.id,
        operationId: 'cafe-connected-sale',
        expectedTicketVersion: order.ticket.version,
        expectedStateRevision: order.stateRevision,
        requirePendingCashCheckout: true,
        connectedStockReservation: own,
      );
      expect(replay.id, receipt.id);
      await expectLater(
        store.completeCash(
          orderId: order.ticket.id,
          operationId: 'cafe-connected-sale',
          expectedTicketVersion: order.ticket.version,
          expectedStateRevision: order.stateRevision,
          requirePendingCashCheckout: true,
        ),
        throwsStateError,
      );
      expect(await database.countSales(), 1);
    } finally {
      await database.close();
    }
  });

  test(
    'site sequences and recovery identities stay tenant-site scoped',
    () async {
      final database = ShopDatabase(NativeDatabase.memory());
      try {
        await _seedAuthority(database);
        final secondSiteLease = await _seedAuthority(
          database,
          siteId: 'site-2',
          deviceId: 'device-2',
          bindStockScope: false,
        );
        final secondTenantLease = await _seedAuthority(
          database,
          tenantId: 'tenant-2',
          actorId: 'actor-2',
          deviceId: 'device-3',
          bindStockScope: false,
        );

        final first = await database.applyConnectedSiteCommandForTest(
          _command('site-1-first', aggregateId: 'one'),
          connectedSiteEnabled: true,
        );
        final second = await database.applyConnectedSiteCommandForTest(
          _command('site-1-second', aggregateId: 'two'),
          connectedSiteEnabled: true,
        );
        final otherSite = await database.applyConnectedSiteCommandForTest(
          _command(
            'site-2-first',
            aggregateId: 'one',
            siteId: 'site-2',
            deviceId: 'device-2',
            leaseDigest: secondSiteLease,
          ),
          connectedSiteEnabled: true,
        );
        final otherTenant = await database.applyConnectedSiteCommandForTest(
          _command(
            'tenant-2-site-1-first',
            aggregateId: 'one',
            tenantId: 'tenant-2',
            actorId: 'actor-2',
            deviceId: 'device-3',
            leaseDigest: secondTenantLease,
          ),
          connectedSiteEnabled: true,
        );
        expect(first.eventSequence, 1);
        expect(second.eventSequence, 2);
        expect(otherSite.eventSequence, 1);
        expect(otherTenant.eventSequence, 1);

        for (final values in [
          (_tenant, _device, 2, _digest('tenant-1-checkpoint')),
          ('tenant-2', 'device-3', 1, _digest('tenant-2-checkpoint')),
        ]) {
          await database.customInsert(
            'INSERT INTO shop_site_recovery_checkpoints '
            '(tenant_id, site_id, coordinator_id, event_sequence, '
            'snapshot_digest, created_at_millis) VALUES (?, ?, ?, ?, ?, ?)',
            variables: [
              Variable<String>(values.$1),
              Variable<String>(_site),
              Variable<String>(values.$2),
              Variable<int>(values.$3),
              Variable<String>(values.$4),
              const Variable<int>(_now),
            ],
          );
        }
        final checkpoints = await database
            .customSelect(
              'SELECT COUNT(*) AS count FROM shop_site_recovery_checkpoints '
              'WHERE site_id = ?',
              variables: [Variable<String>(_site)],
            )
            .getSingle();
        expect(checkpoints.read<int>('count'), 2);
      } finally {
        await database.close();
      }
    },
  );

  test('foreign scope cannot persist reservation or trusted time', () async {
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await _seedAuthority(database);
      await database.addProduct(
        id: 'scope-item',
        name: 'Scope item',
        priceMmk: 1000,
        openingStock: 3,
      );
      expect(
        (await database.applyConnectedSiteCommandForTest(
          _command('scope-owner', reservationProductId: 'scope-item'),
          connectedSiteEnabled: true,
        )).status,
        ShopConnectedSiteCommandStatus.accepted,
      );
      final foreignLease = await _seedAuthority(
        database,
        siteId: 'site-foreign',
        deviceId: 'device-foreign',
        bindStockScope: false,
      );
      final foreign = ConnectedStockReservationV1.held(
        reservationId: 'reservation:scope-foreign',
        workspaceId: _tenant,
        siteId: 'site-foreign',
        actorId: _actor,
        deviceId: 'device-foreign',
        workflowType: ConnectedStockWorkflowType.retailCart,
        subjectId: 'scope-foreign',
        capability: ShopStaffCapability.counterSale,
        lines: [
          ConnectedStockReservationLineV1(productId: 'scope-item', quantity: 1),
        ],
        issuedAt: '2033-05-18T03:33:20.000Z',
        expiresAt: '2033-05-18T03:33:50.000Z',
      );
      await expectLater(
        database.applyConnectedSiteCommandForTest(
          _command(
            'scope-foreign',
            siteId: 'site-foreign',
            deviceId: 'device-foreign',
            leaseDigest: foreignLease,
            aggregateType: ConnectedStockWorkflowType.retailCart.name,
            aggregateId: foreign.subjectId,
            stockReservation: foreign,
          ),
          connectedSiteEnabled: true,
        ),
        throwsStateError,
      );
      expect(
        await database
            .customSelect(
              'SELECT 1 FROM shop_site_commands WHERE command_id = ?',
              variables: const [Variable<String>('scope-foreign')],
            )
            .getSingleOrNull(),
        isNull,
      );
      expect(
        await database
            .customSelect(
              'SELECT 1 FROM shop_connected_trusted_time WHERE site_id = ?',
              variables: const [Variable<String>('site-foreign')],
            )
            .getSingleOrNull(),
        isNull,
      );
      expect(
        await database
            .customSelect(
              'SELECT 1 FROM shop_connected_stock_reservation_headers '
              'WHERE reservation_id = ?',
              variables: [Variable<String>(foreign.reservationId)],
            )
            .getSingleOrNull(),
        isNull,
      );
      await expectLater(
        database.expireConnectedStockReservation(
          tenantId: _tenant,
          siteId: 'site-foreign',
          reservationId: foreign.reservationId,
          expectedReservationDigest: foreign.reservationDigest,
          operationId: 'scope-foreign-expire',
          timeAuthority: const _FixedTime(_now + 30000),
          connectedSiteEnabled: true,
        ),
        throwsStateError,
      );
      expect(
        await database
            .customSelect(
              'SELECT 1 FROM shop_connected_trusted_time WHERE site_id = ?',
              variables: const [Variable<String>('site-foreign')],
            )
            .getSingleOrNull(),
        isNull,
      );
    } finally {
      await database.close();
    }
  });

  test('stock commands cannot create their own enrollment scope', () async {
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await _seedAuthority(database, bindStockScope: false);
      await database.addProduct(
        id: 'unbound-item',
        name: 'Unbound item',
        priceMmk: 1000,
        openingStock: 2,
      );
      await expectLater(
        database.applyConnectedSiteCommandForTest(
          _command('unbound-hold', reservationProductId: 'unbound-item'),
          connectedSiteEnabled: true,
        ),
        throwsStateError,
      );
      for (final table in const [
        'shop_connected_scope_binding',
        'shop_connected_trusted_time',
        'shop_connected_stock_reservation_headers',
        'shop_site_commands',
        'shop_site_events',
      ]) {
        final count = await database
            .customSelect('SELECT COUNT(*) AS count FROM $table')
            .getSingle();
        expect(count.read<int>('count'), 0, reason: table);
      }
    } finally {
      await database.close();
    }
  });

  test(
    'release is authenticated, subject-bound, pre-expiry and replay-safe',
    () async {
      final database = ShopDatabase(NativeDatabase.memory());
      try {
        final originalLease = await _seedAuthority(database);
        await database.addProduct(
          id: 'release-item',
          name: 'Release item',
          priceMmk: 1000,
          openingStock: 2,
        );
        final holdCommand = _command(
          'release-subject',
          reservationProductId: 'release-item',
        );
        final reservation = holdCommand.stockReservation!;
        expect(
          (await database.applyConnectedSiteCommandForTest(
            holdCommand,
            connectedSiteEnabled: true,
          )).status,
          ShopConnectedSiteCommandStatus.accepted,
        );
        final lateHoldCommand = _command(
          'late-release-subject',
          reservationProductId: 'release-item',
        );
        final lateReservation = lateHoldCommand.stockReservation!;
        expect(
          (await database.applyConnectedSiteCommandForTest(
            lateHoldCommand,
            connectedSiteEnabled: true,
          )).status,
          ShopConnectedSiteCommandStatus.accepted,
        );
        final secondLease = await _seedAuthority(
          database,
          actorId: 'actor-2',
          deviceId: 'device-2',
        );
        final thirdLease = await _seedAuthority(database, deviceId: 'device-3');

        Future<ShopConnectedSiteCommandResult> release({
          required String id,
          required String aggregateType,
          required String aggregateId,
          String actorId = _actor,
          String deviceId = _device,
          String? leaseDigest,
          ShopStaffCapability capability = ShopStaffCapability.counterSale,
          int createdAtMillis = _now + 1000,
          int expectedVersion = 0,
        }) => database.applyConnectedSiteCommandForTest(
          _command(
            id,
            aggregateType: aggregateType,
            aggregateId: aggregateId,
            actorId: actorId,
            deviceId: deviceId,
            leaseDigest: leaseDigest ?? originalLease,
            capability: capability,
            createdAtMillis: createdAtMillis,
            expectedVersion: expectedVersion,
            stockReservationLifecycle:
                ShopConnectedStockReservationLifecycleInput.release(
                  reservationId: reservation.reservationId,
                  expectedReservationDigest: reservation.reservationDigest,
                  reason: 'operator_cancelled',
                ),
          ),
          connectedSiteEnabled: true,
        );

        final wrongSubject = await release(
          id: 'wrong-subject-release',
          aggregateType: ConnectedStockWorkflowType.retailCart.name,
          aggregateId: 'another-subject',
        );
        expect(wrongSubject.status, ShopConnectedSiteCommandStatus.conflict);
        expect(wrongSubject.conflictCode, 'reservation_not_found');
        final wrongDomain = await release(
          id: 'wrong-domain-release',
          aggregateType: ConnectedStockWorkflowType.cafeOrder.name,
          aggregateId: reservation.subjectId,
        );
        expect(wrongDomain.status, ShopConnectedSiteCommandStatus.conflict);
        expect(wrongDomain.conflictCode, 'reservation_not_found');
        final wrongCapability = await release(
          id: 'wrong-capability-release',
          aggregateType: ConnectedStockWorkflowType.retailCart.name,
          aggregateId: reservation.subjectId,
          capability: ShopStaffCapability.cafeOrderWrite,
          expectedVersion: 1,
        );
        expect(wrongCapability.status, ShopConnectedSiteCommandStatus.conflict);
        expect(wrongCapability.conflictCode, 'reservation_not_found');
        final wrongActor = await release(
          id: 'wrong-actor-release',
          aggregateType: ConnectedStockWorkflowType.retailCart.name,
          aggregateId: reservation.subjectId,
          actorId: 'actor-2',
          deviceId: 'device-2',
          leaseDigest: secondLease,
          expectedVersion: 1,
        );
        expect(wrongActor.status, ShopConnectedSiteCommandStatus.conflict);
        expect(wrongActor.conflictCode, 'reservation_not_found');
        final wrongDevice = await release(
          id: 'wrong-device-release',
          aggregateType: ConnectedStockWorkflowType.retailCart.name,
          aggregateId: reservation.subjectId,
          deviceId: 'device-3',
          leaseDigest: thirdLease,
          expectedVersion: 1,
        );
        expect(wrongDevice.status, ShopConnectedSiteCommandStatus.conflict);
        expect(wrongDevice.conflictCode, 'reservation_not_found');
        final releaseCommand = _command(
          'cross-device-release',
          aggregateType: ConnectedStockWorkflowType.retailCart.name,
          aggregateId: reservation.subjectId,
          actorId: 'actor-2',
          deviceId: 'device-2',
          leaseDigest: secondLease,
          createdAtMillis: _now + 1000,
          expectedVersion: 1,
          stockReservationLifecycle:
              ShopConnectedStockReservationLifecycleInput.release(
                reservationId: reservation.reservationId,
                expectedReservationDigest: reservation.reservationDigest,
                reason: 'operator_cancelled',
              ),
        );
        final deniedCrossDevice = await database
            .applyConnectedSiteCommandForTest(
              releaseCommand,
              connectedSiteEnabled: true,
            );
        expect(
          deniedCrossDevice.status,
          ShopConnectedSiteCommandStatus.conflict,
        );
        expect(deniedCrossDevice.conflictCode, 'reservation_not_found');

        final originalActorRelease = _command(
          'original-actor-release',
          aggregateType: ConnectedStockWorkflowType.retailCart.name,
          aggregateId: reservation.subjectId,
          createdAtMillis: _now + 1000,
          expectedVersion: 1,
          stockReservationLifecycle:
              ShopConnectedStockReservationLifecycleInput.release(
                reservationId: reservation.reservationId,
                expectedReservationDigest: reservation.reservationDigest,
                reason: 'operator_cancelled',
              ),
        );
        final accepted = await database.applyConnectedSiteCommandForTest(
          originalActorRelease,
          connectedSiteEnabled: true,
        );
        expect(accepted.status, ShopConnectedSiteCommandStatus.accepted);
        final replay = await database.applyConnectedSiteCommandForTest(
          originalActorRelease,
          connectedSiteEnabled: true,
        );
        expect(replay.status, ShopConnectedSiteCommandStatus.replayed);
        final transitions = await database
            .customSelect(
              'SELECT to_state FROM '
              'shop_connected_stock_reservation_transitions',
            )
            .get();
        expect(transitions, hasLength(1));
        expect(transitions.single.read<String>('to_state'), 'released');

        final atExpiryCommand = _command(
          'late-release',
          aggregateType: ConnectedStockWorkflowType.retailCart.name,
          aggregateId: lateReservation.subjectId,
          createdAtMillis: DateTime.parse(lateReservation.expiresAt)
              .millisecondsSinceEpoch,
          expectedVersion: 1,
          stockReservationLifecycle:
              ShopConnectedStockReservationLifecycleInput.release(
                reservationId: lateReservation.reservationId,
                expectedReservationDigest: lateReservation.reservationDigest,
                reason: 'operator_cancelled',
              ),
        );
        final atExpiry = await database.applyConnectedSiteCommandForTest(
          atExpiryCommand,
          connectedSiteEnabled: true,
        );
        expect(atExpiry.status, ShopConnectedSiteCommandStatus.conflict);
        expect(atExpiry.conflictCode, 'reservation_time_invalid');
      } finally {
        await database.close();
      }
    },
  );

  test(
    'sale adoption is exact, replay-safe, and trusted-time monotonic',
    () async {
      final database = ShopDatabase(NativeDatabase.memory());
      try {
        await _seedAuthority(database);
        await database.addProduct(
          id: 'adoption-item',
          name: 'Adoption item',
          priceMmk: 1000,
          openingStock: 8,
        );

        Future<ConnectedStockReservationV1> hold(String operationId) async {
          final command = _command(
            operationId,
            reservationProductId: 'adoption-item',
          );
          final result = await database.applyConnectedSiteCommandForTest(
            command,
            connectedSiteEnabled: true,
          );
          expect(result.status, ShopConnectedSiteCommandStatus.accepted);
          return command.stockReservation!;
        }

        final committedReservation = await hold('connected-sale');
        final swapReservation = await hold('swap-sale');
        final ordinaryReservation = await hold('ordinary-sale');
        final boundaryReservation = await hold('boundary-sale');
        final rollbackReservation = await hold('rollback-sale');
        const line = ShopSaleLineInput(productId: 'adoption-item', quantity: 1);
        final receipt = await database.recordCashSale(
          operationId: 'connected-sale',
          lines: const [line],
          connectedStockReservation: committedReservation,
          connectedTimeAuthority: const _FixedTime(_now + 10000),
        );
        expect(receipt.id, 'connected-sale');

        final replay = await database.recordCashSale(
          operationId: 'connected-sale',
          lines: const [line],
          connectedStockReservation: committedReservation,
        );
        expect(replay.id, receipt.id);
        final committedEvents = await database
            .customSelect(
              'SELECT site_sequence, event_type FROM shop_site_events '
              'WHERE event_type = ?',
              variables: const [
                Variable<String>(shopConnectedStockCommittedEventType),
              ],
            )
            .get();
        expect(committedEvents, hasLength(1));
        final replicated = await database.readConnectedSitePendingEvents(
          tenantId: _tenant,
          siteId: _site,
          afterSequence: 0,
        );
        expect(
          replicated.where(
            (event) =>
                event.event['eventType'] ==
                shopConnectedStockCommittedEventType,
          ),
          hasLength(1),
        );
        await expectLater(
          database.recordCashSale(
            operationId: 'connected-sale',
            lines: const [line],
          ),
          throwsStateError,
        );
        await expectLater(
          database.recordCashSale(
            operationId: 'connected-sale',
            lines: const [line],
            connectedStockReservation: swapReservation,
          ),
          throwsStateError,
        );

        final ordinary = await database.recordCashSale(
          operationId: 'ordinary-sale',
          lines: const [line],
        );
        expect(ordinary.id, 'ordinary-sale');
        await expectLater(
          database.recordCashSale(
            operationId: 'ordinary-sale',
            lines: const [line],
            connectedStockReservation: ordinaryReservation,
          ),
          throwsStateError,
        );

        final trustedBefore = await database
            .customSelect(
              'SELECT observed_at_millis FROM shop_connected_trusted_time '
              'WHERE tenant_id = ? AND site_id = ?',
              variables: const [
                Variable<String>(_tenant),
                Variable<String>(_site),
              ],
            )
            .getSingle();
        expect(trustedBefore.read<int>('observed_at_millis'), _now + 10000);
        await expectLater(
          database.recordCashSale(
            operationId: 'boundary-sale',
            lines: const [line],
            connectedStockReservation: boundaryReservation,
            connectedTimeAuthority: const _FixedTime(_now + 30000),
          ),
          throwsStateError,
        );
        await expectLater(
          database.recordCashSale(
            operationId: 'rollback-sale',
            lines: const [line],
            connectedStockReservation: rollbackReservation,
            connectedTimeAuthority: const _FixedTime(_now + 5000),
          ),
          throwsStateError,
        );
        final trustedAfter = await database
            .customSelect(
              'SELECT observed_at_millis FROM shop_connected_trusted_time '
              'WHERE tenant_id = ? AND site_id = ?',
              variables: const [
                Variable<String>(_tenant),
                Variable<String>(_site),
              ],
            )
            .getSingle();
        expect(trustedAfter.read<int>('observed_at_millis'), _now + 10000);
        expect(await database.countSales(), 2);

        final cafeReservation = ConnectedStockReservationV1.held(
          reservationId: 'reservation:cafe-cross-workflow',
          workspaceId: _tenant,
          siteId: _site,
          actorId: _actor,
          deviceId: _device,
          workflowType: ConnectedStockWorkflowType.cafeOrder,
          subjectId: 'cafe-cross-workflow',
          capability: ShopStaffCapability.cafeOrderWrite,
          lines: [
            ConnectedStockReservationLineV1(
              productId: 'adoption-item',
              quantity: 1,
            ),
          ],
          issuedAt: '2033-05-18T03:33:30.000Z',
          expiresAt: '2033-05-18T03:33:50.000Z',
        );
        final cafeHold = _command(
          'cafe-cross-workflow',
          aggregateType: ConnectedStockWorkflowType.cafeOrder.name,
          aggregateId: 'cafe-cross-workflow',
          capability: ShopStaffCapability.cafeOrderWrite,
          createdAtMillis: _now + 10000,
          stockReservation: cafeReservation,
        );
        expect(
          (await database.applyConnectedSiteCommandForTest(
            cafeHold,
            connectedSiteEnabled: true,
          )).status,
          ShopConnectedSiteCommandStatus.accepted,
        );
        await expectLater(
          database.recordCashSale(
            operationId: 'cafe-cross-workflow',
            lines: const [line],
            connectedStockReservation: cafeReservation,
            connectedTimeAuthority: const _FixedTime(_now + 10000),
          ),
          throwsStateError,
        );
      } finally {
        await database.close();
      }
    },
  );

  test('expiry is replicated once and replays without fresh time', () async {
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await _seedAuthority(database);
      await database.addProduct(
        id: 'expiry-item',
        name: 'Expiry item',
        priceMmk: 1000,
        openingStock: 2,
      );
      final command = _command(
        'expiry-hold',
        reservationProductId: 'expiry-item',
      );
      expect(
        (await database.applyConnectedSiteCommandForTest(
          command,
          connectedSiteEnabled: true,
        )).status,
        ShopConnectedSiteCommandStatus.accepted,
      );
      final reservation = command.stockReservation!;
      final accepted = await database.expireConnectedStockReservation(
        tenantId: _tenant,
        siteId: _site,
        reservationId: reservation.reservationId,
        expectedReservationDigest: reservation.reservationDigest,
        operationId: 'expiry-operation',
        timeAuthority: const _FixedTime(_now + 30000),
        connectedSiteEnabled: true,
      );
      expect(
        accepted.disposition,
        ShopConnectedStockReservationDisposition.accepted,
      );
      final replay = await database.expireConnectedStockReservation(
        tenantId: _tenant,
        siteId: _site,
        reservationId: reservation.reservationId,
        expectedReservationDigest: reservation.reservationDigest,
        operationId: 'expiry-operation',
        timeAuthority: const ShopConnectedSiteTimeUnavailable(),
        connectedSiteEnabled: true,
      );
      expect(
        replay.disposition,
        ShopConnectedStockReservationDisposition.replayed,
      );
      final events = await database
          .customSelect(
            'SELECT event_type FROM shop_site_events WHERE event_type = ?',
            variables: const [
              Variable<String>(shopConnectedStockExpiredEventType),
            ],
          )
          .get();
      expect(events, hasLength(1));
    } finally {
      await database.close();
    }
  });

  test('derived proof rejects a genuine but unrelated reservation source', () async {
    final root = await Directory.systemTemp.createTemp(
      'connected-derived-source-',
    );
    final file = File('${root.path}/shop.sqlite');
    final database = ShopDatabase(NativeDatabase(file));
    try {
      await _seedAuthority(database);
      await database.addProduct(
        id: 'derived-source-item',
        name: 'Derived source item',
        priceMmk: 1000,
        openingStock: 2,
      );
      final original = _command(
        'derived-original',
        reservationProductId: 'derived-source-item',
      );
      expect(
        (await database.applyConnectedSiteCommandForTest(
          original,
          connectedSiteEnabled: true,
        )).status,
        ShopConnectedSiteCommandStatus.accepted,
      );
      final foreign = _command(
        'derived-foreign',
        aggregateType: ConnectedStockWorkflowType.retailCart.name,
        aggregateId: 'derived-original',
        stockReservation: original.stockReservation,
      );
      expect(
        (await database.applyConnectedSiteCommandForTest(
          foreign,
          connectedSiteEnabled: true,
        )).status,
        ShopConnectedSiteCommandStatus.conflict,
      );
      await database.recordCashSale(
        operationId: 'derived-original',
        lines: const [
          ShopSaleLineInput(productId: 'derived-source-item', quantity: 1),
        ],
        connectedStockReservation: original.stockReservation,
        connectedTimeAuthority: const _FixedTime(_now + 1000),
      );
      final foreignProof = await database
          .customSelect(
            "SELECT proof_json FROM shop_site_cloud_proofs WHERE command_id = 'derived-foreign'",
          )
          .getSingle();
      final derivedRow = await database
          .customSelect(
            "SELECT command_id, proof_json FROM shop_site_cloud_proofs WHERE proof_kind = 'coordinatorDerived'",
          )
          .getSingle();
      final substituted = Map<String, Object?>.from(
        jsonDecode(derivedRow.read<String>('proof_json')) as Map,
      );
      final foreignDecoded = jsonDecode(
        foreignProof.read<String>('proof_json'),
      );
      final foreignCloudProof = ConnectedSiteCloudProofV1.fromJson(
        foreignDecoded,
      );
      substituted['sourceProof'] = foreignCloudProof.toJson();
      substituted['sourceProofDigest'] = foreignCloudProof.proofDigest;
      final encoded = canonicalConnectedSiteJson(substituted);
      await database.customStatement(
        'DROP TRIGGER shop_site_cloud_proofs_no_update',
      );
      await database.customUpdate(
        'UPDATE shop_site_cloud_proofs SET proof_json = ?, proof_digest = ? '
        'WHERE command_id = ?',
        variables: [
          Variable<String>(encoded),
          Variable<String>(connectedSiteSha256(substituted)),
          Variable<String>(derivedRow.read<String>('command_id')),
        ],
      );
      await database.customStatement(
        shopConnectedCloudProofSchemaDefinitionsV34()['shop_site_cloud_proofs_no_update']!,
      );
      await expectLater(database.verifyReadyForUse(), throwsStateError);
      await expectLater(
        database.readConnectedSitePendingEvents(
          tenantId: _tenant,
          siteId: _site,
          afterSequence: 0,
        ),
        throwsStateError,
      );
    } finally {
      await database.close();
      await root.delete(recursive: true);
    }
  });

  test(
    'v22 migrates to v31 and encrypted-backup snapshot remains valid',
    () async {
      final root = await Directory.systemTemp.createTemp('shop-site-v23-');
      final file = File('${root.path}/shop.sqlite');
      var database = ShopDatabase(NativeDatabase(file));
      try {
        await database.verifyReadyForUse();
        await dropHistoricalShopSchemaDefinitionGroupInDatabase(
          database,
          shopConnectedTrustedTimeIssuerSchemaDefinitionsV38(),
        );
        for (final entry
            in shopConnectedEnvelopeSchemaDefinitionsV29().entries
                .toList()
                .reversed) {
          final type = shopSchemaObjectTypeForDefinition(entry.value);
          await database.customStatement(
            'DROP ${type == 'table'
                ? 'TABLE'
                : type == 'index'
                ? 'INDEX'
                : 'TRIGGER'} IF EXISTS ${entry.key}',
          );
        }
        for (final entry
            in shopConnectedSiteSchemaDefinitionsV28().entries
                .toList()
                .reversed) {
          final type = shopSchemaObjectTypeForDefinition(entry.value);
          await database.customStatement(
            'DROP ${type == 'table'
                ? 'TABLE'
                : type == 'index'
                ? 'INDEX'
                : 'TRIGGER'} IF EXISTS ${entry.key}',
          );
        }
        for (final entry
            in shopConnectedStockReservationSchemaDefinitionsV24().entries
                .toList()
                .reversed) {
          final type = shopSchemaObjectTypeForDefinition(entry.value);
          await database.customStatement(
            'DROP ${type == 'table'
                ? 'TABLE'
                : type == 'index'
                ? 'INDEX'
                : 'TRIGGER'} IF EXISTS ${entry.key}',
          );
        }
        for (final entry
            in shopConnectedSiteSchemaDefinitionsV23().entries
                .toList()
                .reversed) {
          final type = shopSchemaObjectTypeForDefinition(entry.value);
          await database.customStatement(
            'DROP ${type == 'table'
                ? 'TABLE'
                : type == 'index'
                ? 'INDEX'
                : 'TRIGGER'} IF EXISTS ${entry.key}',
          );
        }
        await database.customStatement('PRAGMA user_version = 22');
        await database.close();

        database = ShopDatabase(NativeDatabase(file));
        await database.verifyReadyForUse();
        expect(database.schemaVersion, 39);
        final snapshot = File('${root.path}/snapshot.sqlite');
        await database.exportVerifiedLocalSnapshot(snapshot);
        expect(
          () => ShopBackup.verifySnapshot(
            snapshot,
            expectedSchemaVersion: ShopBackup.supportedSchemaVersion,
          ),
          returnsNormally,
        );
      } finally {
        await database.close();
        await root.delete(recursive: true);
      }
    },
  );

  test('encrypted fresh-target restore preserves active released and committed holds', () async {
    final root = await Directory.systemTemp.createTemp(
      'shop-site-v24-restore-',
    );
    final sourceFile = File('${root.path}/source.sqlite');
    final archive = File('${root.path}/connected.smbak');
    final targetFile = File('${root.path}/restored/shop.sqlite');
    final source = ShopDatabase(NativeDatabase(sourceFile));
    try {
      await _seedAuthority(source);
      for (final productId in const [
        'restore-active',
        'restore-released',
        'restore-committed',
      ]) {
        await source.addProduct(
          id: productId,
          name: productId,
          priceMmk: 1000,
          openingStock: 2,
        );
      }

      Future<ConnectedStockReservationV1> reserve(
        String commandId,
        String subjectId,
        String productId, {
        int createdAtMillis = _now,
      }) async {
        final reservation = ConnectedStockReservationV1.held(
          reservationId: 'reservation:$commandId',
          workspaceId: _tenant,
          siteId: _site,
          actorId: _actor,
          deviceId: _device,
          workflowType: ConnectedStockWorkflowType.retailCart,
          subjectId: subjectId,
          capability: ShopStaffCapability.counterSale,
          lines: [
            ConnectedStockReservationLineV1(productId: productId, quantity: 1),
          ],
          issuedAt: DateTime.fromMillisecondsSinceEpoch(
            createdAtMillis,
            isUtc: true,
          ).toIso8601String(),
          expiresAt: '2033-05-18T03:33:50.000Z',
        );
        final command = _command(
          commandId,
          aggregateType: ConnectedStockWorkflowType.retailCart.name,
          aggregateId: subjectId,
          createdAtMillis: createdAtMillis,
          stockReservation: reservation,
        );
        expect(
          (await source.applyConnectedSiteCommandForTest(
            command,
            connectedSiteEnabled: true,
          )).status,
          ShopConnectedSiteCommandStatus.accepted,
        );
        return reservation;
      }

      final active = await reserve(
        'restore-active-command',
        'restore-active-sale',
        'restore-active',
      );
      final released = await reserve(
        'restore-released-command',
        'restore-released-sale',
        'restore-released',
      );
      final releaseCommand = _command(
        'restore-release-command',
        aggregateType: ConnectedStockWorkflowType.retailCart.name,
        aggregateId: released.subjectId,
        expectedVersion: 1,
        createdAtMillis: _now + 1000,
        stockReservationLifecycle:
            ShopConnectedStockReservationLifecycleInput.release(
              reservationId: released.reservationId,
              expectedReservationDigest: released.reservationDigest,
              reason: 'operator_cancelled',
            ),
      );
      expect(
        (await source.applyConnectedSiteCommandForTest(
          releaseCommand,
          connectedSiteEnabled: true,
        )).status,
        ShopConnectedSiteCommandStatus.accepted,
      );
      final committed = await reserve(
        'restore-committed-command',
        'restore-committed-sale',
        'restore-committed',
        createdAtMillis: _now + 1000,
      );
      final committedReceipt = await source.recordCashSale(
        operationId: committed.subjectId,
        lines: const [
          ShopSaleLineInput(productId: 'restore-committed', quantity: 1),
        ],
        connectedStockReservation: committed,
        connectedTimeAuthority: const _FixedTime(_now + 10000),
      );

      await ShopBackup.exportEncrypted(
        database: source,
        archive: archive,
        password: 'connected-restore-passphrase',
        scratchRoot: root,
      );
      await targetFile.parent.create(recursive: true);
      await ShopBackup.restoreIntoEmptyDatabase(
        archive: archive,
        target: targetFile,
        password: 'connected-restore-passphrase',
      );

      final restored = ShopDatabase(NativeDatabase(targetFile));
      try {
        await restored.verifyReadyForUse();
        expect(await restored.readReservedStockQuantity('restore-active'), 1);
        expect(await restored.readReservedStockQuantity('restore-released'), 0);
        expect(
          await restored.readReservedStockQuantity('restore-committed'),
          0,
        );
        expect(await restored.countSales(), 1);
        expect(
          (await restored.applyConnectedSiteCommandForTest(
            releaseCommand,
            connectedSiteEnabled: true,
          )).status,
          ShopConnectedSiteCommandStatus.replayed,
        );
        final saleReplay = await restored.recordCashSale(
          operationId: committed.subjectId,
          lines: const [
            ShopSaleLineInput(productId: 'restore-committed', quantity: 1),
          ],
          connectedStockReservation: committed,
        );
        expect(saleReplay.id, committedReceipt.id);
        expect(await restored.countSales(), 1);
        await expectLater(
          restored.recordCashSale(
            operationId: active.subjectId,
            lines: const [
              ShopSaleLineInput(productId: 'restore-active', quantity: 2),
            ],
          ),
          throwsStateError,
        );
        final evidenceCounts = await restored
            .customSelect(
              'SELECT '
              '(SELECT COUNT(*) FROM shop_site_commands) AS commands, '
              '(SELECT COUNT(*) FROM shop_site_events) AS events, '
              '(SELECT COUNT(*) FROM shop_site_command_acks) AS acks, '
              '(SELECT COUNT(*) FROM '
              'shop_connected_stock_reservation_transitions) AS transitions',
            )
            .getSingle();
        expect(evidenceCounts.read<int>('commands'), 5);
        expect(evidenceCounts.read<int>('events'), 5);
        expect(evidenceCounts.read<int>('acks'), 5);
        expect(evidenceCounts.read<int>('transitions'), 2);
      } finally {
        await restored.close();
      }
    } finally {
      await source.close();
      await root.delete(recursive: true);
    }
  });

  test('v23 cafe and unknown legacy rows migrate without invented binding', () async {
    final root = await Directory.systemTemp.createTemp('shop-site-v23-legacy-');
    final file = File('${root.path}/shop.sqlite');
    var database = ShopDatabase(NativeDatabase(file));
    try {
      await _seedAuthority(database);
      for (final productId in const ['legacy-cafe', 'legacy-unknown']) {
        await database.addProduct(
          id: productId,
          name: productId,
          priceMmk: 1000,
          openingStock: 2,
        );
      }
      var sequence = 0;
      for (final values in const [
        ('legacy-cafe-command', 'cafeOrder'),
        ('legacy-unknown-command', 'futureWorkflow'),
      ]) {
        sequence++;
        await database.customInsert(
          'INSERT INTO shop_site_commands '
          '(command_id, tenant_id, site_id, actor_id, device_id, aggregate_id, '
          'aggregate_type, capability, expected_version, payload_digest, '
          'lease_digest, command_digest, state, received_at_millis) '
          "VALUES (?, ?, ?, ?, ?, ?, ?, 'counterSale', 0, ?, ?, ?, "
          "'accepted', ?)",
          variables: [
            Variable<String>(values.$1),
            const Variable<String>(_tenant),
            const Variable<String>(_site),
            const Variable<String>(_actor),
            const Variable<String>(_device),
            Variable<String>(values.$1),
            Variable<String>(values.$2),
            Variable<String>(_digest('payload:${values.$1}')),
            Variable<String>(_leaseDigest),
            Variable<String>(_digest('command:${values.$1}')),
            const Variable<int>(_now),
          ],
        );
        final eventRowId = await database.customInsert(
          'INSERT INTO shop_site_events '
          '(site_sequence, event_id, command_id, tenant_id, site_id, '
          'aggregate_type, aggregate_id, aggregate_version, event_type, '
          'payload_json, event_digest, created_at_millis) '
          "VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'legacy.event', '{}', ?, ?)",
          variables: [
            Variable<int>(sequence),
            Variable<String>('event:${values.$1}'),
            Variable<String>(values.$1),
            const Variable<String>(_tenant),
            const Variable<String>(_site),
            Variable<String>(values.$2),
            Variable<String>(values.$1),
            Variable<String>(_digest('event:${values.$1}')),
            const Variable<int>(_now),
          ],
        );
        await database.customInsert(
          'INSERT INTO shop_site_aggregate_versions '
          '(tenant_id, site_id, aggregate_type, aggregate_id, version, '
          'last_event_row_id, last_site_sequence, updated_at_millis) '
          'VALUES (?, ?, ?, ?, 1, ?, ?, ?)',
          variables: [
            const Variable<String>(_tenant),
            const Variable<String>(_site),
            Variable<String>(values.$2),
            Variable<String>(values.$1),
            Variable<int>(eventRowId),
            Variable<int>(sequence),
            const Variable<int>(_now),
          ],
        );
        await database.customInsert(
          'INSERT INTO shop_site_command_acks '
          '(command_id, status, event_row_id, site_sequence, canonical_version, '
          "ack_digest, created_at_millis) VALUES (?, 'accepted', ?, ?, 1, ?, ?)",
          variables: [
            Variable<String>(values.$1),
            Variable<int>(eventRowId),
            Variable<int>(sequence),
            Variable<String>(_digest('ack:${values.$1}')),
            const Variable<int>(_now),
          ],
        );
        await database.customInsert(
          'INSERT INTO shop_site_audit '
          '(audit_id, command_id, actor_id, action, metadata_digest, '
          "created_at_millis) VALUES (?, ?, ?, 'legacy.reserve', ?, ?)",
          variables: [
            Variable<String>('audit:${values.$1}'),
            Variable<String>(values.$1),
            const Variable<String>(_actor),
            Variable<String>(_digest('audit:${values.$1}')),
            const Variable<int>(_now),
          ],
        );
      }
      await database.customInsert(
        'INSERT INTO shop_site_stock_reservations '
        '(reservation_id, command_id, product_id, quantity, state, '
        'expires_at_millis, created_at_millis, resolved_at_millis) '
        "VALUES ('legacy-cafe-reservation', 'legacy-cafe-command', "
        "'legacy-cafe', 1, 'held', ?, ?, NULL), "
        "('legacy-unknown-reservation', 'legacy-unknown-command', "
        "'legacy-unknown', 2, 'released', ?, ?, ?)",
        variables: const [
          Variable<int>(_now + 30000),
          Variable<int>(_now),
          Variable<int>(_now + 30000),
          Variable<int>(_now),
          Variable<int>(_now + 1000),
        ],
      );
      await dropHistoricalShopSchemaDefinitionGroupInDatabase(
        database,
        shopConnectedTrustedTimeIssuerSchemaDefinitionsV38(),
      );
      for (final entry
          in shopConnectedAuthoritySchemaDefinitionsV27().entries
              .toList()
              .reversed) {
        final type = shopSchemaObjectTypeForDefinition(entry.value);
        await database.customStatement(
          'DROP ${type.toUpperCase()} IF EXISTS ${entry.key}',
        );
      }
      for (final entry
          in shopConnectedCloudDispositionSchemaDefinitionsV26().entries
              .toList()
              .reversed) {
        final type = shopSchemaObjectTypeForDefinition(entry.value);
        await database.customStatement(
          'DROP ${type.toUpperCase()} IF EXISTS ${entry.key}',
        );
      }
      for (final entry
          in shopConnectedEnrollmentSchemaDefinitionsV25().entries
              .toList()
              .reversed) {
        final type = shopSchemaObjectTypeForDefinition(entry.value);
        await database.customStatement(
          'DROP ${type.toUpperCase()} IF EXISTS ${entry.key}',
        );
      }
      for (final entry
          in shopConnectedStockReservationSchemaDefinitionsV24().entries
              .toList()
              .reversed) {
        final type = shopSchemaObjectTypeForDefinition(entry.value);
        await database.customStatement(
          'DROP ${type.toUpperCase()} IF EXISTS ${entry.key}',
        );
      }
      for (final entry
          in shopConnectedAttemptSchemaDefinitionsV28().entries
              .toList()
              .reversed) {
        final type =
            canonicalShopSchemaSql(entry.value).startsWith('create table')
            ? 'TABLE'
            : 'TRIGGER';
        await database.customStatement('DROP $type IF EXISTS ${entry.key}');
      }
      await database.customStatement('PRAGMA user_version = 23');
      await database.close();

      database = ShopDatabase(NativeDatabase(file));
      await database.verifyReadyForUse();
      final migrated = await database
          .customSelect(
            'SELECT reservation_id, workflow_type, subject_id, legacy_source '
            'FROM shop_connected_stock_reservation_headers '
            'ORDER BY reservation_id',
          )
          .get();
      expect(migrated, hasLength(2));
      for (final row in migrated) {
        expect(row.readNullable<String>('workflow_type'), isNull);
        expect(row.readNullable<String>('subject_id'), isNull);
        expect(row.read<int>('legacy_source'), 1);
      }
      final transition = await database
          .customSelect(
            'SELECT to_state, transition_json, legacy_source FROM '
            'shop_connected_stock_reservation_transitions',
          )
          .getSingle();
      expect(transition.read<String>('to_state'), 'released');
      expect(transition.readNullable<String>('transition_json'), isNull);
      expect(transition.read<int>('legacy_source'), 1);
    } finally {
      await database.close();
      await root.delete(recursive: true);
    }
  });

  test('snapshot rejects semantically corrupted reservation evidence', () async {
    final root = await Directory.systemTemp.createTemp(
      'shop-site-v24-corrupt-',
    );
    final file = File('${root.path}/shop.sqlite');
    final snapshot = File('${root.path}/snapshot.sqlite');
    final tenderSnapshot = File('${root.path}/tender-snapshot.sqlite');
    final eventSnapshot = File('${root.path}/event-snapshot.sqlite');
    final database = ShopDatabase(NativeDatabase(file));
    try {
      await _seedAuthority(database);
      await database.addProduct(
        id: 'snapshot-item',
        name: 'Snapshot item',
        priceMmk: 1000,
        openingStock: 2,
      );
      final command = _command(
        'snapshot-sale',
        reservationProductId: 'snapshot-item',
      );
      expect(
        (await database.applyConnectedSiteCommandForTest(
          command,
          connectedSiteEnabled: true,
        )).status,
        ShopConnectedSiteCommandStatus.accepted,
      );
      await database.saveCounterSaleDraft(
        operationId: 'snapshot-sale',
        quantities: const {'snapshot-item': 1},
      );
      await database.beginPendingCashCheckout(
        operationId: 'snapshot-sale',
        checkoutKind: 'counter',
        subjectId: 'snapshot-sale',
        connectedStockReservation: command.stockReservation,
        connectedTimeAuthority: const _FixedTime(_now + 10000),
      );
      await database.exportVerifiedLocalSnapshot(snapshot);
      await database.exportVerifiedLocalSnapshot(tenderSnapshot);
      await database.exportVerifiedLocalSnapshot(eventSnapshot);
      expect(
        () => ShopBackup.verifySnapshot(
          snapshot,
          expectedSchemaVersion: ShopBackup.supportedSchemaVersion,
        ),
        returnsNormally,
      );
      final raw = sqlite3.open(snapshot.path);
      try {
        raw.execute(
          'DROP TRIGGER shop_connected_stock_reservation_headers_no_update',
        );
        raw.execute(
          'UPDATE shop_connected_stock_reservation_headers '
          "SET basket_digest = '${_digest('corrupted-basket')}'",
        );
        raw.execute(
          shopConnectedStockReservationSchemaDefinitionsV24()['shop_connected_stock_reservation_headers_no_update']!,
        );
      } finally {
        raw.close();
      }
      expect(
        () => ShopBackup.verifySnapshot(
          snapshot,
          expectedSchemaVersion: ShopBackup.supportedSchemaVersion,
        ),
        throwsFormatException,
      );
      final tenderRaw = sqlite3.open(tenderSnapshot.path);
      try {
        tenderRaw.execute(
          'DROP TRIGGER '
          'shop_connected_tender_reservation_bindings_no_update',
        );
        tenderRaw.execute(
          'UPDATE shop_connected_tender_reservation_bindings '
          "SET binding_digest = '${_digest('corrupted-tender-binding')}'",
        );
        tenderRaw.execute(
          shopConnectedStockReservationSchemaDefinitionsV24()['shop_connected_tender_reservation_bindings_no_update']!,
        );
      } finally {
        tenderRaw.close();
      }
      expect(
        () => ShopBackup.verifySnapshot(
          tenderSnapshot,
          expectedSchemaVersion: ShopBackup.supportedSchemaVersion,
        ),
        throwsFormatException,
      );
      final eventRaw = sqlite3.open(eventSnapshot.path);
      try {
        eventRaw.execute('DROP TRIGGER shop_site_commands_no_update');
        eventRaw.execute('DROP TRIGGER shop_site_events_no_update');
        final row = eventRaw.select(
          'SELECT * FROM shop_site_events WHERE command_id = ?',
          ['snapshot-sale'],
        ).single;
        final payload = Map<String, Object?>.from(
          jsonDecode(row['payload_json'] as String) as Map,
        )..['contract'] = 'supermega.shop.substituted-reserve.v1';
        final payloadJson = canonicalConnectedSiteJson(payload);
        final envelope = <String, Object?>{
          'eventId': row['event_id'],
          'workspaceId': row['tenant_id'],
          'siteId': row['site_id'],
          'aggregateType': row['aggregate_type'],
          'aggregateId': row['aggregate_id'],
          'aggregateVersion': row['aggregate_version'],
          'eventType': row['event_type'],
          'occurredAt': DateTime.fromMillisecondsSinceEpoch(
            row['created_at_millis'] as int,
            isUtc: true,
          ).toIso8601String(),
          'payload': payload,
        };
        eventRaw.execute(
          'UPDATE shop_site_commands SET payload_digest = ? '
          'WHERE command_id = ?',
          [connectedSiteSha256(payload), 'snapshot-sale'],
        );
        eventRaw.execute(
          'UPDATE shop_site_events SET payload_json = ?, event_digest = ? '
          'WHERE command_id = ?',
          [payloadJson, connectedSiteSha256(envelope), 'snapshot-sale'],
        );
        eventRaw.execute(
          shopConnectedSiteSchemaDefinitionsV24()['shop_site_commands_no_update']!,
        );
        eventRaw.execute(
          shopConnectedSiteSchemaDefinitionsV24()['shop_site_events_no_update']!,
        );
      } finally {
        eventRaw.close();
      }
      expect(
        () => ShopBackup.verifySnapshot(
          eventSnapshot,
          expectedSchemaVersion: ShopBackup.supportedSchemaVersion,
        ),
        throwsFormatException,
      );
    } finally {
      await database.close();
      await root.delete(recursive: true);
    }
  });
}

Map<String, Object> _enrollmentPayloadFor(
  String tenantId,
  String siteId,
  String deviceId,
) => {
  'schema': 'supermega.shop.owner-enrollment-evidence.v1',
  'action': 'approve',
  'tenantId': tenantId,
  'siteId': siteId,
  'coordinatorDeviceId': 'coordinator:$siteId',
  'deviceId': deviceId,
  'clientFingerprint': _deviceFingerprint(deviceId),
  'sessionGeneration': 1,
  'observedAtMillis': _now - 1000,
  'authorityKeyId': 'owner-test',
};

String _enrollmentDigestFor(String tenantId, String siteId, String deviceId) =>
    connectedSiteSha256(_enrollmentPayloadFor(tenantId, siteId, deviceId));

List<int> _devicePublicKey(String deviceId) =>
    sha256.convert(utf8.encode('device-key:$deviceId')).bytes;
String _deviceFingerprint(String deviceId) =>
    sha256.convert(_devicePublicKey(deviceId)).toString();

ConnectedCoordinatorApprovalV1 _approvalFor(
  String tenantId,
  String siteId,
  String deviceId,
  String enrollmentDigest,
) => ConnectedCoordinatorApprovalV1(
  workspaceId: tenantId,
  siteId: siteId,
  coordinatorDeviceId: 'coordinator:$siteId',
  pairingDigest: _digest('pairing:$tenantId:$siteId:$deviceId'),
  enrollmentEvidenceDigest: enrollmentDigest,
  clientDeviceId: deviceId,
  clientFingerprint: _deviceFingerprint(deviceId),
  clientSigningKeyId: 'device-key',
  address: '192.168.50.2',
  port: 9443,
  certificateSha256: _digest('certificate:$tenantId:$siteId:$deviceId'),
  approvalGeneration: 1,
  issuedAtMillis: _now - 900,
  expiresAtMillis: _now + 60000,
  authorityKeyId: 'owner-test',
  authoritySignature: 's' * 64,
);

Future<String> _seedAuthority(
  ShopDatabase database, {
  String tenantId = _tenant,
  String siteId = _site,
  String actorId = _actor,
  String deviceId = _device,
  bool bindStockScope = true,
}) async {
  final lease = _leaseFor(
    tenantId: tenantId,
    siteId: siteId,
    actorId: actorId,
    deviceId: deviceId,
  );
  final leaseDigest = lease.payloadDigest;
  await database.customInsert(
    'INSERT INTO shop_site_devices '
    '(device_id, tenant_id, site_id, public_key_fingerprint, '
    'session_generation, state, enrolled_at_millis) '
    "VALUES (?, ?, ?, ?, 1, 'active', ?)",
    variables: [
      Variable<String>(deviceId),
      Variable<String>(tenantId),
      Variable<String>(siteId),
      Variable<String>(_deviceFingerprint(deviceId)),
      Variable<int>(_now - 1000),
    ],
  );
  await database.customInsert(
    'INSERT INTO shop_site_pairing_nonces '
    '(nonce, tenant_id, site_id, coordinator_device_id, issued_at_millis, '
    'expires_at_millis, consumed_at_millis) VALUES (?, ?, ?, ?, ?, ?, ?)',
    variables: [
      Variable<String>('pairing-nonce:$tenantId:$siteId:$deviceId'),
      Variable<String>(tenantId),
      Variable<String>(siteId),
      Variable<String>('coordinator:$siteId'),
      Variable<int>(_now - 2000),
      Variable<int>(_now + 60000),
      Variable<int>(_now - 1000),
    ],
  );
  await database.customInsert(
    'INSERT INTO shop_site_pending_enrollments '
    '(client_fingerprint, nonce, tenant_id, site_id, coordinator_device_id, '
    "public_key, key_algorithm, observed_at_millis) VALUES (?, ?, ?, ?, ?, ?, 'ed25519', ?)",
    variables: [
      Variable<String>(_deviceFingerprint(deviceId)),
      Variable<String>('pairing-nonce:$tenantId:$siteId:$deviceId'),
      Variable<String>(tenantId),
      Variable<String>(siteId),
      Variable<String>('coordinator:$siteId'),
      Variable<Uint8List>(Uint8List.fromList(_devicePublicKey(deviceId))),
      Variable<int>(_now - 1000),
    ],
  );
  await database.customInsert(
    'INSERT OR REPLACE INTO shop_site_revocation_observations '
    '(tenant_id, site_id, generation, observed_at_millis, source_digest) '
    'VALUES (?, ?, 3, ?, ?)',
    variables: [
      Variable<String>(tenantId),
      Variable<String>(siteId),
      Variable<int>(_now - 1000),
      Variable<String>(_digest('revocation-observation')),
    ],
  );
  await database.customInsert(
    'INSERT INTO shop_site_offline_leases '
    '(lease_id, tenant_id, site_id, actor_id, actor_role, capabilities_json, '
    'device_id, session_generation, revocation_generation, issued_at_millis, '
    'expires_at_millis, key_id, payload_digest, signature) '
    "VALUES (?, ?, ?, ?, 'cashierCounter', ?, ?, 1, 3, ?, ?, 'test-key', ?, ?)",
    variables: [
      Variable<String>('lease:$tenantId:$siteId:$deviceId'),
      Variable<String>(tenantId),
      Variable<String>(siteId),
      Variable<String>(actorId),
      Variable<String>(jsonEncode(lease.capabilities)),
      Variable<String>(deviceId),
      Variable<int>(_now - 1000),
      Variable<int>(_now + 60000),
      Variable<String>(leaseDigest),
      Variable<String>(List.filled(64, 's').join()),
    ],
  );
  await database.retainConnectedLeasePayloadV34(
    lease,
    retainedAtMillis: _now - 500,
    issuerEvidenceDigest: connectedSiteSha256({
      'contract': 'supermega.test.lease-issuer-evidence.v1',
      'issuer': '$tenantId:$siteId:$deviceId',
    }),
    issuerEvidenceJson: canonicalConnectedSiteJson({
      'contract': 'supermega.test.lease-issuer-evidence.v1',
      'issuer': '$tenantId:$siteId:$deviceId',
    }),
  );
  final enrollmentPayload = _enrollmentPayloadFor(tenantId, siteId, deviceId);
  final enrollmentDigest = connectedSiteSha256(enrollmentPayload);
  final enrollmentEvidence = {
    ...enrollmentPayload,
    'signature': 's' * 64,
    'evidenceDigest': enrollmentDigest,
  };
  await database.customInsert(
    'INSERT INTO shop_site_enrollment_evidence '
    '(evidence_digest, action, tenant_id, site_id, coordinator_device_id, '
    'device_id, client_fingerprint, session_generation, observed_at_millis, '
    "authority_key_id, evidence_json) VALUES (?, 'approve', ?, ?, ?, ?, ?, 1, ?, ?, ?)",
    variables: [
      Variable<String>(enrollmentDigest),
      Variable<String>(tenantId),
      Variable<String>(siteId),
      Variable<String>('coordinator:$siteId'),
      Variable<String>(deviceId),
      Variable<String>(_deviceFingerprint(deviceId)),
      Variable<int>(_now - 1000),
      const Variable<String>('owner-test'),
      Variable<String>(canonicalConnectedSiteJson(enrollmentEvidence)),
    ],
  );
  final approval = _approvalFor(tenantId, siteId, deviceId, enrollmentDigest);
  await ShopConnectedSiteAttemptStore(
    database: database,
    approvalVerifier: const _AllowApprovalVerifier(),
    runtimeEnabled: true,
    now: () => DateTime.fromMillisecondsSinceEpoch(_now, isUtc: true),
  ).importApproval(approval);
  if (bindStockScope) {
    final existingScope = await database
        .customSelect(
          'SELECT 1 FROM shop_connected_scope_binding WHERE tenant_id = ? AND site_id = ?',
          variables: [Variable<String>(tenantId), Variable<String>(siteId)],
        )
        .getSingleOrNull();
    if (existingScope == null) {
      await database.bindConnectedStockScopeForEnrollment(
        tenantId: tenantId,
        siteId: siteId,
        enrollmentEvidenceDigest: enrollmentDigest,
        boundAtMillis: _now - 500,
        connectedSiteEnabled: true,
      );
    }
  }
  return leaseDigest;
}

class _AllowApprovalVerifier implements ConnectedCoordinatorApprovalVerifier {
  const _AllowApprovalVerifier();
  @override
  Future<bool> verify({
    required String authorityKeyId,
    required String canonicalEvidence,
    required String signature,
  }) async => true;
}

ShopConnectedSiteCommandInput _command(
  String id, {
  int expectedVersion = 0,
  String aggregateType = 'stockItem',
  String aggregateId = 'stock:rice',
  String? commandDigest,
  String? eventDigest,
  String? reservationProductId,
  String tenantId = _tenant,
  String siteId = _site,
  String actorId = _actor,
  String deviceId = _device,
  String? leaseDigest,
  int createdAtMillis = _now,
  ShopStaffCapability capability = ShopStaffCapability.counterSale,
  ShopConnectedStockReservationLifecycleInput? stockReservationLifecycle,
  ConnectedStockReservationV1? stockReservation,
}) {
  if (reservationProductId != null &&
      aggregateType == 'stockItem' &&
      aggregateId == 'stock:rice') {
    aggregateType = ConnectedStockWorkflowType.retailCart.name;
    aggregateId = id;
  }
  final selectedReservation =
      stockReservation ??
      (reservationProductId == null
          ? null
          : ConnectedStockReservationV1.held(
              reservationId: 'reservation:$id',
              workspaceId: tenantId,
              siteId: siteId,
              actorId: actorId,
              deviceId: deviceId,
              workflowType: ConnectedStockWorkflowType.retailCart,
              subjectId: id,
              capability: ShopStaffCapability.counterSale,
              lines: [
                ConnectedStockReservationLineV1(
                  productId: reservationProductId,
                  quantity: 1,
                ),
              ],
              issuedAt: '2033-05-18T03:33:20.000Z',
              expiresAt: '2033-05-18T03:33:50.000Z',
            ));
  final eventType = selectedReservation != null
      ? shopConnectedStockReservedEventType
      : stockReservationLifecycle != null
      ? shopConnectedStockReleasedEventType
      : 'shop.stock.reserved.v1';
  final commandType = selectedReservation != null
      ? switch (selectedReservation.workflowType) {
          ConnectedStockWorkflowType.retailCart => 'retail.stock.reserve.v1',
          ConnectedStockWorkflowType.cafeOrder => 'cafe.stock.reserve.v1',
        }
      : stockReservationLifecycle != null
      ? switch (aggregateType) {
          'retailCart' => 'retail.stock.release.v1',
          'cafeOrder' => 'cafe.stock.release.v1',
          _ => eventType,
        }
      : eventType;
  final payload = selectedReservation != null
      ? <String, Object?>{
          'contract': 'supermega.shop.connected-stock-reserve.v1',
          'reservation': selectedReservation.toJson(),
        }
      : stockReservationLifecycle != null
      ? <String, Object?>{
          'contract': 'supermega.shop.connected-stock-release.v1',
          'reservationId': stockReservationLifecycle.reservationId,
          'expectedReservationDigest':
              stockReservationLifecycle.expectedReservationDigest,
          'targetState': stockReservationLifecycle.targetState.name,
          'reason': stockReservationLifecycle.reason,
        }
      : <String, Object?>{'commandId': id};
  final event = <String, Object?>{
    'eventId': 'event:$id',
    'workspaceId': tenantId,
    'siteId': siteId,
    'aggregateType': aggregateType,
    'aggregateId': aggregateId,
    'aggregateVersion': expectedVersion + 1,
    'eventType': eventType,
    'occurredAt': DateTime.fromMillisecondsSinceEpoch(
      createdAtMillis,
      isUtc: true,
    ).toIso8601String(),
    'payload': payload,
  };
  final lease = _leaseFor(
    tenantId: tenantId,
    siteId: siteId,
    actorId: actorId,
    deviceId: deviceId,
  );
  final signedCommand = SiteCommandV1(
    commandId: id,
    workspaceId: tenantId,
    siteId: siteId,
    actorId: actorId,
    deviceId: deviceId,
    aggregateType: aggregateType,
    aggregateId: aggregateId,
    expectedVersion: expectedVersion,
    commandType: commandType,
    payload: payload,
    payloadDigest: connectedSiteSha256(payload),
    leaseDigest: lease.payloadDigest,
    issuedAt: DateTime.fromMillisecondsSinceEpoch(
      createdAtMillis,
      isUtc: true,
    ).toIso8601String(),
    signingKeyId: 'device-key',
    signatureAlgorithm: 'ed25519',
    signature: 's' * 64,
  );
  final proof = ConnectedSiteCloudProofV1.signed(
    command: signedCommand,
    lease: lease,
    clientFingerprint: _deviceFingerprint(deviceId),
    enrollmentEvidenceDigest: _enrollmentDigestFor(tenantId, siteId, deviceId),
    coordinatorBindingDigest: _approvalFor(
      tenantId,
      siteId,
      deviceId,
      _enrollmentDigestFor(tenantId, siteId, deviceId),
    ).bindingDigest,
    authorityPayloadDigest: connectedSiteSha256({
      'contract': 'supermega.test.lease-issuer-evidence.v1',
      'issuer': '$tenantId:$siteId:$deviceId',
    }),
    eventBinding: {
      'eventId': 'event:$id',
      'eventType': eventType,
      'eventDigest': eventDigest ?? connectedSiteSha256(event),
      'capability': capability.name,
      'auditAction': 'shop.stock.reserve',
      'commandType': signedCommand.commandType,
    },
  );
  final effectiveLeaseDigest = leaseDigest ?? lease.payloadDigest;
  final effectiveCommandDigest = commandDigest ?? signedCommand.commandDigest;
  return ShopConnectedSiteCommandInput(
    commandId: id,
    tenantId: tenantId,
    siteId: siteId,
    actorId: actorId,
    deviceId: deviceId,
    aggregateType: aggregateType,
    aggregateId: aggregateId,
    capability: capability.name,
    expectedVersion: expectedVersion,
    payloadDigest: connectedSiteSha256(payload),
    leaseDigest: effectiveLeaseDigest,
    commandDigest: effectiveCommandDigest,
    cloudProofJson: canonicalConnectedSiteJson(proof.toJson()),
    cloudProofDigest: proof.proofDigest,
    eventId: 'event:$id',
    eventType: eventType,
    eventPayloadJson: canonicalConnectedSiteJson(payload),
    eventDigest: eventDigest ?? connectedSiteSha256(event),
    ackDigest: _digest('ack:$id'),
    auditAction: 'shop.stock.reserve',
    auditMetadataDigest: _digest('audit:$id'),
    createdAtMillis: createdAtMillis,
    stockReservation: selectedReservation,
    stockReservationLifecycle: stockReservationLifecycle,
  );
}

OfflineStaffLeaseV1 _leaseFor({
  String tenantId = _tenant,
  String siteId = _site,
  String actorId = _actor,
  String deviceId = _device,
}) {
  final unsigned = <String, Object>{
    'protocolVersion': connectedSiteProtocolVersion,
    'leaseId': 'lease:$tenantId:$siteId:$deviceId',
    'workspaceId': tenantId,
    'siteId': siteId,
    'actorId': actorId,
    'role': 'cashierCounter',
    'capabilities': const ['cafeOrderWrite', 'counterSale'],
    'deviceId': deviceId,
    'sessionGeneration': 1,
    'revocationGeneration': 3,
    'issuedAt': DateTime.fromMillisecondsSinceEpoch(
      _now - 1000,
      isUtc: true,
    ).toIso8601String(),
    'expiresAt': DateTime.fromMillisecondsSinceEpoch(
      _now + 60000,
      isUtc: true,
    ).toIso8601String(),
    'issuerKeyId': 'test-key',
  };
  return OfflineStaffLeaseV1(
    leaseId: unsigned['leaseId']! as String,
    workspaceId: tenantId,
    siteId: siteId,
    actorId: actorId,
    role: 'cashierCounter',
    capabilities: const ['cafeOrderWrite', 'counterSale'],
    deviceId: deviceId,
    sessionGeneration: 1,
    revocationGeneration: 3,
    issuedAt: unsigned['issuedAt']! as String,
    expiresAt: unsigned['expiresAt']! as String,
    issuerKeyId: 'test-key',
    payloadDigest: connectedSiteSha256(unsigned),
    signature: 's' * 64,
  );
}

String _digest(String value) => sha256.convert(utf8.encode(value)).toString();

class _FixedTime implements ShopConnectedSiteCoordinatorTimeAuthority {
  const _FixedTime(this.nowMillis);

  final int nowMillis;

  @override
  Future<int> readValidatedNowMillis({
    required String tenantId,
    required String siteId,
  }) async => nowMillis;
}

extension _ConnectedCommandTestHarness on ShopDatabase {
  Future<ShopConnectedSiteCommandResult> applyConnectedSiteCommandForTest(
    ShopConnectedSiteCommandInput input, {
    required bool connectedSiteEnabled,
    ShopConnectedSiteCoordinatorTimeAuthority? timeAuthority,
  }) => applyConnectedSiteCommand(
    input,
    connectedSiteEnabled: connectedSiteEnabled,
    timeAuthority: timeAuthority ?? _FixedTime(input.createdAtMillis),
  );
}

MerchantWalletSetup _walletSetup() => MerchantWalletSetup(
  provider: 'KBZPay',
  merchantPhone: null,
  officialQrPayload: _syntheticStaticMmqr(),
  issuerConfirmed: true,
);

String _syntheticStaticMmqr() {
  String field(String id, String value) =>
      '$id${utf8.encode(value).length.toString().padLeft(2, '0')}$value';
  final merchant = [
    field('00', 'MM.COM.MMQR'),
    field('01', '999999999999999'),
    field('02', '000000'),
  ].join();
  final language = [field('00', 'my'), field('01', 'ဆိုင်')].join();
  final body = [
    field('00', '01'),
    field('01', '11'),
    field('26', merchant),
    field('52', '5411'),
    field('53', '104'),
    field('58', 'MM'),
    field('59', 'TEST STORE'),
    field('60', 'Yangon'),
    field('64', language),
    '6304',
  ].join();
  return '$body${_testCrc16(utf8.encode(body))}';
}

String _testCrc16(List<int> bytes) {
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
