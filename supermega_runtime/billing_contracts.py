"""Shared read-only billing contract identifiers.

This module contains no database or founder-command implementation so the
member runtime can validate a projection without importing the administrative
billing rail.
"""

MERCHANT_BILLING_SUMMARY_CONTRACT = "supermega.merchant_billing_summary.v1"
PREMIUM_TIER = "premium"
BILLING_READ_CAPABILITY = "billing.read"
