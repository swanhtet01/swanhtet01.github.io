"""Fail-closed Commerce state and lifecycle validation for managed workspaces."""

from __future__ import annotations

import re
from hashlib import sha256
import json
from collections.abc import Mapping, Sequence
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import quote

from supermega_runtime.client_import_runtime import (
    ClientImportValidationError,
    validate_client_import_staging_package,
)
from supermega_runtime.ecommerce_buying_lifecycle import (
    EcommerceLifecycleValidationError,
    review_ecommerce_payment,
    review_ecommerce_promotion,
    review_ecommerce_shipping,
    validate_ecommerce_tax_decision,
    validate_ecommerce_payment_policy,
    validate_ecommerce_promotion_policy,
    validate_ecommerce_shipping_policy,
    validate_ecommerce_order_request,
)
from supermega_runtime.shop_inventory_runtime import (
    ShopInventoryValidationError,
    reserve_shop_inventory_order,
    shop_inventory_available_balances,
    shop_inventory_balances,
    shop_inventory_business_partners,
    shop_inventory_supplier_policies,
    shop_inventory_sku_available_to_promise,
    shop_inventory_sku_totals,
    validate_shop_inventory_state,
)
from supermega_runtime.trial_store import TrialValidationError


COMMERCE_SCHEMA = "supermega.commerce.workspace.v2"
COMMERCE_DAILY_CLOSE_EXPORT_SCHEMA = "supermega.commerce.daily-close-export.v3"
COMMERCE_ACCOUNTING_HANDOFF_SCHEMA = "supermega.commerce.accounting-handoff.v3"
COMMERCE_SUPPLIER_PAYABLES_HANDOFF_SCHEMA = "supermega.commerce.supplier-payables-handoff.v1"
COMMERCE_CLOSE_SETTLEMENT_SCHEMA = "supermega.commerce.close-settlement.v1"
COMMERCE_ORDER_ACKNOWLEDGEMENT_SCHEMA = "supermega.commerce.order-acknowledgement.v1"
COMMERCE_EVENTS = frozenset(
    {
        "commerce.workspace.initialized",
        "commerce.item.created",
        "commerce.item.updated",
        "commerce.tax_configuration.saved",
        "commerce.account_mapping.saved",
        "commerce.customer_credit_policy.saved",
        "commerce.promotion_policy.saved",
        "commerce.shipping_policy.saved",
        "commerce.payment_policy.saved",
        "commerce.order.created",
        "commerce.order.advanced",
        "commerce.order.cancelled",
        "commerce.order.return_recorded",
        "commerce.order.support_case_opened",
        "commerce.order.support_case_reopened",
        "commerce.order.support_case_service_recorded",
        "commerce.order.support_case_resolved",
        "commerce.order.correction_recorded",
        "commerce.payment.reconciled",
        "commerce.collection_action.recorded",
        "commerce.refund.settled",
        "commerce.stock.received",
        "commerce.stock.counted",
        "commerce.production_material.issued",
        "commerce.production_material.returned",
        "commerce.production_batch.received",
        "commerce.inventory.initialized",
        "commerce.inventory.master_created",
        "commerce.inventory.supplier_policy_saved",
        "commerce.inventory.transferred",
        "commerce.purchase_budget.approved",
        "commerce.supplier_sourcing.approved",
        "commerce.purchase_requisition.approved",
        "commerce.purchase_order.created",
        "commerce.purchase_order.received",
        "commerce.purchase_order.cancelled",
        "commerce.supplier_invoice.recorded",
        "commerce.supplier_invoice.payable_ready",
        "commerce.supplier_return.authorized",
        "commerce.supplier_credit.recorded",
        "commerce.close.saved",
        "commerce.website_intake.created",
        "commerce.website_intake.converted",
        "commerce.storefront.configuration.saved",
        "commerce.storefront.merchandising.imported",
        "commerce.storefront_request.received",
        "commerce.service_schedule.initialized",
        "commerce.service_schedule.saved",
    }
)
COMMERCE_HUMAN_EVENTS = frozenset(
    {
        "commerce.workspace.initialized",
        "commerce.item.created",
        "commerce.item.updated",
        "commerce.tax_configuration.saved",
        "commerce.account_mapping.saved",
        "commerce.customer_credit_policy.saved",
        "commerce.promotion_policy.saved",
        "commerce.shipping_policy.saved",
        "commerce.payment_policy.saved",
        "commerce.order.created",
        "commerce.order.advanced",
        "commerce.order.cancelled",
        "commerce.order.return_recorded",
        "commerce.order.support_case_opened",
        "commerce.order.support_case_reopened",
        "commerce.order.support_case_service_recorded",
        "commerce.order.support_case_resolved",
        "commerce.order.correction_recorded",
        "commerce.payment.reconciled",
        "commerce.collection_action.recorded",
        "commerce.refund.settled",
        "commerce.stock.received",
        "commerce.stock.counted",
        "commerce.production_material.issued",
        "commerce.production_material.returned",
        "commerce.production_batch.received",
        "commerce.inventory.initialized",
        "commerce.inventory.master_created",
        "commerce.inventory.supplier_policy_saved",
        "commerce.inventory.transferred",
        "commerce.purchase_budget.approved",
        "commerce.supplier_sourcing.approved",
        "commerce.purchase_requisition.approved",
        "commerce.purchase_order.created",
        "commerce.purchase_order.received",
        "commerce.purchase_order.cancelled",
        "commerce.supplier_invoice.recorded",
        "commerce.supplier_invoice.payable_ready",
        "commerce.supplier_return.authorized",
        "commerce.supplier_credit.recorded",
        "commerce.close.saved",
        "commerce.website_intake.converted",
        "commerce.storefront.configuration.saved",
        "commerce.storefront.merchandising.imported",
        "commerce.service_schedule.initialized",
        "commerce.service_schedule.saved",
    }
)
_ORDER_STATUSES = ("confirmed", "preparing", "ready", "completed", "cancelled")
_NEXT_ORDER_STATUS = {"confirmed": "preparing", "preparing": "ready", "ready": "completed"}
_PAYMENT_STATUSES = ("pending", "reconciled")
_REFUND_STATUSES = ("none", "due", "settled")
_MOVEMENT_KINDS = (
    "opening",
    "reserve",
    "release",
    "receipt",
    "count",
    "return",
    "production_issue",
    "production_return",
    "production_receipt",
)
_PRODUCTION_MATERIAL_UNITS = frozenset(
    {"kg", "g", "l", "ml", "pcs", "pack", "bag", "roll", "sheet", "m", "cm"}
)
_RETURN_DISPOSITIONS = ("restock", "not_restocked")
_SUPPORT_CATEGORIES = frozenset(
    {"order_status", "delivery_issue", "payment_question", "item_issue", "other"}
)
_SUPPORT_RESOLUTION_OUTCOMES = frozenset(
    {"information_provided", "replacement_review_required", "refund_review_required", "no_action"}
)
_SUPPORT_PRIORITIES = frozenset({"urgent", "high", "normal", "low"})
_SUPPORT_PRIORITY_ORDER = ("urgent", "high", "normal", "low")
_SUPPORT_SERVICE_EVENT_KINDS = frozenset(
    {"reassigned", "escalated", "acknowledged", "first_response_ready"}
)
_PURCHASE_DISCREPANCY_CODES = frozenset({"damaged", "wrong_item", "quality_failed"})
_PURCHASE_DISCREPANCY_FIELDS = frozenset(
    {"rejectedQuantity", "discrepancyCode", "discrepancyDisposition"}
)
_CORRECTION_KINDS = ("credit", "debit")
_CORRECTION_REASON_CODES = ("pricing_error", "service_recovery", "fee_adjustment", "other")
_WEBSITE_INTAKE_STATUSES = ("pending_confirmation", "converted")
_MAX_SAFE_INTEGER = 9_007_199_254_740_991
_WEBSITE_FINGERPRINT_PATTERN = re.compile(r"web-[a-f0-9]{8}")
_WEBSITE_INTAKE_ID_PATTERN = re.compile(r"WINT-[A-Z0-9-]{8,80}")
_STOREFRONT_REQUEST_ID_PATTERN = re.compile(
    r"ECR-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}"
)
_STOREFRONT_IDEMPOTENCY_PATTERN = re.compile(
    r"ECI-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}"
)
_SHA256_DIGEST_PATTERN = re.compile(r"sha256:[a-f0-9]{64}")
_COMMAND_ID_PATTERN = re.compile(
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
)
_STOREFRONT_PREVIEW_SCHEMA = "supermega.ecommerce.storefront_preview.v1"
_MAX_STOREFRONT_REQUESTS = 100
_MAX_PURCHASE_BUDGET_ENVELOPES = 200
_MAX_SUPPLIER_SOURCING_DECISIONS = 200
_MAX_PURCHASE_REQUISITIONS = 100
_MAX_PURCHASE_ORDERS = 100
_MAX_SUPPLIER_RETURNS_PER_PURCHASE_ORDER = 50
_MAX_SUPPLIER_CREDITS_PER_RETURN = 50
_MAX_CATALOG_BASELINES = 500
_MAX_CATALOG_CHANGES = 500
_MAX_TAX_CONFIGURATIONS = 100
_MAX_ACCOUNT_MAPPING_CONFIGURATIONS = 100
_MAX_CUSTOMER_CREDIT_POLICIES = 500
_MAX_PROMOTION_POLICIES = 200
_MAX_SHIPPING_POLICIES = 200
_MAX_PAYMENT_POLICIES = 200
_MAX_ORDER_LINES = 20
_MAX_RETURNS_PER_ORDER = 100
_MAX_SUPPORT_CASES_PER_ORDER = 100
_MAX_SUPPORT_SERVICE_EVENTS_PER_CASE = 100
_MAX_CORRECTIONS_PER_ORDER = 100
_MAX_COLLECTION_ACTIONS_PER_ORDER = 100
_MAX_MOVEMENT_ID_LENGTH = 2_000
_SERVICE_SCHEDULE_SCHEMA = "supermega.shop.service_schedule.v4"
_LEGACY_SERVICE_SCHEDULE_SCHEMA_V3 = "supermega.shop.service_schedule.v3"
_SERVICE_SCHEDULE_PACKS = frozenset({"retail", "cafe", "restaurant", "spa", "gym", "school"})
_SERVICE_SCHEDULE_EVENT_TYPES = frozenset(
    {
        "service_registered",
        "resource_registered",
        "booking_scheduled",
        "booking_advanced",
        "booking_cancelled",
        "package_redeemed",
        "client_retention_set",
        "client_exported",
        "client_anonymized",
    }
)
_SPA_MEMBERSHIP_PACKAGES = {
    "service-session": ("SPA-PACK-MASSAGE-5", 5),
    "service-facial": ("SPA-PACK-FACIAL-3", 3),
}
_SUPPORT_INTENT_ID_PATTERN = re.compile(
    r"ESR-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}"
)
_SUPPORT_CASE_ID_PATTERN = re.compile(
    r"CASE-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}"
)
_SERVICE_SCHEDULE_BOOKING_STATUSES = frozenset(
    {"held", "confirmed", "checked_in", "completed", "cancelled"}
)
_PURCHASE_ORDER_ID_PATTERN = re.compile(
    r"PO-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}"
)
_PURCHASE_REQUISITION_ID_PATTERN = re.compile(
    r"PR-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}"
)
_PURCHASE_BUDGET_ENVELOPE_ID_PATTERN = re.compile(
    r"PBE-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}"
)
_PURCHASE_BUDGET_CODE_PATTERN = re.compile(r"[A-Z0-9][A-Z0-9_-]{2,39}")
_SUPPLIER_SOURCING_DECISION_ID_PATTERN = re.compile(
    r"SSD-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}"
)
_SUPPLIER_INVOICE_ID_PATTERN = re.compile(
    r"PINV-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}"
)
_SUPPLIER_RETURN_ID_PATTERN = re.compile(
    r"SRET-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}"
)
_SUPPLIER_CREDIT_ID_PATTERN = re.compile(
    r"SCN-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}"
)
_TAX_CODE_PATTERN = re.compile(r"[A-Z0-9][A-Z0-9_-]{0,11}")
_TAX_JURISDICTION_CODE_PATTERN = re.compile(r"[A-Z0-9][A-Z0-9_-]{1,15}")
_EXTERNAL_ACCOUNT_CODE_PATTERN = re.compile(r"[A-Za-z0-9][A-Za-z0-9._/-]{0,39}")
_LEGACY_ACCOUNT_ROLES = (
    "payment_clearing",
    "sales_revenue",
    "sales_revenue_unverified",
    "tax_payable",
)
_ACCOUNT_ROLES = (
    *_LEGACY_ACCOUNT_ROLES,
    "sales_adjustment",
    "correction_receivable",
    "correction_payable",
)
_ISO_TIMESTAMP_PATTERN = re.compile(
    r"[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}:[0-9]{2}"
    r"(?:\.[0-9]{1,6})?(?:Z|[+-](?:[01][0-9]|2[0-3]):[0-5][0-9])"
)

_STATE_FIELDS = frozenset({"schema", "items", "orders", "movements", "closes"})
_SERVICE_SCHEDULE_FIELDS = frozenset(
    {"schema", "industryPackId", "revision", "services", "resources", "privacyPolicy", "clients", "bookings", "events"}
)
_ITEM_FIELDS = frozenset({"sku", "name", "variant", "onHand", "reorderAt", "price"})
_CATALOG_CHANGE_FIELDS = frozenset(
    {
        "sku",
        "previousPrice",
        "nextPrice",
        "previousReorderAt",
        "nextReorderAt",
        "proof",
    }
)
_CATALOG_BASELINE_FIELDS = frozenset(
    {"sku", "price", "reorderAt", "proof", "anchorDigest"}
)
_TAX_CONFIGURATION_FIELDS = frozenset(
    {"revision", "code", "label", "rateBasisPoints", "mode", "proof"}
)
_TAX_CONFIGURATION_SCHEDULE_FIELDS = frozenset({"jurisdictionCode", "effectiveFrom"})
_ACCOUNT_MAPPING_CONFIGURATION_FIELDS = frozenset({"revision", "mappings", "proof"})
_ACCOUNT_MAPPING_FIELDS = frozenset({"accountRole", "externalAccountCode"})
_CUSTOMER_CREDIT_POLICY_FIELDS = frozenset(
    {"revision", "customer", "creditLimitMmk", "maxPaymentTermsDays", "status", "proof"}
)
_ORDER_CREDIT_DECISION_FIELDS = frozenset(
    {
        "policyRevision",
        "policyActionId",
        "creditLimitMmk",
        "exposureBeforeMmk",
        "orderAmountMmk",
        "exposureAfterMmk",
        "maxPaymentTermsDays",
        "paymentTermsDays",
        "status",
    }
)
_CUSTOMER_CREDIT_TERMS = frozenset({0, 7, 30})
_ORDER_REQUIRED_FIELDS = frozenset(
    {
        "id",
        "createdAt",
        "customer",
        "channel",
        "item",
        "quantity",
        "payment",
        "paymentStatus",
        "refundStatus",
        "total",
        "status",
    }
)
_ORDER_OPTIONAL_FIELDS = frozenset(
    {
        "itemSku",
        "paymentReconciledAt",
        "paymentReconciliationActionId",
        "paymentReconciledBy",
        "paymentReconciliationReason",
        "paymentEvidenceReference",
        "refundSettledAt",
        "refundSettlementActionId",
        "refundSettledBy",
        "refundSettlementReason",
        "refundEvidenceReference",
        "fulfilment",
        "fulfilmentReference",
        "promisedAt",
        "paymentDueAt",
        "collectionActions",
        "creditDecision",
        "promotionDecision",
        "shippingDecision",
        "paymentDecision",
        "taxDecision",
        "owner",
        "sourceRecordId",
        "evidenceReference",
        "lines",
        "advancementActionIds",
        "completion",
        "returns",
        "supportCases",
        "corrections",
        "calculation",
    }
)
_ORDER_LINE_REQUIRED_FIELDS = frozenset({"sku", "name", "quantity", "unitPriceMmk"})
_ORDER_LINE_OPTIONAL_FIELDS = frozenset({"variant"})
_COLLECTION_ACTION_FIELDS = frozenset({"kind", "proof"})
_ORDER_CALCULATION_SCHEMA = "supermega.commerce.order-calculation.v1"
_ORDER_CALCULATION_V2_SCHEMA = "supermega.commerce.order-calculation.v2"
_ORDER_CALCULATION_FIELDS = frozenset(
    {
        "schema",
        "currency",
        "catalogRevision",
        "subtotalMmk",
        "taxMode",
        "taxMmk",
        "totalMmk",
    }
)
_ORDER_CALCULATION_V2_FIELDS = frozenset(
    {
        "schema",
        "currency",
        "catalogRevision",
        "taxConfigurationRevision",
        "taxCode",
        "taxRateBasisPoints",
        "taxMode",
        "listedSubtotalMmk",
        "subtotalMmk",
        "taxMmk",
        "totalMmk",
    }
)
_ORDER_CALCULATION_V2_SCHEDULE_FIELDS = frozenset(
    {"taxJurisdictionCode", "taxEffectiveFrom"}
)
_ORDER_RETURN_FIELDS = frozenset(
    {
        "actionId",
        "createdAt",
        "actor",
        "reason",
        "evidenceReference",
        "sku",
        "quantity",
        "disposition",
    }
)
_ORDER_SUPPORT_CASE_REQUIRED_FIELDS = frozenset(
    {
        "caseId", "sourceIntentId", "sourceRequestId", "customerRequestedAt",
        "category", "customerDescription", "status", "opening",
        "externalMessageSent", "refundStarted",
    }
)
_ORDER_SUPPORT_CASE_OPTIONAL_FIELDS = frozenset(
    {
        "resolution", "serviceEvents", "priority", "owner", "dueAt",
        "reopen", "followUpServiceEvents", "followUpResolution",
    }
)
_ORDER_SUPPORT_SERVICE_EVENT_FIELDS = frozenset(
    {"kind", "owner", "priority", "dueAt", "note", "proof"}
)
_ORDER_SUPPORT_RESOLUTION_FIELDS = frozenset({"outcome", "note", "proof"})
_ORDER_SUPPORT_REOPEN_FIELDS = frozenset(
    {"sourceResolutionActionId", "owner", "priority", "dueAt", "note", "proof"}
)
_ORDER_CORRECTION_FIELDS = frozenset(
    {
        "documentId",
        "actionId",
        "createdAt",
        "actor",
        "reason",
        "evidenceReference",
        "kind",
        "reasonCode",
        "sourceCalculationDigest",
        "calculation",
        "balanceAfterMmk",
        "financialStatus",
        "postingAuthority",
        "externalPostingPerformed",
    }
)
_CORRECTION_CALCULATION_FIELDS = frozenset(
    {
        "currency",
        "taxConfigurationRevision",
        "taxCode",
        "taxRateBasisPoints",
        "taxMode",
        "listedAmountMmk",
        "subtotalMmk",
        "taxMmk",
        "totalMmk",
    }
)
_CORRECTION_CALCULATION_SCHEDULE_FIELDS = frozenset(
    {"taxJurisdictionCode", "taxEffectiveFrom"}
)
_RECONCILIATION_FIELDS = frozenset(
    {
        "paymentReconciledAt",
        "paymentReconciliationActionId",
        "paymentReconciledBy",
        "paymentReconciliationReason",
        "paymentEvidenceReference",
    }
)
_MOVEMENT_FIELDS = frozenset(
    {
        "id",
        "actionId",
        "createdAt",
        "actor",
        "reason",
        "evidenceReference",
        "kind",
        "sku",
        "quantityDelta",
        "orderId",
        "purchaseOrderId",
        "rejectedQuantity",
        "discrepancyCode",
        "discrepancyDisposition",
        "expectedQuantity",
        "countedQuantity",
        "productionRequestId",
        "productionCommandDigest",
        "productionJobId",
        "productionMaterialId",
        "productionInputLotId",
        "productionQuantityMilli",
        "productionUnit",
        "conversionNote",
        "productionIssueActionId",
        "productionReturnedQuantityMilli",
        "productionReturnStockUnitId",
        "productionReturnLocationId",
        "productionReleaseId",
        "productionOutputBatchId",
        "productionReleasedAt",
        "productionSourceProduct",
    }
)
_PRODUCTION_ISSUE_FIELDS = frozenset(
    {
        "productionRequestId",
        "productionCommandDigest",
        "productionJobId",
        "productionMaterialId",
        "productionInputLotId",
        "productionQuantityMilli",
        "productionUnit",
        "conversionNote",
    }
)
_PURCHASE_ORDER_REQUIRED_FIELDS = frozenset(
    {"id", "createdAt", "supplier", "sku", "quantityOrdered", "creation"}
)
_PURCHASE_ORDER_OPTIONAL_FIELDS = frozenset(
    {"requisitionId", "expectedAt", "unitCostMmk", "cancellation", "supplierInvoice", "supplierReturns"}
)
_PURCHASE_REQUISITION_REQUIRED_FIELDS = frozenset(
    {
        "id", "createdAt", "expectedAt", "supplier", "sku", "quantityRequested",
        "unitCostMmk", "totalMmk", "sourceDecisionDigest",
        "sourceReplenishmentDigest", "approval",
    }
)
_PURCHASE_REQUISITION_OPTIONAL_FIELDS = frozenset(
    {"budgetEnvelopeId", "sourceSourcingDecisionId"}
)
_PURCHASE_BUDGET_ENVELOPE_FIELDS = frozenset(
    {
        "id", "createdAt", "budgetCode", "label", "periodStart", "periodEnd",
        "ceilingMmk", "perRequisitionLimitMmk", "approval",
    }
)
_SUPPLIER_SOURCING_DECISION_FIELDS = frozenset(
    {
        "id", "createdAt", "sku", "quantity", "quotes", "selectedQuoteReference",
        "unitCostToleranceBasisPoints", "deliveryToleranceDays", "approval",
    }
)
_SUPPLIER_QUOTE_FIELDS = frozenset(
    {"supplier", "quoteReference", "vendorApprovalReference", "unitCostMmk", "deliveryAt", "validUntil"}
)
_SUPPLIER_INVOICE_REQUIRED_FIELDS = frozenset(
    {
        "id", "supplierReference", "issuedAt", "dueAt", "quantityInvoiced",
        "unitCostMmk", "totalMmk", "recording",
    }
)
_SUPPLIER_INVOICE_OPTIONAL_FIELDS = frozenset({"payableReview"})
_SUPPLIER_RETURN_FIELDS = frozenset(
    {
        "id", "createdAt", "receiptMovementId", "quantityRejected", "reasonCode",
        "claimAmountMmk", "internalReturnReference", "physicalReturnStatus",
        "supplierContacted", "accountingPosted", "authorization", "creditNotes",
    }
)
_SUPPLIER_CREDIT_FIELDS = frozenset(
    {"id", "supplierReference", "issuedAt", "amountMmk", "accountingPosted", "recording"}
)
_CLOSE_REQUIRED_FIELDS = frozenset({"id", "createdAt", "total", "orders"})
_CLOSE_SNAPSHOT_FIELDS = frozenset(
    {
        "businessDate",
        "orderIds",
        "paymentExceptionOrderIds",
        "stockExceptionSkus",
        "actionId",
        "operator",
        "reason",
        "evidenceReference",
    }
)
_REFUND_SETTLEMENT_FIELDS = frozenset(
    {
        "refundSettledAt",
        "refundSettlementActionId",
        "refundSettledBy",
        "refundSettlementReason",
        "refundEvidenceReference",
    }
)
_CLOSE_ID_PATTERN = re.compile(
    r"^CLOSE-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$"
)
_CLOSE_ACTION_ID_PATTERN = re.compile(
    r"^ACT-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$"
)
_BUSINESS_DATE_PATTERN = re.compile(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$")
_EVIDENCE_FIELDS = frozenset({"actionId", "capturedAt", "actor", "reason", "evidenceReference"})
_WEBSITE_SOURCE_FIELDS = frozenset({"fingerprint", "approvalId", "snapshotId", "pageId", "siteName", "pagePath"})
_WEBSITE_INTAKE_REQUIRED_FIELDS = frozenset(
    {"id", "createdAt", "status", "source", "sku", "quantity", "itemName", "unitPrice", "total", "creation"}
)
_WEBSITE_INTAKE_OPTIONAL_FIELDS = frozenset(
    {"itemVariant", "snapshotDigest", "conversion"}
)
_WEBSITE_CONVERSION_FIELDS = _EVIDENCE_FIELDS | {"orderId"}
_STOREFRONT_REQUEST_FIELDS = frozenset(
    {
        "schema",
        "mode",
        "state",
        "id",
        "idempotencyKey",
        "createdAt",
        "sourcePreviewDigest",
        "customerReference",
        "fulfilment",
        "currency",
        "line",
        "totalMmk",
    }
)
_STOREFRONT_REQUEST_PROVENANCE_FIELDS = frozenset(
    {"sourceStorefrontRevision", "sourceStorefrontActionId"}
)
_STOREFRONT_REQUEST_LINE_FIELDS = frozenset(
    {"sku", "name", "variant", "quantity", "unitPriceMmk"}
)
_STOREFRONT_CONFIGURATION_FIELDS = frozenset(
    {
        "schema",
        "revision",
        "shopCatalogSnapshotRevision",
        "shopCatalogDigest",
        "storeName",
        "summary",
        "selectedSkus",
        "saved",
    }
)
_STOREFRONT_CONFIGURATION_OPTIONAL_FIELDS = frozenset({"activation", "merchandising"})
_STOREFRONT_MERCHANDISING_FIELDS = frozenset(
    {"sku", "featured", "collection", "displayName", "note"}
)
_PRODUCTION_RETURN_EXCLUSIVE_FIELDS = frozenset(
    {
        "productionIssueActionId",
        "productionReturnedQuantityMilli",
        "productionReturnStockUnitId",
        "productionReturnLocationId",
    }
)
_CLOSE_OPTIONAL_FIELDS = _CLOSE_SNAPSHOT_FIELDS | {"settlement"}
_CLOSE_SETTLEMENT_FIELDS = frozenset(
    {"schema", "status", "totalExpectedMmk", "totalCountedMmk", "totalVarianceMmk", "lines"}
)
_CLOSE_SETTLEMENT_LINE_FIELDS = frozenset(
    {"paymentMethod", "expectedMmk", "countedMmk", "varianceMmk", "status", "varianceOwner", "varianceReason"}
)
_PRODUCTION_RECEIPT_FIELDS = frozenset(
    {
        "productionReleaseId",
        "productionCommandDigest",
        "productionJobId",
        "productionOutputBatchId",
        "productionReleasedAt",
    }
)
_PRODUCTION_ISSUE_EXCLUSIVE_FIELDS = frozenset(
    {
        "productionRequestId",
        "productionMaterialId",
        "productionInputLotId",
        "productionQuantityMilli",
        "productionUnit",
        "conversionNote",
    }
)
_PRODUCTION_RECEIPT_EXCLUSIVE_FIELDS = frozenset(
    {
        "productionReleaseId",
        "productionOutputBatchId",
        "productionReleasedAt",
        "productionSourceProduct",
    }
)
_STOREFRONT_ACTIVATION_FIELDS = frozenset(
    {"contract", "packageDigest", "workflowTemplateId", "confirmedAt", "skus"}
)
_ECOMMERCE_TEMPLATE_IDS = frozenset(
    {"social-storefront", "pickup-preorder", "wholesale-request"}
)


def _object(value: object, field: str) -> dict[str, Any]:
    if not isinstance(value, Mapping):
        raise TrialValidationError(f"{field} must be an object.")
    if any(not isinstance(key, str) for key in value):
        raise TrialValidationError(f"{field} keys must be strings.")
    return dict(value)


def _exact_fields(
    value: Mapping[str, Any],
    field: str,
    *,
    required: frozenset[str],
    optional: frozenset[str] = frozenset(),
) -> None:
    fields = set(value)
    missing = sorted(required - fields)
    extra = sorted(fields - required - optional)
    if missing:
        raise TrialValidationError(f"{field} is missing fields: {', '.join(missing)}.")
    if extra:
        raise TrialValidationError(f"{field} has unsupported fields: {', '.join(extra)}.")


def _text(value: object, field: str, *, maximum: int = 180) -> str:
    if not isinstance(value, str) or not value.strip() or value != value.strip() or len(value) > maximum:
        raise TrialValidationError(f"{field} must be canonical non-empty text of at most {maximum} characters.")
    return value


def _blankable_text(value: object, field: str, *, maximum: int) -> str:
    if not isinstance(value, str) or value != value.strip() or len(value) > maximum:
        raise TrialValidationError(
            f"{field} must be canonical text of at most {maximum} characters or empty."
        )
    return value


def _timestamp(value: object, field: str) -> str:
    timestamp = _text(value, field, maximum=40)
    if _ISO_TIMESTAMP_PATTERN.fullmatch(timestamp) is None:
        raise TrialValidationError(
            f"{field} must be an ISO-8601 timestamp with seconds, timezone, and at most microsecond precision."
        )
    try:
        parsed = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    except ValueError as exc:
        raise TrialValidationError(f"{field} must be an ISO-8601 timestamp.") from exc
    if parsed.tzinfo is None:
        raise TrialValidationError(f"{field} must include a timezone.")
    return timestamp


def _myanmar_business_date(timestamp: str) -> str:
    parsed = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    return (
        parsed.astimezone(timezone.utc) + timedelta(hours=6, minutes=30)
    ).date().isoformat()


def _integer(value: object, field: str, *, minimum: int = 0) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not minimum <= value <= _MAX_SAFE_INTEGER:
        raise TrialValidationError(f"{field} must be a safe integer of at least {minimum}.")
    return value


def _list(value: object, field: str) -> list[Any]:
    if not isinstance(value, list):
        raise TrialValidationError(f"{field} must be an array.")
    return value


def _unique(values: Sequence[str], field: str) -> None:
    if len(set(values)) != len(values):
        raise TrialValidationError(f"{field} values must be unique.")


def _order_item_summary(lines: Sequence[Mapping[str, Any]]) -> str:
    return str(lines[0]["name"]) if len(lines) == 1 else f"{len(lines)} items"


def _reservation_lines(order: Mapping[str, Any]) -> list[dict[str, Any]]:
    if "lines" in order:
        return [
            {"sku": line["sku"], "quantity": line["quantity"]}
            for line in order["lines"]
        ]
    item_sku = order.get("itemSku")
    return [{"sku": item_sku, "quantity": order["quantity"]}] if item_sku else []


def _movement_id(action_id: str, suffix: str | None = None) -> str:
    encoded_action_id = quote(action_id, safe="-_.!~*'()")
    return f"MOV2:{encoded_action_id}{f':{suffix}' if suffix else ''}"


def _action_proof(value: object, field: str, *, with_order_id: bool = False) -> dict[str, Any]:
    proof = _object(value, field)
    required = _WEBSITE_CONVERSION_FIELDS if with_order_id else _EVIDENCE_FIELDS
    _exact_fields(proof, field, required=required)
    _text(proof["actionId"], f"{field}.actionId", maximum=160)
    _timestamp(proof["capturedAt"], f"{field}.capturedAt")
    for key in ("actor", "reason", "evidenceReference"):
        _text(proof[key], f"{field}.{key}")
    if with_order_id:
        _text(proof["orderId"], f"{field}.orderId", maximum=160)
    return proof


def _same_accountable_actor(left: str, right: str) -> bool:
    return left.strip().casefold() == right.strip().casefold()


def _validate_support_service_timeline(
    value: object,
    field: str,
    case_id: str,
    initial_service: Mapping[str, Any],
    initial_at: datetime,
    support_action_ids: list[str],
) -> tuple[dict[str, Any], datetime, bool, bool]:
    service_events = _list(value, field)
    if not 1 <= len(service_events) <= _MAX_SUPPORT_SERVICE_EVENTS_PER_CASE:
        raise TrialValidationError(
            f"{field} requires 1 to {_MAX_SUPPORT_SERVICE_EVENTS_PER_CASE} records."
        )
    effective_service = dict(initial_service)
    latest_service_at = initial_at
    acknowledged = False
    first_response_ready = False
    for reverse_index, service_candidate in enumerate(reversed(service_events)):
        service_index = len(service_events) - reverse_index - 1
        service_field = f"{field}[{service_index}]"
        service_event = _object(service_candidate, service_field)
        _exact_fields(
            service_event,
            service_field,
            required=_ORDER_SUPPORT_SERVICE_EVENT_FIELDS,
        )
        if (
            service_event["kind"] not in _SUPPORT_SERVICE_EVENT_KINDS
            or service_event["priority"] not in _SUPPORT_PRIORITIES
        ):
            raise TrialValidationError(f"{service_field} is invalid.")
        owner = _text(service_event["owner"], f"{service_field}.owner", maximum=120)
        _text(service_event["note"], f"{service_field}.note", maximum=300)
        service_proof = _action_proof(service_event["proof"], f"{service_field}.proof")
        service_at = datetime.fromisoformat(service_proof["capturedAt"].replace("Z", "+00:00"))
        service_due_at = datetime.fromisoformat(
            _timestamp(service_event["dueAt"], f"{service_field}.dueAt").replace("Z", "+00:00")
        )
        previous_due_at = datetime.fromisoformat(str(effective_service["dueAt"]).replace("Z", "+00:00"))
        previous_priority = _SUPPORT_PRIORITY_ORDER.index(str(effective_service["priority"]))
        next_priority = _SUPPORT_PRIORITY_ORDER.index(str(service_event["priority"]))
        if (
            service_proof["evidenceReference"] != f"SUPPORT-SERVICE:{case_id}"
            or service_at < latest_service_at
        ):
            raise TrialValidationError(f"{service_field} chronology is invalid.")
        if service_event["kind"] == "reassigned":
            if (
                owner == effective_service["owner"]
                or service_event["priority"] != effective_service["priority"]
                or service_event["dueAt"] != effective_service["dueAt"]
            ):
                raise TrialValidationError(f"{service_field} must change only the accountable owner.")
        elif service_event["kind"] == "escalated":
            if (
                owner != effective_service["owner"]
                or next_priority > previous_priority
                or service_due_at > previous_due_at
                or (next_priority == previous_priority and service_due_at == previous_due_at)
                or (
                    service_event["dueAt"] != effective_service["dueAt"]
                    and service_due_at <= service_at
                )
            ):
                raise TrialValidationError(
                    f"{service_field} must increase priority or bring a future due time forward "
                    "without changing owner."
                )
        elif service_event["kind"] == "acknowledged":
            if (
                acknowledged
                or first_response_ready
                or owner != effective_service["owner"]
                or service_event["priority"] != effective_service["priority"]
                or service_event["dueAt"] != effective_service["dueAt"]
            ):
                raise TrialValidationError(
                    f"{service_field} must acknowledge the current service state exactly once."
                )
            acknowledged = True
        else:
            if (
                not acknowledged
                or first_response_ready
                or owner != effective_service["owner"]
                or service_event["priority"] != effective_service["priority"]
                or service_event["dueAt"] != effective_service["dueAt"]
            ):
                raise TrialValidationError(
                    f"{service_field} must record one first response after acknowledgement "
                    "without changing service state."
                )
            first_response_ready = True
        effective_service = {
            "priority": service_event["priority"],
            "owner": owner,
            "dueAt": service_event["dueAt"],
        }
        latest_service_at = service_at
        support_action_ids.append(service_proof["actionId"])
    return effective_service, latest_service_at, acknowledged, first_response_ready


def _validate_support_resolution(
    value: object,
    field: str,
    minimum_at: datetime,
    support_action_ids: list[str],
) -> tuple[dict[str, Any], datetime]:
    resolution = _object(value, field)
    _exact_fields(resolution, field, required=_ORDER_SUPPORT_RESOLUTION_FIELDS)
    if resolution["outcome"] not in _SUPPORT_RESOLUTION_OUTCOMES:
        raise TrialValidationError(f"{field}.outcome is invalid.")
    _text(resolution["note"], f"{field}.note", maximum=300)
    resolution_proof = _action_proof(resolution["proof"], f"{field}.proof")
    resolution_at = datetime.fromisoformat(resolution_proof["capturedAt"].replace("Z", "+00:00"))
    if resolution_at < minimum_at:
        raise TrialValidationError(f"{field} predates its latest service event.")
    support_action_ids.append(resolution_proof["actionId"])
    return resolution, resolution_at


def _storefront_request(value: object, field: str) -> dict[str, Any]:
    request = _object(value, field)
    if request.get("schema") == "supermega.ecommerce.order_request.v2":
        try:
            return validate_ecommerce_order_request(request)
        except EcommerceLifecycleValidationError as exc:
            raise TrialValidationError(f"{field} is invalid: {exc}") from exc
    _exact_fields(
        request,
        field,
        required=_STOREFRONT_REQUEST_FIELDS,
        optional=_STOREFRONT_REQUEST_PROVENANCE_FIELDS,
    )
    if request["schema"] != "supermega.ecommerce.order_request.v1":
        raise TrialValidationError(f"{field}.schema is invalid.")
    if request["mode"] != "browser-local-request" or request["state"] != "pending_shop_review":
        raise TrialValidationError(f"{field} must retain its pending browser receipt boundary.")
    request_id = _text(request["id"], f"{field}.id", maximum=40)
    idempotency_key = _text(request["idempotencyKey"], f"{field}.idempotencyKey", maximum=40)
    if (
        _STOREFRONT_REQUEST_ID_PATTERN.fullmatch(request_id) is None
        or _STOREFRONT_IDEMPOTENCY_PATTERN.fullmatch(idempotency_key) is None
        or request_id[4:] != idempotency_key[4:]
    ):
        raise TrialValidationError(f"{field} request identity is invalid.")
    _timestamp(request["createdAt"], f"{field}.createdAt")
    digest = _text(request["sourcePreviewDigest"], f"{field}.sourcePreviewDigest", maximum=71)
    if _SHA256_DIGEST_PATTERN.fullmatch(digest) is None:
        raise TrialValidationError(f"{field}.sourcePreviewDigest is invalid.")
    source_revision = request.get("sourceStorefrontRevision")
    source_action_id = request.get("sourceStorefrontActionId")
    if (
        ("sourceStorefrontRevision" in request)
        != ("sourceStorefrontActionId" in request)
        or (source_revision is None) != (source_action_id is None)
    ):
        raise TrialValidationError(f"{field} storefront provenance is incomplete.")
    if source_revision is not None:
        _integer(source_revision, f"{field}.sourceStorefrontRevision", minimum=1)
        _text(source_action_id, f"{field}.sourceStorefrontActionId", maximum=160)
    _text(request["customerReference"], f"{field}.customerReference", maximum=80)
    if request["fulfilment"] not in ("pickup", "delivery") or request["currency"] != "MMK":
        raise TrialValidationError(f"{field} fulfilment or currency is invalid.")
    line = _object(request["line"], f"{field}.line")
    _exact_fields(line, f"{field}.line", required=_STOREFRONT_REQUEST_LINE_FIELDS)
    _text(line["sku"], f"{field}.line.sku", maximum=80)
    _text(line["name"], f"{field}.line.name")
    if line["variant"] is not None:
        _text(line["variant"], f"{field}.line.variant")
    quantity = _integer(line["quantity"], f"{field}.line.quantity", minimum=1)
    if quantity > 99:
        raise TrialValidationError(f"{field}.line.quantity must be at most 99.")
    unit_price = _integer(line["unitPriceMmk"], f"{field}.line.unitPriceMmk", minimum=1)
    total = _integer(request["totalMmk"], f"{field}.totalMmk", minimum=1)
    if total != quantity * unit_price:
        raise TrialValidationError(f"{field}.totalMmk must equal quantity times unit price.")
    return request


def _validate_service_schedule(value: object) -> dict[str, Any]:
    schedule = _object(value, "commerce state.serviceSchedule")
    if schedule.get("schema") == _LEGACY_SERVICE_SCHEDULE_SCHEMA_V3:
        schedule = {**deepcopy(schedule), "schema": _SERVICE_SCHEDULE_SCHEMA, "privacyPolicy": {"clientRetentionDays": None}}
    _exact_fields(
        schedule,
        "commerce state.serviceSchedule",
        required=_SERVICE_SCHEDULE_FIELDS,
    )
    if schedule.get("schema") != _SERVICE_SCHEDULE_SCHEMA:
        raise TrialValidationError(
            f"commerce state.serviceSchedule.schema must be {_SERVICE_SCHEDULE_SCHEMA}."
        )
    if schedule.get("industryPackId") not in _SERVICE_SCHEDULE_PACKS:
        raise TrialValidationError("commerce state.serviceSchedule industry pack is unsupported.")
    revision = _integer(
        schedule.get("revision"),
        "commerce state.serviceSchedule.revision",
    )
    services = _list(schedule.get("services"), "commerce state.serviceSchedule.services")
    resources = _list(schedule.get("resources"), "commerce state.serviceSchedule.resources")
    clients = _list(schedule.get("clients"), "commerce state.serviceSchedule.clients")
    bookings = _list(schedule.get("bookings"), "commerce state.serviceSchedule.bookings")
    events = _list(schedule.get("events"), "commerce state.serviceSchedule.events")
    if len(services) > 100 or len(resources) > 100 or len(clients) > 500 or len(bookings) > 500 or len(events) > 1000:
        raise TrialValidationError("commerce state.serviceSchedule exceeds managed workspace limits.")

    service_ids: list[str] = []
    for index, candidate in enumerate(services):
        field = f"commerce state.serviceSchedule.services[{index}]"
        service = _object(candidate, field)
        _exact_fields(
            service,
            field,
            required=frozenset({"id", "name", "durationMinutes", "priceMmk", "active"}),
            optional=frozenset({"nameMy"}),
        )
        service_ids.append(_text(service.get("id"), f"{field}.id", maximum=80))
        _text(service.get("name"), f"{field}.name", maximum=160)
        if service.get("nameMy") is not None:
            _text(service.get("nameMy"), f"{field}.nameMy", maximum=160)
        duration = _integer(service.get("durationMinutes"), f"{field}.durationMinutes", minimum=1)
        _integer(service.get("priceMmk"), f"{field}.priceMmk", minimum=1)
        if duration > 1440 or not isinstance(service.get("active"), bool):
            raise TrialValidationError(f"{field} duration or active state is invalid.")
    _unique(service_ids, "commerce state.serviceSchedule service ID")
    service_by_id = {service["id"]: service for service in services}

    resource_ids: list[str] = []
    for index, candidate in enumerate(resources):
        field = f"commerce state.serviceSchedule.resources[{index}]"
        resource = _object(candidate, field)
        _exact_fields(
            resource,
            field,
            required=frozenset({"id", "name", "kind", "active"}),
            optional=frozenset({"nameMy"}),
        )
        resource_ids.append(_text(resource.get("id"), f"{field}.id", maximum=80))
        _text(resource.get("name"), f"{field}.name", maximum=160)
        if resource.get("nameMy") is not None:
            _text(resource.get("nameMy"), f"{field}.nameMy", maximum=160)
        if resource.get("kind") not in {"staff", "room", "equipment"} or not isinstance(
            resource.get("active"), bool
        ):
            raise TrialValidationError(f"{field} kind or active state is invalid.")
    _unique(resource_ids, "commerce state.serviceSchedule resource ID")

    privacy_policy = _object(schedule.get("privacyPolicy"), "commerce state.serviceSchedule.privacyPolicy")
    retention_days = privacy_policy.get("clientRetentionDays")
    if retention_days is None:
        _exact_fields(privacy_policy, "commerce state.serviceSchedule.privacyPolicy", required=frozenset({"clientRetentionDays"}))
    else:
        _exact_fields(privacy_policy, "commerce state.serviceSchedule.privacyPolicy", required=frozenset({"clientRetentionDays", "updatedAt", "updatedBy"}))
        days = _integer(retention_days, "commerce state.serviceSchedule.privacyPolicy.clientRetentionDays", minimum=30)
        if days > 3650:
            raise TrialValidationError("commerce state.serviceSchedule client retention must be at most 3650 days.")
        _timestamp(privacy_policy.get("updatedAt"), "commerce state.serviceSchedule.privacyPolicy.updatedAt")
        _text(privacy_policy.get("updatedBy"), "commerce state.serviceSchedule.privacyPolicy.updatedBy", maximum=120)

    client_ids: list[str] = []
    client_contacts: list[str] = []
    clients_by_id: dict[str, dict[str, Any]] = {}
    for index, candidate in enumerate(clients):
        field = f"commerce state.serviceSchedule.clients[{index}]"
        client = _object(candidate, field)
        _exact_fields(
            client,
            field,
            required=frozenset({"id", "name", "contact", "appointmentUpdates", "createdAt", "updatedAt"}),
            optional=frozenset({"consentRecordedAt", "anonymizedAt", "anonymizedBy"}),
        )
        client_id = _text(client.get("id"), f"{field}.id", maximum=80)
        if re.fullmatch(r"client-(?:legacy-)?[0-9]{4,10}", client_id) is None:
            raise TrialValidationError(f"{field}.id is invalid.")
        client_ids.append(client_id)
        _text(client.get("name"), f"{field}.name", maximum=160)
        contact = _text(client.get("contact"), f"{field}.contact", maximum=160)
        client_contacts.append(contact.casefold())
        appointment_updates = client.get("appointmentUpdates")
        if appointment_updates not in {"allowed", "declined", "not_recorded"}:
            raise TrialValidationError(f"{field}.appointmentUpdates is invalid.")
        consent_recorded_at = client.get("consentRecordedAt")
        if appointment_updates == "allowed":
            _timestamp(consent_recorded_at, f"{field}.consentRecordedAt")
        elif consent_recorded_at is not None:
            raise TrialValidationError(f"{field}.consentRecordedAt is invalid.")
        _timestamp(client.get("createdAt"), f"{field}.createdAt")
        updated_at = _timestamp(client.get("updatedAt"), f"{field}.updatedAt")
        has_anonymized_at = "anonymizedAt" in client
        has_anonymized_by = "anonymizedBy" in client
        if has_anonymized_at != has_anonymized_by:
            raise TrialValidationError(f"{field} anonymization evidence is incomplete.")
        if has_anonymized_at:
            anonymized_at = _timestamp(client.get("anonymizedAt"), f"{field}.anonymizedAt")
            _text(client.get("anonymizedBy"), f"{field}.anonymizedBy", maximum=120)
            if (
                client.get("name") != f"Former client {client_id}"
                or client.get("contact") != f"anonymized:{client_id}"
                or appointment_updates != "not_recorded"
                or anonymized_at != updated_at
            ):
                raise TrialValidationError(f"{field} anonymization is invalid.")
        clients_by_id[client_id] = client
    _unique(client_ids, "commerce state.serviceSchedule client ID")
    _unique(client_contacts, "commerce state.serviceSchedule client contact")

    booking_ids: list[str] = []
    normalized_bookings: list[dict[str, Any]] = []
    for index, candidate in enumerate(bookings):
        field = f"commerce state.serviceSchedule.bookings[{index}]"
        booking = _object(candidate, field)
        _exact_fields(
            booking,
            field,
            required=frozenset(
                {
                    "id", "clientId", "customerName", "contact", "appointmentUpdates", "serviceId",
                    "resourceId", "startsAt", "endsAt", "status", "note", "createdAt", "updatedAt",
                }
            ),
        )
        booking_id = _text(booking.get("id"), f"{field}.id", maximum=80)
        booking_ids.append(booking_id)
        client = clients_by_id.get(booking.get("clientId"))
        if client is None:
            raise TrialValidationError(f"{field} references an unknown client.")
        _text(booking.get("customerName"), f"{field}.customerName", maximum=160)
        _text(booking.get("contact"), f"{field}.contact", maximum=160)
        if booking.get("appointmentUpdates") not in {"allowed", "declined", "not_recorded"}:
            raise TrialValidationError(f"{field}.appointmentUpdates is invalid.")
        if (
            booking.get("customerName") != client.get("name")
            or booking.get("contact") != client.get("contact")
            or booking.get("appointmentUpdates") != client.get("appointmentUpdates")
        ):
            raise TrialValidationError(f"{field} client details are stale.")
        if booking.get("serviceId") not in service_ids or booking.get("resourceId") not in resource_ids:
            raise TrialValidationError(f"{field} references an unknown service or resource.")
        starts_at = _timestamp(booking.get("startsAt"), f"{field}.startsAt")
        ends_at = _timestamp(booking.get("endsAt"), f"{field}.endsAt")
        if datetime.fromisoformat(ends_at.replace("Z", "+00:00")) <= datetime.fromisoformat(
            starts_at.replace("Z", "+00:00")
        ):
            raise TrialValidationError(f"{field} must end after it starts.")
        expected_end = datetime.fromisoformat(starts_at.replace("Z", "+00:00")) + timedelta(
            minutes=service_by_id[booking["serviceId"]]["durationMinutes"]
        )
        if datetime.fromisoformat(ends_at.replace("Z", "+00:00")) != expected_end:
            raise TrialValidationError(f"{field} duration must match its service.")
        if booking.get("status") not in _SERVICE_SCHEDULE_BOOKING_STATUSES:
            raise TrialValidationError(f"{field}.status is invalid.")
        _blankable_text(booking.get("note"), f"{field}.note", maximum=300)
        _timestamp(booking.get("createdAt"), f"{field}.createdAt")
        _timestamp(booking.get("updatedAt"), f"{field}.updatedAt")
        normalized_bookings.append(booking)
    _unique(booking_ids, "commerce state.serviceSchedule booking ID")
    blocking = [booking for booking in normalized_bookings if booking["status"] != "cancelled"]
    for left, first in enumerate(blocking):
        for second in blocking[left + 1 :]:
            if (
                first["resourceId"] == second["resourceId"]
                and datetime.fromisoformat(first["startsAt"].replace("Z", "+00:00"))
                < datetime.fromisoformat(second["endsAt"].replace("Z", "+00:00"))
                and datetime.fromisoformat(second["startsAt"].replace("Z", "+00:00"))
                < datetime.fromisoformat(first["endsAt"].replace("Z", "+00:00"))
            ):
                raise TrialValidationError("commerce state.serviceSchedule contains overlapping bookings.")

    if len(events) != revision:
        raise TrialValidationError("commerce state.serviceSchedule evidence is incomplete.")
    for index, candidate in enumerate(events):
        field = f"commerce state.serviceSchedule.events[{index}]"
        event = _object(candidate, field)
        _exact_fields(
            event,
            field,
            required=frozenset({"revision", "type", "subjectId", "actor", "reason", "happenedAt"}),
        )
        if event.get("revision") != index + 1 or event.get("type") not in _SERVICE_SCHEDULE_EVENT_TYPES:
            raise TrialValidationError(f"{field} revision or type is invalid.")
        subject_id = _text(event.get("subjectId"), f"{field}.subjectId", maximum=80)
        if (
            (event["type"] == "service_registered" and subject_id not in service_ids)
            or (event["type"] == "resource_registered" and subject_id not in resource_ids)
            or (event["type"].startswith("booking_") and subject_id not in booking_ids)
            or (
                event["type"] == "package_redeemed"
                and not any(
                    booking["id"] == subject_id and booking["status"] == "completed"
                    for booking in bookings
                )
            )
            or (event["type"] == "client_anonymized" and subject_id not in client_ids)
            or (event["type"] == "client_exported" and re.fullmatch(r"sha256:[a-f0-9]{64}", subject_id) is None)
            or (event["type"] == "client_retention_set" and re.fullmatch(r"retention-(?:[3-9][0-9]|[1-9][0-9]{2,3})-days", subject_id) is None)
        ):
            raise TrialValidationError(f"{field} references an unknown subject.")
        _text(event.get("actor"), f"{field}.actor", maximum=120)
        _text(event.get("reason"), f"{field}.reason", maximum=240)
        _timestamp(event.get("happenedAt"), f"{field}.happenedAt")
    return schedule


def validate_commerce_state(value: object) -> dict[str, Any]:
    """Validate the complete managed Commerce snapshot without repairing it."""

    state = _object(value, "commerce state")
    _exact_fields(
        state,
        "commerce state",
        required=_STATE_FIELDS,
        optional=frozenset(
            {
                "websiteIntakes",
                "storefrontRequests",
                "storefrontConfiguration",
                "purchaseBudgetEnvelopes",
                "supplierSourcingDecisions",
                "purchaseRequisitions",
                "purchaseOrders",
                "catalogBaselines",
                "catalogChanges",
                "taxConfigurations",
                "accountMappingConfigurations",
                "customerCreditPolicies",
                "promotionPolicies",
                "shippingPolicies",
                "paymentPolicies",
                "inventoryFoundation",
                "serviceSchedule",
            }
        ),
    )
    if state.get("schema") != COMMERCE_SCHEMA:
        raise TrialValidationError(f"commerce state schema must be {COMMERCE_SCHEMA}.")

    items = _list(state["items"], "commerce state.items")
    orders = _list(state["orders"], "commerce state.orders")
    movements = _list(state["movements"], "commerce state.movements")
    closes = _list(state["closes"], "commerce state.closes")
    website_intakes = _list(state.get("websiteIntakes", []), "commerce state.websiteIntakes")
    storefront_requests = _list(
        state.get("storefrontRequests", []),
        "commerce state.storefrontRequests",
    )
    purchase_orders = _list(
        state.get("purchaseOrders", []),
        "commerce state.purchaseOrders",
    )
    purchase_budget_envelopes = _list(
        state.get("purchaseBudgetEnvelopes", []),
        "commerce state.purchaseBudgetEnvelopes",
    )
    supplier_sourcing_decisions = _list(
        state.get("supplierSourcingDecisions", []),
        "commerce state.supplierSourcingDecisions",
    )
    purchase_requisitions = _list(
        state.get("purchaseRequisitions", []),
        "commerce state.purchaseRequisitions",
    )
    catalog_baselines = _list(
        state.get("catalogBaselines", []),
        "commerce state.catalogBaselines",
    )
    catalog_changes = _list(
        state.get("catalogChanges", []),
        "commerce state.catalogChanges",
    )
    tax_configurations = _list(
        state.get("taxConfigurations", []),
        "commerce state.taxConfigurations",
    )
    account_mapping_configurations = _list(
        state.get("accountMappingConfigurations", []),
        "commerce state.accountMappingConfigurations",
    )
    customer_credit_policies = _list(
        state.get("customerCreditPolicies", []),
        "commerce state.customerCreditPolicies",
    )
    promotion_policies = _list(
        state.get("promotionPolicies", []),
        "commerce state.promotionPolicies",
    )
    shipping_policies = _list(
        state.get("shippingPolicies", []),
        "commerce state.shippingPolicies",
    )
    payment_policies = _list(
        state.get("paymentPolicies", []),
        "commerce state.paymentPolicies",
    )
    if "serviceSchedule" in state:
        _validate_service_schedule(state["serviceSchedule"])
    if "storefrontConfiguration" in state and state["storefrontConfiguration"] is None:
        raise TrialValidationError(
            "commerce state.storefrontConfiguration must be an object when present."
        )
    storefront_configuration = state.get("storefrontConfiguration")
    if len(storefront_requests) > _MAX_STOREFRONT_REQUESTS:
        raise TrialValidationError(
            f"commerce state.storefrontRequests cannot exceed {_MAX_STOREFRONT_REQUESTS}."
        )
    if len(purchase_orders) > _MAX_PURCHASE_ORDERS:
        raise TrialValidationError(
            f"commerce state.purchaseOrders cannot exceed {_MAX_PURCHASE_ORDERS}."
        )
    if len(catalog_baselines) > _MAX_CATALOG_BASELINES:
        raise TrialValidationError(
            f"commerce state.catalogBaselines cannot exceed {_MAX_CATALOG_BASELINES}."
        )
    if len(catalog_changes) > _MAX_CATALOG_CHANGES:
        raise TrialValidationError(
            f"commerce state.catalogChanges cannot exceed {_MAX_CATALOG_CHANGES}."
        )
    if len(purchase_budget_envelopes) > _MAX_PURCHASE_BUDGET_ENVELOPES:
        raise TrialValidationError(
            "commerce state.purchaseBudgetEnvelopes cannot exceed "
            f"{_MAX_PURCHASE_BUDGET_ENVELOPES}."
        )
    if len(supplier_sourcing_decisions) > _MAX_SUPPLIER_SOURCING_DECISIONS:
        raise TrialValidationError(
            "commerce state.supplierSourcingDecisions cannot exceed "
            f"{_MAX_SUPPLIER_SOURCING_DECISIONS}."
        )
    if len(purchase_requisitions) > _MAX_PURCHASE_REQUISITIONS:
        raise TrialValidationError(
            f"commerce state.purchaseRequisitions cannot exceed {_MAX_PURCHASE_REQUISITIONS}."
        )
    if len(tax_configurations) > _MAX_TAX_CONFIGURATIONS:
        raise TrialValidationError(
            f"commerce state.taxConfigurations cannot exceed {_MAX_TAX_CONFIGURATIONS}."
        )
    if len(account_mapping_configurations) > _MAX_ACCOUNT_MAPPING_CONFIGURATIONS:
        raise TrialValidationError(
            "commerce state.accountMappingConfigurations cannot exceed "
            f"{_MAX_ACCOUNT_MAPPING_CONFIGURATIONS}."
        )
    if len(customer_credit_policies) > _MAX_CUSTOMER_CREDIT_POLICIES:
        raise TrialValidationError(
            "commerce state.customerCreditPolicies cannot exceed "
            f"{_MAX_CUSTOMER_CREDIT_POLICIES}."
        )
    if len(promotion_policies) > _MAX_PROMOTION_POLICIES:
        raise TrialValidationError(
            "commerce state.promotionPolicies cannot exceed "
            f"{_MAX_PROMOTION_POLICIES}."
        )
    if len(shipping_policies) > _MAX_SHIPPING_POLICIES:
        raise TrialValidationError(
            "commerce state.shippingPolicies cannot exceed "
            f"{_MAX_SHIPPING_POLICIES}."
        )
    if len(payment_policies) > _MAX_PAYMENT_POLICIES:
        raise TrialValidationError(
            "commerce state.paymentPolicies cannot exceed "
            f"{_MAX_PAYMENT_POLICIES}."
        )

    item_skus: list[str] = []
    item_by_sku: dict[str, dict[str, Any]] = {}
    for index, candidate in enumerate(items):
        item = _object(candidate, f"items[{index}]")
        _exact_fields(item, f"items[{index}]", required=_ITEM_FIELDS - {"variant"}, optional=frozenset({"variant"}))
        sku = _text(item["sku"], f"items[{index}].sku", maximum=80)
        _text(item["name"], f"items[{index}].name")
        if "variant" in item:
            _text(item["variant"], f"items[{index}].variant")
        _integer(item["onHand"], f"items[{index}].onHand")
        _integer(item["reorderAt"], f"items[{index}].reorderAt")
        _integer(item["price"], f"items[{index}].price", minimum=1)
        item_skus.append(sku)
        item_by_sku[sku] = item
    _unique(item_skus, "Item SKU")
    if "inventoryFoundation" in state:
        try:
            validate_shop_inventory_state(state["inventoryFoundation"], item_skus)
        except ShopInventoryValidationError as exc:
            raise TrialValidationError(
                f"commerce state.inventoryFoundation is invalid: {exc}"
            ) from exc

    catalog_baseline_skus: list[str] = []
    catalog_baseline_action_ids: list[str] = []
    catalog_baseline_by_sku: dict[str, dict[str, Any]] = {}
    catalog_baseline_proof_by_action: dict[str, dict[str, str]] = {}
    for index, candidate in enumerate(catalog_baselines):
        field = f"catalogBaselines[{index}]"
        baseline = _object(candidate, field)
        _exact_fields(baseline, field, required=_CATALOG_BASELINE_FIELDS)
        sku = _text(baseline["sku"], f"{field}.sku", maximum=80)
        if sku not in item_by_sku:
            raise TrialValidationError(f"{field}.sku is unknown.")
        _integer(baseline["price"], f"{field}.price", minimum=1)
        _integer(baseline["reorderAt"], f"{field}.reorderAt")
        proof = _action_proof(baseline["proof"], f"{field}.proof")
        anchor_digest = _text(
            baseline["anchorDigest"],
            f"{field}.anchorDigest",
            maximum=71,
        )
        if (
            _SHA256_DIGEST_PATTERN.fullmatch(anchor_digest) is None
            or anchor_digest != commerce_catalog_baseline_digest(baseline)
        ):
            raise TrialValidationError(f"{field}.anchorDigest is invalid.")
        prior_proof = catalog_baseline_proof_by_action.get(proof["actionId"])
        if prior_proof is not None and prior_proof != proof:
            raise TrialValidationError(
                f"{field}.proof conflicts with its shared catalog command."
            )
        catalog_baseline_skus.append(sku)
        catalog_baseline_action_ids.append(proof["actionId"])
        catalog_baseline_by_sku[sku] = baseline
        catalog_baseline_proof_by_action[proof["actionId"]] = proof
    _unique(catalog_baseline_skus, "Catalog baseline SKU")

    catalog_change_action_ids: list[str] = []
    newest_change_by_sku: dict[str, dict[str, Any]] = {}
    for index, candidate in enumerate(catalog_changes):
        field = f"catalogChanges[{index}]"
        change = _object(candidate, field)
        _exact_fields(change, field, required=_CATALOG_CHANGE_FIELDS)
        sku = _text(change["sku"], f"{field}.sku", maximum=80)
        item = item_by_sku.get(sku)
        if item is None:
            raise TrialValidationError(f"{field}.sku is unknown.")
        previous_price = _integer(
            change["previousPrice"],
            f"{field}.previousPrice",
            minimum=1,
        )
        next_price = _integer(
            change["nextPrice"],
            f"{field}.nextPrice",
            minimum=1,
        )
        previous_reorder_at = _integer(
            change["previousReorderAt"],
            f"{field}.previousReorderAt",
        )
        next_reorder_at = _integer(
            change["nextReorderAt"],
            f"{field}.nextReorderAt",
        )
        if (
            previous_price == next_price
            and previous_reorder_at == next_reorder_at
        ):
            raise TrialValidationError(
                f"{field} must change price or reorder point."
            )
        proof = _action_proof(change["proof"], f"{field}.proof")
        newer_change = newest_change_by_sku.get(sku)
        if newer_change is None:
            if (
                item["price"] != next_price
                or item["reorderAt"] != next_reorder_at
            ):
                raise TrialValidationError(
                    f"{field} newest values must match the current catalog item."
                )
        else:
            if (
                newer_change["previousPrice"] != next_price
                or newer_change["previousReorderAt"] != next_reorder_at
            ):
                raise TrialValidationError(
                    f"{field} does not continue the newest-first catalog change chain."
                )
            newer_captured_at = datetime.fromisoformat(
                str(newer_change["proof"]["capturedAt"]).replace("Z", "+00:00")
            )
            captured_at = datetime.fromisoformat(
                proof["capturedAt"].replace("Z", "+00:00")
            )
            if captured_at > newer_captured_at:
                raise TrialValidationError(
                    f"{field} catalog changes must be newest first per SKU."
                )
        newest_change_by_sku[sku] = change
        catalog_change_action_ids.append(proof["actionId"])
    _unique(catalog_change_action_ids, "Catalog change action ID")
    for sku, oldest_change in newest_change_by_sku.items():
        baseline = catalog_baseline_by_sku.get(sku)
        if baseline is None:
            raise TrialValidationError(
                f"Catalog change history for {sku} has no anchored baseline."
            )
        if (
            baseline["price"] != oldest_change["previousPrice"]
            or baseline["reorderAt"] != oldest_change["previousReorderAt"]
            or datetime.fromisoformat(
                str(baseline["proof"]["capturedAt"]).replace("Z", "+00:00")
            )
            > datetime.fromisoformat(
                str(oldest_change["proof"]["capturedAt"]).replace("Z", "+00:00")
            )
        ):
            raise TrialValidationError(
                f"Catalog change history for {sku} does not start from its anchored baseline."
            )
    for sku, baseline in catalog_baseline_by_sku.items():
        if sku in newest_change_by_sku:
            continue
        item = item_by_sku[sku]
        if item["price"] != baseline["price"] or item["reorderAt"] != baseline["reorderAt"]:
            raise TrialValidationError(
                f"Catalog baseline for {sku} does not match the unchanged catalog item."
            )

    tax_configuration_action_ids: list[str] = []
    newer_tax_configuration: dict[str, Any] | None = None
    for index, candidate in enumerate(tax_configurations):
        field = f"taxConfigurations[{index}]"
        configuration = _object(candidate, field)
        _exact_fields(
            configuration,
            field,
            required=_TAX_CONFIGURATION_FIELDS,
            optional=_TAX_CONFIGURATION_SCHEDULE_FIELDS,
        )
        revision = _integer(configuration["revision"], f"{field}.revision", minimum=1)
        if revision != len(tax_configurations) - index:
            raise TrialValidationError(
                f"{field}.revision breaks the newest-first sequence."
            )
        code = _text(configuration["code"], f"{field}.code", maximum=12)
        if _TAX_CODE_PATTERN.fullmatch(code) is None:
            raise TrialValidationError(f"{field}.code is invalid.")
        _text(configuration["label"], f"{field}.label", maximum=80)
        rate_basis_points = _integer(
            configuration["rateBasisPoints"],
            f"{field}.rateBasisPoints",
        )
        if rate_basis_points > 10_000:
            raise TrialValidationError(
                f"{field}.rateBasisPoints must be at most 10000."
            )
        if configuration["mode"] not in {"exclusive", "inclusive"}:
            raise TrialValidationError(f"{field}.mode is invalid.")
        proof = _action_proof(configuration["proof"], f"{field}.proof")
        schedule_fields = _TAX_CONFIGURATION_SCHEDULE_FIELDS.intersection(configuration)
        if schedule_fields and schedule_fields != _TAX_CONFIGURATION_SCHEDULE_FIELDS:
            raise TrialValidationError(
                f"{field} must include jurisdictionCode and effectiveFrom together."
            )
        effective_at = datetime.fromisoformat(
            proof["capturedAt"].replace("Z", "+00:00")
        )
        if schedule_fields:
            jurisdiction_code = _text(
                configuration["jurisdictionCode"],
                f"{field}.jurisdictionCode",
                maximum=16,
            )
            if _TAX_JURISDICTION_CODE_PATTERN.fullmatch(jurisdiction_code) is None:
                raise TrialValidationError(f"{field}.jurisdictionCode is invalid.")
            effective_at = datetime.fromisoformat(
                _timestamp(
                    configuration["effectiveFrom"],
                    f"{field}.effectiveFrom",
                ).replace("Z", "+00:00")
            )
            if effective_at < datetime.fromisoformat(
                proof["capturedAt"].replace("Z", "+00:00")
            ):
                raise TrialValidationError(
                    f"{field}.effectiveFrom must be at or after its review proof."
                )
        if newer_tax_configuration is not None:
            newer_captured_at = datetime.fromisoformat(
                str(newer_tax_configuration["proof"]["capturedAt"]).replace("Z", "+00:00")
            )
            captured_at = datetime.fromisoformat(
                proof["capturedAt"].replace("Z", "+00:00")
            )
            if captured_at > newer_captured_at:
                raise TrialValidationError(
                    f"{field} tax configurations must be newest first."
                )
            newer_effective_at = datetime.fromisoformat(
                str(
                    newer_tax_configuration.get(
                        "effectiveFrom",
                        newer_tax_configuration["proof"]["capturedAt"],
                    )
                ).replace("Z", "+00:00")
            )
            if effective_at > newer_effective_at:
                raise TrialValidationError(
                    f"{field} tax configurations must be newest first by effective time."
                )
        newer_tax_configuration = configuration
        tax_configuration_action_ids.append(proof["actionId"])

    account_mapping_configuration_action_ids: list[str] = []
    newer_account_mapping_configuration: dict[str, Any] | None = None
    for index, candidate in enumerate(account_mapping_configurations):
        field = f"accountMappingConfigurations[{index}]"
        configuration = _object(candidate, field)
        _exact_fields(
            configuration,
            field,
            required=_ACCOUNT_MAPPING_CONFIGURATION_FIELDS,
        )
        revision = _integer(configuration["revision"], f"{field}.revision", minimum=1)
        if revision != len(account_mapping_configurations) - index:
            raise TrialValidationError(
                f"{field}.revision breaks the newest-first sequence."
            )
        mappings = _list(configuration["mappings"], f"{field}.mappings")
        if len(mappings) not in {len(_LEGACY_ACCOUNT_ROLES), len(_ACCOUNT_ROLES)}:
            raise TrialValidationError(
                f"{field}.mappings must cover every account role exactly once."
            )
        expected_account_roles = (
            _LEGACY_ACCOUNT_ROLES
            if len(mappings) == len(_LEGACY_ACCOUNT_ROLES)
            else _ACCOUNT_ROLES
        )
        for mapping_index, account_role in enumerate(expected_account_roles):
            mapping_field = f"{field}.mappings[{mapping_index}]"
            mapping = _object(mappings[mapping_index], mapping_field)
            _exact_fields(mapping, mapping_field, required=_ACCOUNT_MAPPING_FIELDS)
            if mapping["accountRole"] != account_role:
                raise TrialValidationError(
                    f"{mapping_field} must use the canonical account role order."
                )
            code = _text(
                mapping["externalAccountCode"],
                f"{mapping_field}.externalAccountCode",
                maximum=40,
            )
            if _EXTERNAL_ACCOUNT_CODE_PATTERN.fullmatch(code) is None:
                raise TrialValidationError(
                    f"{mapping_field}.externalAccountCode is invalid."
                )
        proof = _action_proof(configuration["proof"], f"{field}.proof")
        if newer_account_mapping_configuration is not None:
            newer_captured_at = datetime.fromisoformat(
                str(newer_account_mapping_configuration["proof"]["capturedAt"]).replace("Z", "+00:00")
            )
            captured_at = datetime.fromisoformat(proof["capturedAt"].replace("Z", "+00:00"))
            if captured_at > newer_captured_at:
                raise TrialValidationError(
                    f"{field} account mapping configurations must be newest first."
                )
        newer_account_mapping_configuration = configuration
        account_mapping_configuration_action_ids.append(proof["actionId"])

    customer_credit_policy_action_ids: list[str] = []
    newer_customer_credit_policy: dict[str, Any] | None = None
    for index, candidate in enumerate(customer_credit_policies):
        field = f"customerCreditPolicies[{index}]"
        policy = _object(candidate, field)
        _exact_fields(policy, field, required=_CUSTOMER_CREDIT_POLICY_FIELDS)
        revision = _integer(policy["revision"], f"{field}.revision", minimum=1)
        if revision != len(customer_credit_policies) - index:
            raise TrialValidationError(
                f"{field}.revision breaks the newest-first sequence."
            )
        _text(policy["customer"], f"{field}.customer", maximum=120)
        _integer(policy["creditLimitMmk"], f"{field}.creditLimitMmk")
        if policy["maxPaymentTermsDays"] not in _CUSTOMER_CREDIT_TERMS:
            raise TrialValidationError(f"{field}.maxPaymentTermsDays is invalid.")
        if policy["status"] not in {"active", "hold"}:
            raise TrialValidationError(f"{field}.status is invalid.")
        proof = _action_proof(policy["proof"], f"{field}.proof")
        if newer_customer_credit_policy is not None:
            newer_captured_at = datetime.fromisoformat(
                str(newer_customer_credit_policy["proof"]["capturedAt"]).replace("Z", "+00:00")
            )
            captured_at = datetime.fromisoformat(proof["capturedAt"].replace("Z", "+00:00"))
            if captured_at > newer_captured_at:
                raise TrialValidationError(
                    f"{field} customer credit policies must be newest first."
                )
        newer_customer_credit_policy = policy
        customer_credit_policy_action_ids.append(proof["actionId"])

    promotion_policy_action_ids: list[str] = []
    validated_promotion_policies: list[dict[str, Any]] = []
    newer_promotion_policy: dict[str, Any] | None = None
    for index, candidate in enumerate(promotion_policies):
        field = f"promotionPolicies[{index}]"
        try:
            policy = validate_ecommerce_promotion_policy(candidate, field)
        except EcommerceLifecycleValidationError as exc:
            raise TrialValidationError(
                f"commerce state.{field} is invalid: {exc}"
            ) from exc
        if policy["revision"] != len(promotion_policies) - index:
            raise TrialValidationError(
                f"{field}.revision breaks the newest-first sequence."
            )
        if newer_promotion_policy is not None and datetime.fromisoformat(
            str(newer_promotion_policy["proof"]["capturedAt"]).replace("Z", "+00:00")
        ) < datetime.fromisoformat(
            str(policy["proof"]["capturedAt"]).replace("Z", "+00:00")
        ):
            raise TrialValidationError(
                f"{field} promotion policies must be newest first."
            )
        newer_promotion_policy = policy
        validated_promotion_policies.append(policy)
        promotion_policy_action_ids.append(policy["proof"]["actionId"])

    shipping_policy_action_ids: list[str] = []
    validated_shipping_policies: list[dict[str, Any]] = []
    newer_shipping_policy: dict[str, Any] | None = None
    for index, candidate in enumerate(shipping_policies):
        field = f"shippingPolicies[{index}]"
        try:
            policy = validate_ecommerce_shipping_policy(candidate, field)
        except EcommerceLifecycleValidationError as exc:
            raise TrialValidationError(f"commerce state.{field} is invalid: {exc}") from exc
        if policy["revision"] != len(shipping_policies) - index:
            raise TrialValidationError(f"{field}.revision breaks the newest-first sequence.")
        if newer_shipping_policy is not None and datetime.fromisoformat(
            str(newer_shipping_policy["proof"]["capturedAt"]).replace("Z", "+00:00")
        ) < datetime.fromisoformat(str(policy["proof"]["capturedAt"]).replace("Z", "+00:00")):
            raise TrialValidationError(f"{field} shipping policies must be newest first.")
        newer_shipping_policy = policy
        validated_shipping_policies.append(policy)
        shipping_policy_action_ids.append(policy["proof"]["actionId"])

    payment_policy_action_ids: list[str] = []
    validated_payment_policies: list[dict[str, Any]] = []
    newer_payment_policy: dict[str, Any] | None = None
    for index, candidate in enumerate(payment_policies):
        field = f"paymentPolicies[{index}]"
        try:
            policy = validate_ecommerce_payment_policy(candidate, field)
        except EcommerceLifecycleValidationError as exc:
            raise TrialValidationError(f"commerce state.{field} is invalid: {exc}") from exc
        if policy["revision"] != len(payment_policies) - index:
            raise TrialValidationError(f"{field}.revision breaks the newest-first sequence.")
        if newer_payment_policy is not None and datetime.fromisoformat(
            str(newer_payment_policy["proof"]["capturedAt"]).replace("Z", "+00:00")
        ) < datetime.fromisoformat(str(policy["proof"]["capturedAt"]).replace("Z", "+00:00")):
            raise TrialValidationError(f"{field} payment policies must be newest first.")
        newer_payment_policy = policy
        validated_payment_policies.append(policy)
        payment_policy_action_ids.append(policy["proof"]["actionId"])

    purchase_budget_envelope_ids: list[str] = []
    purchase_budget_action_ids: list[str] = []
    purchase_budget_by_id: dict[str, dict[str, Any]] = {}
    newer_purchase_budget: dict[str, Any] | None = None
    for index, candidate in enumerate(purchase_budget_envelopes):
        field = f"purchaseBudgetEnvelopes[{index}]"
        envelope = _object(candidate, field)
        _exact_fields(envelope, field, required=_PURCHASE_BUDGET_ENVELOPE_FIELDS)
        envelope_id = _text(envelope["id"], f"{field}.id", maximum=80)
        if _PURCHASE_BUDGET_ENVELOPE_ID_PATTERN.fullmatch(envelope_id) is None:
            raise TrialValidationError(f"{field}.id is invalid.")
        created_at = _timestamp(envelope["createdAt"], f"{field}.createdAt")
        budget_code = _text(envelope["budgetCode"], f"{field}.budgetCode", maximum=40)
        if _PURCHASE_BUDGET_CODE_PATTERN.fullmatch(budget_code) is None:
            raise TrialValidationError(f"{field}.budgetCode is invalid.")
        _text(envelope["label"], f"{field}.label", maximum=120)
        period_start = _timestamp(envelope["periodStart"], f"{field}.periodStart")
        period_end = _timestamp(envelope["periodEnd"], f"{field}.periodEnd")
        created_time = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
        start_time = datetime.fromisoformat(period_start.replace("Z", "+00:00"))
        end_time = datetime.fromisoformat(period_end.replace("Z", "+00:00"))
        if start_time > created_time or end_time <= created_time:
            raise TrialValidationError(f"{field} period must contain its approval time.")
        ceiling = _integer(envelope["ceilingMmk"], f"{field}.ceilingMmk", minimum=1)
        per_requisition = _integer(
            envelope["perRequisitionLimitMmk"],
            f"{field}.perRequisitionLimitMmk",
            minimum=1,
        )
        if per_requisition > ceiling:
            raise TrialValidationError(f"{field} per-requisition limit exceeds its ceiling.")
        approval = _action_proof(envelope["approval"], f"{field}.approval")
        if approval["capturedAt"] != created_at:
            raise TrialValidationError(f"{field}.approval must be captured at creation.")
        if newer_purchase_budget is not None and datetime.fromisoformat(
            str(newer_purchase_budget["createdAt"]).replace("Z", "+00:00")
        ) < created_time:
            raise TrialValidationError("purchase budget envelopes must be newest first.")
        for existing in purchase_budget_by_id.values():
            if existing["budgetCode"] != budget_code:
                continue
            existing_start = datetime.fromisoformat(str(existing["periodStart"]).replace("Z", "+00:00"))
            existing_end = datetime.fromisoformat(str(existing["periodEnd"]).replace("Z", "+00:00"))
            if start_time < existing_end and existing_start < end_time:
                raise TrialValidationError(f"{field} overlaps another {budget_code} envelope.")
        purchase_budget_envelope_ids.append(envelope_id)
        purchase_budget_action_ids.append(approval["actionId"])
        purchase_budget_by_id[envelope_id] = envelope
        newer_purchase_budget = envelope
    _unique(purchase_budget_envelope_ids, "Purchase budget envelope ID")

    supplier_sourcing_ids: list[str] = []
    supplier_sourcing_action_ids: list[str] = []
    supplier_quote_sources: list[str] = []
    supplier_sourcing_by_id: dict[str, dict[str, Any]] = {}
    newer_supplier_sourcing: dict[str, Any] | None = None
    inventory_vendor_ids: dict[str, str] = {}
    inventory_supplier_policies: list[dict[str, Any]] = []
    if "inventoryFoundation" in state:
        partners = shop_inventory_business_partners(state["inventoryFoundation"], item_skus)
        inventory_vendor_ids = {str(vendor["name"]): str(vendor["id"]) for vendor in partners["vendors"]}
        inventory_supplier_policies = shop_inventory_supplier_policies(state["inventoryFoundation"], item_skus)
    for index, candidate in enumerate(supplier_sourcing_decisions):
        field = f"supplierSourcingDecisions[{index}]"
        decision = _object(candidate, field)
        _exact_fields(decision, field, required=_SUPPLIER_SOURCING_DECISION_FIELDS)
        decision_id = _text(decision["id"], f"{field}.id", maximum=80)
        if _SUPPLIER_SOURCING_DECISION_ID_PATTERN.fullmatch(decision_id) is None:
            raise TrialValidationError(f"{field}.id is invalid.")
        created_at = _timestamp(decision["createdAt"], f"{field}.createdAt")
        sku = _text(decision["sku"], f"{field}.sku", maximum=80)
        if sku not in item_by_sku:
            raise TrialValidationError(f"{field}.sku is unknown.")
        _integer(decision["quantity"], f"{field}.quantity", minimum=1)
        cost_tolerance = _integer(
            decision["unitCostToleranceBasisPoints"],
            f"{field}.unitCostToleranceBasisPoints",
            minimum=0,
        )
        delivery_tolerance = _integer(
            decision["deliveryToleranceDays"],
            f"{field}.deliveryToleranceDays",
            minimum=0,
        )
        if cost_tolerance > 2_000 or delivery_tolerance > 30:
            raise TrialValidationError(f"{field} tolerance is invalid.")
        quotes = _list(decision["quotes"], f"{field}.quotes")
        if not 1 <= len(quotes) <= 5:
            raise TrialValidationError(f"{field}.quotes must contain 1 to 5 quotes.")
        quote_references: list[str] = []
        quote_suppliers: list[str] = []
        for quote_index, quote_candidate in enumerate(quotes):
            quote_field = f"{field}.quotes[{quote_index}]"
            quote_record = _object(quote_candidate, quote_field)
            _exact_fields(quote_record, quote_field, required=_SUPPLIER_QUOTE_FIELDS)
            supplier = _text(quote_record["supplier"], f"{quote_field}.supplier", maximum=120)
            quote_reference = _text(quote_record["quoteReference"], f"{quote_field}.quoteReference", maximum=80)
            approval_reference = _text(
                quote_record["vendorApprovalReference"],
                f"{quote_field}.vendorApprovalReference",
                maximum=120,
            )
            unit_cost = _integer(quote_record["unitCostMmk"], f"{quote_field}.unitCostMmk", minimum=1)
            if unit_cost * (10_000 + cost_tolerance) // 10_000 > _MAX_SAFE_INTEGER:
                raise TrialValidationError(f"{quote_field}.unitCostMmk exceeds the supported tolerance range.")
            delivery_at = _timestamp(quote_record["deliveryAt"], f"{quote_field}.deliveryAt")
            valid_until = _timestamp(quote_record["validUntil"], f"{quote_field}.validUntil")
            if (
                datetime.fromisoformat(delivery_at.replace("Z", "+00:00"))
                <= datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                or datetime.fromisoformat(valid_until.replace("Z", "+00:00"))
                < datetime.fromisoformat(created_at.replace("Z", "+00:00"))
            ):
                raise TrialValidationError(f"{quote_field} dates are invalid.")
            if inventory_vendor_ids:
                vendor_id = inventory_vendor_ids.get(supplier)
                policy = next(
                    (
                        policy for policy in inventory_supplier_policies
                        if str(policy["vendorId"]) == vendor_id
                        and policy["sku"] == sku
                        and policy["status"] == "active"
                    ),
                    None,
                )
                if policy is None or str(policy["commandId"]) != approval_reference:
                    raise TrialValidationError(f"{quote_field} is not bound to an active approved-vendor policy.")
            quote_references.append(quote_reference)
            quote_suppliers.append(supplier)
            supplier_quote_sources.append(f"{supplier}\0{quote_reference}")
        _unique(quote_references, f"{field} quote reference")
        _unique(quote_suppliers, f"{field} supplier")
        selected_quote_reference = _text(
            decision["selectedQuoteReference"],
            f"{field}.selectedQuoteReference",
            maximum=80,
        )
        if selected_quote_reference not in quote_references:
            raise TrialValidationError(f"{field}.selectedQuoteReference is unknown.")
        approval = _action_proof(decision["approval"], f"{field}.approval")
        if approval["capturedAt"] != created_at:
            raise TrialValidationError(f"{field}.approval must be captured at creation.")
        if newer_supplier_sourcing is not None and datetime.fromisoformat(
            str(newer_supplier_sourcing["createdAt"]).replace("Z", "+00:00")
        ) < datetime.fromisoformat(created_at.replace("Z", "+00:00")):
            raise TrialValidationError("supplier sourcing decisions must be newest first.")
        supplier_sourcing_ids.append(decision_id)
        supplier_sourcing_action_ids.append(approval["actionId"])
        supplier_sourcing_by_id[decision_id] = decision
        newer_supplier_sourcing = decision
    _unique(supplier_sourcing_ids, "Supplier sourcing decision ID")
    _unique(supplier_quote_sources, "Supplier quote source")

    purchase_requisition_ids: list[str] = []
    purchase_requisition_action_ids: list[str] = []
    purchase_requisition_by_id: dict[str, dict[str, Any]] = {}
    for index, candidate in enumerate(purchase_requisitions):
        field = f"purchaseRequisitions[{index}]"
        requisition = _object(candidate, field)
        _exact_fields(
            requisition,
            field,
            required=_PURCHASE_REQUISITION_REQUIRED_FIELDS,
            optional=_PURCHASE_REQUISITION_OPTIONAL_FIELDS,
        )
        requisition_id = _text(requisition["id"], f"{field}.id", maximum=80)
        if _PURCHASE_REQUISITION_ID_PATTERN.fullmatch(requisition_id) is None:
            raise TrialValidationError(f"{field}.id is invalid.")
        created_at = _timestamp(requisition["createdAt"], f"{field}.createdAt")
        expected_at = _timestamp(requisition["expectedAt"], f"{field}.expectedAt")
        if datetime.fromisoformat(expected_at.replace("Z", "+00:00")) <= datetime.fromisoformat(created_at.replace("Z", "+00:00")):
            raise TrialValidationError(f"{field}.expectedAt must be later than approval.")
        _text(requisition["supplier"], f"{field}.supplier", maximum=120)
        sku = _text(requisition["sku"], f"{field}.sku", maximum=80)
        if sku not in item_by_sku:
            raise TrialValidationError(f"{field}.sku is unknown.")
        quantity = _integer(requisition["quantityRequested"], f"{field}.quantityRequested", minimum=1)
        unit_cost = _integer(requisition["unitCostMmk"], f"{field}.unitCostMmk", minimum=1)
        total = _integer(requisition["totalMmk"], f"{field}.totalMmk", minimum=1)
        if quantity * unit_cost > _MAX_SAFE_INTEGER or total != quantity * unit_cost:
            raise TrialValidationError(f"{field}.totalMmk must equal quantity times unit cost.")
        if "budgetEnvelopeId" in requisition:
            budget_envelope_id = _text(
                requisition["budgetEnvelopeId"],
                f"{field}.budgetEnvelopeId",
                maximum=80,
            )
            envelope = purchase_budget_by_id.get(budget_envelope_id)
            if envelope is None:
                raise TrialValidationError(f"{field}.budgetEnvelopeId is unknown.")
            approval_time = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
            if not (
                datetime.fromisoformat(str(envelope["periodStart"]).replace("Z", "+00:00"))
                <= approval_time
                < datetime.fromisoformat(str(envelope["periodEnd"]).replace("Z", "+00:00"))
            ):
                raise TrialValidationError(f"{field} approval is outside its budget period.")
            if total > int(envelope["perRequisitionLimitMmk"]):
                raise TrialValidationError(f"{field} exceeds its per-requisition budget limit.")
        if "sourceSourcingDecisionId" in requisition:
            source_id = _text(
                requisition["sourceSourcingDecisionId"],
                f"{field}.sourceSourcingDecisionId",
                maximum=80,
            )
            decision = supplier_sourcing_by_id.get(source_id)
            selected = next(
                (
                    quote for quote in decision["quotes"]
                    if quote["quoteReference"] == decision["selectedQuoteReference"]
                ),
                None,
            ) if decision else None
            maximum_unit_cost = (
                int(selected["unitCostMmk"])
                * (10_000 + int(decision["unitCostToleranceBasisPoints"]))
                // 10_000
            ) if decision and selected else 0
            latest_delivery = (
                datetime.fromisoformat(str(selected["deliveryAt"]).replace("Z", "+00:00"))
                + timedelta(days=int(decision["deliveryToleranceDays"]))
            ) if decision and selected else datetime.min.replace(tzinfo=timezone.utc)
            if (
                decision is None
                or selected is None
                or decision["sku"] != sku
                or decision["quantity"] != quantity
                or selected["supplier"] != requisition["supplier"]
                or unit_cost > maximum_unit_cost
                or datetime.fromisoformat(expected_at.replace("Z", "+00:00")) > latest_delivery
                or datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                > datetime.fromisoformat(str(selected["validUntil"]).replace("Z", "+00:00"))
            ):
                raise TrialValidationError(f"{field} does not match its approved sourcing decision.")
        for digest_field in ("sourceDecisionDigest", "sourceReplenishmentDigest"):
            digest = _text(requisition[digest_field], f"{field}.{digest_field}", maximum=71)
            if _SHA256_DIGEST_PATTERN.fullmatch(digest) is None:
                raise TrialValidationError(f"{field}.{digest_field} is invalid.")
        approval = _action_proof(requisition["approval"], f"{field}.approval")
        if approval["capturedAt"] != created_at:
            raise TrialValidationError(f"{field}.approval must be captured at creation.")
        purchase_requisition_ids.append(requisition_id)
        purchase_requisition_action_ids.append(approval["actionId"])
        purchase_requisition_by_id[requisition_id] = requisition
    _unique(purchase_requisition_ids, "Purchase requisition ID")
    _unique(
        [
            str(requisition["sourceSourcingDecisionId"])
            for requisition in purchase_requisition_by_id.values()
            if "sourceSourcingDecisionId" in requisition
        ],
        "Consumed supplier sourcing decision ID",
    )

    purchase_order_ids: list[str] = []
    purchase_order_action_ids: list[str] = []
    supplier_invoice_ids: list[str] = []
    supplier_invoice_references: list[str] = []
    supplier_return_ids: list[str] = []
    supplier_return_receipt_ids: list[str] = []
    supplier_return_references: list[str] = []
    supplier_credit_ids: list[str] = []
    supplier_credit_references: list[str] = []
    purchase_order_by_id: dict[str, dict[str, Any]] = {}
    converted_requisition_ids: list[str] = []
    for index, candidate in enumerate(purchase_orders):
        field = f"purchaseOrders[{index}]"
        purchase_order = _object(candidate, field)
        _exact_fields(
            purchase_order,
            field,
            required=_PURCHASE_ORDER_REQUIRED_FIELDS,
            optional=_PURCHASE_ORDER_OPTIONAL_FIELDS,
        )
        purchase_order_id = _text(
            purchase_order["id"],
            f"{field}.id",
            maximum=80,
        )
        if _PURCHASE_ORDER_ID_PATTERN.fullmatch(purchase_order_id) is None:
            raise TrialValidationError(f"{field}.id is invalid.")
        created_at = _timestamp(purchase_order["createdAt"], f"{field}.createdAt")
        if "expectedAt" in purchase_order:
            expected_at = _timestamp(
                purchase_order["expectedAt"],
                f"{field}.expectedAt",
            )
            if datetime.fromisoformat(
                expected_at.replace("Z", "+00:00")
            ) <= datetime.fromisoformat(created_at.replace("Z", "+00:00")):
                raise TrialValidationError(
                    f"{field}.expectedAt must be later than creation."
                )
        _text(purchase_order["supplier"], f"{field}.supplier", maximum=120)
        sku = _text(purchase_order["sku"], f"{field}.sku", maximum=80)
        if sku not in item_by_sku:
            raise TrialValidationError(f"{field}.sku is unknown.")
        _integer(
            purchase_order["quantityOrdered"],
            f"{field}.quantityOrdered",
            minimum=1,
        )
        if "unitCostMmk" in purchase_order:
            unit_cost_mmk = _integer(
                purchase_order["unitCostMmk"],
                f"{field}.unitCostMmk",
                minimum=1,
            )
            if purchase_order["quantityOrdered"] * unit_cost_mmk > _MAX_SAFE_INTEGER:
                raise TrialValidationError(f"{field} total exceeds the safe integer range.")
        linked_requisition: dict[str, Any] | None = None
        if "requisitionId" in purchase_order:
            requisition_id = _text(purchase_order["requisitionId"], f"{field}.requisitionId", maximum=80)
            requisition = purchase_requisition_by_id.get(requisition_id)
            if (
                requisition is None
                or requisition["sku"] != sku
                or requisition["supplier"] != purchase_order["supplier"]
                or requisition["expectedAt"] != purchase_order.get("expectedAt")
                or requisition["quantityRequested"] != purchase_order["quantityOrdered"]
                or requisition["unitCostMmk"] != purchase_order.get("unitCostMmk")
            ):
                raise TrialValidationError(f"{field} does not match its approved requisition.")
            linked_requisition = requisition
            converted_requisition_ids.append(requisition_id)
        creation = _action_proof(purchase_order["creation"], f"{field}.creation")
        if creation["capturedAt"] != created_at:
            raise TrialValidationError(
                f"{field}.creation must be captured when the purchase order was created."
            )
        if linked_requisition is not None and (
            datetime.fromisoformat(creation["capturedAt"].replace("Z", "+00:00"))
            < datetime.fromisoformat(str(linked_requisition["createdAt"]).replace("Z", "+00:00"))
            or _same_accountable_actor(
                str(creation["actor"]),
                str(linked_requisition["approval"]["actor"]),
            )
        ):
            raise TrialValidationError(
                f"{field} requires a later confirmation by a different operator."
            )
        purchase_order_action_ids.append(creation["actionId"])
        if "cancellation" in purchase_order:
            cancellation = _action_proof(
                purchase_order["cancellation"],
                f"{field}.cancellation",
            )
            if datetime.fromisoformat(
                cancellation["capturedAt"].replace("Z", "+00:00")
            ) < datetime.fromisoformat(created_at.replace("Z", "+00:00")):
                raise TrialValidationError(
                    f"{field}.cancellation cannot precede creation."
                )
            purchase_order_action_ids.append(cancellation["actionId"])
        if "supplierReturns" in purchase_order:
            return_records = _list(purchase_order["supplierReturns"], f"{field}.supplierReturns")
            if "unitCostMmk" not in purchase_order or not 1 <= len(return_records) <= _MAX_SUPPLIER_RETURNS_PER_PURCHASE_ORDER:
                raise TrialValidationError(f"{field}.supplierReturns is invalid.")
            newer_return_at: datetime | None = None
            for return_index, return_candidate in enumerate(return_records):
                return_field = f"{field}.supplierReturns[{return_index}]"
                return_record = _object(return_candidate, return_field)
                _exact_fields(return_record, return_field, required=_SUPPLIER_RETURN_FIELDS)
                return_id = _text(return_record["id"], f"{return_field}.id", maximum=80)
                if _SUPPLIER_RETURN_ID_PATTERN.fullmatch(return_id) is None:
                    raise TrialValidationError(f"{return_field}.id is invalid.")
                return_created_at = _timestamp(return_record["createdAt"], f"{return_field}.createdAt")
                return_created_time = datetime.fromisoformat(return_created_at.replace("Z", "+00:00"))
                if return_created_time < datetime.fromisoformat(created_at.replace("Z", "+00:00")) or newer_return_at is not None and return_created_time > newer_return_at:
                    raise TrialValidationError(f"{return_field}.createdAt is outside the purchase chronology.")
                newer_return_at = return_created_time
                receipt_movement_id = _text(return_record["receiptMovementId"], f"{return_field}.receiptMovementId", maximum=_MAX_MOVEMENT_ID_LENGTH)
                _integer(return_record["quantityRejected"], f"{return_field}.quantityRejected", minimum=1)
                if return_record["reasonCode"] not in _PURCHASE_DISCREPANCY_CODES:
                    raise TrialValidationError(f"{return_field}.reasonCode is invalid.")
                claim_amount = _integer(return_record["claimAmountMmk"], f"{return_field}.claimAmountMmk", minimum=1)
                internal_reference = _text(return_record["internalReturnReference"], f"{return_field}.internalReturnReference", maximum=80)
                authorization = _action_proof(return_record["authorization"], f"{return_field}.authorization")
                if authorization["capturedAt"] != return_created_at or return_record["physicalReturnStatus"] != "not_dispatched" or return_record["supplierContacted"] is not False or return_record["accountingPosted"] is not False:
                    raise TrialValidationError(f"{return_field} overclaims return execution or has invalid authorization.")
                credits = _list(return_record["creditNotes"], f"{return_field}.creditNotes")
                if len(credits) > _MAX_SUPPLIER_CREDITS_PER_RETURN:
                    raise TrialValidationError(f"{return_field}.creditNotes exceeds the supported limit.")
                credited_amount = 0
                newer_credit_at: datetime | None = None
                for credit_index, credit_candidate in enumerate(credits):
                    credit_field = f"{return_field}.creditNotes[{credit_index}]"
                    credit = _object(credit_candidate, credit_field)
                    _exact_fields(credit, credit_field, required=_SUPPLIER_CREDIT_FIELDS)
                    credit_id = _text(credit["id"], f"{credit_field}.id", maximum=80)
                    if _SUPPLIER_CREDIT_ID_PATTERN.fullmatch(credit_id) is None:
                        raise TrialValidationError(f"{credit_field}.id is invalid.")
                    supplier_reference = _text(credit["supplierReference"], f"{credit_field}.supplierReference", maximum=80)
                    issued_at = _timestamp(credit["issuedAt"], f"{credit_field}.issuedAt")
                    issued_time = datetime.fromisoformat(issued_at.replace("Z", "+00:00"))
                    amount = _integer(credit["amountMmk"], f"{credit_field}.amountMmk", minimum=1)
                    recording = _action_proof(credit["recording"], f"{credit_field}.recording")
                    recording_time = datetime.fromisoformat(recording["capturedAt"].replace("Z", "+00:00"))
                    if issued_time < return_created_time or recording_time < issued_time or newer_credit_at is not None and recording_time > newer_credit_at or credit["accountingPosted"] is not False:
                        raise TrialValidationError(f"{credit_field} is outside the claim chronology or overclaims posting.")
                    newer_credit_at = recording_time
                    credited_amount += amount
                    if credited_amount > _MAX_SAFE_INTEGER or credited_amount > claim_amount:
                        raise TrialValidationError(f"{return_field} supplier credits exceed the authorized claim.")
                    purchase_order_action_ids.append(recording["actionId"])
                    supplier_credit_ids.append(credit_id)
                    supplier_credit_references.append(f"{purchase_order['supplier']}\0{supplier_reference}")
                purchase_order_action_ids.append(authorization["actionId"])
                supplier_return_ids.append(return_id)
                supplier_return_receipt_ids.append(receipt_movement_id)
                supplier_return_references.append(f"{purchase_order['supplier']}\0{internal_reference}")
        if "supplierInvoice" in purchase_order:
            invoice_field = f"{field}.supplierInvoice"
            if "unitCostMmk" not in purchase_order:
                raise TrialValidationError(
                    f"{invoice_field} requires retained purchase order commercial terms."
                )
            invoice = _object(purchase_order["supplierInvoice"], invoice_field)
            _exact_fields(
                invoice,
                invoice_field,
                required=_SUPPLIER_INVOICE_REQUIRED_FIELDS,
                optional=_SUPPLIER_INVOICE_OPTIONAL_FIELDS,
            )
            invoice_id = _text(invoice["id"], f"{invoice_field}.id", maximum=80)
            if _SUPPLIER_INVOICE_ID_PATTERN.fullmatch(invoice_id) is None:
                raise TrialValidationError(f"{invoice_field}.id is invalid.")
            supplier_reference = _text(
                invoice["supplierReference"],
                f"{invoice_field}.supplierReference",
                maximum=80,
            )
            issued_at = _timestamp(invoice["issuedAt"], f"{invoice_field}.issuedAt")
            due_at = _timestamp(invoice["dueAt"], f"{invoice_field}.dueAt")
            if (
                datetime.fromisoformat(issued_at.replace("Z", "+00:00"))
                < datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                or datetime.fromisoformat(due_at.replace("Z", "+00:00"))
                < datetime.fromisoformat(issued_at.replace("Z", "+00:00"))
            ):
                raise TrialValidationError(f"{invoice_field} invoice dates are invalid.")
            quantity_invoiced = _integer(
                invoice["quantityInvoiced"],
                f"{invoice_field}.quantityInvoiced",
                minimum=1,
            )
            invoice_unit_cost = _integer(
                invoice["unitCostMmk"],
                f"{invoice_field}.unitCostMmk",
                minimum=1,
            )
            total_mmk = _integer(
                invoice["totalMmk"],
                f"{invoice_field}.totalMmk",
                minimum=1,
            )
            if (
                quantity_invoiced * invoice_unit_cost > _MAX_SAFE_INTEGER
                or total_mmk != quantity_invoiced * invoice_unit_cost
            ):
                raise TrialValidationError(
                    f"{invoice_field}.totalMmk must equal quantity times unit cost."
                )
            recording = _action_proof(invoice["recording"], f"{invoice_field}.recording")
            if datetime.fromisoformat(
                recording["capturedAt"].replace("Z", "+00:00")
            ) < datetime.fromisoformat(issued_at.replace("Z", "+00:00")):
                raise TrialValidationError(f"{invoice_field}.recording is invalid.")
            purchase_order_action_ids.append(recording["actionId"])
            if "payableReview" in invoice:
                payable_review = _action_proof(
                    invoice["payableReview"],
                    f"{invoice_field}.payableReview",
                )
                if datetime.fromisoformat(
                    payable_review["capturedAt"].replace("Z", "+00:00")
                ) < datetime.fromisoformat(recording["capturedAt"].replace("Z", "+00:00")):
                    raise TrialValidationError(f"{invoice_field}.payableReview is invalid.")
                purchase_order_action_ids.append(payable_review["actionId"])
            supplier_invoice_ids.append(invoice_id)
            supplier_invoice_references.append(
                f"{purchase_order['supplier']}\0{supplier_reference}"
            )
        purchase_order_ids.append(purchase_order_id)
        purchase_order_by_id[purchase_order_id] = purchase_order
    _unique(purchase_order_ids, "Purchase order ID")
    _unique(converted_requisition_ids, "Converted purchase requisition ID")
    _unique(
        [purchase_requisition_by_id[requisition_id]["sku"] for requisition_id in purchase_requisition_ids if requisition_id not in converted_requisition_ids],
        "Open purchase requisition SKU",
    )
    _unique(supplier_invoice_ids, "Supplier invoice ID")
    _unique(supplier_invoice_references, "Supplier invoice reference")
    _unique(supplier_return_ids, "Supplier return ID")
    _unique(supplier_return_receipt_ids, "Supplier return receipt movement ID")
    _unique(supplier_return_references, "Supplier return reference")
    _unique(supplier_credit_ids, "Supplier credit note ID")
    _unique(supplier_credit_references, "Supplier credit note reference")
    for envelope_id, envelope in purchase_budget_by_id.items():
        committed = sum(
            int(requisition["totalMmk"])
            for requisition in purchase_requisition_by_id.values()
            if requisition.get("budgetEnvelopeId") == envelope_id
            and not any(
                purchase_order.get("requisitionId") == requisition["id"]
                and "cancellation" in purchase_order
                for purchase_order in purchase_orders
                if isinstance(purchase_order, Mapping)
            )
        )
        if committed > int(envelope["ceilingMmk"]):
            raise TrialValidationError(
                f"Purchase budget {envelope['budgetCode']} exceeds its approved ceiling."
            )

    storefront_configuration_action_id = ""
    if storefront_configuration is not None:
        configuration = _object(
            storefront_configuration,
            "commerce state.storefrontConfiguration",
        )
        _exact_fields(
            configuration,
            "commerce state.storefrontConfiguration",
            required=_STOREFRONT_CONFIGURATION_FIELDS,
            optional=_STOREFRONT_CONFIGURATION_OPTIONAL_FIELDS,
        )
        if configuration["schema"] != "supermega.ecommerce.storefront.v1":
            raise TrialValidationError("commerce state.storefrontConfiguration.schema is invalid.")
        revision = _integer(
            configuration["revision"],
            "commerce state.storefrontConfiguration.revision",
            minimum=1,
        )
        _integer(
            configuration["shopCatalogSnapshotRevision"],
            "commerce state.storefrontConfiguration.shopCatalogSnapshotRevision",
            minimum=1,
        )
        digest = _text(
            configuration["shopCatalogDigest"],
            "commerce state.storefrontConfiguration.shopCatalogDigest",
            maximum=71,
        )
        if _SHA256_DIGEST_PATTERN.fullmatch(digest) is None:
            raise TrialValidationError(
                "commerce state.storefrontConfiguration.shopCatalogDigest is invalid."
            )
        _text(
            configuration["storeName"],
            "commerce state.storefrontConfiguration.storeName",
            maximum=60,
        )
        _text(
            configuration["summary"],
            "commerce state.storefrontConfiguration.summary",
            maximum=180,
        )
        selected_skus = _list(
            configuration["selectedSkus"],
            "commerce state.storefrontConfiguration.selectedSkus",
        )
        if not 1 <= len(selected_skus) <= 8:
            raise TrialValidationError(
                "commerce state.storefrontConfiguration.selectedSkus must contain 1 to 8 Shop SKUs."
            )
        normalized_selected_skus = [
            _text(
                sku,
                f"commerce state.storefrontConfiguration.selectedSkus[{index}]",
                maximum=80,
            )
            for index, sku in enumerate(selected_skus)
        ]
        _unique(normalized_selected_skus, "Storefront selected SKU")
        if (
            normalized_selected_skus != sorted(normalized_selected_skus)
            or any(sku not in item_by_sku for sku in normalized_selected_skus)
        ):
            raise TrialValidationError(
                "commerce state.storefrontConfiguration.selectedSkus must be sorted current Shop SKUs."
            )
        if "merchandising" in configuration:
            merchandising = _list(
                configuration["merchandising"],
                "commerce state.storefrontConfiguration.merchandising",
            )
            if len(merchandising) != len(normalized_selected_skus):
                raise TrialValidationError(
                    "commerce state.storefrontConfiguration.merchandising must cover every selected Shop SKU exactly once."
                )
            merchandising_skus: list[str] = []
            for index, candidate in enumerate(merchandising):
                row = _object(
                    candidate,
                    f"commerce state.storefrontConfiguration.merchandising[{index}]",
                )
                _exact_fields(
                    row,
                    f"commerce state.storefrontConfiguration.merchandising[{index}]",
                    required=_STOREFRONT_MERCHANDISING_FIELDS,
                )
                merchandising_skus.append(
                    _text(
                        row["sku"],
                        f"commerce state.storefrontConfiguration.merchandising[{index}].sku",
                        maximum=80,
                    )
                )
                if not isinstance(row["featured"], bool):
                    raise TrialValidationError(
                        f"commerce state.storefrontConfiguration.merchandising[{index}].featured must be boolean."
                    )
                _text(
                    row["collection"],
                    f"commerce state.storefrontConfiguration.merchandising[{index}].collection",
                    maximum=120,
                )
                _blankable_text(
                    row["displayName"],
                    f"commerce state.storefrontConfiguration.merchandising[{index}].displayName",
                    maximum=180,
                )
                _blankable_text(
                    row["note"],
                    f"commerce state.storefrontConfiguration.merchandising[{index}].note",
                    maximum=300,
                )
            if merchandising_skus != normalized_selected_skus:
                raise TrialValidationError(
                    "commerce state.storefrontConfiguration.merchandising must follow the canonical selected SKU order."
                )
        if "activation" in configuration:
            activation = _object(
                configuration["activation"],
                "commerce state.storefrontConfiguration.activation",
            )
            _exact_fields(
                activation,
                "commerce state.storefrontConfiguration.activation",
                required=_STOREFRONT_ACTIVATION_FIELDS,
            )
            if activation["contract"] != "supermega.ecommerce.activation.v1":
                raise TrialValidationError(
                    "commerce state.storefrontConfiguration.activation.contract is invalid."
                )
            package_digest = _text(
                activation["packageDigest"],
                "commerce state.storefrontConfiguration.activation.packageDigest",
                maximum=71,
            )
            if _SHA256_DIGEST_PATTERN.fullmatch(package_digest) is None:
                raise TrialValidationError(
                    "commerce state.storefrontConfiguration.activation.packageDigest is invalid."
                )
            template_id = _text(
                activation["workflowTemplateId"],
                "commerce state.storefrontConfiguration.activation.workflowTemplateId",
                maximum=60,
            )
            if template_id not in _ECOMMERCE_TEMPLATE_IDS:
                raise TrialValidationError(
                    "commerce state.storefrontConfiguration.activation.workflowTemplateId is invalid."
                )
            _timestamp(
                activation["confirmedAt"],
                "commerce state.storefrontConfiguration.activation.confirmedAt",
            )
            activation_skus = _list(
                activation["skus"],
                "commerce state.storefrontConfiguration.activation.skus",
            )
            if activation_skus != normalized_selected_skus:
                raise TrialValidationError(
                    "commerce state.storefrontConfiguration.activation.skus must match the current imported storefront."
                )
        saved = _action_proof(
            configuration["saved"],
            "commerce state.storefrontConfiguration.saved",
        )
        if saved["evidenceReference"] != f"ECOMMERCE-STOREFRONT:{digest}:R{revision}":
            raise TrialValidationError(
                "commerce state.storefrontConfiguration.saved evidence is invalid."
            )
        expected_action_id = _storefront_configuration_action_id(revision, digest)
        if saved["actionId"] != expected_action_id:
            raise TrialValidationError(
                "commerce state.storefrontConfiguration.saved action ID is invalid."
            )
        storefront_configuration_action_id = saved["actionId"]

    order_ids: list[str] = []
    source_record_ids: list[str] = []
    reconciliation_action_ids: list[str] = []
    refund_settlement_action_ids: list[str] = []
    advancement_action_ids: list[str] = []
    completion_action_ids: list[str] = []
    return_action_ids: list[str] = []
    support_action_ids: list[str] = []
    support_source_intent_ids: list[str] = []
    correction_action_ids: list[str] = []
    collection_action_ids: list[str] = []
    order_returns: list[tuple[str, dict[str, Any]]] = []
    order_by_id: dict[str, dict[str, Any]] = {}
    for index, candidate in enumerate(orders):
        order = _object(candidate, f"orders[{index}]")
        _exact_fields(order, f"orders[{index}]", required=_ORDER_REQUIRED_FIELDS, optional=_ORDER_OPTIONAL_FIELDS)
        order_id = _text(order["id"], f"orders[{index}].id", maximum=160)
        order_created_at = datetime.fromisoformat(
            _timestamp(order["createdAt"], f"orders[{index}].createdAt").replace("Z", "+00:00")
        )
        for field in ("customer", "channel", "item", "payment"):
            _text(order[field], f"orders[{index}].{field}")
        if "owner" in order:
            _text(order["owner"], f"orders[{index}].owner", maximum=120)
        item_sku = order.get("itemSku")
        if item_sku is not None:
            item_sku = _text(item_sku, f"orders[{index}].itemSku", maximum=80)
            if item_sku not in item_by_sku:
                raise TrialValidationError(f"orders[{index}].itemSku is unknown.")
        _integer(order["quantity"], f"orders[{index}].quantity", minimum=1)
        _integer(order["total"], f"orders[{index}].total")
        captured_total: int | None = None
        if "lines" in order:
            lines = _list(order["lines"], f"orders[{index}].lines")
            if not 1 <= len(lines) <= _MAX_ORDER_LINES:
                raise TrialValidationError(
                    f"orders[{index}].lines must contain 1 to {_MAX_ORDER_LINES} entries."
                )
            line_skus: list[str] = []
            captured_quantity = 0
            captured_total = 0
            validated_lines: list[dict[str, Any]] = []
            for line_index, line_candidate in enumerate(lines):
                line_field = f"orders[{index}].lines[{line_index}]"
                line = _object(line_candidate, line_field)
                _exact_fields(
                    line,
                    line_field,
                    required=_ORDER_LINE_REQUIRED_FIELDS,
                    optional=_ORDER_LINE_OPTIONAL_FIELDS,
                )
                line_sku = _text(line["sku"], f"{line_field}.sku", maximum=80)
                if line_sku not in item_by_sku:
                    raise TrialValidationError(f"{line_field}.sku is unknown.")
                _text(line["name"], f"{line_field}.name")
                if "variant" in line:
                    _text(line["variant"], f"{line_field}.variant")
                line_quantity = _integer(
                    line["quantity"],
                    f"{line_field}.quantity",
                    minimum=1,
                )
                unit_price = _integer(
                    line["unitPriceMmk"],
                    f"{line_field}.unitPriceMmk",
                    minimum=1,
                )
                line_total = line_quantity * unit_price
                captured_quantity += line_quantity
                captured_total += line_total
                if (
                    line_total > _MAX_SAFE_INTEGER
                    or captured_quantity > _MAX_SAFE_INTEGER
                    or captured_total > _MAX_SAFE_INTEGER
                ):
                    raise TrialValidationError(
                        f"orders[{index}].lines exceed the safe integer limit."
                    )
                line_skus.append(line_sku)
                validated_lines.append(line)
            _unique(line_skus, f"orders[{index}] line SKU")
            expected_item_sku = validated_lines[0]["sku"] if len(validated_lines) == 1 else None
            if (
                order["item"] != _order_item_summary(validated_lines)
                or order.get("itemSku") != expected_item_sku
                or order["quantity"] != captured_quantity
            ):
                raise TrialValidationError(
                    f"orders[{index}] does not match its immutable line snapshots."
                )
        priced_total = captured_total
        if "promotionDecision" in order:
            decision_field = f"orders[{index}].promotionDecision"
            decision = _object(order["promotionDecision"], decision_field)
            _exact_fields(
                decision,
                decision_field,
                required=frozenset(
                    {
                        "schema",
                        "status",
                        "code",
                        "policyRevision",
                        "policyActionId",
                        "discountBasisPoints",
                        "grossSubtotalMmk",
                        "discountMmk",
                        "netSubtotalMmk",
                        "reviewedAt",
                        "reason",
                    }
                ),
            )
            if captured_total is None or not str(order.get("sourceRecordId", "")).startswith("ECR-"):
                raise TrialValidationError(
                    f"{decision_field} requires immutable Ecommerce lines and an ECR source."
                )
            reviewed_at = _timestamp(decision["reviewedAt"], f"{decision_field}.reviewedAt")
            if datetime.fromisoformat(reviewed_at.replace("Z", "+00:00")) > order_created_at:
                raise TrialValidationError(
                    f"{decision_field}.reviewedAt cannot be later than order creation."
                )
            try:
                expected_decision = review_ecommerce_promotion(
                    validated_promotion_policies,
                    decision["code"],
                    captured_total,
                    reviewed_at,
                )
            except EcommerceLifecycleValidationError as exc:
                raise TrialValidationError(
                    f"{decision_field} is invalid: {exc}"
                ) from exc
            if dict(decision) != expected_decision:
                raise TrialValidationError(
                    f"{decision_field} does not match the versioned Shop policy."
                )
            priced_total = expected_decision["netSubtotalMmk"]
        if "shippingDecision" in order:
            decision_field = f"orders[{index}].shippingDecision"
            decision = _object(order["shippingDecision"], decision_field)
            _exact_fields(decision, decision_field, required=frozenset({
                "schema", "status", "reason", "township", "zoneCode", "policyRevision",
                "policyActionId", "feeMmk", "promiseMinutes", "reviewedAt",
            }))
            if priced_total is None or not str(order.get("sourceRecordId", "")).startswith("ECR-"):
                raise TrialValidationError(f"{decision_field} requires immutable Ecommerce lines and an ECR source.")
            reviewed_at = _timestamp(decision["reviewedAt"], f"{decision_field}.reviewedAt")
            if datetime.fromisoformat(reviewed_at.replace("Z", "+00:00")) > order_created_at:
                raise TrialValidationError(f"{decision_field}.reviewedAt cannot be later than order creation.")
            try:
                expected_shipping = review_ecommerce_shipping(
                    validated_shipping_policies,
                    str(order.get("fulfilment", "")),
                    decision.get("township"),
                    reviewed_at,
                )
            except EcommerceLifecycleValidationError as exc:
                raise TrialValidationError(f"{decision_field} is invalid: {exc}") from exc
            if dict(decision) != expected_shipping or expected_shipping["status"] == "rejected":
                raise TrialValidationError(f"{decision_field} does not match the versioned Shop policy.")
            if expected_shipping["promiseMinutes"] is not None:
                promised = datetime.fromisoformat(str(order.get("promisedAt", "")).replace("Z", "+00:00"))
                minimum_promise = datetime.fromisoformat(reviewed_at.replace("Z", "+00:00")) + timedelta(minutes=expected_shipping["promiseMinutes"])
                if promised < minimum_promise:
                    raise TrialValidationError(f"{decision_field} promise is earlier than the Shop policy.")
            priced_total += expected_shipping["feeMmk"]
        payable_total = priced_total
        if "taxDecision" in order:
            decision_field = f"orders[{index}].taxDecision"
            decision = _object(order["taxDecision"], decision_field)
            if priced_total is None or not str(order.get("sourceRecordId", "")).startswith("ECR-"):
                raise TrialValidationError(f"{decision_field} requires immutable Ecommerce lines and an ECR source.")
            try:
                expected_tax = validate_ecommerce_tax_decision(decision, tax_configurations)
            except EcommerceLifecycleValidationError as exc:
                raise TrialValidationError(f"{decision_field} is invalid: {exc}") from exc
            reviewed_at = _timestamp(expected_tax["reviewedAt"], f"{decision_field}.reviewedAt")
            if (
                expected_tax["listedSubtotalMmk"] != priced_total
                or datetime.fromisoformat(reviewed_at.replace("Z", "+00:00")) > order_created_at
            ):
                raise TrialValidationError(f"{decision_field} does not match the Shop tax schedule.")
            payable_total = expected_tax["totalMmk"]
        if "paymentDecision" in order:
            decision_field = f"orders[{index}].paymentDecision"
            decision = _object(order["paymentDecision"], decision_field)
            _exact_fields(decision, decision_field, required=frozenset({
                "schema", "status", "reason", "adapter", "policyRevision",
                "policyActionId", "maximumOrderMmk", "instructions", "reviewedAt", "authorized",
            }))
            if priced_total is None or not str(order.get("sourceRecordId", "")).startswith("ECR-"):
                raise TrialValidationError(f"{decision_field} requires immutable Ecommerce lines and an ECR source.")
            reviewed_at = _timestamp(decision["reviewedAt"], f"{decision_field}.reviewedAt")
            if datetime.fromisoformat(reviewed_at.replace("Z", "+00:00")) > order_created_at:
                raise TrialValidationError(f"{decision_field}.reviewedAt cannot be later than order creation.")
            reviewed_amount = payable_total
            tax_configuration = None if "taxDecision" in order else _effective_tax_configuration(state, reviewed_at)
            if tax_configuration is not None and priced_total is not None:
                reviewed_calculation = _configured_order_calculation(
                    tax_configuration,
                    priced_total,
                    len(catalog_changes),
                )
                if reviewed_calculation is None:
                    raise TrialValidationError(f"{decision_field} tax-inclusive amount is invalid.")
                reviewed_amount = reviewed_calculation["totalMmk"]
            try:
                expected_payment = review_ecommerce_payment(
                    validated_payment_policies,
                    decision["adapter"],
                    str(order.get("fulfilment", "")),
                    reviewed_amount,
                    reviewed_at,
                )
            except EcommerceLifecycleValidationError as exc:
                raise TrialValidationError(f"{decision_field} is invalid: {exc}") from exc
            payment_label = {
                "cash_on_delivery": "Cash on delivery",
                "kbzpay_manual": "KBZPay",
                "pay_on_pickup": "Cash",
            }.get(str(decision.get("adapter")))
            if dict(decision) != expected_payment or expected_payment["status"] != "approved" or decision["authorized"] is not False or order["payment"] != payment_label:
                raise TrialValidationError(f"{decision_field} does not match the versioned Shop policy.")
        calculation_candidate = order.get("calculation")
        if calculation_candidate is not None:
            calculation = _object(
                calculation_candidate,
                f"orders[{index}].calculation",
            )
            calculation_schema = calculation.get("schema")
            if calculation_schema == _ORDER_CALCULATION_SCHEMA:
                _exact_fields(
                    calculation,
                    f"orders[{index}].calculation",
                    required=_ORDER_CALCULATION_FIELDS,
                )
            elif calculation_schema == _ORDER_CALCULATION_V2_SCHEMA:
                _exact_fields(
                    calculation,
                    f"orders[{index}].calculation",
                    required=_ORDER_CALCULATION_V2_FIELDS,
                    optional=_ORDER_CALCULATION_V2_SCHEDULE_FIELDS,
                )
                schedule_fields = _ORDER_CALCULATION_V2_SCHEDULE_FIELDS.intersection(calculation)
                if schedule_fields and schedule_fields != _ORDER_CALCULATION_V2_SCHEDULE_FIELDS:
                    raise TrialValidationError(
                        f"orders[{index}].calculation must retain jurisdiction and effective time together."
                    )
            else:
                raise TrialValidationError(
                    f"orders[{index}].calculation schema is invalid."
                )
            catalog_revision = _integer(
                calculation["catalogRevision"],
                f"orders[{index}].calculation.catalogRevision",
            )
            subtotal_mmk = _integer(
                calculation["subtotalMmk"],
                f"orders[{index}].calculation.subtotalMmk",
                minimum=1 if calculation_schema == _ORDER_CALCULATION_SCHEMA else 0,
            )
            tax_mmk = _integer(
                calculation["taxMmk"],
                f"orders[{index}].calculation.taxMmk",
            )
            total_mmk = _integer(
                calculation["totalMmk"],
                f"orders[{index}].calculation.totalMmk",
                minimum=1,
            )
            if calculation["currency"] != "MMK" or catalog_revision > len(catalog_changes) or order["total"] != total_mmk:
                raise TrialValidationError(
                    f"orders[{index}].calculation totals are invalid."
                )
            if calculation_schema == _ORDER_CALCULATION_SCHEMA:
                if (
                    calculation["taxMode"] != "not_configured"
                    or tax_mmk != 0
                    or total_mmk != subtotal_mmk
                    or (
                        priced_total is not None
                        and subtotal_mmk != priced_total
                    )
                ):
                    raise TrialValidationError(
                        f"orders[{index}].calculation must preserve its deterministic untaxed MMK subtotal."
                    )
            else:
                tax_revision = _integer(
                    calculation["taxConfigurationRevision"],
                    f"orders[{index}].calculation.taxConfigurationRevision",
                    minimum=1,
                )
                _integer(
                    calculation["taxRateBasisPoints"],
                    f"orders[{index}].calculation.taxRateBasisPoints",
                )
                _integer(
                    calculation["listedSubtotalMmk"],
                    f"orders[{index}].calculation.listedSubtotalMmk",
                    minimum=1,
                )
                configuration = next(
                    (
                        row
                        for row in tax_configurations
                        if isinstance(row, Mapping)
                        and row.get("revision") == tax_revision
                    ),
                    None,
                )
                expected = (
                    _configured_order_calculation(
                        configuration,
                        priced_total,
                        catalog_revision,
                    )
                    if configuration is not None and priced_total is not None
                    else None
                )
                if (
                    expected is None
                    or datetime.fromisoformat(
                        str(configuration["proof"]["capturedAt"]).replace("Z", "+00:00")
                    )
                    > datetime.fromisoformat(
                        str(order["createdAt"]).replace("Z", "+00:00")
                    )
                    or datetime.fromisoformat(
                        str(
                            configuration.get(
                                "effectiveFrom",
                                configuration["proof"]["capturedAt"],
                            )
                        ).replace("Z", "+00:00")
                    )
                    > datetime.fromisoformat(
                        str(order["createdAt"]).replace("Z", "+00:00")
                    )
                    or calculation != expected
                ):
                    raise TrialValidationError(
                        f"orders[{index}].calculation does not match its immutable tax configuration."
                    )
        elif priced_total is not None and order["total"] != priced_total:
            raise TrialValidationError(
                f"orders[{index}] legacy total does not match its immutable line snapshots."
            )
        if order["status"] not in _ORDER_STATUSES:
            raise TrialValidationError(f"orders[{index}].status is invalid.")
        if order["paymentStatus"] not in _PAYMENT_STATUSES:
            raise TrialValidationError(f"orders[{index}].paymentStatus is invalid.")
        if order["refundStatus"] not in _REFUND_STATUSES:
            raise TrialValidationError(f"orders[{index}].refundStatus is invalid.")
        if "advancementActionIds" in order:
            order_advancement_action_ids = _list(
                order["advancementActionIds"],
                f"orders[{index}].advancementActionIds",
            )
            status_limit = {
                "confirmed": 0,
                "preparing": 1,
                "ready": 2,
                "completed": 2,
                "cancelled": 2,
            }[order["status"]]
            if len(order_advancement_action_ids) > status_limit:
                raise TrialValidationError(
                    f"orders[{index}].advancementActionIds is invalid."
                )
            validated_advancement_action_ids = [
                _text(
                    action_id,
                    f"orders[{index}].advancementActionIds[{action_index}]",
                    maximum=160,
                )
                for action_index, action_id in enumerate(
                    order_advancement_action_ids
                )
            ]
            _unique(
                validated_advancement_action_ids,
                f"orders[{index}] advancement action ID",
            )
            advancement_action_ids.extend(validated_advancement_action_ids)
        for field in ("fulfilment", "fulfilmentReference", "sourceRecordId", "evidenceReference"):
            if field in order:
                value_text = (
                    _text(order[field], f"orders[{index}].{field}", maximum=160)
                    if field == "fulfilmentReference"
                    else _text(order[field], f"orders[{index}].{field}")
                )
                if field == "sourceRecordId":
                    source_record_ids.append(value_text)
        if "promisedAt" in order:
            promised_at = datetime.fromisoformat(
                _timestamp(
                    order["promisedAt"],
                    f"orders[{index}].promisedAt",
                ).replace("Z", "+00:00")
            )
            created_at = datetime.fromisoformat(
                str(order["createdAt"]).replace("Z", "+00:00")
            )
            if promised_at <= created_at:
                raise TrialValidationError(
                    f"orders[{index}].promisedAt must be after its creation time."
                )
        payment_terms_days = 0
        if "paymentDueAt" in order:
            payment_due_at = datetime.fromisoformat(
                _timestamp(
                    order["paymentDueAt"],
                    f"orders[{index}].paymentDueAt",
                ).replace("Z", "+00:00")
            )
            if payment_due_at < order_created_at:
                raise TrialValidationError(
                    f"orders[{index}].paymentDueAt cannot be before its creation time."
                )
            payment_delta = payment_due_at - order_created_at
            supported_terms = {
                timedelta(days=days): days for days in _CUSTOMER_CREDIT_TERMS
            }
            if payment_delta not in supported_terms:
                raise TrialValidationError(
                    f"orders[{index}].paymentDueAt must use a supported customer credit term."
                )
            payment_terms_days = supported_terms[payment_delta]
        if "creditDecision" in order:
            field = f"orders[{index}].creditDecision"
            decision = _object(order["creditDecision"], field)
            _exact_fields(decision, field, required=_ORDER_CREDIT_DECISION_FIELDS)
            policy_revision = _integer(
                decision["policyRevision"], f"{field}.policyRevision", minimum=1
            )
            policy_action_id = _text(
                decision["policyActionId"], f"{field}.policyActionId", maximum=160
            )
            for number_field in (
                "creditLimitMmk",
                "exposureBeforeMmk",
                "orderAmountMmk",
                "exposureAfterMmk",
            ):
                _integer(decision[number_field], f"{field}.{number_field}")
            if (
                decision["paymentTermsDays"] not in {7, 30}
                or decision["maxPaymentTermsDays"] not in _CUSTOMER_CREDIT_TERMS
                or decision["status"] != "approved"
                or payment_terms_days != decision["paymentTermsDays"]
                or decision["orderAmountMmk"] != order["total"]
                or decision["exposureAfterMmk"]
                != decision["exposureBeforeMmk"] + decision["orderAmountMmk"]
            ):
                raise TrialValidationError(
                    f"{field} arithmetic or payment terms are invalid."
                )
            policy = next(
                (
                    row
                    for row in customer_credit_policies
                    if isinstance(row, Mapping)
                    and row.get("revision") == policy_revision
                    and row.get("proof", {}).get("actionId") == policy_action_id
                ),
                None,
            )
            if (
                policy is None
                or policy["customer"] != order["customer"]
                or policy["status"] != "active"
                or policy["creditLimitMmk"] != decision["creditLimitMmk"]
                or policy["maxPaymentTermsDays"] != decision["maxPaymentTermsDays"]
                or decision["paymentTermsDays"] > policy["maxPaymentTermsDays"]
                or decision["exposureAfterMmk"] > policy["creditLimitMmk"]
                or datetime.fromisoformat(
                    str(policy["proof"]["capturedAt"]).replace("Z", "+00:00")
                )
                > order_created_at
            ):
                raise TrialValidationError(
                    f"{field} does not match an effective approved customer policy."
                )
        if "collectionActions" in order:
            collection_actions = _list(
                order["collectionActions"],
                f"orders[{index}].collectionActions",
            )
            if not 1 <= len(collection_actions) <= _MAX_COLLECTION_ACTIONS_PER_ORDER:
                raise TrialValidationError(
                    f"orders[{index}].collectionActions requires 1 to "
                    f"{_MAX_COLLECTION_ACTIONS_PER_ORDER} records."
                )
            newer_collection_at: datetime | None = None
            for action_index, action_candidate in enumerate(collection_actions):
                field = f"orders[{index}].collectionActions[{action_index}]"
                collection_action = _object(action_candidate, field)
                _exact_fields(collection_action, field, required=_COLLECTION_ACTION_FIELDS)
                if collection_action["kind"] != "customer_contact":
                    raise TrialValidationError(f"{field}.kind is invalid.")
                action_proof = _action_proof(
                    collection_action["proof"],
                    f"{field}.proof",
                )
                captured_at = datetime.fromisoformat(
                    action_proof["capturedAt"].replace("Z", "+00:00")
                )
                if (
                    captured_at < order_created_at
                    or (
                        newer_collection_at is not None
                        and captured_at > newer_collection_at
                    )
                ):
                    raise TrialValidationError(
                        f"{field} is outside the order chronology."
                    )
                newer_collection_at = captured_at
                collection_action_ids.append(action_proof["actionId"])

        present_reconciliation_fields = _RECONCILIATION_FIELDS & set(order)
        if order["paymentStatus"] == "reconciled":
            if present_reconciliation_fields != _RECONCILIATION_FIELDS:
                raise TrialValidationError(f"orders[{index}] requires complete payment reconciliation evidence.")
            _timestamp(order["paymentReconciledAt"], f"orders[{index}].paymentReconciledAt")
            reconciliation_action_ids.append(
                _text(order["paymentReconciliationActionId"], f"orders[{index}].paymentReconciliationActionId", maximum=160)
            )
            _text(order["paymentReconciledBy"], f"orders[{index}].paymentReconciledBy")
            _text(order["paymentReconciliationReason"], f"orders[{index}].paymentReconciliationReason")
            _text(order["paymentEvidenceReference"], f"orders[{index}].paymentEvidenceReference")
        elif present_reconciliation_fields:
            raise TrialValidationError(f"orders[{index}] cannot carry reconciliation evidence while payment is pending.")

        present_refund_settlement_fields = _REFUND_SETTLEMENT_FIELDS & set(order)
        if order["refundStatus"] == "settled":
            if present_refund_settlement_fields != _REFUND_SETTLEMENT_FIELDS:
                raise TrialValidationError(f"orders[{index}] requires complete refund settlement evidence.")
            _timestamp(order["refundSettledAt"], f"orders[{index}].refundSettledAt")
            refund_settlement_action_ids.append(
                _text(order["refundSettlementActionId"], f"orders[{index}].refundSettlementActionId", maximum=160)
            )
            _text(order["refundSettledBy"], f"orders[{index}].refundSettledBy")
            _text(order["refundSettlementReason"], f"orders[{index}].refundSettlementReason")
            _text(order["refundEvidenceReference"], f"orders[{index}].refundEvidenceReference")
        elif present_refund_settlement_fields:
            raise TrialValidationError(
                f"orders[{index}] cannot carry settlement evidence while refund is {order['refundStatus']}."
            )

        if order["refundStatus"] in {"due", "settled"} and not (
            order["status"] == "cancelled" and order["paymentStatus"] == "reconciled"
        ):
            raise TrialValidationError(f"orders[{index}] has an invalid refund exception.")
        if (
            order["status"] == "cancelled"
            and order["paymentStatus"] == "reconciled"
            and order["refundStatus"] not in {"due", "settled"}
        ):
            raise TrialValidationError(f"orders[{index}] must preserve a due or settled refund.")

        completion: dict[str, Any] | None = None
        if "completion" in order:
            if order["status"] != "completed":
                raise TrialValidationError(
                    f"orders[{index}].completion requires a completed order."
                )
            completion = _action_proof(
                order["completion"],
                f"orders[{index}].completion",
            )
            completion_at = datetime.fromisoformat(
                completion["capturedAt"].replace("Z", "+00:00")
            )
            order_created_at = datetime.fromisoformat(
                str(order["createdAt"]).replace("Z", "+00:00")
            )
            payment_reconciled_at = (
                datetime.fromisoformat(
                    str(order["paymentReconciledAt"]).replace("Z", "+00:00")
                )
                if "paymentReconciledAt" in order
                else order_created_at
            )
            if completion_at < max(order_created_at, payment_reconciled_at):
                raise TrialValidationError(
                    f"orders[{index}].completion is outside the order chronology."
                )
            completion_action_ids.append(completion["actionId"])

        if "returns" in order:
            records = _list(order["returns"], f"orders[{index}].returns")
            if (
                not 1 <= len(records) <= _MAX_RETURNS_PER_ORDER
                or order["status"] != "completed"
                or completion is None
            ):
                raise TrialValidationError(
                    f"orders[{index}].returns requires 1 to "
                    f"{_MAX_RETURNS_PER_ORDER} records and completion proof."
                )
            sold_by_sku = {
                line["sku"]: line["quantity"]
                for line in _reservation_lines(order)
            }
            returned_by_sku: dict[str, int] = {}
            newer_return_at: datetime | None = None
            completion_at = datetime.fromisoformat(
                completion["capturedAt"].replace("Z", "+00:00")
            )
            for return_index, return_candidate in enumerate(records):
                field = f"orders[{index}].returns[{return_index}]"
                return_record = _object(return_candidate, field)
                _exact_fields(return_record, field, required=_ORDER_RETURN_FIELDS)
                action_id = _text(
                    return_record["actionId"],
                    f"{field}.actionId",
                    maximum=160,
                )
                created_at = datetime.fromisoformat(
                    _timestamp(
                        return_record["createdAt"],
                        f"{field}.createdAt",
                    ).replace("Z", "+00:00")
                )
                for proof_field in ("actor", "reason", "evidenceReference"):
                    _text(return_record[proof_field], f"{field}.{proof_field}")
                sku = _text(return_record["sku"], f"{field}.sku", maximum=80)
                quantity = _integer(
                    return_record["quantity"],
                    f"{field}.quantity",
                    minimum=1,
                )
                if return_record["disposition"] not in _RETURN_DISPOSITIONS:
                    raise TrialValidationError(f"{field}.disposition is invalid.")
                if (
                    created_at < completion_at
                    or (
                        newer_return_at is not None
                        and created_at > newer_return_at
                    )
                ):
                    raise TrialValidationError(
                        f"{field}.createdAt is outside the order chronology."
                    )
                newer_return_at = created_at
                returned = returned_by_sku.get(sku, 0) + quantity
                if (
                    sku not in sold_by_sku
                    or returned > sold_by_sku[sku]
                    or returned > _MAX_SAFE_INTEGER
                ):
                    raise TrialValidationError(
                        f"orders[{index}].returns exceed the sold quantity for {sku}."
                    )
                returned_by_sku[sku] = returned
                return_action_ids.append(action_id)
                order_returns.append((order_id, return_record))
        if "supportCases" in order:
            cases = _list(order["supportCases"], f"orders[{index}].supportCases")
            if (
                not 1 <= len(cases) <= _MAX_SUPPORT_CASES_PER_ORDER
                or order["status"] != "completed"
                or completion is None
            ):
                raise TrialValidationError(
                    f"orders[{index}].supportCases requires 1 to "
                    f"{_MAX_SUPPORT_CASES_PER_ORDER} records and completion proof."
                )
            newer_opening_at: datetime | None = None
            completion_at = datetime.fromisoformat(completion["capturedAt"].replace("Z", "+00:00"))
            for case_index, case_candidate in enumerate(cases):
                field = f"orders[{index}].supportCases[{case_index}]"
                support_case = _object(case_candidate, field)
                _exact_fields(
                    support_case,
                    field,
                    required=_ORDER_SUPPORT_CASE_REQUIRED_FIELDS,
                    optional=_ORDER_SUPPORT_CASE_OPTIONAL_FIELDS,
                )
                case_id = _text(support_case["caseId"], f"{field}.caseId", maximum=41)
                source_intent_id = _text(
                    support_case["sourceIntentId"], f"{field}.sourceIntentId", maximum=40
                )
                source_request_id = _text(
                    support_case["sourceRequestId"], f"{field}.sourceRequestId", maximum=40
                )
                expected_case_id = f"CASE-{source_intent_id[4:]}"
                expected_evidence = (
                    f"ECOMMERCE-SUPPORT:{source_intent_id[4:]}:{order_id}:{source_request_id}"
                )
                opening = _action_proof(support_case["opening"], f"{field}.opening")
                requested_at = datetime.fromisoformat(
                    _timestamp(
                        support_case["customerRequestedAt"],
                        f"{field}.customerRequestedAt",
                    ).replace("Z", "+00:00")
                )
                opening_at = datetime.fromisoformat(opening["capturedAt"].replace("Z", "+00:00"))
                triage_fields = tuple(
                    field_name in support_case
                    for field_name in ("priority", "owner", "dueAt")
                )
                if any(triage_fields) and not all(triage_fields):
                    raise TrialValidationError(
                        f"{field} service triage must include priority, owner, and due time together."
                    )
                if all(triage_fields):
                    due_at = datetime.fromisoformat(
                        _timestamp(support_case["dueAt"], f"{field}.dueAt").replace("Z", "+00:00")
                    )
                    _text(support_case["owner"], f"{field}.owner", maximum=120)
                    if support_case["priority"] not in _SUPPORT_PRIORITIES or due_at <= opening_at:
                        raise TrialValidationError(f"{field} service triage is invalid.")
                if (
                    _SUPPORT_CASE_ID_PATTERN.fullmatch(case_id) is None
                    or _SUPPORT_INTENT_ID_PATTERN.fullmatch(source_intent_id) is None
                    or case_id != expected_case_id
                    or _STOREFRONT_REQUEST_ID_PATTERN.fullmatch(source_request_id) is None
                    or source_request_id != order.get("sourceRecordId")
                    or support_case["category"] not in _SUPPORT_CATEGORIES
                    or support_case["externalMessageSent"] is not False
                    or support_case["refundStarted"] is not False
                    or opening["evidenceReference"] != expected_evidence
                    or opening_at < max(requested_at, completion_at)
                    or (newer_opening_at is not None and opening_at > newer_opening_at)
                ):
                    raise TrialValidationError(f"{field} boundary or chronology is invalid.")
                _text(
                    support_case["customerDescription"],
                    f"{field}.customerDescription",
                    maximum=300,
                )
                newer_opening_at = opening_at
                initial_service = (
                    {
                        "priority": support_case["priority"],
                        "owner": support_case["owner"],
                        "dueAt": support_case["dueAt"],
                    }
                    if all(triage_fields)
                    else None
                )
                if "serviceEvents" in support_case:
                    if initial_service is None:
                        raise TrialValidationError(
                            f"{field}.serviceEvents requires attributable opening triage."
                        )
                    _, original_latest_at, _, _ = _validate_support_service_timeline(
                        support_case["serviceEvents"],
                        f"{field}.serviceEvents",
                        case_id,
                        initial_service,
                        opening_at,
                        support_action_ids,
                    )
                else:
                    original_latest_at = opening_at
                original_resolution = None
                original_resolution_at = None
                if "resolution" in support_case:
                    original_resolution, original_resolution_at = _validate_support_resolution(
                        support_case["resolution"],
                        f"{field}.resolution",
                        original_latest_at,
                        support_action_ids,
                    )
                if "reopen" in support_case:
                    if original_resolution is None or original_resolution_at is None or initial_service is None:
                        raise TrialValidationError(f"{field}.reopen requires a retained triaged resolution.")
                    reopen = _object(support_case["reopen"], f"{field}.reopen")
                    _exact_fields(reopen, f"{field}.reopen", required=_ORDER_SUPPORT_REOPEN_FIELDS)
                    reopen_proof = _action_proof(reopen["proof"], f"{field}.reopen.proof")
                    reopen_at = datetime.fromisoformat(reopen_proof["capturedAt"].replace("Z", "+00:00"))
                    reopen_due_at = datetime.fromisoformat(
                        _timestamp(reopen["dueAt"], f"{field}.reopen.dueAt").replace("Z", "+00:00")
                    )
                    owner = _text(reopen["owner"], f"{field}.reopen.owner", maximum=120)
                    _text(reopen["note"], f"{field}.reopen.note", maximum=300)
                    if (
                        reopen["sourceResolutionActionId"] != original_resolution["proof"]["actionId"]
                        or reopen["priority"] not in _SUPPORT_PRIORITIES
                        or reopen_proof["evidenceReference"]
                        != f"SUPPORT-REOPEN:{case_id}:{original_resolution['proof']['actionId']}"
                        or reopen_at <= original_resolution_at
                        or reopen_due_at <= reopen_at
                    ):
                        raise TrialValidationError(f"{field}.reopen chronology or linkage is invalid.")
                    support_action_ids.append(reopen_proof["actionId"])
                    follow_up_latest_at = reopen_at
                    if "followUpServiceEvents" in support_case:
                        _, follow_up_latest_at, _, _ = _validate_support_service_timeline(
                            support_case["followUpServiceEvents"],
                            f"{field}.followUpServiceEvents",
                            case_id,
                            {"priority": reopen["priority"], "owner": owner, "dueAt": reopen["dueAt"]},
                            reopen_at,
                            support_action_ids,
                        )
                    follow_up_resolution = None
                    if "followUpResolution" in support_case:
                        follow_up_resolution, _ = _validate_support_resolution(
                            support_case["followUpResolution"],
                            f"{field}.followUpResolution",
                            follow_up_latest_at,
                            support_action_ids,
                        )
                    if (
                        (support_case["status"] == "open" and follow_up_resolution is not None)
                        or (support_case["status"] == "resolved" and follow_up_resolution is None)
                        or support_case["status"] not in {"open", "resolved"}
                    ):
                        raise TrialValidationError(f"{field} follow-up status is invalid.")
                elif "followUpServiceEvents" in support_case or "followUpResolution" in support_case:
                    raise TrialValidationError(f"{field} follow-up evidence requires a retained reopen.")
                elif (
                    (support_case["status"] == "open" and original_resolution is not None)
                    or (support_case["status"] == "resolved" and original_resolution is None)
                    or support_case["status"] not in {"open", "resolved"}
                ):
                    raise TrialValidationError(f"{field} status is invalid.")
                support_source_intent_ids.append(source_intent_id)
                support_action_ids.append(opening["actionId"])
        if "corrections" in order:
            corrections = _list(order["corrections"], f"orders[{index}].corrections")
            if (
                not 1 <= len(corrections) <= _MAX_CORRECTIONS_PER_ORDER
                or order["status"] != "completed"
                or order["paymentStatus"] != "reconciled"
                or completion is None
                or not isinstance(order.get("calculation"), Mapping)
            ):
                raise TrialValidationError(
                    f"orders[{index}].corrections requires 1 to "
                    f"{_MAX_CORRECTIONS_PER_ORDER} records on a calculated, "
                    "reconciled, completed order."
                )
            source_digest = commerce_order_calculation_digest(order)
            expected_balance = int(order["total"])
            previous_created_at = datetime.fromisoformat(
                completion["capturedAt"].replace("Z", "+00:00")
            )
            for reverse_index, correction_candidate in enumerate(reversed(corrections)):
                correction_index = len(corrections) - reverse_index - 1
                field = f"orders[{index}].corrections[{correction_index}]"
                correction = _object(correction_candidate, field)
                _exact_fields(correction, field, required=_ORDER_CORRECTION_FIELDS)
                action_id = _text(correction["actionId"], f"{field}.actionId", maximum=160)
                if correction["documentId"] != f"COR2:{quote(action_id, safe='')}" :
                    raise TrialValidationError(f"{field}.documentId is invalid.")
                created_at = datetime.fromisoformat(
                    _timestamp(correction["createdAt"], f"{field}.createdAt").replace("Z", "+00:00")
                )
                if created_at < previous_created_at:
                    raise TrialValidationError(f"{field}.createdAt is outside the order chronology.")
                previous_created_at = created_at
                for proof_field in ("actor", "reason", "evidenceReference"):
                    _text(correction[proof_field], f"{field}.{proof_field}")
                if correction["kind"] not in _CORRECTION_KINDS or correction["reasonCode"] not in _CORRECTION_REASON_CODES:
                    raise TrialValidationError(f"{field} classification is invalid.")
                if correction["sourceCalculationDigest"] != source_digest:
                    raise TrialValidationError(
                        f"{field}.sourceCalculationDigest does not bind the original order calculation."
                    )
                calculation = _object(correction["calculation"], f"{field}.calculation")
                _exact_fields(
                    calculation,
                    f"{field}.calculation",
                    required=_CORRECTION_CALCULATION_FIELDS,
                    optional=_CORRECTION_CALCULATION_SCHEDULE_FIELDS,
                )
                schedule_fields = _CORRECTION_CALCULATION_SCHEDULE_FIELDS.intersection(calculation)
                if schedule_fields and schedule_fields != _CORRECTION_CALCULATION_SCHEDULE_FIELDS:
                    raise TrialValidationError(
                        f"{field}.calculation must retain jurisdiction and effective time together."
                    )
                listed_amount = _integer(
                    calculation["listedAmountMmk"],
                    f"{field}.calculation.listedAmountMmk",
                    minimum=1,
                )
                expected_calculation = _correction_calculation(order, listed_amount)
                if calculation != expected_calculation:
                    raise TrialValidationError(
                        f"{field}.calculation is not deterministic from the original tax snapshot."
                    )
                expected_balance += (
                    int(calculation["totalMmk"])
                    if correction["kind"] == "debit"
                    else -int(calculation["totalMmk"])
                )
                if (
                    not 0 <= expected_balance <= _MAX_SAFE_INTEGER
                    or correction["balanceAfterMmk"] != expected_balance
                ):
                    raise TrialValidationError(f"{field}.balanceAfterMmk is invalid.")
                if (
                    correction["financialStatus"] != "review_required"
                    or correction["postingAuthority"] != "none"
                    or correction["externalPostingPerformed"] is not False
                ):
                    raise TrialValidationError(f"{field} overclaims posting authority.")
                correction_action_ids.append(action_id)
        order_ids.append(order_id)
        order_by_id[order_id] = order
    _unique(order_ids, "Order ID")
    _unique(source_record_ids, "Order source record ID")
    _unique(reconciliation_action_ids, "Payment reconciliation action ID")
    _unique(refund_settlement_action_ids, "Refund settlement action ID")
    _unique(advancement_action_ids, "Order advancement action ID")
    _unique(completion_action_ids, "Order completion action ID")
    _unique(return_action_ids, "Order return action ID")
    _unique(support_action_ids, "Order support action ID")
    _unique(support_source_intent_ids, "Order support source intent ID")
    _unique(correction_action_ids, "Order correction action ID")
    _unique(collection_action_ids, "Collection action ID")

    movement_ids: list[str] = []
    movement_action_ids: list[str] = []
    reserve_by_order: dict[str, int] = {}
    release_by_order: dict[str, int] = {}
    reserve_actions_by_order: dict[str, set[str]] = {}
    release_actions_by_order: dict[str, set[str]] = {}
    reserve_movement_by_order: dict[str, dict[str, Any]] = {}
    movements_by_action: dict[str, list[dict[str, Any]]] = {}
    receipt_quantity_by_purchase_order: dict[str, int] = {}
    rejected_quantity_by_purchase_order: dict[str, int] = {}
    latest_receipt_at_by_purchase_order: dict[str, datetime] = {}
    production_request_ids: list[str] = []
    production_release_ids: list[str] = []
    production_sku_by_source_product: dict[str, str] = {}
    for index, candidate in enumerate(movements):
        movement = _object(candidate, f"movements[{index}]")
        _exact_fields(
            movement,
            f"movements[{index}]",
            required=_MOVEMENT_FIELDS
            - (
                {
                    "orderId",
                    "purchaseOrderId",
                    "expectedQuantity",
                    "countedQuantity",
                }
                | _PURCHASE_DISCREPANCY_FIELDS
                | _PRODUCTION_ISSUE_FIELDS
                | _PRODUCTION_RETURN_EXCLUSIVE_FIELDS
                | _PRODUCTION_RECEIPT_EXCLUSIVE_FIELDS
            ),
            optional=frozenset(
                {
                    "orderId",
                    "purchaseOrderId",
                    "expectedQuantity",
                    "countedQuantity",
                }
            )
            | _PURCHASE_DISCREPANCY_FIELDS
            | _PRODUCTION_ISSUE_FIELDS
            | _PRODUCTION_RETURN_EXCLUSIVE_FIELDS
            | _PRODUCTION_RECEIPT_EXCLUSIVE_FIELDS,
        )
        movement_id = _text(
            movement["id"],
            f"movements[{index}].id",
            maximum=_MAX_MOVEMENT_ID_LENGTH,
        )
        action_id = _text(movement["actionId"], f"movements[{index}].actionId", maximum=160)
        _timestamp(movement["createdAt"], f"movements[{index}].createdAt")
        for field in ("actor", "reason", "evidenceReference"):
            _text(movement[field], f"movements[{index}].{field}")
        sku = _text(movement["sku"], f"movements[{index}].sku", maximum=80)
        if sku not in item_by_sku:
            raise TrialValidationError(f"movements[{index}].sku is unknown.")
        kind = movement["kind"]
        if kind not in _MOVEMENT_KINDS:
            raise TrialValidationError(f"movements[{index}].kind is invalid.")
        retained_production_fields = _PRODUCTION_ISSUE_FIELDS.intersection(movement)
        retained_production_return_fields = _PRODUCTION_RETURN_EXCLUSIVE_FIELDS.intersection(movement)
        retained_production_receipt_fields = _PRODUCTION_RECEIPT_FIELDS.intersection(movement)
        retained_purchase_discrepancy_fields = _PURCHASE_DISCREPANCY_FIELDS.intersection(movement)
        if kind == "production_issue":
            if (
                retained_production_fields != _PRODUCTION_ISSUE_FIELDS
                or retained_production_return_fields
                or _PRODUCTION_RECEIPT_EXCLUSIVE_FIELDS.intersection(movement)
                or "orderId" in movement
                or "purchaseOrderId" in movement
                or "expectedQuantity" in movement
                or "countedQuantity" in movement
            ):
                raise TrialValidationError(
                    f"movements[{index}] production issue fields are incomplete."
                )
            production_request_ids.append(
                _text(
                    movement["productionRequestId"],
                    f"movements[{index}].productionRequestId",
                    maximum=80,
                )
            )
            production_command_digest = _text(
                movement["productionCommandDigest"],
                f"movements[{index}].productionCommandDigest",
                maximum=71,
            )
            if _SHA256_DIGEST_PATTERN.fullmatch(production_command_digest) is None:
                raise TrialValidationError(
                    f"movements[{index}].productionCommandDigest is invalid."
                )
            for field in (
                "productionJobId",
                "productionMaterialId",
                "productionInputLotId",
            ):
                _text(movement[field], f"movements[{index}].{field}", maximum=80)
            _integer(
                movement["productionQuantityMilli"],
                f"movements[{index}].productionQuantityMilli",
                minimum=1,
            )
            if movement["productionUnit"] not in _PRODUCTION_MATERIAL_UNITS:
                raise TrialValidationError(
                    f"movements[{index}].productionUnit is invalid."
                )
            _text(
                movement["conversionNote"],
                f"movements[{index}].conversionNote",
                maximum=240,
            )
        elif kind == "production_return":
            if (
                retained_production_fields != _PRODUCTION_ISSUE_FIELDS
                or retained_production_return_fields
                != _PRODUCTION_RETURN_EXCLUSIVE_FIELDS
                or _PRODUCTION_RECEIPT_EXCLUSIVE_FIELDS.intersection(movement)
                or "orderId" in movement
                or "purchaseOrderId" in movement
                or "expectedQuantity" in movement
                or "countedQuantity" in movement
            ):
                raise TrialValidationError(
                    f"movements[{index}] production return fields are incomplete."
                )
            _text(
                movement["productionRequestId"],
                f"movements[{index}].productionRequestId",
                maximum=80,
            )
            production_command_digest = _text(
                movement["productionCommandDigest"],
                f"movements[{index}].productionCommandDigest",
                maximum=71,
            )
            if _SHA256_DIGEST_PATTERN.fullmatch(production_command_digest) is None:
                raise TrialValidationError(
                    f"movements[{index}].productionCommandDigest is invalid."
                )
            for field in (
                "productionJobId",
                "productionMaterialId",
                "productionInputLotId",
            ):
                _text(movement[field], f"movements[{index}].{field}", maximum=80)
            _integer(
                movement["productionQuantityMilli"],
                f"movements[{index}].productionQuantityMilli",
                minimum=1,
            )
            if movement["productionUnit"] not in _PRODUCTION_MATERIAL_UNITS:
                raise TrialValidationError(
                    f"movements[{index}].productionUnit is invalid."
                )
            _text(
                movement["conversionNote"],
                f"movements[{index}].conversionNote",
                maximum=240,
            )
            _text(
                movement["productionIssueActionId"],
                f"movements[{index}].productionIssueActionId",
                maximum=160,
            )
            _integer(
                movement["productionReturnedQuantityMilli"],
                f"movements[{index}].productionReturnedQuantityMilli",
                minimum=1,
            )
            _text(
                movement["productionReturnStockUnitId"],
                f"movements[{index}].productionReturnStockUnitId",
                maximum=80,
            )
            _text(
                movement["productionReturnLocationId"],
                f"movements[{index}].productionReturnLocationId",
                maximum=80,
            )
        elif kind == "production_receipt":
            if (
                retained_production_receipt_fields != _PRODUCTION_RECEIPT_FIELDS
                or _PRODUCTION_ISSUE_EXCLUSIVE_FIELDS.intersection(movement)
                or retained_production_return_fields
                or "orderId" in movement
                or "purchaseOrderId" in movement
                or "expectedQuantity" in movement
                or "countedQuantity" in movement
            ):
                raise TrialValidationError(
                    f"movements[{index}] production receipt fields are incomplete."
                )
            production_release_ids.append(
                _text(
                    movement["productionReleaseId"],
                    f"movements[{index}].productionReleaseId",
                    maximum=80,
                )
            )
            production_command_digest = _text(
                movement["productionCommandDigest"],
                f"movements[{index}].productionCommandDigest",
                maximum=71,
            )
            if _SHA256_DIGEST_PATTERN.fullmatch(production_command_digest) is None:
                raise TrialValidationError(
                    f"movements[{index}].productionCommandDigest is invalid."
                )
            _text(
                movement["productionJobId"],
                f"movements[{index}].productionJobId",
                maximum=80,
            )
            _text(
                movement["productionOutputBatchId"],
                f"movements[{index}].productionOutputBatchId",
                maximum=80,
            )
            production_source_product = _text(
                movement["productionSourceProduct"],
                f"movements[{index}].productionSourceProduct",
                maximum=180,
            )
            source_product_key = production_source_product.casefold()
            mapped_sku = production_sku_by_source_product.get(source_product_key)
            if mapped_sku is not None and mapped_sku != sku:
                raise TrialValidationError(
                    f"movements[{index}] conflicts with the retained Plant product mapping."
                )
            production_sku_by_source_product[source_product_key] = sku
            released_at = datetime.fromisoformat(
                _timestamp(
                    movement["productionReleasedAt"],
                    f"movements[{index}].productionReleasedAt",
                ).replace("Z", "+00:00")
            )
            received_at = datetime.fromisoformat(
                _timestamp(
                    movement["createdAt"], f"movements[{index}].createdAt"
                ).replace("Z", "+00:00")
            )
            if received_at < released_at:
                raise TrialValidationError(
                    f"movements[{index}] predates its Plant release."
                )
        elif (
            retained_production_fields
            or retained_production_return_fields
            or retained_production_receipt_fields
        ):
            raise TrialValidationError(
                f"movements[{index}] production fields are unsupported for {kind}."
            )
        if kind != "receipt" and retained_purchase_discrepancy_fields:
            raise TrialValidationError(
                f"movements[{index}] purchase discrepancy fields are unsupported for {kind}."
            )
        movements_by_action.setdefault(action_id, []).append(movement)
        if kind == "count":
            if "orderId" in movement or "purchaseOrderId" in movement:
                raise TrialValidationError(
                    f"movements[{index}] count cannot reference an order."
                )
            expected_quantity = _integer(
                movement.get("expectedQuantity"),
                f"movements[{index}].expectedQuantity",
            )
            counted_quantity = _integer(
                movement.get("countedQuantity"),
                f"movements[{index}].countedQuantity",
            )
            signed_delta = movement["quantityDelta"]
            if (
                isinstance(signed_delta, bool)
                or not isinstance(signed_delta, int)
                or not -_MAX_SAFE_INTEGER <= signed_delta <= _MAX_SAFE_INTEGER
                or signed_delta != counted_quantity - expected_quantity
            ):
                raise TrialValidationError(
                    f"movements[{index}] count variance is invalid."
                )
        else:
            if "expectedQuantity" in movement or "countedQuantity" in movement:
                raise TrialValidationError(
                    f"movements[{index}] count fields are unsupported for {kind}."
                )
        if kind == "opening":
            quantity_delta = _integer(movement["quantityDelta"], f"movements[{index}].quantityDelta")
        elif kind != "count":
            quantity_delta = _integer(abs(movement["quantityDelta"]) if isinstance(movement["quantityDelta"], int) and not isinstance(movement["quantityDelta"], bool) else movement["quantityDelta"], f"movements[{index}].quantityDelta", minimum=1)
            signed_delta = movement["quantityDelta"]
            if kind in {"reserve", "production_issue"} and signed_delta >= 0:
                raise TrialValidationError(
                    f"movements[{index}] {kind} must be negative."
                )
            if kind not in {"reserve", "production_issue"} and signed_delta <= 0:
                raise TrialValidationError(
                    f"movements[{index}] release, receipt, or return must be positive."
                )
        if kind in {"production_issue", "production_return", "production_receipt"}:
            movement_ids.append(movement_id)
            movement_action_ids.append(action_id)
            continue
        if kind in {"opening", "receipt", "count"}:
            if "orderId" in movement:
                raise TrialValidationError(f"movements[{index}] {kind} cannot reference an order.")
            rejected_quantity = 0
            if kind == "receipt" and retained_purchase_discrepancy_fields:
                if retained_purchase_discrepancy_fields != _PURCHASE_DISCREPANCY_FIELDS:
                    raise TrialValidationError(
                        f"movements[{index}] purchase discrepancy fields are incomplete."
                    )
                rejected_quantity = _integer(
                    movement["rejectedQuantity"],
                    f"movements[{index}].rejectedQuantity",
                    minimum=1,
                )
                if (
                    movement["discrepancyCode"] not in _PURCHASE_DISCREPANCY_CODES
                    or movement["discrepancyDisposition"] != "return_to_vendor"
                ):
                    raise TrialValidationError(
                        f"movements[{index}] purchase discrepancy is invalid."
                    )
                if "purchaseOrderId" not in movement:
                    raise TrialValidationError(
                        f"movements[{index}] purchase discrepancy requires a purchase order."
                    )
            if kind == "opening" and "purchaseOrderId" in movement:
                raise TrialValidationError(
                    f"movements[{index}] opening cannot reference a purchase order."
                )
            if kind == "receipt" and "purchaseOrderId" in movement:
                purchase_order_id = _text(
                    movement["purchaseOrderId"],
                    f"movements[{index}].purchaseOrderId",
                    maximum=80,
                )
                purchase_order = purchase_order_by_id.get(purchase_order_id)
                receipt_at = datetime.fromisoformat(
                    str(movement["createdAt"]).replace("Z", "+00:00")
                )
                if (
                    purchase_order is None
                    or purchase_order["sku"] != sku
                    or receipt_at
                    < datetime.fromisoformat(
                        str(purchase_order["createdAt"]).replace("Z", "+00:00")
                    )
                    or (
                        "cancellation" in purchase_order
                        and receipt_at
                        > datetime.fromisoformat(
                            str(
                                purchase_order["cancellation"]["capturedAt"]
                            ).replace("Z", "+00:00")
                        )
                    )
                ):
                    raise TrialValidationError(
                        f"movements[{index}] does not match its purchase order."
                    )
                received = (
                    receipt_quantity_by_purchase_order.get(purchase_order_id, 0)
                    + quantity_delta
                )
                rejected = (
                    rejected_quantity_by_purchase_order.get(purchase_order_id, 0)
                    + rejected_quantity
                )
                delivered = received + rejected
                if (
                    delivered > purchase_order["quantityOrdered"]
                    or received > _MAX_SAFE_INTEGER
                    or rejected > _MAX_SAFE_INTEGER
                    or delivered > _MAX_SAFE_INTEGER
                ):
                    raise TrialValidationError(
                        f"movements[{index}] exceeds its purchase order quantity."
                    )
                receipt_quantity_by_purchase_order[purchase_order_id] = received
                rejected_quantity_by_purchase_order[purchase_order_id] = rejected
                latest_receipt_at_by_purchase_order[purchase_order_id] = max(
                    latest_receipt_at_by_purchase_order.get(
                        purchase_order_id,
                        datetime.min.replace(tzinfo=timezone.utc),
                    ),
                    receipt_at,
                )
        else:
            if "purchaseOrderId" in movement:
                raise TrialValidationError(
                    f"movements[{index}] sales movement cannot reference a purchase order."
                )
            order_id = _text(movement.get("orderId"), f"movements[{index}].orderId", maximum=160)
            if kind == "return":
                matching_returns = [
                    record
                    for return_order_id, record in order_returns
                    if return_order_id == order_id
                    and record["actionId"] == action_id
                ]
                if len(matching_returns) != 1:
                    raise TrialValidationError(
                        f"movements[{index}] does not match one order return."
                    )
                return_record = matching_returns[0]
                if (
                    return_record["disposition"] != "restock"
                    or movement["sku"] != return_record["sku"]
                    or movement["quantityDelta"] != return_record["quantity"]
                    or movement["id"] != _movement_id(action_id)
                    or movement["createdAt"] != return_record["createdAt"]
                    or movement["actor"] != return_record["actor"]
                    or movement["reason"] != return_record["reason"]
                    or movement["evidenceReference"]
                    != return_record["evidenceReference"]
                ):
                    raise TrialValidationError(
                        f"movements[{index}] does not match one sellable order return."
                    )
            else:
                order = order_by_id.get(order_id)
                matching_lines = [
                    line
                    for line in (_reservation_lines(order) if order else [])
                    if line["sku"] == sku
                ]
                if not order or len(matching_lines) != 1 or quantity_delta != matching_lines[0]["quantity"]:
                    raise TrialValidationError(f"movements[{index}] does not match its order reservation.")
                counter = reserve_by_order if kind == "reserve" else release_by_order
                counter[order_id] = counter.get(order_id, 0) + 1
                actions = (
                    reserve_actions_by_order
                    if kind == "reserve"
                    else release_actions_by_order
                )
                actions.setdefault(order_id, set()).add(action_id)
                if kind == "reserve":
                    reserve_movement_by_order.setdefault(order_id, movement)
                if kind == "release" and order["status"] != "cancelled":
                    raise TrialValidationError(f"movements[{index}] release requires a cancelled order.")
        movement_ids.append(movement_id)
        movement_action_ids.append(action_id)
    _unique(movement_ids, "Stock movement ID")
    _unique(production_request_ids, "Production material request ID")
    _unique(production_release_ids, "Production batch release ID")
    production_issues_by_action = {
        str(movement["actionId"]): movement
        for movement in movements
        if movement.get("kind") == "production_issue"
    }
    production_returned_by_issue: dict[str, dict[str, int]] = {}
    for movement in movements:
        if movement.get("kind") != "production_return":
            continue
        source_issue_action_id = str(movement["productionIssueActionId"])
        issue = production_issues_by_action.get(source_issue_action_id)
        if issue is None:
            raise TrialValidationError(
                f"Production return {movement['actionId']} does not reference one retained Plant issue."
            )
        identity_fields = (
            "sku",
            "productionRequestId",
            "productionCommandDigest",
            "productionJobId",
            "productionMaterialId",
            "productionInputLotId",
            "productionQuantityMilli",
            "productionUnit",
            "conversionNote",
        )
        if any(movement[field] != issue[field] for field in identity_fields):
            raise TrialValidationError(
                f"Production return {movement['actionId']} does not match its immutable Plant issue."
            )
        if datetime.fromisoformat(
            str(movement["createdAt"]).replace("Z", "+00:00")
        ) < datetime.fromisoformat(str(issue["createdAt"]).replace("Z", "+00:00")):
            raise TrialValidationError(
                f"Production return {movement['actionId']} predates its Plant issue."
            )
        returned_production_quantity_milli = int(
            movement["productionReturnedQuantityMilli"]
        )
        returned_stock_quantity = int(movement["quantityDelta"])
        if (
            returned_production_quantity_milli * -int(issue["quantityDelta"])
            != returned_stock_quantity * int(issue["productionQuantityMilli"])
        ):
            raise TrialValidationError(
                f"Production return {movement['actionId']} does not preserve its reviewed conversion ratio."
            )
        returned = production_returned_by_issue.get(
            source_issue_action_id,
            {"productionQuantityMilli": 0, "stockQuantity": 0},
        )
        next_production_quantity_milli = (
            returned["productionQuantityMilli"]
            + returned_production_quantity_milli
        )
        next_stock_quantity = returned["stockQuantity"] + returned_stock_quantity
        if (
            next_production_quantity_milli > int(issue["productionQuantityMilli"])
            or next_stock_quantity > -int(issue["quantityDelta"])
        ):
            raise TrialValidationError(
                f"Production return {movement['actionId']} exceeds its Plant issue."
            )
        production_returned_by_issue[source_issue_action_id] = {
            "productionQuantityMilli": next_production_quantity_milli,
            "stockQuantity": next_stock_quantity,
        }
    for order_id, return_record in order_returns:
        order = order_by_id.get(order_id)
        lines = _reservation_lines(order) if order else []
        reserves = [
            movement
            for movement in movements
            if movement.get("kind") == "reserve"
            and movement.get("orderId") == order_id
        ]
        releases = [
            movement
            for movement in movements
            if movement.get("kind") == "release"
            and movement.get("orderId") == order_id
        ]
        if (
            order is None
            or order["status"] != "completed"
            or "completion" not in order
            or not lines
            or len(reserves) != len(lines)
            or releases
            or any(
                len(
                    [
                        reserve
                        for reserve in reserves
                        if reserve["sku"] == line["sku"]
                        and reserve["quantityDelta"] == -line["quantity"]
                    ]
                )
                != 1
                for line in lines
            )
        ):
            raise TrialValidationError(
                f"Order return {return_record['actionId']} is not bound "
                "to one completed, reserved sale."
            )
        latest_basis = max(
            [
                datetime.fromisoformat(
                    str(order["createdAt"]).replace("Z", "+00:00")
                ),
                datetime.fromisoformat(
                    str(order["completion"]["capturedAt"]).replace("Z", "+00:00")
                ),
                *(
                    [
                        datetime.fromisoformat(
                            str(order["paymentReconciledAt"]).replace(
                                "Z",
                                "+00:00",
                            )
                        )
                    ]
                    if "paymentReconciledAt" in order
                    else []
                ),
                *[
                    datetime.fromisoformat(
                        str(reserve["createdAt"]).replace("Z", "+00:00")
                    )
                    for reserve in reserves
                ],
            ]
        )
        if datetime.fromisoformat(
            str(return_record["createdAt"]).replace("Z", "+00:00")
        ) < latest_basis:
            raise TrialValidationError(
                f"Order return {return_record['actionId']} predates its sale."
            )
        action_movements = movements_by_action.get(
            str(return_record["actionId"]),
            [],
        )
        matching_restock = (
            len(action_movements) == 1
            and action_movements[0]["kind"] == "return"
            and action_movements[0].get("orderId") == order_id
            and action_movements[0]["sku"] == return_record["sku"]
            and action_movements[0]["quantityDelta"] == return_record["quantity"]
            and action_movements[0]["createdAt"] == return_record["createdAt"]
            and action_movements[0]["actor"] == return_record["actor"]
            and action_movements[0]["reason"] == return_record["reason"]
            and action_movements[0]["evidenceReference"]
            == return_record["evidenceReference"]
        )
        if (
            return_record["disposition"] == "restock"
            and not matching_restock
        ) or (
            return_record["disposition"] == "not_restocked"
            and action_movements
        ):
            raise TrialValidationError(
                f"Order return {return_record['actionId']} has invalid stock linkage."
            )
    for action_id, action_movements in movements_by_action.items():
        if len(action_movements) < 2:
            continue
        first = action_movements[0]
        if (
            first["kind"] not in {"reserve", "release"}
            or not first.get("orderId")
            or len({movement["sku"] for movement in action_movements}) != len(action_movements)
            or any(
                movement["kind"] != first["kind"]
                or movement.get("orderId") != first["orderId"]
                or movement["createdAt"] != first["createdAt"]
                or movement["actor"] != first["actor"]
                or movement["reason"] != first["reason"]
                or movement["evidenceReference"] != first["evidenceReference"]
                for movement in action_movements
            )
        ):
            raise TrialValidationError(
                f"Stock movement action {action_id} is not one exact order reservation group."
            )
    for sku, item in item_by_sku.items():
        sku_movements = [
            movement for movement in movements if movement["sku"] == sku
        ]
        count_indexes = [
            index
            for index, movement in enumerate(sku_movements)
            if movement["kind"] == "count"
        ]
        if not count_indexes:
            continue
        balance = item["onHand"]
        for movement in sku_movements[: count_indexes[-1] + 1]:
            if (
                movement["kind"] == "count"
                and movement["countedQuantity"] != balance
            ):
                raise TrialValidationError(
                    f"Stock count {movement['actionId']} does not match "
                    f"the later movement history for {sku}."
                )
            prior_balance = balance - movement["quantityDelta"]
            _integer(prior_balance, f"Stock movement history for {sku}")
            if (
                movement["kind"] == "count"
                and movement["expectedQuantity"] != prior_balance
            ):
                raise TrialValidationError(
                    f"Stock count {movement['actionId']} does not match "
                    f"its expected balance for {sku}."
                )
            balance = prior_balance
    for order_id, count in reserve_by_order.items():
        order = order_by_id.get(order_id)
        reservation = reserve_movement_by_order.get(order_id)
        if (
            not order
            or count != len(_reservation_lines(order))
            or len(reserve_actions_by_order.get(order_id, set())) != 1
            or (
                "owner" in order
                and (not reservation or reservation["actor"] != order["owner"])
            )
        ):
            raise TrialValidationError(
                f"{order_id} does not have one owner-bound reservation action covering every order line."
            )
    for order_id, count in release_by_order.items():
        order = order_by_id.get(order_id)
        expected = len(_reservation_lines(order)) if order else 0
        if (
            not expected
            or count != expected
            or reserve_by_order.get(order_id) != expected
            or len(release_actions_by_order.get(order_id, set())) != 1
        ):
            raise TrialValidationError(f"{order_id} has an unproven stock release.")

    active_purchase_order_skus: list[str] = []
    for purchase_order_id, purchase_order in purchase_order_by_id.items():
        received = receipt_quantity_by_purchase_order.get(purchase_order_id, 0)
        rejected = rejected_quantity_by_purchase_order.get(purchase_order_id, 0)
        delivered = received + rejected
        for claim in purchase_order.get("supplierReturns", []):
            receipt = next(
                (
                    movement for movement in movements
                    if isinstance(movement, Mapping)
                    and movement.get("id") == claim["receiptMovementId"]
                ),
                None,
            )
            if (
                receipt is None
                or receipt.get("kind") != "receipt"
                or receipt.get("purchaseOrderId") != purchase_order_id
                or receipt.get("rejectedQuantity") != claim["quantityRejected"]
                or receipt.get("discrepancyCode") != claim["reasonCode"]
                or receipt.get("discrepancyDisposition") != "return_to_vendor"
                or "unitCostMmk" not in purchase_order
                or claim["quantityRejected"] * purchase_order["unitCostMmk"] > _MAX_SAFE_INTEGER
                or claim["claimAmountMmk"] != claim["quantityRejected"] * purchase_order["unitCostMmk"]
                or datetime.fromisoformat(str(claim["createdAt"]).replace("Z", "+00:00"))
                < datetime.fromisoformat(str(receipt["createdAt"]).replace("Z", "+00:00"))
            ):
                raise TrialValidationError(
                    f"{claim['id']} does not bind one exact rejected supplier receipt."
                )
        if "cancellation" in purchase_order:
            cancellation_at = datetime.fromisoformat(
                str(purchase_order["cancellation"]["capturedAt"]).replace(
                    "Z",
                    "+00:00",
                )
            )
            if (
                "supplierInvoice" in purchase_order
                or delivered >= purchase_order["quantityOrdered"]
                or cancellation_at
                < latest_receipt_at_by_purchase_order.get(
                    purchase_order_id,
                    datetime.fromisoformat(
                        str(purchase_order["createdAt"]).replace("Z", "+00:00")
                    ),
                )
            ):
                raise TrialValidationError(
                    f"{purchase_order_id} has an invalid cancellation boundary."
                )
        elif delivered < purchase_order["quantityOrdered"]:
            active_purchase_order_skus.append(purchase_order["sku"])
        invoice = purchase_order.get("supplierInvoice")
        if isinstance(invoice, Mapping) and "payableReview" in invoice:
            match = commerce_supplier_invoice_match(state, purchase_order)
            review_at = datetime.fromisoformat(
                str(invoice["payableReview"]["capturedAt"]).replace("Z", "+00:00")
            )
            if (
                match["status"] != "matched"
                or review_at
                < latest_receipt_at_by_purchase_order.get(
                    purchase_order_id,
                    datetime.fromisoformat(
                        str(invoice["recording"]["capturedAt"]).replace("Z", "+00:00")
                    ),
                )
            ):
                raise TrialValidationError(
                    f"{purchase_order_id} has an invalid payable-ready review."
                )
    _unique(active_purchase_order_skus, "Active purchase order SKU")

    close_ids: list[str] = []
    close_action_ids: list[str] = []
    close_business_dates: list[str] = []
    closed_order_ids: list[str] = []
    for index, candidate in enumerate(closes):
        close = _object(candidate, f"closes[{index}]")
        _exact_fields(
            close,
            f"closes[{index}]",
            required=_CLOSE_REQUIRED_FIELDS,
            optional=_CLOSE_OPTIONAL_FIELDS,
        )
        close_ids.append(_text(close["id"], f"closes[{index}].id", maximum=160))
        _timestamp(close["createdAt"], f"closes[{index}].createdAt")
        _integer(close["total"], f"closes[{index}].total")
        _integer(close["orders"], f"closes[{index}].orders")
        present_snapshot_fields = set(close) & _CLOSE_SNAPSHOT_FIELDS
        if present_snapshot_fields and present_snapshot_fields != _CLOSE_SNAPSHOT_FIELDS:
            raise TrialValidationError(
                f"closes[{index}] requires complete exception and operator evidence."
            )
        if present_snapshot_fields:
            business_date = _text(
                close["businessDate"],
                f"closes[{index}].businessDate",
                maximum=10,
            )
            order_ids_for_close = [
                _text(value, f"closes[{index}].orderIds[{reference_index}]", maximum=160)
                for reference_index, value in enumerate(
                    _list(close["orderIds"], f"closes[{index}].orderIds")
                )
            ]
            payment_exception_order_ids = [
                _text(value, f"closes[{index}].paymentExceptionOrderIds[{reference_index}]", maximum=160)
                for reference_index, value in enumerate(
                    _list(
                        close["paymentExceptionOrderIds"],
                        f"closes[{index}].paymentExceptionOrderIds",
                    )
                )
            ]
            stock_exception_skus = [
                _text(value, f"closes[{index}].stockExceptionSkus[{reference_index}]", maximum=80)
                for reference_index, value in enumerate(
                    _list(
                        close["stockExceptionSkus"],
                        f"closes[{index}].stockExceptionSkus",
                    )
                )
            ]
            if (
                not _BUSINESS_DATE_PATTERN.fullmatch(business_date)
                or business_date != _myanmar_business_date(str(close["createdAt"]))
            ):
                raise TrialValidationError(
                    f"closes[{index}].businessDate must match its close timestamp."
                )
            _unique(order_ids_for_close, f"closes[{index}] order ID")
            _unique(payment_exception_order_ids, f"closes[{index}] payment exception order ID")
            _unique(stock_exception_skus, f"closes[{index}] stock exception SKU")
            if order_ids_for_close != sorted(order_ids_for_close):
                raise TrialValidationError(f"closes[{index}] order IDs must be sorted.")
            if payment_exception_order_ids != sorted(payment_exception_order_ids):
                raise TrialValidationError(f"closes[{index}] payment exception order IDs must be sorted.")
            if stock_exception_skus != sorted(stock_exception_skus):
                raise TrialValidationError(f"closes[{index}] stock exception SKUs must be sorted.")
            if any(order_id not in order_by_id for order_id in order_ids_for_close):
                raise TrialValidationError(f"closes[{index}] references an unknown closed order.")
            if any(order_id not in order_by_id for order_id in payment_exception_order_ids):
                raise TrialValidationError(f"closes[{index}] references an unknown payment exception order.")
            if any(sku not in item_by_sku for sku in stock_exception_skus):
                raise TrialValidationError(f"closes[{index}] references an unknown stock exception SKU.")
            member_orders = [order_by_id[order_id] for order_id in order_ids_for_close]
            member_adjusted_totals = [_order_adjusted_total(order) for order in member_orders]
            if (
                any(
                    order["status"] != "completed"
                    or order["paymentStatus"] != "reconciled"
                    for order in member_orders
                )
                or any(total is None for total in member_adjusted_totals)
                or close["orders"] != len(order_ids_for_close)
                or close["total"] != sum(total or 0 for total in member_adjusted_totals)
            ):
                raise TrialValidationError(
                    f"closes[{index}] totals must match its completed, reconciled order membership."
                )
            if not _CLOSE_ID_PATTERN.fullmatch(str(close["id"])):
                raise TrialValidationError(f"closes[{index}].id must be a full close UUID.")
            close_action_id = _text(
                close["actionId"], f"closes[{index}].actionId", maximum=160
            )
            if not _CLOSE_ACTION_ID_PATTERN.fullmatch(close_action_id):
                raise TrialValidationError(
                    f"closes[{index}].actionId must be a full action UUID."
                )
            close_action_ids.append(close_action_id)
            close_business_dates.append(business_date)
            closed_order_ids.extend(order_ids_for_close)
            _text(close["operator"], f"closes[{index}].operator")
            _text(close["reason"], f"closes[{index}].reason")
            _text(close["evidenceReference"], f"closes[{index}].evidenceReference")
            if "settlement" in close:
                settlement = _object(close["settlement"], f"closes[{index}].settlement")
                _exact_fields(
                    settlement,
                    f"closes[{index}].settlement",
                    required=_CLOSE_SETTLEMENT_FIELDS,
                )
                if settlement["schema"] != COMMERCE_CLOSE_SETTLEMENT_SCHEMA or settlement["status"] not in {"matched", "variance_review"}:
                    raise TrialValidationError(f"closes[{index}].settlement contract is invalid.")
                expected_by_payment: dict[str, int] = {}
                for order, adjusted_total in zip(member_orders, member_adjusted_totals, strict=True):
                    assert adjusted_total is not None
                    payment_method = str(order["payment"])
                    expected_by_payment[payment_method] = expected_by_payment.get(payment_method, 0) + adjusted_total
                settlement_lines: list[dict[str, Any]] = []
                for line_index, candidate_line in enumerate(_list(settlement["lines"], f"closes[{index}].settlement.lines")):
                    field = f"closes[{index}].settlement.lines[{line_index}]"
                    line = _object(candidate_line, field)
                    _exact_fields(line, field, required=_CLOSE_SETTLEMENT_LINE_FIELDS)
                    payment_method = _text(line["paymentMethod"], f"{field}.paymentMethod", maximum=80)
                    expected_mmk = _integer(line["expectedMmk"], f"{field}.expectedMmk")
                    counted_mmk = _integer(line["countedMmk"], f"{field}.countedMmk")
                    variance_mmk = line["varianceMmk"]
                    if isinstance(variance_mmk, bool) or not isinstance(variance_mmk, int) or abs(variance_mmk) > _MAX_SAFE_INTEGER:
                        raise TrialValidationError(f"{field}.varianceMmk must be a safe integer.")
                    if expected_by_payment.get(payment_method) != expected_mmk or counted_mmk - expected_mmk != variance_mmk:
                        raise TrialValidationError(f"{field} does not match the closed orders.")
                    if variance_mmk == 0:
                        if line["status"] != "matched" or line["varianceOwner"] is not None or line["varianceReason"] is not None:
                            raise TrialValidationError(f"{field} matched evidence is invalid.")
                    else:
                        if line["status"] != "variance_review":
                            raise TrialValidationError(f"{field} variance status is invalid.")
                        _text(line["varianceOwner"], f"{field}.varianceOwner", maximum=80)
                        _text(line["varianceReason"], f"{field}.varianceReason", maximum=240)
                    settlement_lines.append(line)
                methods = [line["paymentMethod"] for line in settlement_lines]
                if methods != sorted(expected_by_payment):
                    raise TrialValidationError(f"closes[{index}].settlement payment methods are invalid.")
                total_expected = sum(line["expectedMmk"] for line in settlement_lines)
                total_counted = sum(line["countedMmk"] for line in settlement_lines)
                total_variance = sum(line["varianceMmk"] for line in settlement_lines)
                if (
                    any(abs(value) > _MAX_SAFE_INTEGER for value in (total_expected, total_counted, total_variance))
                    or settlement["totalExpectedMmk"] != total_expected
                    or settlement["totalCountedMmk"] != total_counted
                    or settlement["totalVarianceMmk"] != total_variance
                    or total_expected != close["total"]
                    or settlement["status"] != ("variance_review" if any(line["status"] == "variance_review" for line in settlement_lines) else "matched")
                ):
                    raise TrialValidationError(f"closes[{index}].settlement totals are invalid.")
    _unique(close_ids, "Daily close ID")
    _unique(close_business_dates, "Daily close business date")
    _unique(closed_order_ids, "Closed order ID")

    intake_ids: list[str] = []
    intake_sources: list[str] = []
    intake_action_ids: list[str] = []
    conversion_action_ids: list[str] = []
    for index, candidate in enumerate(website_intakes):
        field = f"websiteIntakes[{index}]"
        intake = _object(candidate, field)
        _exact_fields(
            intake,
            field,
            required=_WEBSITE_INTAKE_REQUIRED_FIELDS,
            optional=_WEBSITE_INTAKE_OPTIONAL_FIELDS,
        )
        intake_id = _text(intake["id"], f"{field}.id", maximum=85)
        if _WEBSITE_INTAKE_ID_PATTERN.fullmatch(intake_id) is None:
            raise TrialValidationError(f"{field}.id is invalid.")
        created_at = _timestamp(intake["createdAt"], f"{field}.createdAt")
        if intake["status"] not in _WEBSITE_INTAKE_STATUSES:
            raise TrialValidationError(f"{field}.status is invalid.")

        source = _object(intake["source"], f"{field}.source")
        _exact_fields(source, f"{field}.source", required=_WEBSITE_SOURCE_FIELDS)
        fingerprint = _text(source["fingerprint"], f"{field}.source.fingerprint", maximum=12)
        if _WEBSITE_FINGERPRINT_PATTERN.fullmatch(fingerprint) is None:
            raise TrialValidationError(f"{field}.source.fingerprint must match web-[a-f0-9]{{8}}.")
        approval_id = _text(source["approvalId"], f"{field}.source.approvalId", maximum=160)
        snapshot_id = _text(source["snapshotId"], f"{field}.source.snapshotId", maximum=160)
        page_id = _text(source["pageId"], f"{field}.source.pageId", maximum=160)
        _text(source["siteName"], f"{field}.source.siteName", maximum=160)
        page_path = _text(source["pagePath"], f"{field}.source.pagePath", maximum=160)
        if not page_path.startswith("/"):
            raise TrialValidationError(f"{field}.source.pagePath must be absolute.")

        sku = _text(intake["sku"], f"{field}.sku", maximum=80)
        quantity = _integer(intake["quantity"], f"{field}.quantity", minimum=1)
        item = item_by_sku.get(sku)
        if item is None:
            raise TrialValidationError(f"{field}.sku is unknown.")
        item_name = _text(intake["itemName"], f"{field}.itemName")
        item_variant = _text(intake["itemVariant"], f"{field}.itemVariant") if "itemVariant" in intake else None
        unit_price = _integer(intake["unitPrice"], f"{field}.unitPrice", minimum=1)
        total = _integer(intake["total"], f"{field}.total", minimum=1)
        if (
            item_name != item["name"]
            or item_variant != item.get("variant")
            or total != quantity * unit_price
        ):
            raise TrialValidationError(
                f"{field} does not match its retained Commerce snapshot."
            )

        creation = _action_proof(intake["creation"], f"{field}.creation")
        if creation["capturedAt"] != created_at:
            raise TrialValidationError(f"{field}.creation must be captured when the intake was created.")
        if "snapshotDigest" in intake:
            snapshot_digest = _text(
                intake["snapshotDigest"],
                f"{field}.snapshotDigest",
                maximum=71,
            )
            if (
                _SHA256_DIGEST_PATTERN.fullmatch(snapshot_digest) is None
                or snapshot_digest != commerce_website_intake_snapshot_digest(intake)
            ):
                raise TrialValidationError(f"{field}.snapshotDigest is invalid.")
        intake_action_ids.append(creation["actionId"])

        matching_source_orders = [
            order for order in order_by_id.values() if order.get("sourceRecordId") == intake_id
        ]
        if intake["status"] == "pending_confirmation":
            if "conversion" in intake or matching_source_orders:
                raise TrialValidationError(f"{field} pending intake cannot have conversion history.")
        else:
            if "conversion" not in intake:
                raise TrialValidationError(f"{field}.conversion is required after conversion.")
            conversion = _action_proof(intake["conversion"], f"{field}.conversion", with_order_id=True)
            order = order_by_id.get(conversion["orderId"])
            reserve = reserve_movement_by_order.get(conversion["orderId"])
            if (
                len(matching_source_orders) != 1
                or order is None
                or matching_source_orders[0].get("id") != order["id"]
                or order["createdAt"] != conversion["capturedAt"]
                or order["channel"] != "Website"
                or order["item"] != item_name
                or order.get("itemSku") != sku
                or order["quantity"] != quantity
                or order["total"] != total
                or order.get("evidenceReference") != conversion["evidenceReference"]
                or reserve is None
                or any(
                    reserve.get(movement_field) != conversion[proof_field]
                    for movement_field, proof_field in (
                        ("actionId", "actionId"),
                        ("createdAt", "capturedAt"),
                        ("actor", "actor"),
                        ("reason", "reason"),
                        ("evidenceReference", "evidenceReference"),
                    )
                )
            ):
                raise TrialValidationError(f"{field} does not match its converted Website order.")
            intake_action_ids.append(conversion["actionId"])
            conversion_action_ids.append(conversion["actionId"])

        intake_ids.append(intake_id)
        intake_sources.append("|".join((fingerprint, approval_id, snapshot_id, page_id)))

    _unique(intake_ids, "Website intake ID")
    _unique(intake_sources, "Website intake source")
    _unique(intake_action_ids, "Website intake action ID")
    storefront_request_ids: list[str] = []
    storefront_idempotency_keys: list[str] = []
    storefront_action_ids: list[str] = []
    for index, candidate in enumerate(storefront_requests):
        request = _storefront_request(candidate, f"storefrontRequests[{index}]")
        storefront_request_ids.append(request["id"])
        storefront_idempotency_keys.append(request["idempotencyKey"])
        storefront_action_ids.append(f"ACT-{request['id'][4:]}")
    _unique(storefront_request_ids, "Storefront request ID")
    _unique(storefront_idempotency_keys, "Storefront request idempotency key")
    catalog_baseline_action_set = set(catalog_baseline_action_ids)
    for action_id in catalog_baseline_action_set:
        baselines = [
            baseline
            for baseline in catalog_baseline_by_sku.values()
            if baseline["proof"]["actionId"] == action_id
        ]
        matching_changes = [
            change
            for change in catalog_changes
            if change["proof"]["actionId"] == action_id
        ]
        matching_movements = movements_by_action.get(action_id, [])
        if matching_changes and matching_movements:
            raise TrialValidationError(
                f"Catalog baseline action {action_id} cannot anchor two event types."
            )
        if matching_changes:
            baseline = baselines[0] if len(baselines) == 1 else None
            change = matching_changes[0] if len(matching_changes) == 1 else None
            if (
                baseline is None
                or change is None
                or newest_change_by_sku.get(baseline["sku"]) != change
                or change["sku"] != baseline["sku"]
                or change["proof"] != baseline["proof"]
            ):
                raise TrialValidationError(
                    f"Catalog baseline action {action_id} does not match its first catalog change."
                )
        if matching_movements:
            baseline = baselines[0] if len(baselines) == 1 else None
            movement = (
                matching_movements[0]
                if len(matching_movements) == 1
                else None
            )
            proof = baseline["proof"] if baseline is not None else {}
            if (
                baseline is None
                or movement is None
                or movement["kind"] != "opening"
                or movement["sku"] != baseline["sku"]
                or any(
                    movement[movement_field] != proof[proof_field]
                    for movement_field, proof_field in (
                        ("actionId", "actionId"),
                        ("createdAt", "capturedAt"),
                        ("actor", "actor"),
                        ("reason", "reason"),
                        ("evidenceReference", "evidenceReference"),
                    )
                )
            ):
                raise TrialValidationError(
                    f"Catalog baseline action {action_id} does not match its opening balance."
                )
    _unique(
        [
            *(
                action_id
                for action_id in dict.fromkeys(movement_action_ids)
                if action_id not in conversion_action_ids
                and action_id not in return_action_ids
                and action_id not in catalog_baseline_action_set
            ),
            *reconciliation_action_ids,
            *refund_settlement_action_ids,
            *advancement_action_ids,
            *completion_action_ids,
            *return_action_ids,
            *support_action_ids,
            *correction_action_ids,
            *collection_action_ids,
            *intake_action_ids,
            *close_action_ids,
            *purchase_budget_action_ids,
            *supplier_sourcing_action_ids,
            *purchase_requisition_action_ids,
            *purchase_order_action_ids,
            *(
                action_id
                for action_id in catalog_change_action_ids
                if action_id not in catalog_baseline_action_set
            ),
            *catalog_baseline_action_set,
            *tax_configuration_action_ids,
            *account_mapping_configuration_action_ids,
            *customer_credit_policy_action_ids,
            *promotion_policy_action_ids,
            *shipping_policy_action_ids,
            *payment_policy_action_ids,
            *storefront_action_ids,
            *(
                [storefront_configuration_action_id]
                if storefront_configuration_action_id
                else []
            ),
        ],
        "Commerce action ID",
    )
    return deepcopy(state)


def _payload(payload: Mapping[str, Any]) -> tuple[dict[str, Any], dict[str, str]]:
    if set(payload) != {"state", "evidence"}:
        raise TrialValidationError("Commerce payload must contain exactly state and evidence objects.")
    evidence = _object(payload.get("evidence"), "evidence")
    _exact_fields(evidence, "evidence", required=_EVIDENCE_FIELDS)
    validated_evidence = {
        "actionId": _text(evidence["actionId"], "evidence.actionId", maximum=160),
        "capturedAt": _timestamp(evidence["capturedAt"], "evidence.capturedAt"),
        "actor": _text(evidence["actor"], "evidence.actor"),
        "reason": _text(evidence["reason"], "evidence.reason"),
        "evidenceReference": _text(evidence["evidenceReference"], "evidence.evidenceReference"),
    }
    return validate_commerce_state(payload.get("state")), validated_evidence


def _apply_storefront_merchandising_import(
    current: Mapping[str, Any],
    payload: Mapping[str, Any],
) -> dict[str, Any]:
    if set(payload) != {"commandId", "package", "evidence"}:
        raise TrialValidationError(
            "Ecommerce merchandising import must contain exactly commandId, package, and evidence."
        )
    command_id = _text(payload.get("commandId"), "commandId", maximum=36)
    if _COMMAND_ID_PATTERN.fullmatch(command_id) is None:
        raise TrialValidationError("commandId must be a canonical UUID.")
    try:
        validation = validate_client_import_staging_package(payload.get("package"))
    except ClientImportValidationError as exc:
        raise TrialValidationError("Ecommerce merchandising import package is invalid.") from exc
    if validation.product != "ecommerce" or validation.object_id != "storefront_merchandising":
        raise TrialValidationError("Ecommerce merchandising import package has the wrong product boundary.")
    if not 1 <= validation.row_count <= 8:
        raise TrialValidationError("Ecommerce merchandising import must contain 1 to 8 Shop SKUs.")

    evidence = _object(payload.get("evidence"), "evidence")
    _exact_fields(evidence, "evidence", required=_EVIDENCE_FIELDS)
    validated_evidence = {
        "actionId": _text(evidence["actionId"], "evidence.actionId", maximum=160),
        "capturedAt": _timestamp(evidence["capturedAt"], "evidence.capturedAt"),
        "actor": _text(evidence["actor"], "evidence.actor"),
        "reason": _text(evidence["reason"], "evidence.reason"),
        "evidenceReference": _text(
            evidence["evidenceReference"],
            "evidence.evidenceReference",
        ),
    }
    if (
        validated_evidence["actionId"] != f"ACT-IMPORT-{command_id}"
        or validated_evidence["reason"]
        != "Apply the reviewed Ecommerce merchandising import."
        or validated_evidence["evidenceReference"] != validation.package_digest
    ):
        raise TrialValidationError(
            "Ecommerce merchandising import evidence does not match the reviewed package."
        )

    current_state = validate_commerce_state(current)
    configuration = _storefront_configuration(current_state)
    if configuration is None:
        raise TrialValidationError(
            "Save the Ecommerce storefront name and summary before importing merchandising."
        )
    if configuration["revision"] >= _MAX_SAFE_INTEGER:
        raise TrialValidationError("Ecommerce storefront revision is exhausted.")

    package = payload["package"]
    rows = package["rows"]
    merchandising = sorted(
        (
            {
                "sku": row["values"]["sku"],
                "featured": row["values"]["featured"] == "true",
                "collection": row["values"]["collection"],
                "displayName": row["values"]["displayName"],
                "note": row["values"]["note"],
            }
            for row in rows
        ),
        key=lambda row: row["sku"],
    )
    selected_skus = [row["sku"] for row in merchandising]
    item_skus = {item["sku"] for item in current_state["items"]}
    if any(sku not in item_skus for sku in selected_skus):
        raise TrialValidationError(
            "Every imported Ecommerce SKU must exist in the current Shop catalog."
        )

    catalog_digest = commerce_catalog_digest(current_state)
    if (
        configuration["shopCatalogDigest"] == catalog_digest
        and configuration["selectedSkus"] == selected_skus
        and configuration.get("merchandising") == merchandising
    ):
        raise TrialValidationError(
            "The reviewed Ecommerce merchandising import does not change the storefront."
        )
    revision = configuration["revision"] + 1
    catalog_revision = configuration["shopCatalogSnapshotRevision"]
    if configuration["shopCatalogDigest"] != catalog_digest:
        if catalog_revision >= _MAX_SAFE_INTEGER:
            raise TrialValidationError("Shop catalog snapshot revision is exhausted.")
        catalog_revision += 1
    next_state = deepcopy(current_state)
    next_state["storefrontConfiguration"] = {
        "schema": "supermega.ecommerce.storefront.v1",
        "revision": revision,
        "shopCatalogSnapshotRevision": catalog_revision,
        "shopCatalogDigest": catalog_digest,
        "storeName": configuration["storeName"],
        "summary": configuration["summary"],
        "selectedSkus": selected_skus,
        "merchandising": merchandising,
        "activation": {
            "contract": "supermega.ecommerce.activation.v1",
            "packageDigest": validation.package_digest,
            "workflowTemplateId": validation.workflow_template_id,
            "confirmedAt": validated_evidence["capturedAt"],
            "skus": selected_skus,
        },
        "saved": {
            "actionId": _storefront_configuration_action_id(revision, catalog_digest),
            "capturedAt": validated_evidence["capturedAt"],
            "actor": validated_evidence["actor"],
            "reason": validated_evidence["reason"],
            "evidenceReference": f"ECOMMERCE-STOREFRONT:{catalog_digest}:R{revision}",
        },
    }
    return validate_commerce_state(next_state)


def _proof_matches_evidence(proof: Mapping[str, Any], evidence: Mapping[str, str]) -> bool:
    return all(
        proof.get(proof_field) == evidence[evidence_field]
        for proof_field, evidence_field in (
            ("actionId", "actionId"),
            ("capturedAt", "capturedAt"),
            ("actor", "actor"),
            ("reason", "reason"),
            ("evidenceReference", "evidenceReference"),
        )
    )


def _validate_event_evidence(
    event_type: str,
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
    evidence: Mapping[str, str],
) -> None:
    if (
        event_type
        in {"commerce.order.created", "commerce.website_intake.converted"}
        and next_state["orders"][0].get("owner") != evidence["actor"]
    ):
        raise TrialValidationError(
            "command evidence actor must be the new order owner."
        )
    if event_type == "commerce.item.updated":
        changes = _catalog_changes(next_state)
        proof = changes[0]["proof"] if changes else {}
        if not isinstance(proof, Mapping) or not _proof_matches_evidence(
            proof,
            evidence,
        ):
            raise TrialValidationError(
                "command evidence must match the catalog change proof."
            )
    elif event_type == "commerce.website_intake.created":
        creation = next_state["websiteIntakes"][0]["creation"]
        if not _proof_matches_evidence(creation, evidence):
            raise TrialValidationError("command evidence must match the Website intake creation proof.")
    elif event_type == "commerce.website_intake.converted":
        conversions = [
            intake["conversion"]
            for intake in next_state["websiteIntakes"]
            if intake.get("conversion", {}).get("actionId") == evidence["actionId"]
        ]
        if len(conversions) != 1 or not _proof_matches_evidence(conversions[0], evidence):
            raise TrialValidationError("command evidence must match the Website intake conversion proof.")
    elif event_type == "commerce.storefront_request.received":
        request = next_state["storefrontRequests"][0]
        requested_at = datetime.fromisoformat(
            request["createdAt"].replace("Z", "+00:00")
        )
        received_at = datetime.fromisoformat(
            evidence["capturedAt"].replace("Z", "+00:00")
        )
        if (
            evidence["actionId"] != f"ACT-{request['id'][4:]}"
            or evidence["evidenceReference"]
            != f"ECOMMERCE:{request['id']}:{request['sourcePreviewDigest']}"
            or received_at < requested_at
            or (
                request["schema"] == "supermega.ecommerce.order_request.v2"
                and received_at
                > datetime.fromisoformat(
                    request["quote"]["expiresAt"].replace("Z", "+00:00")
                )
            )
        ):
            raise TrialValidationError("command evidence must match the retained Ecommerce request receipt.")
    elif event_type == "commerce.storefront.configuration.saved":
        saved = next_state["storefrontConfiguration"]["saved"]
        if not _proof_matches_evidence(saved, evidence):
            raise TrialValidationError(
                "command evidence must match the saved Ecommerce storefront configuration."
            )
    elif event_type == "commerce.tax_configuration.saved":
        proof = next_state["taxConfigurations"][0]["proof"]
        if not _proof_matches_evidence(proof, evidence):
            raise TrialValidationError(
                "command evidence must match the saved tax configuration proof."
            )
    elif event_type == "commerce.account_mapping.saved":
        proof = next_state["accountMappingConfigurations"][0]["proof"]
        if not _proof_matches_evidence(proof, evidence):
            raise TrialValidationError(
                "command evidence must match the saved account mapping proof."
            )
    elif event_type == "commerce.customer_credit_policy.saved":
        proof = next_state["customerCreditPolicies"][0]["proof"]
        if not _proof_matches_evidence(proof, evidence):
            raise TrialValidationError(
                "command evidence must match the saved customer credit policy proof."
            )
    elif event_type == "commerce.promotion_policy.saved":
        proof = next_state["promotionPolicies"][0]["proof"]
        if not _proof_matches_evidence(proof, evidence):
            raise TrialValidationError(
                "command evidence must match the saved promotion policy proof."
            )
    elif event_type == "commerce.shipping_policy.saved":
        proof = next_state["shippingPolicies"][0]["proof"]
        if not _proof_matches_evidence(proof, evidence):
            raise TrialValidationError(
                "command evidence must match the saved shipping policy proof."
            )
    elif event_type == "commerce.payment_policy.saved":
        proof = next_state["paymentPolicies"][0]["proof"]
        if not _proof_matches_evidence(proof, evidence):
            raise TrialValidationError(
                "command evidence must match the saved payment policy proof."
            )
    elif event_type == "commerce.service_schedule.initialized":
        schedule = next_state["serviceSchedule"]
        pack_id = schedule["industryPackId"]
        if (
            evidence["actionId"] != f"ACT-SERVICE-SCHEDULE-INIT-{pack_id.upper()}"
            or evidence["reason"] != f"Initialize the reviewed {pack_id} Shop industry pack."
            or evidence["evidenceReference"] != f"SHOP-SERVICE-SCHEDULE:{pack_id}:R0"
        ):
            raise TrialValidationError(
                "command evidence must match the initialized service schedule pack."
            )
    elif event_type == "commerce.service_schedule.saved":
        schedule = next_state["serviceSchedule"]
        latest = schedule["events"][-1]
        revision = schedule["revision"]
        if (
            latest["actor"] != evidence["actor"]
            or latest["reason"] != evidence["reason"]
            or latest["happenedAt"] != evidence["capturedAt"]
            or evidence["actionId"] != f"ACT-SERVICE-SCHEDULE-R{revision}"
            or evidence["evidenceReference"] != f"SHOP-SERVICE-SCHEDULE:R{revision}"
        ):
            raise TrialValidationError(
                "command evidence must match the saved service schedule revision."
            )
    elif event_type == "commerce.purchase_budget.approved":
        approval = next_state["purchaseBudgetEnvelopes"][0]["approval"]
        if not _proof_matches_evidence(approval, evidence):
            raise TrialValidationError(
                "command evidence must match the purchase budget approval proof."
            )
    elif event_type == "commerce.supplier_sourcing.approved":
        approval = next_state["supplierSourcingDecisions"][0]["approval"]
        if not _proof_matches_evidence(approval, evidence):
            raise TrialValidationError(
                "command evidence must match the supplier sourcing approval proof."
            )
    elif event_type == "commerce.purchase_requisition.approved":
        approval = next_state["purchaseRequisitions"][0]["approval"]
        if not _proof_matches_evidence(approval, evidence):
            raise TrialValidationError(
                "command evidence must match the purchase requisition approval proof."
            )
    elif event_type == "commerce.purchase_order.created":
        creation = next_state["purchaseOrders"][0]["creation"]
        if not _proof_matches_evidence(creation, evidence):
            raise TrialValidationError(
                "command evidence must match the purchase order creation proof."
            )
    elif event_type == "commerce.purchase_order.cancelled":
        _, cancelled_purchase_order = _one_changed(
            _purchase_orders(current),
            _purchase_orders(next_state),
            "purchaseOrders",
        )
        cancellation = cancelled_purchase_order.get("cancellation")
        if not isinstance(cancellation, Mapping) or not _proof_matches_evidence(
            cancellation,
            evidence,
        ):
            raise TrialValidationError(
                "command evidence must match the purchase order cancellation proof."
            )
    elif event_type == "commerce.supplier_invoice.recorded":
        _, changed_purchase_order = _one_changed(
            _purchase_orders(current),
            _purchase_orders(next_state),
            "purchaseOrders",
        )
        invoice = changed_purchase_order.get("supplierInvoice")
        recording = invoice.get("recording") if isinstance(invoice, Mapping) else None
        if not isinstance(recording, Mapping) or not _proof_matches_evidence(
            recording, evidence
        ):
            raise TrialValidationError(
                "command evidence must match the supplier invoice recording proof."
            )
    elif event_type == "commerce.supplier_invoice.payable_ready":
        _, changed_purchase_order = _one_changed(
            _purchase_orders(current),
            _purchase_orders(next_state),
            "purchaseOrders",
        )
        invoice = changed_purchase_order.get("supplierInvoice")
        review = invoice.get("payableReview") if isinstance(invoice, Mapping) else None
        if not isinstance(review, Mapping) or not _proof_matches_evidence(
            review, evidence
        ):
            raise TrialValidationError(
                "command evidence must match the supplier invoice payable-ready review proof."
            )
    elif event_type == "commerce.supplier_return.authorized":
        _, changed_purchase_order = _one_changed(
            _purchase_orders(current), _purchase_orders(next_state), "purchaseOrders"
        )
        returns = changed_purchase_order.get("supplierReturns")
        authorization = returns[0].get("authorization") if isinstance(returns, list) and returns and isinstance(returns[0], Mapping) else None
        if not isinstance(authorization, Mapping) or not _proof_matches_evidence(authorization, evidence):
            raise TrialValidationError(
                "command evidence must match the supplier return authorization proof."
            )
    elif event_type == "commerce.supplier_credit.recorded":
        _, changed_purchase_order = _one_changed(
            _purchase_orders(current), _purchase_orders(next_state), "purchaseOrders"
        )
        recordings = [
            credit["recording"]
            for claim in changed_purchase_order.get("supplierReturns", [])
            if isinstance(claim, Mapping)
            for credit in claim.get("creditNotes", [])
            if isinstance(credit, Mapping)
            and isinstance(credit.get("recording"), Mapping)
            and credit["recording"].get("actionId") == evidence["actionId"]
        ]
        if len(recordings) != 1 or not _proof_matches_evidence(recordings[0], evidence):
            raise TrialValidationError(
                "command evidence must match the supplier credit recording proof."
            )
    elif event_type == "commerce.order.advanced":
        _, advanced_order = _one_changed(
            current["orders"],
            next_state["orders"],
            "orders",
        )
        completion = advanced_order.get("completion")
        if advanced_order["status"] == "completed":
            if (
                not isinstance(completion, Mapping)
                or not _proof_matches_evidence(completion, evidence)
            ):
                raise TrialValidationError(
                    "command evidence must match the order completion proof."
                )
        else:
            advancement_action_ids = advanced_order.get(
                "advancementActionIds"
            )
            if (
                not isinstance(advancement_action_ids, list)
                or not advancement_action_ids
                or advancement_action_ids[-1] != evidence["actionId"]
            ):
                raise TrialValidationError(
                    "command evidence must match the order advancement action ID."
                )
    elif event_type == "commerce.order.return_recorded":
        _, returned_order = _one_changed(
            current["orders"],
            next_state["orders"],
            "orders",
        )
        returns = returned_order.get("returns")
        record = returns[0] if isinstance(returns, list) and returns else {}
        if any(
            record.get(record_field) != evidence[evidence_field]
            for record_field, evidence_field in (
                ("actionId", "actionId"),
                ("createdAt", "capturedAt"),
                ("actor", "actor"),
                ("reason", "reason"),
                ("evidenceReference", "evidenceReference"),
            )
        ):
            raise TrialValidationError(
                "command evidence must match the order return proof."
            )
    elif event_type == "commerce.order.support_case_opened":
        _, changed_order = _one_changed(current["orders"], next_state["orders"], "orders")
        cases = changed_order.get("supportCases")
        opening = cases[0].get("opening") if isinstance(cases, list) and cases else None
        if not isinstance(opening, Mapping) or not _proof_matches_evidence(opening, evidence):
            raise TrialValidationError(
                "command evidence must match the support case opening proof."
            )
    elif event_type == "commerce.order.support_case_reopened":
        before_order, after_order = _one_changed(current["orders"], next_state["orders"], "orders")
        before_by_id = {
            case.get("caseId"): case
            for case in before_order.get("supportCases", [])
            if isinstance(case, Mapping)
        }
        changed = [
            case
            for case in after_order.get("supportCases", [])
            if isinstance(case, Mapping) and case != before_by_id.get(case.get("caseId"))
        ]
        reopen = changed[0].get("reopen") if len(changed) == 1 else None
        proof = reopen.get("proof") if isinstance(reopen, Mapping) else None
        if not isinstance(proof, Mapping) or not _proof_matches_evidence(proof, evidence):
            raise TrialValidationError(
                "command evidence must match the support case reopen proof."
            )
    elif event_type == "commerce.order.support_case_service_recorded":
        before_order, after_order = _one_changed(current["orders"], next_state["orders"], "orders")
        before_by_id = {
            case.get("caseId"): case
            for case in before_order.get("supportCases", [])
            if isinstance(case, Mapping)
        }
        changed = [
            case
            for case in after_order.get("supportCases", [])
            if isinstance(case, Mapping) and case != before_by_id.get(case.get("caseId"))
        ]
        event_field = (
            "followUpServiceEvents"
            if len(changed) == 1 and isinstance(changed[0].get("reopen"), Mapping)
            else "serviceEvents"
        )
        service_events = changed[0].get(event_field) if len(changed) == 1 else None
        proof = (
            service_events[0].get("proof")
            if isinstance(service_events, list)
            and service_events
            and isinstance(service_events[0], Mapping)
            else None
        )
        if not isinstance(proof, Mapping) or not _proof_matches_evidence(proof, evidence):
            raise TrialValidationError(
                "command evidence must match the support service event proof."
            )
    elif event_type == "commerce.order.support_case_resolved":
        before_order, after_order = _one_changed(current["orders"], next_state["orders"], "orders")
        before_by_id = {
            case.get("caseId"): case
            for case in before_order.get("supportCases", [])
            if isinstance(case, Mapping)
        }
        changed = [
            case
            for case in after_order.get("supportCases", [])
            if isinstance(case, Mapping) and case != before_by_id.get(case.get("caseId"))
        ]
        resolution_field = (
            "followUpResolution"
            if len(changed) == 1 and isinstance(changed[0].get("reopen"), Mapping)
            else "resolution"
        )
        resolution = changed[0].get(resolution_field) if len(changed) == 1 else None
        proof = resolution.get("proof") if isinstance(resolution, Mapping) else None
        if not isinstance(proof, Mapping) or not _proof_matches_evidence(proof, evidence):
            raise TrialValidationError(
                "command evidence must match the support case resolution proof."
            )
    elif event_type == "commerce.order.correction_recorded":
        _, corrected_order = _one_changed(
            current["orders"],
            next_state["orders"],
            "orders",
        )
        corrections = corrected_order.get("corrections")
        record = corrections[0] if isinstance(corrections, list) and corrections else {}
        if any(
            record.get(record_field) != evidence[evidence_field]
            for record_field, evidence_field in (
                ("actionId", "actionId"),
                ("createdAt", "capturedAt"),
                ("actor", "actor"),
                ("reason", "reason"),
                ("evidenceReference", "evidenceReference"),
            )
        ):
            raise TrialValidationError(
                "command evidence must match the order correction proof."
            )
    elif event_type == "commerce.collection_action.recorded":
        _, contacted_order = _one_changed(
            current["orders"],
            next_state["orders"],
            "orders",
        )
        actions = contacted_order.get("collectionActions")
        record = actions[0] if isinstance(actions, list) and actions else {}
        proof = record.get("proof", {}) if isinstance(record, Mapping) else {}
        if not isinstance(proof, Mapping) or not _proof_matches_evidence(
            proof,
            evidence,
        ):
            raise TrialValidationError(
                "command evidence must match the collection contact proof."
            )
    elif event_type in {
        "commerce.inventory.initialized",
        "commerce.inventory.master_created",
        "commerce.inventory.supplier_policy_saved",
        "commerce.inventory.transferred",
        "commerce.stock.counted",
    } and (
        event_type != "commerce.stock.counted"
        or _inventory_foundation(current) is not None
    ):
        foundation = _inventory_foundation(next_state)
        commands = foundation.get("commands") if foundation is not None else None
        expected_location_kind = {
            "commerce.inventory.initialized": "import",
            "commerce.inventory.master_created": "master_create",
            "commerce.inventory.supplier_policy_saved": "supplier_policy_set",
            "commerce.inventory.transferred": "transfer",
            "commerce.stock.counted": "count",
        }[event_type]
        latest_payload = (
            commands[-1].get("payload", {})
            if isinstance(commands, list)
            and commands
            and isinstance(commands[-1], Mapping)
            else {}
        )
        proof = (
            latest_payload.get("proof", {})
            if isinstance(latest_payload, Mapping)
            else {}
        )
        if (
            not isinstance(latest_payload, Mapping)
            or latest_payload.get("kind") != expected_location_kind
            or not isinstance(proof, Mapping)
            or not _proof_matches_evidence(proof, evidence)
        ):
            raise TrialValidationError(
                "command evidence must match the location inventory proof."
            )

    location_order_kind = {
        "commerce.order.created": "order_reserve",
        "commerce.order.cancelled": "order_release",
        "commerce.website_intake.converted": "order_reserve",
    }.get(event_type)
    if event_type == "commerce.order.advanced":
        _, advanced_order = _one_changed(
            current["orders"], next_state["orders"], "orders"
        )
        if advanced_order["status"] == "completed":
            location_order_kind = "order_fulfil"
    if location_order_kind and _inventory_foundation(current) is not None:
        foundation = _inventory_foundation(next_state)
        commands = foundation.get("commands") if foundation is not None else None
        payload = (
            commands[-1].get("payload", {})
            if isinstance(commands, list)
            and commands
            and isinstance(commands[-1], Mapping)
            else {}
        )
        location_proof = payload.get("proof") if isinstance(payload, Mapping) else None
        if (
            not isinstance(payload, Mapping)
            or payload.get("kind") != location_order_kind
            or not isinstance(location_proof, Mapping)
            or not _proof_matches_evidence(location_proof, evidence)
        ):
            raise TrialValidationError(
                "command evidence must match the order location proof."
            )

    movement_kind = {
        "commerce.item.created": "opening",
        "commerce.order.created": "reserve",
        "commerce.order.cancelled": "release",
        "commerce.stock.received": "receipt",
        "commerce.stock.counted": "count",
        "commerce.production_material.issued": "production_issue",
        "commerce.production_material.returned": "production_return",
        "commerce.production_batch.received": "production_receipt",
        "commerce.purchase_order.received": "receipt",
        "commerce.website_intake.converted": "reserve",
    }.get(event_type)
    if movement_kind:
        added_count = len(next_state["movements"]) - len(current["movements"])
        added_movements = next_state["movements"][:added_count]
        if not added_movements or any(
            movement.get("kind") != movement_kind
            or any(
                movement.get(movement_field) != evidence[evidence_field]
                for movement_field, evidence_field in (
                    ("actionId", "actionId"),
                    ("createdAt", "capturedAt"),
                    ("actor", "actor"),
                    ("reason", "reason"),
                    ("evidenceReference", "evidenceReference"),
                )
            )
            for movement in added_movements
        ):
            raise TrialValidationError("command evidence must match the attributable stock movement.")
    elif event_type == "commerce.payment.reconciled":
        matches = [
            order
            for order in next_state["orders"]
            if order.get("paymentReconciliationActionId") == evidence["actionId"]
        ]
        if len(matches) != 1:
            raise TrialValidationError("command evidence must identify the reconciled payment.")
        order = matches[0]
        if (
            order.get("paymentReconciledAt") != evidence["capturedAt"]
            or order.get("paymentReconciledBy") != evidence["actor"]
            or order.get("paymentReconciliationReason") != evidence["reason"]
            or order.get("paymentEvidenceReference") != evidence["evidenceReference"]
        ):
            raise TrialValidationError("command evidence must match the payment reconciliation evidence.")
    elif event_type == "commerce.refund.settled":
        _, order = _one_changed(current["orders"], next_state["orders"], "orders")
        if (
            order.get("refundSettlementActionId") != evidence["actionId"]
            or order.get("refundSettledAt") != evidence["capturedAt"]
            or order.get("refundSettledBy") != evidence["actor"]
            or order.get("refundSettlementReason") != evidence["reason"]
            or order.get("refundEvidenceReference") != evidence["evidenceReference"]
        ):
            raise TrialValidationError("command evidence must match the refund settlement evidence.")
    elif event_type == "commerce.close.saved":
        close = next_state["closes"][0]
        if (
            close.get("actionId") != evidence["actionId"]
            or close.get("createdAt") != evidence["capturedAt"]
            or close.get("operator") != evidence["actor"]
            or close.get("reason") != evidence["reason"]
            or close.get("evidenceReference") != evidence["evidenceReference"]
        ):
            raise TrialValidationError("command evidence must match the daily close proof.")


def _one_changed(current: list[Any], next_values: list[Any], field: str) -> tuple[dict[str, Any], dict[str, Any]]:
    if len(current) != len(next_values):
        raise TrialValidationError(f"{field} must preserve its record count for this event.")
    changes = [index for index, (before, after) in enumerate(zip(current, next_values, strict=True)) if before != after]
    if len(changes) != 1:
        raise TrialValidationError(f"{field} must change exactly one existing record.")
    index = changes[0]
    before = _object(current[index], f"current {field}[{index}]")
    after = _object(next_values[index], f"next {field}[{index}]")
    identity_field = "sku" if field == "items" else "id"
    if before.get(identity_field) != after.get(identity_field):
        raise TrialValidationError(f"{field} record identity cannot change.")
    return before, after


def _changed_records(
    current: list[Any],
    next_values: list[Any],
    field: str,
) -> list[tuple[dict[str, Any], dict[str, Any]]]:
    if len(current) != len(next_values):
        raise TrialValidationError(
            f"{field} must preserve its record count for this event."
        )
    changes: list[tuple[dict[str, Any], dict[str, Any]]] = []
    identity_field = "sku" if field == "items" else "id"
    for index, (before_value, after_value) in enumerate(
        zip(current, next_values, strict=True)
    ):
        before = _object(before_value, f"current {field}[{index}]")
        after = _object(after_value, f"next {field}[{index}]")
        if before.get(identity_field) != after.get(identity_field):
            raise TrialValidationError(f"{field} record identity cannot change.")
        if before != after:
            changes.append((before, after))
    return changes


def _without(value: Mapping[str, Any], fields: frozenset[str]) -> dict[str, Any]:
    return {key: nested for key, nested in value.items() if key not in fields}


def _require_unchanged(current: Mapping[str, Any], next_state: Mapping[str, Any], *fields: str) -> None:
    changed = [field for field in fields if current[field] != next_state[field]]
    if changed:
        raise TrialValidationError(f"event cannot change: {', '.join(changed)}.")


def _website_intakes(state: Mapping[str, Any]) -> list[Any]:
    return state.get("websiteIntakes", [])


def _storefront_requests(state: Mapping[str, Any]) -> list[Any]:
    return state.get("storefrontRequests", [])


def _storefront_configuration(state: Mapping[str, Any]) -> Mapping[str, Any] | None:
    configuration = state.get("storefrontConfiguration")
    return configuration if isinstance(configuration, Mapping) else None


def _purchase_orders(state: Mapping[str, Any]) -> list[Any]:
    return state.get("purchaseOrders", [])


def _purchase_budget_envelopes(state: Mapping[str, Any]) -> list[Any]:
    return state.get("purchaseBudgetEnvelopes", [])


def _supplier_sourcing_decisions(state: Mapping[str, Any]) -> list[Any]:
    return state.get("supplierSourcingDecisions", [])


def _purchase_requisitions(state: Mapping[str, Any]) -> list[Any]:
    return state.get("purchaseRequisitions", [])


def commerce_supplier_invoice_match(
    state: Mapping[str, Any],
    purchase_order: Mapping[str, Any],
) -> dict[str, Any]:
    """Project a fail-closed three-way match without posting or paying externally."""

    invoice = purchase_order.get("supplierInvoice")
    ordered_unit_cost = purchase_order.get("unitCostMmk")
    if not isinstance(invoice, Mapping) or not isinstance(ordered_unit_cost, int):
        raise TrialValidationError(
            "Supplier invoice matching requires retained PO commercial terms and an invoice."
        )
    received = sum(
        movement["quantityDelta"]
        for movement in state.get("movements", [])
        if isinstance(movement, Mapping)
        and movement.get("kind") == "receipt"
        and movement.get("purchaseOrderId") == purchase_order.get("id")
    )
    rejected = sum(
        movement.get("rejectedQuantity", 0)
        for movement in state.get("movements", [])
        if isinstance(movement, Mapping)
        and movement.get("kind") == "receipt"
        and movement.get("purchaseOrderId") == purchase_order.get("id")
    )
    invoiced_quantity = int(invoice["quantityInvoiced"])
    supplier_claim_mmk = sum(
        claim["claimAmountMmk"]
        for claim in purchase_order.get("supplierReturns", [])
        if isinstance(claim, Mapping)
    )
    supplier_credit_mmk = sum(
        credit["amountMmk"]
        for claim in purchase_order.get("supplierReturns", [])
        if isinstance(claim, Mapping)
        for credit in claim.get("creditNotes", [])
        if isinstance(credit, Mapping)
    )
    expected_supplier_return_mmk = rejected * ordered_unit_cost
    supplier_return_balance_mmk = expected_supplier_return_mmk - supplier_credit_mmk
    net_invoice_total_mmk = invoice["totalMmk"] - supplier_credit_mmk
    accepted_total_mmk = received * ordered_unit_cost
    if received + rejected < invoiced_quantity:
        status = "awaiting_receipt"
    elif rejected > 0 and (
        supplier_claim_mmk != expected_supplier_return_mmk
        or supplier_return_balance_mmk > 0
    ):
        status = "supplier_credit_pending"
    elif (
        invoiced_quantity != purchase_order["quantityOrdered"]
    ):
        status = "quantity_variance"
    elif (
        invoice["unitCostMmk"] != ordered_unit_cost
        or net_invoice_total_mmk != accepted_total_mmk
    ):
        status = "price_variance"
    else:
        status = "matched"
    return {
        "status": status,
        "orderedQuantity": purchase_order["quantityOrdered"],
        "acceptedQuantity": received,
        "rejectedQuantity": rejected,
        "invoicedQuantity": invoiced_quantity,
        "orderedUnitCostMmk": ordered_unit_cost,
        "invoicedUnitCostMmk": invoice["unitCostMmk"],
        "orderedTotalMmk": purchase_order["quantityOrdered"] * ordered_unit_cost,
        "invoicedTotalMmk": invoice["totalMmk"],
        "supplierClaimMmk": supplier_claim_mmk,
        "supplierCreditMmk": supplier_credit_mmk,
        "supplierReturnBalanceMmk": supplier_return_balance_mmk,
        "netInvoiceTotalMmk": net_invoice_total_mmk,
        "acceptedTotalMmk": accepted_total_mmk,
        "payableReady": status == "matched" and "payableReview" in invoice,
    }


def commerce_shop_demand_intelligence(
    value: Mapping[str, Any],
    as_of: str,
) -> dict[str, Any]:
    """Project explainable 28-day Shop demand without changing operational state."""

    state = validate_commerce_state(value)
    canonical_as_of = _timestamp(as_of, "Shop demand asOf")
    as_of_time = datetime.fromisoformat(canonical_as_of.replace("Z", "+00:00"))
    lookback_days = 28
    window_start = as_of_time - timedelta(days=lookback_days)

    def safe_add(left: int, right: int, field: str) -> int:
        result = left + right
        if abs(result) > _MAX_SAFE_INTEGER:
            raise TrialValidationError(f"{field} exceeds the supported quantity range.")
        return result

    def safe_multiply(left: int, right: int, field: str) -> int:
        result = left * right
        if abs(result) > _MAX_SAFE_INTEGER:
            raise TrialValidationError(f"{field} exceeds the supported quantity range.")
        return result

    def order_lines(order: Mapping[str, Any]) -> list[dict[str, Any]]:
        lines = order.get("lines")
        if isinstance(lines, list) and lines:
            return [
                {"sku": str(line["sku"]), "quantity": int(line["quantity"])}
                for line in lines
                if isinstance(line, Mapping)
            ]
        sku = order.get("itemSku")
        return [{"sku": str(sku), "quantity": int(order["quantity"])}] if sku else []

    completed_orders: list[Mapping[str, Any]] = []
    for order_value in state["orders"]:
        order = order_value if isinstance(order_value, Mapping) else {}
        completion = order.get("completion")
        if order.get("status") != "completed" or not isinstance(completion, Mapping):
            continue
        completed_at = datetime.fromisoformat(
            str(completion["capturedAt"]).replace("Z", "+00:00")
        )
        if window_start < completed_at <= as_of_time:
            completed_orders.append(order)

    purchase_orders = [
        order for order in state.get("purchaseOrders", []) if isinstance(order, Mapping)
    ]

    def purchase_progress(order: Mapping[str, Any]) -> tuple[int, bool]:
        delivered = sum(
            int(movement["quantityDelta"]) + int(movement.get("rejectedQuantity", 0))
            for movement in state["movements"]
            if isinstance(movement, Mapping)
            and movement.get("kind") == "receipt"
            and movement.get("purchaseOrderId") == order.get("id")
        )
        remaining = int(order["quantityOrdered"]) - delivered
        active = "cancellation" not in order and remaining > 0
        return remaining, active

    active_purchase_orders = [
        order for order in purchase_orders if purchase_progress(order)[1]
    ]
    catalog_skus = sorted(str(item["sku"]) for item in state["items"])
    policies: list[dict[str, Any]] = []
    vendor_names: dict[str, str] = {}
    inventory = state.get("inventoryFoundation")
    if inventory is not None:
        partners = shop_inventory_business_partners(inventory, catalog_skus)
        vendor_names = {vendor["id"]: vendor["name"] for vendor in partners["vendors"]}
        policies = shop_inventory_supplier_policies(inventory, catalog_skus)

    def select_policy(sku: str, recent_supplier: str | None) -> Mapping[str, Any] | None:
        active = [
            policy
            for policy in policies
            if policy["sku"] == sku and policy["status"] == "active"
        ]
        if recent_supplier:
            return next(
                (
                    policy
                    for policy in active
                    if vendor_names.get(str(policy["vendorId"])) == recent_supplier
                ),
                None,
            )
        return active[0] if len(active) == 1 else None

    rows: list[dict[str, Any]] = []
    for item in state["items"]:
        sku = str(item["sku"])
        weekly = [0, 0, 0, 0]
        source_order_ids: list[str] = []
        source_return_action_ids: list[str] = []
        gross_units = 0
        returned_units = 0
        for order in completed_orders:
            quantity = sum(
                int(line["quantity"]) for line in order_lines(order) if line["sku"] == sku
            )
            if quantity == 0:
                continue
            source_order_ids.append(str(order["id"]))
            gross_units = safe_add(gross_units, quantity, f"Gross demand for {sku}")
            completion = order["completion"]
            completed_at = datetime.fromisoformat(
                str(completion["capturedAt"]).replace("Z", "+00:00")
            )
            bucket = min(3, int((as_of_time - completed_at).total_seconds() // (7 * 86_400)))
            weekly[bucket] = safe_add(weekly[bucket], quantity, f"Weekly demand for {sku}")
            for returned in order.get("returns", []):
                if not isinstance(returned, Mapping) or returned.get("sku") != sku:
                    continue
                returned_at = datetime.fromisoformat(
                    str(returned["createdAt"]).replace("Z", "+00:00")
                )
                if returned_at > as_of_time:
                    continue
                returned_quantity = int(returned["quantity"])
                returned_units = safe_add(
                    returned_units, returned_quantity, f"Returns for {sku}"
                )
                source_return_action_ids.append(str(returned["actionId"]))
                return_bucket = min(
                    3,
                    max(0, int((as_of_time - returned_at).total_seconds() // (7 * 86_400))),
                )
                weekly[return_bucket] = max(
                    0,
                    safe_add(
                        weekly[return_bucket], -returned_quantity, f"Weekly demand for {sku}"
                    ),
                )
        net_units = max(0, gross_units - returned_units)
        forecast_weekly = (net_units + 3) // 4
        peak_weekly = max([0, *weekly])
        average_daily_basis_points = (
            safe_multiply(net_units, 10_000, f"Average demand for {sku}")
            + lookback_days // 2
        ) // lookback_days
        completed_order_count = len(source_order_ids)
        confidence = (
            "established"
            if completed_order_count >= 6
            else "emerging" if completed_order_count >= 2 else "insufficient"
        )
        recent_orders = sorted(
            [
                order
                for order in purchase_orders
                if order.get("sku") == sku and "cancellation" not in order
            ],
            key=lambda order: (
                -datetime.fromisoformat(str(order["createdAt"]).replace("Z", "+00:00")).timestamp(),
                str(order["id"]),
            ),
        )
        recent_supplier = str(recent_orders[0]["supplier"]) if recent_orders else None
        policy = select_policy(sku, recent_supplier)
        horizon_days = int(policy["leadTimeDays"]) if policy else 7
        horizon_source = "supplier_policy" if policy else "planning_default"
        horizon_demand = (
            safe_multiply(net_units, horizon_days, f"Planning demand for {sku}")
            + lookback_days - 1
        ) // lookback_days
        open_purchase_units = sum(
            purchase_progress(order)[0]
            for order in active_purchase_orders
            if order.get("sku") == sku
        )
        projected_supply = safe_add(
            int(item["onHand"]), open_purchase_units, f"Projected supply for {sku}"
        )
        projected_cover = (
            safe_multiply(projected_supply, lookback_days, f"Projected cover for {sku}")
            // net_units
            if net_units
            else None
        )
        suggested_safety = (
            None if confidence == "insufficient" else max(0, peak_weekly - forecast_weekly)
        )
        if net_units > 0 and projected_supply < horizon_demand:
            status = "stockout_risk"
            reason = f"Projected supply is below {horizon_days}-day demand."
        elif net_units > 0 and projected_supply < safe_add(
            horizon_demand, forecast_weekly, f"Demand threshold for {sku}"
        ):
            status = "reorder_soon"
            reason = "Projected supply covers the planning horizon but not one additional forecast week."
        elif confidence == "insufficient":
            status = "insufficient_history"
            reason = "Fewer than two completed orders are available in the 28-day window."
        else:
            status = "monitor"
            reason = "Projected supply covers the planning horizon and one additional forecast week."
        rows.append(
            {
                "sku": sku,
                "itemName": item["name"],
                "completedOrderCount": completed_order_count,
                "sourceOrderIds": sorted(source_order_ids),
                "sourceReturnActionIds": sorted(source_return_action_ids),
                "grossDemandUnits": gross_units,
                "returnedUnits": returned_units,
                "netDemandUnits": net_units,
                "weeklyNetDemandUnits": weekly,
                "forecastWeeklyUnits": forecast_weekly,
                "peakWeeklyDemandUnits": peak_weekly,
                "averageDailyDemandBasisPoints": average_daily_basis_points,
                "planningHorizonDays": horizon_days,
                "planningHorizonSource": horizon_source,
                "horizonDemandUnits": horizon_demand,
                "onHandUnits": item["onHand"],
                "openPurchaseUnits": open_purchase_units,
                "projectedSupplyUnits": projected_supply,
                "projectedDaysOfCover": projected_cover,
                "existingSafetyStockUnits": policy["safetyStockUnits"] if policy else None,
                "recommendedSafetyStockUnits": suggested_safety,
                "confidence": confidence,
                "status": status,
                "reason": reason,
            }
        )

    status_rank = {
        "stockout_risk": 0,
        "reorder_soon": 1,
        "insufficient_history": 2,
        "monitor": 3,
    }
    rows.sort(key=lambda row: (status_rank[row["status"]], -row["netDemandUnits"], row["sku"]))
    completed_order_ids = sorted(str(order["id"]) for order in completed_orders)
    return_action_ids = sorted(
        str(returned["actionId"])
        for order in completed_orders
        for returned in order.get("returns", [])
        if isinstance(returned, Mapping)
        and datetime.fromisoformat(str(returned["createdAt"]).replace("Z", "+00:00")) <= as_of_time
    )
    source = {
        "commerceDigest": _order_inventory_digest(
            {"asOf": canonical_as_of, "state": state}
        ),
        "completedOrderIds": completed_order_ids,
        "returnActionIds": return_action_ids,
    }
    summary = {
        "reviewedSkus": len(rows),
        "demandSkus": sum(1 for row in rows if row["netDemandUnits"] > 0),
        "stockoutRisks": sum(1 for row in rows if row["status"] == "stockout_risk"),
        "reorderSoon": sum(1 for row in rows if row["status"] == "reorder_soon"),
        "insufficientHistory": sum(1 for row in rows if row["confidence"] == "insufficient"),
        "netDemandUnits": sum(row["netDemandUnits"] for row in rows),
        "forecastWeeklyUnits": sum(row["forecastWeeklyUnits"] for row in rows),
    }
    body = {
        "contract": "supermega.shop.demand-intelligence.v1",
        "asOf": canonical_as_of,
        "lookbackDays": lookback_days,
        "rows": rows,
        "summary": summary,
        "source": source,
        "authority": {
            "recommendationOnly": True,
            "purchaseCreated": False,
            "supplierContacted": False,
            "inventoryChanged": False,
            "policyChanged": False,
            "providerCalled": False,
        },
    }
    return {**body, "digest": _order_inventory_digest(body)}


def commerce_shop_procurement_decision(
    value: Mapping[str, Any],
    replenishment_value: Mapping[str, Any],
    as_of: str,
) -> dict[str, Any]:
    """Rank retained supplier evidence for owner review without creating a requisition or purchase."""

    state = validate_commerce_state(value)
    canonical_as_of = _timestamp(as_of, "Shop procurement asOf")
    as_of_time = datetime.fromisoformat(canonical_as_of.replace("Z", "+00:00"))
    plan = _object(replenishment_value, "Shop replenishment plan")
    if plan.get("contract") != "supermega.shop.replenishment_plan.v1":
        raise TrialValidationError("Shop procurement requires a v1 replenishment plan.")
    plan_digest = _text(plan.get("digest"), "Shop replenishment plan.digest", maximum=71)
    plan_body = {key: item for key, item in plan.items() if key != "digest"}
    if plan_digest != _order_inventory_digest(plan_body):
        raise TrialValidationError("Shop procurement requires an untampered replenishment plan.")
    plan_rows = plan.get("rows")
    if not isinstance(plan_rows, list) or len(plan_rows) > 2_000:
        raise TrialValidationError("Shop replenishment plan.rows is invalid.")
    plan_source = _object(plan.get("source"), "Shop replenishment plan.source")
    commerce_digest = _text(plan_source.get("commerceDigest"), "Shop replenishment plan.source.commerceDigest", maximum=71)
    purchase_orders = [order for order in state.get("purchaseOrders", []) if isinstance(order, Mapping)]

    def safe_add(left: int, right: int, field: str) -> int:
        result = left + right
        if abs(result) > _MAX_SAFE_INTEGER:
            raise TrialValidationError(f"{field} exceeds the supported safe integer range.")
        return result

    def purchase_progress(order: Mapping[str, Any]) -> tuple[int, int, int, bool]:
        receipts = [
            movement for movement in state["movements"]
            if isinstance(movement, Mapping)
            and movement.get("kind") == "receipt"
            and movement.get("purchaseOrderId") == order.get("id")
        ]
        received = sum(int(movement["quantityDelta"]) for movement in receipts)
        rejected = sum(int(movement.get("rejectedQuantity", 0)) for movement in receipts)
        remaining = int(order["quantityOrdered"]) - received - rejected
        return received, rejected, remaining, "cancellation" not in order and remaining > 0

    supplier_performance: dict[str, dict[str, Any]] = {}
    for order in purchase_orders:
        supplier = str(order["supplier"])
        received, rejected, remaining, active = purchase_progress(order)
        receipts = [
            movement for movement in state["movements"]
            if isinstance(movement, Mapping)
            and movement.get("kind") == "receipt"
            and movement.get("purchaseOrderId") == order.get("id")
        ]
        completed_at = max(
            (datetime.fromisoformat(str(receipt["createdAt"]).replace("Z", "+00:00")) for receipt in receipts),
            default=None,
        )
        promised_at = datetime.fromisoformat(str(order["expectedAt"]).replace("Z", "+00:00")) if order.get("expectedAt") else None
        completed = remaining == 0 and completed_at is not None and promised_at is not None and "cancellation" not in order
        on_time = completed and completed_at <= promised_at
        late_delivery = completed and not on_time
        late_open = active and promised_at is not None and promised_at <= as_of_time
        measured = supplier_performance.setdefault(supplier, {
            "orderedUnits": 0, "rejectedUnits": 0, "lateOpenOrders": 0,
            "completedDeliveries": 0, "onTimeDeliveries": 0, "lateDeliveries": 0,
        })
        measured["orderedUnits"] = safe_add(measured["orderedUnits"], int(order["quantityOrdered"]), "Supplier ordered units")
        measured["rejectedUnits"] = safe_add(measured["rejectedUnits"], rejected, "Supplier rejected units")
        measured["lateOpenOrders"] += int(late_open)
        measured["completedDeliveries"] += int(completed)
        measured["onTimeDeliveries"] += int(on_time)
        measured["lateDeliveries"] += int(late_delivery)

    catalog_skus = sorted(str(item["sku"]) for item in state["items"])
    inventory = state.get("inventoryFoundation")
    vendors: list[Mapping[str, Any]] = []
    policies: list[Mapping[str, Any]] = []
    if inventory is not None:
        partners = shop_inventory_business_partners(inventory, catalog_skus)
        vendors = [vendor for vendor in partners["vendors"] if isinstance(vendor, Mapping)]
        policies = shop_inventory_supplier_policies(inventory, catalog_skus)
    vendor_ids = {str(vendor["name"]): str(vendor["id"]) for vendor in vendors}
    vendor_names = {str(vendor["id"]): str(vendor["name"]) for vendor in vendors}
    status_rank = {"on_track": 0, "collecting": 1, "attention": 2}
    rows: list[dict[str, Any]] = []
    for raw_row in plan_rows:
        row = _object(raw_row, "Shop replenishment plan row")
        quantity = _integer(row.get("recommendedOrderUnits"), "Shop replenishment recommendedOrderUnits", minimum=0)
        if quantity == 0:
            continue
        sku = _text(row.get("sku"), "Shop replenishment sku", maximum=80)
        item_name = _text(row.get("itemName"), "Shop replenishment itemName", maximum=180)
        suppliers = sorted({
            *[str(order["supplier"]) for order in purchase_orders if order.get("sku") == sku and "cancellation" not in order],
            *[vendor_names[str(policy["vendorId"])] for policy in policies if policy["sku"] == sku and policy["status"] == "active" and str(policy["vendorId"]) in vendor_names],
            *([str(row["suggestedSupplier"])] if row.get("suggestedSupplier") else []),
        })
        options: list[dict[str, Any]] = []
        for supplier in suppliers:
            source_orders = sorted(
                [order for order in purchase_orders if order.get("sku") == sku and order.get("supplier") == supplier and "cancellation" not in order],
                key=lambda order: (-datetime.fromisoformat(str(order["createdAt"]).replace("Z", "+00:00")).timestamp(), str(order["id"])),
            )
            commercial_order = next((order for order in source_orders if isinstance(order.get("unitCostMmk"), int)), None)
            policy = next((candidate for candidate in policies if candidate["sku"] == sku and candidate["vendorId"] == vendor_ids.get(supplier) and candidate["status"] == "active"), None)
            measured = supplier_performance.get(supplier)
            unit_cost = int(commercial_order["unitCostMmk"]) if commercial_order else None
            estimated_total = safe_add(0, quantity * unit_cost, f"Procurement exposure for {sku}") if unit_cost is not None else None
            completed = int(measured["completedDeliveries"]) if measured else 0
            on_time_rate = ((int(measured["onTimeDeliveries"]) * 10_000 + completed // 2) // completed) if measured and completed else None
            ordered = int(measured["orderedUnits"]) if measured else 0
            defect_rate = ((int(measured["rejectedUnits"]) * 10_000 + ordered // 2) // ordered) if measured and ordered else 0
            performance_status = "attention" if measured and (measured["rejectedUnits"] or measured["lateOpenOrders"] or measured["lateDeliveries"]) else "on_track" if completed else "collecting"
            options.append({
                "supplier": supplier,
                "unitCostMmk": unit_cost,
                "estimatedTotalMmk": estimated_total,
                "leadTimeDays": int(policy["leadTimeDays"]) if policy else None,
                "serviceLevelBasisPoints": int(policy["serviceLevelBasisPoints"]) if policy else None,
                "completedDeliveries": completed,
                "onTimeRateBasisPoints": on_time_rate,
                "defectRateBasisPoints": defect_rate,
                "performanceStatus": performance_status,
                "termsStatus": "comparable" if unit_cost is not None else "cost_required",
                "sourcePurchaseOrderIds": [str(order["id"]) for order in source_orders],
                "supplierPolicyCommandId": str(policy["commandId"]) if policy else None,
            })
        options.sort(key=lambda option: (
            0 if option["termsStatus"] == "comparable" else 1,
            status_rank[option["performanceStatus"]],
            0 if option["supplierPolicyCommandId"] else 1,
            -option["completedDeliveries"],
            -(option["onTimeRateBasisPoints"] if option["onTimeRateBasisPoints"] is not None else -1),
            option["defectRateBasisPoints"],
            option["estimatedTotalMmk"] if option["estimatedTotalMmk"] is not None else _MAX_SAFE_INTEGER,
            option["supplier"],
        ))
        recommended = next((option for option in options if option["termsStatus"] == "comparable"), None)
        status = "terms_required" if recommended is None else "risk_review_required" if recommended["performanceStatus"] == "attention" else "ready_for_owner_review"
        selection_reason = (
            "Retain supplier cost terms before owner review." if recommended is None
            else "Best retained commercial option has delivery or quality risk requiring owner review." if status == "risk_review_required"
            else "Ranked by retained terms, delivery evidence, quality, then estimated exposure." if recommended["completedDeliveries"]
            else "Commercial terms are retained; delivery evidence is still collecting."
        )
        rows.append({
            "requisitionReference": f"REQ-{plan_digest[7:19].upper()}-{sku}",
            "sku": sku,
            "itemName": item_name,
            "quantity": quantity,
            "desiredAt": row.get("earliestNeedAt"),
            "plantJobIds": list(row.get("jobIds", [])),
            "recommendedSupplier": recommended["supplier"] if recommended else None,
            "recommendedUnitCostMmk": recommended["unitCostMmk"] if recommended else None,
            "estimatedTotalMmk": recommended["estimatedTotalMmk"] if recommended else None,
            "status": status,
            "selectionReason": selection_reason,
            "supplierOptions": options,
        })
    summary = {
        "requisitions": len(rows),
        "readyForReview": sum(row["status"] == "ready_for_owner_review" for row in rows),
        "riskReviews": sum(row["status"] == "risk_review_required" for row in rows),
        "termsRequired": sum(row["status"] == "terms_required" for row in rows),
        "comparedSuppliers": sum(len(row["supplierOptions"]) for row in rows),
        "knownExposureMmk": sum(row["estimatedTotalMmk"] or 0 for row in rows),
        "unknownExposure": sum(row["estimatedTotalMmk"] is None for row in rows),
    }
    body = {
        "contract": "supermega.shop.procurement-decision.v1",
        "asOf": canonical_as_of,
        "rows": rows,
        "summary": summary,
        "source": {
            "commerceDigest": commerce_digest,
            "replenishmentDigest": plan_digest,
            "purchaseOrderIds": sorted(str(order["id"]) for order in purchase_orders),
        },
        "authority": {
            "recommendationOnly": True,
            "requisitionRecorded": False,
            "purchaseCreated": False,
            "supplierContacted": False,
            "paymentCreated": False,
            "inventoryChanged": False,
            "providerCalled": False,
        },
    }
    return {**body, "digest": _order_inventory_digest(body)}


def _catalog_changes(state: Mapping[str, Any]) -> list[Any]:
    return state.get("catalogChanges", [])


def _tax_configurations(state: Mapping[str, Any]) -> list[Any]:
    return state.get("taxConfigurations", [])


def _effective_tax_configuration(
    state: Mapping[str, Any],
    at_time: str,
) -> Mapping[str, Any] | None:
    at = datetime.fromisoformat(at_time.replace("Z", "+00:00"))
    for candidate in _tax_configurations(state):
        if not isinstance(candidate, Mapping):
            continue
        effective_at = datetime.fromisoformat(
            str(
                candidate.get(
                    "effectiveFrom",
                    candidate["proof"]["capturedAt"],
                )
            ).replace("Z", "+00:00")
        )
        if effective_at <= at:
            return candidate
    return None


def _account_mapping_configurations(state: Mapping[str, Any]) -> list[Any]:
    return state.get("accountMappingConfigurations", [])


def _customer_credit_policies(state: Mapping[str, Any]) -> list[Any]:
    return state.get("customerCreditPolicies", [])


def _promotion_policies(state: Mapping[str, Any]) -> list[Any]:
    return state.get("promotionPolicies", [])


def _shipping_policies(state: Mapping[str, Any]) -> list[Any]:
    return state.get("shippingPolicies", [])


def _payment_policies(state: Mapping[str, Any]) -> list[Any]:
    return state.get("paymentPolicies", [])


def _effective_customer_credit_policy(
    state: Mapping[str, Any],
    customer: str,
    at_time: str,
) -> Mapping[str, Any] | None:
    at = datetime.fromisoformat(at_time.replace("Z", "+00:00"))
    for candidate in _customer_credit_policies(state):
        if not isinstance(candidate, Mapping) or candidate.get("customer") != customer:
            continue
        proof = candidate.get("proof")
        if isinstance(proof, Mapping) and datetime.fromisoformat(
            str(proof["capturedAt"]).replace("Z", "+00:00")
        ) <= at:
            return candidate
    return None


def _order_payment_terms_days(order: Mapping[str, Any]) -> int | None:
    if "paymentDueAt" not in order:
        return 0
    created_at = datetime.fromisoformat(str(order["createdAt"]).replace("Z", "+00:00"))
    payment_due_at = datetime.fromisoformat(str(order["paymentDueAt"]).replace("Z", "+00:00"))
    delta = payment_due_at - created_at
    return next(
        (days for days in _CUSTOMER_CREDIT_TERMS if delta == timedelta(days=days)),
        None,
    )


def _customer_credit_exposure(state: Mapping[str, Any], customer: str) -> int:
    exposure = sum(
        int(order["total"])
        for order in state["orders"]
        if order.get("customer") == customer
        and order.get("status") != "cancelled"
        and order.get("paymentStatus") == "pending"
    )
    if exposure > _MAX_SAFE_INTEGER:
        raise TrialValidationError("customer credit exposure exceeds the safe integer limit.")
    return exposure


def _round_tax(numerator: int, denominator: int) -> int:
    return (numerator * 2 + denominator) // (denominator * 2)


def _configured_order_calculation(
    configuration: Mapping[str, Any],
    listed_subtotal_mmk: int,
    catalog_revision: int,
) -> dict[str, Any] | None:
    if not 1 <= listed_subtotal_mmk <= _MAX_SAFE_INTEGER:
        return None
    rate = int(configuration["rateBasisPoints"])
    mode = str(configuration["mode"])
    tax_mmk = (
        _round_tax(listed_subtotal_mmk * rate, 10_000)
        if mode == "exclusive"
        else _round_tax(listed_subtotal_mmk * rate, 10_000 + rate)
    )
    subtotal_mmk = listed_subtotal_mmk if mode == "exclusive" else listed_subtotal_mmk - tax_mmk
    total_mmk = listed_subtotal_mmk + tax_mmk if mode == "exclusive" else listed_subtotal_mmk
    if subtotal_mmk < 0 or tax_mmk < 0 or not 1 <= total_mmk <= _MAX_SAFE_INTEGER:
        return None
    calculation = {
        "schema": _ORDER_CALCULATION_V2_SCHEMA,
        "currency": "MMK",
        "catalogRevision": catalog_revision,
        "taxConfigurationRevision": configuration["revision"],
        "taxCode": configuration["code"],
        "taxRateBasisPoints": rate,
        "taxMode": mode,
        "listedSubtotalMmk": listed_subtotal_mmk,
        "subtotalMmk": subtotal_mmk,
        "taxMmk": tax_mmk,
        "totalMmk": total_mmk,
    }
    if "jurisdictionCode" in configuration and "effectiveFrom" in configuration:
        calculation["taxJurisdictionCode"] = configuration["jurisdictionCode"]
        calculation["taxEffectiveFrom"] = configuration["effectiveFrom"]
    return calculation


def create_commerce_order_from_intent(
    current_value: Mapping[str, Any],
    intent_value: Mapping[str, Any],
    evidence_value: Mapping[str, Any],
) -> dict[str, Any]:
    """Build a priced, attributable order and reservation inside the state lock."""

    current = validate_commerce_state(current_value)
    intent = _object(intent_value, "order intent")
    _exact_fields(
        intent,
        "order intent",
        required=frozenset(
            {
                "orderId",
                "customer",
                "channel",
                "payment",
                "fulfilment",
                "fulfilmentReference",
                "promisedAt",
                "paymentTermsDays",
                "lines",
            }
        ),
    )
    evidence = _action_proof(evidence_value, "evidence")
    order_id = _text(intent["orderId"], "order intent.orderId", maximum=160)
    customer = _text(intent["customer"], "order intent.customer", maximum=180)
    channel = _text(intent["channel"], "order intent.channel", maximum=180)
    payment = _text(intent["payment"], "order intent.payment", maximum=180)
    fulfilment = _text(intent["fulfilment"], "order intent.fulfilment", maximum=32)
    if fulfilment not in {"pickup", "delivery"}:
        raise TrialValidationError("order intent.fulfilment must be pickup or delivery.")
    fulfilment_reference = _text(
        intent["fulfilmentReference"],
        "order intent.fulfilmentReference",
        maximum=160,
    )
    promised_at = _timestamp(intent["promisedAt"], "order intent.promisedAt")
    created_at = evidence["capturedAt"]
    if datetime.fromisoformat(promised_at.replace("Z", "+00:00")) <= datetime.fromisoformat(
        created_at.replace("Z", "+00:00")
    ):
        raise TrialValidationError("order intent.promisedAt must remain in the future.")
    payment_terms_days = _integer(
        intent["paymentTermsDays"],
        "order intent.paymentTermsDays",
    )
    if payment_terms_days not in _CUSTOMER_CREDIT_TERMS:
        raise TrialValidationError("order intent.paymentTermsDays is unsupported.")

    item_by_sku = {item["sku"]: item for item in current["items"]}
    raw_lines = _list(intent["lines"], "order intent.lines")
    if not 1 <= len(raw_lines) <= _MAX_ORDER_LINES:
        raise TrialValidationError(
            f"order intent.lines must contain 1 to {_MAX_ORDER_LINES} entries."
        )
    lines: list[dict[str, Any]] = []
    skus: list[str] = []
    quantity = 0
    listed_subtotal = 0
    next_balances: dict[str, int] = {}
    for index, candidate in enumerate(raw_lines):
        field = f"order intent.lines[{index}]"
        row = _object(candidate, field)
        _exact_fields(row, field, required=frozenset({"sku", "quantity"}))
        sku = _text(row["sku"], f"{field}.sku", maximum=80)
        line_quantity = _integer(row["quantity"], f"{field}.quantity", minimum=1)
        item = item_by_sku.get(sku)
        if item is None:
            raise TrialValidationError(f"{field}.sku is not in the current Shop catalog.")
        if item["onHand"] < line_quantity:
            raise TrialValidationError(f"{field}.quantity exceeds available Shop stock.")
        line_total = item["price"] * line_quantity
        quantity += line_quantity
        listed_subtotal += line_total
        if quantity > _MAX_SAFE_INTEGER or listed_subtotal > _MAX_SAFE_INTEGER:
            raise TrialValidationError("order intent totals exceed the safe integer limit.")
        lines.append(
            {
                "sku": sku,
                "name": item["name"],
                **({"variant": item["variant"]} if "variant" in item else {}),
                "quantity": line_quantity,
                "unitPriceMmk": item["price"],
            }
        )
        skus.append(sku)
        next_balances[sku] = item["onHand"] - line_quantity
    _unique(skus, "order intent line SKU")

    tax_configuration = _effective_tax_configuration(current, created_at)
    calculation = (
        _configured_order_calculation(
            tax_configuration,
            listed_subtotal,
            len(_catalog_changes(current)),
        )
        if tax_configuration is not None
        else {
            "schema": _ORDER_CALCULATION_SCHEMA,
            "currency": "MMK",
            "catalogRevision": len(_catalog_changes(current)),
            "subtotalMmk": listed_subtotal,
            "taxMode": "not_configured",
            "taxMmk": 0,
            "totalMmk": listed_subtotal,
        }
    )
    if calculation is None:
        raise TrialValidationError("order intent cannot produce a safe pricing calculation.")
    total = calculation["totalMmk"]
    payment_due_at = (
        None
        if payment_terms_days == 0
        else (
            datetime.fromisoformat(created_at.replace("Z", "+00:00"))
            + timedelta(days=payment_terms_days)
        ).isoformat()
    )
    credit_decision: dict[str, Any] | None = None
    if payment_terms_days:
        policy = _effective_customer_credit_policy(current, customer, created_at)
        exposure_before = _customer_credit_exposure(current, customer)
        exposure_after = exposure_before + total
        if (
            policy is None
            or policy["status"] != "active"
            or payment_terms_days > policy["maxPaymentTermsDays"]
            or exposure_after > policy["creditLimitMmk"]
            or exposure_after > _MAX_SAFE_INTEGER
        ):
            raise TrialValidationError(
                "order intent requires an active customer credit policy with available limit."
            )
        credit_decision = {
            "policyRevision": policy["revision"],
            "policyActionId": policy["proof"]["actionId"],
            "creditLimitMmk": policy["creditLimitMmk"],
            "exposureBeforeMmk": exposure_before,
            "orderAmountMmk": total,
            "exposureAfterMmk": exposure_after,
            "maxPaymentTermsDays": policy["maxPaymentTermsDays"],
            "paymentTermsDays": payment_terms_days,
            "status": "approved",
        }
    order = {
        "id": order_id,
        "createdAt": created_at,
        "customer": customer,
        "owner": evidence["actor"],
        "channel": channel,
        "item": _order_item_summary(lines),
        **({"itemSku": lines[0]["sku"]} if len(lines) == 1 else {}),
        "quantity": quantity,
        "payment": payment,
        "paymentStatus": "pending",
        "refundStatus": "none",
        "fulfilment": fulfilment,
        "fulfilmentReference": fulfilment_reference,
        "promisedAt": promised_at,
        **({"paymentDueAt": payment_due_at} if payment_due_at is not None else {}),
        **({"creditDecision": credit_decision} if credit_decision is not None else {}),
        "lines": lines,
        "calculation": calculation,
        "total": total,
        "status": "confirmed",
    }
    movements = [
        {
            "id": _movement_id(
                evidence["actionId"],
                f"L{index + 1}" if len(lines) > 1 else None,
            ),
            "actionId": evidence["actionId"],
            "createdAt": created_at,
            "actor": evidence["actor"],
            "reason": evidence["reason"],
            "evidenceReference": evidence["evidenceReference"],
            "kind": "reserve",
            "sku": line["sku"],
            "quantityDelta": -line["quantity"],
            "orderId": order_id,
        }
        for index, line in enumerate(lines)
    ]
    next_state = {
        **current,
        "items": [
            {**item, "onHand": next_balances[item["sku"]]}
            if item["sku"] in next_balances
            else item
            for item in current["items"]
        ],
        "orders": [order, *current["orders"]],
        "movements": [*movements, *current["movements"]],
    }
    foundation = current.get("inventoryFoundation")
    if foundation is not None:
        try:
            next_state["inventoryFoundation"] = reserve_shop_inventory_order(
                foundation,
                order_id=order_id,
                customer_reference=customer,
                lines=[{"sku": line["sku"], "quantity": line["quantity"]} for line in lines],
                proof=evidence,
                catalog_skus=[item["sku"] for item in current["items"]],
            )
        except ShopInventoryValidationError as exc:
            raise TrialValidationError(str(exc)) from exc
    return validate_commerce_state(next_state)


def _catalog_baselines(state: Mapping[str, Any]) -> list[Any]:
    return state.get("catalogBaselines", [])


def _storefront_configuration_action_id(revision: int, digest: str) -> str:
    return f"ACT-STOREFRONT-R{revision}-{digest.removeprefix('sha256:')}"


def _proof_digest_projection(proof: Mapping[str, Any]) -> list[Any]:
    return [
        proof["actionId"],
        proof["capturedAt"],
        proof["actor"],
        proof["reason"],
        proof["evidenceReference"],
    ]


def _projection_digest(projection: Sequence[Any]) -> str:
    encoded = json.dumps(
        projection,
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    return f"sha256:{sha256(encoded).hexdigest()}"


def commerce_order_calculation_digest(order: Mapping[str, Any]) -> str | None:
    calculation = order.get("calculation")
    if not isinstance(calculation, Mapping):
        return None
    return _projection_digest(
        [
            "supermega.commerce.order-calculation.snapshot.v1",
            order["id"],
            calculation,
        ]
    )


def commerce_order_acknowledgement(
    state: Mapping[str, Any],
    order_id: str,
) -> dict[str, Any] | None:
    """Build a deterministic customer-safe acknowledgement without external side effects."""

    current = validate_commerce_state(state)
    order = next(
        (candidate for candidate in current["orders"] if candidate["id"] == order_id),
        None,
    )
    if (
        order is None
        or not isinstance(order.get("calculation"), Mapping)
        or not isinstance(order.get("lines"), list)
        or not order["lines"]
        or not order.get("fulfilment")
        or not order.get("fulfilmentReference")
        or not order.get("promisedAt")
    ):
        return None
    calculation = order["calculation"]
    calculation_digest = commerce_order_calculation_digest(order)
    if calculation_digest is None:
        return None
    lines = [
        {
            "sku": line["sku"],
            "name": line["name"],
            **({"variant": line["variant"]} if "variant" in line else {}),
            "quantity": line["quantity"],
            "unitPriceMmk": line["unitPriceMmk"],
            "lineTotalMmk": line["quantity"] * line["unitPriceMmk"],
        }
        for line in order["lines"]
    ]
    reserves = [
        movement
        for movement in current["movements"]
        if movement.get("kind") == "reserve" and movement.get("orderId") == order_id
    ]
    if len(reserves) != len(lines):
        return None
    confirmation = reserves[0]
    if any(
        movement["actionId"] != confirmation["actionId"]
        or movement["createdAt"] != confirmation["createdAt"]
        or movement["evidenceReference"] != confirmation["evidenceReference"]
        for movement in reserves
    ):
        return None
    releases = [
        movement
        for movement in current["movements"]
        if movement.get("kind") == "release" and movement.get("orderId") == order_id
    ]
    cancelled = order["status"] == "cancelled"
    if (cancelled and len(releases) != len(lines)) or (not cancelled and releases):
        return None
    cancellation = releases[0] if cancelled else None
    if cancellation is not None and any(
        movement["actionId"] != cancellation["actionId"]
        or movement["createdAt"] != cancellation["createdAt"]
        or movement["evidenceReference"] != cancellation["evidenceReference"]
        for movement in releases
    ):
        return None

    promotion = order.get("promotionDecision")
    shipping = order.get("shippingDecision")
    configured_tax = (
        calculation
        if calculation.get("schema") == "supermega.commerce.order-calculation.v2"
        else None
    )
    gross_subtotal = sum(line["lineTotalMmk"] for line in lines)
    artifact: dict[str, Any] = {
        "schema": COMMERCE_ORDER_ACKNOWLEDGEMENT_SCHEMA,
        "documentType": "order_acknowledgement",
        "notice": "Not a tax invoice, receipt, or payment confirmation.",
        "orderId": order["id"],
        "createdAt": order["createdAt"],
        "customer": order["customer"],
        "channel": order["channel"],
        "status": order["status"],
        "currency": "MMK",
        "lines": lines,
        "grossSubtotalMmk": gross_subtotal,
        "promotion": {
            "status": (
                "applied"
                if isinstance(promotion, Mapping) and promotion["status"] == "approved"
                else "not_applied"
                if isinstance(promotion, Mapping)
                else "not_recorded"
            ),
            "code": promotion.get("code") if isinstance(promotion, Mapping) else None,
            "reason": promotion.get("reason") if isinstance(promotion, Mapping) else None,
            "discountMmk": promotion.get("discountMmk", 0) if isinstance(promotion, Mapping) else 0,
            "netSubtotalMmk": promotion.get("netSubtotalMmk", gross_subtotal) if isinstance(promotion, Mapping) else gross_subtotal,
        },
        "delivery": {
            "fulfilment": order["fulfilment"],
            "reference": order["fulfilmentReference"],
            "township": shipping.get("township") if isinstance(shipping, Mapping) else None,
            "status": shipping.get("status", "not_recorded") if isinstance(shipping, Mapping) else "not_recorded",
            "feeMmk": shipping.get("feeMmk", 0) if isinstance(shipping, Mapping) else 0,
            "promisedAt": order["promisedAt"],
        },
        "tax": {
            "status": "configured" if configured_tax is not None else "not_configured",
            "code": configured_tax.get("taxCode") if configured_tax is not None else None,
            "jurisdictionCode": configured_tax.get("taxJurisdictionCode") if configured_tax is not None else None,
            "rateBasisPoints": configured_tax.get("taxRateBasisPoints", 0) if configured_tax is not None else 0,
            "mode": configured_tax.get("taxMode", "not_configured") if configured_tax is not None else "not_configured",
            "subtotalMmk": calculation["subtotalMmk"],
            "taxMmk": calculation["taxMmk"],
        },
        "totalMmk": calculation["totalMmk"],
        "payment": {
            "method": order["payment"],
            "status": order["paymentStatus"],
            "dueAt": order.get("paymentDueAt"),
            "reconciledAt": order.get("paymentReconciledAt"),
            "refundStatus": order["refundStatus"],
        },
        "cancellation": {
            "state": "cancelled" if cancelled else "not_cancelled",
            "cancelledAt": cancellation.get("createdAt") if cancellation else None,
            "actionId": cancellation.get("actionId") if cancellation else None,
            "evidenceReference": cancellation.get("evidenceReference") if cancellation else None,
        },
        "evidence": {
            "confirmationActionId": confirmation["actionId"],
            "confirmationCapturedAt": confirmation["createdAt"],
            "confirmationEvidenceReference": confirmation["evidenceReference"],
            "sourceRecordId": order.get("sourceRecordId"),
            "sourceEvidenceReference": order.get("evidenceReference"),
            "calculationDigest": calculation_digest,
        },
        "controls": {
            "customerMessageSent": False,
            "taxInvoiceIssued": False,
            "paymentProviderCalled": False,
            "externalWritePerformed": False,
        },
    }
    artifact["digest"] = _projection_digest(
        [
            artifact["schema"], artifact["documentType"], artifact["notice"],
            artifact["orderId"], artifact["createdAt"], artifact["customer"],
            artifact["channel"], artifact["status"], artifact["currency"],
            [[line["sku"], line["name"], line.get("variant"), line["quantity"], line["unitPriceMmk"], line["lineTotalMmk"]] for line in artifact["lines"]],
            artifact["grossSubtotalMmk"],
            [artifact["promotion"][field] for field in ("status", "code", "reason", "discountMmk", "netSubtotalMmk")],
            [artifact["delivery"][field] for field in ("fulfilment", "reference", "township", "status", "feeMmk", "promisedAt")],
            [artifact["tax"][field] for field in ("status", "code", "jurisdictionCode", "rateBasisPoints", "mode", "subtotalMmk", "taxMmk")],
            artifact["totalMmk"],
            [artifact["payment"][field] for field in ("method", "status", "dueAt", "reconciledAt", "refundStatus")],
            [artifact["cancellation"][field] for field in ("state", "cancelledAt", "actionId", "evidenceReference")],
            [artifact["evidence"][field] for field in ("confirmationActionId", "confirmationCapturedAt", "confirmationEvidenceReference", "sourceRecordId", "sourceEvidenceReference", "calculationDigest")],
            [artifact["controls"][field] for field in ("customerMessageSent", "taxInvoiceIssued", "paymentProviderCalled", "externalWritePerformed")],
        ]
    )
    return artifact


def commerce_order_acknowledgement_text(artifact: Mapping[str, Any]) -> str:
    """Format a customer-readable local download from a validated acknowledgement."""

    def one_line(value: Any) -> str:
        return " ".join(str(value).splitlines()).strip()

    promotion = artifact["promotion"]
    promotion_text = (
        f"{promotion.get('code') or 'Promotion'} - {promotion['discountMmk']} MMK discount"
        if promotion["status"] == "applied"
        else f"{promotion.get('code') or 'Promotion'} - not applied ({promotion.get('reason') or 'not approved'})"
        if promotion["status"] == "not_applied"
        else "No promotion recorded"
    )
    cancellation = artifact["cancellation"]
    cancellation_text = (
        f"Cancelled at {cancellation['cancelledAt']} - evidence {cancellation['evidenceReference']}"
        if cancellation["state"] == "cancelled"
        else "Not cancelled"
    )
    rows = [
        "SUPERMEGA ORDER ACKNOWLEDGEMENT",
        artifact["notice"],
        "",
        f"Order: {one_line(artifact['orderId'])}",
        f"Created: {artifact['createdAt']}",
        f"Customer: {one_line(artifact['customer'])}",
        f"Channel: {one_line(artifact['channel'])}",
        f"Status: {artifact['status']}",
        "",
        "ITEMS",
    ]
    for line in artifact["lines"]:
        variant = f" ({one_line(line['variant'])})" if line.get("variant") else ""
        rows.append(
            f"- {line['quantity']} x {one_line(line['name'])}{variant} "
            f"[{one_line(line['sku'])}] @ {line['unitPriceMmk']} MMK = "
            f"{line['lineTotalMmk']} MMK"
        )
    tax_code = (
        f" - {one_line(artifact['tax']['code'])}"
        if artifact["tax"].get("code")
        else ""
    )
    rows.extend(
        [
            "",
            f"Gross subtotal: {artifact['grossSubtotalMmk']} MMK",
            f"Promotion: {promotion_text}",
            f"Delivery: {one_line(artifact['delivery']['fulfilment'])} - {one_line(artifact['delivery']['reference'])} - fee {artifact['delivery']['feeMmk']} MMK",
            f"Promise: {artifact['delivery']['promisedAt']}",
            f"Tax: {artifact['tax']['status']}{tax_code} - {artifact['tax']['taxMmk']} MMK",
            f"Total: {artifact['totalMmk']} MMK",
            f"Payment: {one_line(artifact['payment']['method'])} - {artifact['payment']['status']} - refund {artifact['payment']['refundStatus']}",
            f"Cancellation: {cancellation_text}",
            "",
            f"Confirmation evidence: {one_line(artifact['evidence']['confirmationActionId'])} - {one_line(artifact['evidence']['confirmationEvidenceReference'])}",
            f"Calculation evidence: {artifact['evidence']['calculationDigest']}",
            f"Document digest: {artifact['digest']}",
            "",
            "No customer message was sent. No tax invoice was issued. No payment provider or external system was called.",
        ]
    )
    return "\r\n".join(rows)


def _correction_calculation(
    order: Mapping[str, Any],
    listed_amount_mmk: int,
) -> dict[str, Any] | None:
    calculation = order.get("calculation")
    if (
        not isinstance(calculation, Mapping)
        or isinstance(listed_amount_mmk, bool)
        or not isinstance(listed_amount_mmk, int)
        or not 1 <= listed_amount_mmk <= _MAX_SAFE_INTEGER
    ):
        return None
    if calculation.get("schema") == _ORDER_CALCULATION_SCHEMA:
        return {
            "currency": "MMK",
            "taxConfigurationRevision": None,
            "taxCode": None,
            "taxRateBasisPoints": None,
            "taxMode": "not_configured",
            "listedAmountMmk": listed_amount_mmk,
            "subtotalMmk": listed_amount_mmk,
            "taxMmk": 0,
            "totalMmk": listed_amount_mmk,
        }
    configured = _configured_order_calculation(
        {
            "revision": calculation["taxConfigurationRevision"],
            "code": calculation["taxCode"],
            "rateBasisPoints": calculation["taxRateBasisPoints"],
            "mode": calculation["taxMode"],
            **(
                {
                    "jurisdictionCode": calculation["taxJurisdictionCode"],
                    "effectiveFrom": calculation["taxEffectiveFrom"],
                }
                if "taxJurisdictionCode" in calculation
                and "taxEffectiveFrom" in calculation
                else {}
            ),
        },
        listed_amount_mmk,
        int(calculation["catalogRevision"]),
    )
    if configured is None:
        return None
    result = {
        "currency": configured["currency"],
        "taxConfigurationRevision": configured["taxConfigurationRevision"],
        "taxCode": configured["taxCode"],
        "taxRateBasisPoints": configured["taxRateBasisPoints"],
        "taxMode": configured["taxMode"],
        "listedAmountMmk": configured["listedSubtotalMmk"],
        "subtotalMmk": configured["subtotalMmk"],
        "taxMmk": configured["taxMmk"],
        "totalMmk": configured["totalMmk"],
    }
    if "taxJurisdictionCode" in configured and "taxEffectiveFrom" in configured:
        result["taxJurisdictionCode"] = configured["taxJurisdictionCode"]
        result["taxEffectiveFrom"] = configured["taxEffectiveFrom"]
    return result


def _order_adjusted_total(order: Mapping[str, Any]) -> int | None:
    total = int(order["total"])
    for correction in order.get("corrections", []):
        amount = int(correction["calculation"]["totalMmk"])
        total += amount if correction["kind"] == "debit" else -amount
        if not 0 <= total <= _MAX_SAFE_INTEGER:
            return None
    return total


def commerce_catalog_baseline_digest(baseline: Mapping[str, Any]) -> str:
    """Bind one opening price and reorder snapshot to its accountable proof."""

    return _projection_digest(
        [
            "supermega.commerce.catalog-baseline.v1",
            baseline["sku"],
            baseline["price"],
            baseline["reorderAt"],
            _proof_digest_projection(baseline["proof"]),
        ]
    )


def commerce_website_intake_snapshot_digest(intake: Mapping[str, Any]) -> str:
    """Bind the immutable Website intake fields retained for later review."""

    source = intake["source"]
    return _projection_digest(
        [
            "supermega.commerce.website-intake.snapshot.v1",
            intake["id"],
            intake["createdAt"],
            [
                source["fingerprint"],
                source["approvalId"],
                source["snapshotId"],
                source["pageId"],
                source["siteName"],
                source["pagePath"],
            ],
            intake["sku"],
            intake["quantity"],
            intake["itemName"],
            intake.get("itemVariant"),
            intake["unitPrice"],
            intake["total"],
            _proof_digest_projection(intake["creation"]),
        ]
    )


def commerce_catalog_digest(state: Mapping[str, Any]) -> str:
    projection = [
        [
            item["sku"],
            item["name"],
            item.get("variant"),
            item["price"],
        ]
        for item in sorted(state["items"], key=lambda item: item["sku"])
    ]
    encoded = json.dumps(
        projection,
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    return f"sha256:{sha256(encoded).hexdigest()}"


def commerce_daily_close_export(
    state: Mapping[str, Any],
    close_id: str,
) -> dict[str, Any] | None:
    """Project one attributable close into a deterministic, PII-minimised ledger artifact."""

    current = validate_commerce_state(state)
    close = next(
        (candidate for candidate in current["closes"] if candidate["id"] == close_id),
        None,
    )
    if close is None or not _CLOSE_SNAPSHOT_FIELDS.issubset(close):
        return None
    order_by_id = {order["id"]: order for order in current["orders"]}
    close_at = datetime.fromisoformat(close["createdAt"].replace("Z", "+00:00"))
    if any(
        _commerce_order_close_basis(order_by_id[order_id]) > close_at
        for order_id in close["orderIds"]
    ):
        return None
    rows: list[dict[str, Any]] = []
    for order_id in close["orderIds"]:
        order = order_by_id[order_id]
        calculation = order.get("calculation")
        accepted_calculation = isinstance(calculation, Mapping)
        corrections = [
            {
                "documentId": correction["documentId"],
                "kind": correction["kind"],
                "reasonCode": correction["reasonCode"],
                "createdAt": correction["createdAt"],
                "actor": correction["actor"],
                "evidenceReference": correction["evidenceReference"],
                "sourceCalculationDigest": correction["sourceCalculationDigest"],
                "listedAmountMmk": correction["calculation"]["listedAmountMmk"],
                "subtotalMmk": correction["calculation"]["subtotalMmk"],
                "taxMmk": correction["calculation"]["taxMmk"],
                "totalMmk": correction["calculation"]["totalMmk"],
                "balanceAfterMmk": correction["balanceAfterMmk"],
                "financialStatus": correction["financialStatus"],
                "postingAuthority": correction["postingAuthority"],
                "externalPostingPerformed": correction["externalPostingPerformed"],
            }
            for correction in order.get("corrections", [])
        ]
        adjusted_total = _order_adjusted_total(order)
        if adjusted_total is None:
            return None
        rows.append(
            {
                "orderId": order["id"],
                "orderCreatedAt": order["createdAt"],
                "paymentMethod": order["payment"],
                "paymentReconciledAt": order.get("paymentReconciledAt"),
                "paymentEvidenceReference": order.get("paymentEvidenceReference"),
                "currency": calculation["currency"] if accepted_calculation else "MMK",
                "catalogRevision": calculation["catalogRevision"] if accepted_calculation else None,
                "taxConfigurationRevision": (
                    calculation.get("taxConfigurationRevision")
                    if accepted_calculation
                    else None
                ),
                "taxCode": calculation.get("taxCode") if accepted_calculation else None,
                "taxJurisdictionCode": (
                    calculation.get("taxJurisdictionCode")
                    if accepted_calculation
                    else None
                ),
                "taxEffectiveFrom": (
                    calculation.get("taxEffectiveFrom")
                    if accepted_calculation
                    else None
                ),
                "taxRateBasisPoints": (
                    calculation.get("taxRateBasisPoints")
                    if accepted_calculation
                    else None
                ),
                "listedSubtotalMmk": (
                    calculation.get("listedSubtotalMmk")
                    if accepted_calculation
                    else None
                ),
                "subtotalMmk": calculation["subtotalMmk"] if accepted_calculation else None,
                "taxMode": calculation["taxMode"] if accepted_calculation else "not_recorded",
                "taxMmk": calculation["taxMmk"] if accepted_calculation else None,
                "originalTotalMmk": order["total"],
                "totalMmk": adjusted_total,
                "corrections": corrections,
                "calculationStatus": "accepted" if accepted_calculation else "legacy_unverified",
            }
        )
    artifact: dict[str, Any] = {
        "schema": COMMERCE_DAILY_CLOSE_EXPORT_SCHEMA,
        "closeId": close["id"],
        "businessDate": close["businessDate"],
        "closedAt": close["createdAt"],
        "actionId": close["actionId"],
        "operator": close["operator"],
        "reason": close["reason"],
        "evidenceReference": close["evidenceReference"],
        "totalMmk": close["total"],
        "orderCount": close["orders"],
        "paymentExceptionOrderIds": list(close["paymentExceptionOrderIds"]),
        "stockExceptionSkus": list(close["stockExceptionSkus"]),
        "orders": rows,
    }
    artifact["digest"] = _projection_digest(
        [
            artifact["schema"],
            artifact["closeId"],
            artifact["businessDate"],
            artifact["closedAt"],
            artifact["actionId"],
            artifact["operator"],
            artifact["reason"],
            artifact["evidenceReference"],
            artifact["totalMmk"],
            artifact["orderCount"],
            artifact["paymentExceptionOrderIds"],
            artifact["stockExceptionSkus"],
            [
                [
                    row["orderId"],
                    row["orderCreatedAt"],
                    row["paymentMethod"],
                    row["paymentReconciledAt"],
                    row["paymentEvidenceReference"],
                    row["currency"],
                    row["catalogRevision"],
                    row["taxConfigurationRevision"],
                    row["taxCode"],
                    row["taxJurisdictionCode"],
                    row["taxEffectiveFrom"],
                    row["taxRateBasisPoints"],
                    row["listedSubtotalMmk"],
                    row["subtotalMmk"],
                    row["taxMode"],
                    row["taxMmk"],
                    row["originalTotalMmk"],
                    row["totalMmk"],
                    [
                        [
                            correction["documentId"],
                            correction["kind"],
                            correction["reasonCode"],
                            correction["createdAt"],
                            correction["actor"],
                            correction["evidenceReference"],
                            correction["sourceCalculationDigest"],
                            correction["listedAmountMmk"],
                            correction["subtotalMmk"],
                            correction["taxMmk"],
                            correction["totalMmk"],
                            correction["balanceAfterMmk"],
                            correction["financialStatus"],
                            correction["postingAuthority"],
                            correction["externalPostingPerformed"],
                        ]
                        for correction in row["corrections"]
                    ],
                    row["calculationStatus"],
                ]
                for row in rows
            ],
        ]
    )
    return artifact


def _commerce_csv_cell(value: Any) -> str:
    if isinstance(value, list):
        raw = ";".join(str(entry) for entry in value)
    elif value is None:
        raw = ""
    else:
        raw = str(value)
    if raw.startswith(("=", "+", "-", "@")):
        raw = f"'{raw}"
    return f'"{raw.replace(chr(34), chr(34) * 2)}"'


def commerce_daily_close_csv(
    state: Mapping[str, Any],
    close_id: str,
) -> str | None:
    """Render the trusted close projection as a formula-safe deterministic CSV."""

    artifact = commerce_daily_close_export(state, close_id)
    if artifact is None:
        return None
    header = [
        "schema",
        "record_type",
        "close_id",
        "business_date",
        "closed_at",
        "operator",
        "evidence_reference",
        "order_id",
        "order_created_at",
        "payment_method",
        "payment_reconciled_at",
        "payment_evidence_reference",
        "currency",
        "catalog_revision",
        "tax_configuration_revision",
        "tax_code",
        "tax_jurisdiction_code",
        "tax_effective_from",
        "tax_rate_basis_points",
        "listed_subtotal_mmk",
        "subtotal_mmk",
        "tax_mode",
        "tax_mmk",
        "original_total_mmk",
        "total_mmk",
        "corrections_json",
        "calculation_status",
        "payment_exception_order_ids",
        "stock_exception_skus",
        "artifact_digest",
    ]
    rows: list[list[Any]] = [
        [
            artifact["schema"],
            "close",
            artifact["closeId"],
            artifact["businessDate"],
            artifact["closedAt"],
            artifact["operator"],
            artifact["evidenceReference"],
            None,
            None,
            None,
            None,
            None,
            "MMK",
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            artifact["totalMmk"],
            None,
            None,
            artifact["paymentExceptionOrderIds"],
            artifact["stockExceptionSkus"],
            artifact["digest"],
        ]
    ]
    rows.extend(
        [
            artifact["schema"],
            "order",
            artifact["closeId"],
            artifact["businessDate"],
            artifact["closedAt"],
            None,
            None,
            row["orderId"],
            row["orderCreatedAt"],
            row["paymentMethod"],
            row["paymentReconciledAt"],
            row["paymentEvidenceReference"],
            row["currency"],
            row["catalogRevision"],
            row["taxConfigurationRevision"],
            row["taxCode"],
            row["taxJurisdictionCode"],
            row["taxEffectiveFrom"],
            row["taxRateBasisPoints"],
            row["listedSubtotalMmk"],
            row["subtotalMmk"],
            row["taxMode"],
            row["taxMmk"],
            row["originalTotalMmk"],
            row["totalMmk"],
            json.dumps(row["corrections"], ensure_ascii=False, separators=(",", ":")),
            row["calculationStatus"],
            None,
            None,
            artifact["digest"],
        ]
        for row in artifact["orders"]
    )
    return "\r\n".join(
        ",".join(_commerce_csv_cell(cell) for cell in row)
        for row in [header, *rows]
    ) + "\r\n"


def commerce_accounting_handoff(
    state: Mapping[str, Any],
    close_id: str,
) -> dict[str, Any] | None:
    """Create a balanced, review-only handoff with correction settlement traceability."""

    current = validate_commerce_state(state)
    close_export = commerce_daily_close_export(current, close_id)
    if close_export is None:
        return None
    closed_at = datetime.fromisoformat(close_export["closedAt"].replace("Z", "+00:00"))
    account_mapping = next(
        (
            configuration
            for configuration in _account_mapping_configurations(current)
            if datetime.fromisoformat(
                configuration["proof"]["capturedAt"].replace("Z", "+00:00")
            ) <= closed_at
        ),
        None,
    )
    account_code_by_role = {
        mapping["accountRole"]: mapping["externalAccountCode"]
        for mapping in account_mapping["mappings"]
    } if account_mapping is not None else {}

    def mapping_for(account_role: str) -> dict[str, Any]:
        code = account_code_by_role.get(account_role)
        return {
            "externalAccountCode": code,
            "mappingStatus": "mapped" if code else "unmapped",
        }

    payment_groups: dict[str, dict[str, Any]] = {}
    accepted_subtotal_mmk = 0
    accepted_tax_mmk = 0
    legacy_unverified_mmk = 0
    accepted_order_count = 0
    legacy_unverified_order_count = 0
    tax_configured_order_count = 0
    original_order_total_mmk = 0
    for order in close_export["orders"]:
        payment = payment_groups.setdefault(
            order["paymentMethod"], {"amountMmk": 0, "statuses": set()}
        )
        payment["amountMmk"] += order["originalTotalMmk"]
        payment["statuses"].add(order["calculationStatus"])
        original_order_total_mmk += order["originalTotalMmk"]
        if (
            order["calculationStatus"] == "accepted"
            and order["subtotalMmk"] is not None
            and order["taxMmk"] is not None
        ):
            accepted_order_count += 1
            accepted_subtotal_mmk += order["subtotalMmk"]
            accepted_tax_mmk += order["taxMmk"]
            if order["taxMode"] != "not_configured":
                tax_configured_order_count += 1
        else:
            legacy_unverified_order_count += 1
            legacy_unverified_mmk += order["originalTotalMmk"]

    entries: list[dict[str, Any]] = []
    for index, payment_method in enumerate(sorted(payment_groups), start=1):
        group = payment_groups[payment_method]
        statuses = group["statuses"]
        entries.append({
            "lineId": f"DEBIT-{index:03d}",
            "side": "debit",
            "accountRole": "payment_clearing",
            **mapping_for("payment_clearing"),
            "paymentMethod": payment_method,
            "sourceOrderId": None,
            "sourceDocumentId": None,
            "calculationStatus": "mixed" if len(statuses) > 1 else next(iter(statuses)),
            "amountMmk": group["amountMmk"],
        })
    credits: list[dict[str, Any]] = []
    for account_role, amount_mmk, status in (
        ("sales_revenue", accepted_subtotal_mmk, "accepted"),
        ("tax_payable", accepted_tax_mmk, "accepted"),
        ("sales_revenue_unverified", legacy_unverified_mmk, "legacy_unverified"),
    ):
        if amount_mmk:
            credits.append({
                "side": "credit",
                "accountRole": account_role,
                **mapping_for(account_role),
                "paymentMethod": None,
                "sourceOrderId": None,
                "sourceDocumentId": None,
                "calculationStatus": status,
                "amountMmk": amount_mmk,
            })
    entries.extend(
        {**entry, "lineId": f"CREDIT-{index:03d}"}
        for index, entry in enumerate(credits, start=1)
    )

    corrections = sorted(
        (
            (order, correction)
            for order in close_export["orders"]
            for correction in order["corrections"]
        ),
        key=lambda pair: (
            pair[1]["createdAt"], pair[0]["orderId"], pair[1]["documentId"]
        ),
    )
    credit_correction_mmk = 0
    debit_correction_mmk = 0
    for index, (order, correction) in enumerate(corrections, start=1):
        suffix = f"{index:03d}"
        base = {
            "paymentMethod": None,
            "sourceOrderId": order["orderId"],
            "sourceDocumentId": correction["documentId"],
            "calculationStatus": order["calculationStatus"],
        }
        if correction["kind"] == "credit":
            credit_correction_mmk += correction["totalMmk"]
            if correction["subtotalMmk"]:
                entries.append({
                    "lineId": f"CORR-{suffix}-ADJ-D", "side": "debit",
                    "accountRole": "sales_adjustment", **mapping_for("sales_adjustment"),
                    **base, "amountMmk": correction["subtotalMmk"],
                })
            if correction["taxMmk"]:
                entries.append({
                    "lineId": f"CORR-{suffix}-TAX-D", "side": "debit",
                    "accountRole": "tax_payable", **mapping_for("tax_payable"),
                    **base, "amountMmk": correction["taxMmk"],
                })
            entries.append({
                "lineId": f"CORR-{suffix}-PAY-C", "side": "credit",
                "accountRole": "correction_payable", **mapping_for("correction_payable"),
                **base, "amountMmk": correction["totalMmk"],
            })
        else:
            debit_correction_mmk += correction["totalMmk"]
            entries.append({
                "lineId": f"CORR-{suffix}-REC-D", "side": "debit",
                "accountRole": "correction_receivable", **mapping_for("correction_receivable"),
                **base, "amountMmk": correction["totalMmk"],
            })
            if correction["subtotalMmk"]:
                entries.append({
                    "lineId": f"CORR-{suffix}-ADJ-C", "side": "credit",
                    "accountRole": "sales_adjustment", **mapping_for("sales_adjustment"),
                    **base, "amountMmk": correction["subtotalMmk"],
                })
            if correction["taxMmk"]:
                entries.append({
                    "lineId": f"CORR-{suffix}-TAX-C", "side": "credit",
                    "accountRole": "tax_payable", **mapping_for("tax_payable"),
                    **base, "amountMmk": correction["taxMmk"],
                })

    total_debit_mmk = sum(
        entry["amountMmk"] for entry in entries if entry["side"] == "debit"
    )
    total_credit_mmk = sum(
        entry["amountMmk"] for entry in entries if entry["side"] == "credit"
    )
    expected_control_total_mmk = (
        original_order_total_mmk + credit_correction_mmk + debit_correction_mmk
    )
    if total_debit_mmk != expected_control_total_mmk or total_credit_mmk != expected_control_total_mmk:
        return None
    artifact: dict[str, Any] = {
        "schema": COMMERCE_ACCOUNTING_HANDOFF_SCHEMA,
        "status": "review_required",
        "postingAuthority": "none",
        "externalPostingPerformed": False,
        "currency": "MMK",
        "closeId": close_export["closeId"],
        "businessDate": close_export["businessDate"],
        "closedAt": close_export["closedAt"],
        "sourceCloseDigest": close_export["digest"],
        "accountMappingRevision": account_mapping["revision"] if account_mapping else None,
        "accountMappingEvidenceReference": account_mapping["proof"]["evidenceReference"] if account_mapping else None,
        "originalOrderTotalMmk": original_order_total_mmk,
        "netOrderTotalMmk": close_export["totalMmk"],
        "correctionCount": len(corrections),
        "creditCorrectionMmk": credit_correction_mmk,
        "debitCorrectionMmk": debit_correction_mmk,
        "totalDebitMmk": total_debit_mmk,
        "totalCreditMmk": total_credit_mmk,
        "acceptedOrderCount": accepted_order_count,
        "legacyUnverifiedOrderCount": legacy_unverified_order_count,
        "taxConfiguredOrderCount": tax_configured_order_count,
        "paymentExceptionOrderIds": list(close_export["paymentExceptionOrderIds"]),
        "stockExceptionSkus": list(close_export["stockExceptionSkus"]),
        "entries": entries,
    }
    artifact["digest"] = _projection_digest([
        artifact["schema"], artifact["status"], artifact["postingAuthority"],
        artifact["externalPostingPerformed"], artifact["currency"], artifact["closeId"],
        artifact["businessDate"], artifact["closedAt"], artifact["sourceCloseDigest"],
        artifact["accountMappingRevision"], artifact["accountMappingEvidenceReference"],
        artifact["originalOrderTotalMmk"], artifact["netOrderTotalMmk"],
        artifact["correctionCount"], artifact["creditCorrectionMmk"],
        artifact["debitCorrectionMmk"], artifact["totalDebitMmk"],
        artifact["totalCreditMmk"], artifact["acceptedOrderCount"],
        artifact["legacyUnverifiedOrderCount"], artifact["taxConfiguredOrderCount"],
        artifact["paymentExceptionOrderIds"], artifact["stockExceptionSkus"],
        [[
            entry["lineId"], entry["side"], entry["accountRole"],
            entry["externalAccountCode"], entry["paymentMethod"],
            entry["sourceOrderId"], entry["sourceDocumentId"],
            entry["calculationStatus"], entry["amountMmk"], entry["mappingStatus"],
        ] for entry in entries],
    ])
    return artifact


def commerce_accounting_handoff_csv(artifact: Mapping[str, Any]) -> str:
    """Render one derived accounting handoff as a formula-safe deterministic CSV."""

    header = [
        "schema", "status", "posting_authority", "external_posting_performed",
        "close_id", "business_date", "closed_at", "currency", "source_close_digest",
        "account_mapping_revision", "account_mapping_evidence_reference",
        "original_order_total_mmk", "net_order_total_mmk", "correction_count",
        "credit_correction_mmk", "debit_correction_mmk", "line_id",
        "side", "account_role", "external_account_code", "payment_method",
        "source_order_id", "source_document_id", "calculation_status", "amount_mmk",
        "mapping_status", "accepted_order_count",
        "legacy_unverified_order_count", "tax_configured_order_count",
        "payment_exception_order_ids", "stock_exception_skus", "artifact_digest",
    ]
    rows = [
        [
            artifact["schema"], artifact["status"], artifact["postingAuthority"],
            str(artifact["externalPostingPerformed"]).lower(), artifact["closeId"],
            artifact["businessDate"], artifact["closedAt"], artifact["currency"],
            artifact["sourceCloseDigest"], artifact["accountMappingRevision"],
            artifact["accountMappingEvidenceReference"], artifact["originalOrderTotalMmk"],
            artifact["netOrderTotalMmk"], artifact["correctionCount"],
            artifact["creditCorrectionMmk"], artifact["debitCorrectionMmk"],
            entry["lineId"], entry["side"],
            entry["accountRole"], entry["externalAccountCode"], entry["paymentMethod"],
            entry["sourceOrderId"], entry["sourceDocumentId"], entry["calculationStatus"],
            entry["amountMmk"], entry["mappingStatus"],
            artifact["acceptedOrderCount"], artifact["legacyUnverifiedOrderCount"],
            artifact["taxConfiguredOrderCount"], artifact["paymentExceptionOrderIds"],
            artifact["stockExceptionSkus"], artifact["digest"],
        ]
        for entry in artifact["entries"]
    ]
    return "\r\n".join(
        ",".join(_commerce_csv_cell(cell) for cell in row)
        for row in [header, *rows]
    ) + "\r\n"


def _supplier_payables_handoff_projection(artifact: Mapping[str, Any]) -> list[Any]:
    return [
        artifact["schema"], artifact["status"], artifact["paymentAuthority"],
        artifact["paymentInitiated"], artifact["accountingPosted"], artifact["currency"],
        artifact["generatedAt"], artifact["readyInvoiceCount"], artifact["excludedInvoiceCount"],
        artifact["excludedInvoiceIds"], artifact["grossInvoiceTotalMmk"],
        artifact["supplierCreditTotalMmk"], artifact["netPayableTotalMmk"],
        [[
            row["purchaseOrderId"], row["requisitionId"], row["supplier"], row["sku"],
            row["invoiceId"], row["supplierInvoiceReference"], row["invoiceIssuedAt"],
            row["dueAt"], row["orderedQuantity"], row["acceptedQuantity"],
            row["rejectedQuantity"], row["invoicedQuantity"], row["unitCostMmk"],
            row["grossInvoiceMmk"], row["supplierClaimMmk"], row["supplierCreditMmk"],
            row["netPayableMmk"], row["payableReviewActionId"], row["payableReviewedAt"],
            row["payableReviewedBy"], row["payableEvidenceReference"],
            row["receiptMovementIds"], row["supplierReturnClaimIds"],
            row["supplierCreditNoteIds"], row["physicalReturnStatus"],
            row["supplierContacted"], row["accountingPosted"], row["paymentInitiated"],
        ] for row in artifact["rows"]],
    ]


def commerce_supplier_payables_handoff(
    state: Mapping[str, Any],
) -> dict[str, Any] | None:
    """Create a deterministic AP review packet without posting or initiating payment."""

    current = validate_commerce_state(state)
    invoiced_orders = sorted(
        (
            purchase_order for purchase_order in _purchase_orders(current)
            if isinstance(purchase_order.get("supplierInvoice"), Mapping)
        ),
        key=lambda purchase_order: (
            purchase_order["supplierInvoice"]["dueAt"],
            purchase_order["supplier"],
            purchase_order["supplierInvoice"]["id"],
        ),
    )
    excluded_invoice_ids: list[str] = []
    rows: list[dict[str, Any]] = []
    for purchase_order in invoiced_orders:
        invoice = purchase_order["supplierInvoice"]
        match = commerce_supplier_invoice_match(current, purchase_order)
        payable_review = invoice.get("payableReview")
        if not match["payableReady"] or not isinstance(payable_review, Mapping):
            excluded_invoice_ids.append(invoice["id"])
            continue
        claims = purchase_order.get("supplierReturns", [])
        rows.append({
            "purchaseOrderId": purchase_order["id"],
            "requisitionId": purchase_order.get("requisitionId"),
            "supplier": purchase_order["supplier"],
            "sku": purchase_order["sku"],
            "invoiceId": invoice["id"],
            "supplierInvoiceReference": invoice["supplierReference"],
            "invoiceIssuedAt": invoice["issuedAt"],
            "dueAt": invoice["dueAt"],
            "orderedQuantity": match["orderedQuantity"],
            "acceptedQuantity": match["acceptedQuantity"],
            "rejectedQuantity": match["rejectedQuantity"],
            "invoicedQuantity": match["invoicedQuantity"],
            "unitCostMmk": match["invoicedUnitCostMmk"],
            "grossInvoiceMmk": match["invoicedTotalMmk"],
            "supplierClaimMmk": match["supplierClaimMmk"],
            "supplierCreditMmk": match["supplierCreditMmk"],
            "netPayableMmk": match["netInvoiceTotalMmk"],
            "payableReviewActionId": payable_review["actionId"],
            "payableReviewedAt": payable_review["capturedAt"],
            "payableReviewedBy": payable_review["actor"],
            "payableEvidenceReference": payable_review["evidenceReference"],
            "receiptMovementIds": sorted(
                movement["id"] for movement in current["movements"]
                if movement.get("kind") == "receipt"
                and movement.get("purchaseOrderId") == purchase_order["id"]
            ),
            "supplierReturnClaimIds": sorted(claim["id"] for claim in claims),
            "supplierCreditNoteIds": sorted(
                credit["id"] for claim in claims for credit in claim["creditNotes"]
            ),
            "physicalReturnStatus": "not_dispatched" if match["rejectedQuantity"] else "not_required",
            "supplierContacted": False,
            "accountingPosted": False,
            "paymentInitiated": False,
        })
    if not rows:
        return None
    gross_invoice_total_mmk = sum(row["grossInvoiceMmk"] for row in rows)
    supplier_credit_total_mmk = sum(row["supplierCreditMmk"] for row in rows)
    net_payable_total_mmk = sum(row["netPayableMmk"] for row in rows)
    if (
        any(abs(total) > _MAX_SAFE_INTEGER for total in (
            gross_invoice_total_mmk, supplier_credit_total_mmk, net_payable_total_mmk
        ))
        or gross_invoice_total_mmk - supplier_credit_total_mmk != net_payable_total_mmk
    ):
        raise TrialValidationError(
            "Supplier payables handoff totals exceed the supported safe integer range or do not balance."
        )
    artifact: dict[str, Any] = {
        "schema": COMMERCE_SUPPLIER_PAYABLES_HANDOFF_SCHEMA,
        "status": "review_required",
        "paymentAuthority": "none",
        "paymentInitiated": False,
        "accountingPosted": False,
        "currency": "MMK",
        "generatedAt": max(row["payableReviewedAt"] for row in rows),
        "readyInvoiceCount": len(rows),
        "excludedInvoiceCount": len(excluded_invoice_ids),
        "excludedInvoiceIds": excluded_invoice_ids,
        "grossInvoiceTotalMmk": gross_invoice_total_mmk,
        "supplierCreditTotalMmk": supplier_credit_total_mmk,
        "netPayableTotalMmk": net_payable_total_mmk,
        "rows": rows,
    }
    artifact["digest"] = _projection_digest(_supplier_payables_handoff_projection(artifact))
    return artifact


def commerce_supplier_payables_handoff_csv(artifact: Mapping[str, Any]) -> str:
    """Render a formula-safe supplier-payables packet after verifying its digest."""

    if (
        artifact.get("schema") != COMMERCE_SUPPLIER_PAYABLES_HANDOFF_SCHEMA
        or artifact.get("digest") != _projection_digest(_supplier_payables_handoff_projection(artifact))
    ):
        raise TrialValidationError("Supplier payables handoff integrity check failed.")
    header = [
        "schema", "status", "payment_authority", "payment_initiated", "accounting_posted",
        "currency", "generated_at", "ready_invoice_count", "excluded_invoice_count",
        "excluded_invoice_ids", "gross_invoice_total_mmk", "supplier_credit_total_mmk",
        "net_payable_total_mmk", "purchase_order_id", "requisition_id", "supplier", "sku",
        "invoice_id", "supplier_invoice_reference", "invoice_issued_at", "due_at",
        "ordered_quantity", "accepted_quantity", "rejected_quantity", "invoiced_quantity",
        "unit_cost_mmk", "gross_invoice_mmk", "supplier_claim_mmk", "supplier_credit_mmk",
        "net_payable_mmk", "payable_review_action_id", "payable_reviewed_at",
        "payable_reviewed_by", "payable_evidence_reference", "receipt_movement_ids",
        "supplier_return_claim_ids", "supplier_credit_note_ids", "physical_return_status",
        "supplier_contacted", "row_accounting_posted", "row_payment_initiated", "artifact_digest",
    ]
    rows = [[
        artifact["schema"], artifact["status"], artifact["paymentAuthority"],
        str(artifact["paymentInitiated"]).lower(), str(artifact["accountingPosted"]).lower(),
        artifact["currency"], artifact["generatedAt"], artifact["readyInvoiceCount"],
        artifact["excludedInvoiceCount"], artifact["excludedInvoiceIds"],
        artifact["grossInvoiceTotalMmk"], artifact["supplierCreditTotalMmk"],
        artifact["netPayableTotalMmk"], row["purchaseOrderId"], row["requisitionId"],
        row["supplier"], row["sku"], row["invoiceId"], row["supplierInvoiceReference"],
        row["invoiceIssuedAt"], row["dueAt"], row["orderedQuantity"], row["acceptedQuantity"],
        row["rejectedQuantity"], row["invoicedQuantity"], row["unitCostMmk"],
        row["grossInvoiceMmk"], row["supplierClaimMmk"], row["supplierCreditMmk"],
        row["netPayableMmk"], row["payableReviewActionId"], row["payableReviewedAt"],
        row["payableReviewedBy"], row["payableEvidenceReference"], row["receiptMovementIds"],
        row["supplierReturnClaimIds"], row["supplierCreditNoteIds"], row["physicalReturnStatus"],
        str(row["supplierContacted"]).lower(), str(row["accountingPosted"]).lower(),
        str(row["paymentInitiated"]).lower(), artifact["digest"],
    ] for row in artifact["rows"]]
    return "\r\n".join(
        ",".join(_commerce_csv_cell(cell) for cell in row)
        for row in [header, *rows]
    ) + "\r\n"


def commerce_supplier_payables_aging(
    state: Mapping[str, Any],
    as_of: str,
) -> dict[str, Any]:
    """Prioritize reviewed supplier payables without creating payment authority."""

    current = validate_commerce_state(state)
    canonical_as_of = _timestamp(as_of, "Supplier payables aging asOf")
    as_of_time = datetime.fromisoformat(canonical_as_of.replace("Z", "+00:00"))
    blocked_invoice_count = 0
    rows: list[dict[str, Any]] = []
    for purchase_order in _purchase_orders(current):
        invoice = purchase_order.get("supplierInvoice")
        if not isinstance(invoice, Mapping):
            continue
        match = commerce_supplier_invoice_match(current, purchase_order)
        if not match["payableReady"]:
            blocked_invoice_count += 1
            continue
        due_time = datetime.fromisoformat(invoice["dueAt"].replace("Z", "+00:00"))
        if as_of_time > due_time:
            days_past_due = max(1, (as_of_time - due_time + timedelta(days=1) - timedelta.resolution).days)
            days_until_due = 0
            bucket = "overdue"
        else:
            days_past_due = 0
            days_until_due = max(0, (due_time - as_of_time + timedelta(days=1) - timedelta.resolution).days)
            bucket = "due_7_days" if days_until_due <= 7 else "scheduled"
        rows.append({
            "purchaseOrderId": purchase_order["id"],
            "invoiceId": invoice["id"],
            "supplier": purchase_order["supplier"],
            "dueAt": invoice["dueAt"],
            "netPayableMmk": match["netInvoiceTotalMmk"],
            "daysPastDue": days_past_due,
            "daysUntilDue": days_until_due,
            "bucket": bucket,
        })
    rank = {"overdue": 0, "due_7_days": 1, "scheduled": 2}
    rows.sort(key=lambda row: (rank[row["bucket"]], row["dueAt"], row["invoiceId"]))
    totals_mmk = {
        bucket: sum(row["netPayableMmk"] for row in rows if row["bucket"] == bucket)
        for bucket in ("overdue", "due_7_days", "scheduled")
    }
    total_net_payable_mmk = sum(row["netPayableMmk"] for row in rows)
    if any(abs(value) > _MAX_SAFE_INTEGER for value in (*totals_mmk.values(), total_net_payable_mmk)):
        raise TrialValidationError(
            "Supplier payables aging totals exceed the supported safe integer range."
        )
    return {
        "asOf": canonical_as_of,
        "rows": rows,
        "totalsMmk": totals_mmk,
        "totalNetPayableMmk": total_net_payable_mmk,
        "overdueInvoiceCount": sum(row["bucket"] == "overdue" for row in rows),
        "dueWithin7DaysInvoiceCount": sum(row["bucket"] == "due_7_days" for row in rows),
        "blockedInvoiceCount": blocked_invoice_count,
        "paymentAuthority": "none",
        "paymentInitiated": False,
    }


def _configured_storefront_preview_digest(
    state: Mapping[str, Any],
    configuration: Mapping[str, Any],
) -> str:
    item_by_sku = {item["sku"]: item for item in state["items"]}
    merchandising_by_sku = {
        row["sku"]: row for row in configuration.get("merchandising", [])
    }

    def preview_item(sku: str) -> dict[str, Any]:
        item = item_by_sku[sku]
        merchandising = merchandising_by_sku.get(sku)
        projected = {
            "sku": item["sku"],
            "name": item["name"],
            "variant": item.get("variant"),
            "unitPriceMmk": item["price"],
            "availability": "available" if item["onHand"] > 0 else "sold_out",
        }
        if merchandising is not None:
            projected["merchandising"] = {
                "featured": merchandising["featured"],
                "collection": merchandising["collection"],
                "displayName": merchandising["displayName"],
                "note": merchandising["note"],
            }
        return projected

    preview = {
        "schema": _STOREFRONT_PREVIEW_SCHEMA,
        "mode": "browser-local-preview",
        "sourceCatalogSchema": COMMERCE_SCHEMA,
        "storeName": configuration["storeName"],
        "summary": configuration["summary"],
        "currency": "MMK",
        "items": [preview_item(sku) for sku in configuration["selectedSkus"]],
    }
    encoded = json.dumps(
        preview,
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    return f"sha256:{sha256(encoded).hexdigest()}"


def commerce_storefront_preview_digest(state: Mapping[str, Any]) -> str:
    """Return the digest of the saved storefront rendered from the current Shop state."""

    current = validate_commerce_state(state)
    configuration = _storefront_configuration(current)
    if configuration is None:
        raise TrialValidationError(
            "a saved storefront configuration is required before its preview can be bound."
        )
    if configuration["shopCatalogDigest"] != commerce_catalog_digest(current):
        raise TrialValidationError(
            "the saved storefront configuration does not match the current Shop catalog."
        )
    return _configured_storefront_preview_digest(current, configuration)


def _require_website_intakes_unchanged(current: Mapping[str, Any], next_state: Mapping[str, Any]) -> None:
    if _website_intakes(current) != _website_intakes(next_state):
        raise TrialValidationError("event cannot change: websiteIntakes.")


def _require_storefront_requests_unchanged(current: Mapping[str, Any], next_state: Mapping[str, Any]) -> None:
    if _storefront_requests(current) != _storefront_requests(next_state):
        raise TrialValidationError("event cannot change: storefrontRequests.")


def _require_storefront_configuration_unchanged(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    if _storefront_configuration(current) != _storefront_configuration(next_state):
        raise TrialValidationError("event cannot change: storefrontConfiguration.")


def _require_purchase_orders_unchanged(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    if _purchase_orders(current) != _purchase_orders(next_state):
        raise TrialValidationError("event cannot change: purchaseOrders.")


def _require_purchase_budget_envelopes_unchanged(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    if _purchase_budget_envelopes(current) != _purchase_budget_envelopes(next_state):
        raise TrialValidationError("event cannot change: purchaseBudgetEnvelopes.")


def _require_supplier_sourcing_decisions_unchanged(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    if _supplier_sourcing_decisions(current) != _supplier_sourcing_decisions(next_state):
        raise TrialValidationError("event cannot change: supplierSourcingDecisions.")


def _require_purchase_requisitions_unchanged(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    if _purchase_requisitions(current) != _purchase_requisitions(next_state):
        raise TrialValidationError("event cannot change: purchaseRequisitions.")


def _require_catalog_changes_unchanged(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    if _catalog_changes(current) != _catalog_changes(next_state):
        raise TrialValidationError("event cannot change: catalogChanges.")


def _require_catalog_baselines_unchanged(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    if _catalog_baselines(current) != _catalog_baselines(next_state):
        raise TrialValidationError("event cannot change: catalogBaselines.")


def _require_tax_configurations_unchanged(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    if _tax_configurations(current) != _tax_configurations(next_state):
        raise TrialValidationError("event cannot change: taxConfigurations.")


def _require_account_mapping_configurations_unchanged(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    if _account_mapping_configurations(current) != _account_mapping_configurations(next_state):
        raise TrialValidationError(
            "event cannot change: accountMappingConfigurations."
        )


def _require_customer_credit_policies_unchanged(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    if _customer_credit_policies(current) != _customer_credit_policies(next_state):
        raise TrialValidationError(
            "event cannot change: customerCreditPolicies."
        )


def _inventory_foundation(state: Mapping[str, Any]) -> Mapping[str, Any] | None:
    foundation = state.get("inventoryFoundation")
    return foundation if isinstance(foundation, Mapping) else None


def _require_inventory_foundation_unchanged(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    if _inventory_foundation(current) != _inventory_foundation(next_state):
        raise TrialValidationError("event cannot change: inventoryFoundation.")


def _inventory_item_totals(state: Mapping[str, Any]) -> dict[str, int]:
    return {
        str(item["sku"]): int(item["onHand"])
        for item in state["items"]
        if int(item["onHand"]) > 0
    }


def _order_inventory_digest(value: object) -> str:
    encoded = json.dumps(
        value, ensure_ascii=False, separators=(",", ":"), sort_keys=True
    ).encode("utf-8")
    return f"sha256:{sha256(encoded).hexdigest()}"


def _order_inventory_command_id(prefix: str, order_id: str) -> str:
    identity = _order_inventory_digest(
        {
            "contract": "supermega.shop.order-inventory-command.v1",
            "kind": prefix,
            "orderId": order_id,
        }
    )
    return f"{prefix}-{identity[7:39].upper()}"


def _production_inventory_command_id(request_id: str) -> str:
    identity = _order_inventory_digest(
        {
            "contract": "supermega.shop.production-issue-inventory-command.v1",
            "requestId": request_id,
        }
    )
    return f"PIS-{identity[7:39].upper()}"


def _production_return_command_id(
    production_issue_id: str, action_id: str
) -> str:
    identity = _order_inventory_digest(
        {
            "contract": "supermega.shop.production-return-inventory-command.v1",
            "productionIssueId": production_issue_id,
            "actionId": action_id,
        }
    )
    return f"PRT-{identity[7:39].upper()}"


def _production_receipt_command_id(release_id: str) -> str:
    identity = _order_inventory_digest(
        {
            "contract": "supermega.shop.production-receipt-inventory-command.v1",
            "releaseId": release_id,
        }
    )
    return f"PRC-{identity[7:39].upper()}"


def _order_return_inventory_command_id(
    order_id: str, sku: str, action_id: str
) -> str:
    identity = _order_inventory_digest(
        {
            "contract": "supermega.shop.order-return-inventory-command.v1",
            "orderId": order_id,
            "sku": sku,
            "actionId": action_id,
        }
    )
    return f"ORT-{identity[7:39].upper()}"


def _order_inventory_transition(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
    order: Mapping[str, Any],
    lines: list[dict[str, Any]],
    *,
    kind: str,
) -> None:
    current_foundation = _inventory_foundation(current)
    next_foundation = _inventory_foundation(next_state)
    if current_foundation is None:
        if next_foundation is not None:
            raise TrialValidationError(
                "an order cannot create location inventory implicitly."
            )
        return
    if next_foundation is None:
        raise TrialValidationError(
            "an order cannot remove the location inventory record."
        )
    catalog_skus = [str(item["sku"]) for item in current["items"]]
    try:
        before = validate_shop_inventory_state(current_foundation, catalog_skus)
        after = validate_shop_inventory_state(next_foundation, catalog_skus)
        before_physical = shop_inventory_sku_totals(before, catalog_skus)
        after_physical = shop_inventory_sku_totals(after, catalog_skus)
        before_available = shop_inventory_sku_available_to_promise(
            before, catalog_skus
        )
        after_available = shop_inventory_sku_available_to_promise(
            after, catalog_skus
        )
    except ShopInventoryValidationError as exc:
        raise TrialValidationError(str(exc)) from exc
    if (
        len(after["commands"]) != len(before["commands"]) + 1
        or after["commands"][:-1] != before["commands"]
        or after["commands"][-1]["payload"].get("kind") != kind
    ):
        raise TrialValidationError(
            f"the order must append exactly one {kind} location command."
        )
    command = after["commands"][-1]["payload"]
    prefix = {
        "order_reserve": "ORS",
        "order_release": "ORL",
        "order_fulfil": "ORF",
    }[kind]
    if (
        command.get("orderId") != order["id"]
        or command.get("id") != _order_inventory_command_id(prefix, str(order["id"]))
    ):
        raise TrialValidationError(
            "the location command must use the deterministic changed-order identity."
        )
    expected_lines = {str(line["sku"]): int(line["quantity"]) for line in lines}
    reserve_commands = [
        entry["payload"]
        for entry in (after["commands"] if kind == "order_reserve" else before["commands"])
        if entry["payload"].get("kind") == "order_reserve"
        and entry["payload"].get("orderId") == order["id"]
    ]
    if len(reserve_commands) != 1:
        raise TrialValidationError(
            "the order requires one attributable location reservation command."
        )
    reserve = reserve_commands[0]
    allocations = reserve.get("allocations")
    if not isinstance(allocations, list):
        raise TrialValidationError("the order location allocations are missing.")
    allocated: dict[str, int] = {}
    for allocation in allocations:
        allocation_identity = _order_inventory_digest(
            {
                "contract": "supermega.shop.order-allocation.v1",
                "orderId": order["id"],
                "sku": allocation["sku"],
                "stockUnitId": allocation["stockUnitId"],
                "locationId": allocation["locationId"],
                "quantity": allocation["quantity"],
            }
        )
        if allocation["reservationId"] != f"RES-ORD-{allocation_identity[7:39].upper()}":
            raise TrialValidationError(
                "the order location reservation identity is not deterministic."
            )
        allocated[str(allocation["sku"])] = allocated.get(
            str(allocation["sku"]), 0
        ) + int(allocation["quantity"])
    if kind == "order_reserve":
        expected_allocations: list[dict[str, Any]] = []
        try:
            available_balances = shop_inventory_available_balances(
                before, catalog_skus
            )
        except ShopInventoryValidationError as exc:
            raise TrialValidationError(str(exc)) from exc
        for sku, line_quantity in sorted(expected_lines.items()):
            remaining = line_quantity
            candidates = sorted(
                (
                    balance
                    for balance in available_balances
                    if balance["sku"] == sku
                    and balance["availableToPromise"] > 0
                ),
                key=lambda balance: (
                    -int(balance["availableToPromise"]),
                    f"{balance['locationId']}|{balance['stockUnitId']}",
                ),
            )
            for balance in candidates:
                if remaining == 0:
                    break
                allocated_quantity = min(
                    remaining, int(balance["availableToPromise"])
                )
                expected_allocations.append(
                    {
                        "sku": sku,
                        "stockUnitId": balance["stockUnitId"],
                        "locationId": balance["locationId"],
                        "quantity": allocated_quantity,
                    }
                )
                remaining -= allocated_quantity
            if remaining:
                raise TrialValidationError(
                    f"location stock cannot allocate the complete {sku} order line."
                )
        expected_allocations.sort(
            key=lambda allocation: (
                f"{allocation['sku']}|{allocation['locationId']}|{allocation['stockUnitId']}"
            )
        )
        for allocation in expected_allocations:
            identity = _order_inventory_digest(
                {
                    "contract": "supermega.shop.order-allocation.v1",
                    "orderId": order["id"],
                    **allocation,
                }
            )
            allocation["reservationId"] = f"RES-ORD-{identity[7:39].upper()}"
        if allocations != expected_allocations:
            raise TrialValidationError(
                "the order must use the deterministic fewest-lot location allocation."
            )
    if (
        reserve.get("customerReference") != order["customer"]
        or allocated != expected_lines
    ):
        raise TrialValidationError(
            "the location allocation must match every order line and customer."
        )
    reservation_ids = sorted(
        str(allocation["reservationId"]) for allocation in allocations
    )
    if kind != "order_reserve" and command.get("reservationIds") != reservation_ids:
        raise TrialValidationError(
            "the order closure must identify every original location reservation."
        )
    if before_available != _inventory_item_totals(current):
        raise TrialValidationError(
            "location ATP drifted from aggregate Shop stock before the order action."
        )
    if after_available != _inventory_item_totals(next_state):
        raise TrialValidationError(
            "the order action must conserve aggregate Shop stock against location ATP."
        )
    if kind in {"order_reserve", "order_release"}:
        if before_physical != after_physical:
            raise TrialValidationError(
                "order reserve or release cannot change physical location stock."
            )
    else:
        expected_physical = dict(before_physical)
        for sku, quantity in expected_lines.items():
            retained = expected_physical.get(sku, 0) - quantity
            if retained < 0:
                raise TrialValidationError(
                    "order fulfilment exceeds physical location stock."
                )
            if retained:
                expected_physical[sku] = retained
            else:
                expected_physical.pop(sku, None)
        if after_physical != expected_physical:
            raise TrialValidationError(
                "order fulfilment must consume every allocated line exactly once."
            )


def _order_return_inventory_transition(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
    order: Mapping[str, Any],
    record: Mapping[str, Any],
) -> None:
    current_foundation = _inventory_foundation(current)
    next_foundation = _inventory_foundation(next_state)
    if current_foundation is None:
        if next_foundation is not None:
            raise TrialValidationError(
                "an order return cannot create location inventory implicitly."
            )
        return
    if next_foundation is None:
        raise TrialValidationError(
            "a sellable return cannot remove the location inventory record."
        )
    catalog_skus = [str(item["sku"]) for item in current["items"]]
    try:
        before = validate_shop_inventory_state(current_foundation, catalog_skus)
        after = validate_shop_inventory_state(next_foundation, catalog_skus)
        before_physical = shop_inventory_sku_totals(before, catalog_skus)
        after_physical = shop_inventory_sku_totals(after, catalog_skus)
        before_available = shop_inventory_sku_available_to_promise(
            before, catalog_skus
        )
        after_available = shop_inventory_sku_available_to_promise(
            after, catalog_skus
        )
    except ShopInventoryValidationError as exc:
        raise TrialValidationError(str(exc)) from exc
    if (
        len(after["commands"]) != len(before["commands"]) + 1
        or after["commands"][:-1] != before["commands"]
        or after["commands"][-1]["payload"].get("kind") != "order_return"
    ):
        raise TrialValidationError(
            "a sellable return must append exactly one order return location command."
        )
    command = after["commands"][-1]["payload"]
    if (
        command.get("id")
        != _order_return_inventory_command_id(
            str(order["id"]), str(record["sku"]), str(record["actionId"])
        )
        or command.get("orderId") != order["id"]
        or command.get("sku") != record["sku"]
        or command.get("quantity") != record["quantity"]
        or any(
            command["proof"].get(proof_field) != record[record_field]
            for proof_field, record_field in (
                ("actionId", "actionId"),
                ("capturedAt", "createdAt"),
                ("actor", "actor"),
                ("reason", "reason"),
                ("evidenceReference", "evidenceReference"),
            )
        )
    ):
        raise TrialValidationError(
            "the order return location command must match the exact inspected return evidence."
        )
    expected_physical = dict(before_physical)
    expected_physical[str(record["sku"])] = (
        expected_physical.get(str(record["sku"]), 0) + int(record["quantity"])
    )
    if (
        before_available != _inventory_item_totals(current)
        or after_available != _inventory_item_totals(next_state)
        or after_physical != expected_physical
    ):
        raise TrialValidationError(
            "the sellable return must conserve aggregate Shop ATP and exact location stock."
        )


def _validate_inventory_initialized(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    if any(
        order["status"] not in {"completed", "cancelled"}
        for order in current["orders"]
    ):
        raise TrialValidationError(
            "active aggregate-stock orders must finish before location inventory setup."
        )
    if _inventory_foundation(current) is not None:
        raise TrialValidationError("Shop location inventory is already initialized.")
    if _without(current, frozenset({"inventoryFoundation"})) != _without(
        next_state, frozenset({"inventoryFoundation"})
    ):
        raise TrialValidationError(
            "commerce.inventory.initialized may change only inventoryFoundation."
        )
    foundation = _inventory_foundation(next_state)
    if foundation is None:
        raise TrialValidationError("Shop location inventory state is required.")
    catalog_skus = [str(item["sku"]) for item in current["items"]]
    try:
        validated = validate_shop_inventory_state(
            foundation,
            catalog_skus,
            require_current_catalog_digest=True,
        )
        totals = shop_inventory_sku_totals(validated, catalog_skus)
    except ShopInventoryValidationError as exc:
        raise TrialValidationError(str(exc)) from exc
    if (
        validated["revision"] != 1
        or validated["commands"][0]["payload"]["kind"] != "import"
    ):
        raise TrialValidationError(
            "commerce.inventory.initialized must record exactly one opening import."
        )
    if totals != _inventory_item_totals(current):
        raise TrialValidationError(
            "location opening totals must equal current positive Shop stock."
        )


def _validate_inventory_transferred(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    if _without(current, frozenset({"inventoryFoundation"})) != _without(
        next_state, frozenset({"inventoryFoundation"})
    ):
        raise TrialValidationError(
            "commerce.inventory.transferred may change only inventoryFoundation."
        )
    current_foundation = _inventory_foundation(current)
    next_foundation = _inventory_foundation(next_state)
    if current_foundation is None or next_foundation is None:
        raise TrialValidationError("Shop location inventory must be initialized first.")
    catalog_skus = [str(item["sku"]) for item in current["items"]]
    try:
        before = validate_shop_inventory_state(current_foundation, catalog_skus)
        after = validate_shop_inventory_state(next_foundation, catalog_skus)
        before_totals = shop_inventory_sku_totals(before, catalog_skus)
        after_totals = shop_inventory_sku_totals(after, catalog_skus)
        before_available = shop_inventory_sku_available_to_promise(
            before, catalog_skus
        )
        after_available = shop_inventory_sku_available_to_promise(
            after, catalog_skus
        )
    except ShopInventoryValidationError as exc:
        raise TrialValidationError(str(exc)) from exc
    if (
        after["revision"] != before["revision"] + 1
        or after["commands"][:-1] != before["commands"]
        or after["commands"][-1]["payload"]["kind"] != "transfer"
    ):
        raise TrialValidationError(
            "commerce.inventory.transferred must append exactly one transfer command."
        )
    expected = _inventory_item_totals(current)
    if (
        before_totals != after_totals
        or before_available != expected
        or after_available != expected
    ):
        raise TrialValidationError(
            "location ATP drifted from aggregate Shop stock; reconcile before transfer."
        )


def _require_promotion_policies_unchanged(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    if _promotion_policies(current) != _promotion_policies(next_state):
        raise TrialValidationError(
            "event cannot change: promotionPolicies."
        )


def _require_shipping_policies_unchanged(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    if _shipping_policies(current) != _shipping_policies(next_state):
        raise TrialValidationError("event cannot change: shippingPolicies.")


def _require_payment_policies_unchanged(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    if _payment_policies(current) != _payment_policies(next_state):
        raise TrialValidationError("event cannot change: paymentPolicies.")


def _validate_inventory_master_created(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    if _without(current, frozenset({"inventoryFoundation"})) != _without(
        next_state, frozenset({"inventoryFoundation"})
    ):
        raise TrialValidationError(
            "commerce.inventory.master_created may change only inventoryFoundation."
        )
    current_foundation = _inventory_foundation(current)
    next_foundation = _inventory_foundation(next_state)
    if current_foundation is None or next_foundation is None:
        raise TrialValidationError("Shop location inventory must be initialized first.")
    catalog_skus = [str(item["sku"]) for item in current["items"]]
    try:
        before = validate_shop_inventory_state(current_foundation, catalog_skus)
        after = validate_shop_inventory_state(next_foundation, catalog_skus)
        before_totals = shop_inventory_sku_totals(before, catalog_skus)
        after_totals = shop_inventory_sku_totals(after, catalog_skus)
        before_available = shop_inventory_sku_available_to_promise(
            before, catalog_skus
        )
        after_available = shop_inventory_sku_available_to_promise(
            after, catalog_skus
        )
    except ShopInventoryValidationError as exc:
        raise TrialValidationError(str(exc)) from exc
    if (
        after["revision"] != before["revision"] + 1
        or after["commands"][:-1] != before["commands"]
        or after["commands"][-1]["payload"]["kind"] != "master_create"
    ):
        raise TrialValidationError(
            "commerce.inventory.master_created must append exactly one master-create command."
        )
    expected = _inventory_item_totals(current)
    if (
        before_totals != after_totals
        or before_available != after_available
        or after_available != expected
    ):
        raise TrialValidationError(
            "business-partner creation cannot change Shop stock or ATP."
        )


def _validate_inventory_supplier_policy_saved(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    if _without(current, frozenset({"inventoryFoundation"})) != _without(
        next_state, frozenset({"inventoryFoundation"})
    ):
        raise TrialValidationError(
            "commerce.inventory.supplier_policy_saved may change only inventoryFoundation."
        )
    current_foundation = _inventory_foundation(current)
    next_foundation = _inventory_foundation(next_state)
    if current_foundation is None or next_foundation is None:
        raise TrialValidationError("Shop location inventory must be initialized first.")
    catalog_skus = [str(item["sku"]) for item in current["items"]]
    try:
        before = validate_shop_inventory_state(current_foundation, catalog_skus)
        after = validate_shop_inventory_state(next_foundation, catalog_skus)
        before_totals = shop_inventory_sku_totals(before, catalog_skus)
        after_totals = shop_inventory_sku_totals(after, catalog_skus)
        before_available = shop_inventory_sku_available_to_promise(
            before, catalog_skus
        )
        after_available = shop_inventory_sku_available_to_promise(
            after, catalog_skus
        )
    except ShopInventoryValidationError as exc:
        raise TrialValidationError(str(exc)) from exc
    if (
        after["revision"] != before["revision"] + 1
        or after["commands"][:-1] != before["commands"]
        or after["commands"][-1]["payload"]["kind"] != "supplier_policy_set"
    ):
        raise TrialValidationError(
            "commerce.inventory.supplier_policy_saved must append exactly one supplier-policy command."
        )
    expected = _inventory_item_totals(current)
    if (
        before_totals != after_totals
        or before_available != after_available
        or after_available != expected
    ):
        raise TrialValidationError(
            "supplier-policy changes cannot change Shop stock or ATP."
        )


def _validate_new_order_and_reservation(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
    *,
    event_type: str,
) -> None:
    if len(next_state["orders"]) != len(current["orders"]) + 1 or next_state["orders"][1:] != current["orders"]:
        raise TrialValidationError(f"{event_type} must prepend exactly one order.")
    _require_unchanged(current, next_state, "closes")
    order = next_state["orders"][0]
    calculation = order.get("calculation")
    effective_tax_configuration = _effective_tax_configuration(
        current,
        str(order["createdAt"]),
    )
    expected_calculation_schema = (
        _ORDER_CALCULATION_V2_SCHEMA
        if effective_tax_configuration is not None
        else _ORDER_CALCULATION_SCHEMA
    )
    if (
        not isinstance(calculation, Mapping)
        or calculation.get("catalogRevision") != len(_catalog_changes(current))
        or calculation.get("schema") != expected_calculation_schema
        or (
            effective_tax_configuration is not None
            and calculation.get("taxConfigurationRevision")
            != effective_tax_configuration.get("revision")
        )
    ):
        raise TrialValidationError(
            "a new order requires the current deterministic pricing calculation."
        )
    if order.get("status") != "confirmed" or order.get("paymentStatus") != "pending" or order.get("refundStatus") != "none":
        raise TrialValidationError("a new order must start confirmed with pending payment and no refund exception.")
    payment_terms_days = _order_payment_terms_days(order)
    if payment_terms_days is None:
        raise TrialValidationError("a new order requires a supported customer credit term.")
    credit_decision = order.get("creditDecision")
    if payment_terms_days == 0:
        if credit_decision is not None:
            raise TrialValidationError("cash-term orders cannot carry a customer credit decision.")
    else:
        policy = _effective_customer_credit_policy(
            current,
            str(order["customer"]),
            str(order["createdAt"]),
        )
        exposure_before = _customer_credit_exposure(current, str(order["customer"]))
        exposure_after = exposure_before + int(order["total"])
        expected_decision = (
            {
                "policyRevision": policy["revision"],
                "policyActionId": policy["proof"]["actionId"],
                "creditLimitMmk": policy["creditLimitMmk"],
                "exposureBeforeMmk": exposure_before,
                "orderAmountMmk": order["total"],
                "exposureAfterMmk": exposure_after,
                "maxPaymentTermsDays": policy["maxPaymentTermsDays"],
                "paymentTermsDays": payment_terms_days,
                "status": "approved",
            }
            if policy is not None
            and policy["status"] == "active"
            and payment_terms_days <= policy["maxPaymentTermsDays"]
            and exposure_after <= _MAX_SAFE_INTEGER
            and exposure_after <= policy["creditLimitMmk"]
            else None
        )
        if expected_decision is None or credit_decision != expected_decision:
            raise TrialValidationError(
                "a new credit order requires the exact active customer policy, terms, and exposure decision."
            )
    if order.get("fulfilment") not in {"pickup", "delivery"}:
        raise TrialValidationError("a new order requires pickup or delivery fulfilment.")
    _text(order.get("owner"), "new order.owner", maximum=120)
    _text(order.get("fulfilmentReference"), "new order.fulfilmentReference", maximum=160)
    promised_at = datetime.fromisoformat(
        _timestamp(order.get("promisedAt"), "new order.promisedAt").replace(
            "Z", "+00:00"
        )
    )
    lines = _reservation_lines(order)
    if not lines:
        raise TrialValidationError("a new order must reference at least one inventory item.")
    if (
        len(next_state["movements"]) != len(current["movements"]) + len(lines)
        or next_state["movements"][len(lines):] != current["movements"]
    ):
        raise TrialValidationError(
            f"{event_type} must prepend one stock reservation per order line."
        )

    item_changes = _changed_records(current["items"], next_state["items"], "items")
    changed_by_sku = {before["sku"]: (before, after) for before, after in item_changes}
    if set(changed_by_sku) != {line["sku"] for line in lines}:
        raise TrialValidationError(
            "a new order may change only the inventory items in its lines."
        )

    captured_lines = {
        line["sku"]: line
        for line in order.get("lines", [])
    }
    for line in lines:
        before_item, after_item = changed_by_sku[line["sku"]]
        captured_line = captured_lines.get(line["sku"])
        if captured_line is not None and (
            captured_line["name"] != before_item["name"]
            or captured_line.get("variant") != before_item.get("variant")
            or captured_line["unitPriceMmk"] != before_item["price"]
        ):
            raise TrialValidationError(
                "a new order line must freeze the current item name, variant, and MMK price."
            )
        if captured_line is None and (
            len(lines) != 1
            or order.get("itemSku") != before_item["sku"]
            or order["item"] != before_item["name"]
            or order["total"] != before_item["price"] * order["quantity"]
        ):
            raise TrialValidationError(
                "a legacy single-item order must match the current catalog item."
            )
        if after_item != {
            **before_item,
            "onHand": before_item["onHand"] - line["quantity"],
        }:
            raise TrialValidationError(
                "a new order must reserve every line's exact quantity from stock."
            )

    added_movements = next_state["movements"][:len(lines)]
    if any(
        promised_at
        <= datetime.fromisoformat(
            str(movement["createdAt"]).replace("Z", "+00:00")
        )
        for movement in added_movements
    ):
        raise TrialValidationError(
            "a new order promise must remain in the future when stock is reserved."
        )
    for index, (line, movement) in enumerate(
        zip(lines, added_movements, strict=True)
    ):
        expected_id = _movement_id(
            movement["actionId"],
            f"L{index + 1}" if len(lines) > 1 else None,
        )
        if (
            movement.get("kind") != "reserve"
            or movement.get("sku") != line["sku"]
            or movement.get("quantityDelta") != -line["quantity"]
            or movement.get("orderId") != order["id"]
            or movement.get("id") != expected_id
        ):
            raise TrialValidationError(
                "a new order requires one exact attributable reservation per line."
            )
    _order_inventory_transition(
        current,
        next_state,
        order,
        lines,
        kind="order_reserve",
    )


def _validate_created(current: Mapping[str, Any], next_state: Mapping[str, Any]) -> None:
    _validate_new_order_and_reservation(current, next_state, event_type="commerce.order.created")
    _require_website_intakes_unchanged(current, next_state)


def _validate_item_created(current: Mapping[str, Any], next_state: Mapping[str, Any]) -> None:
    _require_unchanged(current, next_state, "orders", "closes")
    _require_website_intakes_unchanged(current, next_state)
    if len(next_state["items"]) != len(current["items"]) + 1 or next_state["items"][1:] != current["items"]:
        raise TrialValidationError("commerce.item.created must prepend exactly one catalog item.")
    if len(next_state["movements"]) != len(current["movements"]) + 1 or next_state["movements"][1:] != current["movements"]:
        raise TrialValidationError("commerce.item.created must prepend exactly one opening balance.")
    item = next_state["items"][0]
    if _inventory_foundation(current) is not None and item["onHand"] > 0:
        raise TrialValidationError(
            "location-managed Shop items must start at zero and receive stock through a location."
        )
    movement = next_state["movements"][0]
    current_baselines = _catalog_baselines(current)
    next_baselines = _catalog_baselines(next_state)
    if (
        len(next_baselines) != len(current_baselines) + 1
        or next_baselines[1:] != current_baselines
    ):
        raise TrialValidationError(
            "commerce.item.created must prepend exactly one catalog baseline."
        )
    baseline = next_baselines[0]
    if (
        movement.get("kind") != "opening"
        or movement.get("sku") != item["sku"]
        or movement.get("quantityDelta") != item["onHand"]
        or "orderId" in movement
        or movement.get("id") != _movement_id(str(movement.get("actionId")))
    ):
        raise TrialValidationError("a new catalog item requires one exact attributable opening balance.")
    if (
        baseline["sku"] != item["sku"]
        or baseline["price"] != item["price"]
        or baseline["reorderAt"] != item["reorderAt"]
        or baseline["proof"]["actionId"] != movement["actionId"]
        or baseline["proof"]["capturedAt"] != movement["createdAt"]
        or baseline["proof"]["actor"] != movement["actor"]
        or baseline["proof"]["reason"] != movement["reason"]
        or baseline["proof"]["evidenceReference"] != movement["evidenceReference"]
    ):
        raise TrialValidationError(
            "a new catalog item baseline must match its exact opening proof."
        )


def _validate_item_updated(current: Mapping[str, Any], next_state: Mapping[str, Any]) -> None:
    _require_unchanged(current, next_state, "orders", "movements", "closes")
    _require_website_intakes_unchanged(current, next_state)
    before, after = _one_changed(current["items"], next_state["items"], "items")
    mutable_fields = frozenset({"price", "reorderAt"})
    if _without(before, mutable_fields) != _without(after, mutable_fields):
        raise TrialValidationError(
            "commerce.item.updated may change only price and reorderAt."
        )

    current_changes = _catalog_changes(current)
    next_changes = _catalog_changes(next_state)
    if (
        len(next_changes) != len(current_changes) + 1
        or next_changes[1:] != current_changes
    ):
        raise TrialValidationError(
            "commerce.item.updated must prepend exactly one catalog change."
        )
    change = next_changes[0]
    if (
        change["sku"] != before["sku"]
        or change["previousPrice"] != before["price"]
        or change["nextPrice"] != after["price"]
        or change["previousReorderAt"] != before["reorderAt"]
        or change["nextReorderAt"] != after["reorderAt"]
    ):
        raise TrialValidationError(
            "catalog change values must match the exact item transition."
        )
    current_baselines = _catalog_baselines(current)
    next_baselines = _catalog_baselines(next_state)
    current_baseline = next(
        (
            baseline
            for baseline in current_baselines
            if baseline["sku"] == before["sku"]
        ),
        None,
    )
    if current_baseline is not None:
        if next_baselines != current_baselines:
            raise TrialValidationError(
                "commerce.item.updated cannot rewrite an existing catalog baseline."
            )
    else:
        if (
            len(next_baselines) != len(current_baselines) + 1
            or next_baselines[1:] != current_baselines
        ):
            raise TrialValidationError(
                "the first catalog update must prepend one anchored baseline."
            )
        baseline = next_baselines[0]
        if (
            baseline["sku"] != before["sku"]
            or baseline["price"] != before["price"]
            or baseline["reorderAt"] != before["reorderAt"]
            or baseline["proof"] != change["proof"]
        ):
            raise TrialValidationError(
                "the first catalog update baseline must match the reviewed prior values and proof."
            )


def _validate_advanced(current: Mapping[str, Any], next_state: Mapping[str, Any]) -> None:
    _require_unchanged(current, next_state, "items", "movements", "closes")
    _require_website_intakes_unchanged(current, next_state)
    before, after = _one_changed(current["orders"], next_state["orders"], "orders")
    if _NEXT_ORDER_STATUS.get(before["status"]) != after["status"]:
        raise TrialValidationError("order status must advance exactly one lifecycle step.")
    if before["status"] == "ready" and before["paymentStatus"] != "reconciled":
        raise TrialValidationError("payment must be reconciled before order completion.")
    if before["status"] == "ready":
        if (
            "completion" not in after
            or _without(before, frozenset({"status"}))
            != _without(after, frozenset({"status", "completion"}))
        ):
            raise TrialValidationError(
                "order completion may add only status and attributable completion proof."
            )
        completion = _action_proof(after["completion"], "completed order.completion")
        latest_basis = max(
            [
                datetime.fromisoformat(
                    str(before["createdAt"]).replace("Z", "+00:00")
                ),
                datetime.fromisoformat(
                    str(before["paymentReconciledAt"]).replace("Z", "+00:00")
                ),
                *[
                    datetime.fromisoformat(
                        str(movement["createdAt"]).replace("Z", "+00:00")
                    )
                    for movement in current["movements"]
                    if movement.get("orderId") == before["id"]
                ],
            ]
        )
        if datetime.fromisoformat(
            completion["capturedAt"].replace("Z", "+00:00")
        ) < latest_basis:
            raise TrialValidationError(
                "order completion proof cannot predate its order activity."
            )
        _order_inventory_transition(
            current,
            next_state,
            before,
            _reservation_lines(before),
            kind="order_fulfil",
        )
    else:
        _require_inventory_foundation_unchanged(current, next_state)
        before_action_ids = list(before.get("advancementActionIds", []))
        after_action_ids = list(after.get("advancementActionIds", []))
        if (
            len(after_action_ids) != len(before_action_ids) + 1
            or after_action_ids[:-1] != before_action_ids
            or _without(
                before,
                frozenset({"status", "advancementActionIds"}),
            )
            != _without(
                after,
                frozenset({"status", "advancementActionIds"}),
            )
        ):
            raise TrialValidationError(
                "order advancement must append one unique action ID."
            )


def _validate_cancelled(current: Mapping[str, Any], next_state: Mapping[str, Any]) -> None:
    _require_unchanged(current, next_state, "closes")
    _require_website_intakes_unchanged(current, next_state)
    before_order, after_order = _one_changed(current["orders"], next_state["orders"], "orders")
    if before_order["status"] in {"completed", "cancelled"}:
        raise TrialValidationError("completed or cancelled orders cannot be cancelled.")
    expected_refund = "due" if before_order["paymentStatus"] == "reconciled" else "none"
    if after_order != {**before_order, "status": "cancelled", "refundStatus": expected_refund}:
        raise TrialValidationError("cancellation may change only order status and the required refund exception.")
    lines = _reservation_lines(before_order)
    if not lines:
        raise TrialValidationError(
            "cancellation requires an attributable order reservation."
        )
    if (
        len(next_state["movements"]) != len(current["movements"]) + len(lines)
        or next_state["movements"][len(lines):] != current["movements"]
    ):
        raise TrialValidationError(
            "commerce.order.cancelled must prepend one stock release per order line."
        )
    item_changes = _changed_records(current["items"], next_state["items"], "items")
    changed_by_sku = {before["sku"]: (before, after) for before, after in item_changes}
    if set(changed_by_sku) != {line["sku"] for line in lines}:
        raise TrialValidationError(
            "cancellation may change only the inventory items in its order lines."
        )
    for line in lines:
        before_item, after_item = changed_by_sku[line["sku"]]
        if after_item != {
            **before_item,
            "onHand": before_item["onHand"] + line["quantity"],
        }:
            raise TrialValidationError(
                "cancellation must release every line's exact reserved quantity."
            )
    added_movements = next_state["movements"][:len(lines)]
    for index, (line, movement) in enumerate(
        zip(lines, added_movements, strict=True)
    ):
        expected_id = _movement_id(
            str(movement.get("actionId")),
            f"L{index + 1}" if len(lines) > 1 else None,
        )
        if (
            movement.get("kind") != "release"
            or movement.get("sku") != line["sku"]
            or movement.get("orderId") != before_order["id"]
            or movement.get("quantityDelta") != line["quantity"]
            or movement.get("id") != expected_id
        ):
            raise TrialValidationError(
                "cancellation requires one exact attributable stock release per line."
            )
    reserves = [entry for entry in current["movements"] if entry.get("kind") == "reserve" and entry.get("orderId") == before_order["id"]]
    releases = [entry for entry in current["movements"] if entry.get("kind") == "release" and entry.get("orderId") == before_order["id"]]
    if (
        len(reserves) != len(lines)
        or releases
        or any(
            len(
                [
                    reserve
                    for reserve in reserves
                    if reserve.get("sku") == line["sku"]
                    and reserve.get("quantityDelta") == -line["quantity"]
                ]
            )
            != 1
            for line in lines
        )
    ):
        raise TrialValidationError(
            "cancellation requires one unmatched reservation per order line."
        )
    _order_inventory_transition(
        current,
        next_state,
        before_order,
        lines,
        kind="order_release",
    )


def _validate_return_recorded(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    _require_unchanged(current, next_state, "closes")
    _require_website_intakes_unchanged(current, next_state)
    _require_storefront_requests_unchanged(current, next_state)
    _require_storefront_configuration_unchanged(current, next_state)
    _require_purchase_orders_unchanged(current, next_state)
    before_order, after_order = _one_changed(
        current["orders"],
        next_state["orders"],
        "orders",
    )
    if before_order["status"] != "completed" or "completion" not in before_order:
        raise TrialValidationError(
            "returns require an order with attributable completion proof."
        )
    before_returns = before_order.get("returns", [])
    after_returns = after_order.get("returns")
    if (
        not isinstance(after_returns, list)
        or len(after_returns) != len(before_returns) + 1
        or after_returns[1:] != before_returns
        or _without(before_order, frozenset({"returns"}))
        != _without(after_order, frozenset({"returns"}))
    ):
        raise TrialValidationError(
            "commerce.order.return_recorded must prepend exactly one immutable return."
        )
    record = after_returns[0]
    if record["disposition"] == "restock":
        before_item, after_item = _one_changed(
            current["items"],
            next_state["items"],
            "items",
        )
        if (
            before_item["sku"] != record["sku"]
            or after_item
            != {
                **before_item,
                "onHand": before_item["onHand"] + record["quantity"],
            }
        ):
            raise TrialValidationError(
                "a sellable return must increase only its matching stock item."
            )
        if (
            len(next_state["movements"]) != len(current["movements"]) + 1
            or next_state["movements"][1:] != current["movements"]
        ):
            raise TrialValidationError(
                "a sellable return must prepend exactly one return movement."
            )
        movement = next_state["movements"][0]
        if (
            movement.get("kind") != "return"
            or movement.get("orderId") != before_order["id"]
            or movement.get("sku") != record["sku"]
            or movement.get("quantityDelta") != record["quantity"]
            or movement.get("actionId") != record["actionId"]
            or movement.get("createdAt") != record["createdAt"]
            or movement.get("actor") != record["actor"]
            or movement.get("reason") != record["reason"]
            or movement.get("evidenceReference")
            != record["evidenceReference"]
            or movement.get("id")
            != _movement_id(str(record["actionId"]))
        ):
            raise TrialValidationError(
                "a sellable return requires one exact attributable stock movement."
            )
        _order_return_inventory_transition(
            current,
            next_state,
            before_order,
            record,
        )
    elif record["disposition"] == "not_restocked":
        _require_unchanged(current, next_state, "items", "movements")
        _require_inventory_foundation_unchanged(current, next_state)
    else:
        raise TrialValidationError("return disposition is invalid.")


def _validate_support_case_opened(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    _require_unchanged(current, next_state, "items", "movements", "closes")
    _require_website_intakes_unchanged(current, next_state)
    _require_storefront_requests_unchanged(current, next_state)
    _require_storefront_configuration_unchanged(current, next_state)
    _require_purchase_orders_unchanged(current, next_state)
    before_order, after_order = _one_changed(current["orders"], next_state["orders"], "orders")
    before_cases = before_order.get("supportCases", [])
    after_cases = after_order.get("supportCases")
    if (
        before_order.get("status") != "completed"
        or "completion" not in before_order
        or not isinstance(after_cases, list)
        or len(after_cases) != len(before_cases) + 1
        or after_cases[1:] != before_cases
        or _without(before_order, frozenset({"supportCases"}))
        != _without(after_order, frozenset({"supportCases"}))
        or after_cases[0].get("status") != "open"
        or not all(field in after_cases[0] for field in ("priority", "owner", "dueAt"))
        or "resolution" in after_cases[0]
    ):
        raise TrialValidationError(
            "commerce.order.support_case_opened must prepend one immutable open case."
        )


def _validate_support_case_resolved(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    _require_unchanged(current, next_state, "items", "movements", "closes")
    _require_website_intakes_unchanged(current, next_state)
    _require_storefront_requests_unchanged(current, next_state)
    _require_storefront_configuration_unchanged(current, next_state)
    _require_purchase_orders_unchanged(current, next_state)
    before_order, after_order = _one_changed(current["orders"], next_state["orders"], "orders")
    before_cases = before_order.get("supportCases")
    after_cases = after_order.get("supportCases")
    if (
        not isinstance(before_cases, list)
        or not isinstance(after_cases, list)
        or len(after_cases) != len(before_cases)
        or _without(before_order, frozenset({"supportCases"}))
        != _without(after_order, frozenset({"supportCases"}))
    ):
        raise TrialValidationError(
            "commerce.order.support_case_resolved may change only one existing support case."
        )
    changed = [
        (before, after)
        for before, after in zip(before_cases, after_cases, strict=True)
        if before != after
    ]
    if len(changed) != 1:
        raise TrialValidationError(
            "commerce.order.support_case_resolved must resolve exactly one case."
        )
    before_case, after_case = changed[0]
    reopened = isinstance(before_case.get("reopen"), Mapping)
    triaged = all(field in before_case for field in ("priority", "owner", "dueAt"))
    response_ready = any(
        isinstance(event, Mapping) and event.get("kind") == "first_response_ready"
        for event in before_case.get(
            "followUpServiceEvents" if reopened else "serviceEvents", []
        )
    )
    invalid_resolution = (
        not isinstance(after_case.get("followUpResolution"), Mapping)
        or _without(before_case, frozenset({"status"}))
        != _without(after_case, frozenset({"status", "followUpResolution"}))
    ) if reopened else (
        "resolution" in before_case
        or not isinstance(after_case.get("resolution"), Mapping)
        or _without(before_case, frozenset({"status", "resolution"}))
        != _without(after_case, frozenset({"status", "resolution"}))
    )
    if (
        before_case.get("status") != "open"
        or (triaged and not response_ready)
        or after_case.get("status") != "resolved"
        or invalid_resolution
    ):
        raise TrialValidationError(
            "commerce.order.support_case_resolved must preserve the immutable opened case."
        )


def _validate_support_case_reopened(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    _require_unchanged(current, next_state, "items", "movements", "closes")
    _require_website_intakes_unchanged(current, next_state)
    _require_storefront_requests_unchanged(current, next_state)
    _require_storefront_configuration_unchanged(current, next_state)
    _require_purchase_orders_unchanged(current, next_state)
    before_order, after_order = _one_changed(current["orders"], next_state["orders"], "orders")
    before_cases = before_order.get("supportCases")
    after_cases = after_order.get("supportCases")
    if (
        not isinstance(before_cases, list)
        or not isinstance(after_cases, list)
        or len(after_cases) != len(before_cases)
        or _without(before_order, frozenset({"supportCases"}))
        != _without(after_order, frozenset({"supportCases"}))
    ):
        raise TrialValidationError(
            "commerce.order.support_case_reopened may change only one existing support case."
        )
    changed = [
        (before, after)
        for before, after in zip(before_cases, after_cases, strict=True)
        if before != after
    ]
    if len(changed) != 1:
        raise TrialValidationError(
            "commerce.order.support_case_reopened must reopen exactly one case."
        )
    before_case, after_case = changed[0]
    if (
        before_case.get("status") != "resolved"
        or not isinstance(before_case.get("resolution"), Mapping)
        or "reopen" in before_case
        or "followUpServiceEvents" in before_case
        or "followUpResolution" in before_case
        or after_case.get("status") != "open"
        or not isinstance(after_case.get("reopen"), Mapping)
        or _without(before_case, frozenset({"status"}))
        != _without(after_case, frozenset({"status", "reopen"}))
    ):
        raise TrialValidationError(
            "commerce.order.support_case_reopened must retain the original resolution and add one linked reopen."
        )


def _validate_support_case_service_recorded(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    _require_unchanged(current, next_state, "items", "movements", "closes")
    _require_website_intakes_unchanged(current, next_state)
    _require_storefront_requests_unchanged(current, next_state)
    _require_storefront_configuration_unchanged(current, next_state)
    _require_purchase_orders_unchanged(current, next_state)
    before_order, after_order = _one_changed(current["orders"], next_state["orders"], "orders")
    before_cases = before_order.get("supportCases")
    after_cases = after_order.get("supportCases")
    if (
        not isinstance(before_cases, list)
        or not isinstance(after_cases, list)
        or len(after_cases) != len(before_cases)
        or _without(before_order, frozenset({"supportCases"}))
        != _without(after_order, frozenset({"supportCases"}))
    ):
        raise TrialValidationError(
            "commerce.order.support_case_service_recorded may change only one support case."
        )
    changed = [
        (before, after)
        for before, after in zip(before_cases, after_cases, strict=True)
        if before != after
    ]
    if len(changed) != 1:
        raise TrialValidationError(
            "commerce.order.support_case_service_recorded must append exactly one event."
        )
    before_case, after_case = changed[0]
    event_field = "followUpServiceEvents" if isinstance(before_case.get("reopen"), Mapping) else "serviceEvents"
    before_events = before_case.get(event_field, [])
    after_events = after_case.get(event_field)
    if (
        before_case.get("status") != "open"
        or not isinstance(before_events, list)
        or not isinstance(after_events, list)
        or len(after_events) != len(before_events) + 1
        or after_events[1:] != before_events
        or _without(before_case, frozenset({event_field}))
        != _without(after_case, frozenset({event_field}))
    ):
        raise TrialValidationError(
            "commerce.order.support_case_service_recorded must prepend one immutable service event."
        )


def _validate_correction_recorded(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    _require_unchanged(current, next_state, "items", "movements", "closes")
    _require_website_intakes_unchanged(current, next_state)
    _require_storefront_requests_unchanged(current, next_state)
    _require_storefront_configuration_unchanged(current, next_state)
    _require_purchase_orders_unchanged(current, next_state)
    before_order, after_order = _one_changed(
        current["orders"],
        next_state["orders"],
        "orders",
    )
    closed_order_ids = {
        order_id
        for close in current["closes"]
        if isinstance(close, Mapping)
        for order_id in close.get("orderIds", [])
    }
    if (
        before_order["status"] != "completed"
        or before_order["paymentStatus"] != "reconciled"
        or "completion" not in before_order
        or "calculation" not in before_order
        or before_order["id"] in closed_order_ids
    ):
        raise TrialValidationError(
            "corrections require an unclosed, calculated, reconciled, completed order."
        )
    before_corrections = before_order.get("corrections", [])
    after_corrections = after_order.get("corrections")
    if (
        not isinstance(after_corrections, list)
        or len(after_corrections) != len(before_corrections) + 1
        or after_corrections[1:] != before_corrections
        or _without(before_order, frozenset({"corrections"}))
        != _without(after_order, frozenset({"corrections"}))
    ):
        raise TrialValidationError(
            "commerce.order.correction_recorded must prepend exactly one immutable correction."
        )


def _validate_reconciled(current: Mapping[str, Any], next_state: Mapping[str, Any]) -> None:
    _require_unchanged(current, next_state, "items", "movements", "closes")
    _require_website_intakes_unchanged(current, next_state)
    before, after = _one_changed(current["orders"], next_state["orders"], "orders")
    if before["status"] == "cancelled" or before["paymentStatus"] != "pending":
        raise TrialValidationError("only a pending payment on an active order can be reconciled.")
    if _without(before, frozenset({"paymentStatus"})) != _without(after, _RECONCILIATION_FIELDS | {"paymentStatus"}):
        raise TrialValidationError("payment reconciliation may change only payment status and evidence.")
    if after["paymentStatus"] != "reconciled" or not _RECONCILIATION_FIELDS.issubset(after):
        raise TrialValidationError("payment reconciliation requires complete evidence.")


def _validate_collection_action_recorded(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    _require_unchanged(current, next_state, "items", "movements", "closes")
    _require_website_intakes_unchanged(current, next_state)
    _require_storefront_requests_unchanged(current, next_state)
    _require_storefront_configuration_unchanged(current, next_state)
    _require_purchase_orders_unchanged(current, next_state)
    before, after = _one_changed(current["orders"], next_state["orders"], "orders")
    before_actions = before.get("collectionActions", [])
    after_actions = after.get("collectionActions")
    if before["status"] == "cancelled" or before["paymentStatus"] != "pending":
        raise TrialValidationError(
            "collection contact requires a pending payment on an active order."
        )
    if (
        not isinstance(after_actions, list)
        or len(after_actions) != len(before_actions) + 1
        or after_actions[1:] != before_actions
        or _without(before, frozenset({"collectionActions"}))
        != _without(after, frozenset({"collectionActions"}))
    ):
        raise TrialValidationError(
            "commerce.collection_action.recorded must prepend exactly one immutable contact proof."
        )


def _validate_refund_settled(current: Mapping[str, Any], next_state: Mapping[str, Any]) -> None:
    _require_unchanged(current, next_state, "items", "movements", "closes")
    _require_website_intakes_unchanged(current, next_state)
    before, after = _one_changed(current["orders"], next_state["orders"], "orders")
    if before["refundStatus"] != "due" or after["refundStatus"] != "settled":
        raise TrialValidationError("only a due refund can be settled.")
    if _without(before, frozenset({"refundStatus"})) != _without(
        after,
        _REFUND_SETTLEMENT_FIELDS | {"refundStatus"},
    ):
        raise TrialValidationError("refund settlement may change only refund status and settlement evidence.")
    if not _REFUND_SETTLEMENT_FIELDS.issubset(after):
        raise TrialValidationError("refund settlement requires complete evidence.")


def _validate_received(current: Mapping[str, Any], next_state: Mapping[str, Any]) -> None:
    if _inventory_foundation(current) is not None:
        raise TrialValidationError(
            "location-managed stock must be received through a linked purchase order."
        )
    _require_unchanged(current, next_state, "orders", "closes")
    _require_website_intakes_unchanged(current, next_state)
    before_item, after_item = _one_changed(current["items"], next_state["items"], "items")
    if len(next_state["movements"]) != len(current["movements"]) + 1 or next_state["movements"][1:] != current["movements"]:
        raise TrialValidationError("commerce.stock.received must prepend exactly one receipt.")
    movement = next_state["movements"][0]
    if (
        movement.get("kind") != "receipt"
        or movement.get("sku") != before_item["sku"]
        or "orderId" in movement
        or "purchaseOrderId" in movement
        or movement.get("id") != _movement_id(str(movement.get("actionId")))
    ):
        raise TrialValidationError("stock receipt requires one attributable receipt movement.")
    if after_item != {**before_item, "onHand": before_item["onHand"] + movement["quantityDelta"]}:
        raise TrialValidationError("stock receipt must increase the matching item by its exact quantity.")


def _validate_counted(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    _require_unchanged(current, next_state, "orders", "closes")
    _require_website_intakes_unchanged(current, next_state)
    _require_storefront_requests_unchanged(current, next_state)
    _require_storefront_configuration_unchanged(current, next_state)
    _require_purchase_orders_unchanged(current, next_state)
    if (
        len(next_state["movements"]) != len(current["movements"]) + 1
        or next_state["movements"][1:] != current["movements"]
    ):
        raise TrialValidationError(
            "commerce.stock.counted must prepend exactly one count movement."
        )
    movement = next_state["movements"][0]
    if (
        movement.get("kind") != "count"
        or "orderId" in movement
        or "purchaseOrderId" in movement
        or movement.get("id") != _movement_id(str(movement.get("actionId")))
    ):
        raise TrialValidationError(
            "stock count requires one attributable count movement."
        )
    matching_indexes = [
        index
        for index, item in enumerate(current["items"])
        if item["sku"] == movement["sku"]
    ]
    if len(matching_indexes) != 1 or len(next_state["items"]) != len(
        current["items"]
    ):
        raise TrialValidationError("stock count must reference one existing item.")
    item_index = matching_indexes[0]
    before_item = current["items"][item_index]
    before_foundation = _inventory_foundation(current)
    after_foundation = _inventory_foundation(next_state)
    counted_quantity = movement["countedQuantity"]
    if before_foundation is not None:
        if after_foundation is None:
            raise TrialValidationError(
                "location-managed stock count cannot remove its inventory record."
            )
        before_commands = before_foundation["commands"]
        after_commands = after_foundation["commands"]
        if (
            len(after_commands) != len(before_commands) + 1
            or after_commands[:-1] != before_commands
        ):
            raise TrialValidationError(
                "location-managed stock count must append exactly one location count."
            )
        location_count = after_commands[-1]["payload"]
        if location_count.get("kind") != "count":
            raise TrialValidationError(
                "location-managed stock count requires one count command."
            )
        catalog_skus = sorted(item["sku"] for item in current["items"])
        matching_balances = [
            balance
            for balance in shop_inventory_balances(
                before_foundation, catalog_skus
            )
            if balance["stockUnitId"] == location_count["stockUnitId"]
            and balance["locationId"] == location_count["locationId"]
        ]
        if len(matching_balances) != 1:
            raise TrialValidationError(
                "location count must reference one existing stock-unit balance."
            )
        balance = matching_balances[0]
        if (
            balance["sku"] != movement["sku"]
            or location_count["expectedQuantity"] != balance["onHand"]
            or location_count["countedQuantity"] < balance["reserved"]
        ):
            raise TrialValidationError(
                "location count must match its SKU, physical balance, and reservations."
            )
        counted_quantity = (
            before_item["onHand"]
            + location_count["countedQuantity"]
            - balance["onHand"]
        )
    elif after_foundation is not None:
        raise TrialValidationError(
            "commerce.stock.counted cannot initialize location inventory."
        )
    expected_after = {
        **before_item,
        "onHand": counted_quantity,
    }
    if (
        movement["expectedQuantity"] != before_item["onHand"]
        or movement["quantityDelta"]
        != counted_quantity - before_item["onHand"]
        or movement["countedQuantity"] != counted_quantity
        or next_state["items"][item_index] != expected_after
        or any(
            before != after
            for index, (before, after) in enumerate(
                zip(current["items"], next_state["items"], strict=True)
            )
            if index != item_index
        )
    ):
        raise TrialValidationError(
            "stock count may only set one matching item to its exact counted quantity."
        )


def _validate_production_inventory_transition(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
    movement: Mapping[str, Any],
) -> None:
    current_foundation = _inventory_foundation(current)
    next_foundation = _inventory_foundation(next_state)
    if current_foundation is None:
        if next_foundation is not None:
            raise TrialValidationError(
                "a production issue cannot create location inventory implicitly."
            )
        return
    if next_foundation is None:
        raise TrialValidationError(
            "a production issue cannot remove the location inventory record."
        )
    catalog_skus = [str(item["sku"]) for item in current["items"]]
    try:
        before = validate_shop_inventory_state(current_foundation, catalog_skus)
        after = validate_shop_inventory_state(next_foundation, catalog_skus)
        before_physical = shop_inventory_sku_totals(before, catalog_skus)
        after_physical = shop_inventory_sku_totals(after, catalog_skus)
        before_available = shop_inventory_sku_available_to_promise(
            before, catalog_skus
        )
        after_available = shop_inventory_sku_available_to_promise(
            after, catalog_skus
        )
        available_balances = shop_inventory_available_balances(before, catalog_skus)
    except ShopInventoryValidationError as exc:
        raise TrialValidationError(str(exc)) from exc
    if (
        len(after["commands"]) != len(before["commands"]) + 1
        or after["commands"][:-1] != before["commands"]
        or after["commands"][-1]["payload"].get("kind") != "production_issue"
    ):
        raise TrialValidationError(
            "the Plant request must append exactly one production issue location command."
        )
    command = after["commands"][-1]["payload"]
    request_id = str(movement["productionRequestId"])
    if (
        command.get("id") != _production_inventory_command_id(request_id)
        or command.get("productionRequestId") != request_id
        or command.get("productionCommandDigest")
        != movement["productionCommandDigest"]
        or command.get("productionJobId") != movement["productionJobId"]
        or command.get("productionMaterialId") != movement["productionMaterialId"]
        or command.get("productionInputLotId") != movement["productionInputLotId"]
        or command.get("productionQuantityMilli")
        != movement["productionQuantityMilli"]
        or command.get("productionUnit") != movement["productionUnit"]
        or command.get("sku") != movement["sku"]
        or command.get("stockQuantity") != -movement["quantityDelta"]
        or command.get("conversionNote") != movement["conversionNote"]
        or any(
            command["proof"].get(proof_field) != movement[movement_field]
            for proof_field, movement_field in (
                ("actionId", "actionId"),
                ("capturedAt", "createdAt"),
                ("actor", "actor"),
                ("reason", "reason"),
                ("evidenceReference", "evidenceReference"),
            )
        )
    ):
        raise TrialValidationError(
            "the production location command must match the exact Shop and Plant evidence."
        )
    remaining = int(command["stockQuantity"])
    expected_allocations: list[dict[str, Any]] = []
    candidates = sorted(
        (
            balance
            for balance in available_balances
            if balance["sku"] == movement["sku"]
            and balance["availableToPromise"] > 0
        ),
        key=lambda balance: (
            -int(balance["availableToPromise"]),
            f"{balance['locationId']}|{balance['stockUnitId']}",
        ),
    )
    for balance in candidates:
        if remaining == 0:
            break
        allocated = min(remaining, int(balance["availableToPromise"]))
        expected_allocations.append(
            {
                "stockUnitId": balance["stockUnitId"],
                "locationId": balance["locationId"],
                "quantity": allocated,
            }
        )
        remaining -= allocated
    if remaining:
        raise TrialValidationError(
            "location stock cannot allocate the complete Plant material issue."
        )
    expected_allocations.sort(
        key=lambda allocation: (
            f"{allocation['locationId']}|{allocation['stockUnitId']}"
        )
    )
    if command.get("allocations") != expected_allocations:
        raise TrialValidationError(
            "the Plant material issue must use deterministic available location stock."
        )

    def decreased(source: Mapping[str, int]) -> dict[str, int]:
        retained = dict(source)
        next_quantity = retained.get(str(movement["sku"]), 0) + int(
            movement["quantityDelta"]
        )
        if next_quantity < 0:
            raise TrialValidationError(
                "the Plant material issue exceeds location stock."
            )
        if next_quantity:
            retained[str(movement["sku"])] = next_quantity
        else:
            retained.pop(str(movement["sku"]), None)
        return retained

    if after_physical != decreased(before_physical):
        raise TrialValidationError(
            "the Plant material issue must consume exact physical location stock."
        )
    if after_available != decreased(before_available):
        raise TrialValidationError(
            "the Plant material issue must reduce exact location available-to-promise."
        )


def _validate_production_material_issued(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    _require_unchanged(current, next_state, "orders", "closes")
    _require_website_intakes_unchanged(current, next_state)
    _require_storefront_requests_unchanged(current, next_state)
    _require_storefront_configuration_unchanged(current, next_state)
    _require_purchase_orders_unchanged(current, next_state)
    if (
        len(next_state["movements"]) != len(current["movements"]) + 1
        or next_state["movements"][1:] != current["movements"]
    ):
        raise TrialValidationError(
            "commerce.production_material.issued must prepend exactly one stock issue."
        )
    movement = next_state["movements"][0]
    if (
        movement.get("kind") != "production_issue"
        or movement.get("quantityDelta", 0) >= 0
        or movement.get("id") != _movement_id(str(movement.get("actionId")))
    ):
        raise TrialValidationError(
            "production material issue requires one attributable negative stock movement."
        )
    _validate_production_inventory_transition(current, next_state, movement)
    before_item, after_item = _one_changed(
        current["items"], next_state["items"], "items"
    )
    if (
        before_item["sku"] != movement["sku"]
        or after_item
        != {
            **before_item,
            "onHand": before_item["onHand"] + movement["quantityDelta"],
        }
    ):
        raise TrialValidationError(
            "production material issue must decrease only its matching Shop item."
        )


def _validate_production_return_inventory_transition(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
    movement: Mapping[str, Any],
) -> None:
    current_foundation = _inventory_foundation(current)
    next_foundation = _inventory_foundation(next_state)
    if current_foundation is None or next_foundation is None:
        raise TrialValidationError(
            "a Plant material return requires retained exact location inventory."
        )
    catalog_skus = [str(item["sku"]) for item in current["items"]]
    try:
        before = validate_shop_inventory_state(current_foundation, catalog_skus)
        after = validate_shop_inventory_state(next_foundation, catalog_skus)
        before_physical = shop_inventory_sku_totals(before, catalog_skus)
        after_physical = shop_inventory_sku_totals(after, catalog_skus)
        before_available = shop_inventory_sku_available_to_promise(
            before, catalog_skus
        )
        after_available = shop_inventory_sku_available_to_promise(
            after, catalog_skus
        )
    except ShopInventoryValidationError as exc:
        raise TrialValidationError(str(exc)) from exc
    if (
        len(after["commands"]) != len(before["commands"]) + 1
        or after["commands"][:-1] != before["commands"]
        or after["commands"][-1]["payload"].get("kind") != "production_return"
    ):
        raise TrialValidationError(
            "the Plant material return must append exactly one production return location command."
        )
    source_commands = [
        envelope["payload"]
        for envelope in before["commands"]
        if envelope["payload"].get("kind") == "production_issue"
        and envelope["payload"].get("proof", {}).get("actionId")
        == movement["productionIssueActionId"]
    ]
    if len(source_commands) != 1:
        raise TrialValidationError(
            "the Plant material return source issue is not retained in location inventory."
        )
    source = source_commands[0]
    command = after["commands"][-1]["payload"]
    if (
        command.get("id")
        != _production_return_command_id(
            str(source["id"]), str(movement["actionId"])
        )
        or command.get("productionIssueId") != source["id"]
        or command.get("productionRequestId") != movement["productionRequestId"]
        or command.get("productionCommandDigest")
        != movement["productionCommandDigest"]
        or command.get("productionJobId") != movement["productionJobId"]
        or command.get("productionMaterialId") != movement["productionMaterialId"]
        or command.get("productionInputLotId")
        != movement["productionInputLotId"]
        or command.get("productionQuantityMilli")
        != movement["productionReturnedQuantityMilli"]
        or command.get("productionUnit") != movement["productionUnit"]
        or command.get("sku") != movement["sku"]
        or command.get("stockQuantity") != movement["quantityDelta"]
        or command.get("conversionNote") != movement["conversionNote"]
        or command.get("stockUnitId")
        != movement["productionReturnStockUnitId"]
        or command.get("locationId")
        != movement["productionReturnLocationId"]
        or any(
            command["proof"].get(proof_field) != movement[movement_field]
            for proof_field, movement_field in (
                ("actionId", "actionId"),
                ("capturedAt", "createdAt"),
                ("actor", "actor"),
                ("reason", "reason"),
                ("evidenceReference", "evidenceReference"),
            )
        )
    ):
        raise TrialValidationError(
            "the production return location command must match the exact Shop and Plant evidence."
        )

    def increased(source_totals: Mapping[str, int]) -> dict[str, int]:
        retained = dict(source_totals)
        sku = str(movement["sku"])
        retained[sku] = retained.get(sku, 0) + int(movement["quantityDelta"])
        return retained

    if after_physical != increased(before_physical):
        raise TrialValidationError(
            "the Plant material return must restore exact physical location stock."
        )
    if after_available != increased(before_available):
        raise TrialValidationError(
            "the Plant material return must restore exact location available-to-promise."
        )


def _validate_production_material_returned(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    _require_unchanged(current, next_state, "orders", "closes")
    _require_website_intakes_unchanged(current, next_state)
    _require_storefront_requests_unchanged(current, next_state)
    _require_storefront_configuration_unchanged(current, next_state)
    _require_purchase_orders_unchanged(current, next_state)
    if (
        len(next_state["movements"]) != len(current["movements"]) + 1
        or next_state["movements"][1:] != current["movements"]
    ):
        raise TrialValidationError(
            "commerce.production_material.returned must prepend exactly one stock return."
        )
    movement = next_state["movements"][0]
    if (
        movement.get("kind") != "production_return"
        or movement.get("quantityDelta", 0) <= 0
        or movement.get("id") != _movement_id(str(movement.get("actionId")))
    ):
        raise TrialValidationError(
            "production material return requires one attributable positive stock movement."
        )
    _validate_production_return_inventory_transition(current, next_state, movement)
    before_item, after_item = _one_changed(
        current["items"], next_state["items"], "items"
    )
    if (
        before_item["sku"] != movement["sku"]
        or after_item
        != {
            **before_item,
            "onHand": before_item["onHand"] + movement["quantityDelta"],
        }
    ):
        raise TrialValidationError(
            "production material return must increase only its matching Shop item."
        )


def _validate_production_receipt_inventory_transition(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
    movement: Mapping[str, Any],
) -> None:
    current_foundation = _inventory_foundation(current)
    next_foundation = _inventory_foundation(next_state)
    if current_foundation is None:
        if next_foundation is not None:
            raise TrialValidationError(
                "a Plant batch receipt cannot create location inventory implicitly."
            )
        return
    if next_foundation is None:
        raise TrialValidationError(
            "a Plant batch receipt cannot remove the location inventory record."
        )
    catalog_skus = [str(item["sku"]) for item in current["items"]]
    try:
        before = validate_shop_inventory_state(current_foundation, catalog_skus)
        after = validate_shop_inventory_state(next_foundation, catalog_skus)
        before_physical = shop_inventory_sku_totals(before, catalog_skus)
        after_physical = shop_inventory_sku_totals(after, catalog_skus)
        before_available = shop_inventory_sku_available_to_promise(
            before, catalog_skus
        )
        after_available = shop_inventory_sku_available_to_promise(
            after, catalog_skus
        )
    except ShopInventoryValidationError as exc:
        raise TrialValidationError(str(exc)) from exc
    if (
        len(after["commands"]) != len(before["commands"]) + 1
        or after["commands"][:-1] != before["commands"]
        or after["commands"][-1]["payload"].get("kind")
        != "production_receipt"
    ):
        raise TrialValidationError(
            "the Plant batch receipt must append exactly one location receipt command."
        )
    command = after["commands"][-1]["payload"]
    release_id = str(movement["productionReleaseId"])
    if (
        command.get("id") != _production_receipt_command_id(release_id)
        or command.get("productionReleaseId") != release_id
        or command.get("productionCommandDigest")
        != movement["productionCommandDigest"]
        or command.get("productionJobId") != movement["productionJobId"]
        or command.get("productionOutputBatchId")
        != movement["productionOutputBatchId"]
        or command.get("productionReleasedAt")
        != movement["productionReleasedAt"]
        or command.get("sku") != movement["sku"]
        or command.get("quantity") != movement["quantityDelta"]
        or any(
            command["proof"].get(proof_field) != movement[movement_field]
            for proof_field, movement_field in (
                ("actionId", "actionId"),
                ("capturedAt", "createdAt"),
                ("actor", "actor"),
                ("reason", "reason"),
                ("evidenceReference", "evidenceReference"),
            )
        )
    ):
        raise TrialValidationError(
            "the Plant receipt location command must match the exact release evidence."
        )

    def increased(source: Mapping[str, int]) -> dict[str, int]:
        retained = dict(source)
        sku = str(movement["sku"])
        retained[sku] = retained.get(sku, 0) + int(movement["quantityDelta"])
        return retained

    if after_physical != increased(before_physical):
        raise TrialValidationError(
            "the Plant batch receipt must increase exact physical location stock."
        )
    if after_available != increased(before_available):
        raise TrialValidationError(
            "the Plant batch receipt must increase exact location available-to-promise."
        )


def _validate_production_batch_received(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    _require_unchanged(current, next_state, "orders", "closes")
    _require_website_intakes_unchanged(current, next_state)
    _require_storefront_requests_unchanged(current, next_state)
    _require_storefront_configuration_unchanged(current, next_state)
    _require_purchase_orders_unchanged(current, next_state)
    if (
        len(next_state["movements"]) != len(current["movements"]) + 1
        or next_state["movements"][1:] != current["movements"]
    ):
        raise TrialValidationError(
            "commerce.production_batch.received must prepend exactly one stock receipt."
        )
    movement = next_state["movements"][0]
    if (
        movement.get("kind") != "production_receipt"
        or movement.get("quantityDelta", 0) <= 0
        or movement.get("id") != _movement_id(str(movement.get("actionId")))
    ):
        raise TrialValidationError(
            "Plant batch receipt requires one attributable positive stock movement."
        )
    _validate_production_receipt_inventory_transition(current, next_state, movement)
    before_item, after_item = _one_changed(
        current["items"], next_state["items"], "items"
    )
    if (
        before_item["sku"] != movement["sku"]
        or after_item
        != {
            **before_item,
            "onHand": before_item["onHand"] + movement["quantityDelta"],
        }
    ):
        raise TrialValidationError(
            "Plant batch receipt must increase only its matching Shop item."
        )


def _validate_purchase_requisition_approved(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    _require_unchanged(current, next_state, "items", "orders", "movements", "closes")
    _require_website_intakes_unchanged(current, next_state)
    _require_storefront_requests_unchanged(current, next_state)
    _require_storefront_configuration_unchanged(current, next_state)
    current_requisitions = _purchase_requisitions(current)
    next_requisitions = _purchase_requisitions(next_state)
    if len(next_requisitions) != len(current_requisitions) + 1 or next_requisitions[1:] != current_requisitions:
        raise TrialValidationError(
            "commerce.purchase_requisition.approved must prepend exactly one requisition."
        )
    requisition = next_requisitions[0]
    if "budgetEnvelopeId" not in requisition:
        raise TrialValidationError(
            "a new purchase requisition requires an active purchase budget envelope."
        )
    if "sourceSourcingDecisionId" not in requisition:
        raise TrialValidationError(
            "a new purchase requisition requires an approved supplier sourcing decision."
        )
    if any(
        purchase_order.get("sku") == requisition["sku"]
        and "cancellation" not in purchase_order
        and int(purchase_order["quantityOrdered"]) > sum(
            int(movement["quantityDelta"]) + int(movement.get("rejectedQuantity", 0))
            for movement in current["movements"]
            if isinstance(movement, Mapping)
            and movement.get("kind") == "receipt"
            and movement.get("purchaseOrderId") == purchase_order.get("id")
        )
        for purchase_order in _purchase_orders(current)
        if isinstance(purchase_order, Mapping)
    ):
        raise TrialValidationError(
            "a purchase requisition cannot duplicate an active purchase order."
        )


def _validate_purchase_budget_approved(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    _require_unchanged(current, next_state, "items", "orders", "movements", "closes")
    _require_website_intakes_unchanged(current, next_state)
    _require_storefront_requests_unchanged(current, next_state)
    _require_storefront_configuration_unchanged(current, next_state)
    _require_purchase_requisitions_unchanged(current, next_state)
    _require_purchase_orders_unchanged(current, next_state)
    current_envelopes = _purchase_budget_envelopes(current)
    next_envelopes = _purchase_budget_envelopes(next_state)
    if (
        len(next_envelopes) != len(current_envelopes) + 1
        or next_envelopes[1:] != current_envelopes
    ):
        raise TrialValidationError(
            "commerce.purchase_budget.approved must prepend exactly one budget envelope."
        )


def _validate_supplier_sourcing_approved(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    _require_unchanged(current, next_state, "items", "orders", "movements", "closes")
    _require_website_intakes_unchanged(current, next_state)
    _require_storefront_requests_unchanged(current, next_state)
    _require_storefront_configuration_unchanged(current, next_state)
    _require_purchase_budget_envelopes_unchanged(current, next_state)
    _require_purchase_requisitions_unchanged(current, next_state)
    _require_purchase_orders_unchanged(current, next_state)
    current_decisions = _supplier_sourcing_decisions(current)
    next_decisions = _supplier_sourcing_decisions(next_state)
    if (
        len(next_decisions) != len(current_decisions) + 1
        or next_decisions[1:] != current_decisions
    ):
        raise TrialValidationError(
            "commerce.supplier_sourcing.approved must prepend exactly one sourcing decision."
        )


def _validate_purchase_order_created(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    _require_unchanged(current, next_state, "items", "orders", "movements", "closes")
    _require_website_intakes_unchanged(current, next_state)
    _require_storefront_requests_unchanged(current, next_state)
    _require_storefront_configuration_unchanged(current, next_state)
    current_orders = _purchase_orders(current)
    next_orders = _purchase_orders(next_state)
    if len(next_orders) != len(current_orders) + 1 or next_orders[1:] != current_orders:
        raise TrialValidationError(
            "commerce.purchase_order.created must prepend exactly one purchase order."
        )
    purchase_order = next_orders[0]
    if "expectedAt" not in purchase_order:
        raise TrialValidationError(
            "a new purchase order requires an expected arrival."
        )
    if "unitCostMmk" not in purchase_order:
        raise TrialValidationError(
            "a new purchase order requires retained whole-MMK unit cost terms."
        )
    if "cancellation" in purchase_order:
        raise TrialValidationError("a new purchase order cannot start cancelled.")
    requisition_id = purchase_order.get("requisitionId")
    if requisition_id is not None:
        requisition = next(
            (
                candidate
                for candidate in _purchase_requisitions(current)
                if candidate.get("id") == requisition_id
            ),
            None,
        )
        if requisition is None or _same_accountable_actor(
            str(purchase_order["creation"]["actor"]),
            str(requisition["approval"]["actor"]),
        ):
            raise TrialValidationError(
                "a requisition-backed purchase order requires a different operator."
            )
    foundation = _inventory_foundation(current)
    if foundation is not None:
        catalog_skus = [str(item["sku"]) for item in current["items"]]
        try:
            partners = shop_inventory_business_partners(foundation, catalog_skus)
        except ShopInventoryValidationError as exc:
            raise TrialValidationError(str(exc)) from exc
        supplier = str(next_orders[0]["supplier"])
        matching_vendors = [
            vendor for vendor in partners["vendors"] if vendor["name"] == supplier
        ]
        if len(matching_vendors) != 1:
            raise TrialValidationError(
                "a location-managed purchase order must use one retained supplier master."
            )


def _validate_purchase_order_received(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    _require_unchanged(current, next_state, "orders", "closes")
    _require_website_intakes_unchanged(current, next_state)
    _require_storefront_requests_unchanged(current, next_state)
    _require_storefront_configuration_unchanged(current, next_state)
    _require_purchase_orders_unchanged(current, next_state)
    before_item, after_item = _one_changed(
        current["items"],
        next_state["items"],
        "items",
    )
    if (
        len(next_state["movements"]) != len(current["movements"]) + 1
        or next_state["movements"][1:] != current["movements"]
    ):
        raise TrialValidationError(
            "commerce.purchase_order.received must prepend exactly one receipt."
        )
    movement = next_state["movements"][0]
    purchase_order_id = movement.get("purchaseOrderId")
    purchase_order = next(
        (
            candidate
            for candidate in _purchase_orders(current)
            if candidate["id"] == purchase_order_id
        ),
        None,
    )
    if (
        purchase_order is None
        or "cancellation" in purchase_order
        or movement.get("kind") != "receipt"
        or movement.get("sku") != purchase_order["sku"]
        or movement.get("sku") != before_item["sku"]
        or "orderId" in movement
        or movement.get("id") != _movement_id(str(movement.get("actionId")))
    ):
        raise TrialValidationError(
            "purchase receipt requires one open matching purchase order."
        )
    previously_delivered = sum(
        prior["quantityDelta"] + prior.get("rejectedQuantity", 0)
        for prior in current["movements"]
        if prior.get("purchaseOrderId") == purchase_order_id
    )
    rejected_quantity = movement.get("rejectedQuantity", 0)
    if (
        movement["quantityDelta"] + rejected_quantity
        > purchase_order["quantityOrdered"] - previously_delivered
        or after_item
        != {
            **before_item,
            "onHand": before_item["onHand"] + movement["quantityDelta"],
        }
    ):
        raise TrialValidationError(
            "purchase receipt must increase stock by no more than the outstanding quantity."
        )

    current_foundation = _inventory_foundation(current)
    next_foundation = _inventory_foundation(next_state)
    if current_foundation is None:
        if next_foundation is not None:
            raise TrialValidationError(
                "a purchase receipt cannot initialize location inventory."
            )
        return
    if next_foundation is None:
        raise TrialValidationError(
            "managed location stock requires a linked receipt allocation."
        )
    catalog_skus = [str(item["sku"]) for item in current["items"]]
    try:
        before_foundation = validate_shop_inventory_state(
            current_foundation, catalog_skus
        )
        after_foundation = validate_shop_inventory_state(
            next_foundation, catalog_skus
        )
        before_totals = shop_inventory_sku_totals(
            before_foundation, catalog_skus
        )
        after_totals = shop_inventory_sku_totals(after_foundation, catalog_skus)
        before_available = shop_inventory_sku_available_to_promise(
            before_foundation, catalog_skus
        )
        after_available = shop_inventory_sku_available_to_promise(
            after_foundation, catalog_skus
        )
    except ShopInventoryValidationError as exc:
        raise TrialValidationError(str(exc)) from exc
    if (
        after_foundation["revision"] != before_foundation["revision"] + 1
        or after_foundation["commands"][:-1] != before_foundation["commands"]
        or after_foundation["commands"][-1]["payload"]["kind"] != "receipt"
    ):
        raise TrialValidationError(
            "managed purchase receipt must append exactly one location receipt."
        )
    location_receipt = after_foundation["commands"][-1]["payload"]
    location_proof = location_receipt["proof"]
    if (
        location_receipt["purchaseOrderId"] != purchase_order_id
        or location_receipt["sku"] != movement["sku"]
        or location_receipt["quantity"] != movement["quantityDelta"]
        or any(
            location_proof[proof_field] != movement[movement_field]
            for proof_field, movement_field in (
                ("actionId", "actionId"),
                ("capturedAt", "createdAt"),
                ("actor", "actor"),
                ("reason", "reason"),
                ("evidenceReference", "evidenceReference"),
            )
        )
    ):
        raise TrialValidationError(
            "location receipt must match its aggregate purchase receipt exactly."
        )
    expected_physical = dict(before_totals)
    expected_physical[movement["sku"]] = (
        expected_physical.get(movement["sku"], 0) + movement["quantityDelta"]
    )
    if (
        before_available != _inventory_item_totals(current)
        or after_available != _inventory_item_totals(next_state)
        or after_totals != expected_physical
    ):
        raise TrialValidationError(
            "location receipt must conserve aggregate Shop ATP and physical stock."
        )


def _validate_purchase_order_cancelled(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    _require_unchanged(
        current,
        next_state,
        "items",
        "orders",
        "movements",
        "closes",
    )
    _require_website_intakes_unchanged(current, next_state)
    _require_storefront_requests_unchanged(current, next_state)
    _require_storefront_configuration_unchanged(current, next_state)
    before, after = _one_changed(
        _purchase_orders(current),
        _purchase_orders(next_state),
        "purchaseOrders",
    )
    previously_received = sum(
        movement["quantityDelta"]
        for movement in current["movements"]
        if movement.get("purchaseOrderId") == before["id"]
    )
    if (
        "cancellation" in before
        or "cancellation" not in after
        or previously_received >= before["quantityOrdered"]
        or _without(before, frozenset()) != _without(
            after,
            frozenset({"cancellation"}),
        )
    ):
        raise TrialValidationError(
            "purchase order cancellation may only add proof to an order with an outstanding remainder."
        )


def _validate_supplier_invoice_recorded(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    _require_unchanged(current, next_state, "items", "orders", "movements", "closes")
    _require_website_intakes_unchanged(current, next_state)
    _require_storefront_requests_unchanged(current, next_state)
    _require_storefront_configuration_unchanged(current, next_state)
    before, after = _one_changed(
        _purchase_orders(current),
        _purchase_orders(next_state),
        "purchaseOrders",
    )
    if (
        "supplierInvoice" in before
        or "supplierInvoice" not in after
        or "cancellation" in before
        or "unitCostMmk" not in before
        or _without(before, frozenset())
        != _without(after, frozenset({"supplierInvoice"}))
    ):
        raise TrialValidationError(
            "supplier invoice recording may only add one immutable invoice to one open commercial purchase order."
        )


def _validate_supplier_invoice_payable_ready(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    _require_unchanged(current, next_state, "items", "orders", "movements", "closes")
    _require_website_intakes_unchanged(current, next_state)
    _require_storefront_requests_unchanged(current, next_state)
    _require_storefront_configuration_unchanged(current, next_state)
    before, after = _one_changed(
        _purchase_orders(current),
        _purchase_orders(next_state),
        "purchaseOrders",
    )
    before_invoice = before.get("supplierInvoice")
    after_invoice = after.get("supplierInvoice")
    if (
        not isinstance(before_invoice, Mapping)
        or not isinstance(after_invoice, Mapping)
        or "payableReview" in before_invoice
        or "payableReview" not in after_invoice
        or _without(before, frozenset({"supplierInvoice"}))
        != _without(after, frozenset({"supplierInvoice"}))
        or _without(before_invoice, frozenset())
        != _without(after_invoice, frozenset({"payableReview"}))
        or commerce_supplier_invoice_match(current, before)["status"] != "matched"
    ):
        raise TrialValidationError(
            "payable-ready review requires one exact PO, receipt, and supplier invoice match."
        )


def _validate_supplier_return_authorized(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    _require_unchanged(current, next_state, "items", "orders", "movements", "closes")
    _require_website_intakes_unchanged(current, next_state)
    _require_storefront_requests_unchanged(current, next_state)
    _require_storefront_configuration_unchanged(current, next_state)
    before, after = _one_changed(_purchase_orders(current), _purchase_orders(next_state), "purchaseOrders")
    before_returns = before.get("supplierReturns", [])
    after_returns = after.get("supplierReturns", [])
    if (
        not isinstance(before_returns, list)
        or not isinstance(after_returns, list)
        or len(after_returns) != len(before_returns) + 1
        or after_returns[1:] != before_returns
        or _without(before, frozenset({"supplierReturns"}))
        != _without(after, frozenset({"supplierReturns"}))
    ):
        raise TrialValidationError(
            "supplier return authorization must prepend exactly one immutable claim to one purchase order."
        )


def _validate_supplier_credit_recorded(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    _require_unchanged(current, next_state, "items", "orders", "movements", "closes")
    _require_website_intakes_unchanged(current, next_state)
    _require_storefront_requests_unchanged(current, next_state)
    _require_storefront_configuration_unchanged(current, next_state)
    before, after = _one_changed(_purchase_orders(current), _purchase_orders(next_state), "purchaseOrders")
    before_returns = before.get("supplierReturns", [])
    after_returns = after.get("supplierReturns", [])
    if (
        not isinstance(before_returns, list)
        or not isinstance(after_returns, list)
        or len(after_returns) != len(before_returns)
        or _without(before, frozenset({"supplierReturns"}))
        != _without(after, frozenset({"supplierReturns"}))
    ):
        raise TrialValidationError("supplier credit recording may change only one existing return claim.")
    changed = [
        (before_claim, after_claim)
        for before_claim, after_claim in zip(before_returns, after_returns, strict=True)
        if before_claim != after_claim
    ]
    if len(changed) != 1:
        raise TrialValidationError("supplier credit recording must change exactly one return claim.")
    before_claim, after_claim = changed[0]
    before_credits = before_claim.get("creditNotes", [])
    after_credits = after_claim.get("creditNotes", [])
    if (
        not isinstance(before_credits, list)
        or not isinstance(after_credits, list)
        or len(after_credits) != len(before_credits) + 1
        or after_credits[1:] != before_credits
        or _without(before_claim, frozenset({"creditNotes"}))
        != _without(after_claim, frozenset({"creditNotes"}))
    ):
        raise TrialValidationError(
            "supplier credit recording must prepend exactly one immutable credit note."
        )


def _commerce_order_close_basis(order: Mapping[str, Any]) -> datetime:
    timestamps = [str(order["createdAt"])]
    if order.get("paymentReconciledAt"):
        timestamps.append(str(order["paymentReconciledAt"]))
    completion = order.get("completion")
    if isinstance(completion, Mapping):
        timestamps.append(str(completion["capturedAt"]))
    timestamps.extend(
        str(correction["createdAt"])
        for correction in order.get("corrections", [])
        if isinstance(correction, Mapping)
    )
    return max(
        datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        for timestamp in timestamps
    )


def _validate_close(current: Mapping[str, Any], next_state: Mapping[str, Any]) -> None:
    _require_unchanged(current, next_state, "items", "orders", "movements")
    _require_website_intakes_unchanged(current, next_state)
    if len(next_state["closes"]) != len(current["closes"]) + 1 or next_state["closes"][1:] != current["closes"]:
        raise TrialValidationError("commerce.close.saved must prepend exactly one close snapshot.")
    if any(
        "orderIds" not in prior_close or "businessDate" not in prior_close
        for prior_close in current["closes"]
    ):
        raise TrialValidationError(
            "legacy daily closes must be migrated before another close can be saved."
        )
    previously_closed_order_ids = {
        order_id
        for prior_close in current["closes"]
        for order_id in prior_close.get("orderIds", [])
    }
    eligible = sorted(
        [
            order
            for order in current["orders"]
            if order["status"] == "completed"
            and order["paymentStatus"] == "reconciled"
            and order["id"] not in previously_closed_order_ids
        ],
        key=lambda order: order["id"],
    )
    close = next_state["closes"][0]
    if not _CLOSE_SNAPSHOT_FIELDS.issubset(close):
        raise TrialValidationError("new daily closes require exception and operator evidence.")
    if close["orderIds"] != [order["id"] for order in eligible]:
        raise TrialValidationError("daily close order membership must match unclosed completed orders.")
    close_at = datetime.fromisoformat(str(close["createdAt"]).replace("Z", "+00:00"))
    if any(_commerce_order_close_basis(order) > close_at for order in eligible):
        raise TrialValidationError("daily close cannot predate included order evidence.")
    adjusted_totals = [_order_adjusted_total(order) for order in eligible]
    if (
        any(total is None for total in adjusted_totals)
        or close["orders"] != len(eligible)
        or close["total"] != sum(total or 0 for total in adjusted_totals)
    ):
        raise TrialValidationError("daily close totals must match completed, reconciled orders.")
    if close["businessDate"] != _myanmar_business_date(close["createdAt"]) or any(
        prior_close.get("businessDate") == close["businessDate"]
        for prior_close in current["closes"]
    ):
        raise TrialValidationError("daily close requires one unique business date.")
    expected_payment_exceptions = sorted(
        order["id"]
        for order in current["orders"]
        if order["refundStatus"] == "due"
        or (order["status"] != "cancelled" and order["paymentStatus"] == "pending")
    )
    expected_stock_exceptions = sorted(
        item["sku"]
        for item in current["items"]
        if item["onHand"] <= item["reorderAt"]
    )
    if close["paymentExceptionOrderIds"] != expected_payment_exceptions:
        raise TrialValidationError("daily close payment exceptions must match current orders.")
    if close["stockExceptionSkus"] != expected_stock_exceptions:
        raise TrialValidationError("daily close stock exceptions must match current inventory.")


def _require_website_intake_matches_current_catalog(
    intake: Mapping[str, Any],
    state: Mapping[str, Any],
    *,
    field: str,
) -> None:
    item = next(
        (candidate for candidate in state["items"] if candidate["sku"] == intake["sku"]),
        None,
    )
    if (
        item is None
        or intake["itemName"] != item["name"]
        or intake.get("itemVariant") != item.get("variant")
        or intake["unitPrice"] != item["price"]
    ):
        raise TrialValidationError(
            f"{field} must match the current Commerce catalog record."
        )


def _validate_website_intake_created(current: Mapping[str, Any], next_state: Mapping[str, Any]) -> None:
    _require_unchanged(current, next_state, "items", "orders", "movements", "closes")
    current_intakes = _website_intakes(current)
    next_intakes = _website_intakes(next_state)
    if len(next_intakes) != len(current_intakes) + 1 or next_intakes[1:] != current_intakes:
        raise TrialValidationError("commerce.website_intake.created must prepend exactly one Website intake.")
    if next_intakes[0]["status"] != "pending_confirmation":
        raise TrialValidationError("a new Website intake must await human confirmation.")
    if "snapshotDigest" not in next_intakes[0]:
        raise TrialValidationError(
            "a new Website intake requires an immutable snapshot digest."
        )
    _require_website_intake_matches_current_catalog(
        next_intakes[0],
        current,
        field="new Website intake",
    )


def _validate_website_intake_converted(current: Mapping[str, Any], next_state: Mapping[str, Any]) -> None:
    current_intakes = _website_intakes(current)
    next_intakes = _website_intakes(next_state)
    before, after = _one_changed(
        current_intakes,
        next_intakes,
        "websiteIntakes",
    )
    _require_website_intake_matches_current_catalog(
        before,
        current,
        field="Website intake conversion",
    )
    if "snapshotDigest" not in before:
        raise TrialValidationError(
            "legacy Website intakes without a snapshot digest cannot be converted."
        )
    _validate_new_order_and_reservation(
        current,
        next_state,
        event_type="commerce.website_intake.converted",
    )
    if before["status"] != "pending_confirmation" or after["status"] != "converted":
        raise TrialValidationError("only a pending Website intake can be converted.")
    if "conversion" not in after or _without(before, frozenset({"status"})) != _without(
        after,
        frozenset({"status", "conversion"}),
    ):
        raise TrialValidationError("Website intake conversion may change only status and conversion proof.")
    order = next_state["orders"][0]
    if order.get("sourceRecordId") != after["id"] or after["conversion"]["orderId"] != order["id"]:
        raise TrialValidationError("Website intake conversion must create its attributable order.")


def _validate_storefront_request_received(current: Mapping[str, Any], next_state: Mapping[str, Any]) -> None:
    _require_unchanged(current, next_state, "items", "orders", "movements", "closes")
    _require_website_intakes_unchanged(current, next_state)
    current_requests = _storefront_requests(current)
    next_requests = _storefront_requests(next_state)
    if len(next_requests) != len(current_requests) + 1 or next_requests[1:] != current_requests:
        raise TrialValidationError(
            "commerce.storefront_request.received must prepend exactly one Ecommerce request."
        )
    request = next_requests[0]
    lines = (
        request["lines"]
        if request["schema"] == "supermega.ecommerce.order_request.v2"
        else [request["line"]]
    )
    configuration = _storefront_configuration(current)
    if configuration is None:
        raise TrialValidationError(
            "an Ecommerce request requires a saved storefront configuration."
        )
    if configuration["shopCatalogDigest"] != commerce_catalog_digest(current):
        raise TrialValidationError(
            "the Ecommerce request cannot use a storefront with a stale Shop catalog."
        )
    if any(line["sku"] not in configuration["selectedSkus"] for line in lines):
        raise TrialValidationError(
            "every Ecommerce request SKU must be included in the saved storefront."
        )
    if (
        request.get("sourceStorefrontRevision") != configuration["revision"]
        or request.get("sourceStorefrontActionId") != configuration["saved"]["actionId"]
        or datetime.fromisoformat(request["createdAt"].replace("Z", "+00:00"))
        < datetime.fromisoformat(
            configuration["saved"]["capturedAt"].replace("Z", "+00:00")
        )
    ):
        raise TrialValidationError(
            "the Ecommerce request does not reference the current saved storefront revision."
        )
    if request["sourcePreviewDigest"] != _configured_storefront_preview_digest(
        current,
        configuration,
    ):
        raise TrialValidationError(
            "the Ecommerce request does not match the current saved storefront preview."
        )
    def line_matches_catalog(line: Mapping[str, Any]) -> bool:
        matching_items = [item for item in current["items"] if item["sku"] == line["sku"]]
        return (
            len(matching_items) == 1
            and matching_items[0]["name"] == line["name"]
            and matching_items[0].get("variant") == line["variant"]
            and matching_items[0]["price"] == line["unitPriceMmk"]
            and matching_items[0]["onHand"] >= line["quantity"]
        )

    if (
        any(not line_matches_catalog(line) for line in lines)
        or any(order.get("sourceRecordId") == request["id"] for order in current["orders"])
    ):
        raise TrialValidationError(
            "the Ecommerce request receipt does not match the current Shop catalog boundary."
        )


def create_commerce_storefront_request_from_intent(
    current_value: Mapping[str, Any],
    intent_value: Mapping[str, Any],
    evidence_value: Mapping[str, Any],
) -> dict[str, Any]:
    """Retain one customer checkout request without accepting browser-built Shop state."""

    current = validate_commerce_state(current_value)
    intent = _object(intent_value, "storefront request intent")
    _exact_fields(
        intent,
        "storefront request intent",
        required=frozenset({"request"}),
    )
    request = _storefront_request(
        intent["request"],
        "storefront request intent.request",
    )
    evidence = _action_proof(evidence_value, "evidence")
    requested_at = datetime.fromisoformat(request["createdAt"].replace("Z", "+00:00"))
    received_at = datetime.fromisoformat(evidence["capturedAt"].replace("Z", "+00:00"))
    if received_at < requested_at:
        raise TrialValidationError(
            "the Ecommerce request receipt cannot predate its customer quote."
        )
    if (
        request["schema"] == "supermega.ecommerce.order_request.v2"
        and received_at
        > datetime.fromisoformat(request["quote"]["expiresAt"].replace("Z", "+00:00"))
    ):
        raise TrialValidationError(
            "the Ecommerce request quote expired before Shop received it."
        )
    return validate_commerce_state(
        {
            **current,
            "storefrontRequests": [request, *_storefront_requests(current)],
        }
    )


def _validate_storefront_configuration_saved(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    _require_unchanged(current, next_state, "items", "orders", "movements", "closes")
    _require_website_intakes_unchanged(current, next_state)
    _require_storefront_requests_unchanged(current, next_state)
    before = _storefront_configuration(current)
    after = _storefront_configuration(next_state)
    if after is None:
        raise TrialValidationError(
            "commerce.storefront.configuration.saved requires one storefront configuration."
        )
    if after["shopCatalogDigest"] != commerce_catalog_digest(current):
        raise TrialValidationError(
            "the storefront configuration must bind to the current Shop catalog."
        )
    if before is None:
        if after["revision"] != 1 or after["shopCatalogSnapshotRevision"] != 1:
            raise TrialValidationError(
                "the first storefront configuration must start at revision one."
            )
        return
    content_fields = ("storeName", "summary", "selectedSkus", "shopCatalogDigest")
    if all(before[field] == after[field] for field in content_fields) and before.get(
        "merchandising"
    ) == after.get("merchandising"):
        raise TrialValidationError("an unchanged storefront configuration cannot advance.")
    if after["revision"] != before["revision"] + 1:
        raise TrialValidationError("storefront configuration revision must advance exactly once.")
    expected_catalog_revision = before["shopCatalogSnapshotRevision"] + (
        1 if before["shopCatalogDigest"] != after["shopCatalogDigest"] else 0
    )
    if after["shopCatalogSnapshotRevision"] != expected_catalog_revision:
        raise TrialValidationError(
            "Shop catalog snapshot revision must advance only when its digest changes."
        )
    same_imported_content = (
        before["selectedSkus"] == after["selectedSkus"]
        and before.get("merchandising") == after.get("merchandising")
    )
    if same_imported_content and before.get("activation") != after.get("activation"):
        raise TrialValidationError(
            "Ecommerce activation provenance is immutable while imported content is retained."
        )
    if not same_imported_content and "activation" in after:
        raise TrialValidationError(
            "Ecommerce activation provenance must be cleared when imported content changes."
        )


def _validate_tax_configuration_saved(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    _require_unchanged(current, next_state, "items", "orders", "movements", "closes")
    _require_website_intakes_unchanged(current, next_state)
    _require_storefront_requests_unchanged(current, next_state)
    _require_storefront_configuration_unchanged(current, next_state)
    _require_purchase_orders_unchanged(current, next_state)
    _require_catalog_changes_unchanged(current, next_state)
    _require_catalog_baselines_unchanged(current, next_state)
    _require_inventory_foundation_unchanged(current, next_state)
    before = _tax_configurations(current)
    after = _tax_configurations(next_state)
    if len(after) != len(before) + 1 or after[1:] != before:
        raise TrialValidationError(
            "commerce.tax_configuration.saved must prepend exactly one tax configuration."
        )
    configuration = after[0]
    if configuration["revision"] != len(before) + 1:
        raise TrialValidationError("tax configuration revision must advance exactly once.")
    if not _TAX_CONFIGURATION_SCHEDULE_FIELDS.issubset(configuration):
        raise TrialValidationError(
            "new tax configurations require reviewed jurisdiction and effective time."
        )
    if before and all(
        configuration.get(field) == before[0].get(field)
        for field in (
            "code",
            "label",
            "rateBasisPoints",
            "mode",
            "jurisdictionCode",
            "effectiveFrom",
        )
    ):
        raise TrialValidationError("an unchanged tax configuration cannot advance.")


def _validate_account_mapping_saved(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    _require_unchanged(current, next_state, "items", "orders", "movements", "closes")
    _require_website_intakes_unchanged(current, next_state)
    _require_storefront_requests_unchanged(current, next_state)
    _require_storefront_configuration_unchanged(current, next_state)
    _require_purchase_orders_unchanged(current, next_state)
    _require_catalog_changes_unchanged(current, next_state)
    _require_catalog_baselines_unchanged(current, next_state)
    _require_tax_configurations_unchanged(current, next_state)
    _require_inventory_foundation_unchanged(current, next_state)
    before = _account_mapping_configurations(current)
    after = _account_mapping_configurations(next_state)
    if len(after) != len(before) + 1 or after[1:] != before:
        raise TrialValidationError(
            "commerce.account_mapping.saved must prepend exactly one account mapping configuration."
        )
    configuration = after[0]
    if configuration["revision"] != len(before) + 1:
        raise TrialValidationError(
            "account mapping configuration revision must advance exactly once."
        )
    if before and configuration["mappings"] == before[0]["mappings"]:
        raise TrialValidationError(
            "an unchanged account mapping configuration cannot advance."
        )


def _validate_customer_credit_policy_saved(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    current_without_policies = dict(current)
    current_without_policies.pop("customerCreditPolicies", None)
    next_without_policies = dict(next_state)
    next_without_policies.pop("customerCreditPolicies", None)
    if current_without_policies != next_without_policies:
        raise TrialValidationError(
            "commerce.customer_credit_policy.saved may change only customerCreditPolicies."
        )
    before = _customer_credit_policies(current)
    after = _customer_credit_policies(next_state)
    if len(after) != len(before) + 1 or after[1:] != before:
        raise TrialValidationError(
            "commerce.customer_credit_policy.saved must prepend exactly one customer credit policy."
        )
    policy = after[0]
    if policy["revision"] != len(before) + 1:
        raise TrialValidationError(
            "customer credit policy revision must advance exactly once."
        )
    prior = next(
        (
            candidate
            for candidate in before
            if candidate.get("customer") == policy["customer"]
        ),
        None,
    )
    if prior is not None and all(
        prior[field] == policy[field]
        for field in (
            "customer",
            "creditLimitMmk",
            "maxPaymentTermsDays",
            "status",
        )
    ):
        raise TrialValidationError(
            "an unchanged customer credit policy cannot advance."
        )


def _validate_promotion_policy_saved(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    current_without_policies = dict(current)
    current_without_policies.pop("promotionPolicies", None)
    next_without_policies = dict(next_state)
    next_without_policies.pop("promotionPolicies", None)
    if current_without_policies != next_without_policies:
        raise TrialValidationError(
            "commerce.promotion_policy.saved may change only promotionPolicies."
        )
    before = _promotion_policies(current)
    after = _promotion_policies(next_state)
    if len(after) != len(before) + 1 or after[1:] != before:
        raise TrialValidationError(
            "commerce.promotion_policy.saved must prepend exactly one promotion policy."
        )
    policy = after[0]
    if policy["revision"] != len(before) + 1:
        raise TrialValidationError(
            "promotion policy revision must advance exactly once."
        )
    prior = next(
        (
            candidate
            for candidate in before
            if candidate.get("code") == policy["code"]
        ),
        None,
    )
    if prior is not None and all(
        prior[field] == policy[field]
        for field in (
            "code",
            "discountBasisPoints",
            "minimumSubtotalMmk",
            "maximumDiscountMmk",
            "status",
            "effectiveFrom",
            "effectiveUntil",
        )
    ):
        raise TrialValidationError(
            "an unchanged promotion policy cannot advance."
        )


def _validate_shipping_policy_saved(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    current_without = dict(current)
    current_without.pop("shippingPolicies", None)
    next_without = dict(next_state)
    next_without.pop("shippingPolicies", None)
    if current_without != next_without:
        raise TrialValidationError("commerce.shipping_policy.saved may change only shippingPolicies.")
    before = _shipping_policies(current)
    after = _shipping_policies(next_state)
    if len(after) != len(before) + 1 or after[1:] != before:
        raise TrialValidationError("commerce.shipping_policy.saved must prepend exactly one shipping policy.")
    policy = after[0]
    if policy["revision"] != len(before) + 1:
        raise TrialValidationError("shipping policy revision must advance exactly once.")
    prior = next((candidate for candidate in before if candidate.get("zoneCode") == policy["zoneCode"]), None)
    if prior is not None and all(prior[field] == policy[field] for field in (
        "zoneCode", "townships", "feeMmk", "promiseMinutes", "status", "effectiveFrom", "effectiveUntil",
    )):
        raise TrialValidationError("an unchanged shipping policy cannot advance.")


def _validate_payment_policy_saved(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    current_without = dict(current)
    current_without.pop("paymentPolicies", None)
    next_without = dict(next_state)
    next_without.pop("paymentPolicies", None)
    if current_without != next_without:
        raise TrialValidationError("commerce.payment_policy.saved may change only paymentPolicies.")
    before = _payment_policies(current)
    after = _payment_policies(next_state)
    if len(after) != len(before) + 1 or after[1:] != before:
        raise TrialValidationError("commerce.payment_policy.saved must prepend exactly one payment policy.")
    policy = after[0]
    if policy["revision"] != len(before) + 1:
        raise TrialValidationError("payment policy revision must advance exactly once.")
    prior = next((candidate for candidate in before if candidate.get("adapter") == policy["adapter"]), None)
    if prior is not None and all(prior[field] == policy[field] for field in (
        "adapter", "allowedFulfilments", "maximumOrderMmk", "instructions", "status", "effectiveFrom", "effectiveUntil",
    )):
        raise TrialValidationError("an unchanged payment policy cannot advance.")


def _service_schedule(state: Mapping[str, Any]) -> dict[str, Any] | None:
    value = state.get("serviceSchedule")
    return _validate_service_schedule(value) if value is not None else None


def _spa_membership_session_available(
    commerce: Mapping[str, Any],
    schedule: Mapping[str, Any],
    event: Mapping[str, Any],
) -> bool:
    booking_by_id = {booking["id"]: booking for booking in schedule["bookings"]}
    booking = booking_by_id.get(event["subjectId"])
    event_at = datetime.fromisoformat(event["happenedAt"].replace("Z", "+00:00"))
    if (
        schedule["industryPackId"] != "spa"
        or booking is None
        or booking["status"] != "completed"
        or booking["customerName"] == "Guest"
        or event_at < datetime.fromisoformat(booking["updatedAt"].replace("Z", "+00:00"))
    ):
        return False
    package = _SPA_MEMBERSHIP_PACKAGES.get(booking["serviceId"])
    if package is None:
        return False
    package_sku, sessions_per_purchase = package
    purchased = 0
    for order in commerce.get("orders", []):
        paid_at = order.get("paymentReconciledAt")
        if (
            order["customer"] != booking["customerName"]
            or order["status"] != "completed"
            or order["paymentStatus"] != "reconciled"
            or order["refundStatus"] != "none"
            or paid_at is None
            or datetime.fromisoformat(paid_at.replace("Z", "+00:00")) > event_at
        ):
            continue
        for line in order.get("lines", []):
            if line["sku"] == package_sku:
                purchased += line["quantity"] * sessions_per_purchase
    redeemed = 0
    for prior in schedule["events"][:-1]:
        if prior["type"] != "package_redeemed":
            continue
        if prior["subjectId"] == booking["id"]:
            return False
        prior_booking = booking_by_id.get(prior["subjectId"])
        if (
            prior_booking is not None
            and prior_booking["customerName"] == booking["customerName"]
            and prior_booking["serviceId"] == booking["serviceId"]
        ):
            redeemed += 1
    return purchased > redeemed


def _service_csv_cell(value: object) -> str:
    text = str(value)
    safe = f"'{text}" if re.match(r"^[=+\-@\t\r]", text) else text
    return f'"{safe.replace(chr(34), chr(34) * 2)}"'


def _service_client_export_csv(schedule: Mapping[str, Any]) -> str:
    rows: list[list[object]] = [["Name", "Contact", "Appointment updates", "Consent recorded", "Appointments", "Completed visits"]]
    bookings = schedule.get("bookings", [])
    for client in schedule.get("clients", []):
        if "anonymizedAt" in client:
            continue
        client_bookings = [booking for booking in bookings if booking.get("clientId") == client.get("id") and booking.get("status") != "cancelled"]
        rows.append([
            client["name"], client["contact"], client["appointmentUpdates"], client.get("consentRecordedAt", ""),
            len(client_bookings), sum(1 for booking in client_bookings if booking.get("status") == "completed"),
        ])
    return "\r\n".join(",".join(_service_csv_cell(value) for value in row) for row in rows)


def _service_events_contain_identifier(events: Sequence[Mapping[str, Any]], identifier: str) -> bool:
    needle = identifier.strip().casefold()
    return bool(needle) and any(
        needle in str(event.get(field, "")).casefold()
        for event in events
        for field in ("subjectId", "actor", "reason")
    )


def _require_service_schedule_unchanged(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    if current.get("serviceSchedule") != next_state.get("serviceSchedule"):
        raise TrialValidationError(
            "commerce service schedule can change only through commerce.service_schedule.saved."
        )


def _validate_service_schedule_saved(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    current_without_schedule = dict(current)
    current_without_schedule.pop("serviceSchedule", None)
    next_without_schedule = dict(next_state)
    next_without_schedule.pop("serviceSchedule", None)
    if current_without_schedule != next_without_schedule:
        raise TrialValidationError(
            "commerce.service_schedule.saved cannot change other Commerce records."
        )
    before = _service_schedule(current)
    after = _service_schedule(next_state)
    if after is None or after["revision"] < 1:
        raise TrialValidationError(
            "commerce.service_schedule.saved requires a reviewed schedule change."
        )
    if before is None:
        return
    if after["industryPackId"] != before["industryPackId"]:
        raise TrialValidationError("an active service schedule cannot change industry pack.")
    if after["revision"] != before["revision"] + 1:
        raise TrialValidationError("service schedule revision must advance exactly once.")
    if after["events"][:-1] != before["events"]:
        raise TrialValidationError("service schedule evidence history is immutable.")
    latest = after["events"][-1]
    event_type = latest["type"]
    if event_type == "service_registered":
        valid_change = (
            len(after["services"]) == len(before["services"]) + 1
            and after["services"][:-1] == before["services"]
            and latest["subjectId"] == after["services"][-1]["id"]
            and after["services"][-1]["active"] is True
            and after["resources"] == before["resources"]
            and after["privacyPolicy"] == before["privacyPolicy"]
            and after["clients"] == before["clients"]
            and after["bookings"] == before["bookings"]
        )
    elif event_type == "resource_registered":
        valid_change = (
            len(after["resources"]) == len(before["resources"]) + 1
            and after["resources"][:-1] == before["resources"]
            and latest["subjectId"] == after["resources"][-1]["id"]
            and after["resources"][-1]["active"] is True
            and after["services"] == before["services"]
            and after["privacyPolicy"] == before["privacyPolicy"]
            and after["clients"] == before["clients"]
            and after["bookings"] == before["bookings"]
        )
    elif event_type == "booking_scheduled":
        booking = after["bookings"][-1] if len(after["bookings"]) == len(before["bookings"]) + 1 else None
        prior_client = next((client for client in before["clients"] if booking and client["id"] == booking["clientId"]), None)
        if booking and prior_client:
            expected_client = {
                **prior_client,
                "name": booking["customerName"],
                "contact": booking["contact"],
                "appointmentUpdates": booking["appointmentUpdates"],
                "updatedAt": latest["happenedAt"],
            }
            expected_client.pop("consentRecordedAt", None)
            if booking["appointmentUpdates"] == "allowed":
                expected_client["consentRecordedAt"] = latest["happenedAt"]
            expected_clients = [expected_client if client["id"] == expected_client["id"] else client for client in before["clients"]]
            expected_prior_bookings = [
                {**candidate, "customerName": expected_client["name"], "contact": expected_client["contact"], "appointmentUpdates": expected_client["appointmentUpdates"]}
                if candidate["clientId"] == expected_client["id"] else candidate
                for candidate in before["bookings"]
            ]
        elif booking:
            expected_client = {
                "id": booking["clientId"], "name": booking["customerName"], "contact": booking["contact"],
                "appointmentUpdates": booking["appointmentUpdates"], "createdAt": latest["happenedAt"], "updatedAt": latest["happenedAt"],
            }
            if booking["appointmentUpdates"] == "allowed":
                expected_client["consentRecordedAt"] = latest["happenedAt"]
            expected_clients = [*before["clients"], expected_client]
            expected_prior_bookings = before["bookings"]
        else:
            expected_clients = []
            expected_prior_bookings = []
        valid_change = (
            len(after["bookings"]) == len(before["bookings"]) + 1
            and after["bookings"][:-1] == expected_prior_bookings
            and latest["subjectId"] == after["bookings"][-1]["id"]
            and after["bookings"][-1]["status"] == "held"
            and after["bookings"][-1]["appointmentUpdates"] in {"allowed", "declined"}
            and after["bookings"][-1]["createdAt"] == latest["happenedAt"]
            and after["bookings"][-1]["updatedAt"] == latest["happenedAt"]
            and after["services"] == before["services"]
            and after["resources"] == before["resources"]
            and after["privacyPolicy"] == before["privacyPolicy"]
            and after["clients"] == expected_clients
        )
    elif event_type == "client_retention_set":
        match = re.fullmatch(r"retention-([0-9]{2,4})-days", str(latest["subjectId"]))
        retention_days = int(match.group(1)) if match else None
        valid_change = (
            retention_days is not None and 30 <= retention_days <= 3650
            and before["privacyPolicy"].get("clientRetentionDays") != retention_days
            and after["privacyPolicy"] == {"clientRetentionDays": retention_days, "updatedAt": latest["happenedAt"], "updatedBy": latest["actor"]}
            and after["services"] == before["services"] and after["resources"] == before["resources"]
            and after["clients"] == before["clients"] and after["bookings"] == before["bookings"]
        )
    elif event_type == "client_exported":
        count = sum(1 for client in before["clients"] if "anonymizedAt" not in client)
        expected_digest = "sha256:" + sha256(_service_client_export_csv(before).encode("utf-8")).hexdigest()
        valid_change = (
            latest["subjectId"] == expected_digest
            and latest["reason"] == f"Exported {count} privacy-minimal client {'record' if count == 1 else 'records'}."
            and after["services"] == before["services"] and after["resources"] == before["resources"]
            and after["privacyPolicy"] == before["privacyPolicy"] and after["clients"] == before["clients"]
            and after["bookings"] == before["bookings"]
        )
    elif event_type == "client_anonymized":
        prior_client = next((client for client in before["clients"] if client["id"] == latest["subjectId"]), None)
        client_bookings = [booking for booking in before["bookings"] if booking["clientId"] == latest["subjectId"]]
        open_visit = any(booking["status"] in {"held", "confirmed", "checked_in"} for booking in client_bookings)
        orders_by_source = {order.get("sourceRecordId"): order for order in current["orders"] if order.get("sourceRecordId")}
        financial_records_closed = all(
            booking["status"] != "completed" or (
                (order := orders_by_source.get(f"SHOP-BOOKING-{booking['id']}")) is not None
                and order.get("status") == "completed" and order.get("paymentStatus") == "reconciled" and order.get("refundStatus") != "due"
            ) for booking in client_bookings
        )
        retention_days = before["privacyPolicy"].get("clientRetentionDays")
        happened_at = datetime.fromisoformat(latest["happenedAt"].replace("Z", "+00:00"))
        last_activity = max([datetime.fromisoformat(prior_client["updatedAt"].replace("Z", "+00:00")), *[datetime.fromisoformat(booking["updatedAt"].replace("Z", "+00:00")) for booking in client_bookings]]) if prior_client else None
        retention_elapsed = isinstance(retention_days, int) and not isinstance(retention_days, bool) and last_activity is not None and happened_at >= last_activity + timedelta(days=retention_days)
        evidence_identity_free = prior_client is not None and not any(_service_events_contain_identifier(after["events"], value) for value in (prior_client["name"], prior_client["contact"]))
        expected_client = ({
            "id": prior_client["id"], "name": f"Former client {prior_client['id']}", "contact": f"anonymized:{prior_client['id']}",
            "appointmentUpdates": "not_recorded", "createdAt": prior_client["createdAt"], "updatedAt": latest["happenedAt"],
            "anonymizedAt": latest["happenedAt"], "anonymizedBy": latest["actor"],
        } if prior_client and "anonymizedAt" not in prior_client else None)
        expected_clients = [expected_client if client["id"] == latest["subjectId"] else client for client in before["clients"]]
        expected_bookings = [{**booking, "customerName": f"Former client {latest['subjectId']}", "contact": f"anonymized:{latest['subjectId']}", "appointmentUpdates": "not_recorded", "note": "", "updatedAt": latest["happenedAt"]} if booking["clientId"] == latest["subjectId"] else booking for booking in before["bookings"]]
        valid_change = (
            expected_client is not None and not open_visit and financial_records_closed and retention_elapsed and evidence_identity_free
            and after["services"] == before["services"] and after["resources"] == before["resources"]
            and after["privacyPolicy"] == before["privacyPolicy"] and after["clients"] == expected_clients and after["bookings"] == expected_bookings
        )
    elif event_type == "package_redeemed":
        completed_subject = next(
            (
                booking
                for booking in after["bookings"]
                if booking["id"] == latest["subjectId"] and booking["status"] == "completed"
            ),
            None,
        )
        valid_change = (
            completed_subject is not None
            and _spa_membership_session_available(current, after, latest)
            and after["services"] == before["services"]
            and after["resources"] == before["resources"]
            and after["bookings"] == before["bookings"]
        )
    else:
        before_by_id = {booking["id"]: booking for booking in before["bookings"]}
        changed_bookings = [
            booking
            for booking in after["bookings"]
            if before_by_id.get(booking["id"]) != booking
        ]
        changed = changed_bookings[0] if len(changed_bookings) == 1 else None
        prior = before_by_id.get(changed["id"]) if changed else None
        expected_status = (
            {"held": "confirmed", "confirmed": "checked_in", "checked_in": "completed"}.get(
                prior["status"]
            )
            if prior and event_type == "booking_advanced"
            else (
                "cancelled"
                if prior and prior["status"] not in {"completed", "cancelled"}
                else None
            )
        )
        expected_booking = (
            {
                **prior,
                "status": expected_status,
                "updatedAt": latest["happenedAt"],
            }
            if prior and expected_status
            else None
        )
        valid_change = (
            len(after["bookings"]) == len(before["bookings"])
            and {booking["id"] for booking in after["bookings"]} == set(before_by_id)
            and len(changed_bookings) == 1
            and changed == expected_booking
            and changed["id"] == latest["subjectId"]
            and after["services"] == before["services"]
            and after["resources"] == before["resources"]
            and after["privacyPolicy"] == before["privacyPolicy"]
            and after["clients"] == before["clients"]
        )
    if not valid_change:
        raise TrialValidationError(
            "service schedule change does not match its latest evidence event."
        )


def _validate_service_schedule_initialized(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    if _service_schedule(current) is not None:
        raise TrialValidationError("managed Commerce already has a service schedule.")
    current_without_schedule = dict(current)
    current_without_schedule.pop("serviceSchedule", None)
    next_without_schedule = dict(next_state)
    next_without_schedule.pop("serviceSchedule", None)
    if current_without_schedule != next_without_schedule:
        raise TrialValidationError(
            "commerce.service_schedule.initialized cannot change other Commerce records."
        )
    schedule = _service_schedule(next_state)
    if schedule is None or schedule["revision"] != 0 or schedule["events"]:
        raise TrialValidationError(
            "service schedule initialization requires a clean industry pack without operating evidence."
        )
    if not schedule["services"] or not schedule["resources"] or schedule["clients"] or schedule["bookings"] or schedule["privacyPolicy"] != {"clientRetentionDays": None}:
        raise TrialValidationError(
            "service schedule initialization requires services and resources but no clients, bookings, or retained policy."
        )


_TRANSITION_VALIDATORS = {
    "commerce.item.created": _validate_item_created,
    "commerce.item.updated": _validate_item_updated,
    "commerce.order.created": _validate_created,
    "commerce.order.advanced": _validate_advanced,
    "commerce.order.cancelled": _validate_cancelled,
    "commerce.order.return_recorded": _validate_return_recorded,
    "commerce.order.support_case_opened": _validate_support_case_opened,
    "commerce.order.support_case_reopened": _validate_support_case_reopened,
    "commerce.order.support_case_service_recorded": _validate_support_case_service_recorded,
    "commerce.order.support_case_resolved": _validate_support_case_resolved,
    "commerce.order.correction_recorded": _validate_correction_recorded,
    "commerce.payment.reconciled": _validate_reconciled,
    "commerce.collection_action.recorded": _validate_collection_action_recorded,
    "commerce.refund.settled": _validate_refund_settled,
    "commerce.stock.received": _validate_received,
    "commerce.stock.counted": _validate_counted,
    "commerce.production_material.issued": _validate_production_material_issued,
    "commerce.production_material.returned": _validate_production_material_returned,
    "commerce.production_batch.received": _validate_production_batch_received,
    "commerce.inventory.initialized": _validate_inventory_initialized,
    "commerce.inventory.master_created": _validate_inventory_master_created,
    "commerce.inventory.supplier_policy_saved": _validate_inventory_supplier_policy_saved,
    "commerce.inventory.transferred": _validate_inventory_transferred,
    "commerce.purchase_budget.approved": _validate_purchase_budget_approved,
    "commerce.supplier_sourcing.approved": _validate_supplier_sourcing_approved,
    "commerce.purchase_requisition.approved": _validate_purchase_requisition_approved,
    "commerce.purchase_order.created": _validate_purchase_order_created,
    "commerce.purchase_order.received": _validate_purchase_order_received,
    "commerce.purchase_order.cancelled": _validate_purchase_order_cancelled,
    "commerce.supplier_invoice.recorded": _validate_supplier_invoice_recorded,
    "commerce.supplier_invoice.payable_ready": _validate_supplier_invoice_payable_ready,
    "commerce.supplier_return.authorized": _validate_supplier_return_authorized,
    "commerce.supplier_credit.recorded": _validate_supplier_credit_recorded,
    "commerce.close.saved": _validate_close,
    "commerce.website_intake.created": _validate_website_intake_created,
    "commerce.website_intake.converted": _validate_website_intake_converted,
    "commerce.storefront.configuration.saved": _validate_storefront_configuration_saved,
    "commerce.storefront_request.received": _validate_storefront_request_received,
    "commerce.tax_configuration.saved": _validate_tax_configuration_saved,
    "commerce.account_mapping.saved": _validate_account_mapping_saved,
    "commerce.customer_credit_policy.saved": _validate_customer_credit_policy_saved,
    "commerce.promotion_policy.saved": _validate_promotion_policy_saved,
    "commerce.shipping_policy.saved": _validate_shipping_policy_saved,
    "commerce.payment_policy.saved": _validate_payment_policy_saved,
    "commerce.service_schedule.initialized": _validate_service_schedule_initialized,
    "commerce.service_schedule.saved": _validate_service_schedule_saved,
}


def reduce_commerce_state(
    event_type: str,
    current: Mapping[str, Any],
    payload: Mapping[str, Any],
) -> dict[str, Any]:
    """Accept only one declared Commerce lifecycle transition per command."""

    if event_type not in COMMERCE_EVENTS:
        raise TrialValidationError("event_type must be a supported Commerce lifecycle event.")
    if event_type == "commerce.storefront.merchandising.imported":
        return _apply_storefront_merchandising_import(current, payload)
    if event_type == "commerce.order.created" and isinstance(payload.get("intent"), Mapping):
        payload = {
            "state": create_commerce_order_from_intent(
                current,
                payload["intent"],
                payload.get("evidence", {}),
            ),
            "evidence": payload.get("evidence"),
        }
    if (
        event_type == "commerce.storefront_request.received"
        and isinstance(payload.get("intent"), Mapping)
    ):
        _exact_fields(
            payload,
            "payload",
            required=frozenset({"intent", "evidence"}),
        )
        payload = {
            "state": create_commerce_storefront_request_from_intent(
                current,
                payload["intent"],
                payload.get("evidence", {}),
            ),
            "evidence": payload.get("evidence"),
        }
    next_state, evidence = _payload(payload)
    if event_type == "commerce.workspace.initialized":
        if dict(current):
            raise TrialValidationError("managed Commerce is already initialized.")
        if (
            not next_state["items"]
            or next_state["orders"]
            or next_state["movements"]
            or next_state["closes"]
            or _website_intakes(next_state)
            or _storefront_requests(next_state)
            or _storefront_configuration(next_state)
            or _purchase_budget_envelopes(next_state)
            or _supplier_sourcing_decisions(next_state)
            or _purchase_requisitions(next_state)
            or _purchase_orders(next_state)
            or _catalog_changes(next_state)
            or _tax_configurations(next_state)
            or _account_mapping_configurations(next_state)
            or _customer_credit_policies(next_state)
            or _promotion_policies(next_state)
            or _shipping_policies(next_state)
            or _payment_policies(next_state)
        ):
            raise TrialValidationError("Commerce initialization requires a non-empty catalog and no operating history.")
        return next_state

    current_state = validate_commerce_state(current)
    if event_type != "commerce.item.updated":
        _require_catalog_changes_unchanged(current_state, next_state)
    if event_type not in {"commerce.item.created", "commerce.item.updated"}:
        _require_catalog_baselines_unchanged(current_state, next_state)
    if event_type != "commerce.storefront_request.received":
        _require_storefront_requests_unchanged(current_state, next_state)
    if event_type != "commerce.storefront.configuration.saved":
        _require_storefront_configuration_unchanged(current_state, next_state)
    if event_type != "commerce.tax_configuration.saved":
        _require_tax_configurations_unchanged(current_state, next_state)
    if event_type != "commerce.account_mapping.saved":
        _require_account_mapping_configurations_unchanged(current_state, next_state)
    if event_type != "commerce.customer_credit_policy.saved":
        _require_customer_credit_policies_unchanged(current_state, next_state)
    if event_type != "commerce.promotion_policy.saved":
        _require_promotion_policies_unchanged(current_state, next_state)
    if event_type != "commerce.shipping_policy.saved":
        _require_shipping_policies_unchanged(current_state, next_state)
    if event_type != "commerce.payment_policy.saved":
        _require_payment_policies_unchanged(current_state, next_state)
    if event_type not in {
        "commerce.service_schedule.initialized",
        "commerce.service_schedule.saved",
    }:
        _require_service_schedule_unchanged(current_state, next_state)
    if event_type != "commerce.purchase_budget.approved":
        _require_purchase_budget_envelopes_unchanged(current_state, next_state)
    if event_type != "commerce.supplier_sourcing.approved":
        _require_supplier_sourcing_decisions_unchanged(current_state, next_state)
    if event_type != "commerce.purchase_requisition.approved":
        _require_purchase_requisitions_unchanged(current_state, next_state)
    if event_type not in {
        "commerce.purchase_order.created",
        "commerce.purchase_order.cancelled",
        "commerce.supplier_invoice.recorded",
        "commerce.supplier_invoice.payable_ready",
        "commerce.supplier_return.authorized",
        "commerce.supplier_credit.recorded",
    }:
        _require_purchase_orders_unchanged(current_state, next_state)
    if event_type not in {
        "commerce.inventory.initialized",
        "commerce.inventory.master_created",
        "commerce.inventory.supplier_policy_saved",
        "commerce.inventory.transferred",
        "commerce.stock.counted",
        "commerce.production_material.issued",
        "commerce.production_material.returned",
        "commerce.production_batch.received",
        "commerce.purchase_order.received",
        "commerce.order.created",
        "commerce.order.cancelled",
        "commerce.order.advanced",
        "commerce.order.return_recorded",
        "commerce.website_intake.converted",
    }:
        _require_inventory_foundation_unchanged(current_state, next_state)
    _TRANSITION_VALIDATORS[event_type](current_state, next_state)
    _validate_event_evidence(event_type, current_state, next_state, evidence)
    return next_state


__all__ = [
    "COMMERCE_ACCOUNTING_HANDOFF_SCHEMA",
    "COMMERCE_SUPPLIER_PAYABLES_HANDOFF_SCHEMA",
    "COMMERCE_DAILY_CLOSE_EXPORT_SCHEMA",
    "COMMERCE_EVENTS",
    "COMMERCE_HUMAN_EVENTS",
    "COMMERCE_ORDER_ACKNOWLEDGEMENT_SCHEMA",
    "COMMERCE_SCHEMA",
    "COMMERCE_CLOSE_SETTLEMENT_SCHEMA",
    "commerce_catalog_baseline_digest",
    "commerce_catalog_digest",
    "commerce_order_calculation_digest",
    "commerce_order_acknowledgement",
    "commerce_order_acknowledgement_text",
    "create_commerce_order_from_intent",
    "commerce_accounting_handoff",
    "commerce_accounting_handoff_csv",
    "commerce_daily_close_csv",
    "commerce_daily_close_export",
    "commerce_storefront_preview_digest",
    "commerce_supplier_invoice_match",
    "commerce_supplier_payables_handoff",
    "commerce_supplier_payables_handoff_csv",
    "commerce_supplier_payables_aging",
    "commerce_website_intake_snapshot_digest",
    "reduce_commerce_state",
    "validate_commerce_state",
]
