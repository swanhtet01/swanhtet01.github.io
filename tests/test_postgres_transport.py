import json
import socket
import ssl
import struct
import unittest
from unittest.mock import MagicMock, patch
from tools.probe_postgres_transport import probe

SECRET = "PRIVATE_TRANSPORT_SECRET"
URL = f"postgresql://account:{SECRET}@database.invalid:6543/postgres?sslmode=require"


class PostgresTransportTests(unittest.TestCase):
    def test_success_sends_only_ssl_request_and_verifies_certificate(self):
        connection = MagicMock()
        connection.recv.return_value = b"S"
        context = MagicMock()
        with patch("tools.probe_postgres_transport.socket.create_connection") as connect, patch(
            "tools.probe_postgres_transport.ssl.create_default_context", return_value=context
        ):
            connect.return_value.__enter__.return_value = connection
            report = probe(URL)
        self.assertTrue(report["ok"])
        connect.assert_called_once_with(("database.invalid", 6543), timeout=5)
        connection.sendall.assert_called_once_with(struct.pack("!II", 8, 80877103))
        connection.recv.assert_called_once_with(1)
        context.wrap_socket.assert_called_once_with(connection, server_hostname="database.invalid")
        self.assertFalse(report["credentials_sent"])
        self.assertFalse(report["queries_executed"])
        self.assertNotIn(SECRET, json.dumps(report))

    def test_configuration_failure_does_not_connect(self):
        for value in ["", SECRET, "https://database.invalid", "postgresql://host:invalid", "postgresql://host:0"]:
            with self.subTest(value=value), patch("tools.probe_postgres_transport.socket.create_connection") as connect:
                self.assertEqual(probe(value)["category"], "invalid_configuration")
                connect.assert_not_called()

    def test_untrusted_server_response_never_becomes_output_or_plaintext_fallback(self):
        for response in [b"N", b"E", b"", SECRET.encode()]:
            connection = MagicMock()
            connection.recv.return_value = response
            with patch("tools.probe_postgres_transport.socket.create_connection") as connect, patch(
                "tools.probe_postgres_transport.ssl.create_default_context"
            ) as tls:
                connect.return_value.__enter__.return_value = connection
                report = probe(URL)
            self.assertFalse(report["ok"])
            tls.assert_not_called()
            self.assertNotIn(SECRET, json.dumps(report))
            connection.sendall.assert_called_once()

    def test_failure_categories_keep_error_text_private(self):
        cases = [(TimeoutError(SECRET), "timeout"), (socket.gaierror(SECRET), "dns_failure"),
                 (ssl.SSLError(SECRET), "tls_failure"), (OSError(SECRET), "transport_failure"),
                 (RuntimeError(SECRET), "unexpected_failure")]
        for error, category in cases:
            with self.subTest(category=category), patch(
                "tools.probe_postgres_transport.socket.create_connection", side_effect=error
            ):
                report = probe(URL)
            self.assertEqual(report["category"], category)
            self.assertNotIn(SECRET, json.dumps(report))

    def test_certificate_failure_is_terminal_without_downgrade(self):
        connection = MagicMock()
        connection.recv.return_value = b"S"
        context = MagicMock()
        context.wrap_socket.side_effect = ssl.SSLCertVerificationError(SECRET)
        with patch("tools.probe_postgres_transport.socket.create_connection") as connect, patch(
            "tools.probe_postgres_transport.ssl.create_default_context", return_value=context
        ):
            connect.return_value.__enter__.return_value = connection
            report = probe(URL)
        self.assertEqual(report["stage"], "tls_handshake")
        self.assertEqual(report["category"], "certificate_not_verified")
        connect.assert_called_once()
        self.assertNotIn(SECRET, json.dumps(report))
